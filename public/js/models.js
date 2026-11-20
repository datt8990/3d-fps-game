// AAA-Grade Rigged GLB Character System (Stylized Military & Spec-Ops) + 50 Realistic 3D Firearms
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { OUTFITS, OPERATORS, WEAPONS, WEAPON_SKINS } from '/shared/constants.js';
import {
  getWeaponSkinTexture,
  getOutfitTextures,
  getWatchFaceTexture,
  getWeaponMetalBumpTexture,
  getStudioEnvMap,
  getWoodStockTexture,
  getPolymerGripTexture
} from './textures.js';
import {
  resolveCharacterArchetype,
  preloadCharacterModels,
  getLoadedCharacterSync,
  loadCharacterArchetype,
  instantiateGlbInstance
} from './characterLoader.js';
import { createMuzzleFlashRig } from './weaponEffects.js';
import { hydrateGlbWeaponIfConfigured } from './weaponAssetLoader.js';

export { preloadCharacterModels };

const UP_VEC = new THREE.Vector3(0, 1, 0);
const RIGHT_VEC = new THREE.Vector3(1, 0, 0);
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _q4 = new THREE.Quaternion();
const _q5 = new THREE.Quaternion();

if (typeof window !== 'undefined') {
  // Kick off background GLB character preloading early
  preloadCharacterModels();
}

// Extrudes a 2D side-profile (px = forward toward muzzle -Z, py = up +Y) symmetrically across X.
function extrudeSideProfile(points, thickness = 0.04, bevel = 0.003, mat) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const innerDepth = Math.max(0.002, thickness - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerDepth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8
  });
  geo.translate(0, 0, -innerDepth * 0.5);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// Connects two 3D joint positions seamlessly with an oriented tapered cylinder/capsule segment
function connectLimbSegment(parent, start, end, rTop, rBottom, mat, radialSegments = 12) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 0.001) return null;
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, radialSegments);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.addVectors(start, end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP_VEC, dir.normalize());
  parent.add(mesh);
  return mesh;
}

// Shared helper to add tactical Picatinny rail teeth along Z
function buildPicatinnyRail(length, width, y, zCenter, darkMat) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.007, length), darkMat);
  base.position.set(0, y, zCenter);
  g.add(base);
  const slotStep = 0.018;
  const count = Math.floor(length / slotStep);
  const slotGeo = new THREE.BoxGeometry(width + 0.002, 0.0045, 0.008);
  for (let i = 0; i < count; i++) {
    const z = zCenter - length * 0.5 + slotStep * (i + 0.5);
    const tooth = new THREE.Mesh(slotGeo, darkMat);
    tooth.position.set(0, y + 0.005, z);
    g.add(tooth);
  }
  return g;
}

// Crisp open iron sights (rear glowing 2-dot notch + slim glowing front tritium post)
function buildOpenIronSights(rearZ, frontZ, sightY, darkMat, dotColor = '#4ade80', frontColor = '#f97316', spreadX = 0.009) {
  const g = new THREE.Group();
  const rearBase = new THREE.Mesh(new THREE.BoxGeometry(spreadX * 2 + 0.010, 0.005, 0.014), darkMat);
  rearBase.position.set(0, sightY - 0.007, rearZ);

  const rearPostGeo = new THREE.BoxGeometry(0.005, 0.013, 0.013);
  const rearL = new THREE.Mesh(rearPostGeo, darkMat);
  rearL.position.set(-spreadX, sightY - 0.001, rearZ);
  const rearR = new THREE.Mesh(rearPostGeo, darkMat);
  rearR.position.set(spreadX, sightY - 0.001, rearZ);

  const dotGeo = new THREE.SphereGeometry(0.0017, 6, 6);
  const rearDotMat = new THREE.MeshBasicMaterial({ color: dotColor });
  const dotL = new THREE.Mesh(dotGeo, rearDotMat);
  dotL.position.set(-spreadX, sightY + 0.002, rearZ + 0.0068);
  const dotR = new THREE.Mesh(dotGeo, rearDotMat);
  dotR.position.set(spreadX, sightY + 0.002, rearZ + 0.0068);

  const frontBlade = new THREE.Mesh(new THREE.BoxGeometry(0.0028, 0.014, 0.010), darkMat);
  frontBlade.position.set(0, sightY - 0.002, frontZ);
  const frontDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.0019, 8, 8),
    new THREE.MeshBasicMaterial({ color: frontColor })
  );
  frontDot.position.set(0, sightY + 0.003, frontZ + 0.0055);

  g.add(rearBase, rearL, rearR, dotL, dotR, frontBlade, frontDot);
  return g;
}

// Smooth continuous extruded curved magazine (AK-47 / Galil / RPK / M4 / MP5 / SVD style)
function buildCurvedMagazine(width, depth, segH, count, curveAngle, startY, startZ, mat, trimMat = null) {
  const g = new THREE.Group();
  const totalLen = segH * count * 0.94;
  const totalCurve = curveAngle * count;
  const steps = 8;
  const startPx = -startZ;
  const startPy = startY + segH * 0.42;

  const centerPts = [];
  const frontPts = [];
  const backPts = [];
  let cx = startPx;
  let cy = startPy;
  const stepLen = totalLen / steps;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = 0.08 + totalCurve * t;
    const nx = Math.cos(a) * depth * 0.5;
    const ny = Math.sin(a) * depth * 0.5;
    centerPts.push([cx, cy, a]);
    frontPts.push([cx + nx, cy + ny]);
    backPts.unshift([cx - nx, cy - ny]);
    if (i < steps) {
      cx += Math.sin(a) * stepLen;
      cy -= Math.cos(a) * stepLen;
    }
  }

  const magBody = extrudeSideProfile([...frontPts, ...backPts], width, 0.0025, mat);
  g.add(magBody);

  // Subtle horizontal stamping / polymer waffle ribs along the curve + steel base floorplate
  const ribMat = trimMat || mat;
  for (let r = 2; r < steps; r += 2) {
    const [rx, ry, ra] = centerPts[r];
    const rib = new THREE.Mesh(new THREE.BoxGeometry(width + 0.003, 0.005, depth + 0.003), ribMat);
    rib.position.set(0, ry, -rx);
    rib.rotation.x = ra;
    g.add(rib);
  }
  const [bx, by, ba] = centerPts[steps];
  const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(width + 0.006, 0.009, depth + 0.009), ribMat);
  floorPlate.position.set(0, by - Math.cos(ba) * 0.004, -(bx + Math.sin(ba) * 0.004));
  floorPlate.rotation.x = ba;
  g.add(floorPlate);
  return g;
}

// Anatomical 10-point contoured pistol grip with beavertail backstrap, finger swell & heel flare
function buildErgonomicGrip(topZ, height = 0.104, width = 0.033, mat, capMat, topY = -0.016, slantBack = 0.034) {
  const g = new THREE.Group();
  const pxTop = -topZ;
  const botY = topY - height;
  const pxBot = pxTop - slantBack;
  const pts = [
    [pxTop + 0.020, topY],
    [pxTop + 0.011, topY - height * 0.20],
    [pxTop + 0.015, topY - height * 0.40],
    [pxTop + 0.002 - slantBack * 0.25, topY - height * 0.65],
    [pxBot + 0.012, botY],
    [pxBot - 0.026, botY - 0.004],
    [pxTop - 0.024 - slantBack * 0.65, topY - height * 0.62],
    [pxTop - 0.016 - slantBack * 0.22, topY - height * 0.25],
    [pxTop - 0.028, topY]
  ];
  const body = extrudeSideProfile(pts, width, 0.004, mat);
  g.add(body);
  if (capMat) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.003, 0.008, 0.042), capMat);
    cap.position.set(0, botY - 0.004, -(pxBot - 0.007));
    cap.rotation.x = -0.06;
    g.add(cap);
  }
  return g;
}

// Vented M-LOK / Quad-Rail handguard exposing internal gas block, gas tube & ventilated slots
function buildTacticalHandguard({
  zStart,
  zEnd,
  yCenter,
  width = 0.052,
  height = 0.056,
  shroudMat,
  darkMat,
  steelMat,
  gasTubeY = null,
  hasQuadRails = true
}) {
  const g = new THREE.Group();
  const len = Math.abs(zStart - zEnd);
  const zMid = (zStart + zEnd) * 0.5;

  // Inner dark recessed barrel sleeve + stainless gas tube
  const core = new THREE.Mesh(new THREE.BoxGeometry(width * 0.68, height * 0.64, len - 0.008), darkMat);
  core.position.set(0, yCenter, zMid);
  g.add(core);

  if (gasTubeY !== null) {
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, len + 0.02, 8), steelMat);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, gasTubeY, zMid);
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.036, 0.028), darkMat);
    gasBlock.position.set(0, (gasTubeY + yCenter) * 0.5, zEnd - 0.012);
    g.add(gasTube, gasBlock);
  }

  // Top & bottom receiver-matched machined rail bridges + front/rear barrel nut collars
  const topBridge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.90, height * 0.24, len), shroudMat);
  topBridge.position.set(0, yCenter + height * 0.38, zMid);
  const botBridge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, height * 0.24, len), shroudMat);
  botBridge.position.set(0, yCenter - height * 0.38, zMid);
  g.add(topBridge, botBridge);

  const ringF = new THREE.Mesh(new THREE.BoxGeometry(width + 0.004, height, 0.022), darkMat);
  ringF.position.set(0, yCenter, zEnd + 0.011);
  const ringR = ringF.clone();
  ringR.position.z = zStart - 0.014;
  g.add(ringF, ringR);

  // Side vented M-LOK / cooling bridges (leaving gaps to expose dark barrel liner)
  const bayCount = Math.max(2, Math.floor((len - 0.04) / 0.048));
  const bayStep = (len - 0.04) / bayCount;
  for (let b = 0; b <= bayCount; b++) {
    const pz = zStart - 0.02 - b * bayStep;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(width + 0.002, height * 0.62, 0.013), shroudMat);
    rib.position.set(0, yCenter, pz);
    g.add(rib);
  }

  if (hasQuadRails) {
    for (const side of [-1, 1]) {
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, len - 0.03), darkMat);
      sideRail.position.set(side * (width * 0.5 + 0.002), yCenter, zMid);
      g.add(sideRail);
    }
  }
  return g;
}

// Hollow muzzle bore + optional fluted heavy precision barrel
function buildPrecisionBarrel({
  rFront,
  rRear,
  length,
  y,
  zCenter,
  darkMat,
  steelMat,
  fluted = false
}) {
  const g = new THREE.Group();
  const main = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rRear, length, 16), darkMat);
  main.rotation.x = Math.PI / 2;
  main.position.set(0, y, zCenter);
  g.add(main);

  // Crowned polished chamber collar near handguard exit
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(rRear * 1.18, rRear * 1.18, 0.024, 14), steelMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, y, zCenter + length * 0.36);
  g.add(collar);

  if (fluted) {
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      const flute = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, length * 0.72), steelMat);
      flute.position.set(Math.cos(ang) * (rFront + 0.0008), y + Math.sin(ang) * (rFront + 0.0008), zCenter - length * 0.05);
      g.add(flute);
    }
  }

  // Deep dark bore aperture disc at muzzle face
  const bore = new THREE.Mesh(
    new THREE.CircleGeometry(rFront * 0.56, 12),
    new THREE.MeshBasicMaterial({ color: '#030508' })
  );
  bore.rotation.y = Math.PI;
  bore.position.set(0, y, zCenter - length * 0.5 - 0.001);
  g.add(bore);
  return g;
}

// Detailed multi-baffle ribbed suppressor with QD lock collar and dark bore opening
function buildSuppressorUnit(y, zCenter, length, radius, darkMat, steelMat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), darkMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, y, zCenter);
  g.add(body);

  const qdCollar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.14, radius * 1.06, 0.024, 16), steelMat);
  qdCollar.rotation.x = Math.PI / 2;
  qdCollar.position.set(0, y, zCenter + length * 0.44);
  const frontCap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, 0.014, 16), steelMat);
  frontCap.rotation.x = Math.PI / 2;
  frontCap.position.set(0, y, zCenter - length * 0.47);
  g.add(qdCollar, frontCap);

  for (let r = -2; r <= 2; r++) {
    const heatRing = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, 0.006, 16), darkMat);
    heatRing.rotation.x = Math.PI / 2;
    heatRing.position.set(0, y, zCenter + r * (length * 0.14));
    g.add(heatRing);
  }
  const bore = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.42, 12),
    new THREE.MeshBasicMaterial({ color: '#030508' })
  );
  bore.rotation.y = Math.PI;
  bore.position.set(0, y, zCenter - length * 0.5 - 0.001);
  g.add(bore);
  return g;
}

// Pistol slide serrations, stainless chamber hood & ejection extractor
function buildPistolSlideDetails(width, yTop, zFront, zRear, darkMat, steelMat, brassMat) {
  const g = new THREE.Group();
  // Front & Rear angled cocking serration ribs
  for (let s = 0; s < 5; s++) {
    const serrR = new THREE.Mesh(new THREE.BoxGeometry(width + 0.0022, 0.026, 0.0032), darkMat);
    serrR.position.set(0, yTop - 0.020, zRear - 0.012 - s * 0.0085);
    serrR.rotation.x = -0.18;
    g.add(serrR);
  }
  for (let s = 0; s < 3; s++) {
    const serrF = new THREE.Mesh(new THREE.BoxGeometry(width + 0.0022, 0.022, 0.0032), darkMat);
    serrF.position.set(0, yTop - 0.020, zFront + 0.022 + s * 0.0085);
    serrF.rotation.x = -0.18;
    g.add(serrF);
  }
  // Top-right recessed ejection hood + extractor
  const hood = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, 0.004, 0.036), steelMat);
  hood.position.set(0.002, yTop + 0.001, (zFront + zRear) * 0.5 + 0.015);
  const brass = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.022), brassMat);
  brass.position.set(width * 0.5 + 0.0015, yTop - 0.014, (zFront + zRear) * 0.5 + 0.015);
  g.add(hood, brass);
  return g;
}

// Tactical PEQ-15 side laser/IR module for rifles & SMGs
function buildTacticalLaserModule(x, y, z, darkMat, laserColor = '#ef4444') {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.068), darkMat);
  const pressureCap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.016, 8), darkMat);
  pressureCap.rotation.x = Math.PI / 2;
  pressureCap.position.set(x > 0 ? -0.005 : 0.005, 0.012, 0.01);
  const emitter = new THREE.Mesh(
    new THREE.CircleGeometry(0.0045, 8),
    new THREE.MeshBasicMaterial({ color: laserColor })
  );
  emitter.rotation.y = Math.PI;
  emitter.position.set(0, 0.002, -0.035);
  g.add(box, pressureCap, emitter);
  g.position.set(x, y, z);
  return g;
}

// Ported multi-baffle muzzle brake or slotted flash hider for rifles/snipers
function buildMultiBaffleBrake(radius, y, z, mat, accentMat, isHeavyBox = false) {
  const g = new THREE.Group();
  if (isHeavyBox) {
    const core = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.9, radius * 1.35, 0.092), mat);
    const baffle1 = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.55, radius * 1.55, 0.014), accentMat);
    baffle1.position.z = -0.024;
    const baffle2 = baffle1.clone();
    baffle2.position.z = 0.018;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 0.018, 12), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = 0.046;
    g.add(core, baffle1, baffle2, collar);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, 0.056, 12), mat);
    body.rotation.x = Math.PI / 2;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.22, radius * 1.18, 0.014, 12), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = 0.020;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.14, radius * 1.06, 0.014, 12), accentMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.z = -0.020;
    // Side compensator gas ports
    for (const ps of [-1, 1]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.003, radius * 0.9, 0.024), new THREE.MeshBasicMaterial({ color: '#05070a' }));
      slot.position.set(ps * radius, 0, -0.004);
      g.add(slot);
    }
    g.add(body, collar, crown);
  }
  const bore = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.54, 10),
    new THREE.MeshBasicMaterial({ color: '#030508' })
  );
  bore.rotation.y = Math.PI;
  bore.position.z = isHeavyBox ? -0.047 : -0.029;
  g.add(bore);
  g.position.set(0, y, z);
  return g;
}

// Reusable sniper telescopic optic with scope rings, knurled turrets, throw lever & sunshade
function buildSniperOpticScope({
  y = 0.104,
  z = 0.01,
  length = 0.34,
  objectiveRadius = 0.032,
  lensColor = '#38bdf8',
  darkMetal,
  steelMat,
  accentMat
}) {
  const scopeGroup = new THREE.Group();
  const half = length * 0.5;
  const ringZ = Math.min(0.085, half * 0.48);

  for (const rz of [-ringZ, ringZ]) {
    const baseMount = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.042, 0.024), darkMetal);
    baseMount.position.set(0, -0.025, rz);
    const ringBand = new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.0225, 0.022, 16), steelMat);
    ringBand.rotation.x = Math.PI / 2;
    ringBand.position.set(0, 0, rz);
    scopeGroup.add(baseMount, ringBand);
  }

  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, length, 18), darkMetal);
  scopeTube.rotation.x = Math.PI / 2;
  const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(objectiveRadius, 0.0195, 0.105, 18), darkMetal);
  bellFront.rotation.x = Math.PI / 2;
  bellFront.position.z = -half - 0.012;
  const sunshadeLip = new THREE.Mesh(new THREE.CylinderGeometry(objectiveRadius + 0.002, objectiveRadius + 0.002, 0.018, 18), steelMat);
  sunshadeLip.rotation.x = Math.PI / 2;
  sunshadeLip.position.z = -half - 0.060;

  const bellRear = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.0265, 0.072, 18), darkMetal);
  bellRear.rotation.x = Math.PI / 2;
  bellRear.position.z = half;
  const zoomRing = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.014, 16), accentMat || steelMat);
  zoomRing.rotation.x = Math.PI / 2;
  zoomRing.position.z = half - 0.036;
  const throwLever = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.018, 0.006), steelMat);
  throwLever.position.set(-0.020, 0.020, half - 0.036);
  throwLever.rotation.z = 0.65;

  const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.030, 14), steelMat);
  turretTop.position.set(0, 0.025, 0);
  const turretSide = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.026, 14), steelMat);
  turretSide.rotation.z = Math.PI / 2;
  turretSide.position.set(-0.024, 0, 0);

  const lensMat = new THREE.MeshBasicMaterial({ color: lensColor });
  const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), lensMat);
  lensRear.position.z = half + 0.037;
  const lensFront = new THREE.Mesh(new THREE.CircleGeometry(objectiveRadius * 0.88, 16), lensMat);
  lensFront.rotation.y = Math.PI;
  lensFront.position.z = -half - 0.065;

  scopeGroup.add(
    scopeTube, bellFront, sunshadeLip, bellRear, zoomRing, throwLever,
    turretTop, turretSide, lensRear, lensFront
  );
  scopeGroup.position.set(0, y, z);
  return scopeGroup;
}

// Recessed right-side ejection port, bolt carrier, takedown pins & red/white fire-mode selector pips
function buildReceiverPolish(width, yPort, zPort, darkMat, steelMat, brassMat) {
  const g = new THREE.Group();
  const portPlate = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.018, 0.058), darkMat);
  portPlate.position.set(width * 0.5 + 0.001, yPort, zPort);
  const brassCase = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.009, 0.034), brassMat);
  brassCase.position.set(width * 0.5 + 0.0028, yPort, zPort + 0.004);
  const dustDoor = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.056), steelMat);
  dustDoor.position.set(width * 0.5 + 0.002, yPort - 0.012, zPort);
  const selector = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.012, 0.026), steelMat);
  selector.position.set(-width * 0.5 - 0.002, yPort - 0.022, zPort + 0.068);
  selector.rotation.x = 0.25;
  // Red/white fire-selector markings + steel takedown pins & bolt catch
  const redPip = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 8), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
  redPip.rotation.y = -Math.PI / 2;
  redPip.position.set(-width * 0.5 - 0.0015, yPort - 0.011, zPort + 0.064);
  const whitePip = new THREE.Mesh(new THREE.CircleGeometry(0.0020, 8), new THREE.MeshBasicMaterial({ color: '#e2e8f0' }));
  whitePip.rotation.y = -Math.PI / 2;
  whitePip.position.set(-width * 0.5 - 0.0015, yPort - 0.011, zPort + 0.075);
  const pinGeo = new THREE.CylinderGeometry(0.0036, 0.0036, width + 0.005, 10);
  pinGeo.rotateZ(Math.PI / 2);
  const pinF = new THREE.Mesh(pinGeo, steelMat);
  pinF.position.set(0, yPort - 0.028, zPort - 0.048);
  const pinR = new THREE.Mesh(pinGeo, steelMat);
  pinR.position.set(0, yPort - 0.026, zPort + 0.088);
  const magBtn = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.010, 0.014), darkMat);
  magBtn.position.set(width * 0.5 + 0.002, yPort - 0.032, zPort - 0.036);
  g.add(portPlate, brassCase, dustDoor, selector, redPip, whitePip, pinF, pinR, magBtn);
  return g;
}

// Folded Harris-style tactical twin bipod for Snipers & LMGs
function buildTacticalBipod(y, z, darkMat, steelMat, legLen = 0.19) {
  const g = new THREE.Group();
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.018, 0.034), darkMat);
  g.add(mount);
  for (const side of [-1, 1]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.018, 10), steelMat);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(side * 0.020, -0.006, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0045, legLen, 10), darkMat);
    leg.rotation.x = Math.PI / 2;
    leg.position.set(side * 0.024, -0.010, -legLen * 0.5 + 0.01);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.018, 10), darkMat);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(side * 0.024, -0.010, -legLen + 0.01);
    g.add(hinge, leg, foot);
  }
  g.position.set(0, y, z);
  return g;
}

// Exposed brass cartridge belt feeding into LMG receiver
function buildBrassAmmoBelt(x, y, z, brassMat, darkMat, count = 6) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0048, 0.038, 8), brassMat);
    bullet.rotation.x = Math.PI / 2;
    bullet.position.set(x - t * 0.022, y - Math.sin(t * Math.PI * 0.7) * 0.038, z + i * 0.0115);
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.005, 0.011), darkMat);
    link.position.set(bullet.position.x, bullet.position.y + 0.003, bullet.position.z);
    g.add(bullet, link);
  }
  return g;
}

// Folding skeleton tubular steel stock (AS VAL / AK-12 / G36C / MCX / UZI / MAC-10)
function buildFoldingWireStock(zStart, length, yCenter, darkMat, polymerMat, spreadH = 0.056) {
  const g = new THREE.Group();
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.052, 12), darkMat);
  hinge.position.set(0, yCenter, zStart);
  const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, length, 10), darkMat);
  topBar.rotation.x = Math.PI / 2;
  topBar.position.set(0, yCenter + spreadH * 0.42, zStart + length * 0.5);
  const botBar = new THREE.Mesh(new THREE.CylinderGeometry(0.0060, 0.0060, length * 1.03, 10), darkMat);
  botBar.rotation.x = Math.PI / 2 + 0.14;
  botBar.position.set(0, yCenter - spreadH * 0.34, zStart + length * 0.5);
  const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.034, spreadH * 1.75, 0.018), polymerMat);
  buttPad.position.set(0, yCenter - spreadH * 0.12, zStart + length);
  g.add(hinge, topBar, botBar, buttPad);
  return g;
}

// Iconic cylindrical Drum Magazine (Thompson 50-rd / MG3 / RPK drum)
function buildDrumMagazine(radius, thickness, y, z, mat, darkMat, steelMat) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 22), mat);
  drum.rotation.x = Math.PI / 2;
  const rimF = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.94, 0.004, 8, 22), darkMat);
  rimF.position.z = -thickness * 0.5;
  const rimR = rimF.clone();
  rimR.position.z = thickness * 0.5;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.28, radius * 0.28, thickness + 0.008, 14), steelMat);
  hub.rotation.x = Math.PI / 2;
  const key = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.72, 0.009, 0.006), steelMat);
  key.position.z = -thickness * 0.5 - 0.005;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.034, radius * 0.65, thickness * 0.85), darkMat);
  neck.position.set(0, radius * 0.85, 0);
  g.add(drum, rimF, rimR, hub, key, neck);
  g.position.set(0, y, z);
  return g;
}

// Iconic PP-19 Bizon 64-round under-barrel helical cylinder magazine
function buildHelicalMagazine(radius, length, y, z, mat, darkMat) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), mat);
  cyl.rotation.x = Math.PI / 2;
  g.add(cyl);
  for (let i = -3; i <= 3; i++) {
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.0025, radius + 0.0025, 0.006, 16), darkMat);
    rib.rotation.x = Math.PI / 2;
    rib.position.z = i * (length * 0.12);
    g.add(rib);
  }
  const capF = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, radius, 0.016, 16), darkMat);
  capF.rotation.x = Math.PI / 2;
  capF.position.z = -length * 0.5 - 0.006;
  const capR = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.90, 0.016, 16), darkMat);
  capR.rotation.x = Math.PI / 2;
  capR.position.z = length * 0.5 + 0.006;
  g.add(capF, capR);
  g.position.set(0, y, z);
  return g;
}

const weaponTemplateCache = new Map();

const sharedWeaponMats = new Map();
function getSharedWeaponMat(key, factory) {
  let m = sharedWeaponMats.get(key);
  if (!m) {
    m = factory();
    sharedWeaponMats.set(key, m);
  }
  return m;
}

// Merges all static non-animated weapon parts by material (drops 55+ draw calls -> ~6 draw calls!)
// while keeping animated gun_mag, gun_bolt, gun_trigger completely intact for reload/recoil!
function batchStaticWeaponParts(rootGroup) {
  if (!BufferGeometryUtils?.mergeGeometries) return rootGroup;
  rootGroup.updateMatrixWorld(true);
  const invRoot = new THREE.Matrix4().copy(rootGroup.matrixWorld).invert();
  const dynamicRoots = new Set();
  for (const ch of rootGroup.children) {
    if (ch.name === 'gun_mag' || ch.name === 'gun_bolt' || ch.name === 'gun_trigger') {
      dynamicRoots.add(ch);
    }
  }
  const isDynamicNode = (node) => {
    let cur = node;
    while (cur && cur !== rootGroup) {
      if (dynamicRoots.has(cur)) return true;
      cur = cur.parent;
    }
    return false;
  };

  const byMat = new Map();
  const toRemove = [];
  rootGroup.traverse((child) => {
    if (!child.isMesh || !child.geometry || !child.visible) return;
    if (isDynamicNode(child)) return;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!mat) return;
    try {
      let g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      const relM = new THREE.Matrix4().multiplyMatrices(invRoot, child.matrixWorld);
      g.applyMatrix4(relM);
      const keep = new Set(['position', 'normal', 'uv']);
      for (const attrName of Object.keys(g.attributes)) {
        if (!keep.has(attrName)) g.deleteAttribute(attrName);
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      }
      let arr = byMat.get(mat);
      if (!arr) { arr = []; byMat.set(mat, arr); }
      arr.push(g);
      toRemove.push(child);
    } catch {}
  });

  if (toRemove.length < 2) return rootGroup;
  for (const child of toRemove) {
    child.parent?.remove(child);
  }
  // Prune now-empty static containers
  for (let i = rootGroup.children.length - 1; i >= 0; i--) {
    const ch = rootGroup.children[i];
    if (!dynamicRoots.has(ch) && ch.isGroup && ch.children.length === 0) {
      rootGroup.remove(ch);
    }
  }
  for (const [mat, geos] of byMat.entries()) {
    if (!geos.length) continue;
    const combined = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
    if (combined) {
      if (geos.length > 1) {
        for (const g of geos) g.dispose();
      }
      rootGroup.add(new THREE.Mesh(combined, mat));
    } else {
      for (const g of geos) rootGroup.add(new THREE.Mesh(g, mat));
    }
  }
  return rootGroup;
}

function buildWeaponModelDirect(weaponId = 'ak47', skinId = 'default', attachments = {}) {
  const group = new THREE.Group();
  const skin = WEAPON_SKINS[skinId] || WEAPON_SKINS.default;
  const skinTex = getWeaponSkinTexture(skinId);
  const metalBump = getWeaponMetalBumpTexture();
  const woodTex = getWoodStockTexture('#85461e');
  const polyTex = getPolymerGripTexture('#1f242d');

  const envMap = getStudioEnvMap();
  const bodyMat = getSharedWeaponMat(`body_${skinId}`, () => new THREE.MeshStandardMaterial({
    map: skinTex,
    bumpMap: metalBump,
    bumpScale: 0.0045,
    envMap,
    metalness: Math.min(0.88, skin.metalness + 0.06),
    roughness: Math.max(0.20, skin.roughness - 0.04),
    envMapIntensity: 1.15
  }));
  const darkMetal = getSharedWeaponMat('dark_metal', () => new THREE.MeshStandardMaterial({
    color: '#1f242e',
    bumpMap: metalBump,
    bumpScale: 0.004,
    envMap,
    metalness: 0.80,
    roughness: 0.30,
    envMapIntensity: 1.05
  }));
  const polymerMat = getSharedWeaponMat('polymer', () => new THREE.MeshStandardMaterial({
    map: polyTex,
    color: '#ffffff',
    metalness: 0.14,
    roughness: 0.62
  }));
  const woodMat = getSharedWeaponMat('wood', () => new THREE.MeshStandardMaterial({
    map: woodTex,
    metalness: 0.06,
    roughness: 0.38
  }));
  const steelMat = getSharedWeaponMat('steel', () => new THREE.MeshStandardMaterial({
    color: '#90a0b5',
    bumpMap: metalBump,
    bumpScale: 0.0025,
    envMap,
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.25
  }));
  const brassMat = getSharedWeaponMat('brass', () => new THREE.MeshStandardMaterial({
    color: '#eab308',
    envMap,
    metalness: 0.88,
    roughness: 0.20,
    envMapIntensity: 1.15
  }));
  const useWoodGrip = skinId === 'default' && ['ak47', 'svd', 'rpk', 'm870', 'kar98k', 'thompson', 'db_shotgun', 'm1911', 'pkm'].includes(weaponId);
  const gripMat = useWoodGrip
    ? woodMat
    : (skinId === 'default' && (weaponId === 'scarh' || weaponId === 'mcx')
      ? getSharedWeaponMat('grip_fde', () => new THREE.MeshStandardMaterial({ map: getPolymerGripTexture('#a28458'), metalness: 0.14, roughness: 0.56 }))
      : getSharedWeaponMat(`grip_${skinId}`, () => new THREE.MeshStandardMaterial({
        map: getPolymerGripTexture(skin.woodOrGrip || '#1f242d'),
        metalness: 0.14,
        roughness: 0.54
      })));
  const accentMat = getSharedWeaponMat(`accent_${skinId}`, () => new THREE.MeshStandardMaterial({
    color: skin.accentColor,
    metalness: 0.78,
    roughness: 0.26
  }));

  let magMesh = null;
  let boltMesh = null;
  let muzzleZ = -0.62;
  let barrelY = 0.030;
  let railY = 0.075;
  let opticZ = 0.01;
  let ironSightY = 0.088;
  let ironRearZ = 0.07;
  let aimDistanceZ = -0.28;

  const isExt = attachments?.mag === 'extended';
  const wCfg = WEAPONS[weaponId] || WEAPONS.ak47;
  const isMelee = Boolean(wCfg.isMelee);
  const isSniper = Boolean(wCfg.isSniper);
  const optic = attachments?.optic || 'iron';
  const useExternalOptic = !isSniper && !isMelee && (optic === 'reddot' || optic === 'acog');

  // Sculpted Trigger Guard Bow, Crescent Curved Trigger & Bolt Carrier
  if (!isMelee) {
    const tGuardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.006, 0.056), darkMetal);
    tGuardBottom.position.set(0, -0.036, 0.052);
    const tGuardFront = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.028, 0.006), darkMetal);
    tGuardFront.position.set(0, -0.024, 0.026);
    tGuardFront.rotation.x = 0.22;
    const tGuardRear = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.024, 0.006), darkMetal);
    tGuardRear.position.set(0, -0.024, 0.078);
    tGuardRear.rotation.x = -0.25;
    const trigger = extrudeSideProfile([
      [-0.052, -0.004], [-0.062, -0.004], [-0.058, -0.018], [-0.066, -0.028], [-0.058, -0.029], [-0.050, -0.018]
    ], 0.0055, 0.001, steelMat);
    trigger.name = 'gun_trigger';

    boltMesh = new THREE.Group();
    const boltSlide = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.015, 0.072), steelMat);
    const chargingKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.0055, 0.024, 10), steelMat);
    chargingKnob.rotation.z = Math.PI / 2;
    chargingKnob.position.set(0.014, 0, -0.02);
    boltMesh.add(boltSlide, chargingKnob);
    boltMesh.position.set(0.025, 0.038, 0.01);
    group.add(tGuardBottom, tGuardFront, tGuardRear, trigger, boltMesh);
  }

  if (weaponId === 'ak47') {
    // Milled AK-47 / AKM Receiver + Ribbed Stamped Dust Cover + Riveted Trunnion + Rear Sight Ramp
    const rec = extrudeSideProfile([
      [-0.145, -0.020], [0.145, -0.020], [0.145, 0.044], [-0.145, 0.044]
    ], 0.052, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.140, 0.042], [0.118, 0.042], [0.106, 0.068], [-0.128, 0.066]
    ], 0.043, 0.005, darkMetal);
    for (const rz of [-0.04, 0.01, 0.06]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.005, 0.012), darkMetal);
      rib.position.set(0, 0.067, rz);
      group.add(rib);
    }
    const rearBlock = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.030, 0.042), darkMetal);
    rearBlock.position.set(0, 0.056, -0.132);
    const magDimple = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.014, 0.032), darkMetal);
    magDimple.position.set(0, 0.006, -0.06);

    // Sculpted Contoured Laminated Birch Stock + Steel Buttplate & Sling Loop
    const stockMat = skinId === 'default' ? woodMat : bodyMat;
    const stock = extrudeSideProfile([
      [-0.140, -0.014], [-0.175, -0.018], [-0.250, -0.040], [-0.398, -0.068],
      [-0.398, 0.026], [-0.240, 0.034], [-0.175, 0.032], [-0.140, 0.038]
    ], 0.042, 0.005, stockMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.098, 0.014), darkMetal);
    buttPlate.position.set(0, -0.021, 0.402);

    const grip = buildErgonomicGrip(0.108, 0.104, 0.032, gripMat, darkMetal, -0.016, 0.034);

    // Classic AK Laminated Handguard + Ferrule Retainer + Vented Gas Tube
    const hgLower = extrudeSideProfile([
      [0.145, -0.014], [0.255, -0.018], [0.356, -0.008], [0.356, 0.032], [0.145, 0.034]
    ], 0.048, 0.005, stockMat);
    const hgFerrule = new THREE.Mesh(new THREE.BoxGeometry(0.051, 0.046, 0.018), darkMetal);
    hgFerrule.position.set(0, 0.012, -0.356);
    const hgUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.021, 0.19, 14), stockMat);
    hgUpper.rotation.x = Math.PI / 2;
    hgUpper.position.set(0, 0.045, -0.245);
    const barrel = buildPrecisionBarrel({ rFront: 0.0105, rRear: 0.013, length: 0.39, y: 0.024, zCenter: -0.455, darkMat: darkMetal, steelMat });
    const cleaningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.34, 8), steelMat);
    cleaningRod.rotation.x = Math.PI / 2;
    cleaningRod.position.set(0, 0.004, -0.44);
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.042, 0.034), darkMetal);
    gasBlock.position.set(0, 0.034, -0.36);

    const fsTower = extrudeSideProfile([
      [0.548, 0.020], [0.584, 0.020], [0.576, 0.068], [0.558, 0.068]
    ], 0.016, 0.002, darkMetal);
    const muzzleBrake = buildMultiBaffleBrake(0.013, 0.024, -0.648, darkMetal, steelMat);
    muzzleBrake.rotation.z = 0.35;

    magMesh = buildCurvedMagazine(
      0.033, 0.064, isExt ? 0.052 : 0.043, 5, 0.095,
      -0.038, -0.055,
      skinId === 'default' ? accentMat : bodyMat,
      darkMetal
    );

    if (useExternalOptic) {
      const mountArm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.042, 0.12), darkMetal);
      mountArm.position.set(-0.022, 0.055, 0.01);
      group.add(mountArm, buildPicatinnyRail(0.14, 0.034, 0.078, 0.01, darkMetal));
      railY = 0.084;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(-0.11, -0.57, 0.084, darkMetal, '#4ade80', '#f97316', 0.0085));
      ironSightY = 0.087;
      ironRearZ = -0.11;
    }

    group.add(
      rec, dustCover, rearBlock, magDimple, stock, buttPlate, grip,
      hgLower, hgFerrule, hgUpper, barrel, cleaningRod, gasBlock, fsTower, muzzleBrake, magMesh,
      buildReceiverPolish(0.052, 0.034, 0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.675;
  } else if (weaponId === 'm4a1') {
    const rec = extrudeSideProfile([
      [-0.105, -0.022], [0.005, -0.022], [0.012, -0.046], [0.088, -0.046],
      [0.098, -0.015], [0.115, 0.010], [0.115, 0.068], [-0.105, 0.068]
    ], 0.048, 0.004, bodyMat);
    const brassDeflect = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.024), darkMetal);
    brassDeflect.position.set(0.028, 0.046, 0.048);
    const forwardAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.028, 10), steelMat);
    forwardAssist.rotation.x = Math.PI / 2;
    forwardAssist.rotation.y = 0.35;
    forwardAssist.position.set(0.028, 0.032, 0.072);

    group.add(buildPicatinnyRail(0.47, 0.034, 0.072, -0.085, darkMetal));
    railY = 0.079;
    opticZ = 0.01;

    // Buffer Tube + LMT SOPMOD Crane Buttstock w/ Rubber Pad
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.036, 0.22);
    const castleNut = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.016, 12), steelMat);
    castleNut.rotation.x = Math.PI / 2;
    castleNut.position.set(0, 0.036, 0.118);
    const stock = extrudeSideProfile([
      [-0.185, 0.010], [-0.22, -0.012], [-0.368, -0.052], [-0.376, -0.046],
      [-0.372, 0.058], [-0.21, 0.060], [-0.185, 0.052]
    ], 0.048, 0.005, polymerMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.110, 0.014), darkMetal);
    buttPad.position.set(0, 0.004, 0.376);

    const grip = buildErgonomicGrip(0.106, 0.102, 0.033, polymerMat, darkMetal, -0.020, 0.034);

    // Free-Float Slotted M-LOK Quad Shroud + Exposed Stainless Gas Tube + AFG + PEQ-15
    const shroud = buildTacticalHandguard({
      zStart: -0.115,
      zEnd: -0.365,
      yCenter: 0.034,
      width: 0.052,
      height: 0.056,
      shroudMat: skinId === 'default' ? darkMetal : accentMat,
      darkMat: darkMetal,
      steelMat,
      gasTubeY: 0.052,
      hasQuadRails: true
    });
    const foregrip = extrudeSideProfile([
      [0.20, 0.002], [0.275, 0.002], [0.245, -0.055], [0.205, -0.045]
    ], 0.028, 0.003, polymerMat);
    const peq = buildTacticalLaserModule(0.036, 0.034, -0.27, darkMetal, '#ef4444');

    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.012, length: 0.30, y: 0.032, zCenter: -0.45, darkMat: darkMetal, steelMat });
    const birdcage = buildMultiBaffleBrake(0.013, 0.032, -0.60, darkMetal, steelMat);

    magMesh = buildCurvedMagazine(0.033, 0.062, isExt ? 0.048 : 0.039, 4, 0.055, -0.035, -0.04, polymerMat, darkMetal);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.34, 0.090, darkMetal, '#38bdf8', '#4ade80', 0.008));
      ironSightY = 0.093;
      ironRearZ = 0.095;
    }

    group.add(
      rec, brassDeflect, forwardAssist, tube, castleNut, stock, buttPad,
      grip, shroud, foregrip, peq, barrel, birdcage, magMesh,
      buildReceiverPolish(0.048, 0.038, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.63;
  } else if (weaponId === 'scarh') {
    const fdeMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#c4a468', bumpMap: metalBump, bumpScale: 0.004, roughness: 0.38, metalness: 0.36 })
      : bodyMat;
    const upper = extrudeSideProfile([
      [-0.145, 0.005], [0.335, 0.005], [0.335, 0.076], [-0.145, 0.076]
    ], 0.054, 0.004, fdeMat);
    const lower = extrudeSideProfile([
      [-0.125, -0.028], [0.005, -0.028], [0.010, -0.048], [0.085, -0.048], [0.095, 0.005], [-0.125, 0.005]
    ], 0.048, 0.004, gripMat);
    // Front monolithic SCAR ventilation slots
    for (let s = 0; s < 3; s++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.057, 0.014, 0.032), darkMetal);
      vent.position.set(0, 0.040, -0.175 - s * 0.048);
      group.add(vent);
    }

    group.add(buildPicatinnyRail(0.47, 0.036, 0.080, -0.09, darkMetal));
    railY = 0.087;
    opticZ = 0.01;

    // Iconic SCAR Ugg-Boot Folding Cheek-Riser Stock
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.062, 12), darkMetal);
    hinge.position.set(0, 0.022, 0.155);
    const stock = extrudeSideProfile([
      [-0.165, -0.012], [-0.215, -0.016], [-0.398, -0.064], [-0.415, -0.062],
      [-0.410, 0.058], [-0.165, 0.064]
    ], 0.046, 0.005, gripMat);
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.024, 0.17), fdeMat);
    cheekRest.position.set(0, 0.070, 0.275);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.122, 0.016), darkMetal);
    buttPad.position.set(0, -0.003, 0.412);

    const grip = buildErgonomicGrip(0.106, 0.100, 0.033, darkMetal, polymerMat, -0.024, 0.034);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.085, 12), polymerMat);
    vertGrip.position.set(0, -0.046, -0.22);
    const peq = buildTacticalLaserModule(-0.038, 0.040, -0.24, darkMetal, '#22c55e');

    const barrel = buildPrecisionBarrel({ rFront: 0.012, rRear: 0.014, length: 0.32, y: 0.032, zCenter: -0.46, darkMat: darkMetal, steelMat });
    const comp = buildMultiBaffleBrake(0.016, 0.032, -0.62, steelMat, darkMetal, true);

    magMesh = new THREE.Group();
    const magBox = new THREE.Mesh(new THREE.BoxGeometry(0.038, isExt ? 0.195 : 0.155, 0.076), fdeMat);
    const magPad = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.082), polymerMat);
    magPad.position.y = isExt ? -0.10 : -0.08;
    magMesh.add(magBox, magPad);
    magMesh.position.set(0, -0.094, -0.045);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.30, 0.096, darkMetal, '#4ade80', '#facc15', 0.0085));
      ironSightY = 0.099;
      ironRearZ = 0.11;
    }

    group.add(
      upper, lower, hinge, stock, cheekRest, buttPad, grip, vertGrip, peq, barrel, comp, magMesh,
      buildReceiverPolish(0.054, 0.042, 0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.65;
  } else if (weaponId === 'aug') {
    // Steyr AUG A3 Bullpup Chassis (Rear Magazine Behind Trigger!)
    const odMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#3f4e37', bumpMap: polyTex, bumpScale: 0.006, roughness: 0.48, metalness: 0.25 })
      : bodyMat;
    const chassis = extrudeSideProfile([
      [-0.365, -0.062], [-0.14, -0.055], [-0.04, -0.015], [0.22, -0.005],
      [0.24, 0.058], [-0.365, 0.065]
    ], 0.052, 0.005, odMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.125, 0.018), darkMetal);
    buttPad.position.set(0, 0.002, 0.370);

    group.add(buildPicatinnyRail(0.28, 0.034, 0.072, -0.06, darkMetal));
    railY = 0.079;
    opticZ = -0.04;

    const grip = buildErgonomicGrip(0.028, 0.098, 0.033, polymerMat, darkMetal, -0.012, 0.034);
    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.088, 12), polymerMat);
    foregrip.position.set(0, -0.048, -0.18);
    foregrip.rotation.x = 0.12;
    const handleLug = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.032, 12), darkMetal);
    handleLug.rotation.x = Math.PI / 2;
    handleLug.position.set(0, 0.032, -0.255);

    const barrel = buildPrecisionBarrel({ rFront: 0.011, rRear: 0.013, length: 0.34, y: 0.032, zCenter: -0.39, darkMat: darkMetal, steelMat });
    const tulip = buildMultiBaffleBrake(0.0135, 0.032, -0.56, steelMat, darkMetal);

    magMesh = new THREE.Group();
    const waffleMat = new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.85 });
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.032, isExt ? 0.19 : 0.15, 0.062), waffleMat);
    const magFloor = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.068), polymerMat);
    magFloor.position.y = isExt ? -0.096 : -0.076;
    magMesh.add(magBody, magFloor);
    magMesh.position.set(0, -0.095, 0.20);
    magMesh.rotation.x = 0.12;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.06, -0.19, 0.090, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.093;
      ironRearZ = 0.06;
    }

    group.add(
      chassis, buttPad, grip, foregrip, handleLug, barrel, tulip, magMesh,
      buildReceiverPolish(0.052, 0.036, 0.14, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.59;
  } else if (weaponId === 'm16a4') {
    // Classic M16A4 Long-Barrel Marksman Rifle w/ KAC M5 RAS Quad Rail
    const rec = extrudeSideProfile([
      [-0.11, -0.022], [0.005, -0.022], [0.012, -0.044], [0.085, -0.044],
      [0.095, -0.015], [0.115, 0.010], [0.115, 0.068], [-0.11, 0.068]
    ], 0.048, 0.004, bodyMat);
    const fullStock = extrudeSideProfile([
      [-0.11, -0.004], [-0.39, -0.070], [-0.39, 0.056], [-0.11, 0.052]
    ], 0.044, 0.005, polymerMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.126, 0.014), darkMetal);
    buttPlate.position.set(0, -0.008, 0.394);
    const grip = buildErgonomicGrip(0.106, 0.102, 0.033, polymerMat, darkMetal, -0.020, 0.034);

    group.add(buildPicatinnyRail(0.54, 0.034, 0.072, -0.12, darkMetal));
    railY = 0.079;
    opticZ = 0.01;

    const handguard = buildTacticalHandguard({
      zStart: -0.115,
      zEnd: -0.415,
      yCenter: 0.033,
      width: 0.054,
      height: 0.060,
      shroudMat: polymerMat,
      darkMat: darkMetal,
      steelMat,
      gasTubeY: 0.052,
      hasQuadRails: true
    });
    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.082, 12), polymerMat);
    foregrip.position.set(0, -0.042, -0.26);
    const peq = buildTacticalLaserModule(0.036, 0.034, -0.34, darkMetal, '#38bdf8');
    const a2Sight = extrudeSideProfile([
      [0.412, 0.022], [0.448, 0.022], [0.436, 0.076], [0.422, 0.076]
    ], 0.014, 0.002, darkMetal);

    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.012, length: 0.34, y: 0.032, zCenter: -0.54, darkMat: darkMetal, steelMat });
    const flash = buildMultiBaffleBrake(0.013, 0.032, -0.71, steelMat, darkMetal);

    magMesh = buildCurvedMagazine(0.033, 0.062, isExt ? 0.048 : 0.038, 4, 0.05, -0.035, -0.04, steelMat, darkMetal);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.40, 0.090, darkMetal, '#38bdf8', '#f97316', 0.008));
      ironSightY = 0.093;
      ironRearZ = 0.095;
    }

    group.add(
      rec, fullStock, buttPlate, grip, handguard, foregrip, peq, a2Sight, barrel, flash, magMesh,
      buildReceiverPolish(0.048, 0.038, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.74;
    barrelY = 0.032;
  } else if (weaponId === 'famas') {
    // French FAMAS F1 Bullpup with Hollow Carry Handle, Suspended Charging Lever, Bipod & Straight Steel 25-Rd Mag
    const chassis = extrudeSideProfile([
      [-0.34, -0.048], [-0.14, -0.048], [-0.08, -0.012], [0.22, -0.005], [0.23, 0.062], [-0.34, 0.060]
    ], 0.050, 0.005, bodyMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.106, 0.020), darkMetal);
    buttPad.position.set(0, 0.006, 0.345);
    const handleRear = extrudeSideProfile([
      [-0.14, 0.058], [-0.10, 0.058], [-0.08, 0.098], [-0.125, 0.098]
    ], 0.036, 0.003, darkMetal);
    const handleFront = extrudeSideProfile([
      [0.145, 0.058], [0.195, 0.058], [0.180, 0.098], [0.135, 0.098]
    ], 0.036, 0.003, darkMetal);
    const handleBridge = extrudeSideProfile([
      [-0.135, 0.092], [0.190, 0.092], [0.190, 0.110], [-0.135, 0.110]
    ], 0.036, 0.003, darkMetal);
    const innerHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.042, 8), steelMat);
    innerHandle.position.set(0, 0.076, -0.03);
    const grip = buildErgonomicGrip(0.010, 0.098, 0.033, polymerMat, darkMetal, -0.012, 0.032);
    const knuckleGuard = extrudeSideProfile([
      [0.065, -0.008], [0.075, -0.014], [0.025, -0.090], [0.010, -0.084]
    ], 0.016, 0.002, polymerMat);

    group.add(buildPicatinnyRail(0.24, 0.032, 0.114, -0.02, darkMetal));
    railY = 0.121;
    opticZ = -0.02;

    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.012, length: 0.34, y: 0.036, zCenter: -0.37, darkMat: darkMetal, steelMat });
    const grenadeCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.045, 12), steelMat);
    grenadeCollar.rotation.x = Math.PI / 2;
    grenadeCollar.position.set(0, 0.036, -0.46);
    const flash = buildMultiBaffleBrake(0.013, 0.036, -0.545, darkMetal, steelMat);

    for (const bx of [-0.031, 0.031]) {
      const bipodLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.22, 8), steelMat);
      bipodLeg.rotation.x = Math.PI / 2;
      bipodLeg.position.set(bx, 0.048, -0.11);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.018, 8), darkMetal);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(bx, 0.048, 0.0);
      group.add(bipodLeg, foot);
    }

    magMesh = new THREE.Group();
    const masBox = new THREE.Mesh(new THREE.BoxGeometry(0.030, isExt ? 0.18 : 0.145, 0.062), steelMat);
    const masPad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.010, 0.068), darkMetal);
    masPad.position.y = isExt ? -0.092 : -0.074;
    magMesh.add(masBox, masPad);
    magMesh.position.set(0, -0.090, 0.175);
    magMesh.rotation.x = 0.12;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.16, 0.124, darkMetal, '#38bdf8', '#f97316', 0.008));
      ironSightY = 0.127;
      ironRearZ = 0.11;
    }

    group.add(
      chassis, buttPad, handleRear, handleFront, handleBridge, innerHandle, grip, knuckleGuard, barrel, grenadeCollar, flash, magMesh,
      buildReceiverPolish(0.050, 0.038, 0.15, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.575;
    barrelY = 0.036;
  } else if (weaponId === 'galil') {
    // Galil ACE 7.62 Assault Rifle with Vented Handguard, Skeleton Stock & 35-Rd Curved Mag
    const rec = extrudeSideProfile([
      [-0.14, -0.020], [0.15, -0.020], [0.15, 0.048], [-0.14, 0.048]
    ], 0.050, 0.004, bodyMat);
    const topCover = extrudeSideProfile([
      [-0.135, 0.046], [0.14, 0.046], [0.14, 0.064], [-0.135, 0.064]
    ], 0.045, 0.004, darkMetal);
    const handguard = buildTacticalHandguard({
      zStart: -0.15,
      zEnd: -0.365,
      yCenter: 0.022,
      width: 0.052,
      height: 0.062,
      shroudMat: polymerMat,
      darkMat: darkMetal,
      steelMat,
      gasTubeY: 0.046,
      hasQuadRails: true
    });
    const grip = buildErgonomicGrip(0.106, 0.100, 0.033, gripMat, darkMetal, -0.018, 0.034);
    const foregrip = extrudeSideProfile([
      [0.21, -0.006], [0.275, -0.006], [0.245, -0.058], [0.205, -0.048]
    ], 0.028, 0.003, polymerMat);

    // Iconic Galil Folding Tubular Skeleton Stock + Pivot Knuckle
    const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.054, 10), darkMetal);
    knuckle.position.set(0, 0.020, 0.148);
    const stockTopBar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.25, 10), steelMat);
    stockTopBar.rotation.x = Math.PI / 2;
    stockTopBar.position.set(0, 0.032, 0.265);
    const stockBotBar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 10), steelMat);
    stockBotBar.rotation.x = Math.PI / 2.22;
    stockBotBar.position.set(0, -0.010, 0.265);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.098, 0.024), polymerMat);
    buttPad.position.set(0, -0.002, 0.392);

    group.add(buildPicatinnyRail(0.43, 0.034, 0.067, -0.075, darkMetal));
    railY = 0.074;
    opticZ = 0.01;

    const barrel = buildPrecisionBarrel({ rFront: 0.011, rRear: 0.013, length: 0.34, y: 0.032, zCenter: -0.49, darkMat: darkMetal, steelMat });
    const flash = buildMultiBaffleBrake(0.014, 0.032, -0.64, steelMat, darkMetal);

    magMesh = buildCurvedMagazine(0.033, 0.064, isExt ? 0.052 : 0.042, 5, 0.105, -0.036, -0.055, polymerMat, darkMetal);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.10, -0.56, 0.084, darkMetal, '#4ade80', '#f97316', 0.0085));
      ironSightY = 0.087;
      ironRearZ = 0.10;
    }

    group.add(
      rec, topCover, handguard, grip, foregrip, knuckle, stockTopBar, stockBotBar, buttPad, barrel, flash, magMesh,
      buildReceiverPolish(0.050, 0.036, 0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.67;
    barrelY = 0.032;
  } else if (weaponId === 'hk416') {
    // HK416D CAG Bronze Spec-Ops Carbine (Piston Monolithic Receiver + Slotted Geissele SMR + HK E1 Stock)
    const hgBronze = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#6b5842', bumpMap: metalBump, bumpScale: 0.004, metalness: 0.72, roughness: 0.28 })
      : bodyMat;
    const rec = extrudeSideProfile([
      [-0.11, -0.022], [0.005, -0.022], [0.012, -0.044], [0.085, -0.044],
      [0.095, -0.015], [0.118, 0.010], [0.118, 0.073], [-0.11, 0.073]
    ], 0.048, 0.004, bodyMat);
    const hgQuad = buildTacticalHandguard({
      zStart: -0.118,
      zEnd: -0.365,
      yCenter: 0.037,
      width: 0.052,
      height: 0.064,
      shroudMat: hgBronze,
      darkMat: darkMetal,
      steelMat,
      gasTubeY: 0.056,
      hasQuadRails: true
    });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.038, 0.23);
    const craneStock = extrudeSideProfile([
      [-0.19, 0.006], [-0.365, -0.052], [-0.372, 0.062], [-0.19, 0.060]
    ], 0.048, 0.005, polymerMat);
    const hkButtPad = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.116, 0.016), darkMetal);
    hkButtPad.position.set(0, 0.005, 0.376);
    const grip = buildErgonomicGrip(0.106, 0.102, 0.034, gripMat, darkMetal, -0.020, 0.034);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.072, 12), polymerMat);
    vertGrip.position.set(0, -0.036, -0.23);
    const peq = buildTacticalLaserModule(0.036, 0.038, -0.27, darkMetal, '#22c55e');

    group.add(buildPicatinnyRail(0.47, 0.034, 0.077, -0.11, darkMetal));
    railY = 0.084;
    opticZ = 0.01;

    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.012, length: 0.28, y: 0.034, zCenter: -0.45, darkMat: darkMetal, steelMat });
    const flash = buildMultiBaffleBrake(0.014, 0.034, -0.60, steelMat, darkMetal);

    magMesh = buildCurvedMagazine(0.033, 0.062, isExt ? 0.048 : 0.039, 4, 0.06, -0.035, -0.04, polymerMat, darkMetal);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.35, 0.093, darkMetal, '#38bdf8', '#facc15', 0.008));
      ironSightY = 0.096;
      ironRearZ = 0.095;
    }

    group.add(
      rec, hgQuad, tube, craneStock, hkButtPad, grip, vertGrip, peq, barrel, flash, magMesh,
      buildReceiverPolish(0.048, 0.040, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.63;
    barrelY = 0.034;
  } else if (weaponId === 'mp5') {
    const rec = extrudeSideProfile([
      [-0.12, -0.018], [0.125, -0.018], [0.125, 0.056], [-0.12, 0.056]
    ], 0.046, 0.004, bodyMat);
    const cockingTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 12), darkMetal);
    cockingTube.rotation.x = Math.PI / 2;
    cockingTube.position.set(0, 0.052, -0.18);
    const slapHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.032, 8), steelMat);
    slapHandle.rotation.z = Math.PI / 2.6;
    slapHandle.position.set(-0.022, 0.060, -0.26);

    const sdCan = buildSuppressorUnit(0.026, -0.27, 0.34, 0.027, darkMetal, steelMat);
    const ribRing = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.145, 16), polymerMat);
    ribRing.rotation.x = Math.PI / 2;
    ribRing.position.set(0, 0.026, -0.175);

    const rodL = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.22, 8), steelMat);
    rodL.rotation.x = Math.PI / 2;
    rodL.position.set(-0.023, 0.028, 0.23);
    const rodR = rodL.clone();
    rodR.position.x = 0.023;
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.108, 0.026), polymerMat);
    butt.position.set(0, 0.004, 0.34);

    const grip = buildErgonomicGrip(0.086, 0.098, 0.033, polymerMat, darkMetal, -0.016, 0.032);

    magMesh = buildCurvedMagazine(0.025, 0.042, isExt ? 0.048 : 0.040, 4, 0.105, -0.028, -0.05, accentMat, darkMetal);

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.14, 0.032, 0.064, 0.01, darkMetal));
      railY = 0.070;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(0.09, -0.28, 0.078, darkMetal, '#4ade80', '#f97316', 0.0075));
      ironSightY = 0.081;
      ironRearZ = 0.09;
    }

    group.add(rec, cockingTube, slapHandle, sdCan, ribRing, rodL, rodR, butt, grip, magMesh, buildReceiverPolish(0.046, 0.034, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.44;
  } else if (weaponId === 'p90') {
    const frame = extrudeSideProfile([
      [-0.27, -0.068], [-0.10, -0.068], [-0.06, -0.018], [-0.01, -0.018],
      [0.01, -0.068], [0.16, -0.068], [0.22, -0.012], [0.23, 0.058],
      [0.06, 0.068], [-0.27, 0.062]
    ], 0.052, 0.005, bodyMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.128, 0.016), darkMetal);
    buttPad.position.set(0, -0.002, 0.274);
    const optBridge = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.042, 0.14), darkMetal);
    optBridge.position.set(0, 0.086, -0.15);
    group.add(buildPicatinnyRail(0.14, 0.034, 0.112, -0.15, darkMetal));
    railY = 0.118;
    opticZ = -0.15;

    const barrel = buildPrecisionBarrel({ rFront: 0.0105, rRear: 0.0115, length: 0.13, y: 0.026, zCenter: -0.29, darkMat: darkMetal, steelMat });
    const comp = buildMultiBaffleBrake(0.0125, 0.026, -0.355, steelMat, darkMetal);

    magMesh = new THREE.Group();
    const magShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.026, 0.28),
      new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.52 })
    );
    const magCore = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.016, 0.25), brassMat);
    const magLatch = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.012, 0.024), darkMetal);
    magLatch.position.z = 0.13;
    magMesh.add(magShell, magCore, magLatch);
    magMesh.position.set(0, 0.075, 0.07);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(-0.085, -0.21, 0.125, darkMetal, '#38bdf8', '#facc15', 0.0075));
      ironSightY = 0.128;
      ironRearZ = -0.085;
    }

    group.add(frame, buttPad, optBridge, barrel, comp, magMesh);
    muzzleZ = -0.38;
  } else if (weaponId === 'vector') {
    // Iconic KRISS Vector .45 Super-V Drop Chassis + Long Stick Magazine + Fluted Shroud
    const chassis = extrudeSideProfile([
      [-0.12, 0.005], [0.16, 0.005], [0.19, -0.045], [0.06, -0.095],
      [-0.02, -0.095], [-0.04, -0.020], [-0.12, -0.020], [-0.12, 0.068], [0.16, 0.068]
    ], 0.050, 0.004, bodyMat);
    const upperRail = buildPicatinnyRail(0.28, 0.034, 0.072, -0.02, darkMetal);
    railY = 0.079;
    opticZ = -0.02;

    const foldHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.046, 10), darkMetal);
    foldHinge.position.set(0, 0.026, 0.124);
    const foldStock = extrudeSideProfile([
      [-0.12, 0.010], [-0.36, -0.038], [-0.36, 0.050], [-0.12, 0.052]
    ], 0.034, 0.004, polymerMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.092, 0.014), darkMetal);
    buttPad.position.set(0, 0.006, 0.366);
    const grip = buildErgonomicGrip(0.098, 0.094, 0.032, polymerMat, darkMetal, -0.016, 0.032);
    const barrelShroud = buildPrecisionBarrel({ rFront: 0.019, rRear: 0.020, length: 0.16, y: 0.032, zCenter: -0.24, darkMat: darkMetal, steelMat, fluted: true });
    const peq = buildTacticalLaserModule(0.034, 0.034, -0.14, darkMetal, '#38bdf8');

    magMesh = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.027, isExt ? 0.22 : 0.175, 0.040), polymerMat);
    const stickPad = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.014, 0.046), darkMetal);
    stickPad.position.y = isExt ? -0.112 : -0.090;
    magMesh.add(stick, stickPad);
    magMesh.position.set(0, -0.125, -0.085);
    magMesh.rotation.x = 0.26;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.09, -0.15, 0.088, darkMetal, '#38bdf8', '#f97316', 0.008));
      ironSightY = 0.091;
      ironRearZ = 0.09;
    }

    group.add(chassis, upperRail, foldHinge, foldStock, buttPad, grip, barrelShroud, peq, magMesh, buildReceiverPolish(0.050, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.33;
    barrelY = 0.032;
  } else if (weaponId === 'ump45') {
    // HK UMP-45 Submachine Gun (Slotted Handguard + .45 ACP Stick Mag + Skeleton Folding Stock)
    const rec = extrudeSideProfile([
      [-0.14, -0.022], [0.26, -0.022], [0.26, 0.062], [-0.14, 0.062]
    ], 0.050, 0.004, bodyMat);
    for (let v = 0; v < 3; v++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.053, 0.012, 0.024), darkMetal);
      vent.position.set(0, 0.026, -0.14 - v * 0.038);
      group.add(vent);
    }
    const foldStock = extrudeSideProfile([
      [-0.14, -0.015], [-0.37, -0.048], [-0.37, 0.044], [-0.14, 0.048]
    ], 0.032, 0.004, polymerMat);
    const stockCutout = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.042, 0.15), darkMetal);
    stockCutout.position.set(0, -0.002, 0.255);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.094, 0.014), darkMetal);
    buttPad.position.set(0, -0.002, 0.374);
    const grip = buildErgonomicGrip(0.102, 0.096, 0.033, polymerMat, darkMetal, -0.018, 0.032);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.075, 12), polymerMat);
    vertGrip.position.set(0, -0.052, -0.19);
    const barrel = buildPrecisionBarrel({ rFront: 0.012, rRear: 0.013, length: 0.16, y: 0.030, zCenter: -0.34, darkMat: darkMetal, steelMat });
    const flange = buildMultiBaffleBrake(0.014, 0.030, -0.41, darkMetal, steelMat);

    group.add(buildPicatinnyRail(0.36, 0.034, 0.066, -0.05, darkMetal));
    railY = 0.073;
    opticZ = 0.01;

    magMesh = new THREE.Group();
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.027, isExt ? 0.23 : 0.185, 0.045), polymerMat);
    const magBase = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.052), darkMetal);
    magBase.position.y = isExt ? -0.118 : -0.095;
    magMesh.add(magBody, magBase);
    magMesh.position.set(0, -0.115, -0.065);
    magMesh.rotation.x = 0.05;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.24, 0.082, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.085;
      ironRearZ = 0.11;
    }

    group.add(rec, foldStock, stockCutout, buttPad, grip, vertGrip, barrel, flange, magMesh, buildReceiverPolish(0.050, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.44;
    barrelY = 0.030;
  } else if (weaponId === 'mp7') {
    // HK MP7A1 4.6mm PDW (Compact Polymer Chassis + Folding Front Grip + 40rd Grip Mag)
    const chassis = extrudeSideProfile([
      [-0.145, -0.012], [0.145, -0.012], [0.145, 0.062], [-0.145, 0.062]
    ], 0.044, 0.004, bodyMat);
    const pistolGrip = buildErgonomicGrip(0.042, 0.092, 0.032, polymerMat, darkMetal, -0.010, 0.026);
    const foldGrip = extrudeSideProfile([
      [0.095, -0.010], [0.130, -0.010], [0.145, -0.092], [0.108, -0.095]
    ], 0.028, 0.003, polymerMat);

    const rodL = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.16, 8), steelMat);
    rodL.rotation.x = Math.PI / 2;
    rodL.position.set(-0.023, 0.026, 0.21);
    const rodR = rodL.clone();
    rodR.position.x = 0.023;
    const stockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.096, 0.022), darkMetal);
    stockPlate.position.set(0, 0.008, 0.295);

    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.011, length: 0.14, y: 0.030, zCenter: -0.21, darkMat: darkMetal, steelMat });
    const flash = buildMultiBaffleBrake(0.012, 0.030, -0.285, steelMat, darkMetal);

    group.add(buildPicatinnyRail(0.24, 0.032, 0.065, -0.01, darkMetal));
    railY = 0.072;
    opticZ = -0.01;
    aimDistanceZ = -0.31;

    magMesh = new THREE.Group();
    const mp7MagBody = new THREE.Mesh(new THREE.BoxGeometry(0.024, isExt ? 0.175 : 0.135, 0.035), darkMetal);
    const mp7Base = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, 0.040), polymerMat);
    mp7Base.position.y = isExt ? -0.090 : -0.070;
    magMesh.add(mp7MagBody, mp7Base);
    magMesh.position.set(0, -0.118, 0.048);
    magMesh.rotation.x = -0.14;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.10, -0.12, 0.079, darkMetal, '#38bdf8', '#4ade80', 0.0075));
      ironSightY = 0.082;
      ironRearZ = 0.10;
    }

    group.add(chassis, pistolGrip, foldGrip, rodL, rodR, stockPlate, barrel, flash, magMesh, buildReceiverPolish(0.044, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.32;
    barrelY = 0.030;
  } else if (weaponId === 'm249') {
    // Heavy Belt-Fed M249 SAW LMG with Perforated Barrel Heatshield, Bipod & 100-Round Linked Brass Belt
    const rec = extrudeSideProfile([
      [-0.16, -0.022], [0.16, -0.022], [0.16, 0.072], [-0.16, 0.072]
    ], 0.066, 0.005, bodyMat);
    const feedTrayLid = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.014, 0.19), darkMetal);
    feedTrayLid.position.set(0, 0.073, 0.02);
    const paraStock = extrudeSideProfile([
      [-0.16, -0.010], [-0.41, -0.056], [-0.41, 0.048], [-0.16, 0.048]
    ], 0.046, 0.004, darkMetal);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.108, 0.016), polymerMat);
    buttPad.position.set(0, -0.004, 0.416);
    const grip = buildErgonomicGrip(0.118, 0.102, 0.035, polymerMat, darkMetal, -0.020, 0.034);

    group.add(buildPicatinnyRail(0.24, 0.036, 0.082, 0.02, darkMetal));
    railY = 0.089;
    opticZ = 0.02;

    const handguard = buildTacticalHandguard({
      zStart: -0.16,
      zEnd: -0.42,
      yCenter: 0.022,
      width: 0.058,
      height: 0.052,
      shroudMat: polymerMat,
      darkMat: darkMetal,
      steelMat,
      gasTubeY: null,
      hasQuadRails: true
    });
    const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 12, 1, false, 0, Math.PI), steelMat);
    heatShield.rotation.x = Math.PI / 2;
    heatShield.rotation.z = -Math.PI / 2;
    heatShield.position.set(0, 0.038, -0.29);

    const barrel = buildPrecisionBarrel({ rFront: 0.013, rRear: 0.015, length: 0.44, y: 0.030, zCenter: -0.50, darkMat: darkMetal, steelMat });
    const flash = buildMultiBaffleBrake(0.015, 0.030, -0.73, steelMat, darkMetal);
    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), steelMat);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.034, -0.022, -0.38);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.034;

    magMesh = new THREE.Group();
    const ammoBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.135, 0.145),
      new THREE.MeshStandardMaterial({ color: '#365314', bumpMap: polyTex, bumpScale: 0.006, roughness: 0.62, metalness: 0.2 })
    );
    ammoBox.position.set(0, -0.092, -0.04);
    magMesh.add(ammoBox);
    for (let i = 0; i < 6; i++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.032, 8), brassMat);
      round.rotation.x = Math.PI / 2;
      round.position.set(-0.048, -0.022 + i * 0.012, -0.04 + (i % 2) * 0.008);
      magMesh.add(round);
    }

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.60, 0.096, darkMetal, '#4ade80', '#f97316', 0.009));
      ironSightY = 0.099;
      ironRearZ = 0.11;
    }

    group.add(rec, feedTrayLid, paraStock, buttPad, grip, handguard, heatShield, barrel, flash, bipodL, bipodR, magMesh, buildReceiverPolish(0.066, 0.044, 0.02, darkMetal, steelMat, brassMat));
    muzzleZ = -0.76;
    barrelY = 0.030;
  } else if (weaponId === 'rpk') {
    // RPK-74M Heavy Squad Automatic Rifle (Club-Foot Wood Stock + Long Barrel + Smooth 45-Rd Bakelite Mag)
    const rpkWood = skinId === 'default' ? woodMat : bodyMat;
    const rec = extrudeSideProfile([
      [-0.15, -0.020], [0.155, -0.020], [0.155, 0.046], [-0.15, 0.046]
    ], 0.054, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.145, 0.044], [0.135, 0.044], [0.125, 0.068], [-0.135, 0.066]
    ], 0.045, 0.005, darkMetal);
    const clubStock = extrudeSideProfile([
      [-0.15, -0.012], [-0.41, -0.094], [-0.41, 0.036], [-0.15, 0.038]
    ], 0.044, 0.005, rpkWood);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.128, 0.014), darkMetal);
    buttPlate.position.set(0, -0.029, 0.414);
    const grip = buildErgonomicGrip(0.108, 0.104, 0.033, polymerMat, darkMetal, -0.016, 0.034);
    const hgLower = extrudeSideProfile([
      [0.155, -0.015], [0.39, -0.008], [0.39, 0.034], [0.155, 0.036]
    ], 0.050, 0.005, rpkWood);
    const hgUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.21, 14), rpkWood);
    hgUpper.rotation.x = Math.PI / 2;
    hgUpper.position.set(0, 0.046, -0.26);

    const barrel = buildPrecisionBarrel({ rFront: 0.012, rRear: 0.014, length: 0.56, y: 0.024, zCenter: -0.54, darkMat: darkMetal, steelMat });
    const brake = buildMultiBaffleBrake(0.015, 0.024, -0.82, steelMat, darkMetal);
    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8), steelMat);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.034, -0.006, -0.64);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.034;

    const bakeliteMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#b45309', bumpMap: woodTex, bumpScale: 0.004, roughness: 0.42, metalness: 0.16 })
      : bodyMat;
    magMesh = buildCurvedMagazine(0.033, 0.064, isExt ? 0.052 : 0.044, 6, 0.085, -0.036, -0.055, bakeliteMat, darkMetal);

    if (useExternalOptic) {
      const mountArm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.042, 0.12), darkMetal);
      mountArm.position.set(-0.022, 0.055, 0.01);
      group.add(mountArm, buildPicatinnyRail(0.15, 0.034, 0.079, 0.01, darkMetal));
      railY = 0.086;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(-0.11, -0.76, 0.086, darkMetal, '#4ade80', '#f97316', 0.0085));
      ironSightY = 0.089;
      ironRearZ = -0.11;
    }

    group.add(
      rec, dustCover, clubStock, buttPlate, grip, hgLower, hgUpper, barrel, brake, bipodL, bipodR, magMesh,
      buildReceiverPolish(0.054, 0.034, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.855;
    barrelY = 0.024;
  } else if (weaponId === 'spas12') {
    const rec = extrudeSideProfile([
      [-0.14, -0.018], [0.145, -0.018], [0.145, 0.062], [-0.14, 0.062]
    ], 0.054, 0.004, bodyMat);
    const heatShield = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.028, 0.44), steelMat);
    heatShield.position.set(0, 0.054, -0.31);
    const topBarrel = buildPrecisionBarrel({ rFront: 0.015, rRear: 0.015, length: 0.54, y: 0.042, zCenter: -0.36, darkMat: darkMetal, steelMat });
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.48, 12), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.010, -0.33);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.050, 0.22), polymerMat);
    pump.position.set(0, 0.004, -0.27);

    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.044, 10), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 }));
      shell.position.set(-0.034, 0.026, -0.02 + i * 0.022);
      const brassRim = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), brassMat);
      brassRim.position.set(-0.034, 0.002, -0.02 + i * 0.022);
      group.add(shell, brassRim);
    }

    const stock = extrudeSideProfile([
      [-0.14, -0.012], [-0.39, -0.058], [-0.39, 0.044], [-0.14, 0.048]
    ], 0.044, 0.004, polymerMat);
    const stockHook = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.18), steelMat);
    stockHook.position.set(0, 0.068, 0.20);
    const grip = buildErgonomicGrip(0.115, 0.100, 0.034, polymerMat, darkMetal, -0.016, 0.032);

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.14, 0.034, 0.066, 0.02, darkMetal));
      railY = 0.072;
      opticZ = 0.02;
    } else {
      group.add(buildOpenIronSights(0.10, -0.58, 0.078, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.081;
      ironRearZ = 0.10;
    }

    magMesh = pump;
    group.add(rec, heatShield, topBarrel, magTube, pump, stock, stockHook, grip, buildReceiverPolish(0.054, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.64;
  } else if (weaponId === 'aa12') {
    // Sleek Clamshell AA-12 Auto Shotgun + Slotted Forearm + 20-Round Drum Magazine
    const body = extrudeSideProfile([
      [-0.38, -0.058], [-0.12, -0.044], [-0.08, -0.112], [-0.12, -0.116],
      [-0.04, -0.022], [0.34, -0.012], [0.34, 0.062], [-0.38, 0.056]
    ], 0.056, 0.005, bodyMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.116, 0.016), darkMetal);
    buttPad.position.set(0, -0.002, 0.384);
    const barrel = buildPrecisionBarrel({ rFront: 0.017, rRear: 0.019, length: 0.28, y: 0.034, zCenter: -0.44, darkMat: darkMetal, steelMat });
    const comp = buildMultiBaffleBrake(0.020, 0.034, -0.58, steelMat, darkMetal);

    magMesh = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.056, 20), darkMetal);
    drum.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.062, 14), steelMat);
    hub.rotation.x = Math.PI / 2;
    magMesh.add(drum, hub);
    magMesh.position.set(0, -0.085, -0.06);

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.18, 0.034, 0.066, 0.01, darkMetal));
      railY = 0.072;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(0.09, -0.32, 0.078, darkMetal, '#4ade80', '#f97316', 0.0085));
      ironSightY = 0.081;
      ironRearZ = 0.09;
    }

    group.add(body, buttPad, barrel, comp, magMesh, buildReceiverPolish(0.056, 0.038, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.61;
    barrelY = 0.034;
  } else if (weaponId === 'm870') {
    // Remington M870 Classic Figured Walnut & Blued Steel Pump-Action 12ga Shotgun
    const rec = extrudeSideProfile([
      [-0.13, -0.018], [0.145, -0.018], [0.145, 0.056], [-0.13, 0.056]
    ], 0.050, 0.005, bodyMat);
    const m870Wood = skinId === 'default' ? woodMat : gripMat;
    const woodStock = extrudeSideProfile([
      [-0.13, -0.008], [-0.21, -0.026], [-0.40, -0.076], [-0.40, 0.026], [-0.20, 0.030], [-0.13, 0.036]
    ], 0.044, 0.006, m870Wood);
    const recoilPad = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.104, 0.018), darkMetal);
    recoilPad.position.set(0, -0.026, 0.408);

    const barrel = buildPrecisionBarrel({ rFront: 0.014, rRear: 0.015, length: 0.56, y: 0.038, zCenter: -0.42, darkMat: darkMetal, steelMat });
    const ventRib = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.008, 0.54), steelMat);
    ventRib.position.set(0, 0.054, -0.42);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.50, 12), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.012, -0.39);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.046, 0.020), steelMat);
    clamp.position.set(0, 0.024, -0.58);

    magMesh = new THREE.Group();
    const pumpCore = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.21, 14), m870Wood);
    pumpCore.rotation.x = Math.PI / 2;
    magMesh.add(pumpCore);
    for (let r = -2; r <= 2; r++) {
      const groove = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.014, 14), m870Wood);
      groove.rotation.x = Math.PI / 2;
      groove.position.z = r * 0.034;
      magMesh.add(groove);
    }
    magMesh.position.set(0, 0.010, -0.28);

    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.044, 10), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 }));
      shell.position.set(-0.031, 0.024, -0.02 + i * 0.022);
      const brassRim = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), brassMat);
      brassRim.position.set(-0.031, 0.0, -0.02 + i * 0.022);
      group.add(shell, brassRim);
    }

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.14, 0.032, 0.060, 0.01, darkMetal));
      railY = 0.067;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(0.10, -0.67, 0.072, darkMetal, '#4ade80', '#facc15', 0.0075));
      ironSightY = 0.075;
      ironRearZ = 0.10;
    }

    group.add(
      rec, woodStock, recoilPad, barrel, ventRib, magTube, clamp, magMesh,
      buildReceiverPolish(0.050, 0.028, -0.02, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.71;
    barrelY = 0.038;
  } else if (weaponId === 'kar98k') {
    // Classic Mauser Kar98k Bolt-Action Sniper Rifle (Figured Oiled Walnut Stock + Turned Bolt + ZF Scope)
    const walnutMat = skinId === 'default' ? woodMat : bodyMat;
    const stockFull = extrudeSideProfile([
      [-0.41, -0.072], [-0.15, -0.018], [-0.09, -0.022], [0.43, 0.014],
      [0.43, 0.044], [-0.12, 0.038], [-0.41, 0.024]
    ], 0.044, 0.006, walnutMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.098, 0.014), steelMat);
    buttPlate.position.set(0, -0.024, 0.415);
    const noseBand = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.040, 0.028), steelMat);
    noseBand.position.set(0, 0.030, -0.43);
    const midBand = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.038, 0.018), steelMat);
    midBand.position.set(0, 0.024, -0.26);

    const actionSteel = extrudeSideProfile([
      [-0.10, 0.036], [0.13, 0.036], [0.13, 0.058], [-0.10, 0.058]
    ], 0.036, 0.004, steelMat);
    const mauserBoltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 12), steelMat);
    mauserBoltKnob.position.set(0.042, 0.024, 0.025);
    const mauserBoltArm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.036, 10), steelMat);
    mauserBoltArm.rotation.z = -Math.PI / 3;
    mauserBoltArm.position.set(0.030, 0.034, 0.025);

    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.014, length: 0.64, y: 0.042, zCenter: -0.54, darkMat: darkMetal, steelMat });
    const bayoLug = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.28, 8), steelMat);
    bayoLug.rotation.x = Math.PI / 2;
    bayoLug.position.set(0, 0.022, -0.57);
    const frontHood = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.024, 12), steelMat);
    frontHood.rotation.x = Math.PI / 2;
    frontHood.position.set(0, 0.056, -0.82);

    const scopeGroup = buildSniperOpticScope({
      y: 0.095,
      z: 0.02,
      length: 0.27,
      objectiveRadius: 0.021,
      lensColor: '#38bdf8',
      darkMetal,
      steelMat,
      accentMat
    });

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.022, 0.088), darkMetal);
    magMesh.position.set(0, -0.022, -0.02);

    group.add(
      stockFull, buttPlate, noseBand, midBand, actionSteel, mauserBoltArm, mauserBoltKnob, barrel, bayoLug, frontHood, scopeGroup, magMesh,
      buildReceiverPolish(0.044, 0.044, -0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.87;
    barrelY = 0.042;
    railY = 0.095;
    ironSightY = 0.095;
  } else if (weaponId === 'm200') {
    // CheyTac M200 Intervention .408 Tactical Chassis + Dual-Rod Sliding Stock + Vented Shroud + Fluted Barrel
    const chassisMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#44403c', bumpMap: metalBump, bumpScale: 0.004, roughness: 0.38, metalness: 0.62 })
      : bodyMat;
    const chassis = extrudeSideProfile([
      [-0.15, -0.022], [0.35, -0.018], [0.35, 0.062], [-0.15, 0.062]
    ], 0.060, 0.005, chassisMat);

    const rodTopL = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.27, 10), steelMat);
    rodTopL.rotation.x = Math.PI / 2;
    rodTopL.position.set(-0.022, 0.036, 0.29);
    const rodTopR = rodTopL.clone();
    rodTopR.position.x = 0.022;
    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.118, 0.026), polymerMat);
    stockPad.position.set(0, 0.004, 0.43);
    const monopod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.075, 10), darkMetal);
    monopod.position.set(0, -0.065, 0.36);

    const grip = buildErgonomicGrip(0.130, 0.096, 0.036, polymerMat, darkMetal, -0.018, 0.030);
    const barrelShroud = buildTacticalHandguard({
      zStart: -0.18,
      zEnd: -0.50,
      yCenter: 0.038,
      width: 0.048,
      height: 0.048,
      shroudMat: chassisMat,
      darkMat: darkMetal,
      steelMat,
      gasTubeY: null,
      hasQuadRails: true
    });
    const carryRail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.17), steelMat);
    carryRail.position.set(-0.038, 0.056, -0.24);

    const barrel = buildPrecisionBarrel({ rFront: 0.016, rRear: 0.019, length: 0.68, y: 0.038, zCenter: -0.62, darkMat: darkMetal, steelMat, fluted: true });
    const brake = buildMultiBaffleBrake(0.028, 0.038, -0.96, darkMetal, accentMat, true);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.24, 10), darkMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.036, -0.026, -0.41);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.036;
    const podFootL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.028, 10), polymerMat);
    podFootL.rotation.x = Math.PI / 2;
    podFootL.position.set(-0.036, -0.026, -0.53);
    const podFootR = podFootL.clone();
    podFootR.position.x = 0.036;

    const scopeGroup = buildSniperOpticScope({
      y: 0.112,
      z: 0.01,
      length: 0.37,
      objectiveRadius: 0.034,
      lensColor: '#38bdf8',
      darkMetal,
      steelMat,
      accentMat
    });

    magMesh = new THREE.Group();
    const m200Mag = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.115), darkMetal);
    const m200Pad = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.014, 0.122), polymerMat);
    m200Pad.position.y = -0.068;
    magMesh.add(m200Mag, m200Pad);
    magMesh.position.set(0, -0.072, -0.05);
    magMesh.rotation.x = 0.12;

    group.add(
      chassis, rodTopL, rodTopR, stockPad, monopod, grip, barrelShroud, carryRail,
      barrel, brake, bipodL, bipodR, podFootL, podFootR, scopeGroup, magMesh,
      buildReceiverPolish(0.060, 0.044, 0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -1.01;
    barrelY = 0.038;
    railY = 0.112;
    ironSightY = 0.112;
  } else if (weaponId === 'awp' || weaponId === 'barrett' || weaponId === 'svd') {
    const isBarrett = weaponId === 'barrett';
    const isSvd = weaponId === 'svd';
    const defaultColor = isBarrett ? '#334155' : (isSvd ? '#7c431e' : '#365833');
    const chassisMat = skinId === 'default'
      ? (isSvd ? woodMat : new THREE.MeshStandardMaterial({ color: defaultColor, bumpMap: metalBump, bumpScale: 0.004, roughness: 0.42, metalness: isBarrett ? 0.68 : 0.28 }))
      : bodyMat;

    const chassis = extrudeSideProfile([
      [-0.14, -0.022], [isBarrett ? 0.34 : 0.28, -0.018], [isBarrett ? 0.34 : 0.28, 0.062], [-0.14, 0.062]
    ], isBarrett ? 0.066 : 0.054, 0.005, chassisMat);

    // Sculpted Thumbhole Sniper Stock + Cheek Pad + Butt Pad
    const stockTop = extrudeSideProfile([
      [-0.14, 0.015], [-0.42, 0.015], [-0.42, 0.058], [-0.14, 0.058]
    ], 0.048, 0.004, chassisMat);
    const stockBot = extrudeSideProfile([
      [-0.18, -0.055], [-0.42, -0.065], [-0.42, 0.020], [-0.36, 0.020], [-0.36, -0.032], [-0.18, -0.028]
    ], 0.042, 0.004, chassisMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.124, 0.016), darkMetal);
    buttPad.position.set(0, -0.004, 0.424);
    const grip = buildErgonomicGrip(0.142, 0.096, 0.036, polymerMat, darkMetal, -0.018, 0.032);
    const cheekPad = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.026, 0.15), polymerMat);
    cheekPad.position.set(0, 0.070, 0.30);

    const barrel = buildPrecisionBarrel({
      rFront: isBarrett ? 0.017 : (isSvd ? 0.011 : 0.013),
      rRear: isBarrett ? 0.020 : 0.015,
      length: isBarrett ? 0.68 : 0.62,
      y: 0.038,
      zCenter: -0.58,
      darkMat: darkMetal,
      steelMat,
      fluted: !isSvd
    });

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.20, 8), darkMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.032, -0.024, -0.37);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.032;
    const footL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.028, 10), polymerMat);
    footL.rotation.x = Math.PI / 2;
    footL.position.set(-0.032, -0.024, -0.475);
    const footR = footL.clone();
    footR.position.x = 0.032;

    const brake = buildMultiBaffleBrake(
      isBarrett ? 0.028 : 0.016,
      0.038,
      isBarrett ? -0.94 : -0.87,
      isBarrett ? accentMat : darkMetal,
      steelMat,
      true
    );

    const scopeGroup = buildSniperOpticScope({
      y: 0.104,
      z: 0.01,
      length: 0.34,
      objectiveRadius: 0.032,
      lensColor: isBarrett ? '#ef4444' : (isSvd ? '#22c55e' : '#38bdf8'),
      darkMetal,
      steelMat,
      accentMat
    });

    if (isSvd) {
      magMesh = buildCurvedMagazine(0.032, 0.068, 0.036, 3, 0.11, -0.034, -0.04, darkMetal, steelMat);
    } else {
      magMesh = new THREE.Group();
      const sMagBody = new THREE.Mesh(new THREE.BoxGeometry(0.044, isBarrett ? 0.135 : 0.095, isBarrett ? 0.135 : 0.096), darkMetal);
      const sMagPad = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, isBarrett ? 0.142 : 0.104), polymerMat);
      sMagPad.position.y = isBarrett ? -0.070 : -0.050;
      magMesh.add(sMagBody, sMagPad);
      magMesh.position.set(0, -0.070, -0.04);
      if (isBarrett) magMesh.rotation.x = 0.14;
    }

    group.add(
      chassis, stockTop, stockBot, buttPad, grip, cheekPad, barrel, bipodL, bipodR, footL, footR, brake, scopeGroup, magMesh,
      buildReceiverPolish(isBarrett ? 0.066 : 0.054, 0.042, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = isBarrett ? -0.99 : -0.90;
    barrelY = 0.038;
    railY = 0.104;
    ironSightY = 0.104;
  } else if (weaponId === 'fiveseven') {
    // FN Five-seveN Futuristic Streamlined 5.7x28mm Tactical Pistol + Serrated Slide + 20-Rd Mag
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#272b33', bumpMap: metalBump, bumpScale: 0.003, metalness: 0.58, roughness: 0.32 })
      : bodyMat;
    const ctrlMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.72, roughness: 0.25 });

    const slide = extrudeSideProfile([
      [-0.072, 0.014], [0.148, 0.014], [0.142, 0.056], [-0.072, 0.056]
    ], 0.033, 0.003, slideMat);
    slide.add(buildPistolSlideDetails(0.033, 0.056, -0.140, 0.068, darkMetal, steelMat, brassMat));
    boltMesh = slide;

    const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 10), new THREE.MeshBasicMaterial({ color: '#030508' }));
    bore.rotation.y = Math.PI;
    bore.position.set(0, 0.036, -0.149);
    slide.add(bore);

    const frame = extrudeSideProfile([
      [-0.070, -0.012], [0.142, -0.012], [0.142, 0.015], [-0.070, 0.015]
    ], 0.033, 0.003, polymerMat);
    const grip = buildErgonomicGrip(0.048, 0.098, 0.033, polymerMat, darkMetal, -0.010, 0.030);
    const safetyLever = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.010, 0.022), ctrlMat);
    safetyLever.position.set(0, 0.018, -0.02);
    const tacLaser = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.050, 12), darkMetal);
    tacLaser.rotation.x = Math.PI / 2;
    tacLaser.position.set(0, -0.017, -0.108);

    magMesh = new THREE.Group();
    const fsMag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.115, 0.038), polymerMat);
    const fsBase = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.012, 0.044), darkMetal);
    fsBase.position.y = -0.060;
    magMesh.add(fsMag, fsBase);
    magMesh.position.set(0, -0.064, 0.052);
    magMesh.rotation.x = -0.24;

    railY = 0.062;
    opticZ = -0.02;
    aimDistanceZ = -0.36;

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.085, 0.028, 0.058, -0.02, darkMetal));
    } else {
      group.add(buildOpenIronSights(0.062, -0.135, 0.070, darkMetal, '#38bdf8', '#facc15', 0.0075));
      ironSightY = 0.073;
      ironRearZ = 0.062;
    }

    group.add(slide, frame, grip, safetyLever, tacLaser, magMesh);
    muzzleZ = -0.165;
    barrelY = 0.034;
  } else if (weaponId === 'deagle' || weaponId === 'usps' || weaponId === 'glock18') {
    const isUsp = weaponId === 'usps';
    const isGlock = weaponId === 'glock18';
    const isDeagle = !isUsp && !isGlock;
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: isUsp ? '#334155' : (isGlock ? '#1e293b' : '#cbd5e1'), bumpMap: metalBump, bumpScale: 0.003, metalness: 0.90, roughness: 0.18 })
      : bodyMat;

    const slideW = isDeagle ? 0.039 : 0.033;
    const slide = extrudeSideProfile([
      [-0.072, 0.014], [isDeagle ? 0.178 : 0.145, 0.014],
      [isDeagle ? 0.172 : 0.145, 0.056], [-0.072, 0.056]
    ], slideW, 0.003, slideMat);
    slide.add(buildPistolSlideDetails(slideW, 0.056, isDeagle ? -0.165 : -0.138, 0.068, darkMetal, steelMat, brassMat));
    if (isDeagle) {
      // Iconic Desert Eagle triangular top ventilated rib + barrel weight shroud
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.125), darkMetal);
      rib.position.set(0, 0.057, -0.105);
      const underlug = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.078), slideMat);
      underlug.position.set(0, 0.003, -0.135);
      slide.add(rib, underlug);
    }
    const bore = new THREE.Mesh(new THREE.CircleGeometry(isDeagle ? 0.0062 : 0.0048, 10), new THREE.MeshBasicMaterial({ color: '#030508' }));
    bore.rotation.y = Math.PI;
    bore.position.set(0, 0.034, isDeagle ? -0.179 : -0.146);
    slide.add(bore);
    boltMesh = slide;

    const frame = extrudeSideProfile([
      [-0.070, -0.012], [0.135, -0.012], [0.135, 0.015], [-0.070, 0.015]
    ], 0.033, 0.003, polymerMat);
    const grip = buildErgonomicGrip(0.048, 0.098, 0.033, polymerMat, darkMetal, -0.010, 0.030);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.020, 0.016), steelMat);
    hammer.position.set(0, 0.032, 0.078);
    hammer.rotation.x = -0.35;

    magMesh = new THREE.Group();
    const pMag = new THREE.Mesh(new THREE.BoxGeometry(0.025, isGlock ? 0.135 : 0.105, 0.036), darkMetal);
    const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.012, 0.042), polymerMat);
    pBase.position.y = isGlock ? -0.070 : -0.055;
    magMesh.add(pMag, pBase);
    magMesh.position.set(0, isGlock ? -0.072 : -0.060, 0.052);
    magMesh.rotation.x = -0.24;

    if (isGlock) {
      const tacLight = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.055, 12), darkMetal);
      tacLight.rotation.x = Math.PI / 2;
      tacLight.position.set(0, -0.018, -0.105);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.008, 10), new THREE.MeshBasicMaterial({ color: '#e0f2fe' }));
      lens.rotation.y = Math.PI;
      lens.position.set(0, -0.018, -0.133);
      group.add(tacLight, lens);
    }

    railY = 0.062;
    opticZ = -0.02;
    aimDistanceZ = -0.36;

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.085, 0.028, 0.058, -0.02, darkMetal));
    } else {
      group.add(buildOpenIronSights(0.062, -0.135, 0.070, darkMetal, '#4ade80', '#f97316', 0.0075));
      ironSightY = 0.073;
      ironRearZ = 0.062;
    }

    group.add(slide, frame, grip, hammer, magMesh);
    muzzleZ = isDeagle ? -0.19 : -0.16;

    if (isUsp) {
      group.add(buildSuppressorUnit(0.034, -0.225, 0.17, 0.017, darkMetal, steelMat));
      muzzleZ = -0.315;
    }
  } else if (weaponId === 'magnum') {
    // .44 Python Magnum Revolver with 6-Chamber Fluted Cylinder, Full Underlug Rib & Figured Walnut Grip
    const revSteel = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#cbd5e1', bumpMap: metalBump, bumpScale: 0.0025, metalness: 0.94, roughness: 0.14 })
      : bodyMat;
    const revWood = skinId === 'default' ? woodMat : gripMat;

    const frame = extrudeSideProfile([
      [-0.055, -0.015], [0.072, -0.015], [0.072, 0.054], [-0.040, 0.054], [-0.065, 0.025]
    ], 0.028, 0.003, revSteel);
    const barrelRib = extrudeSideProfile([
      [0.070, 0.014], [0.225, 0.016], [0.225, 0.056], [0.070, 0.056]
    ], 0.024, 0.003, revSteel);
    const ventTop = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.14), darkMetal);
    ventTop.position.set(0, 0.057, -0.148);
    const revBore = new THREE.Mesh(new THREE.CircleGeometry(0.0055, 10), new THREE.MeshBasicMaterial({ color: '#030508' }));
    revBore.rotation.y = Math.PI;
    revBore.position.set(0, 0.038, -0.227);

    magMesh = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.052, 16), revSteel);
    cyl.rotation.x = Math.PI / 2;
    magMesh.add(cyl);
    for (let ch = 0; ch < 6; ch++) {
      const a = (ch * Math.PI) / 3;
      const flute = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.040), darkMetal);
      flute.position.set(Math.cos(a) * 0.023, Math.sin(a) * 0.023, 0);
      const cartridge = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 8), brassMat);
      cartridge.position.set(Math.cos(a) * 0.013, Math.sin(a) * 0.013, 0.027);
      magMesh.add(flute, cartridge);
    }
    magMesh.position.set(0, 0.022, -0.015);

    const grip = buildErgonomicGrip(0.056, 0.104, 0.034, revWood, brassMat, -0.008, 0.036);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.018), steelMat);
    hammer.position.set(0, 0.048, 0.060);
    hammer.rotation.x = -0.45;

    railY = 0.062;
    opticZ = -0.04;
    aimDistanceZ = -0.36;

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.09, 0.024, 0.058, -0.04, darkMetal));
    } else {
      group.add(buildOpenIronSights(0.045, -0.21, 0.068, darkMetal, '#4ade80', '#f97316', 0.0075));
      ironSightY = 0.071;
      ironRearZ = 0.045;
    }

    group.add(frame, barrelRib, ventTop, revBore, magMesh, grip, hammer);
    muzzleZ = -0.23;
  } else if (weaponId === 'ak12') {
    // Modernized AK-12 Kalashnikov: Full-length top Picatinny rail, perforated free-float handguard, collapsible skeleton stock
    const rec = extrudeSideProfile([
      [-0.145, -0.020], [0.145, -0.020], [0.145, 0.048], [-0.145, 0.048]
    ], 0.050, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.142, 0.046], [0.138, 0.046], [0.132, 0.068], [-0.135, 0.068]
    ], 0.044, 0.004, darkMetal);
    group.add(buildPicatinnyRail(0.50, 0.034, 0.072, -0.105, darkMetal));
    railY = 0.079;
    opticZ = 0.01;

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.21, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.032, 0.25);
    const stock = extrudeSideProfile([
      [-0.19, 0.004], [-0.25, -0.022], [-0.38, -0.058], [-0.385, 0.052], [-0.20, 0.052]
    ], 0.042, 0.004, polymerMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.112, 0.014), darkMetal);
    buttPad.position.set(0, -0.003, 0.388);
    const grip = buildErgonomicGrip(0.106, 0.102, 0.032, polymerMat, darkMetal, -0.018, 0.034);

    const shroud = buildTacticalHandguard({
      zStart: -0.142, zEnd: -0.375, yCenter: 0.030, width: 0.050, height: 0.054,
      shroudMat: polymerMat, darkMat: darkMetal, steelMat, gasTubeY: 0.050, hasQuadRails: true
    });
    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.0125, length: 0.32, y: 0.028, zCenter: -0.49, darkMat: darkMetal, steelMat });
    const brake = buildMultiBaffleBrake(0.014, 0.028, -0.655, darkMetal, steelMat, false);
    const peq = buildTacticalLaserModule(0.035, 0.032, -0.30, darkMetal, '#22c55e');

    magMesh = buildCurvedMagazine(0.033, 0.062, isExt ? 0.050 : 0.042, 5, 0.088, -0.038, -0.052, polymerMat, darkMetal);
    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.36, 0.090, darkMetal, '#4ade80', '#f97316', 0.0085));
      ironSightY = 0.093;
      ironRearZ = 0.11;
    }
    group.add(rec, dustCover, tube, stock, buttPad, grip, shroud, barrel, brake, peq, magMesh,
      buildReceiverPolish(0.050, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.685;
  } else if (weaponId === 'g36c') {
    // HK G36C Compact: Signature elevated carry-handle Picatinny bridge, vented short handguard, skeleton folding stock, translucent mag
    const rec = extrudeSideProfile([
      [-0.135, -0.022], [0.01, -0.022], [0.018, -0.046], [0.092, -0.046],
      [0.102, -0.014], [0.275, -0.008], [0.275, 0.056], [-0.135, 0.056]
    ], 0.050, 0.004, bodyMat);
    // Iconic elevated G36C carry-handle arch with top rail
    const archRear = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.046, 0.038), darkMetal);
    archRear.position.set(0, 0.074, 0.102);
    const archFront = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.046, 0.038), darkMetal);
    archFront.position.set(0, 0.074, -0.182);
    const carryTop = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.016, 0.32), darkMetal);
    carryTop.position.set(0, 0.096, -0.040);
    group.add(archRear, archFront, carryTop, buildPicatinnyRail(0.31, 0.034, 0.106, -0.040, darkMetal));
    railY = 0.113;
    opticZ = -0.02;

    // Vented short G36C forend slots
    for (let s = 0; s < 3; s++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.014, 0.030), darkMetal);
      slot.position.set(0, 0.026, -0.145 - s * 0.044);
      group.add(slot);
    }
    const stock = buildFoldingWireStock(0.142, 0.23, 0.016, darkMetal, polymerMat, 0.068);
    const grip = buildErgonomicGrip(0.096, 0.100, 0.032, polymerMat, darkMetal, -0.018, 0.032);
    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.012, length: 0.18, y: 0.030, zCenter: -0.355, darkMat: darkMetal, steelMat });
    const hider = buildMultiBaffleBrake(0.013, 0.030, -0.455, darkMetal, steelMat, false);

    const clearMagMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.28, metalness: 0.25, transparent: true, opacity: 0.86 });
    magMesh = buildCurvedMagazine(0.034, 0.064, isExt ? 0.048 : 0.040, 4, 0.045, -0.036, -0.052, clearMagMat, darkMetal);
    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.09, -0.18, 0.122, darkMetal, '#38bdf8', '#4ade80', 0.0085));
      ironSightY = 0.125;
      ironRearZ = 0.09;
    }
    group.add(rec, stock, grip, barrel, hider, magMesh,
      buildReceiverPolish(0.050, 0.032, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.485;
  } else if (weaponId === 'groza') {
    // OTs-14 Groza Bullpup AK: Rear banana mag behind grip, elevated iron-sight carry handle, stubby heavy barrel
    const rec = extrudeSideProfile([
      [-0.315, -0.026], [0.225, -0.022], [0.225, 0.054], [-0.315, 0.054]
    ], 0.052, 0.004, bodyMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.108, 0.018), polymerMat);
    buttPad.position.set(0, 0.008, 0.322);
    const carryRear = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.054, 0.032), darkMetal);
    carryRear.position.set(0, 0.076, 0.12);
    const carryFront = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.054, 0.032), darkMetal);
    carryFront.position.set(0, 0.076, -0.15);
    const carryBar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.016, 0.30), darkMetal);
    carryBar.position.set(0, 0.102, -0.015);
    group.add(carryRear, carryFront, carryBar);
    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.24, 0.032, 0.112, -0.015, darkMetal));
      railY = 0.118;
      opticZ = -0.01;
    } else {
      group.add(buildOpenIronSights(0.11, -0.15, 0.120, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.123;
      ironRearZ = 0.11;
    }

    const grip = buildErgonomicGrip(-0.085, 0.098, 0.032, polymerMat, darkMetal, -0.018, 0.028);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.082, 12), polymerMat);
    vertGrip.position.set(0, -0.052, -0.205);
    const barrel = buildPrecisionBarrel({ rFront: 0.013, rRear: 0.016, length: 0.18, y: 0.028, zCenter: -0.31, darkMat: darkMetal, steelMat });
    const collar = buildMultiBaffleBrake(0.016, 0.028, -0.405, darkMetal, steelMat, false);

    magMesh = buildCurvedMagazine(0.033, 0.064, isExt ? 0.050 : 0.042, 5, 0.092, -0.036, 0.165, darkMetal, steelMat);
    group.add(rec, buttPad, grip, vertGrip, barrel, collar, magMesh,
      buildReceiverPolish(0.052, 0.032, 0.15, darkMetal, steelMat, brassMat));
    muzzleZ = -0.435;
  } else if (weaponId === 'asval') {
    // AS VAL Spetsnaz: Long thick integral ported suppressor barrel + plum polymer grip + tubular folding wire stock
    const plumMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#3b242c', map: polyTex, bumpMap: polyTex, bumpScale: 0.006, roughness: 0.56, metalness: 0.15 })
      : polymerMat;
    const rec = extrudeSideProfile([
      [-0.145, -0.020], [0.135, -0.020], [0.135, 0.052], [-0.145, 0.052]
    ], 0.046, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.140, 0.050], [0.120, 0.050], [0.108, 0.068], [-0.132, 0.066]
    ], 0.040, 0.004, darkMetal);
    const stock = buildFoldingWireStock(0.148, 0.245, 0.015, darkMetal, polymerMat, 0.058);
    const grip = buildErgonomicGrip(0.096, 0.100, 0.032, plumMat, darkMetal, -0.018, 0.034);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.042, 0.135), plumMat);
    handguard.position.set(0, 0.016, -0.200);

    // Massive signature AS VAL integral cylindrical suppressor with cooling vent slots
    const intSupp = buildSuppressorUnit(0.030, -0.405, 0.44, 0.021, darkMetal, steelMat);
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 16), steelMat);
    clamp.rotation.x = Math.PI / 2;
    clamp.position.set(0, 0.030, -0.275);

    magMesh = buildCurvedMagazine(0.032, 0.058, isExt ? 0.048 : 0.040, 4, 0.048, -0.036, -0.048, plumMat, darkMetal);
    if (useExternalOptic) {
      const sideArm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.040, 0.11), darkMetal);
      sideArm.position.set(-0.022, 0.056, 0.01);
      group.add(sideArm, buildPicatinnyRail(0.14, 0.032, 0.078, 0.01, darkMetal));
      railY = 0.084;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(-0.14, -0.58, 0.076, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.079;
      ironRearZ = -0.14;
    }
    group.add(rec, dustCover, stock, grip, handguard, intSupp, clamp, magMesh,
      buildReceiverPolish(0.046, 0.034, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.635;
  } else if (weaponId === 'fal') {
    // FN FAL Battle Rifle: Long slim 7.62 NATO silhouette, classic carry handle, tapered handguard, straight 20-rd steel mag
    const rec = extrudeSideProfile([
      [-0.145, -0.022], [0.165, -0.022], [0.165, 0.054], [-0.145, 0.058]
    ], 0.046, 0.004, bodyMat);
    const fullStock = extrudeSideProfile([
      [-0.145, -0.012], [-0.415, -0.076], [-0.415, 0.040], [-0.145, 0.048]
    ], 0.042, 0.005, polymerMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.118, 0.014), darkMetal);
    buttPad.position.set(0, -0.018, 0.420);
    const grip = buildErgonomicGrip(0.104, 0.102, 0.032, polymerMat, darkMetal, -0.020, 0.036);

    const handguard = extrudeSideProfile([
      [0.165, -0.014], [0.435, 0.004], [0.435, 0.046], [0.165, 0.050]
    ], 0.046, 0.005, polymerMat);
    for (let v = 0; v < 4; v++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.009, 0.026), darkMetal);
      vent.position.set(0, 0.024, -0.21 - v * 0.052);
      group.add(vent);
    }
    const barrel = buildPrecisionBarrel({ rFront: 0.011, rRear: 0.0135, length: 0.36, y: 0.030, zCenter: -0.58, darkMat: darkMetal, steelMat });
    const hider = buildMultiBaffleBrake(0.013, 0.030, -0.765, darkMetal, steelMat, false);
    const fsPost = extrudeSideProfile([[0.435, 0.030], [0.468, 0.030], [0.460, 0.078], [0.442, 0.078]], 0.016, 0.002, darkMetal);

    magMesh = new THREE.Group();
    const mBox = new THREE.Mesh(new THREE.BoxGeometry(0.034, isExt ? 0.195 : 0.155, 0.074), darkMetal);
    const mFloor = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.010, 0.078), steelMat);
    mFloor.position.y = isExt ? -0.10 : -0.08;
    magMesh.add(mBox, mFloor);
    magMesh.position.set(0, -0.095, -0.068);

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.24, 0.034, 0.064, 0.01, darkMetal));
      railY = 0.071;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(0.115, -0.455, 0.086, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.089;
      ironRearZ = 0.115;
    }
    group.add(rec, fullStock, buttPad, grip, handguard, barrel, hider, fsPost, magMesh,
      buildReceiverPolish(0.046, 0.034, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.795;
  } else if (weaponId === 'mcx') {
    // SIG MCX Spear (XM7 NGSW 6.8mm): Sleek FDE Bronze anodized CNC receiver, long M-LOK rail, minimalist folding stock
    const bronzeMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#b5925b', bumpMap: metalBump, bumpScale: 0.004, envMap, roughness: 0.34, metalness: 0.62 })
      : bodyMat;
    const rec = extrudeSideProfile([
      [-0.115, -0.022], [0.005, -0.022], [0.012, -0.046], [0.090, -0.046],
      [0.100, -0.014], [0.125, 0.008], [0.125, 0.072], [-0.115, 0.072]
    ], 0.050, 0.004, bronzeMat);
    group.add(buildPicatinnyRail(0.52, 0.034, 0.076, -0.115, darkMetal));
    railY = 0.083;
    opticZ = 0.01;

    const stock = buildFoldingWireStock(0.124, 0.245, 0.024, bronzeMat, darkMetal, 0.066);
    const grip = buildErgonomicGrip(0.104, 0.102, 0.032, gripMat, darkMetal, -0.020, 0.034);
    const shroud = buildTacticalHandguard({
      zStart: -0.125, zEnd: -0.395, yCenter: 0.034, width: 0.050, height: 0.056,
      shroudMat: bronzeMat, darkMat: darkMetal, steelMat, gasTubeY: 0.054, hasQuadRails: true
    });
    const afg = extrudeSideProfile([[0.22, 0.004], [0.30, 0.004], [0.27, -0.046], [0.225, -0.036]], 0.028, 0.003, gripMat);
    const peq = buildTacticalLaserModule(0.036, 0.036, -0.31, darkMetal, '#ef4444');
    const barrel = buildPrecisionBarrel({ rFront: 0.011, rRear: 0.013, length: 0.28, y: 0.032, zCenter: -0.495, darkMat: darkMetal, steelMat });
    const brake = buildMultiBaffleBrake(0.015, 0.032, -0.640, steelMat, darkMetal, false);

    magMesh = buildCurvedMagazine(0.035, 0.068, isExt ? 0.048 : 0.040, 4, 0.042, -0.036, -0.048, gripMat, darkMetal);
    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.37, 0.094, darkMetal, '#38bdf8', '#facc15', 0.008));
      ironSightY = 0.097;
      ironRearZ = 0.095;
    }
    group.add(rec, stock, grip, shroud, afg, peq, barrel, brake, magMesh,
      buildReceiverPolish(0.050, 0.040, 0.012, darkMetal, steelMat, brassMat));
    muzzleZ = -0.67;
  } else if (weaponId === 'uzi' || weaponId === 'mac10') {
    // Iconic Compact Box-Receiver SMGs: Micro UZI & MAC-10 Ingram with grip-inserted stick magazine & wire stock
    const isUzi = weaponId === 'uzi';
    const rec = extrudeSideProfile(isUzi
      ? [[-0.125, -0.005], [0.155, -0.005], [0.155, 0.056], [-0.125, 0.056]]
      : [[-0.110, -0.008], [0.125, -0.008], [0.125, 0.062], [-0.110, 0.062]],
      isUzi ? 0.042 : 0.046, 0.004, bodyMat);
    const topCockKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.008, 0.020, 10), steelMat);
    topCockKnob.position.set(0, isUzi ? 0.066 : 0.072, isUzi ? -0.01 : 0.03);
    const grip = buildErgonomicGrip(0.032, 0.096, 0.034, polymerMat, darkMetal, -0.005, 0.012);
    const stock = buildFoldingWireStock(isUzi ? 0.130 : 0.115, 0.19, 0.022, darkMetal, polymerMat, 0.048);

    const barrel = buildPrecisionBarrel({
      rFront: isUzi ? 0.0095 : 0.012, rRear: isUzi ? 0.013 : 0.014,
      length: isUzi ? 0.14 : 0.11, y: 0.028, zCenter: isUzi ? -0.215 : -0.17,
      darkMat: darkMetal, steelMat
    });
    const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.024, 14), steelMat);
    barrelNut.rotation.x = Math.PI / 2;
    barrelNut.position.set(0, 0.028, isUzi ? -0.158 : -0.130);

    // Long vertical stick magazine protruding cleanly from the center of the pistol grip
    magMesh = new THREE.Group();
    const stickLen = isExt ? 0.25 : 0.20;
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.024, stickLen, 0.036), darkMetal);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.010, 0.040), steelMat);
    floor.position.y = -stickLen * 0.5;
    magMesh.add(stick, floor);
    magMesh.position.set(0, -0.135, 0.038);
    magMesh.rotation.x = -0.10;

    railY = isUzi ? 0.062 : 0.068;
    opticZ = 0.0;
    aimDistanceZ = -0.32;
    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.14, 0.030, railY - 0.002, 0.0, darkMetal));
    } else {
      group.add(buildOpenIronSights(0.085, isUzi ? -0.135 : -0.105, railY + 0.012, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = railY + 0.015;
      ironRearZ = 0.085;
    }
    group.add(rec, topCockKnob, grip, stock, barrel, barrelNut, magMesh,
      buildReceiverPolish(isUzi ? 0.042 : 0.046, 0.030, -0.02, darkMetal, steelMat, brassMat));
    muzzleZ = isUzi ? -0.295 : -0.235;
  } else if (weaponId === 'bizon') {
    // PP-19 Bizon: AK-74U short receiver + iconic massive 64-round cylindrical helical drum under barrel + skeleton stock
    const rec = extrudeSideProfile([
      [-0.140, -0.018], [0.135, -0.018], [0.135, 0.046], [-0.140, 0.046]
    ], 0.048, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.135, 0.044], [0.115, 0.044], [0.105, 0.066], [-0.128, 0.065]
    ], 0.042, 0.004, darkMetal);
    const stock = buildFoldingWireStock(0.145, 0.235, 0.016, darkMetal, polymerMat, 0.062);
    const grip = buildErgonomicGrip(0.098, 0.100, 0.032, polymerMat, darkMetal, -0.016, 0.034);
    const hgUpper = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.032, 0.19), polymerMat);
    hgUpper.position.set(0, 0.034, -0.230);
    const barrel = buildPrecisionBarrel({ rFront: 0.010, rRear: 0.012, length: 0.26, y: 0.028, zCenter: -0.34, darkMat: darkMetal, steelMat });
    const hider = buildMultiBaffleBrake(0.014, 0.028, -0.475, darkMetal, steelMat, false);

    // Signature massive helical cylinder magazine slung horizontally beneath the handguard!
    magMesh = buildHelicalMagazine(isExt ? 0.035 : 0.031, 0.275, -0.014, -0.225, darkMetal, steelMat);

    if (useExternalOptic) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.038, 0.11), darkMetal);
      arm.position.set(-0.022, 0.056, 0.01);
      group.add(arm, buildPicatinnyRail(0.14, 0.032, 0.078, 0.01, darkMetal));
      railY = 0.084;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(-0.11, -0.43, 0.080, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.083;
      ironRearZ = -0.11;
    }
    group.add(rec, dustCover, stock, grip, hgUpper, barrel, hider, magMesh,
      buildReceiverPolish(0.048, 0.032, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.505;
  } else if (weaponId === 'thompson') {
    // M1928 Thompson "Tommy Gun": Blued steel receiver, walnut stock & vertical foregrip, finned barrel + iconic 50-rd Drum Magazine
    const rec = extrudeSideProfile([
      [-0.145, -0.014], [0.165, -0.014], [0.165, 0.052], [-0.145, 0.052]
    ], 0.046, 0.004, bodyMat);
    const stockMat = skinId === 'default' ? woodMat : bodyMat;
    const stock = extrudeSideProfile([
      [-0.142, -0.010], [-0.22, -0.024], [-0.405, -0.086], [-0.405, 0.018], [-0.21, 0.038], [-0.142, 0.044]
    ], 0.042, 0.005, stockMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.106, 0.012), darkMetal);
    buttPlate.position.set(0, -0.034, 0.410);
    const grip = buildErgonomicGrip(0.098, 0.100, 0.032, stockMat, darkMetal, -0.012, 0.036);
    const foreGrip = buildErgonomicGrip(-0.265, 0.092, 0.030, stockMat, darkMetal, -0.004, -0.022);

    const barrel = buildPrecisionBarrel({ rFront: 0.011, rRear: 0.014, length: 0.34, y: 0.032, zCenter: -0.335, darkMat: darkMetal, steelMat });
    // Iconic Thompson radial cooling fins along the barrel
    for (let f = 0; f < 9; f++) {
      const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0175, 0.005, 14), darkMetal);
      fin.rotation.x = Math.PI / 2;
      fin.position.set(0, 0.032, -0.185 - f * 0.016);
      group.add(fin);
    }
    const cuttsComp = buildMultiBaffleBrake(0.015, 0.032, -0.515, steelMat, darkMetal, false);

    // Iconic 50-Round Circular Drum Magazine!
    magMesh = buildDrumMagazine(isExt ? 0.094 : 0.084, 0.042, -0.092, -0.085, darkMetal, polymerMat, steelMat);

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.16, 0.032, 0.058, 0.0, darkMetal));
      railY = 0.065;
      opticZ = 0.0;
    } else {
      group.add(buildOpenIronSights(0.11, -0.49, 0.072, darkMetal, '#4ade80', '#facc15', 0.0085));
      ironSightY = 0.075;
      ironRearZ = 0.11;
    }
    group.add(rec, stock, buttPlate, grip, foreGrip, barrel, cuttsComp, magMesh,
      buildReceiverPolish(0.046, 0.032, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.545;
  } else if (weaponId === 'pkm' || weaponId === 'mg3' || weaponId === 'negev') {
    // Heavy Belt-Fed Squad Machine Guns: PKM Spetsnaz, MG3 Buzzsaw (perforated shroud + drum), IWI Negev NG7
    const isPkm = weaponId === 'pkm';
    const isMg3 = weaponId === 'mg3';
    const boxGreen = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: isPkm ? '#3d4f38' : (isMg3 ? '#3b424c' : '#2b323b'), bumpMap: metalBump, bumpScale: 0.005, roughness: 0.52, metalness: 0.45 })
      : accentMat;

    const rec = extrudeSideProfile([
      [-0.175, -0.026], [0.225, -0.026], [0.225, 0.070], [-0.175, 0.070]
    ], 0.066, 0.005, bodyMat);
    const feedTray = new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.022, 0.19), darkMetal);
    feedTray.position.set(0, 0.078, -0.01);

    const stock = isPkm
      ? extrudeSideProfile([[-0.175, -0.018], [-0.435, -0.078], [-0.435, 0.044], [-0.175, 0.052]], 0.048, 0.005, skinId === 'default' ? woodMat : bodyMat)
      : (isMg3
        ? extrudeSideProfile([[-0.175, -0.014], [-0.415, -0.066], [-0.415, 0.048], [-0.175, 0.054]], 0.048, 0.005, polymerMat)
        : buildFoldingWireStock(0.180, 0.24, 0.018, darkMetal, polymerMat, 0.072));
    const grip = buildErgonomicGrip(0.118, 0.104, 0.036, isPkm ? (skinId === 'default' ? woodMat : gripMat) : polymerMat, darkMetal, -0.024, 0.034);

    // Barrel shroud / ventilated jacket
    if (isMg3) {
      // Iconic MG3 square perforated steel barrel jacket
      const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.054, 0.42), darkMetal);
      jacket.position.set(0, 0.036, -0.42);
      group.add(jacket);
      for (let v = 0; v < 6; v++) {
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.016, 0.032), steelMat);
        hole.position.set(0, 0.036, -0.255 - v * 0.058);
        group.add(hole);
      }
    } else {
      const shroud = buildTacticalHandguard({
        zStart: -0.220, zEnd: -0.455, yCenter: 0.026, width: 0.062, height: 0.058,
        shroudMat: isPkm ? darkMetal : polymerMat, darkMat: darkMetal, steelMat, gasTubeY: 0.004, hasQuadRails: !isPkm
      });
      group.add(shroud);
    }

    const barrel = buildPrecisionBarrel({
      rFront: 0.013, rRear: 0.016, length: isPkm ? 0.56 : 0.52,
      y: 0.040, zCenter: -0.52, darkMat: darkMetal, steelMat, fluted: isPkm
    });
    const brake = buildMultiBaffleBrake(0.017, 0.040, isPkm ? -0.80 : -0.78, darkMetal, steelMat, !isMg3);
    const bipod = buildTacticalBipod(-0.016, -0.46, darkMetal, steelMat, 0.22);
    const belt = buildBrassAmmoBelt(0.044, 0.038, -0.05, brassMat, darkMetal, 6);

    // Huge 100/120-rd Ammo Box (PKM/Negev) or 75-rd Belt Drum (MG3)
    if (isMg3) {
      magMesh = buildDrumMagazine(isExt ? 0.082 : 0.072, 0.072, -0.068, -0.035, boxGreen, darkMetal, steelMat);
      magMesh.position.x = -0.055;
    } else {
      magMesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.088, isExt ? 0.145 : 0.125, 0.135), boxGreen);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.018, 0.036), darkMetal);
      latch.position.y = 0.055;
      magMesh.add(box, latch);
      magMesh.position.set(0.012, -0.092, -0.045);
    }

    group.add(buildPicatinnyRail(0.24, 0.038, 0.092, -0.01, darkMetal));
    railY = 0.099;
    opticZ = -0.01;
    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.10, -0.68, 0.108, darkMetal, '#4ade80', '#f97316', 0.009));
      ironSightY = 0.111;
      ironRearZ = 0.10;
    }
    group.add(rec, feedTray, stock, grip, barrel, brake, bipod, belt, magMesh,
      buildReceiverPolish(0.066, 0.042, 0.02, darkMetal, steelMat, brassMat));
    muzzleZ = isPkm ? -0.84 : -0.82;
  } else if (weaponId === 'benellim4') {
    // Benelli M4 Super 90 USMC Tactical Shotgun: Collapsible skeleton stock, full-length mag tube, top rail, ghost ring sights
    const rec = extrudeSideProfile([
      [-0.145, -0.022], [0.165, -0.022], [0.165, 0.058], [-0.145, 0.058]
    ], 0.048, 0.004, bodyMat);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.018, 0.245);
    const stock = extrudeSideProfile([
      [-0.19, -0.010], [-0.365, -0.062], [-0.375, 0.042], [-0.21, 0.042]
    ], 0.044, 0.005, polymerMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.108, 0.014), darkMetal);
    buttPad.position.set(0, -0.010, 0.378);
    const grip = buildErgonomicGrip(0.115, 0.102, 0.034, polymerMat, darkMetal, -0.020, 0.038);

    const forend = extrudeSideProfile([
      [0.165, -0.020], [0.435, -0.014], [0.435, 0.032], [0.165, 0.036]
    ], 0.050, 0.006, polymerMat);
    const barrel = buildPrecisionBarrel({ rFront: 0.0145, rRear: 0.0165, length: 0.56, y: 0.038, zCenter: -0.44, darkMat: darkMetal, steelMat });
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.50, 14), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.008, -0.415);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.052, 0.020), steelMat);
    clamp.position.set(0, 0.022, -0.60);
    // Tactical side saddle with 4 red 12G shotgun shells
    const shellMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 });
    const saddle = new THREE.Group();
    for (let s = 0; s < 4; s++) {
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.044, 10), shellMat);
      sh.position.set(-0.029, 0.016, 0.05 - s * 0.024);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.011, 10), brassMat);
      cap.position.set(-0.029, 0.038, 0.05 - s * 0.024);
      saddle.add(sh, cap);
    }

    group.add(buildPicatinnyRail(0.22, 0.034, 0.062, 0.01, darkMetal));
    railY = 0.069;
    opticZ = 0.01;
    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.10, -0.68, 0.078, darkMetal, '#4ade80', '#f97316', 0.009));
      ironSightY = 0.081;
      ironRearZ = 0.10;
    }
    group.add(rec, tube, stock, buttPad, grip, forend, barrel, magTube, clamp, saddle,
      buildReceiverPolish(0.048, 0.032, -0.02, darkMetal, steelMat, brassMat));
    muzzleZ = -0.73;
  } else if (weaponId === 'db_shotgun') {
    // S686 Double Barrel Classic Hunting Shotgun: Engraved silver breech, Twin Over-Under / Side-by-Side walnut barrels
    const silverRec = skinId === 'default' ? steelMat : bodyMat;
    const stockMat = skinId === 'default' ? woodMat : bodyMat;
    const breech = extrudeSideProfile([
      [-0.085, -0.024], [0.115, -0.020], [0.115, 0.052], [-0.085, 0.048]
    ], 0.048, 0.005, silverRec);
    const stock = extrudeSideProfile([
      [-0.080, -0.020], [-0.145, -0.036], [-0.395, -0.095], [-0.395, 0.018], [-0.155, 0.030], [-0.080, 0.044]
    ], 0.042, 0.006, stockMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.116, 0.014), darkMetal);
    buttPad.position.set(0, -0.039, 0.400);
    const forend = extrudeSideProfile([
      [0.115, -0.020], [0.385, -0.010], [0.385, 0.026], [0.115, 0.028]
    ], 0.048, 0.006, stockMat);

    // Dual Side-by-Side Blued Steel 12G Barrels with center ventilated rib & dual dark bores!
    for (const bx of [-0.0145, 0.0145]) {
      const bTube = buildPrecisionBarrel({ rFront: 0.0135, rRear: 0.0150, length: 0.64, y: 0.034, zCenter: -0.43, darkMat: darkMetal, steelMat });
      bTube.position.x = bx;
      group.add(bTube);
    }
    const centerRib = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.012, 0.62), darkMetal);
    centerRib.position.set(0, 0.044, -0.42);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0036, 8, 8), brassMat);
    bead.position.set(0, 0.054, -0.73);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.010, 0.042), darkMetal);
    lever.position.set(0, 0.054, 0.068);
    lever.rotation.y = 0.18;

    railY = 0.056;
    opticZ = -0.02;
    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.14, 0.028, 0.054, -0.02, darkMetal));
    } else {
      ironSightY = 0.062;
      ironRearZ = 0.06;
    }
    group.add(breech, stock, buttPad, forend, centerRib, bead, lever);
    muzzleZ = -0.76;
  } else if (weaponId === 'm24' || weaponId === 'mk14') {
    // M24 SWS Bolt-Action Precision Sniper & Mk14 EBR Aluminum-Chassis Marksman DMR
    const isM24 = weaponId === 'm24';
    const chassisMat = skinId === 'default'
      ? (isM24
        ? new THREE.MeshStandardMaterial({ color: '#1e242c', map: polyTex, bumpMap: polyTex, bumpScale: 0.005, roughness: 0.58, metalness: 0.22 })
        : new THREE.MeshStandardMaterial({ color: '#4c545e', bumpMap: metalBump, bumpScale: 0.004, envMap, roughness: 0.36, metalness: 0.72 }))
      : bodyMat;

    const rec = extrudeSideProfile(isM24
      ? [[-0.14, -0.020], [0.36, -0.008], [0.36, 0.042], [0.16, 0.058], [-0.14, 0.058]]
      : [[-0.14, -0.024], [0.34, -0.016], [0.34, 0.060], [-0.14, 0.062]],
      0.050, 0.005, chassisMat);
    const stock = isM24
      ? extrudeSideProfile([[-0.14, -0.016], [-0.42, -0.072], [-0.42, 0.046], [-0.24, 0.058], [-0.14, 0.048]], 0.046, 0.006, chassisMat)
      : buildFoldingWireStock(0.145, 0.26, 0.016, steelMat, polymerMat, 0.068);
    const cheekRiser = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.022, 0.14), polymerMat);
    cheekRiser.position.set(0, 0.062, 0.27);
    const grip = buildErgonomicGrip(0.105, 0.100, 0.032, polymerMat, darkMetal, -0.020, 0.036);

    if (!isM24) {
      group.add(buildTacticalHandguard({
        zStart: -0.14, zEnd: -0.37, yCenter: 0.030, width: 0.054, height: 0.054,
        shroudMat: chassisMat, darkMat: darkMetal, steelMat, hasQuadRails: true
      }));
    }
    const barrel = buildPrecisionBarrel({
      rFront: isM24 ? 0.013 : 0.012, rRear: isM24 ? 0.016 : 0.0145,
      length: isM24 ? 0.60 : 0.48, y: 0.038, zCenter: isM24 ? -0.58 : -0.52,
      darkMat: darkMetal, steelMat, fluted: isM24
    });
    const brake = buildMultiBaffleBrake(0.016, 0.038, isM24 ? -0.885 : -0.765, darkMetal, steelMat, isM24);
    const bipod = buildTacticalBipod(-0.014, -0.33, darkMetal, steelMat, 0.19);
    const scope = buildSniperOpticScope({
      y: 0.108, z: -0.02, length: isM24 ? 0.36 : 0.30,
      objectiveRadius: isM24 ? 0.034 : 0.028,
      lensColor: isM24 ? '#38bdf8' : '#22c55e',
      darkMetal, steelMat, accentMat
    });

    magMesh = new THREE.Group();
    const sMagH = isM24 ? (isExt ? 0.095 : 0.072) : (isExt ? 0.19 : 0.155);
    const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.036, sMagH, 0.074), darkMetal);
    const sPad = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.010, 0.078), steelMat);
    sPad.position.y = -sMagH * 0.5;
    magMesh.add(sMag, sPad);
    magMesh.position.set(0, -0.02 - sMagH * 0.5, -0.055);

    group.add(buildPicatinnyRail(isM24 ? 0.24 : 0.44, 0.034, 0.064, isM24 ? 0.0 : -0.10, darkMetal));
    group.add(rec, stock, cheekRiser, grip, barrel, brake, bipod, scope, magMesh,
      buildReceiverPolish(0.050, 0.038, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = isM24 ? -0.92 : -0.80;
  } else if (weaponId === 'm1911' || weaponId === 'beretta92') {
    // Classic Iconic Real-World Pistols: Colt M1911A1 .45 (Blued Steel + Walnut Grips) & Beretta M92FS (Open-Top Italian Slide + Exposed Stainless Barrel)
    const is1911 = weaponId === 'm1911';
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: is1911 ? '#252b36' : '#1b2029', bumpMap: metalBump, bumpScale: 0.0035, envMap, metalness: 0.84, roughness: 0.26 })
      : bodyMat;
    const frameMat = skinId === 'default'
      ? (is1911 ? slideMat : darkMetal)
      : accentMat;

    const frame = extrudeSideProfile([
      [-0.080, -0.012], [0.165, -0.012], [0.165, 0.022], [-0.080, 0.022]
    ], 0.028, 0.003, frameMat);
    const slide = extrudeSideProfile(is1911
      ? [[-0.082, 0.018], [0.175, 0.018], [0.175, 0.054], [-0.076, 0.054]]
      : [[-0.084, 0.018], [0.162, 0.018], [0.158, 0.054], [-0.078, 0.054]],
      0.030, 0.0035, slideMat);
    // Beretta M92FS iconic exposed stainless barrel emerging out the front of open-top slide
    const bLen = is1911 ? 0.12 : 0.165;
    const expBarrel = buildPrecisionBarrel({
      rFront: 0.0075, rRear: 0.0082, length: bLen, y: 0.038, zCenter: is1911 ? -0.130 : -0.118,
      darkMat: is1911 ? darkMetal : steelMat, steelMat
    });
    const grip = buildErgonomicGrip(0.044, 0.102, 0.030, is1911 ? (skinId === 'default' ? woodMat : gripMat) : polymerMat, darkMetal, -0.008, 0.030);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.018, 0.016), steelMat);
    hammer.position.set(0, 0.036, 0.086);
    hammer.rotation.x = -0.42;

    magMesh = new THREE.Group();
    const pMagH = isExt ? 0.115 : 0.092;
    const pMag = new THREE.Mesh(new THREE.BoxGeometry(0.021, pMagH, 0.035), darkMetal);
    const pPad = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.009, 0.040), steelMat);
    pPad.position.y = -pMagH * 0.5;
    magMesh.add(pMag, pPad);
    magMesh.position.set(0, -0.068, 0.056);
    magMesh.rotation.x = -0.26;

    railY = 0.058;
    opticZ = -0.02;
    aimDistanceZ = -0.36;
    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.085, 0.024, 0.055, -0.02, darkMetal));
    } else {
      group.add(buildOpenIronSights(0.068, -0.155, 0.064, darkMetal, '#4ade80', '#f97316', 0.007));
      ironSightY = 0.067;
      ironRearZ = 0.068;
    }
    group.add(frame, slide, expBarrel, grip, hammer, magMesh,
      buildPistolSlideDetails(0.030, 0.054, -0.16, 0.075, darkMetal, steelMat, brassMat));
    muzzleZ = is1911 ? -0.195 : -0.205;
  } else if (weaponId === 'knife' || weaponId === 'karambit' || weaponId === 'katana') {
    const isKara = weaponId === 'karambit';
    const isKatana = weaponId === 'katana';
    const bladeMat = new THREE.MeshStandardMaterial({
      map: skinId === 'default' ? null : skinTex,
      bumpMap: metalBump,
      bumpScale: 0.002,
      envMap,
      color: skinId === 'default' ? (isKara ? '#ef4444' : '#e2e8f0') : '#ffffff',
      metalness: 0.95,
      roughness: 0.14,
      envMapIntensity: 1.7
    });

    if (isKatana) {
      // Tactical Carbon-Forged Japanese Katana / Wakizashi: Diamond-wrapped tsuka handle, circular tsuba guard, curved razor blade with hamon ridge
      const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.19, 12), polymerMat);
      tsuka.rotation.x = Math.PI / 2;
      tsuka.position.set(0, 0, 0.08);
      for (let w = 0; w < 6; w++) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.0165, 0.0032, 6, 12), accentMat);
        wrap.position.set(0, 0, 0.015 + w * 0.026);
        group.add(wrap);
      }
      const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.018, 12), darkMetal);
      pommel.rotation.x = Math.PI / 2;
      pommel.position.set(0, 0, 0.180);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.008, 18), darkMetal);
      tsuba.rotation.x = Math.PI / 2;
      tsuba.position.set(0, 0, -0.018);
      const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.028, 0.024), brassMat);
      habaki.position.set(0, 0.002, -0.032);
      const blade = extrudeSideProfile([
        [0.040, -0.010], [0.22, -0.006], [0.42, 0.006], [0.56, 0.024],
        [0.52, 0.034], [0.38, 0.022], [0.18, 0.014], [0.040, 0.014]
      ], 0.0055, 0.0018, bladeMat);
      group.add(tsuka, pommel, tsuba, habaki, blade);
    } else if (isKara) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 12, 22), darkMetal);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0, -0.032, 0.105);
      const handle = extrudeSideProfile([
        [-0.088, -0.026], [-0.015, -0.004], [0.022, 0.012], [0.010, 0.036], [-0.075, 0.004]
      ], 0.020, 0.004, polymerMat);
      const blade = extrudeSideProfile([
        [0.015, 0.002], [0.095, -0.002], [0.165, -0.062], [0.125, -0.010], [0.012, 0.034]
      ], 0.006, 0.002, bladeMat);
      group.add(ring, handle, blade);
    } else {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.13, 14), polymerMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, 0.05);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), steelMat);
      pommel.position.set(0, 0, 0.12);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.084, 0.016), darkMetal);
      guard.position.set(0, 0, -0.018);
      const blade = extrudeSideProfile([
        [0.024, -0.016], [0.225, -0.014], [0.275, 0.004], [0.220, 0.024], [0.024, 0.022]
      ], 0.006, 0.002, bladeMat);
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.145), darkMetal);
      fuller.position.set(0, 0.008, -0.115);
      group.add(handle, pommel, guard, blade, fuller);
    }
    muzzleZ = isKatana ? -0.52 : -0.25;
  }

  // Mount Realistic EOTech EXPS3 Holo / Trijicon ACOG TA31 & Muzzle Attachments
  let aimSightY = ironSightY;
  let aimSightZ = ironRearZ;

  if (!isSniper && !isMelee) {
    if (optic === 'reddot') {
      // Realistic EOTech EXPS3 Holographic Sight with protective steel hood, battery cylinder & emerald AR lens
      const opticGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.013, 0.078), darkMetal);
      base.position.set(0, railY + 0.006, opticZ);
      const batteryCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.032, 12), steelMat);
      batteryCap.rotation.z = Math.PI / 2;
      batteryCap.position.set(0, railY + 0.016, opticZ - 0.028);
      const hoodL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.036, 0.048), darkMetal);
      hoodL.position.set(-0.019, railY + 0.028, opticZ + 0.004);
      const hoodR = hoodL.clone();
      hoodR.position.x = 0.019;
      const topHood = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.0055, 0.048), darkMetal);
      topHood.position.set(0, railY + 0.046, opticZ + 0.004);
      const qdLever = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.010, 0.028), steelMat);
      qdLever.position.set(-0.020, railY + 0.006, opticZ + 0.006);

      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.031, 0.029),
        new THREE.MeshBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
      );
      glass.position.set(0, railY + 0.028, opticZ + 0.004);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0016, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ff2e2e' })
      );
      dot.position.set(0, railY + 0.028, opticZ + 0.004);
      const holoRing = new THREE.Mesh(
        new THREE.RingGeometry(0.0052, 0.0062, 18),
        new THREE.MeshBasicMaterial({ color: '#ff3b3b', side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
      );
      holoRing.position.set(0, railY + 0.028, opticZ + 0.004);

      opticGroup.add(base, batteryCap, hoodL, hoodR, topHood, qdLever, glass, dot, holoRing);
      group.add(opticGroup);
      aimSightY = railY + 0.028;
      aimSightZ = opticZ + 0.004;
    } else if (optic === 'acog') {
      // Realistic Trijicon ACOG TA31 4x32 with armored thumb-screw mount, glowing red fiber collector & sapphire lens
      const acogGroup = new THREE.Group();
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.016, 0.082), darkMetal);
      mount.position.set(0, railY + 0.006, opticZ);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0175, 0.125, 18), darkMetal);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, railY + 0.027, opticZ);
      const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(0.0245, 0.0185, 0.048, 18), darkMetal);
      bellFront.rotation.x = Math.PI / 2;
      bellFront.position.set(0, railY + 0.027, opticZ - 0.072);
      const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 10), steelMat);
      turretTop.position.set(0, railY + 0.046, opticZ + 0.024);
      const turretSide = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.014, 10), steelMat);
      turretSide.rotation.z = Math.PI / 2;
      turretSide.position.set(0.022, railY + 0.027, opticZ + 0.020);
      const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.088, 10), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
      fiber.rotation.x = Math.PI / 2;
      fiber.position.set(0, railY + 0.049, opticZ - 0.012);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0155, 16), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
      lens.position.set(0, railY + 0.027, opticZ + 0.063);
      acogGroup.add(mount, tube, bellFront, turretTop, turretSide, fiber, lens);
      group.add(acogGroup);
      aimSightY = railY + 0.027;
      aimSightZ = opticZ;
    }

    const muzzle = attachments?.muzzle || 'none';
    if (muzzle === 'suppressor' && !wCfg.builtInSuppressed) {
      group.add(buildSuppressorUnit(barrelY, muzzleZ - 0.085, 0.18, 0.020, darkMetal, steelMat));
      muzzleZ -= 0.175;
    } else if (muzzle === 'compensator') {
      group.add(buildMultiBaffleBrake(0.015, barrelY, muzzleZ - 0.026, accentMat, darkMetal, true));
      muzzleZ -= 0.055;
    }
  }

  if (magMesh) magMesh.name = 'gun_mag';
  if (boltMesh) boltMesh.name = 'gun_bolt';

  const isSuppressed = attachments?.muzzle === 'suppressor' || Boolean(wCfg.builtInSuppressed) || weaponId === 'm4a1';
  const ejectPortPos = new THREE.Vector3(0.032, barrelY + 0.008, 0.012);

  group.userData = {
    weaponId,
    optic,
    isSuppressed,
    magMesh,
    magBasePos: magMesh ? magMesh.position.clone() : null,
    boltMesh,
    boltBaseZ: boltMesh ? boltMesh.position.z : 0,
    muzzlePos: new THREE.Vector3(0, barrelY, muzzleZ),
    ejectPortPos,
    aimSightLocalPos: new THREE.Vector3(0, aimSightY, aimSightZ),
    aimDistanceZ
  };
  if (magMesh?.isGroup) batchStaticWeaponParts(magMesh);
  if (boltMesh?.isGroup) batchStaticWeaponParts(boltMesh);
  batchStaticWeaponParts(group);
  return group;
}

export function createWeaponModel(weaponId = 'ak47', skinId = 'default', attachments = {}) {
  const attachKey = Object.entries(attachments || {}).sort().map(([k, v]) => `${k}:${v}`).join(',');
  const cacheKey = `${weaponId}_${skinId}_${attachKey}`;
  let template = weaponTemplateCache.get(cacheKey);
  if (!template) {
    template = buildWeaponModelDirect(weaponId, skinId, attachments);
    weaponTemplateCache.set(cacheKey, template);
  }
  const cloned = template.clone(true);
  const clonedMag = cloned.getObjectByName('gun_mag');
  const clonedBolt = cloned.getObjectByName('gun_bolt');
  const clonedTrigger = cloned.getObjectByName('gun_trigger');
  cloned.userData = {
    ...template.userData,
    magMesh: clonedMag,
    magBasePos: clonedMag ? clonedMag.position.clone() : null,
    boltMesh: clonedBolt,
    boltBaseZ: clonedBolt ? clonedBolt.position.z : 0,
    triggerMesh: clonedTrigger,
    muzzlePos: template.userData.muzzlePos ? template.userData.muzzlePos.clone() : null,
    ejectPortPos: template.userData.ejectPortPos ? template.userData.ejectPortPos.clone() : new THREE.Vector3(0.032, 0.038, 0.012),
    aimSightLocalPos: template.userData.aimSightLocalPos ? template.userData.aimSightLocalPos.clone() : null
  };
  // Automatically hydrate optional external GLB weapon if registered in assets/weapons/manifest.json
  hydrateGlbWeaponIfConfigured(cloned, weaponId);
  return cloned;
}

const thirdPersonWeaponCache = new Map();

// Batches a 35-mesh procedural weapon down into ~3-5 merged meshes by material for remote bots (8x fewer GPU draw calls, identical visuals)
function createThirdPersonWeaponModel(weaponId = 'ak47', skinId = 'default', attachments = {}) {
  const attachKey = Object.entries(attachments || {}).sort().map(([k, v]) => `${k}:${v}`).join(',');
  const cacheKey = `${weaponId}_${skinId}_${attachKey}`;
  let mergedTemplate = thirdPersonWeaponCache.get(cacheKey);
  if (!mergedTemplate) {
    let baseTemplate = weaponTemplateCache.get(cacheKey);
    if (!baseTemplate) {
      baseTemplate = buildWeaponModelDirect(weaponId, skinId, attachments);
      weaponTemplateCache.set(cacheKey, baseTemplate);
    }
    baseTemplate.updateMatrixWorld(true);
    const invRoot = new THREE.Matrix4().copy(baseTemplate.matrixWorld).invert();
    const byMat = new Map(); // material -> Array<BufferGeometry>
    const fallbackGroup = new THREE.Group();

    baseTemplate.traverse((child) => {
      if (!child.isMesh || !child.geometry || !child.visible) return;
      const mat = Array.isArray(child.material) ? child.material[0] : child.material;
      if (!mat) return;
      try {
        let g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        const relM = new THREE.Matrix4().multiplyMatrices(invRoot, child.matrixWorld);
        g.applyMatrix4(relM);
        // Strip mismatched extra attributes so mergeGeometries always succeeds cleanly
        const keep = new Set(['position', 'normal', 'uv']);
        for (const attrName of Object.keys(g.attributes)) {
          if (!keep.has(attrName)) g.deleteAttribute(attrName);
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) {
          g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        }
        let arr = byMat.get(mat);
        if (!arr) { arr = []; byMat.set(mat, arr); }
        arr.push(g);
      } catch {
        const c = child.clone();
        c.castShadow = false;
        c.receiveShadow = false;
        fallbackGroup.add(c);
      }
    });

    mergedTemplate = new THREE.Group();
    if (BufferGeometryUtils?.mergeGeometries) {
      for (const [mat, geos] of byMat.entries()) {
        if (!geos.length) continue;
        const combined = geos.length === 1 ? geos[0] : BufferGeometryUtils.mergeGeometries(geos, false);
        if (combined) {
          if (geos.length > 1) {
            for (const g of geos) g.dispose();
          }
          const m = new THREE.Mesh(combined, mat);
          m.castShadow = false;
          m.receiveShadow = false;
          mergedTemplate.add(m);
        } else {
          for (const g of geos) {
            const m = new THREE.Mesh(g, mat);
            m.castShadow = false;
            m.receiveShadow = false;
            mergedTemplate.add(m);
          }
        }
      }
    } else {
      mergedTemplate = baseTemplate.clone(true);
    }
    if (fallbackGroup.children.length > 0) mergedTemplate.add(fallbackGroup);
    thirdPersonWeaponCache.set(cacheKey, mergedTemplate);
  }
  return mergedTemplate.clone(true);
}

function getOperatorFpArmProfile(operatorId, outfitId, outfit) {
  const isFemale = Boolean((OPERATORS[operatorId]?.gender) === 'female');
  const isSwimwear = Boolean(outfit?.isSwimwear);
  const skinMap = {
    siren: '#f7d3be',
    valkyrie: '#f7d3be',
    phoenix: '#f7d3be',
    kagura: '#f7d3be',
    aria: '#b5724c',
    titan: isSwimwear ? '#d6a37c' : '#64748b',
    vanguard: outfit?.skinTone || '#d6a37c',
    ghost: outfit?.skinTone || '#cfa380',
    shadow: outfit?.skinTone || '#d1a482'
  };
  const skinTone = skinMap[operatorId] || outfit?.skinTone || '#d6a781';

  const shortSleeve = ['siren', 'aria'].includes(operatorId);
  const fingerless = ['phoenix', 'siren', 'aria', 'valkyrie', 'kagura'].includes(operatorId);
  const useSpecDark = ['urban', 'stealth_ops'].includes(outfitId);

  let sleevePrimary = outfit?.primary || '#334155';
  let cuffHex = outfit?.secondary || '#1e293b';
  let watchAccent = outfit?.accent || '#38bdf8';
  let gloveHex = '#18181b';

  if (operatorId === 'phoenix') {
    sleevePrimary = outfitId === 'urban' ? '#232730' : outfit.primary;
    cuffHex = outfitId === 'urban' ? '#12151c' : outfit.secondary;
    watchAccent = '#94a3b8';
    gloveHex = '#14171f';
  } else if (operatorId === 'kagura') {
    sleevePrimary = useSpecDark ? '#151922' : outfit.primary;
    cuffHex = useSpecDark ? '#0f131b' : outfit.secondary;
    watchAccent = outfitId === 'urban' ? '#06b6d4' : (outfit?.accent || '#06b6d4');
  } else if (operatorId === 'shadow') {
    sleevePrimary = useSpecDark ? '#141923' : outfit.primary;
    cuffHex = '#0b1017';
    watchAccent = '#10b981';
  } else if (operatorId === 'titan') {
    sleevePrimary = outfitId === 'urban' ? '#475569' : outfit.primary;
    cuffHex = '#1e293b';
    watchAccent = '#f59e0b';
    gloveHex = '#334155';
  } else if (operatorId === 'valkyrie') {
    cuffHex = '#7f1d1d';
    watchAccent = '#ef4444';
  } else if (operatorId === 'aria') {
    cuffHex = outfit?.accent || '#22d3ee';
    watchAccent = '#ec4899';
  }

  return {
    isFemale,
    isSwimwear,
    skinTone,
    shortSleeve,
    fingerless,
    sleevePrimary,
    cuffHex,
    watchAccent,
    gloveHex,
    hasBracer: operatorId === 'kagura' || operatorId === 'titan',
    hasWatch: !isSwimwear && operatorId !== 'aria'
  };
}

export function createFirstPersonRig(weaponId, skinId, attachments, outfitId = 'urban', operatorId = null) {
  const root = new THREE.Group();
  const outfit = OUTFITS[outfitId] || OUTFITS.urban;
  const prof = getOperatorFpArmProfile(operatorId || 'vanguard', outfitId, outfit);
  const { isSwimwear, isFemale, shortSleeve, fingerless } = prof;
  const gun = createWeaponModel(weaponId, skinId, attachments);
  const outfitTex = getOutfitTextures(outfitId, prof.sleevePrimary, prof.cuffHex, prof.watchAccent);

  const sleeveMat = new THREE.MeshStandardMaterial({
    map: ['phoenix', 'kagura', 'shadow'].includes(operatorId) && outfitId === 'urban' ? null : outfitTex.map,
    color: ['phoenix', 'kagura', 'shadow'].includes(operatorId) && outfitId === 'urban' ? prof.sleevePrimary : '#ffffff',
    bumpMap: outfitTex.bumpMap,
    bumpScale: 0.014,
    roughness: operatorId === 'kagura' || operatorId === 'titan' ? 0.36 : 0.68,
    metalness: operatorId === 'titan' ? 0.55 : (operatorId === 'kagura' ? 0.25 : 0.06)
  });
  const cuffMat = new THREE.MeshStandardMaterial({ color: prof.cuffHex, roughness: 0.56, metalness: 0.22 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: prof.gloveHex, roughness: 0.44, metalness: operatorId === 'titan' ? 0.65 : 0.26 });
  const knuckleMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.26, metalness: 0.78 });
  const skinMat = new THREE.MeshStandardMaterial({ color: prof.skinTone, roughness: 0.44, metalness: operatorId === 'titan' && !isSwimwear ? 0.68 : 0.02 });
  const glowAccentMat = new THREE.MeshStandardMaterial({ color: prof.watchAccent, emissive: prof.watchAccent, emissiveIntensity: 1.15, roughness: 0.22 });
  const bangleMat = new THREE.MeshStandardMaterial({ color: outfit.accent || '#fde047', metalness: 0.86, roughness: 0.18 });
  const watchFaceMat = new THREE.MeshBasicMaterial({ map: getWatchFaceTexture(prof.watchAccent) });

  // Choose sleeve vs bare forearm skin matching selected character & outfit!
  const upperArmMat = isSwimwear ? skinMat : sleeveMat;
  const forearmMat = (isSwimwear || shortSleeve) ? skinMat : sleeveMat;
  const handMat = isSwimwear ? skinMat : gloveMat;
  const fingerMat = (isSwimwear || fingerless) ? skinMat : gloveMat;

  const armRTop = isSwimwear || isFemale ? 0.037 : 0.046;
  const armRBot = isSwimwear || isFemale ? 0.029 : 0.037;
  const wristBandPos = new THREE.Vector3();

  // Right Arm + Articulated Grip Fingers matching Operator Outfit/Gloves
  const rArmGroup = new THREE.Group();
  const rShoulder = new THREE.Vector3(0.14, -0.15, 0.38);
  const rMid = new THREE.Vector3(0.085, -0.12, 0.26);
  const rWrist = new THREE.Vector3(0.03, -0.09, 0.14);
  if (!isSwimwear && shortSleeve) {
    connectLimbSegment(rArmGroup, rShoulder, rMid, armRTop, armRTop * 0.94, upperArmMat);
    connectLimbSegment(rArmGroup, rMid, rWrist, armRTop * 0.90, armRBot, forearmMat);
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(armRTop * 0.95, armRTop * 0.95, 0.018, 12), cuffMat);
    hem.rotation.x = Math.PI / 2;
    hem.position.copy(rMid);
    rArmGroup.add(hem);
  } else {
    connectLimbSegment(rArmGroup, rShoulder, rWrist, armRTop, armRBot, forearmMat);
  }

  const rHand = new THREE.Mesh(new THREE.CapsuleGeometry(isFemale ? 0.020 : 0.025, 0.044, 6, 10), handMat);
  rHand.rotation.x = Math.PI / 2;
  rHand.position.set(0.018, -0.078, 0.095);
  rArmGroup.add(rHand);

  if (!isSwimwear) {
    const rKnuckle = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.044 : 0.052, 0.012, 0.028), operatorId === 'valkyrie' ? cuffMat : knuckleMat);
    rKnuckle.position.set(0.018, -0.054, 0.088);
    rArmGroup.add(rKnuckle);
    if (prof.hasBracer) {
      const rBracer = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.010, 0.115), glowAccentMat);
      rBracer.position.set(0.095, -0.095, 0.25);
      rBracer.rotation.y = -0.35;
      rArmGroup.add(rBracer);
    }
  }
  const rTriggerFinger = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.028, 4, 6), fingerMat);
  rTriggerFinger.rotation.x = Math.PI / 2;
  rTriggerFinger.position.set(0.015, -0.044, 0.058);
  for (let f = 0; f < 3; f++) {
    const gFinger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0065, 0.022, 4, 6), fingerMat);
    gFinger.rotation.z = Math.PI / 2;
    gFinger.position.set(0.005, -0.064 - f * 0.013, 0.082 + f * 0.004);
    rArmGroup.add(gFinger);
  }
  rArmGroup.add(rTriggerFinger);

  // Left Arm + Character Wrist Gear (Bikini Bangle vs Tactical Watch/Bracer) + Supporting Hand
  const fpCfg = WEAPONS[weaponId];
  const isShort = Boolean(fpCfg?.isMelee || fpCfg?.subClass === 'pistol');
  const lArmGroup = new THREE.Group();
  const lWrist = new THREE.Vector3(-0.028, -0.056, isShort ? 0.045 : -0.13);
  const lElbow = new THREE.Vector3(-0.18, -0.15, isShort ? 0.28 : 0.16);
  const lMid = new THREE.Vector3().lerpVectors(lElbow, lWrist, 0.45);
  if (!isSwimwear && shortSleeve) {
    connectLimbSegment(lArmGroup, lElbow, lMid, armRTop, armRTop * 0.94, upperArmMat);
    connectLimbSegment(lArmGroup, lMid, lWrist, armRTop * 0.90, armRBot, forearmMat);
    const lHem = new THREE.Mesh(new THREE.CylinderGeometry(armRTop * 0.95, armRTop * 0.95, 0.018, 12), cuffMat);
    lHem.rotation.x = Math.PI / 2;
    lHem.position.copy(lMid);
    lArmGroup.add(lHem);
  } else {
    connectLimbSegment(lArmGroup, lElbow, lWrist, armRTop, armRBot, forearmMat);
  }

  if (isSwimwear) {
    // Only slender beach bangle bracelet when wearing bikini — zero black watch or glove pads!
    const bangle = new THREE.Mesh(new THREE.TorusGeometry(armRBot + 0.004, 0.0035, 8, 18), bangleMat);
    bangle.rotation.y = 0.28;
    bangle.position.copy(lWrist).add(new THREE.Vector3(-0.008, -0.004, 0.018));
    lArmGroup.add(bangle);
  } else {
    const lCuff = new THREE.Mesh(new THREE.CylinderGeometry(armRBot + 0.0025, armRBot + 0.0025, 0.036, 12), cuffMat);
    lCuff.rotation.x = Math.PI / 2;
    lCuff.position.copy(lWrist).add(new THREE.Vector3(-0.012, -0.008, 0.02));
    lCuff.rotation.y = 0.28;
    lArmGroup.add(lCuff);

    if (prof.hasWatch) {
      wristBandPos.copy(lWrist);
      const watchBand = new THREE.Mesh(new THREE.CylinderGeometry(armRBot + 0.0035, armRBot + 0.0035, 0.018, 12), knuckleMat);
      watchBand.rotation.x = Math.PI / 2;
      watchBand.position.copy(wristBandPos);
      const watchScreen = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, 0.027), operatorId === 'phoenix' ? knuckleMat : watchFaceMat);
      watchScreen.position.copy(wristBandPos).add(new THREE.Vector3(0.006, 0.026, 0));
      lArmGroup.add(watchBand, watchScreen);
    }
    if (prof.hasBracer) {
      const lBracer = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.010, 0.115), glowAccentMat);
      lBracer.position.copy(lMid).add(new THREE.Vector3(-0.028, 0.018, 0));
      lBracer.rotation.y = 0.28;
      lArmGroup.add(lBracer);
    }
  }

  const lHand = new THREE.Mesh(new THREE.CapsuleGeometry(isFemale ? 0.020 : 0.025, 0.046, 6, 10), handMat);
  lHand.rotation.x = Math.PI / 2;
  lHand.position.set(-0.014, -0.044, isShort ? 0.020 : -0.19);
  lArmGroup.add(lHand);
  if (!isSwimwear) {
    const lKnuckle = new THREE.Mesh(new THREE.BoxGeometry(isFemale ? 0.045 : 0.053, 0.012, 0.032), operatorId === 'valkyrie' ? cuffMat : knuckleMat);
    lKnuckle.position.set(-0.014, -0.019, isShort ? 0.018 : -0.19);
    lArmGroup.add(lKnuckle);
  }
  const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.028, 4, 6), fingerMat);
  lThumb.rotation.x = Math.PI / 2;
  lThumb.position.set(-0.025, -0.014, isShort ? 0.015 : -0.19);
  for (let f = 0; f < 4; f++) {
    const supFinger = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.024, 4, 6), fingerMat);
    supFinger.rotation.z = Math.PI / 2;
    supFinger.position.set(-0.006, -0.032, (isShort ? 0.006 : -0.205) + f * 0.012);
    lArmGroup.add(supFinger);
  }
  lArmGroup.add(lThumb);

  // Volumetric 3D Muzzle Flash + Dynamic Light anchor at barrel tip
  const flashGroup = createMuzzleFlashRig(true);
  if (gun.userData.muzzlePos) {
    flashGroup.position.copy(gun.userData.muzzlePos);
  }

  // Ejection port anchor on right side of receiver for 3D brass/shotgun shell casings
  const ejectAnchor = new THREE.Object3D();
  ejectAnchor.userData.keepWithGlb = true;
  if (gun.userData.ejectPortPos) {
    ejectAnchor.position.copy(gun.userData.ejectPortPos);
  } else {
    ejectAnchor.position.set(0.032, 0.038, 0.012);
  }

  root.add(gun, rArmGroup, lArmGroup, flashGroup, ejectAnchor);
  root.userData = {
    gun,
    flashGroup,
    ejectAnchor,
    lArm: lArmGroup,
    lArmBasePos: lArmGroup.position.clone(),
    rArm: rArmGroup,
    rArmBasePos: rArmGroup.position.clone(),
    operatorId: operatorId || 'vanguard',
    outfitId
  };
  return root;
}

const nameplateCache = new Map();

function makeNameplateSprite(name, team, isAlly) {
  const cleanName = String(name || 'Chiến Binh').slice(0, 16);
  const cacheKey = `${cleanName}_${team}_${isAlly}`;
  const cached = nameplateCache.get(cacheKey);
  if (cached) {
    return cached.clone();
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
  ctx.beginPath();
  ctx.roundRect(14, 10, 228, 44, 10);
  ctx.fill();

  const accent = team === 'alpha' ? '#38bdf8' : (team === 'bravo' ? '#f97316' : (isAlly ? '#22c55e' : '#ef4444'));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cleanName, 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.45, 0.36, 1);
  sprite.position.set(0, 2.15, 0);
  nameplateCache.set(cacheKey, sprite);
  return sprite.clone();
}

function mountWeaponOnGroup(weaponMount, weaponId, skinId, attachments) {
  while (weaponMount.children.length > 0) {
    weaponMount.remove(weaponMount.children[0]);
  }
  const gunMesh = createThirdPersonWeaponModel(weaponId, skinId, attachments);
  const tpCfg = WEAPONS[weaponId];
  const isMelee = Boolean(tpCfg?.isMelee);
  const isPistol = tpCfg?.subClass === 'pistol';
  gunMesh.scale.setScalar(0.92);
  if (isMelee) {
    gunMesh.position.set(0, 0.01, -0.055);
  } else if (isPistol) {
    gunMesh.position.set(0, 0.048, -0.048);
  } else {
    gunMesh.position.set(0, 0.052, -0.095);
  }
  weaponMount.add(gunMesh);
}

// World-space bone segment orientation solver (invariant to Mixamo/Quaternius/RPM rest axes)
function aimBoneSegmentWorld(bone, childBone, desiredWorldDir, blend = 1.0) {
  if (!bone || !childBone || blend <= 0.001) return;
  bone.updateMatrixWorld(true);
  bone.getWorldPosition(_v0);
  childBone.getWorldPosition(_v1);
  _v1.sub(_v0);
  if (_v1.lengthSq() < 1e-8) return;
  _v1.normalize();

  _v2.copy(desiredWorldDir).normalize();
  _q0.setFromUnitVectors(_v1, _v2);
  bone.getWorldQuaternion(_q1);
  _q2.multiplyQuaternions(_q0, _q1);

  if (bone.parent) {
    bone.parent.getWorldQuaternion(_q1);
    _q1.invert();
    _q2.premultiply(_q1);
  }
  bone.quaternion.slerp(_q2, blend);
  bone.updateMatrixWorld(true);
}

function clearTacticalMounts(rig) {
  if (!rig?.tacticalMounts?.length) return;
  for (const tm of rig.tacticalMounts) {
    if (tm.node?.parent) tm.node.parent.remove(tm.node);
  }
  rig.tacticalMounts = [];
}

function attachBoneTrackedGear(rig, boneKey, gearGroup, offsetFromBone) {
  const bone = rig.bones?.[boneKey];
  if (!bone || !rig.bodyRoot) return;
  rig.bodyRoot.updateMatrixWorld(true);

  const bodyWorldQ = new THREE.Quaternion();
  rig.bodyRoot.getWorldQuaternion(bodyWorldQ);
  const bodyInvQ = bodyWorldQ.clone().invert();

  const boneWorldQ = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorldQ);
  const restBoneRelQ = boneWorldQ.premultiply(bodyInvQ);

  const bonePosLocal = new THREE.Vector3();
  bone.getWorldPosition(bonePosLocal);
  rig.bodyRoot.worldToLocal(bonePosLocal);

  gearGroup.position.copy(bonePosLocal).add(offsetFromBone);
  gearGroup.quaternion.set(0, 0, 0, 1);
  rig.bodyRoot.add(gearGroup);

  if (!rig.tacticalMounts) rig.tacticalMounts = [];
  rig.tacticalMounts.push({
    node: gearGroup,
    boneKey,
    bone,
    offsetFromBone: offsetFromBone.clone(),
    restBoneInvQ: restBoneRelQ.invert()
  });
}

function makeQuadNvgAssembly(glowColor = '#10b981') {
  const g = new THREE.Group();
  const housingMat = new THREE.MeshStandardMaterial({ color: '#1b2230', metalness: 0.72, roughness: 0.28 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.45, roughness: 0.44 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 2.1,
    roughness: 0.12,
    metalness: 0.35
  });

  // Forehead helmet shroud + folding bridge arm
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.044, 0.022), carbonMat);
  shroud.position.set(0, 0.032, 0.015);
  g.add(shroud);

  const bridgeArm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.018, 0.052), housingMat);
  bridgeArm.position.set(0, 0.022, -0.014);
  bridgeArm.rotation.x = 0.25;
  g.add(bridgeArm);

  // Horizontal panoramic GPNVG-18 wing bar
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.020, 0.024), housingMat);
  wing.position.set(0, 0.008, -0.034);
  g.add(wing);

  // 4 optical tubes angled gently outward like real GPNVG-18
  for (const [tx, ty, yaw] of [
    [-0.056, -0.002, 0.16],
    [-0.021, -0.002, 0.03],
    [0.021, -0.002, -0.03],
    [0.056, -0.002, -0.16]
  ]) {
    const pod = new THREE.Group();
    pod.position.set(tx, ty, -0.052);
    pod.rotation.y = yaw;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0165, 0.064, 14), carbonMat);
    tube.rotation.x = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.012, 14), housingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = -0.026;
    const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.006, 14), lensMat);
    optic.rotation.x = Math.PI / 2;
    optic.position.z = -0.031;
    pod.add(tube, ring, optic);
    g.add(pod);
  }

  // Head tactical band + rear NVG battery pack counterweight
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.024, 18, 1, true), carbonMat);
  strap.position.set(0, 0.026, 0.115);
  strap.scale.set(0.92, 1, 1.08);
  g.add(strap);

  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.048, 0.034), carbonMat);
  battery.position.set(0, 0.020, 0.225);
  const statusLed = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 0.006), lensMat);
  statusLed.position.set(0, 0.020, 0.244);
  g.add(battery, statusLed);
  return g;
}

function makePlateCarrierVest(primaryHex, accentHex, frontZ = -0.135, backZ = 0.088, width = 0.23, isFemaleContoured = false) {
  const g = new THREE.Group();
  const plateMat = new THREE.MeshStandardMaterial({ color: primaryHex, metalness: 0.36, roughness: 0.44 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.48, roughness: 0.36 });
  const nylonMat = new THREE.MeshStandardMaterial({ color: '#181c24', roughness: 0.72, metalness: 0.14 });
  const magTipMat = new THREE.MeshStandardMaterial({ color: '#785a3c', roughness: 0.55, metalness: 0.22 });
  const glowMat = new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 1.2, roughness: 0.2 });

  // Sleek low-profile ballistic front plate (hugs slender female waist cleanly without bulky flare)
  const frontW = width * (isFemaleContoured ? 0.84 : 0.92);
  const frontH = isFemaleContoured ? 0.185 : 0.24;
  const frontDepth = isFemaleContoured ? 0.016 : 0.028;
  const frontPlate = new THREE.Mesh(new THREE.BoxGeometry(frontW, frontH, frontDepth), plateMat);
  frontPlate.position.set(0, -0.015, frontZ);
  g.add(frontPlate);

  if (isFemaleContoured) {
    const upperBib = new THREE.Mesh(new THREE.BoxGeometry(frontW * 0.78, 0.068, 0.014), plateMat);
    upperBib.position.set(0, 0.065, frontZ + 0.008);
    upperBib.rotation.x = -0.22;
    g.add(upperBib);
  }

  // Triple MOLLE rifle magazine pouches across abdomen (sleeker & fitted for female vest)
  const pouchW = isFemaleContoured ? 0.040 : 0.052;
  const pouchH = isFemaleContoured ? 0.066 : 0.086;
  const pouchD = isFemaleContoured ? 0.018 : 0.026;
  const pouchStep = isFemaleContoured ? 0.045 : 0.062;
  const pouchY = isFemaleContoured ? -0.066 : -0.078;
  const pouchZ = frontZ - (isFemaleContoured ? 0.012 : 0.018);

  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(pouchW, pouchH, pouchD), nylonMat);
    pouch.position.set(i * pouchStep, pouchY, pouchZ);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(pouchW * 0.92, 0.012, pouchD + 0.002), trimMat);
    flap.position.set(i * pouchStep, pouchY + pouchH * 0.36, pouchZ - 0.001);
    g.add(pouch, flap);
    if (isFemaleContoured) {
      // Exposed mag floor-tops like modern low-profile tactical chest rigs
      const magTop = new THREE.Mesh(new THREE.BoxGeometry(pouchW * 0.74, 0.018, pouchD * 0.65), magTipMat);
      magTop.position.set(i * pouchStep, pouchY + pouchH * 0.56, pouchZ + 0.001);
      g.add(magTop);
    }
  }

  // Subdued tactical chest patch / telemetry strip
  const idStrip = new THREE.Mesh(new THREE.BoxGeometry(isFemaleContoured ? 0.046 : 0.074, isFemaleContoured ? 0.024 : 0.012, 0.006), isFemaleContoured ? trimMat : glowMat);
  idStrip.position.set(0, isFemaleContoured ? 0.045 : 0.062, frontZ - 0.011);
  g.add(idStrip);

  // Rear ballistic pack + MOLLE webbing ribs
  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(frontW * 0.88, frontH * 0.92, isFemaleContoured ? 0.018 : 0.036), plateMat);
  backPlate.position.set(0, -0.01, backZ);
  g.add(backPlate);
  if (isFemaleContoured) {
    for (let r = -2; r <= 1; r++) {
      const molleRow = new THREE.Mesh(new THREE.BoxGeometry(frontW * 0.82, 0.008, 0.005), nylonMat);
      molleRow.position.set(0, r * 0.026 - 0.01, backZ + 0.010);
      g.add(molleRow);
    }
  } else {
    const backStrip = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.010, 0.008), glowMat);
    backStrip.position.set(0, 0.06, backZ + 0.020);
    g.add(backStrip);
  }

  // Fitted over-shoulder carrier straps connecting front to back
  const strapDepth = Math.max(0.12, backZ - frontZ + 0.008);
  const strapMidZ = (frontZ + backZ) * 0.5;
  const strapW = isFemaleContoured ? 0.026 : 0.044;
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(strapW, 0.012, strapDepth), nylonMat);
    strap.position.set(side * (frontW * 0.36), frontH * 0.48, strapMidZ);
    g.add(strap);
  }
  return g;
}

function buildOperatorTacticalMounts(rig, archetypeKey, opCfg, outCfg, teamGlowColor) {
  clearTacticalMounts(rig);
  if (!rig?.bones) return;

  const isSwimwear = Boolean(outCfg?.isSwimwear);
  const opId = opCfg?.id || 'vanguard';
  const accentHex = outCfg?.accent || teamGlowColor || '#38bdf8';
  const darkArmor = outCfg?.id === 'arctic' ? '#334155' : (outCfg?.vest || '#18181b');

  // 1. SHADOW NVG (on Avatar_Orion.glb): Quad-Tube Emerald GPNVG-18 + Stealth Chest Rig
  if (opId === 'shadow') {
    const nvgOffset = archetypeKey === 'orion'
      ? new THREE.Vector3(0, 0.088, -0.142)
      : new THREE.Vector3(0, 0.082, -0.135);
    attachBoneTrackedGear(rig, 'head', makeQuadNvgAssembly('#10b981'), nvgOffset);
    if (!isSwimwear) {
      const rigVest = makePlateCarrierVest('#141923', '#10b981', -0.172, 0.122, 0.24, false);
      attachBoneTrackedGear(rig, 'spine', rigVest, new THREE.Vector3(0, -0.02, 0));
    }
    return;
  }

  // Female Bikini Mode & Summer outfits: wear ONLY Bikini (zero vests, holsters, sunglasses, berets, or visors)
  if (isSwimwear) return;

  // 2. PHOENIX (NỮ): Platinum Spec-Ops Operator matching reference (Plate Carrier + White ID Badge + Cyan Chemlights + Cheek Bandage + Holster & Dual Thigh Straps)
  if (opId === 'phoenix') {
    const isUrban = !outCfg || outCfg.id === 'urban';
    const isGold = outCfg?.id === 'royal_gold';
    const vestMain = isUrban ? '#1e222b' : (isGold ? '#ca8a04' : (outCfg.id === 'arctic' ? '#cbd5e1' : (outCfg.id === 'crimson' ? '#991b1b' : (outCfg.id === 'cyber' ? '#3b0764' : (outCfg.vest || '#1b1f26')))));
    const vestAccent = isUrban ? '#e2e8f0' : (outCfg.accent || '#e2e8f0');
    const tacMat = new THREE.MeshStandardMaterial({ color: vestMain, metalness: isGold ? 0.78 : 0.34, roughness: isGold ? 0.24 : 0.54 });
    const matteMat = new THREE.MeshStandardMaterial({ color: isUrban ? '#11141a' : (outCfg.secondary || '#11141a'), metalness: 0.25, roughness: 0.64 });
    const steelTrim = new THREE.MeshStandardMaterial({ color: isGold ? '#facc15' : '#64748b', metalness: 0.85, roughness: 0.24 });
    const badgeMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, metalness: 0.08 });
    const chemCol = isUrban ? '#67e8f9' : vestAccent;
    const chemMat = new THREE.MeshStandardMaterial({ color: chemCol, emissive: chemCol, emissiveIntensity: 1.15, roughness: 0.22 });

    // Slim contoured Plate Carrier + triple rifle mag pouches (cleared cleanly outside sculpted bust)
    const vest = makePlateCarrierVest(vestMain, vestAccent, -0.149, 0.082, 0.176, true);

    // Side comms radio pouch + whip antenna on left flank
    const radioPouch = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.072, 0.044), matteMat);
    radioPouch.position.set(-0.098, -0.056, -0.082);
    const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0035, 0.068, 6), matteMat);
    radioAnt.position.set(-0.098, 0.005, -0.082);
    vest.add(radioPouch, radioAnt);

    // White Rectangular Chest Security ID Card Badge + lanyard clip on upper left chest (-X)
    const idClip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.006), steelTrim);
    idClip.position.set(-0.056, 0.076, -0.158);
    const idCard = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.048, 0.004), badgeMat);
    idCard.position.set(-0.058, 0.046, -0.160);
    const idPhoto = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.020, 0.002), steelTrim);
    idPhoto.position.set(-0.058, 0.052, -0.163);
    vest.add(idClip, idCard, idPhoto);

    // Pair of Pale Cyan Chemlights hanging off left waist
    for (let c = 0; c < 2; c++) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.072, 8), chemMat);
      stick.position.set(-0.098 - c * 0.012, -0.132, -0.032 + c * 0.014);
      stick.rotation.z = -0.16 - c * 0.08;
      vest.add(stick);
    }
    attachBoneTrackedGear(rig, 'spine', vest, new THREE.Vector3(0, -0.035, 0));

    // Left Wrist Tactical Watch
    if (rig.bones.lowerArmL) {
      const watch = new THREE.Group();
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.030, 0.016, 12), matteMat);
      strap.rotation.z = Math.PI / 2;
      const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 12), matteMat);
      dial.position.set(0, 0.028, 0);
      watch.add(strap, dial);
      attachBoneTrackedGear(rig, 'lowerArmL', watch, new THREE.Vector3(-0.175, 0, 0));
    }

    // Right Outer Thigh Drop-Leg Pistol Holster (+X) + Dual Left Thigh Straps & Pouch (-X)
    if (rig.bones.upperLegR) {
      const rRig = new THREE.Group();
      const rStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.060, 0.016, 12), matteMat);
      const holster = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.115, 0.060), tacMat);
      holster.position.set(0.064, -0.012, 0.002);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.040, 0.024), matteMat);
      grip.position.set(0.064, 0.046, -0.016);
      grip.rotation.x = 0.24;
      rRig.add(rStrap, holster, grip);
      attachBoneTrackedGear(rig, 'upperLegR', rRig, new THREE.Vector3(0, -0.14, 0));
    }
    if (rig.bones.upperLegL) {
      const lRig = new THREE.Group();
      for (const yOff of [0.028, -0.018]) {
        const lStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.061, 0.012, 12), matteMat);
        lStrap.position.y = yOff;
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.024), steelTrim);
        buckle.position.set(-0.022, yOff, -0.060);
        lRig.add(lStrap, buckle);
      }
      const thighPouch = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.068, 0.048), tacMat);
      thighPouch.position.set(-0.064, -0.008, 0);
      lRig.add(thighPouch);
      attachBoneTrackedGear(rig, 'upperLegL', lRig, new THREE.Vector3(0, -0.14, 0));
    }

    // Black Comms Earpiece (Left ear -X) & Small White Tactical Bandage (Right cheek +X)
    const headGear = new THREE.Group();
    const earPod = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), matteMat);
    earPod.position.set(-0.078, 0.042, -0.010);
    const coilTube = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.075, 6), matteMat);
    coilTube.position.set(-0.076, 0.0, 0.006);
    coilTube.rotation.z = -0.18;
    const bandage = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.014, 0.004), badgeMat);
    bandage.position.set(0.040, 0.044, -0.108);
    bandage.rotation.y = -0.36;
    bandage.rotation.z = -0.14;
    headGear.add(earPod, coilTube, bandage);
    attachBoneTrackedGear(rig, 'head', headGear, new THREE.Vector3(0, 0, 0));
    return;
  }

  // 3. KAGURA (Female Tactical Black Armored Spec-Ops Operator on ViviFemale.glb — slim tailored silhouette)
  if (opId === 'kagura') {
    const isGold = outCfg?.id === 'royal_gold';
    const suitArmor = (outCfg?.id === 'urban' || outCfg?.id === 'stealth_ops')
      ? '#151922'
      : (isGold ? '#ca8a04' : (outCfg?.id === 'crimson' ? '#991b1b' : (outCfg?.id === 'cyber' ? '#4c1d95' : (outCfg?.id === 'arctic' ? '#cbd5e1' : (outCfg?.primary || darkArmor)))));
    const armorGlow = outCfg?.id === 'urban' ? '#06b6d4' : accentHex;
    const plateMat = new THREE.MeshStandardMaterial({ color: suitArmor, metalness: isGold ? 0.82 : 0.56, roughness: isGold ? 0.20 : 0.30 });
    const glowMat = new THREE.MeshStandardMaterial({ color: armorGlow, emissive: armorGlow, emissiveIntensity: 1.5, roughness: 0.2 });

    // Slim contoured Black Tactical Plate Carrier Vest (cleared cleanly outside sculpted bust)
    const vest = makePlateCarrierVest(suitArmor, armorGlow, -0.151, 0.084, 0.178, true);
    attachBoneTrackedGear(rig, 'spine', vest, new THREE.Vector3(0, -0.025, 0));

    // Sleek Slim Carbon Shoulder Pauldrons
    for (const [bKey, xSign] of [['upperArmL', -1], ['upperArmR', 1]]) {
      const pauldron = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.062, 0.074), plateMat);
      shell.rotation.z = xSign * -0.24;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.042, 0.076), glowMat);
      stripe.position.x = xSign * 0.021;
      pauldron.add(shell, stripe);
      attachBoneTrackedGear(rig, bKey, pauldron, new THREE.Vector3(xSign * 0.022, -0.028, 0));
    }

    // Slim Armored Forearm Bracers & Carbon Combat Gloves
    for (const [lKey, hKey, xSign] of [['lowerArmL', 'handL', -1], ['lowerArmR', 'handR', 1]]) {
      const bracer = new THREE.Group();
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.025, 0.125, 10), plateMat);
      guard.rotation.z = Math.PI / 2;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.008, 0.010), glowMat);
      rail.position.set(0, 0.024, 0);
      bracer.add(guard, rail);
      attachBoneTrackedGear(rig, lKey, bracer, new THREE.Vector3(xSign * 0.105, 0, 0));

      const glove = new THREE.Group();
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.026, 0.052), plateMat);
      glove.add(knuckle);
      attachBoneTrackedGear(rig, hKey, glove, new THREE.Vector3(xSign * 0.024, 0, 0));
    }

    // Sleek Drop-Leg Tactical Pistol Holster on Right Outer Thigh
    if (rig.bones.upperLegR) {
      const holster = new THREE.Group();
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.058, 0.018, 12), plateMat);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.115, 0.062), plateMat);
      body.position.set(0.062, -0.01, 0.004);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.040, 0.026), plateMat);
      grip.position.set(0.062, 0.052, -0.014);
      grip.rotation.x = 0.25;
      holster.add(strap, body, grip);
      attachBoneTrackedGear(rig, 'upperLegR', holster, new THREE.Vector3(0.006, -0.145, 0));
    }

    // Low-Profile Carbon Knee Armor Pads
    for (const legKey of ['lowerLegL', 'lowerLegR']) {
      if (!rig.bones[legKey]) continue;
      const kPad = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.072, 0.024), plateMat);
      pad.rotation.x = 0.15;
      kPad.add(pad);
      attachBoneTrackedGear(rig, legKey, kPad, new THREE.Vector3(0, -0.020, -0.056));
    }

    // Spec-Ops Comms Headset & Cyan Half-Visor
    const headset = new THREE.Group();
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.014, 12), plateMat);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(-0.080, 0.01, 0.008);
    const micBoom = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.076), plateMat);
    micBoom.position.set(-0.068, -0.014, -0.040);
    micBoom.rotation.y = -0.24;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.060, 0.022, 0.007),
      new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.4, transparent: true, opacity: 0.72, roughness: 0.1 })
    );
    visor.position.set(-0.032, 0.036, -0.114);
    visor.rotation.y = 0.16;
    headset.add(ear, micBoom, visor);
    attachBoneTrackedGear(rig, 'head', headset, new THREE.Vector3(0, 0.042, -0.008));
    return;
  }

  if (opId === 'siren') {
    // Stylish Sporty Tactical Aviator Shades in non-bikini outfits
    const shades = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: '#18181b', metalness: 0.85, roughness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.45, metalness: 0.9, roughness: 0.08 });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.010), frameMat);
    for (const sx of [-0.032, 0.032]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.024, 0.008), glassMat);
      lens.position.set(sx, -0.004, -0.004);
      shades.add(lens);
    }
    shades.add(bridge);
    attachBoneTrackedGear(rig, 'head', shades, new THREE.Vector3(0, 0.068, -0.125));
  } else if (opId === 'ghost') {
    // Recon Tactical Plate Carrier + Radio Whip Antenna + Lower-Face Stealth Mask
    const ghostVest = makePlateCarrierVest('#1e293b', '#38bdf8', -0.155, 0.135, 0.25, false);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.26, 8), new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 }));
    ant.position.set(-0.095, 0.19, 0.145);
    ghostVest.add(ant);
    attachBoneTrackedGear(rig, 'spine', ghostVest, new THREE.Vector3(0, -0.015, 0));

    const mask = new THREE.Group();
    const maskShell = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.072, 12), new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.72 }));
    maskShell.scale.set(0.95, 1, 1.08);
    mask.add(maskShell);
    attachBoneTrackedGear(rig, 'head', mask, new THREE.Vector3(0, 0.012, -0.052));
  } else if (opId === 'titan') {
    // Heavy Juggernaut Ballistic Reactor Chest + Massive Shoulder Pauldrons
    const heavyMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.72, roughness: 0.24 });
    const titanVest = makePlateCarrierVest('#334155', '#f59e0b', -0.155, 0.145, 0.28, false);
    attachBoneTrackedGear(rig, 'spine', titanVest, new THREE.Vector3(0, 0.01, 0));
    for (const [bKey, xSign] of [['upperArmL', -1], ['upperArmR', 1]]) {
      const p = new THREE.Group();
      p.add(new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.105, 0.125), heavyMat));
      attachBoneTrackedGear(rig, bKey, p, new THREE.Vector3(xSign * 0.036, -0.025, 0));
    }
  } else if (opId === 'vanguard') {
    const radio = new THREE.Group();
    const rMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.038), rMat);
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.22, 6), rMat);
    whip.position.set(0.02, 0.14, 0);
    radio.add(box, whip);
    attachBoneTrackedGear(rig, 'spine', radio, new THREE.Vector3(-0.075, -0.02, 0.185));
  } else if (opId === 'aria') {
    const hud = new THREE.Group();
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.125, 0.032, 0.012),
      new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.65, transparent: true, opacity: 0.78, roughness: 0.08 })
    );
    hud.add(visor);
    attachBoneTrackedGear(rig, 'head', hud, new THREE.Vector3(0, 0.066, -0.124));
  } else if (opId === 'valkyrie') {
    const beret = new THREE.Group();
    const clothMat = new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.65 });
    const badgeMat = new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.85, roughness: 0.2 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.088, 0.042, 16), clothMat);
    cap.rotation.z = -0.22;
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.008), badgeMat);
    badge.position.set(-0.04, 0.005, -0.088);
    beret.add(cap, badge);
    attachBoneTrackedGear(rig, 'head', beret, new THREE.Vector3(0.016, 0.188, -0.010));
  }
}

function hydrateGlbIntoRig(rig, loaded, archetypeKey, opCfg, outCfg, teamGlowColor) {
  if (!loaded || !loaded.gltf || rig.disposed) return;
  try {
    const inst = instantiateGlbInstance(loaded, opCfg, outCfg, teamGlowColor);
    if (!inst || !inst.modelRoot) return;
    clearTacticalMounts(rig);
    if (rig.modelRoot) {
      rig.bodyRoot.remove(rig.modelRoot);
    }
    rig.modelRoot = inst.modelRoot;
    rig.mixer = inst.mixer;
    rig.actions = inst.actions;
    rig.bones = inst.bones;
    rig.restArmQuats = inst.restArmQuats;
    rig.restHeadQuat = inst.restHeadQuat;
    rig.activeAnim = inst.activeAnim;
    rig.archetypeKey = archetypeKey;
    rig.shadowMeshes = inst.shadowMeshes || [];
    rig.bodyRoot.add(inst.modelRoot);
    buildOperatorTacticalMounts(rig, archetypeKey, opCfg, outCfg, teamGlowColor);
    if (rig.castShadowEnabled !== undefined) {
      setRigShadowCast(rig, rig.castShadowEnabled);
    }
  } catch (err) {
    console.warn('[models.js] hydrateGlbIntoRig error:', err);
  }
}

export function setRigShadowCast(rig, enabled) {
  if (!rig) return;
  const flag = Boolean(enabled);
  if (rig.castShadowEnabled === flag && rig._shadowApplied) return;
  rig.castShadowEnabled = flag;
  if (rig.shadowMeshes && rig.shadowMeshes.length > 0) {
    for (let i = 0; i < rig.shadowMeshes.length; i++) {
      rig.shadowMeshes[i].castShadow = flag;
    }
    rig._shadowApplied = true;
  }
}

export function createOperatorRig({
  operator = 'vanguard',
  outfit = 'urban',
  team = 'alpha',
  weaponId = 'ak47',
  skinId = 'default',
  attachments = {},
  name = 'Soldier',
  isAlly = false
}) {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  group.add(bodyRoot);

  const opCfg = OPERATORS[operator] || OPERATORS.vanguard;
  const outCfg = OUTFITS[outfit] || OUTFITS.urban;
  const teamGlowColor = team === 'alpha' ? '#0ea5e9' : (team === 'bravo' ? '#f97316' : (isAlly ? '#10b981' : '#ef4444'));
  const archetypeKey = resolveCharacterArchetype(operator, outCfg);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.16, 1.30, -0.32);
  mountWeaponOnGroup(weaponMount, weaponId, skinId, attachments);
  bodyRoot.add(weaponMount);

  const c4Pack = createC4Mesh();
  c4Pack.position.set(0, 1.24, 0.21);
  c4Pack.rotation.x = Math.PI / 2;
  c4Pack.scale.setScalar(0.82);
  c4Pack.visible = false;
  bodyRoot.add(c4Pack);

  const shieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.58, 1.88, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false })
  );
  shieldMesh.position.set(0, 0.94, 0);
  shieldMesh.visible = false;
  group.add(shieldMesh);

  const nameplate = makeNameplateSprite(name, team, isAlly);
  group.add(nameplate);

  const rig = {
    group,
    bodyRoot,
    weaponMount,
    c4Pack,
    shieldMesh,
    nameplate,
    currentWeaponId: weaponId,
    currentSkinId: skinId,
    currentAttachments: attachments,
    archetypeKey,
    modelRoot: null,
    mixer: null,
    actions: {},
    bones: {},
    restArmQuats: {},
    restHeadQuat: null,
    tacticalMounts: [],
    activeAnim: 'idle',
    isDeadState: false,
    walkPhase: Math.random() * Math.PI * 2,
    smoothSpeed: 0,
    crouchBlend: 0,
    deathProgress: 0,
    recoilKick: 0,
    disposed: false
  };

  const syncLoaded = getLoadedCharacterSync(archetypeKey);
  if (syncLoaded) {
    hydrateGlbIntoRig(rig, syncLoaded, archetypeKey, opCfg, outCfg, teamGlowColor);
  } else if (typeof window !== 'undefined') {
    loadCharacterArchetype(archetypeKey).then((loaded) => {
      if (loaded) hydrateGlbIntoRig(rig, loaded, archetypeKey, opCfg, outCfg, teamGlowColor);
    });
  }

  return rig;
}

export function swapRigWeapon(rig, weaponId, skinId = 'default', attachments = {}) {
  if (!rig || rig.currentWeaponId === weaponId) return;
  rig.currentWeaponId = weaponId;
  rig.currentSkinId = skinId;
  rig.currentAttachments = attachments;
  mountWeaponOnGroup(rig.weaponMount, weaponId, skinId, attachments);
}

function transitionGlbAnimation(rig, targetKey, fadeSec = 0.16, timeScale = 1.0) {
  if (!rig.actions) return;
  const resolvedKey = rig.actions[targetKey] ? targetKey : (rig.actions.idle ? 'idle' : null);
  if (!resolvedKey) return;

  const nextAct = rig.actions[resolvedKey];
  nextAct.timeScale = timeScale;

  if (rig.activeAnim === resolvedKey) return;
  const prevAct = rig.actions[rig.activeAnim];
  rig.activeAnim = resolvedKey;

  nextAct.reset();
  nextAct.setEffectiveWeight(1);
  nextAct.play();
  if (prevAct && prevAct !== nextAct) {
    prevAct.crossFadeTo(nextAct, fadeSec, true);
  }
}

export function animateOperatorRig(rig, state, dt, timeSec = 0) {
  if (!rig) return;
  const clampedDt = Math.min(0.12, dt);

  if (state.dead) {
    rig.shieldMesh.visible = false;
    rig.nameplate.visible = false;
    rig.c4Pack.visible = false;
    rig.deathProgress = Math.min(1, rig.deathProgress + clampedDt * 4.5);

    if (rig.mixer) {
      if (rig.actions.death) {
        if (!rig.isDeadState) {
          rig.isDeadState = true;
          transitionGlbAnimation(rig, 'death', 0.12, 1.1);
        }
        rig.mixer.update(clampedDt);
        rig.weaponMount.visible = false;
        return;
      }
      rig.mixer.update(0);
    }

    // Fallback collapse for Mixamo rigs without embedded Death clip
    const ease = 1 - Math.pow(1 - rig.deathProgress, 2);
    rig.bodyRoot.rotation.x = -ease * (Math.PI * 0.46);
    rig.bodyRoot.position.y = ease * 0.12;
    rig.weaponMount.visible = false;
    return;
  }

  if (rig.isDeadState || rig.deathProgress > 0) {
    rig.isDeadState = false;
    rig.deathProgress = 0;
    rig.bodyRoot.rotation.x = 0;
    rig.bodyRoot.position.y = 0;
    rig.weaponMount.visible = true;
    if (rig.actions?.death) rig.actions.death.stop();
  }

  const lod = state.lodLevel || 0; // 0: close (<35m) full detail | 1: mid (35-85m) fast | 2: far (>85m) ultra-light
  rig.weaponMount.visible = true;
  rig.nameplate.visible = lod < 2 && state.showNameplate !== false;
  rig.c4Pack.visible = Boolean(state.hasBomb);
  rig.shieldMesh.visible = Boolean(state.shield);
  if (rig.shieldMesh.visible) rig.shieldMesh.rotation.y = timeSec * 2.5;

  const targetCrouch = state.crouch ? 1 : 0;
  rig.crouchBlend = (rig.crouchBlend || 0) + (targetCrouch - (rig.crouchBlend || 0)) * Math.min(1, 14 * clampedDt);
  const cb = rig.crouchBlend;
  rig.bodyRoot.position.y = -cb * 0.34;

  const rawSpeed = state.moveSpeed || 0;
  rig.smoothSpeed = (rig.smoothSpeed || 0) + (rawSpeed - (rig.smoothSpeed || 0)) * Math.min(1, 12 * clampedDt);
  const speed = rig.smoothSpeed;

  if (rig.mixer) {
    if (state.victoryPose) {
      const idleKey = rig.actions.victory ? 'victory' : 'idle';
      transitionGlbAnimation(rig, idleKey, 0.25, 1.0);
    } else if (speed >= 3.4) {
      transitionGlbAnimation(rig, 'run', 0.15, Math.min(1.45, Math.max(0.85, speed / 4.8)));
    } else if (speed >= 0.35) {
      transitionGlbAnimation(rig, 'walk', 0.15, Math.min(1.35, Math.max(0.75, speed / 2.2)));
    } else {
      transitionGlbAnimation(rig, 'idle', 0.20, 1.0);
    }
    rig.mixer.update(clampedDt);
  }

  rig.recoilKick = Math.max(0, rig.recoilKick - clampedDt * 6.5);

  if (!rig.modelRoot || !rig.bones?.handR) {
    return;
  }

  const bones = rig.bones;
  const isVictory = Boolean(state.victoryPose);
  const pitch = isVictory ? -0.14 : (state.pitch || 0);
  const recoil = isVictory ? 0 : (rig.recoilKick || 0);
  const curW = WEAPONS[rig.currentWeaponId];
  const isShort = Boolean(curW?.isMelee || curW?.subClass === 'pistol');
  const isMelee = Boolean(curW?.isMelee);

  if (isVictory) {
    rig.bodyRoot.rotation.y = Math.sin(timeSec * 0.75) * 0.08;
  } else {
    rig.bodyRoot.rotation.y = 0;
  }

  const mountYaw = isVictory && !isShort ? 0.34 : 0.0;
  const mountPitch = (isVictory ? -0.04 : pitch) + recoil * 0.42;

  // LOD 2 (far > 85m): skip full skeleton IK & matrix traversals completely — massive CPU boost in 50-bot BR!
  if (lod >= 2 && !isVictory) {
    rig.weaponMount.position.set(0.15, 1.24, -0.32);
    rig.weaponMount.rotation.set(mountPitch, 0, 0);
    return;
  }

  // Restore deterministic rest arm poses BEFORE the single matrixWorld update so arms never fight keyframes
  if (rig.restArmQuats) {
    for (const k in rig.restArmQuats) {
      if (bones[k]) bones[k].quaternion.copy(rig.restArmQuats[k]);
    }
  }
  rig.group.updateMatrixWorld(true);

  // Convert bodyRoot-local aim vectors into world directions cleanly (zero allocations!)
  const bodyWorldQ = _q5;
  rig.bodyRoot.getWorldQuaternion(bodyWorldQ);

  // Gentle vertical pitch tilt on head (close LOD 0 only)
  if (lod === 0 && bones.head) {
    if (!rig.mixer && rig.restHeadQuat) bones.head.quaternion.copy(rig.restHeadQuat);
    const clampedPitch = Math.max(-0.50, Math.min(0.50, pitch));
    const worldRight = _v0.copy(RIGHT_VEC).applyQuaternion(bodyWorldQ).normalize();
    _q1.setFromAxisAngle(worldRight, clampedPitch * 0.35);
    bones.head.getWorldQuaternion(_q2);
    _q4.multiplyQuaternions(_q1, _q2);
    if (bones.head.parent) {
      bones.head.parent.getWorldQuaternion(_q3).invert();
      _q4.premultiply(_q3);
    }
    bones.head.quaternion.copy(_q4);
  }

  // Deterministic 2-bone tactical weapon grip solver (zero heap allocations!)
  if (bones.upperArmR && bones.lowerArmR && bones.handR) {
    if (isShort) _v3.set(0.28, -0.62 + recoil * 0.3, -0.73);
    else if (isVictory) _v3.set(0.42, -0.68, -0.58);
    else _v3.set(0.32, -0.72 + pitch * 0.2, -0.62);
    aimBoneSegmentWorld(bones.upperArmR, bones.lowerArmR, _v3.applyQuaternion(bodyWorldQ), 1.0);

    if (isShort) _v3.set(-0.20, 0.24 + pitch * 0.65 + recoil * 0.7, -0.95);
    else if (isVictory) _v3.set(-0.24, 0.14, -0.96);
    else _v3.set(-0.26, 0.32 + pitch * 0.55 + recoil * 0.65, -0.91);
    aimBoneSegmentWorld(bones.lowerArmR, bones.handR, _v3.applyQuaternion(bodyWorldQ), 1.0);
  }

  if (bones.upperArmL && bones.lowerArmL && bones.handL && !isMelee) {
    if (isShort) _v3.set(0.30, -0.58, -0.75);
    else if (isVictory) _v3.set(0.18, -0.68, -0.70);
    else _v3.set(0.22, -0.64 + pitch * 0.2, -0.73);
    aimBoneSegmentWorld(bones.upperArmL, bones.lowerArmL, _v3.applyQuaternion(bodyWorldQ), 1.0);

    bones.handR.getWorldPosition(_v4);
    bones.lowerArmL.getWorldPosition(_v5);

    _v6.set(
      -Math.sin(mountYaw) * Math.cos(mountPitch),
      Math.sin(mountPitch),
      -Math.cos(mountYaw) * Math.cos(mountPitch)
    ).normalize().applyQuaternion(bodyWorldQ);
    _v7.copy(UP_VEC).applyQuaternion(bodyWorldQ);

    const guardOffset = isShort ? 0.04 : 0.22;
    _v3.copy(_v4)
      .addScaledVector(_v6, guardOffset)
      .addScaledVector(_v7, isShort ? -0.025 : -0.012)
      .sub(_v5);
    aimBoneSegmentWorld(bones.lowerArmL, bones.handL, _v3, 1.0);

    // Roll Left Wrist inward & palm-up at close LOD 0 so fingers cradle under handguard
    if (lod === 0) {
      bones.handL.updateMatrixWorld(true);
      _v3.normalize();
      _q1.setFromAxisAngle(_v3, 1.35);
      bones.handL.getWorldQuaternion(_q2);
      _q4.multiplyQuaternions(_q1, _q2);
      if (bones.handL.parent) {
        bones.handL.parent.getWorldQuaternion(_q3).invert();
        _q4.premultiply(_q3);
      }
      bones.handL.quaternion.copy(_q4);
    }
  }

  // Sync weaponMount squarely inside HandR (only update handR branch, NOT entire 60-bone skeleton again!)
  bones.handR.updateWorldMatrix(true, false);
  bones.handR.getWorldPosition(_v4);
  rig.bodyRoot.worldToLocal(_v4);
  rig.weaponMount.position.copy(_v4);
  rig.weaponMount.rotation.set(mountPitch, mountYaw, 0);

  // Sync scale-invariant bone-tracked tactical gear modules (NVG, vests, holsters, armor) at LOD 0
  if (lod === 0 && rig.tacticalMounts?.length) {
    const bodyInvQ = _q3.copy(bodyWorldQ).invert();
    for (let i = 0; i < rig.tacticalMounts.length; i++) {
      const tm = rig.tacticalMounts[i];
      if (!tm.bone) continue;
      tm.bone.getWorldPosition(_v0);
      rig.bodyRoot.worldToLocal(_v0);
      tm.bone.getWorldQuaternion(_q2);
      _q2.premultiply(bodyInvQ);
      _q0.multiplyQuaternions(_q2, tm.restBoneInvQ);
      _v1.copy(tm.offsetFromBone).applyQuaternion(_q0).add(_v0);
      tm.node.position.copy(_v1);
      tm.node.quaternion.copy(_q0);
    }
  }
}

export function createC4Mesh() {
  const g = new THREE.Group();
  const brickMat = new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.72 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.24), brickMat);
  b1.position.x = -0.082;
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.24), brickMat);
  b2.position.x = 0.082;
  const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.118, 0.035), tapeMat);
  strap1.position.z = -0.06;
  const strap2 = strap1.clone();
  strap2.position.z = 0.06;
  const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.13), tapeMat);
  keypad.position.set(0, 0.065, 0);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.015, 0.055), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
  screen.position.set(0, 0.082, -0.02);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), new THREE.MeshBasicMaterial({ color: '#ff1e1e' }));
  led.position.set(0.11, 0.08, 0.05);
  g.add(b1, b2, strap1, strap2, keypad, screen, led);
  return g;
}

export function createGrenadeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 14, 14),
    new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.48, metalness: 0.38 })
  );
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, 0.024, 14),
    new THREE.MeshBasicMaterial({ color: '#facc15' })
  );
  const fuseHead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.034, 0.045, 10),
    new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.8, roughness: 0.25 })
  );
  fuseHead.position.y = 0.095;
  const spoon = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.11, 0.025),
    new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.75, roughness: 0.3 })
  );
  spoon.position.set(0.055, 0.035, 0);
  spoon.rotation.z = 0.22;
  g.add(body, band, fuseHead, spoon);
  return g;
}
