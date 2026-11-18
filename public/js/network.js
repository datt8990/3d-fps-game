// Hybrid Dual-Transport Multiplayer Client:
// - Mode 1: Native WebSocket (/ws) on Local / Dedicated Node Server
// - Mode 2: Serverless REST + WebRTC DataChannel P2P (PeerJS + GameRoomCore) on Vercel Cloud!
import { GameRoomCore, generateRoomCode } from '/shared/engine/gameRoomCore.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

function makeSessionClientId() {
  return 'c_' + Math.random().toString(36).slice(2, 9);
}

export class NetworkClient {
  constructor() {
    this.transportMode = 'detecting'; // 'ws' | 'p2p'
    this.ws = null;
    this.clientId = makeSessionClientId();
    this.connected = false;
    this.pingMs = 14;
    this.onlineCount = 1;
    this.handlers = new Map();

    this.currentUser = null;
    this.apiCall = null;
    this.pingTimer = null;
    this.lobbyPollTimer = null;

    // Cloud P2P State (Host or Joiner)
    this.hostRoom = null;
    this.hostPeer = null;
    this.peerConns = new Map(); // playerId -> DataConnection
    this.hostHeartbeatTimer = null;

    this.clientPeer = null;
    this.hostConn = null; // DataConnection to remote host

    // Direct WebRTC DataChannels signaled over /api/relay (Zero PeerJS broker dependency!)
    this.rtcPeers = new Map(); // playerId -> { pc, relDc, fastDc, ready, pendingIce }
    this.clientRtc = null;     // { pc, relDc, fastDc, ready, pendingIce }

    // Cloud HTTP Room Relay (100% reliable fallback & fast join across any NAT/Firewall)
    this.relayClientIds = new Set();
    this.relayOutbox = [];
    this.hostRelayTimer = null;
    this.hostRelayInFlight = false;

    this.relayRoomCode = null;
    this.clientRelayOutbox = [];
    this.clientRelayTimer = null;
    this.clientRelayInFlight = false;
    this.p2pDirectReady = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, payload) {
    const list = this.handlers.get(type);
    if (list) {
      for (const fn of list) fn(payload);
    }
  }

  updateUserContext(user) {
    this.currentUser = user;
    if (this.hostRoom && user) {
      this.hostRoom.updateHumanLoadout(this.clientId, user.loadout, user.rp);
    } else if ((this.hostConn?.open || this.relayRoomCode) && user) {
      this.sendToRemoteHost({ type: 'p2p_loadout', loadout: user.loadout, rp: user.rp });
    }
  }

  async connect(user, apiCallFn) {
    this.currentUser = user;
    this.apiCall = apiCallFn;

    let health = { hasWebSocket: true, isVercel: false };
    try {
      health = await this.apiCall('/api/health');
    } catch {}

    if (health && health.hasWebSocket === false) {
      this.activateCloudP2PMode();
    } else {
      this.activateWebSocketMode();
    }
  }

  // ==========================================================================
  // TRANSPORT A: NATIVE WEBSOCKET (Local / Dedicated Server)
  // ==========================================================================
  activateWebSocketMode() {
    this.transportMode = 'ws';
    this.emit('transport_mode', { mode: 'ws', label: 'WS REALTIME' });

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'auth',
          token: this.currentUser?.token,
          profileBackup: this.currentUser?.profileBackup,
          username: this.currentUser?.username
        }));
      }
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${window.location.host}/ws`);

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.ws.send(JSON.stringify({
        type: 'auth',
        token: this.currentUser?.token,
        profileBackup: this.currentUser?.profileBackup,
        username: this.currentUser?.username
      }));
      this.startPingLoop();
      this.emit('connected', { mode: 'ws' });
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg?.type) return;

      if (msg.type === 'welcome') {
        this.clientId = msg.clientId;
        this.onlineCount = msg.onlineCount || 1;
      } else if (msg.type === 'p2p_redirect_join') {
        this.cleanupP2PSession().then(() => this.joinRemoteP2PRoom(msg.roomCode));
        return;
      } else if (msg.type === 'pong_check') {
        this.pingMs = Math.max(1, Math.round(performance.now() - (msg.clientSentAt || performance.now())));
        if (msg.onlineCount) this.onlineCount = msg.onlineCount;
        this.emit('ping_updated', { pingMs: this.pingMs, onlineCount: this.onlineCount });
        return;
      }
      this.emit(msg.type, msg);
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.stopPingLoop();
      // Fallback to Cloud P2P if WS upgrade failed on a serverless proxy
      if (this.transportMode === 'ws' && !this.clientId.startsWith('p_')) {
        this.activateCloudP2PMode();
        return;
      }
      setTimeout(() => {
        if (!this.connected && this.transportMode === 'ws') this.activateWebSocketMode();
      }, 2200);
    });
  }

  // ==========================================================================
  // TRANSPORT B: CLOUD SERVERLESS + WEBRTC P2P (Vercel Zero-Config!)
  // ==========================================================================
  async activateCloudP2PMode() {
    if (this.transportMode === 'p2p' && this.connected) return;
    this.transportMode = 'p2p';
    this.connected = true;
    this.pingMs = 12;
    this.emit('transport_mode', { mode: 'p2p', label: 'CLOUD P2P' });

    const data = await this.apiCall('/api/rooms').catch(() => ({ rooms: [], onlineCount: 1, globalChat: [] }));
    this.onlineCount = data.onlineCount || 1;
    this.emit('welcome', {
      clientId: this.clientId,
      rooms: data.rooms || [],
      onlineCount: this.onlineCount,
      globalChat: data.globalChat || []
    });

    this.stopLobbyPolling();
    this.lobbyPollTimer = setInterval(async () => {
      if (this.hostRoom?.status === 'playing' || ((this.hostConn || this.relayRoomCode) && this.inP2PMatch)) return;
      try {
        const res = await this.apiCall('/api/rooms');
        if (res.rooms) {
          this.onlineCount = res.onlineCount || 1;
          this.emit('rooms_list', { rooms: res.rooms, onlineCount: this.onlineCount, globalChat: res.globalChat });
        }
      } catch {}
    }, 5000);
  }

  stopLobbyPolling() {
    if (this.lobbyPollTimer) {
      clearInterval(this.lobbyPollTimer);
      this.lobbyPollTimer = null;
    }
  }

  startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (this.transportMode === 'ws' && this.ws?.readyState === WebSocket.OPEN && !this.hostConn?.open && !this.relayRoomCode) {
        this.ws.send(JSON.stringify({ type: 'ping_check', clientSentAt: performance.now(), lastRtt: this.pingMs }));
      } else if (this.clientRtc?.ready && this.sendViaRtc(this.clientRtc, { type: 'ping_check', clientSentAt: performance.now() })) {
        // Direct WebRTC ping sent
      } else if (this.hostConn?.open) {
        this.hostConn.send({ type: 'ping_check', clientSentAt: performance.now() });
      } else if (this.hostRoom) {
        this.pingMs = 6;
        this.emit('ping_updated', { pingMs: 6, onlineCount: this.onlineCount });
      }
    }, 2500);
  }

  stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  sendViaRtc(entry, payload) {
    if (!entry) return false;
    const isVolatile = payload?.type === 'world_state' || payload?.type === 'input';
    const dc = (isVolatile && entry.fastDc?.readyState === 'open')
      ? entry.fastDc
      : (entry.relDc?.readyState === 'open' ? entry.relDc : null);
    if (!dc) return false;
    try {
      dc.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  sendToRemoteHost(obj) {
    if (this.clientRtc?.ready && this.sendViaRtc(this.clientRtc, obj)) {
      return;
    }
    if (this.hostConn?.open) {
      this.hostConn.send(obj);
      return;
    }
    if (!this.relayRoomCode) return;

    if (obj.type === 'input') {
      const idx = this.clientRelayOutbox.findIndex((p) => p.type === 'input');
      if (idx >= 0) this.clientRelayOutbox[idx] = obj;
      else this.clientRelayOutbox.push(obj);
      return;
    }

    this.clientRelayOutbox.push(obj);
    this.scheduleClientRelay(10);
  }

  // Unified Outgoing Command Dispatcher (Identical API for WS & P2P!)
  send(obj) {
    if (this.transportMode === 'ws') {
      if (this.hostConn?.open || this.relayRoomCode) {
        if (obj.type === 'leave_room') {
          if (this.relayRoomCode) {
            this.sendToRemoteHost({ type: 'p2p_leave' });
            this.flushClientRelayOnce().catch(() => {});
          }
          this.cleanupP2PSession().then(() => {
            this.emit('left_room', {});
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'list_rooms' }));
            }
          });
          return;
        }
        if (!['list_rooms', 'global_chat', 'create_room', 'join_room', 'quick_match'].includes(obj.type)) {
          this.sendToRemoteHost(obj);
          return;
        }
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(obj));
      }
      return;
    }

    // Cloud P2P Mode Routing
    this.handleP2POutgoing(obj);
  }

  async handleP2POutgoing(msg) {
    switch (msg.type) {
      case 'list_rooms': {
        const res = await this.apiCall('/api/rooms').catch(() => ({ rooms: [] }));
        this.emit('rooms_list', { rooms: res.rooms || [], onlineCount: res.onlineCount || 1 });
        break;
      }

      case 'global_chat': {
        const res = await this.apiCall('/api/global-chat', 'POST', {
          text: msg.text,
          senderName: this.currentUser?.username
        });
        if (res?.msg) this.emit('global_chat_msg', { msg: res.msg });
        break;
      }

      case 'create_room': {
        await this.cleanupP2PSession();
        this.createHostedP2PRoom(msg);
        break;
      }

      case 'join_room': {
        const code = String(msg.roomCode || msg.roomId || '').replace(/^rm_/i, '').trim().toUpperCase();
        if (!code) return;
        await this.cleanupP2PSession();
        this.joinRemoteP2PRoom(code);
        break;
      }

      case 'quick_match': {
        await this.cleanupP2PSession();
        if (msg.mode === 'practice') {
          this.createHostedP2PRoom({
            name: `Trường Bắn của ${this.currentUser?.username || 'Bạn'}`,
            mode: 'practice',
            mapId: msg.mapId || 'warehouse',
            maxPlayers: 6,
            fillBots: true,
            botDifficulty: 'easy',
            autoStart: true
          });
          return;
        }

        // Check Serverless Matchmaking for an active human room first!
        const mm = await this.apiCall('/api/matchmaking/find', 'POST', {
          mode: msg.mode || 'tdm',
          mapId: msg.mapId || 'warehouse'
        }).catch(() => ({ action: 'host_new' }));

        if (mm?.action === 'join' && mm.room?.code) {
          this.joinRemoteP2PRoom(mm.room.code, () => {
            // Fallback to hosting immediately if remote peer already closed
            this.createHostedP2PRoom({
              name: `Chiến Trường #${Math.floor(100 + Math.random() * 900)}`,
              mode: msg.mode || 'tdm',
              mapId: msg.mapId || 'warehouse',
              maxPlayers: 10,
              fillBots: true,
              botDifficulty: msg.mode === 'ranked' ? 'hard' : 'normal',
              autoStart: true
            });
          });
        } else {
          this.createHostedP2PRoom({
            name: `Chiến Trường #${Math.floor(100 + Math.random() * 900)}`,
            mode: msg.mode || 'tdm',
            mapId: msg.mapId || 'warehouse',
            maxPlayers: 10,
            fillBots: true,
            botDifficulty: msg.mode === 'ranked' ? 'hard' : 'normal',
            autoStart: true
          });
        }
        break;
      }

      case 'leave_room': {
        if (this.relayRoomCode && !this.hostConn?.open) {
          this.clientRelayOutbox.push({ type: 'p2p_leave' });
          await this.flushClientRelayOnce().catch(() => {});
        }
        await this.cleanupP2PSession();
        const res = await this.apiCall('/api/rooms').catch(() => ({ rooms: [] }));
        this.emit('left_room', { rooms: res.rooms || [] });
        break;
      }

      default: {
        // In-Room / In-Match Gameplay Commands
        if (this.hostRoom) {
          this.routePacketToHostRoom(this.clientId, msg);
        } else {
          this.sendToRemoteHost(msg);
        }
        break;
      }
    }
  }

  enqueueHostRelay(targetId, payload) {
    if (!this.hostRoom || !targetId) return;
    if (payload?.type === 'world_state') {
      const idx = this.relayOutbox.findIndex((x) => x.to === targetId && x.payload?.type === 'world_state');
      if (idx >= 0) {
        this.relayOutbox[idx].payload = payload;
        return;
      }
    }
    this.relayOutbox.push({ to: targetId, payload });
    if (this.relayOutbox.length > 260) {
      this.relayOutbox.splice(0, this.relayOutbox.length - 260);
    }
    if (payload?.type && payload.type !== 'world_state') {
      this.scheduleHostRelay(10);
    }
  }

  scheduleHostRelay(delayMs = null) {
    if (!this.hostRoom || !this.apiCall) return;
    if (this.hostRelayTimer) {
      if (delayMs !== null && delayMs <= 20) {
        clearTimeout(this.hostRelayTimer);
        this.hostRelayTimer = null;
      } else {
        return;
      }
    }
    const wait = delayMs !== null ? delayMs : (this.hostRoom.status === 'playing' ? 28 : 240);
    this.hostRelayTimer = setTimeout(() => {
      this.hostRelayTimer = null;
      this.flushHostRelayOnce();
    }, wait);
  }

  async flushHostRelayOnce() {
    if (!this.hostRoom || !this.apiCall || this.hostRelayInFlight) return;
    this.hostRelayInFlight = true;
    const activeRoom = this.hostRoom;
    const outgoing = this.relayOutbox.splice(0, this.relayOutbox.length);

    try {
      const res = await this.apiCall(`/api/relay/${activeRoom.code}/host-sync`, 'POST', {
        hostId: this.clientId,
        outgoing,
        roomSummary: activeRoom.getSummary()
      });

      if (this.hostRoom === activeRoom && Array.isArray(res?.packets)) {
        for (const pkt of res.packets) {
          this.handleRelayHostIncomingPacket(pkt?.from, pkt?.payload);
        }
      }
    } catch {
      // Re-queue critical non-world_state packets on transient network hiccup
      const critical = outgoing.filter((x) => x?.payload?.type && x.payload.type !== 'world_state');
      if (critical.length && this.hostRoom === activeRoom) {
        this.relayOutbox.unshift(...critical.slice(0, 30));
      }
    } finally {
      this.hostRelayInFlight = false;
      if (this.hostRoom === activeRoom) {
        this.scheduleHostRelay(this.relayOutbox.length ? 12 : null);
      }
    }
  }

  async handleHostDirectRtcOffer(fromId, sdp) {
    if (!window.RTCPeerConnection || !this.hostRoom) return;
    const existing = this.rtcPeers.get(fromId);
    if (existing?.pc) {
      try { existing.pc.close(); } catch {}
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
    const entry = { pc, relDc: null, fastDc: null, ready: false, pendingIce: [] };
    this.rtcPeers.set(fromId, entry);

    const bindChannel = (dc) => {
      if (dc.label === 'bs_fast') entry.fastDc = dc;
      else entry.relDc = dc;

      dc.onopen = () => {
        if (dc.label !== 'bs_fast') {
          entry.ready = true;
        }
      };
      dc.onmessage = (ev) => {
        if (!this.hostRoom) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'ping_check') {
          this.sendViaRtc(entry, { type: 'pong_check', clientSentAt: msg.clientSentAt });
          return;
        }
        this.handleRelayHostIncomingPacket(fromId, msg);
      };
      dc.onclose = () => {
        if (dc === entry.relDc) entry.ready = false;
      };
    };

    pc.ondatachannel = (ev) => bindChannel(ev.channel);
    pc.onicecandidate = (ev) => {
      if (ev.candidate && this.hostRoom) {
        this.enqueueHostRelay(fromId, { type: 'rtc_ice', candidate: ev.candidate });
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of entry.pendingIce.splice(0)) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.enqueueHostRelay(fromId, { type: 'rtc_answer', sdp: pc.localDescription });
    } catch (err) {
      console.warn('Host Direct RTC offer error:', err);
    }
  }

  handleRelayHostIncomingPacket(fromId, msg) {
    if (!fromId || !msg || typeof msg.type !== 'string' || !this.hostRoom) return;

    if (msg.type === 'rtc_offer' && msg.sdp) {
      this.handleHostDirectRtcOffer(fromId, msg.sdp);
      return;
    }
    if (msg.type === 'rtc_ice' && msg.candidate) {
      const entry = this.rtcPeers.get(fromId);
      if (entry?.pc) {
        if (entry.pc.remoteDescription) {
          entry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        } else {
          entry.pendingIce.push(msg.candidate);
        }
      }
      return;
    }

    if (msg.type === 'p2p_hello') {
      if (this.hostRoom.combatants.has(fromId)) {
        if (this.hostRoom.status === 'waiting' && !this.peerConns.get(fromId)?.open) {
          this.relayClientIds.add(fromId);
          this.enqueueHostRelay(fromId, { type: 'joined_room', room: this.hostRoom.getLobbyPayload() });
        }
        return;
      }

      this.relayClientIds.add(fromId);
      const wasWaiting = this.hostRoom.status === 'waiting';
      const res = this.hostRoom.addHumanPlayer({
        id: fromId,
        userId: msg.user?.id || null,
        username: msg.user?.username || 'Bạn_Chiến_Đấu',
        loadout: msg.user?.loadout || {},
        rp: msg.user?.rp || 1200
      });
      if (res.error) {
        this.enqueueHostRelay(fromId, { type: 'error_msg', text: res.error });
        this.relayClientIds.delete(fromId);
        return;
      }
      if (wasWaiting) {
        this.enqueueHostRelay(fromId, { type: 'joined_room', room: this.hostRoom.getLobbyPayload() });
      }
      return;
    }

    if (msg.type === 'p2p_leave') {
      this.relayClientIds.delete(fromId);
      const rtc = this.rtcPeers.get(fromId);
      if (rtc) {
        try { rtc.pc.close(); } catch {}
        this.rtcPeers.delete(fromId);
      }
      if (!this.peerConns.get(fromId)?.open) {
        this.hostRoom.removeHumanPlayer(fromId);
      }
      return;
    }

    if (msg.type === 'p2p_loadout') {
      this.hostRoom.updateHumanLoadout(fromId, msg.loadout, msg.rp);
      return;
    }

    this.routePacketToHostRoom(fromId, msg);
  }

  createHostedP2PRoom(options = {}) {
    const code = generateRoomCode();
    const peerHostId = `bstrike_v2_${code}`;

    this.hostRoom = new GameRoomCore(
      {
        code,
        peerHostId,
        name: options.name || `Phòng của ${this.currentUser?.username || 'Chiến Binh'}`,
        mode: options.mode || 'tdm',
        mapId: options.mapId || 'warehouse',
        maxPlayers: options.maxPlayers || 10,
        fillBots: options.fillBots !== false,
        botDifficulty: options.botDifficulty || 'normal',
        hostId: this.clientId
      },
      {
        sendTo: (targetId, payload) => {
          if (targetId === this.clientId) {
            this.handleIncomingHostLoopback(payload);
            return;
          }
          const rtc = this.rtcPeers.get(targetId);
          if (rtc?.ready && this.sendViaRtc(rtc, payload)) {
            return;
          }
          const c = this.peerConns.get(targetId);
          if (c?.open) {
            c.send(payload);
          } else if (this.relayClientIds.has(targetId)) {
            this.enqueueHostRelay(targetId, payload);
          }
        },
        broadcast: (payload) => {
          this.handleIncomingHostLoopback(payload);
          for (const [cid, rtc] of this.rtcPeers.entries()) {
            if (rtc?.ready) this.sendViaRtc(rtc, payload);
          }
          for (const [cid, c] of this.peerConns.entries()) {
            if (c?.open && !this.rtcPeers.get(cid)?.ready) c.send(payload);
          }
          for (const cid of this.relayClientIds) {
            if (!this.rtcPeers.get(cid)?.ready && !this.peerConns.get(cid)?.open) {
              this.enqueueHostRelay(cid, payload);
            }
          }
        },
        onEmpty: () => {},
        onListChanged: () => this.publishRoomHeartbeat()
      }
    );

    // Add Host Human Player immediately
    this.hostRoom.addHumanPlayer({
      id: this.clientId,
      userId: this.currentUser?.id,
      username: this.currentUser?.username || 'Chủ_Phòng',
      loadout: this.currentUser?.loadout || {},
      rp: this.currentUser?.rp || 1200
    });

    this.emit('joined_room', { room: this.hostRoom.getLobbyPayload() });
    this.startPingLoop();

    // Start Cloud Room Relay + Direct WebRTC Signaling over /api/relay
    if (options.mode !== 'practice') {
      this.flushHostRelayOnce();
      this.hostHeartbeatTimer = setInterval(() => this.publishRoomHeartbeat(), 10000);
      this.publishRoomHeartbeat();
    }

    if (options.autoStart) {
      this.hostRoom.startMatch(this.clientId);
    }
  }

  setupIncomingFriendConnection(conn) {
    let remotePlayerId = null;

    conn.on('data', (msg) => {
      if (!msg || typeof msg.type !== 'string' || !this.hostRoom) return;

      if (msg.type === 'p2p_hello') {
        remotePlayerId = msg.clientId || ('peer_' + Math.random().toString(36).slice(2, 8));
        this.peerConns.set(remotePlayerId, conn);
        const alreadyInRoom = this.hostRoom.combatants.has(remotePlayerId);
        this.relayClientIds.delete(remotePlayerId);

        if (alreadyInRoom) {
          // Upgraded seamlessly from HTTP Relay to Direct WebRTC DataChannel
          return;
        }

        const wasWaiting = this.hostRoom.status === 'waiting';
        const res = this.hostRoom.addHumanPlayer({
          id: remotePlayerId,
          userId: msg.user?.id || null,
          username: msg.user?.username || 'Bạn_Chiến_Đấu',
          loadout: msg.user?.loadout || {},
          rp: msg.user?.rp || 1200
        });
        if (res.error) {
          conn.send({ type: 'error_msg', text: res.error });
          conn.close();
          return;
        }
        if (wasWaiting) {
          conn.send({ type: 'joined_room', room: this.hostRoom.getLobbyPayload() });
        }
        return;
      }

      if (!remotePlayerId) return;

      if (msg.type === 'ping_check') {
        conn.send({ type: 'pong_check', clientSentAt: msg.clientSentAt });
        return;
      }
      if (msg.type === 'p2p_loadout') {
        this.hostRoom.updateHumanLoadout(remotePlayerId, msg.loadout, msg.rp);
        return;
      }

      this.routePacketToHostRoom(remotePlayerId, msg);
    });

    conn.on('close', () => {
      if (remotePlayerId && this.hostRoom) {
        this.peerConns.delete(remotePlayerId);
        if (!this.relayClientIds.has(remotePlayerId)) {
          this.hostRoom.removeHumanPlayer(remotePlayerId);
        }
      }
    });
  }

  routePacketToHostRoom(playerId, msg) {
    if (!this.hostRoom) return;
    switch (msg.type) {
      case 'switch_team': this.hostRoom.switchPlayerTeam(playerId); break;
      case 'update_room': this.hostRoom.updateRoomSettings(playerId, msg); break;
      case 'start_match': this.hostRoom.startMatch(playerId); break;
      case 'room_chat': this.hostRoom.addChatMessage(playerId, msg.text, msg.scope); break;
      case 'radio': this.hostRoom.handleRadioCommand(playerId, msg.key); break;
      case 'input': this.hostRoom.handleClientInput(playerId, msg); break;
      case 'fire': this.hostRoom.handleClientFire(playerId, msg); break;
      case 'throw_grenade': this.hostRoom.handleThrowGrenade(playerId, msg); break;
      case 'reload': {
        const p = this.hostRoom.combatants.get(playerId);
        if (p) this.hostRoom.startReload(p, Date.now());
        break;
      }
      case 'switch_weapon': {
        const p = this.hostRoom.combatants.get(playerId);
        if (p) this.hostRoom.switchWeapon(p, msg.slot);
        break;
      }
      case 'change_primary': {
        const p = this.hostRoom.combatants.get(playerId);
        if (p) this.hostRoom.changeInMatchPrimary(p, msg.primaryId);
        break;
      }
      case 'voice_signal': this.hostRoom.handleVoiceSignal(playerId, msg); break;
      case 'voice_audio': this.hostRoom.handleVoiceAudio(playerId, msg); break;
    }
  }

  async handleIncomingHostLoopback(msg) {
    if (msg.type === 'match_Started' || msg.type === 'match_started') {
      this.inP2PMatch = true;
    } else if (msg.type === 'match_ended') {
      this.inP2PMatch = false;
      await this.submitCloudMatchReward(msg);
    }
    this.emit(msg.type, msg);
  }

  scheduleClientRelay(delayMs = null) {
    if (!this.relayRoomCode || !this.apiCall) return;
    if (this.clientRelayTimer) {
      if (delayMs !== null && delayMs <= 20) {
        clearTimeout(this.clientRelayTimer);
        this.clientRelayTimer = null;
      } else {
        return;
      }
    }
    const wait = delayMs !== null ? delayMs : (this.inP2PMatch ? 28 : 240);
    this.clientRelayTimer = setTimeout(() => {
      this.clientRelayTimer = null;
      this.flushClientRelayOnce();
    }, wait);
  }

  async handleClientIncomingP2PMessage(msg) {
    if (!msg?.type) return;
    if (msg.type === 'pong_check') {
      this.pingMs = Math.max(2, Math.round(performance.now() - (msg.clientSentAt || performance.now())));
      this.emit('ping_updated', { pingMs: this.pingMs, onlineCount: this.onlineCount });
      return;
    }
    if (msg.type === 'rtc_answer' && msg.sdp && this.clientRtc?.pc) {
      try {
        await this.clientRtc.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        for (const c of this.clientRtc.pendingIce.splice(0)) {
          await this.clientRtc.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
      } catch (err) {
        console.warn('Client RTC answer error:', err);
      }
      return;
    }
    if (msg.type === 'rtc_ice' && msg.candidate && this.clientRtc?.pc) {
      if (this.clientRtc.pc.remoteDescription) {
        this.clientRtc.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
      } else {
        this.clientRtc.pendingIce.push(msg.candidate);
      }
      return;
    }
    if (msg.type === 'joined_room' || msg.type === 'match_started') {
      this.relayJoinedOnce = true;
      if (this._joinGuardTimer) {
        clearTimeout(this._joinGuardTimer);
        this._joinGuardTimer = null;
      }
    }
    if (msg.type === 'match_started') this.inP2PMatch = true;
    if (msg.type === 'match_ended') {
      this.inP2PMatch = false;
      await this.submitCloudMatchReward(msg);
    }
    this.emit(msg.type, msg);
  }

  async flushClientRelayOnce(onFailFallback = null) {
    if (!this.relayRoomCode || !this.apiCall || this.clientRelayInFlight) return;
    this.clientRelayInFlight = true;
    const code = this.relayRoomCode;
    const outgoing = this.p2pDirectReady ? [] : this.clientRelayOutbox.splice(0, this.clientRelayOutbox.length);
    const t0 = performance.now();

    try {
      const res = await this.apiCall(`/api/relay/${code}/client-sync`, 'POST', {
        clientId: this.clientId,
        outgoing
      });

      if (this.relayRoomCode !== code) return;

      if (!this.p2pDirectReady) {
        this.pingMs = Math.max(8, Math.round(performance.now() - t0));
        this.emit('ping_updated', { pingMs: this.pingMs, onlineCount: this.onlineCount });
      }

      if (res?.error || res?.closed) {
        const wasJoined = this.relayJoinedOnce;
        await this.cleanupP2PSession();
        if (!wasJoined && onFailFallback) {
          onFailFallback();
        } else {
          this.emit('error_msg', { text: res.error || `Phòng #${code} đã đóng.` });
          if (wasJoined) this.emit('left_room', { rooms: [] });
        }
        return;
      }

      if (Array.isArray(res?.packets)) {
        for (const msg of res.packets) {
          await this.handleClientIncomingP2PMessage(msg);
        }
      }
    } catch {
      if (outgoing.length && this.relayRoomCode === code && !this.p2pDirectReady) {
        const important = outgoing.filter((x) => x.type !== 'input');
        this.clientRelayOutbox.unshift(...important.slice(0, 20));
      }
    } finally {
      this.clientRelayInFlight = false;
      if (this.relayRoomCode === code && !this.p2pDirectReady) {
        this.scheduleClientRelay(this.clientRelayOutbox.length ? 12 : null);
      }
    }
  }

  async startClientDirectRtc(cleanCode) {
    if (!window.RTCPeerConnection || this.relayRoomCode !== cleanCode) return;
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });
      const relDc = pc.createDataChannel('bs_rel', { ordered: true });
      const fastDc = pc.createDataChannel('bs_fast', { ordered: false, maxRetransmits: 0 });
      const entry = { pc, relDc, fastDc, ready: false, pendingIce: [] };
      this.clientRtc = entry;

      const onMsg = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        this.handleClientIncomingP2PMessage(msg);
      };

      relDc.onmessage = onMsg;
      fastDc.onmessage = onMsg;
      relDc.onopen = () => {
        if (this.relayRoomCode !== cleanCode || this.clientRtc !== entry) return;
        entry.ready = true;
        this.p2pDirectReady = true;
        this.relayJoinedOnce = true;
        if (this._joinGuardTimer) {
          clearTimeout(this._joinGuardTimer);
          this._joinGuardTimer = null;
        }
        this.sendViaRtc(entry, { type: 'ping_check', clientSentAt: performance.now() });
        this.startPingLoop();
      };
      relDc.onclose = () => {
        entry.ready = false;
        if (this.clientRtc === entry) {
          this.p2pDirectReady = false;
          if (this.relayRoomCode === cleanCode) this.scheduleClientRelay(12);
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate && this.relayRoomCode === cleanCode && this.clientRtc === entry && !entry.ready) {
          this.clientRelayOutbox.push({ type: 'rtc_ice', candidate: ev.candidate });
          this.scheduleClientRelay(12);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.relayRoomCode === cleanCode) {
        this.clientRelayOutbox.push({ type: 'rtc_offer', sdp: pc.localDescription });
        this.scheduleClientRelay(10);
      }
    } catch (err) {
      console.warn('Direct WebRTC upgrade skipped (Cloud Relay active):', err);
    }
  }

  joinRemoteP2PRoom(code, onFailFallback = null) {
    const cleanCode = String(code || '').replace(/^rm_/i, '').trim().toUpperCase();
    if (!cleanCode) return;

    this.relayRoomCode = cleanCode;
    this.relayJoinedOnce = false;
    this.p2pDirectReady = false;
    this.clientRelayOutbox = [
      {
        type: 'p2p_hello',
        clientId: this.clientId,
        user: {
          id: this.currentUser?.id,
          username: this.currentUser?.username,
          loadout: this.currentUser?.loadout,
          rp: this.currentUser?.rp
        }
      }
    ];
    this.flushClientRelayOnce(onFailFallback);
    this.startClientDirectRtc(cleanCode);

    const joinGuardTimer = setTimeout(() => {
      if (!this.relayJoinedOnce && !this.p2pDirectReady && this.relayRoomCode === cleanCode) {
        this.cleanupP2PSession();
        if (onFailFallback) onFailFallback();
        else this.emit('error_msg', { text: `Không thể kết nối tới Mã Phòng #${cleanCode} (Chủ phòng không phản hồi).` });
      }
    }, 10000);
    this._joinGuardTimer = joinGuardTimer;
  }

  async submitCloudMatchReward(matchEndedMsg) {
    if (!this.apiCall || !this.currentUser) return;
    const myEntry = (matchEndedMsg.scoreboard || []).find((p) => p.id === this.clientId);
    if (!myEntry) return;
    const won = matchEndedMsg.winnerTeam
      ? myEntry.team === matchEndedMsg.winnerTeam
      : matchEndedMsg.winnerPlayerId === this.clientId;

    try {
      const res = await this.apiCall('/api/match-result', 'POST', {
        mode: matchEndedMsg.mode,
        mapName: matchEndedMsg.mapName,
        won,
        kills: myEntry.kills,
        deaths: myEntry.deaths,
        assists: myEntry.assists,
        headshots: myEntry.headshots,
        isRanked: matchEndedMsg.mode === 'ranked',
        isPractice: matchEndedMsg.mode === 'practice'
      });
      if (res?.reward) {
        matchEndedMsg.rewardsByPlayer = matchEndedMsg.rewardsByPlayer || {};
        matchEndedMsg.rewardsByPlayer[this.clientId] = res.reward;
      }
    } catch {}
  }

  publishRoomHeartbeat() {
    if (!this.hostRoom || !this.apiCall) return;
    if (this.hostRoom.mode === 'practice') return;
    this.apiCall('/api/rooms/heartbeat', 'POST', {
      room: this.hostRoom.getSummary()
    }).catch(() => {});
  }

  async cleanupP2PSession() {
    this.inP2PMatch = false;
    this.p2pDirectReady = false;
    this.relayJoinedOnce = false;
    if (this._joinGuardTimer) {
      clearTimeout(this._joinGuardTimer);
      this._joinGuardTimer = null;
    }
    if (this.hostRelayTimer) {
      clearTimeout(this.hostRelayTimer);
      this.hostRelayTimer = null;
    }
    if (this.clientRelayTimer) {
      clearTimeout(this.clientRelayTimer);
      this.clientRelayTimer = null;
    }
    this.relayRoomCode = null;
    this.relayClientIds.clear();
    this.relayOutbox = [];
    this.clientRelayOutbox = [];

    for (const rtc of this.rtcPeers.values()) {
      try { rtc.pc.close(); } catch {}
    }
    this.rtcPeers.clear();
    if (this.clientRtc) {
      try { this.clientRtc.pc.close(); } catch {}
      this.clientRtc = null;
    }

    if (this.hostHeartbeatTimer) {
      clearInterval(this.hostHeartbeatTimer);
      this.hostHeartbeatTimer = null;
    }
    if (this.hostRoom) {
      const oldCode = this.hostRoom.code;
      this.hostRoom.stopMatchLoop();
      this.hostRoom = null;
      if (this.apiCall) {
        this.apiCall('/api/rooms/close', 'POST', { code: oldCode }).catch(() => {});
      }
    }
    for (const c of this.peerConns.values()) {
      try { c.close(); } catch {}
    }
    this.peerConns.clear();

    if (this.hostPeer) {
      try { this.hostPeer.destroy(); } catch {}
      this.hostPeer = null;
    }
    if (this.hostConn) {
      try { this.hostConn.close(); } catch {}
      this.hostConn = null;
    }
    if (this.clientPeer) {
      try { this.clientPeer.destroy(); } catch {}
      this.clientPeer = null;
    }
  }
}
