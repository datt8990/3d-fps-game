// Human-Priority Matchmaking Pool & Bot-Swapper for Multiplayer FPS
import { GAME_MODES, resolveMapForMode, resolveEffectiveModeConfig } from '../shared/constants.js';

export class HumanPriorityMatchmaker {
  constructor({ rooms, createRoom, leaveCurrentRoom, sendToClient, addClientToRoom }) {
    this.rooms = rooms;
    this.createRoom = createRoom;
    this.leaveCurrentRoom = leaveCurrentRoom;
    this.sendToClient = sendToClient;
    this.addClientToRoom = addClientToRoom;
    this.queues = new Map(); // queueKey -> { queueKey, mode, rankedSubMode, entries: [], expiresAt, timer }
    this.queueWindowMs = 8500;
    this.fastPairWindowMs = 3500;
  }

  findOpenHumanRoom(desiredMode, desiredMap = null, now = Date.now(), rankedSubMode = null) {
    if (desiredMode === 'practice') return null;
    const eff = resolveEffectiveModeConfig(desiredMode, rankedSubMode);

    const candidates = [...this.rooms.values()].filter((r) => {
      if ((r.selectedMode || r.mode) !== eff.selectedMode) return false;
      if (eff.isRanked && (r.rankedSubMode || 'tdm') !== eff.rankedSubMode) return false;
      const humans = r.getHumanPlayers().length;
      if (humans <= 0 || humans >= r.maxPlayers) return false;
      if (r.status === 'waiting') return true;

      // Active match still early enough for humans to join cleanly (and replace bots!)
      const ageMs = r.matchStartedAt ? now - r.matchStartedAt : Infinity;
      if (eff.effectiveMode === 'survival') {
        return Boolean(r.dropPlane?.active) || (ageMs < 25000 && r.getBots().length > 0);
      }
      return ageMs < 95000 && (r.getBots().length > 0 || humans < r.maxPlayers);
    });

    if (candidates.length === 0) return null;

    // Prefer rooms with matching map, waiting status or most real humans already inside
    candidates.sort((a, b) => {
      const aMap = desiredMap && a.mapId === desiredMap ? 1 : 0;
      const bMap = desiredMap && b.mapId === desiredMap ? 1 : 0;
      if (aMap !== bMap) return bMap - aMap;
      return b.getHumanPlayers().length - a.getHumanPlayers().length;
    });
    return candidates[0];
  }

  computeBotFillPolicy(mode, humanCount, rankedSubMode = null) {
    const eff = resolveEffectiveModeConfig(mode, rankedSubMode);
    if (eff.effectiveMode === 'practice') {
      return { fillBots: true, targetBotFillCount: 5, maxPlayers: 6 };
    }
    if (eff.effectiveMode === 'survival') {
      return { fillBots: true, targetBotFillCount: null, maxPlayers: 50 };
    }
    const modeMax = eff.modeConfig?.maxPlayers || 10;
    if (humanCount >= 2) {
      if (eff.effectiveMode === 'ffa') {
        const extra = humanCount >= 4 ? 0 : 4 - humanCount;
        return { fillBots: extra > 0, targetBotFillCount: extra, maxPlayers: modeMax };
      }
      // Team modes (tdm, bomb, ranked): play pure human-vs-human when even, add at most 1 balancing bot if odd
      const balanceBot = humanCount % 2 === 1 ? 1 : 0;
      return { fillBots: balanceBot > 0, targetBotFillCount: balanceBot, maxPlayers: modeMax };
    }
    // Single solo human after search timeout: light 3v3 or 6-player warm-up until another human hot-joins
    return { fillBots: true, targetBotFillCount: 5, maxPlayers: modeMax };
  }

  broadcastQueueStatus(q, now = Date.now()) {
    if (!q || q.entries.length === 0) return;
    const waitLeftSec = Math.max(0, Math.ceil((q.expiresAt - now) / 1000));
    const eff = resolveEffectiveModeConfig(q.mode, q.rankedSubMode);
    for (const entry of q.entries) {
      this.sendToClient(entry.client, {
        type: 'queue_status',
        mode: q.mode,
        rankedSubMode: q.rankedSubMode,
        modeName: eff.modeConfig?.shortName || q.mode,
        searchingHumans: q.entries.length,
        waitLeftSec,
        maxWaitSec: Math.ceil(this.queueWindowMs / 1000)
      });
    }
  }

  removeClient(clientId, silent = false) {
    for (const [qKey, q] of this.queues.entries()) {
      const idx = q.entries.findIndex((e) => e.client.id === clientId);
      if (idx !== -1) {
        const [removed] = q.entries.splice(idx, 1);
        if (!silent && removed) {
          this.sendToClient(removed.client, { type: 'queue_cancelled', mode: q.mode });
        }
        if (q.entries.length === 0) {
          if (q.timer) clearInterval(q.timer);
          this.queues.delete(qKey);
        } else {
          this.broadcastQueueStatus(q);
        }
        return true;
      }
    }
    return false;
  }

  enqueueClient(client, options = {}) {
    const mode = GAME_MODES[options.mode] ? options.mode : 'tdm';
    const eff = resolveEffectiveModeConfig(mode, options.rankedSubMode);
    const rankedSubMode = eff.rankedSubMode;
    const mapId = resolveMapForMode(mode, options.mapId || null, rankedSubMode);
    this.leaveCurrentRoom(client);
    this.removeClient(client.id, true);

    const now = Date.now();

    // Practice range skips PvP matchmaking queue immediately
    if (mode === 'practice') {
      const room = this.createRoom({
        name: `Trường Bắn của ${client.username}`,
        mode: 'practice',
        mapId,
        maxPlayers: 6,
        fillBots: true,
        botDifficulty: 'easy',
        hostId: client.id,
        isMatchmaking: false
      });
      this.addClientToRoom(client, room, false);
      room.startMatch(client.id);
      return { action: 'matched_immediate', room };
    }

    // Step 1: Prioritize joining an existing match that already has real human(s) (swapping a bot out!)
    const openHumanRoom = this.findOpenHumanRoom(mode, mapId, now, rankedSubMode);
    if (openHumanRoom) {
      const useBotSwap = openHumanRoom.status === 'playing' && openHumanRoom.getBots().length > 0;
      this.addClientToRoom(client, openHumanRoom, useBotSwap);
      if (openHumanRoom.status === 'waiting') {
        openHumanRoom.startMatch(openHumanRoom.hostId || client.id);
      }
      return { action: useBotSwap ? 'swapped_bot' : 'joined_human_room', room: openHumanRoom };
    }

    // Step 2: Join waiting pool for this mode (+ ranked sub-mode) so concurrent humans match together
    const qKey = eff.isRanked ? `ranked:${rankedSubMode}` : mode;
    let q = this.queues.get(qKey);
    if (!q) {
      q = {
        queueKey: qKey,
        mode,
        rankedSubMode,
        entries: [],
        expiresAt: now + this.queueWindowMs,
        timer: null
      };
      q.timer = setInterval(() => {
        const curNow = Date.now();
        if (curNow >= q.expiresAt) {
          this.flushQueue(qKey);
        } else {
          this.broadcastQueueStatus(q, curNow);
        }
      }, 1000);
      this.queues.set(qKey, q);
    }

    q.entries.push({ client, mapId, joinedAt: now });

    // Once >=2 humans are in pool, launch shortly while giving stragglers a brief 3.5s window
    const fastLaunchThreshold = eff.effectiveMode === 'survival' ? 10 : 6;
    if (q.entries.length >= fastLaunchThreshold) {
      return this.flushQueue(qKey);
    }
    if (q.entries.length >= 2) {
      q.expiresAt = Math.min(q.expiresAt, now + this.fastPairWindowMs);
    }

    this.broadcastQueueStatus(q, now);
    return { action: 'queued', mode, rankedSubMode, searchingHumans: q.entries.length };
  }

  forceLaunchClientQueue(clientId) {
    for (const [qKey, q] of this.queues.entries()) {
      if (q.entries.some((e) => e.client.id === clientId)) {
        return this.flushQueue(qKey);
      }
    }
    return null;
  }

  flushQueue(qKey) {
    const q = this.queues.get(qKey);
    if (!q) return null;
    if (q.timer) clearInterval(q.timer);

    const eff = resolveEffectiveModeConfig(q.mode, q.rankedSubMode);
    const modeCap = eff.effectiveMode === 'survival' ? 50 : (eff.modeConfig?.maxPlayers || 10);
    const batch = q.entries.splice(0, modeCap);
    if (q.entries.length === 0) {
      this.queues.delete(qKey);
    }
    if (batch.length === 0) return null;

    const chosenMap = resolveMapForMode(
      q.mode,
      batch.find((e) => e.mapId)?.mapId || (eff.isRanked && eff.effectiveMode !== 'survival' ? 'urban_city' : null),
      q.rankedSubMode
    );

    const policy = this.computeBotFillPolicy(q.mode, batch.length, q.rankedSubMode);
    const hostEntry = batch[0];
    const room = this.createRoom({
      name: eff.isRanked
        ? `${eff.modeConfig.shortName} #${Math.floor(100 + Math.random() * 900)}`
        : (eff.effectiveMode === 'survival'
          ? `Sinh Tồn 50P #${Math.floor(100 + Math.random() * 900)}`
          : `Trận Ghép Người #${Math.floor(100 + Math.random() * 900)}`),
      mode: q.mode,
      rankedSubMode: q.rankedSubMode,
      mapId: chosenMap,
      maxPlayers: policy.maxPlayers,
      fillBots: policy.fillBots,
      targetBotFillCount: policy.targetBotFillCount,
      botDifficulty: eff.isRanked ? 'hard' : 'normal',
      hostId: hostEntry.client.id,
      isMatchmaking: true
    });

    for (const entry of batch) {
      this.leaveCurrentRoom(entry.client);
      this.addClientToRoom(entry.client, room, false);
    }

    room.startMatch(hostEntry.client.id);
    return { action: 'launched_room', room, humanCount: batch.length };
  }
}
