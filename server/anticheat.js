// Stage 8: Server-Authoritative Anti-Cheat & Input Sanitizer
import { PHYSICS } from '../shared/constants.js';
import { raycastMap } from '../shared/physics.js';

export class AntiCheatGuard {
  constructor() {
    this.playerTrackers = new Map();
  }

  getTracker(playerId) {
    let t = this.playerTrackers.get(playerId);
    if (!t) {
      t = {
        packetCountWindow: 0,
        windowStart: Date.now(),
        strikes: 0,
        lastShotAt: 0
      };
      this.playerTrackers.set(playerId, t);
    }
    return t;
  }

  removePlayer(playerId) {
    this.playerTrackers.delete(playerId);
  }

  // Rate limit incoming WS messages per client (max ~110 packets/sec)
  checkPacketRate(playerId) {
    const now = Date.now();
    const t = this.getTracker(playerId);
    if (now - t.windowStart >= 1000) {
      t.windowStart = now;
      t.packetCountWindow = 0;
    }
    t.packetCountWindow += 1;
    if (t.packetCountWindow > 120) {
      t.strikes += 1;
      return false;
    }
    return true;
  }

  // Sanitize movement input values so NaN/Infinity or >1 speed multipliers are impossible
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

  // Validate client-reported shot origin & fire interval against authoritative server state
  validateShot(player, weaponStats, clientOrigin, map, now = Date.now()) {
    if (!player || player.dead) return { valid: false, reason: 'dead' };
    if (player.reloadingUntil && now < player.reloadingUntil) {
      return { valid: false, reason: 'reloading' };
    }
    if (!weaponStats.isMelee && player.ammo <= 0) {
      return { valid: false, reason: 'no_ammo' };
    }

    // Allow 12% jitter tolerance for network packet batching on automatic weapons
    const minInterval = weaponStats.fireIntervalMs * 0.86;
    if (now - (player.lastFireAt || 0) < minInterval) {
      return { valid: false, reason: 'fire_rate' };
    }

    const eyeH = player.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND;
    const serverEye = { x: player.x, y: player.y + eyeH, z: player.z };

    // Verify clientOrigin isn't spoofed far from server eye position or through a wall
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

      if (dist <= 0.95) {
        if (dist > 0.05) {
          const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
          const blocked = raycastMap(serverEye, dir, dist, map);
          if (!blocked) {
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
