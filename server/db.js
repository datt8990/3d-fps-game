// Universal Multi-Adapter Database Layer (Local Disk JSON + Vercel /tmp + Optional Vercel KV/Upstash + HMAC Cloud Sync)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  OPERATORS,
  OUTFITS,
  WEAPONS,
  ATTACHMENTS,
  WEAPON_SKINS,
  getRankByRp
} from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_DIR = IS_VERCEL ? path.join(os.tmpdir(), 'battle_strike_data') : path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db_v2.json');
const HMAC_SECRET = process.env.BS_HMAC_SECRET || 'battle_strike_v2_cloud_hmac_2026';

// Optional Upstash / Vercel KV REST configuration (auto-activated if env vars exist)
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

const SEED_LEADERBOARD = [
  { id: 'rival_1', username: 'VN_DragonSniper', rp: 2740, level: 42, stats: { kills: 1420, deaths: 610, headshots: 680, wins: 96, matches: 132 } },
  { id: 'rival_2', username: 'ShadowStrike_99', rp: 2410, level: 36, stats: { kills: 1105, deaths: 590, headshots: 470, wins: 78, matches: 115 } },
  { id: 'rival_3', username: 'BietKich_Alpha', rp: 2080, level: 31, stats: { kills: 890, deaths: 520, headshots: 350, wins: 64, matches: 98 } },
  { id: 'rival_4', username: 'TiaChop_AWP', rp: 1790, level: 27, stats: { kills: 740, deaths: 495, headshots: 310, wins: 51, matches: 84 } },
  { id: 'rival_5', username: 'GhostRecon_HN', rp: 1520, level: 22, stats: { kills: 560, deaths: 430, headshots: 195, wins: 39, matches: 68 } },
  { id: 'rival_6', username: 'Tanker_SG', rp: 1280, level: 16, stats: { kills: 380, deaths: 350, headshots: 120, wins: 25, matches: 49 } },
  { id: 'rival_7', username: 'Karambit_Pro', rp: 1120, level: 13, stats: { kills: 245, deaths: 230, headshots: 84, wins: 16, matches: 35 } }
];

function makeFriendCode() {
  return 'VN-' + Math.floor(1000 + Math.random() * 9000);
}

export function createDefaultAccount(username, passwordHash = '') {
  return {
    id: 'usr_' + crypto.randomBytes(6).toString('hex'),
    friendCode: makeFriendCode(),
    username,
    passwordHash,
    token: crypto.randomBytes(18).toString('hex'),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    currentRoomCode: null,
    gp: 4500, // Generous starting GP to explore the expanded weapon/skin/operator arsenal!
    rp: 1200,
    xp: 0,
    level: 1,
    stats: {
      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      wins: 0,
      matches: 0
    },
    loadout: {
      operator: 'vanguard',
      outfit: 'urban',
      primary: 'ak47',
      secondary: 'deagle',
      melee: 'knife',
      skins: {
        ak47: 'default',
        m4a1: 'default',
        awp: 'default',
        deagle: 'default',
        knife: 'default'
      },
      attachments: {
        ak47: { optic: 'iron', muzzle: 'none', mag: 'standard' },
        m4a1: { optic: 'reddot', muzzle: 'none', mag: 'standard' },
        awp: { optic: 'iron', muzzle: 'none', mag: 'standard' },
        deagle: { optic: 'iron', muzzle: 'none', mag: 'standard' }
      }
    },
    unlocked: {
      weapons: ['ak47', 'm4a1', 'awp', 'deagle', 'knife'],
      operators: ['vanguard', 'ghost'],
      outfits: ['urban', 'desert'],
      skins: ['default'],
      attachments: ['optic:iron', 'optic:reddot', 'muzzle:none', 'mag:standard']
    },
    friends: [], // usernames
    pendingInvite: null,
    history: []
  };
}

class GameDatabase {
  constructor() {
    this.db = {
      users: {},
      rivals: SEED_LEADERBOARD,
      p2pRooms: {}, // code -> room summary
      globalChat: [
        {
          id: 'sys_1',
          senderName: 'BỘ CHỈ HUY',
          text: 'Chào mừng đến với BATTLE STRIKE v2.0! Tạo phòng lấy Mã Phòng 6 ký tự hoặc gửi Link mời bạn bè vào bắn ngay!',
          isSystem: true,
          at: Date.now()
        }
      ]
    };
    this.kvLoaded = false;
    this.loadLocal();
  }

  loadLocal() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        this.db.users = parsed.users || {};
        this.db.rivals = parsed.rivals || SEED_LEADERBOARD;
        this.db.p2pRooms = parsed.p2pRooms || {};
        if (Array.isArray(parsed.globalChat) && parsed.globalChat.length) {
          this.db.globalChat = parsed.globalChat;
        }
      } else {
        this.saveLocal();
      }
    } catch (err) {
      console.warn('DB local init warning:', err.message);
    }
  }

  saveLocal() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), 'utf8');
    } catch {}
    this.pushToCloudKV().catch(() => {});
  }

  async ensureCloudKV() {
    if (!KV_URL || !KV_TOKEN || this.kvLoaded) return;
    this.kvLoaded = true;
    try {
      const res = await fetch(`${KV_URL}/get/bs_state_v2`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const json = await res.json();
      if (json?.result) {
        const parsed = typeof json.result === 'string' ? JSON.parse(json.result) : json.result;
        if (parsed?.users) {
          this.db.users = { ...parsed.users, ...this.db.users };
          this.db.p2pRooms = { ...(parsed.p2pRooms || {}), ...this.db.p2pRooms };
        }
      }
    } catch {}
  }

  async pushToCloudKV() {
    if (!KV_URL || !KV_TOKEN) return;
    const compact = JSON.stringify({
      users: this.db.users,
      p2pRooms: this.db.p2pRooms,
      globalChat: this.db.globalChat.slice(-25)
    });
    await fetch(`${KV_URL}/set/bs_state_v2`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: compact
    });
  }

  // Cryptographically sign user snapshot so Vercel cold-starts restore accounts tamper-free with zero external DB!
  signProfileBackup(user) {
    const payloadObj = {
      id: user.id,
      friendCode: user.friendCode,
      username: user.username,
      passwordHash: user.passwordHash,
      token: user.token,
      gp: user.gp,
      rp: user.rp,
      xp: user.xp,
      level: user.level,
      stats: user.stats,
      loadout: user.loadout,
      unlocked: user.unlocked,
      friends: user.friends || [],
      history: (user.history || []).slice(0, 10)
    };
    const b64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', HMAC_SECRET).update(b64).digest('base64url');
    return `${b64}.${sig}`;
  }

  hydrateFromSignedBackup(backupStr) {
    if (!backupStr || typeof backupStr !== 'string' || !backupStr.includes('.')) return null;
    const [b64, sig] = backupStr.split('.');
    const expected = crypto.createHmac('sha256', HMAC_SECRET).update(b64).digest('base64url');
    if (sig !== expected) return null;

    try {
      const data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
      if (!data?.id || !data?.token) return null;
      if (!this.db.users[data.id]) {
        this.db.users[data.id] = {
          ...createDefaultAccount(data.username, data.passwordHash),
          ...data,
          lastSeenAt: Date.now()
        };
      }
      return this.db.users[data.id];
    } catch {
      return null;
    }
  }

  ensureUserSchema(u) {
    if (!u) return null;
    if (!u.friendCode) u.friendCode = makeFriendCode();
    if (!u.unlocked.weapons) u.unlocked.weapons = ['ak47', 'm4a1', 'awp', 'deagle', 'knife'];
    if (!u.loadout.melee) u.loadout.melee = 'knife';
    if (!Array.isArray(u.friends)) u.friends = [];
    return u;
  }

  hashPassword(pw = '') {
    if (!pw) return '';
    return crypto.createHash('sha256').update('bs_salt_' + pw).digest('hex');
  }

  sanitizeUser(user) {
    if (!user) return null;
    this.ensureUserSchema(user);
    const rank = getRankByRp(user.rp);
    return {
      id: user.id,
      friendCode: user.friendCode,
      username: user.username,
      token: user.token,
      profileBackup: this.signProfileBackup(user),
      gp: user.gp,
      rp: user.rp,
      rank,
      xp: user.xp,
      level: user.level,
      stats: user.stats,
      loadout: user.loadout,
      unlocked: user.unlocked,
      friends: user.friends,
      pendingInvite: user.pendingInvite && Date.now() - user.pendingInvite.at < 60000 ? user.pendingInvite : null,
      history: (user.history || []).slice(0, 12)
    };
  }

  loginOrRegister(usernameRaw, password = '') {
    const cleanName = String(usernameRaw || '').trim().replace(/[^\p{L}\p{N}_\- ]/gu, '').slice(0, 18);
    if (cleanName.length < 2) {
      return { error: 'Tên chiến binh cần từ 2 đến 18 ký tự.' };
    }

    const key = cleanName.toLowerCase();
    const existing = Object.values(this.db.users).find((u) => u.username.toLowerCase() === key);
    const pwHash = this.hashPassword(password);

    if (existing) {
      if (existing.passwordHash && password && existing.passwordHash !== pwHash) {
        return { error: 'Mật khẩu không chính xác cho tài khoản này.' };
      }
      if (existing.passwordHash && !password) {
        return { error: 'Tên chiến binh này đã đặt mật khẩu. Vui lòng nhập mật khẩu hoặc chọn tên khác.' };
      }
      existing.lastSeenAt = Date.now();
      if (!existing.token) existing.token = crypto.randomBytes(18).toString('hex');
      this.saveLocal();
      return { user: this.sanitizeUser(existing) };
    }

    const created = createDefaultAccount(cleanName, pwHash);
    this.db.users[created.id] = created;
    this.saveLocal();
    return { user: this.sanitizeUser(created), isNew: true };
  }

  getUserByToken(token, signedBackup = '') {
    if (signedBackup) {
      this.hydrateFromSignedBackup(signedBackup);
    }
    if (!token) return null;
    const u = Object.values(this.db.users).find((item) => item.token === token) || null;
    if (u) {
      u.lastSeenAt = Date.now();
      this.ensureUserSchema(u);
    }
    return u;
  }

  getUserById(id) {
    const u = this.db.users[id] || null;
    return this.ensureUserSchema(u);
  }

  updateLoadout(userId, partial = {}) {
    const user = this.ensureUserSchema(this.db.users[userId]);
    if (!user) return { error: 'Không tìm thấy tài khoản.' };

    if (partial.operator && OPERATORS[partial.operator] && user.unlocked.operators.includes(partial.operator)) {
      user.loadout.operator = partial.operator;
    }
    if (partial.outfit && OUTFITS[partial.outfit] && user.unlocked.outfits.includes(partial.outfit)) {
      user.loadout.outfit = partial.outfit;
    }
    if (partial.primary && WEAPONS[partial.primary]?.category === 'primary' && user.unlocked.weapons.includes(partial.primary)) {
      user.loadout.primary = partial.primary;
    }
    if (partial.secondary && WEAPONS[partial.secondary]?.category === 'secondary' && user.unlocked.weapons.includes(partial.secondary)) {
      user.loadout.secondary = partial.secondary;
    }
    if (partial.melee && WEAPONS[partial.melee]?.category === 'melee' && user.unlocked.weapons.includes(partial.melee)) {
      user.loadout.melee = partial.melee;
    }
    if (partial.weaponSkin) {
      const { weaponId, skinId } = partial.weaponSkin;
      if (WEAPONS[weaponId] && WEAPON_SKINS[skinId] && user.unlocked.skins.includes(skinId)) {
        user.loadout.skins[weaponId] = skinId;
      }
    }
    if (partial.weaponAttachment) {
      const { weaponId, slot, itemId } = partial.weaponAttachment;
      const unlockKey = `${slot}:${itemId}`;
      if (WEAPONS[weaponId] && ATTACHMENTS[slot]?.[itemId] && user.unlocked.attachments.includes(unlockKey)) {
        if (!user.loadout.attachments[weaponId]) {
          user.loadout.attachments[weaponId] = { optic: 'iron', muzzle: 'none', mag: 'standard' };
        }
        user.loadout.attachments[weaponId][slot] = itemId;
      }
    }

    this.saveLocal();
    return { user: this.sanitizeUser(user) };
  }

  unlockItem(userId, category, itemId, slot = '') {
    const user = this.ensureUserSchema(this.db.users[userId]);
    if (!user) return { error: 'Không tìm thấy tài khoản.' };

    if (category === 'weapon') {
      const w = WEAPONS[itemId];
      if (!w) return { error: 'Vũ khí không hợp lệ.' };
      if (!user.unlocked.weapons.includes(itemId)) {
        const cost = w.unlockCost || 0;
        if (user.gp < cost) return { error: `Không đủ GP (Cần ${cost} GP).` };
        user.gp -= cost;
        user.unlocked.weapons.push(itemId);
      }
      if (w.category === 'primary') user.loadout.primary = itemId;
      else if (w.category === 'secondary') user.loadout.secondary = itemId;
      else if (w.category === 'melee') user.loadout.melee = itemId;
    } else if (category === 'operator') {
      const op = OPERATORS[itemId];
      if (!op) return { error: 'Nhân vật không hợp lệ.' };
      if (!user.unlocked.operators.includes(itemId)) {
        if (user.gp < op.unlockCost) return { error: `Không đủ GP (Cần ${op.unlockCost} GP).` };
        user.gp -= op.unlockCost;
        user.unlocked.operators.push(itemId);
      }
      user.loadout.operator = itemId;
    } else if (category === 'outfit') {
      const outfit = OUTFITS[itemId];
      if (!outfit) return { error: 'Trang phục không hợp lệ.' };
      if (!user.unlocked.outfits.includes(itemId)) {
        if (user.gp < outfit.cost) return { error: `Không đủ GP (Cần ${outfit.cost} GP).` };
        user.gp -= outfit.cost;
        user.unlocked.outfits.push(itemId);
      }
      user.loadout.outfit = itemId;
    } else if (category === 'skin') {
      const skin = WEAPON_SKINS[itemId];
      if (!skin) return { error: 'Skin không hợp lệ.' };
      if (!user.unlocked.skins.includes(itemId)) {
        if (user.gp < skin.cost) return { error: `Không đủ GP (Cần ${skin.cost} GP).` };
        user.gp -= skin.cost;
        user.unlocked.skins.push(itemId);
      }
    } else if (category === 'attachment') {
      const att = ATTACHMENTS[slot]?.[itemId];
      if (!att) return { error: 'Phụ kiện không hợp lệ.' };
      const key = `${slot}:${itemId}`;
      if (!user.unlocked.attachments.includes(key)) {
        if (user.gp < att.cost) return { error: `Không đủ GP (Cần ${att.cost} GP).` };
        user.gp -= att.cost;
        user.unlocked.attachments.push(key);
      }
    } else {
      return { error: 'Danh mục không hợp lệ.' };
    }

    this.saveLocal();
    return { user: this.sanitizeUser(user) };
  }

  // Friends & Squad Invite System
  addFriend(userId, queryRaw) {
    const user = this.ensureUserSchema(this.db.users[userId]);
    if (!user) return { error: 'Chưa đăng nhập.' };
    const q = String(queryRaw || '').trim().toLowerCase();
    if (!q) return { error: 'Nhập Tên chiến binh hoặc Mã bạn bè (VD: VN-1234).' };

    const target = Object.values(this.db.users).find(
      (u) => u.id !== user.id && (u.username.toLowerCase() === q || (u.friendCode || '').toLowerCase() === q)
    );
    if (!target) {
      return { error: 'Không tìm thấy chiến binh này trên hệ thống (Bạn của bạn cần đăng nhập ít nhất 1 lần).' };
    }

    this.ensureUserSchema(target);
    if (!user.friends.includes(target.username)) user.friends.push(target.username);
    if (!target.friends.includes(user.username)) target.friends.push(user.username);
    this.saveLocal();
    return { user: this.sanitizeUser(user), friendAdded: target.username };
  }

  getFriendsStatus(userId) {
    const user = this.ensureUserSchema(this.db.users[userId]);
    if (!user) return [];
    const now = Date.now();
    return user.friends.map((fname) => {
      const f = Object.values(this.db.users).find((u) => u.username.toLowerCase() === fname.toLowerCase());
      if (!f) return { username: fname, online: false, roomCode: null, rank: getRankByRp(1200) };
      const online = now - (f.lastSeenAt || 0) < 45000;
      return {
        username: f.username,
        friendCode: f.friendCode,
        online,
        roomCode: online ? f.currentRoomCode : null,
        rp: f.rp,
        rank: getRankByRp(f.rp)
      };
    });
  }

  sendRoomInvite(senderUser, targetUsername, roomCode, modeName, mapName) {
    const target = Object.values(this.db.users).find(
      (u) => u.username.toLowerCase() === String(targetUsername || '').trim().toLowerCase()
    );
    if (!target) return { error: 'Không tìm thấy bạn bè.' };
    target.pendingInvite = {
      id: crypto.randomBytes(4).toString('hex'),
      fromName: senderUser.username,
      roomCode: String(roomCode || '').toUpperCase(),
      modeName: modeName || 'Đấu Đội 5v5',
      mapName: mapName || 'Nhà Kho',
      at: Date.now()
    };
    this.saveLocal();
    return { ok: true };
  }

  clearPendingInvite(userId) {
    const u = this.db.users[userId];
    if (u) {
      u.pendingInvite = null;
      this.saveLocal();
    }
  }

  // Cloud P2P Room Registry (for Vercel Serverless Matchmaking & Room Browser)
  upsertCloudRoom(summary, hostUserId = null) {
    if (!summary?.code) return;
    const code = String(summary.code).toUpperCase();
    this.db.p2pRooms[code] = {
      ...summary,
      code,
      isCloudP2P: true,
      updatedAt: Date.now()
    };
    if (hostUserId && this.db.users[hostUserId]) {
      this.db.users[hostUserId].currentRoomCode = code;
      this.db.users[hostUserId].lastSeenAt = Date.now();
    }
    this.pruneExpiredCloudRooms();
    this.saveLocal();
    return this.db.p2pRooms[code];
  }

  removeCloudRoom(code, userId = null) {
    const clean = String(code || '').toUpperCase();
    delete this.db.p2pRooms[clean];
    if (userId && this.db.users[userId]?.currentRoomCode === clean) {
      this.db.users[userId].currentRoomCode = null;
    }
    this.saveLocal();
  }

  pruneExpiredCloudRooms() {
    const now = Date.now();
    for (const [code, room] of Object.entries(this.db.p2pRooms)) {
      if (now - (room.updatedAt || 0) > 38000) {
        delete this.db.p2pRooms[code];
      }
    }
  }

  getActiveCloudRooms() {
    this.pruneExpiredCloudRooms();
    return Object.values(this.db.p2pRooms);
  }

  recordMatchResult(userId, result) {
    const user = this.ensureUserSchema(this.db.users[userId]);
    if (!user) return null;
    if (result.isPractice) {
      return { gpEarned: 0, xpEarned: 0, rpDelta: 0, newRp: user.rp, rank: getRankByRp(user.rp) };
    }

    const { mode, mapName, won, kills = 0, deaths = 0, assists = 0, headshots = 0, isRanked = false } = result;
    user.stats.matches += 1;
    if (won) user.stats.wins += 1;
    user.stats.kills += Math.min(80, Math.max(0, Number(kills) || 0));
    user.stats.deaths += Math.max(0, Number(deaths) || 0);
    user.stats.assists = (user.stats.assists || 0) + Math.max(0, Number(assists) || 0);
    user.stats.headshots += Math.min(80, Math.max(0, Number(headshots) || 0));

    const safeKills = Math.min(50, Math.max(0, Number(kills) || 0));
    const safeHs = Math.min(safeKills, Math.max(0, Number(headshots) || 0));
    const gpEarned = 140 + (won ? 160 : 55) + safeKills * 20 + safeHs * 12 + (Number(assists) || 0) * 8;
    const xpEarned = 90 + (won ? 110 : 45) + safeKills * 16;
    user.gp += gpEarned;
    user.xp += xpEarned;
    user.level = 1 + Math.floor(user.xp / 400);

    let rpDelta = 0;
    if (isRanked || mode === 'ranked') {
      const kdFactor = Math.min(14, Math.max(-8, Math.round((safeKills - (Number(deaths) || 0)) * 1.5)));
      rpDelta = (won ? 30 : -15) + kdFactor;
      user.rp = Math.max(100, user.rp + rpDelta);
    } else {
      rpDelta = (won ? 12 : 3) + Math.min(7, Math.floor(safeKills / 3));
      user.rp = Math.max(100, user.rp + rpDelta);
    }

    user.history.unshift({
      at: Date.now(),
      mode,
      mapName,
      won,
      kills: safeKills,
      deaths: Number(deaths) || 0,
      headshots: safeHs,
      gpEarned,
      rpDelta
    });
    if (user.history.length > 20) user.history.length = 20;

    this.saveLocal();
    return {
      gpEarned,
      xpEarned,
      rpDelta,
      newRp: user.rp,
      rank: getRankByRp(user.rp),
      user: this.sanitizeUser(user)
    };
  }

  addGlobalChat(senderName, text) {
    const clean = String(text || '').trim().slice(0, 140);
    if (!clean) return null;
    const msg = {
      id: crypto.randomBytes(4).toString('hex'),
      senderName: String(senderName || 'Chiến Binh').slice(0, 18),
      text: clean,
      at: Date.now()
    };
    this.db.globalChat.push(msg);
    if (this.db.globalChat.length > 40) this.db.globalChat.shift();
    this.saveLocal();
    return msg;
  }

  getOnlineUsersCount() {
    const now = Date.now();
    const active = Object.values(this.db.users).filter((u) => now - (u.lastSeenAt || 0) < 45000).length;
    return Math.max(1, active);
  }

  getLeaderboard() {
    const humanEntries = Object.values(this.db.users).map((u) => ({
      id: u.id,
      username: u.username,
      rp: u.rp,
      level: u.level,
      isHuman: true,
      rank: getRankByRp(u.rp),
      stats: u.stats
    }));
    const rivalEntries = (this.db.rivals || []).map((r) => ({
      ...r,
      isHuman: false,
      rank: getRankByRp(r.rp)
    }));

    return [...humanEntries, ...rivalEntries]
      .sort((a, b) => b.rp - a.rp)
      .slice(0, 30)
      .map((entry, idx) => ({ ...entry, position: idx + 1 }));
  }
}

export const gameDB = new GameDatabase();
