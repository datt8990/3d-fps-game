// Express REST API App shared between Local Server (server/index.js) and Vercel Serverless (api/index.js)
import express from 'express';
import { gameDB } from './db.js';

export const app = express();
app.use(express.json({ limit: '512kb' }));

// Cloud Room Relay Queues (Guarantees 100% Vercel cross-device room join & gameplay fallback when WebRTC NAT/PeerJS fails!)
const relayQueues = new Map();

function pruneRelayQueues() {
  const now = Date.now();
  for (const [code, q] of relayQueues.entries()) {
    if (now - (q.updatedAt || 0) > 60000) {
      relayQueues.delete(code);
    }
  }
}

function getOrCreateRelay(code, hostId = null) {
  pruneRelayQueues();
  let q = relayQueues.get(code);
  if (!q) {
    q = {
      code,
      hostId,
      toHost: [],
      toClients: new Map(),
      lastHostAt: hostId ? Date.now() : 0,
      updatedAt: Date.now(),
      closed: false
    };
    relayQueues.set(code, q);
  }
  if (hostId) q.hostId = hostId;
  q.updatedAt = Date.now();
  return q;
}

// Hook for local WS server to inject live WS rooms into /api/rooms
let localWsRoomsProvider = () => [];
let onLoadoutUpdatedHook = null;

export function registerLocalServerHooks({ getRooms, onLoadoutUpdated }) {
  if (getRooms) localWsRoomsProvider = getRooms;
  if (onLoadoutUpdated) onLoadoutUpdatedHook = onLoadoutUpdated;
}

function resolveUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.query.token || '');
  const signedBackup = req.headers['x-profile-backup'] || '';
  return gameDB.getUserByToken(token, signedBackup);
}

app.use(async (_req, _res, next) => {
  await gameDB.ensureCloudKV();
  next();
});

// 1. Health & Runtime Capabilities (Client auto-selects WS vs Cloud WebRTC P2P!)
app.get('/api/health', (_req, res) => {
  const isVercel = Boolean(process.env.VERCEL);
  res.json({
    ok: true,
    isVercel,
    hasWebSocket: !isVercel,
    transport: isVercel ? 'webrtc_p2p' : 'hybrid_ws_p2p',
    onlineCount: gameDB.getOnlineUsersCount(),
    region: process.env.VERCEL_REGION || 'local'
  });
});

// 2. Auth & Profile
app.post('/api/auth', (req, res) => {
  const { username, password } = req.body || {};
  const result = gameDB.loginOrRegister(username, password);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.get('/api/profile', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  if (req.query.roomCode !== undefined) {
    user.currentRoomCode = req.query.roomCode || null;
  }
  res.json({
    user: gameDB.sanitizeUser(user),
    onlineCount: gameDB.getOnlineUsersCount()
  });
});

// 3. Loadout & Armory Unlocks
app.post('/api/loadout', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  const result = gameDB.updateLoadout(user.id, req.body || {});
  if (result.error) return res.status(400).json(result);
  onLoadoutUpdatedHook?.(user.id, result.user);
  res.json(result);
});

app.post('/api/unlock', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  const { category, itemId, slot } = req.body || {};
  const result = gameDB.unlockItem(user.id, category, itemId, slot);
  if (result.error) return res.status(400).json(result);
  onLoadoutUpdatedHook?.(user.id, result.user);
  res.json(result);
});

// 4. Friends & Squad Room Invites
app.get('/api/friends', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  const sanitized = gameDB.sanitizeUser(user);
  res.json({
    friendCode: user.friendCode,
    friends: gameDB.getFriendsStatus(user.id),
    pendingInvite: sanitized.pendingInvite
  });
});

app.post('/api/friends/add', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  const result = gameDB.addFriend(user.id, req.body?.query);
  if (result.error) return res.status(400).json(result);
  res.json({
    ...result,
    friends: gameDB.getFriendsStatus(user.id)
  });
});

app.post('/api/friends/invite', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  const { targetUsername, roomCode, modeName, mapName } = req.body || {};
  const result = gameDB.sendRoomInvite(user, targetUsername, roomCode, modeName, mapName);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/friends/dismiss-invite', (req, res) => {
  const user = resolveUser(req);
  if (user) gameDB.clearPendingInvite(user.id);
  res.json({ ok: true });
});

// 5. Online Rooms Directory & Friend Matchmaking (Works on Vercel & Local!)
app.get('/api/rooms', (_req, res) => {
  const wsRooms = localWsRoomsProvider();
  const cloudRooms = gameDB.getActiveCloudRooms();
  const byCode = new Map();
  for (const r of [...wsRooms, ...cloudRooms]) {
    byCode.set(r.code || r.id, r);
  }
  res.json({
    rooms: [...byCode.values()],
    onlineCount: gameDB.getOnlineUsersCount(),
    globalChat: gameDB.db.globalChat.slice(-25)
  });
});

app.post('/api/rooms/heartbeat', (req, res) => {
  const user = resolveUser(req);
  const summary = req.body?.room;
  if (!summary?.code) return res.status(400).json({ error: 'Thiếu mã phòng.' });
  const saved = gameDB.upsertCloudRoom(summary, user?.id);
  res.json({ ok: true, room: saved });
});

app.post('/api/rooms/close', (req, res) => {
  const user = resolveUser(req);
  const code = String(req.body?.code || '').replace(/^rm_/i, '').trim().toUpperCase();
  gameDB.removeCloudRoom(code, user?.id);
  const q = relayQueues.get(code);
  if (q) {
    q.closed = true;
    q.updatedAt = Date.now();
  }
  res.json({ ok: true });
});

// 5b. Universal Cloud Room Relay (Cross-network fallback when PeerJS / WebRTC NAT fails)
app.post('/api/relay/:code/host-sync', (req, res) => {
  const user = resolveUser(req);
  const code = String(req.params.code || '').replace(/^rm_/i, '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Thiếu mã phòng.' });

  const { hostId, outgoing, roomSummary } = req.body || {};
  const q = getOrCreateRelay(code, hostId || null);
  q.lastHostAt = Date.now();
  q.closed = false;

  if (roomSummary?.code) {
    gameDB.upsertCloudRoom(roomSummary, user?.id);
  } else if (gameDB.db.p2pRooms[code]) {
    gameDB.db.p2pRooms[code].updatedAt = Date.now();
  }

  if (Array.isArray(outgoing)) {
    for (const item of outgoing) {
      if (!item || !item.payload) continue;
      if (!item.to || item.to === '*') {
        for (const [cid, inbox] of q.toClients.entries()) {
          if (cid === hostId) continue;
          inbox.push(item.payload);
          if (inbox.length > 160) inbox.shift();
        }
      } else {
        let inbox = q.toClients.get(item.to);
        if (!inbox) {
          inbox = [];
          q.toClients.set(item.to, inbox);
        }
        inbox.push(item.payload);
        if (inbox.length > 160) inbox.shift();
      }
    }
  }

  const packets = q.toHost.splice(0, q.toHost.length);
  res.json({ ok: true, packets });
});

app.post('/api/relay/:code/client-sync', (req, res) => {
  const code = String(req.params.code || '').replace(/^rm_/i, '').trim().toUpperCase();
  const { clientId, outgoing } = req.body || {};
  if (!code || !clientId) return res.status(400).json({ error: 'Thiếu mã phòng hoặc clientId.' });

  pruneRelayQueues();
  const q = relayQueues.get(code);
  const cloudRoom = gameDB.getActiveCloudRooms().find((r) => (r.code || '').toUpperCase() === code);

  if (q?.closed) {
    return res.status(410).json({ error: 'Chủ phòng đã đóng phòng đấu.', closed: true });
  }
  if (!q && !cloudRoom) {
    return res.status(404).json({ error: 'Không tìm thấy phòng đấu hoặc phòng đã đóng.' });
  }

  const activeQ = q || getOrCreateRelay(code, null);
  if (activeQ.lastHostAt > 0 && Date.now() - activeQ.lastHostAt > 20000) {
    return res.status(410).json({ error: 'Chủ phòng đã mất kết nối.', closed: true });
  }

  if (!activeQ.toClients.has(clientId)) {
    activeQ.toClients.set(clientId, []);
  }
  activeQ.updatedAt = Date.now();

  if (Array.isArray(outgoing)) {
    for (const payload of outgoing) {
      if (!payload) continue;
      activeQ.toHost.push({ from: clientId, payload });
      if (activeQ.toHost.length > 240) activeQ.toHost.shift();
    }
  }

  const inbox = activeQ.toClients.get(clientId);
  const packets = inbox.splice(0, inbox.length);
  res.json({ ok: true, packets });
});

app.post('/api/matchmaking/find', (req, res) => {
  const { mode, mapId } = req.body || {};
  const allRooms = [...localWsRoomsProvider(), ...gameDB.getActiveCloudRooms()];

  // Find open room with active human host matching mode
  const match = allRooms.find((r) => {
    if (r.mode === 'practice') return false;
    if (mode && r.mode !== mode) return false;
    if (mapId && r.mapId !== mapId && r.humans === 0) return false;
    return r.humans > 0 && r.humans < r.maxPlayers;
  });

  if (match) {
    return res.json({ action: 'join', room: match });
  }
  res.json({ action: 'host_new' });
});

// 6. Match Results Persistence (Used by Cloud P2P Host / Client on Match Completion)
app.post('/api/match-result', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  const reward = gameDB.recordMatchResult(user.id, req.body || {});
  res.json({ reward, user: reward?.user || gameDB.sanitizeUser(user) });
});

// 7. Global Chat & Leaderboard
app.post('/api/global-chat', (req, res) => {
  const user = resolveUser(req);
  const name = user?.username || req.body?.senderName || 'Chiến Binh';
  const msg = gameDB.addGlobalChat(name, req.body?.text);
  if (!msg) return res.status(400).json({ error: 'Tin nhắn trống.' });
  res.json({ msg, globalChat: gameDB.db.globalChat.slice(-25) });
});

app.get('/api/leaderboard', (_req, res) => {
  res.json({ leaderboard: gameDB.getLeaderboard() });
});

export default app;
