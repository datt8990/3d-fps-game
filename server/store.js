// Persistent JSON store for Accounts, Loadouts, Skins/Attachments Inventory, Ranks & Leaderboard
import fs from 'node:fs';
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
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const SEED_LEADERBOARD = [
  { id: 'rival_1', username: 'VN_DragonSniper', rp: 2740, level: 42, stats: { kills: 1420, deaths: 610, headshots: 680, wins: 96, matches: 132 } },
  { id: 'rival_2', username: 'ShadowStrike_99', rp: 2410, level: 36, stats: { kills: 1105, deaths: 590, headshots: 470, wins: 78, matches: 115 } },
  { id: 'rival_3', username: 'BietKich_Alpha', rp: 2080, level: 31, stats: { kills: 890, deaths: 520, headshots: 350, wins: 64, matches: 98 } },
  { id: 'rival_4', username: 'TiaChop_AWP', rp: 1790, level: 27, stats: { kills: 740, deaths: 495, headshots: 310, wins: 51, matches: 84 } },
  { id: 'rival_5', username: 'GhostRecon_HN', rp: 1520, level: 22, stats: { kills: 560, deaths: 430, headshots: 195, wins: 39, matches: 68 } },
  { id: 'rival_6', username: 'Tanker_SG', rp: 1280, level: 16, stats: { kills: 380, deaths: 350, headshots: 120, wins: 25, matches: 49 } },
  { id: 'rival_7', username: 'Tapich_AK47', rp: 1090, level: 12, stats: { kills: 210, deaths: 230, headshots: 68, wins: 14, matches: 32 } }
];

function createDefaultAccount(username, passwordHash = '') {
  return {
    id: 'usr_' + crypto.randomBytes(6).toString('hex'),
    username,
    passwordHash,
    token: crypto.randomBytes(18).toString('hex'),
    createdAt: Date.now(),
    gp: 3000, // Starting credits so players can immediately buy skins/attachments & earn more!
    rp: 1200, // Silver tier start
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
      skins: {
        ak47: 'default',
        m4a1: 'default',
        awp: 'default',
        deagle: 'default'
      },
      attachments: {
        ak47: { optic: 'iron', muzzle: 'none', mag: 'standard' },
        m4a1: { optic: 'reddot', muzzle: 'none', mag: 'standard' },
        awp: { optic: 'iron', muzzle: 'none', mag: 'standard' },
        deagle: { optic: 'iron', muzzle: 'none', mag: 'standard' }
      }
    },
    unlocked: {
      operators: ['vanguard', 'ghost'],
      outfits: ['urban', 'desert'],
      skins: ['default'],
      attachments: ['optic:iron', 'optic:reddot', 'muzzle:none', 'mag:standard']
    },
    history: []
  };
}

class GameStore {
  constructor() {
    this.db = { users: {}, rivals: SEED_LEADERBOARD };
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        this.db.users = parsed.users || {};
        this.db.rivals = parsed.rivals || SEED_LEADERBOARD;
      } else {
        this.save();
      }
    } catch (err) {
      console.error('Store load warning:', err.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), 'utf8');
    } catch (err) {
      console.error('Store save warning:', err.message);
    }
  }

  hashPassword(pw = '') {
    if (!pw) return '';
    return crypto.createHash('sha256').update('bs_salt_' + pw).digest('hex');
  }

  sanitizeUser(user) {
    if (!user) return null;
    const rank = getRankByRp(user.rp);
    return {
      id: user.id,
      username: user.username,
      token: user.token,
      gp: user.gp,
      rp: user.rp,
      rank,
      xp: user.xp,
      level: user.level,
      stats: user.stats,
      loadout: user.loadout,
      unlocked: user.unlocked,
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
        return { error: 'Tên chiến binh đã có mật khẩu bảo vệ. Vui lòng nhập mật khẩu hoặc chọn tên khác.' };
      }
      if (!existing.token) {
        existing.token = crypto.randomBytes(18).toString('hex');
      }
      this.save();
      return { user: this.sanitizeUser(existing) };
    }

    const created = createDefaultAccount(cleanName, pwHash);
    this.db.users[created.id] = created;
    this.save();
    return { user: this.sanitizeUser(created), isNew: true };
  }

  getUserByToken(token) {
    if (!token) return null;
    return Object.values(this.db.users).find((u) => u.token === token) || null;
  }

  getUserById(id) {
    return this.db.users[id] || null;
  }

  updateLoadout(userId, partialLoadout) {
    const user = this.db.users[userId];
    if (!user) return { error: 'Không tìm thấy tài khoản.' };

    if (partialLoadout.operator && OPERATORS[partialLoadout.operator]) {
      if (user.unlocked.operators.includes(partialLoadout.operator)) {
        user.loadout.operator = partialLoadout.operator;
      }
    }
    if (partialLoadout.outfit && OUTFITS[partialLoadout.outfit]) {
      if (user.unlocked.outfits.includes(partialLoadout.outfit)) {
        user.loadout.outfit = partialLoadout.outfit;
      }
    }
    if (partialLoadout.primary && WEAPONS[partialLoadout.primary]?.category === 'primary') {
      user.loadout.primary = partialLoadout.primary;
    }
    if (partialLoadout.secondary && WEAPONS[partialLoadout.secondary]?.category === 'secondary') {
      user.loadout.secondary = partialLoadout.secondary;
    }
    if (partialLoadout.weaponSkin) {
      const { weaponId, skinId } = partialLoadout.weaponSkin;
      if (WEAPONS[weaponId] && WEAPON_SKINS[skinId] && user.unlocked.skins.includes(skinId)) {
        user.loadout.skins[weaponId] = skinId;
      }
    }
    if (partialLoadout.weaponAttachment) {
      const { weaponId, slot, itemId } = partialLoadout.weaponAttachment;
      const unlockKey = `${slot}:${itemId}`;
      if (WEAPONS[weaponId] && ATTACHMENTS[slot]?.[itemId] && user.unlocked.attachments.includes(unlockKey)) {
        if (!user.loadout.attachments[weaponId]) {
          user.loadout.attachments[weaponId] = { optic: 'iron', muzzle: 'none', mag: 'standard' };
        }
        user.loadout.attachments[weaponId][slot] = itemId;
      }
    }

    this.save();
    return { user: this.sanitizeUser(user) };
  }

  unlockItem(userId, category, itemId, slot = '') {
    const user = this.db.users[userId];
    if (!user) return { error: 'Không tìm thấy tài khoản.' };

    let cost = 0;
    if (category === 'operator') {
      const op = OPERATORS[itemId];
      if (!op) return { error: 'Nhân vật không hợp lệ.' };
      if (user.unlocked.operators.includes(itemId)) return { user: this.sanitizeUser(user) };
      cost = op.unlockCost || 0;
      if (user.gp < cost) return { error: `Không đủ GP (Cần ${cost} GP).` };
      user.gp -= cost;
      user.unlocked.operators.push(itemId);
      user.loadout.operator = itemId;
    } else if (category === 'outfit') {
      const outfit = OUTFITS[itemId];
      if (!outfit) return { error: 'Trang phục không hợp lệ.' };
      if (user.unlocked.outfits.includes(itemId)) return { user: this.sanitizeUser(user) };
      cost = outfit.cost || 0;
      if (user.gp < cost) return { error: `Không đủ GP (Cần ${cost} GP).` };
      user.gp -= cost;
      user.unlocked.outfits.push(itemId);
      user.loadout.outfit = itemId;
    } else if (category === 'skin') {
      const skin = WEAPON_SKINS[itemId];
      if (!skin) return { error: 'Skin không hợp lệ.' };
      if (user.unlocked.skins.includes(itemId)) return { user: this.sanitizeUser(user) };
      cost = skin.cost || 0;
      if (user.gp < cost) return { error: `Không đủ GP (Cần ${cost} GP).` };
      user.gp -= cost;
      user.unlocked.skins.push(itemId);
    } else if (category === 'attachment') {
      const att = ATTACHMENTS[slot]?.[itemId];
      if (!att) return { error: 'Phụ kiện không hợp lệ.' };
      const key = `${slot}:${itemId}`;
      if (user.unlocked.attachments.includes(key)) return { user: this.sanitizeUser(user) };
      cost = att.cost || 0;
      if (user.gp < cost) return { error: `Không đủ GP (Cần ${cost} GP).` };
      user.gp -= cost;
      user.unlocked.attachments.push(key);
    } else {
      return { error: 'Danh mục không hợp lệ.' };
    }

    this.save();
    return { user: this.sanitizeUser(user) };
  }

  recordMatchResult(userId, result) {
    const user = this.db.users[userId];
    if (!user) return null;

    const { mode, mapName, won, kills = 0, deaths = 0, assists = 0, headshots = 0, isRanked = false } = result;
    user.stats.matches += 1;
    if (won) user.stats.wins += 1;
    user.stats.kills += kills;
    user.stats.deaths += deaths;
    user.stats.assists = (user.stats.assists || 0) + assists;
    user.stats.headshots += headshots;

    const gpEarned = 120 + (won ? 140 : 45) + kills * 18 + headshots * 10 + assists * 6;
    const xpEarned = 80 + (won ? 100 : 40) + kills * 15;
    user.gp += gpEarned;
    user.xp += xpEarned;
    user.level = 1 + Math.floor(user.xp / 400);

    let rpDelta = 0;
    if (isRanked || mode === 'ranked') {
      const kdFactor = Math.min(12, Math.max(-8, Math.round((kills - deaths) * 1.5)));
      rpDelta = (won ? 28 : -16) + kdFactor;
      user.rp = Math.max(100, user.rp + rpDelta);
    } else {
      // Casual modes also grant small bonus RP for progression feel
      rpDelta = (won ? 10 : 2) + Math.min(6, Math.floor(kills / 3));
      user.rp = Math.max(100, user.rp + rpDelta);
    }

    user.history.unshift({
      at: Date.now(),
      mode,
      mapName,
      won,
      kills,
      deaths,
      headshots,
      gpEarned,
      rpDelta
    });
    if (user.history.length > 20) user.history.length = 20;

    this.save();
    return { gpEarned, xpEarned, rpDelta, newRp: user.rp, rank: getRankByRp(user.rp) };
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

export const gameStore = new GameStore();
