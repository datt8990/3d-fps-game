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

  // Perimeter Desert Date Palms & Sandstone Boulders (clear of spawns & combat lanes)
  const trees = [
    { x: -36.5, y: 0, z: -34.0, scale: 1.15, kind: 'palm' },
    { x: 36.5, y: 0, z: -34.0, scale: 1.22, kind: 'palm' },
    { x: -36.5, y: 0, z: 34.0, scale: 1.20, kind: 'palm' },
    { x: 36.5, y: 0, z: 34.0, scale: 1.12, kind: 'palm' },
    { x: -36.5, y: 0, z: -15.5, scale: 1.05, kind: 'palm' },
    { x: 36.5, y: 0, z: 15.5, scale: 1.08, kind: 'palm' }
  ];
  const rocks = [
    { x: -36.0, y: 0, z: -24.0, s: 1.6, ry: 1.1 },
    { x: 36.0, y: 0, z: 24.0, s: 1.5, ry: 1.0 },
    { x: -36.5, y: 0, z: 24.0, s: 1.4, ry: 0.9 },
    { x: 36.5, y: 0, z: -24.0, s: 1.5, ry: 1.0 }
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
    trees,
    rocks,
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

  // Roadside Urban Broadleaf Trees in safe boulevard corners (clear of all spawns, lanes & buildings)
  const trees = [
    { x: -37.5, y: 0, z: -34.0, scale: 1.08, kind: 'oak' },
    { x: 37.5, y: 0, z: -34.0, scale: 1.05, kind: 'oak' },
    { x: -37.5, y: 0, z: 34.0, scale: 1.10, kind: 'oak' },
    { x: 37.5, y: 0, z: 34.0, scale: 1.04, kind: 'oak' },
    { x: -37.5, y: 0, z: -15.5, scale: 0.96, kind: 'oak' },
    { x: 37.5, y: 0, z: 15.5, scale: 0.98, kind: 'oak' },
    { x: -7.5, y: 0, z: -36.5, scale: 0.92, kind: 'oak' },
    { x: 7.5, y: 0, z: 36.5, scale: 0.92, kind: 'oak' }
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
    trees,
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
  // 1.5km x 1.5km (1500m x 1500m) Open-World Battle Royale Island (Erangel-VN)
  // Perfectly optimized for 60+ FPS, smooth server authority, rich terrain & PUBG-style layout
  const halfW = 750;
  const halfD = 750;

  const mountains = [
    { x: -380, z: -360, r: 240, peak: 72, seed: 101 }, // Đỉnh Núi Tuyết Tây Bắc
    { x: 360, z: -120, r: 220, peak: 62, seed: 202 },   // Dãy Núi Đá Đông
    { x: -340, z: 340, r: 200, peak: 52, seed: 303 },   // Núi Rừng Tây Nam
    { x: 70, z: -460, r: 170, peak: 46, seed: 404 },    // Vách Núi Biên Phòng Bắc
    { x: 380, z: 380, r: 190, peak: 55, seed: 505 }     // Đỉnh Nam
  ];

  const rivers = [
    {
      width: 28,
      pts: [[-720, -200], [-420, -130], [-210, -50], [-20, 0], [190, 60], [420, 160], [720, 270]]
    },
    {
      width: 20,
      pts: [[50, -720], [35, -420], [-10, -210], [-20, 0]]
    }
  ];

  const lakes = [
    { x: -420, z: 420, r: 75, depth: 4.5 }
  ];

  const namedPlaces = [
    { id: 'pochinki', name: 'Thị Trấn Pochinki', x: -75, z: 95, r: 75 },
    { id: 'military', name: 'Căn Cứ Quân Sự', x: 130, z: 390, r: 85 },
    { id: 'georgopol', name: 'Cảng Container', x: -360, z: -260, r: 75 },
    { id: 'yasnaya', name: 'Thung Lũng Yasnaya', x: 260, z: -360, r: 70 },
    { id: 'research', name: 'Trạm Núi Đông', x: 290, z: -80, r: 55 },
    { id: 'riverside', name: 'Làng Bờ Sông', x: -210, z: -30, r: 55 },
    { id: 'northfort', name: 'Đồn Biên Phòng Bắc', x: 100, z: -460, r: 50 },
    { id: 'lakecamp', name: 'Trại Hồ Tây Nam', x: -400, z: 420, r: 45 }
  ];

  const flats = namedPlaces.map((p) => ({ x: p.x, z: p.z, r: p.r, blend: 30, tint: 0.85 }));
  // Additional roadside plateaus for outposts / watchtower clusters
  const extraOutposts = [
    { x: -50, z: -170, r: 25 },
    { x: 170, z: 170, r: 26 },
    { x: -230, z: 260, r: 25 },
    { x: 410, z: -320, r: 24 },
    { x: 390, z: 90, r: 24 },
    { x: -510, z: 40, r: 25 }
  ];
  for (const op of extraOutposts) {
    flats.push({ x: op.x, z: op.z, r: op.r, blend: 20, tint: 0.6 });
  }

  const roads = [
    { width: 5.5, pts: [[-360, -260], [-210, -30], [-75, 95], [170, 170], [130, 390]] },
    { width: 5.0, pts: [[-400, 420], [-230, 260], [-75, 95], [-50, -170], [100, -460]] },
    { width: 5.0, pts: [[-210, -30], [290, -80], [260, -360], [100, -460]] },
    { width: 4.8, pts: [[260, -360], [410, -320], [390, 90], [170, 170]] },
    { width: 4.8, pts: [[-510, 40], [-360, -260]] }
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
    edgeFalloff: 90
  });

  const blocks = [];
  const structures = [];
  const lootSpawns = [];
  const trees = [];
  const rocks = [];
  const ffa = [];
  let houseSeq = 0;

  const pushLoot = (x, y, z) => {
    lootSpawns.push({ x: Number(x.toFixed(1)), y: Number(y.toFixed(2)), z: Number(z.toFixed(1)) });
  };

  // Helper: Walkable Multi-Room / Multi-Floor House with Open Doorways, Sniper Windows & Stairs
  function addHouse(cx, cz, floors = 2, w = 12, d = 10, wallMat = 'building_brick') {
    const idx = houseSeq++;
    const fy = Number(terrain.heightAt(cx, cz).toFixed(2));
    const t = 0.55;
    const fh = 3.6;
    const hw = w * 0.5;
    const hd = d * 0.5;
    const doorW = 2.6;
    const resolvedMat = wallMat === 'crate_wood'
      ? 'wood_plank'
      : (wallMat === 'building_brick' && idx % 3 === 1 ? 'stucco_house' : (wallMat === 'city_wall' && idx % 2 === 0 ? 'stucco_sage' : wallMat));

    // Foundation Plinth anchored below terrain slope so zero gaps appear on gentle hills
    blocks.push({ x: cx, y: fy - 2.6, z: cz, w: w + 0.6, h: 2.6, d: d + 0.6, mat: 'concrete' });

    for (let fl = 0; fl < floors; fl++) {
      const y0 = fy + fl * fh;
      const sideSegW = (w - doorW) * 0.5;

      // Front & Back walls with centered 2.6m doors (ground floor) or windows (2nd floor)
      for (const zSide of [-1, 1]) {
        const wz = cz + zSide * (hd - t * 0.5);
        blocks.push({ x: cx - (doorW * 0.5 + sideSegW * 0.5), y: y0, z: wz, w: sideSegW, h: fh, d: t, mat: resolvedMat });
        blocks.push({ x: cx + (doorW * 0.5 + sideSegW * 0.5), y: y0, z: wz, w: sideSegW, h: fh, d: t, mat: resolvedMat });
        if (fl === 0) {
          // Over-doorway lintel (walkthrough clearance 2.5m)
          blocks.push({ x: cx, y: y0 + 2.55, z: wz, w: doorW, h: fh - 2.55, d: t, mat: resolvedMat });
        } else {
          // 2nd Floor shootable balcony/window sill + top lintel
          blocks.push({ x: cx, y: y0, z: wz, w: doorW, h: 1.05, d: t, mat: resolvedMat });
          blocks.push({ x: cx, y: y0 + 2.35, z: wz, w: doorW, h: fh - 2.35, d: t, mat: resolvedMat });
        }
      }

      // Left & Right side walls with wide tactical window cutouts
      const sideSegD = (d - 3.0) * 0.5;
      for (const xSide of [-1, 1]) {
        const wx = cx + xSide * (hw - t * 0.5);
        blocks.push({ x: wx, y: y0, z: cz - (1.5 + sideSegD * 0.5), w: t, h: fh, d: sideSegD, mat: resolvedMat });
        blocks.push({ x: wx, y: y0, z: cz + (1.5 + sideSegD * 0.5), w: t, h: fh, d: sideSegD, mat: resolvedMat });
        blocks.push({ x: wx, y: y0, z: cz, w: t, h: 1.02, d: 3.0, mat: resolvedMat });
        blocks.push({ x: wx, y: y0 + 2.35, z: cz, w: t, h: fh - 2.35, d: 3.0, mat: resolvedMat });
      }

      // Interior tactical cover crate/table
      blocks.push({ x: cx - hw * 0.35, y: y0, z: cz - hd * 0.15, w: 1.3, h: 0.95, d: 1.3, mat: 'crate_wood' });
      pushLoot(cx - hw * 0.15, y0, cz + hd * 0.15);
      pushLoot(cx + hw * 0.1, y0, cz - hd * 0.25);

      if (fl === 0 && floors > 1) {
        // Interior Staircase up to Floor 2 along East inner wall (leaves clear headroom!)
        const stairX = cx + hw - 1.55;
        blocks.push(...makeStairs(stairX, cz, 1.5, d - 3.6, fh, 'north', 'wood_plank', 10, y0));
        // Floor 2 Deck split cleanly leaving the stairwell bay open on East side
        const deckW = w - 2.6;
        blocks.push({ x: cx - 1.3, y: y0 + fh - 0.22, z: cz, w: deckW, h: 0.22, d: d - 0.6, mat: 'wood_plank' });
      }
    }

    // Sloped / Flat Protective Overhanging Roof (collider ceiling)
    const roofY = fy + floors * fh;
    const isModernFlat = resolvedMat === 'building_glass' || resolvedMat === 'bunker_concrete';
    blocks.push({ x: cx, y: roofY, z: cz, w: w + 0.8, h: 0.35, d: d + 0.8, mat: isModernFlat ? 'metal_dark' : 'roof_metal' });
    structures.push({
      type: 'house',
      cx, cz, fy, floors, w, d, fh, doorW,
      wallMat: resolvedMat,
      roofStyle: isModernFlat ? 'flat' : (resolvedMat === 'military_wall' || resolvedMat === 'warehouse_wall' ? 'metal' : 'tile')
    });
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
        blocks.push({ x: cx + sx * (hs - 0.28), y: fy, z: cz + szd * (hs - 0.28), w: 0.48, h: 6.2, d: 0.48, mat: 'wood_plank' });
      }
    }
    // Elevated Watchtower Platform + Ramp Stairs on South approach
    blocks.push({ x: cx, y: deckY - 0.25, z: cz, w: sz, h: 0.25, d: sz, mat: 'wood_plank' });
    blocks.push(...makeStairs(cx, cz + hs + 3.0, 2.0, 5.8, 3.4, 'north', 'wood_plank', 9, fy));

    // Waist-high wooden parapets (leave south stair entrance gap)
    blocks.push({ x: cx, y: deckY, z: cz - hs + 0.18, w: sz - 0.2, h: 1.0, d: 0.26, mat: 'sandbag' });
    blocks.push({ x: cx - hs + 0.18, y: deckY, z: cz, w: 0.26, h: 1.0, d: sz - 0.2, mat: 'sandbag' });
    blocks.push({ x: cx + hs - 0.18, y: deckY, z: cz, w: 0.26, h: 1.0, d: sz - 0.2, mat: 'sandbag' });

    // Canopy Roof
    blocks.push({ x: cx, y: fy + 6.2, z: cz, w: sz + 0.9, h: 0.32, d: sz + 0.9, mat: 'roof_metal' });
    structures.push({ type: 'watchtower', cx, cz, fy, sz, deckY });
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
    blocks.push({ x: cx, y: fy, z: cz - d * 0.5 + t * 0.5, w, h, d: t, mat: 'wood_plank' });
    blocks.push({ x: cx - w * 0.5 + t * 0.5, y: fy, z: cz, w: t, h, d, mat: 'wood_plank' });
    blocks.push({ x: cx + w * 0.5 - t * 0.5, y: fy, z: cz, w: t, h, d, mat: 'wood_plank' });
    // Front door gap
    blocks.push({ x: cx - 1.85, y: fy, z: cz + d * 0.5 - t * 0.5, w: 1.7, h, d: t, mat: 'wood_plank' });
    blocks.push({ x: cx + 1.85, y: fy, z: cz + d * 0.5 - t * 0.5, w: 1.7, h, d: t, mat: 'wood_plank' });
    blocks.push({ x: cx, y: fy + h, z: cz, w: w + 0.6, h: 0.26, d: d + 0.6, mat: 'roof_metal' });
    structures.push({ type: 'shack', cx, cz, fy, w, d, h });
    pushLoot(cx, fy, cz);
  }

  // Helper: Military Hangar with open ends + interior cover
  function addHangar(cx, cz, w = 18, d = 24) {
    const fy = Number(terrain.heightAt(cx, cz).toFixed(2));
    blocks.push({ x: cx, y: fy - 2.0, z: cz, w: w + 1, h: 2.0, d: d + 1, mat: 'concrete' });
    blocks.push({ x: cx - w * 0.5 + 0.4, y: fy, z: cz, w: 0.8, h: 7.4, d, mat: 'warehouse_wall' });
    blocks.push({ x: cx + w * 0.5 - 0.4, y: fy, z: cz, w: 0.8, h: 7.4, d, mat: 'warehouse_wall' });
    blocks.push({ x: cx, y: fy + 7.4, z: cz, w: w + 1.2, h: 0.65, d: d + 1, mat: 'roof_metal' });
    blocks.push({ x: cx - 3.5, y: fy, z: cz - 4, w: 2.4, h: 2.0, d: 2.4, mat: 'crate_metal' });
    blocks.push({ x: cx + 3.5, y: fy, z: cz + 4, w: 2.6, h: 2.3, d: 5.5, mat: 'container_green' });
    structures.push({ type: 'hangar', cx, cz, fy, w, d, h: 7.4 });
    pushLoot(cx, fy, cz - 7);
    pushLoot(cx, fy, cz);
    pushLoot(cx, fy, cz + 7);
  }

  // Helper: River Bridge crossing along a river normal with walkable ramps & cover
  function addBridge(ax, az, bx, bz, bridgeW = 8.5) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const deckY = terrain.waterLevel + 4.2;
    const segCount = Math.max(6, Math.ceil(len / 8));

    // Approach ramps from riverbank terrain up to deckY
    const endAY = terrain.heightAt(ax, az);
    const endBY = terrain.heightAt(bx, bz);
    const dirAtoB = Math.abs(dx) >= Math.abs(dz)
      ? (dx > 0 ? 'east' : 'west')
      : (dz > 0 ? 'south' : 'north');
    const dirBtoA = dirAtoB === 'east' ? 'west' : (dirAtoB === 'west' ? 'east' : (dirAtoB === 'south' ? 'north' : 'south'));

    for (let i = 0; i <= segCount; i++) {
      const u = i / segCount;
      const px = ax + dx * u;
      const pz = az + dz * u;
      const tileSize = (len / segCount) + 1.2;
      const wSpan = Math.abs(dx) >= Math.abs(dz) ? tileSize : bridgeW;
      const dSpan = Math.abs(dx) >= Math.abs(dz) ? bridgeW : tileSize;
      const arch = Math.min(1, Math.min(u, 1 - u) * 4.5);
      const bankH = endAY * (1 - u) + endBY * u;
      const segTop = bankH + (deckY - bankH) * arch;
      blocks.push({
        x: Number(px.toFixed(1)),
        y: Number((segTop - 1.1).toFixed(2)),
        z: Number(pz.toFixed(1)),
        w: Number(wSpan.toFixed(1)),
        h: 1.1,
        d: Number(dSpan.toFixed(1)),
        mat: 'concrete',
        isStep: i <= 1 || i >= segCount - 1
      });
      // Vertical support pillars into river bed
      if (i > 1 && i < segCount - 1 && i % 2 === 0) {
        blocks.push({
          x: Number(px.toFixed(1)),
          y: 0,
          z: Number(pz.toFixed(1)),
          w: 1.5,
          h: Number((segTop - 1.1).toFixed(2)),
          d: 1.5,
          mat: 'bunker_concrete'
        });
      }
      // Mid-bridge crate cover + loot
      if (i === Math.floor(segCount * 0.5)) {
        blocks.push({
          x: Number((px - 1.5).toFixed(1)),
          y: Number(segTop.toFixed(2)),
          z: Number(pz.toFixed(1)),
          w: 2.0,
          h: 1.5,
          d: 2.0,
          mat: 'crate_metal'
        });
        pushLoot(px + 1.5, segTop, pz);
      }
    }
    if (deckY - endAY > 0.5) {
      blocks.push(...makeStairs(ax, az, bridgeW * 0.85, 7, Math.max(0.7, (deckY - endAY) * 0.45), dirAtoB, 'concrete', 4, endAY - 0.2));
    }
    if (deckY - endBY > 0.5) {
      blocks.push(...makeStairs(bx, bz, bridgeW * 0.85, 7, Math.max(0.7, (deckY - endBY) * 0.45), dirBtoA, 'concrete', 4, endBY - 0.2));
    }
    structures.push({ type: 'bridge', ax, az, bx, bz, bridgeW, deckY });
  }

  // Build 4 Strategic Bridges across Main & North Rivers
  addBridge(-420, -170, -420, -90, 8.5); // Cầu Tây Bắc
  addBridge(-210, -85, -210, -15, 8.5);  // Cầu Làng Bờ Sông
  addBridge(190, 20, 190, 100, 8.5);    // Cầu Trung Tâm Đông
  addBridge(-20, -420, 90, -420, 8.0);  // Cầu Đồn Biên Phòng Bắc

  // 1. Thị Trấn Pochinki (-75, 95): Dense 2-story & 1-story town + Watchtower
  addHouse(-105, 70, 2, 13, 11, 'building_brick');
  addHouse(-45, 70, 2, 12, 10, 'city_wall');
  addHouse(-105, 125, 1, 11, 9, 'building_brick');
  addHouse(-45, 125, 2, 12, 10, 'building_glass');
  addHouse(-75, 35, 1, 10, 9, 'warehouse_wall');
  addHouse(-15, 95, 1, 10, 9, 'building_brick');
  addWatchtower(-75, 95);
  addShack(-135, 95);

  // 2. Căn Cứ Quân Sự Nam (130, 390): 2 Hangars + 2 Barracks + 2 Watchtowers
  addHangar(95, 385, 18, 26);
  addHangar(165, 385, 18, 26);
  addHouse(130, 335, 2, 15, 10, 'military_wall');
  addHouse(130, 445, 1, 14, 10, 'bunker_concrete');
  addWatchtower(60, 350);
  addWatchtower(200, 430);

  // 3. Cảng Container Tây Bắc (-360, -260): Warehouse Hangar + Stacked Containers + Watchtower
  addHangar(-390, -270, 16, 22);
  addHouse(-325, -240, 2, 13, 10, 'city_wall');
  addHouse(-360, -315, 1, 11, 9, 'warehouse_wall');
  addWatchtower(-320, -295);
  {
    const portY = terrain.heightAt(-355, -215);
    blocks.push({ x: -365, y: portY, z: -215, w: 3.0, h: 2.6, d: 8.5, mat: 'container_red' });
    blocks.push({ x: -350, y: portY, z: -215, w: 3.0, h: 2.6, d: 8.5, mat: 'container_blue' });
    pushLoot(-358, portY, -215);
  }

  // 4. Thung Lũng Yasnaya (260, -360): Mountain Valley Town
  addHouse(230, -385, 2, 12, 10, 'building_brick');
  addHouse(290, -385, 2, 12, 10, 'building_glass');
  addHouse(235, -330, 1, 11, 9, 'building_brick');
  addHouse(295, -330, 1, 10, 9, 'city_wall');
  addWatchtower(265, -410);
  addShack(205, -355);

  // 5. Trạm Nghiên Cứu Núi Đông (290, -80)
  addHouse(270, -80, 2, 14, 11, 'building_glass');
  addHouse(315, -65, 1, 11, 9, 'bunker_concrete');
  addWatchtower(290, -115);

  // 6. Làng Bờ Sông (-210, -30)
  addHouse(-225, -10, 1, 11, 9, 'building_brick');
  addHouse(-190, -45, 2, 11, 9, 'crate_wood');
  addShack(-240, -55);
  addWatchtower(-175, -5);

  // 7. Đồn Biên Phòng Bắc (100, -460)
  addHangar(100, -460, 16, 20);
  addHouse(65, -480, 1, 10, 9, 'military_wall');
  addWatchtower(135, -485);

  // 8. Trại Hồ Tây Nam (-400, 420)
  addHouse(-400, 420, 2, 12, 10, 'building_brick');
  addShack(-435, 435);
  addWatchtower(-365, 400);

  // Roadside Outposts & Wild Forest Shacks / Watchtowers
  for (const op of extraOutposts) {
    addHouse(op.x - 10, op.z, 1, 10, 9, 'building_brick');
    addWatchtower(op.x + 12, op.z - 6);
    addShack(op.x + 10, op.z + 12);
  }

  // Deterministic scattered Watchtowers & Shacks across hills, riverbanks, and valleys
  for (let i = 0; i < 14; i++) {
    const sx = (hash01(i, 19, 777) * 2 - 1) * 620;
    const sz = (hash01(i, 83, 999) * 2 - 1) * 620;
    if (terrain.depthAt(sx, sz) > 0 || terrain.heightAt(sx, sz) < terrain.waterLevel + 1.5) continue;
    if (terrain.slopeAt(sx, sz) > 0.36) continue;
    if (namedPlaces.some((p) => Math.hypot(p.x - sx, p.z - sz) < 100)) continue;
    if (i % 3 === 0) addWatchtower(sx, sz);
    else addShack(sx, sz);
  }

  // Forest Trees & Natural Cliff Boulders (Tuned for 1.5km x 1.5km, ~360 trees + ~90 rocks)
  for (let i = 0; i < 360; i++) {
    const tx = (hash01(i, 31, 1337) * 2 - 1) * 660;
    const tz = (hash01(i, 67, 4242) * 2 - 1) * 660;
    const h = terrain.heightAt(tx, tz);
    if (h < terrain.waterLevel + 1.4 || h > 95) continue;
    if (terrain.slopeAt(tx, tz) > 0.48) continue;
    const ix = Math.min(terrain.nx - 1, Math.max(0, Math.round((tx + halfW) / terrain.cell)));
    const iz = Math.min(terrain.nx - 1, Math.max(0, Math.round((tz + halfW) / terrain.cell)));
    const gi = iz * terrain.nx + ix;
    if (terrain.flatMask[gi] > 40 || terrain.roadMask[gi] > 40) continue;

    const scale = 0.85 + hash01(i, 5, 11) * 0.75;
    const kind = (h > 27 || hash01(i, 17, 505) > 0.48) ? 'pine' : 'oak';
    trees.push({ x: Number(tx.toFixed(1)), y: Number(h.toFixed(2)), z: Number(tz.toFixed(1)), scale: Number(scale.toFixed(2)), kind });
    blocks.push({ x: Number(tx.toFixed(1)), y: Number((h - 0.5).toFixed(2)), z: Number(tz.toFixed(1)), w: 0.72, h: 4.5, d: 0.72, noVisual: true });
  }

  for (let i = 0; i < 90; i++) {
    const rx = (hash01(i, 91, 8080) * 2 - 1) * 660;
    const rz = (hash01(i, 43, 6060) * 2 - 1) * 660;
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

  // Build spatial grid on blocks so physics & raycasts stay O(1) across the 1.5km x 1.5km arena!
  buildBlockGrid(blocks, halfW, 25);

  // Build Open-World AI Bot Navigation Graph across all walkable plateaus, roads & ridges
  const rawNodes = [];
  for (let gx = -580; gx <= 580; gx += 110) {
    for (let gz = -580; gz <= 580; gz += 110) {
      if (terrain.depthAt(gx, gz) > 0.8 || terrain.slopeAt(gx, gz) > 0.62) continue;
      if (blocks.some((b) => !b.isStep && Math.abs(gx - b.x) < b.w * 0.5 + 1.0 && Math.abs(gz - b.z) < b.d * 0.5 + 1.0)) continue;
      rawNodes.push({ x: gx, z: gz });
    }
  }
  for (const np of namedPlaces) {
    rawNodes.push({ x: np.x + 15, z: np.z + 15 });
  }

  const waypoints = rawNodes.map((n, idx) => ({ id: idx, x: n.x, z: n.z, links: [] }));
  for (let i = 0; i < waypoints.length; i++) {
    for (let j = i + 1; j < waypoints.length; j++) {
      const dist = Math.hypot(waypoints[j].x - waypoints[i].x, waypoints[j].z - waypoints[i].z);
      if (dist <= 165) {
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
    name: 'Đảo Sinh Tồn 1.5×1.5 km (Erangel-VN)',
    subtitle: 'Bản đồ 1.5km×1.5km tối ưu 60+ FPS • Đồi núi, Sông cầu, Chòi canh & 8 Thị trấn',
    theme: 'desert_military',
    skyColor: '#6794c4',
    fogColor: '#8db2d6',
    fogDensity: 0.0012,
    floorMat: 'sand_tactical',
    bounds: { halfW, halfD },
    terrain,
    namedPlaces,
    structures,
    trees,
    rocks,
    blocks,
    bombSites: [
      { id: 'A', x: -75, y: terrain.heightAt(-75, 95), z: 95, radius: 6.0, label: 'Pochinki' },
      { id: 'B', x: 130, y: terrain.heightAt(130, 390), z: 390, radius: 6.0, label: 'Căn Cứ Quân Sự' }
    ],
    spawns: {
      alpha: makeTeamSpawns(-75, 95, 0),
      bravo: makeTeamSpawns(130, 390, Math.PI),
      ffa: ffa.length > 0 ? ffa : [{ x: -75, y: terrain.floorAt(-75, 95), z: 95, yaw: 0 }]
    },
    waypoints,
    lootSpawns
  };
}

// ============================================================================
// MAP 4: RỪNG NHIỆT ĐỚI (Jungle Ruins & Abandoned Outpost - 5v5 Tactical Arena)
// ============================================================================
function buildJungleMap() {
  const halfW = 36;
  const halfD = 38;
  const blocks = [
    ...makeBoundaryWalls(halfW, halfD, 8.5, 'jungle_wall'),

    // North (Alpha) & South (Bravo) Outpost Perimeter Walls with wide flanking routes
    { x: -16, y: 0, z: -26, w: 12, h: 3.4, d: 1.0, mat: 'jungle_stone' },
    { x: 0, y: 0, z: -26, w: 8.0, h: 2.6, d: 1.0, mat: 'jungle_stone' },
    { x: 16, y: 0, z: -26, w: 12, h: 3.4, d: 1.0, mat: 'jungle_stone' },

    { x: -16, y: 0, z: 26, w: 12, h: 3.4, d: 1.0, mat: 'jungle_stone' },
    { x: 0, y: 0, z: 26, w: 8.0, h: 2.6, d: 1.0, mat: 'jungle_stone' },
    { x: 16, y: 0, z: 26, w: 12, h: 3.4, d: 1.0, mat: 'jungle_stone' },

    // Central Ancient Mossy Stone Temple Platform (Elevated Mid Control)
    { x: 0, y: 0, z: 0, w: 10.0, h: 2.2, d: 10.0, mat: 'jungle_stone' },
    ...makeStairs(0, -7.2, 3.6, 4.4, 2.2, 'south', 'jungle_stone', 6, 0),
    ...makeStairs(0, 7.2, 3.6, 4.4, 2.2, 'north', 'jungle_stone', 6, 0),
    // Temple Corner Pillars & Chest-High Stone Parapets
    { x: -4.2, y: 2.2, z: -4.2, w: 1.4, h: 3.8, d: 1.4, mat: 'jungle_stone' },
    { x: 4.2, y: 2.2, z: -4.2, w: 1.4, h: 3.8, d: 1.4, mat: 'jungle_stone' },
    { x: -4.2, y: 2.2, z: 4.2, w: 1.4, h: 3.8, d: 1.4, mat: 'jungle_stone' },
    { x: 4.2, y: 2.2, z: 4.2, w: 1.4, h: 3.8, d: 1.4, mat: 'jungle_stone' },
    { x: -4.4, y: 2.2, z: 0, w: 0.7, h: 1.15, d: 5.0, mat: 'sandbag' },
    { x: 4.4, y: 2.2, z: 0, w: 0.7, h: 1.15, d: 5.0, mat: 'sandbag' },

    // West Wing (Bomb Site A — Camo Supply Outpost)
    { x: -22, y: 0, z: -6, w: 3.0, h: 2.8, d: 8.0, mat: 'container_green' },
    { x: -22, y: 0, z: 8, w: 3.0, h: 2.8, d: 7.5, mat: 'container_green' },
    { x: -14, y: 0, z: -13, w: 5.5, h: 1.25, d: 0.9, mat: 'sandbag' },
    { x: -14, y: 0, z: 13, w: 5.5, h: 1.25, d: 0.9, mat: 'sandbag' },
    { x: -28.5, y: 0, z: 1, w: 2.6, h: 1.8, d: 2.6, mat: 'crate_wood' },
    { x: -15.5, y: 0, z: 0, w: 2.2, h: 1.5, d: 2.2, mat: 'crate_metal' },

    // East Wing (Bomb Site B — Abandoned Research Bunker & Watchtower)
    { x: 22, y: 0, z: 0, w: 8.0, h: 2.4, d: 6.5, mat: 'bunker_concrete' },
    ...makeStairs(22, -5.6, 3.0, 4.6, 2.4, 'south', 'concrete', 6, 0),
    ...makeStairs(22, 5.6, 3.0, 4.6, 2.4, 'north', 'concrete', 6, 0),
    { x: 18.2, y: 2.4, z: 0, w: 0.65, h: 1.15, d: 5.2, mat: 'sandbag' },
    { x: 14, y: 0, z: -14, w: 2.4, h: 2.2, d: 2.4, mat: 'crate_wood' },
    { x: 14, y: 0, z: 14, w: 2.4, h: 2.2, d: 2.4, mat: 'crate_wood' },
    { x: 29.5, y: 0, z: -12, w: 3.0, h: 2.8, d: 6.8, mat: 'container_green' },
    { x: 29.5, y: 0, z: 12, w: 3.0, h: 2.8, d: 6.8, mat: 'container_yellow' },

    // Mid Sandbag & Crate Cover Trenches
    { x: -9.5, y: 0, z: -18, w: 4.5, h: 1.2, d: 0.9, mat: 'sandbag' },
    { x: 9.5, y: 0, z: -18, w: 4.5, h: 1.2, d: 0.9, mat: 'sandbag' },
    { x: -9.5, y: 0, z: 18, w: 4.5, h: 1.2, d: 0.9, mat: 'sandbag' },
    { x: 9.5, y: 0, z: 18, w: 4.5, h: 1.2, d: 0.9, mat: 'sandbag' },
    { x: -10.5, y: 0, z: 0, w: 1.8, h: 1.6, d: 1.8, mat: 'crate_wood' },
    { x: 10.5, y: 0, z: 0, w: 1.8, h: 1.6, d: 1.8, mat: 'crate_wood' }
  ];

  // Instanced Tropical Jungle Broadleaf Trees & Arching Palms (Zero blocking of lanes/spawns)
  const trees = [
    { x: -32, y: 0, z: -32, scale: 1.35, kind: 'oak' }, { x: -24, y: 0, z: -33, scale: 1.15, kind: 'palm' },
    { x: 24, y: 0, z: -33, scale: 1.25, kind: 'palm' }, { x: 32, y: 0, z: -32, scale: 1.40, kind: 'oak' },
    { x: -32, y: 0, z: 32, scale: 1.35, kind: 'oak' }, { x: -24, y: 0, z: 33, scale: 1.20, kind: 'palm' },
    { x: 24, y: 0, z: 33, scale: 1.25, kind: 'palm' }, { x: 32, y: 0, z: 32, scale: 1.38, kind: 'oak' },
    { x: -32, y: 0, z: -16, scale: 1.25, kind: 'oak' }, { x: -32, y: 0, z: 16, scale: 1.25, kind: 'palm' },
    { x: 33, y: 0, z: -22, scale: 1.20, kind: 'palm' }, { x: 33, y: 0, z: 22, scale: 1.20, kind: 'oak' },
    { x: -18, y: 0, z: -20, scale: 1.10, kind: 'palm' }, { x: 18, y: 0, z: -20, scale: 1.12, kind: 'oak' },
    { x: -18, y: 0, z: 20, scale: 1.10, kind: 'oak' }, { x: 18, y: 0, z: 20, scale: 1.12, kind: 'palm' },
    { x: -8, y: 0, z: -33, scale: 1.05, kind: 'palm' }, { x: 8, y: 0, z: -33, scale: 1.05, kind: 'oak' },
    { x: -8, y: 0, z: 33, scale: 1.05, kind: 'oak' }, { x: 8, y: 0, z: 33, scale: 1.05, kind: 'palm' },
    { x: -33, y: 0, z: 0, scale: 1.30, kind: 'oak' }, { x: 33, y: 0, z: 0, scale: 1.30, kind: 'oak' }
  ];

  const rocks = [
    { x: -29, y: 0, z: -22, s: 1.7, ry: 1.2 }, { x: 29, y: 0, z: -22, s: 1.6, ry: 1.1 },
    { x: -29, y: 0, z: 22, s: 1.7, ry: 1.2 }, { x: 29, y: 0, z: 22, s: 1.6, ry: 1.1 },
    { x: -12, y: 0, z: -7, s: 1.1, ry: 0.9 }, { x: 12, y: 0, z: -7, s: 1.1, ry: 0.9 },
    { x: -12, y: 0, z: 7, s: 1.1, ry: 0.9 }, { x: 12, y: 0, z: 7, s: 1.1, ry: 0.9 },
    { x: -25, y: 0, z: -17, s: 1.4, ry: 1.0 }, { x: 25, y: 0, z: 17, s: 1.4, ry: 1.0 }
  ];

  // Add solid tree trunk colliders so players cannot clip through jungle tree trunks
  for (const tr of trees) {
    blocks.push({ x: tr.x, y: 0, z: tr.z, w: 0.72, h: 4.5, d: 0.72, mat: 'crate_wood', noVisual: true });
  }

  const rawWaypoints = [
    { x: -22, z: -31 }, { x: 0, z: -31 }, { x: 22, z: -31 },
    { x: -28, z: -18 }, { x: -8, z: -22 }, { x: 8, z: -22 }, { x: 24, z: -18 },
    { x: -26, z: -6 }, { x: -14, z: -6 }, { x: 0, z: -12 }, { x: 14, z: -6 }, { x: 22, z: -11 },
    { x: -26, z: 6 }, { x: -14, z: 6 }, { x: 0, z: 12 }, { x: 14, z: 6 }, { x: 22, z: 11 },
    { x: -28, z: 18 }, { x: -8, z: 22 }, { x: 8, z: 22 }, { x: 24, z: 18 },
    { x: -22, z: 31 }, { x: 0, z: 31 }, { x: 22, z: 31 }
  ];

  buildBlockGrid(blocks, 42, 12);

  return {
    id: 'jungle',
    name: 'Rừng Nhiệt Đới',
    subtitle: 'Căn Cứ Rừng Rậm • Di Tích Cổ • 3 Đường Giao Tranh',
    theme: 'jungle',
    floorMat: 'jungle_floor',
    skyColor: '#4c8577',
    fogColor: '#3f6e62',
    fogNear: 24,
    fogFar: 118,
    ambientIntensity: 0.72,
    sunColor: '#fef3c7',
    sunIntensity: 1.55,
    sunPos: [38, 62, 26],
    bounds: { halfW, halfD },
    blocks,
    trees,
    rocks,
    bombSites: [
      { id: 'A', x: -22, y: 0, z: 1, radius: 5.0, label: 'Trại Tiếp Tế A' },
      { id: 'B', x: 22, y: 2.4, z: 0, radius: 4.5, label: 'Đài Quan Sát B' }
    ],
    spawns: {
      alpha: [
        { x: -12, y: 0, z: -32, yaw: Math.PI },
        { x: -6, y: 0, z: -33, yaw: Math.PI },
        { x: 0, y: 0, z: -33, yaw: Math.PI },
        { x: 6, y: 0, z: -33, yaw: Math.PI },
        { x: 12, y: 0, z: -32, yaw: Math.PI }
      ],
      bravo: [
        { x: -12, y: 0, z: 32, yaw: 0 },
        { x: -6, y: 0, z: 33, yaw: 0 },
        { x: 0, y: 0, z: 33, yaw: 0 },
        { x: 6, y: 0, z: 33, yaw: 0 },
        { x: 12, y: 0, z: 32, yaw: 0 }
      ],
      ffa: [
        { x: -28, y: 0, z: -28, yaw: -2.4 },
        { x: 28, y: 0, z: -28, yaw: 2.4 },
        { x: -28, y: 0, z: 28, yaw: -0.7 },
        { x: 28, y: 0, z: 28, yaw: 0.7 },
        { x: -26, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 26, y: 0, z: 0, yaw: Math.PI / 2 },
        { x: 0, y: 0, z: -19, yaw: Math.PI },
        { x: 0, y: 0, z: 19, yaw: 0 }
      ]
    },
    waypoints: buildVerifiedWaypoints(rawWaypoints, blocks, 24)
  };
}

export const MAPS = {
  warehouse: buildWarehouseMap(),
  military_base: buildMilitaryBaseMap(),
  urban_city: buildUrbanCityMap(),
  jungle: buildJungleMap(),
  br_island: buildBrIslandMap()
};

export const MAP_LIST = Object.values(MAPS).map((m) => ({
  id: m.id,
  name: m.name,
  subtitle: m.subtitle,
  theme: m.theme,
  bounds: m.bounds
}));
