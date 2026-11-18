// Tactical AI Bot Controller for 5v5, FFA, Bomb Defusal & Battle Royale
import { PHYSICS } from '../shared/constants.js';
import { anglesFromDirection, hasLineOfSight } from '../shared/physics.js';

const BOT_NAMES = [
  'Sói_Đêm', 'Đại_Bàng', 'Tia_Chớp', 'Bóng_Ma', 'Hổ_Xám',
  'Lưỡi_Hái', 'Thiết_Giáp', 'Phượng_Hoàng', 'Diều_Hâu', 'Bão_Lửa',
  'Sấm_Sét', 'Cobra_VN'
];

const BOT_LOADOUTS = [
  { operator: 'vanguard', outfit: 'urban', primary: 'ak47', skin: 'asiimov' },
  { operator: 'ghost', outfit: 'crimson', primary: 'm4a1', skin: 'neon_cyber' },
  { operator: 'titan', outfit: 'desert', primary: 'ak47', skin: 'gold_dragon' },
  { operator: 'valkyrie', outfit: 'arctic', primary: 'awp', skin: 'crimson_web' },
  { operator: 'vanguard', outfit: 'cyber', primary: 'm4a1', skin: 'asiimov' }
];

const DIFFICULTY_PRESETS = {
  easy: { reactionMs: 520, aimJitter: 0.085, turnSpeed: 4.5, burstChance: 0.55 },
  normal: { reactionMs: 320, aimJitter: 0.045, turnSpeed: 6.8, burstChance: 0.75 },
  hard: { reactionMs: 180, aimJitter: 0.020, turnSpeed: 9.5, burstChance: 0.90 }
};

export function createBotProfile(index = 0) {
  const preset = BOT_LOADOUTS[index % BOT_LOADOUTS.length];
  const baseName = BOT_NAMES[index % BOT_NAMES.length];
  return {
    name: `[BOT] ${baseName}`,
    operator: preset.operator,
    outfit: preset.outfit,
    primary: preset.primary,
    secondary: 'deagle',
    skins: {
      ak47: preset.skin,
      m4a1: preset.skin,
      awp: preset.skin,
      deagle: 'gold_dragon'
    },
    attachments: {
      ak47: { optic: 'reddot', muzzle: 'compensator', mag: 'standard' },
      m4a1: { optic: 'reddot', muzzle: 'suppressor', mag: 'standard' },
      awp: { optic: 'iron', muzzle: 'none', mag: 'standard' },
      deagle: { optic: 'iron', muzzle: 'none', mag: 'standard' }
    }
  };
}

function shortestAngleDiff(from, to) {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function nearestWaypoint(x, z, waypoints) {
  let best = waypoints[0];
  let bestD = Infinity;
  for (const wp of waypoints) {
    const d = (wp.x - x) ** 2 + (wp.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = wp;
    }
  }
  return best;
}

function bfsNextWaypoint(startId, goalId, waypoints) {
  if (startId === goalId) return waypoints.find((w) => w.id === goalId) || waypoints[0];
  const byId = new Map(waypoints.map((w) => [w.id, w]));
  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const path = queue.shift();
    const curr = path[path.length - 1];
    if (curr === goalId) {
      return byId.get(path[1]) || byId.get(goalId);
    }
    const node = byId.get(curr);
    if (!node) continue;
    for (const nextId of node.links) {
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push([...path, nextId]);
      }
    }
  }
  return byId.get(goalId) || waypoints[0];
}

export function updateBotAI(bot, room, dt, now) {
  if (bot.dead) return;
  const diff = DIFFICULTY_PRESETS[room.botDifficulty] || DIFFICULTY_PRESETS.normal;
  const map = room.map;
  const ai = bot.aiState || (bot.aiState = {
    goalWpId: null,
    nextWp: null,
    repathAt: 0,
    targetId: null,
    firstSeenAt: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeSwitchAt: now + 1200,
    stuckCheckAt: now + 1000,
    lastPos: { x: bot.x, z: bot.z },
    unstuckUntil: 0
  });

  // Reset per-tick transient inputs
  const input = {
    forward: 0,
    right: 0,
    yaw: bot.yaw,
    pitch: bot.pitch,
    sprint: false,
    crouch: false,
    jump: false,
    ads: false,
    interact: false
  };

  // Reload if safe or empty
  const wStats = room.getPlayerWeaponStats(bot);
  if (!wStats.isMelee && bot.ammo <= 0 && !bot.reloadingUntil) {
    if (bot.reserveAmmo > 0) {
      room.startReload(bot, now);
    } else if (bot.slot !== 2) {
      room.switchWeapon(bot, 2);
    }
  }

  // 1. Check Bomb Objective Priority (Planting / Defusing)
  if (room.mode === 'bomb' && room.roundPhase === 'live') {
    if (!room.bombState.planted && bot.hasBomb) {
      const targetSite = map.bombSites[bot.aiBombSiteIdx ?? 0] || map.bombSites[0];
      const distToSite = Math.hypot(bot.x - targetSite.x, bot.z - targetSite.z);
      if (distToSite < targetSite.radius * 0.72) {
        input.interact = true;
        input.crouch = true;
        bot.input = input;
        return;
      }
    } else if (room.bombState.planted && bot.team === 'alpha') {
      const distToBomb = Math.hypot(bot.x - room.bombState.x, bot.z - room.bombState.z);
      if (distToBomb < 2.2) {
        // Defuse unless an enemy is shooting right next to us (< 7m)
        const closeEnemy = room.getLivingCombatants().find(
          (p) => p.team !== bot.team && Math.hypot(p.x - bot.x, p.z - bot.z) < 7.0
        );
        if (!closeEnemy) {
          input.interact = true;
          input.crouch = true;
          bot.input = input;
          return;
        }
      }
    }
  }

  // 2. Acquire Visible Enemy Target
  const botEye = {
    x: bot.x,
    y: bot.y + (bot.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND),
    z: bot.z
  };

  let visibleEnemy = null;
  let bestEnemyDist = Infinity;
  for (const other of room.getLivingCombatants()) {
    if (other.id === bot.id) continue;
    if (room.modeConfig.teamBased && other.team === bot.team) continue;

    const dx = other.x - bot.x;
    const dz = other.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 78) continue;

    const otherChest = {
      x: other.x,
      y: other.y + (other.crouching ? 0.75 : 1.25),
      z: other.z
    };
    if (hasLineOfSight(botEye, otherChest, map)) {
      if (dist < bestEnemyDist) {
        bestEnemyDist = dist;
        visibleEnemy = { player: other, aimPoint: otherChest, dist };
      }
    }
  }

  if (visibleEnemy) {
    if (ai.targetId !== visibleEnemy.player.id) {
      ai.targetId = visibleEnemy.player.id;
      ai.firstSeenAt = now;
    }

    // Aim smoothly toward target chest/head
    const aimYOffset = visibleEnemy.dist < 18 ? 0.18 : 0.04;
    const desired = anglesFromDirection(
      visibleEnemy.aimPoint.x - botEye.x,
      visibleEnemy.aimPoint.y + aimYOffset - botEye.y,
      visibleEnemy.aimPoint.z - botEye.z
    );
    const yawDiff = shortestAngleDiff(bot.yaw, desired.yaw);
    const pitchDiff = desired.pitch - bot.pitch;
    const turnBlend = Math.min(1, diff.turnSpeed * dt);
    input.yaw = bot.yaw + yawDiff * turnBlend;
    input.pitch = Math.max(-1.3, Math.min(1.3, bot.pitch + pitchDiff * turnBlend));

    // Tactical combat movement (strafe + approach if too far)
    if (now > ai.strafeSwitchAt) {
      ai.strafeDir = -ai.strafeDir;
      ai.strafeSwitchAt = now + 900 + Math.random() * 900;
    }
    input.right = ai.strafeDir * 0.85;
    if (visibleEnemy.dist > 22) input.forward = 0.75;
    else if (visibleEnemy.dist < 6.5) input.forward = -0.45;
    if (visibleEnemy.dist > 26 && wStats.isSniper) {
      input.ads = true;
      input.right *= 0.25;
      input.forward = 0;
    } else if (visibleEnemy.dist > 18 && Math.random() < 0.25) {
      input.crouch = true;
    }

    // Fire weapon if reaction time elapsed and roughly aimed on target
    if (
      now - ai.firstSeenAt >= diff.reactionMs &&
      Math.abs(yawDiff) < 0.22 &&
      !bot.reloadingUntil &&
      Math.random() < diff.burstChance
    ) {
      const jitterYaw = input.yaw + (Math.random() - 0.5) * diff.aimJitter * 2;
      const jitterPitch = input.pitch + (Math.random() - 0.5) * diff.aimJitter * 1.6;
      room.botFireWeapon(bot, jitterYaw, jitterPitch, now);
    }

    bot.input = input;
    return;
  } else {
    ai.targetId = null;
    // Reload opportunistically out of combat
    if (!wStats.isMelee && bot.ammo < wStats.magSize * 0.4 && bot.reserveAmmo > 0 && !bot.reloadingUntil) {
      room.startReload(bot, now);
    }
  }

  // 3. Pathfind via Map Waypoints
  const waypoints = map.waypoints;
  if (now >= ai.repathAt || !ai.nextWp) {
    ai.repathAt = now + 1400 + Math.random() * 700;
    const curWp = nearestWaypoint(bot.x, bot.z, waypoints);

    let desiredGoalWp = null;
    if (room.mode === 'bomb' && room.roundPhase === 'live') {
      if (room.bombState.planted) {
        desiredGoalWp = nearestWaypoint(room.bombState.x, room.bombState.z, waypoints);
      } else if (bot.hasBomb || bot.team === 'bravo') {
        if (bot.aiBombSiteIdx === undefined) bot.aiBombSiteIdx = Math.random() < 0.5 ? 0 : 1;
        const site = map.bombSites[bot.aiBombSiteIdx] || map.bombSites[0];
        desiredGoalWp = nearestWaypoint(site.x, site.z, waypoints);
      } else {
        // Alpha defenders patrol Site A or B
        if (bot.aiBombSiteIdx === undefined) bot.aiBombSiteIdx = Math.random() < 0.5 ? 0 : 1;
        const site = map.bombSites[bot.aiBombSiteIdx] || map.bombSites[0];
        desiredGoalWp = nearestWaypoint(site.x, site.z, waypoints);
      }
    } else if (room.mode === 'survival' && room.storm) {
      const distFromSafe = Math.hypot(bot.x - room.storm.x, bot.z - room.storm.z);
      if (distFromSafe > room.storm.radius * 0.72) {
        desiredGoalWp = nearestWaypoint(room.storm.x, room.storm.z, waypoints);
      }
    }

    if (!desiredGoalWp) {
      if (ai.goalWpId === null || curWp.id === ai.goalWpId) {
        const randWp = waypoints[Math.floor(Math.random() * waypoints.length)];
        ai.goalWpId = randWp.id;
      }
      desiredGoalWp = waypoints.find((w) => w.id === ai.goalWpId) || waypoints[0];
    }

    ai.nextWp = bfsNextWaypoint(curWp.id, desiredGoalWp.id, waypoints);
  }

  // Move toward next waypoint
  if (ai.nextWp) {
    const dx = ai.nextWp.x - bot.x;
    const dz = ai.nextWp.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.2) {
      ai.repathAt = 0; // Pick next node immediately next tick
    } else {
      const desired = anglesFromDirection(dx, 0, dz);
      const yawDiff = shortestAngleDiff(bot.yaw, desired.yaw);
      input.yaw = bot.yaw + yawDiff * Math.min(1, 6.0 * dt);
      input.pitch = bot.pitch * 0.88;
      input.forward = 1;
      input.sprint = dist > 7;
    }
  }

  // Unstuck check if blocked by crate/corner
  if (now > ai.stuckCheckAt) {
    const moved = Math.hypot(bot.x - ai.lastPos.x, bot.z - ai.lastPos.z);
    ai.lastPos = { x: bot.x, z: bot.z };
    ai.stuckCheckAt = now + 950;
    if (moved < 0.45 && input.forward > 0) {
      ai.unstuckUntil = now + 550;
      ai.strafeDir = -ai.strafeDir;
      ai.goalWpId = null;
      ai.repathAt = 0;
      input.jump = true;
    }
  }
  if (now < ai.unstuckUntil) {
    input.right = ai.strafeDir;
    input.sprint = false;
  }

  bot.input = input;
}
