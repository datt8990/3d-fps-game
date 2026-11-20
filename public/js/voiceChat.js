// Team Voice Chat: Room-Signaled WebRTC Audio + Automatic Relay Fallback
// - Zero PeerJS cloud broker dependency: signaling & relay fallback travel over the active game room transport
//   (Local WebSocket OR Vercel Cloud Direct-RTC / HTTP Relay), guaranteeing cross-machine / cross-NAT connectivity.
// - Each teammate pair connects directly via WebRTC Audio when NAT permits, and seamlessly falls back to
//   compressed 12kHz mu-law Voice Relay if WebRTC ICE fails or stalls behind strict symmetric NAT/firewalls.
// - Outgoing WebRTC stream uses a WebAudio MediaStreamDestination with a 0-gain keepalive oscillator so
//   toggling PTT never requires renegotiation and listen-only players (no mic) still receive team audio.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

const RELAY_SAMPLE_RATE = 12000;
const RELAY_CHUNK_SAMPLES = 1200; // 100ms per packet
const WEBRTC_FALLBACK_TIMEOUT_MS = 3500;
const WEBRTC_RETRY_INTERVAL_MS = 14000;

function linearToMuLaw(sample) {
  const MULAW_MAX = 0x1fff;
  const BIAS = 0x84;
  let s = Math.max(-1, Math.min(1, sample)) * 32767;
  let sign = 0;
  if (s < 0) {
    sign = 0x80;
    s = -s;
  }
  s = Math.min(MULAW_MAX, (s >> 2) + BIAS);
  let exponent = 7;
  for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    // find highest set bit
  }
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

function muLawToLinear(byteVal) {
  const b = (~byteVal) & 0xff;
  const sign = b & 0x80;
  const exponent = (b >> 4) & 0x07;
  const mantissa = b & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  const signed = sign ? -sample : sample;
  return Math.max(-1, Math.min(1, (signed << 2) / 32768));
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function escapeHtml(str) {
  return String(str || '').replace(/[<>&"]/g, '');
}

export class TeamVoiceChat {
  constructor(net = null) {
    this.net = net;
    this.mode = localStorage.getItem('bs_voice_mode') || 'ptt'; // 'off' | 'ptt' | 'open'
    this.volume = Number(localStorage.getItem('bs_voice_vol') ?? 0.9);

    this.roomCode = '';
    this.myClientId = '';
    this.myTeam = '';
    this.active = false;

    this.audioCtx = null;
    this.destNode = null;
    this.keepAliveOsc = null;
    this.micGain = null;
    this.micStream = null;
    this.micSource = null;
    this.localAnalyser = null;
    this.relayProcessor = null;
    this.silentSink = null;

    this.micDenied = false;
    this.micErrorNotice = '';
    this.pttHeld = false;

    this.teammates = new Map(); // clientId -> { id, name }
    this.peers = new Map(); // clientId -> peerState
    this.retryTimer = null;
    this.meterTimer = null;

    this.relayAccumulator = [];
    this.relaySeq = 0;
    this.voiceHangoverUntil = 0;

    this.panelEl = document.getElementById('hud-voice-panel');
    this.listEl = document.getElementById('hud-voice-list');
    this.selfEl = document.getElementById('hud-voice-self');

    this._onUserGesture = () => this.unlockAudioPlayback();
  }

  attachNetwork(net) {
    this.net = net;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  setMode(mode) {
    this.mode = ['off', 'ptt', 'open'].includes(mode) ? mode : 'ptt';
    localStorage.setItem('bs_voice_mode', this.mode);

    if (this.mode === 'off') {
      this.applyMicGate(false);
      this.closeAllPeers(true);
    } else if (this.active) {
      this.initAudioGraph();
      if (this.mode === 'open') {
        this.ensureMic().then(() => this.applyMicGate(true));
      } else {
        this.applyMicGate(this.pttHeld);
      }
      this.syncPeerConnections();
    }
    this.renderPanel();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
    localStorage.setItem('bs_voice_vol', String(this.volume));
    for (const p of this.peers.values()) {
      if (p.audioEl) p.audioEl.volume = this.volume;
      if (p.relayGain && this.audioCtx) {
        p.relayGain.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.02);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  start({ roomCode, clientId, players = [], myTeam = '', teamBased = true }) {
    this.stop();
    if (!teamBased || !myTeam) {
      this.renderPanel('Voice chỉ dành cho chế độ đấu đội');
      return;
    }

    this.active = true;
    this.roomCode = String(roomCode || 'room');
    this.myClientId = clientId || '';
    this.myTeam = myTeam;

    window.addEventListener('pointerdown', this._onUserGesture);
    window.addEventListener('keydown', this._onUserGesture);

    this.initAudioGraph();
    this.updateRoster(players);

    if (this.mode === 'off') {
      this.renderPanel();
      return;
    }

    if (this.mode === 'open') {
      this.ensureMic().then(() => this.applyMicGate(true));
    }

    // Delay voice maintenance slightly so match startup & gameplay WebRTC never compete for CPU/ICE
    this.startMaintenanceLoop();
    this.startMeters();
  }

  stop() {
    if (this.active) {
      this.closeAllPeers(true);
    }
    this.active = false;
    window.removeEventListener('pointerdown', this._onUserGesture);
    window.removeEventListener('keydown', this._onUserGesture);

    clearInterval(this.retryTimer);
    clearInterval(this.meterTimer);
    this.retryTimer = null;
    this.meterTimer = null;

    this.pttHeld = false;
    this.setRelayCaptureActive(false);
    this.relayAccumulator = [];
    this.teammates.clear();

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch {}
      this.micSource = null;
    }
    this.panelEl?.classList.add('hidden');
  }

  updateRoster(players = []) {
    if (!this.active) return;

    const myEntry = players.find((p) => p?.id === this.myClientId);
    if (myEntry?.team) this.myTeam = myEntry.team;

    const next = new Map();
    for (const p of players) {
      if (!p || p.isBot || String(p.id).startsWith('bot_')) continue;
      if (p.id === this.myClientId) continue;
      if (p.team !== this.myTeam) continue;
      next.set(p.id, { id: p.id, name: p.name || 'Đồng đội' });
    }

    for (const pid of [...this.peers.keys()]) {
      if (!next.has(pid)) this.closePeer(pid, false);
    }
    this.teammates = next;

    if (this.mode !== 'off') {
      this.syncPeerConnections();
    }
    this.renderPanel();
  }

  // ---------------------------------------------------------------------------
  // Audio Graph, Microphone & Relay Encoder
  // ---------------------------------------------------------------------------
  initAudioGraph() {
    if (this.audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    this.audioCtx = new Ctx();
    this.destNode = this.audioCtx.createMediaStreamDestination();

    // Keep-alive zero-gain oscillator guarantees MediaStreamDestination emits valid silent frames
    // so WebRTC audio tracks stay live and ontrack fires immediately even in listen-only mode.
    this.keepAliveOsc = this.audioCtx.createOscillator();
    const zeroGain = this.audioCtx.createGain();
    zeroGain.gain.value = 0;
    this.keepAliveOsc.connect(zeroGain);
    zeroGain.connect(this.destNode);
    this.keepAliveOsc.start();

    this.micGain = this.audioCtx.createGain();
    this.micGain.gain.value = 0;
    this.localAnalyser = this.audioCtx.createAnalyser();
    this.localAnalyser.fftSize = 256;

    this.micGain.connect(this.destNode);
    this.micGain.connect(this.localAnalyser);
    // Note: Do NOT attach deprecated ScriptProcessorNode while idle — it fires 24x/sec on the main JS render thread!
    // Relay audio capture is attached strictly on-demand in setRelayCaptureActive(true) only while actively speaking.
  }

  setRelayCaptureActive(on) {
    if (!on) {
      if (this.relayProcessor) {
        try { this.micGain?.disconnect(this.relayProcessor); } catch {}
        try { this.relayProcessor.disconnect(); } catch {}
        this.relayProcessor.onaudioprocess = null;
        this.relayProcessor = null;
      }
      if (this.silentSink) {
        try { this.silentSink.disconnect(); } catch {}
        this.silentSink = null;
      }
      this.relayAccumulator.length = 0;
      return;
    }
    if (this.relayProcessor || !this.audioCtx || !this.micGain || !this.micStream) return;
    let needsRelay = false;
    for (const p of this.peers.values()) {
      if (p.mode !== 'rtc') { needsRelay = true; break; }
    }
    if (!needsRelay || typeof this.audioCtx.createScriptProcessor !== 'function') return;
    this.relayProcessor = this.audioCtx.createScriptProcessor(2048, 1, 1);
    this.silentSink = this.audioCtx.createGain();
    this.silentSink.gain.value = 0;
    this.micGain.connect(this.relayProcessor);
    this.relayProcessor.connect(this.silentSink);
    this.silentSink.connect(this.audioCtx.destination);
    this.relayProcessor.onaudioprocess = (ev) => this.handleRelayCapture(ev.inputBuffer.getChannelData(0));
  }

  unlockAudioPlayback() {
    if (!this.active) return;
    if (this.audioCtx?.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    for (const p of this.peers.values()) {
      if (p.audioEl && p.audioEl.paused) {
        p.audioEl.play().catch(() => {});
      }
    }
  }

  async ensureMic() {
    if (this.micStream) return true;
    if (this.micDenied) return false;
    this.initAudioGraph();

    if (!navigator.mediaDevices?.getUserMedia) {
      this.micDenied = true;
      this.micErrorNotice = 'Cần HTTPS/localhost để bật micro — chỉ nghe';
      this.renderPanel();
      return false;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      this.micSource = this.audioCtx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.micGain);
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume().catch(() => {});
      }
      this.micErrorNotice = '';
      this.renderPanel();
      return true;
    } catch {
      this.micDenied = true;
      this.micErrorNotice = 'Không có quyền micro — chỉ nghe';
      this.renderPanel();
      return false;
    }
  }

  applyMicGate(on) {
    if (!this.micGain || !this.audioCtx) return;
    const target = on && this.mode !== 'off' && this.micStream ? 1 : 0;
    this.micGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.015);
    this.setRelayCaptureActive(target > 0);
    this.selfEl?.classList.toggle('talking', target > 0);
  }

  async setPushToTalk(held) {
    if (!this.active || this.mode !== 'ptt') return;
    this.pttHeld = held;
    if (held) {
      this.unlockAudioPlayback();
      await this.ensureMic();
      if (!this.pttHeld) return;
    }
    this.applyMicGate(held);
  }

  toggleOpenMic() {
    this.setMode(this.mode === 'open' ? 'ptt' : 'open');
  }

  // ---------------------------------------------------------------------------
  // Room-Signaled WebRTC Mesh + Relay Fallback
  // ---------------------------------------------------------------------------
  sendSignal(targetId, kind, extra = {}) {
    if (!this.net || !this.active) return;
    this.net.send({
      type: 'voice_signal',
      targetId,
      kind,
      ...extra
    });
  }

  ensurePeerEntry(mate) {
    let p = this.peers.get(mate.id);
    if (!p) {
      p = {
        id: mate.id,
        name: mate.name,
        pc: null,
        sessionId: '',
        pendingIce: [],
        audioEl: null,
        analyser: null,
        relayGain: null,
        relayAnalyser: null,
        relayNextAt: 0,
        mode: 'connecting', // 'connecting' | 'rtc' | 'relay'
        remoteReady: false,
        sentReadyAt: 0,
        lastOfferAt: 0,
        createdAt: Date.now()
      };
      this.peers.set(mate.id, p);
    } else {
      p.name = mate.name;
    }
    return p;
  }

  syncPeerConnections() {
    if (!this.active || this.mode === 'off') return;
    const now = Date.now();
    for (const mate of this.teammates.values()) {
      const p = this.ensurePeerEntry(mate);
      if (now - p.sentReadyAt > 4000 && !p.remoteReady) {
        p.sentReadyAt = now;
        this.sendSignal(mate.id, 'ready');
      }
      const isOfferer = this.myClientId < mate.id;
      if (isOfferer && p.remoteReady && !p.pc && p.mode !== 'rtc') {
        this.startWebRtcOffer(p);
      }
    }
  }

  startMaintenanceLoop() {
    clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => {
      if (!this.active || this.mode === 'off') return;
      const now = Date.now();
      let changed = false;

      for (const mate of this.teammates.values()) {
        const p = this.ensurePeerEntry(mate);

        if (!p.remoteReady && now - p.sentReadyAt > 2500) {
          p.sentReadyAt = now;
          this.sendSignal(mate.id, 'ready');
        }

        // Seamless fallback to Room Relay if direct WebRTC hasn't connected within 3.5s
        if (p.mode === 'connecting' && now - p.createdAt > WEBRTC_FALLBACK_TIMEOUT_MS) {
          p.mode = 'relay';
          changed = true;
        }

        const isOfferer = this.myClientId < mate.id;
        if (isOfferer && p.remoteReady) {
          const iceBad = p.pc && ['failed', 'closed', 'disconnected'].includes(p.pc.iceConnectionState);
          const attempts = p.rtcAttempts || 0;
          // Cap WebRTC voice retry attempts to 2 so strict NAT never triggers endless 14s ICE/STUN storms
          if ((!p.pc || iceBad) && attempts < 2 && now - p.lastOfferAt > 8000) {
            p.rtcAttempts = attempts + 1;
            this.startWebRtcOffer(p);
          }
        } else if (!isOfferer && p.remoteReady && !p.pc && p.mode !== 'rtc' && (p.nudgeCount || 0) < 2 && now - p.sentReadyAt > 8000) {
          p.sentReadyAt = now;
          p.nudgeCount = (p.nudgeCount || 0) + 1;
          this.sendSignal(mate.id, 'nudge');
        }
      }

      if (changed) this.renderPanel();
    }, 3000);
  }

  createPeerConnection(peerEntry, sessionId) {
    if (peerEntry.pc) {
      try { peerEntry.pc.close(); } catch {}
      peerEntry.pc = null;
    }
    const PeerConn = window.RTCPeerConnection;
    if (!PeerConn) {
      peerEntry.mode = 'relay';
      this.renderPanel();
      return null;
    }

    const pc = new PeerConn({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 2 });
    peerEntry.pc = pc;
    peerEntry.sessionId = sessionId;
    peerEntry.pendingIce = [];

    if (this.destNode?.stream) {
      const tracks = this.destNode.stream.getAudioTracks();
      if (tracks.length) {
        pc.addTrack(tracks[0], this.destNode.stream);
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (ev) => {
      if (!this.active || peerEntry.pc !== pc) return;
      if (ev.candidate) {
        this.sendSignal(peerEntry.id, 'ice', { sessionId, candidate: ev.candidate });
      }
    };

    pc.ontrack = (ev) => {
      if (!this.active || peerEntry.pc !== pc) return;
      const remoteStream = ev.streams?.[0] || new MediaStream([ev.track]);
      this.attachRemoteWebRtcStream(peerEntry, remoteStream);
    };

    const handleStateChange = () => {
      if (!this.active || peerEntry.pc !== pc) return;
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      if (ice === 'connected' || ice === 'completed' || conn === 'connected') {
        if (peerEntry.mode !== 'rtc') {
          peerEntry.mode = 'rtc';
          peerEntry.remoteReady = true;
          this.renderPanel();
        }
      } else if (ice === 'failed' || conn === 'failed') {
        try { pc.close(); } catch {}
        if (peerEntry.pc === pc) peerEntry.pc = null;
        if (peerEntry.mode !== 'relay') {
          peerEntry.mode = 'relay';
          this.renderPanel();
        }
      }
    };

    pc.oniceconnectionstatechange = handleStateChange;
    pc.onconnectionstatechange = handleStateChange;
    return pc;
  }

  attachRemoteWebRtcStream(peerEntry, remoteStream) {
    if (!peerEntry.audioEl && typeof Audio !== 'undefined') {
      const audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = this.volume;
      peerEntry.audioEl = audio;
    }
    if (peerEntry.audioEl) {
      peerEntry.audioEl.srcObject = remoteStream;
      peerEntry.audioEl.volume = this.volume;
      peerEntry.audioEl.play().catch(() => {});
    }

    if (this.audioCtx) {
      try {
        const src = this.audioCtx.createMediaStreamSource(remoteStream);
        const an = this.audioCtx.createAnalyser();
        an.fftSize = 256;
        src.connect(an);
        peerEntry.analyser = an;
      } catch {}
    }
    this.renderPanel();
  }

  async startWebRtcOffer(peerEntry) {
    if (!window.RTCPeerConnection || !this.active || this.mode === 'off') return;
    const sessionId = Math.random().toString(36).slice(2, 8);
    peerEntry.lastOfferAt = Date.now();
    const pc = this.createPeerConnection(peerEntry, sessionId);
    if (!pc) return;

    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      if (peerEntry.pc !== pc) return;
      await pc.setLocalDescription(offer);
      this.sendSignal(peerEntry.id, 'offer', { sessionId, sdp: pc.localDescription });
    } catch {
      if (peerEntry.pc === pc) {
        try { pc.close(); } catch {}
        peerEntry.pc = null;
      }
    }
  }

  async onSignal(msg) {
    if (!this.active || this.mode === 'off' || !msg?.fromId) return;
    const mate = this.teammates.get(msg.fromId);
    if (!mate) return;

    const p = this.ensurePeerEntry(mate);
    p.remoteReady = true;

    if (msg.kind === 'bye') {
      p.remoteReady = false;
      p.mode = 'connecting';
      if (p.pc) {
        try { p.pc.close(); } catch {}
        p.pc = null;
      }
      this.renderPanel();
      return;
    }

    if (msg.kind === 'ready' || msg.kind === 'ready_ack') {
      const isOfferer = this.myClientId < mate.id;
      if (isOfferer) {
        if (!p.pc && p.mode !== 'rtc') {
          this.startWebRtcOffer(p);
        }
      } else if (msg.kind === 'ready') {
        this.sendSignal(mate.id, 'ready_ack');
      }
      this.renderPanel();
      return;
    }

    if (msg.kind === 'nudge') {
      if (this.myClientId < mate.id && Date.now() - p.lastOfferAt > 2500) {
        this.startWebRtcOffer(p);
      }
      return;
    }

    if (msg.kind === 'offer' && msg.sdp && msg.sessionId) {
      const pc = this.createPeerConnection(p, msg.sessionId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        if (p.pc !== pc) return;
        for (const cand of p.pendingIce.splice(0)) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        const answer = await pc.createAnswer();
        if (p.pc !== pc) return;
        await pc.setLocalDescription(answer);
        this.sendSignal(mate.id, 'answer', { sessionId: msg.sessionId, sdp: pc.localDescription });
      } catch {
        p.mode = 'relay';
        this.renderPanel();
      }
      return;
    }

    if (msg.kind === 'answer' && msg.sdp && p.pc && msg.sessionId === p.sessionId) {
      try {
        await p.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        for (const cand of p.pendingIce.splice(0)) {
          await p.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
      } catch {}
      return;
    }

    if (msg.kind === 'ice' && msg.candidate && p.pc && msg.sessionId === p.sessionId) {
      if (p.pc.remoteDescription) {
        p.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      } else {
        p.pendingIce.push(msg.candidate);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Voice Relay Fallback Encode / Decode (12kHz 8-bit Mu-Law)
  // ---------------------------------------------------------------------------
  handleRelayCapture(inputBuf) {
    if (!this.active || this.mode === 'off' || !this.micStream || !this.net || !this.audioCtx) return;

    const transmitting = this.mode === 'open' || (this.mode === 'ptt' && this.pttHeld);
    if (!transmitting) {
      this.relayAccumulator.length = 0;
      return;
    }

    const relayIds = [];
    for (const p of this.peers.values()) {
      if (p.mode !== 'rtc') relayIds.push(p.id);
    }
    if (!relayIds.length) {
      this.relayAccumulator.length = 0;
      return;
    }

    let sumSq = 0;
    for (let i = 0; i < inputBuf.length; i++) {
      sumSq += inputBuf[i] * inputBuf[i];
    }
    const rms = Math.sqrt(sumSq / inputBuf.length);
    const now = performance.now();
    const threshold = this.mode === 'ptt' ? 0.0025 : 0.009;
    if (rms > threshold) {
      this.voiceHangoverUntil = now + 450;
    }
    if (now > this.voiceHangoverUntil && !(this.mode === 'ptt' && rms > 0.001)) {
      return;
    }

    const ratio = this.audioCtx.sampleRate / RELAY_SAMPLE_RATE;
    for (let pos = 0; pos < inputBuf.length; pos += ratio) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const s0 = inputBuf[idx] || 0;
      const s1 = inputBuf[Math.min(inputBuf.length - 1, idx + 1)] || s0;
      this.relayAccumulator.push(linearToMuLaw(s0 + (s1 - s0) * frac));
    }

    while (this.relayAccumulator.length >= RELAY_CHUNK_SAMPLES) {
      const chunk = new Uint8Array(this.relayAccumulator.splice(0, RELAY_CHUNK_SAMPLES));
      this.net.send({
        type: 'voice_audio',
        targetIds: relayIds,
        audio: bytesToBase64(chunk),
        sr: RELAY_SAMPLE_RATE,
        seq: ++this.relaySeq
      });
    }
  }

  onRelayAudio(msg) {
    if (!this.active || this.mode === 'off' || !msg?.fromId || !msg?.audio) return;
    const mate = this.teammates.get(msg.fromId);
    if (!mate) return;

    const p = this.ensurePeerEntry(mate);
    if (p.mode === 'rtc') return; // Direct WebRTC audio already active

    if (!p.remoteReady || p.mode !== 'relay') {
      p.remoteReady = true;
      p.mode = 'relay';
      this.renderPanel();
    }

    if (!this.audioCtx) this.initAudioGraph();
    if (!this.audioCtx || this.audioCtx.state === 'suspended') return;

    let raw;
    try {
      raw = base64ToBytes(msg.audio);
    } catch {
      return;
    }
    if (!raw.length) return;

    const sr = Math.max(8000, Math.min(48000, Number(msg.sr) || RELAY_SAMPLE_RATE));
    const buf = this.audioCtx.createBuffer(1, raw.length, sr);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < raw.length; i++) {
      ch[i] = muLawToLinear(raw[i]);
    }

    if (!p.relayGain) {
      p.relayGain = this.audioCtx.createGain();
      p.relayGain.gain.value = this.volume;
      p.relayAnalyser = this.audioCtx.createAnalyser();
      p.relayAnalyser.fftSize = 256;
      p.relayGain.connect(p.relayAnalyser);
      p.relayAnalyser.connect(this.audioCtx.destination);
    }

    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(p.relayGain);

    const now = this.audioCtx.currentTime;
    if (p.relayNextAt < now + 0.015 || p.relayNextAt > now + 0.45) {
      p.relayNextAt = now + 0.04;
    }
    src.start(p.relayNextAt);
    p.relayNextAt += buf.duration;
  }

  closePeer(peerId, notifyRemote = false) {
    const p = this.peers.get(peerId);
    if (!p) return;
    if (notifyRemote) {
      this.sendSignal(peerId, 'bye');
    }
    this.peers.delete(peerId);
    if (p.pc) {
      try { p.pc.close(); } catch {}
    }
    if (p.audioEl) {
      p.audioEl.pause();
      p.audioEl.srcObject = null;
    }
    if (p.relayGain) {
      try { p.relayGain.disconnect(); } catch {}
    }
    this.renderPanel();
  }

  closeAllPeers(notifyRemote = false) {
    for (const pid of [...this.peers.keys()]) {
      this.closePeer(pid, notifyRemote);
    }
  }

  // ---------------------------------------------------------------------------
  // Speaking Indicators & HUD
  // ---------------------------------------------------------------------------
  readLevel(analyser) {
    if (!analyser) return 0;
    const len = analyser.frequencyBinCount;
    if (!this._meterBuf || this._meterBuf.length !== len) {
      this._meterBuf = new Uint8Array(len);
    }
    analyser.getByteFrequencyData(this._meterBuf);
    let sum = 0;
    for (let i = 0; i < len; i++) sum += this._meterBuf[i];
    return sum / len;
  }

  startMeters() {
    clearInterval(this.meterTimer);
    this.meterTimer = setInterval(() => {
      if (!this.listEl || this.mode === 'off') return;
      if (this.peers.size === 0 && !this.micStream) return;
      for (const [pid, p] of this.peers.entries()) {
        const analyser = p.mode === 'rtc' ? p.analyser : p.relayAnalyser;
        if (!analyser) continue;
        const speaking = this.readLevel(analyser) > 10;
        const row = this.listEl.querySelector(`[data-peer="${CSS.escape(pid)}"]`);
        row?.classList.toggle('talking', speaking);
      }
      if (this.selfEl && this.micGain && this.micStream) {
        const live = this.micGain.gain.value > 0.5 && this.readLevel(this.localAnalyser) > 10;
        this.selfEl.classList.toggle('talking', live);
      }
    }, 260);
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
      const micState = this.micDenied ? '🔇' : (this.mode === 'off' ? '🔇' : '🎙');
      this.selfEl.textContent = `${micState} Bạn • ${modeLabel}`;
    }

    if (notice) {
      this.listEl.innerHTML = `<div class="voice-row muted">${escapeHtml(notice)}</div>`;
      return;
    }

    const mates = [...this.teammates.values()];
    const micWarn = this.micErrorNotice
      ? `<div class="voice-row muted" style="font-size:11px;color:#fbbf24;">⚠ ${escapeHtml(this.micErrorNotice)}</div>`
      : '';

    if (!mates.length) {
      this.listEl.innerHTML = micWarn + '<div class="voice-row muted">Chưa có đồng đội người thật trong đội</div>';
      return;
    }

    this.listEl.innerHTML = micWarn + mates.map((m) => {
      const p = this.peers.get(m.id);
      const isRtc = p?.mode === 'rtc';
      const isRelay = p?.mode === 'relay' && p?.remoteReady;
      const connected = isRtc || isRelay;
      const statusText = isRtc ? 'P2P' : (isRelay ? 'Relay' : 'đang nối...');
      return `<div class="voice-row ${connected ? 'connected' : ''}" data-peer="${escapeHtml(m.id)}">
        <span class="voice-dot"></span>${escapeHtml(m.name)}
        <span class="voice-state">${statusText}</span>
      </div>`;
    }).join('');
  }
}
