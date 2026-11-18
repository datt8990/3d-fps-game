// Node.js WebSocket Wrapper around Universal GameRoomCore
import { GameRoomCore } from '../shared/engine/gameRoomCore.js';
import { gameDB } from './db.js';

export class ServerGameRoom extends GameRoomCore {
  constructor(options, onEmptyCallback, onRoomListChanged) {
    super(options, {
      sendTo: (playerId, data) => {
        const ws = this.clients.get(playerId);
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
      },
      broadcast: (data) => {
        const raw = JSON.stringify(data);
        for (const ws of this.clients.values()) {
          if (ws.readyState === 1) ws.send(raw);
        }
      },
      onEmpty: onEmptyCallback,
      onListChanged: onRoomListChanged,
      onMatchEnded: async ({ mode, mapName, isRanked, isPractice, winnerTeam, winnerPlayerId, humans }) => {
        const rewardsByPlayer = {};
        for (const p of humans) {
          const won = this.modeConfig.teamBased ? p.team === winnerTeam : p.id === winnerPlayerId;
          if (p.userId) {
            const reward = gameDB.recordMatchResult(p.userId, {
              mode,
              mapName,
              won,
              kills: p.kills,
              deaths: p.deaths,
              assists: p.assists,
              headshots: p.headshots,
              isRanked,
              isPractice
            });
            if (reward) {
              p.rp = reward.newRp;
              p.rank = reward.rank;
              rewardsByPlayer[p.id] = reward;
            }
          }
        }
        return rewardsByPlayer;
      }
    });

    this.clients = new Map(); // playerId -> ws
  }

  addWsPlayer(clientInfo, ws) {
    const acc = clientInfo.userId ? gameDB.getUserById(clientInfo.userId) : null;
    this.clients.set(clientInfo.id, ws);
    const res = this.addHumanPlayer({
      id: clientInfo.id,
      userId: clientInfo.userId,
      username: clientInfo.username,
      loadout: acc?.loadout || clientInfo.loadout || {},
      rp: acc?.rp || 1200
    });
    if (res.error) {
      this.clients.delete(clientInfo.id);
    } else if (acc) {
      acc.currentRoomCode = this.code;
    }
    return res;
  }

  replaceWsBotWithHuman(clientInfo, ws) {
    const acc = clientInfo.userId ? gameDB.getUserById(clientInfo.userId) : null;
    this.clients.set(clientInfo.id, ws);
    const res = this.replaceBotWithHuman({
      id: clientInfo.id,
      userId: clientInfo.userId,
      username: clientInfo.username,
      loadout: acc?.loadout || clientInfo.loadout || {},
      rp: acc?.rp || 1200
    });
    if (res.error) {
      this.clients.delete(clientInfo.id);
    } else if (acc) {
      acc.currentRoomCode = this.code;
    }
    return res;
  }

  removeWsPlayer(playerId) {
    const p = this.combatants.get(playerId);
    if (p?.userId) {
      const acc = gameDB.getUserById(p.userId);
      if (acc && acc.currentRoomCode === this.code) acc.currentRoomCode = null;
    }
    this.clients.delete(playerId);
    this.removeHumanPlayer(playerId);
  }
}
