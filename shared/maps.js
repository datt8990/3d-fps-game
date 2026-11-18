// Shared 3D Map definitions with Zero-Z-Fighting Geometry, Open-World 5km Terrain & Auto-Verified LOS Nav Graph
import { buildTerrain, hash01 } from './terrain.js';
import { buildBlockGrid } from './physics.js';

function makeStairs(x, z, treadWidth, runLength, totalHeight, dir = 'north', mat = 'concrete', steps = 8, baseY = 0) {
  // dir: direction going UP ('north' = -z, 'south' = +z, 'east' = +x, 'west' = -x)
  // Exact non-overlapping risers eliminate 100% of coplanar Z-fighting flicker!
  const boxes = [];
  const stepH = totalHeight / steps;
  const stepLen = runLength / steps;

  for (let i = 0; i < steps; i++) {
    const h = Number((stepH * (i + 1)).toFixed(3));
    const offset = -runLength * 0.5 + stepLen * (i + 0.5);
    let sx = x;
    let sz = z;
    let sw = treadWidth;
    let sd = treadWidth;

    if (dir === 'north') {
      sz = z - offset;
      sw = treadWidth;
      sd = stepLen - 0.004;
    } else if (dir === 'south') {
      sz = z + offset;
      sw = treadWidth;
      sd = stepLen - 0.004;
    } else if (dir === 'east') {
      sx = x + offset;
      sw = stepLen - 0.004;
      sd = treadWidth;
    } else if (dir === 'west') {
      sx = x - offset;
      sw = stepLen - 0.004;
      sd = treadWidth;
    }

    boxes.push({ x: sx, y: baseY, z: sz, w: sw, h, d: sd, mat, isStep: true });
  }
  return boxes;
}

function makeBoundaryWalls(halfW, halfD, wallH = 8, mat = 'wall_outer') {
  const t = 1.2;
  return [
    { x: 0, y: 0, z: -halfD - t / 2, w: halfW * 2 + t * 2, h: wallH, d: t, mat, isBoundary: true },
    { x: 0, y: 0, z: halfD + t / 2, w: halfW * 2 + t * 2, h: wallH, d: t, mat, isBoundary: true },
    { x: -halfW - t / 2, y: 0, z: 0, w: t, h: wallH, d: halfD * 2, mat, isBoundary: true },
    { x: halfW + t / 2, y: 0, z: 0, w: t, h: wallH, d: halfD * 2, mat, isBoundary: true }
  ];
}

// Capsule-width 2D segment vs AABB intersection check so waypoint links NEVER cross any wall/crate
function segmentHitsBlockXZ(x1, z1, x2, z2, b, pad = 0.55) {
  if (b.isStep || b.y >= 2.2 || b.y + b.h <= 0.45) return false;
  const minX = b.x - b.w * 0.5 - pad;
  const maxX = b.x + b.w * 0.5 + pad;
  const minZ = b.z - b.d * 0.5 - pad;
  const maxZ = b.z + b.d * 0.5 + pad;

  const dx = x2 - x1;
  const dz = z2 - z1;
  let t0 = 0;
  let t1 = 1;

  const clip = (p, q) => {
    if (Math.abs(p) < 1e-8) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    clip(-dx, x1 - minX) &&
    clip(dx, maxX - x1) &&
    clip(-dz, z1 - minZ) &&
    clip(dz, maxZ - z1)
  ) {
    return t0 <= t1;
  }
  return false;
}

function buildVerifiedWaypoints(rawNodes, blocks, maxLinkDist = 25) {
  const waypoints = rawNodes.map((n, idx) => ({
    id: idx,
    x: n.x,
    z: n.z,
    links: []
  }));

  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      const a = waypoints[i];
      const b = waypoints[j];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > maxLinkDist) continue;

      let blocked = false;
      for (let k = 0; k < blocks.length; k++) {
        if (segmentHitsBlockXZ(a.x, a.z, b.x, b.z, blocks[k], 0.52)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        a.links.push(b.id);
        b.links.push(a.id);
      }
    }
  }
  return waypoints;
}

// ============================================================================
// MAP 1: NHÀ KHO (Transport Warehouse - 5v5 Fast-Paced Symmetrical Arena)
// ============================================================================
function buildWarehouseMap() {
  const halfW = 24;
  const halfD = 34;
  const blocks = [
    ...makeBoundaryWalls(halfW, halfD, 9, 'warehouse_wall'),

    // Spawn protection front walls with 4 clear doorway gaps:
    // Far-West (-24..-19), Inner-West (-8..-3.75), Inner-East (+3.75..+8), Far-East (+19..+24)
    { x: -13.5, y: 0, z: -24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },
    { x: 0, y: 0, z: -24, w: 7.5, h: 2.8, d: 0.9, mat: 'concrete' },
    { x: 13.5, y: 0, z: -24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },

    { x: -13.5, y: 0, z: 24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },
    { x: 0, y: 0, z: 24, w: 7.5, h: 2.8, d: 0.9, mat: 'concrete' },
    { x: 13.5, y: 0, z: 24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },

    // Elevated Sniper Platforms in Alpha & Bravo bases (Flush non-overlapping stairs!)
    { x: -18.0, y: 0, z: -29.8, w: 10.0, h: 2.6, d: 6.2, mat: 'metal_deck' },
    { x: -15.5, y: 2.6, z: -26.9, w: 4.8, h: 1.05, d: 0.35, mat: 'sandbag' },
    ...makeStairs(-10.6, -29.8, 3.8, 4.7, 2.6, 'west', 'metal_step', 8),

    { x: 18.0, y: 0, z: 29.8, w: 10.0, h: 2.6, d: 6.2, mat: 'metal_deck' },
    { x: 15.5, y: 2.6, z: 26.9, w: 4.8, h: 1.05, d: 0.35, mat: 'sandbag' },
    ...makeStairs(10.6, 29.8, 3.8, 4.7, 2.6, 'east', 'metal_step', 8),

    // Shipping Containers (Stacked without Z-fighting)
    { x: -5.8, y: 0, z: -7.5, w: 3.0, h: 2.8, d: 7.2, mat: 'container_red' },
    { x: -5.8, y: 2.804, z: -7.5, w: 2.98, h: 2.8, d: 7.18, mat: 'container_yellow' },
    { x: 5.8, y: 0, z: 7.5, w: 3.0, h: 2.8, d: 7.2, mat: 'container_blue' },
    { x: 5.8, y: 2.804, z: 7.5, w: 2.98, h: 2.8, d: 7.18, mat: 'container_red' },

    // Center Mid Cross-Cover Crates
    { x: 0, y: 0, z: 0, w: 3.0, h: 2.1, d: 3.0, mat: 'crate_metal' },
    { x: -2.5, y: 0, z: 2.0, w: 1.4, h: 1.15, d: 1.4, mat: 'crate_wood' },
    { x: 2.5, y: 0, z: -2.0, w: 1.4, h: 1.15, d: 1.4, mat: 'crate_wood' },

    // East Lane (Bomb Site A - Cargo Bay)
    { x: 14.5, y: 0, z: -11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_blue' },
    { x: 14.5, y: 0, z: 11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_green' },
    { x: 11.2, y: 0, z: 0, w: 2.0, h: 2.0, d: 2.0, mat: 'crate_metal' },
    // Climbable catwalk on East side (Flush stairs at z = -7.2 and +7.2)
    { x: 21.2, y: 0, z: 0, w: 4.6, h: 2.4, d: 9.8, mat: 'metal_deck' },
    ...makeStairs(21.2, -7.15, 3.4, 4.4, 2.4, 'south', 'metal_step', 7),
    ...makeStairs(21.2, 7.15, 3.4, 4.4, 2.4, 'north', 'metal_step', 7),

    // West Lane (Bomb Site B - Container Corridor)
    { x: -14.5, y: 0, z: 11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_red' },
    { x: -14.5, y: 0, z: -11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_yellow' },
    { x: -20.8, y: 0, z: 0, w: 2.8, h: 3.2, d: 8.2, mat: 'concrete' },
    { x: -12.0, y: 0, z: -2.2, w: 1.8, h: 1.2, d: 1.8, mat: 'crate_wood' },
    { x: -12.0, y: 0, z: 2.2, w: 1.9, h: 2.0, d: 1.9, mat: 'crate_metal' },

    // Mid-Base Transitional Cover Crates
    { x: 5.5, y: 0, z: -16.5, w: 2.4, h: 1.9, d: 2.4, mat: 'crate_wood' },
    { x: -5.5, y: 0, z: 16.5, w: 2.4, h: 1.9, d: 2.4, mat: 'crate_wood' },

    // Overhead Steel Warehouse Roof Beams
    { x: 0, y: 7.8, z: -20, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' },
    { x: 0, y: 7.8, z: -7, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' },
    { x: 0, y: 7.8, z: 7, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' },
    { x: 0, y: 7.8, z: 20, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' }
  ];

  // Dense tactical waypoints aligned with every doorway gap and corridor
  const rawNodes = [
    // Alpha spawn & doorway exits
    { x: -6.0, z: -29.0 }, { x: 0.0, z: -29.0 }, { x: 6.0, z: -29.0 }, { x: 20.5, z: -29.0 },
    { x: -21.2, z: -24.0 }, { x: -5.8, z: -24.0 }, { x: 5.8, z: -24.0 }, { x: 21.2, z: -24.0 },
    // North-Mid & Flanks
    { x: -20.5, z: -16.0 }, { x: -9.5, z: -16.0 }, { x: 0.0, z: -16.0 }, { x: 10.0, z: -16.0 }, { x: 20.5, z: -16.0 },
    // Mid-North & Side Lanes
    { x: -17.5, z: -6.0 }, { x: -10.0, z: -6.0 }, { x: -1.8, z: -6.0 }, { x: 5.5, z: -6.0 }, { x: 10.0, z: -6.0 }, { x: 17.5, z: -6.0 },
    // Center & Bomb Sites A/B
    { x: -16.5, z: 0.0 }, { x: -8.8, z: 0.0 }, { x: -4.2, z: 0.0 }, { x: 4.2, z: 0.0 }, { x: 8.5, z: 0.0 }, { x: 15.8, z: 0.0 },
    // Mid-South & Side Lanes
    { x: -17.5, z: 6.0 }, { x: -10.0, z: 6.0 }, { x: -5.5, z: 6.0 }, { x: 1.8, z: 6.0 }, { x: 10.0, z: 6.0 }, { x: 17.5, z: 6.0 },
    // South-Mid & Flanks
    { x: -20.5, z: 16.0 }, { x: -10.0, z: 16.0 }, { x: 0.0, z: 16.0 }, { x: 9.5, z: 16.0 }, { x: 20.5, z: 16.0 },
    // Bravo doorway exits & spawn
    { x: -21.2, z: 24.0 }, { x: -5.8, z: 24.0 }, { x: 5.8, z: 24.0 }, { x: 21.2, z: 24.0 },
    { x: -20.5, z: 29.0 }, { x: -6.0, z: 29.0 }, { x: 0.0, z: 29.0 }, { x: 6.0, z: 29.0 }
  ];

  return {
    id: 'warehouse',
    name: 'Nhà Kho Vận Tải',
    subtitle: 'Bản đồ nhỏ • Cận chiến 5v5 tốc độ cao',
    theme: 'industrial',
    skyColor: '#6989a8',
    fogColor: '#7c96b0',
    fogDensity: 0.0055,
    floorMat: 'concrete_warehouse',
    bounds: { halfW, halfD },
    blocks,
    bombSites: [
      { id: 'A', x: 15.8, y: 0, z: 0, radius: 4.2, label: 'KHU A (Bãi Hàng)' },
      { id: 'B', x: -16.2, y: 0, z: 0, radius: 4.2, label: 'KHU B (Container)' }
    ],
    spawns: {
      alpha: [
        { x: -6.0, y: 0, z: -28.5, yaw: Math.PI },
        { x: -2.0, y: 0, z: -29.0, yaw: Math.PI },
        { x: 2.0, y: 0, z: -29.0, yaw: Math.PI },
        { x: 6.0, y: 0, z: -28.5, yaw: Math.PI },
        { x: 16.0, y: 0, z: -28.5, yaw: Math.PI }
      ],
      bravo: [
        { x: 6.0, y: 0, z: 28.5, yaw: 0 },
        { x: 2.0, y: 0, z: 29.0, yaw: 0 },
        { x: -2.0, y: 0, z: 29.0, yaw: 0 },
        { x: -6.0, y: 0, z: 28.5, yaw: 0 },
        { x: -16.0, y: 0, z: 28.5, yaw: 0 }
      ],
      ffa: [
        { x: -5.8, y: 0, z: -28.5, yaw: Math.PI },
        { x: 16.0, y: 0, z: -28.5, yaw: Math.PI },
        { x: 5.8, y: 0, z: 28.5, yaw: 0 },
        { x: -16.0, y: 0, z: 28.5, yaw: 0 },
        { x: 15.8, y: 0, z: 0, yaw: Math.PI / 2 },
        { x: -16.2, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 0, y: 0, z: -16.0, yaw: Math.PI },
        { x: 0, y: 0, z: 16.0, yaw: 0 },
        { x: 10.0, y: 0, z: -16.0, yaw: Math.PI },
        { x: -10.0, y: 0, z: 16.0, yaw: 0 }
      ]
    },
    waypoints: buildVerifiedWaypoints(rawNodes, blocks, 18),
    lootSpawns: [
      { x: 0, y: 0, z: -8 }, { x: 0, y: 0, z: 8 },
      { x: 15.8, y: 0, z: 0 }, { x: -16.2, y: 0, z: 0 },
      { x: 10, y: 0, z: -18 }, { x: -10, y: 0, z: 18 },
      { x: 21.2, y: 2.4, z: 0 }, { x: -18.0, y: 2.6, z: -29.8 }
    ]
  };
}

// ============================================================================
// MAP 2: CĂN CỨ QUÂN SỰ (Military Base - Tactical Ambush & Watchtowers)
// ============================================================================
function buildMilitaryBaseMap() {
  const halfW = 40;
  const halfD = 38;
  const blocks = [
    ...makeBoundaryWalls(halfW, halfD, 9, 'military_wall'),

    // Central Radar Command Bunker (x: -7..+7, z: -6..+6) + Flush Stairs
    { x: 0, y: 0, z: 0, w: 14, h: 3.0, d: 12, mat: 'bunker_concrete' },
    { x: 0, y: 3.0, z: -5.6, w: 9, h: 1.05, d: 0.5, mat: 'sandbag' },
    { x: 0, y: 3.0, z: 5.6, w: 9, h: 1.05, d: 0.5, mat: 'sandbag' },
    { x: 0, y: 3.0, z: 0, w: 2.4, h: 2.6, d: 2.4, mat: 'metal_dark' },
    ...makeStairs(-9.65, 0, 4.2, 5.2, 3.0, 'east', 'concrete', 8),
    ...makeStairs(9.65, 0, 4.2, 5.2, 3.0, 'west', 'concrete', 8),

    // North & South Sniper Watchtowers (Flush non-overlapping stairs)
    { x: -24, y: 0, z: -20, w: 6.4, h: 3.4, d: 6.4, mat: 'metal_deck' },
    { x: -24, y: 3.4, z: -17.0, w: 5.4, h: 1.1, d: 0.4, mat: 'sandbag' },
    ...makeStairs(-24, -25.85, 3.6, 5.2, 3.4, 'south', 'metal_step', 9),

    { x: 24, y: 0, z: 20, w: 6.4, h: 3.4, d: 6.4, mat: 'metal_deck' },
    { x: 24, y: 3.4, z: 17.0, w: 5.4, h: 1.1, d: 0.4, mat: 'sandbag' },
    ...makeStairs(24, 25.85, 3.6, 5.2, 3.4, 'north', 'metal_step', 9),

    // East Sector: Helipad & Fuel Depot (Bomb Site A)
    { x: 25, y: 0, z: -10, w: 3.4, h: 2.8, d: 8.0, mat: 'container_green' },
    { x: 32, y: 0, z: 2, w: 4.5, h: 3.2, d: 9.0, mat: 'bunker_concrete' },
    { x: 21, y: 0, z: 6, w: 5.0, h: 1.15, d: 0.7, mat: 'sandbag' },
    { x: 18, y: 0, z: -16, w: 6.0, h: 2.6, d: 3.2, mat: 'container_yellow' },

    // West Sector: Armory Hangar Walls (Bomb Site B - Non-overlapping roof at y=4.5!)
    { x: -33.5, y: 0, z: 0, w: 1.0, h: 4.5, d: 20.0, mat: 'bunker_concrete' },
    { x: -18.5, y: 0, z: -6.5, w: 1.0, h: 4.5, d: 7.0, mat: 'bunker_concrete' },
    { x: -18.5, y: 0, z: 6.5, w: 1.0, h: 4.5, d: 7.0, mat: 'bunker_concrete' },
    { x: -26.0, y: 4.5, z: 0, w: 16.0, h: 0.55, d: 20.0, mat: 'metal_dark' },
    { x: -28.0, y: 0, z: -5.0, w: 2.4, h: 1.9, d: 2.4, mat: 'crate_metal' },
    { x: -28.5, y: 0, z: 5.0, w: 2.8, h: 1.25, d: 2.0, mat: 'crate_wood' },
    { x: -22.0, y: 0, z: 14.5, w: 6.0, h: 1.15, d: 0.7, mat: 'sandbag' },

    // Trench & Ambush Barriers between Spawn Bases and Mid
    { x: -6, y: 0, z: -18, w: 8.0, h: 2.4, d: 1.4, mat: 'bunker_concrete' },
    { x: 8, y: 0, z: -14, w: 5.0, h: 1.15, d: 0.7, mat: 'sandbag' },
    { x: 6, y: 0, z: 18, w: 8.0, h: 2.4, d: 1.4, mat: 'bunker_concrete' },
    { x: -8, y: 0, z: 14, w: 5.0, h: 1.15, d: 0.7, mat: 'sandbag' },

    // Spawn Base Blast Shields (x: -7..+7 at z = -29 and +29)
    { x: 0, y: 0, z: -29, w: 14, h: 3.2, d: 1.2, mat: 'bunker_concrete' },
    { x: 0, y: 0, z: 29, w: 14, h: 3.2, d: 1.2, mat: 'bunker_concrete' }
  ];

  const rawNodes = [
    // Alpha Spawn & Flank Exits around the z=-29 Blast Shield
    { x: -10, z: -33.5 }, { x: 0, z: -33.5 }, { x: 10, z: -33.5 }, { x: 19, z: -32 },
    { x: -13, z: -28 }, { x: 13, z: -28 }, { x: -30, z: -28 }, { x: 30, z: -28 },
    // North Lanes
    { x: -15, z: -21 }, { x: 3, z: -22 }, { x: 13, z: -21 }, { x: 28, z: -20 },
    // Mid-North Corridors
    { x: -26, z: -13 }, { x: -14, z: -10 }, { x: 0, z: -10 }, { x: 14, z: -9 }, { x: 29, z: -9 },
    // Center & Bomb Sites A/B
    { x: -26, z: 0 }, { x: -15, z: 0 }, { x: 15, z: 0 }, { x: 25.5, z: 0.5 },
    // Mid-South Corridors
    { x: -26, z: 12 }, { x: -14, z: 10 }, { x: 0, z: 10 }, { x: 14, z: 10 }, { x: 28, z: 11 },
    // South Lanes
    { x: -28, z: 21 }, { x: -13, z: 21 }, { x: -3, z: 22 }, { x: 15, z: 21 },
    // Bravo Flank Exits & Spawn
    { x: -30, z: 28 }, { x: -13, z: 28 }, { x: 13, z: 28 }, { x: 30, z: 28 },
    { x: -19, z: 32 }, { x: -10, z: 33.5 }, { x: 0, z: 33.5 }, { x: 10, z: 33.5 }
  ];

  return {
    id: 'military_base',
    name: 'Căn Cứ Quân Sự',
    subtitle: 'Nhiều chòi canh, hầm chỉ huy & vị trí phục kích',
    theme: 'desert_military',
    skyColor: '#c9a679',
    fogColor: '#bfa17c',
    fogDensity: 0.0046,
    floorMat: 'sand_tactical',
    bounds: { halfW, halfD },
    blocks,
    bombSites: [
      { id: 'A', x: 25.5, y: 0, z: 0.5, radius: 4.8, label: 'KHU A (Sân Trực Thăng)' },
      { id: 'B', x: -25.5, y: 0, z: 0, radius: 4.8, label: 'KHU B (Kho Vũ Khí)' }
    ],
    spawns: {
      alpha: [
        { x: -12, y: 0, z: -33.5, yaw: Math.PI },
        { x: -8.5, y: 0, z: -33.5, yaw: Math.PI },
        { x: 0, y: 0, z: -34.0, yaw: Math.PI },
        { x: 9.5, y: 0, z: -33.5, yaw: Math.PI },
        { x: 18, y: 0, z: -32.0, yaw: Math.PI }
      ],
      bravo: [
        { x: 12, y: 0, z: 33.5, yaw: 0 },
        { x: 8.5, y: 0, z: 33.5, yaw: 0 },
        { x: 0, y: 0, z: 34.0, yaw: 0 },
        { x: -9.5, y: 0, z: 33.5, yaw: 0 },
        { x: -18, y: 0, z: 32.0, yaw: 0 }
      ],
      ffa: [
        { x: -31, y: 0, z: -29, yaw: Math.PI },
        { x: 31, y: 0, z: -29, yaw: Math.PI },
        { x: -31, y: 0, z: 29, yaw: 0 },
        { x: 31, y: 0, z: 29, yaw: 0 },
        { x: 25.5, y: 0, z: 0.5, yaw: Math.PI / 2 },
        { x: -25.5, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 0, y: 0, z: -22, yaw: Math.PI },
        { x: 0, y: 0, z: 22, yaw: 0 },
        { x: 15, y: 0, z: -21, yaw: Math.PI },
        { x: -15, y: 0, z: 21, yaw: 0 }
      ]
    },
    waypoints: buildVerifiedWaypoints(rawNodes, blocks, 22),
    lootSpawns: [
      { x: 0, y: 3.0, z: 2.5 }, { x: 25.5, y: 0, z: 2 },
      { x: -25.5, y: 0, z: 0 }, { x: -14, y: 0, z: -15 },
      { x: 14, y: 0, z: 15 }, { x: -24, y: 3.4, z: -20 },
      { x: 24, y: 3.4, z: 20 }, { x: 0, y: 0, z: -11 }
    ]
  };
}

// ============================================================================
// MAP 3: THÀNH PHỐ (Urban District - Alleys, Buildings & Sniper Balconies)
// ============================================================================
function buildUrbanCityMap() {
  const halfW = 42;
  const halfD = 40;
  const blocks = [
    ...makeBoundaryWalls(halfW, halfD, 11, 'city_wall'),

    // Central Plaza Monument (Non-overlapping plinth y=0..1 + obelisk y=1..4.8!)
    { x: 0, y: 0, z: 0, w: 7.6, h: 1.0, d: 7.6, mat: 'concrete' },
    { x: 0, y: 1.0, z: 0, w: 3.2, h: 3.8, d: 3.2, mat: 'marble_dark' },

    // NW Commercial Tower + East-facing Sniper Balcony + Flush Stairs
    { x: -18, y: 0, z: -14, w: 12, h: 7.5, d: 12, mat: 'building_brick' },
    { x: -10.2, y: 0, z: -14, w: 3.5, h: 3.0, d: 10, mat: 'concrete' },
    { x: -8.65, y: 3.0, z: -14, w: 0.4, h: 1.05, d: 9.6, mat: 'metal_dark' },
    ...makeStairs(-10.2, -21.55, 3.4, 5.0, 3.0, 'south', 'concrete', 8),

    // SE Tech Corp Building + West-facing Sniper Balcony + Flush Stairs
    { x: 18, y: 0, z: 14, w: 12, h: 7.5, d: 12, mat: 'building_glass' },
    { x: 10.2, y: 0, z: 14, w: 3.5, h: 3.0, d: 10, mat: 'concrete' },
    { x: 8.65, y: 3.0, z: 14, w: 0.4, h: 1.05, d: 9.6, mat: 'metal_dark' },
    ...makeStairs(10.2, 21.55, 3.4, 5.0, 3.0, 'north', 'concrete', 8),

    // NE Shop Block & Narrow East Alleyway (Ngõ Đông)
    { x: 19, y: 0, z: -15, w: 11, h: 6.8, d: 10, mat: 'building_glass' },
    { x: 34, y: 0, z: -6, w: 8, h: 6.5, d: 18, mat: 'building_brick' },

    // SW Apartment Block & Narrow West Alleyway (Ngõ Tây)
    { x: -19, y: 0, z: 15, w: 11, h: 6.8, d: 10, mat: 'building_brick' },
    { x: -34, y: 0, z: 6, w: 8, h: 6.5, d: 18, mat: 'building_glass' },

    // Abandoned Tactical Trucks / Buses & Street Cover
    { x: 6.8, y: 0, z: -12, w: 2.6, h: 2.5, d: 6.2, mat: 'container_blue' },
    { x: -6.8, y: 0, z: 12, w: 2.6, h: 2.5, d: 6.2, mat: 'container_red' },

    // Bomb Site A (East Metro Courtyard) & Bomb Site B (West Backstreet) Cover
    { x: 25.5, y: 0, z: -3.5, w: 2.4, h: 1.9, d: 2.4, mat: 'crate_metal' },
    { x: 21.0, y: 0, z: 4.0, w: 4.2, h: 1.15, d: 0.8, mat: 'concrete' },
    { x: -25.5, y: 0, z: 3.5, w: 2.4, h: 1.9, d: 2.4, mat: 'crate_wood' },
    { x: -21.0, y: 0, z: -4.0, w: 4.2, h: 1.15, d: 0.8, mat: 'concrete' },

    // Street Jersey Barriers near spawns
    { x: -5, y: 0, z: -27, w: 7.0, h: 1.35, d: 1.0, mat: 'concrete' },
    { x: 9, y: 0, z: -29, w: 6.5, h: 2.4, d: 1.2, mat: 'building_brick' },
    { x: 5, y: 0, z: 27, w: 7.0, h: 1.35, d: 1.0, mat: 'concrete' },
    { x: -9, y: 0, z: 29, w: 6.5, h: 2.4, d: 1.2, mat: 'building_brick' }
  ];

  const rawNodes = [
    // Alpha Spawn & Street Exits
    { x: -13, z: -34.5 }, { x: 1.5, z: -34.5 }, { x: 17, z: -34.5 },
    { x: -27, z: -26 }, { x: -13, z: -26 }, { x: 2, z: -24 }, { x: 17, z: -25 }, { x: 27.5, z: -24 },
    // North Alleys & Plaza Approach
    { x: -28, z: -13 }, { x: -2, z: -14 }, { x: 2.5, z: -14 }, { x: 11, z: -12 }, { x: 27.5, z: -12 },
    // Central Plaza & Bomb Sites A/B
    { x: -28, z: 0 }, { x: -22.5, z: 0 }, { x: -11, z: -6 }, { x: -6.5, z: 0 }, { x: 0, z: -6.5 },
    { x: 0, z: 6.5 }, { x: 6.5, z: 0 }, { x: 11, z: 6 }, { x: 22.5, z: 0 }, { x: 28, z: 0 },
    // South Alleys & Plaza Approach
    { x: -27.5, z: 12 }, { x: -11, z: 12 }, { x: -2.5, z: 14 }, { x: 2, z: 14 }, { x: 28, z: 13 },
    // Bravo Street Exits & Spawn
    { x: -27.5, z: 24 }, { x: -17, z: 25 }, { x: -2, z: 24 }, { x: 13, z: 26 }, { x: 27, z: 26 },
    { x: -17, z: 34.5 }, { x: -1.5, z: 34.5 }, { x: 13, z: 34.5 }
  ];

  return {
    id: 'urban_city',
    name: 'Thành Phố Chiến Sự',
    subtitle: 'Đô thị nhiều ngõ hẻm, công trình & ban công bắn tỉa',
    theme: 'urban_dusk',
    skyColor: '#3a4b6e',
    fogColor: '#435373',
    fogDensity: 0.0048,
    floorMat: 'asphalt_city',
    bounds: { halfW, halfD },
    blocks,
    bombSites: [
      { id: 'A', x: 23.5, y: 0, z: 0, radius: 4.6, label: 'KHU A (Ga Tàu Điện)' },
      { id: 'B', x: -23.5, y: 0, z: 0, radius: 4.6, label: 'KHU B (Ngõ Khu Phố)' }
    ],
    spawns: {
      alpha: [
        { x: -13, y: 0, z: -34.5, yaw: Math.PI },
        { x: -4, y: 0, z: -35.0, yaw: Math.PI },
        { x: 1.5, y: 0, z: -35.0, yaw: Math.PI },
        { x: 10, y: 0, z: -35.0, yaw: Math.PI },
        { x: 18, y: 0, z: -34.0, yaw: Math.PI }
      ],
      bravo: [
        { x: 13, y: 0, z: 34.5, yaw: 0 },
        { x: 4, y: 0, z: 35.0, yaw: 0 },
        { x: -1.5, y: 0, z: 35.0, yaw: 0 },
        { x: -10, y: 0, z: 35.0, yaw: 0 },
        { x: -18, y: 0, z: 34.0, yaw: 0 }
      ],
      ffa: [
        { x: -28, y: 0, z: -28, yaw: Math.PI },
        { x: 28, y: 0, z: -28, yaw: Math.PI },
        { x: -28, y: 0, z: 28, yaw: 0 },
        { x: 28, y: 0, z: 28, yaw: 0 },
        { x: 23.5, y: 0, z: 0, yaw: Math.PI / 2 },
        { x: -23.5, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 2, y: 0, z: -22, yaw: Math.PI },
        { x: -2, y: 0, z: 22, yaw: 0 },
        { x: 27.5, y: 0, z: -15, yaw: Math.PI },
        { x: -27.5, y: 0, z: 15, yaw: 0 }
      ]
    },
    waypoints: buildVerifiedWaypoints(rawNodes, blocks, 20),
    lootSpawns: [
      { x: 6.5, y: 0, z: 0 }, { x: -6.5, y: 0, z: 0 },
      { x: 23.5, y: 0, z: 0 }, { x: -23.5, y: 0, z: 0 },
      { x: -10.2, y: 3.0, z: -14 }, { x: 10.2, y: 3.0, z: 14 },
      { x: 27.5, y: 0, z: -15 }, { x: -27.5, y: 0, z: 15 }
    ]
  };
}

function buildBrIslandMap() {
  // True 5km x 5km (5000m x 5000m) Open-World Battle Royale Island!
  const halfW = 2500;
  const halfD = 2500;

  const mountains = [
    { x: -1450, z: -1350, r: 780, peak: 118, seed: 101 }, // Đỉnh Núi Tuyết Tây Bắc
    { x: 1180, z: -420, r: 690, peak: 105, seed: 202 },   // Dãy Núi Đá Đông
    { x: -1150, z: 1200, r: 640, peak: 92, seed: 303 },   // Núi Rừng Tây Nam
    { x: 160, z: -1720, r: 540, peak: 88, seed: 404 },    // Vách Núi Biên Phòng Bắc
    { x: 1450, z: 1380, r: 620, peak: 96, seed: 505 }     // Đỉnh Nam
  ];

  const rivers = [
    {
      width: 44,
      pts: [[-2450, -680], [-1450, -440], [-720, -210], [-60, -30], [640, 210], [1480, 560], [2450, 920]]
    },
    {
      width: 34,
      pts: [[180, -2450], [110, -1450], [-40, -760], [-60, -30]]
    }
  ];

  const lakes = [
    { x: -1620, z: 1620, r: 220, depth: 5.5 }
  ];

  const namedPlaces = [
    { id: 'pochinki', name: 'Thị Trấn Pochinki', x: -240, z: 320, r: 105 },
    { id: 'military', name: 'Căn Cứ Quân Sự', x: 380, z: 1260, r: 120 },
    { id: 'georgopol', name: 'Cảng Container', x: -1160, z: -880, r: 105 },
    { id: 'yasnaya', name: 'Thung Lũng Yasnaya', x: 820, z: -1240, r: 95 },
    { id: 'research', name: 'Trạm Núi Đông', x: 920, z: -260, r: 75 },
    { id: 'riverside', name: 'Làng Bờ Sông', x: -680, z: -80, r: 75 },
    { id: 'northfort', name: 'Đồn Biên Phòng Bắc', x: 340, z: -1540, r: 70 },
    { id: 'lakecamp', name: 'Trại Hồ Tây Nam', x: -1360, z: 1480, r: 65 }
  ];

  const flats = namedPlaces.map((p) => ({ x: p.x, z: p.z, r: p.r, blend: 44, tint: 0.85 }));
  // Additional roadside plateaus for outposts / watchtower clusters
  const extraOutposts = [
    { x: -140, z: -560, r: 34 },
    { x: 520, z: 540, r: 36 },
    { x: -720, z: 860, r: 34 },
    { x: 1420, z: -1120, r: 34 },
    { x: 1360, z: 220, r: 34 },
    { x: -1820, z: 140, r: 32 },
    { x: 880, z: 1460, r: 32 }
  ];
  for (const op of extraOutposts) {
    flats.push({ x: op.x, z: op.z, r: op.r, blend: 26, tint: 0.6 });
  }

  const roads = [
    { width: 6.5, pts: [[-1160, -880], [-680, -80], [-240, 320], [520, 540], [380, 1260], [880, 1460]] },
    { width: 5.5, pts: [[-1360, 1480], [-720, 860], [-240, 320], [-140, -560], [340, -1540]] },
    { width: 5.5, pts: [[-680, -80], [920, -260], [820, -1240], [340, -1540]] },
    { width: 5.0, pts: [[820, -1240], [1420, -1120], [1360, 220], [520, 540]] },
    { width: 5.0, pts: [[-1820, 140], [-1160, -880]] }
  ];

  const terrain = buildTerrain({
    half: halfW,
    cell: 10,
    water: 9.5,
    mountains,
    rivers,
    lakes,
    flats,
    roads,
    edgeFalloff: 250
  });

  const blocks = [];
  const lootSpawns = [];
  const trees = [];
  const rocks = [];
  const ffa = [];

  const pushLoot = (x, y, z) => {
    lootSpawns.push({ x: Number(x.toFixed(1)), y: Number(y.toFixed(2)), z: Number(z.toFixed(1)) });
  };

  // Helper: Walkable Multi-Room / Multi-Floor House with Open Doorways, Sniper Windows & Stairs
  function addHouse(cx, cz, floors = 2, w = 12, d = 10, wallMat = 'building_brick') {
    const fy = Number(terrain.heightAt(cx, cz).toFixed(2));
    const t = 0.55;
    const fh = 3.6;
    const hw = w * 0.5;
    const hd = d * 0.5;
    const doorW = 2.6;

    // Foundation Plinth anchored below terrain slope so zero gaps appear on gentle hills
    blocks.push({ x: cx, y: fy - 2.6, z: cz, w: w + 0.6, h: 2.6, d: d + 0.6, mat: 'concrete' });

    for (let fl = 0; fl < floors; fl++) {
      const y0 = fy + fl * fh;
      const sideSegW = (w - doorW) * 0.5;

      // Front & Back walls with centered 2.6m doors (ground floor) or windows (2nd floor)
      for (const zSide of [-1, 1]) {
        const wz = cz + zSide * (hd - t * 0.5);
        blocks.push({ x: cx - (doorW * 0.5 + sideSegW * 0.5), y: y0, z: wz, w: sideSegW, h: fh, d: t, mat: wallMat });
        blocks.push({ x: cx + (doorW * 0.5 + sideSegW * 0.5), y: y0, z: wz, w: sideSegW, h: fh, d: t, mat: wallMat });
        if (fl === 0) {
          // Over-doorway lintel (walkthrough clearance 2.5m)
          blocks.push({ x: cx, y: y0 + 2.55, z: wz, w: doorW, h: fh - 2.55, d: t, mat: wallMat });
        } else {
          // 2nd Floor shootable balcony/window sill + top lintel
          blocks.push({ x: cx, y: y0, z: wz, w: doorW, h: 1.05, d: t, mat: wallMat });
          blocks.push({ x: cx, y: y0 + 2.35, z: wz, w: doorW, h: fh - 2.35, d: t, mat: wallMat });
        }
      }

      // Left & Right side walls with wide tactical window cutouts
      const sideSegD = (d - 3.0) * 0.5;
      for (const xSide of [-1, 1]) {
        const wx = cx + xSide * (hw - t * 0.5);
        blocks.push({ x: wx, y: y0, z: cz - (1.5 + sideSegD * 0.5), w: t, h: fh, d: sideSegD, mat: wallMat });
        blocks.push({ x: wx, y: y0, z: cz + (1.5 + sideSegD * 0.5), w: t, h: fh, d: sideSegD, mat: wallMat });
        blocks.push({ x: wx, y: y0, z: cz, w: t, h: 1.02, d: 3.0, mat: wallMat });
        blocks.push({ x: wx, y: y0 + 2.35, z: cz, w: t, h: fh - 2.35, d: 3.0, mat: wallMat });
      }

      // Interior tactical cover crate/table
      blocks.push({ x: cx - hw * 0.35, y: y0, z: cz - hd * 0.15, w: 1.3, h: 0.95, d: 1.3, mat: 'crate_wood' });
      pushLoot(cx - hw * 0.15, y0, cz + hd * 0.15);
      pushLoot(cx + hw * 0.1, y0, cz - hd * 0.25);

      if (fl === 0 && floors > 1) {
        // Interior Staircase up to Floor 2 along East inner wall (leaves clear headroom!)
        const stairX = cx + hw - 1.55;
        blocks.push(...makeStairs(stairX, cz, 1.5, d - 3.6, fh, 'north', 'concrete', 10, y0));
        // Floor 2 Deck split cleanly leaving the stairwell bay open on East side
        const deckW = w - 2.6;
        blocks.push({ x: cx - 1.3, y: y0 + fh - 0.22, z: cz, w: deckW, h: 0.22, d: d - 0.6, mat: 'concrete' });
      }
    }

    // Sloped / Flat Protective Overhanging Roof
    const roofY = fy + floors * fh;
    blocks.push({ x: cx, y: roofY, z: cz, w: w + 0.8, h: 0.35, d: d + 0.8, mat: wallMat === 'building_glass' ? 'metal_dark' : 'warehouse_wall' });
    ffa.push({ x: cx, y: fy, z: cz + hd + 2.5, yaw: 0 });
  }

  // Helper: Walkable Wooden/Steel Sniper Watchtower (Chòi Canh)
  function addWatchtower(cx, cz) {
    const fy = Number(terrain.heightAt(cx, cz).toFixed(2));
    const deckY = fy + 3.4;
    const sz = 5.4;
    const hs = sz * 0.5;

    blocks.push({ x: cx, y: fy - 2.0, z: cz, w: sz + 0.6, h: 2.0, d: sz + 0.6, mat: 'concrete' });
    // 4 vertical corner stilts to roof
    for (const sx of [-1, 1]) {
      for (const szd of [-1, 1]) {
        blocks.push({ x: cx + sx * (hs - 0.28), y: fy, z: cz + szd * (hs - 0.28), w: 0.48, h: 6.2, d: 0.48, mat: 'crate_wood' });
      }
    }
    // Elevated Watchtower Platform + Ramp Stairs on South approach
    blocks.push({ x: cx, y: deckY - 0.25, z: cz, w: sz, h: 0.25, d: sz, mat: 'crate_wood' });
    blocks.push(...makeStairs(cx, cz + hs + 3.0, 2.0, 5.8, 3.4, 'north', 'crate_wood', 9, fy));

    // Waist-high wooden parapets (leave south stair entrance gap)
    blocks.push({ x: cx, y: deckY, z: cz - hs + 0.18, w: sz - 0.2, h: 1.0, d: 0.26, mat: 'sandbag' });
    blocks.push({ x: cx - hs + 0.18, y: deckY, z: cz, w: 0.26, h: 1.0, d: sz - 0.2, mat: 'sandbag' });
    blocks.push({ x: cx + hs - 0.18, y: deckY, z: cz, w: 0.26, h: 1.0, d: sz - 0.2, mat: 'sandbag' });

    // Canopy Roof
    blocks.push({ x: cx, y: fy + 6.2, z: cz, w: sz + 0.9, h: 0.32, d: sz + 0.9, mat: 'crate_wood' });
    pushLoot(cx, deckY, cz);
    pushLoot(cx - 1.1, fy, cz);
  }

  // Helper: Small Roadside / Forest / Riverside Shack (Chòi Gỗ)
  function addShack(cx, cz) {
    const fy = Number(terrain.heightAt(cx, cz).toFixed(2));
    const w = 5.4;
    const d = 5.0;
    const h = 3.1;
    const t = 0.35;
    blocks.push({ x: cx, y: fy - 1.8, z: cz, w: w + 0.5, h: 1.8, d: d + 0.5, mat: 'concrete' });
    blocks.push({ x: cx, y: fy, z: cz - d * 0.5 + t * 0.5, w, h, d: t, mat: 'crate_wood' });
    blocks.push({ x: cx - w * 0.5 + t * 0.5, y: fy, z: cz, w: t, h, d, mat: 'crate_wood' });
    blocks.push({ x: cx + w * 0.5 - t * 0.5, y: fy, z: cz, w: t, h, d, mat: 'crate_wood' });
    // Front door gap
    blocks.push({ x: cx - 1.85, y: fy, z: cz + d * 0.5 - t * 0.5, w: 1.7, h, d: t, mat: 'crate_wood' });
    blocks.push({ x: cx + 1.85, y: fy, z: cz + d * 0.5 - t * 0.5, w: 1.7, h, d: t, mat: 'crate_wood' });
    blocks.push({ x: cx, y: fy + h, z: cz, w: w + 0.6, h: 0.26, d: d + 0.6, mat: 'warehouse_wall' });
    pushLoot(cx, fy, cz);
  }

  // Helper: Military Hangar with open ends + interior cover
  function addHangar(cx, cz, w = 18, d = 24) {
    const fy = Number(terrain.heightAt(cx, cz).toFixed(2));
    blocks.push({ x: cx, y: fy - 2.0, z: cz, w: w + 1, h: 2.0, d: d + 1, mat: 'concrete' });
    blocks.push({ x: cx - w * 0.5 + 0.4, y: fy, z: cz, w: 0.8, h: 7.4, d, mat: 'warehouse_wall' });
    blocks.push({ x: cx + w * 0.5 - 0.4, y: fy, z: cz, w: 0.8, h: 7.4, d, mat: 'warehouse_wall' });
    blocks.push({ x: cx, y: fy + 7.4, z: cz, w: w + 1.2, h: 0.65, d: d + 1, mat: 'metal_dark' });
    blocks.push({ x: cx - 3.5, y: fy, z: cz - 4, w: 2.4, h: 2.0, d: 2.4, mat: 'crate_metal' });
    blocks.push({ x: cx + 3.5, y: fy, z: cz + 4, w: 2.6, h: 2.3, d: 5.5, mat: 'container_green' });
    pushLoot(cx, fy, cz - 7);
    pushLoot(cx, fy, cz);
    pushLoot(cx, fy, cz + 7);
  }

  // Helper: River Bridge crossing along a river normal with walkable ramps & cover
  function addBridge(ax, az, bx, bz, bridgeW = 9.2) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const deckY = terrain.waterLevel + 4.4;
    const segCount = Math.max(8, Math.ceil(len / 9));

    // Approach ramps from riverbank terrain up to deckY
    const endAY = terrain.heightAt(ax, az);
    const endBY = terrain.heightAt(bx, bz);
    const dirAtoB = Math.abs(dx) >= Math.abs(dz)
      ? (dx > 0 ? 'east' : 'west')
      : (dz > 0 ? 'south' : 'north');
    const dirBtoA = dirAtoB === 'east' ? 'west' : (dirAtoB === 'west' ? 'east' : (dirAtoB === 'south' ? 'north' : 'south'));

    // Multi-segment axis-friendly bridge deck tiles + guardrails + tactical crates
    for (let i = 0; i <= segCount; i++) {
      const u = i / segCount;
      const px = ax + dx * u;
      const pz = az + dz * u;
      const tileSize = (len / segCount) + 1.4;
      const wSpan = Math.abs(dx) >= Math.abs(dz) ? tileSize : bridgeW;
      const dSpan = Math.abs(dx) >= Math.abs(dz) ? bridgeW : tileSize;
      // Gentle arched slope up near ends
      const arch = Math.min(1, Math.min(u, 1 - u) * 5.0);
      const bankH = endAY * (1 - u) + endBY * u;
      const segTop = bankH + (deckY - bankH) * arch;
      blocks.push({
        x: Number(px.toFixed(1)),
        y: Number((segTop - 1.2).toFixed(2)),
        z: Number(pz.toFixed(1)),
        w: Number(wSpan.toFixed(1)),
        h: 1.2,
        d: Number(dSpan.toFixed(1)),
        mat: 'concrete',
        isStep: i <= 2 || i >= segCount - 2
      });
      // Vertical support pillars into river bed
      if (i > 1 && i < segCount - 1 && i % 3 === 0) {
        blocks.push({
          x: Number(px.toFixed(1)),
          y: 0,
          z: Number(pz.toFixed(1)),
          w: 1.6,
          h: Number((segTop - 1.2).toFixed(2)),
          d: 1.6,
          mat: 'bunker_concrete'
        });
      }
      // Mid-bridge crate cover + loot
      if (i === Math.floor(segCount * 0.5)) {
        blocks.push({
          x: Number((px - 1.6).toFixed(1)),
          y: Number(segTop.toFixed(2)),
          z: Number(pz.toFixed(1)),
          w: 2.2,
          h: 1.6,
          d: 2.2,
          mat: 'crate_metal'
        });
        pushLoot(px + 1.6, segTop, pz);
      }
    }
    // Bridge approach stairs in case riverbank height jumps slightly
    if (deckY - endAY > 0.6) {
      blocks.push(...makeStairs(ax, az, bridgeW * 0.85, 8, Math.max(0.8, (deckY - endAY) * 0.45), dirAtoB, 'concrete', 5, endAY - 0.3));
    }
    if (deckY - endBY > 0.6) {
      blocks.push(...makeStairs(bx, bz, bridgeW * 0.85, 8, Math.max(0.8, (deckY - endBY) * 0.45), dirBtoA, 'concrete', 5, endBY - 0.3));
    }
  }

  // Build 4 Strategic Bridges across Main & North Rivers
  addBridge(-1450, -520, -1450, -360); // Cầu Tây Bắc
  addBridge(-650, -280, -650, -100);   // Cầu Làng Bờ Sông
  addBridge(640, 130, 640, 290);       // Cầu Trung Tâm Đông
  addBridge(-110, -1450, 280, -1450);  // Cầu Đồn Biên Phòng Bắc

  // 1. Thị Trấn Pochinki-VN (-240, 320): Dense 2-story & 1-story town + Watchtower
  addHouse(-275, 290, 2, 13, 11, 'building_brick');
  addHouse(-205, 290, 2, 12, 10, 'city_wall');
  addHouse(-275, 350, 1, 11, 9, 'building_brick');
  addHouse(-205, 355, 2, 12, 10, 'building_glass');
  addHouse(-240, 250, 1, 10, 9, 'warehouse_wall');
  addHouse(-170, 320, 1, 10, 9, 'building_brick');
  addWatchtower(-240, 320);
  addShack(-305, 320);

  // 2. Căn Cứ Quân Sự Nam (380, 1260): 3 Hangars + 2 Barracks + 2 Watchtowers
  addHangar(345, 1255, 18, 26);
  addHangar(415, 1255, 18, 26);
  addHouse(380, 1205, 2, 15, 10, 'military_wall');
  addHouse(380, 1315, 1, 14, 10, 'bunker_concrete');
  addWatchtower(310, 1220);
  addWatchtower(450, 1300);

  // 3. Cảng Container Tây Bắc (-1160, -880): Warehouse Hangar + Stacked Containers + Watchtower
  addHangar(-1190, -890, 16, 22);
  addHouse(-1125, -860, 2, 13, 10, 'city_wall');
  addHouse(-1160, -935, 1, 11, 9, 'warehouse_wall');
  addWatchtower(-1120, -915);
  {
    const portY = terrain.heightAt(-1155, -835);
    blocks.push({ x: -1165, y: portY, z: -835, w: 3.0, h: 2.6, d: 8.5, mat: 'container_red' });
    blocks.push({ x: -1150, y: portY, z: -835, w: 3.0, h: 2.6, d: 8.5, mat: 'container_blue' });
    pushLoot(-1158, portY, -835);
  }

  // 4. Thung Lũng Yasnaya (820, -1240): Mountain Valley Town
  addHouse(790, -1265, 2, 12, 10, 'building_brick');
  addHouse(850, -1265, 2, 12, 10, 'building_glass');
  addHouse(795, -1210, 1, 11, 9, 'building_brick');
  addHouse(855, -1210, 1, 10, 9, 'city_wall');
  addWatchtower(825, -1290);
  addShack(765, -1235);

  // 5. Trạm Nghiên Cứu Núi Đông (920, -260)
  addHouse(900, -260, 2, 14, 11, 'building_glass');
  addHouse(945, -245, 1, 11, 9, 'bunker_concrete');
  addWatchtower(920, -295);

  // 6. Làng Bờ Sông (-680, -80)
  addHouse(-695, -60, 1, 11, 9, 'building_brick');
  addHouse(-660, -95, 2, 11, 9, 'crate_wood');
  addShack(-710, -105);
  addWatchtower(-645, -55);

  // 7. Đồn Biên Phòng Bắc (340, -1540)
  addHangar(340, -1540, 16, 20);
  addHouse(305, -1560, 1, 10, 9, 'military_wall');
  addWatchtower(375, -1565);

  // 8. Trại Hồ Tây Nam (-1360, 1480)
  addHouse(-1360, 1480, 2, 12, 10, 'building_brick');
  addShack(-1395, 1495);
  addWatchtower(-1325, 1460);

  // Roadside Outposts & Wild Forest Shacks / Watchtowers across all 4 quadrants (15 extra clusters!)
  for (const op of extraOutposts) {
    addHouse(op.x - 10, op.z, 1, 10, 9, 'building_brick');
    addWatchtower(op.x + 12, op.z - 6);
    addShack(op.x + 10, op.z + 12);
  }

  // Deterministic scattered Watchtowers & Shacks across hills, riverbanks, and valleys
  for (let i = 0; i < 28; i++) {
    const sx = (hash01(i, 19, 777) * 2 - 1) * 2120;
    const sz = (hash01(i, 83, 999) * 2 - 1) * 2120;
    if (terrain.depthAt(sx, sz) > 0 || terrain.heightAt(sx, sz) < terrain.waterLevel + 1.5) continue;
    if (terrain.slopeAt(sx, sz) > 0.36) continue;
    if (namedPlaces.some((p) => Math.hypot(p.x - sx, p.z - sz) < 150)) continue;
    if (i % 3 === 0) addWatchtower(sx, sz);
    else addShack(sx, sz);
  }

  // Forest Trees (Instanced visuals on client + slender collision trunks) & Natural Cliff Boulders
  for (let i = 0; i < 1100; i++) {
    const tx = (hash01(i, 31, 1337) * 2 - 1) * 2220;
    const tz = (hash01(i, 67, 4242) * 2 - 1) * 2220;
    const h = terrain.heightAt(tx, tz);
    if (h < terrain.waterLevel + 1.4 || h > 105) continue;
    if (terrain.slopeAt(tx, tz) > 0.48) continue;
    // Clear flat plateaus (flatMask) & dirt roads
    const ix = Math.min(terrain.nx - 1, Math.max(0, Math.round((tx + halfW) / terrain.cell)));
    const iz = Math.min(terrain.nx - 1, Math.max(0, Math.round((tz + halfW) / terrain.cell)));
    const gi = iz * terrain.nx + ix;
    if (terrain.flatMask[gi] > 40 || terrain.roadMask[gi] > 40) continue;

    const scale = 0.85 + hash01(i, 5, 11) * 0.75;
    trees.push({ x: Number(tx.toFixed(1)), y: Number(h.toFixed(2)), z: Number(tz.toFixed(1)), scale: Number(scale.toFixed(2)) });
    blocks.push({ x: Number(tx.toFixed(1)), y: Number((h - 0.5).toFixed(2)), z: Number(tz.toFixed(1)), w: 0.72, h: 4.5, d: 0.72, noVisual: true });
  }

  for (let i = 0; i < 320; i++) {
    const rx = (hash01(i, 91, 8080) * 2 - 1) * 2220;
    const rz = (hash01(i, 43, 6060) * 2 - 1) * 2220;
    const h = terrain.heightAt(rx, rz);
    if (h < terrain.waterLevel - 0.5) continue;
    const ix = Math.min(terrain.nx - 1, Math.max(0, Math.round((rx + halfW) / terrain.cell)));
    const iz = Math.min(terrain.nx - 1, Math.max(0, Math.round((rz + halfW) / terrain.cell)));
    const gi = iz * terrain.nx + ix;
    if (terrain.flatMask[gi] > 60 || terrain.roadMask[gi] > 60) continue;

    const rw = 2.4 + hash01(i, 7, 22) * 3.8;
    const rh = 1.6 + hash01(i, 13, 33) * 2.8;
    rocks.push({ x: Number(rx.toFixed(1)), y: Number(h.toFixed(2)), z: Number(rz.toFixed(1)), s: Number((rw * 0.55).toFixed(2)), ry: Number((rh * 0.55).toFixed(2)) });
    blocks.push({ x: Number(rx.toFixed(1)), y: Number((h - 0.8).toFixed(2)), z: Number(rz.toFixed(1)), w: rw * 0.88, h: rh + 0.8, d: rw * 0.88, noVisual: true });
  }

  // Build spatial grid on blocks so physics & raycasts stay O(local) across 5km x 5km!
  buildBlockGrid(blocks, halfW, 36);

  // Build Open-World AI Bot Navigation Graph across all walkable plateaus, roads & ridges
  const rawNodes = [];
  for (let gx = -2050; gx <= 2050; gx += 250) {
    for (let gz = -2050; gz <= 2050; gz += 250) {
      if (terrain.depthAt(gx, gz) > 0.8 || terrain.slopeAt(gx, gz) > 0.62) continue;
      if (blocks.some((b) => !b.isStep && Math.abs(gx - b.x) < b.w * 0.5 + 1.0 && Math.abs(gz - b.z) < b.d * 0.5 + 1.0)) continue;
      rawNodes.push({ x: gx, z: gz });
    }
  }
  for (const np of namedPlaces) {
    rawNodes.push({ x: np.x + 22, z: np.z + 22 });
  }

  const waypoints = rawNodes.map((n, idx) => ({ id: idx, x: n.x, z: n.z, links: [] }));
  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      const dist = Math.hypot(waypoints[j].x - waypoints[i].x, waypoints[j].z - waypoints[i].z);
      if (dist <= 365) {
        waypoints[i].links.push(j);
        waypoints[j].links.push(i);
      }
    }
  }

  const makeTeamSpawns = (cx, cz, yaw) => [0, 1, 2, 3, 4].map((idx) => {
    const sx = cx + (idx - 2) * 14;
    const sz = cz;
    return { x: sx, y: terrain.floorAt(sx, sz), z: sz, yaw };
  });

  return {
    id: 'br_island',
    name: 'Đảo Sinh Tồn 5×5 km (Erangel-VN)',
    subtitle: 'Siêu bản đồ 5km×5km • Đồi núi, Vách đá, Sông cầu, Chòi canh & 8 Thị trấn',
    theme: 'desert_military',
    skyColor: '#6794c4',
    fogColor: '#8db2d6',
    fogDensity: 0.00048,
    floorMat: 'sand_tactical',
    bounds: { halfW, halfD },
    terrain,
    namedPlaces,
    trees,
    rocks,
    blocks,
    bombSites: [
      { id: 'A', x: -240, y: terrain.heightAt(-240, 320), z: 320, radius: 6.0, label: 'Pochinki' },
      { id: 'B', x: 380, y: terrain.heightAt(380, 1260), z: 1260, radius: 6.0, label: 'Căn Cứ Quân Sự' }
    ],
    spawns: {
      alpha: makeTeamSpawns(-240, 320, 0),
      bravo: makeTeamSpawns(380, 1260, Math.PI),
      ffa: ffa.length > 0 ? ffa : [{ x: -240, y: terrain.floorAt(-240, 320), z: 320, yaw: 0 }]
    },
    waypoints,
    lootSpawns
  };
}

export const MAPS = {
  warehouse: buildWarehouseMap(),
  military_base: buildMilitaryBaseMap(),
  urban_city: buildUrbanCityMap(),
  br_island: buildBrIslandMap()
};

export const MAP_LIST = Object.values(MAPS).map((m) => ({
  id: m.id,
  name: m.name,
  subtitle: m.subtitle,
  theme: m.theme,
  bounds: m.bounds
}));
