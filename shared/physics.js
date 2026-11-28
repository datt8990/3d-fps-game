// Shared 3D Physics, Spatial-Grid Multi-Block Collision, Heightfield Terrain & Hitbox Raycasting
import { PHYSICS } from './constants.js';
import { SWIM_DEPTH } from './terrain.js';

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

// ---------------------------------------------------------------------------------------------
// Uniform 2D spatial grid so open-world maps with thousands of colliders stay O(local) per query.
// The grid is attached to the blocks array itself (blocks.__grid) so every existing API keeps its signature.
// ---------------------------------------------------------------------------------------------
const EMPTY_LIST = [];
let queryStamp = 1;

export function buildBlockGrid(blocks, half, cs = 32) {
  const n = Math.ceil((half * 2) / cs) + 1;
  const cells = new Array(n * n);
  const clampI = (v) => (v < 0 ? 0 : (v >= n ? n - 1 : v));
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const x0 = clampI(Math.floor((b.x - b.w * 0.5 + half) / cs));
    const x1 = clampI(Math.floor((b.x + b.w * 0.5 + half) / cs));
    const z0 = clampI(Math.floor((b.z - b.d * 0.5 + half) / cs));
    const z1 = clampI(Math.floor((b.z + b.d * 0.5 + half) / cs));
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const idx = gz * n + gx;
        (cells[idx] || (cells[idx] = [])).push(b);
      }
    }
  }
  Object.defineProperty(blocks, '__grid', { value: { cs, half, n, cells }, enumerable: false, configurable: true });
  return blocks;
}

export function nearBlocks(blocks, x, z, r) {
  const g = blocks.__grid;
  if (!g) return blocks;
  const { cs, half, n, cells } = g;
  const clampI = (v) => (v < 0 ? 0 : (v >= n ? n - 1 : v));
  const x0 = clampI(Math.floor((x - r + half) / cs));
  const x1 = clampI(Math.floor((x + r + half) / cs));
  const z0 = clampI(Math.floor((z - r + half) / cs));
  const z1 = clampI(Math.floor((z + r + half) / cs));
  if (x0 === x1 && z0 === z1) return cells[z0 * n + x0] || EMPTY_LIST;
  const out = [];
  const stamp = ++queryStamp;
  for (let gz = z0; gz <= z1; gz++) {
    for (let gx = x0; gx <= x1; gx++) {
      const list = cells[gz * n + gx];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b._qs !== stamp) { b._qs = stamp; out.push(b); }
      }
    }
  }
  return out;
}

function gridRayBlocks(blocks, ox, oz, dx, dz, maxDist) {
  const g = blocks.__grid;
  if (!g) return blocks;
  const { cs, half, n, cells } = g;
  const out = [];
  const stamp = ++queryStamp;
  let cx = Math.floor((ox + half) / cs);
  let cz = Math.floor((oz + half) / cs);
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(dx) < 1e-9 ? Infinity : cs / Math.abs(dx);
  const tDeltaZ = Math.abs(dz) < 1e-9 ? Infinity : cs / Math.abs(dz);
  const nextBx = (dx > 0 ? (cx + 1) : cx) * cs - half;
  const nextBz = (dz > 0 ? (cz + 1) : cz) * cs - half;
  let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : (nextBx - ox) / dx;
  let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : (nextBz - oz) / dz;
  let t = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (cx >= 0 && cx < n && cz >= 0 && cz < n) {
      const list = cells[cz * n + cx];
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._qs !== stamp) { b._qs = stamp; out.push(b); }
        }
      }
    } else if (t > 0) {
      break;
    }
    if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; }
    else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
    if (t > maxDist) break;
  }
  return out;
}

export function canStandAt(px, py, pz, height, r, blocksIn) {
  const blocks = nearBlocks(blocksIn, px, pz, r + 0.1);
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
  const blocks = nearBlocks(map.blocks, state.x, state.z, r + 1.5);
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
  const terrain = map.terrain || null;
  const blocks = nearBlocks(map.blocks, state.x, state.z, 3.2);

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
  if (terrain) {
    const depth = terrain.depthAt(state.x, state.z);
    const inFluid = depth > 0.3 && state.y <= terrain.waterLevel + 0.15;
    state.inWater = inFluid;
    if (inFluid) {
      if (depth > SWIM_DEPTH) baseSpeed *= 0.45;
      else baseSpeed *= 0.74;
    }
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

  // Responsive FPS ground/air acceleration (CS:GO / Valorant snappy feel, instant WASD response)
  let accel;
  if (state.onGround) {
    if (wishLen > 1e-4) {
      // Check if counter-strafing / turning back (dot product of velocity and wish dir is negative)
      const dot = state.vx * wishX + state.vz * wishZ;
      accel = dot < 0 ? 64.0 : 48.0;
    } else {
      // Stopping / braking friction
      accel = 42.0;
    }
  } else {
    accel = 8.5;
  }
  const blend = Math.min(1, accel * clampedDt);
  state.vx = state.vx + (wishX - state.vx) * blend;
  state.vz = state.vz + (wishZ - state.vz) * blend;
  if (wishLen <= 1e-4 && Math.hypot(state.vx, state.vz) < 0.08) {
    state.vx = 0;
    state.vz = 0;
  }

  // Jump
  if (input.jump && state.onGround && !state.crouching) {
    state.vy = PHYSICS.JUMP_VELOCITY;
    state.onGround = false;
  }

  // Gravity
  state.vy -= PHYSICS.GRAVITY * clampedDt;
  if (state.vy < -32) state.vy = -32;
  const wasOnGround = Boolean(state.onGround);

  // Move X with step-up support
  const prevX = state.x;
  const prevZ = state.z;
  let nextX = prevX + state.vx * clampedDt;
  nextX = resolveAxisX(prevX, nextX, state, height, r, blocks);
  state.x = nextX;
  let nextZ = prevZ + state.vz * clampedDt;
  nextZ = resolveAxisZ(prevZ, nextZ, state, height, r, blocks);

  // Terrain slope / cliff limit: sheer faces cannot be walked up, gentle hills can
  if (terrain) {
    const stepLen = Math.hypot(nextX - prevX, nextZ - prevZ);
    const gCur = terrain.floorAt(prevX, prevZ);
    const allow = Math.max(state.y, gCur) + (wasOnGround ? stepLen * 0.95 + 0.14 : 0.32);
    if (terrain.floorAt(nextX, nextZ) > allow) {
      if (terrain.floorAt(nextX, prevZ) <= allow) {
        nextZ = prevZ;
        state.vz = 0;
      } else if (terrain.floorAt(prevX, nextZ) <= allow) {
        nextX = prevX;
        state.vx = 0;
      } else {
        nextX = prevX;
        nextZ = prevZ;
        state.vx = 0;
        state.vz = 0;
      }
    }
  }
  state.x = nextX;
  state.z = nextZ;

  // Enforce multi-block corner depenetration so nothing can ever clip through walls
  depenetratePlayerXZ(state, height, r, map);

  // Move Y (blocks + terrain floor, order-independent highest supporting surface)
  let nextY = state.y + state.vy * clampedDt;
  state.onGround = false;
  const groundY = terrain ? terrain.floorAt(state.x, state.z) : 0;
  let bestFloorY = nextY <= groundY ? groundY : -Infinity;
  let hasSupportingBlockUnder = false;

  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (!overlapsXZ(state.x, state.z, r, box)) continue;

    if (terrain && box.maxY > groundY && box.maxY <= state.y + 0.12) {
      hasSupportingBlockUnder = true;
    }

    if (state.vy <= 0 && state.y >= box.maxY - 0.18 && nextY <= box.maxY + 0.005) {
      if (box.maxY > bestFloorY) {
        bestFloorY = box.maxY;
      }
    } else if (state.vy > 0 && state.y + height <= box.minY + 0.15 && nextY + height >= box.minY) {
      nextY = box.minY - height;
      state.vy = 0;
    }
  }

  // Only snap down to bare terrain slopes when NOT standing on a building floor/stair/platform
  if (
    terrain && bestFloorY === -Infinity && !hasSupportingBlockUnder && wasOnGround && state.vy <= 0 &&
    state.y - groundY <= 0.55 &&
    nextY - groundY <= 0.42 + Math.hypot(state.x - prevX, state.z - prevZ) * 1.05
  ) {
    bestFloorY = groundY;
  }

  if (bestFloorY > -Infinity) {
    nextY = bestFloorY;
    state.vy = 0;
    state.onGround = true;
  }

  state.y = nextY;
  return state;
}

/**
 * Simulates Battle Royale drop-plane, skydive, and parachute glide physics on `map`.
 */
export function stepAirbornePhysics(state, input, map, dt, dropPlane = null) {
  const clampedDt = Math.min(dt, 0.05);
  const r = PHYSICS.PLAYER_RADIUS;
  const terrain = map.terrain || null;

  if (state.dropPhase === 'plane' && dropPlane) {
    state.x = dropPlane.x;
    state.y = dropPlane.y;
    state.z = dropPlane.z;
    state.vx = 0;
    state.vy = 0;
    state.vz = 0;
    state.onGround = false;
    return state;
  }

  const isChute = state.dropPhase === 'parachute';
  const fwdIn = input.forward || 0;
  const rightIn = input.right || 0;
  const horizSpeed = isChute ? (fwdIn < 0 ? 10.5 : 19.5) : 32.0;
  const sinY = Math.sin(input.yaw || 0);
  const cosY = Math.cos(input.yaw || 0);
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;

  let wishX = fwdX * fwdIn + rightX * rightIn;
  let wishZ = fwdZ * fwdIn + rightZ * rightIn;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX = (wishX / wishLen) * horizSpeed;
    wishZ = (wishZ / wishLen) * horizSpeed;
  } else if (isChute) {
    // Gentle forward canopy glide when neutral so player drifts cleanly
    wishX = fwdX * 5.2;
    wishZ = fwdZ * 5.2;
  }

  const blend = Math.min(1, (isChute ? 4.4 : 3.2) * clampedDt);
  state.vx = (state.vx || 0) + (wishX - (state.vx || 0)) * blend;
  state.vz = (state.vz || 0) + (wishZ - (state.vz || 0)) * blend;

  const pitchDive = Math.max(0, -(input.pitch || 0));
  let targetVy;
  if (isChute) {
    // Slow controllable canopy descent: brake (-2.4m/s) with S, standard (-3.8m/s), glide-dive (-6.4m/s)
    if (fwdIn < 0) targetVy = -2.4;
    else targetVy = -3.8 - (fwdIn > 0 ? pitchDive * 2.6 : pitchDive * 1.1);
  } else {
    targetVy = -20.0 - pitchDive * 22.0;
  }
  state.vy = (state.vy || targetVy) + (targetVy - (state.vy || targetVy)) * Math.min(1, 5.0 * clampedDt);

  state.x += state.vx * clampedDt;
  state.z += state.vz * clampedDt;
  state.y += state.vy * clampedDt;
  state.onGround = false;

  const maxW = map.bounds.halfW - r - 0.5;
  const maxD = map.bounds.halfD - r - 0.5;
  state.x = Math.max(-maxW, Math.min(maxW, state.x));
  state.z = Math.max(-maxD, Math.min(maxD, state.z));

  const groundFloorY = terrain ? terrain.floorAt(state.x, state.z) : 0;
  const agl = state.y - groundFloorY;

  if (!isChute && agl <= 55) {
    state.dropPhase = 'parachute';
    state.vy = Math.max(state.vy, -6.5);
  }

  // Landing surface check (terrain height / water floor or building roof / bridge directly under feet)
  let surfaceY = groundFloorY;
  const nearby = nearBlocks(map.blocks, state.x, state.z, r + 1.5);
  for (let i = 0; i < nearby.length; i++) {
    const box = getBoxBounds(nearby[i]);
    if (!overlapsXZ(state.x, state.z, r, box)) continue;
    if (box.maxY <= state.y + 0.65 && box.maxY > surfaceY) {
      surfaceY = box.maxY;
    }
  }

  if (state.y <= surfaceY + 0.08) {
    state.y = surfaceY;
    state.vy = 0;
    state.onGround = true;
    state.dropPhase = 'ground';
    depenetratePlayerXZ(state, PHYSICS.HEIGHT_STAND, r, map);
  }
  return state;
}

function resolveAxisX(prevX, nextX, state, height, r, blocks) {
  const movingDir = nextX - prevX;
  for (let i = 0; i < blocks.length; i++) {
    const box = getBoxBounds(blocks[i]);
    if (nextX + r <= box.minX || nextX - r >= box.maxX) continue;
    if (state.z + r <= box.minZ || state.z - r >= box.maxZ) continue;
    if (state.y >= box.maxY - 0.01 || state.y + height <= box.minY + 0.01) continue;

    // Attempt step-up if obstacle top is within STEP_HEIGHT, OR smooth mid-air window/ledge vault when jumping
    const stepDiff = box.maxY - state.y;
    const canStepGround = (state.onGround || stepDiff <= 0.18) && stepDiff > 0 && stepDiff <= PHYSICS.STEP_HEIGHT;
    const canVaultAir = !state.onGround && state.vy > -3.5 && stepDiff > 0 && stepDiff <= 0.56;
    if ((canStepGround || canVaultAir) && canStandAt(nextX, box.maxY + 0.01, state.z, height, r, blocks)) {
      state.y = box.maxY + 0.01;
      if (canVaultAir) state.vy = Math.max(state.vy, 1.35);
      continue;
    }

    // Never eject a player out the far side of a wide floor/stair slab they already overlap in XZ!
    const alreadyInX = prevX + r > box.minX && prevX - r < box.maxX;
    if (alreadyInX && stepDiff > 0 && stepDiff <= PHYSICS.STEP_HEIGHT + 0.08) {
      if (canStandAt(prevX, box.maxY + 0.01, state.z, height, r, blocks)) {
        state.y = box.maxY + 0.01;
      }
      nextX = prevX;
      state.vx = 0;
      continue;
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
    const canStepGround = (state.onGround || stepDiff <= 0.18) && stepDiff > 0 && stepDiff <= PHYSICS.STEP_HEIGHT;
    const canVaultAir = !state.onGround && state.vy > -3.5 && stepDiff > 0 && stepDiff <= 0.56;
    if ((canStepGround || canVaultAir) && canStandAt(state.x, box.maxY + 0.01, nextZ, height, r, blocks)) {
      state.y = box.maxY + 0.01;
      if (canVaultAir) state.vy = Math.max(state.vy, 1.35);
      continue;
    }

    // Never eject a player out the far side of a wide floor/stair slab they already overlap in XZ!
    const alreadyInZ = prevZ + r > box.minZ && prevZ - r < box.maxZ;
    if (alreadyInZ && stepDiff > 0 && stepDiff <= PHYSICS.STEP_HEIGHT + 0.08) {
      if (canStandAt(state.x, box.maxY + 0.01, prevZ, height, r, blocks)) {
        state.y = box.maxY + 0.01;
      }
      nextZ = prevZ;
      state.vz = 0;
      continue;
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
  const terrain = map.terrain || null;

  if (terrain) {
    const step = 4.0;
    let prevT = 0;
    for (let t = step; t <= bestDist; t += step) {
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      if (Math.abs(px) > map.bounds.halfW || Math.abs(pz) > map.bounds.halfD) break;
      const th = terrain.heightAt(px, pz);
      if (py <= th) {
        let lo = prevT;
        let hi = t;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) * 0.5;
          const mx = origin.x + dir.x * mid;
          const my = origin.y + dir.y * mid;
          const mz = origin.z + dir.z * mid;
          if (my <= terrain.heightAt(mx, mz)) hi = mid;
          else lo = mid;
        }
        bestDist = hi;
        const hx = origin.x + dir.x * hi;
        const hz = origin.z + dir.z * hi;
        closest = {
          dist: hi,
          point: { x: hx, y: terrain.heightAt(hx, hz), z: hz },
          normal: terrain.normalAt(hx, hz),
          mat: map.floorMat
        };
        break;
      }
      prevT = t;
    }
  } else if (dir.y < -1e-6 && origin.y > 0) {
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

  const blocks = gridRayBlocks(map.blocks, origin.x, origin.z, dir.x, dir.z, bestDist);
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

  const terrain = map.terrain || null;
  if (terrain) {
    const samples = Math.max(2, Math.ceil(dist / 12));
    for (let s = 1; s < samples; s++) {
      const px = x1 + (dx * s) / samples;
      const pz = z1 + (dz * s) / samples;
      if (terrain.slopeAt(px, pz) > 0.78 || terrain.depthAt(px, pz) > SWIM_DEPTH) {
        return false;
      }
    }
  }

  const dirX = dx / dist;
  const dirZ = dz / dist;
  const perpX = -dirZ * clearanceRadius;
  const perpZ = dirX * clearanceRadius;
  const groundOff = terrain ? terrain.floorAt(x1, z1) : 0;

  // Test 3 parallel rays (center + left shoulder + right shoulder) at chest height y=ground+0.95
  const offsets = [
    { ox: 0, oz: 0 },
    { ox: perpX, oz: perpZ },
    { ox: -perpX, oz: -perpZ }
  ];

  for (const off of offsets) {
    const hit = raycastMap(
      { x: x1 + off.ox, y: groundOff + 0.95, z: z1 + off.oz },
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
    if (Math.hypot(target.x - origin.x, target.z - origin.z) > closestDist + 1.5) continue;

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
