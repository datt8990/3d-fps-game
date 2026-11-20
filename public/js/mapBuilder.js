// AAA-Grade 3D Arena Builder: Sculpted Containers, 3D Sandbag Walls, Armored Trucks, Rotating Radar, Sky Dome & Props
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getMapMaterial, getSkyDomeTexture } from './textures.js';
import { createC4Mesh, createWeaponModel } from './models.js';

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

// Build an optimized single-draw-call 3D stacked sandbag wall inside the exact (w, h, d) block volume
function createSandbagWallGroup(b, castShadows) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);

  const isWideX = b.w >= b.d;
  const length = isWideX ? b.w : b.d;
  const thickness = isWideX ? b.d : b.w;
  const rows = Math.max(3, Math.min(5, Math.round(b.h / 0.26)));
  const bagH = b.h / rows;
  const bagLen = Math.min(0.85, Math.max(0.52, length / Math.max(2, Math.round(length / 0.72))));
  const cols = Math.max(2, Math.floor(length / bagLen));
  const actualBagLen = length / cols;

  const geos = [];
  const coreGeo = new THREE.BoxGeometry(b.w * 0.86, b.h * 0.92, b.d * 0.82);
  coreGeo.translate(0, b.h * 0.46, 0);
  geos.push(coreGeo);

  for (let r = 0; r < rows; r++) {
    const yCenter = (r + 0.5) * bagH;
    const stagger = (r % 2) * 0.25;
    for (let c = 0; c < cols; c++) {
      const offsetAlong = -length * 0.5 + (c + 0.5) * actualBagLen;
      const bw = isWideX ? actualBagLen * 0.94 : thickness * 0.96;
      const bd = isWideX ? thickness * 0.96 : actualBagLen * 0.94;
      const bg = new THREE.BoxGeometry(bw, bagH * 0.88, bd);
      const rotY = ((r + c) % 2 === 0 ? 1 : -1) * 0.03 * (stagger ? 1 : 0.5);
      if (rotY) bg.rotateY(rotY);
      bg.translate(isWideX ? offsetAlong : 0, yCenter, isWideX ? 0 : offsetAlong);
      geos.push(bg);
    }
  }

  if (BufferGeometryUtils?.mergeGeometries) {
    const merged = BufferGeometryUtils.mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const wallMesh = new THREE.Mesh(merged, propMats.sandbagA);
    if (castShadows) {
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
    }
    group.add(wallMesh);
  } else {
    for (const g of geos) {
      const m = new THREE.Mesh(g, propMats.sandbagA);
      if (castShadows) { m.castShadow = true; m.receiveShadow = true; }
      group.add(m);
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

  const isOpenWorld = Boolean(mapData.terrain);

  // 1. 3D Atmospheric Sky Dome
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(isOpenWorld ? 1200 : 185, 32, 20),
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
    mapData.theme === 'urban_dusk' ? '#bfdbfe' : '#f8fafc',
    mapData.theme === 'desert_military' ? '#8c6b42' : '#475569',
    1.22
  );
  worldGroup.add(hemi);

  const sunColor = mapData.theme === 'urban_dusk' ? '#fed7aa' : (mapData.theme === 'desert_military' ? '#fef08a' : '#fffbeb');
  const sun = new THREE.DirectionalLight(sunColor, 1.90);
  sun.position.set(38, 62, 30);
  worldGroup.add(sun.target);
  const enableWorldShadows = isOpenWorld ? quality === 'high' : quality !== 'low';
  if (enableWorldShadows) {
    sun.castShadow = true;
    const mapSize = quality === 'high' ? 1024 : 512;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = isOpenWorld ? 135 : 150;
    const d = isOpenWorld ? 38 : 48;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0006;
  }
  worldGroup.add(sun);

  // Crisp horizon fill light so shaded sides of characters & gear keep sharp contrast
  const fillLight = new THREE.DirectionalLight('#bae6fd', 0.78);
  fillLight.position.set(-35, 28, -30);
  worldGroup.add(fillLight);

  // 3. Ground Surface (Chunked Heightfield Terrain + River/Ocean Water OR Flat Arena Floor)
  const sectorGroups = [];
  const sectorGroupsMap = new Map();
  const getSectorGrp = (bx, bz) => {
    if (!isOpenWorld) return { key: 'root', grp: worldGroup };
    const sx = Math.round(bx / 350) * 350;
    const sz = Math.round(bz / 350) * 350;
    const key = `${sx}_${sz}`;
    let grp = sectorGroupsMap.get(key);
    if (!grp) {
      grp = new THREE.Group();
      grp.userData.sectorCenter = { x: sx, z: sz };
      sectorGroupsMap.set(key, grp);
      sectorGroups.push(grp);
      worldGroup.add(grp);
    }
    return { key, grp };
  };

  if (isOpenWorld) {
    const t = mapData.terrain;
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04
    });
    const chunkCells = 30; // 30x10m = 300m per frustum-culled terrain sector (ultra smooth in 1.5km map)
    const rgb = [0, 0, 0];
    for (let z0 = 0; z0 < t.nx - 1; z0 += chunkCells) {
      const z1 = Math.min(t.nx - 1, z0 + chunkCells);
      for (let x0 = 0; x0 < t.nx - 1; x0 += chunkCells) {
        const x1 = Math.min(t.nx - 1, x0 + chunkCells);
        const cols = x1 - x0 + 1;
        const rows = z1 - z0 + 1;
        const pos = new Float32Array(cols * rows * 3);
        const col = new Float32Array(cols * rows * 3);
        const indices = [];

        let ptr = 0;
        for (let iz = z0; iz <= z1; iz++) {
          const wz = -t.half + iz * t.cell;
          for (let ix = x0; ix <= x1; ix++) {
            const wx = -t.half + ix * t.cell;
            const wy = t.heights[iz * t.nx + ix];
            pos[ptr * 3] = wx;
            pos[ptr * 3 + 1] = wy;
            pos[ptr * 3 + 2] = wz;
            t.colorAt(ix, iz, rgb);
            col[ptr * 3] = rgb[0];
            col[ptr * 3 + 1] = rgb[1];
            col[ptr * 3 + 2] = rgb[2];
            ptr++;
          }
        }
        for (let rz = 0; rz < rows - 1; rz++) {
          for (let rx = 0; rx < cols - 1; rx++) {
            const a = rz * cols + rx;
            const b = a + 1;
            const c = a + cols;
            const d = c + 1;
            // Matches terrain.heightAt (u+v <= 1) diagonal split with +Y outward normal
            indices.push(a, c, b, b, c, d);
          }
        }
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        tGeo.setIndex(indices);
        tGeo.computeVertexNormals();
        const tMesh = new THREE.Mesh(tGeo, terrainMat);
        tMesh.receiveShadow = enableWorldShadows;
        worldGroup.add(tMesh);
      }
    }

    // Translucent River / Lake / Ocean Surface at waterLevel
    const waterGeo = new THREE.PlaneGeometry(t.half * 2 + 600, t.half * 2 + 600);
    const waterMesh = new THREE.Mesh(
      waterGeo,
      new THREE.MeshStandardMaterial({
        color: '#0e7490',
        roughness: 0.16,
        metalness: 0.35,
        transparent: true,
        opacity: 0.78
      })
    );
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = t.waterLevel;
    worldGroup.add(waterMesh);

    // Sector-bucketed Instanced Forest Trees (distant island sectors are 100% culled!)
    if (mapData.trees?.length && THREE.InstancedMesh) {
      const dummy = new THREE.Object3D();
      const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3.6, 6);
      trunkGeo.translate(0, 1.8, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c3c1e', roughness: 0.9 });

      const leafGeo = new THREE.ConeGeometry(1.85, 5.2, 7);
      leafGeo.translate(0, 4.6, 0);
      const leafMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.85, metalness: 0.04 });

      const treesBySector = new Map();
      for (let i = 0; i < mapData.trees.length; i++) {
        const tr = mapData.trees[i];
        const { key } = getSectorGrp(tr.x, tr.z);
        let arr = treesBySector.get(key);
        if (!arr) { arr = []; treesBySector.set(key, arr); }
        arr.push(tr);
      }
      for (const [key, list] of treesBySector.entries()) {
        const grp = sectorGroupsMap.get(key) || worldGroup;
        const trunksMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
        const leavesMesh = new THREE.InstancedMesh(leafGeo, leafMat, list.length);
        for (let i = 0; i < list.length; i++) {
          const tr = list[i];
          dummy.position.set(tr.x, tr.y, tr.z);
          dummy.scale.setScalar(tr.scale || 1);
          dummy.rotation.y = (i * 1.7) % (Math.PI * 2);
          dummy.updateMatrix();
          trunksMesh.setMatrixAt(i, dummy.matrix);
          leavesMesh.setMatrixAt(i, dummy.matrix);
        }
        trunksMesh.instanceMatrix.needsUpdate = true;
        leavesMesh.instanceMatrix.needsUpdate = true;
        trunksMesh.computeBoundingSphere();
        leavesMesh.computeBoundingSphere();
        grp.add(trunksMesh, leavesMesh);
      }
    }

    // Sector-bucketed Instanced Boulders / Cliff Rocks (frustum & distance culled!)
    if (mapData.rocks?.length && THREE.InstancedMesh) {
      const dummy = new THREE.Object3D();
      const rockGeo = THREE.DodecahedronGeometry
        ? new THREE.DodecahedronGeometry(1.0, 0)
        : new THREE.BoxGeometry(1.6, 1.2, 1.6);
      const rockMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.94, metalness: 0.06 });

      const rocksBySector = new Map();
      for (let i = 0; i < mapData.rocks.length; i++) {
        const rk = mapData.rocks[i];
        const { key } = getSectorGrp(rk.x, rk.z);
        let arr = rocksBySector.get(key);
        if (!arr) { arr = []; rocksBySector.set(key, arr); }
        arr.push(rk);
      }
      for (const [key, list] of rocksBySector.entries()) {
        const grp = sectorGroupsMap.get(key) || worldGroup;
        const rocksMesh = new THREE.InstancedMesh(rockGeo, rockMat, list.length);
        for (let i = 0; i < list.length; i++) {
          const rk = list[i];
          dummy.position.set(rk.x, rk.y + (rk.ry || 1) * 0.35, rk.z);
          dummy.scale.set(rk.s || 1.5, rk.ry || 1.2, (rk.s || 1.5) * 0.9);
          dummy.rotation.set(i * 0.4, i * 1.1, i * 0.2);
          dummy.updateMatrix();
          rocksMesh.setMatrixAt(i, dummy.matrix);
        }
        rocksMesh.instanceMatrix.needsUpdate = true;
        rocksMesh.computeBoundingSphere();
        grp.add(rocksMesh);
      }
    }
  } else {
    const floorW = mapData.bounds.halfW * 2 + 10;
    const floorD = mapData.bounds.halfD * 2 + 10;
    const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
    const floorMesh = new THREE.Mesh(floorGeo, getMapMaterial(mapData.floorMat));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.008;
    floorMesh.receiveShadow = quality !== 'low';
    worldGroup.add(floorMesh);
  }

  const tiledMaterials = new Set([
    'building_brick',
    'building_glass',
    'bunker_concrete',
    'warehouse_wall',
    'military_wall',
    'city_wall',
    'jungle_stone',
    'jungle_wall',
    'concrete'
  ]);
  const castShadows = enableWorldShadows;

  // Instanced Multi-Tier Trees & Natural Rocks for Arena Maps (e.g. MAP 04 - Jungle)
  if (!isOpenWorld) {
    if (mapData.trees?.length && THREE.InstancedMesh) {
      const dummy = new THREE.Object3D();
      const trunkGeo = new THREE.CylinderGeometry(0.20, 0.34, 4.2, 8);
      trunkGeo.translate(0, 2.1, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3219', roughness: 0.92 });
      const trunksMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, mapData.trees.length);

      const canopyLowGeo = new THREE.ConeGeometry(2.35, 3.6, 9);
      canopyLowGeo.translate(0, 4.4, 0);
      const canopyLowMat = new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.85, metalness: 0.04 });
      const canopyLowMesh = new THREE.InstancedMesh(canopyLowGeo, canopyLowMat, mapData.trees.length);

      const canopyTopGeo = new THREE.ConeGeometry(1.65, 3.2, 9);
      canopyTopGeo.translate(0, 6.2, 0);
      const canopyTopMat = new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.82, metalness: 0.05 });
      const canopyTopMesh = new THREE.InstancedMesh(canopyTopGeo, canopyTopMat, mapData.trees.length);

      mapData.trees.forEach((tr, i) => {
        dummy.position.set(tr.x, tr.y || 0, tr.z);
        dummy.scale.setScalar(tr.scale || 1);
        dummy.rotation.y = (i * 1.9) % (Math.PI * 2);
        dummy.updateMatrix();
        trunksMesh.setMatrixAt(i, dummy.matrix);
        canopyLowMesh.setMatrixAt(i, dummy.matrix);
        canopyTopMesh.setMatrixAt(i, dummy.matrix);
      });
      trunksMesh.instanceMatrix.needsUpdate = true;
      canopyLowMesh.instanceMatrix.needsUpdate = true;
      canopyTopMesh.instanceMatrix.needsUpdate = true;
      if (castShadows) {
        trunksMesh.castShadow = true;
        canopyLowMesh.castShadow = true;
        canopyTopMesh.castShadow = true;
      }
      worldGroup.add(trunksMesh, canopyLowMesh, canopyTopMesh);
    }

    if (mapData.rocks?.length && THREE.InstancedMesh) {
      const dummy = new THREE.Object3D();
      const rockGeo = THREE.DodecahedronGeometry
        ? new THREE.DodecahedronGeometry(1.0, 0)
        : new THREE.BoxGeometry(1.6, 1.2, 1.6);
      const rockMat = new THREE.MeshStandardMaterial({ color: '#526052', roughness: 0.92, metalness: 0.06 });
      const rocksMesh = new THREE.InstancedMesh(rockGeo, rockMat, mapData.rocks.length);
      mapData.rocks.forEach((rk, i) => {
        dummy.position.set(rk.x, (rk.y || 0) + (rk.ry || 1) * 0.35, rk.z);
        dummy.scale.set(rk.s || 1.4, rk.ry || 1.1, (rk.s || 1.4) * 0.9);
        dummy.rotation.set(i * 0.35, i * 1.15, i * 0.2);
        dummy.updateMatrix();
        rocksMesh.setMatrixAt(i, dummy.matrix);
      });
      rocksMesh.instanceMatrix.needsUpdate = true;
      if (castShadows) {
        rocksMesh.castShadow = true;
        rocksMesh.receiveShadow = true;
      }
      worldGroup.add(rocksMesh);
    }
  }

  // 4. Arena Blocks: Batched Geometry Merging for Open-World & Rich Detailing for Arenas
  if (isOpenWorld) {
    const sectorBatches = new Map(); // sectorKey -> Map(mat -> Array<BufferGeometry>)

    for (const b of mapData.blocks) {
      if (b.noVisual) continue;
      const { key, grp } = getSectorGrp(b.x, b.z);

      if (b.mat === 'sandbag') {
        grp.add(createSandbagWallGroup(b, castShadows));
        continue;
      }

      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      if (tiledMaterials.has(b.mat)) {
        applyProportionalBoxUVs(geo, b.w, b.h, b.d, 5.0);
      }
      geo.translate(b.x, b.y + b.h * 0.5, b.z);

      if (!sectorBatches.has(key)) sectorBatches.set(key, new Map());
      const matMap = sectorBatches.get(key);
      if (!matMap.has(b.mat)) matMap.set(b.mat, []);
      matMap.get(b.mat).push(geo);
    }

    // High performance merged mesh creation per material per sector (draw calls dropped by 99%!)
    for (const [key, matMap] of sectorBatches.entries()) {
      const grp = sectorGroupsMap.get(key) || worldGroup;
      for (const [matName, geos] of matMap.entries()) {
        let finalGeo;
        if (geos.length === 1) {
          finalGeo = geos[0];
        } else if (BufferGeometryUtils?.mergeGeometries) {
          finalGeo = BufferGeometryUtils.mergeGeometries(geos, false);
          for (const g of geos) g.dispose();
        } else {
          for (const g of geos) {
            const m = new THREE.Mesh(g, getMapMaterial(matName));
            if (castShadows) { m.castShadow = true; m.receiveShadow = true; }
            grp.add(m);
          }
          continue;
        }
        const mergedMesh = new THREE.Mesh(finalGeo, getMapMaterial(matName));
        if (castShadows) {
          mergedMesh.castShadow = true;
          mergedMesh.receiveShadow = true;
        }
        grp.add(mergedMesh);
      }
    }
  } else {
    // Optimized Competitive Arena (warehouse, military_base, urban_city, jungle):
    // Batch plain architectural walls/steps per material into 1 draw call while keeping detailed hero props!
    const arenaBatches = new Map();
    const copingGeos = [];

    for (const b of mapData.blocks) {
      if (b.noVisual) continue;

      if (b.mat === 'sandbag') {
        worldGroup.add(createSandbagWallGroup(b, castShadows));
        continue;
      }

      if (mapData.id === 'urban_city' && (b.mat === 'container_blue' || b.mat === 'container_red') && Math.abs(b.d - 6.2) < 0.2) {
        worldGroup.add(createArmoredTruckGroup(b, castShadows));
        continue;
      }

      const needsCustomDeco =
        (b.mat && b.mat.startsWith('container_')) ||
        b.mat === 'crate_wood' ||
        b.mat === 'crate_metal' ||
        b.mat === 'metal_deck' ||
        b.mat === 'building_brick' ||
        b.mat === 'building_glass';

      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      if (tiledMaterials.has(b.mat)) {
        applyProportionalBoxUVs(geo, b.w, b.h, b.d, 5.0);
      }

      if (!needsCustomDeco && BufferGeometryUtils?.mergeGeometries) {
        geo.translate(b.x, b.y + b.h * 0.5, b.z);
        const batchKey = `${b.mat || 'concrete'}|${b.isBoundary ? '1' : '0'}`;
        if (!arenaBatches.has(batchKey)) {
          arenaBatches.set(batchKey, { matName: b.mat || 'concrete', isBoundary: Boolean(b.isBoundary), geos: [] });
        }
        arenaBatches.get(batchKey).geos.push(geo);

        if (b.isBoundary) {
          const cg = new THREE.BoxGeometry(b.w + 0.1, 0.35, b.d + 0.25);
          cg.translate(b.x, b.y + b.h, b.z);
          copingGeos.push(cg);
        }
        continue;
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
        const coping = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.1, 0.35, b.d + 0.25), propMats.darkSteel);
        coping.position.y = b.h * 0.5;
        mesh.add(coping);
      }

      worldGroup.add(mesh);
    }

    // Flush batched arena meshes (massive draw call reduction for Warehouse, Military Base, Urban & Jungle!)
    for (const batch of arenaBatches.values()) {
      const merged = batch.geos.length === 1 ? batch.geos[0] : BufferGeometryUtils.mergeGeometries(batch.geos, false);
      if (batch.geos.length > 1) {
        for (const g of batch.geos) g.dispose();
      }
      const m = new THREE.Mesh(merged, getMapMaterial(batch.matName));
      if (castShadows && !batch.isBoundary) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      worldGroup.add(m);
    }
    if (copingGeos.length > 0 && BufferGeometryUtils?.mergeGeometries) {
      const mergedCoping = copingGeos.length === 1 ? copingGeos[0] : BufferGeometryUtils.mergeGeometries(copingGeos, false);
      if (copingGeos.length > 1) {
        for (const g of copingGeos) g.dispose();
      }
      worldGroup.add(new THREE.Mesh(mergedCoping, propMats.darkSteel));
    }
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
  } else if (mapData.id === 'jungle') {
    // Ancient Jungle Temple Stone Canopy Beams & Rotating Tactical Drone Relay atop Central Temple (x=0, y=6.2, z=0)
    const beamMat = getMapMaterial('jungle_stone');
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.55, 1.3), beamMat);
    b1.position.set(0, 6.25, -4.2);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.55, 1.3), beamMat);
    b2.position.set(0, 6.25, 4.2);
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 9.6), beamMat);
    b3.position.set(-4.2, 6.25, 0);
    const b4 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 9.6), beamMat);
    b4.position.set(4.2, 6.25, 0);
    worldGroup.add(b1, b2, b3, b4);

    const relicPivot = new THREE.Group();
    relicPivot.position.set(0, 3.6, 0);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.055, 8, 22),
      new THREE.MeshStandardMaterial({ color: '#4ade80', emissive: '#16a34a', emissiveIntensity: 0.8 })
    );
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      new THREE.MeshStandardMaterial({ color: '#86efac', emissive: '#22c55e', emissiveIntensity: 0.75, metalness: 0.4, roughness: 0.2 })
    );
    relicPivot.add(ring, crystal);
    worldGroup.add(relicPivot);
    animatedProps.push({ type: 'spin_multi', mesh: relicPivot, speed: 1.1 });
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
    const stormH = isOpenWorld ? 360 : 22;
    stormMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, stormH, 56, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#a855f7',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    stormMesh.position.y = stormH * 0.5;
    worldGroup.add(stormMesh);
  }

  scene.add(worldGroup);
  return {
    worldGroup,
    worldC4,
    stormMesh,
    sun,
    sectorGroups,
    bombMarkers,
    animatedProps
  };
}

export function createDropPlaneMesh() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 });
  const darkTrimMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4, metalness: 0.72 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#f97316', emissiveIntensity: 0.35, roughness: 0.35 });

  // Main Cargo Fuselage (aligned -Z forward)
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 12.6), hullMat);
  body.position.set(0, 0, 0);
  g.add(body);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 11.4), darkTrimMat);
  belly.position.set(0, -1.25, 0);
  g.add(belly);

  // Nose Cone & Cockpit Canopy (-Z forward)
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.35, 3.2, 8), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.15, -7.8);
  g.add(nose);

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.72, 1.5), propMats.glassCab);
  cockpit.position.set(0, 0.65, -6.3);
  g.add(cockpit);

  // Rear Cargo Ramp + Drop Beacon (+Z tail)
  const tailCone = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.6, 3.4), hullMat);
  tailCone.position.set(0, 0.35, 7.6);
  g.add(tailCone);

  const rampBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), propMats.glowAmber);
  rampBeacon.position.set(0, -0.5, 6.9);
  g.add(rampBeacon);

  // Swept High Wings & Horizontal/Vertical Tail
  const wings = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.28, 2.9), hullMat);
  wings.position.set(0, 1.15, -0.8);
  g.add(wings);

  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.32, 2.7), stripeMat);
  wingTipL.position.set(-8.6, 1.15, -0.8);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 8.6;
  g.add(wingTipL, wingTipR);

  const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.8, 2.4), hullMat);
  vTail.position.set(0, 2.8, 7.9);
  const hTail = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.22, 1.6), hullMat);
  hTail.position.set(0, 1.25, 8.2);
  g.add(vTail, hTail);

  // 4 Wing-mounted Turboprop Engines & Spinning Propellers
  const props = [];
  for (const px of [-6.0, -3.1, 3.1, 6.0]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 2.1, 10), darkTrimMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(px, 0.85, -1.7);
    g.add(nacelle);

    const propGroup = new THREE.Group();
    propGroup.position.set(px, 0.85, -2.85);
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.05), stripeMat);
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.05), stripeMat);
    propGroup.add(blade1, blade2);
    g.add(propGroup);
    props.push(propGroup);
  }

  g.userData.props = props;
  return g;
}

export function createParachuteMesh() {
  const g = new THREE.Group();
  const canopyMatA = new THREE.MeshStandardMaterial({
    color: '#f97316',
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  const canopyMatB = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  // Curved parachute dome (open hem facing down)
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.42, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    canopyMatA
  );
  canopy.position.set(0, 2.35, 0);
  canopy.scale.set(1.18, 0.88, 1.0);
  g.add(canopy);

  const centerStripe = new THREE.Mesh(
    new THREE.SphereGeometry(1.435, 10, 6, Math.PI * 0.35, Math.PI * 0.3, 0, Math.PI * 0.47),
    canopyMatB
  );
  centerStripe.position.copy(canopy.position);
  centerStripe.scale.copy(canopy.scale);
  g.add(centerStripe);

  // 4 suspension harness risers from shoulder height to canopy rim
  const cordMat = new THREE.MeshBasicMaterial({ color: '#cbd5e1' });
  const rimPts = [
    [-1.4, 2.35, -0.55],
    [1.4, 2.35, -0.55],
    [-1.4, 2.35, 0.55],
    [1.4, 2.35, 0.55]
  ];
  for (const [rx, ry, rz] of rimPts) {
    const start = new THREE.Vector3(rx * 0.14, 1.28, rz * 0.14);
    const end = new THREE.Vector3(rx, ry, rz);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 5), cordMat);
    cord.position.copy(start).addScaledVector(dir, 0.5);
    cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(cord);
  }

  return g;
}

export function createLootCrateMesh(crateOrType = 'medkit') {
  const isObj = crateOrType && typeof crateOrType === 'object';
  const kind = isObj ? (crateOrType.kind || crateOrType.type || 'medkit') : crateOrType;
  const weaponId = isObj ? crateOrType.weaponId : null;
  const tier = isObj ? (crateOrType.tier || 1) : 1;

  if (kind === 'deathbox') {
    // PUBG-style Wooden/Steel Loot Death Crate with Glowing Locator Beam
    const g = new THREE.Group();
    const coffin = new THREE.Mesh(
      new THREE.BoxGeometry(1.08, 0.52, 0.72),
      new THREE.MeshStandardMaterial({ color: '#5c3c1e', roughness: 0.75, metalness: 0.15 })
    );
    coffin.position.y = 0.26;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.10, 0.78),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.7 })
    );
    lid.position.y = 0.54;
    const tag = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.80),
      new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.65 })
    );
    tag.position.y = 0.34;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.22, 4.5, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = 2.4;
    g.add(coffin, lid, tag, beam);
    g.userData.crateInfo = crateOrType;
    return g;
  }

  if (kind === 'weapon' && weaponId) {
    const isElite = weaponId === 'awp' || weaponId === 'barrett' || weaponId === 'm249' || weaponId === 'scarh' || weaponId === 'm200';
    const ringColor = isElite ? '#f59e0b' : '#38bdf8';
    const g = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.035, 8, 22),
      new THREE.MeshBasicMaterial({ color: ringColor })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.44, 0.04, 16),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.25 })
    );
    aura.position.y = 0.025;
    g.add(aura);

    const gunModel = createWeaponModel(weaponId, 'default', {});
    gunModel.scale.setScalar(1.32);
    gunModel.position.set(0, 0.46, 0);
    gunModel.rotation.x = 0.18;
    gunModel.rotation.z = -0.18;
    g.add(gunModel);

    g.userData.crateInfo = isObj ? crateOrType : { kind, weaponId };
    return g;
  }

  const tierColors = { 1: '#94a3b8', 2: '#38bdf8', 3: '#f59e0b' };
  const colorMap = {
    medkit: '#22c55e',
    med: '#22c55e',
    vest: tierColors[tier] || '#38bdf8',
    armor: '#38bdf8',
    helmet: tierColors[tier] || '#60a5fa',
    bag: tierColors[tier] || '#a855f7',
    ammo: '#f97316',
    grenade: '#ef4444',
    overcharge: '#c084fc'
  };
  const color = colorMap[kind] || '#eab308';
  const g = new THREE.Group();

  const basePad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.07, 12),
    propMats.darkSteel
  );
  basePad.position.y = 0.035;

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.34, 0.56),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.38, metalness: 0.68 })
  );
  box.position.y = 0.22;

  const glowMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.85, roughness: 0.2 });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.08, 0.60), glowMat);
  trim.position.y = 0.22;

  // Floating 3D Holographic Emblem above the item
  const holoGroup = new THREE.Group();
  holoGroup.position.y = 0.62;
  if (kind === 'medkit' || kind === 'med') {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.08), glowMat);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), glowMat);
    holoGroup.add(c1, c2);
  } else if (kind === 'vest' || kind === 'armor') {
    const plate = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat);
    plate.scale.set(1.1, 1.3, 0.45);
    holoGroup.add(plate);
  } else if (kind === 'helmet') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), glowMat);
    holoGroup.add(dome);
  } else if (kind === 'bag') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.16), glowMat);
    holoGroup.add(pack);
  } else if (kind === 'grenade') {
    const gr = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), glowMat);
    holoGroup.add(gr);
  } else {
    for (const bx of [-0.08, 0, 0.08]) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.24, 8), glowMat);
      round.position.x = bx;
      holoGroup.add(round);
    }
  }

  g.add(basePad, box, trim, holoGroup);
  g.userData.crateInfo = isObj ? crateOrType : { kind };
  return g;
}
