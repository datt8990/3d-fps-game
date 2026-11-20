// Local & Dedicated Server Entrypoint (Express REST API + Static Assets + 30Hz WebSocket Server)
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import app, { registerLocalServerHooks } from './app.js';
import { gameDB } from './db.js';
import { ServerGameRoom } from './gameRoom.js';
import { HumanPriorityMatchmaker } from './matchmaker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;

// Serve static assets & local vendor modules (disable ES module stale browser caching during updates)
const noCacheOpts = {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (!/\.(glb|png|jpg|webp|woff2?)$/i.test(filePath)) {
      res.set('Cache-Control', 'no-store');
    }
  }
};
app.use(express.static(path.join(ROOT_DIR, 'public'), noCacheOpts));
app.use('/shared', express.static(path.join(ROOT_DIR, 'shared'), noCacheOpts));
app.use('/vendor/three', express.static(path.join(ROOT_DIR, 'node_modules', 'three')));
app.use('/vendor/peerjs', express.static(path.join(ROOT_DIR, 'node_modules', 'peerjs', 'dist')));

const rooms = new Map(); // roomId -> ServerGameRoom
const clientsById = new Map();

function getWsRoomSummaries() {
  return [...rooms.values()].map((r) => r.getSummary());
}

function findRoomByIdOrCode(idOrCode) {
  if (!idOrCode) return null;
  if (rooms.has(idOrCode)) return rooms.get(idOrCode);
  const upper = String(idOrCode).trim().toUpperCase();
  for (const r of rooms.values()) {
    if (r.code === upper || r.id.toUpperCase() === upper) return r;
  }
  return null;
}

function broadcastLobbyRoomList() {
  const payload = JSON.stringify({
    type: 'rooms_list',
    rooms: [...getWsRoomSummaries(), ...gameDB.getActiveCloudRooms()],
    onlineCount: Math.max(clientsById.size, gameDB.getOnlineUsersCount())
  });
  for (const client of clientsById.values()) {
    if (!client.roomId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

registerLocalServerHooks({
  getRooms: () => getWsRoomSummaries(),
  onLoadoutUpdated: (userId, sanitizedUser) => {
    for (const client of clientsById.values()) {
      if (client.userId === userId && client.roomId) {
        const room = rooms.get(client.roomId);
        room?.updateHumanLoadout(client.id, sanitizedUser.loadout, sanitizedUser.rp);
      }
    }
  },
  onSquadInvite: (targetUserId, invite) => {
    for (const client of clientsById.values()) {
      if (client.userId === targetUserId && client.ws.readyState === 1) {
        safeSend(client.ws, { type: 'squad_invite', invite });
      }
    }
  }
});

function createRoom(options = {}) {
  const room = new ServerGameRoom(
    options,
    (emptyRoomId) => {
      rooms.delete(emptyRoomId);
      broadcastLobbyRoomList();
    },
    () => broadcastLobbyRoomList()
  );
  rooms.set(room.id, room);
  return room;
}

// Seed 3 inviting persistent rooms
createRoom({
  id: 'rm_BS1001',
  code: 'BS1001',
  name: '[VN #1] Nhà Kho Hỗn Chiến 5v5',
  mode: 'tdm',
  mapId: 'warehouse',
  maxPlayers: 10,
  fillBots: true,
  botDifficulty: 'normal',
  isPersistentDefault: true
});
createRoom({
  id: 'rm_BS2002',
  code: 'BS2002',
  name: '[VN #2] Đặt Bom C4 - Căn Cứ Quân Sự',
  mode: 'bomb',
  mapId: 'military_base',
  maxPlayers: 10,
  fillBots: true,
  botDifficulty: 'normal',
  isPersistentDefault: true
});
createRoom({
  id: 'rm_BS3003',
  code: 'BS3003',
  name: '[RANKED] Đấu Xếp Hạng - Thành Phố',
  mode: 'ranked',
  mapId: 'urban_city',
  maxPlayers: 10,
  fillBots: true,
  botDifficulty: 'hard',
  isPersistentDefault: true
});
createRoom({
  id: 'rm_BS4004',
  code: 'BS4004',
  name: '[SOLO] Đấu Đơn Tự Do - Nhà Kho',
  mode: 'ffa',
  mapId: 'warehouse',
  maxPlayers: 8,
  fillBots: true,
  botDifficulty: 'normal',
  isPersistentDefault: true
});
createRoom({
  id: 'rm_BS5005',
  code: 'BS5005',
  name: '[BR 50P] Đảo Tử Thần - Sinh Tồn',
  mode: 'survival',
  mapId: 'br_island',
  maxPlayers: 50,
  fillBots: true,
  botDifficulty: 'normal',
  isPersistentDefault: true
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Periodic WebSocket keepalive pings prevent NAT/proxy idle disconnects during room waiting & match loading
setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.ping(); } catch {}
    }
  }
}, 15000);

function safeSend(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function syncUserRoomCode(userId, roomCode = null) {
  if (!userId) return;
  const u = gameDB.getUserById(userId);
  if (u) {
    u.currentRoomCode = roomCode ? String(roomCode).toUpperCase() : null;
    u.lastSeenAt = Date.now();
  }
}

function leaveCurrentRoom(client) {
  syncUserRoomCode(client.userId, null);
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  client.roomId = null;
  if (room) room.removeWsPlayer(client.id);
}

const matchmaker = new HumanPriorityMatchmaker({
  rooms,
  createRoom,
  leaveCurrentRoom,
  sendToClient: (client, payload) => safeSend(client.ws, payload),
  addClientToRoom: (client, room, replaceBot = false) => {
    const wasWaiting = room.status === 'waiting';
    const joined = replaceBot
      ? room.replaceWsBotWithHuman(client, client.ws)
      : room.addWsPlayer(client, client.ws);
    if (joined.error) {
      safeSend(client.ws, { type: 'error_msg', text: joined.error });
      return joined;
    }
    client.roomId = room.id;
    syncUserRoomCode(client.userId, room.code);
    if (wasWaiting) {
      safeSend(client.ws, { type: 'joined_room', room: room.getLobbyPayload() });
    }
    return joined;
  }
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const clientId = 'p_' + crypto.randomBytes(5).toString('hex');
  const client = {
    id: clientId,
    ws,
    userId: null,
    username: 'Chiến_Binh',
    roomId: null,
    lastPingMs: 14
  };
  clientsById.set(clientId, client);

  ws.on('message', (rawBuf) => {
    let msg;
    try {
      msg = JSON.parse(rawBuf.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (client.roomId) {
      const room = rooms.get(client.roomId);
      if (room && !room.antiCheat.checkPacketRate(client.id)) return;
    }

    switch (msg.type) {
      case 'auth': {
        const user = gameDB.getUserByToken(msg.token, msg.profileBackup);
        if (user) {
          client.userId = user.id;
          client.username = user.username;
        } else if (msg.username) {
          client.username = String(msg.username).slice(0, 18);
        }
        safeSend(ws, {
          type: 'welcome',
          clientId: client.id,
          rooms: [...getWsRoomSummaries(), ...gameDB.getActiveCloudRooms()],
          onlineCount: Math.max(clientsById.size, gameDB.getOnlineUsersCount()),
          globalChat: gameDB.db.globalChat.slice(-25)
        });
        broadcastLobbyRoomList();
        break;
      }

      case 'ping_check': {
        if (Number.isFinite(msg.lastRtt)) {
          client.lastPingMs = Math.max(1, Math.min(999, Math.round(msg.lastRtt)));
          if (client.roomId) {
            const r = rooms.get(client.roomId);
            const p = r?.combatants.get(client.id);
            if (p) p.ping = client.lastPingMs;
          }
        }
        safeSend(ws, { type: 'pong_check', clientSentAt: msg.clientSentAt, onlineCount: clientsById.size });
        break;
      }

      case 'list_rooms': {
        safeSend(ws, {
          type: 'rooms_list',
          rooms: [...getWsRoomSummaries(), ...gameDB.getActiveCloudRooms()],
          onlineCount: Math.max(clientsById.size, gameDB.getOnlineUsersCount())
        });
        break;
      }

      case 'global_chat': {
        const entry = gameDB.addGlobalChat(client.username, msg.text);
        if (!entry) break;
        const raw = JSON.stringify({ type: 'global_chat_msg', msg: entry });
        for (const c of clientsById.values()) {
          if (!c.roomId && c.ws.readyState === 1) c.ws.send(raw);
        }
        break;
      }

      case 'create_room': {
        leaveCurrentRoom(client);
        matchmaker.removeClient(client.id, true);
        const mode = msg.mode || 'tdm';
        const room = createRoom({
          name: msg.name || `Phòng của ${client.username}`,
          mode,
          mapId: msg.mapId || (mode === 'survival' ? 'br_island' : 'warehouse'),
          maxPlayers: msg.maxPlayers || (mode === 'survival' ? 50 : 10),
          fillBots: msg.fillBots !== false,
          botDifficulty: msg.botDifficulty || 'normal',
          hostId: client.id
        });
        if (msg.initialPrimary && client.userId) {
          gameDB.updateLoadout(client.userId, { primary: msg.initialPrimary });
        }
        const joined = room.addWsPlayer(client, ws);
        if (joined.error) {
          safeSend(ws, { type: 'error_msg', text: joined.error });
          break;
        }
        client.roomId = room.id;
        syncUserRoomCode(client.userId, room.code);
        safeSend(ws, { type: 'joined_room', room: room.getLobbyPayload() });
        if (msg.autoStart) room.startMatch(client.id);
        break;
      }

      case 'join_room': {
        const rawCode = String(msg.roomCode || msg.roomId || '').replace(/^rm_/i, '').trim().toUpperCase();
        const target = findRoomByIdOrCode(msg.roomCode || msg.roomId);
        if (!target) {
          const cloudRoom = gameDB.getActiveCloudRooms().find((r) => (r.code || '').toUpperCase() === rawCode);
          if (cloudRoom) {
            safeSend(ws, { type: 'p2p_redirect_join', roomCode: cloudRoom.code });
            break;
          }
          safeSend(ws, { type: 'error_msg', text: 'Không tìm thấy Mã Phòng hoặc phòng đã đóng.' });
          break;
        }
        leaveCurrentRoom(client);
        matchmaker.removeClient(client.id, true);
        const wasWaiting = target.status === 'waiting';
        const useSwap = !wasWaiting && target.getBots().length > 0;
        const joined = useSwap ? target.replaceWsBotWithHuman(client, ws) : target.addWsPlayer(client, ws);
        if (joined.error) {
          safeSend(ws, { type: 'error_msg', text: joined.error });
          break;
        }
        client.roomId = target.id;
        syncUserRoomCode(client.userId, target.code);
        if (wasWaiting) {
          safeSend(ws, { type: 'joined_room', room: target.getLobbyPayload() });
        }
        break;
      }

      case 'queue_join':
      case 'quick_match': {
        matchmaker.enqueueClient(client, { mode: msg.mode || 'tdm', mapId: msg.mapId || null });
        break;
      }

      case 'queue_cancel': {
        matchmaker.removeClient(client.id, false);
        break;
      }

      case 'queue_force_start': {
        matchmaker.forceLaunchClientQueue(client.id);
        break;
      }

      case 'leave_room': {
        leaveCurrentRoom(client);
        safeSend(ws, {
          type: 'left_room',
          rooms: [...getWsRoomSummaries(), ...gameDB.getActiveCloudRooms()]
        });
        broadcastLobbyRoomList();
        break;
      }

      case 'switch_team': {
        rooms.get(client.roomId)?.switchPlayerTeam(client.id);
        break;
      }

      case 'update_room': {
        rooms.get(client.roomId)?.updateRoomSettings(client.id, msg);
        break;
      }

      case 'start_match': {
        rooms.get(client.roomId)?.startMatch(client.id);
        break;
      }

      case 'resync_match': {
        rooms.get(client.roomId)?.resyncPlayerToMatch(client.id);
        break;
      }

      case 'room_chat': {
        rooms.get(client.roomId)?.addChatMessage(client.id, msg.text, msg.scope);
        break;
      }

      case 'radio': {
        rooms.get(client.roomId)?.handleRadioCommand(client.id, msg.key);
        break;
      }

      case 'input': {
        rooms.get(client.roomId)?.handleClientInput(client.id, msg);
        break;
      }

      case 'drop_action': {
        rooms.get(client.roomId)?.handleDropAction(client.id, msg.action);
        break;
      }

      case 'loot_item': {
        rooms.get(client.roomId)?.handleLootItem(client.id, msg);
        break;
      }

      case 'drop_item': {
        rooms.get(client.roomId)?.handleDropItem(client.id, msg);
        break;
      }

      case 'use_med': {
        rooms.get(client.roomId)?.handleUseMed(client.id, msg);
        break;
      }

      case 'fire': {
        rooms.get(client.roomId)?.handleClientFire(client.id, msg);
        break;
      }

      case 'throw_grenade': {
        rooms.get(client.roomId)?.handleThrowGrenade(client.id, msg);
        break;
      }

      case 'reload': {
        const room = rooms.get(client.roomId);
        const p = room?.combatants.get(client.id);
        if (p) room.startReload(p, Date.now());
        break;
      }

      case 'switch_weapon': {
        const room = rooms.get(client.roomId);
        const p = room?.combatants.get(client.id);
        if (p) room.switchWeapon(p, msg.slot);
        break;
      }

      case 'change_primary': {
        const room = rooms.get(client.roomId);
        const p = room?.combatants.get(client.id);
        if (p) room.changeInMatchPrimary(p, msg.primaryId);
        break;
      }

      case 'voice_signal': {
        rooms.get(client.roomId)?.handleVoiceSignal(client.id, msg);
        break;
      }

      case 'voice_audio': {
        rooms.get(client.roomId)?.handleVoiceAudio(client.id, msg);
        break;
      }

      case 'kick_player': {
        const room = rooms.get(client.roomId);
        if (room && msg.targetId) {
          const kicked = room.kickPlayer(client.id, msg.targetId);
          if (kicked) {
            const targetClient = clientsById.get(msg.targetId);
            if (targetClient && targetClient.roomId === room.id) {
              targetClient.roomId = null;
              syncUserRoomCode(targetClient.userId, null);
            }
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    matchmaker.removeClient(clientId, true);
    leaveCurrentRoom(client);
    clientsById.delete(clientId);
    broadcastLobbyRoomList();
  });
});

// Automatically terminate half-open / crashed client sockets so ghost names NEVER linger in rooms!
setInterval(() => {
  for (const client of clientsById.values()) {
    const sock = client.ws;
    if (!sock) continue;
    if (sock.isAlive === false) {
      try { sock.terminate(); } catch {}
      continue;
    }
    sock.isAlive = false;
    try { sock.ping(); } catch {}
  }
}, 12000);

server.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`  FPS ONLINE - BATTLE STRIKE v2.0 Full-Stack Running!`);
  console.log(`  Local URL:   http://localhost:${PORT}`);
  console.log(`========================================================\n`);
});
