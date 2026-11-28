// Platform-Agnostic 30Hz Multiplayer GameRoom Core (Node.js WebSocket Server & Browser WebRTC P2P Host)
import {
  SERVER_TICK_MS,
  PHYSICS,
  GRENADE_CONFIG,
  GRENADE_TYPES,
  GRENADE_ORDER,
  createDefaultGrenadeBelt,
  GAME_MODES,
  resolveMapForMode,
  resolveEffectiveModeConfig,
  OPERATORS,
  WEAPONS,
  RADIO_COMMANDS,
  BR_BACKPACKS,
  BR_VESTS,
  BR_HELMETS,
  BR_MEDS,
  BR_AMMO_TYPES,
  getWeaponAmmoType,
  computeBackpackWeight,
  getEffectiveWeaponStats,
  getRankByRp
} from '../constants.js';
import { MAPS } from '../maps.js';
import {
  stepPlayerPhysics,
  stepAirbornePhysics,
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
    const eff = resolveEffectiveModeConfig(options.mode || 'tdm', options.rankedSubMode || 'tdm');
    this.selectedMode = eff.selectedMode;
    this.rankedSubMode = eff.rankedSubMode;
    this.isRanked = eff.isRanked;
    this.mode = eff.effectiveMode;
    this.modeConfig = eff.modeConfig;
    const resolvedMapId = resolveMapForMode(this.selectedMode, options.mapId || null, this.rankedSubMode);
    this.mapId = MAPS[resolvedMapId] ? resolvedMapId : 'warehouse';
    this.map = MAPS[this.mapId];
    this.maxPlayers = Math.min(50, Math.max(2, Number(options.maxPlayers) || this.modeConfig.maxPlayers));
    this.fillBots = options.fillBots !== undefined ? Boolean(options.fillBots) : true;
    this.targetBotFillCount = options.targetBotFillCount ?? null; // null = fill up to maxPlayers
    this.botDifficulty = ['easy', 'normal', 'hard'].includes(options.botDifficulty) ? options.botDifficulty : 'normal';
    this.isPersistentDefault = Boolean(options.isPersistentDefault);
    this.isMatchmaking = Boolean(options.isMatchmaking);
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
    this.smokeZones = [];
    this.fireZones = [];
    this.storm = null;
    this.lootCrates = [];
    this.dropPlane = null;
    this.airdropSpawned = false;
    this.lootSeq = 0;
    this.matchStartedAt = 0;
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
    if (this._tickLiving) return this._tickLiving;
    const out = [];
    for (const p of this.combatants.values()) {
      if (!p.dead) out.push(p);
    }
    return out;
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
      selectedMode: this.selectedMode,
      rankedSubMode: this.rankedSubMode,
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
      isRanked: Boolean(this.modeConfig.isRanked),
      isMatchmaking: this.isMatchmaking,
      matchStartedAt: this.matchStartedAt
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
      dropPhase: 'ground',

      hp: PHYSICS.MAX_HP,
      maxHp: PHYSICS.MAX_HP,
      armor: op.maxArmor,
      maxArmor: op.maxArmor,
      gear: {
        vestTier: 0,
        helmetTier: 0,
        helmetArmor: 0,
        helmetMax: 0,
        bagTier: 0
      },
      backpack: {
        tier: 0,
        capacity: BR_BACKPACKS[0].capacity,
        ammo: { '7.62mm': 0, '5.56mm': 0, '9mm': 0, '12G': 0, '.338': 0 },
        meds: { bandage: 0, firstaid: 0, medkit: 0, energy: 0 },
        frag_grenade: 0
      },
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
      lastSeenAt: Date.now(),
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

  evictDuplicateUser(clientInfo) {
    if (!clientInfo) return [];
    const targetUid = clientInfo.userId || null;
    const targetName = String(clientInfo.username || '').trim().toLowerCase();
    const removedIds = [];
    for (const [cid, p] of this.combatants.entries()) {
      if (p.isBot || cid === clientInfo.id) continue;
      const sameUser = targetUid && p.userId && p.userId === targetUid;
      const sameName = targetName && p.name && p.name.trim().toLowerCase() === targetName;
      if (sameUser || sameName) {
        this.combatants.delete(cid);
        this.antiCheat.removePlayer(cid);
        removedIds.push(cid);
      }
    }
    return removedIds;
  }

  touchHuman(playerId) {
    const p = this.combatants.get(playerId);
    if (p && !p.isBot) {
      p.lastSeenAt = Date.now();
    }
  }

  pruneStaleHumans(timeoutMs = 11000) {
    const now = Date.now();
    const staleIds = [];
    for (const [cid, p] of this.combatants.entries()) {
      if (p.isBot || cid === this.hostId) continue;
      const last = p.lastSeenAt || p.spawnedAt || 0;
      if (now - last > timeoutMs) {
        staleIds.push(cid);
      }
    }
    for (const cid of staleIds) {
      this.removeHumanPlayer(cid);
    }
    return staleIds;
  }

  kickPlayer(requesterId, targetId) {
    if (!this.hostId || requesterId !== this.hostId) return false;
    if (!targetId || targetId === this.hostId) return false;
    const target = this.combatants.get(targetId);
    if (!target || target.isBot) return false;
    this.sendTo(targetId, { type: 'error_msg', text: 'Chủ phòng đã mời bạn rời khỏi phòng đấu.' });
    this.sendTo(targetId, { type: 'kicked_from_room' });
    this.removeHumanPlayer(targetId);
    return true;
  }

  addHumanPlayer(clientInfo) {
    this.evictDuplicateUser(clientInfo);
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
      const now = Date.now();
      this.spawnPlayer(player, now, false);
      if (this.mode === 'survival' && !this.dropPlane?.active) {
        const sx = this.storm?.x || 0;
        const sz = this.storm?.z || 0;
        const px = sx + (Math.random() - 0.5) * 40;
        const pz = sz + (Math.random() - 0.5) * 40;
        const groundY = this.map.terrain ? this.map.terrain.floorAt(px, pz) : 0;
        player.dropPhase = 'parachute';
        player.x = px;
        player.z = pz;
        player.y = groundY + (this.map.bounds.halfW > 500 ? 115 : 44);
        player.onGround = false;
      }
      this.sendTo(player.id, this.getMatchStartedPayload());
      this.sendWeaponsSync(player);
      this.sendInventorySync(player);
      this.broadcastPlayerSpawned(player);
      if (!this.tickInterval) {
        this.startMatchLoop();
      }
    }

    this.addSystemChat(`${player.name} đã tham gia phòng đấu (#${this.code}).`);
    this.broadcastRoomLobby();
    this.onListChangedFn();
    return { player };
  }

  replaceBotWithHuman(clientInfo) {
    this.evictDuplicateUser(clientInfo);
    const bots = this.getBots();
    const chosenBot =
      bots.find((b) => !b.dead && b.dropPhase === 'plane') ||
      bots.find((b) => !b.dead && b.dropPhase !== 'ground') ||
      bots.find((b) => !b.dead) ||
      bots[0];

    if (!chosenBot) {
      return this.addHumanPlayer(clientInfo);
    }

    const inheritedTeam = this.modeConfig.teamBased ? chosenBot.team : this.pickTeamForJoiner();
    const inheritedDropPhase = chosenBot.dropPhase || 'ground';
    const inheritedPos = { x: chosenBot.x, y: chosenBot.y, z: chosenBot.z };
    this.combatants.delete(chosenBot.id);

    const player = this.createCombatantObject({
      id: clientInfo.id,
      userId: clientInfo.userId || null,
      name: clientInfo.username || 'Chiến_Binh',
      isBot: false,
      team: inheritedTeam,
      loadout: clientInfo.loadout || {},
      rp: clientInfo.rp || 1200
    });

    this.combatants.set(player.id, player);
    if (!this.hostId || !this.combatants.has(this.hostId)) {
      this.hostId = player.id;
    }

    if (this.status === 'playing') {
      const now = Date.now();
      this.spawnPlayer(player, now, false);
      if (this.mode === 'survival') {
        if (this.dropPlane?.active && inheritedDropPhase === 'plane') {
          player.dropPhase = 'plane';
          player.x = this.dropPlane.x;
          player.y = this.dropPlane.y;
          player.z = this.dropPlane.z;
          player.onGround = false;
        } else {
          const px = (this.storm?.x ?? inheritedPos.x) + (Math.random() - 0.5) * 35;
          const pz = (this.storm?.z ?? inheritedPos.z) + (Math.random() - 0.5) * 35;
          const groundY = this.map.terrain ? this.map.terrain.floorAt(px, pz) : 0;
          player.dropPhase = 'parachute';
          player.x = px;
          player.z = pz;
          player.y = groundY + (this.map.bounds.halfW > 500 ? 115 : 46);
          player.onGround = false;
        }
      }
      this.sendTo(player.id, this.getMatchStartedPayload());
      this.sendWeaponsSync(player);
      this.sendInventorySync(player);
      this.broadcastPlayerSpawned(player);
      if (!this.tickInterval) {
        this.startMatchLoop();
      }
    }

    this.addSystemChat(`${player.name} đã tham gia thay thế ${chosenBot.name}!`);
    this.broadcastRoomLobby();
    this.onListChangedFn();
    return { player, replacedBotId: chosenBot.id, replacedBotName: chosenBot.name };
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

    this._tickLiving = null;
    if (this.status === 'playing') {
      this.checkMatchOrRoundWinConditions(Date.now());
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
    if ((settings.mode && GAME_MODES[settings.mode]) || settings.rankedSubMode) {
      const nextSelected = settings.mode && GAME_MODES[settings.mode] ? settings.mode : this.selectedMode;
      const nextSub = settings.rankedSubMode || this.rankedSubMode || 'tdm';
      const eff = resolveEffectiveModeConfig(nextSelected, nextSub);
      this.selectedMode = eff.selectedMode;
      this.rankedSubMode = eff.rankedSubMode;
      this.isRanked = eff.isRanked;
      this.mode = eff.effectiveMode;
      this.modeConfig = eff.modeConfig;
      if (settings.maxPlayers === undefined) {
        this.maxPlayers = Math.max(this.getHumanPlayers().length, this.modeConfig.maxPlayers);
      }
      let idx = 0;
      for (const p of this.combatants.values()) {
        p.team = this.modeConfig.teamBased ? (idx % 2 === 0 ? 'alpha' : 'bravo') : `ffa_${p.id}`;
        idx++;
      }
    }
    const desiredMap = settings.mapId || this.mapId;
    const validMapId = resolveMapForMode(this.selectedMode, desiredMap, this.rankedSubMode);
    if (MAPS[validMapId]) {
      this.mapId = validMapId;
      this.map = MAPS[this.mapId];
    }
    if (settings.maxPlayers !== undefined) {
      const minAllowed = Math.max(2, this.getHumanPlayers().length);
      this.maxPlayers = Math.min(50, Math.max(minAllowed, Number(settings.maxPlayers) || 10));
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

    const desiredTotal =
      this.targetBotFillCount !== null
        ? Math.min(this.maxPlayers, this.getHumanPlayers().length + Math.max(0, Number(this.targetBotFillCount) || 0))
        : this.maxPlayers;

    while (this.combatants.size > desiredTotal && this.getBots().length > 0) {
      const b = this.getBots().pop();
      this.combatants.delete(b.id);
    }

    let botIndex = this.getBots().length;
    while (this.combatants.size < desiredTotal) {
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
    this.initialCombatantsCount = this.combatants.size;
    this._tickLiving = null;

    const now = Date.now();
    this.status = 'playing';
    this.alphaScore = 0;
    this.bravoScore = 0;
    this.roundNumber = 1;
    this.roundPhase = 'live';
    this.firstBloodAwarded = false;
    this.grenades = [];
    this.smokeZones = [];
    this.fireZones = [];
    this.dropPlane = null;
    this.airdropSpawned = false;
    this.storm = null;
    this.lootCrates = [];
    this.matchStartedAt = now;
    this.matchEndsAt = now + this.modeConfig.matchDurationSec * 1000;
    this.roundEndsAt = this.mode === 'bomb' ? now + this.modeConfig.roundDurationSec * 1000 : this.matchEndsAt;
    this.bombState = this.createInitialBombState();

    if (this.mode === 'survival') {
      this.initSurvivalMode(now);
    }

    for (const p of this.combatants.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.assists = 0;
      p.headshots = 0;
      p.currentStreak = 0;
      p.score = 0;
      p.hasBomb = false;
      p.aiState = null;
      this.spawnPlayer(p, now, false);
    }

    if (this.mode === 'bomb') {
      this.assignBombCarrier();
    }

    this.broadcast(this.getMatchStartedPayload());

    for (const p of this.combatants.values()) {
      this.sendWeaponsSync(p);
      this.sendInventorySync(p);
      this.broadcastPlayerSpawned(p);
    }

    this.onListChangedFn();
    this.startMatchLoop();
  }

  getMatchStartedPayload() {
    return {
      type: 'match_started',
      room: this.getLobbyPayload(),
      mapId: this.mapId,
      mode: this.mode,
      modeConfig: this.modeConfig,
      serverNow: Date.now(),
      matchStartedAt: this.matchStartedAt,
      matchEndsAt: this.matchEndsAt,
      roundEndsAt: this.roundEndsAt,
      roundNumber: this.roundNumber,
      storm: this.storm,
      dropPlane: this.dropPlane,
      lootCrates: this.lootCrates
    };
  }

  resyncPlayerToMatch(playerId) {
    if (this.status !== 'playing') return;
    const p = this.combatants.get(playerId);
    if (!p || p.isBot) return;
    this.sendTo(playerId, this.getMatchStartedPayload());
    this.sendWeaponsSync(p);
    this.sendInventorySync(p);
    this.sendTo(playerId, {
      type: 'player_spawned',
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      hp: p.hp,
      maxHp: p.maxHp,
      armor: p.armor,
      maxArmor: p.maxArmor,
      slot: p.slot,
      weaponId: p.weaponId,
      ammo: p.ammo,
      reserveAmmo: p.reserveAmmo,
      grenades: p.grenades,
      grenadeBelt: p.grenadeBelt,
      dropPhase: p.dropPhase,
      hasBomb: p.hasBomb
    });
    this.startMatchLoop();
  }

  createLootCrate(spec, x, y, z) {
    const id = 'loot_' + (++this.lootSeq);
    const py = Number.isFinite(Number(y))
      ? Number(y)
      : (this.map.terrain ? this.map.terrain.floorAt(x, z) : 0);

    if (spec.kind === 'deathbox') {
      return {
        id,
        kind: 'deathbox',
        type: 'deathbox',
        ownerName: spec.ownerName || 'Chiến Binh',
        label: `Hòm Đồ (${spec.ownerName || 'Chiến Binh'})`,
        items: spec.items || [],
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'weapon' && WEAPONS[spec.weaponId]) {
      const w = WEAPONS[spec.weaponId];
      const ammoType = getWeaponAmmoType(w.id);
      return {
        id,
        kind: 'weapon',
        type: w.id,
        weaponId: w.id,
        ammoType,
        label: w.name,
        ammo: spec.ammo ?? w.magSize,
        reserve: spec.reserve ?? 0,
        bonusAmmo: spec.bonusAmmo ?? w.magSize,
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'ammo') {
      const ammoType = BR_AMMO_TYPES[spec.ammoType] ? spec.ammoType : '7.62mm';
      const cfg = BR_AMMO_TYPES[ammoType];
      const qty = Math.max(1, Number(spec.qty) || cfg.dropStep || 30);
      return {
        id,
        kind: 'ammo',
        type: 'ammo',
        ammoType,
        qty,
        label: `${cfg.name} ×${qty}`,
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'vest' || spec.kind === 'armor') {
      const tier = Math.max(1, Math.min(3, Number(spec.tier) || 1));
      const v = BR_VESTS[tier];
      return {
        id,
        kind: 'vest',
        type: 'armor',
        tier,
        armor: spec.armor ?? v.maxArmor,
        maxArmor: v.maxArmor,
        label: v.name,
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'helmet') {
      const tier = Math.max(1, Math.min(3, Number(spec.tier) || 1));
      const hm = BR_HELMETS[tier];
      return {
        id,
        kind: 'helmet',
        type: 'helmet',
        tier,
        helmetArmor: spec.helmetArmor ?? hm.maxHelmet,
        maxHelmet: hm.maxHelmet,
        label: hm.name,
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'bag') {
      const tier = Math.max(1, Math.min(3, Number(spec.tier) || 1));
      const bg = BR_BACKPACKS[tier];
      return {
        id,
        kind: 'bag',
        type: 'bag',
        tier,
        capacity: bg.capacity,
        label: bg.name,
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'med' || BR_MEDS[spec.medId] || spec.kind === 'medkit') {
      const medId = BR_MEDS[spec.medId] ? spec.medId : (spec.kind === 'medkit' ? 'medkit' : 'bandage');
      const m = BR_MEDS[medId];
      const qty = Math.max(1, Number(spec.qty) || (medId === 'bandage' ? 5 : 1));
      return {
        id,
        kind: 'med',
        type: 'medkit',
        medId,
        qty,
        label: qty > 1 ? `${m.name} ×${qty}` : m.name,
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    if (spec.kind === 'grenade') {
      const qty = Math.max(1, Number(spec.qty) || 1);
      return {
        id,
        kind: 'grenade',
        type: 'grenade',
        qty,
        label: qty > 1 ? `Lựu Đạn Nổ ×${qty}` : 'Lựu Đạn Nổ Frag',
        x: Number(x.toFixed(2)),
        y: Number(py.toFixed(2)),
        z: Number(z.toFixed(2)),
        active: true
      };
    }

    const kind = spec.kind || spec.type || 'overcharge';
    return {
      id,
      kind,
      type: kind,
      label: 'Hòm Tiếp Tế Tăng Lực',
      x: Number(x.toFixed(2)),
      y: Number(py.toFixed(2)),
      z: Number(z.toFixed(2)),
      active: true
    };
  }

  initSurvivalMode(now = Date.now()) {
    const hw = this.map.bounds.halfW;
    const hd = this.map.bounds.halfD;
    const isBig = hw > 500;
    const maxR = Math.max(hw, hd) * 1.25;

    // Pick final storm center near a dry land town/valley so final fights aren't in ocean corners
    const places = this.map.namedPlaces || [];
    const safeCenter = places.length > 0
      ? places[Math.floor(Math.random() * places.length)]
      : { x: (Math.random() - 0.5) * hw * 0.4, z: (Math.random() - 0.5) * hd * 0.4 };

    this.storm = {
      x: safeCenter.x + (Math.random() - 0.5) * (isBig ? 60 : 12),
      z: safeCenter.z + (Math.random() - 0.5) * (isBig ? 60 : 12),
      radius: maxR,
      minRadius: isBig ? 18 : 6.0,
      shrinkSpeed: (maxR - (isBig ? 18 : 6.0)) / (isBig ? 360 : 215)
    };

    // High-altitude tactical C-130 cargo plane flight across the island
    const corridors = [
      { sx: -hw * 0.90, sz: -hd * 0.75, ex: hw * 0.90, ez: hd * 0.75 },
      { sx: hw * 0.90, sz: -hd * 0.75, ex: -hw * 0.90, ez: hd * 0.75 },
      { sx: -hw * 0.75, sz: hd * 0.90, ex: hw * 0.75, ez: -hd * 0.90 },
      { sx: 80, sz: -hd * 0.90, ex: -60, ez: hd * 0.90 }
    ];
    const path = corridors[Math.floor(Math.random() * corridors.length)];
    const planeY = isBig ? 150 : 82;
    const durationMs = isBig ? 18000 : 13500;
    const startAt = now + 800;
    const endAt = startAt + durationMs;
    this.dropPlane = {
      active: true,
      startX: path.sx,
      startZ: path.sz,
      endX: path.ex,
      endZ: path.ez,
      x: path.sx,
      y: planeY,
      z: path.sz,
      vx: (path.ex - path.sx) / (durationMs / 1000),
      vz: (path.ez - path.sz) / (durationMs / 1000),
      yaw: Math.atan2(-(path.ex - path.sx), -(path.ez - path.sz)),
      startAt,
      endAt
    };
    this.airdropSpawned = false;
    this.lootSeq = 0;

    const lootPoints = [...(this.map.lootSpawns || [])];
    let tries = 0;
    while (lootPoints.length < 90 && tries < 280) {
      tries++;
      const rx = (Math.random() * 2 - 1) * (hw - 8);
      const rz = (Math.random() * 2 - 1) * (hd - 8);
      const ry = this.map.terrain ? this.map.terrain.floorAt(rx, rz) : 0;
      if (canStandAt(rx, ry, rz, PHYSICS.HEIGHT_STAND, 0.85, this.map.blocks)) {
        lootPoints.push({ x: Number(rx.toFixed(1)), y: ry, z: Number(rz.toFixed(1)) });
      }
    }

    const primaryPool = Object.values(WEAPONS).filter((w) => w.category === 'primary');
    const secondaryPool = Object.values(WEAPONS).filter((w) => w.category === 'secondary');
    const ammoKeys = Object.keys(BR_AMMO_TYPES);
    const medKeys = ['firstaid', 'bandage', 'energy', 'firstaid', 'medkit', 'energy'];

    // Balanced rich PUBG-style loot clusters across all 10 POIs (weapons + ammo, meds, vests, helmets, bags, grenades)
    this.lootCrates = [];
    for (let idx = 0; idx < lootPoints.length; idx++) {
      const sp = lootPoints[idx];
      const baseY = sp.y ?? (this.map.terrain ? this.map.terrain.floorAt(sp.x, sp.z) : 0);
      const r = idx % 10;

      if (r <= 3) {
        // Firearm + companion matching ammo box right beside it
        const useSec = r === 3 && secondaryPool.length > 0;
        const pool = useSec ? secondaryPool : primaryPool;
        const w = pool[Math.floor(Math.random() * pool.length)];
        const ammoType = getWeaponAmmoType(w.id);
        this.lootCrates.push(this.createLootCrate({ kind: 'weapon', weaponId: w.id }, sp.x, baseY, sp.z));
        this.lootCrates.push(
          this.createLootCrate(
            { kind: 'ammo', ammoType, qty: Math.max(24, w.magSize) },
            sp.x + 0.85,
            baseY,
            sp.z + 0.55
          )
        );
      } else if (r === 4 || r === 8) {
        // Abundant meds & energy drinks inside houses & compounds (evenly mixes firstaid, bandage, energy, medkit)
        const medId = medKeys[Math.floor(idx / 2) % medKeys.length];
        this.lootCrates.push(this.createLootCrate({ kind: 'med', medId }, sp.x, baseY, sp.z));
        if (idx % 3 === 0) {
          this.lootCrates.push(this.createLootCrate({ kind: 'med', medId: 'energy' }, sp.x - 0.65, baseY, sp.z + 0.45));
        }
      } else if (r === 5) {
        const tier = (idx % 7 === 0) ? 3 : ((idx % 3 === 0) ? 2 : 1);
        this.lootCrates.push(this.createLootCrate({ kind: 'vest', tier }, sp.x, baseY, sp.z));
      } else if (r === 6) {
        const tier = (idx % 8 === 0) ? 3 : ((idx % 2 === 0) ? 2 : 1);
        this.lootCrates.push(this.createLootCrate({ kind: 'helmet', tier }, sp.x, baseY, sp.z));
      } else if (r === 7) {
        const tier = (idx % 5 === 0) ? 3 : ((idx % 2 === 0) ? 2 : 1);
        this.lootCrates.push(this.createLootCrate({ kind: 'bag', tier }, sp.x, baseY, sp.z));
      } else {
        const ammoType = ammoKeys[idx % ammoKeys.length];
        this.lootCrates.push(this.createLootCrate({ kind: 'ammo', ammoType }, sp.x - 0.55, baseY, sp.z));
        this.lootCrates.push(this.createLootCrate({ kind: 'grenade', qty: 1 }, sp.x + 0.6, baseY, sp.z + 0.4));
      }
    }
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
    if (this.mode === 'survival') {
      const meleeId = player.melee || 'knife';
      player.weaponsState = {
        1: { id: null, ammo: 0, reserve: 0, magSize: 0 },
        2: { id: null, ammo: 0, reserve: 0, magSize: 0 },
        3: { id: meleeId, ammo: 0, reserve: 0, magSize: 0 }
      };
      player.slot = 3;
      player.weaponId = meleeId;
      player.primary = null;
      player.secondary = null;
      player.ammo = 0;
      player.reserveAmmo = 0;
      player.grenadeBelt = { frag: 0, flash: 0, smoke: 0, ap: 0, molotov: 0 };
      player.grenades = 0;
      player.reloadingUntil = 0;
      player.gear = { vestTier: 0, helmetTier: 0, helmetArmor: 0, helmetMax: 0, bagTier: 0 };
      player.backpack = {
        tier: 0,
        capacity: BR_BACKPACKS[0].capacity,
        ammo: { '7.62mm': 0, '5.56mm': 0, '9mm': 0, '12G': 0, '.338': 0 },
        meds: { bandage: 0, firstaid: 0, medkit: 0, energy: 0 },
        frag_grenade: 0
      };
      return;
    }

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
    player.grenadeBelt = createDefaultGrenadeBelt(this.mode === 'practice');
    player.grenades = GRENADE_ORDER.reduce((sum, id) => sum + (player.grenadeBelt[id] || 0), 0);
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
    const op = OPERATORS[player.operator] || OPERATORS.vanguard;
    if (this.mode === 'survival' && this.dropPlane) {
      player.dropPhase = 'plane';
      player.x = this.dropPlane.x;
      player.y = this.dropPlane.y;
      player.z = this.dropPlane.z;
      player.vx = 0;
      player.vy = 0;
      player.vz = 0;
      player.yaw = this.dropPlane.yaw || 0;
      player.pitch = -0.35;
      player.onGround = false;
      player.crouching = false;
      player.armor = 0;
    } else {
      const pt = this.pickSpawnPoint(player);
      player.dropPhase = 'ground';
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
      player.armor = this.mode === 'survival' ? 0 : op.maxArmor;
    }

    player.hp = PHYSICS.MAX_HP;
    player.maxHp = PHYSICS.MAX_HP;
    player.maxArmor = this.mode === 'survival' ? 0 : op.maxArmor;
    player.dead = false;
    player.respawnAt = 0;
    player.currentStreak = 0;
    player.spawnedAt = now;
    player.lastClientPosAt = 0;
    player.spawnProtectedUntil = this.mode === 'survival' ? 0 : now + PHYSICS.SPAWN_PROTECT_MS;
    player.damageTakenBy.clear();
    this.resetWeaponsForSpawn(player);

    if (emitPacket) {
      this.broadcastPlayerSpawned(player);
    }
  }

  sendWeaponsSync(player) {
    if (!player || player.isBot) return;
    this.sendTo(player.id, {
      type: 'weapons_sync',
      slot: player.slot,
      weaponId: player.weaponId,
      ammo: player.ammo,
      reserveAmmo: player.reserveAmmo,
      grenades: player.grenades,
      primary: player.primary,
      secondary: player.secondary,
      weaponsState: player.weaponsState
    });
  }

  sendInventorySync(player) {
    if (!player || player.isBot || this.mode !== 'survival') return;
    this.sendTo(player.id, {
      type: 'inventory_sync',
      hp: player.hp,
      maxHp: player.maxHp,
      armor: player.armor,
      maxArmor: player.maxArmor,
      gear: player.gear,
      backpack: player.backpack,
      backpackWeight: computeBackpackWeight(player.backpack),
      weaponsState: player.weaponsState,
      grenades: player.grenades
    });
  }

  syncPlayerBrAmmo(player) {
    if (this.mode !== 'survival' || !player.backpack) return;
    for (const sNum of [1, 2]) {
      const ws = player.weaponsState?.[sNum];
      if (ws?.id) {
        const aType = getWeaponAmmoType(ws.id);
        ws.reserve = Math.max(0, player.backpack.ammo[aType] || 0);
      }
    }
    player.grenades = Math.max(0, player.backpack.frag_grenade || 0);
    if (player.slot === 1 || player.slot === 2) {
      player.reserveAmmo = player.weaponsState?.[player.slot]?.reserve || 0;
    }
  }

  addBrItemToPlayer(player, item, now = Date.now(), allowSwap = false) {
    if (!player.backpack || !player.gear) return { ok: false, overflow: [] };
    const overflow = [];

    if (item.kind === 'weapon' && item.weaponId && WEAPONS[item.weaponId]) {
      const wCfg = WEAPONS[item.weaponId];
      // PUBG Style 2-Weapon System:
      // If item.targetSlot is explicitly requested (1 or 2), use that.
      // Otherwise:
      // - If Slot 1 is empty -> Slot 1
      // - Else if Slot 2 is empty -> Slot 2
      // - Else both full -> swap with current active slot (if slot 2 then 2, else 1)
      let targetSlot = Number(item.targetSlot);
      if (targetSlot !== 1 && targetSlot !== 2) {
        const s1Empty = !player.weaponsState?.[1]?.id;
        const s2Empty = !player.weaponsState?.[2]?.id;
        if (s1Empty) targetSlot = 1;
        else if (s2Empty) targetSlot = 2;
        else targetSlot = player.slot === 2 ? 2 : 1;
      }

      const existing = player.weaponsState?.[targetSlot];
      const slotEmpty = !existing || !existing.id;
      if (!slotEmpty && !allowSwap) return { ok: false, overflow };

      if (!slotEmpty && existing.id) {
        const oldAmmo = player.slot === targetSlot ? player.ammo : (existing.ammo || 0);
        overflow.push({ kind: 'weapon', weaponId: existing.id, ammo: oldAmmo, reserve: 0, bonusAmmo: 0 });
      }

      const stats = getEffectiveWeaponStats(item.weaponId, player.attachments?.[item.weaponId], player.operator);
      const loadedAmmo = Math.max(0, Number(item.ammo ?? stats.magSize));
      player.weaponsState[targetSlot] = {
        id: item.weaponId,
        ammo: loadedAmmo,
        reserve: 0,
        magSize: stats.magSize
      };
      if (targetSlot === 1) player.primary = item.weaponId;
      else if (targetSlot === 2) player.secondary = item.weaponId;

      if (item.bonusAmmo > 0) {
        const aType = getWeaponAmmoType(item.weaponId);
        const uWeight = BR_AMMO_TYPES[aType]?.weight || 0.5;
        const freeW = Math.max(0, player.backpack.capacity - computeBackpackWeight(player.backpack));
        const fit = Math.min(item.bonusAmmo, Math.floor(freeW / uWeight));
        if (fit > 0) player.backpack.ammo[aType] = (player.backpack.ammo[aType] || 0) + fit;
        item.bonusAmmo = 0;
      }

      this.syncPlayerBrAmmo(player);

      // Auto switch to newly equipped gun if:
      // 1. Player was holding knife/melee (slot 3)
      // 2. OR player was holding targetSlot (swapping weapon)
      // 3. OR this is player's very first gun in Slot 1
      const isOnlyGun = !player.weaponsState[1]?.id || !player.weaponsState[2]?.id;
      const shouldSwitch = player.slot === 3 || player.slot === targetSlot || (targetSlot === 1 && !player.weaponsState[2]?.id);
      if (shouldSwitch) {
        if (player.weaponsState[player.slot] && player.slot !== targetSlot) {
          player.weaponsState[player.slot].ammo = player.ammo;
        }
        player.slot = targetSlot;
        player.weaponId = item.weaponId;
        player.ammo = loadedAmmo;
        player.reserveAmmo = player.weaponsState[targetSlot].reserve;
        player.reloadingUntil = 0;
        this.broadcast({
          type: 'weapon_switched',
          id: player.id,
          slot: player.slot,
          weaponId: player.weaponId,
          ammo: player.ammo,
          reserveAmmo: player.reserveAmmo
        });
      }
      this.sendWeaponsSync(player);
      this.sendInventorySync(player);
      return { ok: true, consumedAll: true, overflow };
    }

    if (item.kind === 'vest') {
      const tier = item.tier || 1;
      const curTier = player.gear.vestTier || 0;
      const newArmor = item.armor ?? (BR_VESTS[tier]?.maxArmor || 65);
      if (tier < curTier && !allowSwap) return { ok: false, overflow };
      if (tier === curTier && player.armor >= newArmor) return { ok: false, overflow };
      if (curTier > 0 && player.armor > 0) {
        overflow.push({ kind: 'vest', tier: curTier, armor: player.armor });
      }
      player.gear.vestTier = tier;
      player.maxArmor = item.maxArmor ?? (BR_VESTS[tier]?.maxArmor || 65);
      player.armor = newArmor;
      this.sendInventorySync(player);
      return { ok: true, consumedAll: true, overflow };
    }

    if (item.kind === 'helmet') {
      const tier = item.tier || 1;
      const curTier = player.gear.helmetTier || 0;
      const newArmor = item.helmetArmor ?? (BR_HELMETS[tier]?.maxHelmet || 55);
      if (tier < curTier && !allowSwap) return { ok: false, overflow };
      if (tier === curTier && player.gear.helmetArmor >= newArmor) return { ok: false, overflow };
      if (curTier > 0 && player.gear.helmetArmor > 0) {
        overflow.push({ kind: 'helmet', tier: curTier, helmetArmor: player.gear.helmetArmor });
      }
      player.gear.helmetTier = tier;
      player.gear.helmetMax = item.maxHelmet ?? (BR_HELMETS[tier]?.maxHelmet || 55);
      player.gear.helmetArmor = newArmor;
      this.sendInventorySync(player);
      return { ok: true, consumedAll: true, overflow };
    }

    if (item.kind === 'bag') {
      const tier = item.tier || 1;
      const curTier = player.gear.bagTier || 0;
      if (tier <= curTier) return { ok: false, overflow };
      if (curTier > 0) overflow.push({ kind: 'bag', tier: curTier });
      player.gear.bagTier = tier;
      player.backpack.tier = tier;
      player.backpack.capacity = BR_BACKPACKS[tier]?.capacity || 220;
      this.sendInventorySync(player);
      return { ok: true, consumedAll: true, overflow };
    }

    if (item.kind === 'ammo') {
      const aType = item.ammoType || '7.62mm';
      const uWeight = BR_AMMO_TYPES[aType]?.weight || 0.5;
      const freeW = Math.max(0, player.backpack.capacity - computeBackpackWeight(player.backpack));
      const maxFit = Math.floor(freeW / uWeight);
      const qty = Math.max(0, Number(item.qty) || 0);
      const take = Math.min(qty, maxFit);
      if (take <= 0) return { ok: false, error: 'Balo đã đầy! Hãy vứt bớt đồ hoặc nhặt Balo lớn hơn.', overflow };
      player.backpack.ammo[aType] = (player.backpack.ammo[aType] || 0) + take;
      this.syncPlayerBrAmmo(player);
      this.sendWeaponsSync(player);
      this.sendInventorySync(player);
      return { ok: true, takenQty: take, consumedAll: take >= qty, overflow };
    }

    if (item.kind === 'med') {
      const medId = BR_MEDS[item.medId] ? item.medId : 'bandage';
      const uWeight = BR_MEDS[medId].weight || 5;
      const freeW = Math.max(0, player.backpack.capacity - computeBackpackWeight(player.backpack));
      const maxFit = Math.floor(freeW / uWeight);
      const qty = Math.max(1, Number(item.qty) || 1);
      const take = Math.min(qty, maxFit);
      if (take <= 0) return { ok: false, error: 'Balo đã đầy không thể nhặt thêm Y Tế!', overflow };
      player.backpack.meds[medId] = (player.backpack.meds[medId] || 0) + take;
      this.sendInventorySync(player);
      return { ok: true, takenQty: take, consumedAll: take >= qty, overflow };
    }

    if (item.kind === 'grenade') {
      const uWeight = 14;
      const freeW = Math.max(0, player.backpack.capacity - computeBackpackWeight(player.backpack));
      const maxFit = Math.floor(freeW / uWeight);
      const qty = Math.max(1, Number(item.qty) || 1);
      const take = Math.min(qty, maxFit);
      if (take <= 0) return { ok: false, error: 'Balo đã đầy không thể nhặt thêm Lựu Đạn!', overflow };
      player.backpack.frag_grenade = (player.backpack.frag_grenade || 0) + take;
      this.syncPlayerBrAmmo(player);
      this.sendWeaponsSync(player);
      this.sendInventorySync(player);
      return { ok: true, takenQty: take, consumedAll: take >= qty, overflow };
    }

    if (item.kind === 'overcharge') {
      player.damageBoostUntil = now + 22000;
      player.hp = Math.min(player.maxHp, player.hp + 30);
      this.sendInventorySync(player);
      return { ok: true, consumedAll: true, overflow };
    }

    return { ok: false, overflow };
  }

  handleLootItem(playerId, payload = {}) {
    if (this.status !== 'playing' || this.mode !== 'survival') return;
    const p = this.combatants.get(playerId);
    if (!p || p.dead || p.dropPhase !== 'ground') return;
    const crate = this.lootCrates.find((c) => c.id === payload.crateId && c.active);
    if (!crate) return;
    if (Math.hypot(p.x - crate.x, p.z - crate.z) > 4.2 || Math.abs(p.y - crate.y) > 3.2) return;

    const now = Date.now();
    const spawned = [];

    if (crate.kind === 'deathbox') {
      const idx = (crate.items || []).findIndex((it) => it.itemId === payload.itemId);
      if (idx < 0) return;
      const subItem = payload.targetSlot ? { ...crate.items[idx], targetSlot: payload.targetSlot } : crate.items[idx];
      const res = this.addBrItemToPlayer(p, subItem, now, true);
      if (!res.ok) {
        if (res.error) this.sendTo(p.id, { type: 'system_toast', text: res.error });
        return;
      }
      if (res.consumedAll) {
        crate.items.splice(idx, 1);
      } else if (res.takenQty > 0 && subItem.qty !== undefined) {
        subItem.qty -= res.takenQty;
      }
      for (const ov of res.overflow) {
        spawned.push(this.createLootCrate(ov, p.x + (Math.random() - 0.5), p.y, p.z + (Math.random() - 0.5)));
      }
      if (crate.items.length === 0) {
        crate.active = false;
        this.broadcast({
          type: 'loot_picked',
          crateId: crate.id,
          playerId: p.id,
          kind: 'deathbox',
          label: crate.label,
          hp: p.hp,
          armor: p.armor,
          maxArmor: p.maxArmor,
          ammo: p.ammo,
          reserveAmmo: p.reserveAmmo,
          grenades: p.grenades,
          primary: p.primary,
          secondary: p.secondary,
          weaponsState: p.weaponsState
        });
      } else {
        this.broadcast({ type: 'loot_updated', crate });
      }
    } else {
      const itemToLoot = payload.targetSlot ? { ...crate, targetSlot: payload.targetSlot } : crate;
      const res = this.addBrItemToPlayer(p, itemToLoot, now, true);
      if (!res.ok) {
        if (res.error) this.sendTo(p.id, { type: 'system_toast', text: res.error });
        return;
      }
      for (const ov of res.overflow) {
        spawned.push(this.createLootCrate(ov, crate.x + (Math.random() - 0.5) * 0.7, crate.y, crate.z + (Math.random() - 0.5) * 0.7));
      }
      if (res.consumedAll) {
        crate.active = false;
        this.broadcast({
          type: 'loot_picked',
          crateId: crate.id,
          playerId: p.id,
          kind: crate.kind,
          weaponId: crate.weaponId || null,
          label: crate.label,
          hp: p.hp,
          armor: p.armor,
          maxArmor: p.maxArmor,
          ammo: p.ammo,
          reserveAmmo: p.reserveAmmo,
          grenades: p.grenades,
          primary: p.primary,
          secondary: p.secondary,
          weaponsState: p.weaponsState
        });
      } else {
        if (res.takenQty > 0 && crate.qty !== undefined) {
          crate.qty -= res.takenQty;
          const unitCfg = crate.kind === 'ammo' ? BR_AMMO_TYPES[crate.ammoType] : BR_MEDS[crate.medId];
          crate.label = `${unitCfg?.name || crate.kind} ×${crate.qty}`;
        }
        this.broadcast({ type: 'loot_updated', crate });
      }
    }

    if (spawned.length > 0) {
      this.lootCrates.push(...spawned);
      this.broadcast({ type: 'loot_spawned', crates: spawned });
    }
  }

  handleDropItem(playerId, payload = {}) {
    if (this.status !== 'playing' || this.mode !== 'survival') return;
    const p = this.combatants.get(playerId);
    if (!p || p.dead || p.dropPhase !== 'ground') return;
    const dropX = p.x - Math.sin(p.yaw || 0) * 0.9 + (Math.random() - 0.5) * 0.4;
    const dropZ = p.z - Math.cos(p.yaw || 0) * 0.9 + (Math.random() - 0.5) * 0.4;
    const dropY = this.map.terrain ? Math.max(p.y, this.map.terrain.floorAt(dropX, dropZ)) : p.y;
    let newCrate = null;

    if (payload.category === 'weapon') {
      const slotNum = Number(payload.key);
      if (slotNum !== 1 && slotNum !== 2) return;
      const ws = p.weaponsState?.[slotNum];
      if (!ws?.id) return;
      const curAmmo = p.slot === slotNum ? p.ammo : ws.ammo;
      newCrate = this.createLootCrate({ kind: 'weapon', weaponId: ws.id, ammo: curAmmo, bonusAmmo: 0 }, dropX, dropY, dropZ);
      p.weaponsState[slotNum] = { id: null, ammo: 0, reserve: 0, magSize: 0 };
      if (slotNum === 1) p.primary = null;
      else p.secondary = null;

      if (p.slot === slotNum) {
        const altSlot = slotNum === 1 ? (p.weaponsState[2]?.id ? 2 : 3) : (p.weaponsState[1]?.id ? 1 : 3);
        p.slot = altSlot;
        p.weaponId = p.weaponsState[altSlot].id || p.melee || 'knife';
        p.ammo = p.weaponsState[altSlot].ammo || 0;
        p.reserveAmmo = p.weaponsState[altSlot].reserve || 0;
        this.broadcast({ type: 'weapon_switched', id: p.id, slot: p.slot, weaponId: p.weaponId, ammo: p.ammo, reserveAmmo: p.reserveAmmo });
      }
    } else if (payload.category === 'ammo') {
      const aType = payload.key;
      const have = p.backpack?.ammo?.[aType] || 0;
      if (have <= 0) return;
      const step = BR_AMMO_TYPES[aType]?.dropStep || 30;
      const dropQty = Math.min(have, Math.max(1, Number(payload.qty) || step));
      p.backpack.ammo[aType] -= dropQty;
      newCrate = this.createLootCrate({ kind: 'ammo', ammoType: aType, qty: dropQty }, dropX, dropY, dropZ);
    } else if (payload.category === 'med') {
      const medId = payload.key;
      const have = p.backpack?.meds?.[medId] || 0;
      if (have <= 0) return;
      const dropQty = Math.min(have, Math.max(1, Number(payload.qty) || 1));
      p.backpack.meds[medId] -= dropQty;
      newCrate = this.createLootCrate({ kind: 'med', medId, qty: dropQty }, dropX, dropY, dropZ);
    } else if (payload.category === 'grenade') {
      const have = p.backpack?.frag_grenade || 0;
      if (have <= 0) return;
      const dropQty = Math.min(have, Math.max(1, Number(payload.qty) || 1));
      p.backpack.frag_grenade -= dropQty;
      newCrate = this.createLootCrate({ kind: 'grenade', qty: dropQty }, dropX, dropY, dropZ);
    } else if (payload.category === 'vest') {
      if (!p.gear?.vestTier) return;
      newCrate = this.createLootCrate({ kind: 'vest', tier: p.gear.vestTier, armor: p.armor }, dropX, dropY, dropZ);
      p.gear.vestTier = 0;
      p.armor = 0;
      p.maxArmor = 0;
    } else if (payload.category === 'helmet') {
      if (!p.gear?.helmetTier) return;
      newCrate = this.createLootCrate({ kind: 'helmet', tier: p.gear.helmetTier, helmetArmor: p.gear.helmetArmor }, dropX, dropY, dropZ);
      p.gear.helmetTier = 0;
      p.gear.helmetArmor = 0;
      p.gear.helmetMax = 0;
    }

    if (newCrate) {
      this.lootCrates.push(newCrate);
      this.syncPlayerBrAmmo(p);
      this.sendWeaponsSync(p);
      this.sendInventorySync(p);
      this.broadcast({ type: 'loot_spawned', crates: [newCrate] });
    }
  }

  handleUseMed(playerId, payload = {}) {
    if (this.status !== 'playing' || this.mode !== 'survival') return;
    const p = this.combatants.get(playerId);
    if (!p || p.dead || p.dropPhase !== 'ground') return;
    const medId = payload.medId;
    const mCfg = BR_MEDS[medId];
    if (!mCfg || !(p.backpack?.meds?.[medId] > 0)) return;
    if (p.hp >= mCfg.maxCap && !mCfg.armorBoost) {
      this.sendTo(p.id, { type: 'system_toast', text: `Máu đã đạt mức tối đa (${mCfg.maxCap} HP) của ${mCfg.name}!` });
      return;
    }
    p.backpack.meds[medId] -= 1;
    if (p.hp < mCfg.maxCap) {
      p.hp = Math.min(mCfg.maxCap, p.hp + mCfg.heal);
    }
    if (mCfg.armorBoost && p.maxArmor > 0) {
      p.armor = Math.min(p.maxArmor, p.armor + mCfg.armorBoost);
    }
    this.sendInventorySync(p);
    this.sendTo(p.id, { type: 'system_toast', text: `Đã dùng ${mCfg.name} (+${mCfg.heal} Máu)` });
  }

  handleDropAction(playerId, action) {
    if (this.status !== 'playing' || this.mode !== 'survival') return;
    const p = this.combatants.get(playerId);
    if (!p || p.dead) return;
    if (action === 'jump' && p.dropPhase === 'plane') {
      p.dropPhase = 'skydive';
      p.x = (this.dropPlane?.x ?? p.x) + (Math.random() - 0.5) * 4.0;
      p.y = (this.dropPlane?.y ?? 260) - 2.5;
      p.z = (this.dropPlane?.z ?? p.z) + (Math.random() - 0.5) * 4.0;
      p.vy = -14;
      p.onGround = false;
      p.lastClientPosAt = 0;
    } else if (action === 'open_chute' && p.dropPhase === 'skydive') {
      p.dropPhase = 'parachute';
      p.vy = Math.max(p.vy || -14, -6.5);
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
      grenadeBelt: player.grenadeBelt,
      hp: player.hp,
      armor: player.armor,
      maxArmor: player.maxArmor,
      dropPhase: player.dropPhase || 'ground',
      weaponsState: player.weaponsState
    });
  }

  getPlayerWeaponStats(player) {
    const wId = player.weaponId || player.melee || 'knife';
    return getEffectiveWeaponStats(wId, player.attachments?.[wId] || {}, player.operator);
  }

  switchWeapon(player, slotNum) {
    if (player.dead) return;
    const s = Number(slotNum);
    if (![1, 2, 3].includes(s) || s === player.slot) return;
    const nextW = player.weaponsState[s];
    if (!nextW || !nextW.id) return;
    if (player.weaponsState[player.slot]) {
      player.weaponsState[player.slot].ammo = player.ammo;
      player.weaponsState[player.slot].reserve = player.reserveAmmo;
    }
    player.slot = s;
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

    // Save current slot ammo before instant swap
    if (player.weaponsState?.[player.slot]) {
      player.weaponsState[player.slot].ammo = player.ammo;
      player.weaponsState[player.slot].reserve = player.reserveAmmo;
    }

    if (w.category === 'secondary') {
      player.secondary = weaponId;
      const sStats = getEffectiveWeaponStats(weaponId, player.attachments[weaponId], player.operator);
      player.weaponsState[2] = { id: weaponId, ammo: sStats.magSize, reserve: sStats.reserveAmmo, magSize: sStats.magSize };
      if (!player.dead) {
        player.slot = 2;
        player.weaponId = weaponId;
        player.ammo = sStats.magSize;
        player.reserveAmmo = sStats.reserveAmmo;
        player.reloadingUntil = 0;
        this.broadcast({
          type: 'weapon_switched',
          id: player.id,
          slot: 2,
          weaponId: player.weaponId,
          ammo: player.ammo,
          reserveAmmo: player.reserveAmmo,
          notice: `Đã đổi ngay súng phụ sang ${w.name}!`
        });
      } else {
        this.sendTo(player.id, { type: 'system_toast', text: `Đã chọn súng phụ ${w.name}!` });
      }
      return;
    }

    if (w.category === 'melee') {
      player.melee = weaponId;
      player.weaponsState[3] = { id: weaponId, ammo: 0, reserve: 0, magSize: 0 };
      if (!player.dead) {
        player.slot = 3;
        player.weaponId = weaponId;
        player.ammo = 0;
        player.reserveAmmo = 0;
        player.reloadingUntil = 0;
        this.broadcast({
          type: 'weapon_switched',
          id: player.id,
          slot: 3,
          weaponId: player.weaponId,
          ammo: 0,
          reserveAmmo: 0,
          notice: `Đã đổi ngay cận chiến sang ${w.name}!`
        });
      } else {
        this.sendTo(player.id, { type: 'system_toast', text: `Đã chọn cận chiến ${w.name}!` });
      }
      return;
    }

    if (w.category !== 'primary') return;
    player.primary = weaponId;
    player.pendingPrimary = null;
    const pStats = getEffectiveWeaponStats(weaponId, player.attachments[weaponId], player.operator);
    player.weaponsState[1] = {
      id: weaponId,
      ammo: pStats.magSize,
      reserve: pStats.reserveAmmo,
      magSize: pStats.magSize
    };

    if (!player.dead) {
      // Instant weapon switch anywhere in-match — never requires dying/respawning!
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
        notice: `Đã đổi ngay sang ${w.name}!`
      });
    } else {
      player.pendingPrimary = weaponId;
      this.sendTo(player.id, {
        type: 'system_toast',
        text: `Đã chọn ${w.name} — sẽ cầm ngay khi hồi sinh!`
      });
    }
  }

  startReload(player, now = Date.now()) {
    if (player.dead) return;
    if (player.reloadingUntil) {
      if (now >= player.reloadingUntil) {
        this.finishReload(player);
      } else {
        return;
      }
    }
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
      if (this.mode === 'survival' && player.backpack?.ammo) {
        const aType = getWeaponAmmoType(player.weaponId);
        player.backpack.ammo[aType] = Math.max(0, (player.backpack.ammo[aType] || 0) - add);
        this.syncPlayerBrAmmo(player);
        this.sendInventorySync(player);
      } else if (this.mode !== 'practice') {
        player.reserveAmmo -= add;
      }
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
    p.lastSeenAt = Date.now();
    const clean = this.antiCheat.sanitizeInput(rawInput);
    p.input = clean;
    p.yaw = clean.yaw;
    p.pitch = clean.pitch;
    p.ads = clean.ads;
    p.crouching = clean.crouch;
    p.sprinting = clean.sprint && clean.forward > 0 && !clean.crouch && !clean.ads;

    if (
      !p.dead &&
      !(this.mode === 'survival' && p.dropPhase === 'plane') &&
      Number.isFinite(rawInput.x) &&
      Number.isFinite(rawInput.y) &&
      Number.isFinite(rawInput.z)
    ) {
      const now = Date.now();
      const dtSec = Math.max(0.02, Math.min(0.35, (now - (p.lastClientPosAt || now - 35)) / 1000));
      const drift = Math.hypot(rawInput.x - p.x, rawInput.z - p.z);
      const isBR = this.mode === 'survival';
      const maxDrift = isBR ? 28 : 8.5;
      const maxY = isBR ? 300 : 18;
      const maxHorizV = isBR && p.dropPhase !== 'ground' ? 36 : 12;
      const minVy = isBR && p.dropPhase !== 'ground' ? -50 : -18;
      // Accept client position if within generous anti-speedhack envelope
      if (drift < maxDrift && rawInput.y >= -0.05 && rawInput.y <= maxY) {
        const estVx = Number.isFinite(Number(rawInput.vx))
          ? Math.max(-maxHorizV, Math.min(maxHorizV, Number(rawInput.vx)))
          : Math.max(-maxHorizV, Math.min(maxHorizV, (rawInput.x - p.x) / dtSec));
        const estVz = Number.isFinite(Number(rawInput.vz))
          ? Math.max(-maxHorizV, Math.min(maxHorizV, Number(rawInput.vz)))
          : Math.max(-maxHorizV, Math.min(maxHorizV, (rawInput.z - p.z) / dtSec));
        const estVy = Number.isFinite(Number(rawInput.vy))
          ? Math.max(minVy, Math.min(24, Number(rawInput.vy)))
          : 0;
        p.vx = estVx;
        p.vy = estVy;
        p.vz = estVz;
        p.x = rawInput.x;
        p.y = Math.max(0, rawInput.y);
        p.z = rawInput.z;
        p.onGround = rawInput.onGround !== undefined ? Boolean(rawInput.onGround) : p.onGround;
        if (isBR && p.dropPhase !== 'ground') {
          const groundY = this.map.terrain ? this.map.terrain.floorAt(p.x, p.z) : 0;
          if (p.dropPhase === 'skydive' && p.y - groundY <= 55) p.dropPhase = 'parachute';
          if (p.onGround || (rawInput.dropPhase === 'ground' && p.y < groundY + 28 && Math.abs(p.vy) < 4.5)) {
            p.dropPhase = 'ground';
          }
        }
        const h = p.crouching ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;
        if (p.dropPhase === 'ground') {
          depenetratePlayerXZ(p, h, PHYSICS.PLAYER_RADIUS, this.map);
        }
        p.lastClientPosAt = now;
      }
    }
  }

  handleClientFire(playerId, payload = {}) {
    if (this.status !== 'playing' || this.roundPhase !== 'live') return;
    const shooter = this.combatants.get(playerId);
    if (!shooter || shooter.dead) return;
    if (shooter.dropPhase && shooter.dropPhase !== 'ground') return;

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
    if (bot.dropPhase && bot.dropPhase !== 'ground') return;
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

    // FPS Forward Cleave Arc for Melee Slashes: sweeps a generous 38° arc in front so slashing feels crisp & responsive!
    if (wStats.isMelee) {
      const lookDir = directionFromAngles(yaw, pitch);
      const maxReach = (wStats.range || 3.4) + (heavyMelee ? 0.25 : 0);
      const cleaveMinDot = heavyMelee ? 0.80 : 0.76; // ~37°-40° half-cone in front
      for (const cand of this.getLivingCombatants()) {
        if (cand.id === shooter.id) continue;
        if (this.modeConfig.teamBased && cand.team === shooter.team) continue;
        if (cand.dropPhase && cand.dropPhase !== 'ground') continue;
        if (aggregatedHits.has(cand.id)) continue;

        const targetCenter = { x: cand.x, y: cand.y + (cand.crouching ? 0.72 : 1.15), z: cand.z };
        const dx = targetCenter.x - origin.x;
        const dy = targetCenter.y - origin.y;
        const dz = targetCenter.z - origin.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > maxReach + PHYSICS.PLAYER_RADIUS) continue;

        const invD = dist > 0.001 ? 1 / dist : 1;
        const dot = (dx * lookDir.x + dy * lookDir.y + dz * lookDir.z) * invD;
        if (dot < cleaveMinDot && dist > 1.25) continue;

        if (hasLineOfSight(origin, targetCenter, this.map)) {
          const hitHead = origin.y + lookDir.y * dist >= cand.y + (cand.crouching ? 0.92 : 1.48);
          aggregatedHits.set(cand.id, {
            target: cand,
            count: 1,
            headHit: hitHead,
            dist,
            zone: hitHead ? 'head' : 'body'
          });
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
    if (!p || p.dead) return;
    if (p.dropPhase && p.dropPhase !== 'ground') return;
    const now = Date.now();
    if (now - (p.lastGrenadeAt || 0) < 750) return;

    const reqType = GRENADE_TYPES[payload.grenadeType] ? payload.grenadeType : 'frag';
    let grenadeType = reqType;

    if (this.mode === 'survival') {
      if ((p.grenades || 0) <= 0) return;
      p.grenades -= 1;
      if (p.backpack) {
        p.backpack.frag_grenade = Math.max(0, (p.backpack.frag_grenade || 1) - 1);
        this.syncPlayerBrAmmo(p);
        this.sendInventorySync(p);
      }
    } else {
      if (!p.grenadeBelt) p.grenadeBelt = createDefaultGrenadeBelt(this.mode === 'practice');
      if ((p.grenadeBelt[grenadeType] || 0) <= 0) {
        // Fallback to any available grenade in belt
        const avail = GRENADE_ORDER.find((id) => (p.grenadeBelt[id] || 0) > 0);
        if (!avail) return;
        grenadeType = avail;
      }
      if (this.mode !== 'practice') {
        p.grenadeBelt[grenadeType] = Math.max(0, (p.grenadeBelt[grenadeType] || 1) - 1);
      }
      p.grenades = GRENADE_ORDER.reduce((sum, id) => sum + (p.grenadeBelt[id] || 0), 0);
    }

    p.lastGrenadeAt = now;
    p.spawnProtectedUntil = 0;

    const gCfg = GRENADE_TYPES[grenadeType] || GRENADE_TYPES.frag;
    const yaw = Number.isFinite(Number(payload.yaw)) ? Number(payload.yaw) : p.yaw;
    const pitch = Math.max(-1.35, Math.min(1.35, Number.isFinite(Number(payload.pitch)) ? Number(payload.pitch) : p.pitch));
    const power = Math.max(0.32, Math.min(1.0, Number.isFinite(Number(payload.power)) ? Number(payload.power) : 0.88));
    const underhand = Boolean(payload.underhand);
    const dir = directionFromAngles(yaw, pitch);
    const eyeH = p.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND;
    const speedBase = underhand ? GRENADE_CONFIG.throwSpeed * 0.50 : GRENADE_CONFIG.throwSpeed;
    const launchSpeed = speedBase * power;
    const upBoost = (underhand ? 1.65 : GRENADE_CONFIG.upwardBoost) * (0.48 + 0.52 * power);

    const gren = {
      id: 'gr_' + randHex(5),
      grenadeType,
      ownerId: p.id,
      ownerName: p.name,
      ownerTeam: p.team,
      x: p.x + dir.x * 0.45,
      y: p.y + eyeH - 0.1,
      z: p.z + dir.z * 0.45,
      vx: dir.x * launchSpeed + p.vx * 0.35,
      vy: dir.y * launchSpeed + upBoost,
      vz: dir.z * launchSpeed + p.vz * 0.35,
      thrownAt: now,
      explodeAt: now + (gCfg.fuseMs || GRENADE_CONFIG.fuseMs)
    };
    this.grenades.push(gren);

    this.broadcast({
      type: 'grenade_thrown',
      id: gren.id,
      grenadeType,
      ownerId: p.id,
      x: gren.x, y: gren.y, z: gren.z,
      vx: gren.vx, vy: gren.vy, vz: gren.vz,
      grenadesLeft: p.grenades,
      grenadeBelt: p.grenadeBelt
    });
  }

  tickGrenades(dt, now) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      const gCfg = GRENADE_TYPES[g.grenadeType] || GRENADE_TYPES.frag;
      g.vy -= GRENADE_CONFIG.gravity * dt;

      let impacted = false;
      const stepDist = Math.hypot(g.vx * dt, g.vy * dt, g.vz * dt);
      if (stepDist > 0.001) {
        const dir = { x: (g.vx * dt) / stepDist, y: (g.vy * dt) / stepDist, z: (g.vz * dt) / stepDist };
        const hit = raycastMap({ x: g.x, y: g.y, z: g.z }, dir, stepDist + 0.12, this.map);
        if (hit) {
          impacted = true;
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
      const floorY = this.map.terrain ? this.map.terrain.floorAt(g.x, g.z) + 0.08 : 0.08;
      if (g.y + g.vy * dt <= floorY) {
        g.y = floorY;
        impacted = true;
        if (Math.abs(g.vy) < 1.2) g.vy = 0;
        else {
          g.vy = -g.vy * GRENADE_CONFIG.bounceRestitution;
          g.vx *= 0.75;
          g.vz *= 0.75;
        }
      } else {
        g.y += g.vy * dt;
      }
      g.z += g.vz * dt;

      const molotovBreak = Boolean(gCfg.impactDetonate && impacted && (now - (g.thrownAt || 0) > 140));
      if (now >= g.explodeAt || molotovBreak) {
        this.detonateGrenade(g, now);
        this.grenades.splice(i, 1);
      }
    }
  }

  detonateGrenade(g, now) {
    const grenadeType = g.grenadeType || 'frag';
    const gCfg = GRENADE_TYPES[grenadeType] || GRENADE_TYPES.frag;
    const radius = gCfg.blastRadius || GRENADE_CONFIG.blastRadius;

    this.broadcast({
      type: 'grenade_exploded',
      id: g.id,
      grenadeType,
      x: g.x, y: g.y, z: g.z,
      radius,
      durationMs: gCfg.durationMs || 0
    });

    const attacker = this.combatants.get(g.ownerId) || { id: g.ownerId, name: g.ownerName, team: g.ownerTeam };
    const blastOrigin = { x: g.x, y: g.y + 0.35, z: g.z };

    // 1. SMOKE GRENADE: spawns an active smoke concealment cloud that blocks enemy bot LOS!
    if (grenadeType === 'smoke') {
      this.smokeZones.push({
        x: g.x, y: g.y + 1.2, z: g.z,
        radius: radius * 0.85,
        expiresAt: now + (gCfg.durationMs || 12000)
      });
      return;
    }

    // 2. FLASHBANG (M84): blinds all combatants with LOS (intensity scales by distance & look direction!)
    if (grenadeType === 'flash') {
      for (const victim of this.getLivingCombatants()) {
        const eyePos = { x: victim.x, y: victim.y + (victim.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND), z: victim.z };
        const dx = blastOrigin.x - eyePos.x;
        const dy = blastOrigin.y - eyePos.y;
        const dz = blastOrigin.z - eyePos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > radius) continue;
        if (!hasLineOfSight(blastOrigin, eyePos, this.map)) continue;

        const lookDir = directionFromAngles(victim.yaw || 0, victim.pitch || 0);
        const invD = d > 0.001 ? 1 / d : 1;
        const lookDot = (dx * lookDir.x + dy * lookDir.y + dz * lookDir.z) * invD;
        // Looking directly at flash -> 100% blind; facing away -> 35% brief flash
        const lookMult = lookDot > 0.25 ? 1.0 : (lookDot > -0.25 ? 0.68 : 0.35);
        const distMult = Math.max(0.25, 1 - (d / radius) * 0.72);
        const intensity = Math.min(1.0, distMult * lookMult);
        const durationMs = Math.round((gCfg.blindDurationMs || 3600) * intensity);

        if (durationMs < 350) continue;
        if (victim.isBot) {
          victim.blindedUntil = Math.max(victim.blindedUntil || 0, now + durationMs);
        } else {
          this.sendTo(victim.id, {
            type: 'flash_blind',
            intensity,
            durationMs,
            dist: d
          });
        }
        if (attacker.id && attacker.id !== victim.id && !(this.modeConfig.teamBased && victim.team === g.ownerTeam)) {
          this.sendTo(attacker.id, {
            type: 'hit_confirm',
            targetId: victim.id,
            damage: 0,
            hitZone: 'flash',
            killed: false
          });
        }
      }
      return;
    }

    // 3. MOLOTOV / INCENDIARY: spawns a burning fire zone + immediate splash damage
    if (grenadeType === 'molotov') {
      this.fireZones.push({
        x: g.x, y: g.y, z: g.z,
        radius,
        ownerId: g.ownerId,
        ownerName: g.ownerName,
        ownerTeam: g.ownerTeam,
        expiresAt: now + (gCfg.durationMs || 6000),
        lastTickAt: now
      });
    }

    // 4. FRAG (HE), ARMOR-PIERCING (EMP/AP), and initial MOLOTOV splash damage
    for (const victim of this.getLivingCombatants()) {
      if (this.modeConfig.teamBased && victim.team === g.ownerTeam && victim.id !== g.ownerId) continue;
      const d = Math.hypot(victim.x - g.x, victim.y + 0.9 - g.y, victim.z - g.z);
      if (d > radius) continue;

      const targetChest = { x: victim.x, y: victim.y + 1.0, z: victim.z };
      const los = hasLineOfSight(blastOrigin, targetChest, this.map);
      if (!los && d > 2.8) continue;

      const falloff = Math.max(0.15, 1 - d / radius) * (los ? 1.0 : 0.45);
      const dmg = Math.round((gCfg.maxDamage || GRENADE_CONFIG.maxDamage) * falloff);
      let armorShredded = 0;

      if (grenadeType === 'ap') {
        // Armor-Piercing Breach Grenade: shatters up to 150 Kevlar + BR Helmet armor!
        const shred = Math.round((gCfg.armorShred || 150) * Math.max(0.45, falloff));
        if (victim.armor > 0) {
          armorShredded = Math.min(victim.armor, shred);
          victim.armor = Math.max(0, victim.armor - armorShredded);
        }
        if (victim.gear?.helmetArmor > 0) {
          victim.gear.helmetArmor = Math.max(0, victim.gear.helmetArmor - shred);
        }
      }

      if (dmg <= 2 && armorShredded <= 0) continue;

      victim.lastDamagedAt = now;
      victim.hp = Math.max(0, victim.hp - dmg);
      if (attacker.id && attacker.id !== victim.id) {
        this.sendTo(attacker.id, {
          type: 'hit_confirm',
          targetId: victim.id,
          damage: dmg,
          hitZone: armorShredded > 0 ? 'armor_break' : 'body',
          killed: victim.hp <= 0
        });
      }
      this.sendTo(victim.id, {
        type: 'damage_taken',
        fromX: g.x,
        fromZ: g.z,
        damage: dmg,
        armorBroken: armorShredded > 0,
        hp: victim.hp,
        armor: victim.armor
      });

      if (victim.hp <= 0) {
        this.handleKill(this.combatants.get(g.ownerId) || attacker, victim, grenadeType === 'frag' ? 'grenade' : grenadeType, false, now);
      }
    }
  }

  tickTacticalZones(now) {
    // Expire old smoke clouds
    for (let i = this.smokeZones.length - 1; i >= 0; i--) {
      if (now >= this.smokeZones[i].expiresAt) this.smokeZones.splice(i, 1);
    }
    // Tick burning Molotov fire zones (DoT every 350ms)
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const fz = this.fireZones[i];
      if (now >= fz.expiresAt) {
        this.fireZones.splice(i, 1);
        continue;
      }
      if (now - fz.lastTickAt < 350) continue;
      fz.lastTickAt = now;

      const attacker = this.combatants.get(fz.ownerId) || { id: fz.ownerId, name: fz.ownerName, team: fz.ownerTeam };
      const tickDmg = Math.round((GRENADE_TYPES.molotov.dps || 18) * 0.35);
      for (const victim of this.getLivingCombatants()) {
        if (this.modeConfig.teamBased && victim.team === fz.ownerTeam && victim.id !== fz.ownerId) continue;
        const dXZ = Math.hypot(victim.x - fz.x, victim.z - fz.z);
        if (dXZ > fz.radius || Math.abs(victim.y - fz.y) > 2.4) continue;
        victim.lastDamagedAt = now;
        victim.hp = Math.max(0, victim.hp - tickDmg);
        if (attacker.id && attacker.id !== victim.id) {
          this.sendTo(attacker.id, {
            type: 'hit_confirm',
            targetId: victim.id,
            damage: tickDmg,
            hitZone: 'burn',
            killed: victim.hp <= 0
          });
        }
        this.sendTo(victim.id, {
          type: 'damage_taken',
          fromX: fz.x,
          fromZ: fz.z,
          damage: tickDmg,
          hp: victim.hp,
          armor: victim.armor
        });
        if (victim.hp <= 0) {
          this.handleKill(attacker, victim, 'molotov', false, now);
        }
      }
    }
  }

  isSightBlockedBySmoke(p1, p2) {
    if (!this.smokeZones || this.smokeZones.length === 0) return false;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    if (lenSq < 0.001) return false;
    for (let i = 0; i < this.smokeZones.length; i++) {
      const sz = this.smokeZones[i];
      const t = Math.max(0, Math.min(1, ((sz.x - p1.x) * dx + (sz.y - p1.y) * dy + (sz.z - p1.z) * dz) / lenSq));
      const cx = p1.x + dx * t - sz.x;
      const cy = p1.y + dy * t - sz.y;
      const cz = p1.z + dz * t - sz.z;
      if (cx * cx + cy * cy + cz * cz <= sz.radius * sz.radius) return true;
    }
    return false;
  }

  handleRadioCommand(playerId, radioKey) {
    const sender = this.combatants.get(playerId);
    if (!sender) return;
    const cmd = RADIO_COMMANDS.find((r) => r.key === String(radioKey));
    if (!cmd) return;

    this.addChatMessage(playerId, cmd.text, this.modeConfig.teamBased ? 'team' : 'all', true);
  }

  applyWeaponDamage(attacker, victim, wStats, hitZone, dist, now, heavyMelee = false, pelletCount = 1) {
    if (victim.dead || victim.dropPhase === 'plane') return;
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

    let hpDamage = rawDmg;
    if (hitZone === 'head' && this.mode === 'survival' && victim.gear?.helmetTier > 0 && victim.gear.helmetArmor > 0) {
      const hm = BR_HELMETS[victim.gear.helmetTier];
      const reduceRatio = hm?.headReduce || 0.3;
      const hmDmg = Math.min(victim.gear.helmetArmor, Math.round(rawDmg * reduceRatio * 1.15));
      hpDamage = rawDmg * (1 - reduceRatio);
      victim.gear.helmetArmor = Math.max(0, victim.gear.helmetArmor - hmDmg);
      if (victim.gear.helmetArmor <= 0) {
        victim.gear.helmetTier = 0;
        victim.gear.helmetMax = 0;
      }
      this.sendInventorySync(victim);
    } else if (victim.armor > 0) {
      const vestCfg = this.mode === 'survival' && victim.gear?.vestTier ? BR_VESTS[victim.gear.vestTier] : null;
      const absorbRatio = hitZone === 'head' ? PHYSICS.ARMOR_ABSORB_HEAD : (vestCfg?.bodyReduce || PHYSICS.ARMOR_ABSORB_BODY);
      const armorDamage = Math.min(victim.armor, Math.round(rawDmg * absorbRatio));
      hpDamage = rawDmg - armorDamage * 0.85;
      victim.armor = Math.max(0, victim.armor - armorDamage);
      if (this.mode === 'survival' && victim.armor <= 0 && victim.gear) {
        victim.gear.vestTier = 0;
        victim.maxArmor = 0;
        this.sendInventorySync(victim);
      }
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
    if (!victim || victim.dead) return;
    victim.dead = true;
    victim.hp = 0;
    victim.deaths += 1;
    victim.currentStreak = 0;
    victim.reloadingUntil = 0;
    this._tickLiving = null;

    if (victim.hasBomb && this.mode === 'bomb' && !this.bombState.planted) {
      this.dropBombFromPlayer(victim);
    }

    if (this.mode === 'survival') {
      const boxItems = [];
      const addItem = (obj) => boxItems.push({ itemId: 'it_' + randHex(4), ...obj });

      for (const sNum of [1, 2]) {
        const ws = victim.weaponsState?.[sNum];
        if (ws?.id && WEAPONS[ws.id]) {
          const curMag = victim.slot === sNum ? victim.ammo : (ws.ammo || 0);
          addItem({
            kind: 'weapon',
            weaponId: ws.id,
            ammo: curMag,
            bonusAmmo: 0,
            label: `${WEAPONS[ws.id].name} (${curMag}v)`
          });
        }
      }

      for (const [aType, qty] of Object.entries(victim.backpack?.ammo || {})) {
        if (qty > 0) {
          addItem({ kind: 'ammo', ammoType: aType, qty, label: `${BR_AMMO_TYPES[aType]?.name || aType} ×${qty}` });
        }
      }

      for (const [mId, qty] of Object.entries(victim.backpack?.meds || {})) {
        if (qty > 0) {
          addItem({ kind: 'med', medId: mId, qty, label: `${BR_MEDS[mId]?.name || mId} ×${qty}` });
        }
      }

      const grQty = Math.max(victim.grenades || 0, victim.backpack?.frag_grenade || 0);
      if (grQty > 0) {
        addItem({ kind: 'grenade', qty: grQty, label: `Lựu Đạn Nổ ×${grQty}` });
      }

      if (victim.gear?.vestTier > 0 && victim.armor > 0) {
        addItem({
          kind: 'vest',
          tier: victim.gear.vestTier,
          armor: victim.armor,
          maxArmor: victim.maxArmor,
          label: `${BR_VESTS[victim.gear.vestTier]?.name || 'Áo Giáp'} (${victim.armor} AP)`
        });
      }
      if (victim.gear?.helmetTier > 0 && victim.gear.helmetArmor > 0) {
        addItem({
          kind: 'helmet',
          tier: victim.gear.helmetTier,
          helmetArmor: victim.gear.helmetArmor,
          maxHelmet: victim.gear.helmetMax,
          label: `${BR_HELMETS[victim.gear.helmetTier]?.name || 'Mũ Bảo Hộ'} (${victim.gear.helmetArmor} AP)`
        });
      }
      if (victim.gear?.bagTier > 0) {
        addItem({
          kind: 'bag',
          tier: victim.gear.bagTier,
          capacity: BR_BACKPACKS[victim.gear.bagTier]?.capacity,
          label: BR_BACKPACKS[victim.gear.bagTier]?.name || 'Balo'
        });
      }

      // Clear victim inventory after spawning their Death Box
      if (boxItems.length > 0) {
        const dropY = this.map.terrain ? Math.max(victim.y, this.map.terrain.floorAt(victim.x, victim.z)) : victim.y;
        const deathBox = this.createLootCrate(
          { kind: 'deathbox', ownerName: victim.name, items: boxItems },
          victim.x,
          dropY,
          victim.z
        );
        this.lootCrates.push(deathBox);
        this.broadcast({ type: 'loot_spawned', crates: [deathBox] });
      }
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
    this._tickSeq = (this._tickSeq || 0) + 1;

    // Build O(1) cached living combatants + human positions ONCE per tick (eliminates ~1,500 array allocs/sec in 50-bot BR!)
    const living = [];
    const humanCoords = [];
    for (const c of this.combatants.values()) {
      if (!c.dead) {
        living.push(c);
        if (!c.isBot) humanCoords.push(c);
      }
    }
    this._tickLiving = living;
    const isHeavyLobby = this.combatants.size > 14;
    const nearHumanDistSq = 240 * 240;

    try {
      // Passive HP Regen (Phoenix Operator) every 1s
      const doRegen = now - this.lastRegenTickAt >= 1000;
      if (doRegen) this.lastRegenTickAt = now;

      if (this.mode === 'survival' && this.dropPlane?.active) {
        const dp = this.dropPlane;
        if (now >= dp.startAt) {
          const span = Math.max(1, dp.endAt - dp.startAt);
          const u = Math.min(1, (now - dp.startAt) / span);
          dp.x = dp.startX + (dp.endX - dp.startX) * u;
          dp.z = dp.startZ + (dp.endZ - dp.startZ) * u;
        }
        for (const p of this.combatants.values()) {
          if (!p.dead && p.dropPhase === 'plane') {
            p.x = dp.x;
            p.y = dp.y;
            p.z = dp.z;
            if (now >= dp.endAt) {
              p.dropPhase = 'skydive';
              p.x += (Math.random() - 0.5) * 4;
              p.y = dp.y - 2.2;
              p.z += (Math.random() - 0.5) * 4;
              p.vy = -13;
            }
          }
        }
        if (now >= dp.endAt) {
          dp.active = false;
          this.broadcast({ type: 'drop_plane_ended' });
        }
      }

      let botSlotIdx = 0;
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

        // Spatial AI & Physics LOD for heavy 50-player lobbies:
        // Bots near any human run full 30Hz AI & physics; bots >240m away from all humans run AI at 7.5Hz & lightweight step!
        let isFarBot = false;
        let runBotAiThisTick = true;
        if (p.isBot && isHeavyLobby && humanCoords.length > 0 && p.dropPhase === 'ground') {
          botSlotIdx++;
          isFarBot = true;
          for (let h = 0; h < humanCoords.length; h++) {
            const hc = humanCoords[h];
            const dx = p.x - hc.x, dz = p.z - hc.z;
            if (dx * dx + dz * dz < nearHumanDistSq) {
              isFarBot = false;
              break;
            }
          }
          if (isFarBot && ((this._tickSeq + botSlotIdx) & 3) !== 0) {
            runBotAiThisTick = false;
          }
        }

        if (p.isBot && this.roundPhase === 'live' && runBotAiThisTick) {
          updateBotAI(p, this, isFarBot ? Math.min(0.16, dt * 4) : dt, now);
        }

        // Only step physics on server for AI Bots or human players without recent client-predicted position packets
        if (p.isBot || (this.mode === 'survival' && p.dropPhase === 'plane') || now - (p.lastClientPosAt || 0) > 450) {
          if (this.mode === 'survival' && p.dropPhase && p.dropPhase !== 'ground') {
            stepAirbornePhysics(p, p.input, this.map, dt, this.dropPlane);
          } else if (isFarBot && !runBotAiThisTick) {
            // Fast ground-clamped drift for distant off-screen bots (skips expensive multi-pass AABB depenetration!)
            const spd = (p.input.sprint ? 6.8 : 4.8) * (p.input.forward || 0);
            if (spd !== 0) {
              p.x = Math.max(-this.map.bounds.halfW + 1, Math.min(this.map.bounds.halfW - 1, p.x - Math.sin(p.input.yaw || 0) * spd * dt));
              p.z = Math.max(-this.map.bounds.halfD + 1, Math.min(this.map.bounds.halfD - 1, p.z - Math.cos(p.input.yaw || 0) * spd * dt));
              if (this.map.terrain) p.y = this.map.terrain.floorAt(p.x, p.z);
            }
          } else {
            const wStats = this.getPlayerWeaponStats(p);
            stepPlayerPhysics(p, p.input, this.map, dt, wStats.moveSpeedMult, op.speedMult);
          }
        }
        p.yaw = p.input.yaw;
        p.pitch = p.input.pitch;
        p.sprinting = Boolean(p.input.sprint && p.input.forward > 0 && !p.crouching && !p.input.ads);
        p.ads = Boolean(p.input.ads);
      }

      if (this.grenades.length > 0) {
        this.tickGrenades(dt, now);
      }
      if (this.smokeZones.length > 0 || this.fireZones.length > 0) {
        this.tickTacticalZones(now);
      }

      if (this.mode === 'bomb') {
        this.tickBombMode(dt, now);
      } else if (this.mode === 'survival') {
        this.tickSurvivalMode(dt, now);
        this._tickLiving = null;
        this.checkMatchOrRoundWinConditions(now);
        if (this.status !== 'playing') return;
      }

      if (now >= this.matchEndsAt && this.mode !== 'bomb') {
        this.endMatch('time_up');
        return;
      }

      // Pace world snapshots to 20Hz (50ms) in arenas and 15Hz (66ms) in 50-player BR (client interpolates smoothly at 60-144Hz)
      const snapIntervalMs = isHeavyLobby ? 65 : 48;
      if (!this._lastSnapshotAt || now - this._lastSnapshotAt >= snapIntervalMs) {
        this._lastSnapshotAt = now;
        this.broadcastSnapshot(now);
      }
    } finally {
      this._tickLiving = null;
    }
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
    this.smokeZones = [];
    this.fireZones = [];

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

    // Mid-match high-tier Airdrop Supply Crate near safe center (Level 3 Kit + Elite Sniper/LMG)
    const airdropDelay = this.map.bounds.halfW > 500 ? 75000 : 45000;
    if (!this.airdropSpawned && this.matchStartedAt && now - this.matchStartedAt >= airdropDelay) {
      this.airdropSpawned = true;
      const wps = this.map.waypoints || [{ x: this.storm.x, z: this.storm.z }];
      let dropPt = wps[0] || { x: this.storm.x, z: this.storm.z };
      let bestDist = Infinity;
      for (const wp of wps) {
        const d = Math.hypot(wp.x - this.storm.x, wp.z - this.storm.z);
        if (d < bestDist) { bestDist = d; dropPt = wp; }
      }
      const elitePool = ['awp', 'barrett', 'm249', 'scarh', 'm200', 'groza', 'mcx', 'pkm', 'mg3', 'm24', 'mk14'].filter((id) => Boolean(WEAPONS[id]));
      const eliteId = elitePool[Math.floor(Math.random() * elitePool.length)] || 'ak47';
      const dropY = this.map.terrain ? this.map.terrain.floorAt(dropPt.x, dropPt.z) : 0;
      const airdropCrates = [
        this.createLootCrate({ kind: 'weapon', weaponId: eliteId, bonusAmmo: 60 }, dropPt.x, dropY, dropPt.z),
        this.createLootCrate({ kind: 'vest', tier: 3 }, dropPt.x + 1.2, dropY, dropPt.z + 0.8),
        this.createLootCrate({ kind: 'helmet', tier: 3 }, dropPt.x - 1.2, dropY, dropPt.z + 0.8),
        this.createLootCrate({ kind: 'bag', tier: 3 }, dropPt.x, dropY, dropPt.z - 1.3),
        this.createLootCrate({ kind: 'med', medId: 'medkit', qty: 1 }, dropPt.x + 0.8, dropY, dropPt.z - 0.8)
      ];
      this.lootCrates.push(...airdropCrates);
      this.broadcast({ type: 'loot_spawned', crates: airdropCrates });
      this.broadcast({
        type: 'system_toast',
        text: `TIẾP TẾ ĐẶC BIỆT (${WEAPONS[eliteId]?.name || eliteId} + Giáp/Mũ/Balo Lv.3) đã rơi tại khu vực an toàn!`
      });
    }

    const living = this.getLivingCombatants();
    const spawnedLoot = [];

    // AI Bot auto-healing when damaged and carrying meds
    for (const bot of living) {
      if (!bot.isBot || bot.hp >= 65 || bot.dropPhase !== 'ground') continue;
      if (now - (bot.lastBotHealAt || 0) < 2800) continue;
      const healOrder = ['firstaid', 'medkit', 'bandage', 'energy'];
      for (const mId of healOrder) {
        if (bot.backpack?.meds?.[mId] > 0 && bot.hp < (BR_MEDS[mId]?.maxCap || 100)) {
          bot.lastBotHealAt = now;
          bot.backpack.meds[mId] -= 1;
          bot.hp = Math.min(BR_MEDS[mId].maxCap, bot.hp + BR_MEDS[mId].heal);
          break;
        }
      }
    }

    for (const crate of this.lootCrates) {
      if (!crate.active) continue;
      for (const p of living) {
        if (p.dropPhase && p.dropPhase !== 'ground') continue;
        if (Math.hypot(p.x - crate.x, p.z - crate.z) < 2.1 && Math.abs(p.y - crate.y) < 2.6) {
          if (crate.kind === 'deathbox') {
            // Humans open Death Box selectively via Tab/I or pressing E; AI Bots can scavenge 1 item per pass
            if (!p.isBot) continue;
            if (!crate.items || crate.items.length === 0) {
              crate.active = false;
              continue;
            }
            let lootedSomething = false;
            for (let ii = crate.items.length - 1; ii >= 0; ii--) {
              const sub = crate.items[ii];
              const res = this.addBrItemToPlayer(p, sub, now, false);
              if (res.ok) {
                lootedSomething = true;
                if (res.consumedAll) crate.items.splice(ii, 1);
                else if (res.takenQty > 0 && sub.qty !== undefined) sub.qty -= res.takenQty;
                break;
              }
            }
            if (lootedSomething) {
              if (crate.items.length === 0) {
                crate.active = false;
                this.broadcast({ type: 'loot_picked', crateId: crate.id, playerId: p.id, kind: 'deathbox', label: crate.label, hp: p.hp, armor: p.armor, maxArmor: p.maxArmor, ammo: p.ammo, reserveAmmo: p.reserveAmmo, grenades: p.grenades });
              } else {
                this.broadcast({ type: 'loot_updated', crate });
              }
              break;
            }
            continue;
          }

          // Ground crates: Humans & Bots auto-pick non-conflicting essentials, or swap on [E] interact
          const wantsInteract = Boolean(p.input?.interact && now - (p.lastLootSwapAt || 0) > 650);
          if (crate.kind === 'weapon') {
            const s1Empty = !p.weaponsState?.[1]?.id;
            const s2Empty = !p.weaponsState?.[2]?.id;
            let targetSlot;
            if (s1Empty) targetSlot = 1;
            else if (s2Empty) targetSlot = 2;
            else targetSlot = p.slot === 2 ? 2 : 1;

            const slotEmpty = !p.weaponsState?.[targetSlot]?.id;
            if (!slotEmpty && (!wantsInteract || p.isBot)) continue;
            if (!slotEmpty && wantsInteract) p.lastLootSwapAt = now;
          } else if (crate.kind === 'vest') {
            if ((crate.tier || 1) <= (p.gear?.vestTier || 0) && !wantsInteract) continue;
          } else if (crate.kind === 'helmet') {
            if ((crate.tier || 1) <= (p.gear?.helmetTier || 0) && !wantsInteract) continue;
          } else if (crate.kind === 'bag') {
            if ((crate.tier || 1) <= (p.gear?.bagTier || 0)) continue;
          }

          const res = this.addBrItemToPlayer(p, crate, now, wantsInteract);
          if (!res.ok) continue;

          for (const ov of res.overflow) {
            spawnedLoot.push(
              this.createLootCrate(ov, crate.x + (Math.random() - 0.5) * 0.7, crate.y, crate.z + (Math.random() - 0.5) * 0.7)
            );
          }

          if (res.consumedAll) {
            crate.active = false;
            this.broadcast({
              type: 'loot_picked',
              crateId: crate.id,
              playerId: p.id,
              kind: crate.kind || crate.type,
              lootType: crate.type,
              weaponId: crate.weaponId || null,
              label: crate.label || crate.type,
              hp: p.hp,
              armor: p.armor,
              maxArmor: p.maxArmor,
              ammo: p.ammo,
              reserveAmmo: p.reserveAmmo,
              grenades: p.grenades,
              primary: p.primary,
              secondary: p.secondary,
              weaponsState: p.weaponsState
            });
          } else {
            if (res.takenQty > 0 && crate.qty !== undefined) {
              crate.qty -= res.takenQty;
              const unitCfg = crate.kind === 'ammo' ? BR_AMMO_TYPES[crate.ammoType] : BR_MEDS[crate.medId];
              crate.label = `${unitCfg?.name || crate.kind} ×${crate.qty}`;
            }
            this.broadcast({ type: 'loot_updated', crate });
          }
          break;
        }
      }
    }

    if (spawnedLoot.length > 0) {
      this.lootCrates.push(...spawnedLoot);
      this.broadcast({ type: 'loot_spawned', crates: spawnedLoot });
    }

    if (now - this.lastStormDamageAt >= 1000) {
      this.lastStormDamageAt = now;
      for (const p of living) {
        if (p.dropPhase === 'plane') continue;
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
      const alive = [];
      for (const p of this.combatants.values()) {
        if (!p.dead) alive.push(p);
      }
      const hadOpponents = this.combatants.size >= 2 || (this.initialCombatantsCount || 0) >= 2;
      if (alive.length <= 1 && hadOpponents) {
        if (alive[0]) alive[0].score += 300;
        this.endMatch('last_survivor');
      }
    }
  }

  async endMatch(reason = 'completed') {
    if (this.status !== 'playing') return;
    this.status = 'waiting';
    this._tickLiving = null;
    this.stopMatchLoop();

    let winnerTeam = null;
    let winnerPlayerId = null;
    if (this.modeConfig.teamBased) {
      winnerTeam = this.alphaScore > this.bravoScore ? 'alpha' : (this.bravoScore > this.alphaScore ? 'bravo' : 'draw');
    } else if (this.mode === 'survival') {
      const alive = [];
      for (const p of this.combatants.values()) {
        if (!p.dead) alive.push(p);
      }
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
    const r2 = (v) => Math.round((v || 0) * 100) / 100;
    const isBR = this.mode === 'survival';
    this._snapSeq = (this._snapSeq || 0) + 1;
    const useAoi = isBR && this.combatants.size > 16 && (this._snapSeq & 3) !== 0;

    let aliveCount = 0;
    const allSnaps = [];
    for (const p of this.combatants.values()) {
      if (!p.dead) aliveCount++;
      const snap = {
        id: p.id,
        x: r2(p.x),
        y: r2(p.y),
        z: r2(p.z),
        vx: r2(p.vx),
        vy: r2(p.vy),
        vz: r2(p.vz),
        yaw: r2(p.yaw),
        pitch: r2(p.pitch),
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
      };
      if (isBR) {
        snap.dp = p.dropPhase === 'plane' ? 1 : (p.dropPhase === 'skydive' ? 2 : (p.dropPhase === 'parachute' ? 3 : 0));
      }
      allSnaps.push(snap);
    }

    const endsAt = this.mode === 'bomb' ? this.roundEndsAt : this.matchEndsAt;
    const timeLeftSec = Math.max(0, Math.ceil((endsAt - now) / 1000));

    const basePayload = {
      type: 'world_state',
      t: now,
      endsAt,
      alphaScore: this.alphaScore,
      bravoScore: this.bravoScore,
      roundNumber: this.roundNumber,
      timeLeftSec,
      aliveCount
    };

    if (this.grenades.length > 0) {
      basePayload.grenades = this.grenades.map((g) => ({
        id: g.id,
        t: g.grenadeType || 'frag',
        x: r2(g.x),
        y: r2(g.y),
        z: r2(g.z)
      }));
    }

    if (this.mode === 'bomb') {
      basePayload.bomb = {
        planted: this.bombState.planted,
        siteId: this.bombState.siteId,
        x: this.bombState.x,
        y: this.bombState.y,
        z: this.bombState.z,
        bombLeftSec: this.bombState.planted ? Math.max(0, Math.round(((this.bombState.explodeAt - now) / 100)) / 10) : 0,
        plantProg: r2(this.bombState.plantProgress),
        planterId: this.bombState.planterId,
        defuseProg: r2(this.bombState.defuseProgress),
        defuserId: this.bombState.defuserId,
        dropped: this.bombState.dropped,
        dropX: this.bombState.dropX,
        dropZ: this.bombState.dropZ
      };
    } else if (this.mode === 'survival' && this.storm) {
      basePayload.storm = {
        x: Math.round(this.storm.x * 10) / 10,
        z: Math.round(this.storm.z * 10) / 10,
        r: r2(this.storm.radius)
      };
      if (this.dropPlane?.active) {
        basePayload.dropPlane = {
          active: true,
          x: r2(this.dropPlane.x),
          y: r2(this.dropPlane.y),
          z: r2(this.dropPlane.z),
          yaw: r2(this.dropPlane.yaw),
          startX: this.dropPlane.startX,
          startZ: this.dropPlane.startZ,
          endX: this.dropPlane.endX,
          endZ: this.dropPlane.endZ,
          startAt: this.dropPlane.startAt,
          endAt: this.dropPlane.endAt
        };
      }
    }

    if (useAoi) {
      // Spatial Interest Management (AOI): only send nearby combatants (<290m) on partial ticks — cuts BR bandwidth & client JSON work by ~75%!
      const aoiDistSq = 290 * 290;
      for (const h of this.combatants.values()) {
        if (h.isBot) continue;
        const hx = h.x, hz = h.z;
        const nearPlayers = [];
        for (let i = 0; i < allSnaps.length; i++) {
          const s = allSnaps[i];
          if (s.id === h.id) {
            nearPlayers.push(s);
            continue;
          }
          if (s.dead) continue;
          const dx = s.x - hx, dz = s.z - hz;
          if (dx * dx + dz * dz <= aoiDistSq) {
            nearPlayers.push(s);
          }
        }
        this.sendTo(h.id, { ...basePayload, partial: 1, players: nearPlayers });
      }
      return;
    }

    basePayload.players = allSnaps;
    this.broadcast(basePayload);
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
      selectedMode: this.selectedMode,
      rankedSubMode: this.rankedSubMode,
      isRanked: Boolean(this.modeConfig.isRanked),
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

  handleVoiceSignal(senderId, msg = {}) {
    if (!this.modeConfig?.teamBased) return;
    const sender = this.combatants.get(senderId);
    const target = this.combatants.get(msg.targetId);
    if (!sender || !target || target.isBot || sender.id === target.id) return;
    if (sender.team !== target.team) return;

    this.sendTo(target.id, {
      type: 'voice_signal',
      fromId: sender.id,
      kind: msg.kind,
      sessionId: msg.sessionId,
      sdp: msg.sdp,
      candidate: msg.candidate
    });
  }

  handleVoiceAudio(senderId, msg = {}) {
    if (!this.modeConfig?.teamBased) return;
    const sender = this.combatants.get(senderId);
    if (!sender) return;
    if (typeof msg.audio !== 'string' || !msg.audio.length || msg.audio.length > 16000) return;

    const targetFilter = Array.isArray(msg.targetIds) && msg.targetIds.length ? new Set(msg.targetIds) : null;
    const payload = {
      type: 'voice_audio',
      fromId: sender.id,
      audio: msg.audio,
      sr: Number(msg.sr) || 12000,
      seq: Number(msg.seq) || 0
    };

    for (const p of this.getHumanPlayers()) {
      if (p.id === sender.id || p.team !== sender.team) continue;
      if (targetFilter && !targetFilter.has(p.id)) continue;
      this.sendTo(p.id, payload);
    }
  }

  sendTo(playerId, data) {
    this.sendToFn(playerId, data);
  }

  broadcast(data) {
    this.broadcastFn(data);
  }
}
