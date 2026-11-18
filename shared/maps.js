// Shared 3D Map definitions for Server (collision, raycast, bot nav, bomb/storm) & Client (Three.js builder + minimap)

function makeStairs(x, z, width, length, totalHeight, dir = 'north', mat = 'concrete', steps = 8) {
  // dir: direction going UP ('north' = -z, 'south' = +z, 'east' = +x, 'west' = -x)
  const boxes = [];
  const stepH = totalHeight / steps;
  const isZ = dir === 'north' || dir === 'south';
  const stepLen = length / steps;

  for (let i = 0; i < steps; i++) {
    const h = stepH * (i + 1);
    let sx = x;
    let sz = z;
    let sw = width;
    let sd = length;
    const offset = -length / 2 + stepLen * (i + 0.5);
    if (dir === 'north') {
      sz = z - offset;
      sd = stepLen + 0.04;
    } else if (dir === 'south') {
      sz = z + offset;
      sd = stepLen + 0.04;
    } else if (dir === 'east') {
      sx = x + offset;
      sw = stepLen + 0.04;
    } else if (dir === 'west') {
      sx = x - offset;
      sw = stepLen + 0.04;
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

// ============================================================================
// MAP 1: NHÀ KHO (Transport Warehouse - 5v5 Fast-Paced Symmetrical Arena)
// ============================================================================
function buildWarehouseMap() {
  const halfW = 24;
  const halfD = 34;
  const blocks = [
    ...makeBoundaryWalls(halfW, halfD, 9, 'warehouse_wall'),

    // Spawn protection front walls with Left/Center/Right exits (Alpha at -Z, Bravo at +Z)
    { x: -13.5, y: 0, z: -24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },
    { x: 0, y: 0, z: -24, w: 7.5, h: 2.8, d: 0.9, mat: 'concrete' },
    { x: 13.5, y: 0, z: -24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },

    { x: -13.5, y: 0, z: 24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },
    { x: 0, y: 0, z: 24, w: 7.5, h: 2.8, d: 0.9, mat: 'concrete' },
    { x: 13.5, y: 0, z: 24, w: 11, h: 3.6, d: 0.9, mat: 'concrete' },

    // Elevated Sniper Platforms in Alpha & Bravo bases
    { x: -17.5, y: 0, z: -29.5, w: 11, h: 2.6, d: 6.5, mat: 'metal_deck' },
    { x: -14.5, y: 2.6, z: -26.4, w: 5.0, h: 1.05, d: 0.35, mat: 'sandbag' }, // Sniper half-cover
    ...makeStairs(-10.0, -29.5, 4.0, 5.2, 2.6, 'west', 'metal_step', 8),

    { x: 17.5, y: 0, z: 29.5, w: 11, h: 2.6, d: 6.5, mat: 'metal_deck' },
    { x: 14.5, y: 2.6, z: 26.4, w: 5.0, h: 1.05, d: 0.35, mat: 'sandbag' },
    ...makeStairs(10.0, 29.5, 4.0, 5.2, 2.6, 'east', 'metal_step', 8),

    // Shipping Containers (Iconic CrossFire Transport Ship / Warehouse vibe)
    // Center angled/staggered containers creating intense mid-control
    { x: -5.8, y: 0, z: -7.5, w: 3.0, h: 2.8, d: 7.2, mat: 'container_red' },
    { x: -5.8, y: 2.8, z: -7.5, w: 3.0, h: 2.8, d: 7.2, mat: 'container_yellow' },
    { x: 5.8, y: 0, z: 7.5, w: 3.0, h: 2.8, d: 7.2, mat: 'container_blue' },
    { x: 5.8, y: 2.8, z: 7.5, w: 3.0, h: 2.8, d: 7.2, mat: 'container_red' },

    // Center Mid Cross-Cover Crates
    { x: 0, y: 0, z: 0, w: 3.2, h: 2.1, d: 3.2, mat: 'crate_metal' },
    { x: -2.4, y: 0, z: 1.8, w: 1.5, h: 1.15, d: 1.5, mat: 'crate_wood' },
    { x: 2.4, y: 0, z: -1.8, w: 1.5, h: 1.15, d: 1.5, mat: 'crate_wood' },

    // East Lane (Bomb Site A - Cargo Bay)
    { x: 14.5, y: 0, z: -11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_blue' },
    { x: 14.5, y: 0, z: 11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_green' },
    { x: 18.8, y: 0, z: 0, w: 2.4, h: 1.25, d: 4.4, mat: 'crate_wood' },
    { x: 11.2, y: 0, z: 0, w: 2.0, h: 2.0, d: 2.0, mat: 'crate_metal' },
    // Climbable catwalk on East side
    { x: 21.2, y: 0, z: 0, w: 4.8, h: 2.4, d: 10.0, mat: 'metal_deck' },
    ...makeStairs(21.2, -7.2, 3.4, 4.4, 2.4, 'south', 'metal_step', 7),
    ...makeStairs(21.2, 7.2, 3.4, 4.4, 2.4, 'north', 'metal_step', 7),

    // West Lane (Bomb Site B - Container Corridor)
    { x: -14.5, y: 0, z: 11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_red' },
    { x: -14.5, y: 0, z: -11.5, w: 3.2, h: 2.8, d: 7.5, mat: 'container_yellow' },
    { x: -20.5, y: 0, z: 0, w: 3.0, h: 3.2, d: 8.5, mat: 'concrete' },
    { x: -12.2, y: 0, z: -1.8, w: 1.8, h: 1.2, d: 1.8, mat: 'crate_wood' },
    { x: -12.2, y: 0, z: 2.2, w: 2.0, h: 2.0, d: 2.0, mat: 'crate_metal' },

    // Mid-Base Transitional Cover Crates
    { x: 5.5, y: 0, z: -16.5, w: 2.6, h: 1.9, d: 2.6, mat: 'crate_wood' },
    { x: 7.6, y: 0, z: -16.5, w: 1.5, h: 1.1, d: 1.5, mat: 'crate_wood' },
    { x: -5.5, y: 0, z: 16.5, w: 2.6, h: 1.9, d: 2.6, mat: 'crate_wood' },
    { x: -7.6, y: 0, z: 16.5, w: 1.5, h: 1.1, d: 1.5, mat: 'crate_wood' },

    // Overhead Steel Warehouse Roof Beams (Visual + high up y=7.8 so grenades/sky still feel airy)
    { x: 0, y: 7.8, z: -20, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' },
    { x: 0, y: 7.8, z: -7, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' },
    { x: 0, y: 7.8, z: 7, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' },
    { x: 0, y: 7.8, z: 20, w: 48, h: 0.6, d: 1.0, mat: 'metal_dark' }
  ];

  return {
    id: 'warehouse',
    name: 'Nhà Kho Vận Tải',
    subtitle: 'Bản đồ nhỏ • Cận chiến 5v5 tốc độ cao',
    theme: 'industrial',
    skyColor: '#6989a8',
    fogColor: '#7c96b0',
    fogDensity: 0.0065,
    floorMat: 'concrete_warehouse',
    bounds: { halfW, halfD },
    blocks,
    bombSites: [
      { id: 'A', x: 15.2, y: 0, z: 0, radius: 4.2, label: 'KHU A (Bãi Hàng)' },
      { id: 'B', x: -15.5, y: 0, z: 0, radius: 4.2, label: 'KHU B (Container)' }
    ],
    spawns: {
      alpha: [
        { x: -8, y: 0, z: -30, yaw: Math.PI },
        { x: -3, y: 0, z: -30.5, yaw: Math.PI },
        { x: 2, y: 0, z: -30.5, yaw: Math.PI },
        { x: 8, y: 0, z: -30, yaw: Math.PI },
        { x: 16, y: 0, z: -29.5, yaw: Math.PI }
      ],
      bravo: [
        { x: 8, y: 0, z: 30, yaw: 0 },
        { x: 3, y: 0, z: 30.5, yaw: 0 },
        { x: -2, y: 0, z: 30.5, yaw: 0 },
        { x: -8, y: 0, z: 30, yaw: 0 },
        { x: -16, y: 0, z: 29.5, yaw: 0 }
      ],
      ffa: [
        { x: -18, y: 0, z: -29, yaw: Math.PI },
        { x: 18, y: 0, z: -29, yaw: Math.PI },
        { x: -18, y: 0, z: 29, yaw: 0 },
        { x: 18, y: 0, z: 29, yaw: 0 },
        { x: 16, y: 0, z: 0, yaw: Math.PI / 2 },
        { x: -16, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 0, y: 0, z: -18, yaw: Math.PI },
        { x: 0, y: 0, z: 18, yaw: 0 },
        { x: 9, y: 0, z: -15, yaw: Math.PI },
        { x: -9, y: 0, z: 15, yaw: 0 }
      ]
    },
    waypoints: [
      { id: 0, x: 0, z: -28, links: [1, 2, 3] },
      { id: 1, x: -18, z: -20, links: [0, 4, 7] },
      { id: 2, x: -4.5, z: -18, links: [0, 5] },
      { id: 3, x: 18, z: -20, links: [0, 6, 8] },
      { id: 4, x: -9.5, z: -8, links: [1, 5, 7] },
      { id: 5, x: 0, z: -5, links: [2, 4, 6, 9] },
      { id: 6, x: 9.5, z: -8, links: [3, 5, 8] },
      { id: 7, x: -16, z: 0, links: [1, 4, 10, 13] }, // Site B
      { id: 8, x: 15.5, z: 0, links: [3, 6, 12, 15] }, // Site A
      { id: 9, x: 0, z: 5, links: [5, 10, 11, 12] },
      { id: 10, x: -9.5, z: 8, links: [7, 9, 13] },
      { id: 11, x: 4.5, z: 18, links: [9, 14] },
      { id: 12, x: 9.5, z: 8, links: [8, 9, 15] },
      { id: 13, x: -18, z: 20, links: [7, 10, 14] },
      { id: 14, x: 0, z: 28, links: [11, 13, 15] },
      { id: 15, x: 18, z: 20, links: [8, 12, 14] }
    ],
    lootSpawns: [
      { x: 0, y: 0, z: -8 }, { x: 0, y: 0, z: 8 },
      { x: 15.5, y: 0, z: 0 }, { x: -15.5, y: 0, z: 0 },
      { x: 10, y: 0, z: -19 }, { x: -10, y: 0, z: 19 },
      { x: 21.2, y: 2.4, z: 0 }, { x: -17.5, y: 2.6, z: -29.5 }
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

    // Central Radar Command Bunker (Walkable Rooftop + Side Stairs + Ambush Walls)
    { x: 0, y: 0, z: 0, w: 14, h: 3.0, d: 12, mat: 'bunker_concrete' },
    // Rooftop tactical sandbags + radar pedestal
    { x: 0, y: 3.0, z: -5.6, w: 9, h: 1.05, d: 0.5, mat: 'sandbag' },
    { x: 0, y: 3.0, z: 5.6, w: 9, h: 1.05, d: 0.5, mat: 'sandbag' },
    { x: 0, y: 3.0, z: 0, w: 2.4, h: 2.6, d: 2.4, mat: 'metal_dark' },
    ...makeStairs(-9.2, 0, 4.4, 6.0, 3.0, 'east', 'concrete', 8),
    ...makeStairs(9.2, 0, 4.4, 6.0, 3.0, 'west', 'concrete', 8),

    // North & South Sniper Watchtowers
    { x: -24, y: 0, z: -20, w: 6.5, h: 3.4, d: 6.5, mat: 'metal_deck' },
    { x: -24, y: 3.4, z: -17.0, w: 5.5, h: 1.1, d: 0.4, mat: 'sandbag' },
    ...makeStairs(-24, -25.8, 3.6, 5.2, 3.4, 'north', 'metal_step', 9),

    { x: 24, y: 0, z: 20, w: 6.5, h: 3.4, d: 6.5, mat: 'metal_deck' },
    { x: 24, y: 3.4, z: 17.0, w: 5.5, h: 1.1, d: 0.4, mat: 'sandbag' },
    ...makeStairs(24, 25.8, 3.6, 5.2, 3.4, 'south', 'metal_step', 9),

    // East Sector: Helipad & Fuel Depot (Bomb Site A)
    { x: 25, y: 0, z: -10, w: 3.4, h: 2.8, d: 8.0, mat: 'container_green' },
    { x: 32, y: 0, z: 2, w: 4.5, h: 3.2, d: 9.0, mat: 'bunker_concrete' },
    { x: 21, y: 0, z: 6, w: 5.0, h: 1.15, d: 0.7, mat: 'sandbag' },
    { x: 24, y: 0, z: -1.5, w: 2.2, h: 1.8, d: 2.2, mat: 'crate_metal' },
    { x: 18, y: 0, z: -16, w: 6.0, h: 2.6, d: 3.2, mat: 'container_yellow' },

    // West Sector: Armory Hangar Walls (Bomb Site B - Ambush Interior!)
    { x: -33.5, y: 0, z: 0, w: 1.0, h: 4.5, d: 20.0, mat: 'bunker_concrete' },
    { x: -18.5, y: 0, z: -6.5, w: 1.0, h: 4.5, d: 7.0, mat: 'bunker_concrete' },
    { x: -18.5, y: 0, z: 6.5, w: 1.0, h: 4.5, d: 7.0, mat: 'bunker_concrete' },
    { x: -26.0, y: 4.2, z: 0, w: 16.0, h: 0.6, d: 20.0, mat: 'metal_dark' }, // Hangar roof!
    { x: -26.0, y: 0, z: -4.5, w: 2.6, h: 1.9, d: 2.6, mat: 'crate_metal' },
    { x: -28.5, y: 0, z: 4.5, w: 3.2, h: 1.25, d: 2.0, mat: 'crate_wood' },
    { x: -22.0, y: 0, z: 14.5, w: 6.0, h: 1.15, d: 0.7, mat: 'sandbag' },

    // Trench & Ambush Barriers between Spawn Bases and Mid
    { x: -6, y: 0, z: -18, w: 8.5, h: 2.4, d: 1.4, mat: 'bunker_concrete' },
    { x: 8, y: 0, z: -14, w: 5.5, h: 1.15, d: 0.7, mat: 'sandbag' },
    { x: 6, y: 0, z: 18, w: 8.5, h: 2.4, d: 1.4, mat: 'bunker_concrete' },
    { x: -8, y: 0, z: 14, w: 5.5, h: 1.15, d: 0.7, mat: 'sandbag' },

    // Spawn Base Blast Shields
    { x: 0, y: 0, z: -29, w: 14, h: 3.2, d: 1.2, mat: 'bunker_concrete' },
    { x: 0, y: 0, z: 29, w: 14, h: 3.2, d: 1.2, mat: 'bunker_concrete' }
  ];

  return {
    id: 'military_base',
    name: 'Căn Cứ Quân Sự',
    subtitle: 'Nhiều chòi canh, hầm chỉ huy & vị trí phục kích',
    theme: 'desert_military',
    skyColor: '#c9a679',
    fogColor: '#bfa17c',
    fogDensity: 0.0052,
    floorMat: 'sand_tactical',
    bounds: { halfW, halfD },
    blocks,
    bombSites: [
      { id: 'A', x: 25.5, y: 0, z: 0.5, radius: 4.8, label: 'KHU A (Sân Trực Thăng)' },
      { id: 'B', x: -26.0, y: 0, z: 0, radius: 4.8, label: 'KHU B (Kho Vũ Khí)' }
    ],
    spawns: {
      alpha: [
        { x: -10, y: 0, z: -34, yaw: Math.PI },
        { x: -4, y: 0, z: -34, yaw: Math.PI },
        { x: 2, y: 0, z: -34, yaw: Math.PI },
        { x: 9, y: 0, z: -34, yaw: Math.PI },
        { x: 18, y: 0, z: -32, yaw: Math.PI }
      ],
      bravo: [
        { x: 10, y: 0, z: 34, yaw: 0 },
        { x: 4, y: 0, z: 34, yaw: 0 },
        { x: -2, y: 0, z: 34, yaw: 0 },
        { x: -9, y: 0, z: 34, yaw: 0 },
        { x: -18, y: 0, z: 32, yaw: 0 }
      ],
      ffa: [
        { x: -32, y: 0, z: -30, yaw: Math.PI },
        { x: 32, y: 0, z: -30, yaw: Math.PI },
        { x: -32, y: 0, z: 30, yaw: 0 },
        { x: 32, y: 0, z: 30, yaw: 0 },
        { x: 26, y: 0, z: 0, yaw: Math.PI / 2 },
        { x: -26, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 0, y: 3.0, z: 0, yaw: 0 },
        { x: 0, y: 0, z: -24, yaw: Math.PI },
        { x: 0, y: 0, z: 24, yaw: 0 },
        { x: 16, y: 0, z: -22, yaw: Math.PI }
      ]
    },
    waypoints: [
      { id: 0, x: 0, z: -33, links: [1, 2, 3] },
      { id: 1, x: -16, z: -24, links: [0, 4, 5] },
      { id: 2, x: 2, z: -22, links: [0, 5, 6] },
      { id: 3, x: 18, z: -24, links: [0, 6, 8] },
      { id: 4, x: -26, z: -13, links: [1, 7] },
      { id: 5, x: -13, z: -9, links: [1, 2, 7, 9] },
      { id: 6, x: 14, z: -9, links: [2, 3, 8, 9] },
      { id: 7, x: -25.5, z: 0, links: [4, 5, 10, 11] }, // Site B
      { id: 8, x: 25.5, z: 0, links: [3, 6, 12, 13] },  // Site A
      { id: 9, x: 0, z: 9, links: [5, 6, 11, 12, 14] },
      { id: 10, x: -26, z: 13, links: [7, 15] },
      { id: 11, x: -13, z: 9, links: [7, 9, 15] },
      { id: 12, x: 14, z: 9, links: [8, 9, 16] },
      { id: 13, x: 26, z: 12, links: [8, 16] },
      { id: 14, x: -2, z: 22, links: [9, 15, 16, 17] },
      { id: 15, x: -16, z: 24, links: [10, 11, 14, 17] },
      { id: 16, x: 18, z: 24, links: [12, 13, 14, 17] },
      { id: 17, x: 0, z: 33, links: [14, 15, 16] }
    ],
    lootSpawns: [
      { x: 0, y: 3.0, z: 2.5 }, { x: 25.5, y: 0, z: 2 },
      { x: -25.5, y: 0, z: 0 }, { x: -14, y: 0, z: -15 },
      { x: 14, y: 0, z: 15 }, { x: -24, y: 3.4, z: -20 },
      { x: 24, y: 3.4, z: 20 }, { x: 0, y: 0, z: -12 }
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

    // Central Plaza Monument + Fountain Walls
    { x: 0, y: 0, z: 0, w: 3.4, h: 4.8, d: 3.4, mat: 'marble_dark' },
    { x: 0, y: 0, z: 0, w: 8.0, h: 1.0, d: 8.0, mat: 'concrete' },

    // Urban Buildings creating Alleys (Ngõ hẻm) & Accessible Balconies
    // NW Commercial Tower + East-facing Sniper Balcony
    { x: -18, y: 0, z: -14, w: 12, h: 7.5, d: 12, mat: 'building_brick' },
    { x: -10.5, y: 0, z: -14, w: 3.5, h: 3.0, d: 10, mat: 'concrete' }, // Balcony terrace
    { x: -8.9, y: 3.0, z: -14, w: 0.4, h: 1.05, d: 9.6, mat: 'metal_dark' }, // Balcony railing
    ...makeStairs(-10.5, -21.5, 3.4, 5.0, 3.0, 'south', 'concrete', 8),

    // SE Tech Corp Building + West-facing Sniper Balcony
    { x: 18, y: 0, z: 14, w: 12, h: 7.5, d: 12, mat: 'building_glass' },
    { x: 10.5, y: 0, z: 14, w: 3.5, h: 3.0, d: 10, mat: 'concrete' },
    { x: 8.9, y: 3.0, z: 14, w: 0.4, h: 1.05, d: 9.6, mat: 'metal_dark' },
    ...makeStairs(10.5, 21.5, 3.4, 5.0, 3.0, 'north', 'concrete', 8),

    // NE Shop Block & Narrow East Alleyway (Ngõ Đông)
    { x: 19, y: 0, z: -15, w: 11, h: 6.8, d: 10, mat: 'building_glass' },
    { x: 34, y: 0, z: -6, w: 8, h: 6.5, d: 18, mat: 'building_brick' },

    // SW Apartment Block & Narrow West Alleyway (Ngõ Tây)
    { x: -19, y: 0, z: 15, w: 11, h: 6.8, d: 10, mat: 'building_brick' },
    { x: -34, y: 0, z: 6, w: 8, h: 6.5, d: 18, mat: 'building_glass' },

    // Abandoned Tactical Trucks / Buses & Street Cover
    { x: 6.5, y: 0, z: -12, w: 2.8, h: 2.5, d: 6.5, mat: 'container_blue' },
    { x: -6.5, y: 0, z: 12, w: 2.8, h: 2.5, d: 6.5, mat: 'container_red' },

    // Bomb Site A (East Metro Courtyard) Cover
    { x: 25, y: 0, z: -1, w: 2.6, h: 1.9, d: 2.6, mat: 'crate_metal' },
    { x: 21, y: 0, z: 2.5, w: 4.5, h: 1.15, d: 0.8, mat: 'concrete' },

    // Bomb Site B (West Backstreet Market) Cover
    { x: -25, y: 0, z: 1, w: 2.6, h: 1.9, d: 2.6, mat: 'crate_wood' },
    { x: -21, y: 0, z: -2.5, w: 4.5, h: 1.15, d: 0.8, mat: 'concrete' },

    // Street Jersey Barriers near spawns
    { x: -4, y: 0, z: -27, w: 8.0, h: 1.35, d: 1.0, mat: 'concrete' },
    { x: 8, y: 0, z: -29, w: 7.0, h: 2.4, d: 1.2, mat: 'building_brick' },
    { x: 4, y: 0, z: 27, w: 8.0, h: 1.35, d: 1.0, mat: 'concrete' },
    { x: -8, y: 0, z: 29, w: 7.0, h: 2.4, d: 1.2, mat: 'building_brick' }
  ];

  return {
    id: 'urban_city',
    name: 'Thành Phố Chiến Sự',
    subtitle: 'Đô thị nhiều ngõ hẻm, công trình & ban công bắn tỉa',
    theme: 'urban_dusk',
    skyColor: '#3a4b6e',
    fogColor: '#435373',
    fogDensity: 0.0055,
    floorMat: 'asphalt_city',
    bounds: { halfW, halfD },
    blocks,
    bombSites: [
      { id: 'A', x: 24.0, y: 0, z: 0, radius: 4.6, label: 'KHU A (Ga Tàu Điện)' },
      { id: 'B', x: -24.0, y: 0, z: 0, radius: 4.6, label: 'KHU B (Ngõ Khu Phố)' }
    ],
    spawns: {
      alpha: [
        { x: -12, y: 0, z: -35, yaw: Math.PI },
        { x: -5, y: 0, z: -35.5, yaw: Math.PI },
        { x: 2, y: 0, z: -35.5, yaw: Math.PI },
        { x: 10, y: 0, z: -35, yaw: Math.PI },
        { x: 20, y: 0, z: -34, yaw: Math.PI }
      ],
      bravo: [
        { x: 12, y: 0, z: 35, yaw: 0 },
        { x: 5, y: 0, z: 35.5, yaw: 0 },
        { x: -2, y: 0, z: 35.5, yaw: 0 },
        { x: -10, y: 0, z: 35, yaw: 0 },
        { x: -20, y: 0, z: 34, yaw: 0 }
      ],
      ffa: [
        { x: -32, y: 0, z: -32, yaw: Math.PI },
        { x: 32, y: 0, z: -32, yaw: Math.PI },
        { x: -32, y: 0, z: 32, yaw: 0 },
        { x: 32, y: 0, z: 32, yaw: 0 },
        { x: 26, y: 0, z: 0, yaw: Math.PI / 2 },
        { x: -26, y: 0, z: 0, yaw: -Math.PI / 2 },
        { x: 0, y: 0, z: -22, yaw: Math.PI },
        { x: 0, y: 0, z: 22, yaw: 0 },
        { x: 27, y: 0, z: -24, yaw: Math.PI },
        { x: -27, y: 0, z: 24, yaw: 0 }
      ]
    },
    waypoints: [
      { id: 0, x: 0, z: -34, links: [1, 2, 3] },
      { id: 1, x: -28, z: -24, links: [0, 4] },
      { id: 2, x: 0, z: -22, links: [0, 5, 6] },
      { id: 3, x: 27, z: -24, links: [0, 7] },
      { id: 4, x: -28, z: -8, links: [1, 8] },
      { id: 5, x: -5, z: -8, links: [2, 8, 9] },
      { id: 6, x: 11, z: -6, links: [2, 7, 9, 10] },
      { id: 7, x: 27, z: -8, links: [3, 6, 10] },
      { id: 8, x: -24, z: 0, links: [4, 5, 11, 12] }, // Site B
      { id: 9, x: 0, z: 6, links: [5, 6, 11, 13] },
      { id: 10, x: 24, z: 0, links: [6, 7, 13, 14] }, // Site A
      { id: 11, x: -11, z: 6, links: [8, 9, 12, 15] },
      { id: 12, x: -27, z: 16, links: [8, 11, 16] },
      { id: 13, x: 5, z: 14, links: [9, 10, 15] },
      { id: 14, x: 28, z: 16, links: [10, 17] },
      { id: 15, x: 0, z: 24, links: [11, 13, 16, 17, 18] },
      { id: 16, x: -27, z: 28, links: [12, 15, 18] },
      { id: 17, x: 28, z: 28, links: [14, 15, 18] },
      { id: 18, x: 0, z: 34, links: [15, 16, 17] }
    ],
    lootSpawns: [
      { x: 6, y: 0, z: 0 }, { x: -6, y: 0, z: 0 },
      { x: 24, y: 0, z: 0 }, { x: -24, y: 0, z: 0 },
      { x: -10.5, y: 3.0, z: -14 }, { x: 10.5, y: 3.0, z: 14 },
      { x: 27, y: 0, z: -15 }, { x: -27, y: 0, z: 15 }
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
