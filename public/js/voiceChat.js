// Team Voice Chat (WebRTC Mesh via PeerJS): Push-to-Talk / Open Mic, Team-Only Routing, Speaking Indicators
// - Works on both Local WS server & Vercel (signaling via PeerJS cloud broker, audio flows P2P).
// - Each teammate pair opens exactly ONE call (lower peer-id calls higher peer-id) -> no duplicate streams.
// - Local outgoing stream is a WebAudio destination: mic is gated by a GainNode, so toggling PTT
//   never requires WebRTC renegotiation and listen-only players (no mic) can still hear the team.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'e8dd65b92f6212101d3b9286',
    credential: '8W7f5d2H4tQ8wQ+3'
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: 'e8dd65b92f6212101d3b9286',
    credential: '8W7f5d2H4tQ8wQ+3'
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'e8dd65b92f6212101d3b9286',
    credential: '8W7f5d2H4tQ8wQ+3'
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65b92f6212101d3b9286',
    credential: '8W7f5d2H4tQ8wQ+3'
  }
];

function sanitizeId(str) {
  return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
}

export class TeamVoiceChat {
  constructor() {
    this.mode = localStorage.getItem('bs_voice_mode') || 'ptt'; // 'off' | 'ptt' | 'open'
    this.volume = Number(localStorage.getItem('bs_voice_vol') ?? 0.9);

    this.peer = null;
    this.myPeerId = '';
    this.roomCode = '';
    this.myClientId = '';
    this.active = false;

    this.audioCtx = null;
    this.destNode = null;
    this.micGain = null;
    this.micStream = null;
    this.micSource = null;
    this.localAnalyser = null;
    this.micDenied = false;

    this.pttHeld = false;
    this.teammates = new Map(); // clientId -> { name, peerId }
    this.calls = new Map(); // peerId -> { call, audioEl, analyser, name, clientId }
    this.retryTimer = null;
    this.meterTimer = null;

    this.panelEl = document.getElementById('hud-voice-panel');
    this.listEl = document.getElementById('hud-voice-list');
    this.selfEl = document.getElementById('hud-voice-self');
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  setMode(mode) {
    this.mode = ['off', 'ptt', 'open'].includes(mode) ? mode : 'ptt';
    localStorage.setItem('bs_voice_mode', this.mode);
    if (this.mode === 'off') {
      this.applyMicGate(false);
      this.closeAllCalls();
    } else if (this.active) {
      if (this.mode === 'open') this.ensureMic().then(() => this.applyMicGate(true));
      else this.applyMicGate(this.pttHeld);
      this.connectToTeammates();
    }
    this.renderPanel();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    localStorage.setItem('bs_voice_vol', String(this.volume));
    for (const c of this.calls.values()) {
      if (c.audioEl) c.audioEl.volume = this.volume;
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  start({ roomCode, clientId, players = [], myTeam = '', teamBased = true }) {
    this.stop();
    if (!teamBased || !myTeam || !window.Peer) {
      this.renderPanel(teamBased ? 'Voice chat không khả dụng' : 'Voice chỉ dành cho chế độ đấu đội');
      return;
    }

    this.active = true;
    this.roomCode = sanitizeId(roomCode || 'room');
    this.myClientId = clientId;
    this.myTeam = myTeam;
    this.myPeerId = `bsvc_${this.roomCode}_${sanitizeId(clientId)}`;
    this.updateRoster(players);
    this.initAudioGraph();

    if (this.mode === 'off') {
      this.renderPanel();
      return;
    }
    if (this.mode === 'open') this.ensureMic().then(() => this.applyMicGate(true));

    this.createPeer();
    this.startMeters();
  }

  stop() {
    this.active = false;
    clearInterval(this.retryTimer);
    clearInterval(this.meterTimer);
    this.retryTimer = null;
    this.meterTimer = null;
    this.closeAllCalls();
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.pttHeld = false;
    this.teammates.clear();
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
      this.micSource = null;
    }
    this.panelEl?.classList.add('hidden');
  }

  updateRoster(players = []) {
    if (!this.active) return;
    const next = new Map();
    for (const p of players) {
      if (!p || p.isBot || String(p.id).startsWith('bot_')) continue;
      if (p.id === this.myClientId) continue;
      if (p.team !== this.myTeam) continue;
      next.set(p.id, { name: p.name || 'Đồng đội', peerId: `bsvc_${this.roomCode}_${sanitizeId(p.id)}` });
    }
    // Drop calls to players who left / switched team
    for (const [pid, c] of this.calls.entries()) {
      if (![...next.values()].some((t) => t.peerId === pid)) this.closeCall(pid);
    }
    this.teammates = next;
    this.connectToTeammates();
    this.renderPanel();
  }

  // ---------------------------------------------------------------------------
  // Audio graph & microphone
  // ---------------------------------------------------------------------------
  initAudioGraph() {
    if (this.audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new Ctx();
    this.destNode = this.audioCtx.createMediaStreamDestination();
    this.micGain = this.audioCtx.createGain();
    this.micGain.gain.value = 0;
    this.localAnalyser = this.audioCtx.createAnalyser();
    this.localAnalyser.fftSize = 256;
    this.micGain.connect(this.destNode);
    this.micGain.connect(this.localAnalyser);
  }

  async ensureMic() {
    if (this.micStream || this.micDenied) return Boolean(this.micStream);
    this.initAudioGraph();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.micGain);
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      this.renderPanel();
      return true;
    } catch {
      this.micDenied = true;
      this.renderPanel('Không truy cập được micro — chỉ nghe đồng đội');
      return false;
    }
  }

  applyMicGate(on) {
    if (!this.micGain || !this.audioCtx) return;
    const target = on && this.mode !== 'off' && this.micStream ? 1 : 0;
    this.micGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.015);
    this.selfEl?.classList.toggle('talking', target > 0);
  }

  async setPushToTalk(held) {
    if (!this.active || this.mode !== 'ptt') return;
    this.pttHeld = held;
    if (held) {
      if (this.audioCtx?.state === 'suspended') this.audioCtx.resume();
      await this.ensureMic();
      if (!this.pttHeld) return; // released while permission prompt was open
    }
    this.applyMicGate(held);
  }

  toggleOpenMic() {
    this.setMode(this.mode === 'open' ? 'ptt' : 'open');
  }

  // ---------------------------------------------------------------------------
  // PeerJS signaling & calls
  // ---------------------------------------------------------------------------
  createPeer() {
    try {
      this.peer = new window.Peer(this.myPeerId, { config: { iceServers: ICE_SERVERS } });
    } catch {
      this.renderPanel('Không khởi tạo được voice');
      return;
    }

    this.peer.on('open', () => {
      this.connectToTeammates();
      clearInterval(this.retryTimer);
      // Retry periodically so late joiners / flaky NAT paths reconnect automatically
      this.retryTimer = setInterval(() => this.connectToTeammates(), 4000);
    });

    this.peer.on('call', (call) => {
      if (!this.active || this.mode === 'off') {
        call.close();
        return;
      }
      const mate = [...this.teammates.values()].find((t) => t.peerId === call.peer);
      if (!mate) {
        call.close(); // Not a teammate -> enemies can never listen in
        return;
      }
      if (this.calls.has(call.peer)) this.closeCall(call.peer);
      call.answer(this.destNode.stream);
      this.bindCall(call, mate);
    });

    this.peer.on('error', (err) => {
      if (err?.type === 'unavailable-id') {
        // Stale id from a previous session still registered -> suffix & retry
        this.myPeerId = `${this.myPeerId}x`;
        try { this.peer.destroy(); } catch {}
        setTimeout(() => this.active && this.createPeer(), 600);
      }
      // 'peer-unavailable' simply means that teammate hasn't come online yet; retry loop handles it
    });

    this.peer.on('disconnected', () => {
      if (this.active) {
        try { this.peer.reconnect(); } catch {}
      }
    });
  }

  connectToTeammates() {
    if (!this.active || this.mode === 'off' || !this.peer?.open || !this.destNode) return;
    for (const mate of this.teammates.values()) {
      if (this.calls.has(mate.peerId)) continue;
      // Deterministic single-direction dialing avoids duplicate bidirectional calls
      if (this.myPeerId > mate.peerId) continue;
      const call = this.peer.call(mate.peerId, this.destNode.stream);
      if (call) this.bindCall(call, mate);
    }
  }

  bindCall(call, mate) {
    const entry = { call, audioEl: null, analyser: null, name: mate.name, level: 0 };
    this.calls.set(call.peer, entry);

    call.on('stream', (remoteStream) => {
      if (entry.audioEl) return;
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = this.volume;
      audio.play().catch(() => {});
      entry.audioEl = audio;

      try {
        const src = this.audioCtx.createMediaStreamSource(remoteStream);
        const an = this.audioCtx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        entry.analyser = an;
      } catch {}
      this.renderPanel();
    });

    const cleanup = () => {
      if (this.calls.get(call.peer) === entry) this.closeCall(call.peer);
    };
    call.on('close', cleanup);
    call.on('error', cleanup);
    this.renderPanel();
  }

  closeCall(peerId) {
    const c = this.calls.get(peerId);
    if (!c) return;
    this.calls.delete(peerId);
    try { c.call.close(); } catch {}
    if (c.audioEl) {
      c.audioEl.pause();
      c.audioEl.srcObject = null;
    }
    this.renderPanel();
  }

  closeAllCalls() {
    for (const pid of [...this.calls.keys()]) this.closeCall(pid);
  }

  // ---------------------------------------------------------------------------
  // Speaking indicators & HUD
  // ---------------------------------------------------------------------------
  readLevel(analyser) {
    if (!analyser) return 0;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    return sum / buf.length;
  }

  startMeters() {
    clearInterval(this.meterTimer);
    this.meterTimer = setInterval(() => {
      if (!this.listEl) return;
      for (const [pid, c] of this.calls.entries()) {
        const speaking = this.readLevel(c.analyser) > 12;
        const row = this.listEl.querySelector(`[data-peer="${CSS.escape(pid)}"]`);
        row?.classList.toggle('talking', speaking);
      }
      if (this.selfEl && this.micGain) {
        const live = this.micGain.gain.value > 0.5 && this.readLevel(this.localAnalyser) > 10;
        this.selfEl.classList.toggle('talking', live);
      }
    }, 120);
  }

  renderPanel(notice = '') {
    if (!this.panelEl || !this.listEl) return;
    if (!this.active && !notice) {
      this.panelEl.classList.add('hidden');
      return;
    }
    this.panelEl.classList.remove('hidden');

    const modeLabel = this.mode === 'off'
      ? 'TẮT'
      : (this.mode === 'open' ? 'MIC MỞ' : 'GIỮ [V] ĐỂ NÓI');
    if (this.selfEl) {
      const micState = this.micDenied ? '🚫' : (this.mode === 'off' ? '🔇' : '🎙');
      this.selfEl.textContent = `${micState} Bạn • ${modeLabel}`;
    }

    const mates = [...this.teammates.values()];
    if (notice) {
      this.listEl.innerHTML = `<div class="voice-row muted">${notice}</div>`;
      return;
    }
    if (!mates.length) {
      this.listEl.innerHTML = '<div class="voice-row muted">Chưa có đồng đội người thật trong đội</div>';
      return;
    }
    this.listEl.innerHTML = mates.map((m) => {
      const connected = this.calls.get(m.peerId)?.audioEl;
      const esc = String(m.name).replace(/[<>&]/g, '');
      return `<div class="voice-row ${connected ? 'connected' : ''}" data-peer="${m.peerId}">
        <span class="voice-dot"></span>${esc}
        <span class="voice-state">${connected ? 'đã kết nối' : 'đang nối...'}</span>
      </div>`;
    }).join('');
  }
}
