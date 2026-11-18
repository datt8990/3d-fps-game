// AAA-Grade 3D Articulated Soldier Rigs (Multi-Jointed Knees/Elbows/Gear), 12 Detailed Weapons, FP Tactical Hands & Props
import * as THREE from 'three';
import { OUTFITS, OPERATORS, WEAPON_SKINS } from '/shared/constants.js';
import { getWeaponSkinTexture } from './textures.js';

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
    color: '#181b20',
    metalness: 0.82,
    roughness: 0.28
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.88,
    roughness: 0.22
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: skinId === 'default' && weaponId === 'ak47'
      ? '#6e3f1d'
      : (skinId === 'default' && weaponId === 'scarh' ? '#9a7b4f' : skin.woodOrGrip),
    metalness: 0.18,
    roughness: 0.62
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skin.accentColor,
    metalness: 0.68,
    roughness: 0.26
  });

  let magMesh = null;
  let boltMesh = null;
  let muzzleZ = -0.62;
  let sightMountY = 0.075;
  const isExt = attachments?.mag === 'extended';
  const isMelee = weaponId === 'knife' || weaponId === 'karambit';

  // Common Trigger Guard & Trigger for all firearms
  if (!isMelee) {
    const tGuard = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.032, 0.055), darkMetal);
    tGuard.position.set(0, -0.025, 0.055);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.012), steelMat);
    trigger.position.set(0, -0.018, 0.062);
    trigger.rotation.x = 0.35;
    boltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.065), steelMat);
    boltMesh.position.set(0.026, 0.038, 0.01);
    group.add(tGuard, trigger, boltMesh);
  }

  if (weaponId === 'ak47') {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.078, 0.29), bodyMat);
    rec.position.set(0, 0.02, 0.02);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.029, 0.25, 10), darkMetal);
    cover.rotation.x = Math.PI / 2;
    cover.position.set(0, 0.058, 0.03);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.088, 0.24), gripMat);
    stock.position.set(0, -0.008, 0.26);
    stock.rotation.x = 0.09;
    const buttPlate = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.092, 0.018), darkMetal);
    buttPlate.position.set(0, -0.018, 0.38);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.115, 0.052), gripMat);
    grip.position.set(0, -0.065, 0.11);
    grip.rotation.x = -0.26;
    const hgLower = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.044, 0.21), gripMat);
    hgLower.position.set(0, 0.012, -0.22);
    const hgUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.19, 10), gripMat);
    hgUpper.rotation.x = Math.PI / 2;
    hgUpper.position.set(0, 0.046, -0.21);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.38, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.45);
    const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 10), steelMat);
    gas.rotation.x = Math.PI / 2;
    gas.position.set(0, 0.052, -0.25);
    const fs = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.052, 0.026), darkMetal);
    fs.position.set(0, 0.056, -0.57);
    const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.045, 10), steelMat);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.set(0, 0.024, -0.63);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, isExt ? 0.21 : 0.175, 0.068), skinId === 'default' ? accentMat : bodyMat);
    magMesh.position.set(0, -0.095, -0.06);
    magMesh.rotation.x = 0.26;
    group.add(rec, cover, stock, buttPlate, grip, hgLower, hgUpper, barrel, gas, fs, muzzleBrake, magMesh);
    muzzleZ = -0.65;
    sightMountY = 0.082;
  } else if (weaponId === 'm4a1') {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.084, 0.27), bodyMat);
    rec.position.set(0, 0.022, 0.03);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.016, 0.45), darkMetal);
    rail.position.set(0, 0.070, -0.06);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 12), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.032, 0.24);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.108, 0.15), gripMat);
    stock.position.set(0, 0.012, 0.29);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.11, 0.05), gripMat);
    grip.position.set(0, -0.062, 0.11);
    grip.rotation.x = -0.24;
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.24, 12), accentMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.030, -0.21);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.011, 0.32, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.030, -0.44);
    const flashHider = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.013, 0.045, 10), steelMat);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.030, -0.59);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.038, isExt ? 0.195 : 0.155, 0.062), darkMetal);
    magMesh.position.set(0, -0.082, -0.035);
    magMesh.rotation.x = 0.08;
    group.add(rec, rail, tube, stock, grip, shroud, barrel, flashHider, magMesh);
    muzzleZ = -0.61;
    sightMountY = 0.082;
  } else if (weaponId === 'scarh') {
    const scarUpper = new THREE.Mesh(
      new THREE.BoxGeometry(0.062, 0.092, 0.48),
      skinId === 'default' ? new THREE.MeshStandardMaterial({ color: '#b5945b', roughness: 0.42, metalness: 0.45 }) : bodyMat
    );
    scarUpper.position.set(0, 0.035, -0.08);
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.46), darkMetal);
    topRail.position.set(0, 0.086, -0.08);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.052, 0.24), gripMat);
    lower.position.set(0, -0.02, 0.04);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.125, 0.24), gripMat);
    stock.position.set(0, 0.015, 0.28);
    const cheekRest = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.035, 0.18), darkMetal);
    cheekRest.position.set(0, 0.072, 0.26);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.115, 0.05), darkMetal);
    grip.position.set(0, -0.068, 0.11);
    grip.rotation.x = -0.22;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.32, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.45);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, isExt ? 0.19 : 0.15, 0.075), steelMat);
    magMesh.position.set(0, -0.095, -0.04);
    group.add(scarUpper, topRail, lower, stock, cheekRest, grip, barrel, magMesh);
    muzzleZ = -0.62;
    sightMountY = 0.092;
  } else if (weaponId === 'mp5') {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.078, 0.25), bodyMat);
    rec.position.set(0, 0.025, 0.02);
    const sdShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.32, 16), darkMetal);
    sdShroud.rotation.x = Math.PI / 2;
    sdShroud.position.set(0, 0.028, -0.25);
    const stockBar = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.032, 0.20), darkMetal);
    stockBar.position.set(0, 0.025, 0.22);
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.10, 0.03), gripMat);
    butt.position.set(0, 0.005, 0.32);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.11, 0.048), gripMat);
    grip.position.set(0, -0.058, 0.08);
    grip.rotation.x = -0.2;

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.028, isExt ? 0.20 : 0.165, 0.042), accentMat);
    magMesh.position.set(0, -0.09, -0.05);
    magMesh.rotation.x = 0.22;
    group.add(rec, sdShroud, stockBar, butt, grip, magMesh);
    muzzleZ = -0.43;
    sightMountY = 0.072;
  } else if (weaponId === 'p90') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.115, 0.44), bodyMat);
    chassis.position.set(0, 0.005, 0.04);
    const frontBridge = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.085, 0.12), gripMat);
    frontBridge.position.set(0, -0.015, -0.20);
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.042, 0.16), darkMetal);
    topRail.position.set(0, 0.092, -0.14);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.12, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.30);

    magMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.050, 0.026, 0.29),
      new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.22, metalness: 0.45, transparent: true, opacity: 0.88 })
    );
    magMesh.position.set(0, 0.076, 0.08);
    group.add(chassis, frontBridge, topRail, barrel, magMesh);
    muzzleZ = -0.37;
    sightMountY = 0.118;
  } else if (weaponId === 'spas12') {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.082, 0.28), bodyMat);
    rec.position.set(0, 0.022, 0.04);
    const heatShield = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.42), steelMat);
    heatShield.position.set(0, 0.052, -0.30);
    const topBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 12), darkMetal);
    topBarrel.rotation.x = Math.PI / 2;
    topBarrel.position.set(0, 0.042, -0.35);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.46, 12), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.012, -0.32);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.050, 0.21), gripMat);
    pump.position.set(0, 0.005, -0.26);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.095, 0.24), gripMat);
    stock.position.set(0, -0.005, 0.27);
    stock.rotation.x = 0.12;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.11, 0.05), darkMetal);
    grip.position.set(0, -0.062, 0.12);
    grip.rotation.x = -0.24;

    magMesh = pump;
    group.add(rec, heatShield, topBarrel, magTube, pump, stock, grip);
    muzzleZ = -0.62;
    sightMountY = 0.072;
  } else if (weaponId === 'awp' || weaponId === 'barrett') {
    const isBarrett = weaponId === 'barrett';
    const defaultMat = new THREE.MeshStandardMaterial({
      color: isBarrett ? '#334155' : '#2d4c2b',
      roughness: 0.45,
      metalness: isBarrett ? 0.68 : 0.28
    });
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(isBarrett ? 0.072 : 0.062, isBarrett ? 0.098 : 0.088, isBarrett ? 0.56 : 0.48),
      skinId === 'default' ? defaultMat : bodyMat
    );
    chassis.position.set(0, 0.014, -0.04);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.115, 0.28), skinId === 'default' ? defaultMat : bodyMat);
    stock.position.set(0, 0.004, 0.32);
    const cheekPad = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.035, 0.15), darkMetal);
    cheekPad.position.set(0, 0.065, 0.28);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(isBarrett ? 0.016 : 0.013, 0.019, isBarrett ? 0.68 : 0.62, 14), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, -0.58);

    // Folding Bipod under front chassis
    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 8), darkMetal);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.028, -0.025, -0.36);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.028;

    const brake = new THREE.Mesh(
      new THREE.BoxGeometry(isBarrett ? 0.058 : 0.036, isBarrett ? 0.040 : 0.030, isBarrett ? 0.098 : 0.068),
      isBarrett ? accentMat : darkMetal
    );
    brake.position.set(0, 0.038, isBarrett ? -0.94 : -0.86);

    const scopeGroup = new THREE.Group();
    const mountF = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.035, 0.025), darkMetal);
    mountF.position.set(0, -0.022, -0.08);
    const mountR = mountF.clone();
    mountR.position.z = 0.08;
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.32, 16), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.020, 0.085, 16), darkMetal);
    bellFront.rotation.x = Math.PI / 2;
    bellFront.position.z = -0.17;
    const bellRear = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.027, 0.065, 16), darkMetal);
    bellRear.rotation.x = Math.PI / 2;
    bellRear.position.z = 0.16;
    const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.028, 10), steelMat);
    turretTop.position.set(0, 0.025, 0);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: isBarrett ? '#ef4444' : '#38bdf8' }));
    lens.position.z = 0.194;
    scopeGroup.add(mountF, mountR, scopeTube, bellFront, bellRear, turretTop, lens);
    scopeGroup.position.set(0, 0.105, 0.01);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.046, isBarrett ? 0.13 : 0.095, isBarrett ? 0.13 : 0.095), darkMetal);
    magMesh.position.set(0, -0.072, -0.04);
    if (isBarrett) magMesh.rotation.x = 0.12;

    group.add(chassis, stock, cheekPad, barrel, bipodL, bipodR, brake, scopeGroup, magMesh);
    muzzleZ = isBarrett ? -0.98 : -0.90;
    sightMountY = 0.10;
  } else if (weaponId === 'deagle' || weaponId === 'usps') {
    const isUsp = weaponId === 'usps';
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: isUsp ? '#334155' : '#cbd5e1', metalness: 0.88, roughness: 0.20 })
      : bodyMat;
    const slide = new THREE.Mesh(new THREE.BoxGeometry(isUsp ? 0.038 : 0.044, isUsp ? 0.042 : 0.052, isUsp ? 0.20 : 0.24), slideMat);
    slide.position.set(0, 0.035, -0.04);
    boltMesh = slide;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.026, 0.19), darkMetal);
    frame.position.set(0, 0.004, -0.02);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.11, 0.052), gripMat);
    grip.position.set(0, -0.055, 0.045);
    grip.rotation.x = -0.22;

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.10, 0.042), darkMetal);
    magMesh.position.set(0, -0.058, 0.045);
    magMesh.rotation.x = -0.22;
    group.add(slide, frame, grip, magMesh);
    muzzleZ = -0.16;

    if (isUsp) {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 14), darkMetal);
      sup.rotation.x = Math.PI / 2;
      sup.position.set(0, 0.035, -0.22);
      group.add(sup);
      muzzleZ = -0.31;
    }
    sightMountY = 0.065;
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
      ring.position.set(0, -0.03, 0.10);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.038, 0.11), gripMat);
      handle.position.set(0, -0.01, 0.03);
      handle.rotation.x = 0.25;
      const claw1 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.036, 0.11), bladeMat);
      claw1.position.set(0, 0.012, -0.06);
      claw1.rotation.x = -0.25;
      const clawTip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.028, 0.095), bladeMat);
      clawTip.position.set(0, -0.018, -0.13);
      clawTip.rotation.x = -0.68;
      group.add(ring, handle, claw1, clawTip);
    } else {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.13, 12), gripMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, 0.05);
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 10), darkMetal);
      pommel.position.set(0, 0, 0.12);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.078, 0.016), darkMetal);
      guard.position.set(0, 0, -0.018);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.038, 0.22), bladeMat);
      blade.position.set(0, 0.004, -0.13);
      group.add(handle, pommel, guard, blade);
    }
    muzzleZ = -0.24;
  }

  // Mount Optic & Muzzle Attachments
  const isSniper = weaponId === 'awp' || weaponId === 'barrett';
  if (!isSniper && !isMelee) {
    const optic = attachments?.optic || 'iron';
    if (optic === 'reddot') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.065), darkMetal);
      base.position.set(0, sightMountY, 0.01);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.036, 0.048), darkMetal);
      hood.position.set(0, sightMountY + 0.022, 0.01);
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(0.032, 0.026),
        new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.22, side: THREE.DoubleSide })
      );
      glass.position.set(0, sightMountY + 0.022, 0.01);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 8), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
      dot.position.set(0, sightMountY + 0.022, 0.01);
      group.add(base, hood, glass, dot);
    } else if (optic === 'acog') {
      const acog = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.14, 14), darkMetal);
      acog.rotation.x = Math.PI / 2;
      acog.position.set(0, sightMountY + 0.020, 0.01);
      const fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 8), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
      fiber.rotation.x = Math.PI / 2;
      fiber.position.set(0, sightMountY + 0.040, 0.0);
      group.add(acog, fiber);
    }

    const muzzle = attachments?.muzzle || 'none';
    if (muzzle === 'suppressor' && weaponId !== 'mp5' && weaponId !== 'usps') {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.17, 14), darkMetal);
      sup.rotation.x = Math.PI / 2;
      sup.position.set(0, 0.03, muzzleZ - 0.07);
      group.add(sup);
      muzzleZ -= 0.15;
    } else if (muzzle === 'compensator') {
      const comp = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.055), accentMat);
      comp.position.set(0, 0.03, muzzleZ - 0.02);
      group.add(comp);
      muzzleZ -= 0.04;
    }
  }

  group.userData = {
    weaponId,
    magMesh,
    magBasePos: magMesh ? magMesh.position.clone() : null,
    boltMesh,
    boltBaseZ: boltMesh ? boltMesh.position.z : 0,
    muzzlePos: new THREE.Vector3(0, 0.032, muzzleZ)
  };
  return group;
}

export function createFirstPersonRig(weaponId, skinId, attachments, outfitId = 'urban') {
  const root = new THREE.Group();
  const outfit = OUTFITS[outfitId] || OUTFITS.urban;
  const gun = createWeaponModel(weaponId, skinId, attachments);

  const sleeveMat = new THREE.MeshStandardMaterial({ color: outfit.primary, roughness: 0.72 });
  const cuffMat = new THREE.MeshStandardMaterial({ color: outfit.secondary, roughness: 0.65 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.48, metalness: 0.22 });
  const knuckleMat = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.28, metalness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: outfit.skinTone || '#d6a781', roughness: 0.60 });

  // Right Arm + Tactical Glove + Knuckle Guard + Wrapped Fingers
  const rArmGroup = new THREE.Group();
  const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.34, 12), sleeveMat);
  rSleeve.rotation.x = Math.PI / 2;
  rSleeve.position.set(0.08, -0.11, 0.25);
  rSleeve.rotation.y = -0.18;
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.062, 0.088), gloveMat);
  rHand.position.set(0.015, -0.064, 0.095);
  const rKnuckle = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.018, 0.042), knuckleMat);
  rKnuckle.position.set(0.015, -0.032, 0.085);
  rArmGroup.add(rSleeve, rHand, rKnuckle);

  // Left Arm + Glowing Tactical GPS Watch + Hard-Knuckle Glove + Thumb Grip
  const isShort = ['deagle', 'usps', 'knife', 'karambit'].includes(weaponId);
  const lArmGroup = new THREE.Group();
  const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.043, 0.38, 12), sleeveMat);
  lSleeve.rotation.x = Math.PI / 2;
  lSleeve.position.set(-0.11, -0.10, isShort ? 0.16 : 0.02);
  lSleeve.rotation.y = isShort ? 0.35 : 0.32;

  const lCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.045, 12), cuffMat);
  lCuff.rotation.x = Math.PI / 2;
  lCuff.position.set(-0.045, -0.062, isShort ? 0.06 : -0.11);
  lCuff.rotation.y = 0.32;

  // Tactical Digital Watch on left wrist
  const watchBand = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.024, 12), knuckleMat);
  watchBand.rotation.x = Math.PI / 2;
  watchBand.position.set(-0.032, -0.052, isShort ? 0.04 : -0.14);
  const watchScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.012, 0.028),
    new THREE.MeshBasicMaterial({ color: '#38bdf8' })
  );
  watchScreen.position.set(-0.022, -0.022, isShort ? 0.04 : -0.14);

  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.056, 0.088), gloveMat);
  lHand.position.set(-0.012, -0.032, isShort ? 0.02 : -0.19);
  const lThumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.045), skinMat);
  lThumb.position.set(-0.022, 0.002, isShort ? 0.01 : -0.19);
  lThumb.rotation.z = -0.45;
  lArmGroup.add(lSleeve, lCuff, watchBand, watchScreen, lHand, lThumb);

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
  sprite.position.set(0, 2.12, 0);
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
  const teamGlowColor = team === 'alpha' ? '#0ea5e9' : (team === 'bravo' ? '#f97316' : (isAlly ? '#10b981' : '#ef4444'));

  const clothMat = new THREE.MeshStandardMaterial({ color: outCfg.primary, roughness: 0.74 });
  const secMat = new THREE.MeshStandardMaterial({ color: outCfg.secondary, roughness: 0.66 });
  const vestMat = new THREE.MeshStandardMaterial({ color: outCfg.vest, roughness: 0.50, metalness: 0.34 });
  const pouchMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.62, metalness: 0.25 });
  const skinMat = new THREE.MeshStandardMaterial({ color: outCfg.skinTone, roughness: 0.58 });
  const accentTrim = new THREE.MeshStandardMaterial({
    color: outCfg.accent || teamGlowColor,
    emissive: teamGlowColor,
    emissiveIntensity: 0.48,
    roughness: 0.28
  });
  const darkGearMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.55, metalness: 0.35 });
  const visorMat = new THREE.MeshStandardMaterial({ color: '#0ea5e9', metalness: 0.92, roughness: 0.10 });

  // 1. Articulated Pelvis & Tactical War-Belt (Holster + Pouches)
  const hips = new THREE.Group();
  hips.position.set(0, 0.88, 0);
  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(isHeavy ? 0.44 : 0.39, 0.16, 0.25), secMat);
  const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(isHeavy ? 0.46 : 0.41, 0.065, 0.27), darkGearMat);
  beltMesh.position.y = 0.05;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.068, 0.02), accentTrim);
  buckle.position.set(0, 0.05, -0.14);
  const rearPouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.08), pouchMat);
  rearPouch.position.set(0, 0.04, 0.16);
  hips.add(pelvisMesh, beltMesh, buckle, rearPouch);
  bodyRoot.add(hips);

  // 2. Multi-Jointed Articulated Legs (Hip Pivot -> Sculpted Thigh + Holster -> Knee Pivot -> KneePad + Shin + Combat Boot)
  function makeArticulatedLeg(sideX, isRight) {
    const legPivot = new THREE.Group();
    legPivot.position.set(sideX, 0.84, 0);

    // Sculpted cylindrical thigh
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.076, 0.40, 12), clothMat);
    thigh.position.set(0, -0.20, 0);
    legPivot.add(thigh);

    // Tactical drop-leg holster (right) & utility mag pouch (left)
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.091, 0.089, 0.04, 12), darkGearMat);
    strap.position.set(0, -0.19, 0);
    const thighGear = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, isRight ? 0.16 : 0.13, isRight ? 0.11 : 0.13),
      darkGearMat
    );
    thighGear.position.set(isRight ? 0.085 : -0.085, -0.19, 0);
    legPivot.add(strap, thighGear);

    // Articulated Knee Joint Pivot!
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.40, 0);
    legPivot.add(kneePivot);

    // Contoured 3D Knee Pad
    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.105, 0.12), darkGearMat);
    kneePad.position.set(0, 0.0, -0.045);
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), vestMat);
    kneeCap.scale.set(1.1, 0.9, 0.55);
    kneeCap.position.set(0, 0.0, -0.095);

    // Tapered Shin
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.062, 0.36, 12), secMat);
    shin.position.set(0, -0.19, 0);

    // Combat Boot (Ankle collar + Heel + Rugged Sole + Toe Cap)
    const bootAnkle = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.11, 10), darkGearMat);
    bootAnkle.position.set(0, -0.35, 0);
    const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.095, 0.245), darkGearMat);
    bootFoot.position.set(0, -0.395, -0.038);
    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.032, 0.258), pouchMat);
    bootSole.position.set(0, -0.428, -0.038);

    kneePivot.add(kneePad, kneeCap, shin, bootAnkle, bootFoot, bootSole);
    return { legPivot, kneePivot };
  }

  const leftLegData = makeArticulatedLeg(-0.118, false);
  const rightLegData = makeArticulatedLeg(0.118, true);
  const leftLeg = leftLegData.legPivot;
  const rightLeg = rightLegData.legPivot;
  const leftKnee = leftLegData.kneePivot;
  const rightKnee = rightLegData.kneePivot;
  bodyRoot.add(leftLeg, rightLeg);

  // 3. Upper Body, Plate Carrier, Pouches, Radio & Tactical Backpack
  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.95, 0);
  bodyRoot.add(upperBody);

  const torsoW = isHeavy ? 0.48 : 0.42;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, 0.50, 0.24), clothMat);
  torso.position.set(0, 0.25, 0);

  // Contoured Ballistic Plate Carrier
  const vest = new THREE.Mesh(new THREE.BoxGeometry(torsoW + 0.03, 0.38, 0.285), vestMat);
  vest.position.set(0, 0.26, 0);
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(torsoW - 0.06, 0.28, 0.04), darkGearMat);
  chestPlate.position.set(0, 0.28, -0.14);

  // 3x Front STANAG Magazine Pouches on Plate Carrier
  for (const mx of [-0.10, 0, 0.10]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.055), pouchMat);
    pouch.position.set(mx, 0.16, -0.155);
    const magTop = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.035), darkGearMat);
    magTop.position.set(mx, 0.235, -0.155);
    upperBody.add(pouch, magTop);
  }

  // Tactical VHF Radio + Whip Antenna on Left Chest
  const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.11, 0.045), darkGearMat);
  radioBox.position.set(-0.13, 0.38, -0.15);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.24, 6), darkGearMat);
  antenna.position.set(-0.145, 0.52, -0.14);
  upperBody.add(radioBox, antenna);

  // Team IFF Glowing Shoulder Strobe Badges
  const lBadge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.22), accentTrim);
  lBadge.position.set(-(torsoW * 0.5 + 0.025), 0.45, 0);
  const rBadge = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.22), accentTrim);
  rBadge.position.set(torsoW * 0.5 + 0.025, 0.45, 0);

  // 3D Tactical Assault Backpack
  const backpackGroup = new THREE.Group();
  backpackGroup.position.set(0, 0.28, 0.19);
  const mainPack = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.34, 0.13), pouchMat);
  const lowerPack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.06), vestMat);
  lowerPack.position.set(0, -0.08, 0.08);
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10), secMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.19, 0.02);
  backpackGroup.add(mainPack, lowerPack, bedroll);
  upperBody.add(torso, vest, chestPlate, lBadge, rBadge, backpackGroup);

  const c4Pack = createC4Mesh();
  c4Pack.position.set(0, 0.28, 0.27);
  c4Pack.rotation.x = Math.PI / 2;
  c4Pack.scale.setScalar(0.82);
  c4Pack.visible = false;
  upperBody.add(c4Pack);

  // 4. Sculpted Neck, Head, Balaclava, Comms Headset & Signature Operator Helmet
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.52, 0);
  upperBody.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.10, 10), darkGearMat);
  neck.position.set(0, 0.03, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.23), skinMat);
  head.position.set(0, 0.15, 0);
  // Tactical lower-face balaclava mask
  const balaclava = new THREE.Mesh(new THREE.BoxGeometry(0.226, 0.125, 0.236), darkGearMat);
  balaclava.position.set(0, 0.095, -0.002);
  // Peltor Tactical Comms Earcups + Boom Mic
  const earL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), darkGearMat);
  earL.rotation.z = Math.PI / 2;
  earL.position.set(-0.125, 0.15, 0.01);
  const earR = earL.clone();
  earR.position.x = 0.125;
  headGroup.add(neck, head, balaclava, earL, earR);

  if (opCfg.helmetStyle === 'visor' || opCfg.helmetStyle === 'heavy') {
    if (isHeavy) {
      // Juggernaut Blast Collar + Heavy Armored EOD Helmet
      const blastCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.11, 12, 1, true), vestMat);
      blastCollar.position.set(0, 0.05, 0);
      headGroup.add(blastCollar);
    }
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.175, 0.285), isHeavy ? darkGearMat : vestMat);
    helm.position.set(0, 0.22, 0.01);
    const sideRailL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.035, 0.16), accentTrim);
    sideRailL.position.set(-0.142, 0.20, -0.01);
    const sideRailR = sideRailL.clone();
    sideRailR.position.x = 0.142;
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.252, isHeavy ? 0.11 : 0.088, 0.045),
      isHeavy ? darkGearMat : visorMat
    );
    visor.position.set(0, 0.17, -0.125);
    if (isHeavy) {
      const eyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.025, 0.052), accentTrim);
      eyeSlit.position.set(0, 0.175, -0.128);
      headGroup.add(eyeSlit);
    }
    headGroup.add(helm, sideRailL, sideRailR, visor);
  } else if (opCfg.helmetStyle === 'nvg') {
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, 0.245), darkGearMat);
    mask.position.set(0, 0.15, 0);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.15, 0.28), vestMat);
    helm.position.set(0, 0.23, 0.01);
    const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.045, 0.05), darkGearMat);
    nvgMount.position.set(0, 0.19, -0.14);
    const nvgMat = new THREE.MeshBasicMaterial({ color: '#22c55e' });
    [-0.068, -0.024, 0.024, 0.068].forEach((nx) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.075, 10), darkGearMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(nx, 0.175, -0.155);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 10), nvgMat);
      lens.rotation.y = Math.PI;
      lens.position.set(nx, 0.175, -0.194);
      headGroup.add(tube, lens);
    });
    headGroup.add(mask, helm, nvgMount);
  } else if (opCfg.helmetStyle === 'medic') {
    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(0.275, 0.165, 0.28),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 })
    );
    helm.position.set(0, 0.22, 0.01);
    const medVisor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.075, 0.035), visorMat);
    medVisor.position.set(0, 0.165, -0.122);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.026, 0.02), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    crossH.position.set(0, 0.23, -0.135);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    crossV.position.set(0, 0.23, -0.135);
    headGroup.add(helm, medVisor, crossH, crossV);
  } else if (opCfg.helmetStyle === 'hood') {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.265, 0.27, 0.27), secMat);
    hood.position.set(0, 0.16, 0.01);
    const hoodBrim = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.045, 0.08), secMat);
    hoodBrim.position.set(0, 0.265, -0.11);
    hoodBrim.rotation.x = 0.25;
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.068, 0.045), accentTrim);
    goggles.position.set(0, 0.17, -0.122);
    headGroup.add(hood, hoodBrim, goggles);
  } else {
    // Special Forces Slanted Crimson Beret + Tactical Sunglasses
    const beret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.13, 0.075, 14),
      new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.72 })
    );
    beret.position.set(0.018, 0.265, 0);
    beret.rotation.z = -0.16;
    const flashBadge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.015), new THREE.MeshBasicMaterial({ color: '#facc15' }));
    flashBadge.position.set(-0.04, 0.265, -0.132);
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.035), darkGearMat);
    glasses.position.set(0, 0.17, -0.118);
    headGroup.add(beret, flashBadge, glasses);
  }

  // 5. Articulated 2-Segment Tactical Arms (Pauldrons + Upper Arm + Elbow Pad + Forearm + Gloved Hands + Weapon Mount)
  const armsPivot = new THREE.Group();
  armsPivot.position.set(0, 0.42, 0);
  upperBody.add(armsPivot);

  const pauldronMat = isHeavy ? darkGearMat : vestMat;
  const rPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.16), pauldronMat);
  rPauldron.position.set(torsoW * 0.5 + 0.04, 0.01, 0);
  const lPauldron = rPauldron.clone();
  lPauldron.position.x = -(torsoW * 0.5 + 0.04);

  const rUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.055, 0.26, 10), clothMat);
  rUpperArm.rotation.x = Math.PI / 2 - 0.35;
  rUpperArm.rotation.z = -0.18;
  rUpperArm.position.set(0.25, -0.05, -0.08);

  const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.046, 0.26, 10), secMat);
  rForearm.rotation.x = Math.PI / 2;
  rForearm.rotation.y = 0.28;
  rForearm.position.set(0.21, -0.09, -0.24);

  const lUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.055, 0.28, 10), clothMat);
  lUpperArm.rotation.x = Math.PI / 2 - 0.30;
  lUpperArm.rotation.z = 0.26;
  lUpperArm.position.set(-0.24, -0.05, -0.10);

  const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.046, 0.28, 10), secMat);
  lForearm.rotation.x = Math.PI / 2;
  lForearm.rotation.y = -0.46;
  lForearm.position.set(-0.11, -0.08, -0.28);

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.12, -0.06, -0.28);
  const gunMesh = createWeaponModel(weaponId, skinId, attachments);
  gunMesh.scale.setScalar(0.95);
  weaponMount.add(gunMesh);

  armsPivot.add(rPauldron, lPauldron, rUpperArm, rForearm, lUpperArm, lForearm, weaponMount);

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

  // 1. Multi-joint dramatic death fall animation (lies flat on floor without clipping underground)
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

  // 2. Smooth Articulated Crouch / Kneel Blend (Hip + Knee flexion keeps boots grounded!)
  const targetCrouch = state.crouch ? 1 : 0;
  rig.crouchBlend = (rig.crouchBlend || 0) + (targetCrouch - (rig.crouchBlend || 0)) * Math.min(1, 14 * clampedDt);
  const cb = rig.crouchBlend;

  rig.upperBody.position.y = 0.95 - cb * 0.34;
  if (rig.hips) rig.hips.position.y = 0.88 - cb * 0.30;
  rig.leftLeg.position.y = 0.84 - cb * 0.28;
  rig.rightLeg.position.y = 0.84 - cb * 0.28;

  // 3. Biomechanical Walk & Sprint Stride (Hip Swing + Dynamic Knee Bend + Torso Counter-Twist!)
  const rawSpeed = state.moveSpeed || 0;
  rig.smoothSpeed = (rig.smoothSpeed || 0) + (rawSpeed - (rig.smoothSpeed || 0)) * Math.min(1, 12 * clampedDt);
  const moveFactor = Math.min(1, rig.smoothSpeed / 4.2);

  if (moveFactor > 0.04) {
    rig.walkPhase += clampedDt * (state.sprint ? 13.2 : 9.2) * Math.max(0.55, moveFactor);
    const p = rig.walkPhase;
    const maxAmp = state.crouch ? 0.38 : (state.sprint ? 0.72 : 0.54);
    const swing = Math.sin(p) * maxAmp * moveFactor;

    // Hip flexion + crouch bias
    rig.leftLeg.rotation.x = swing - cb * 0.52;
    rig.rightLeg.rotation.x = -swing - cb * 0.52;

    // Knee bends naturally during leg lift/recovery phase + deep bend when crouched!
    const kneeAmp = (state.sprint ? 0.95 : 0.68) * moveFactor;
    const lKneeWalk = Math.max(0, -Math.cos(p)) * kneeAmp;
    const rKneeWalk = Math.max(0, Math.cos(p)) * kneeAmp;
    if (rig.leftKnee) rig.leftKnee.rotation.x = lKneeWalk + cb * 0.92;
    if (rig.rightKnee) rig.rightKnee.rotation.x = rKneeWalk + cb * 0.92;

    // Vertical stride bounce & torso lean/counter-twist
    rig.bodyRoot.position.y = Math.abs(Math.cos(p)) * 0.036 * moveFactor;
    rig.upperBody.rotation.y = Math.sin(p) * 0.085 * moveFactor;
    rig.upperBody.rotation.x = (state.sprint ? 0.14 : 0.05) * moveFactor + cb * 0.14;
    if (rig.hips) rig.hips.rotation.y = -Math.sin(p) * 0.06 * moveFactor;
  } else {
    // Tactical Idle Stance with subtle chest breathing & knee crouch articulation
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

  // 4. Lobby / Victory Showcase Pose
  if (state.victoryPose) {
    rig.upperBody.rotation.y = Math.sin(timeSec * 1.3) * 0.16;
    rig.armsPivot.rotation.x = 0.22 + Math.sin(timeSec * 2.1) * 0.045;
    rig.headGroup.rotation.y = Math.sin(timeSec * 0.95) * 0.22;
    rig.headGroup.rotation.x = Math.cos(timeSec * 1.4) * 0.05;
    return;
  }

  // 5. Combat Aim Pitch & Gunfire Recoil Kick
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
  // Twin C4 Explosive Bricks + Black Duct Tape Straps
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.24), brickMat);
  b1.position.x = -0.082;
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.24), brickMat);
  b2.position.x = 0.082;
  const strap1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.118, 0.035), tapeMat);
  strap1.position.z = -0.06;
  const strap2 = strap1.clone();
  strap2.position.z = 0.06;
  // Digital Keypad & Glowing Red Timer Display
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
