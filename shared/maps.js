// Shared 3D Map definitions with Zero-Z-Fighting Geometry & Auto-Verified LOS Navigation Graph

function makeStairs(x, z, treadWidth, runLength, totalHeight, dir = 'north', mat = 'concrete', steps = 8) {
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

    boxes.push({ x: sx, y: 0, z: sz, w: sw, h, d: sd, mat, isStep: true });
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

export const MAPS = {
  warehouse: buildWarehouseMap(),
  military_base: buildMilitaryBaseMap(),
  urban_city: buildUrbanCityMap()
};

export const MAP_LIST = Object.values(MAPS).map((m) => ({
  id: m.id,
  name: m.name,
  subtitle: m.subtitle,
  theme: m.theme,
  bounds: m.bounds
}));
