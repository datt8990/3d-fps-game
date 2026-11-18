// Shared 3D Physics, Collision, Step-Up, and Hitbox Raycasting (Server & Client)
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

function canStandAt(px, py, pz, height, r, blocks) {
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
 * Simulates 1 physics step for a player/bot on `map`
 * state: { x, y, z, vx, vy, vz, onGround, crouching }
 * input: { forward: -1..1, right: -1..1, sprint: bool, crouch: bool, jump: bool, ads: bool, yaw: rad }
 */
export function stepPlayerPhysics(state, input, map, dt, weaponMoveMult = 1.0, operatorSpeedMult = 1.0) {
  const clampedDt = Math.min(dt, 0.06);
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
  let nextX = state.x + state.vx * clampedDt;
  nextX = resolveAxisX(nextX, state, height, r, blocks);
  state.x = nextX;

  // Move Z with step-up support
  let nextZ = state.z + state.vz * clampedDt;
  nextZ = resolveAxisZ(nextZ, state, height, r, blocks);
  state.z = nextZ;

  // Clamp inside arena bounds
  const maxW = map.bounds.halfW - r;
  const maxD = map.bounds.halfD - r;
  if (state.x < -maxW) { state.x = -maxW; state.vx = 0; }
  if (state.x > maxW) { state.x = maxW; state.vx = 0; }
  if (state.z < -maxD) { state.z = -maxD; state.vz = 0; }
  if (state.z > maxD) { state.z = maxD; state.vz = 0; }

  // Move Y (floor + blocks, order-independent highest supporting surface)
  let nextY = state.y + state.vy * clampedDt;
  state.onGround = false;
  let bestFloorY = nextY <= 0 ? 0 : -Infinity;

  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (!overlapsXZ(state.x, state.z, r - 0.015, box)) continue;

    if (state.vy <= 0 && state.y >= box.maxY - 0.16 && nextY <= box.maxY + 0.002) {
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

function resolveAxisX(nextX, state, height, r, blocks) {
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

    if (state.vx > 0) {
      nextX = box.minX - r;
    } else if (state.vx < 0) {
      nextX = box.maxX + r;
    }
    state.vx = 0;
  }
  return nextX;
}

function resolveAxisZ(nextZ, state, height, r, blocks) {
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

    if (state.vz > 0) {
      nextZ = box.minZ - r;
    } else if (state.vz < 0) {
      nextZ = box.maxZ + r;
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

  // X slab
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

  // Y slab
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

  // Z slab
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

  // Floor y = 0
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
    // Generous, responsive FPS hitboxes (compensates slight network interpolation)
    const headSize = 0.24;
    const headBottom = target.y + totalH - 0.36;
    const headTop = target.y + totalH + 0.06;

    // 1. Check Head Hitbox first
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

    // 2. Check Torso & Legs Hitbox
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
