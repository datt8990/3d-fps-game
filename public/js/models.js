// AAA-Grade 3D Sculpted Soldier Rigs (Male Tactical & Female/Beach Specs), 30 Detailed Weapons & Transparent Optics
import * as THREE from 'three';
import { OUTFITS, OPERATORS, WEAPONS, WEAPON_SKINS } from '/shared/constants.js';
import {
  getWeaponSkinTexture,
  getOutfitTextures,
  getMolleVestTextures,
  getBalaclavaTexture,
  getWatchFaceTexture
} from './textures.js';

const UP_VEC = new THREE.Vector3(0, 1, 0);

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

// Curved multi-segment magazine (AK-47 / MP5 / SVD style)
function buildCurvedMagazine(width, depth, segH, count, curveAngle, startY, startZ, mat) {
  const g = new THREE.Group();
  let curY = startY;
  let curZ = startZ;
  let angle = 0.08;
  const segGeo = new THREE.BoxGeometry(width, segH + 0.004, depth);
  const ribGeo = new THREE.BoxGeometry(width + 0.004, 0.006, depth + 0.003);
  for (let i = 0; i < count; i++) {
    const seg = new THREE.Mesh(segGeo, mat);
    seg.position.set(0, curY, curZ);
    seg.rotation.x = angle;
    g.add(seg);
    if (i === count - 1) {
      const floorPlate = new THREE.Mesh(ribGeo, mat);
      floorPlate.position.set(0, curY - segH * 0.45, curZ - Math.sin(angle) * segH * 0.4);
      floorPlate.rotation.x = angle;
      g.add(floorPlate);
    }
    angle += curveAngle;
    curY -= Math.cos(angle) * segH * 0.92;
    curZ -= Math.sin(angle) * segH * 0.92;
  }
  return g;
}

// Tactical PEQ-15 side laser/IR module for rifles & SMGs
function buildTacticalLaserModule(x, y, z, darkMat, laserColor = '#ef4444') {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.068), darkMat);
  const emitter = new THREE.Mesh(
    new THREE.CircleGeometry(0.0045, 8),
    new THREE.MeshBasicMaterial({ color: laserColor })
  );
  emitter.rotation.y = Math.PI;
  emitter.position.set(0, 0.002, -0.035);
  g.add(box, emitter);
  g.position.set(x, y, z);
  return g;
}

// Ported multi-baffle muzzle brake or slotted flash hider for rifles/snipers
function buildMultiBaffleBrake(radius, y, z, mat, accentMat, isHeavyBox = false) {
  const g = new THREE.Group();
  if (isHeavyBox) {
    const core = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.1, radius * 1.4, 0.088), mat);
    const baffle1 = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.5, radius * 1.55, 0.012), accentMat);
    baffle1.position.z = -0.022;
    const baffle2 = baffle1.clone();
    baffle2.position.z = 0.020;
    g.add(core, baffle1, baffle2);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, 0.054, 12), mat);
    body.rotation.x = Math.PI / 2;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.18, radius * 1.18, 0.014, 12), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = 0.018;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.06, 0.012, 12), accentMat);
    crown.rotation.x = Math.PI / 2;
    crown.position.z = -0.018;
    g.add(body, collar, crown);
  }
  g.position.set(0, y, z);
  return g;
}

// Reusable sniper telescopic optic with scope rings, turrets, throw lever & coated glass
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

  const mountF = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.042, 0.024), darkMetal);
  mountF.position.set(0, -0.025, -ringZ);
  const mountR = mountF.clone();
  mountR.position.z = ringZ;

  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, length, 16), darkMetal);
  scopeTube.rotation.x = Math.PI / 2;
  const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(objectiveRadius, 0.019, 0.095, 16), darkMetal);
  bellFront.rotation.x = Math.PI / 2;
  bellFront.position.z = -half - 0.01;
  const bellRear = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.026, 0.070, 16), darkMetal);
  bellRear.rotation.x = Math.PI / 2;
  bellRear.position.z = half;

  const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.028, 12), steelMat);
  turretTop.position.set(0, 0.025, 0);
  const turretSide = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 12), steelMat);
  turretSide.rotation.z = Math.PI / 2;
  turretSide.position.set(-0.024, 0, 0);
  const ringCap = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.016, 12), accentMat || steelMat);
  ringCap.rotation.x = Math.PI / 2;
  ringCap.position.z = ringZ;

  const lensMat = new THREE.MeshBasicMaterial({ color: lensColor });
  const lensRear = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), lensMat);
  lensRear.position.z = half + 0.036;
  const lensFront = new THREE.Mesh(new THREE.CircleGeometry(objectiveRadius * 0.88, 16), lensMat);
  lensFront.rotation.y = Math.PI;
  lensFront.position.z = -half - 0.058;

  scopeGroup.add(mountF, mountR, scopeTube, bellFront, bellRear, turretTop, turretSide, ringCap, lensRear, lensFront);
  scopeGroup.position.set(0, y, z);
  return scopeGroup;
}

// Recessed right-side ejection port & left-side selector switch for mechanical realism
function buildReceiverPolish(width, yPort, zPort, darkMat, steelMat, brassMat) {
  const g = new THREE.Group();
  const portPlate = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.056), darkMat);
  portPlate.position.set(width * 0.5 + 0.001, yPort, zPort);
  const brassCase = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.030), brassMat);
  brassCase.position.set(width * 0.5 + 0.0025, yPort, zPort + 0.004);
  const selector = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.010, 0.024), steelMat);
  selector.position.set(-width * 0.5 - 0.002, yPort - 0.022, zPort + 0.068);
  selector.rotation.x = 0.25;
  g.add(portPlate, brassCase, selector);
  return g;
}

export function createWeaponModel(weaponId = 'ak47', skinId = 'default', attachments = {}) {
  const group = new THREE.Group();
  const skin = WEAPON_SKINS[skinId] || WEAPON_SKINS.default;
  const skinTex = getWeaponSkinTexture(skinId);

  const bodyMat = new THREE.MeshStandardMaterial({
    map: skinTex,
    metalness: skin.metalness,
    roughness: skin.roughness
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: '#171a21',
    metalness: 0.88,
    roughness: 0.24
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: '#1f242d',
    metalness: 0.16,
    roughness: 0.62
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.92,
    roughness: 0.18
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0.88,
    roughness: 0.22
  });
  const useWoodGrip = skinId === 'default' && (weaponId === 'ak47' || weaponId === 'svd' || weaponId === 'rpk' || weaponId === 'm870' || weaponId === 'kar98k');
  const gripMat = new THREE.MeshStandardMaterial({
    color: useWoodGrip
      ? '#7c431e'
      : (skinId === 'default' && weaponId === 'scarh' ? '#9c7e52' : skin.woodOrGrip),
    metalness: 0.15,
    roughness: 0.54
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skin.accentColor,
    metalness: 0.76,
    roughness: 0.22
  });

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
  const isMelee = weaponId === 'knife' || weaponId === 'karambit';
  const isSniper = Boolean(WEAPONS[weaponId]?.isSniper);
  const optic = attachments?.optic || 'iron';
  const useExternalOptic = !isSniper && !isMelee && (optic === 'reddot' || optic === 'acog');

  // Common Trigger Guard, Curved Trigger & Bolt Carrier
  if (!isMelee) {
    const tGuardBottom = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.007, 0.056), darkMetal);
    tGuardBottom.position.set(0, -0.036, 0.052);
    const tGuardFront = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.028, 0.007), darkMetal);
    tGuardFront.position.set(0, -0.024, 0.026);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.024, 0.010), steelMat);
    trigger.position.set(0, -0.016, 0.058);
    trigger.rotation.x = 0.42;

    boltMesh = new THREE.Group();
    const boltSlide = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.015, 0.070), steelMat);
    const chargingKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 8), steelMat);
    chargingKnob.rotation.z = Math.PI / 2;
    chargingKnob.position.set(0.014, 0, -0.02);
    boltMesh.add(boltSlide, chargingKnob);
    boltMesh.position.set(0.025, 0.038, 0.01);
    group.add(tGuardBottom, tGuardFront, trigger, boltMesh);
  }

  if (weaponId === 'ak47') {
    // Beveled Milled AK-47 Receiver + Cleanly Oriented Rounded Dust Cover (ZERO horizontal protrusion!)
    const rec = extrudeSideProfile([
      [-0.145, -0.018], [0.145, -0.018], [0.145, 0.044], [-0.145, 0.044]
    ], 0.054, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.140, 0.042], [0.125, 0.042], [0.115, 0.068], [-0.130, 0.066]
    ], 0.044, 0.005, darkMetal);

    // Classic Angled Laminated Wood Stock
    const stock = extrudeSideProfile([
      [-0.140, -0.014], [-0.395, -0.064], [-0.395, 0.030], [-0.140, 0.038]
    ], 0.042, 0.004, gripMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.096, 0.014), darkMetal);
    buttPlate.position.set(0, -0.018, 0.398);

    // Ergonomic Contoured Grip
    const grip = extrudeSideProfile([
      [-0.088, -0.016], [-0.128, -0.016], [-0.158, -0.118], [-0.112, -0.122]
    ], 0.034, 0.004, gripMat);

    // Laminated Wood Handguard + Ventilated Gas Tube
    const hgLower = extrudeSideProfile([
      [0.145, -0.014], [0.355, -0.008], [0.355, 0.032], [0.145, 0.034]
    ], 0.050, 0.004, gripMat);
    const hgUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.19, 12), gripMat);
    hgUpper.rotation.x = Math.PI / 2;
    hgUpper.position.set(0, 0.046, -0.24);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.40, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.46);
    const cleaningRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.34, 6), steelMat);
    cleaningRod.rotation.x = Math.PI / 2;
    cleaningRod.position.set(0, 0.004, -0.44);
    const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.042, 0.034), darkMetal);
    gasBlock.position.set(0, 0.034, -0.36);

    const fsTower = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.048, 0.022), darkMetal);
    fsTower.position.set(0, 0.046, -0.57);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.013, 0.048, 12), steelMat);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.024, -0.65);

    magMesh = buildCurvedMagazine(
      0.034, 0.066, isExt ? 0.054 : 0.045, 4, 0.14,
      -0.038, -0.055,
      skinId === 'default' ? accentMat : bodyMat
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

    group.add(rec, dustCover, stock, buttPlate, grip, hgLower, hgUpper, barrel, cleaningRod, gasBlock, fsTower, muzzleBrake, magMesh);
    muzzleZ = -0.675;
  } else if (weaponId === 'm4a1') {
    const rec = extrudeSideProfile([
      [-0.105, -0.022], [0.005, -0.022], [0.012, -0.044], [0.085, -0.044],
      [0.095, -0.015], [0.115, 0.010], [0.115, 0.068], [-0.105, 0.068]
    ], 0.050, 0.004, bodyMat);
    const brassDeflect = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.026), darkMetal);
    brassDeflect.position.set(0.030, 0.045, 0.05);

    group.add(buildPicatinnyRail(0.47, 0.034, 0.072, -0.085, darkMetal));
    railY = 0.079;
    opticZ = 0.01;

    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.036, 0.23);
    const stock = extrudeSideProfile([
      [-0.195, 0.010], [-0.365, -0.045], [-0.370, 0.060], [-0.195, 0.056]
    ], 0.046, 0.004, polymerMat);
    const grip = extrudeSideProfile([
      [-0.088, -0.020], [-0.125, -0.020], [-0.155, -0.116], [-0.112, -0.120]
    ], 0.034, 0.004, polymerMat);

    // M-LOK Quad Shroud + Angled Foregrip + PEQ-15 Laser
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.26, 8), accentMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.032, -0.23);
    const foregrip = extrudeSideProfile([
      [0.20, 0.002], [0.275, 0.002], [0.245, -0.055], [0.205, -0.045]
    ], 0.028, 0.003, polymerMat);
    const peq = buildTacticalLaserModule(0.036, 0.034, -0.27, darkMetal, '#ef4444');

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.30, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, -0.45);
    const birdcage = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.013, 0.052, 10), steelMat);
    birdcage.rotation.x = Math.PI / 2;
    birdcage.position.set(0, 0.032, -0.60);

    magMesh = buildCurvedMagazine(0.034, 0.062, isExt ? 0.048 : 0.039, 4, 0.06, -0.035, -0.04, polymerMat);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.34, 0.090, darkMetal, '#38bdf8', '#4ade80', 0.008));
      ironSightY = 0.093;
      ironRearZ = 0.095;
    }

    group.add(rec, brassDeflect, tube, stock, grip, shroud, foregrip, peq, barrel, birdcage, magMesh);
    muzzleZ = -0.63;
  } else if (weaponId === 'scarh') {
    const fdeMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#c4a468', roughness: 0.40, metalness: 0.36 })
      : bodyMat;
    const upper = extrudeSideProfile([
      [-0.145, 0.005], [0.335, 0.005], [0.335, 0.076], [-0.145, 0.076]
    ], 0.056, 0.004, fdeMat);
    const lower = extrudeSideProfile([
      [-0.125, -0.028], [0.005, -0.028], [0.010, -0.048], [0.085, -0.048], [0.095, 0.005], [-0.125, 0.005]
    ], 0.050, 0.004, gripMat);

    group.add(buildPicatinnyRail(0.47, 0.036, 0.080, -0.09, darkMetal));
    railY = 0.087;
    opticZ = 0.01;

    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.066, 10), darkMetal);
    hinge.position.set(0, 0.022, 0.155);
    const stock = extrudeSideProfile([
      [-0.165, -0.020], [-0.405, -0.054], [-0.405, 0.064], [-0.165, 0.068]
    ], 0.048, 0.004, gripMat);
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.026, 0.17), darkMetal);
    cheekRest.position.set(0, 0.072, 0.275);
    const grip = extrudeSideProfile([
      [-0.088, -0.024], [-0.125, -0.024], [-0.155, -0.116], [-0.112, -0.120]
    ], 0.034, 0.004, darkMetal);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.085, 10), polymerMat);
    vertGrip.position.set(0, -0.046, -0.22);
    const peq = buildTacticalLaserModule(-0.038, 0.040, -0.24, darkMetal, '#22c55e');

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.32, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, -0.46);
    const comp = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.026, 0.056), steelMat);
    comp.position.set(0, 0.032, -0.62);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.040, isExt ? 0.195 : 0.155, 0.078), fdeMat);
    magMesh.position.set(0, -0.094, -0.045);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.30, 0.096, darkMetal, '#4ade80', '#facc15', 0.0085));
      ironSightY = 0.099;
      ironRearZ = 0.11;
    }

    group.add(upper, lower, hinge, stock, cheekRest, grip, vertGrip, peq, barrel, comp, magMesh);
    muzzleZ = -0.65;
  } else if (weaponId === 'aug') {
    // Sleek Steyr AUG A3 Bullpup Chassis (Rear Magazine Behind Trigger!)
    const odMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#3f4e37', roughness: 0.48, metalness: 0.25 })
      : bodyMat;
    const chassis = extrudeSideProfile([
      [-0.36, -0.06], [-0.14, -0.055], [-0.04, -0.015], [0.22, -0.005],
      [0.24, 0.058], [-0.36, 0.065]
    ], 0.054, 0.005, odMat);

    group.add(buildPicatinnyRail(0.28, 0.034, 0.072, -0.06, darkMetal));
    railY = 0.079;
    opticZ = -0.04;

    const grip = extrudeSideProfile([
      [-0.01, -0.012], [-0.048, -0.012], [-0.078, -0.108], [-0.035, -0.112]
    ], 0.034, 0.004, polymerMat);
    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.088, 10), polymerMat);
    foregrip.position.set(0, -0.048, -0.18);
    foregrip.rotation.x = 0.12;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.34, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, -0.39);
    const tulip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.048, 10), steelMat);
    tulip.rotation.x = Math.PI / 2;
    tulip.position.set(0, 0.032, -0.56);

    // Translucent Bullpup Waffle Magazine behind pistol grip
    magMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.034, isExt ? 0.19 : 0.15, 0.064),
      new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.85 })
    );
    magMesh.position.set(0, -0.095, 0.20);
    magMesh.rotation.x = 0.12;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.06, -0.19, 0.090, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.093;
      ironRearZ = 0.06;
    }

    group.add(chassis, grip, foregrip, barrel, tulip, magMesh);
    muzzleZ = -0.59;
  } else if (weaponId === 'm16a4') {
    // Classic M16A4 Long-Barrel Marksman Rifle
    const rec = extrudeSideProfile([
      [-0.11, -0.022], [0.005, -0.022], [0.012, -0.044], [0.085, -0.044],
      [0.095, -0.015], [0.115, 0.010], [0.115, 0.068], [-0.11, 0.068]
    ], 0.050, 0.004, bodyMat);
    const fullStock = extrudeSideProfile([
      [-0.11, -0.004], [-0.39, -0.068], [-0.39, 0.056], [-0.11, 0.052]
    ], 0.044, 0.004, polymerMat);
    const grip = extrudeSideProfile([
      [-0.088, -0.020], [-0.125, -0.020], [-0.155, -0.116], [-0.112, -0.120]
    ], 0.034, 0.004, polymerMat);

    group.add(buildPicatinnyRail(0.54, 0.034, 0.072, -0.12, darkMetal));
    railY = 0.079;
    opticZ = 0.01;

    const handguard = extrudeSideProfile([
      [0.115, 0.002], [0.415, 0.002], [0.415, 0.064], [0.115, 0.064]
    ], 0.054, 0.004, darkMetal);
    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.082, 10), polymerMat);
    foregrip.position.set(0, -0.042, -0.26);
    const peq = buildTacticalLaserModule(0.036, 0.034, -0.34, darkMetal, '#38bdf8');

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.34, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, -0.54);
    const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.013, 0.052, 10), steelMat);
    flash.rotation.x = Math.PI / 2;
    flash.position.set(0, 0.032, -0.71);

    magMesh = buildCurvedMagazine(0.034, 0.062, isExt ? 0.048 : 0.038, 4, 0.05, -0.035, -0.04, steelMat);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.40, 0.090, darkMetal, '#38bdf8', '#f97316', 0.008));
      ironSightY = 0.093;
      ironRearZ = 0.095;
    }

    group.add(
      rec, fullStock, grip, handguard, foregrip, peq, barrel, flash, magMesh,
      buildReceiverPolish(0.050, 0.038, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.74;
    barrelY = 0.032;
  } else if (weaponId === 'famas') {
    // French FAMAS F1 Bullpup with Hollow Carry Handle, Bipod & Straight Steel 25-Rd Mag
    const chassis = extrudeSideProfile([
      [-0.34, -0.048], [-0.14, -0.048], [-0.08, -0.012], [0.22, -0.005], [0.23, 0.062], [-0.34, 0.060]
    ], 0.052, 0.004, bodyMat);
    const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.106, 0.020), polymerMat);
    buttPad.position.set(0, 0.006, 0.345);
    const handleRear = extrudeSideProfile([
      [-0.14, 0.058], [-0.10, 0.058], [-0.08, 0.098], [-0.125, 0.098]
    ], 0.038, 0.003, darkMetal);
    const handleFront = extrudeSideProfile([
      [0.145, 0.058], [0.195, 0.058], [0.180, 0.098], [0.135, 0.098]
    ], 0.038, 0.003, darkMetal);
    const handleBridge = extrudeSideProfile([
      [-0.135, 0.092], [0.190, 0.092], [0.190, 0.110], [-0.135, 0.110]
    ], 0.038, 0.003, darkMetal);
    const grip = extrudeSideProfile([
      [0.01, -0.012], [-0.03, -0.012], [-0.06, -0.108], [-0.018, -0.112]
    ], 0.034, 0.004, polymerMat);
    const knuckleGuard = extrudeSideProfile([
      [0.065, -0.008], [0.075, -0.014], [0.025, -0.090], [0.010, -0.084]
    ], 0.016, 0.002, polymerMat);

    group.add(buildPicatinnyRail(0.24, 0.032, 0.114, -0.02, darkMetal));
    railY = 0.121;
    opticZ = -0.02;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.34, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.036, -0.37);
    const grenadeCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.045, 10), steelMat);
    grenadeCollar.rotation.x = Math.PI / 2;
    grenadeCollar.position.set(0, 0.036, -0.46);
    const flash = buildMultiBaffleBrake(0.013, 0.036, -0.545, darkMetal, steelMat);

    for (const bx of [-0.032, 0.032]) {
      const bipodLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.22, 8), steelMat);
      bipodLeg.rotation.x = Math.PI / 2;
      bipodLeg.position.set(bx, 0.048, -0.11);
      group.add(bipodLeg);
    }

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.030, isExt ? 0.18 : 0.145, 0.062), steelMat);
    magMesh.position.set(0, -0.090, 0.175);
    magMesh.rotation.x = 0.12;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.16, 0.124, darkMetal, '#38bdf8', '#f97316', 0.008));
      ironSightY = 0.127;
      ironRearZ = 0.11;
    }

    group.add(
      chassis, buttPad, handleRear, handleFront, handleBridge, grip, knuckleGuard, barrel, grenadeCollar, flash, magMesh,
      buildReceiverPolish(0.052, 0.038, 0.15, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.575;
    barrelY = 0.036;
  } else if (weaponId === 'galil') {
    // Galil ACE 7.62 Assault Rifle with Skeleton Stock & 35-Rd Curved Mag
    const rec = extrudeSideProfile([
      [-0.14, -0.020], [0.15, -0.020], [0.15, 0.048], [-0.14, 0.048]
    ], 0.052, 0.004, bodyMat);
    const topCover = extrudeSideProfile([
      [-0.135, 0.046], [0.14, 0.046], [0.14, 0.064], [-0.135, 0.064]
    ], 0.046, 0.004, darkMetal);
    const handguard = extrudeSideProfile([
      [0.15, -0.014], [0.365, -0.010], [0.365, 0.056], [0.15, 0.056]
    ], 0.054, 0.004, polymerMat);
    const grip = extrudeSideProfile([
      [-0.088, -0.018], [-0.125, -0.018], [-0.155, -0.114], [-0.110, -0.118]
    ], 0.034, 0.004, gripMat);
    const foregrip = extrudeSideProfile([
      [0.21, -0.006], [0.275, -0.006], [0.245, -0.058], [0.205, -0.048]
    ], 0.028, 0.003, polymerMat);

    // Iconic Galil Folding Tubular Skeleton Stock
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

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.34, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, -0.49);
    const flash = buildMultiBaffleBrake(0.014, 0.032, -0.64, steelMat, darkMetal);

    magMesh = buildCurvedMagazine(0.034, 0.064, isExt ? 0.052 : 0.042, 5, 0.11, -0.036, -0.055, polymerMat);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.10, -0.56, 0.084, darkMetal, '#4ade80', '#f97316', 0.0085));
      ironSightY = 0.087;
      ironRearZ = 0.10;
    }

    group.add(
      rec, topCover, handguard, grip, foregrip, stockTopBar, stockBotBar, buttPad, barrel, flash, magMesh,
      buildReceiverPolish(0.052, 0.036, 0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.67;
    barrelY = 0.032;
  } else if (weaponId === 'hk416') {
    // HK416 Tactical Spec-Ops Carbine (Tall Piston Monolithic Rail + Crane Stock)
    const hgBronze = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#5c4d3c', metalness: 0.72, roughness: 0.28 })
      : bodyMat;
    const rec = extrudeSideProfile([
      [-0.11, -0.022], [0.005, -0.022], [0.012, -0.044], [0.085, -0.044],
      [0.095, -0.015], [0.118, 0.010], [0.118, 0.073], [-0.11, 0.073]
    ], 0.050, 0.004, bodyMat);
    const hgQuad = extrudeSideProfile([
      [0.118, 0.002], [0.365, 0.002], [0.365, 0.071], [0.118, 0.071]
    ], 0.054, 0.004, hgBronze);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.038, 0.23);
    const craneStock = extrudeSideProfile([
      [-0.19, 0.004], [-0.365, -0.050], [-0.372, 0.062], [-0.19, 0.060]
    ], 0.052, 0.005, polymerMat);
    const grip = extrudeSideProfile([
      [-0.088, -0.020], [-0.125, -0.020], [-0.155, -0.116], [-0.112, -0.120]
    ], 0.035, 0.004, gripMat);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.072, 10), polymerMat);
    vertGrip.position.set(0, -0.036, -0.23);
    const peq = buildTacticalLaserModule(0.036, 0.038, -0.27, darkMetal, '#22c55e');

    group.add(buildPicatinnyRail(0.47, 0.034, 0.077, -0.11, darkMetal));
    railY = 0.084;
    opticZ = 0.01;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.28, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.034, -0.45);
    const flash = buildMultiBaffleBrake(0.014, 0.034, -0.60, steelMat, darkMetal);

    magMesh = buildCurvedMagazine(0.034, 0.062, isExt ? 0.048 : 0.039, 4, 0.06, -0.035, -0.04, polymerMat);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.095, -0.35, 0.093, darkMetal, '#38bdf8', '#facc15', 0.008));
      ironSightY = 0.096;
      ironRearZ = 0.095;
    }

    group.add(
      rec, hgQuad, tube, craneStock, grip, vertGrip, peq, barrel, flash, magMesh,
      buildReceiverPolish(0.050, 0.040, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.63;
    barrelY = 0.034;
  } else if (weaponId === 'mp5') {
    const rec = extrudeSideProfile([
      [-0.12, -0.018], [0.125, -0.018], [0.125, 0.056], [-0.12, 0.056]
    ], 0.048, 0.004, bodyMat);
    const cockingTube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 10), darkMetal);
    cockingTube.rotation.x = Math.PI / 2;
    cockingTube.position.set(0, 0.052, -0.18);
    const slapHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.032, 8), steelMat);
    slapHandle.rotation.z = Math.PI / 2.6;
    slapHandle.position.set(-0.022, 0.060, -0.26);

    const sdShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.32, 16), darkMetal);
    sdShroud.rotation.x = Math.PI / 2;
    sdShroud.position.set(0, 0.026, -0.25);
    const ribRing = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.14, 16), polymerMat);
    ribRing.rotation.x = Math.PI / 2;
    ribRing.position.set(0, 0.026, -0.17);

    const rodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), steelMat);
    rodL.rotation.x = Math.PI / 2;
    rodL.position.set(-0.024, 0.028, 0.23);
    const rodR = rodL.clone();
    rodR.position.x = 0.024;
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.108, 0.028), polymerMat);
    butt.position.set(0, 0.004, 0.34);

    const grip = extrudeSideProfile([
      [-0.065, -0.016], [-0.105, -0.016], [-0.130, -0.108], [-0.090, -0.112]
    ], 0.034, 0.004, polymerMat);

    magMesh = buildCurvedMagazine(0.026, 0.042, isExt ? 0.048 : 0.040, 4, 0.11, -0.028, -0.05, accentMat);

    if (useExternalOptic) {
      group.add(buildPicatinnyRail(0.14, 0.032, 0.064, 0.01, darkMetal));
      railY = 0.070;
      opticZ = 0.01;
    } else {
      group.add(buildOpenIronSights(0.09, -0.28, 0.078, darkMetal, '#4ade80', '#f97316', 0.0075));
      ironSightY = 0.081;
      ironRearZ = 0.09;
    }

    group.add(rec, cockingTube, slapHandle, sdShroud, ribRing, rodL, rodR, butt, grip, magMesh);
    muzzleZ = -0.43;
  } else if (weaponId === 'p90') {
    const frame = extrudeSideProfile([
      [-0.27, -0.068], [-0.10, -0.068], [-0.06, -0.018], [-0.01, -0.018],
      [0.01, -0.068], [0.16, -0.068], [0.22, -0.012], [0.23, 0.058],
      [0.06, 0.068], [-0.27, 0.062]
    ], 0.054, 0.005, bodyMat);
    const optBridge = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.042, 0.14), darkMetal);
    optBridge.position.set(0, 0.086, -0.15);
    group.add(buildPicatinnyRail(0.14, 0.034, 0.112, -0.15, darkMetal));
    railY = 0.118;
    opticZ = -0.15;

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.026, -0.29);

    magMesh = new THREE.Group();
    const magShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.050, 0.026, 0.28),
      new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.52 })
    );
    const magCore = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.016, 0.25), brassMat);
    magMesh.add(magShell, magCore);
    magMesh.position.set(0, 0.075, 0.07);

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(-0.085, -0.21, 0.125, darkMetal, '#38bdf8', '#facc15', 0.0075));
      ironSightY = 0.128;
      ironRearZ = -0.085;
    }

    group.add(frame, optBridge, barrel, magMesh);
    muzzleZ = -0.37;
  } else if (weaponId === 'vector') {
    // Iconic KRISS Vector .45 Super-V Drop Chassis + Long Stick Magazine
    const chassis = extrudeSideProfile([
      [-0.12, 0.005], [0.16, 0.005], [0.19, -0.045], [0.06, -0.095],
      [-0.02, -0.095], [-0.04, -0.020], [-0.12, -0.020], [-0.12, 0.068], [0.16, 0.068]
    ], 0.052, 0.004, bodyMat);
    const upperRail = buildPicatinnyRail(0.28, 0.034, 0.072, -0.02, darkMetal);
    railY = 0.079;
    opticZ = -0.02;

    const foldStock = extrudeSideProfile([
      [-0.12, 0.010], [-0.36, -0.038], [-0.36, 0.050], [-0.12, 0.052]
    ], 0.036, 0.004, polymerMat);
    const grip = extrudeSideProfile([
      [-0.08, -0.016], [-0.118, -0.016], [-0.145, -0.105], [-0.102, -0.110]
    ], 0.034, 0.004, polymerMat);
    const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.16, 12), darkMetal);
    barrelShroud.rotation.x = Math.PI / 2;
    barrelShroud.position.set(0, 0.032, -0.24);
    const peq = buildTacticalLaserModule(0.034, 0.034, -0.14, darkMetal, '#38bdf8');

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.028, isExt ? 0.22 : 0.175, 0.042), darkMetal);
    magMesh.position.set(0, -0.125, -0.085);
    magMesh.rotation.x = 0.26;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.09, -0.15, 0.088, darkMetal, '#38bdf8', '#f97316', 0.008));
      ironSightY = 0.091;
      ironRearZ = 0.09;
    }

    group.add(chassis, upperRail, foldStock, grip, barrelShroud, peq, magMesh, buildReceiverPolish(0.052, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.33;
    barrelY = 0.032;
  } else if (weaponId === 'ump45') {
    // HK UMP-45 Submachine Gun (.45 ACP Stick Mag & Skeleton Folding Stock)
    const rec = extrudeSideProfile([
      [-0.14, -0.022], [0.26, -0.022], [0.26, 0.062], [-0.14, 0.062]
    ], 0.052, 0.004, bodyMat);
    const foldStock = extrudeSideProfile([
      [-0.14, -0.015], [-0.37, -0.048], [-0.37, 0.044], [-0.14, 0.048]
    ], 0.032, 0.004, polymerMat);
    const stockCutout = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.042, 0.15), darkMetal);
    stockCutout.position.set(0, -0.002, 0.255);
    const grip = extrudeSideProfile([
      [-0.085, -0.018], [-0.122, -0.018], [-0.148, -0.108], [-0.105, -0.112]
    ], 0.034, 0.004, polymerMat);
    const vertGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.016, 0.075, 10), polymerMat);
    vertGrip.position.set(0, -0.052, -0.19);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.16, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.030, -0.34);
    const flange = buildMultiBaffleBrake(0.014, 0.030, -0.41, darkMetal, steelMat);

    group.add(buildPicatinnyRail(0.36, 0.034, 0.066, -0.05, darkMetal));
    railY = 0.073;
    opticZ = 0.01;

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.028, isExt ? 0.23 : 0.185, 0.046), polymerMat);
    magMesh.position.set(0, -0.115, -0.065);
    magMesh.rotation.x = 0.05;

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.24, 0.082, darkMetal, '#4ade80', '#f97316', 0.008));
      ironSightY = 0.085;
      ironRearZ = 0.11;
    }

    group.add(rec, foldStock, stockCutout, grip, vertGrip, barrel, flange, magMesh, buildReceiverPolish(0.052, 0.036, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.44;
    barrelY = 0.030;
  } else if (weaponId === 'mp7') {
    // HK MP7A1 4.6mm PDW (Compact Polymer Chassis + Folding Front Grip + 40rd Grip Mag)
    const chassis = extrudeSideProfile([
      [-0.145, -0.012], [0.145, -0.012], [0.145, 0.062], [-0.145, 0.062]
    ], 0.044, 0.004, bodyMat);
    const pistolGrip = extrudeSideProfile([
      [-0.025, -0.010], [-0.065, -0.010], [-0.082, -0.100], [-0.038, -0.104]
    ], 0.032, 0.004, polymerMat);
    const foldGrip = extrudeSideProfile([
      [0.095, -0.010], [0.130, -0.010], [0.145, -0.092], [0.108, -0.095]
    ], 0.028, 0.003, polymerMat);

    const rodL = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.16, 8), steelMat);
    rodL.rotation.x = Math.PI / 2;
    rodL.position.set(-0.024, 0.026, 0.21);
    const rodR = rodL.clone();
    rodR.position.x = 0.024;
    const stockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.096, 0.022), polymerMat);
    stockPlate.position.set(0, 0.008, 0.295);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.011, 0.14, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.030, -0.21);
    const flash = buildMultiBaffleBrake(0.012, 0.030, -0.285, steelMat, darkMetal);

    group.add(buildPicatinnyRail(0.24, 0.032, 0.065, -0.01, darkMetal));
    railY = 0.072;
    opticZ = -0.01;
    aimDistanceZ = -0.31;

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.024, isExt ? 0.175 : 0.135, 0.036), darkMetal);
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
    // Heavy Belt-Fed M249 SAW LMG with Visible 100-Round Brass Ammo Belt
    const rec = extrudeSideProfile([
      [-0.16, -0.022], [0.16, -0.022], [0.16, 0.072], [-0.16, 0.072]
    ], 0.068, 0.005, bodyMat);
    const paraStock = extrudeSideProfile([
      [-0.16, -0.010], [-0.41, -0.056], [-0.41, 0.048], [-0.16, 0.048]
    ], 0.048, 0.004, darkMetal);
    const grip = extrudeSideProfile([
      [-0.10, -0.020], [-0.138, -0.020], [-0.165, -0.118], [-0.120, -0.122]
    ], 0.036, 0.004, polymerMat);

    group.add(buildPicatinnyRail(0.24, 0.036, 0.076, 0.02, darkMetal));
    railY = 0.083;
    opticZ = 0.02;

    const handguard = extrudeSideProfile([
      [0.16, -0.015], [0.42, -0.010], [0.42, 0.046], [0.16, 0.046]
    ], 0.060, 0.004, polymerMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.44, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.030, -0.50);
    const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.015, 0.055, 10), steelMat);
    flash.rotation.x = Math.PI / 2;
    flash.position.set(0, 0.030, -0.73);
    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), steelMat);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.034, -0.022, -0.38);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.034;

    // 100-Round Olive Ammo Box + Visible Brass Cartridge Belt
    magMesh = new THREE.Group();
    const ammoBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, 0.135, 0.145),
      new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.62, metalness: 0.2 })
    );
    ammoBox.position.set(0, -0.092, -0.04);
    magMesh.add(ammoBox);
    for (let i = 0; i < 6; i++) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.032, 6), brassMat);
      round.rotation.x = Math.PI / 2;
      round.position.set(-0.048, -0.022 + i * 0.012, -0.04 + (i % 2) * 0.008);
      magMesh.add(round);
    }

    if (!useExternalOptic) {
      group.add(buildOpenIronSights(0.11, -0.60, 0.092, darkMetal, '#4ade80', '#f97316', 0.009));
      ironSightY = 0.095;
      ironRearZ = 0.11;
    }

    group.add(rec, paraStock, grip, handguard, barrel, flash, bipodL, bipodR, magMesh, buildReceiverPolish(0.068, 0.044, 0.02, darkMetal, steelMat, brassMat));
    muzzleZ = -0.76;
    barrelY = 0.030;
  } else if (weaponId === 'rpk') {
    // RPK-74M Heavy Squad Automatic Rifle (Club-Foot Stock + Long Barrel + 45-Rd Curved Mag)
    const rec = extrudeSideProfile([
      [-0.15, -0.020], [0.155, -0.020], [0.155, 0.046], [-0.15, 0.046]
    ], 0.056, 0.004, bodyMat);
    const dustCover = extrudeSideProfile([
      [-0.145, 0.044], [0.135, 0.044], [0.125, 0.068], [-0.135, 0.066]
    ], 0.046, 0.005, darkMetal);
    const clubStock = extrudeSideProfile([
      [-0.15, -0.012], [-0.41, -0.094], [-0.41, 0.036], [-0.15, 0.038]
    ], 0.044, 0.004, gripMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.125, 0.014), darkMetal);
    buttPlate.position.set(0, -0.028, 0.412);
    const grip = extrudeSideProfile([
      [-0.088, -0.016], [-0.128, -0.016], [-0.158, -0.118], [-0.112, -0.122]
    ], 0.034, 0.004, polymerMat);
    const hgLower = extrudeSideProfile([
      [0.155, -0.015], [0.39, -0.008], [0.39, 0.034], [0.155, 0.036]
    ], 0.052, 0.004, gripMat);
    const hgUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.21, 12), gripMat);
    hgUpper.rotation.x = Math.PI / 2;
    hgUpper.position.set(0, 0.046, -0.26);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.56, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.54);
    const brake = buildMultiBaffleBrake(0.015, 0.024, -0.82, steelMat, darkMetal);
    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8), steelMat);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.034, -0.006, -0.64);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.034;

    const bakeliteMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.44, metalness: 0.16 })
      : bodyMat;
    magMesh = buildCurvedMagazine(0.034, 0.064, isExt ? 0.052 : 0.044, 6, 0.085, -0.036, -0.055, bakeliteMat);

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
      buildReceiverPolish(0.056, 0.034, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.855;
    barrelY = 0.024;
  } else if (weaponId === 'spas12') {
    const rec = extrudeSideProfile([
      [-0.14, -0.018], [0.145, -0.018], [0.145, 0.062], [-0.14, 0.062]
    ], 0.056, 0.004, bodyMat);
    const heatShield = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.028, 0.44), steelMat);
    heatShield.position.set(0, 0.054, -0.31);
    const topBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.54, 14), darkMetal);
    topBarrel.rotation.x = Math.PI / 2;
    topBarrel.position.set(0, 0.042, -0.36);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.48, 12), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.010, -0.33);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.052, 0.22), gripMat);
    pump.position.set(0, 0.004, -0.27);

    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.044, 8), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 }));
      shell.position.set(-0.034, 0.026, -0.02 + i * 0.022);
      const brassRim = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), brassMat);
      brassRim.position.set(-0.034, 0.002, -0.02 + i * 0.022);
      group.add(shell, brassRim);
    }

    const stock = extrudeSideProfile([
      [-0.14, -0.012], [-0.39, -0.058], [-0.39, 0.044], [-0.14, 0.048]
    ], 0.044, 0.004, polymerMat);
    const stockHook = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.18), steelMat);
    stockHook.position.set(0, 0.068, 0.20);
    const grip = extrudeSideProfile([
      [-0.095, -0.016], [-0.135, -0.016], [-0.162, -0.114], [-0.118, -0.118]
    ], 0.036, 0.004, polymerMat);

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
    group.add(rec, heatShield, topBarrel, magTube, pump, stock, stockHook, grip);
    muzzleZ = -0.64;
  } else if (weaponId === 'aa12') {
    // Sleek Clamshell AA-12 Auto Shotgun + 20-Round Drum Magazine
    const body = extrudeSideProfile([
      [-0.38, -0.058], [-0.12, -0.044], [-0.08, -0.112], [-0.12, -0.116],
      [-0.04, -0.022], [0.34, -0.012], [0.34, 0.062], [-0.38, 0.056]
    ], 0.058, 0.005, bodyMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.28, 14), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.034, -0.44);
    const comp = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.048, 12), steelMat);
    comp.rotation.x = Math.PI / 2;
    comp.position.set(0, 0.034, -0.58);

    // 20-Round Drum Magazine
    magMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.056, 20), darkMetal);
    magMesh.rotation.x = Math.PI / 2;
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

    group.add(body, barrel, comp, magMesh, buildReceiverPolish(0.058, 0.038, 0.01, darkMetal, steelMat, brassMat));
    muzzleZ = -0.61;
    barrelY = 0.034;
  } else if (weaponId === 'm870') {
    // Remington M870 Classic Walnut & Blued Steel Pump-Action 12ga Shotgun
    const rec = extrudeSideProfile([
      [-0.13, -0.018], [0.145, -0.018], [0.145, 0.056], [-0.13, 0.056]
    ], 0.052, 0.005, bodyMat);
    const woodStock = extrudeSideProfile([
      [-0.13, -0.008], [-0.40, -0.076], [-0.40, 0.026], [-0.13, 0.036]
    ], 0.044, 0.005, gripMat);
    const recoilPad = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.104, 0.018), polymerMat);
    recoilPad.position.set(0, -0.026, 0.408);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.56, 14), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, -0.42);
    const ventRib = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.54), steelMat);
    ventRib.position.set(0, 0.054, -0.42);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.50, 12), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.012, -0.39);
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.046, 0.020), steelMat);
    clamp.position.set(0, 0.024, -0.58);

    // Corncob Ribbed Wooden Pump Forend
    magMesh = new THREE.Group();
    const pumpCore = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.21, 14), gripMat);
    pumpCore.rotation.x = Math.PI / 2;
    magMesh.add(pumpCore);
    for (let r = -2; r <= 2; r++) {
      const groove = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.014, 14), gripMat);
      groove.rotation.x = Math.PI / 2;
      groove.position.z = r * 0.034;
      magMesh.add(groove);
    }
    magMesh.position.set(0, 0.010, -0.28);

    for (let i = 0; i < 4; i++) {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.044, 8), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4 }));
      shell.position.set(-0.032, 0.024, -0.02 + i * 0.022);
      const brassRim = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), brassMat);
      brassRim.position.set(-0.032, 0.0, -0.02 + i * 0.022);
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
      buildReceiverPolish(0.052, 0.028, -0.02, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.71;
    barrelY = 0.038;
  } else if (weaponId === 'kar98k') {
    // Classic Mauser Kar98k Bolt-Action Sniper Rifle (Oiled Walnut Full Stock + Turned Bolt + ZF Scope)
    const walnutMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#783f1d', roughness: 0.46, metalness: 0.10 })
      : bodyMat;
    const stockFull = extrudeSideProfile([
      [-0.41, -0.072], [-0.15, -0.018], [-0.09, -0.022], [0.43, 0.014],
      [0.43, 0.044], [-0.12, 0.038], [-0.41, 0.024]
    ], 0.044, 0.006, walnutMat);
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.098, 0.014), steelMat);
    buttPlate.position.set(0, -0.024, 0.415);
    const noseBand = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.040, 0.028), steelMat);
    noseBand.position.set(0, 0.030, -0.43);

    const actionSteel = extrudeSideProfile([
      [-0.10, 0.036], [0.13, 0.036], [0.13, 0.058], [-0.10, 0.058]
    ], 0.036, 0.004, steelMat);
    const mauserBoltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 10), steelMat);
    mauserBoltKnob.position.set(0.042, 0.024, 0.025);
    const mauserBoltArm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.036, 8), steelMat);
    mauserBoltArm.rotation.z = -Math.PI / 3;
    mauserBoltArm.position.set(0.030, 0.034, 0.025);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.014, 0.64, 14), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.042, -0.54);
    const frontHood = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.024, 10), steelMat);
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
      stockFull, buttPlate, noseBand, actionSteel, mauserBoltArm, mauserBoltKnob, barrel, frontHood, scopeGroup, magMesh,
      buildReceiverPolish(0.044, 0.044, -0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -0.87;
    barrelY = 0.042;
    railY = 0.095;
    ironSightY = 0.095;
  } else if (weaponId === 'm200') {
    // CheyTac M200 Intervention .408 Tactical Chassis + Dual-Rod Sliding Stock + Carry Handle
    const chassisMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#44403c', roughness: 0.40, metalness: 0.62 })
      : bodyMat;
    const chassis = extrudeSideProfile([
      [-0.15, -0.022], [0.35, -0.018], [0.35, 0.062], [-0.15, 0.062]
    ], 0.062, 0.005, chassisMat);

    // Dual Tubular Telescoping Stock + Monopod
    const rodTopL = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.27, 10), steelMat);
    rodTopL.rotation.x = Math.PI / 2;
    rodTopL.position.set(-0.022, 0.036, 0.29);
    const rodTopR = rodTopL.clone();
    rodTopR.position.x = 0.022;
    const stockPad = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.118, 0.026), polymerMat);
    stockPad.position.set(0, 0.004, 0.43);
    const monopod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.075, 8), darkMetal);
    monopod.position.set(0, -0.065, 0.36);

    const grip = extrudeSideProfile([
      [-0.11, -0.018], [-0.15, -0.018], [-0.175, -0.108], [-0.132, -0.112]
    ], 0.038, 0.004, polymerMat);
    const barrelShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.32, 14), chassisMat);
    barrelShroud.rotation.x = Math.PI / 2;
    barrelShroud.position.set(0, 0.038, -0.34);

    // Signature M200 Side-Offset Tubular Carry Handle (keeps sight line unobstructed!)
    const carryRail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.17), steelMat);
    carryRail.position.set(-0.038, 0.056, -0.24);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.68, 16), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, -0.62);
    const brake = buildMultiBaffleBrake(0.028, 0.038, -0.96, darkMetal, accentMat, true);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.24, 8), darkMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.036, -0.026, -0.41);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.036;

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

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.115), darkMetal);
    magMesh.position.set(0, -0.072, -0.05);
    magMesh.rotation.x = 0.12;

    group.add(
      chassis, rodTopL, rodTopR, stockPad, monopod, grip, barrelShroud, carryRail,
      barrel, brake, bipodL, bipodR, scopeGroup, magMesh,
      buildReceiverPolish(0.062, 0.044, 0.01, darkMetal, steelMat, brassMat)
    );
    muzzleZ = -1.01;
    barrelY = 0.038;
    railY = 0.112;
    ironSightY = 0.112;
  } else if (weaponId === 'awp' || weaponId === 'barrett' || weaponId === 'svd') {
    const isBarrett = weaponId === 'barrett';
    const isSvd = weaponId === 'svd';
    const defaultColor = isBarrett ? '#334155' : (isSvd ? '#5c3a21' : '#365833');
    const chassisMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.44, metalness: isBarrett ? 0.68 : 0.26 })
      : bodyMat;

    const chassis = extrudeSideProfile([
      [-0.14, -0.022], [isBarrett ? 0.34 : 0.28, -0.018], [isBarrett ? 0.34 : 0.28, 0.062], [-0.14, 0.062]
    ], isBarrett ? 0.068 : 0.056, 0.005, chassisMat);

    // Sculpted Thumbhole Sniper Stock
    const stockTop = extrudeSideProfile([
      [-0.14, 0.015], [-0.42, 0.015], [-0.42, 0.058], [-0.14, 0.058]
    ], 0.050, 0.004, chassisMat);
    const stockBot = extrudeSideProfile([
      [-0.18, -0.055], [-0.42, -0.065], [-0.42, 0.020], [-0.36, 0.020], [-0.36, -0.032], [-0.18, -0.028]
    ], 0.044, 0.004, chassisMat);
    const grip = extrudeSideProfile([
      [-0.12, -0.018], [-0.16, -0.018], [-0.185, -0.105], [-0.142, -0.108]
    ], 0.038, 0.004, polymerMat);
    const cheekPad = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.026, 0.15), polymerMat);
    cheekPad.position.set(0, 0.070, 0.30);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(isBarrett ? 0.017 : (isSvd ? 0.011 : 0.013), isBarrett ? 0.020 : 0.015, isBarrett ? 0.68 : 0.62, 16),
      darkMetal
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, -0.58);

    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.20, 8), darkMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.032, -0.024, -0.37);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.032;
    const footL = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.028, 8), polymerMat);
    footL.rotation.x = Math.PI / 2;
    footL.position.set(-0.032, -0.024, -0.475);
    const footR = footL.clone();
    footR.position.x = 0.032;

    const brake = new THREE.Mesh(
      new THREE.BoxGeometry(isBarrett ? 0.064 : 0.034, isBarrett ? 0.040 : 0.028, isBarrett ? 0.105 : 0.072),
      isBarrett ? accentMat : darkMetal
    );
    brake.position.set(0, 0.038, isBarrett ? -0.94 : -0.87);

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

    magMesh = isSvd
      ? buildCurvedMagazine(0.032, 0.068, 0.036, 3, 0.12, -0.034, -0.04, darkMetal)
      : new THREE.Mesh(new THREE.BoxGeometry(0.044, isBarrett ? 0.135 : 0.095, isBarrett ? 0.135 : 0.096), darkMetal);
    if (!isSvd) {
      magMesh.position.set(0, -0.070, -0.04);
      if (isBarrett) magMesh.rotation.x = 0.14;
    }

    group.add(
      chassis, stockTop, stockBot, grip, cheekPad, barrel, bipodL, bipodR, footL, footR, brake, scopeGroup, magMesh,
      buildReceiverPolish(isBarrett ? 0.068 : 0.056, 0.042, 0.015, darkMetal, steelMat, brassMat)
    );
    muzzleZ = isBarrett ? -0.99 : -0.90;
    barrelY = 0.038;
    railY = 0.104;
    ironSightY = 0.104;
  } else if (weaponId === 'fiveseven') {
    // FN Five-seveN Futuristic Streamlined 5.7x28mm Tactical Pistol + 20-Rd Magazine
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#272b33', metalness: 0.55, roughness: 0.34 })
      : bodyMat;
    const ctrlMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.72, roughness: 0.25 });

    const slide = extrudeSideProfile([
      [-0.072, 0.014], [0.148, 0.014], [0.142, 0.056], [-0.072, 0.056]
    ], 0.034, 0.003, slideMat);
    boltMesh = slide;

    const frame = extrudeSideProfile([
      [-0.070, -0.012], [0.142, -0.012], [0.142, 0.015], [-0.070, 0.015]
    ], 0.034, 0.003, polymerMat);
    const grip = extrudeSideProfile([
      [-0.025, -0.010], [-0.068, -0.010], [-0.098, -0.108], [-0.050, -0.112]
    ], 0.034, 0.004, gripMat);
    const safetyLever = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.010, 0.022), ctrlMat);
    safetyLever.position.set(0, 0.018, -0.02);
    const tacLaser = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.050, 10), darkMetal);
    tacLaser.rotation.x = Math.PI / 2;
    tacLaser.position.set(0, -0.017, -0.108);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.115, 0.040), polymerMat);
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
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: isUsp ? '#334155' : (isGlock ? '#1e293b' : '#cbd5e1'), metalness: 0.90, roughness: 0.18 })
      : bodyMat;

    const slide = extrudeSideProfile([
      [-0.072, 0.014], [isUsp || isGlock ? 0.145 : 0.175, 0.014],
      [isUsp || isGlock ? 0.145 : 0.175, 0.056], [-0.072, 0.056]
    ], isUsp || isGlock ? 0.034 : 0.040, 0.003, slideMat);
    boltMesh = slide;

    const frame = extrudeSideProfile([
      [-0.070, -0.012], [0.135, -0.012], [0.135, 0.015], [-0.070, 0.015]
    ], 0.034, 0.003, polymerMat);
    const grip = extrudeSideProfile([
      [-0.025, -0.010], [-0.068, -0.010], [-0.098, -0.108], [-0.050, -0.112]
    ], 0.034, 0.004, gripMat);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.020, 0.016), steelMat);
    hammer.position.set(0, 0.032, 0.078);
    hammer.rotation.x = -0.35;

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.026, isGlock ? 0.135 : 0.105, 0.038), darkMetal);
    magMesh.position.set(0, isGlock ? -0.072 : -0.060, 0.052);
    magMesh.rotation.x = -0.24;

    if (isGlock) {
      // Tactical under-rail flashlight/laser on Glock-18C
      const tacLight = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.055, 10), darkMetal);
      tacLight.rotation.x = Math.PI / 2;
      tacLight.position.set(0, -0.018, -0.105);
      group.add(tacLight);
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
    muzzleZ = -0.16;

    if (isUsp) {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.165, 16), darkMetal);
      sup.rotation.x = Math.PI / 2;
      sup.position.set(0, 0.034, -0.22);
      const supRing = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.022, 16), steelMat);
      supRing.rotation.x = Math.PI / 2;
      supRing.position.set(0, 0.034, -0.15);
      group.add(sup, supRing);
      muzzleZ = -0.31;
    }
  } else if (weaponId === 'magnum') {
    // .44 Python Magnum Revolver with 6-Chamber Fluted Cylinder & Walnut Grip
    const revSteel = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.94, roughness: 0.14 })
      : bodyMat;
    const revWood = new THREE.MeshStandardMaterial({ color: '#6b3410', roughness: 0.52, metalness: 0.12 });

    const frame = extrudeSideProfile([
      [-0.055, -0.015], [0.072, -0.015], [0.072, 0.054], [-0.040, 0.054], [-0.065, 0.025]
    ], 0.028, 0.003, revSteel);
    const barrelRib = extrudeSideProfile([
      [0.070, 0.020], [0.225, 0.020], [0.225, 0.056], [0.070, 0.056]
    ], 0.024, 0.003, revSteel);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.052, 12), revSteel);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(0, 0.022, -0.015);
    const grip = extrudeSideProfile([
      [-0.038, -0.008], [-0.072, -0.008], [-0.108, -0.110], [-0.055, -0.115]
    ], 0.034, 0.005, revWood);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.018), steelMat);
    hammer.position.set(0, 0.048, 0.060);
    hammer.rotation.x = -0.45;

    magMesh = cyl;
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

    group.add(frame, barrelRib, cyl, grip, hammer);
    muzzleZ = -0.23;
  } else if (weaponId === 'knife' || weaponId === 'karambit') {
    const isKara = weaponId === 'karambit';
    const bladeMat = new THREE.MeshStandardMaterial({
      map: skinId === 'default' ? null : skinTex,
      color: skinId === 'default' ? (isKara ? '#ef4444' : '#e2e8f0') : '#ffffff',
      metalness: 0.94,
      roughness: 0.12
    });

    if (isKara) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 20), darkMetal);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0, -0.032, 0.105);
      const handle = extrudeSideProfile([
        [-0.088, -0.026], [-0.015, -0.004], [0.022, 0.012], [0.010, 0.036], [-0.075, 0.004]
      ], 0.020, 0.003, gripMat);
      const blade = extrudeSideProfile([
        [0.015, 0.002], [0.095, -0.002], [0.165, -0.062], [0.125, -0.010], [0.012, 0.034]
      ], 0.006, 0.002, bladeMat);
      group.add(ring, handle, blade);
    } else {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.13, 12), gripMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, 0.05);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), steelMat);
      pommel.position.set(0, 0, 0.12);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.084, 0.016), darkMetal);
      guard.position.set(0, 0, -0.018);
      const blade = extrudeSideProfile([
        [0.024, -0.016], [0.225, -0.014], [0.275, 0.004], [0.220, 0.024], [0.024, 0.022]
      ], 0.006, 0.002, bladeMat);
      group.add(handle, pommel, guard, blade);
    }
    muzzleZ = -0.25;
  }

  // Mount Open/Transparent Optics & Muzzle Attachments
  let aimSightY = ironSightY;
  let aimSightZ = ironRearZ;

  if (!isSniper && !isMelee) {
    if (optic === 'reddot') {
      const opticGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.011, 0.068), darkMetal);
      base.position.set(0, railY + 0.005, opticZ);
      const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.034, 0.044), darkMetal);
      wallL.position.set(-0.017, railY + 0.026, opticZ);
      const wallR = wallL.clone();
      wallR.position.x = 0.017;
      const topArch = new THREE.Mesh(new THREE.BoxGeometry(0.039, 0.005, 0.044), darkMetal);
      topArch.position.set(0, railY + 0.044, opticZ);

      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.028, 0.028),
        new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
      );
      glass.position.set(0, railY + 0.026, opticZ);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.0018, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ff2e2e' })
      );
      dot.position.set(0, railY + 0.026, opticZ);

      opticGroup.add(base, wallL, wallR, topArch, glass, dot);
      group.add(opticGroup);
      aimSightY = railY + 0.026;
      aimSightZ = opticZ;
    } else if (optic === 'acog') {
      const acogGroup = new THREE.Group();
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.016, 0.072), darkMetal);
      mount.position.set(0, railY + 0.006, opticZ);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.017, 0.115, 16), darkMetal);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, railY + 0.026, opticZ);
      const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.018, 0.042, 16), darkMetal);
      bellFront.rotation.x = Math.PI / 2;
      bellFront.position.set(0, railY + 0.026, opticZ - 0.068);
      const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.088, 8), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
      fiber.rotation.x = Math.PI / 2;
      fiber.position.set(0, railY + 0.047, opticZ - 0.005);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.015, 14), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
      lens.position.set(0, railY + 0.026, opticZ + 0.058);
      acogGroup.add(mount, tube, bellFront, fiber, lens);
      group.add(acogGroup);
      aimSightY = railY + 0.026;
      aimSightZ = opticZ;
    }

    const muzzle = attachments?.muzzle || 'none';
    if (muzzle === 'suppressor' && weaponId !== 'mp5' && weaponId !== 'usps') {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.175, 16), darkMetal);
      sup.rotation.x = Math.PI / 2;
      sup.position.set(0, barrelY, muzzleZ - 0.075);
      const supRing = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.0215, 0.022, 16), steelMat);
      supRing.rotation.x = Math.PI / 2;
      supRing.position.set(0, barrelY, muzzleZ - 0.005);
      group.add(sup, supRing);
      muzzleZ -= 0.16;
    } else if (muzzle === 'compensator') {
      const comp = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.026, 0.058), accentMat);
      comp.position.set(0, barrelY, muzzleZ - 0.022);
      group.add(comp);
      muzzleZ -= 0.045;
    }
  }

  group.userData = {
    weaponId,
    optic,
    magMesh,
    magBasePos: magMesh ? magMesh.position.clone() : null,
    boltMesh,
    boltBaseZ: boltMesh ? boltMesh.position.z : 0,
    muzzlePos: new THREE.Vector3(0, barrelY, muzzleZ),
    aimSightLocalPos: new THREE.Vector3(0, aimSightY, aimSightZ),
    aimDistanceZ
  };
  return group;
}

export function createFirstPersonRig(weaponId, skinId, attachments, outfitId = 'urban', operatorId = null) {
  const root = new THREE.Group();
  const outfit = OUTFITS[outfitId] || OUTFITS.urban;
  const opCfg = operatorId ? (OPERATORS[operatorId] || OPERATORS.vanguard) : null;
  const isSwimwear = Boolean(outfit.isSwimwear);
  const isFemale = Boolean(opCfg?.gender === 'female');
  const gun = createWeaponModel(weaponId, skinId, attachments);
  const outfitTex = getOutfitTextures(outfitId, outfit.primary, outfit.secondary, outfit.accent);

  const sleeveMat = new THREE.MeshStandardMaterial({
    map: outfitTex.map,
    bumpMap: outfitTex.bumpMap,
    bumpScale: 0.015,
    roughness: 0.70
  });
  const cuffMat = new THREE.MeshStandardMaterial({ color: outfit.secondary, roughness: 0.62 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.45, metalness: 0.28 });
  const knuckleMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.25, metalness: 0.80 });
  const skinMat = new THREE.MeshStandardMaterial({ color: outfit.skinTone || '#d6a781', roughness: 0.46, metalness: 0.02 });
  const armMat = isSwimwear ? skinMat : sleeveMat;
  const wristRingMat = isSwimwear
    ? new THREE.MeshStandardMaterial({ color: outfit.accent || '#fde047', metalness: 0.78, roughness: 0.22 })
    : cuffMat;
  const armRTop = isSwimwear || isFemale ? 0.039 : 0.046;
  const armRBot = isSwimwear || isFemale ? 0.031 : 0.038;
  const watchFaceMat = new THREE.MeshBasicMaterial({ map: getWatchFaceTexture(outfit.accent || '#38bdf8') });

  // Right Arm + Carbon-Knuckle Glove + Trigger Finger
  const rArmGroup = new THREE.Group();
  connectLimbSegment(rArmGroup, new THREE.Vector3(0.14, -0.15, 0.38), new THREE.Vector3(0.03, -0.09, 0.14), armRTop, armRBot, armMat);
  const rHand = new THREE.Mesh(new THREE.CapsuleGeometry(isFemale ? 0.022 : 0.026, 0.048, 6, 10), isSwimwear ? skinMat : gloveMat);
  rHand.rotation.x = Math.PI / 2;
  rHand.position.set(0.018, -0.078, 0.095);
  const rKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.014, 0.032), isSwimwear ? wristRingMat : knuckleMat);
  rKnuckle.position.set(0.018, -0.052, 0.088);
  const rTriggerFinger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0065, 0.028, 4, 6), skinMat);
  rTriggerFinger.rotation.x = Math.PI / 2;
  rTriggerFinger.position.set(0.015, -0.044, 0.058);
  rArmGroup.add(rHand, rKnuckle, rTriggerFinger);

  // Left Arm + Tactical Smartwatch / Beach Bangle + Sculpted Supporting Hand
  const isShort = ['deagle', 'usps', 'glock18', 'magnum', 'fiveseven', 'knife', 'karambit'].includes(weaponId);
  const lArmGroup = new THREE.Group();
  const lWrist = new THREE.Vector3(-0.028, -0.056, isShort ? 0.045 : -0.13);
  const lElbow = new THREE.Vector3(-0.18, -0.15, isShort ? 0.28 : 0.16);
  connectLimbSegment(lArmGroup, lElbow, lWrist, armRTop, armRBot, armMat);

  const lCuff = new THREE.Mesh(new THREE.CylinderGeometry(armRBot + 0.002, armRBot + 0.002, isSwimwear ? 0.016 : 0.038, 12), wristRingMat);
  lCuff.rotation.x = Math.PI / 2;
  lCuff.position.copy(lWrist).add(new THREE.Vector3(-0.012, -0.008, 0.02));
  lCuff.rotation.y = 0.28;

  const watchBand = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.022, 12), knuckleMat);
  watchBand.rotation.x = Math.PI / 2;
  watchBand.position.copy(lWrist);
  const watchScreen = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.009, 0.030), watchFaceMat);
  watchScreen.position.copy(lWrist).add(new THREE.Vector3(0.008, 0.028, 0));

  const lHand = new THREE.Mesh(new THREE.CapsuleGeometry(isFemale ? 0.022 : 0.026, 0.048, 6, 10), isSwimwear ? skinMat : gloveMat);
  lHand.rotation.x = Math.PI / 2;
  lHand.position.set(-0.014, -0.044, isShort ? 0.020 : -0.19);
  const lKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.013, 0.034), isSwimwear ? cuffMat : knuckleMat);
  lKnuckle.position.set(-0.014, -0.019, isShort ? 0.018 : -0.19);
  const lThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0075, 0.028, 4, 6), skinMat);
  lThumb.rotation.x = Math.PI / 2;
  lThumb.position.set(-0.025, -0.014, isShort ? 0.015 : -0.19);

  lArmGroup.add(lCuff, watchBand, watchScreen, lHand, lKnuckle, lThumb);

  // Volumetric 3-Plane Star Muzzle Flash
  const flashMat = new THREE.MeshBasicMaterial({
    color: '#fef08a',
    transparent: true,
    opacity: 0.94,
    depthTest: false,
    side: THREE.DoubleSide
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: '#f97316',
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    side: THREE.DoubleSide
  });
  const flashGroup = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.065), flashMat);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.24), flashMat);
  const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), coreMat);
  p3.rotation.z = Math.PI / 4;
  flashGroup.add(p1, p2, p3);
  flashGroup.position.copy(gun.userData.muzzlePos);
  flashGroup.visible = false;

  root.add(gun, rArmGroup, lArmGroup, flashGroup);
  root.userData = { gun, flashGroup, lArm: lArmGroup, rArm: rArmGroup };
  return root;
}

function makeNameplateSprite(name, team, isAlly) {
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
  ctx.fillText(String(name || 'Chiến Binh').slice(0, 16), 128, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.45, 0.36, 1);
  sprite.position.set(0, 2.15, 0);
  return sprite;
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
  const isHeavy = opCfg.helmetStyle === 'heavy';
  const isFemale = opCfg.gender === 'female';
  const isSwimwear = Boolean(outCfg.isSwimwear);
  const teamGlowColor = team === 'alpha' ? '#0ea5e9' : (team === 'bravo' ? '#f97316' : (isAlly ? '#10b981' : '#ef4444'));

  const outfitTex = getOutfitTextures(outfit, outCfg.primary, outCfg.secondary, outCfg.accent);
  const molleBump = getMolleVestTextures();

  const clothMat = new THREE.MeshStandardMaterial({
    map: outfitTex.map,
    bumpMap: outfitTex.bumpMap,
    bumpScale: 0.02,
    roughness: 0.66
  });
  const secMat = new THREE.MeshStandardMaterial({
    color: outCfg.secondary,
    bumpMap: outfitTex.bumpMap,
    bumpScale: 0.015,
    roughness: 0.58
  });
  const swimPrimaryMat = new THREE.MeshStandardMaterial({
    color: outCfg.primary,
    roughness: 0.30,
    metalness: 0.14
  });
  const swimAccentMat = new THREE.MeshStandardMaterial({
    color: outCfg.secondary,
    roughness: 0.32,
    metalness: 0.16
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: outCfg.vest,
    bumpMap: molleBump,
    bumpScale: 0.028,
    roughness: 0.44,
    metalness: 0.36
  });
  const pouchMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    bumpMap: molleBump,
    bumpScale: 0.02,
    roughness: 0.54,
    metalness: 0.25
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: outCfg.skinTone, roughness: 0.44, metalness: 0.02 });
  const accentTrim = new THREE.MeshStandardMaterial({
    color: outCfg.accent || teamGlowColor,
    emissive: teamGlowColor,
    emissiveIntensity: 0.56,
    roughness: 0.25
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: outCfg.accent || '#fbbf24',
    metalness: 0.86,
    roughness: 0.18
  });
  const darkGearMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.44, metalness: 0.42 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.22, metalness: 0.88 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: '#0ea5e9',
    emissive: '#0369a1',
    emissiveIntensity: 0.28,
    metalness: 0.94,
    roughness: 0.06
  });

  // 1. Sculpted Pelvis & War-Belt / Swimwear Hip Silhouette
  const hips = new THREE.Group();
  hips.position.set(0, 0.88, 0);
  if (isFemale) {
    const pelvisMat = isSwimwear ? swimPrimaryMat : secMat;
    const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.136, 18, 14), pelvisMat);
    pelvisMesh.scale.set(1.18, 0.78, 0.88);
    pelvisMesh.position.set(0, -0.01, 0.005);
    hips.add(pelvisMesh);

    for (const gx of [-0.056, 0.056]) {
      const curveHip = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 12), pelvisMat);
      curveHip.scale.set(0.95, 1.02, 1.05);
      curveHip.position.set(gx, -0.024, 0.046);
      hips.add(curveHip);
    }

    if (isSwimwear) {
      for (const sx of [-0.156, 0.156]) {
        const sideRing = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0045, 8, 16), goldMat);
        sideRing.rotation.y = Math.PI / 2;
        sideRing.position.set(sx, 0.012, -0.012);
        const sideTie = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.036, 4, 8), swimAccentMat);
        sideTie.position.set(sx * 1.02, -0.014, -0.012);
        hips.add(sideRing, sideTie);
      }
      const trimBand = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.156, 0.024, 18), swimAccentMat);
      trimBand.scale.set(1.18, 1.0, 0.84);
      trimBand.position.set(0, 0.036, 0.005);
      hips.add(trimBand);
    } else {
      const beltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.168, 0.056, 16), darkGearMat);
      beltMesh.scale.set(1.18, 1.0, 0.82);
      beltMesh.position.y = 0.048;
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.058, 0.022), accentTrim);
      buckle.position.set(0, 0.048, -0.138);
      const ifak = extrudeSideProfile([
        [-0.12, -0.01], [-0.18, -0.01], [-0.175, 0.085], [-0.12, 0.085]
      ], 0.13, 0.006, pouchMat);
      hips.add(beltMesh, buckle, ifak);
    }
  } else {
    const pelvisMat = isSwimwear ? swimPrimaryMat : secMat;
    const pelvisMesh = new THREE.Mesh(new THREE.CapsuleGeometry(isHeavy ? 0.14 : 0.125, isHeavy ? 0.16 : 0.13, 6, 12), pelvisMat);
    pelvisMesh.rotation.z = Math.PI / 2;
    pelvisMesh.scale.set(1.0, 1.0, 0.95);
    const beltMesh = new THREE.Mesh(new THREE.CylinderGeometry(isHeavy ? 0.21 : 0.188, isHeavy ? 0.21 : 0.188, 0.068, 14), darkGearMat);
    beltMesh.scale.set(1.22, 1.0, 0.80);
    beltMesh.position.y = 0.05;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.068, 0.024), accentTrim);
    buckle.position.set(0, 0.05, -0.155);
    hips.add(pelvisMesh, beltMesh, buckle);
    if (!isSwimwear) {
      const rearPouch = extrudeSideProfile([
        [-0.14, -0.01], [-0.21, -0.01], [-0.20, 0.10], [-0.14, 0.10]
      ], 0.16, 0.008, pouchMat);
      hips.add(rearPouch);
    }
  }
  bodyRoot.add(hips);

  // 2. Smooth Articulated Legs (Tapered Sculpted Female Legs vs Tactical Male Cargo Trousers)
  function makeArticulatedLeg(sideX, isRight) {
    const legPivot = new THREE.Group();
    legPivot.position.set(sideX, 0.84, 0);

    const thighMat = isSwimwear ? skinMat : clothMat;
    const shinMat = isSwimwear ? skinMat : secMat;

    if (isFemale) {
      const thighProfile = [
        new THREE.Vector2(0.048, -0.39),
        new THREE.Vector2(0.057, -0.28),
        new THREE.Vector2(0.075, -0.14),
        new THREE.Vector2(0.080, -0.04),
        new THREE.Vector2(0.068, 0.02)
      ];
      const thigh = new THREE.Mesh(new THREE.LatheGeometry(thighProfile, 16), thighMat);
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.049, 12, 10), thighMat);
      kneeCap.position.set(0, -0.40, 0);
      legPivot.add(thigh, kneeCap);

      const strap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.074, 0.072, isSwimwear ? 0.022 : 0.028, 14),
        isSwimwear && !isRight ? goldMat : darkGearMat
      );
      strap.position.set(0, -0.17, 0);
      legPivot.add(strap);

      if (isRight) {
        const holster = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.125, 0.080), darkGearMat);
        holster.position.set(0.075, -0.17, 0);
        const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.052, 0.036), darkGearMat);
        pistolGrip.position.set(0.078, -0.095, 0.015);
        pistolGrip.rotation.x = 0.25;
        legPivot.add(holster, pistolGrip);
      } else if (!isSwimwear) {
        const magRig = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.10, 0.095), pouchMat);
        magRig.position.set(-0.074, -0.17, 0);
        legPivot.add(magRig);
      }
    } else {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.27, 6, 12), thighMat);
      thigh.position.set(0, -0.20, 0);
      legPivot.add(thigh);
      if (!isSwimwear) {
        const cargoPocket = extrudeSideProfile([
          [-0.06, -0.27], [0.06, -0.27], [0.05, -0.13], [-0.05, -0.13]
        ], 0.042, 0.005, secMat);
        cargoPocket.position.x = isRight ? 0.076 : -0.076;
        legPivot.add(cargoPocket);
      }
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.090, 0.088, 0.030, 12), darkGearMat);
      strap.position.set(0, -0.19, 0);
      legPivot.add(strap);

      if (isRight) {
        const holster = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.15, 0.10), darkGearMat);
        holster.position.set(0.088, -0.19, 0);
        const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.062, 0.042), darkGearMat);
        pistolGrip.position.set(0.092, -0.10, 0.02);
        pistolGrip.rotation.x = 0.25;
        legPivot.add(holster, pistolGrip);
      } else if (!isSwimwear) {
        const magRig = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.12, 0.12), pouchMat);
        magRig.position.set(-0.088, -0.19, 0);
        legPivot.add(magRig);
      }
    }

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.40, 0);
    legPivot.add(kneePivot);

    if (isFemale) {
      const calfProfile = [
        new THREE.Vector2(0.038, -0.34),
        new THREE.Vector2(0.037, -0.28),
        new THREE.Vector2(0.055, -0.16),
        new THREE.Vector2(0.054, -0.08),
        new THREE.Vector2(0.048, 0.0)
      ];
      const shin = new THREE.Mesh(new THREE.LatheGeometry(calfProfile, 16), shinMat);
      kneePivot.add(shin);

      if (!isSwimwear) {
        const kneePadStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.053, 0.040, 12), darkGearMat);
        const kneeShell = new THREE.Mesh(new THREE.SphereGeometry(0.050, 12, 10), vestMat);
        kneeShell.scale.set(1.06, 0.90, 0.56);
        kneeShell.position.set(0, 0.0, -0.048);
        kneePivot.add(kneePadStrap, kneeShell);
      }

      const shoeColor = isSwimwear ? swimAccentMat : darkGearMat;
      const bootAnkle = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.049, isSwimwear ? 0.08 : 0.13, 12), shoeColor);
      bootAnkle.position.set(0, isSwimwear ? -0.36 : -0.33, 0);
      const bootProfile = extrudeSideProfile([
        [-0.068, -0.425], [0.145, -0.425], [0.138, -0.382], [0.055, -0.356], [-0.065, -0.356]
      ], 0.096, 0.010, shoeColor);
      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.022, 0.228), isSwimwear ? accentTrim : pouchMat);
      bootSole.position.set(0, -0.432, -0.040);
      kneePivot.add(bootAnkle, bootProfile, bootSole);
    } else {
      const kneePadStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.076, 0.05, 10), darkGearMat);
      const kneeShell = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), isSwimwear ? darkGearMat : vestMat);
      kneeShell.scale.set(1.12, 0.96, 0.62);
      kneeShell.position.set(0, 0.0, -0.070);

      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.066, 0.24, 6, 12), shinMat);
      shin.position.set(0, -0.19, 0);

      const bootAnkle = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.11, 12), darkGearMat);
      bootAnkle.position.set(0, -0.34, 0);
      const bootProfile = extrudeSideProfile([
        [-0.08, -0.425], [0.165, -0.425], [0.160, -0.375], [0.065, -0.350], [-0.075, -0.350]
      ], 0.125, 0.010, darkGearMat);
      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.138, 0.028, 0.260), pouchMat);
      bootSole.position.set(0, -0.432, -0.046);

      if (isSwimwear) kneeShell.visible = false;
      kneePivot.add(kneePadStrap, kneeShell, shin, bootAnkle, bootProfile, bootSole);
    }

    return { legPivot, kneePivot };
  }

  const legX = isFemale ? 0.104 : 0.12;
  const leftLegData = makeArticulatedLeg(-legX, false);
  const rightLegData = makeArticulatedLeg(legX, true);
  const leftLeg = leftLegData.legPivot;
  const rightLeg = rightLegData.legPivot;
  const leftKnee = leftLegData.kneePivot;
  const rightKnee = rightLegData.kneePivot;
  bodyRoot.add(leftLeg, rightLeg);

  // 3. Athletic Sculpted Torso (Female Hourglass + Bikini / Cropped Spec-Ops vs Armored Male)
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.95, 0);
  bodyRoot.add(upperBody);

  const torsoW = isFemale ? 0.34 : (isHeavy ? 0.48 : 0.42);
  let backpackGroup = new THREE.Group();

  if (isFemale) {
    const bodyBaseMat = isSwimwear ? skinMat : clothMat;
    const femaleTorsoPts = [
      new THREE.Vector2(0.001, -0.03),
      new THREE.Vector2(0.136, -0.01),
      new THREE.Vector2(0.110, 0.09),
      new THREE.Vector2(0.126, 0.20),
      new THREE.Vector2(0.145, 0.33),
      new THREE.Vector2(0.136, 0.44),
      new THREE.Vector2(0.066, 0.49),
      new THREE.Vector2(0.001, 0.49)
    ];
    const torso = new THREE.Mesh(new THREE.LatheGeometry(femaleTorsoPts, 20), bodyBaseMat);
    torso.scale.set(1.16, 1.0, 0.68);
    upperBody.add(torso);

    // Sculpted Feminine Bust Silhouette
    const bustMat = isSwimwear ? swimPrimaryMat : clothMat;
    for (const bx of [-0.056, 0.056]) {
      const bustCup = new THREE.Mesh(new THREE.SphereGeometry(0.064, 16, 14), bustMat);
      bustCup.scale.set(1.02, 0.96, 0.88);
      bustCup.position.set(bx, 0.312, -0.072);
      upperBody.add(bustCup);
    }

    if (isSwimwear) {
      // Stylish Two-Piece Halter Bikini Top + Back Band + Center Clasp + Belly Chain
      const claspRing = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 8, 16), goldMat);
      claspRing.position.set(0, 0.312, -0.118);
      const backBand = new THREE.Mesh(new THREE.TorusGeometry(0.146, 0.011, 8, 24), swimAccentMat);
      backBand.rotation.x = Math.PI / 2;
      backBand.scale.set(1.16, 0.72, 1.0);
      backBand.position.set(0, 0.305, 0.004);
      const bellyChain = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.004, 8, 24), goldMat);
      bellyChain.rotation.x = Math.PI / 2;
      bellyChain.scale.set(1.16, 0.72, 1.0);
      bellyChain.position.set(0, 0.055, 0);

      for (const sx of [-1, 1]) {
        connectLimbSegment(
          upperBody,
          new THREE.Vector3(sx * 0.056, 0.355, -0.100),
          new THREE.Vector3(sx * 0.036, 0.475, -0.025),
          0.008, 0.007, swimAccentMat, 8
        );
        connectLimbSegment(
          upperBody,
          new THREE.Vector3(sx * 0.036, 0.475, -0.025),
          new THREE.Vector3(sx * 0.020, 0.460, 0.055),
          0.007, 0.007, swimAccentMat, 8
        );
      }
      upperBody.add(claspRing, backBand, bellyChain);
    } else {
      // Form-Fitting Cropped Female Spec-Ops Vest + Hydro Pack
      const cropVest = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.132, 0.26, 18), vestMat);
      cropVest.scale.set(1.18, 1.0, 0.76);
      cropVest.position.set(0, 0.31, 0);
      const frontPlate = extrudeSideProfile([
        [0.095, 0.19], [0.132, 0.21], [0.132, 0.39], [0.105, 0.43], [0.090, 0.43]
      ], torsoW - 0.09, 0.007, darkGearMat);
      const adminPatch = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.040, 0.014), accentTrim);
      adminPatch.position.set(0, 0.375, -0.136);
      for (const mx of [-0.072, 0, 0.072]) {
        const pouch = extrudeSideProfile([
          [0.115, 0.19], [0.155, 0.20], [0.155, 0.285], [0.115, 0.285]
        ], 0.054, 0.004, pouchMat);
        pouch.position.x = mx;
        upperBody.add(pouch);
      }
      const sleekPack = extrudeSideProfile([
        [-0.095, 0.16], [-0.185, 0.17], [-0.19, 0.40], [-0.15, 0.44], [-0.095, 0.43]
      ], 0.20, 0.010, pouchMat);
      backpackGroup.add(sleekPack);
      upperBody.add(cropVest, frontPlate, adminPatch);
    }
  } else {
    const torsoBaseMat = isSwimwear ? skinMat : clothMat;
    const maleTorsoPts = [
      new THREE.Vector2(0.001, -0.02),
      new THREE.Vector2(isHeavy ? 0.176 : 0.152, 0.01),
      new THREE.Vector2(isHeavy ? 0.185 : 0.158, 0.16),
      new THREE.Vector2(isHeavy ? 0.218 : 0.195, 0.36),
      new THREE.Vector2(isHeavy ? 0.220 : 0.196, 0.45),
      new THREE.Vector2(0.088, 0.50),
      new THREE.Vector2(0.001, 0.50)
    ];
    const torso = new THREE.Mesh(new THREE.LatheGeometry(maleTorsoPts, 18), torsoBaseMat);
    torso.scale.set(1.24, 1.0, 0.72);
    upperBody.add(torso);

    if (!isSwimwear) {
      const vest = new THREE.Mesh(
        new THREE.CylinderGeometry(isHeavy ? 0.232 : 0.204, isHeavy ? 0.202 : 0.180, 0.38, 16),
        vestMat
      );
      vest.scale.set(1.24, 1.0, 0.80);
      vest.position.set(0, 0.255, 0);

      const frontPlate = extrudeSideProfile([
        [0.125, 0.125], [0.162, 0.140], [0.162, 0.385], [0.130, 0.435], [0.115, 0.435]
      ], torsoW - 0.08, 0.008, darkGearMat);
      const adminPatch = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.052, 0.016), accentTrim);
      adminPatch.position.set(0, 0.37, -0.166);

      for (const sx of [-0.14, 0.14]) {
        const strapPad = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.16, 4, 8), pouchMat);
        strapPad.rotation.x = Math.PI / 2;
        strapPad.position.set(sx, 0.485, 0);
        upperBody.add(strapPad);
      }

      for (const mx of [-0.095, 0, 0.095]) {
        const pouch = extrudeSideProfile([
          [0.145, 0.095], [0.195, 0.105], [0.195, 0.220], [0.145, 0.225]
        ], 0.068, 0.005, pouchMat);
        pouch.position.x = mx;
        const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.036, 0.032), darkGearMat);
        magTop.position.set(mx, 0.235, -0.162);
        upperBody.add(pouch, magTop);
      }

      const chestGrenade = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.45 }));
      chestGrenade.position.set(0.145, 0.31, -0.15);
      const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.110, 0.044), darkGearMat);
      radioBox.position.set(-0.145, 0.37, -0.145);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.26, 6), steelMat);
      antenna.position.set(-0.155, 0.52, -0.14);

      const lBadge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.048, 0.15), accentTrim);
      lBadge.position.set(-(torsoW * 0.5 + 0.045), 0.44, 0);
      const rBadge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.048, 0.15), accentTrim);
      rBadge.position.set(torsoW * 0.5 + 0.045, 0.44, 0);

      const mainPack = extrudeSideProfile([
        [-0.12, 0.10], [-0.24, 0.11], [-0.25, 0.40], [-0.21, 0.45], [-0.12, 0.44]
      ], 0.26, 0.012, pouchMat);
      const lowerPack = extrudeSideProfile([
        [-0.22, 0.12], [-0.30, 0.13], [-0.30, 0.24], [-0.22, 0.25]
      ], 0.22, 0.008, vestMat);
      const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.27, 12), secMat);
      bedroll.rotation.z = Math.PI / 2;
      bedroll.position.set(0, 0.48, 0.19);
      backpackGroup.add(mainPack, lowerPack, bedroll);

      upperBody.add(vest, frontPlate, adminPatch, chestGrenade, radioBox, antenna, lBadge, rBadge);
    } else {
      // Male summer beach chest strap + dog tags
      const dogTag = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.032, 0.006), steelMat);
      dogTag.position.set(0, 0.34, -0.145);
      upperBody.add(dogTag);
    }
  }
  upperBody.add(backpackGroup);

  const c4Pack = createC4Mesh();
  c4Pack.position.set(0, 0.28, 0.27);
  c4Pack.rotation.x = Math.PI / 2;
  c4Pack.scale.setScalar(0.82);
  c4Pack.visible = false;
  upperBody.add(c4Pack);

  // 4. Sculpted Head, Expressive Facial Details, Hairstyles & Stylish Operator Gear
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.52, 0);
  upperBody.add(headGroup);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(isFemale ? 0.050 : 0.072, isFemale ? 0.062 : 0.092, 0.11, 14),
    isFemale || isSwimwear ? skinMat : darkGearMat
  );
  neck.position.set(0, 0.03, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(isFemale ? 0.114 : 0.122, 24, 18), skinMat);
  head.scale.set(isFemale ? 0.86 : 0.92, isFemale ? 1.04 : 1.08, isFemale ? 0.94 : 0.98);
  head.position.set(0, 0.165, 0);

  const isGhost = opCfg.helmetStyle === 'hood';
  const showFaceUnmasked = isFemale || isSwimwear;

  if (!showFaceUnmasked) {
    const balaclavaMat = new THREE.MeshStandardMaterial({
      map: getBalaclavaTexture(isGhost),
      roughness: 0.72
    });
    const balaclava = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.104, 0.115, 16), balaclavaMat);
    balaclava.scale.set(0.95, 1.0, 1.02);
    balaclava.position.set(0, 0.118, -0.004);
    balaclava.rotation.y = Math.PI;
    headGroup.add(balaclava);
  }

  const browMat = isFemale
    ? new THREE.MeshStandardMaterial({ color: opCfg.id === 'siren' ? '#926c2a' : '#231712', roughness: 0.65 })
    : skinMat;
  if (isFemale) {
    for (const sx of [-1, 1]) {
      const eyebrow = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.0055, 0.010), browMat);
      eyebrow.position.set(sx * 0.034, 0.204, -0.097);
      eyebrow.rotation.z = sx * -0.14;
      headGroup.add(eyebrow);
    }
  } else {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.016, 0.030), skinMat);
    brow.position.set(0, 0.204, -0.105);
    headGroup.add(brow);
  }

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(isFemale ? 0.014 : 0.020, isFemale ? 0.022 : 0.028, isFemale ? 0.018 : 0.026),
    skinMat
  );
  nose.position.set(0, 0.172, isFemale ? -0.105 : -0.116);

  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#f8fafc' });
  const irisMat = new THREE.MeshBasicMaterial({
    color: opCfg.id === 'aria' ? '#38bdf8' : (opCfg.id === 'siren' ? '#0ea5e9' : '#3b2416')
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
  const lashMat = new THREE.MeshBasicMaterial({ color: '#111827' });

  for (const ex of isFemale ? [-0.033, 0.033] : [-0.038, 0.038]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(isFemale ? 0.014 : 0.016, 10, 8), eyeWhiteMat);
    eye.scale.set(1.25, isFemale ? 0.72 : 0.65, 0.58);
    eye.position.set(ex, 0.184, isFemale ? -0.098 : -0.110);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 8), irisMat);
    iris.position.set(ex, 0.184, isFemale ? -0.104 : -0.116);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 6, 6), pupilMat);
    pupil.position.set(ex, 0.184, isFemale ? -0.106 : -0.118);
    headGroup.add(eye, iris, pupil);

    if (isFemale) {
      const lash = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0045, 0.008), lashMat);
      lash.position.set(ex, 0.193, -0.102);
      headGroup.add(lash);
    }
  }

  if (showFaceUnmasked) {
    const lipsMat = new THREE.MeshStandardMaterial({
      color: isFemale ? (opCfg.id === 'aria' ? '#ec4899' : '#e11d48') : '#b87664',
      roughness: 0.34,
      metalness: 0.08
    });
    const lips = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), lipsMat);
    lips.scale.set(1.75, 0.58, 0.62);
    lips.position.set(0, 0.120, isFemale ? -0.098 : -0.109);
    headGroup.add(lips);
  }

  if (!isFemale) {
    const earL = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.050, 0.042, 14), darkGearMat);
    earL.rotation.z = Math.PI / 2;
    earL.position.set(-0.122, 0.165, 0.01);
    const earR = earL.clone();
    earR.position.x = 0.122;
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.013, 8, 22, Math.PI), darkGearMat);
    headband.position.set(0, 0.175, 0.01);
    headGroup.add(earL, earR, headband);
  }
  headGroup.add(neck, head, nose);

  function buildFastHelmet(domeMat) {
    const hg = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.145, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), domeMat);
    dome.scale.set(0.96, 0.94, 1.06);
    dome.position.set(0, 0.195, 0.008);
    const rearShell = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.140, 0.075, 16, 1, false, -Math.PI * 0.42, Math.PI * 0.84), domeMat);
    rearShell.position.set(0, 0.165, 0.014);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.052, 0.022), darkGearMat);
    shroud.position.set(0, 0.228, -0.144);
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, 0.13), accentTrim);
    railL.position.set(-0.138, 0.205, -0.01);
    const railR = railL.clone();
    railR.position.x = 0.138;
    const batteryPack = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.048, 0.036), darkGearMat);
    batteryPack.position.set(0, 0.195, 0.154);
    hg.add(dome, rearShell, shroud, railL, railR, batteryPack);
    return hg;
  }

  function buildFemaleHairBase(hairMat) {
    const hg = new THREE.Group();
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.120, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    crown.scale.set(0.88, 1.04, 0.98);
    crown.position.set(0, 0.172, 0.008);
    const frontSwoop = new THREE.Mesh(new THREE.SphereGeometry(0.076, 14, 10), hairMat);
    frontSwoop.scale.set(1.38, 0.52, 0.65);
    frontSwoop.position.set(0.012, 0.238, -0.058);
    frontSwoop.rotation.z = -0.18;
    for (const sx of [-1, 1]) {
      const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.095, 6, 10), hairMat);
      sideLock.position.set(sx * 0.090, 0.168, -0.028);
      sideLock.rotation.z = sx * 0.18;
      sideLock.rotation.x = 0.24;
      const earStud = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, 6, 12), goldMat);
      earStud.rotation.y = Math.PI / 2;
      earStud.position.set(sx * 0.100, 0.145, 0.005);
      hg.add(sideLock, earStud);
    }
    hg.add(crown, frontSwoop);
    return hg;
  }

  if (opCfg.helmetStyle === 'beach_shades') {
    const blondeMat = new THREE.MeshStandardMaterial({ color: '#e6b85c', roughness: 0.42, metalness: 0.15 });
    const hair = buildFemaleHairBase(blondeMat);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 14), swimPrimaryMat);
    band.position.set(0, 0.185, 0.112);
    const tailUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.11, 8, 12), blondeMat);
    tailUpper.position.set(0, 0.125, 0.145);
    tailUpper.rotation.x = -0.45;
    const tailLower = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.16, 12), blondeMat);
    tailLower.rotation.x = Math.PI - 0.18;
    tailLower.position.set(0, -0.005, 0.168);

    // Stylish Reflective Aviator Sunglasses
    const lensMat = new THREE.MeshStandardMaterial({
      color: outCfg.accent || '#06b6d4',
      emissive: '#0891b2',
      emissiveIntensity: 0.25,
      metalness: 0.92,
      roughness: 0.08
    });
    for (const gx of [-0.035, 0.035]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.027, 0.007, 16), goldMat);
      rim.rotation.x = Math.PI / 2;
      rim.rotation.z = gx < 0 ? 0.10 : -0.10;
      rim.position.set(gx, 0.184, -0.106);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.009, 16), lensMat);
      glass.rotation.x = Math.PI / 2;
      glass.position.set(gx, 0.184, -0.106);
      headGroup.add(rim, glass);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.005, 0.006), goldMat);
    bridge.position.set(0, 0.194, -0.109);
    headGroup.add(hair, band, tailUpper, tailLower, bridge);
  } else if (opCfg.helmetStyle === 'cyber_twintails') {
    const violetHair = new THREE.MeshStandardMaterial({ color: '#1e1b4b', roughness: 0.38, metalness: 0.20 });
    const tipHair = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#0891b2', emissiveIntensity: 0.35, roughness: 0.35 });
    const hair = buildFemaleHairBase(violetHair);

    for (const sx of [-1, 1]) {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.006, 8, 14), accentTrim);
      tie.position.set(sx * 0.104, 0.202, 0.042);
      tie.rotation.y = sx * -0.5;
      connectLimbSegment(
        headGroup,
        new THREE.Vector3(sx * 0.106, 0.200, 0.045),
        new THREE.Vector3(sx * 0.145, 0.06, 0.095),
        0.024, 0.020, violetHair, 10
      );
      connectLimbSegment(
        headGroup,
        new THREE.Vector3(sx * 0.145, 0.06, 0.095),
        new THREE.Vector3(sx * 0.155, -0.09, 0.125),
        0.019, 0.008, tipHair, 10
      );
      headGroup.add(tie);
    }
    const cyberVisor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.114, 0.114, 0.040, 18, 1, true, Math.PI * 0.72, Math.PI * 0.56),
      new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.58, side: THREE.DoubleSide })
    );
    cyberVisor.position.set(0, 0.186, -0.006);
    const finL = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.042, 0.036), accentTrim);
    finL.position.set(-0.102, 0.258, 0.01);
    finL.rotation.z = 0.28;
    const finR = finL.clone();
    finR.position.x = 0.102;
    finR.rotation.z = -0.28;
    headGroup.add(hair, cyberVisor, finL, finR);
  } else if (opCfg.helmetStyle === 'visor' || opCfg.helmetStyle === 'heavy') {
    if (isHeavy) {
      const blastCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.215, 0.115, 18, 1, true), vestMat);
      blastCollar.position.set(0, 0.045, 0);
      const helm = buildFastHelmet(darkGearMat);
      helm.scale.setScalar(1.07);
      const faceShield = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.142, 0.145, 16, 1, false, Math.PI * 0.62, Math.PI * 0.76), vestMat);
      faceShield.position.set(0, 0.165, 0);
      const eyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.024, 0.042), accentTrim);
      eyeSlit.position.set(0, 0.184, -0.132);
      headGroup.add(blastCollar, helm, faceShield, eyeSlit);
    } else {
      const helm = buildFastHelmet(vestMat);
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.136, 0.134, 0.082, 18, 1, false, Math.PI * 0.66, Math.PI * 0.68),
        visorMat
      );
      visor.position.set(0, 0.182, -0.008);
      headGroup.add(helm, visor);
    }
  } else if (opCfg.helmetStyle === 'nvg') {
    const helm = buildFastHelmet(vestMat);
    const nvgBridge = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.028, 0.048), darkGearMat);
    nvgBridge.position.set(0, 0.215, -0.16);
    const nvgMat = new THREE.MeshBasicMaterial({ color: '#22c55e' });
    [-0.064, -0.022, 0.022, 0.064].forEach((nx) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.082, 12), darkGearMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(nx, 0.192, -0.178);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.015, 10), nvgMat);
      lens.rotation.y = Math.PI;
      lens.position.set(nx, 0.192, -0.220);
      headGroup.add(tube, lens);
    });
    headGroup.add(helm, nvgBridge);
  } else if (opCfg.helmetStyle === 'medic') {
    const whiteHelmMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.30, metalness: 0.20 });
    const helm = buildFastHelmet(whiteHelmMat);
    const medVisor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.136, 0.134, 0.068, 18, 1, false, Math.PI * 0.68, Math.PI * 0.64),
      visorMat
    );
    medVisor.position.set(0, 0.184, -0.008);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.018), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    crossH.position.set(0, 0.265, -0.140);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.075, 0.018), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    crossV.position.set(0, 0.265, -0.140);
    headGroup.add(helm, medVisor, crossH, crossV);
  } else if (opCfg.helmetStyle === 'hood') {
    const hoodDome = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.68), secMat);
    hoodDome.scale.set(0.98, 1.05, 1.06);
    hoodDome.position.set(0, 0.185, 0.012);
    const hoodCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.155, 0.13, 16), secMat);
    hoodCowl.position.set(0, 0.072, 0.015);
    const hoodBrim = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.032, 0.075), secMat);
    hoodBrim.position.set(0, 0.258, -0.105);
    hoodBrim.rotation.x = 0.26;
    const goggles = new THREE.Mesh(
      new THREE.CylinderGeometry(0.128, 0.128, 0.052, 16, 1, false, Math.PI * 0.72, Math.PI * 0.56),
      accentTrim
    );
    goggles.position.set(0, 0.184, -0.006);
    headGroup.add(hoodDome, hoodCowl, hoodBrim, goggles);
  } else {
    const brunetteMat = new THREE.MeshStandardMaterial({ color: '#3b2116', roughness: 0.55 });
    const hair = buildFemaleHairBase(brunetteMat);
    const hairBun = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), brunetteMat);
    hairBun.position.set(0, 0.142, 0.122);
    const beretCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.132, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.74 })
    );
    beretCrown.scale.set(1.06, 0.62, 1.06);
    beretCrown.position.set(0.018, 0.242, 0);
    beretCrown.rotation.z = -0.18;
    const beretBand = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.024, 16), darkGearMat);
    beretBand.position.set(0, 0.235, 0);
    beretBand.rotation.z = -0.08;
    const flashBadge = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.040, 0.014), goldMat);
    flashBadge.position.set(-0.042, 0.260, -0.114);
    headGroup.add(hair, hairBun, beretCrown, beretBand, flashBadge);
  }

  // 5. Seamlessly Connected Joint-Chain Arms
  const armsPivot = new THREE.Group();
  armsPivot.position.set(0, 0.42, 0);
  upperBody.add(armsPivot);

  const armUpperMat = isSwimwear ? skinMat : clothMat;
  const armForeMat = isSwimwear ? skinMat : (isFemale ? secMat : secMat);
  const armShoulderR = isFemale ? torsoW * 0.5 + 0.012 : torsoW * 0.5 + 0.04;

  const rShoulder = new THREE.Vector3(armShoulderR, 0.005, 0);
  const lShoulder = new THREE.Vector3(-armShoulderR, 0.005, 0);

  if (!isSwimwear) {
    const pauldronMat = isHeavy ? darkGearMat : vestMat;
    const rPauldron = new THREE.Mesh(new THREE.SphereGeometry(isFemale ? 0.056 : 0.092, 12, 10), pauldronMat);
    rPauldron.scale.set(0.84, 0.96, 1.08);
    rPauldron.position.copy(rShoulder);
    const lPauldron = rPauldron.clone();
    lPauldron.position.copy(lShoulder);
    armsPivot.add(rPauldron, lPauldron);
  } else {
    const rShoulderSkin = new THREE.Mesh(new THREE.SphereGeometry(isFemale ? 0.044 : 0.058, 12, 10), skinMat);
    rShoulderSkin.position.copy(rShoulder);
    const lShoulderSkin = rShoulderSkin.clone();
    lShoulderSkin.position.copy(lShoulder);
    armsPivot.add(rShoulderSkin, lShoulderSkin);
  }

  const rElbow = new THREE.Vector3(isFemale ? 0.19 : 0.24, -0.14, -0.12);
  const rHandPos = new THREE.Vector3(isFemale ? 0.10 : 0.12, -0.12, -0.20);
  const lElbow = new THREE.Vector3(isFemale ? -0.18 : -0.22, -0.14, -0.16);
  const lHandPos = new THREE.Vector3(isFemale ? 0.08 : 0.10, -0.07, -0.46);

  const uArmR = isFemale ? 0.044 : 0.062;
  const eArmR = isFemale ? 0.036 : 0.052;
  const wArmR = isFemale ? 0.028 : 0.042;
  connectLimbSegment(armsPivot, rShoulder, rElbow, uArmR, eArmR, armUpperMat);
  connectLimbSegment(armsPivot, rElbow, rHandPos, eArmR, wArmR, armForeMat);
  connectLimbSegment(armsPivot, lShoulder, lElbow, uArmR, eArmR, armUpperMat);
  connectLimbSegment(armsPivot, lElbow, lHandPos, eArmR, wArmR, armForeMat);

  const jointMat = isSwimwear ? skinMat : darkGearMat;
  const rElbowSphere = new THREE.Mesh(new THREE.SphereGeometry(eArmR * 0.96, 10, 8), jointMat);
  rElbowSphere.position.copy(rElbow);
  const lElbowSphere = new THREE.Mesh(new THREE.SphereGeometry(eArmR * 0.96, 10, 8), jointMat);
  lElbowSphere.position.copy(lElbow);

  const gloveColMat = isSwimwear ? skinMat : darkGearMat;
  const rGlove = new THREE.Mesh(new THREE.CapsuleGeometry(isFemale ? 0.026 : 0.032, 0.04, 6, 8), gloveColMat);
  rGlove.rotation.x = Math.PI / 2;
  rGlove.position.copy(rHandPos);
  const lGlove = rGlove.clone();
  lGlove.position.copy(lHandPos);

  if (isSwimwear) {
    const wristBangle = new THREE.Mesh(new THREE.CylinderGeometry(wArmR + 0.004, wArmR + 0.004, 0.016, 10), goldMat);
    wristBangle.rotation.x = Math.PI / 2;
    wristBangle.position.copy(lHandPos).add(new THREE.Vector3(-0.02, -0.01, 0.05));
    armsPivot.add(wristBangle);
  }

  const weaponMount = new THREE.Group();
  weaponMount.position.set(isFemale ? 0.10 : 0.12, -0.055, -0.30);
  const gunMesh = createWeaponModel(weaponId, skinId, attachments);
  gunMesh.scale.setScalar(0.95);
  weaponMount.add(gunMesh);

  armsPivot.add(
    rElbowSphere, lElbowSphere,
    rGlove, lGlove,
    weaponMount
  );

  const shieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.58, 1.88, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false })
  );
  shieldMesh.position.set(0, 0.94, 0);
  shieldMesh.visible = false;
  group.add(shieldMesh);

  const nameplate = makeNameplateSprite(name, team, isAlly);
  group.add(nameplate);

  bodyRoot.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    group,
    bodyRoot,
    hips,
    upperBody,
    headGroup,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    armsPivot,
    weaponMount,
    c4Pack,
    shieldMesh,
    nameplate,
    currentWeaponId: weaponId,
    walkPhase: Math.random() * Math.PI * 2,
    smoothSpeed: 0,
    crouchBlend: 0,
    deathProgress: 0,
    recoilKick: 0
  };
}

export function swapRigWeapon(rig, weaponId, skinId = 'default', attachments = {}) {
  if (!rig || rig.currentWeaponId === weaponId) return;
  rig.currentWeaponId = weaponId;
  while (rig.weaponMount.children.length > 0) {
    rig.weaponMount.remove(rig.weaponMount.children[0]);
  }
  const gunMesh = createWeaponModel(weaponId, skinId, attachments);
  gunMesh.scale.setScalar(0.95);
  rig.weaponMount.add(gunMesh);
}

export function animateOperatorRig(rig, state, dt, timeSec = 0) {
  if (!rig) return;
  const clampedDt = Math.min(0.05, dt);

  if (state.dead) {
    rig.deathProgress = Math.min(1, rig.deathProgress + clampedDt * 4.8);
    const ease = 1 - Math.pow(1 - rig.deathProgress, 2);
    rig.bodyRoot.rotation.x = -ease * (Math.PI * 0.47);
    rig.bodyRoot.position.y = ease * 0.14;
    rig.leftLeg.rotation.x *= 0.85;
    rig.rightLeg.rotation.x *= 0.85;
    if (rig.leftKnee) rig.leftKnee.rotation.x = ease * 0.35;
    if (rig.rightKnee) rig.rightKnee.rotation.x = ease * 0.18;
    rig.shieldMesh.visible = false;
    rig.nameplate.visible = false;
    return;
  }

  if (rig.deathProgress > 0) {
    rig.deathProgress = Math.max(0, rig.deathProgress - clampedDt * 7.0);
    rig.bodyRoot.rotation.x = -rig.deathProgress * (Math.PI * 0.47);
  }

  rig.nameplate.visible = state.showNameplate !== false;
  rig.c4Pack.visible = Boolean(state.hasBomb);
  rig.shieldMesh.visible = Boolean(state.shield);
  if (rig.shieldMesh.visible) rig.shieldMesh.rotation.y = timeSec * 2.5;

  const targetCrouch = state.crouch ? 1 : 0;
  rig.crouchBlend = (rig.crouchBlend || 0) + (targetCrouch - (rig.crouchBlend || 0)) * Math.min(1, 14 * clampedDt);
  const cb = rig.crouchBlend;

  rig.upperBody.position.y = 0.95 - cb * 0.34;
  if (rig.hips) rig.hips.position.y = 0.88 - cb * 0.30;
  rig.leftLeg.position.y = 0.84 - cb * 0.28;
  rig.rightLeg.position.y = 0.84 - cb * 0.28;

  const rawSpeed = state.moveSpeed || 0;
  rig.smoothSpeed = (rig.smoothSpeed || 0) + (rawSpeed - (rig.smoothSpeed || 0)) * Math.min(1, 12 * clampedDt);
  const moveFactor = Math.min(1, rig.smoothSpeed / 4.2);

  if (moveFactor > 0.04) {
    rig.walkPhase += clampedDt * (state.sprint ? 13.2 : 9.2) * Math.max(0.55, moveFactor);
    const p = rig.walkPhase;
    const maxAmp = state.crouch ? 0.38 : (state.sprint ? 0.72 : 0.54);
    const swing = Math.sin(p) * maxAmp * moveFactor;

    rig.leftLeg.rotation.x = swing - cb * 0.52;
    rig.rightLeg.rotation.x = -swing - cb * 0.52;

    const kneeAmp = (state.sprint ? 0.95 : 0.68) * moveFactor;
    const lKneeWalk = Math.max(0, -Math.cos(p)) * kneeAmp;
    const rKneeWalk = Math.max(0, Math.cos(p)) * kneeAmp;
    if (rig.leftKnee) rig.leftKnee.rotation.x = lKneeWalk + cb * 0.92;
    if (rig.rightKnee) rig.rightKnee.rotation.x = rKneeWalk + cb * 0.92;

    rig.bodyRoot.position.y = Math.abs(Math.cos(p)) * 0.036 * moveFactor;
    rig.upperBody.rotation.y = Math.sin(p) * 0.085 * moveFactor;
    rig.upperBody.rotation.x = (state.sprint ? 0.14 : 0.05) * moveFactor + cb * 0.14;
    if (rig.hips) rig.hips.rotation.y = -Math.sin(p) * 0.06 * moveFactor;
  } else {
    const breath = Math.sin(timeSec * 2.4) * 0.012;
    const restLeftHip = -cb * 0.58;
    const restRightHip = -cb * 0.38;
    const restLeftKnee = cb * 1.05;
    const restRightKnee = cb * 0.85;

    rig.leftLeg.rotation.x += (restLeftHip - rig.leftLeg.rotation.x) * Math.min(1, 12 * clampedDt);
    rig.rightLeg.rotation.x += (restRightHip - rig.rightLeg.rotation.x) * Math.min(1, 12 * clampedDt);
    if (rig.leftKnee) rig.leftKnee.rotation.x += (restLeftKnee - rig.leftKnee.rotation.x) * Math.min(1, 12 * clampedDt);
    if (rig.rightKnee) rig.rightKnee.rotation.x += (restRightKnee - rig.rightKnee.rotation.x) * Math.min(1, 12 * clampedDt);

    rig.bodyRoot.position.y += (breath - rig.bodyRoot.position.y) * Math.min(1, 10 * clampedDt);
    rig.upperBody.rotation.y += (0 - rig.upperBody.rotation.y) * Math.min(1, 10 * clampedDt);
    rig.upperBody.rotation.x += (cb * 0.14 - rig.upperBody.rotation.x) * Math.min(1, 10 * clampedDt);
    if (rig.hips) rig.hips.rotation.y += (0 - rig.hips.rotation.y) * Math.min(1, 10 * clampedDt);
  }

  if (state.victoryPose) {
    rig.upperBody.rotation.y = Math.sin(timeSec * 1.3) * 0.16;
    rig.armsPivot.rotation.x = 0.22 + Math.sin(timeSec * 2.1) * 0.045;
    rig.headGroup.rotation.y = Math.sin(timeSec * 0.95) * 0.22;
    rig.headGroup.rotation.x = Math.cos(timeSec * 1.4) * 0.05;
    return;
  }

  rig.recoilKick = Math.max(0, rig.recoilKick - clampedDt * 6.5);
  const pitch = state.pitch || 0;
  const walkArmBob = moveFactor > 0.04 ? Math.sin(rig.walkPhase * 2) * 0.025 * moveFactor : 0;
  rig.armsPivot.rotation.x = pitch * 0.85 + rig.recoilKick + walkArmBob;
  rig.headGroup.rotation.x = pitch * 0.55;
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
