// Human-Priority Matchmaking Pool & Bot-Swapper for Multiplayer FPS
import { GAME_MODES } from '../shared/constants.js';

export class HumanPriorityMatchmaker {
  constructor({ rooms, createRoom, leaveCurrentRoom, sendToClient, addClientToRoom }) {
    this.rooms = rooms;
    this.createRoom = createRoom;
    this.leaveCurrentRoom = leaveCurrentRoom;
    this.sendToClient = sendToClient;
    this.addClientToRoom = addClientToRoom;
    this.queues = new Map(); // mode -> { mode, entries: [], expiresAt, timer }
    this.queueWindowMs = 8500;
    this.fastPairWindowMs = 3500;
  }

  findOpenHumanRoom(desiredMode, desiredMap = null, now = Date.now()) {
    if (desiredMode === 'practice') return null;

    const candidates = [...this.rooms.values()].filter((r) => {
      if (r.mode !== desiredMode) return false;
      const humans = r.getHumanPlayers().length;
      if (humans <= 0 || humans >= r.maxPlayers) return false;
      if (r.status === 'waiting') return true;

      // Active match still early enough for humans to join cleanly (and replace bots!)
      const ageMs = r.matchStartedAt ? now - r.matchStartedAt : Infinity;
      if (desiredMode === 'survival') {
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

  computeBotFillPolicy(mode, humanCount) {
    if (mode === 'practice') {
      return { fillBots: true, targetBotFillCount: 5, maxPlayers: 6 };
    }
    if (mode === 'survival') {
      return { fillBots: true, targetBotFillCount: null, maxPlayers: 50 };
    }
    const modeMax = GAME_MODES[mode]?.maxPlayers || 10;
    if (humanCount >= 2) {
      if (mode === 'ffa') {
        const extra = humanCount >= 4 ? 0 : 4 - humanCount;
        return { fillBots: extra > 0, targetBotFillCount: extra, maxPlayers: modeMax };
      }
      // Team modes (tdm, bomb, ranked): play pure human-vs-human when even, add at most 1 balancing bot if odd
      const balanceBot = humanCount % 2 === 1 ? 1 : 0;
      return { fillBots: balanceBot > 0, targetBotFillCount: balanceBot, maxPlayers: modeMax };
    }
    // Single solo human after search timeout: light 3v3 or 6-player warm-up until another human hot-joins
    return { fillBots: true, targetBotFillCount: mode === 'ffa' ? 5 : 5, maxPlayers: modeMax };
  }

  broadcastQueueStatus(q, now = Date.now()) {
    if (!q || q.entries.length === 0) return;
    const waitLeftSec = Math.max(0, Math.ceil((q.expiresAt - now) / 1000));
    for (const entry of q.entries) {
      this.sendToClient(entry.client, {
        type: 'queue_status',
        mode: q.mode,
        modeName: GAME_MODES[q.mode]?.shortName || q.mode,
        searchingHumans: q.entries.length,
        waitLeftSec,
        maxWaitSec: Math.ceil(this.queueWindowMs / 1000)
      });
    }
  }

  removeClient(clientId, silent = false) {
    for (const [mode, q] of this.queues.entries()) {
      const idx = q.entries.findIndex((e) => e.client.id === clientId);
      if (idx !== -1) {
        const [removed] = q.entries.splice(idx, 1);
        if (!silent && removed) {
          this.sendToClient(removed.client, { type: 'queue_cancelled', mode });
        }
        if (q.entries.length === 0) {
          if (q.timer) clearInterval(q.timer);
          this.queues.delete(mode);
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
    const mapId = options.mapId || null;
    this.leaveCurrentRoom(client);
    this.removeClient(client.id, true);

    const now = Date.now();

    // Practice range skips PvP matchmaking queue immediately
    if (mode === 'practice') {
      const room = this.createRoom({
        name: `Trường Bắn của ${client.username}`,
        mode: 'practice',
        mapId: mapId || 'warehouse',
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
    const openHumanRoom = this.findOpenHumanRoom(mode, mapId, now);
    if (openHumanRoom) {
      const useBotSwap = openHumanRoom.status === 'playing' && openHumanRoom.getBots().length > 0;
      this.addClientToRoom(client, openHumanRoom, useBotSwap);
      if (openHumanRoom.status === 'waiting') {
        openHumanRoom.startMatch(openHumanRoom.hostId || client.id);
      }
      return { action: useBotSwap ? 'swapped_bot' : 'joined_human_room', room: openHumanRoom };
    }

    // Step 2: Join waiting pool for this mode so concurrent humans match together
    let q = this.queues.get(mode);
    if (!q) {
      q = {
        mode,
        entries: [],
        expiresAt: now + this.queueWindowMs,
        timer: null
      };
      q.timer = setInterval(() => {
        const curNow = Date.now();
        if (curNow >= q.expiresAt) {
          this.flushQueue(mode);
        } else {
          this.broadcastQueueStatus(q, curNow);
        }
      }, 1000);
      this.queues.set(mode, q);
    }

    q.entries.push({ client, mapId, joinedAt: now });

    // Once >=2 humans are in pool, launch shortly while giving stragglers a brief 3.5s window
    const fastLaunchThreshold = mode === 'survival' ? 10 : 6;
    if (q.entries.length >= fastLaunchThreshold) {
      return this.flushQueue(mode);
    }
    if (q.entries.length >= 2) {
      q.expiresAt = Math.min(q.expiresAt, now + this.fastPairWindowMs);
    }

    this.broadcastQueueStatus(q, now);
    return { action: 'queued', mode, searchingHumans: q.entries.length };
  }

  forceLaunchClientQueue(clientId) {
    for (const [mode, q] of this.queues.entries()) {
      if (q.entries.some((e) => e.client.id === clientId)) {
        return this.flushQueue(mode);
      }
    }
    return null;
  }

  flushQueue(mode) {
    const q = this.queues.get(mode);
    if (!q) return null;
    if (q.timer) clearInterval(q.timer);

    const modeCap = mode === 'survival' ? 50 : (GAME_MODES[mode]?.maxPlayers || 10);
    const batch = q.entries.splice(0, modeCap);
    if (q.entries.length === 0) {
      this.queues.delete(mode);
    }
    if (batch.length === 0) return null;

    const chosenMap =
      batch.find((e) => e.mapId)?.mapId ||
      (mode === 'survival' ? 'br_island' : (mode === 'ranked' ? 'urban_city' : 'warehouse'));

    const policy = this.computeBotFillPolicy(mode, batch.length);
    const hostEntry = batch[0];
    const room = this.createRoom({
      name: mode === 'survival'
        ? `Sinh Tồn 50P #${Math.floor(100 + Math.random() * 900)}`
        : `Trận Ghép Người #${Math.floor(100 + Math.random() * 900)}`,
      mode,
      mapId: chosenMap,
      maxPlayers: policy.maxPlayers,
      fillBots: policy.fillBots,
      targetBotFillCount: policy.targetBotFillCount,
      botDifficulty: mode === 'ranked' ? 'hard' : 'normal',
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
