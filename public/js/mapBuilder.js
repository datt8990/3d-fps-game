// AAA-Grade 3D Arena Builder: Universal Geometry Batcher + Realistic Modern-FPS 3D Models
// (Forklifts, Black Hawk Helicopter, Armored MRAP Trucks, 3D Containers, Fuel Silos, Watchtowers, Streetlamps, Metro Canopy & Temple Ruins)
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getMapMaterial, getSkyDomeTexture } from './textures.js';
import { createC4Mesh, createWeaponModel } from './models.js';

const propMats = {
  darkSteel: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.38, metalness: 0.78 }),
  galvSteel: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.32, metalness: 0.85 }),
  oliveArmor: new THREE.MeshStandardMaterial({ color: '#364532', roughness: 0.52, metalness: 0.42 }),
  navyArmor: new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.42, metalness: 0.58 }),
  crimsonArmor: new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.42, metalness: 0.58 }),
  woodFrame: new THREE.MeshStandardMaterial({ color: '#5c3c1e', roughness: 0.80, metalness: 0.08 }),
  hazardYellow: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.42, metalness: 0.35 }),
  fuelTankWhite: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.38, metalness: 0.52 }),
  oilDrumRed: new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.44, metalness: 0.48 }),
  oilDrumBlue: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.44, metalness: 0.48 }),
  tireRubber: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.88, metalness: 0.10 }),
  glassCab: new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.14, metalness: 0.88 }),
  sandbagA: new THREE.MeshStandardMaterial({ color: '#a68b5b', roughness: 0.92, metalness: 0.02 }),
  sandbagB: new THREE.MeshStandardMaterial({ color: '#94794b', roughness: 0.94, metalness: 0.02 }),
  sandbagC: new THREE.MeshStandardMaterial({ color: '#b59a6b', roughness: 0.90, metalness: 0.02 }),
  glowCyan: new THREE.MeshBasicMaterial({ color: '#38bdf8' }),
  glowAmber: new THREE.MeshBasicMaterial({ color: '#f59e0b' }),
  glowRed: new THREE.MeshBasicMaterial({ color: '#ef4444' }),
  glowGreen: new THREE.MeshBasicMaterial({ color: '#22c55e' }),
  glowWhite: new THREE.MeshBasicMaterial({ color: '#fef9c3' })
};

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();

function normalizeGeoForMerge(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const keep = new Set(['position', 'normal', 'uv']);
  for (const k of Object.keys(g.attributes)) {
    if (!keep.has(k)) g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  return g;
}

// Universal Static Geometry Batcher: merges hundreds of detailed 3D architectural parts into 1 VBO draw call per material!
class MapBatchCollector {
  constructor() {
    this.buckets = new Map(); // Material -> { mat, castShadow, geos: [] }
  }

  addGeo(geo, mat, castShadow = true) {
    if (!geo || !mat) return;
    const key = `${mat.uuid}_${castShadow ? '1' : '0'}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, castShadow, geos: [] };
      this.buckets.set(key, b);
    }
    b.geos.push(normalizeGeoForMerge(geo));
    geo.dispose();
  }

  addBox(w, h, d, x, y, z, mat, rx = 0, ry = 0, rz = 0, castShadow = true, tileUvSize = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (tileUvSize > 0) applyProportionalBoxUVs(geo, w, h, d, tileUvSize);
    if (rx !== 0 || ry !== 0 || rz !== 0) {
      _euler.set(rx, ry, rz);
      _quat.setFromEuler(_euler);
      _pos.set(x, y, z);
      _mat4.compose(_pos, _quat, _scale);
      geo.applyMatrix4(_mat4);
    } else {
      geo.translate(x, y, z);
    }
    this.addGeo(geo, mat, castShadow);
  }

  addCyl(rTop, rBot, h, segs, x, y, z, mat, rx = 0, ry = 0, rz = 0, castShadow = true) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs);
    if (rx !== 0 || ry !== 0 || rz !== 0) {
      _euler.set(rx, ry, rz);
      _quat.setFromEuler(_euler);
      _pos.set(x, y, z);
      _mat4.compose(_pos, _quat, _scale);
      geo.applyMatrix4(_mat4);
    } else {
      geo.translate(x, y, z);
    }
    this.addGeo(geo, mat, castShadow);
  }

  flush(targetGroup, allowShadows = true) {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      let merged = null;
      if (b.geos.length === 1) {
        merged = b.geos[0];
      } else if (BufferGeometryUtils?.mergeGeometries) {
        merged = BufferGeometryUtils.mergeGeometries(b.geos, false);
        for (const g of b.geos) g.dispose();
      }
      if (merged) {
        const m = new THREE.Mesh(merged, b.mat);
        if (allowShadows && b.castShadow && !b.mat.isMeshBasicMaterial) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
        targetGroup.add(m);
      } else {
        for (const g of b.geos) {
          const m = new THREE.Mesh(g, b.mat);
          if (allowShadows && b.castShadow && !b.mat.isMeshBasicMaterial) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
          targetGroup.add(m);
        }
      }
    }
    this.buckets.clear();
  }
}

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

// Emit 3D Stacked Sandbag Fortification directly into batch collector (0 extra draw calls!)
function emitSandbagWall(batch, b) {
  const isWideX = b.w >= b.d;
  const length = isWideX ? b.w : b.d;
  const thickness = isWideX ? b.d : b.w;
  const rows = Math.max(3, Math.min(5, Math.round(b.h / 0.26)));
  const bagH = b.h / rows;
  const bagLen = Math.min(0.85, Math.max(0.52, length / Math.max(2, Math.round(length / 0.72))));
  const cols = Math.max(2, Math.floor(length / bagLen));
  const actualBagLen = length / cols;

  batch.addBox(b.w * 0.86, b.h * 0.92, b.d * 0.82, b.x, b.y + b.h * 0.46, b.z, propMats.sandbagA);

  for (let r = 0; r < rows; r++) {
    const yCenter = b.y + (r + 0.5) * bagH;
    const stagger = (r % 2) * 0.25;
    for (let c = 0; c < cols; c++) {
      const offsetAlong = -length * 0.5 + (c + 0.5) * actualBagLen;
      const bw = isWideX ? actualBagLen * 0.93 : thickness * 0.96;
      const bd = isWideX ? thickness * 0.96 : actualBagLen * 0.93;
      const rotY = ((r + c) % 2 === 0 ? 1 : -1) * 0.035 * (stagger ? 1 : 0.5);
      const bx = b.x + (isWideX ? offsetAlong : 0);
      const bz = b.z + (isWideX ? 0 : offsetAlong);
      const mat = (r + c) % 3 === 0 ? propMats.sandbagB : propMats.sandbagA;
      batch.addBox(bw, bagH * 0.88, bd, bx, yCenter, bz, mat, 0, rotY, 0);
    }
  }
}

// Emit 3D Armored SWAT / Military MRAP Tactical Truck directly into batch collector (0 extra draw calls!)
function emitArmoredTruck(batch, b) {
  const armorMat = b.mat === 'container_blue' ? propMats.navyArmor : propMats.crimsonArmor;
  const facingSouth = b.x > 0;
  const dirZ = facingSouth ? 1 : -1;
  const bx = b.x, by = b.y, bz = b.z;

  // Heavy undercarriage frame, axles & side steps
  batch.addBox(b.w * 0.92, 0.52, b.d * 0.96, bx, by + 0.52, bz, propMats.darkSteel);
  batch.addBox(b.w * 1.02, 0.10, b.d * 0.72, bx, by + 0.36, bz, propMats.galvSteel);

  // Rear Armored Troop Carrier Hull + Roof Turret Hatch + Side Gun-Ports
  const cargoD = b.d * 0.58;
  const cargoH = b.h - 0.68;
  const cargoZ = bz - dirZ * (b.d * 0.19);
  batch.addBox(b.w * 0.96, cargoH, cargoD, bx, by + 0.68 + cargoH * 0.5, cargoZ, armorMat);
  batch.addBox(b.w * 0.82, 0.14, cargoD * 0.86, bx, by + b.h + 0.05, cargoZ, propMats.darkSteel);
  batch.addCyl(0.46, 0.50, 0.18, 10, bx, by + b.h + 0.14, cargoZ, propMats.darkSteel);
  // Side armored viewport slits
  for (const sz of [-0.9, 0, 0.9]) {
    batch.addBox(b.w * 0.99, 0.22, 0.44, bx, by + 1.82, cargoZ + sz, propMats.glassCab);
  }

  // Front Armored Cab + Sloped Engine Hood + Radiator Grille + Bullbar Bumper
  const cabD = b.d * 0.24;
  const cabH = b.h - 0.80;
  const cabZ = bz + dirZ * (b.d * 0.22);
  batch.addBox(b.w * 0.92, cabH, cabD, bx, by + 0.68 + cabH * 0.5, cabZ, armorMat);
  const hoodZ = bz + dirZ * (b.d * 0.40);
  batch.addBox(b.w * 0.88, 0.76, b.d * 0.16, bx, by + 1.06, hoodZ, armorMat);
  batch.addBox(b.w * 0.66, 0.48, 0.08, bx, by + 1.06, bz + dirZ * (b.d * 0.485), propMats.galvSteel);

  // Ballistic Split Windshield + Side Mirrors + Heavy Bullbar + LED Headlights & Taillights
  batch.addBox(b.w * 0.82, 0.50, 0.08, bx, by + 1.76, bz + dirZ * (b.d * 0.34), propMats.glassCab, dirZ * -0.18, 0, 0);
  batch.addBox(b.w * 1.08, 0.32, 0.12, bx, by + 1.72, bz + dirZ * (b.d * 0.30), propMats.darkSteel);
  batch.addBox(b.w * 0.98, 0.42, 0.22, bx, by + 0.58, bz + dirZ * (b.d * 0.49), propMats.darkSteel);
  for (const sx of [-1, 1]) {
    batch.addBox(0.28, 0.14, 0.06, bx + sx * (b.w * 0.34), by + 0.96, bz + dirZ * (b.d * 0.485), propMats.glowWhite, 0, 0, 0, false);
    batch.addBox(0.24, 0.14, 0.06, bx + sx * (b.w * 0.36), by + 0.92, bz - dirZ * (b.d * 0.485), propMats.glowRed, 0, 0, 0, false);
  }
  const sirenMat = b.mat === 'container_blue' ? propMats.glowCyan : propMats.glowRed;
  batch.addBox(1.15, 0.12, 0.22, bx, by + b.h - 0.06, cabZ, sirenMat, 0, 0, 0, false);

  // 6 Heavy Off-Road Tires + Steel Rims + Wheel Axle Hubs
  for (const wz of [-b.d * 0.34, -b.d * 0.08, b.d * 0.32]) {
    for (const side of [-1, 1]) {
      const wx = bx + side * (b.w * 0.46);
      batch.addCyl(0.46, 0.46, 0.34, 14, wx, by + 0.46, bz + wz, propMats.tireRubber, 0, 0, Math.PI / 2);
      batch.addCyl(0.25, 0.25, 0.36, 10, wx, by + 0.46, bz + wz, propMats.galvSteel, 0, 0, Math.PI / 2);
    }
  }
}

// Emit 3D ISO Shipping Container with Corrugated Ribs, Corner Castings & 4 Locking Door Rods
function emitShippingContainer(batch, b) {
  const cy = b.y + b.h * 0.5;
  const hw = b.w * 0.5;
  const hh = b.h * 0.5;
  const hd = b.d * 0.5;
  const mainMat = getMapMaterial(b.mat);

  batch.addBox(b.w, b.h, b.d, b.x, cy, b.z, mainMat);

  // 4 Vertical Corner Posts + 8 ISO Corner Castings + Top/Bottom Sill Beams
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.addBox(0.18, b.h + 0.02, 0.18, b.x + sx * (hw - 0.06), cy, b.z + sz * (hd - 0.06), propMats.darkSteel);
      batch.addBox(0.22, 0.22, 0.22, b.x + sx * (hw - 0.06), b.y + b.h - 0.08, b.z + sz * (hd - 0.06), propMats.galvSteel);
    }
  }
  batch.addBox(b.w + 0.04, 0.14, b.d + 0.04, b.x, b.y + b.h - 0.06, b.z, propMats.darkSteel);
  batch.addBox(b.w + 0.04, 0.12, b.d + 0.04, b.x, b.y + 0.06, b.z, propMats.darkSteel);

  // 3D Corrugated Side Ribs + Double Door Locking Bars & Latches
  const isLongZ = b.d >= b.w;
  if (isLongZ) {
    const ribSteps = Math.max(4, Math.floor((b.d - 0.8) / 0.75));
    for (let i = 0; i <= ribSteps; i++) {
      const rz = b.z - (b.d * 0.42) + (i / ribSteps) * (b.d * 0.84);
      batch.addBox(b.w + 0.05, b.h * 0.82, 0.12, b.x, cy, rz, mainMat);
    }
    for (const sz of [-1, 1]) {
      for (const bx of [-0.55, -0.18, 0.18, 0.55]) {
        batch.addCyl(0.024, 0.024, b.h * 0.88, 6, b.x + bx, cy, b.z + sz * (hd + 0.028), propMats.galvSteel);
        batch.addBox(0.11, 0.05, 0.06, b.x + bx, b.y + b.h * 0.38, b.z + sz * (hd + 0.04), propMats.darkSteel);
      }
    }
  } else {
    const ribSteps = Math.max(4, Math.floor((b.w - 0.8) / 0.75));
    for (let i = 0; i <= ribSteps; i++) {
      const rx = b.x - (b.w * 0.42) + (i / ribSteps) * (b.w * 0.84);
      batch.addBox(0.12, b.h * 0.82, b.d + 0.05, rx, cy, b.z, mainMat);
    }
    for (const sx of [-1, 1]) {
      for (const bz of [-0.55, -0.18, 0.18, 0.55]) {
        batch.addCyl(0.024, 0.024, b.h * 0.88, 6, b.x + sx * (hw + 0.028), cy, b.z + bz, propMats.galvSteel);
        batch.addBox(0.06, 0.05, 0.11, b.x + sx * (hw + 0.04), b.y + b.h * 0.38, b.z + bz, propMats.darkSteel);
      }
    }
  }
}

// Emit 3D Military & Wooden Cargo Crates with Timber Exoskeleton, Diagonal Braces & Steel Bumpers
function emitSupplyCrate(batch, b, isMetal) {
  const cy = b.y + b.h * 0.5;
  const hw = b.w * 0.5;
  const hh = b.h * 0.5;
  const hd = b.d * 0.5;
  batch.addBox(b.w, b.h, b.d, b.x, cy, b.z, getMapMaterial(b.mat));

  if (isMetal) {
    batch.addBox(b.w + 0.08, 0.14, b.d + 0.08, b.x, b.y + b.h - 0.06, b.z, propMats.darkSteel);
    batch.addBox(b.w + 0.08, 0.14, b.d + 0.08, b.x, b.y + 0.06, b.z, propMats.darkSteel);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        batch.addBox(0.14, b.h + 0.02, 0.14, b.x + sx * (hw - 0.03), cy, b.z + sz * (hd - 0.03), propMats.galvSteel);
      }
    }
    batch.addBox(b.w * 0.45, 0.045, b.d + 0.07, b.x, b.y + b.h - 0.18, b.z, propMats.glowAmber, 0, 0, 0, false);
  } else {
    batch.addBox(b.w + 0.06, 0.11, b.d + 0.06, b.x, b.y + b.h - 0.055, b.z, propMats.woodFrame);
    batch.addBox(b.w + 0.06, 0.11, b.d + 0.06, b.x, b.y + 0.055, b.z, propMats.woodFrame);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        batch.addBox(0.13, b.h, 0.13, b.x + sx * (hw - 0.03), cy, b.z + sz * (hd - 0.03), propMats.woodFrame);
        batch.addBox(0.16, 0.16, 0.16, b.x + sx * (hw - 0.02), b.y + b.h - 0.06, b.z + sz * (hd - 0.02), propMats.darkSteel);
      }
    }
    // 3D Diagonal Timber Braces on front/back faces
    const diagLen = Math.hypot(b.w * 0.82, b.h * 0.82);
    const diagAng = Math.atan2(b.h, b.w);
    batch.addBox(diagLen, 0.09, b.d + 0.04, b.x, cy, b.z, propMats.woodFrame, 0, 0, diagAng);
  }
}

// Emit 3D Elevated Sniper Decks & Catwalks with Perimeter I-Beams, Support Pillars & Hazard Trim
function emitMetalDeck(batch, b) {
  const cy = b.y + b.h * 0.5;
  const hw = b.w * 0.5;
  const hd = b.d * 0.5;
  batch.addBox(b.w, b.h, b.d, b.x, cy, b.z, getMapMaterial(b.mat));
  batch.addBox(b.w + 0.10, 0.24, b.d + 0.10, b.x, b.y + b.h - 0.11, b.z, propMats.darkSteel);
  batch.addBox(b.w + 0.12, 0.07, b.d + 0.12, b.x, b.y + b.h - 0.23, b.z, propMats.hazardYellow);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.addBox(0.28, b.h + 0.24, 0.28, b.x + sx * (hw - 0.16), cy + 0.10, b.z + sz * (hd - 0.16), propMats.darkSteel);
    }
  }
}

// Emit 3D Modern Multi-Story Buildings with Recessed 3D Windows, Pilasters, Rooftop HVAC, Comms Mast & Neon Signs
function emitBuilding(batch, b, mapId) {
  const cy = b.y + b.h * 0.5;
  const hw = b.w * 0.5;
  const hd = b.d * 0.5;
  const topY = b.y + b.h;
  batch.addBox(b.w, b.h, b.d, b.x, cy, b.z, getMapMaterial(b.mat), 0, 0, 0, true, 5.0);

  // Overhanging Roof Parapet Cornice, Mid Floor Belt & Ground Plinth
  batch.addBox(b.w + 0.28, 0.38, b.d + 0.28, b.x, topY + 0.12, b.z, propMats.darkSteel);
  batch.addBox(b.w + 0.20, 0.46, b.d + 0.20, b.x, b.y + 0.23, b.z, propMats.darkSteel);
  if (b.h >= 5.5) {
    batch.addBox(b.w + 0.16, 0.22, b.d + 0.16, b.x, b.y + b.h * 0.52, b.z, propMats.darkSteel);
  }
  // 4 Vertical Corner Structural Pilasters
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.addBox(0.36, b.h + 0.1, 0.36, b.x + sx * (hw - 0.08), cy, b.z + sz * (hd - 0.08), propMats.darkSteel);
    }
  }

  // 3D Projecting Window Sills, AC Split Units & Storefront Canopy on large buildings
  if (b.h >= 5.5 && b.w >= 7 && b.d >= 7) {
    for (const fy of [b.y + 2.2, b.y + 4.8]) {
      if (fy + 1.0 > topY) continue;
      for (const wxOff of [-b.w * 0.24, b.w * 0.24]) {
        batch.addBox(1.5, 0.14, b.d + 0.18, b.x + wxOff, fy - 0.65, b.z, propMats.galvSteel);
        batch.addBox(1.3, 1.15, b.d + 0.08, b.x + wxOff, fy, b.z, propMats.glassCab);
      }
      for (const wzOff of [-b.d * 0.24, b.d * 0.24]) {
        batch.addBox(b.w + 0.18, 0.14, 1.5, b.x, fy - 0.65, b.z + wzOff, propMats.galvSteel);
        batch.addBox(b.w + 0.08, 1.15, 1.3, b.x, fy, b.z + wzOff, propMats.glassCab);
      }
    }
    // Rooftop HVAC Chiller Unit + Exhaust Duct + Cellular Radio Mast
    batch.addBox(2.4, 1.15, 2.2, b.x + b.w * 0.18, topY + 0.58, b.z - b.d * 0.15, propMats.galvSteel);
    batch.addCyl(0.65, 0.65, 1.22, 10, b.x + b.w * 0.18, topY + 0.60, b.z - b.d * 0.15, propMats.darkSteel);
    batch.addCyl(0.06, 0.09, 3.2, 8, b.x - b.w * 0.25, topY + 1.6, b.z + b.d * 0.22, propMats.galvSteel);
    batch.addBox(0.18, 0.18, 0.18, b.x - b.w * 0.25, topY + 3.25, b.z + b.d * 0.22, propMats.glowRed, 0, 0, 0, false);
  }

  if (mapId === 'urban_city' && b.h >= 6.0) {
    const isBlue = b.mat === 'building_glass';
    const neonMat = isBlue ? propMats.glowCyan : propMats.glowAmber;
    batch.addBox(b.w + 0.16, 0.18, b.d + 0.16, b.x, topY - 0.65, b.z, neonMat, 0, 0, 0, false);
  }
}

// Emit 3D Industrial Forklift + Pallet / Oil Drums (for Warehouse & Port bays)
function emitForklift(batch, x, y, z, yaw = 0) {
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const pt = (lx, ly, lz) => [x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos];

  // Counterweight body & cab cage
  const [bx, by, bz] = pt(0, 0.62, -0.35);
  batch.addBox(1.15, 0.86, 1.55, bx, by, bz, propMats.hazardYellow, 0, yaw, 0);
  const [cx, cy, cz] = pt(0, 1.48, -0.25);
  batch.addBox(1.08, 0.08, 1.35, cx, cy, cz, propMats.darkSteel, 0, yaw, 0);
  for (const sx of [-0.48, 0.48]) {
    for (const sz of [-0.82, 0.32]) {
      const [px, py, pz] = pt(sx, 1.05, sz);
      batch.addBox(0.07, 0.85, 0.07, px, py, pz, propMats.darkSteel, 0, yaw, 0);
    }
  }
  // Dual Hydraulic Mast Rails & Steel Forks
  for (const sx of [-0.36, 0.36]) {
    const [mx, my, mz] = pt(sx, 1.15, 0.52);
    batch.addBox(0.10, 2.1, 0.12, mx, my, mz, propMats.darkSteel, 0, yaw, 0);
    const [fx, fy, fz] = pt(sx * 0.82, 0.12, 1.05);
    batch.addBox(0.12, 0.05, 1.05, fx, fy, fz, propMats.galvSteel, 0, yaw, 0);
  }
  // 4 Solid Industrial Tires
  for (const sx of [-0.56, 0.56]) {
    for (const sz of [-0.85, 0.25]) {
      const [wx, wy, wz] = pt(sx, 0.26, sz);
      batch.addCyl(0.26, 0.26, 0.22, 10, wx, wy, wz, propMats.tireRubber, 0, yaw, Math.PI / 2);
    }
  }
}

function emitOilDrumCluster(batch, x, y, z) {
  const offsets = [[-0.36, -0.32, propMats.oilDrumRed], [0.36, -0.28, propMats.oilDrumBlue], [0.0, 0.34, propMats.hazardYellow]];
  batch.addBox(1.45, 0.12, 1.45, x, y + 0.06, z, propMats.woodFrame); // Wooden shipping pallet
  for (const [ox, oz, mat] of offsets) {
    batch.addCyl(0.30, 0.30, 0.96, 12, x + ox, y + 0.60, z + oz, mat);
    batch.addCyl(0.312, 0.312, 0.05, 12, x + ox, y + 0.42, z + oz, propMats.darkSteel);
    batch.addCyl(0.312, 0.312, 0.05, 12, x + ox, y + 0.78, z + oz, propMats.darkSteel);
  }
}

function emitStreetLamp(batch, x, y, z, armDirX = 1) {
  batch.addCyl(0.18, 0.24, 0.55, 8, x, y + 0.275, z, propMats.darkSteel);
  batch.addCyl(0.07, 0.11, 6.2, 8, x, y + 3.3, z, propMats.galvSteel);
  batch.addBox(1.6, 0.09, 0.12, x + armDirX * 0.75, y + 6.35, z, propMats.galvSteel);
  batch.addBox(0.55, 0.08, 0.26, x + armDirX * 1.42, y + 6.28, z, propMats.glowWhite, 0, 0, 0, false);
}

// 3D Twin-Turbine Military Transport Helicopter (Black Hawk UH-60) hovering over Helipad
function createBlackHawkHeliGroup(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = -0.38;

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.75, 6.4), propMats.oliveArmor);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.25, 1.8), propMats.oliveArmor);
  nose.position.set(0, -0.20, -3.9);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.72, 1.3), propMats.glassCab);
  windshield.position.set(0, 0.32, -3.55);
  windshield.rotation.x = 0.28;
  const enginePod = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.68, 3.2), propMats.darkSteel);
  enginePod.position.set(0, 1.12, -0.2);
  const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.82, 5.2), propMats.oliveArmor);
  tailBoom.position.set(0, 0.32, 5.4);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.95, 1.35), propMats.oliveArmor);
  tailFin.position.set(0, 1.25, 7.65);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.16, 0.75), propMats.darkSteel);
  stab.position.set(0, 0.38, 7.5);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), propMats.glowRed);
  beacon.position.set(0, 2.3, 7.65);
  // Landing gear sponsons & wheels
  for (const sx of [-1.35, 1.35]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 1.2), propMats.darkSteel);
    strut.position.set(sx, -0.72, -0.5);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10), propMats.tireRubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, -1.02, -0.5);
    g.add(strut, wheel);
  }

  // Spinning 4-Blade Main Rotor
  const rotorPivot = new THREE.Group();
  rotorPivot.position.set(0, 1.68, -0.2);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.35, 10), propMats.darkSteel);
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.06, 0.36), propMats.darkSteel);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 11.6), propMats.darkSteel);
  const tips = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.07, 0.14), propMats.hazardYellow);
  rotorPivot.add(hub, b1, b2, tips);

  g.add(hull, nose, windshield, enginePod, tailBoom, tailFin, stab, beacon, rotorPivot);
  return { heliGroup: g, rotorPivot };
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
    const terrainMat = new THREE.MeshLambertMaterial({
      vertexColors: true
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
      const trunkMat = new THREE.MeshLambertMaterial({ color: '#5c3c1e' });

      const leafGeo = new THREE.ConeGeometry(1.85, 5.2, 7);
      leafGeo.translate(0, 4.6, 0);
      const leafMat = new THREE.MeshLambertMaterial({ color: '#166534' });

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
      const rockMat = new THREE.MeshLambertMaterial({ color: '#64748b' });

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
      const trunkMat = new THREE.MeshLambertMaterial({ color: '#4a3219' });
      const trunksMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, mapData.trees.length);

      const canopyLowGeo = new THREE.ConeGeometry(2.35, 3.6, 9);
      canopyLowGeo.translate(0, 4.4, 0);
      const canopyLowMat = new THREE.MeshLambertMaterial({ color: '#14532d' });
      const canopyLowMesh = new THREE.InstancedMesh(canopyLowGeo, canopyLowMat, mapData.trees.length);

      const canopyTopGeo = new THREE.ConeGeometry(1.65, 3.2, 9);
      canopyTopGeo.translate(0, 6.2, 0);
      const canopyTopMat = new THREE.MeshLambertMaterial({ color: '#166534' });
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

  // 4. Arena & Open-World Blocks + Realistic Modern-FPS 3D Models (100% Batched by Material -> ~18 Draw Calls!)
  if (isOpenWorld) {
    const sectorCollectors = new Map(); // sectorKey -> MapBatchCollector

    for (const b of mapData.blocks) {
      if (b.noVisual) continue;
      const { key } = getSectorGrp(b.x, b.z);
      let col = sectorCollectors.get(key);
      if (!col) {
        col = new MapBatchCollector();
        sectorCollectors.set(key, col);
      }

      if (b.mat === 'sandbag') {
        emitSandbagWall(col, b);
        continue;
      }

      const tileSize = tiledMaterials.has(b.mat) ? 5.0 : 0;
      col.addBox(b.w, b.h, b.d, b.x, b.y + b.h * 0.5, b.z, getMapMaterial(b.mat), 0, 0, 0, true, tileSize);
    }

    for (const [key, col] of sectorCollectors.entries()) {
      const grp = sectorGroupsMap.get(key) || worldGroup;
      col.flush(grp, castShadows);
    }
  } else {
    const arenaBatch = new MapBatchCollector();

    for (const b of mapData.blocks) {
      if (b.noVisual) continue;

      if (b.mat === 'sandbag') {
        emitSandbagWall(arenaBatch, b);
        continue;
      }

      if (mapData.id === 'urban_city' && (b.mat === 'container_blue' || b.mat === 'container_red') && Math.abs(b.d - 6.2) < 0.2) {
        emitArmoredTruck(arenaBatch, b);
        continue;
      }

      if (b.mat && b.mat.startsWith('container_')) {
        emitShippingContainer(arenaBatch, b);
      } else if (b.mat === 'crate_wood') {
        emitSupplyCrate(arenaBatch, b, false);
      } else if (b.mat === 'crate_metal') {
        emitSupplyCrate(arenaBatch, b, true);
      } else if (b.mat === 'metal_deck') {
        emitMetalDeck(arenaBatch, b);
      } else if (b.mat === 'building_brick' || b.mat === 'building_glass') {
        emitBuilding(arenaBatch, b, mapData.id);
      } else {
        const tileSize = tiledMaterials.has(b.mat) ? 5.0 : 0;
        arenaBatch.addBox(b.w, b.h, b.d, b.x, b.y + b.h * 0.5, b.z, getMapMaterial(b.mat || 'concrete'), 0, 0, 0, !b.isBoundary, tileSize);
        if (b.isBoundary) {
          arenaBatch.addBox(b.w + 0.14, 0.36, b.d + 0.26, b.x, b.y + b.h, b.z, propMats.darkSteel, 0, 0, 0, false);
        }
      }
    }

    // 5. Map-Specific Modern FPS Hero 3D Models & Landmarks (All Static Geometry Batched = 0 Extra Draw Calls!)
    if (mapData.id === 'warehouse') {
      // Steel Perimeter H-Beam Columns, Overhead Roof Truss Bracing & Industrial Wall Piping
      for (const bz of [-26, -20, -13, -7, 0, 7, 13, 20, 26]) {
        for (const sx of [-1, 1]) {
          arenaBatch.addBox(0.45, 8.8, 0.45, sx * 23.6, 4.4, bz, propMats.darkSteel);
          arenaBatch.addBox(0.55, 0.35, 0.55, sx * 23.6, 0.18, bz, propMats.hazardYellow);
        }
      }
      // High-bay wall ventilation ducts & high-pressure red/steel pipe conduits (y=4.8..6.4m)
      for (const sx of [-1, 1]) {
        arenaBatch.addCyl(0.14, 0.14, 64, 8, sx * 23.4, 5.4, 0, propMats.oilDrumRed, Math.PI / 2, 0, 0, false);
        arenaBatch.addCyl(0.18, 0.18, 64, 8, sx * 23.35, 6.1, 0, propMats.galvSteel, Math.PI / 2, 0, 0, false);
      }
      // 16 Hanging High-Bay Industrial LED Lamps along the 4 overhead steel beams
      for (const bz of [-20, -7, 7, 20]) {
        for (const bx of [-15, -5, 5, 15]) {
          arenaBatch.addCyl(0.32, 0.46, 0.26, 8, bx, 7.62, bz, propMats.darkSteel, 0, 0, 0, false);
          arenaBatch.addBox(0.68, 0.06, 0.68, bx, 7.48, bz, propMats.glowWhite, 0, 0, 0, false);
        }
      }
      // 3D Industrial Forklifts & Palletized Hazard Oil Drum Clusters in safe perimeter bays
      emitForklift(arenaBatch, -21.2, 0, -19.5, 0.25);
      emitForklift(arenaBatch, 21.2, 0, 19.5, Math.PI + 0.25);
      emitOilDrumCluster(arenaBatch, -21.8, 0, 18.8);
      emitOilDrumCluster(arenaBatch, 21.8, 0, -18.8);
      emitOilDrumCluster(arenaBatch, -14.5, 0, -4.8);
      emitOilDrumCluster(arenaBatch, 14.5, 0, 4.8);

      // Animated Overhead Gantry Crane Trolley on the z = -7 beam
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
      // 1. 3D Steel Watchtower Roof Canopies, Support Posts & Searchlights on North (-24,-20) & South (24,20) Watchtowers
      for (const [wx, wz, dir] of [[-24, -20, 1], [24, 20, -1]]) {
        for (const sx of [-2.8, 2.8]) {
          for (const sz of [-2.8, 2.8]) {
            arenaBatch.addBox(0.24, 3.2, 0.24, wx + sx, 5.0, wz + sz, propMats.darkSteel);
          }
        }
        arenaBatch.addBox(7.2, 0.28, 7.2, wx, 6.65, wz, propMats.darkSteel);
        arenaBatch.addBox(6.4, 0.35, 6.4, wx, 6.92, wz, propMats.oliveArmor);
        arenaBatch.addCyl(0.05, 0.08, 2.4, 6, wx - dir * 2.4, 8.1, wz - dir * 2.4, propMats.galvSteel);
        arenaBatch.addBox(0.18, 0.18, 0.18, wx - dir * 2.4, 9.35, wz - dir * 2.4, propMats.glowRed, 0, 0, 0, false);
        arenaBatch.addBox(0.45, 0.32, 0.35, wx, 6.42, wz + dir * 3.1, propMats.glowWhite, 0, 0, 0, false);
      }

      // 2. 3D Cylindrical Fuel Depot Storage Silos & Piping Manifold atop/beside East Fuel Bunker (x=32, z=2)
      for (const fz of [-1.2, 2.0, 5.2]) {
        arenaBatch.addCyl(1.35, 1.35, 3.8, 14, 32.0, 5.1, fz, propMats.fuelTankWhite);
        arenaBatch.addCyl(1.38, 1.38, 0.28, 14, 32.0, 5.2, fz, propMats.hazardYellow);
        arenaBatch.addCyl(0.24, 0.28, 0.45, 8, 32.0, 7.15, fz, propMats.darkSteel);
      }
      arenaBatch.addCyl(0.14, 0.14, 7.5, 8, 30.5, 4.2, 2.0, propMats.oilDrumRed, Math.PI / 2, 0, 0);
      emitOilDrumCluster(arenaBatch, 28.6, 0, -4.2);
      emitOilDrumCluster(arenaBatch, -31.5, 0, -8.2);

      // 3. West Armory Hangar Steel Roof Trusses & High-Bay Lighting (x=-26, y=4.5, z=0)
      for (const hz of [-7.5, -2.5, 2.5, 7.5]) {
        arenaBatch.addBox(15.2, 0.32, 0.38, -26.0, 4.32, hz, propMats.darkSteel);
        arenaBatch.addBox(1.1, 0.08, 0.42, -26.0, 4.14, hz, propMats.glowAmber, 0, 0, 0, false);
      }

      // 4. 3D Black Hawk UH-60 Military Transport Helicopter in Tactical Overwatch above Helipad (Site A)
      const { heliGroup, rotorPivot } = createBlackHawkHeliGroup(27.5, 7.6, 0.5);
      worldGroup.add(heliGroup);
      animatedProps.push({ type: 'spin_y', mesh: rotorPivot, speed: 14.5 });

      // 5. Giant Rotating 3D Radar Dish & Antenna Array atop Central Command Bunker (x=0, y=5.6, z=0)
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

      const helipad = makeHelipadDecal();
      helipad.rotation.x = -Math.PI / 2;
      helipad.position.set(25.5, 0.02, 0.5);
      worldGroup.add(helipad);
    } else if (mapData.id === 'urban_city') {
      // 1. 3D Downtown LED Streetlamps along avenues & plaza corners
      for (const [lx, lz, dirX] of [
        [-11.5, -26, 1], [11.5, -26, -1],
        [-11.5, 26, 1], [11.5, 26, -1],
        [-29.5, -16, 1], [-29.5, 16, 1],
        [29.5, -16, -1], [29.5, 16, -1]
      ]) {
        emitStreetLamp(arenaBatch, lx, 0, lz, dirX);
      }

      // 2. 3D Metro Station Glass & Steel Entrance Canopy Arch at Bomb Site A (Ga Tàu Điện, x=28, z=0)
      arenaBatch.addBox(0.32, 3.8, 0.32, 27.8, 1.9, -3.2, propMats.darkSteel);
      arenaBatch.addBox(0.32, 3.8, 0.32, 27.8, 1.9, 3.2, propMats.darkSteel);
      arenaBatch.addBox(3.4, 0.28, 7.2, 28.6, 3.9, 0, propMats.darkSteel);
      arenaBatch.addBox(3.0, 0.12, 6.6, 28.6, 4.06, 0, propMats.glassCab);
      arenaBatch.addBox(0.18, 0.42, 5.4, 27.0, 3.95, 0, propMats.glowCyan, 0, 0, 0, false);

      // 3. Sniper Balcony Steel Handrail Posts & Top Rails on NW (-8.65, -14) & SE (8.65, 14) balconies
      for (const [bx, bz] of [[-8.65, -14], [8.65, 14]]) {
        arenaBatch.addBox(0.14, 0.08, 9.6, bx, 4.10, bz, propMats.galvSteel);
        for (const sz of [-4.4, -2.2, 0, 2.2, 4.4]) {
          arenaBatch.addBox(0.16, 1.12, 0.16, bx, 3.55, bz + sz, propMats.darkSteel);
        }
      }

      // 4. Central Plaza Monument Golden Trim & Rotating Holographic Tactical Globe
      arenaBatch.addBox(7.9, 0.18, 7.9, 0, 0.96, 0, propMats.darkSteel);
      arenaBatch.addBox(3.45, 0.24, 3.45, 0, 4.72, 0, propMats.hazardYellow);

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
      // 1. Ancient Carved Temple Stone Archways, Stepped Pillar Capitals & 4 Flaming Stone Braziers atop Central Temple (x=0, z=0)
      const stoneMat = getMapMaterial('jungle_stone');
      arenaBatch.addBox(9.8, 0.58, 1.35, 0, 6.25, -4.2, stoneMat);
      arenaBatch.addBox(9.8, 0.58, 1.35, 0, 6.25, 4.2, stoneMat);
      arenaBatch.addBox(1.35, 0.58, 9.8, -4.2, 6.25, 0, stoneMat);
      arenaBatch.addBox(1.35, 0.58, 9.8, 4.2, 6.25, 0, stoneMat);
      arenaBatch.addBox(7.4, 0.45, 7.4, 0, 6.72, 0, stoneMat);

      for (const sx of [-4.2, 4.2]) {
        for (const sz of [-4.2, 4.2]) {
          // Stepped temple pillar base & capital + Flaming Stone Brazier atop each corner!
          arenaBatch.addBox(1.85, 0.35, 1.85, sx, 2.38, sz, stoneMat);
          arenaBatch.addBox(1.85, 0.35, 1.85, sx, 5.88, sz, stoneMat);
          arenaBatch.addCyl(0.55, 0.36, 0.42, 8, sx, 6.75, sz, propMats.darkSteel);
          arenaBatch.addCyl(0.08, 0.38, 0.65, 7, sx, 7.22, sz, propMats.glowAmber, 0, 0, 0, false);
        }
      }

      // 2. Recon Communications Dish & Field Generator at East Research Bunker (x=22, y=2.4, z=0)
      arenaBatch.addCyl(0.25, 0.35, 1.1, 8, 24.4, 2.95, -2.0, propMats.darkSteel);
      arenaBatch.addCyl(0.95, 0.20, 0.38, 10, 24.4, 3.75, -2.0, propMats.galvSteel, 0.45, -0.6, 0);
      emitOilDrumCluster(arenaBatch, -27.5, 0, -3.5);

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

    // Flush ALL static arena architecture, containers, crates, buildings, vehicles & hero props in ~18 merged draw calls!
    arenaBatch.flush(worldGroup, castShadows);
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

const lootTemplateCache = new Map();

export function createLootCrateMesh(crateOrType = 'medkit') {
  const isObj = crateOrType && typeof crateOrType === 'object';
  const kind = isObj ? (crateOrType.kind || crateOrType.type || 'medkit') : crateOrType;
  const weaponId = isObj ? crateOrType.weaponId : null;
  const tier = isObj ? (crateOrType.tier || 1) : 1;
  const cacheKey = `${kind}_${weaponId || ''}_${tier}`;

  let template = lootTemplateCache.get(cacheKey);
  if (!template) {
    template = buildLootCrateTemplate(kind, weaponId, tier);
    lootTemplateCache.set(cacheKey, template);
  }
  const cloned = template.clone(true);
  cloned.userData.crateInfo = isObj ? crateOrType : { kind, ...(weaponId ? { weaponId } : {}) };
  return cloned;
}

function buildLootCrateTemplate(kind, weaponId, tier) {
  if (kind === 'deathbox') {
    const g = new THREE.Group();
    const coffin = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.52, 0.72), propMats.woodFrame);
    coffin.position.y = 0.26;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.10, 0.78), propMats.darkSteel);
    lid.position.y = 0.54;
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.80), propMats.hazardYellow);
    tag.position.y = 0.34;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.22, 4.5, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = 2.4;
    g.add(coffin, lid, tag, beam);
    return g;
  }

  if (kind === 'weapon' && weaponId) {
    const isElite = ['awp', 'barrett', 'm249', 'scarh', 'm200', 'pkm', 'mg3', 'mcx', 'groza', 'm24', 'mk14'].includes(weaponId);
    const ringColor = isElite ? '#f59e0b' : '#38bdf8';
    const g = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.035, 8, 20),
      new THREE.MeshBasicMaterial({ color: ringColor })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.44, 0.04, 14),
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

  const basePad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.07, 12), propMats.darkSteel);
  basePad.position.y = 0.035;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.56), propMats.darkSteel);
  box.position.y = 0.22;

  const glowMat = new THREE.MeshBasicMaterial({ color });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.08, 0.60), glowMat);
  trim.position.y = 0.22;

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
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), glowMat);
    holoGroup.add(dome);
  } else if (kind === 'bag') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.16), glowMat);
    holoGroup.add(pack);
  } else if (kind === 'grenade') {
    const gr = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat);
    holoGroup.add(gr);
  } else {
    for (const bx of [-0.08, 0, 0.08]) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.24, 6), glowMat);
      round.position.x = bx;
      holoGroup.add(round);
    }
  }

  g.add(basePad, box, trim, holoGroup);
  return g;
}
