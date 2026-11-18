// Shared 3D Physics, Multi-Block Collision, Circle-AABB Depenetration, Step-Up & Hitbox Raycasting
import { PHYSICS } from './constants.js';

export function directionFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp
  };
}

export function anglesFromDirection(dx, dy, dz) {
  const horiz = Math.hypot(dx, dz) || 1e-6;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, horiz);
  return { yaw, pitch };
}

function getBoxBounds(b) {
  return {
    minX: b.x - b.w * 0.5,
    maxX: b.x + b.w * 0.5,
    minY: b.y,
    maxY: b.y + b.h,
    minZ: b.z - b.d * 0.5,
    maxZ: b.z + b.d * 0.5
  };
}

function overlapsXZ(px, pz, r, box) {
  return (
    px + r > box.minX &&
    px - r < box.maxX &&
    pz + r > box.minZ &&
    pz - r < box.maxZ
  );
}

export function canStandAt(px, py, pz, height, r, blocks) {
  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (!overlapsXZ(px, pz, r - 0.02, box)) continue;
    if (py < box.maxY - 0.01 && py + height > box.minY + 0.01) {
      return false;
    }
  }
  return true;
}

/**
 * Push a cylinder (x, z, r) out of any solid AABB blocks at its current vertical span [y, y + height].
 * Guarantees that neither players nor AI bots can ever clip into or walk through walls/corners.
 */
export function depenetratePlayerXZ(state, height, r, map) {
  const blocks = map.blocks;
  for (let pass = 0; pass < 3; pass++) {
    let pushed = false;
    for (let i = 0; i < blocks.length; i++) {
      const box = getBoxBounds(blocks[i]);
      // Must check XZ overlap FIRST!
      if (!overlapsXZ(state.x, state.z, r, box)) continue;
      // Skip blocks entirely below feet, steppable curbs/stairs, or blocks above head
      if (state.y >= box.maxY - 0.02 || state.y + height <= box.minY + 0.02) continue;
      if (box.maxY - state.y <= PHYSICS.STEP_HEIGHT + 0.02) continue;

      const penLeft = (state.x + r) - box.minX;
      const penRight = box.maxX - (state.x - r);
      const penBack = (state.z + r) - box.minZ;
      const penFront = box.maxZ - (state.z - r);

      const minPenX = penLeft < penRight ? -penLeft : penRight;
      const minPenZ = penBack < penFront ? -penBack : penFront;

      if (Math.abs(minPenX) < Math.abs(minPenZ)) {
        state.x += minPenX + (minPenX < 0 ? -0.002 : 0.002);
        if (state.vx !== undefined) state.vx = 0;
      } else {
        state.z += minPenZ + (minPenZ < 0 ? -0.002 : 0.002);
        if (state.vz !== undefined) state.vz = 0;
      }
      pushed = true;
    }
    if (!pushed) break;
  }

  // Clamp inside arena bounds
  const maxW = map.bounds.halfW - r;
  const maxD = map.bounds.halfD - r;
  if (state.x < -maxW) { state.x = -maxW; if (state.vx) state.vx = 0; }
  if (state.x > maxW) { state.x = maxW; if (state.vx) state.vx = 0; }
  if (state.z < -maxD) { state.z = -maxD; if (state.vz) state.vz = 0; }
  if (state.z > maxD) { state.z = maxD; if (state.vz) state.vz = 0; }
}

/**
 * Simulates 1 physics step for a player/bot on `map`
 */
export function stepPlayerPhysics(state, input, map, dt, weaponMoveMult = 1.0, operatorSpeedMult = 1.0) {
  const clampedDt = Math.min(dt, 0.05);
  const r = PHYSICS.PLAYER_RADIUS;
  const blocks = map.blocks;

  // Handle crouch state (ensure headroom before standing up)
  if (input.crouch) {
    state.crouching = true;
  } else if (state.crouching) {
    if (canStandAt(state.x, state.y, state.z, PHYSICS.HEIGHT_STAND, r, blocks)) {
      state.crouching = false;
    }
  }

  const height = state.crouching ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;

  // Compute movement speed
  let baseSpeed = PHYSICS.SPEED_WALK;
  if (state.crouching) {
    baseSpeed = PHYSICS.SPEED_CROUCH;
  } else if (input.sprint && input.forward > 0 && !input.ads) {
    baseSpeed = PHYSICS.SPEED_SPRINT;
  }
  if (input.ads) {
    baseSpeed *= PHYSICS.SPEED_ADS_MULT;
  }
  const moveSpeed = baseSpeed * weaponMoveMult * operatorSpeedMult;

  // Compute wish velocity in XZ plane from yaw
  const sinY = Math.sin(input.yaw || 0);
  const cosY = Math.cos(input.yaw || 0);
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  let wishX = fwdX * (input.forward || 0) + rightX * (input.right || 0);
  let wishZ = fwdZ * (input.forward || 0) + rightZ * (input.right || 0);
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX = (wishX / wishLen) * moveSpeed;
    wishZ = (wishZ / wishLen) * moveSpeed;
  }

  // Smooth ground/air acceleration
  const accel = state.onGround ? 18.0 : 5.5;
  const blend = Math.min(1, accel * clampedDt);
  state.vx = state.vx + (wishX - state.vx) * blend;
  state.vz = state.vz + (wishZ - state.vz) * blend;

  // Jump
  if (input.jump && state.onGround && !state.crouching) {
    state.vy = PHYSICS.JUMP_VELOCITY;
    state.onGround = false;
  }

  // Gravity
  state.vy -= PHYSICS.GRAVITY * clampedDt;
  if (state.vy < -32) state.vy = -32;

  // Move X with step-up support
  const prevX = state.x;
  let nextX = prevX + state.vx * clampedDt;
  nextX = resolveAxisX(prevX, nextX, state, height, r, blocks);
  state.x = nextX;

  // Move Z with step-up support
  const prevZ = state.z;
  let nextZ = prevZ + state.vz * clampedDt;
  nextZ = resolveAxisZ(prevZ, nextZ, state, height, r, blocks);
  state.z = nextZ;

  // Enforce multi-block corner depenetration so nothing can ever clip through walls
  depenetratePlayerXZ(state, height, r, map);

  // Move Y (floor + blocks, order-independent highest supporting surface)
  let nextY = state.y + state.vy * clampedDt;
  state.onGround = false;
  let bestFloorY = nextY <= 0 ? 0 : -Infinity;

  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (!overlapsXZ(state.x, state.z, r - 0.015, box)) continue;

    if (state.vy <= 0 && state.y >= box.maxY - 0.18 && nextY <= box.maxY + 0.005) {
      if (box.maxY > bestFloorY) {
        bestFloorY = box.maxY;
      }
    } else if (state.vy > 0 && state.y + height <= box.minY + 0.15 && nextY + height >= box.minY) {
      nextY = box.minY - height;
      state.vy = 0;
    }
  }

  if (bestFloorY > -Infinity) {
    nextY = bestFloorY;
    state.vy = 0;
    state.onGround = true;
  }

  state.y = nextY;
  return state;
}

function resolveAxisX(prevX, nextX, state, height, r, blocks) {
  const movingDir = nextX - prevX;
  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (nextX + r <= box.minX || nextX - r >= box.maxX) continue;
    if (state.z + r <= box.minZ || state.z - r >= box.maxZ) continue;
    if (state.y >= box.maxY - 0.01 || state.y + height <= box.minY + 0.01) continue;

    // Attempt step-up if obstacle top is within STEP_HEIGHT
    const stepDiff = box.maxY - state.y;
    if (state.onGround && stepDiff > 0 && stepDiff <= PHYSICS.STEP_HEIGHT) {
      if (canStandAt(nextX, box.maxY, state.z, height, r, blocks)) {
        state.y = box.maxY;
        continue;
      }
    }

    const boxCenterX = (box.minX + box.maxX) * 0.5;
    if (movingDir > 0 || (movingDir === 0 && prevX < boxCenterX)) {
      nextX = box.minX - r - 0.001;
    } else {
      nextX = box.maxX + r + 0.001;
    }
    state.vx = 0;
  }
  return nextX;
}

function resolveAxisZ(prevZ, nextZ, state, height, r, blocks) {
  const movingDir = nextZ - prevZ;
  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (state.x + r <= box.minX || state.x - r >= box.maxX) continue;
    if (nextZ + r <= box.minZ || nextZ - r >= box.maxZ) continue;
    if (state.y >= box.maxY - 0.01 || state.y + height <= box.minY + 0.01) continue;

    const stepDiff = box.maxY - state.y;
    if (state.onGround && stepDiff > 0 && stepDiff <= PHYSICS.STEP_HEIGHT) {
      if (canStandAt(state.x, box.maxY, nextZ, height, r, blocks)) {
        state.y = box.maxY;
        continue;
      }
    }

    const boxCenterZ = (box.minZ + box.maxZ) * 0.5;
    if (movingDir > 0 || (movingDir === 0 && prevZ < boxCenterZ)) {
      nextZ = box.minZ - r - 0.001;
    } else {
      nextZ = box.maxZ + r + 0.001;
    }
    state.vz = 0;
  }
  return nextZ;
}

/**
 * Ray vs single AABB using slab method
 */
export function intersectRayAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  let hitNormal = { x: 0, y: 0, z: 0 };

  if (Math.abs(dx) < 1e-8) {
    if (ox < minX || ox > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ox) * inv;
    let t2 = (maxX - ox) * inv;
    let nx = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; nx = 1; }
    if (t1 > tmin) { tmin = t1; hitNormal = { x: nx, y: 0, z: 0 }; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < minY || oy > maxY) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - oy) * inv;
    let t2 = (maxY - oy) * inv;
    let ny = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; ny = 1; }
    if (t1 > tmin) { tmin = t1; hitNormal = { x: 0, y: ny, z: 0 }; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < minZ || oz > maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - oz) * inv;
    let t2 = (maxZ - oz) * inv;
    let nz = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; nz = 1; }
    if (t1 > tmin) { tmin = t1; hitNormal = { x: 0, y: 0, z: nz }; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }

  if (tmin < 0 || tmin > maxDist) return null;
  return {
    dist: tmin,
    point: { x: ox + dx * tmin, y: oy + dy * tmin, z: oz + dz * tmin },
    normal: hitNormal
  };
}

/**
 * Raycast against map floor and solid blocks
 */
export function raycastMap(origin, dir, maxDist, map) {
  let closest = null;
  let bestDist = maxDist;

  if (dir.y < -1e-6 && origin.y > 0) {
    const tFloor = -origin.y / dir.y;
    if (tFloor >= 0 && tFloor < bestDist) {
      bestDist = tFloor;
      closest = {
        dist: tFloor,
        point: {
          x: origin.x + dir.x * tFloor,
          y: 0,
          z: origin.z + dir.z * tFloor
        },
        normal: { x: 0, y: 1, z: 0 },
        mat: map.floorMat
      };
    }
  }

  const blocks = map.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const hit = intersectRayAABB(
      origin.x, origin.y, origin.z,
      dir.x, dir.y, dir.z,
      b.x - b.w * 0.5, b.y, b.z - b.d * 0.5,
      b.x + b.w * 0.5, b.y + b.h, b.z + b.d * 0.5,
      bestDist
    );
    if (hit && hit.dist < bestDist) {
      bestDist = hit.dist;
      closest = { ...hit, mat: b.mat, block: b };
    }
  }

  return closest;
}

/**
 * Checks if a character cylinder can walk in a straight line between two XZ points without hitting any non-steppable wall/crate.
 * Used by AI Bots and Waypoint Graph validation.
 */
export function canWalkBetweenXZ(x1, z1, x2, z2, map, clearanceRadius = 0.46) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;

  const dirX = dx / dist;
  const dirZ = dz / dist;
  const perpX = -dirZ * clearanceRadius;
  const perpZ = dirX * clearanceRadius;

  // Test 3 parallel rays (center + left shoulder + right shoulder) at chest height y=0.95
  const offsets = [
    { ox: 0, oz: 0 },
    { ox: perpX, oz: perpZ },
    { ox: -perpX, oz: -perpZ }
  ];

  for (const off of offsets) {
    const hit = raycastMap(
      { x: x1 + off.ox, y: 0.95, z: z1 + off.oz },
      { x: dirX, y: 0, z: dirZ },
      dist,
      map
    );
    if (hit && (!hit.block || !hit.block.isStep)) {
      return false;
    }
  }
  return true;
}

/**
 * Raycast against enemy players (Head, Body, Legs hitboxes) occluded by map geometry
 */
export function raycastShot(origin, dir, maxRange, map, combatants, shooterId, shooterTeam, teamBased = true) {
  const wallHit = raycastMap(origin, dir, maxRange, map);
  const maxPlayerDist = wallHit ? wallHit.dist : maxRange;

  let bestHit = null;
  let closestDist = maxPlayerDist;

  for (const target of combatants) {
    if (!target || target.id === shooterId || target.dead) continue;
    if (teamBased && shooterTeam && target.team === shooterTeam) continue;

    const totalH = target.crouching ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;
    const headSize = 0.24;
    const headBottom = target.y + totalH - 0.36;
    const headTop = target.y + totalH + 0.06;

    const headHit = intersectRayAABB(
      origin.x, origin.y, origin.z,
      dir.x, dir.y, dir.z,
      target.x - headSize, headBottom, target.z - headSize,
      target.x + headSize, headTop, target.z + headSize,
      closestDist
    );
    if (headHit && headHit.dist < closestDist) {
      closestDist = headHit.dist;
      bestHit = {
        type: 'player',
        target,
        hitZone: 'head',
        dist: headHit.dist,
        point: headHit.point,
        normal: headHit.normal
      };
      continue;
    }

    const bodyR = 0.37;
    const bodyHit = intersectRayAABB(
      origin.x, origin.y, origin.z,
      dir.x, dir.y, dir.z,
      target.x - bodyR, target.y, target.z - bodyR,
      target.x + bodyR, headBottom + 0.03, target.z + bodyR,
      closestDist
    );
    if (bodyHit && bodyHit.dist < closestDist) {
      closestDist = bodyHit.dist;
      const relY = bodyHit.point.y - target.y;
      const hitZone = relY < totalH * 0.42 ? 'legs' : 'body';
      bestHit = {
        type: 'player',
        target,
        hitZone,
        dist: bodyHit.dist,
        point: bodyHit.point,
        normal: bodyHit.normal
      };
    }
  }

  if (bestHit) return bestHit;
  if (wallHit) return { type: 'wall', ...wallHit };
  return {
    type: 'miss',
    dist: maxRange,
    point: {
      x: origin.x + dir.x * maxRange,
      y: origin.y + dir.y * maxRange,
      z: origin.z + dir.z * maxRange
    }
  };
}

export function hasLineOfSight(p1, p2, map) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-4) return true;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  const hit = raycastMap(p1, dir, dist - 0.15, map);
  return !hit;
}
