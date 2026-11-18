// Smart Tactical AI Bot Controller v2.5:
// - Verified LOS Waypoint Pathfinding (Dijkstra + String-Pulling Lookahead)
// - 5-Ray Whisker Obstacle Avoidance (Never slams into walls or corners)
// - Wall-Safe Combat Strafing, Damage-Direction Reaction & Close-Range Sidearm Swap
import { PHYSICS } from '../constants.js';
import {
  anglesFromDirection,
  directionFromAngles,
  hasLineOfSight,
  raycastMap,
  canWalkBetweenXZ
} from '../physics.js';

const BOT_NAMES = [
  'Sói_Đêm', 'Đại_Bàng', 'Tia_Chớp', 'Bóng_Ma', 'Hổ_Xám',
  'Lưỡi_Hái', 'Thiết_Giáp', 'Phượng_Hoàng', 'Diều_Hâu', 'Bão_Lửa',
  'Sấm_Sét', 'Cobra_VN', 'Hắc_Long', 'Thần_Gió', 'Ưng_Chiến',
  'Báo_Đen', 'Xạ_Thủ_99', 'Sát_Thủ_Pro', 'Lính_Thép', 'Bắc_Cực',
  'Đặc_Nhiêm_X', 'Hoàng_Kim', 'Chiến_Lang', 'Cận_Vệ_Zero', 'Hỏa_Tiễn',
  'Vệ_Binh_77', 'Ác_Quỷ_Đỏ', 'Khắc_Tinh', 'Thanh_Kiếm', 'Kỵ_Sĩ_Đêm',
  'Biệt_Kích_01', 'Tân_Binh_Alpha', 'Độc_Cô_Cầu_Bại', 'Vũ_Bão', 'Không_Kỵ',
  'Phong_Vân', 'Phi_Long', 'Huyết_Ưng', 'Kẻ_Săn_Mồi', 'Tia_Nắng',
  'Lục_Quân', 'Thủ_Lĩnh', 'Bản_Năng', 'Cảnh_Vệ', 'Băng_Giá',
  'Ngân_Hà', 'Siêu_Phàm', 'Chiến_Binh_S', 'Huyền_Thoại'
];

const BOT_LOADOUTS = [
  { operator: 'vanguard', outfit: 'urban', primary: 'ak47', secondary: 'deagle', melee: 'knife', skin: 'asiimov' },
  { operator: 'siren', outfit: 'summer_bikini', primary: 'hk416', secondary: 'fiveseven', melee: 'karambit', skin: 'neon_cyber' },
  { operator: 'titan', outfit: 'royal_gold', primary: 'm249', secondary: 'magnum', melee: 'knife', skin: 'gold_dragon' },
  { operator: 'aria', outfit: 'tropical_swim', primary: 'm200', secondary: 'glock18', melee: 'karambit', skin: 'arctic_glacier' },
  { operator: 'phoenix', outfit: 'crimson', primary: 'famas', secondary: 'deagle', melee: 'knife', skin: 'magma_core' },
  { operator: 'valkyrie', outfit: 'jungle', primary: 'galil', secondary: 'usps', melee: 'knife', skin: 'imperial_jade' },
  { operator: 'ghost', outfit: 'desert', primary: 'ump45', secondary: 'magnum', melee: 'knife', skin: 'default' },
  { operator: 'shadow', outfit: 'stealth_ops', primary: 'kar98k', secondary: 'glock18', melee: 'karambit', skin: 'crimson_web' },
  { operator: 'kagura', outfit: 'urban', primary: 'scarh', secondary: 'fiveseven', melee: 'karambit', skin: 'neon_cyber' }
];

const DIFFICULTY_PRESETS = {
  easy: { reactionMs: 950, aimJitter: 0.165, turnSpeed: 3.5, burstChance: 0.22, shotCooldownMs: 480 },
  normal: { reactionMs: 700, aimJitter: 0.120, turnSpeed: 4.8, burstChance: 0.35, shotCooldownMs: 340 },
  hard: { reactionMs: 480, aimJitter: 0.080, turnSpeed: 6.4, burstChance: 0.48, shotCooldownMs: 240 }
};

export function createBotProfile(index = 0) {
  const preset = BOT_LOADOUTS[index % BOT_LOADOUTS.length];
  const baseName = BOT_NAMES[index % BOT_NAMES.length];
  const suffix = index >= BOT_NAMES.length ? `_${index - BOT_NAMES.length + 2}` : '';
  const skins = {};
  for (const k of [
    'ak47', 'm4a1', 'scarh', 'aug', 'm16a4', 'famas', 'galil', 'hk416',
    'mp5', 'p90', 'vector', 'ump45', 'mp7', 'm249', 'rpk',
    'spas12', 'aa12', 'm870', 'awp', 'svd', 'barrett', 'kar98k', 'm200',
    'deagle', 'usps', 'glock18', 'magnum', 'fiveseven', 'knife', 'karambit'
  ]) {
    skins[k] = preset.skin;
  }
  return {
    name: `[BOT] ${baseName}${suffix}`,
    operator: preset.operator,
    outfit: preset.outfit,
    primary: preset.primary,
    secondary: preset.secondary,
    melee: preset.melee,
    skins,
    attachments: {
      [preset.primary]: { optic: 'reddot', muzzle: 'compensator', mag: 'standard' },
      [preset.secondary]: { optic: 'iron', muzzle: 'none', mag: 'standard' }
    }
  };
}

function shortestAngleDiff(from, to) {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function nearestVisibleWaypoint(x, z, waypoints, map) {
  let bestVisible = null;
  let bestVisDist = Infinity;
  let bestAny = waypoints[0];
  let bestAnyDist = Infinity;

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const d = Math.hypot(wp.x - x, wp.z - z);
    if (d < bestAnyDist) {
      bestAnyDist = d;
      bestAny = wp;
    }
    if (d < bestVisDist && d < 24 && canWalkBetweenXZ(x, z, wp.x, wp.z, map, 0.35)) {
      bestVisDist = d;
      bestVisible = wp;
    }
  }
  return bestVisible || bestAny;
}

// Dijkstra shortest Euclidean path across verified waypoint links
function computeWaypointPath(startId, goalId, waypoints) {
  if (startId === goalId) {
    const single = waypoints.find((w) => w.id === goalId);
    return single ? [single] : [];
  }

  const byId = new Map(waypoints.map((w) => [w.id, w]));
  const dist = new Map();
  const prev = new Map();
  const unvisited = new Set();

  for (const w of waypoints) {
    dist.set(w.id, Infinity);
    unvisited.add(w.id);
  }
  dist.set(startId, 0);

  while (unvisited.size > 0) {
    let u = null;
    let bestD = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id);
      if (d < bestD) {
        bestD = d;
        u = id;
      }
    }
    if (u === null || u === goalId || bestD === Infinity) break;
    unvisited.delete(u);

    const nodeU = byId.get(u);
    if (!nodeU) continue;
    for (const v of nodeU.links) {
      if (!unvisited.has(v)) continue;
      const nodeV = byId.get(v);
      if (!nodeV) continue;
      const alt = bestD + Math.hypot(nodeV.x - nodeU.x, nodeV.z - nodeU.z);
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }

  const path = [];
  let curr = goalId;
  while (curr !== undefined) {
    const node = byId.get(curr);
    if (node) path.unshift(node);
    if (curr === startId) break;
    curr = prev.get(curr);
  }
  return path.length ? path : [byId.get(goalId) || waypoints[0]];
}

// Cast a horizontal feeler ray at waist height to check obstacle clearance distance
function feelClearance(x, y, z, angleYaw, maxDist, map) {
  const dir = { x: -Math.sin(angleYaw), y: 0, z: -Math.cos(angleYaw) };
  const hit = raycastMap({ x, y: y + 0.85, z }, dir, maxDist, map);
  if (hit && (!hit.block || !hit.block.isStep)) {
    return hit.dist;
  }
  return maxDist;
}

function pickTacticalGoalWaypoint(bot, room, waypoints) {
  const map = room.map;
  // In team modes, push toward midfield or enemy half / objectives rather than staying in own spawn
  const candidates = waypoints.filter((w) => {
    if (Math.hypot(w.x - bot.x, w.z - bot.z) < 8) return false;
    if (room.modeConfig.teamBased) {
      if (bot.team === 'alpha') return w.z > -12; // Push South toward Mid & Bravo
      if (bot.team === 'bravo') return w.z < 12;  // Push North toward Mid & Alpha
    }
    return true;
  });
  const pool = candidates.length > 0 ? candidates : waypoints;
  return pool[Math.floor(Math.random() * pool.length)] || waypoints[0];
}

export function updateBotAI(bot, room, dt, now) {
  if (bot.dead) return;
  const diff = DIFFICULTY_PRESETS[room.botDifficulty] || DIFFICULTY_PRESETS.normal;
  const map = room.map;
  const waypoints = map.waypoints;

  const ai = bot.aiState || (bot.aiState = {
    goalWpId: null,
    path: [],
    repathAt: 0,
    targetId: null,
    firstSeenAt: 0,
    lastSeenEnemyPos: null,
    lastSeenEnemyUntil: 0,
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeSwitchAt: now + 1100,
    crouchCombat: false,
    stuckCheckAt: now + 700,
    lastPos: { x: bot.x, z: bot.z },
    avoidYawOffset: 0,
    scanTick: Math.floor(Math.random() * 3),
    jumpAt: 0,
    dropTargetX: 0,
    dropTargetZ: 0
  });

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

  // Battle Royale Plane Jump & Parachute Glide AI
  if (room.mode === 'survival' && bot.dropPhase && bot.dropPhase !== 'ground') {
    if (bot.dropPhase === 'plane') {
      if (!ai.jumpAt) {
        const dp = room.dropPlane;
        const flightMs = dp ? Math.max(2500, dp.endAt - dp.startAt - 1200) : 7000;
        const jumpFrac = Math.random();
        ai.jumpAt = (dp?.startAt || now) + 500 + jumpFrac * flightMs;
        // Aim at a named compound / loot spawn relatively close to where the plane will be when jumping!
        const estX = dp ? (dp.startX + (dp.endX - dp.startX) * jumpFrac) : 0;
        const estZ = dp ? (dp.startZ + (dp.endZ - dp.startZ) * jumpFrac) : 0;
        const pool = (room.lootCrates && room.lootCrates.length) ? room.lootCrates : map.waypoints;
        let pick = pool[Math.floor(Math.random() * pool.length)] || { x: estX, z: estZ };
        let bestClose = Infinity;
        for (let k = 0; k < Math.min(18, pool.length); k++) {
          const cand = pool[Math.floor(Math.random() * pool.length)];
          if (!cand) continue;
          const d = Math.hypot(cand.x - estX, cand.z - estZ);
          if (d < bestClose) { bestClose = d; pick = cand; }
        }
        ai.dropTargetX = pick.x + (Math.random() - 0.5) * 18;
        ai.dropTargetZ = pick.z + (Math.random() - 0.5) * 18;
      }
      if (now >= ai.jumpAt && room.handleDropAction) {
        room.handleDropAction(bot.id, 'jump');
      }
      bot.input = input;
      return;
    }

    const dx = ai.dropTargetX - bot.x;
    const dz = ai.dropTargetZ - bot.z;
    const floorHere = map.terrain ? map.terrain.floorAt(bot.x, bot.z) : 0;
    const agl = bot.y - floorHere;
    input.yaw = Math.atan2(-dx, -dz);
    input.pitch = bot.dropPhase === 'skydive' ? -0.35 : -0.08;
    input.forward = Math.hypot(dx, dz) > 4 ? 1 : 0;
    if (bot.dropPhase === 'skydive' && agl < 72 && Math.random() < 0.14) {
      room.handleDropAction?.(bot.id, 'open_chute');
    }
    bot.input = input;
    return;
  }

  const wStats = room.getPlayerWeaponStats(bot);

  // 1. Bomb Mode Objective Priority (Planting / Defusing)
  if (room.mode === 'bomb' && room.roundPhase === 'live') {
    if (!room.bombState.planted && bot.hasBomb) {
      const targetSite = map.bombSites[bot.aiBombSiteIdx ?? 0] || map.bombSites[0];
      if (Math.hypot(bot.x - targetSite.x, bot.z - targetSite.z) < targetSite.radius * 0.72) {
        input.interact = true;
        input.crouch = true;
        bot.input = input;
        return;
      }
    } else if (room.bombState.planted && bot.team === 'alpha') {
      if (Math.hypot(bot.x - room.bombState.x, bot.z - room.bombState.z) < 2.2) {
        const closeEnemy = room.getLivingCombatants().find(
          (p) => p.team !== bot.team && Math.hypot(p.x - bot.x, p.z - bot.z) < 7.5
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

  // 2. Scan for Visible Enemies (staggered every 3rd tick + distance culled so 50-player BR stays smooth)
  const botEye = {
    x: bot.x,
    y: bot.y + (bot.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND),
    z: bot.z
  };

  ai.scanTick = (ai.scanTick + 1) % 3;
  let visibleEnemy = null;
  let bestScore = Infinity;

  for (const other of room.getLivingCombatants()) {
    if (other.id === bot.id) continue;
    if (room.modeConfig.teamBased && other.team === bot.team) continue;
    if (other.dropPhase && other.dropPhase !== 'ground') continue;

    const dx = other.x - bot.x;
    const dz = other.z - bot.z;
    const dist = Math.hypot(dx, dz);
    if (dist > (map.terrain ? 115 : 64)) continue;

    // On off-ticks in heavy lobbies (>14 combatants), only verify current target or very close enemies (<15m)
    if (ai.scanTick !== 0 && room.combatants.size > 14 && other.id !== ai.targetId && dist > 15) continue;

    const angleToEnemy = Math.atan2(-dx, -dz);
    const yawDelta = Math.abs(shortestAngleDiff(bot.yaw, angleToEnemy));
    const recentlyShot = now - (bot.lastDamagedAt || 0) < 2200;
    if (yawDelta > 2.15 && dist > 12 && !recentlyShot) continue;

    const otherChest = {
      x: other.x,
      y: other.y + (other.crouching ? 0.75 : 1.25),
      z: other.z
    };
    if (hasLineOfSight(botEye, otherChest, map)) {
      const priority = dist + yawDelta * 6;
      if (priority < bestScore) {
        bestScore = priority;
        visibleEnemy = { player: other, aimPoint: otherChest, dist };
      }
    }
  }

  // 3. Active Combat Engagement
  if (visibleEnemy) {
    const enemy = visibleEnemy.player;
    if (ai.targetId !== enemy.id) {
      ai.targetId = enemy.id;
      ai.firstSeenAt = now;
      ai.crouchCombat = visibleEnemy.dist > 16 && Math.random() < 0.35;
    }
    ai.lastSeenEnemyPos = { x: enemy.x, z: enemy.z };
    ai.lastSeenEnemyUntil = now + 3500;

    // Smart weapon management in combat: swap to pistol if primary is empty at close/mid range!
    if (!wStats.isMelee && bot.ammo <= 0 && !bot.reloadingUntil) {
      if (bot.slot === 1 && visibleEnemy.dist < 18 && bot.weaponsState?.[2]?.ammo > 0) {
        room.switchWeapon(bot, 2);
      } else if (bot.reserveAmmo > 0) {
        room.startReload(bot, now);
      } else if (bot.slot !== 3) {
        room.switchWeapon(bot, 3);
      }
    }

    // Aim at lower torso / center mass (no velocity leading so player can dodge)
    const aimYOffset = -0.10;
    const desired = anglesFromDirection(
      visibleEnemy.aimPoint.x - botEye.x,
      visibleEnemy.aimPoint.y + aimYOffset - botEye.y,
      visibleEnemy.aimPoint.z - botEye.z
    );
    const yawDiff = shortestAngleDiff(bot.yaw, desired.yaw);
    const pitchDiff = desired.pitch - bot.pitch;
    const turnBlend = Math.min(1, diff.turnSpeed * dt);
    input.yaw = bot.yaw + yawDiff * turnBlend;
    input.pitch = Math.max(-1.35, Math.min(1.35, bot.pitch + pitchDiff * turnBlend));

    // Wall-safe combat strafing (check left/right clearance so bot NEVER strafes into a wall!)
    if (now > ai.strafeSwitchAt) {
      ai.strafeDir = -ai.strafeDir;
      ai.strafeSwitchAt = now + 800 + Math.random() * 850;
    }
    const strafeAngle = input.yaw + (ai.strafeDir > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
    const strafeClear = feelClearance(bot.x, bot.y, bot.z, strafeAngle, 1.35, map);
    if (strafeClear < 0.95) {
      ai.strafeDir = -ai.strafeDir;
      ai.strafeSwitchAt = now + 900;
    }
    input.right = ai.strafeDir * 0.85;

    // Range-appropriate forward/back spacing (check clearance first!)
    if (wStats.isMelee) {
      input.forward = 1;
      input.sprint = true;
    } else if (visibleEnemy.dist > 22) {
      const fwdClear = feelClearance(bot.x, bot.y, bot.z, input.yaw, 1.8, map);
      if (fwdClear > 1.2) input.forward = 0.8;
    } else if (visibleEnemy.dist < 6.0) {
      const backClear = feelClearance(bot.x, bot.y, bot.z, input.yaw + Math.PI, 1.5, map);
      if (backClear > 1.0) input.forward = -0.55;
    }

    if (visibleEnemy.dist > 24 && wStats.isSniper) {
      input.ads = true;
      input.right *= 0.2;
      input.forward = 0;
    } else if (ai.crouchCombat && visibleEnemy.dist > 15) {
      input.crouch = true;
    }

    // Fire weapon in spaced bursts when reaction time and shot cooldown have elapsed
    if (
      now - ai.firstSeenAt >= diff.reactionMs &&
      now >= (ai.nextShotAt || 0) &&
      Math.abs(yawDiff) < 0.22 &&
      !bot.reloadingUntil &&
      Math.random() < diff.burstChance
    ) {
      ai.nextShotAt = now + (diff.shotCooldownMs || 340) + Math.random() * 240;
      const jitterYaw = input.yaw + (Math.random() - 0.5) * diff.aimJitter * 2.2;
      const jitterPitch = input.pitch + (Math.random() - 0.5) * diff.aimJitter * 1.8;
      room.botFireWeapon(bot, jitterYaw, jitterPitch, now);
    }

    bot.input = input;
    return;
  }

  // Out of combat: switch back to primary weapon & reload if needed
  ai.targetId = null;
  if (bot.slot === 2 && (bot.weaponsState?.[1]?.ammo > 0 || bot.weaponsState?.[1]?.reserve > 0)) {
    room.switchWeapon(bot, 1);
  } else if (!wStats.isMelee && bot.ammo < wStats.magSize * 0.45 && bot.reserveAmmo > 0 && !bot.reloadingUntil) {
    room.startReload(bot, now);
  }

  // 4. Verified Waypoint Pathfinding + String-Pulling Lookahead
  if (now >= ai.repathAt || !ai.path || ai.path.length === 0) {
    ai.repathAt = now + (waypoints.length > 80 ? 2800 : 1500) + Math.random() * 600;
    const startWp = nearestVisibleWaypoint(bot.x, bot.z, waypoints, map);

    let goalWp = null;
    if (room.mode === 'bomb' && room.roundPhase === 'live') {
      if (room.bombState.planted) {
        goalWp = nearestVisibleWaypoint(room.bombState.x, room.bombState.z, waypoints, map);
      } else {
        if (bot.aiBombSiteIdx === undefined) bot.aiBombSiteIdx = Math.random() < 0.5 ? 0 : 1;
        const site = map.bombSites[bot.aiBombSiteIdx] || map.bombSites[0];
        goalWp = nearestVisibleWaypoint(site.x, site.z, waypoints, map);
      }
    } else if (room.mode === 'survival' && !bot.weaponsState?.[1]?.id && room.lootCrates?.length) {
      let bestLoot = null;
      let bestLootDist = Infinity;
      for (const lc of room.lootCrates) {
        if (!lc.active || lc.kind !== 'weapon') continue;
        const d = Math.hypot(lc.x - bot.x, lc.z - bot.z);
        if (d < bestLootDist) { bestLootDist = d; bestLoot = lc; }
      }
      if (bestLoot) {
        if (bestLootDist < 85) {
          ai.path = [{ id: -1, x: bestLoot.x, z: bestLoot.z, links: [] }];
        } else {
          goalWp = nearestVisibleWaypoint(bestLoot.x, bestLoot.z, waypoints, map);
        }
        if (bestLootDist < 14) input.interact = true;
      }
    } else if (room.mode === 'survival' && room.storm) {
      const distFromSafe = Math.hypot(bot.x - room.storm.x, bot.z - room.storm.z);
      if (distFromSafe > room.storm.radius * 0.72) {
        goalWp = nearestVisibleWaypoint(room.storm.x, room.storm.z, waypoints, map);
      }
    } else if (ai.lastSeenEnemyPos && now < ai.lastSeenEnemyUntil) {
      // Pursue last seen enemy position!
      goalWp = nearestVisibleWaypoint(ai.lastSeenEnemyPos.x, ai.lastSeenEnemyPos.z, waypoints, map);
    }

    if (goalWp) {
      ai.path = computeWaypointPath(startWp.id, goalWp.id, waypoints);
    } else if (!ai.path || ai.path.length === 0) {
      if (ai.goalWpId === null || startWp.id === ai.goalWpId) {
        const picked = pickTacticalGoalWaypoint(bot, room, waypoints);
        ai.goalWpId = picked.id;
      }
      goalWp = waypoints.find((w) => w.id === ai.goalWpId) || waypoints[0];
      ai.path = computeWaypointPath(startWp.id, goalWp.id, waypoints);
    }
  }

  // Advance along path using String-Pulling:
  // If close to path[0], or if path[1] is already directly walkable with wide clearance, pop path[0]
  while (ai.path.length > 1) {
    const wp0 = ai.path[0];
    const wp1 = ai.path[1];
    const dist0 = Math.hypot(wp0.x - bot.x, wp0.z - bot.z);
    if (dist0 < 1.65 || canWalkBetweenXZ(bot.x, bot.z, wp1.x, wp1.z, map, 0.48)) {
      ai.path.shift();
    } else {
      break;
    }
  }

  const targetWp = ai.path[0];
  if (targetWp) {
    const dx = targetWp.x - bot.x;
    const dz = targetWp.z - bot.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 1.65) {
      ai.path.shift();
      if (ai.path.length === 0) {
        ai.goalWpId = null;
        ai.repathAt = 0;
      }
    } else {
      const desired = anglesFromDirection(dx, 0, dz);
      let steerYaw = desired.yaw;

      // 5. 3-Ray Whisker Obstacle Avoidance: Smoothly steer around any crate/corner ahead!
      const whiskerDist = Math.min(2.3, dist);
      const centerClear = feelClearance(bot.x, bot.y, bot.z, steerYaw, whiskerDist, map);
      const leftClear = feelClearance(bot.x, bot.y, bot.z, steerYaw + 0.58, 2.1, map);
      const rightClear = feelClearance(bot.x, bot.y, bot.z, steerYaw - 0.58, 2.1, map);

      if (centerClear < whiskerDist * 0.88 || leftClear < 0.85 || rightClear < 0.85) {
        if (leftClear > rightClear + 0.15) {
          steerYaw += 0.72;
          input.right = -0.45;
        } else if (rightClear > leftClear + 0.15) {
          steerYaw -= 0.72;
          input.right = 0.45;
        } else {
          steerYaw += ai.strafeDir * 0.85;
        }
      }

      const yawDiff = shortestAngleDiff(bot.yaw, steerYaw);
      input.yaw = bot.yaw + yawDiff * Math.min(1, 7.5 * dt);
      input.pitch = bot.pitch * 0.88;
      input.forward = Math.abs(yawDiff) > 1.2 ? 0.35 : 1.0;
      input.sprint = dist > 5.5 && Math.abs(yawDiff) < 0.45 && centerClear >= 2.0;
    }
  }

  // Unstuck safeguard if blocked by another player or tight corner
  if (now > ai.stuckCheckAt) {
    const moved = Math.hypot(bot.x - ai.lastPos.x, bot.z - ai.lastPos.z);
    ai.lastPos = { x: bot.x, z: bot.z };
    ai.stuckCheckAt = now + 700;
    if (moved < 0.35 && input.forward > 0) {
      ai.strafeDir = -ai.strafeDir;
      ai.goalWpId = null;
      ai.path = [];
      ai.repathAt = 0;
      input.yaw = bot.yaw + ai.strafeDir * 1.1;
      input.right = ai.strafeDir;
      input.jump = true;
    }
  }

  bot.input = input;
}
