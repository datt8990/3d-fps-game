// Universal Anti-Cheat & Input Sanitizer (Runs on Node Server & WebRTC Host)
import { PHYSICS } from '../constants.js';
import { raycastMap } from '../physics.js';

export class AntiCheatGuard {
  constructor() {
    this.playerTrackers = new Map();
  }

  getTracker(playerId) {
    let t = this.playerTrackers.get(playerId);
    if (!t) {
      t = { packetCountWindow: 0, windowStart: Date.now(), strikes: 0 };
      this.playerTrackers.set(playerId, t);
    }
    return t;
  }

  removePlayer(playerId) {
    this.playerTrackers.delete(playerId);
  }

  checkPacketRate(playerId) {
    const now = Date.now();
    const t = this.getTracker(playerId);
    if (now - t.windowStart >= 1000) {
      t.windowStart = now;
      t.packetCountWindow = 0;
    }
    t.packetCountWindow += 1;
    return t.packetCountWindow <= 135;
  }

  sanitizeInput(raw = {}) {
    const clamp = (v, min, max) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.max(min, Math.min(max, n));
    };

    return {
      seq: Number.isInteger(raw.seq) ? raw.seq : 0,
      forward: clamp(raw.forward, -1, 1),
      right: clamp(raw.right, -1, 1),
      yaw: Number.isFinite(Number(raw.yaw)) ? Number(raw.yaw) : 0,
      pitch: clamp(raw.pitch, -1.53, 1.53),
      sprint: Boolean(raw.sprint),
      crouch: Boolean(raw.crouch),
      jump: Boolean(raw.jump),
      ads: Boolean(raw.ads),
      interact: Boolean(raw.interact)
    };
  }

  validateShot(player, weaponStats, clientOrigin, map, now = Date.now()) {
    if (!player || player.dead) return { valid: false, reason: 'dead' };
    if (player.reloadingUntil && now < player.reloadingUntil) {
      return { valid: false, reason: 'reloading' };
    }
    if (!weaponStats.isMelee && player.ammo <= 0) {
      return { valid: false, reason: 'no_ammo' };
    }

    const minInterval = weaponStats.fireIntervalMs * 0.85;
    if (now - (player.lastFireAt || 0) < minInterval) {
      return { valid: false, reason: 'fire_rate' };
    }

    const eyeH = player.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND;
    const serverEye = { x: player.x, y: player.y + eyeH, z: player.z };

    if (
      clientOrigin &&
      Number.isFinite(clientOrigin.x) &&
      Number.isFinite(clientOrigin.y) &&
      Number.isFinite(clientOrigin.z)
    ) {
      const dx = clientOrigin.x - serverEye.x;
      const dy = clientOrigin.y - serverEye.y;
      const dz = clientOrigin.z - serverEye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= 0.98) {
        if (dist > 0.05) {
          const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
          if (!raycastMap(serverEye, dir, dist, map)) {
            return { valid: true, origin: clientOrigin };
          }
        } else {
          return { valid: true, origin: clientOrigin };
        }
      }
    }

    return { valid: true, origin: serverEye };
  }
}
