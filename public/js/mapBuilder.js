// AAA-Grade 3D Arena & Open-World Builder: Universal Geometry Batcher + Realistic Sculpted Organic Nature & Architecture
// (Multi-Species Instanced Trees, Stratified Rocks, Gable-Roof Houses, Truss Bridges, Hangars, Forklifts, Black Hawk, MRAPs, Containers & Ruins)
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { getMapMaterial, getSkyDomeTexture, getTerrainDetailTexture } from './textures.js';
import { createC4Mesh, createWeaponModel } from './models.js';

const propMats = {
  darkSteel: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.38, metalness: 0.78 }),
  galvSteel: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.32, metalness: 0.85 }),
  oliveArmor: new THREE.MeshStandardMaterial({ color: '#364532', roughness: 0.52, metalness: 0.42 }),
  navyArmor: new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.42, metalness: 0.58 }),
  crimsonArmor: new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.42, metalness: 0.58 }),
  woodFrame: new THREE.MeshStandardMaterial({ color: '#5c3c1e', roughness: 0.80, metalness: 0.08 }),
  windowWood: new THREE.MeshStandardMaterial({ color: '#3b281c', roughness: 0.82, metalness: 0.05 }),
  shutterGreen: new THREE.MeshStandardMaterial({ color: '#2f4b3c', roughness: 0.78, metalness: 0.06 }),
  shutterBlue: new THREE.MeshStandardMaterial({ color: '#34495e', roughness: 0.78, metalness: 0.06 }),
  concreteTrim: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.84, metalness: 0.06 }),
  brickChimney: new THREE.MeshStandardMaterial({ color: '#7c3a2d', roughness: 0.86, metalness: 0.04 }),
  roofRidge: new THREE.MeshStandardMaterial({ color: '#3b241c', roughness: 0.76, metalness: 0.14 }),
  awningRed: new THREE.MeshStandardMaterial({ color: '#8c2d23', roughness: 0.86, metalness: 0.04 }),
  awningBlue: new THREE.MeshStandardMaterial({ color: '#1e466e', roughness: 0.86, metalness: 0.04 }),
  vineGreen: new THREE.MeshLambertMaterial({ color: '#2d5a27' }),
  hazardYellow: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.42, metalness: 0.35 }),
  fuelTankWhite: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.38, metalness: 0.52 }),
  oilDrumRed: new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.44, metalness: 0.48 }),
  oilDrumBlue: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.44, metalness: 0.48 }),
  tireRubber: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.88, metalness: 0.10 }),
  glassCab: new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.14, metalness: 0.88 }),
  glassWindowDark: new THREE.MeshStandardMaterial({ color: '#16283a', roughness: 0.16, metalness: 0.82 }),
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

  addGableTriangle(spanW, peakH, thickness, x, baseY, z, mat, rotateY = 0, castShadow = true) {
    // 3D Triangular gable end wall prism (zero gaps beneath pitched roof)
    const hw = spanW * 0.5;
    const ht = thickness * 0.5;
    const verts = new Float32Array([
      // Front face (+Z)
      -hw, 0, ht,  hw, 0, ht,  0, peakH, ht,
      // Back face (-Z)
      hw, 0, -ht,  -hw, 0, -ht,  0, peakH, -ht,
      // Left slope quad (2 tris)
      -hw, 0, -ht,  -hw, 0, ht,  0, peakH, ht,
      -hw, 0, -ht,  0, peakH, ht,  0, peakH, -ht,
      // Right slope quad (2 tris)
      hw, 0, ht,  hw, 0, -ht,  0, peakH, -ht,
      hw, 0, ht,  0, peakH, -ht,  0, peakH, ht
    ]);
    const uvs = new Float32Array([
      0, 0, spanW / 4.5, 0, spanW / 9.0, peakH / 4.5,
      0, 0, spanW / 4.5, 0, spanW / 9.0, peakH / 4.5,
      0, 0, 0.2, 0, 0.2, 1, 0, 0, 0.2, 1, 0, 1,
      0, 0, 0.2, 0, 0.2, 1, 0, 0, 0.2, 1, 0, 1
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    if (rotateY !== 0) {
      _euler.set(0, rotateY, 0);
      _quat.setFromEuler(_euler);
      _pos.set(x, baseY, z);
      _mat4.compose(_pos, _quat, _scale);
      geo.applyMatrix4(_mat4);
    } else {
      geo.translate(x, baseY, z);
    }
    this.addGeo(geo, mat, castShadow);
  }

  addGableRoof(w, roofH, d, x, baseY, z, roofMat, gableMat, alongZ = true, overhang = 0.65, castShadow = true) {
    // True pitched A-frame roof with overhanging eaves, ridge cap, fascia trim & closed gable walls
    const span = alongZ ? w : d;
    const len = alongZ ? d : w;
    const halfSpan = span * 0.5 + overhang;
    const slopeLen = Math.hypot(halfSpan, roofH);
    const angle = Math.atan2(roofH, halfSpan);
    const thick = 0.16;
    const roofLen = len + overhang * 1.4;

    if (alongZ) {
      // Ridge runs along Z; slopes fall toward -X and +X
      this.addBox(slopeLen, thick, roofLen, x - halfSpan * 0.5, baseY + roofH * 0.5, z, roofMat, 0, 0, angle, castShadow, 3.2);
      this.addBox(slopeLen, thick, roofLen, x + halfSpan * 0.5, baseY + roofH * 0.5, z, roofMat, 0, 0, -angle, castShadow, 3.2);
      // Ridge cap beam & fascia eaves
      this.addBox(0.32, 0.24, roofLen + 0.14, x, baseY + roofH + 0.08, z, propMats.roofRidge, 0, 0, 0, false);
      this.addBox(0.14, 0.22, roofLen + 0.08, x - halfSpan, baseY + 0.02, z, propMats.windowWood, 0, 0, 0, false);
      this.addBox(0.14, 0.22, roofLen + 0.08, x + halfSpan, baseY + 0.02, z, propMats.windowWood, 0, 0, 0, false);
      if (gableMat) {
        this.addGableTriangle(w - 0.08, roofH, 0.45, x, baseY, z - d * 0.5 + 0.24, gableMat, 0, castShadow);
        this.addGableTriangle(w - 0.08, roofH, 0.45, x, baseY, z + d * 0.5 - 0.24, gableMat, 0, castShadow);
      }
    } else {
      // Ridge runs along X; slopes fall toward -Z and +Z
      this.addBox(roofLen, thick, slopeLen, x, baseY + roofH * 0.5, z - halfSpan * 0.5, roofMat, -angle, 0, 0, castShadow, 3.2);
      this.addBox(roofLen, thick, slopeLen, x, baseY + roofH * 0.5, z + halfSpan * 0.5, roofMat, angle, 0, 0, castShadow, 3.2);
      this.addBox(roofLen + 0.14, 0.24, 0.32, x, baseY + roofH + 0.08, z, propMats.roofRidge, 0, 0, 0, false);
      this.addBox(roofLen + 0.08, 0.22, 0.14, x, baseY + 0.02, z - halfSpan, propMats.windowWood, 0, 0, 0, false);
      this.addBox(roofLen + 0.08, 0.22, 0.14, x, baseY + 0.02, z + halfSpan, propMats.windowWood, 0, 0, 0, false);
      if (gableMat) {
        this.addGableTriangle(d - 0.08, roofH, 0.45, x - w * 0.5 + 0.24, baseY, z, gableMat, Math.PI / 2, castShadow);
        this.addGableTriangle(d - 0.08, roofH, 0.45, x + w * 0.5 - 0.24, baseY, z, gableMat, Math.PI / 2, castShadow);
      }
    }
  }

  addHipRoof(w, roofH, d, x, baseY, z, roofMat, castShadow = true) {
    // 4-sided pyramid/hip roof for watchtowers & gazebos
    const geo = new THREE.ConeGeometry(Math.SQRT1_2, roofH, 4);
    geo.rotateY(Math.PI * 0.25);
    geo.scale(w, 1, d);
    geo.translate(x, baseY + roofH * 0.5, z);
    const uv = geo.attributes.uv;
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * (w / 2.2), uv.getY(i) * (roofH / 1.8));
      }
    }
    this.addGeo(geo, roofMat, castShadow);
  }

  addPillowSandbag(w, h, d, x, y, z, mat, ry = 0) {
    const geo = getUnitSandbagGeo().clone();
    _euler.set(0, ry, 0);
    _quat.setFromEuler(_euler);
    _pos.set(x, y, z);
    _scale.set(w, h, d);
    _mat4.compose(_pos, _quat, _scale);
    geo.applyMatrix4(_mat4);
    _scale.set(1, 1, 1);
    this.addGeo(geo, mat, false);
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

// ============================================================================
// CACHED SCULPTED ORGANIC GEOMETRY TEMPLATES (Built ONCE -> 0 Runtime Cost!)
// ============================================================================
let _unitSandbagGeo = null;
function getUnitSandbagGeo() {
  if (_unitSandbagGeo) return _unitSandbagGeo;
  const g = new THREE.SphereGeometry(0.5, 8, 5);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    // Flatten top/bottom slightly & bulge corners like a real stuffed burlap sandbag pillow
    const edgeFactor = Math.max(Math.abs(x), Math.abs(z)) * 2.0;
    y = Math.sign(y) * Math.pow(Math.abs(y) * 2.0, 0.72) * 0.5;
    x *= 1.0 + (1.0 - Math.abs(y) * 1.6) * 0.14;
    z *= 1.0 + (1.0 - Math.abs(y) * 1.6) * 0.14;
    if (edgeFactor > 0.85) y *= 0.78;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  _unitSandbagGeo = g;
  return g;
}

function normalizeColoredGeo(geo, colBot, colTop, yMin, yMax) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const keep = new Set(['position', 'normal', 'uv']);
  for (const k of Object.keys(g.attributes)) {
    if (!keep.has(k)) g.deleteAttribute(k);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  const cols = new Float32Array(pos.count * 3);
  const span = Math.max(0.001, yMax - yMin);
  const norm = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const ny = norm ? norm.getY(i) : 0;
    const t = Math.max(0, Math.min(1, (py - yMin) / span));
    // Blend vertical height AO + upward normal sunlight catch
    const sunBoost = Math.max(0, Math.min(1, t * 0.72 + (ny * 0.5 + 0.5) * 0.28));
    cols[i * 3] = colBot[0] + (colTop[0] - colBot[0]) * sunBoost;
    cols[i * 3 + 1] = colBot[1] + (colTop[1] - colBot[1]) * sunBoost;
    cols[i * 3 + 2] = colBot[2] + (colTop[2] - colBot[2]) * sunBoost;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.dispose();
  return g;
}

function mergeColorGeos(list) {
  if (list.length === 1) return list[0];
  if (BufferGeometryUtils?.mergeGeometries) {
    const merged = BufferGeometryUtils.mergeGeometries(list, false);
    for (const g of list) g.dispose();
    return merged;
  }
  return list[0];
}

const _natureTemplates = {};

function getPineTreeTemplate() {
  if (_natureTemplates.pine) return _natureTemplates.pine;
  const trunkParts = [];
  // Tapered slightly curving pine trunk
  const mainTrunk = new THREE.CylinderGeometry(0.07, 0.27, 5.6, 7, 4);
  mainTrunk.translate(0, 2.75, 0);
  const tp = mainTrunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + Math.sin(y * 0.55) * 0.08);
    tp.setZ(i, tp.getZ(i) + Math.cos(y * 0.45) * 0.05);
  }
  mainTrunk.computeVertexNormals();
  trunkParts.push(normalizeColoredGeo(mainTrunk, [0.52, 0.48, 0.44], [0.96, 0.92, 0.88], 0, 5.5));

  // 4 Buttress roots gripping the earth
  for (let r = 0; r < 4; r++) {
    const a = r * (Math.PI * 0.5) + 0.35;
    const root = new THREE.CylinderGeometry(0.06, 0.16, 0.95, 5);
    root.rotateZ(0.68);
    root.rotateY(a);
    root.translate(Math.cos(a) * 0.24, 0.22, -Math.sin(a) * 0.24);
    trunkParts.push(normalizeColoredGeo(root, [0.42, 0.38, 0.34], [0.76, 0.72, 0.66], -0.2, 0.7));
  }
  // 5 Lower woody dead/support boughs
  for (let b = 0; b < 5; b++) {
    const a = b * 1.28 + 0.4;
    const br = new THREE.CylinderGeometry(0.025, 0.065, 1.15, 5);
    br.rotateZ(1.18);
    br.rotateY(a);
    br.translate(Math.cos(a) * 0.48, 1.9 + b * 0.34, -Math.sin(a) * 0.48);
    trunkParts.push(normalizeColoredGeo(br, [0.46, 0.42, 0.38], [0.80, 0.76, 0.70], 1.5, 3.8));
  }

  // 5 Layered organic scalloped conifer bough tiers (jagged drooping needle skirts!)
  const leafParts = [];
  const tiers = [
    { y: 2.85, r: 2.25, h: 2.20, rot: 0.0 },
    { y: 4.10, r: 1.92, h: 2.05, rot: 0.68 },
    { y: 5.25, r: 1.54, h: 1.85, rot: 1.35 },
    { y: 6.28, r: 1.14, h: 1.65, rot: 2.05 },
    { y: 7.20, r: 0.72, h: 1.45, rot: 2.72 }
  ];
  for (let ti = 0; ti < tiers.length; ti++) {
    const t = tiers[ti];
    const cone = new THREE.ConeGeometry(t.r, t.h, 10, 2);
    const cp = cone.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const vx = cp.getX(i);
      const vy = cp.getY(i);
      const vz = cp.getZ(i);
      const rad = Math.hypot(vx, vz);
      if (rad > 0.05) {
        const ang = Math.atan2(vz, vx);
        // Alternating jagged pine frond tips + natural downward bough droop
        const lobe = 1.0 + Math.sin(ang * 5.0 + ti * 1.3) * 0.24 + Math.cos(ang * 3.0 - ti) * 0.12;
        const droop = (vy < 0 ? -0.26 * (lobe - 0.75) : 0);
        cp.setXYZ(i, vx * lobe, vy + droop, vz * lobe);
      }
    }
    cone.rotateY(t.rot);
    cone.translate(0, t.y, 0);
    cone.computeVertexNormals();
    leafParts.push(normalizeColoredGeo(cone, [0.40, 0.48, 0.42], [1.08, 1.12, 0.98], t.y - t.h * 0.6, t.y + t.h * 0.5));
  }

  _natureTemplates.pine = {
    trunkGeo: mergeColorGeos(trunkParts),
    foliageGeo: mergeColorGeos(leafParts)
  };
  return _natureTemplates.pine;
}

function getOakTreeTemplate() {
  if (_natureTemplates.oak) return _natureTemplates.oak;
  const trunkParts = [];
  // Sturdy slightly curved oak/rainforest trunk
  const mainTrunk = new THREE.CylinderGeometry(0.18, 0.34, 3.6, 8, 3);
  mainTrunk.translate(0, 1.75, 0);
  const tp = mainTrunk.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setX(i, tp.getX(i) + Math.sin(y * 0.7) * 0.10);
    tp.setZ(i, tp.getZ(i) + Math.cos(y * 0.55) * 0.07);
  }
  mainTrunk.computeVertexNormals();
  trunkParts.push(normalizeColoredGeo(mainTrunk, [0.48, 0.44, 0.40], [0.95, 0.90, 0.85], 0, 3.6));

  // 5 Wide flared buttress roots
  for (let r = 0; r < 5; r++) {
    const a = r * ((Math.PI * 2) / 5) + 0.2;
    const root = new THREE.CylinderGeometry(0.07, 0.20, 1.15, 5);
    root.rotateZ(0.75);
    root.rotateY(a);
    root.translate(Math.cos(a) * 0.32, 0.24, -Math.sin(a) * 0.32);
    trunkParts.push(normalizeColoredGeo(root, [0.40, 0.36, 0.32], [0.76, 0.72, 0.66], -0.2, 0.85));
  }

  // 5 Forked structural limbs reaching out to hold the lush leaf clusters
  const branches = [
    { a: 0.25, tilt: 0.62, len: 2.25, y: 2.9 },
    { a: 1.52, tilt: 0.70, len: 2.15, y: 2.75 },
    { a: 2.80, tilt: 0.58, len: 2.30, y: 3.05 },
    { a: 4.10, tilt: 0.68, len: 2.10, y: 2.80 },
    { a: 5.35, tilt: 0.52, len: 2.20, y: 3.15 }
  ];
  for (const br of branches) {
    const limb = new THREE.CylinderGeometry(0.06, 0.15, br.len, 6);
    limb.translate(0, br.len * 0.5, 0);
    limb.rotateZ(br.tilt);
    limb.rotateY(br.a);
    limb.translate(0, br.y, 0);
    trunkParts.push(normalizeColoredGeo(limb, [0.45, 0.42, 0.38], [0.85, 0.82, 0.76], 2.5, 5.2));
  }

  // 9 Sculpted organic leaf-puff clusters arranged across the crown (craggy foliage pads, NOT smooth balls!)
  const leafParts = [];
  const clusters = [
    [0.0, 5.95, 0.0, 1.85, 1.25],
    [1.45, 4.95, 0.42, 1.55, 1.05],
    [-1.42, 5.05, 0.55, 1.60, 1.08],
    [0.45, 5.10, -1.45, 1.58, 1.06],
    [-0.55, 4.85, 1.48, 1.52, 1.02],
    [1.22, 4.35, -1.05, 1.38, 0.94],
    [-1.25, 4.45, -1.02, 1.42, 0.96],
    [0.85, 5.55, 1.08, 1.35, 0.98],
    [-0.78, 5.60, -0.95, 1.32, 0.96]
  ];
  for (let ci = 0; ci < clusters.length; ci++) {
    const [cx, cy, cz, rx, ry] = clusters[ci];
    const puff = THREE.IcosahedronGeometry
      ? new THREE.IcosahedronGeometry(1.0, 1)
      : new THREE.SphereGeometry(1.0, 7, 5);
    const pp = puff.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const vx = pp.getX(i);
      const vy = pp.getY(i);
      const vz = pp.getZ(i);
      // Multi-frequency deterministic organic cragginess
      const n = 0.82 + 0.24 * Math.sin(vx * 3.7 + ci * 1.9) * Math.cos(vz * 3.3 - ci) + 0.14 * Math.sin((vx + vy + vz) * 5.2 + ci);
      const flatBot = vy < 0 ? 0.76 : 1.0;
      pp.setXYZ(i, vx * rx * n, vy * ry * n * flatBot, vz * rx * n);
    }
    puff.translate(cx, cy, cz);
    puff.computeVertexNormals();
    leafParts.push(normalizeColoredGeo(puff, [0.38, 0.48, 0.42], [1.12, 1.16, 0.96], 3.4, 7.2));
  }

  _natureTemplates.oak = {
    trunkGeo: mergeColorGeos(trunkParts),
    foliageGeo: mergeColorGeos(leafParts)
  };
  return _natureTemplates.oak;
}

function getPalmTreeTemplate() {
  if (_natureTemplates.palm) return _natureTemplates.palm;
  const trunkParts = [];
  // Gently curving segmented palm trunk (6 stacked rings)
  const segs = 6;
  const segH = 1.08;
  let px = 0, py = 0, pz = 0;
  for (let s = 0; s < segs; s++) {
    const rBot = 0.26 - s * 0.024;
    const rTop = 0.22 - s * 0.022;
    const tilt = 0.06 + s * 0.032;
    const seg = new THREE.CylinderGeometry(rTop, rBot, segH + 0.06, 7);
    seg.translate(0, segH * 0.5, 0);
    seg.rotateZ(-tilt);
    seg.translate(px, py, pz);
    trunkParts.push(normalizeColoredGeo(seg, [0.55, 0.48, 0.40], [0.95, 0.88, 0.78], py, py + segH));
    px += Math.sin(tilt) * segH;
    py += Math.cos(tilt) * segH;
  }
  // Coconut cluster tucked under crown
  for (let c = 0; c < 4; c++) {
    const a = c * (Math.PI * 0.5) + 0.4;
    const nut = new THREE.SphereGeometry(0.15, 6, 5);
    nut.translate(px + Math.cos(a) * 0.22, py - 0.16, pz + Math.sin(a) * 0.22);
    trunkParts.push(normalizeColoredGeo(nut, [0.36, 0.28, 0.18], [0.64, 0.52, 0.34], py - 0.35, py));
  }

  // 9 Arching V-folded palm fronds in 2 natural tiers
  const leafParts = [];
  const frondSpecs = [
    ...Array.from({ length: 6 }, (_, i) => ({ a: i * ((Math.PI * 2) / 6), lift: 0.42, len: 2.85, droop: 0.85 })),
    ...Array.from({ length: 3 }, (_, i) => ({ a: i * ((Math.PI * 2) / 3) + 0.52, lift: 0.82, len: 2.25, droop: 0.52 }))
  ];
  for (const f of frondSpecs) {
    // 3 arched blade segments per frond (V-creased cross section for 3D depth)
    const pts = [
      [0, 0, 0.12],
      [f.len * 0.34, f.len * 0.22 * f.lift, 0.46],
      [f.len * 0.72, f.len * 0.12 * f.lift - 0.24 * f.droop, 0.34],
      [f.len, -0.82 * f.droop, 0.03]
    ];
    const verts = [];
    const uvs = [];
    for (let s = 0; s < pts.length - 1; s++) {
      const [x0, y0, w0] = pts[s];
      const [x1, y1, w1] = pts[s + 1];
      const drop0 = -w0 * 0.24;
      const drop1 = -w1 * 0.24;
      // Left half blade (center spine -> -Z wing)
      verts.push(x0, y0, 0,  x1, y1, 0,  x1, y1 + drop1, -w1);
      verts.push(x0, y0, 0,  x1, y1 + drop1, -w1,  x0, y0 + drop0, -w0);
      // Right half blade (center spine -> +Z wing)
      verts.push(x0, y0, 0,  x1, y1 + drop1, w1,  x1, y1, 0);
      verts.push(x0, y0, 0,  x0, y0 + drop0, w0,  x1, y1 + drop1, w1);
      const u0 = s / 3, u1 = (s + 1) / 3;
      uvs.push(u0, 0.5, u1, 0.5, u1, 0,  u0, 0.5, u1, 0, u0, 0);
      uvs.push(u0, 0.5, u1, 1, u1, 0.5,  u0, 0.5, u0, 1, u1, 1);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    fg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
    fg.rotateY(f.a);
    fg.translate(px, py + 0.05, pz);
    fg.computeVertexNormals();
    leafParts.push(normalizeColoredGeo(fg, [0.46, 0.62, 0.36], [1.10, 1.18, 0.88], py - 1.1, py + 1.2));
  }

  _natureTemplates.palm = {
    trunkGeo: mergeColorGeos(trunkParts),
    foliageGeo: mergeColorGeos(leafParts)
  };
  return _natureTemplates.palm;
}

function getNaturalRockTemplate() {
  if (_natureTemplates.rock) return _natureTemplates.rock;
  const g = THREE.IcosahedronGeometry
    ? new THREE.IcosahedronGeometry(1.0, 1)
    : new THREE.BoxGeometry(1.6, 1.2, 1.6);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    // Craggy multi-harmonic geological strata displacement + flat grounded underside
    const strata = 0.82 + 0.22 * Math.sin(x * 3.1 + z * 2.4) + 0.16 * Math.cos(y * 4.5 - x * 2.7) + 0.10 * Math.sin(z * 5.2 + y * 2.1);
    x *= strata * 1.12;
    z *= strata * 1.05;
    y *= strata * 0.86;
    if (y < -0.38) y = -0.38 + (y + 0.38) * 0.25;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  _natureTemplates.rock = normalizeColoredGeo(g, [0.46, 0.48, 0.46], [1.06, 1.06, 1.02], -0.45, 0.95);
  return _natureTemplates.rock;
}

// Unified Instanced Nature Emitter: renders hundreds of realistic multi-species trees & sculpted rocks in ~2-5 draw calls!
function addInstancedNature(targetGroup, treesList, rocksList, { castTreeTrunks = false, receiveShadow = true, isDesert = false, isJungle = false } = {}) {
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();

  if (treesList?.length && THREE.InstancedMesh) {
    const byKind = { pine: [], oak: [], palm: [] };
    for (let i = 0; i < treesList.length; i++) {
      const tr = treesList[i];
      const k = tr.kind && byKind[tr.kind] ? tr.kind : 'pine';
      byKind[k].push({ tr, idx: i });
    }
    const barkMat = getMapMaterial('tree_bark');
    const pineMat = getMapMaterial('tree_foliage_pine');
    const oakMat = getMapMaterial('tree_foliage_leaf');
    const palmMat = getMapMaterial('tree_foliage_palm');

    for (const [kind, list] of Object.entries(byKind)) {
      if (!list.length) continue;
      const tpl = kind === 'oak' ? getOakTreeTemplate() : (kind === 'palm' ? getPalmTreeTemplate() : getPineTreeTemplate());
      const fMat = kind === 'oak' ? oakMat : (kind === 'palm' ? palmMat : pineMat);
      const trunksMesh = new THREE.InstancedMesh(tpl.trunkGeo, barkMat, list.length);
      const foliageMesh = new THREE.InstancedMesh(tpl.foliageGeo, fMat, list.length);

      for (let i = 0; i < list.length; i++) {
        const { tr, idx } = list[i];
        const s = tr.scale || 1;
        dummy.position.set(tr.x, tr.y || 0, tr.z);
        // Subtle natural lean & asymmetric stretch so no two trees ever look cloned!
        const leanX = (((idx * 37) % 11) - 5) * 0.012;
        const leanZ = (((idx * 53) % 11) - 5) * 0.012;
        dummy.rotation.set(leanX, ((idx * 2.17) % (Math.PI * 2)), leanZ);
        const sy = s * (0.92 + ((idx * 19) % 10) * 0.02);
        const sxz = s * (0.94 + ((idx * 29) % 8) * 0.022);
        dummy.scale.set(sxz, sy, sxz);
        dummy.updateMatrix();
        trunksMesh.setMatrixAt(i, dummy.matrix);
        foliageMesh.setMatrixAt(i, dummy.matrix);

        if (foliageMesh.setColorAt) {
          const tint = ((idx * 41) % 10) / 10;
          if (isJungle) {
            tmpColor.setRGB(0.84 + tint * 0.24, 0.94 + tint * 0.16, 0.78 + tint * 0.16);
          } else if (isDesert) {
            tmpColor.setRGB(0.96 + tint * 0.12, 0.94 + tint * 0.10, 0.72 + tint * 0.14);
          } else if (kind === 'oak') {
            tmpColor.setRGB(0.86 + tint * 0.28, 0.92 + tint * 0.16, 0.76 + tint * 0.16);
          } else {
            tmpColor.setRGB(0.82 + tint * 0.20, 0.90 + tint * 0.18, 0.84 + tint * 0.16);
          }
          foliageMesh.setColorAt(i, tmpColor);
        }
      }
      trunksMesh.instanceMatrix.needsUpdate = true;
      foliageMesh.instanceMatrix.needsUpdate = true;
      if (foliageMesh.instanceColor) foliageMesh.instanceColor.needsUpdate = true;
      trunksMesh.computeBoundingSphere?.();
      foliageMesh.computeBoundingSphere?.();
      if (castTreeTrunks) trunksMesh.castShadow = true;
      if (receiveShadow) {
        trunksMesh.receiveShadow = true;
        foliageMesh.receiveShadow = true;
      }
      targetGroup.add(trunksMesh, foliageMesh);
    }
  }

  if (rocksList?.length && THREE.InstancedMesh) {
    const rockGeo = getNaturalRockTemplate();
    const rockMat = getMapMaterial('rock_natural');
    const rocksMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocksList.length);
    for (let i = 0; i < rocksList.length; i++) {
      const rk = rocksList[i];
      dummy.position.set(rk.x, (rk.y || 0) + (rk.ry || 1) * 0.30, rk.z);
      dummy.scale.set(rk.s || 1.5, rk.ry || 1.1, (rk.s || 1.5) * (0.86 + ((i * 13) % 5) * 0.06));
      dummy.rotation.set(((i * 17) % 7 - 3) * 0.07, i * 1.37, ((i * 23) % 7 - 3) * 0.07);
      dummy.updateMatrix();
      rocksMesh.setMatrixAt(i, dummy.matrix);
      if (rocksMesh.setColorAt) {
        const v = 0.84 + ((i * 29) % 8) * 0.032;
        if (isDesert) tmpColor.setRGB(v * 1.14, v * 0.98, v * 0.78);
        else if (isJungle) tmpColor.setRGB(v * 0.84, v * 0.94, v * 0.80);
        else tmpColor.setRGB(v * 0.94, v * 0.96, v * 1.0);
        rocksMesh.setColorAt(i, tmpColor);
      }
    }
    rocksMesh.instanceMatrix.needsUpdate = true;
    if (rocksMesh.instanceColor) rocksMesh.instanceColor.needsUpdate = true;
    rocksMesh.computeBoundingSphere?.();
    // Rocks only receive shadows (no expensive shadow-pass casting)
    if (receiveShadow) rocksMesh.receiveShadow = true;
    targetGroup.add(rocksMesh);
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

// Emit Realistic Rounded Burlap Sandbag Fortification directly into batch collector (0 extra draw calls!)
function emitSandbagWall(batch, b) {
  const isWideX = b.w >= b.d;
  const length = isWideX ? b.w : b.d;
  const thickness = isWideX ? b.d : b.w;
  const rows = Math.max(3, Math.min(5, Math.round(b.h / 0.25)));
  const bagH = b.h / rows;
  const bagLen = Math.min(0.84, Math.max(0.50, length / Math.max(2, Math.round(length / 0.68))));
  const cols = Math.max(2, Math.floor(length / bagLen));
  const actualBagLen = length / cols;
  const burlapMat = getMapMaterial('sandbag');

  // Subtle recessed inner core so zero light leaks between rounded pillows
  batch.addBox(b.w * 0.74, b.h * 0.88, b.d * 0.62, b.x, b.y + b.h * 0.44, b.z, propMats.sandbagB, 0, 0, 0, false);

  for (let r = 0; r < rows; r++) {
    const yCenter = b.y + (r + 0.5) * bagH;
    const stagger = (r % 2) * 0.24;
    for (let c = 0; c < cols; c++) {
      const offsetAlong = -length * 0.5 + (c + 0.5) * actualBagLen;
      const bw = isWideX ? actualBagLen * 1.02 : thickness * 1.08;
      const bd = isWideX ? thickness * 1.08 : actualBagLen * 1.02;
      const rotY = ((r + c) % 2 === 0 ? 1 : -1) * 0.045 * (stagger ? 1 : 0.5);
      const bx = b.x + (isWideX ? offsetAlong : 0);
      const bz = b.z + (isWideX ? 0 : offsetAlong);
      const mat = (r + c) % 3 === 0 ? burlapMat : ((r + c) % 3 === 1 ? propMats.sandbagA : propMats.sandbagC);
      batch.addPillowSandbag(bw, bagH * 1.04, bd, bx, yCenter, bz, mat, rotY);
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

// Emit Realistic Modern Multi-Story Buildings with Mullioned Windows, Storefront Awnings, Parapet Roofs, Penthouse, AC Units & Neon Trim
function emitBuilding(batch, b, mapId) {
  const cy = b.y + b.h * 0.5;
  const hw = b.w * 0.5;
  const hd = b.d * 0.5;
  const topY = b.y + b.h;
  batch.addBox(b.w, b.h, b.d, b.x, cy, b.z, getMapMaterial(b.mat), 0, 0, 0, true, 4.8);

  // Ground Concrete Plinth, Mid-Story Belt Course & Perimeter Roof Parapet Wall (4 realistic parapet sides + coping!)
  batch.addBox(b.w + 0.26, 0.52, b.d + 0.26, b.x, b.y + 0.26, b.z, propMats.concreteTrim, 0, 0, 0, false);
  batch.addBox(b.w + 0.34, 0.28, b.d + 0.34, b.x, topY + 0.08, b.z, propMats.concreteTrim, 0, 0, 0, false);
  // Parapet wall rim around roof edge
  const parH = 0.62;
  batch.addBox(b.w + 0.14, parH, 0.28, b.x, topY + parH * 0.5, b.z - hd + 0.06, propMats.darkSteel, 0, 0, 0, false);
  batch.addBox(b.w + 0.14, parH, 0.28, b.x, topY + parH * 0.5, b.z + hd - 0.06, propMats.darkSteel, 0, 0, 0, false);
  batch.addBox(0.28, parH, b.d + 0.14, b.x - hw + 0.06, topY + parH * 0.5, b.z, propMats.darkSteel, 0, 0, 0, false);
  batch.addBox(0.28, parH, b.d + 0.14, b.x + hw - 0.06, topY + parH * 0.5, b.z, propMats.darkSteel, 0, 0, 0, false);

  if (b.h >= 5.5) {
    batch.addBox(b.w + 0.20, 0.24, b.d + 0.20, b.x, b.y + b.h * 0.50, b.z, propMats.concreteTrim, 0, 0, 0, false);
  }
  // 4 Vertical Corner Structural Pilasters
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.addBox(0.40, b.h + 0.15, 0.40, b.x + sx * (hw - 0.06), cy, b.z + sz * (hd - 0.06), propMats.darkSteel, 0, 0, 0, false);
    }
  }

  // 3D Mullioned Windows, Projecting Sills, Storefront Awnings, Wall AC Split Units & Rooftop Mechanical Penthouse
  if (b.h >= 5.5 && b.w >= 7 && b.d >= 7) {
    const awningMat = b.mat === 'building_glass' ? propMats.awningBlue : propMats.awningRed;
    // Sloped Storefront Awnings on ground floor faces
    for (const sz of [-1, 1]) {
      batch.addBox(b.w * 0.58, 0.10, 1.15, b.x, b.y + 2.85, b.z + sz * (hd + 0.48), awningMat, sz * 0.28, 0, 0, false);
    }
    for (const sx of [-1, 1]) {
      batch.addBox(1.15, 0.10, b.d * 0.58, b.x + sx * (hw + 0.48), b.y + 2.85, b.z, awningMat, 0, 0, -sx * 0.28, false);
    }

    for (const fy of [b.y + 2.0, b.y + 4.85]) {
      if (fy + 1.1 > topY) continue;
      for (const wxOff of [-b.w * 0.25, b.w * 0.25]) {
        // Window sill, lintel header, dark glass pane & center mullion bar
        batch.addBox(1.75, 0.15, b.d + 0.24, b.x + wxOff, fy - 0.68, b.z, propMats.concreteTrim, 0, 0, 0, false);
        batch.addBox(1.75, 0.12, b.d + 0.18, b.x + wxOff, fy + 0.68, b.z, propMats.darkSteel, 0, 0, 0, false);
        batch.addBox(1.48, 1.24, b.d + 0.08, b.x + wxOff, fy, b.z, propMats.glassWindowDark, 0, 0, 0, false);
        batch.addBox(0.08, 1.24, b.d + 0.14, b.x + wxOff, fy, b.z, propMats.darkSteel, 0, 0, 0, false);
      }
      for (const wzOff of [-b.d * 0.25, b.d * 0.25]) {
        batch.addBox(b.w + 0.24, 0.15, 1.75, b.x, fy - 0.68, b.z + wzOff, propMats.concreteTrim, 0, 0, 0, false);
        batch.addBox(b.w + 0.18, 0.12, 1.75, b.x, fy + 0.68, b.z + wzOff, propMats.darkSteel, 0, 0, 0, false);
        batch.addBox(b.w + 0.08, 1.24, 1.48, b.x, fy, b.z + wzOff, propMats.glassWindowDark, 0, 0, 0, false);
        batch.addBox(b.w + 0.14, 1.24, 0.08, b.x, fy, b.z + wzOff, propMats.darkSteel, 0, 0, 0, false);
      }
    }
    // External wall-mounted AC split condenser unit
    batch.addBox(0.82, 0.56, 0.42, b.x + hw + 0.20, b.y + 4.35, b.z + hd * 0.35, propMats.fuelTankWhite, 0, 0, 0, false);
    batch.addCyl(0.18, 0.18, 0.45, 8, b.x + hw + 0.22, b.y + 4.35, b.z + hd * 0.35, propMats.darkSteel, Math.PI / 2, 0, 0, false);

    // Rooftop Stairwell Penthouse + Dual HVAC Chiller Units + Cellular Radio Mast
    batch.addBox(3.2, 2.0, 2.8, b.x - b.w * 0.16, topY + 1.0, b.z + b.d * 0.14, propMats.concreteTrim, 0, 0, 0, false);
    batch.addBox(3.45, 0.18, 3.05, b.x - b.w * 0.16, topY + 2.06, b.z + b.d * 0.14, propMats.darkSteel, 0, 0, 0, false);
    batch.addBox(2.4, 1.15, 2.2, b.x + b.w * 0.20, topY + 0.58, b.z - b.d * 0.16, propMats.galvSteel, 0, 0, 0, false);
    batch.addCyl(0.65, 0.65, 1.22, 10, b.x + b.w * 0.20, topY + 0.60, b.z - b.d * 0.16, propMats.darkSteel, 0, 0, 0, false);
    batch.addCyl(0.06, 0.09, 3.6, 8, b.x - b.w * 0.26, topY + 1.8, b.z - b.d * 0.22, propMats.galvSteel, 0, 0, 0, false);
    batch.addBox(0.18, 0.18, 0.18, b.x - b.w * 0.26, topY + 3.65, b.z - b.d * 0.22, propMats.glowRed, 0, 0, 0, false);
  }

  if (mapId === 'urban_city' && b.h >= 6.0) {
    const isBlue = b.mat === 'building_glass';
    const neonMat = isBlue ? propMats.glowCyan : propMats.glowAmber;
    batch.addBox(b.w + 0.18, 0.16, b.d + 0.18, b.x, topY - 0.55, b.z, neonMat, 0, 0, 0, false);
  }
}

// ============================================================================
// REALISTIC OPEN-WORLD STRUCTURE DECOR EMITTERS (0 Extra Draw Calls -> Merged per Sector!)
// ============================================================================
function emitBrHouseDecor(col, s) {
  const {
    cx, cz, fy, floors, w, d, fh, doorW,
    windowW = 3.0, sillH = 0.80, lintelY = 2.86, hasBalcony = floors > 1,
    wallMat, roofStyle
  } = s;
  const hw = w * 0.5;
  const hd = d * 0.5;
  const totalH = floors * fh;
  const roofY = fy + totalH + 0.34;
  const seed = Math.abs(Math.round(cx * 3 + cz * 7));
  const shutterMat = (seed % 3 === 0)
    ? propMats.shutterGreen
    : (seed % 3 === 1 ? propMats.shutterBlue : propMats.windowWood);
  const winH = Math.max(1.2, lintelY - sillH);
  const winMidY = sillH + winH * 0.5;

  // 1. Stone/Concrete Raised Base Skirting Plinth, Corner Quoins & Mid-Floor Cornice Belt
  for (const zSide of [-1, 1]) {
    const wz = cz + zSide * (hd - 0.25);
    const wingW = (w - doorW) * 0.5 + 0.08;
    col.addBox(wingW, 0.52, 0.66, cx - (doorW * 0.5 + wingW * 0.5 - 0.04), fy + 0.26, wz, propMats.concreteTrim, 0, 0, 0, false);
    col.addBox(wingW, 0.52, 0.66, cx + (doorW * 0.5 + wingW * 0.5 - 0.04), fy + 0.26, wz, propMats.concreteTrim, 0, 0, 0, false);
  }
  for (const xSide of [-1, 1]) {
    const wx = cx + xSide * (hw - 0.25);
    col.addBox(0.66, 0.52, d + 0.14, wx, fy + 0.26, cz, propMats.concreteTrim, 0, 0, 0, false);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      col.addBox(0.50, totalH + 0.22, 0.50, cx + sx * (hw - 0.04), fy + totalH * 0.5, cz + sz * (hd - 0.04), propMats.concreteTrim, 0, 0, 0, false);
    }
  }
  if (floors > 1) {
    col.addBox(w + 0.28, 0.22, d + 0.28, cx, fy + fh, cz, propMats.concreteTrim, 0, 0, 0, false);
  }
  // Galvanized rainwater downspout pipe + eaves gutter trim
  col.addCyl(0.06, 0.06, totalH + 0.2, 6, cx + hw + 0.10, fy + totalH * 0.5, cz + hd - 0.28, propMats.galvSteel, 0, 0, 0, false);

  // 2. Front & Back Welcoming Porticos (Timber Door Casings, Entry Steps, Sloped Canopy, Pillars & Porch Lantern!)
  const porticoRoofMat = getMapMaterial(roofStyle === 'tile' ? 'roof_tile' : (roofStyle === 'slate' ? 'roof_slate' : 'roof_metal'));
  for (const zSide of [-1, 1]) {
    const wz = cz + zSide * (hd - 0.22);
    const outZ = cz + zSide * (hd + 0.05);
    col.addBox(0.18, 2.75, 0.64, cx - doorW * 0.5 + 0.04, fy + 1.375, wz, propMats.windowWood, 0, 0, 0, false);
    col.addBox(0.18, 2.75, 0.64, cx + doorW * 0.5 - 0.04, fy + 1.375, wz, propMats.windowWood, 0, 0, 0, false);
    col.addBox(doorW + 0.30, 0.22, 0.68, cx, fy + 2.78, wz, propMats.windowWood, 0, 0, 0, false);
    // Double masonry entry threshold steps
    col.addBox(doorW + 0.9, 0.16, 1.35, cx, fy - 0.06, cz + zSide * (hd + 0.64), propMats.concreteTrim, 0, 0, 0, false);
    col.addBox(doorW + 0.5, 0.14, 0.72, cx, fy + 0.03, cz + zSide * (hd + 0.34), propMats.concreteTrim, 0, 0, 0, false);
    // Warm porch wall lantern sconce beside doorway
    col.addBox(0.16, 0.26, 0.16, cx + doorW * 0.5 + 0.28, fy + 2.15, outZ + zSide * 0.04, propMats.darkSteel, 0, 0, 0, false);
    col.addBox(0.10, 0.16, 0.10, cx + doorW * 0.5 + 0.28, fy + 2.12, outZ + zSide * 0.07, propMats.glowAmber, 0, 0, 0, false);

    if (zSide === -1 || !hasBalcony) {
      // Back porch / single-story front portico canopy awning + twin timber columns
      col.addBox(doorW + 1.2, 0.14, 1.55, cx, fy + 3.04, cz + zSide * (hd + 0.68), porticoRoofMat, zSide * 0.24, 0, 0, false, 2.5);
      for (const px of [-doorW * 0.5 - 0.30, doorW * 0.5 + 0.30]) {
        col.addBox(0.14, 2.86, 0.14, cx + px, fy + 1.43, cz + zSide * (hd + 1.25), propMats.windowWood, 0, 0, 0, false);
      }
    }
  }

  // 3. 2nd-Floor Walk-Out Front Balcony (+Z) with Wrought-Iron Vertical Balusters, Top Rail & Support Corbels
  if (hasBalcony) {
    const balW = Math.min(w - 2.2, 4.8);
    const balD = 1.45;
    const balY = fy + fh;
    const balFrontZ = cz + hd + balD - 0.10;
    // Porch canopy/underside support beams framing Ground-Floor front entry underneath the balcony
    for (const px of [-balW * 0.44, balW * 0.44]) {
      col.addBox(0.20, fh - 0.2, 0.20, cx + px, fy + (fh - 0.2) * 0.5, cz + hd + balD - 0.14, propMats.concreteTrim, 0, 0, 0, false);
    }
    col.addBox(balW + 0.24, 0.24, balD + 0.16, cx, balY - 0.11, cz + hd + balD * 0.5, propMats.concreteTrim, 0, 0, 0, false);
    // Open Wrought-Iron / Steel Balcony Railing (0.80m high -> jumpable & shoot-through!)
    col.addBox(balW + 0.12, 0.08, 0.12, cx, balY + 0.78, balFrontZ, propMats.darkSteel, 0, 0, 0, false);
    for (const sx of [-1, 1]) {
      col.addBox(0.12, 0.08, balD, cx + sx * (balW * 0.5 - 0.05), balY + 0.78, cz + hd + balD * 0.5, propMats.darkSteel, 0, 0, 0, false);
      col.addBox(0.14, 0.84, 0.14, cx + sx * (balW * 0.5 - 0.05), balY + 0.42, balFrontZ, propMats.darkSteel, 0, 0, 0, false);
    }
    const postCount = 7;
    for (let i = 1; i < postCount; i++) {
      const rx = cx - balW * 0.5 + (i / postCount) * balW;
      col.addBox(0.05, 0.76, 0.05, rx, balY + 0.38, balFrontZ, propMats.darkSteel, 0, 0, 0, false);
    }
    // 2nd Floor Front Balcony Door Jambs (open floor-to-2.86m!)
    const f2z = cz + hd - 0.22;
    col.addBox(0.16, lintelY, 0.62, cx - doorW * 0.5 + 0.04, balY + lintelY * 0.5, f2z, propMats.windowWood, 0, 0, 0, false);
    col.addBox(0.16, lintelY, 0.62, cx + doorW * 0.5 - 0.04, balY + lintelY * 0.5, f2z, propMats.windowWood, 0, 0, 0, false);
    col.addBox(doorW + 0.26, 0.18, 0.66, cx, balY + lintelY + 0.06, f2z, propMats.windowWood, 0, 0, 0, false);
  }

  // 4. Clean Architectural Window Frames, Sills & Paneled Shutters around EVERY Jump-Through Cutout (Zero Blocking Bars!)
  const halfWin = windowW * 0.5;
  for (let fl = 0; fl < floors; fl++) {
    const y0 = fy + fl * fh;
    // Left & Right side windows (open y0+0.80..y0+2.86 = 2.06m clear vertical height!)
    for (const xSide of [-1, 1]) {
      const wx = cx + xSide * (hw - 0.22);
      const outX = cx + xSide * (hw + 0.05);
      // Molded projecting stone sill BELOW 0.80m opening
      col.addBox(0.76, 0.14, windowW + 0.32, wx, y0 + sillH - 0.07, cz, propMats.concreteTrim, 0, 0, 0, false);
      // Window box ledge accent safely below sill
      col.addBox(0.24, 0.20, 1.35, outX + xSide * 0.12, y0 + sillH - 0.24, cz, propMats.windowWood, 0, 0, 0, false);
      // Top timber architrave & left/right jambs flanking outside the clear opening
      col.addBox(0.70, 0.16, windowW + 0.26, wx, y0 + lintelY + 0.06, cz, propMats.windowWood, 0, 0, 0, false);
      col.addBox(0.64, winH, 0.12, wx, y0 + winMidY, cz - halfWin - 0.04, propMats.windowWood, 0, 0, 0, false);
      col.addBox(0.64, winH, 0.12, wx, y0 + winMidY, cz + halfWin + 0.04, propMats.windowWood, 0, 0, 0, false);
      // Open louvered exterior shutters flanking both sides
      col.addBox(0.09, winH - 0.10, 0.68, outX, y0 + winMidY, cz - halfWin - 0.44, shutterMat, 0, 0, 0, false);
      col.addBox(0.09, winH - 0.10, 0.68, outX, y0 + winMidY, cz + halfWin + 0.44, shutterMat, 0, 0, 0, false);
    }
    // 2nd Floor Back (-Z) jump-through window (width doorW=2.6m, y0+0.80..y0+2.86)
    if (fl > 0) {
      const wz = cz - (hd - 0.22);
      const outZ = cz - (hd + 0.05);
      const hBack = doorW * 0.5;
      col.addBox(doorW + 0.30, 0.14, 0.76, cx, y0 + sillH - 0.07, wz, propMats.concreteTrim, 0, 0, 0, false);
      col.addBox(doorW + 0.24, 0.16, 0.70, cx, y0 + lintelY + 0.06, wz, propMats.windowWood, 0, 0, 0, false);
      col.addBox(0.12, winH, 0.64, cx - hBack - 0.04, y0 + winMidY, wz, propMats.windowWood, 0, 0, 0, false);
      col.addBox(0.12, winH, 0.64, cx + hBack + 0.04, y0 + winMidY, wz, propMats.windowWood, 0, 0, 0, false);
      col.addBox(0.64, winH - 0.10, 0.09, cx - hBack - 0.42, y0 + winMidY, outZ, shutterMat, 0, 0, 0, false);
      col.addBox(0.64, winH - 0.10, 0.09, cx + hBack + 0.42, y0 + winMidY, outZ, shutterMat, 0, 0, 0, false);
    }
    // Warm interior ceiling fixture inside each floor so rooms feel inhabited
    col.addBox(0.62, 0.08, 0.28, cx - hw * 0.18, y0 + fh - 0.28, cz, propMats.glowWhite, 0, 0, 0, false);
  }

  // 5. Realistic Pitched Gable Roof + Exposed Eaves Trim + Brick Chimney + TV/Radio Mast (or Concrete Bunker Parapet)
  if (roofStyle === 'flat') {
    const parH = 0.78;
    col.addBox(w + 0.7, parH, 0.32, cx, roofY + parH * 0.5, cz - hd - 0.24, propMats.concreteTrim, 0, 0, 0, false);
    col.addBox(w + 0.7, parH, 0.32, cx, roofY + parH * 0.5, cz + hd + 0.24, propMats.concreteTrim, 0, 0, 0, false);
    col.addBox(0.32, parH, d + 0.7, cx - hw - 0.24, roofY + parH * 0.5, cz, propMats.concreteTrim, 0, 0, 0, false);
    col.addBox(0.32, parH, d + 0.7, cx + hw + 0.24, roofY + parH * 0.5, cz, propMats.concreteTrim, 0, 0, 0, false);
    col.addBox(2.2, 1.0, 1.9, cx + hw * 0.3, roofY + 0.5, cz - hd * 0.2, propMats.galvSteel, 0, 0, 0, false);
    col.addCyl(0.05, 0.08, 3.0, 6, cx - hw * 0.35, roofY + 1.5, cz + hd * 0.2, propMats.galvSteel, 0, 0, 0, false);
  } else {
    const roofMat = getMapMaterial(roofStyle === 'tile' ? 'roof_tile' : (roofStyle === 'slate' ? 'roof_slate' : 'roof_metal'));
    const gableMat = getMapMaterial(wallMat);
    const roofH = Math.min(3.1, Math.max(2.2, Math.min(w, d) * 0.25));
    const alongZ = d >= w;
    col.addGableRoof(w, roofH, d, cx, roofY, cz, roofMat, gableMat, alongZ, 0.72, true);
    // Stepped Brick Chimney rising cleanly above ridge + terracotta flue pot
    const chX = cx + hw * 0.38;
    const chZ = cz - hd * 0.22;
    col.addBox(0.95, roofH + 1.25, 0.95, chX, roofY + (roofH + 1.25) * 0.5, chZ, propMats.brickChimney, 0, 0, 0, false);
    col.addBox(1.16, 0.18, 1.16, chX, roofY + roofH + 1.28, chZ, propMats.concreteTrim, 0, 0, 0, false);
    col.addCyl(0.14, 0.16, 0.42, 6, chX, roofY + roofH + 1.54, chZ, propMats.brickChimney, 0, 0, 0, false);
    // TV Yagi antenna mast near opposite ridge
    col.addCyl(0.03, 0.04, 2.2, 5, cx - hw * 0.15, roofY + roofH + 1.0, cz + hd * 0.28, propMats.galvSteel, 0, 0, 0, false);
    col.addBox(1.3, 0.04, 0.04, cx - hw * 0.15, roofY + roofH + 1.85, cz + hd * 0.28, propMats.galvSteel, 0, 0, 0, false);
  }
}

function emitBrWatchtowerDecor(col, s) {
  const { cx, cz, fy, sz, deckY } = s;
  const hs = sz * 0.5;
  const legDist = hs - 0.28;
  const braceLen = Math.hypot(legDist * 2, deckY - fy - 0.4);
  const braceAng = Math.atan2(deckY - fy - 0.4, legDist * 2);
  const midY = (fy + deckY) * 0.5;

  // X-pattern diagonal timber cross-bracing on North, West & East faces (South stays open for stairs!)
  col.addBox(braceLen, 0.16, 0.14, cx, midY, cz - legDist, propMats.windowWood, 0, 0, braceAng, false);
  col.addBox(braceLen, 0.16, 0.14, cx, midY, cz - legDist, propMats.windowWood, 0, 0, -braceAng, false);
  for (const sx of [-1, 1]) {
    col.addBox(0.14, 0.16, braceLen, cx + sx * legDist, midY, cz, propMats.windowWood, braceAng, 0, 0, false);
    col.addBox(0.14, 0.16, braceLen, cx + sx * legDist, midY, cz, propMats.windowWood, -braceAng, 0, 0, false);
  }
  // Staircase timber handrails along South ramp
  const stairLen = Math.hypot(5.8, 3.4);
  const stairAng = Math.atan2(3.4, 5.8);
  for (const sx of [-0.95, 0.95]) {
    col.addBox(0.08, 0.10, stairLen, cx + sx, fy + 2.55, cz + hs + 3.0, propMats.windowWood, stairAng, 0, 0, false);
    col.addBox(0.10, 1.0, 0.10, cx + sx, fy + 0.5, cz + hs + 5.7, propMats.windowWood, 0, 0, 0, false);
    col.addBox(0.10, 1.0, 0.10, cx + sx, fy + 2.1, cz + hs + 3.0, propMats.windowWood, 0, 0, 0, false);
  }
  // Realistic 4-sided Hip/Pyramid Corrugated Roof + Lightning Rod Beacon
  const roofBaseY = fy + 6.48;
  col.addHipRoof(sz + 1.5, 1.65, sz + 1.5, cx, roofBaseY, cz, getMapMaterial('roof_metal'), true);
  col.addCyl(0.04, 0.05, 1.2, 6, cx, roofBaseY + 2.1, cz, propMats.galvSteel, 0, 0, 0, false);
  col.addBox(0.16, 0.16, 0.16, cx, roofBaseY + 2.75, cz, propMats.glowRed, 0, 0, 0, false);
}

function emitBrShackDecor(col, s) {
  const { cx, cz, fy, w, d, h } = s;
  const hw = w * 0.5;
  const hd = d * 0.5;
  // Sloped corrugated metal shed roof + exposed timber rafters
  const roofY = fy + h + 0.35;
  col.addBox(w + 1.1, 0.14, d + 1.2, cx, roofY + 0.32, cz, getMapMaterial('roof_metal'), 0.14, 0, 0, true, 2.4);
  for (const rx of [-hw + 0.3, 0, hw - 0.3]) {
    col.addBox(0.12, 0.16, d + 0.9, cx + rx, roofY + 0.18, cz, propMats.windowWood, 0.14, 0, 0, false);
  }
  // Wooden front doorway jambs & lintel
  col.addBox(0.14, 2.6, 0.44, cx - 1.0, fy + 1.3, cz + hd - 0.16, propMats.windowWood, 0, 0, 0, false);
  col.addBox(0.14, 2.6, 0.44, cx + 1.0, fy + 1.3, cz + hd - 0.16, propMats.windowWood, 0, 0, 0, false);
  col.addBox(2.2, 0.16, 0.48, cx, fy + 2.64, cz + hd - 0.16, propMats.windowWood, 0, 0, 0, false);
  // Corner timber posts & exterior shuttered window detail
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      col.addBox(0.24, h + 0.1, 0.24, cx + sx * (hw - 0.06), fy + h * 0.5, cz + sz * (hd - 0.06), propMats.windowWood, 0, 0, 0, false);
    }
  }
  col.addBox(0.10, 0.95, 1.15, cx + hw + 0.04, fy + 1.65, cz, propMats.shutterGreen, 0, 0, 0, false);
  col.addBox(0.16, 0.12, 1.30, cx + hw + 0.06, fy + 1.14, cz, propMats.windowWood, 0, 0, 0, false);
}

function emitBrHangarDecor(col, s) {
  const { cx, cz, fy, w, d, h } = s;
  const hw = w * 0.5;
  const hd = d * 0.5;
  const roofY = fy + h + 0.62;
  // Pitched Industrial Hangar Gable Roof
  col.addGableRoof(w + 0.6, 2.8, d + 0.4, cx, roofY, cz, getMapMaterial('roof_metal'), null, true, 0.85, true);
  // Exterior Steel I-Beam Buttress Columns + Interior Overhead A-Frame Roof Trusses
  const trussCount = 5;
  for (let i = 0; i < trussCount; i++) {
    const tz = cz - hd + 1.5 + (i / (trussCount - 1)) * (d - 3.0);
    for (const sx of [-1, 1]) {
      col.addBox(0.45, h + 0.5, 0.45, cx + sx * (hw + 0.12), fy + h * 0.5, tz, propMats.darkSteel, 0, 0, 0, false);
    }
    // Overhead steel roof truss tie-beam + high-bay industrial lamp
    col.addBox(w - 0.4, 0.34, 0.34, cx, fy + h - 0.32, tz, propMats.darkSteel, 0, 0, 0, false);
    col.addBox(1.8, 0.10, 0.38, cx, fy + h - 0.54, tz, propMats.glowAmber, 0, 0, 0, false);
  }
  // Open Giant Sliding Steel Hangar Door Panels & Hazard Yellow Entrance Headers at both ends
  for (const zSide of [-1, 1]) {
    const ez = cz + zSide * (hd + 0.18);
    col.addBox(w + 0.8, 0.55, 0.45, cx, fy + h + 0.25, ez, propMats.hazardYellow, 0, 0, 0, false);
    for (const sx of [-1, 1]) {
      col.addBox(2.4, h, 0.24, cx + sx * (hw - 1.1), fy + h * 0.5, ez, propMats.oliveArmor, 0, 0, 0, false);
    }
  }
}

function emitBrBridgeDecor(col, s) {
  const { ax, az, bx, bz, bridgeW, deckY } = s;
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const alongX = Math.abs(dx) >= Math.abs(dz);
  const midX = (ax + bx) * 0.5;
  const midZ = (az + bz) * 0.5;
  const hw = bridgeW * 0.5;
  const trussH = 5.4;
  const spanLen = len * 0.72;
  const bays = Math.max(4, Math.round(spanLen / 10));
  const bayLen = spanLen / bays;
  const diagLen = Math.hypot(bayLen, trussH);
  const diagAng = Math.atan2(trussH, bayLen);

  // Side Concrete Jersey Guardrails + Iconic Steel Truss Arches & Overhead Cross-Bracing
  if (alongX) {
    for (const side of [-1, 1]) {
      const rz = midZ + side * (hw - 0.28);
      col.addBox(spanLen, 0.92, 0.38, midX, deckY + 0.46, rz, propMats.concreteTrim, 0, 0, 0, false);
      col.addBox(spanLen, 0.36, 0.36, midX, deckY + trussH, rz, propMats.darkSteel, 0, 0, 0, false);
      for (let i = 0; i <= bays; i++) {
        const px = midX - spanLen * 0.5 + i * bayLen;
        col.addBox(0.32, trussH, 0.32, px, deckY + trussH * 0.5, rz, propMats.darkSteel, 0, 0, 0, false);
        if (i < bays) {
          col.addBox(diagLen, 0.22, 0.22, px + bayLen * 0.5, deckY + trussH * 0.5, rz, propMats.galvSteel, 0, 0, (i % 2 === 0 ? 1 : -1) * diagAng, false);
        }
      }
    }
    for (let i = 0; i <= bays; i++) {
      const px = midX - spanLen * 0.5 + i * bayLen;
      col.addBox(0.28, 0.28, bridgeW - 0.4, px, deckY + trussH, midZ, propMats.darkSteel, 0, 0, 0, false);
    }
  } else {
    for (const side of [-1, 1]) {
      const rx = midX + side * (hw - 0.28);
      col.addBox(0.38, 0.92, spanLen, rx, deckY + 0.46, midZ, propMats.concreteTrim, 0, 0, 0, false);
      col.addBox(0.36, 0.36, spanLen, rx, deckY + trussH, midZ, propMats.darkSteel, 0, 0, 0, false);
      for (let i = 0; i <= bays; i++) {
        const pz = midZ - spanLen * 0.5 + i * bayLen;
        col.addBox(0.32, trussH, 0.32, rx, deckY + trussH * 0.5, pz, propMats.darkSteel, 0, 0, 0, false);
        if (i < bays) {
          col.addBox(0.22, 0.22, diagLen, rx, deckY + trussH * 0.5, pz + bayLen * 0.5, propMats.galvSteel, (i % 2 === 0 ? 1 : -1) * diagAng, 0, 0, false);
        }
      }
    }
    for (let i = 0; i <= bays; i++) {
      const pz = midZ - spanLen * 0.5 + i * bayLen;
      col.addBox(bridgeW - 0.4, 0.28, 0.28, midX, deckY + trussH, pz, propMats.darkSteel, 0, 0, 0, false);
    }
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
      vertexColors: true,
      map: getTerrainDetailTexture()
    });
    const chunkCells = 30; // 30x10m = 300m per frustum-culled terrain sector (ultra smooth in 1.5km map)
    const rgb = [0, 0, 0];
    const uvScale = 1 / (t.half * 2);
    for (let z0 = 0; z0 < t.nx - 1; z0 += chunkCells) {
      const z1 = Math.min(t.nx - 1, z0 + chunkCells);
      for (let x0 = 0; x0 < t.nx - 1; x0 += chunkCells) {
        const x1 = Math.min(t.nx - 1, x0 + chunkCells);
        const cols = x1 - x0 + 1;
        const rows = z1 - z0 + 1;
        const pos = new Float32Array(cols * rows * 3);
        const col = new Float32Array(cols * rows * 3);
        const uvs = new Float32Array(cols * rows * 2);
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
            uvs[ptr * 2] = (wx + t.half) * uvScale;
            uvs[ptr * 2 + 1] = (wz + t.half) * uvScale;
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
        tGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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

    // Sector-bucketed Realistic Multi-Species Instanced Trees & Sculpted Stratified Boulders (distant sectors 100% culled!)
    const treesBySector = new Map();
    for (const tr of mapData.trees || []) {
      const { key } = getSectorGrp(tr.x, tr.z);
      let arr = treesBySector.get(key);
      if (!arr) { arr = []; treesBySector.set(key, arr); }
      arr.push(tr);
    }
    const rocksBySector = new Map();
    for (const rk of mapData.rocks || []) {
      const { key } = getSectorGrp(rk.x, rk.z);
      let arr = rocksBySector.get(key);
      if (!arr) { arr = []; rocksBySector.set(key, arr); }
      arr.push(rk);
    }
    const natureSectorKeys = new Set([...treesBySector.keys(), ...rocksBySector.keys()]);
    for (const key of natureSectorKeys) {
      const grp = sectorGroupsMap.get(key) || worldGroup;
      addInstancedNature(grp, treesBySector.get(key), rocksBySector.get(key), {
        castTreeTrunks: false,
        receiveShadow: enableWorldShadows,
        isDesert: false,
        isJungle: false
      });
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
    'house_brick',
    'house_siding',
    'stucco_house',
    'stucco_sage',
    'wood_plank',
    'roof_tile',
    'roof_slate',
    'roof_metal',
    'bunker_concrete',
    'warehouse_wall',
    'military_wall',
    'city_wall',
    'jungle_stone',
    'jungle_wall',
    'concrete'
  ]);
  const castShadows = enableWorldShadows;

  // Realistic Instanced Trees & Sculpted Rocks for Arena Maps (Jungle, Urban City, Military Base)
  if (!isOpenWorld && (mapData.trees?.length || mapData.rocks?.length)) {
    addInstancedNature(worldGroup, mapData.trees, mapData.rocks, {
      castTreeTrunks: castShadows,
      receiveShadow: castShadows,
      isDesert: mapData.theme === 'desert_military',
      isJungle: mapData.theme === 'jungle'
    });
  }

  // 4. Arena & Open-World Blocks + Realistic Modern-FPS 3D Models (100% Batched by Material -> ~18 Draw Calls!)
  if (isOpenWorld) {
    const sectorCollectors = new Map(); // sectorKey -> MapBatchCollector
    const getCol = (bx, bz) => {
      const { key } = getSectorGrp(bx, bz);
      let col = sectorCollectors.get(key);
      if (!col) {
        col = new MapBatchCollector();
        sectorCollectors.set(key, col);
      }
      return col;
    };

    for (const b of mapData.blocks) {
      if (b.noVisual) continue;
      const col = getCol(b.x, b.z);

      if (b.mat === 'sandbag') {
        emitSandbagWall(col, b);
      } else if (b.mat && b.mat.startsWith('container_')) {
        emitShippingContainer(col, b);
      } else if (b.mat === 'crate_wood') {
        emitSupplyCrate(col, b, false);
      } else if (b.mat === 'crate_metal') {
        emitSupplyCrate(col, b, true);
      } else if (b.mat === 'metal_deck') {
        emitMetalDeck(col, b);
      } else {
        const tileSize = tiledMaterials.has(b.mat) ? 4.5 : 0;
        col.addBox(b.w, b.h, b.d, b.x, b.y + b.h * 0.5, b.z, getMapMaterial(b.mat), 0, 0, 0, true, tileSize);
      }
    }

    // Realistic Pitched Gable Roofs, Window Frames/Shutters, Chimneys, Hangar Trusses, Watchtower Hip Roofs, Bridge Arches & Iconic POI Landmarks!
    for (const st of mapData.structures || []) {
      const sx = st.type === 'bridge' ? (st.ax + st.bx) * 0.5 : st.cx;
      const sz = st.type === 'bridge' ? (st.az + st.bz) * 0.5 : st.cz;
      const col = getCol(sx, sz);
      if (st.type === 'house') emitBrHouseDecor(col, st);
      else if (st.type === 'watchtower') emitBrWatchtowerDecor(col, st);
      else if (st.type === 'shack') emitBrShackDecor(col, st);
      else if (st.type === 'hangar') emitBrHangarDecor(col, st);
      else if (st.type === 'bridge') emitBrBridgeDecor(col, st);
      else if (st.type === 'gantry_crane') emitBrGantryCrane(col, st);
      else if (st.type === 'radar_tower') emitBrRadarTower(col, st);
      else if (st.type === 'silo_depot') emitBrSiloDepot(col, st);
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
      // Steel Perimeter H-Beam Columns, 3D Overhead Warren Roof Trusses & Industrial Wall Piping
      for (const bz of [-26, -20, -13, -7, 0, 7, 13, 20, 26]) {
        for (const sx of [-1, 1]) {
          arenaBatch.addBox(0.45, 8.8, 0.45, sx * 23.6, 4.4, bz, propMats.darkSteel, 0, 0, 0, false);
          arenaBatch.addBox(0.55, 0.35, 0.55, sx * 23.6, 0.18, bz, propMats.hazardYellow, 0, 0, 0, false);
        }
      }
      // 3D Steel Warren Roof Trusses above the 4 main steel beams + corrugated skylight eaves
      for (const bz of [-20, -7, 7, 20]) {
        arenaBatch.addBox(48, 0.26, 0.36, 0, 9.25, bz, propMats.darkSteel, 0, 0, 0, false);
        for (let tx = -21; tx <= 21; tx += 6) {
          arenaBatch.addBox(0.18, 1.4, 0.18, tx, 8.5, bz, propMats.galvSteel, 0, 0, 0, false);
          if (tx < 21) {
            arenaBatch.addBox(6.15, 0.14, 0.14, tx + 3, 8.5, bz, propMats.galvSteel, 0, 0, (Math.abs(tx) % 12 === 3 ? 0.22 : -0.22), false);
          }
        }
      }
      // High-bay wall ventilation ducts, exhaust fan hoods & high-pressure red/steel pipe conduits
      for (const sx of [-1, 1]) {
        arenaBatch.addCyl(0.14, 0.14, 64, 8, sx * 23.4, 5.4, 0, propMats.oilDrumRed, Math.PI / 2, 0, 0, false);
        arenaBatch.addCyl(0.18, 0.18, 64, 8, sx * 23.35, 6.1, 0, propMats.galvSteel, Math.PI / 2, 0, 0, false);
        for (const vz of [-16, 0, 16]) {
          arenaBatch.addBox(0.42, 1.35, 1.35, sx * 23.8, 6.8, vz, propMats.darkSteel, 0, 0, 0, false);
          arenaBatch.addCyl(0.52, 0.52, 0.48, 10, sx * 23.75, 6.8, vz, propMats.galvSteel, 0, 0, Math.PI / 2, false);
        }
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
      // 1. 3D Steel Watchtowers with Sloped Hip Canopy Roofs, Diagonal Bracing & Searchlights
      for (const [wx, wz, dir] of [[-24, -20, 1], [24, 20, -1]]) {
        for (const sx of [-2.8, 2.8]) {
          for (const sz of [-2.8, 2.8]) {
            arenaBatch.addBox(0.24, 3.2, 0.24, wx + sx, 5.0, wz + sz, propMats.darkSteel, 0, 0, 0, false);
          }
        }
        // Cross-bracing under deck & hip metal roof canopy
        arenaBatch.addBox(7.2, 0.24, 7.2, wx, 6.62, wz, propMats.darkSteel, 0, 0, 0, false);
        arenaBatch.addHipRoof(7.8, 1.55, 7.8, wx, 6.72, wz, getMapMaterial('roof_metal'), true);
        arenaBatch.addCyl(0.05, 0.08, 2.2, 6, wx, 8.9, wz, propMats.galvSteel, 0, 0, 0, false);
        arenaBatch.addBox(0.18, 0.18, 0.18, wx, 10.05, wz, propMats.glowRed, 0, 0, 0, false);
        arenaBatch.addBox(0.45, 0.32, 0.35, wx, 6.38, wz + dir * 3.1, propMats.glowWhite, 0, 0, 0, false);
      }

      // 2. 3D Cylindrical Fuel Depot Storage Silos & Piping Manifold atop/beside East Fuel Bunker (x=32, z=2)
      for (const fz of [-1.2, 2.0, 5.2]) {
        arenaBatch.addCyl(1.35, 1.35, 3.8, 14, 32.0, 5.1, fz, propMats.fuelTankWhite);
        arenaBatch.addCyl(1.38, 1.38, 0.28, 14, 32.0, 5.2, fz, propMats.hazardYellow, 0, 0, 0, false);
        arenaBatch.addCyl(0.24, 0.28, 0.45, 8, 32.0, 7.15, fz, propMats.darkSteel, 0, 0, 0, false);
      }
      arenaBatch.addCyl(0.14, 0.14, 7.5, 8, 30.5, 4.2, 2.0, propMats.oilDrumRed, Math.PI / 2, 0, 0, false);
      emitOilDrumCluster(arenaBatch, 28.6, 0, -4.2);
      emitOilDrumCluster(arenaBatch, -31.5, 0, -8.2);

      // 3. West Armory Hangar Pitched Corrugated Roof, Steel Trusses & High-Bay Lighting (x=-26, y=4.5, z=0)
      arenaBatch.addGableRoof(16.2, 2.2, 20.2, -26.0, 5.05, 0, getMapMaterial('roof_metal'), null, true, 0.6, true);
      for (const hz of [-7.5, -2.5, 2.5, 7.5]) {
        arenaBatch.addBox(15.2, 0.32, 0.38, -26.0, 4.32, hz, propMats.darkSteel, 0, 0, 0, false);
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
      // 1. 3D Downtown LED Streetlamps & Concrete Sidewalk Tree Planters
      for (const [lx, lz, dirX] of [
        [-11.5, -26, 1], [11.5, -26, -1],
        [-11.5, 26, 1], [11.5, 26, -1],
        [-29.5, -16, 1], [-29.5, 16, 1],
        [29.5, -16, -1], [29.5, 16, -1]
      ]) {
        emitStreetLamp(arenaBatch, lx, 0, lz, dirX);
      }
      for (const tr of mapData.trees || []) {
        arenaBatch.addBox(2.2, 0.42, 2.2, tr.x, 0.21, tr.z, propMats.concreteTrim, 0, 0, 0, false);
        arenaBatch.addBox(1.8, 0.44, 1.8, tr.x, 0.22, tr.z, propMats.woodFrame, 0, 0, 0, false);
      }

      // 2. 3D Metro Station Glass & Steel Entrance Canopy Arch at Bomb Site A (Ga Tàu Điện, x=28, z=0)
      arenaBatch.addBox(0.32, 3.8, 0.32, 27.8, 1.9, -3.2, propMats.darkSteel, 0, 0, 0, false);
      arenaBatch.addBox(0.32, 3.8, 0.32, 27.8, 1.9, 3.2, propMats.darkSteel, 0, 0, 0, false);
      arenaBatch.addBox(3.4, 0.28, 7.2, 28.6, 3.9, 0, propMats.darkSteel, 0, 0, 0, false);
      arenaBatch.addBox(3.0, 0.12, 6.6, 28.6, 4.06, 0, propMats.glassCab, 0, 0, 0, false);
      arenaBatch.addBox(0.18, 0.42, 5.4, 27.0, 3.95, 0, propMats.glowCyan, 0, 0, 0, false);

      // 3. Sniper Balcony Steel Handrail Posts & Top Rails on NW (-8.65, -14) & SE (8.65, 14) balconies
      for (const [bx, bz] of [[-8.65, -14], [8.65, 14]]) {
        arenaBatch.addBox(0.14, 0.08, 9.6, bx, 4.10, bz, propMats.galvSteel, 0, 0, 0, false);
        for (const sz of [-4.4, -2.2, 0, 2.2, 4.4]) {
          arenaBatch.addBox(0.16, 1.12, 0.16, bx, 3.55, bz + sz, propMats.darkSteel, 0, 0, 0, false);
        }
      }

      // 4. Central Plaza Monument Golden Trim & Rotating Holographic Tactical Globe
      arenaBatch.addBox(7.9, 0.18, 7.9, 0, 0.96, 0, propMats.darkSteel, 0, 0, 0, false);
      arenaBatch.addBox(3.45, 0.24, 3.45, 0, 4.72, 0, propMats.hazardYellow, 0, 0, 0, false);

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
      // 1. Ancient Carved Temple Multi-Tier Stepped Roof, Hanging Jungle Vines & 4 Flaming Stone Braziers (x=0, z=0)
      const stoneMat = getMapMaterial('jungle_stone');
      arenaBatch.addBox(10.2, 0.60, 1.45, 0, 6.26, -4.2, stoneMat, 0, 0, 0, true, 4.0);
      arenaBatch.addBox(10.2, 0.60, 1.45, 0, 6.26, 4.2, stoneMat, 0, 0, 0, true, 4.0);
      arenaBatch.addBox(1.45, 0.60, 10.2, -4.2, 6.26, 0, stoneMat, 0, 0, 0, true, 4.0);
      arenaBatch.addBox(1.45, 0.60, 10.2, 4.2, 6.26, 0, stoneMat, 0, 0, 0, true, 4.0);
      // Stepped Mayan/Khmer Pyramid Crown Tiers
      arenaBatch.addBox(8.0, 0.55, 8.0, 0, 6.80, 0, stoneMat, 0, 0, 0, true, 4.0);
      arenaBatch.addBox(5.6, 0.62, 5.6, 0, 7.36, 0, stoneMat, 0, 0, 0, false, 3.5);
      arenaBatch.addBox(3.4, 0.55, 3.4, 0, 7.92, 0, stoneMat, 0, 0, 0, false, 3.0);

      for (const sx of [-4.2, 4.2]) {
        for (const sz of [-4.2, 4.2]) {
          // Stepped temple pillar base & capital + Flaming Stone Brazier atop each corner!
          arenaBatch.addBox(1.88, 0.36, 1.88, sx, 2.38, sz, stoneMat, 0, 0, 0, false);
          arenaBatch.addBox(1.88, 0.36, 1.88, sx, 5.88, sz, stoneMat, 0, 0, 0, false);
          arenaBatch.addCyl(0.55, 0.36, 0.42, 8, sx, 6.75, sz, propMats.darkSteel, 0, 0, 0, false);
          arenaBatch.addCyl(0.08, 0.38, 0.65, 7, sx, 7.22, sz, propMats.glowAmber, 0, 0, 0, false);
          // Draped jungle vines hanging down temple lintel edges
          arenaBatch.addBox(0.18, 1.65, 0.18, sx * 0.72, 5.25, sz * 1.15, propMats.vineGreen, 0, 0, 0.08, false);
          arenaBatch.addBox(0.15, 1.25, 0.15, sx * 1.15, 5.45, sz * 0.65, propMats.vineGreen, 0.06, 0, 0, false);
        }
      }

      // 2. Recon Communications Dish, Roof Canopy & Field Generator at East Research Bunker (x=22, y=2.4, z=0)
      arenaBatch.addHipRoof(8.6, 1.45, 7.2, 22, 4.65, 0, getMapMaterial('roof_metal'), false);
      for (const sx of [-3.6, 3.6]) {
        for (const sz of [-2.8, 2.8]) {
          arenaBatch.addBox(0.22, 2.3, 0.22, 22 + sx, 3.55, sz, propMats.darkSteel, 0, 0, 0, false);
        }
      }
      arenaBatch.addCyl(0.25, 0.35, 1.1, 8, 24.4, 2.95, -2.0, propMats.darkSteel, 0, 0, 0, false);
      arenaBatch.addCyl(0.95, 0.20, 0.38, 10, 24.4, 3.75, -2.0, propMats.galvSteel, 0.45, -0.6, 0, false);
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

    // Flush ALL static arena architecture, containers, crates, buildings, vehicles & hero props in ~20 merged draw calls!
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

// ============================================================================
// BATCHED BATTLE ROYALE ICONIC POI LANDMARKS (0 EXTRA DRAW CALLS!)
// ============================================================================
function emitBrGantryCrane(col, st) {
  const { cx, cz, fy } = st;
  const topY = fy + 16.0;
  // Twin yellow/red industrial crane bridge beams + diagonal leg braces + cantilever boom
  col.addBox(16.5, 1.35, 1.15, cx, topY, cz - 5.5, propMats.hazardYellow, 0, 0, 0, false);
  col.addBox(16.5, 1.35, 1.15, cx, topY, cz + 5.5, propMats.hazardYellow, 0, 0, 0, false);
  col.addBox(1.2, 1.2, 13.0, cx - 6.5, topY + 0.2, cz, propMats.oilDrumRed, 0, 0, 0, false);
  col.addBox(1.2, 1.2, 13.0, cx + 6.5, topY + 0.2, cz, propMats.oilDrumRed, 0, 0, 0, false);
  // Diagonal structural cross-bracing between crane legs
  for (const sx of [-6.5, 6.5]) {
    col.addBox(0.35, 12.2, 0.35, cx + sx, fy + 8.5, cz, propMats.hazardYellow, 0.72, 0, 0, false);
    col.addBox(0.35, 12.2, 0.35, cx + sx, fy + 8.5, cz, propMats.hazardYellow, -0.72, 0, 0, false);
  }
  // Elevated operator cabin + overhead trolley & suspended container spreader bar
  col.addBox(3.4, 2.6, 2.8, cx - 3.2, topY - 1.7, cz, propMats.darkSteel, 0, 0, 0, false);
  col.addBox(2.8, 1.1, 2.9, cx - 3.2, topY - 1.5, cz, propMats.glassPane, 0, 0, 0, false);
  col.addBox(2.6, 0.9, 12.2, cx + 1.5, topY + 0.9, cz, propMats.darkSteel, 0, 0, 0, false);
  col.addCyl(0.08, 0.08, 4.8, 6, cx + 1.5, topY - 2.2, cz - 2.6, propMats.galvSteel, 0, 0, 0, false);
  col.addCyl(0.08, 0.08, 4.8, 6, cx + 1.5, topY - 2.2, cz + 2.6, propMats.galvSteel, 0, 0, 0, false);
  col.addBox(2.6, 0.45, 7.6, cx + 1.5, topY - 4.7, cz, propMats.hazardYellow, 0, 0, 0, false);
}

function emitBrRadarTower(col, st) {
  const { cx, cz, fy } = st;
  const baseTop = fy + 3.4;
  // 4 tapered steel lattice tower legs rising 13m above bunker
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      col.addBox(0.32, 13.2, 0.32, cx + sx * 1.9, baseTop + 6.5, cz + sz * 1.9, propMats.galvSteel, sz * -0.10, 0, sx * 0.10, false);
    }
  }
  // Mid & top observation steel platforms
  col.addBox(4.2, 0.28, 4.2, cx, baseTop + 6.4, cz, propMats.darkSteel, 0, 0, 0, false);
  col.addBox(3.4, 0.32, 3.4, cx, baseTop + 12.6, cz, propMats.darkSteel, 0, 0, 0, false);
  // Giant Parabolic Military Radar Dish + Feed Horn + Red Aviation Beacon
  col.addCyl(0.45, 0.65, 1.4, 8, cx, baseTop + 13.4, cz, propMats.darkSteel, 0, 0, 0, false);
  col.addBox(5.6, 2.2, 0.32, cx, baseTop + 14.9, cz, propMats.fuelTankWhite, -0.26, 0.4, 0, false);
  col.addBox(5.9, 0.32, 0.48, cx, baseTop + 14.9, cz, propMats.hazardYellow, -0.26, 0.4, 0, false);
  col.addCyl(0.08, 0.14, 4.0, 6, cx, baseTop + 17.6, cz, propMats.galvSteel, 0, 0, 0, false);
  col.addBox(0.36, 0.36, 0.36, cx, baseTop + 19.7, cz, propMats.glowRed, 0, 0, 0, false);
}

function emitBrSiloDepot(col, st) {
  const { cx, cz, fy } = st;
  // 3 Industrial Cylindrical Fuel / Power Cooling Silos + Yellow Safety Stripes + Overhead Catwalk & Red Pipes
  for (const ox of [-5.2, 0, 5.2]) {
    col.addCyl(1.95, 2.05, 10.6, 12, cx + ox, fy + 5.1, cz, propMats.fuelTankWhite, 0, 0, 0, false);
    col.addCyl(2.02, 2.02, 0.55, 12, cx + ox, fy + 8.6, cz, propMats.hazardYellow, 0, 0, 0, false);
    col.addCyl(2.02, 2.02, 0.42, 12, cx + ox, fy + 1.4, cz, propMats.darkSteel, 0, 0, 0, false);
    col.addCyl(1.45, 1.95, 1.15, 12, cx + ox, fy + 10.95, cz, propMats.galvSteel, 0, 0, 0, false);
    col.addCyl(0.34, 0.38, 1.1, 8, cx + ox, fy + 11.9, cz, propMats.darkSteel, 0, 0, 0, false);
  }
  // Connecting top maintenance bridge + high-pressure red industrial pipeline
  col.addBox(13.2, 0.28, 1.35, cx, fy + 10.6, cz, propMats.darkSteel, 0, 0, 0, false);
  col.addCyl(0.22, 0.22, 13.8, 8, cx, fy + 3.4, cz + 2.2, propMats.oilDrumRed, 0, 0, Math.PI / 2, false);
}

const lootMats = {
  caseWhite: new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.34, metalness: 0.08 }),
  medRed: new THREE.MeshStandardMaterial({ color: '#dc2626', emissive: '#7f1d1d', emissiveIntensity: 0.35, roughness: 0.32 }),
  medOlive: new THREE.MeshStandardMaterial({ color: '#3f5a36', roughness: 0.55, metalness: 0.14 }),
  gauzeCream: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.85, metalness: 0.02 }),
  gauzeTape: new THREE.MeshStandardMaterial({ color: '#d6b48c', roughness: 0.78 }),
  canCyan: new THREE.MeshStandardMaterial({ color: '#0ea5e9', emissive: '#0369a1', emissiveIntensity: 0.35, roughness: 0.22, metalness: 0.72 }),
  canSilver: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.18, metalness: 0.88 }),
  brass: new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.24, metalness: 0.84 }),
  copper: new THREE.MeshStandardMaterial({ color: '#c26b32', roughness: 0.28, metalness: 0.80 }),
  ammo556: new THREE.MeshStandardMaterial({ color: '#3d5a34', roughness: 0.52, metalness: 0.22 }),
  ammo762: new THREE.MeshStandardMaterial({ color: '#8a623c', roughness: 0.54, metalness: 0.20 }),
  ammo9mm: new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.48, metalness: 0.26 }),
  ammo12g: new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.46, metalness: 0.18 }),
  ammo300: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.34, metalness: 0.62 }),
  tier1Mat: new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.54, metalness: 0.28 }),
  tier2Mat: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.44, metalness: 0.34 }),
  tier3Mat: new THREE.MeshStandardMaterial({ color: '#141821', roughness: 0.36, metalness: 0.52 }),
  goldTrim: new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#92400e', emissiveIntensity: 0.4, roughness: 0.26, metalness: 0.80 }),
  cyanTrim: new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.4, roughness: 0.26, metalness: 0.65 }),
  bagLv1: new THREE.MeshStandardMaterial({ color: '#786248', roughness: 0.76, metalness: 0.06 }),
  bagLv2: new THREE.MeshStandardMaterial({ color: '#3f523a', roughness: 0.72, metalness: 0.08 }),
  bagLv3: new THREE.MeshStandardMaterial({ color: '#1f242d', roughness: 0.64, metalness: 0.16 }),
  fragOlive: new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.46, metalness: 0.36 }),
  strapDark: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.68, metalness: 0.15 }),
  visorGlass: new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.12, metalness: 0.90 })
};

export function createLootCrateMesh(crateOrType = 'medkit') {
  const isObj = crateOrType && typeof crateOrType === 'object';
  const kind = isObj ? (crateOrType.kind || crateOrType.type || 'medkit') : crateOrType;
  const weaponId = isObj ? crateOrType.weaponId : null;
  const tier = isObj ? (crateOrType.tier || 1) : 1;
  const medId = isObj ? (crateOrType.medId || '') : '';
  const ammoType = isObj ? (crateOrType.ammoType || '') : '';
  const cacheKey = `${kind}_${weaponId || ''}_${tier}_${medId}_${ammoType}`;

  let template = lootTemplateCache.get(cacheKey);
  if (!template) {
    template = buildLootCrateTemplate(kind, weaponId, tier, medId, ammoType);
    lootTemplateCache.set(cacheKey, template);
  }
  const cloned = template.clone(true);
  cloned.userData.crateInfo = isObj ? crateOrType : { kind, ...(weaponId ? { weaponId } : {}) };
  return cloned;
}

function addSubtleLootRing(group, colorHex, radius = 0.34) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.018, 6, 18),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.62 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.025;
  group.add(ring);
}

// High-Craft Sculpted 3D PUBG-Style Floor Loot (Batched via MapBatchCollector -> only 2-3 draw calls per visible pickup!)
function buildLootCrateTemplate(kind, weaponId, tier, medId = '', ammoType = '') {
  const g = new THREE.Group();

  // 1. ENEMY DEATHBOX: Authentic Wooden/Steel Military Supply Crate + Golden Smoke Beacon
  if (kind === 'deathbox') {
    const col = new MapBatchCollector();
    col.addBox(1.02, 0.46, 0.66, 0, 0.25, 0, propMats.woodFrame, 0, 0, 0, false);
    col.addBox(1.08, 0.08, 0.72, 0, 0.51, 0, propMats.darkSteel, 0, 0, 0, false);
    // Steel reinforced corner posts & front latch clasp
    for (const sx of [-0.50, 0.50]) {
      for (const sz of [-0.32, 0.32]) {
        col.addBox(0.08, 0.52, 0.08, sx, 0.26, sz, propMats.darkSteel, 0, 0, 0, false);
      }
      col.addBox(0.05, 0.06, 0.24, sx * 1.08, 0.30, 0, propMats.galvSteel, 0, 0, 0, false);
    }
    col.addBox(0.32, 0.12, 0.72, 0, 0.34, 0, lootMats.goldTrim, 0, 0, 0, false);
    col.flush(g, false);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.20, 4.6, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = 2.45;
    g.add(beam);
    return g;
  }

  // 2. FIREARMS ON GROUND: Actual 3D Gun Model + Sleek Ground Indicator Ring
  if (kind === 'weapon' && weaponId) {
    const isElite = ['awp', 'barrett', 'm249', 'scarh', 'm200', 'pkm', 'mg3', 'mcx', 'groza', 'm24', 'mk14'].includes(weaponId);
    const ringColor = isElite ? '#f59e0b' : '#38bdf8';
    addSubtleLootRing(g, ringColor, 0.44);

    const gunModel = createWeaponModel(weaponId, 'default', {});
    gunModel.scale.setScalar(1.30);
    gunModel.position.set(0, 0.38, 0);
    gunModel.rotation.x = 0.22;
    gunModel.rotation.z = -0.15;
    g.add(gunModel);
    return g;
  }

  const col = new MapBatchCollector();

  // 3. MEDICAL SUPPLIES (Distinct 3D First-Aid Case, Trauma Medkit, Bandage Rolls & Energy Drink Can!)
  if (kind === 'med' || kind === 'medkit') {
    if (medId === 'energy') {
      // Sleek Metallic Tilted Energy Drink Can
      addSubtleLootRing(g, '#38bdf8', 0.24);
      col.addCyl(0.095, 0.095, 0.32, 12, 0, 0.22, 0, lootMats.canCyan, 0.16, 0, -0.18, false);
      col.addCyl(0.092, 0.098, 0.03, 12, 0.025, 0.38, 0.024, lootMats.canSilver, 0.16, 0, -0.18, false);
      col.addCyl(0.096, 0.092, 0.03, 12, -0.025, 0.06, -0.024, lootMats.canSilver, 0.16, 0, -0.18, false);
      col.addCyl(0.098, 0.098, 0.045, 12, 0.01, 0.28, 0.008, lootMats.goldTrim, 0.16, 0, -0.18, false);
    } else if (medId === 'bandage') {
      // Twin Rolled White Medical Gauze Bandages + Tan Tape Strip
      addSubtleLootRing(g, '#4ade80', 0.28);
      col.addCyl(0.095, 0.095, 0.20, 12, -0.10, 0.16, 0.02, lootMats.gauzeCream, Math.PI * 0.5, 0.25, 0, false);
      col.addCyl(0.097, 0.097, 0.06, 12, -0.10, 0.16, 0.02, lootMats.gauzeTape, Math.PI * 0.5, 0.25, 0, false);
      col.addCyl(0.090, 0.090, 0.19, 12, 0.11, 0.15, -0.04, lootMats.gauzeCream, Math.PI * 0.5, -0.35, 0, false);
      col.addCyl(0.092, 0.092, 0.055, 12, 0.11, 0.15, -0.04, lootMats.medRed, Math.PI * 0.5, -0.35, 0, false);
    } else if (medId === 'medkit' || kind === 'medkit') {
      // Military Trauma Medkit Box (Olive Hard-Case + Embossed White & Red Cross + Carry Handle)
      addSubtleLootRing(g, '#22c55e', 0.36);
      col.addBox(0.50, 0.24, 0.36, 0, 0.20, 0, lootMats.medOlive, 0.12, 0, 0, false);
      col.addBox(0.52, 0.04, 0.38, 0, 0.28, 0.01, lootMats.strapDark, 0.12, 0, 0, false);
      // Carry handle & latches
      col.addBox(0.18, 0.04, 0.04, 0, 0.22, -0.22, lootMats.strapDark, 0.12, 0, 0, false);
      col.addBox(0.22, 0.025, 0.20, 0, 0.33, 0.015, lootMats.caseWhite, 0.12, 0, 0, false);
      col.addBox(0.16, 0.032, 0.055, 0, 0.34, 0.016, lootMats.medRed, 0.12, 0, 0, false);
      col.addBox(0.055, 0.032, 0.16, 0, 0.34, 0.016, lootMats.medRed, 0.12, 0, 0, false);
    } else {
      // PUBG Iconic White First-Aid Tactical Case with Red Medical Cross & Black Handle
      addSubtleLootRing(g, '#22c55e', 0.34);
      col.addBox(0.44, 0.18, 0.34, 0, 0.18, 0, lootMats.caseWhite, 0.18, 0, 0, false);
      col.addBox(0.46, 0.03, 0.36, 0, 0.18, 0, lootMats.strapDark, 0.18, 0, 0, false);
      col.addBox(0.16, 0.04, 0.04, 0, 0.20, -0.20, lootMats.strapDark, 0.18, 0, 0, false);
      // Bold Red Medical Cross on top
      col.addBox(0.20, 0.026, 0.064, 0, 0.28, 0.018, lootMats.medRed, 0.18, 0, 0, false);
      col.addBox(0.064, 0.026, 0.20, 0, 0.28, 0.018, lootMats.medRed, 0.18, 0, 0, false);
    }
    col.flush(g, false);
    return g;
  }

  // 4. AMMUNITION PACKS (Caliber-Colored Military Ammo Crate + Standing Brass/Red Rounds!)
  if (kind === 'ammo') {
    const ammoMatMap = {
      '5.56mm': lootMats.ammo556,
      '7.62mm': lootMats.ammo762,
      '9mm': lootMats.ammo9mm,
      '12G': lootMats.ammo12g,
      '.300': lootMats.ammo300
    };
    const ringMap = { '5.56mm': '#4ade80', '7.62mm': '#f59e0b', '9mm': '#fbbf24', '12G': '#ef4444', '.300': '#facc15' };
    const boxMat = ammoMatMap[ammoType] || lootMats.ammo762;
    const shellMat = ammoType === '12G' ? lootMats.ammo12g : lootMats.brass;
    const tipMat = ammoType === '12G' ? lootMats.brass : lootMats.copper;

    addSubtleLootRing(g, ringMap[ammoType] || '#f97316', 0.30);
    // Angled military ammo box with lid + clasp + metallic stripe
    col.addBox(0.32, 0.18, 0.22, -0.06, 0.15, 0, boxMat, 0, 0.24, 0, false);
    col.addBox(0.34, 0.045, 0.24, -0.06, 0.25, 0, lootMats.strapDark, 0, 0.24, 0, false);
    col.addBox(0.10, 0.04, 0.25, -0.06, 0.20, 0, lootMats.brass, 0, 0.24, 0, false);
    // 4 Standing Cartridges / Shotgun Shells right next to the box!
    const offsets = [[0.18, 0.06], [0.24, 0.01], [0.17, -0.05], [0.23, -0.09]];
    for (const [bx, bz] of offsets) {
      col.addCyl(0.024, 0.024, 0.14, 8, bx, 0.13, bz, shellMat, 0, 0, 0, false);
      col.addCyl(0.008, 0.022, 0.065, 8, bx, 0.23, bz, tipMat, 0, 0, 0, false);
    }
    col.flush(g, false);
    return g;
  }

  // 5. ARMOR VESTS (Sculpted 3D Ballistic Plate Carrier with Shoulder Straps & Triple Mag Pouches!)
  if (kind === 'vest' || kind === 'armor') {
    const vestMat = tier >= 3 ? lootMats.tier3Mat : (tier === 2 ? lootMats.tier2Mat : lootMats.tier1Mat);
    const trimMat = tier >= 3 ? lootMats.goldTrim : (tier === 2 ? lootMats.cyanTrim : lootMats.strapDark);
    const ringCol = tier >= 3 ? '#f59e0b' : (tier === 2 ? '#38bdf8' : '#94a3b8');
    addSubtleLootRing(g, ringCol, 0.36);

    // Front & back ballistic armor plates tilted back cleanly for instant recognition
    col.addBox(0.38, 0.42, 0.12, 0, 0.30, 0, vestMat, -0.22, 0, 0, false);
    // Left & right over-shoulder harness straps
    col.addBox(0.09, 0.14, 0.15, -0.14, 0.54, 0.03, lootMats.strapDark, -0.22, 0, 0, false);
    col.addBox(0.09, 0.14, 0.15, 0.14, 0.54, 0.03, lootMats.strapDark, -0.22, 0, 0, false);
    // Triple front MOLLE magazine pouches + glowing tier chest bar
    for (const px of [-0.11, 0, 0.11]) {
      col.addBox(0.085, 0.14, 0.055, px, 0.22, -0.075, lootMats.strapDark, -0.22, 0, 0, false);
    }
    col.addBox(0.24, 0.045, 0.04, 0, 0.40, -0.068, trimMat, -0.22, 0, 0, false);
    // Extra heavy collar & side cummerbund for Lv2/Lv3 armor
    if (tier >= 2) {
      col.addBox(0.46, 0.14, 0.14, 0, 0.18, 0.01, vestMat, -0.22, 0, 0, false);
    }
    if (tier >= 3) {
      col.addBox(0.32, 0.09, 0.16, 0, 0.54, 0.04, trimMat, -0.22, 0, 0, false);
    }
    col.flush(g, false);
    return g;
  }

  // 6. COMBAT HELMETS (Sculpted 3D Ballistic Dome — Police Lv1, Tactical NVG Lv2, Spetsnaz Altyn Visor Lv3!)
  if (kind === 'helmet') {
    const hMat = tier >= 3 ? lootMats.tier3Mat : (tier === 2 ? lootMats.tier2Mat : lootMats.tier1Mat);
    const trimMat = tier >= 3 ? lootMats.goldTrim : (tier === 2 ? lootMats.cyanTrim : lootMats.strapDark);
    const ringCol = tier >= 3 ? '#f59e0b' : (tier === 2 ? '#38bdf8' : '#94a3b8');
    addSubtleLootRing(g, ringCol, 0.30);

    // Sculpted ballistic hemisphere shell
    const domeGeo = new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    domeGeo.scale(0.95, 1.0, 1.08);
    domeGeo.translate(0, 0.24, 0);
    col.addGeo(domeGeo, hMat, false);
    // Protective rubber rim & side tactical rails
    col.addCyl(0.21, 0.225, 0.05, 12, 0, 0.20, 0, lootMats.strapDark, 0, 0, 0, false);
    if (tier === 2) {
      // Tactical front NVG mount shroud + glowing rail strip
      col.addBox(0.09, 0.08, 0.05, 0, 0.33, -0.22, trimMat, 0, 0, 0, false);
    } else if (tier >= 3) {
      // Iconic Spetsnaz Level 3 Flip-Down Steel Face Visor Shield with eye slit!
      col.addBox(0.32, 0.20, 0.05, 0, 0.24, -0.21, hMat, 0.10, 0, 0, false);
      col.addBox(0.24, 0.055, 0.06, 0, 0.26, -0.225, lootMats.visorGlass, 0.10, 0, 0, false);
      col.addBox(0.28, 0.025, 0.06, 0, 0.35, -0.215, trimMat, 0.10, 0, 0, false);
    }
    col.flush(g, false);
    return g;
  }

  // 7. TACTICAL BACKPACKS (Sculpted 3D Rucksack — Scales clearly from Lv1 → Lv2 → Lv3!)
  if (kind === 'bag') {
    const bMat = tier >= 3 ? lootMats.bagLv3 : (tier === 2 ? lootMats.bagLv2 : lootMats.bagLv1);
    const trimMat = tier >= 3 ? lootMats.goldTrim : (tier === 2 ? lootMats.cyanTrim : lootMats.strapDark);
    const ringCol = tier >= 3 ? '#f59e0b' : (tier === 2 ? '#a855f7' : '#94a3b8');
    const sc = tier >= 3 ? 1.22 : (tier === 2 ? 1.06 : 0.90);
    addSubtleLootRing(g, ringCol, 0.34);

    // Contoured main rucksack pack + overlapping top flap + twin buckle straps + front & side pockets
    col.addBox(0.34 * sc, 0.42 * sc, 0.18 * sc, 0, 0.26 * sc, 0, bMat, -0.18, 0, 0, false);
    col.addBox(0.35 * sc, 0.12 * sc, 0.21 * sc, 0, 0.46 * sc, -0.02, bMat, -0.18, 0, 0, false);
    col.addBox(0.24 * sc, 0.18 * sc, 0.08 * sc, 0, 0.18 * sc, -0.11 * sc, lootMats.strapDark, -0.18, 0, 0, false);
    for (const sx of [-0.10 * sc, 0.10 * sc]) {
      col.addBox(0.04 * sc, 0.26 * sc, 0.03, sx, 0.36 * sc, -0.10 * sc, trimMat, -0.18, 0, 0, false);
    }
    if (tier >= 2) {
      for (const sx of [-0.20 * sc, 0.20 * sc]) {
        col.addBox(0.08 * sc, 0.20 * sc, 0.12 * sc, sx, 0.20 * sc, 0, lootMats.strapDark, -0.18, 0, 0, false);
      }
    }
    col.flush(g, false);
    return g;
  }

  // 8. FRAG GRENADE (Sculpted 3D M67 Military Frag Grenade!)
  if (kind === 'grenade') {
    addSubtleLootRing(g, '#ef4444', 0.24);
    const bodyGeo = new THREE.SphereGeometry(0.135, 10, 8);
    bodyGeo.translate(0, 0.22, 0);
    col.addGeo(bodyGeo, lootMats.fragOlive, false);
    col.addCyl(0.140, 0.140, 0.036, 10, 0, 0.22, 0, lootMats.goldTrim, 0, 0, 0, false);
    col.addCyl(0.042, 0.052, 0.075, 8, 0, 0.37, 0, propMats.galvSteel, 0, 0, 0, false);
    col.addBox(0.025, 0.17, 0.04, 0.09, 0.28, 0, propMats.darkSteel, 0, 0, 0.24, false);
    col.flush(g, false);
    return g;
  }

  // Fallback tactical supply item
  addSubtleLootRing(g, '#eab308', 0.30);
  col.addBox(0.36, 0.22, 0.28, 0, 0.18, 0, propMats.darkSteel, 0, 0, 0, false);
  col.addBox(0.38, 0.05, 0.30, 0, 0.22, 0, lootMats.goldTrim, 0, 0, 0, false);
  col.flush(g, false);
  return g;
}
