// Platform-Agnostic 30Hz Multiplayer GameRoom Core (Node.js WebSocket Server & Browser WebRTC P2P Host)
import {
  SERVER_TICK_MS,
  PHYSICS,
  GRENADE_CONFIG,
  GAME_MODES,
  OPERATORS,
  WEAPONS,
  RADIO_COMMANDS,
  getEffectiveWeaponStats,
  getRankByRp
} from '../constants.js';
import { MAPS } from '../maps.js';
import {
  stepPlayerPhysics,
  depenetratePlayerXZ,
  canStandAt,
  directionFromAngles,
  raycastShot,
  raycastMap,
  hasLineOfSight
} from '../physics.js';
import { createBotProfile, updateBotAI } from './botAI.js';
import { AntiCheatGuard } from './antiCheatCore.js';

function randHex(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function generateRoomCode() {
  return 'BS' + randHex(4);
}

export class GameRoomCore {
  constructor(options = {}, callbacks = {}) {
    this.code = (options.code || generateRoomCode()).toUpperCase();
    this.id = options.id || `rm_${this.code}`;
    this.name = (options.name || `Phòng Chiến Thuật #${this.code}`).slice(0, 34);
    this.mode = GAME_MODES[options.mode] ? options.mode : 'tdm';
    this.modeConfig = GAME_MODES[this.mode];
    this.mapId = MAPS[options.mapId] ? options.mapId : 'warehouse';
    this.map = MAPS[this.mapId];
    this.maxPlayers = Math.min(12, Math.max(2, Number(options.maxPlayers) || this.modeConfig.maxPlayers));
    this.fillBots = options.fillBots !== undefined ? Boolean(options.fillBots) : true;
    this.botDifficulty = ['easy', 'normal', 'hard'].includes(options.botDifficulty) ? options.botDifficulty : 'normal';
    this.isPersistentDefault = Boolean(options.isPersistentDefault);
    this.peerHostId = options.peerHostId || `bstrike_v2_${this.code}`;

    this.hostId = options.hostId || null;
    this.status = 'waiting';
    this.combatants = new Map();
    this.chatLog = [];

    this.antiCheat = new AntiCheatGuard();
    this.sendToFn = callbacks.sendTo || (() => {});
    this.broadcastFn = callbacks.broadcast || (() => {});
    this.onEmptyFn = callbacks.onEmpty || (() => {});
    this.onListChangedFn = callbacks.onListChanged || (() => {});
    this.onMatchEndedFn = callbacks.onMatchEnded || null;

    // Match state
    this.alphaScore = 0;
    this.bravoScore = 0;
    this.roundNumber = 1;
    this.roundPhase = 'live';
    this.roundEndAt = 0;
    this.matchEndsAt = 0;
    this.roundEndsAt = 0;
    this.firstBloodAwarded = false;

    this.bombState = this.createInitialBombState();
    this.grenades = [];
    this.storm = null;
    this.lootCrates = [];
    this.lastStormDamageAt = 0;
    this.lastRegenTickAt = 0;

    this.tickInterval = null;
    this.lastTickAt = Date.now();
  }

  createInitialBombState() {
    return {
      planted: false,
      siteId: null,
      x: 0, y: 0, z: 0,
      explodeAt: 0,
      planterId: null,
      plantProgress: 0,
      defuserId: null,
      defuseProgress: 0,
      dropped: false,
      dropX: 0, dropY: 0, dropZ: 0
    };
  }

  getHumanPlayers() {
    return [...this.combatants.values()].filter((p) => !p.isBot);
  }

  getBots() {
    return [...this.combatants.values()].filter((p) => p.isBot);
  }

  getLivingCombatants() {
    return [...this.combatants.values()].filter((p) => !p.dead);
  }

  getSummary() {
    const humans = this.getHumanPlayers().length;
    const bots = this.getBots().length;
    return {
      id: this.id,
      code: this.code,
      peerHostId: this.peerHostId,
      name: this.name,
      hostName: this.combatants.get(this.hostId)?.name || 'Hệ Thống',
      mode: this.mode,
      modeName: this.modeConfig.shortName,
      mapId: this.mapId,
      mapName: this.map.name,
      status: this.status,
      humans,
      bots,
      totalPlayers: humans + bots,
      maxPlayers: this.maxPlayers,
      fillBots: this.fillBots,
      botDifficulty: this.botDifficulty,
      isRanked: Boolean(this.modeConfig.isRanked)
    };
  }

  createCombatantObject({ id, userId, name, isBot, team, loadout, rp = 1200 }) {
    const opId = OPERATORS[loadout?.operator] ? loadout.operator : 'vanguard';
    const op = OPERATORS[opId];
    const primary = WEAPONS[loadout?.primary]?.category === 'primary' ? loadout.primary : 'ak47';
    const secondary = WEAPONS[loadout?.secondary]?.category === 'secondary' ? loadout.secondary : 'deagle';
    const melee = WEAPONS[loadout?.melee]?.category === 'melee' ? loadout.melee : 'knife';
    const skins = { ...(loadout?.skins || {}) };
    const attachments = JSON.parse(JSON.stringify(loadout?.attachments || {}));

    const pStats = getEffectiveWeaponStats(primary, attachments[primary], opId);
    const sStats = getEffectiveWeaponStats(secondary, attachments[secondary], opId);

    return {
      id,
      userId: userId || null,
      name,
      isBot: Boolean(isBot),
      team,
      rp,
      rank: getRankByRp(rp),
      operator: opId,
      outfit: loadout?.outfit || 'urban',
      primary,
      secondary,
      melee,
      pendingPrimary: null,
      skins,
      attachments,
      slot: 1,
      weaponId: primary,
      weaponsState: {
        1: { id: primary, ammo: pStats.magSize, reserve: pStats.reserveAmmo, magSize: pStats.magSize },
        2: { id: secondary, ammo: sStats.magSize, reserve: sStats.reserveAmmo, magSize: sStats.magSize },
        3: { id: melee, ammo: 0, reserve: 0, magSize: 0 }
      },
      ammo: pStats.magSize,
      reserveAmmo: pStats.reserveAmmo,
      grenades: GRENADE_CONFIG.maxPerSpawn,
      lastGrenadeAt: 0,
      reloadingUntil: 0,
      lastFireAt: 0,
      lastDamagedAt: 0,

      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: 0,
      onGround: true,
      crouching: false,
      sprinting: false,
      ads: false,

      hp: PHYSICS.MAX_HP,
      maxHp: PHYSICS.MAX_HP,
      armor: op.maxArmor,
      maxArmor: op.maxArmor,
      dead: false,
      respawnAt: 0,
      spawnProtectedUntil: 0,
      spawnedAt: Date.now(),
      hasBomb: false,
      damageBoostUntil: 0,

      kills: 0,
      deaths: 0,
      assists: 0,
      headshots: 0,
      currentStreak: 0,
      score: 0,
      ping: isBot ? 12 + Math.floor(Math.random() * 14) : 16,
      damageTakenBy: new Map(),

      input: {
        seq: 0, forward: 0, right: 0, yaw: 0, pitch: 0,
        sprint: false, crouch: false, jump: false, ads: false, interact: false
      }
    };
  }

  pickTeamForJoiner() {
    if (!this.modeConfig.teamBased) {
      return 'ffa_' + randHex(4);
    }
    let alphaCount = 0;
    let bravoCount = 0;
    for (const p of this.combatants.values()) {
      if (p.team === 'alpha') alphaCount++;
      else if (p.team === 'bravo') bravoCount++;
    }
    return alphaCount <= bravoCount ? 'alpha' : 'bravo';
  }

  addHumanPlayer(clientInfo) {
    if (this.combatants.size >= this.maxPlayers) {
      const botToReplace = this.getBots()[0];
      if (botToReplace) {
        this.combatants.delete(botToReplace.id);
      } else {
        return { error: 'Phòng đấu đã đầy!' };
      }
    }

    const team = this.pickTeamForJoiner();
    const player = this.createCombatantObject({
      id: clientInfo.id,
      userId: clientInfo.userId || null,
      name: clientInfo.username || 'Chiến_Binh',
      isBot: false,
      team,
      loadout: clientInfo.loadout || {},
      rp: clientInfo.rp || 1200
    });

    this.combatants.set(player.id, player);
    if (!this.hostId || !this.combatants.has(this.hostId)) {
      this.hostId = player.id;
    }

    if (this.status === 'playing') {
      this.spawnPlayer(player, Date.now(), false);
      this.sendTo(player.id, {
        type: 'match_started',
        room: this.getLobbyPayload(),
        mapId: this.mapId,
        mode: this.mode,
        modeConfig: this.modeConfig,
        matchEndsAt: this.matchEndsAt,
        roundEndsAt: this.roundEndsAt,
        roundNumber: this.roundNumber,
        storm: this.storm,
        lootCrates: this.lootCrates
      });
      this.broadcastPlayerSpawned(player);
    }

    this.addSystemChat(`${player.name} đã tham gia phòng đấu (#${this.code}).`);
    this.broadcastRoomLobby();
    this.onListChangedFn();
    return { player };
  }

  removeHumanPlayer(playerId) {
    const player = this.combatants.get(playerId);
    this.antiCheat.removePlayer(playerId);

    if (player) {
      if (player.hasBomb && this.status === 'playing' && !this.bombState.planted) {
        this.dropBombFromPlayer(player);
      }
      this.combatants.delete(playerId);
      this.addSystemChat(`${player.name} đã rời phòng.`);
    }

    const remainingHumans = this.getHumanPlayers();
    if (remainingHumans.length === 0) {
      this.stopMatchLoop();
      if (this.isPersistentDefault) {
        this.combatants.clear();
        this.status = 'waiting';
        this.alphaScore = 0;
        this.bravoScore = 0;
        this.onListChangedFn();
      } else {
        this.onEmptyFn(this.id);
      }
      return;
    }

    if (this.hostId === playerId) {
      this.hostId = remainingHumans[0].id;
    }

    if (this.status === 'playing' && this.fillBots && this.mode !== 'survival') {
      this.syncBotsForMatch();
    }

    this.broadcastRoomLobby();
    this.onListChangedFn();
  }

  updateHumanLoadout(playerId, loadout, rp) {
    const p = this.combatants.get(playerId);
    if (!p || !loadout) return;
    if (loadout.operator && OPERATORS[loadout.operator]) p.operator = loadout.operator;
    if (loadout.outfit) p.outfit = loadout.outfit;
    if (loadout.primary && WEAPONS[loadout.primary]) p.primary = loadout.primary;
    if (loadout.secondary && WEAPONS[loadout.secondary]) p.secondary = loadout.secondary;
    if (loadout.melee && WEAPONS[loadout.melee]) p.melee = loadout.melee;
    if (loadout.skins) p.skins = { ...loadout.skins };
    if (loadout.attachments) p.attachments = JSON.parse(JSON.stringify(loadout.attachments));
    if (rp !== undefined) {
      p.rp = rp;
      p.rank = getRankByRp(rp);
    }
    this.broadcastRoomLobby();
  }

  switchPlayerTeam(playerId) {
    if (!this.modeConfig.teamBased || this.status !== 'waiting') return;
    const p = this.combatants.get(playerId);
    if (!p) return;
    p.team = p.team === 'alpha' ? 'bravo' : 'alpha';
    this.broadcastRoomLobby();
  }

  updateRoomSettings(playerId, settings = {}) {
    if (playerId !== this.hostId || this.status !== 'waiting') return;
    if (settings.mode && GAME_MODES[settings.mode]) {
      this.mode = settings.mode;
      this.modeConfig = GAME_MODES[this.mode];
      let idx = 0;
      for (const p of this.combatants.values()) {
        p.team = this.modeConfig.teamBased ? (idx % 2 === 0 ? 'alpha' : 'bravo') : `ffa_${p.id}`;
        idx++;
      }
    }
    if (settings.mapId && MAPS[settings.mapId]) {
      this.mapId = settings.mapId;
      this.map = MAPS[this.mapId];
    }
    if (settings.maxPlayers !== undefined) {
      const minAllowed = Math.max(2, this.getHumanPlayers().length);
      this.maxPlayers = Math.min(12, Math.max(minAllowed, Number(settings.maxPlayers) || 10));
    }
    if (settings.fillBots !== undefined) {
      this.fillBots = Boolean(settings.fillBots);
    }
    if (settings.botDifficulty && ['easy', 'normal', 'hard'].includes(settings.botDifficulty)) {
      this.botDifficulty = settings.botDifficulty;
    }
    this.broadcastRoomLobby();
    this.onListChangedFn();
  }

  syncBotsForMatch() {
    while (this.combatants.size > this.maxPlayers && this.getBots().length > 0) {
      const b = this.getBots().pop();
      this.combatants.delete(b.id);
    }
    if (!this.fillBots) {
      for (const b of this.getBots()) this.combatants.delete(b.id);
      return;
    }

    let botIndex = this.getBots().length;
    while (this.combatants.size < this.maxPlayers) {
      const profile = createBotProfile(botIndex++);
      const id = 'bot_' + randHex(5);
      const team = this.pickTeamForJoiner();
      const bot = this.createCombatantObject({
        id,
        userId: null,
        name: profile.name,
        isBot: true,
        team,
        loadout: profile,
        rp: 1150 + Math.floor(Math.random() * 750)
      });
      this.combatants.set(bot.id, bot);
    }
  }

  startMatch(requesterId = null) {
    if (this.status === 'playing') return;
    if (requesterId && this.hostId && requesterId !== this.hostId) return;

    this.syncBotsForMatch();
    if (this.combatants.size < 2) {
      this.fillBots = true;
      this.syncBotsForMatch();
    }

    const now = Date.now();
    this.status = 'playing';
    this.alphaScore = 0;
    this.bravoScore = 0;
    this.roundNumber = 1;
    this.roundPhase = 'live';
    this.firstBloodAwarded = false;
    this.grenades = [];
    this.matchEndsAt = now + this.modeConfig.matchDurationSec * 1000;
    this.roundEndsAt = this.mode === 'bomb' ? now + this.modeConfig.roundDurationSec * 1000 : this.matchEndsAt;
    this.bombState = this.createInitialBombState();

    for (const p of this.combatants.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.assists = 0;
      p.headshots = 0;
      p.currentStreak = 0;
      p.score = 0;
      p.hasBomb = false;
      this.spawnPlayer(p, now, false);
    }

    if (this.mode === 'bomb') {
      this.assignBombCarrier();
    } else if (this.mode === 'survival') {
      this.initSurvivalMode();
    }

    this.broadcast({
      type: 'match_started',
      room: this.getLobbyPayload(),
      mapId: this.mapId,
      mode: this.mode,
      modeConfig: this.modeConfig,
      matchEndsAt: this.matchEndsAt,
      roundEndsAt: this.roundEndsAt,
      roundNumber: this.roundNumber,
      storm: this.storm,
      lootCrates: this.lootCrates
    });

    for (const p of this.combatants.values()) {
      this.broadcastPlayerSpawned(p);
    }

    this.onListChangedFn();
    this.startMatchLoop();
  }

  initSurvivalMode() {
    const maxR = Math.max(this.map.bounds.halfW, this.map.bounds.halfD) * 1.25;
    this.storm = {
      x: (Math.random() - 0.5) * 14,
      z: (Math.random() - 0.5) * 14,
      radius: maxR,
      minRadius: 5.5,
      shrinkSpeed: (maxR - 5.5) / 145
    };
    const types = ['medkit', 'armor', 'overcharge'];
    this.lootCrates = (this.map.lootSpawns || []).map((sp, idx) => ({
      id: 'loot_' + idx,
      type: types[idx % types.length],
      x: sp.x,
      y: sp.y || 0,
      z: sp.z,
      active: true
    }));
  }

  assignBombCarrier() {
    for (const p of this.combatants.values()) p.hasBomb = false;
    const bravoPlayers = [...this.combatants.values()].filter((p) => p.team === 'bravo' && !p.dead);
    const carrier = bravoPlayers.find((p) => !p.isBot) || bravoPlayers[0];
    if (carrier) {
      carrier.hasBomb = true;
      this.broadcast({ type: 'bomb_carrier', carrierId: carrier.id, carrierName: carrier.name });
    }
  }

  dropBombFromPlayer(player) {
    player.hasBomb = false;
    this.bombState.dropped = true;
    this.bombState.dropX = player.x;
    this.bombState.dropY = player.y;
    this.bombState.dropZ = player.z;
    this.broadcast({ type: 'bomb_dropped', x: player.x, y: player.y, z: player.z });
  }

  resetWeaponsForSpawn(player) {
    if (player.pendingPrimary && WEAPONS[player.pendingPrimary]?.category === 'primary') {
      player.primary = player.pendingPrimary;
      player.pendingPrimary = null;
    }
    const pStats = getEffectiveWeaponStats(player.primary, player.attachments[player.primary], player.operator);
    const sStats = getEffectiveWeaponStats(player.secondary, player.attachments[player.secondary], player.operator);

    player.weaponsState = {
      1: { id: player.primary, ammo: pStats.magSize, reserve: pStats.reserveAmmo, magSize: pStats.magSize },
      2: { id: player.secondary, ammo: sStats.magSize, reserve: sStats.reserveAmmo, magSize: sStats.magSize },
      3: { id: player.melee || 'knife', ammo: 0, reserve: 0, magSize: 0 }
    };
    player.slot = 1;
    player.weaponId = player.primary;
    player.ammo = pStats.magSize;
    player.reserveAmmo = pStats.reserveAmmo;
    player.grenades = this.mode === 'practice' ? 5 : GRENADE_CONFIG.maxPerSpawn;
    player.reloadingUntil = 0;
  }

  pickSpawnPoint(player) {
    const spawns = this.map.spawns;
    let base;
    if (this.modeConfig.teamBased && (player.team === 'alpha' || player.team === 'bravo')) {
      const list = spawns[player.team] || spawns.alpha;
      const idx = [...this.combatants.values()]
        .filter((p) => p.team === player.team)
        .findIndex((p) => p.id === player.id);
      base = list[Math.max(0, idx) % list.length];
    } else {
      const list = spawns.ffa || [...spawns.alpha, ...spawns.bravo];
      base = list[Math.floor(Math.random() * list.length)];
      let bestMinDist = -1;
      for (const candidate of list) {
        let minDist = Infinity;
        for (const other of this.getLivingCombatants()) {
          if (other.id === player.id) continue;
          const d = Math.hypot(other.x - candidate.x, other.z - candidate.z);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          base = candidate;
        }
      }
    }

    const jx = base.x + (Math.random() - 0.5) * 0.6;
    const jz = base.z + (Math.random() - 0.5) * 0.6;
    const jy = base.y || 0;
    if (canStandAt(jx, jy, jz, PHYSICS.HEIGHT_STAND, PHYSICS.PLAYER_RADIUS + 0.1, this.map.blocks)) {
      return { x: jx, y: jy, z: jz, yaw: base.yaw || 0 };
    }
    return { x: base.x, y: jy, z: base.z, yaw: base.yaw || 0 };
  }

  spawnPlayer(player, now = Date.now(), emitPacket = true) {
    const pt = this.pickSpawnPoint(player);
    const op = OPERATORS[player.operator] || OPERATORS.vanguard;
    player.x = pt.x;
    player.y = pt.y;
    player.z = pt.z;
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.yaw = pt.yaw;
    player.pitch = 0;
    player.onGround = true;
    player.crouching = false;
    depenetratePlayerXZ(player, PHYSICS.HEIGHT_STAND, PHYSICS.PLAYER_RADIUS, this.map);

    player.hp = PHYSICS.MAX_HP;
    player.maxHp = PHYSICS.MAX_HP;
    player.armor = op.maxArmor;
    player.maxArmor = op.maxArmor;
    player.dead = false;
    player.respawnAt = 0;
    player.currentStreak = 0;
    player.spawnedAt = now;
    player.lastClientPosAt = 0;
    player.spawnProtectedUntil = now + PHYSICS.SPAWN_PROTECT_MS;
    player.damageTakenBy.clear();
    this.resetWeaponsForSpawn(player);

    if (emitPacket) {
      this.broadcastPlayerSpawned(player);
    }
  }

  broadcastPlayerSpawned(player) {
    this.broadcast({
      type: 'player_spawned',
      id: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      weaponId: player.weaponId,
      slot: player.slot,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      grenades: player.grenades,
      hp: player.hp,
      armor: player.armor,
      maxArmor: player.maxArmor
    });
  }

  getPlayerWeaponStats(player) {
    const wId = player.weaponId || 'ak47';
    return getEffectiveWeaponStats(wId, player.attachments?.[wId] || {}, player.operator);
  }

  switchWeapon(player, slotNum) {
    if (player.dead) return;
    const s = Number(slotNum);
    if (![1, 2, 3].includes(s) || s === player.slot) return;
    if (player.weaponsState[player.slot]) {
      player.weaponsState[player.slot].ammo = player.ammo;
      player.weaponsState[player.slot].reserve = player.reserveAmmo;
    }
    player.slot = s;
    const nextW = player.weaponsState[s];
    player.weaponId = nextW.id;
    player.ammo = nextW.ammo;
    player.reserveAmmo = nextW.reserve;
    player.reloadingUntil = 0;
    player.lastFireAt = Date.now() - 200;

    this.broadcast({
      type: 'weapon_switched',
      id: player.id,
      slot: player.slot,
      weaponId: player.weaponId,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo
    });
  }

  changeInMatchPrimary(player, weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    const now = Date.now();

    if (w.category === 'secondary') {
      player.secondary = weaponId;
      const sStats = getEffectiveWeaponStats(weaponId, player.attachments[weaponId], player.operator);
      player.weaponsState[2] = { id: weaponId, ammo: sStats.magSize, reserve: sStats.reserveAmmo, magSize: sStats.magSize };
      if (player.slot === 2) {
        player.weaponId = weaponId;
        player.ammo = sStats.magSize;
        player.reserveAmmo = sStats.reserveAmmo;
      }
      this.sendTo(player.id, {
        type: 'weapon_switched',
        id: player.id,
        slot: player.slot,
        weaponId: player.weaponId,
        ammo: player.ammo,
        reserveAmmo: player.reserveAmmo,
        notice: `Đã đổi súng phụ sang ${w.name}!`
      });
      return;
    }

    if (w.category !== 'primary') return;
    if (this.mode === 'practice' || (!player.dead && now - player.spawnedAt < 10000)) {
      player.primary = weaponId;
      const pStats = getEffectiveWeaponStats(weaponId, player.attachments[weaponId], player.operator);
      player.weaponsState[1] = {
        id: weaponId,
        ammo: pStats.magSize,
        reserve: pStats.reserveAmmo,
        magSize: pStats.magSize
      };
      player.slot = 1;
      player.weaponId = weaponId;
      player.ammo = pStats.magSize;
      player.reserveAmmo = pStats.reserveAmmo;
      player.reloadingUntil = 0;

      this.broadcast({
        type: 'weapon_switched',
        id: player.id,
        slot: 1,
        weaponId: player.weaponId,
        ammo: player.ammo,
        reserveAmmo: player.reserveAmmo,
        notice: `Đã trang bị ngay ${w.name}!`
      });
    } else {
      player.pendingPrimary = weaponId;
      this.sendTo(player.id, {
        type: 'system_toast',
        text: `Sẽ trang bị ${w.name} ở lần hồi sinh tiếp theo!`
      });
    }
  }

  startReload(player, now = Date.now()) {
    if (player.dead || player.reloadingUntil) return;
    const stats = this.getPlayerWeaponStats(player);
    if (stats.isMelee || player.ammo >= stats.magSize || player.reserveAmmo <= 0) return;

    const durationMs = Math.round(stats.reloadTimeSec * 1000);
    player.reloadingUntil = now + durationMs;
    this.broadcast({
      type: 'player_reload',
      id: player.id,
      weaponId: player.weaponId,
      durationMs
    });
  }

  finishReload(player) {
    const stats = this.getPlayerWeaponStats(player);
    const needed = stats.magSize - player.ammo;
    if (needed > 0 && player.reserveAmmo > 0) {
      const add = Math.min(needed, player.reserveAmmo);
      player.ammo += add;
      if (this.mode !== 'practice') player.reserveAmmo -= add;
      if (player.weaponsState[player.slot]) {
        player.weaponsState[player.slot].ammo = player.ammo;
        player.weaponsState[player.slot].reserve = player.reserveAmmo;
      }
    }
    player.reloadingUntil = 0;
    this.sendTo(player.id, {
      type: 'ammo_sync',
      slot: player.slot,
      weaponId: player.weaponId,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo
    });
  }

  handleClientInput(playerId, rawInput) {
    const p = this.combatants.get(playerId);
    if (!p || p.isBot) return;
    const clean = this.antiCheat.sanitizeInput(rawInput);
    p.input = clean;
    p.yaw = clean.yaw;
    p.pitch = clean.pitch;
    p.ads = clean.ads;
    p.crouching = clean.crouch;
    p.sprinting = clean.sprint && clean.forward > 0 && !clean.crouch && !clean.ads;

    if (
      !p.dead &&
      Number.isFinite(rawInput.x) &&
      Number.isFinite(rawInput.y) &&
      Number.isFinite(rawInput.z)
    ) {
      const now = Date.now();
      const dtSec = Math.max(0.02, Math.min(0.35, (now - (p.lastClientPosAt || now - 35)) / 1000));
      const drift = Math.hypot(rawInput.x - p.x, rawInput.z - p.z);
      // Accept client position if within generous anti-speedhack envelope (< 8.5m)
      if (drift < 8.5 && rawInput.y >= -0.05 && rawInput.y <= 9.5) {
        const estVx = Number.isFinite(Number(rawInput.vx))
          ? Math.max(-12, Math.min(12, Number(rawInput.vx)))
          : Math.max(-12, Math.min(12, (rawInput.x - p.x) / dtSec));
        const estVz = Number.isFinite(Number(rawInput.vz))
          ? Math.max(-12, Math.min(12, Number(rawInput.vz)))
          : Math.max(-12, Math.min(12, (rawInput.z - p.z) / dtSec));
        const estVy = Number.isFinite(Number(rawInput.vy))
          ? Math.max(-18, Math.min(18, Number(rawInput.vy)))
          : 0;
        p.vx = estVx;
        p.vy = estVy;
        p.vz = estVz;
        p.x = rawInput.x;
        p.y = Math.max(0, rawInput.y);
        p.z = rawInput.z;
        p.onGround = rawInput.onGround !== undefined ? Boolean(rawInput.onGround) : p.onGround;
        const h = p.crouching ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;
        depenetratePlayerXZ(p, h, PHYSICS.PLAYER_RADIUS, this.map);
        p.lastClientPosAt = now;
      }
    }
  }

  handleClientFire(playerId, payload = {}) {
    if (this.status !== 'playing' || this.roundPhase !== 'live') return;
    const shooter = this.combatants.get(playerId);
    if (!shooter || shooter.dead) return;

    const now = Date.now();
    const wStats = this.getPlayerWeaponStats(shooter);
    const check = this.antiCheat.validateShot(shooter, wStats, payload.origin, this.map, now);
    if (!check.valid) return;

    const yaw = Number.isFinite(Number(payload.yaw)) ? Number(payload.yaw) : shooter.yaw;
    const pitch = Math.max(-1.53, Math.min(1.53, Number.isFinite(Number(payload.pitch)) ? Number(payload.pitch) : shooter.pitch));
    const heavyMelee = Boolean(payload.heavy) && wStats.isMelee;

    this.executeWeaponFire(shooter, wStats, check.origin, yaw, pitch, now, heavyMelee, payload.spreadApplied ? 0 : null);
  }

  botFireWeapon(bot, yaw, pitch, now) {
    if (this.status !== 'playing' || this.roundPhase !== 'live') return;
    const wStats = this.getPlayerWeaponStats(bot);
    const check = this.antiCheat.validateShot(bot, wStats, null, this.map, now);
    if (!check.valid) return;
    this.executeWeaponFire(bot, wStats, check.origin, yaw, pitch, now, false, 0);
  }

  executeWeaponFire(shooter, wStats, origin, yaw, pitch, now, heavyMelee = false, customSpread = null) {
    shooter.lastFireAt = now;
    shooter.spawnProtectedUntil = 0;

    if (!wStats.isMelee) {
      shooter.ammo = Math.max(0, shooter.ammo - 1);
      if (shooter.weaponsState[shooter.slot]) {
        shooter.weaponsState[shooter.slot].ammo = shooter.ammo;
      }
    }

    const pellets = wStats.pellets || 1;
    const hitPoints = [];
    const aggregatedHits = new Map(); // targetId -> { target, totalRawMultiplier, headHit, minDist }

    for (let pIdx = 0; pIdx < pellets; pIdx++) {
      let dir = directionFromAngles(yaw, pitch);
      if (!wStats.isMelee) {
        let spread = 0;
        if (pellets > 1) {
          spread = wStats.pelletSpread || 0.055;
        } else if (customSpread === null) {
          const horizSpeed = Math.hypot(shooter.vx, shooter.vz);
          spread = shooter.ads ? wStats.spreadAds : wStats.spreadStand;
          if (!shooter.onGround) spread += wStats.spreadJump;
          else if (horizSpeed > 1.2) spread += wStats.spreadMove * Math.min(1, horizSpeed / 6.5);
          if (shooter.crouching) spread *= 0.68;
        }

        if (spread > 0) {
          dir = {
            x: dir.x + (Math.random() - 0.5) * spread * 2,
            y: dir.y + (Math.random() - 0.5) * spread * 2,
            z: dir.z + (Math.random() - 0.5) * spread * 2
          };
          const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
          dir.x /= len; dir.y /= len; dir.z /= len;
        }
      }

      const hit = raycastShot(
        origin,
        dir,
        wStats.range,
        this.map,
        this.combatants.values(),
        shooter.id,
        shooter.team,
        this.modeConfig.teamBased
      );

      hitPoints.push({ point: hit.point, type: hit.type });

      if (hit.type === 'player' && hit.target) {
        let entry = aggregatedHits.get(hit.target.id);
        if (!entry) {
          entry = { target: hit.target, count: 0, headHit: false, dist: hit.dist, zone: hit.hitZone };
          aggregatedHits.set(hit.target.id, entry);
        }
        entry.count += 1;
        if (hit.hitZone === 'head') {
          entry.headHit = true;
          entry.zone = 'head';
        }
      }
    }

    this.broadcast({
      type: 'shot_fired',
      shooterId: shooter.id,
      weaponId: shooter.weaponId,
      suppressed: wStats.suppressed,
      origin,
      hitPoint: hitPoints[0]?.point,
      hitType: hitPoints[0]?.type,
      extraHits: pellets > 1 ? hitPoints.slice(1) : undefined,
      ammo: shooter.ammo,
      reserveAmmo: shooter.reserveAmmo
    });

    for (const entry of aggregatedHits.values()) {
      this.applyWeaponDamage(shooter, entry.target, wStats, entry.zone, entry.dist, now, heavyMelee, entry.count);
    }

    if (!wStats.isMelee && shooter.ammo === 0 && shooter.reserveAmmo > 0) {
      setTimeout(() => {
        if (this.status === 'playing' && !shooter.dead && shooter.ammo === 0) {
          this.startReload(shooter, Date.now());
        }
      }, Math.min(350, wStats.fireIntervalMs));
    }
  }

  handleThrowGrenade(playerId, payload = {}) {
    if (this.status !== 'playing' || this.roundPhase !== 'live') return;
    const p = this.combatants.get(playerId);
    if (!p || p.dead || p.grenades <= 0) return;
    const now = Date.now();
    if (now - (p.lastGrenadeAt || 0) < 900) return;

    p.grenades -= 1;
    p.lastGrenadeAt = now;
    p.spawnProtectedUntil = 0;

    const yaw = Number.isFinite(Number(payload.yaw)) ? Number(payload.yaw) : p.yaw;
    const pitch = Math.max(-1.3, Math.min(1.3, Number.isFinite(Number(payload.pitch)) ? Number(payload.pitch) : p.pitch));
    const dir = directionFromAngles(yaw, pitch);
    const eyeH = p.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND;

    const gren = {
      id: 'gr_' + randHex(5),
      ownerId: p.id,
      ownerName: p.name,
      ownerTeam: p.team,
      x: p.x + dir.x * 0.45,
      y: p.y + eyeH - 0.1,
      z: p.z + dir.z * 0.45,
      vx: dir.x * GRENADE_CONFIG.throwSpeed + p.vx * 0.35,
      vy: dir.y * GRENADE_CONFIG.throwSpeed + GRENADE_CONFIG.upwardBoost,
      vz: dir.z * GRENADE_CONFIG.throwSpeed + p.vz * 0.35,
      explodeAt: now + GRENADE_CONFIG.fuseMs
    };
    this.grenades.push(gren);

    this.broadcast({
      type: 'grenade_thrown',
      id: gren.id,
      ownerId: p.id,
      x: gren.x, y: gren.y, z: gren.z,
      vx: gren.vx, vy: gren.vy, vz: gren.vz,
      grenadesLeft: p.grenades
    });
  }

  tickGrenades(dt, now) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vy -= GRENADE_CONFIG.gravity * dt;

      const stepDist = Math.hypot(g.vx * dt, g.vy * dt, g.vz * dt);
      if (stepDist > 0.001) {
        const dir = { x: (g.vx * dt) / stepDist, y: (g.vy * dt) / stepDist, z: (g.vz * dt) / stepDist };
        const hit = raycastMap({ x: g.x, y: g.y, z: g.z }, dir, stepDist + 0.12, this.map);
        if (hit) {
          if (hit.normal.x !== 0) g.vx = -g.vx * GRENADE_CONFIG.bounceRestitution;
          if (hit.normal.y !== 0) {
            g.vy = -g.vy * GRENADE_CONFIG.bounceRestitution;
            g.vx *= 0.78;
            g.vz *= 0.78;
          }
          if (hit.normal.z !== 0) g.vz = -g.vz * GRENADE_CONFIG.bounceRestitution;
        }
      }

      g.x += g.vx * dt;
      g.y = Math.max(0.08, g.y + g.vy * dt);
      g.z += g.vz * dt;
      if (g.y <= 0.09 && Math.abs(g.vy) < 1.2) g.vy = 0;

      if (now >= g.explodeAt) {
        this.detonateGrenade(g, now);
        this.grenades.splice(i, 1);
      }
    }
  }

  detonateGrenade(g, now) {
    this.broadcast({
      type: 'grenade_exploded',
      id: g.id,
      x: g.x, y: g.y, z: g.z
    });

    const attacker = this.combatants.get(g.ownerId) || { id: g.ownerId, name: g.ownerName, team: g.ownerTeam };
    const blastOrigin = { x: g.x, y: g.y + 0.35, z: g.z };

    for (const victim of this.getLivingCombatants()) {
      if (this.modeConfig.teamBased && victim.team === g.ownerTeam && victim.id !== g.ownerId) continue;
      const d = Math.hypot(victim.x - g.x, victim.y + 0.9 - g.y, victim.z - g.z);
      if (d > GRENADE_CONFIG.blastRadius) continue;

      const targetChest = { x: victim.x, y: victim.y + 1.0, z: victim.z };
      const los = hasLineOfSight(blastOrigin, targetChest, this.map);
      if (!los && d > 2.8) continue;

      const dmg = Math.round(GRENADE_CONFIG.maxDamage * (1 - d / GRENADE_CONFIG.blastRadius) * (los ? 1.0 : 0.45));
      if (dmg <= 2) continue;

      victim.lastDamagedAt = now;
      victim.hp = Math.max(0, victim.hp - dmg);
      if (attacker.id && attacker.id !== victim.id) {
        this.sendTo(attacker.id, {
          type: 'hit_confirm',
          targetId: victim.id,
          damage: dmg,
          hitZone: 'body',
          killed: victim.hp <= 0
        });
      }
      this.sendTo(victim.id, {
        type: 'damage_taken',
        fromX: g.x,
        fromZ: g.z,
        damage: dmg,
        hp: victim.hp,
        armor: victim.armor
      });

      if (victim.hp <= 0) {
        this.handleKill(this.combatants.get(g.ownerId) || attacker, victim, 'grenade', false, now);
      }
    }
  }

  handleRadioCommand(playerId, radioKey) {
    const sender = this.combatants.get(playerId);
    if (!sender) return;
    const cmd = RADIO_COMMANDS.find((r) => r.key === String(radioKey));
    if (!cmd) return;

    this.addChatMessage(playerId, cmd.text, this.modeConfig.teamBased ? 'team' : 'all', true);
  }

  applyWeaponDamage(attacker, victim, wStats, hitZone, dist, now, heavyMelee = false, pelletCount = 1) {
    if (victim.dead) return;
    if (victim.spawnProtectedUntil && now < victim.spawnProtectedUntil) {
      this.sendTo(attacker.id, {
        type: 'hit_confirm',
        targetId: victim.id,
        damage: 0,
        hitZone: 'shield',
        killed: false
      });
      return;
    }

    let rawDmg = (heavyMelee && wStats.heavyDamage ? wStats.heavyDamage : wStats.damage) * pelletCount;
    if (dist > wStats.falloffStart && wStats.range > wStats.falloffStart) {
      const t = Math.min(1, (dist - wStats.falloffStart) / (wStats.range - wStats.falloffStart));
      rawDmg *= 1 - t * (1 - (wStats.minDamageMult || 0.75));
    }

    // Bots do not get instant-kill headshot multipliers against human players, and deal heavily reduced damage
    const isBotVsHuman = Boolean(attacker?.isBot && !victim.isBot);
    if (hitZone === 'head') {
      rawDmg *= isBotVsHuman ? 1.05 : (wStats.headMult || 3.0);
    } else if (hitZone === 'legs') {
      rawDmg *= wStats.legMult || 0.78;
    }

    if (attacker?.isBot) {
      if (!victim.isBot) {
        const botDmgScale = this.botDifficulty === 'easy' ? 0.22 : (this.botDifficulty === 'hard' ? 0.42 : 0.30);
        rawDmg = Math.min(24, rawDmg * botDmgScale);
      } else {
        rawDmg *= 0.65;
      }
    }

    if (attacker.damageBoostUntil && now < attacker.damageBoostUntil) rawDmg *= 1.18;

    const absorbRatio = hitZone === 'head' ? PHYSICS.ARMOR_ABSORB_HEAD : PHYSICS.ARMOR_ABSORB_BODY;
    let hpDamage = rawDmg;
    if (victim.armor > 0) {
      const armorDamage = Math.min(victim.armor, Math.round(rawDmg * absorbRatio));
      hpDamage = rawDmg - armorDamage * 0.85;
      victim.armor = Math.max(0, victim.armor - armorDamage);
    }

    const finalDmg = Math.max(1, Math.round(hpDamage));
    victim.lastDamagedAt = now;
    victim.hp = Math.max(0, victim.hp - finalDmg);
    victim.damageTakenBy.set(attacker.id, (victim.damageTakenBy.get(attacker.id) || 0) + finalDmg);

    const killed = victim.hp <= 0;

    this.sendTo(attacker.id, {
      type: 'hit_confirm',
      targetId: victim.id,
      damage: finalDmg,
      hitZone,
      killed
    });

    this.sendTo(victim.id, {
      type: 'damage_taken',
      fromX: attacker.x,
      fromZ: attacker.z,
      damage: finalDmg,
      hp: victim.hp,
      armor: victim.armor
    });

    if (killed) {
      this.handleKill(attacker, victim, wStats.id, hitZone === 'head', now);
    }
  }

  handleKill(attacker, victim, weaponId, isHeadshot, now) {
    victim.dead = true;
    victim.hp = 0;
    victim.deaths += 1;
    victim.currentStreak = 0;
    victim.reloadingUntil = 0;

    if (victim.hasBomb && this.mode === 'bomb' && !this.bombState.planted) {
      this.dropBombFromPlayer(victim);
    }

    let streak = 0;
    let isFirstBlood = false;

    if (attacker && attacker.id && attacker.id !== victim.id && this.combatants.has(attacker.id)) {
      const realAttacker = this.combatants.get(attacker.id);
      realAttacker.kills += 1;
      realAttacker.currentStreak = (realAttacker.currentStreak || 0) + 1;
      streak = realAttacker.currentStreak;
      if (!this.firstBloodAwarded) {
        this.firstBloodAwarded = true;
        isFirstBlood = true;
        realAttacker.score += 50;
      }
      if (isHeadshot) realAttacker.headshots += 1;
      realAttacker.score += 100 + (isHeadshot ? 25 : 0) + (streak >= 2 ? streak * 15 : 0);

      for (const [helperId, dmg] of victim.damageTakenBy.entries()) {
        if (helperId !== realAttacker.id && dmg >= 25) {
          const helper = this.combatants.get(helperId);
          if (helper) {
            helper.assists += 1;
            helper.score += 35;
          }
        }
      }

      if (this.mode === 'tdm' || this.mode === 'ranked') {
        if (realAttacker.team === 'alpha') this.alphaScore += 1;
        else if (realAttacker.team === 'bravo') this.bravoScore += 1;
      }
    }

    const respawnSec = this.modeConfig.respawnDelaySec || 0;
    if (respawnSec > 0) {
      victim.respawnAt = now + respawnSec * 1000;
    }

    this.broadcast({
      type: 'kill_event',
      killerId: attacker?.id || null,
      killerName: attacker?.name || 'Môi Trường',
      killerTeam: attacker?.team || '',
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      weaponId,
      headshot: isHeadshot,
      streak,
      firstBlood: isFirstBlood,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore,
      respawnSec
    });

    this.checkMatchOrRoundWinConditions(now);
  }

  startMatchLoop() {
    this.stopMatchLoop();
    this.lastTickAt = Date.now();
    this.tickInterval = setInterval(() => this.tick(), SERVER_TICK_MS);
  }

  stopMatchLoop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  tick() {
    if (this.status !== 'playing') return;
    const now = Date.now();
    const dt = Math.min(0.06, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    // Passive HP Regen (Phoenix Operator) every 1s
    const doRegen = now - this.lastRegenTickAt >= 1000;
    if (doRegen) this.lastRegenTickAt = now;

    for (const p of this.combatants.values()) {
      if (p.dead) {
        if (p.respawnAt && now >= p.respawnAt && this.roundPhase === 'live') {
          this.spawnPlayer(p, now);
        }
        continue;
      }

      if (p.reloadingUntil && now >= p.reloadingUntil) {
        this.finishReload(p);
      }

      const op = OPERATORS[p.operator] || OPERATORS.vanguard;
      if (doRegen && op.regenPerSec > 0 && p.hp < p.maxHp && now - (p.lastDamagedAt || 0) >= 4200) {
        p.hp = Math.min(p.maxHp, p.hp + op.regenPerSec);
      }

      if (p.isBot && this.roundPhase === 'live') {
        updateBotAI(p, this, dt, now);
      }

      // Only step physics on server for AI Bots or human players without recent client-predicted position packets
      if (p.isBot || now - (p.lastClientPosAt || 0) > 450) {
        const wStats = this.getPlayerWeaponStats(p);
        stepPlayerPhysics(p, p.input, this.map, dt, wStats.moveSpeedMult, op.speedMult);
      }
      p.yaw = p.input.yaw;
      p.pitch = p.input.pitch;
      p.sprinting = Boolean(p.input.sprint && p.input.forward > 0 && !p.crouching && !p.input.ads);
      p.ads = Boolean(p.input.ads);
    }

    if (this.grenades.length > 0) {
      this.tickGrenades(dt, now);
    }

    if (this.mode === 'bomb') {
      this.tickBombMode(dt, now);
    } else if (this.mode === 'survival') {
      this.tickSurvivalMode(dt, now);
    }

    if (now >= this.matchEndsAt && this.mode !== 'bomb') {
      this.endMatch('time_up');
      return;
    }

    this.broadcastSnapshot(now);
  }

  tickBombMode(dt, now) {
    if (this.roundPhase === 'round_end') {
      if (now >= this.roundEndAt) this.startNextBombRound(now);
      return;
    }

    if (this.bombState.dropped && !this.bombState.planted) {
      for (const p of this.getLivingCombatants()) {
        if (p.team === 'bravo' && Math.hypot(p.x - this.bombState.dropX, p.z - this.bombState.dropZ) < 1.85) {
          this.bombState.dropped = false;
          p.hasBomb = true;
          this.broadcast({ type: 'bomb_carrier', carrierId: p.id, carrierName: p.name });
          break;
        }
      }
    }

    if (!this.bombState.planted) {
      let activePlanter = null;
      let targetSite = null;
      for (const p of this.getLivingCombatants()) {
        if (p.team === 'bravo' && p.hasBomb && p.input.interact) {
          for (const site of this.map.bombSites) {
            if (Math.hypot(p.x - site.x, p.z - site.z) <= site.radius) {
              activePlanter = p;
              targetSite = site;
              break;
            }
          }
        }
      }

      if (activePlanter && targetSite) {
        if (this.bombState.planterId !== activePlanter.id) {
          this.bombState.planterId = activePlanter.id;
          this.bombState.plantProgress = 0;
        }
        this.bombState.plantProgress += dt / this.modeConfig.plantTimeSec;
        if (this.bombState.plantProgress >= 1) {
          activePlanter.hasBomb = false;
          activePlanter.score += 150;
          this.bombState.planted = true;
          this.bombState.siteId = targetSite.id;
          this.bombState.x = activePlanter.x;
          this.bombState.y = activePlanter.y;
          this.bombState.z = activePlanter.z;
          this.bombState.explodeAt = now + this.modeConfig.bombTimerSec * 1000;
          this.bombState.plantProgress = 0;
          this.bombState.planterId = null;

          this.broadcast({
            type: 'bomb_planted',
            siteId: targetSite.id,
            planterName: activePlanter.name,
            x: this.bombState.x,
            y: this.bombState.y,
            z: this.bombState.z,
            explodeAt: this.bombState.explodeAt
          });
        }
      } else {
        this.bombState.planterId = null;
        this.bombState.plantProgress = 0;
      }

      if (now >= this.roundEndsAt) {
        this.finishBombRound('alpha', 'Hết giờ! Đội Alpha bảo vệ mục tiêu thành công!', now);
      }
    } else {
      let activeDefuser = null;
      for (const p of this.getLivingCombatants()) {
        if (p.team === 'alpha' && p.input.interact) {
          if (Math.hypot(p.x - this.bombState.x, p.z - this.bombState.z) <= 2.5) {
            activeDefuser = p;
            break;
          }
        }
      }

      if (activeDefuser) {
        if (this.bombState.defuserId !== activeDefuser.id) {
          this.bombState.defuserId = activeDefuser.id;
          this.bombState.defuseProgress = 0;
        }
        this.bombState.defuseProgress += dt / this.modeConfig.defuseTimeSec;
        if (this.bombState.defuseProgress >= 1) {
          activeDefuser.score += 200;
          this.broadcast({ type: 'bomb_defused', defuserName: activeDefuser.name });
          this.finishBombRound('alpha', `${activeDefuser.name} đã gỡ bom C4 thành công!`, now);
          return;
        }
      } else {
        this.bombState.defuserId = null;
        this.bombState.defuseProgress = 0;
      }

      if (now >= this.bombState.explodeAt) {
        for (const p of this.getLivingCombatants()) {
          const d = Math.hypot(p.x - this.bombState.x, p.z - this.bombState.z);
          if (d < 18) {
            p.hp = Math.max(0, p.hp - Math.round((1 - d / 18) * 180));
            if (p.hp <= 0) { p.dead = true; p.deaths += 1; }
          }
        }
        this.broadcast({ type: 'bomb_exploded', x: this.bombState.x, y: this.bombState.y, z: this.bombState.z });
        this.finishBombRound('bravo', 'BOM C4 PHÁT NỔ! Đội Bravo thắng hiệp đấu!', now);
      }
    }
  }

  finishBombRound(winnerTeam, reasonText, now) {
    if (this.roundPhase === 'round_end') return;
    this.roundPhase = 'round_end';
    if (winnerTeam === 'alpha') this.alphaScore += 1;
    else this.bravoScore += 1;

    this.broadcast({
      type: 'round_ended',
      winnerTeam,
      reasonText,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore,
      roundNumber: this.roundNumber
    });

    if (this.alphaScore >= this.modeConfig.scoreLimit || this.bravoScore >= this.modeConfig.scoreLimit) {
      setTimeout(() => { if (this.status === 'playing') this.endMatch('score_limit'); }, 3200);
    } else {
      this.roundEndAt = now + 4200;
    }
  }

  startNextBombRound(now) {
    this.roundNumber += 1;
    this.roundPhase = 'live';
    this.roundEndsAt = now + this.modeConfig.roundDurationSec * 1000;
    this.bombState = this.createInitialBombState();
    this.grenades = [];

    for (const p of this.combatants.values()) {
      p.hasBomb = false;
      this.spawnPlayer(p, now);
    }
    this.assignBombCarrier();

    this.broadcast({
      type: 'round_started',
      roundNumber: this.roundNumber,
      roundEndsAt: this.roundEndsAt,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore
    });
  }

  tickSurvivalMode(dt, now) {
    if (!this.storm) return;
    if (this.storm.radius > this.storm.minRadius) {
      this.storm.radius = Math.max(this.storm.minRadius, this.storm.radius - this.storm.shrinkSpeed * dt);
    }

    for (const crate of this.lootCrates) {
      if (!crate.active) continue;
      for (const p of this.getLivingCombatants()) {
        if (Math.hypot(p.x - crate.x, p.z - crate.z) < 1.65 && Math.abs(p.y - crate.y) < 1.8) {
          crate.active = false;
          if (crate.type === 'medkit') p.hp = Math.min(p.maxHp, p.hp + 50);
          else if (crate.type === 'armor') p.armor = Math.min(p.maxArmor, p.armor + 60);
          else if (crate.type === 'overcharge') {
            p.damageBoostUntil = now + 18000;
            const st = this.getPlayerWeaponStats(p);
            p.ammo = st.magSize;
            p.reserveAmmo += st.magSize;
          }
          this.broadcast({
            type: 'loot_picked',
            crateId: crate.id,
            playerId: p.id,
            lootType: crate.type,
            hp: p.hp,
            armor: p.armor,
            ammo: p.ammo,
            reserveAmmo: p.reserveAmmo
          });
          break;
        }
      }
    }

    if (now - this.lastStormDamageAt >= 1000) {
      this.lastStormDamageAt = now;
      for (const p of this.getLivingCombatants()) {
        if (Math.hypot(p.x - this.storm.x, p.z - this.storm.z) > this.storm.radius) {
          p.hp = Math.max(0, p.hp - 7);
          this.sendTo(p.id, {
            type: 'damage_taken',
            fromX: p.x, fromZ: p.z,
            damage: 7, hp: p.hp, armor: p.armor, isStorm: true
          });
          if (p.hp <= 0) this.handleKill({ id: null, name: 'Vòng Bo Độc', team: '' }, p, 'storm', false, now);
        }
      }
    }
  }

  checkMatchOrRoundWinConditions(now) {
    if (this.status !== 'playing') return;
    if (this.mode === 'tdm' || this.mode === 'ranked') {
      if (this.alphaScore >= this.modeConfig.scoreLimit || this.bravoScore >= this.modeConfig.scoreLimit) {
        this.endMatch('score_limit');
      }
    } else if (this.mode === 'ffa' || this.mode === 'practice') {
      for (const p of this.combatants.values()) {
        if (p.kills >= this.modeConfig.scoreLimit) {
          this.endMatch('score_limit');
          break;
        }
      }
    } else if (this.mode === 'bomb' && this.roundPhase === 'live') {
      const alphaAlive = [...this.combatants.values()].filter((p) => p.team === 'alpha' && !p.dead).length;
      const bravoAlive = [...this.combatants.values()].filter((p) => p.team === 'bravo' && !p.dead).length;
      if (alphaAlive === 0 && bravoAlive > 0) {
        this.finishBombRound('bravo', 'Đội Alpha đã bị quét sạch!', now);
      } else if (bravoAlive === 0 && !this.bombState.planted) {
        this.finishBombRound('alpha', 'Đội Bravo đã bị tiêu diệt trước khi đặt bom!', now);
      }
    } else if (this.mode === 'survival') {
      const alive = this.getLivingCombatants();
      if (alive.length <= 1 && this.combatants.size >= 2) {
        if (alive[0]) alive[0].score += 300;
        this.endMatch('last_survivor');
      }
    }
  }

  async endMatch(reason = 'completed') {
    if (this.status !== 'playing') return;
    this.status = 'waiting';
    this.stopMatchLoop();

    let winnerTeam = null;
    let winnerPlayerId = null;
    if (this.modeConfig.teamBased) {
      winnerTeam = this.alphaScore > this.bravoScore ? 'alpha' : (this.bravoScore > this.alphaScore ? 'bravo' : 'draw');
    } else if (this.mode === 'survival') {
      const alive = this.getLivingCombatants();
      const top = alive[0] || [...this.combatants.values()].sort((a, b) => b.kills - a.kills)[0];
      winnerPlayerId = top?.id || null;
    } else {
      const top = [...this.combatants.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
      winnerPlayerId = top?.id || null;
    }

    const scoreboard = [...this.combatants.values()]
      .sort((a, b) => b.score - a.score || b.kills - a.kills)
      .map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
        isBot: p.isBot,
        team: p.team,
        operator: p.operator,
        outfit: p.outfit,
        primary: p.primary,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        headshots: p.headshots,
        score: p.score,
        rank: p.rank
      }));

    const mvp = scoreboard[0] || null;
    let rewardsByPlayer = {};

    if (this.onMatchEndedFn) {
      rewardsByPlayer = (await this.onMatchEndedFn({
        mode: this.mode,
        mapName: this.map.name,
        isRanked: Boolean(this.modeConfig.isRanked),
        isPractice: Boolean(this.modeConfig.isPractice),
        winnerTeam,
        winnerPlayerId,
        humans: this.getHumanPlayers()
      })) || {};
    }

    for (const b of this.getBots()) {
      this.combatants.delete(b.id);
    }

    this.broadcast({
      type: 'match_ended',
      reason,
      mode: this.mode,
      mapName: this.map.name,
      winnerTeam,
      winnerPlayerId,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore,
      mvp,
      scoreboard,
      rewardsByPlayer,
      room: this.getLobbyPayload()
    });

    this.onListChangedFn();
  }

  broadcastSnapshot(now) {
    const players = [];
    for (const p of this.combatants.values()) {
      players.push({
        id: p.id,
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
        z: Number(p.z.toFixed(3)),
        vx: Number((p.vx || 0).toFixed(2)),
        vy: Number((p.vy || 0).toFixed(2)),
        vz: Number((p.vz || 0).toFixed(2)),
        yaw: Number(p.yaw.toFixed(3)),
        pitch: Number(p.pitch.toFixed(3)),
        crouch: p.crouching ? 1 : 0,
        sprint: p.sprinting ? 1 : 0,
        ads: p.ads ? 1 : 0,
        ground: p.onGround ? 1 : 0,
        dead: p.dead ? 1 : 0,
        hp: p.hp,
        armor: p.armor,
        w: p.weaponId,
        slot: p.slot,
        hasBomb: p.hasBomb ? 1 : 0,
        shield: p.spawnProtectedUntil > now ? 1 : 0,
        k: p.kills,
        d: p.deaths,
        a: p.assists,
        sc: p.score
      });
    }

    const timeLeftSec = Math.max(
      0,
      Math.ceil(((this.mode === 'bomb' ? this.roundEndsAt : this.matchEndsAt) - now) / 1000)
    );

    const payload = {
      type: 'world_state',
      t: now,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore,
      roundNumber: this.roundNumber,
      timeLeftSec,
      players
    };

    if (this.grenades.length > 0) {
      payload.grenades = this.grenades.map((g) => ({
        id: g.id,
        x: Number(g.x.toFixed(2)),
        y: Number(g.y.toFixed(2)),
        z: Number(g.z.toFixed(2))
      }));
    }

    if (this.mode === 'bomb') {
      payload.bomb = {
        planted: this.bombState.planted,
        siteId: this.bombState.siteId,
        x: this.bombState.x,
        y: this.bombState.y,
        z: this.bombState.z,
        bombLeftSec: this.bombState.planted ? Math.max(0, Number(((this.bombState.explodeAt - now) / 1000).toFixed(1))) : 0,
        plantProg: Number(this.bombState.plantProgress.toFixed(2)),
        planterId: this.bombState.planterId,
        defuseProg: Number(this.bombState.defuseProgress.toFixed(2)),
        defuserId: this.bombState.defuserId,
        dropped: this.bombState.dropped,
        dropX: this.bombState.dropX,
        dropZ: this.bombState.dropZ
      };
    } else if (this.mode === 'survival' && this.storm) {
      payload.storm = {
        x: Number(this.storm.x.toFixed(1)),
        z: Number(this.storm.z.toFixed(1)),
        r: Number(this.storm.radius.toFixed(2))
      };
    }

    this.broadcast(payload);
  }

  getLobbyPayload() {
    return {
      id: this.id,
      code: this.code,
      peerHostId: this.peerHostId,
      name: this.name,
      hostId: this.hostId,
      status: this.status,
      mode: this.mode,
      modeConfig: this.modeConfig,
      mapId: this.mapId,
      mapName: this.map.name,
      maxPlayers: this.maxPlayers,
      fillBots: this.fillBots,
      botDifficulty: this.botDifficulty,
      players: [...this.combatants.values()].map((p) => ({
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        team: p.team,
        operator: p.operator,
        outfit: p.outfit,
        primary: p.primary,
        secondary: p.secondary,
        melee: p.melee || 'knife',
        skins: p.skins,
        attachments: p.attachments,
        rank: p.rank,
        rp: p.rp,
        ping: p.ping,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        hp: p.hp,
        armor: p.armor,
        maxArmor: p.maxArmor,
        slot: p.slot,
        weaponId: p.weaponId,
        ammo: p.ammo,
        reserveAmmo: p.reserveAmmo,
        grenades: p.grenades
      })),
      chat: this.chatLog.slice(-25)
    };
  }

  broadcastRoomLobby() {
    this.broadcast({ type: 'room_lobby', room: this.getLobbyPayload() });
  }

  addChatMessage(playerId, text, scope = 'all', isRadio = false) {
    const sender = this.combatants.get(playerId);
    if (!sender) return;
    const clean = String(text || '').trim().slice(0, 140);
    if (!clean) return;

    const msg = {
      id: randHex(6),
      senderId: sender.id,
      senderName: sender.name,
      team: sender.team,
      scope: scope === 'team' ? 'team' : 'all',
      isRadio,
      text: clean,
      at: Date.now()
    };
    this.chatLog.push(msg);
    if (this.chatLog.length > 50) this.chatLog.shift();

    for (const p of this.getHumanPlayers()) {
      if (msg.scope === 'team' && this.modeConfig.teamBased && p.team !== sender.team) continue;
      this.sendTo(p.id, { type: 'chat_msg', msg });
    }
  }

  addSystemChat(text) {
    const msg = {
      id: randHex(6),
      senderId: 'system',
      senderName: 'HỆ THỐNG',
      team: 'system',
      scope: 'all',
      text,
      at: Date.now()
    };
    this.chatLog.push(msg);
    if (this.chatLog.length > 50) this.chatLog.shift();
    this.broadcast({ type: 'chat_msg', msg });
  }

  sendTo(playerId, data) {
    this.sendToFn(playerId, data);
  }

  broadcast(data) {
    this.broadcastFn(data);
  }
}
