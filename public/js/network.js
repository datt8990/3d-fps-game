// Hybrid Dual-Transport Multiplayer Client:
// - Mode 1: Native WebSocket (/ws) on Local / Dedicated Node Server
// - Mode 2: Serverless REST + WebRTC DataChannel P2P (PeerJS + GameRoomCore) on Vercel Cloud!
import { GameRoomCore, generateRoomCode } from '/shared/engine/gameRoomCore.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
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
    } else if (this.hostConn?.open && user) {
      this.hostConn.send({ type: 'p2p_loadout', loadout: user.loadout, rp: user.rp });
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
      if (this.hostRoom?.status === 'playing' || (this.hostConn && this.inP2PMatch)) return;
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
      if (this.transportMode === 'ws' && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping_check', clientSentAt: performance.now(), lastRtt: this.pingMs }));
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

  // Unified Outgoing Command Dispatcher (Identical API for WS & P2P!)
  send(obj) {
    if (this.transportMode === 'ws') {
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
        await this.cleanupP2PSession();
        const res = await this.apiCall('/api/rooms').catch(() => ({ rooms: [] }));
        this.emit('left_room', { rooms: res.rooms || [] });
        break;
      }

      default: {
        // In-Room / In-Match Gameplay Commands
        if (this.hostRoom) {
          this.routePacketToHostRoom(this.clientId, msg);
        } else if (this.hostConn?.open) {
          this.hostConn.send(msg);
        }
        break;
      }
    }
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
          } else {
            const c = this.peerConns.get(targetId);
            if (c?.open) c.send(payload);
          }
        },
        broadcast: (payload) => {
          this.handleIncomingHostLoopback(payload);
          for (const c of this.peerConns.values()) {
            if (c?.open) c.send(payload);
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

    // Open WebRTC PeerJS Host Broker so Friends anywhere can join via Room Code!
    if (window.Peer && options.mode !== 'practice') {
      try {
        this.hostPeer = new window.Peer(peerHostId, { config: { iceServers: ICE_SERVERS } });
        this.hostPeer.on('open', () => {
          this.publishRoomHeartbeat();
        });
        this.hostPeer.on('connection', (conn) => {
          this.setupIncomingFriendConnection(conn);
        });
      } catch (err) {
        console.warn('PeerJS Host warning:', err);
      }

      this.hostHeartbeatTimer = setInterval(() => this.publishRoomHeartbeat(), 12000);
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
        this.hostRoom.removeHumanPlayer(remotePlayerId);
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

  joinRemoteP2PRoom(code, onFailFallback = null) {
    if (!window.Peer) {
      this.emit('error_msg', { text: 'Trình duyệt chưa tải được thư viện WebRTC P2P.' });
      return;
    }

    const peerHostId = `bstrike_v2_${code}`;
    this.clientPeer = new window.Peer({ config: { iceServers: ICE_SERVERS } });
    let connectedOnce = false;

    const failTimer = setTimeout(() => {
      if (!connectedOnce) {
        this.cleanupP2PSession();
        if (onFailFallback) onFailFallback();
        else this.emit('error_msg', { text: `Không thể kết nối tới Mã Phòng #${code} (Phòng đã đóng hoặc sai mã).` });
      }
    }, 6500);

    this.clientPeer.on('open', () => {
      const conn = this.clientPeer.connect(peerHostId, { reliable: true });
      this.hostConn = conn;

      conn.on('open', () => {
        connectedOnce = true;
        clearTimeout(failTimer);
        conn.send({
          type: 'p2p_hello',
          clientId: this.clientId,
          user: {
            id: this.currentUser?.id,
            username: this.currentUser?.username,
            loadout: this.currentUser?.loadout,
            rp: this.currentUser?.rp
          }
        });
        this.startPingLoop();
      });

      conn.on('data', async (msg) => {
        if (!msg?.type) return;
        if (msg.type === 'pong_check') {
          this.pingMs = Math.max(2, Math.round(performance.now() - (msg.clientSentAt || performance.now())));
          this.emit('ping_updated', { pingMs: this.pingMs, onlineCount: this.onlineCount });
          return;
        }
        if (msg.type === 'match_started') this.inP2PMatch = true;
        if (msg.type === 'match_ended') {
          this.inP2PMatch = false;
          await this.submitCloudMatchReward(msg);
        }
        this.emit(msg.type, msg);
      });

      conn.on('close', () => {
        this.inP2PMatch = false;
        this.cleanupP2PSession();
        this.emit('left_room', { rooms: [] });
        this.emit('system_toast', { text: 'Chủ phòng đã đóng kết nối phòng đấu.' });
      });
    });

    this.clientPeer.on('error', () => {
      clearTimeout(failTimer);
      if (!connectedOnce) {
        this.cleanupP2PSession();
        if (onFailFallback) onFailFallback();
        else this.emit('error_msg', { text: `Không tìm thấy phòng #${code}. Kiểm tra lại Mã Phòng bạn bè gửi!` });
      }
    });
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
