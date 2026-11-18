// AAA-Grade 3D Arena Builder: Sculpted Containers, 3D Sandbag Walls, Armored Trucks, Rotating Radar, Sky Dome & Props
import * as THREE from 'three';
import { getMapMaterial, getSkyDomeTexture } from './textures.js';
import { createC4Mesh } from './models.js';

const sharedGeos = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12)
};

const propMats = {
  darkSteel: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.38, metalness: 0.78 }),
  galvSteel: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.32, metalness: 0.85 }),
  woodFrame: new THREE.MeshStandardMaterial({ color: '#5c3c1e', roughness: 0.80, metalness: 0.08 }),
  hazardYellow: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.42, metalness: 0.35 }),
  tireRubber: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.88, metalness: 0.10 }),
  glassCab: new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.12, metalness: 0.90 }),
  sandbagA: new THREE.MeshStandardMaterial({ color: '#a68b5b', roughness: 0.92, metalness: 0.02 }),
  sandbagB: new THREE.MeshStandardMaterial({ color: '#94794b', roughness: 0.94, metalness: 0.02 }),
  sandbagC: new THREE.MeshStandardMaterial({ color: '#b59a6b', roughness: 0.90, metalness: 0.02 }),
  glowCyan: new THREE.MeshBasicMaterial({ color: '#38bdf8' }),
  glowAmber: new THREE.MeshBasicMaterial({ color: '#f59e0b' }),
  glowRed: new THREE.MeshBasicMaterial({ color: '#ef4444' }),
  glowWhite: new THREE.MeshBasicMaterial({ color: '#fef9c3' })
};

function makeSiteBadgeSprite(letter, colorHex = '#f59e0b') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = colorHex;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 67);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.85, 1.85, 1);
  return sp;
}

function makeHelipadDecal() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.78)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
  ctx.fillRect(78, 64, 22, 128);
  ctx.fillRect(156, 64, 22, 128);
  ctx.fillRect(98, 116, 60, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 7.5),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
}

// Proportionally tile UVs on architectural walls & buildings so textures never look stretched
function applyProportionalBoxUVs(geo, w, h, d, tileSize = 4.0) {
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!uv || !pos || !norm) return;

  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const u = uv.getX(i);
    const v = uv.getY(i);

    if (nx > 0.5) {
      uv.setXY(i, u * Math.max(1, d / tileSize), v * Math.max(1, h / tileSize));
    } else if (ny > 0.5) {
      uv.setXY(i, u * Math.max(1, w / tileSize), v * Math.max(1, d / tileSize));
    } else {
      uv.setXY(i, u * Math.max(1, w / tileSize), v * Math.max(1, h / tileSize));
    }
  }
  uv.needsUpdate = true;
}

// Build a 3D stacked sandbag wall inside the exact (w, h, d) block volume
function createSandbagWallGroup(b, castShadows) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);

  const core = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.86, b.h * 0.92, b.d * 0.82), propMats.sandbagB);
  core.position.y = b.h * 0.46;
  group.add(core);

  const isWideX = b.w >= b.d;
  const length = isWideX ? b.w : b.d;
  const thickness = isWideX ? b.d : b.w;
  const rows = Math.max(3, Math.min(5, Math.round(b.h / 0.26)));
  const bagH = b.h / rows;
  const bagLen = Math.min(0.85, Math.max(0.52, length / Math.max(2, Math.round(length / 0.72))));
  const cols = Math.max(2, Math.floor(length / bagLen));
  const actualBagLen = length / cols;
  const bagMats = [propMats.sandbagA, propMats.sandbagB, propMats.sandbagC];

  for (let r = 0; r < rows; r++) {
    const yCenter = (r + 0.5) * bagH;
    const stagger = (r % 2) * 0.25;
    for (let c = 0; c < cols; c++) {
      const offsetAlong = -length * 0.5 + (c + 0.5) * actualBagLen;
      const bw = isWideX ? actualBagLen * 0.94 : thickness * 0.96;
      const bd = isWideX ? thickness * 0.96 : actualBagLen * 0.94;
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bagH * 0.88, bd),
        bagMats[(r + c) % bagMats.length]
      );
      bag.position.set(
        isWideX ? offsetAlong : 0,
        yCenter,
        isWideX ? 0 : offsetAlong
      );
      bag.rotation.y = ((r + c) % 2 === 0 ? 1 : -1) * 0.03 * (stagger ? 1 : 0.5);
      if (castShadows) {
        bag.castShadow = true;
        bag.receiveShadow = true;
      }
      group.add(bag);
    }
  }
  return group;
}

// Build a 3D Armored SWAT / Military Tactical Truck within the exact (w=2.6, h=2.5, d=6.2) vehicle collider
function createArmoredTruckGroup(b, castShadows) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);
  const bodyColor = b.mat === 'container_blue' ? '#1e3a8a' : '#7f1d1d';
  const armorMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.42, metalness: 0.58 });
  const facingSouth = b.x > 0;
  const dirZ = facingSouth ? 1 : -1;

  // Lower Armored Chassis & Undercarriage
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.92, 0.55, b.d * 0.96), propMats.darkSteel);
  chassis.position.set(0, 0.52, 0);
  group.add(chassis);

  // Rear Troop / Cargo Body (occupies rear 62% of length)
  const cargoD = b.d * 0.60;
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.96, b.h - 0.68, cargoD), armorMat);
  cargo.position.set(0, 0.68 + (b.h - 0.68) * 0.5, -dirZ * (b.d * 0.18));
  group.add(cargo);

  // Armored Cab (front 36% of length)
  const cabD = b.d * 0.34;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.92, b.h - 0.82, cabD), armorMat);
  cab.position.set(0, 0.68 + (b.h - 0.82) * 0.5, dirZ * (b.d * 0.29));
  group.add(cab);

  // Ballistic Windshield + Armored Hood + Bullbar Bumper + Glowing Headlights
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.82, 0.52, 0.08), propMats.glassCab);
  windshield.position.set(0, 1.72, dirZ * (b.d * 0.46));
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.98, 0.42, 0.22), propMats.darkSteel);
  bumper.position.set(0, 0.58, dirZ * (b.d * 0.49));
  const lightL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), propMats.glowWhite);
  lightL.position.set(-b.w * 0.34, 0.88, dirZ * (b.d * 0.48));
  const lightR = lightL.clone();
  lightR.position.x = b.w * 0.34;
  const sirenBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.12, 0.22),
    b.mat === 'container_blue' ? propMats.glowCyan : propMats.glowRed
  );
  sirenBar.position.set(0, b.h - 0.08, dirZ * (b.d * 0.26));
  group.add(windshield, bumper, lightL, lightR, sirenBar);

  // 6 Heavy Off-Road Tires + Steel Rims
  const wheelZPositions = [-b.d * 0.34, -b.d * 0.08, b.d * 0.30];
  for (const wz of wheelZPositions) {
    for (const side of [-1, 1]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.32, 16), propMats.tireRubber);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(side * (b.w * 0.46), 0.46, wz);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 12), propMats.galvSteel);
      rim.rotation.z = Math.PI / 2;
      rim.position.copy(tire.position);
      group.add(tire, rim);
    }
  }

  if (castShadows) {
    group.traverse((ch) => {
      if (ch.isMesh) {
        ch.castShadow = true;
        ch.receiveShadow = true;
      }
    });
  }
  return group;
}

// Decorate Shipping Containers with 3D Corner Castings, Door Locking Bars & Frame Rails
function decorateShippingContainer(mesh, b) {
  const hw = b.w * 0.5;
  const hh = b.h * 0.5;
  const hd = b.d * 0.5;

  // 4 Vertical Corner Posts
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, b.h + 0.02, 0.16), propMats.darkSteel);
      post.position.set(sx * (hw - 0.06), 0, sz * (hd - 0.06));
      mesh.add(post);
    }
  }

  // Locking Dual Steel Bars on the front & back container doors
  const isLongZ = b.d >= b.w;
  if (isLongZ) {
    for (const sz of [-1, 1]) {
      for (const bx of [-0.55, -0.18, 0.18, 0.55]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, b.h * 0.88, 8), propMats.galvSteel);
        bar.position.set(bx, 0, sz * (hd + 0.025));
        mesh.add(bar);
      }
    }
  } else {
    for (const sx of [-1, 1]) {
      for (const bz of [-0.55, -0.18, 0.18, 0.55]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, b.h * 0.88, 8), propMats.galvSteel);
        bar.position.set(sx * (hw + 0.025), 0, bz);
        mesh.add(bar);
      }
    }
  }

  // Top & Bottom Longitudinal Steel Sill Beams
  const topBeamL = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.03, 0.14, b.d + 0.03), propMats.darkSteel);
  topBeamL.position.y = hh - 0.06;
  mesh.add(topBeamL);
}

// Decorate Wooden & Metal Crates with 3D Beveled Frames, Corner Brackets & Tactical Lid
function decorateSupplyCrate(mesh, b, isMetal) {
  const hw = b.w * 0.5;
  const hh = b.h * 0.5;
  const hd = b.d * 0.5;

  if (isMetal) {
    // Reinforced overhanging armored lid + corner bumpers + glowing tactical strip
    const lid = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.08, 0.14, b.d + 0.08), propMats.darkSteel);
    lid.position.y = hh - 0.06;
    const baseRim = lid.clone();
    baseRim.position.y = -hh + 0.06;
    const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.45, 0.04, b.d + 0.06), propMats.glowAmber);
    ledStrip.position.y = hh - 0.18;
    mesh.add(lid, baseRim, ledStrip);
  } else {
    // 3D Raised Timber Frame Rails & Iron Corner Brackets
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.05, 0.11, b.d + 0.05), propMats.woodFrame);
    topFrame.position.y = hh - 0.055;
    const botFrame = topFrame.clone();
    botFrame.position.y = -hh + 0.055;
    mesh.add(topFrame, botFrame);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, b.h, 0.12), propMats.woodFrame);
        post.position.set(sx * (hw - 0.04), 0, sz * (hd - 0.04));
        mesh.add(post);
      }
    }
  }
}

// Decorate Elevated Platforms & Catwalks with Perimeter Steel Beams & Corner Bollards
function decorateMetalDeck(mesh, b) {
  const hh = b.h * 0.5;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.08, 0.22, b.d + 0.08), propMats.darkSteel);
  rim.position.y = hh - 0.11;
  const hazardStripe = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.10, 0.06, b.d + 0.10), propMats.hazardYellow);
  hazardStripe.position.y = hh - 0.22;
  mesh.add(rim, hazardStripe);
}

// Decorate Urban / Industrial Buildings with 3D Rooftop Parapets, Cornices, HVAC Units & Neon Signs
function decorateBuilding(mesh, b, mapId) {
  const hh = b.h * 0.5;
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.24, 0.35, b.d + 0.24), propMats.darkSteel);
  parapet.position.y = hh + 0.12;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.18, 0.45, b.d + 0.18), propMats.darkSteel);
  plinth.position.y = -hh + 0.22;
  mesh.add(parapet, plinth);

  // Rooftop HVAC Unit
  if (b.w >= 6 && b.d >= 6) {
    const hvac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.2), propMats.galvSteel);
    hvac.position.set(b.w * 0.18, hh + 0.55, -b.d * 0.15);
    mesh.add(hvac);
  }

  // Cyber / Tactical Neon Accent Sign on Urban City Buildings
  if (mapId === 'urban_city' && b.h >= 6.0) {
    const isBlue = b.mat === 'building_glass';
    const neonMat = isBlue ? propMats.glowCyan : propMats.glowAmber;
    const neonBar = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.12, 0.16, b.d + 0.12), neonMat);
    neonBar.position.y = hh - 0.65;
    mesh.add(neonBar);
  }
}

export function buildThreeMap(scene, mapData, mode = 'tdm', quality = 'high') {
  const worldGroup = new THREE.Group();
  const animatedProps = [];

  scene.background = new THREE.Color(mapData.skyColor || '#6989a8');
  scene.fog = new THREE.FogExp2(mapData.fogColor || '#7c96b0', mapData.fogDensity || 0.0045);

  // 1. 3D Atmospheric Sky Dome
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(185, 32, 20),
    new THREE.MeshBasicMaterial({
      map: getSkyDomeTexture(mapData.theme),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    })
  );
  worldGroup.add(skyDome);

  // 2. Balanced Three-Point Environment Lighting + Directional Sun Shadows
  const hemi = new THREE.HemisphereLight(
    mapData.theme === 'urban_dusk' ? '#93c5fd' : '#f1f5f9',
    mapData.theme === 'desert_military' ? '#785c38' : '#1e293b',
    0.95
  );
  worldGroup.add(hemi);

  const sunColor = mapData.theme === 'urban_dusk' ? '#fed7aa' : (mapData.theme === 'desert_military' ? '#fef08a' : '#fffbeb');
  const sun = new THREE.DirectionalLight(sunColor, 1.48);
  sun.position.set(38, 62, 30);
  if (quality !== 'low') {
    sun.castShadow = true;
    const mapSize = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 160;
    const d = 54;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
  }
  worldGroup.add(sun);

  // Subtle fill light from opposite horizon so shaded faces retain rich metallic detail
  const fillLight = new THREE.DirectionalLight('#60a5fa', 0.35);
  fillLight.position.set(-35, 28, -30);
  worldGroup.add(fillLight);

  // 3. Ground Plane offset slightly (-0.008m) so block bottoms at y=0 never Z-fight
  const floorW = mapData.bounds.halfW * 2 + 10;
  const floorD = mapData.bounds.halfD * 2 + 10;
  const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
  const floorMesh = new THREE.Mesh(floorGeo, getMapMaterial(mapData.floorMat));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.008;
  floorMesh.receiveShadow = quality !== 'low';
  worldGroup.add(floorMesh);

  const tiledMaterials = new Set([
    'building_brick',
    'building_glass',
    'bunker_concrete',
    'warehouse_wall',
    'military_wall',
    'city_wall',
    'concrete'
  ]);
  const castShadows = quality !== 'low';

  // 4. Arena Blocks with Rich 3D Architectural & Tactical Detailing
  for (const b of mapData.blocks) {
    if (b.mat === 'sandbag') {
      worldGroup.add(createSandbagWallGroup(b, castShadows));
      continue;
    }

    if (mapData.id === 'urban_city' && (b.mat === 'container_blue' || b.mat === 'container_red') && Math.abs(b.d - 6.2) < 0.2) {
      worldGroup.add(createArmoredTruckGroup(b, castShadows));
      continue;
    }

    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    if (tiledMaterials.has(b.mat)) {
      applyProportionalBoxUVs(geo, b.w, b.h, b.d, 5.0);
    }
    const mat = getMapMaterial(b.mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y + b.h * 0.5, b.z);
    if (castShadows && !b.isBoundary) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    if (b.mat && b.mat.startsWith('container_')) {
      decorateShippingContainer(mesh, b);
    } else if (b.mat === 'crate_wood') {
      decorateSupplyCrate(mesh, b, false);
    } else if (b.mat === 'crate_metal') {
      decorateSupplyCrate(mesh, b, true);
    } else if (b.mat === 'metal_deck') {
      decorateMetalDeck(mesh, b);
    } else if (b.mat === 'building_brick' || b.mat === 'building_glass') {
      decorateBuilding(mesh, b, mapData.id);
    } else if (b.isBoundary) {
      // Top armored wall coping & floodlight brackets along perimeter walls
      const coping = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.1, 0.35, b.d + 0.25), propMats.darkSteel);
      coping.position.y = b.h * 0.5;
      mesh.add(coping);
    }

    worldGroup.add(mesh);
  }

  // 5. Map-Specific Landmarks & Animated 3D Props
  if (mapData.id === 'warehouse') {
    // Hanging Industrial High-Bay LED Lamps along the 4 overhead steel beams
    for (const bz of [-20, -7, 7, 20]) {
      for (const bx of [-15, -5, 5, 15]) {
        const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 0.25, 10), propMats.darkSteel);
        lampHousing.position.set(bx, 7.62, bz);
        const lampGlow = new THREE.Mesh(new THREE.CircleGeometry(0.40, 10), propMats.glowWhite);
        lampGlow.rotation.x = Math.PI / 2;
        lampGlow.position.set(bx, 7.48, bz);
        worldGroup.add(lampHousing, lampGlow);
      }
    }
    // Overhead Gantry Crane Trolley on the z = -7 beam
    const trolley = new THREE.Group();
    trolley.position.set(0, 7.4, -7);
    const tBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 1.4), propMats.hazardYellow);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), propMats.darkSteel);
    cable.position.y = -1.2;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 14, Math.PI * 1.3), propMats.hazardYellow);
    hook.position.y = -2.35;
    trolley.add(tBox, cable, hook);
    worldGroup.add(trolley);
    animatedProps.push({ type: 'crane_sway', mesh: trolley, baseX: 0 });
  } else if (mapData.id === 'military_base') {
    // Giant Rotating 3D Radar Dish & Antenna Array atop Central Command Bunker (x=0, y=5.6, z=0)
    const radarPivot = new THREE.Group();
    radarPivot.position.set(0, 5.95, 0);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 0.8, 12), propMats.darkSteel);
    pedestal.position.y = -0.15;
    const dishWing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.15, 0.25), propMats.galvSteel);
    dishWing.position.set(0, 0.55, 0);
    dishWing.rotation.x = -0.22;
    const dishTips = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.22, 0.45), propMats.hazardYellow);
    dishTips.position.set(0, 0.55, 0);
    const feedHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.4, 8), propMats.darkSteel);
    feedHorn.rotation.x = Math.PI / 2;
    feedHorn.position.set(0, 0.65, -0.75);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), propMats.glowRed);
    beacon.position.set(0, 1.35, 0);
    radarPivot.add(pedestal, dishWing, dishTips, feedHorn, beacon);
    worldGroup.add(radarPivot);
    animatedProps.push({ type: 'spin_y', mesh: radarPivot, speed: 1.15 });

    // Helipad Decal at Bomb Site A (x=25.5, z=0.5)
    const helipad = makeHelipadDecal();
    helipad.rotation.x = -Math.PI / 2;
    helipad.position.set(25.5, 0.02, 0.5);
    worldGroup.add(helipad);
  } else if (mapData.id === 'urban_city') {
    // Rotating Holographic Tactical Globe & Golden Obelisk Crown atop Central Plaza Monument (x=0, y=4.8, z=0)
    const globePivot = new THREE.Group();
    globePivot.position.set(0, 5.55, 0);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 10, 28), propMats.hazardYellow);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 10, 24), propMats.glowCyan);
    innerRing.rotation.x = Math.PI / 3;
    const coreSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 14, 14),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.65, wireframe: true })
    );
    globePivot.add(outerRing, innerRing, coreSphere);
    worldGroup.add(globePivot);
    animatedProps.push({ type: 'spin_multi', mesh: globePivot, speed: 1.4 });
  }

  // 6. Spawn Zone Floor Rings (with polygonOffset + depthWrite:false to eliminate Z-fighting)
  const makeDecalRing = (innerR, outerR, colorHex, opacity) =>
    new THREE.Mesh(
      new THREE.RingGeometry(innerR, outerR, 36),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    );

  if (mapData.spawns?.alpha?.[2]) {
    const aPad = makeDecalRing(2.2, 2.65, '#38bdf8', 0.52);
    aPad.rotation.x = -Math.PI / 2;
    aPad.position.set(mapData.spawns.alpha[2].x, 0.025, mapData.spawns.alpha[2].z);
    worldGroup.add(aPad);
  }
  if (mapData.spawns?.bravo?.[2]) {
    const bPad = makeDecalRing(2.2, 2.65, '#f97316', 0.52);
    bPad.rotation.x = -Math.PI / 2;
    bPad.position.set(mapData.spawns.bravo[2].x, 0.025, mapData.spawns.bravo[2].z);
    worldGroup.add(bPad);
  }

  // 7. Bomb Sites A & B
  const bombMarkers = [];
  for (const site of mapData.bombSites || []) {
    const ring = makeDecalRing(
      site.radius - 0.18,
      site.radius,
      mode === 'bomb' ? '#ef4444' : '#f59e0b',
      mode === 'bomb' ? 0.75 : 0.30
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, (site.y || 0) + 0.03, site.z);
    worldGroup.add(ring);

    if (mode === 'bomb') {
      const badge = makeSiteBadgeSprite(site.id, '#f97316');
      badge.position.set(site.x, (site.y || 0) + 3.1, site.z);
      badge.userData.baseY = (site.y || 0) + 3.1;
      worldGroup.add(badge);
      bombMarkers.push(badge);
    }
  }

  const worldC4 = createC4Mesh();
  worldC4.visible = false;
  worldGroup.add(worldC4);

  let stormMesh = null;
  if (mode === 'survival') {
    stormMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 22, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#a855f7',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    stormMesh.position.y = 11;
    worldGroup.add(stormMesh);
  }

  scene.add(worldGroup);
  return {
    worldGroup,
    worldC4,
    stormMesh,
    bombMarkers,
    animatedProps
  };
}

export function createLootCrateMesh(type = 'medkit') {
  const color = type === 'medkit' ? '#22c55e' : (type === 'armor' ? '#38bdf8' : '#eab308');
  const g = new THREE.Group();

  const basePad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.54, 0.08, 12),
    propMats.darkSteel
  );
  basePad.position.y = 0.04;

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.44, 0.64),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.38, metalness: 0.68 })
  );
  box.position.y = 0.28;

  const glowMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.2 });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.10, 0.68), glowMat);
  trim.position.y = 0.28;

  // Floating 3D Holographic Emblem above the crate
  const holoGroup = new THREE.Group();
  holoGroup.position.y = 0.72;
  if (type === 'medkit') {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), glowMat);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), glowMat);
    holoGroup.add(c1, c2);
  } else if (type === 'armor') {
    const plate = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat);
    plate.scale.set(1.1, 1.3, 0.45);
    holoGroup.add(plate);
  } else {
    for (const bx of [-0.08, 0, 0.08]) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.24, 8), glowMat);
      round.position.x = bx;
      holoGroup.add(round);
    }
  }

  g.add(basePad, box, trim, holoGroup);
  return g;
}
