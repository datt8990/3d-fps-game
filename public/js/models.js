// 3D Articulated Soldier Rigs (6 Operators), 12 Detailed Weapons, Frag Grenade & C4 Models
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
    metalness: 0.78,
    roughness: 0.32
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: skinId === 'default' && weaponId === 'ak47'
      ? '#6e3f1d'
      : (skinId === 'default' && weaponId === 'scarh' ? '#9a7b4f' : skin.woodOrGrip),
    metalness: 0.22,
    roughness: 0.65
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: skin.accentColor,
    metalness: 0.62,
    roughness: 0.30
  });

  let magMesh = null;
  let boltMesh = null;
  let muzzleZ = -0.62;
  let sightMountY = 0.075;
  const isExt = attachments?.mag === 'extended';

  if (weaponId === 'ak47') {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.078, 0.29), bodyMat);
    rec.position.set(0, 0.02, 0.02);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.026, 0.25), darkMetal);
    cover.position.set(0, 0.065, 0.03);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.088, 0.23), gripMat);
    stock.position.set(0, -0.008, 0.26);
    stock.rotation.x = 0.09;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.115, 0.052), gripMat);
    grip.position.set(0, -0.065, 0.11);
    grip.rotation.x = -0.26;
    const hg = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.064, 0.21), gripMat);
    hg.position.set(0, 0.022, -0.22);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.36, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.44);
    const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 8), darkMetal);
    gas.rotation.x = Math.PI / 2;
    gas.position.set(0, 0.052, -0.25);
    const fs = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.022), darkMetal);
    fs.position.set(0, 0.056, -0.56);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, isExt ? 0.21 : 0.175, 0.068), skinId === 'default' ? accentMat : bodyMat);
    magMesh.position.set(0, -0.095, -0.06);
    magMesh.rotation.x = 0.24;
    group.add(rec, cover, stock, grip, hg, barrel, gas, fs, magMesh);
    muzzleZ = -0.63;
    sightMountY = 0.082;
  } else if (weaponId === 'm4a1') {
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.084, 0.27), bodyMat);
    rec.position.set(0, 0.022, 0.03);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.44), darkMetal);
    rail.position.set(0, 0.070, -0.06);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 10), darkMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.032, 0.24);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.105, 0.14), gripMat);
    stock.position.set(0, 0.012, 0.29);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.11, 0.05), gripMat);
    grip.position.set(0, -0.062, 0.11);
    grip.rotation.x = -0.24;
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.062, 0.23), accentMat);
    shroud.position.set(0, 0.030, -0.21);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.011, 0.30, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.030, -0.44);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.038, isExt ? 0.195 : 0.155, 0.062), darkMetal);
    magMesh.position.set(0, -0.082, -0.035);
    magMesh.rotation.x = 0.08;
    group.add(rec, rail, tube, stock, grip, shroud, barrel, magMesh);
    muzzleZ = -0.60;
    sightMountY = 0.082;
  } else if (weaponId === 'scarh') {
    // Heavy monolithic SCAR-H upper receiver + Ugg-boot stock + straight 7.62 mag
    const scarUpper = new THREE.Mesh(
      new THREE.BoxGeometry(0.062, 0.092, 0.48),
      skinId === 'default' ? new THREE.MeshStandardMaterial({ color: '#b5945b', roughness: 0.48, metalness: 0.35 }) : bodyMat
    );
    scarUpper.position.set(0, 0.035, -0.08);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.052, 0.24), gripMat);
    lower.position.set(0, -0.02, 0.04);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.125, 0.24), gripMat);
    stock.position.set(0, 0.015, 0.28);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.115, 0.05), darkMetal);
    grip.position.set(0, -0.068, 0.11);
    grip.rotation.x = -0.22;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.32, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.028, -0.45);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, isExt ? 0.19 : 0.15, 0.075), darkMetal);
    magMesh.position.set(0, -0.095, -0.04);
    group.add(scarUpper, lower, stock, grip, barrel, magMesh);
    muzzleZ = -0.62;
    sightMountY = 0.086;
  } else if (weaponId === 'mp5') {
    // Compact MP5-SD with ribbed integral suppressor
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.078, 0.25), bodyMat);
    rec.position.set(0, 0.025, 0.02);
    const sdShroud = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.32, 14), darkMetal);
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
    // Iconic Futuristic Bullpup P90 with top horizontal 50-round mag
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.115, 0.44), bodyMat);
    chassis.position.set(0, 0.005, 0.04);
    const frontBridge = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.085, 0.12), gripMat);
    frontBridge.position.set(0, -0.015, -0.20);
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.042, 0.16), darkMetal);
    topRail.position.set(0, 0.092, -0.14);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.12, 10), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.30);

    // Top horizontal translucent-amber magazine
    magMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.050, 0.026, 0.29),
      new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.25, metalness: 0.4 })
    );
    magMesh.position.set(0, 0.076, 0.08);
    group.add(chassis, frontBridge, topRail, barrel, magMesh);
    muzzleZ = -0.37;
    sightMountY = 0.118;
  } else if (weaponId === 'spas12') {
    // Combat Shotgun SPAS-12 (Dual barrel + tubular magazine + pump forend)
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.082, 0.28), bodyMat);
    rec.position.set(0, 0.022, 0.04);
    const topBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 12), darkMetal);
    topBarrel.rotation.x = Math.PI / 2;
    topBarrel.position.set(0, 0.042, -0.35);
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.46, 12), darkMetal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, 0.012, -0.32);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.048, 0.20), gripMat);
    pump.position.set(0, 0.005, -0.26);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.095, 0.24), gripMat);
    stock.position.set(0, -0.005, 0.27);
    stock.rotation.x = 0.12;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.11, 0.05), darkMetal);
    grip.position.set(0, -0.062, 0.12);
    grip.rotation.x = -0.24;

    magMesh = pump;
    group.add(rec, topBarrel, magTube, pump, stock, grip);
    muzzleZ = -0.62;
    sightMountY = 0.070;
  } else if (weaponId === 'awp' || weaponId === 'barrett') {
    const isBarrett = weaponId === 'barrett';
    const defaultMat = new THREE.MeshStandardMaterial({
      color: isBarrett ? '#334155' : '#2f4f2f',
      roughness: 0.50,
      metalness: isBarrett ? 0.65 : 0.25
    });
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(isBarrett ? 0.072 : 0.062, isBarrett ? 0.098 : 0.088, isBarrett ? 0.56 : 0.48),
      skinId === 'default' ? defaultMat : bodyMat
    );
    chassis.position.set(0, 0.014, -0.04);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.115, 0.28), skinId === 'default' ? defaultMat : bodyMat);
    stock.position.set(0, 0.004, 0.32);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(isBarrett ? 0.016 : 0.013, 0.018, isBarrett ? 0.68 : 0.62, 12), darkMetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.038, -0.58);

    // Arrowhead .50 BMG Muzzle Brake for Barrett / Tactical Brake for AWP
    const brake = new THREE.Mesh(
      new THREE.BoxGeometry(isBarrett ? 0.056 : 0.034, isBarrett ? 0.038 : 0.028, isBarrett ? 0.095 : 0.065),
      isBarrett ? accentMat : darkMetal
    );
    brake.position.set(0, 0.038, isBarrett ? -0.94 : -0.86);

    // Dual-Turret Sniper Scope
    const scopeGroup = new THREE.Group();
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.32, 14), darkMetal);
    scopeTube.rotation.x = Math.PI / 2;
    const bellFront = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.020, 0.08, 14), darkMetal);
    bellFront.rotation.x = Math.PI / 2;
    bellFront.position.z = -0.17;
    const bellRear = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, 0.06, 14), darkMetal);
    bellRear.rotation.x = Math.PI / 2;
    bellRear.position.z = 0.16;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 14), new THREE.MeshBasicMaterial({ color: isBarrett ? '#ef4444' : '#38bdf8' }));
    lens.position.z = 0.191;
    scopeGroup.add(scopeTube, bellFront, bellRear, lens);
    scopeGroup.position.set(0, 0.105, 0.01);

    magMesh = new THREE.Mesh(new THREE.BoxGeometry(0.046, isBarrett ? 0.13 : 0.095, isBarrett ? 0.13 : 0.095), darkMetal);
    magMesh.position.set(0, -0.072, -0.04);
    if (isBarrett) magMesh.rotation.x = 0.12;

    group.add(chassis, stock, barrel, brake, scopeGroup, magMesh);
    muzzleZ = isBarrett ? -0.98 : -0.90;
    sightMountY = 0.10;
  } else if (weaponId === 'deagle' || weaponId === 'usps') {
    const isUsp = weaponId === 'usps';
    const slideMat = skinId === 'default'
      ? new THREE.MeshStandardMaterial({ color: isUsp ? '#334155' : '#cbd5e1', metalness: 0.85, roughness: 0.24 })
      : bodyMat;
    const slide = new THREE.Mesh(new THREE.BoxGeometry(isUsp ? 0.038 : 0.044, isUsp ? 0.042 : 0.052, isUsp ? 0.20 : 0.24), slideMat);
    slide.position.set(0, 0.035, -0.04);
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
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 12), darkMetal);
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
      metalness: 0.92,
      roughness: 0.15
    });

    if (isKara) {
      // Finger ring + ergonomic curved handle + curved tiger-claw blade!
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16), darkMetal);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0, -0.03, 0.10);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.038, 0.11), gripMat);
      handle.position.set(0, -0.01, 0.03);
      handle.rotation.x = 0.25;
      const claw1 = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.036, 0.11), bladeMat);
      claw1.position.set(0, 0.012, -0.06);
      claw1.rotation.x = -0.25;
      const clawTip = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.028, 0.09), bladeMat);
      clawTip.position.set(0, -0.018, -0.13);
      clawTip.rotation.x = -0.68;
      group.add(ring, handle, claw1, clawTip);
    } else {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.020, 0.13, 10), gripMat);
      handle.rotation.x = Math.PI / 2;
      handle.position.set(0, 0, 0.05);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.075, 0.014), darkMetal);
      guard.position.set(0, 0, -0.018);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.036, 0.21), bladeMat);
      blade.position.set(0, 0.004, -0.125);
      group.add(handle, guard, blade);
    }
    muzzleZ = -0.24;
  }

  // Mount Optic & Muzzle Attachments (for non-Sniper, non-Melee)
  const isSniper = weaponId === 'awp' || weaponId === 'barrett';
  const isMelee = weaponId === 'knife' || weaponId === 'karambit';
  if (!isSniper && !isMelee) {
    const optic = attachments?.optic || 'iron';
    if (optic === 'reddot') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.065), darkMetal);
      base.position.set(0, sightMountY, 0.01);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.034, 0.045), darkMetal);
      hood.position.set(0, sightMountY + 0.022, 0.01);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 8), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
      dot.position.set(0, sightMountY + 0.022, 0.01);
      group.add(base, hood, dot);
    } else if (optic === 'acog') {
      const acog = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.13, 12), darkMetal);
      acog.rotation.x = Math.PI / 2;
      acog.position.set(0, sightMountY + 0.018, 0.01);
      group.add(acog);
    }

    const muzzle = attachments?.muzzle || 'none';
    if (muzzle === 'suppressor' && weaponId !== 'mp5' && weaponId !== 'usps') {
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 12), darkMetal);
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
    muzzlePos: new THREE.Vector3(0, 0.032, muzzleZ)
  };
  return group;
}

export function createFirstPersonRig(weaponId, skinId, attachments, outfitId = 'urban') {
  const root = new THREE.Group();
  const outfit = OUTFITS[outfitId] || OUTFITS.urban;
  const gun = createWeaponModel(weaponId, skinId, attachments);

  const sleeveMat = new THREE.MeshStandardMaterial({ color: outfit.primary, roughness: 0.78 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.58 });

  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.068, 0.34), sleeveMat);
  rArm.position.set(0.08, -0.11, 0.24);
  rArm.rotation.set(0.20, -0.18, 0);
  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.062, 0.085), gloveMat);
  rHand.position.set(0.015, -0.065, 0.09);

  const isShort = ['deagle', 'usps', 'knife', 'karambit'].includes(weaponId);
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.066, 0.38), sleeveMat);
  lArm.position.set(-0.11, -0.10, isShort ? 0.16 : 0.02);
  lArm.rotation.set(0.24, isShort ? 0.35 : 0.32, 0);
  const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.058, 0.085), gloveMat);
  lHand.position.set(-0.01, -0.032, isShort ? 0.02 : -0.18);

  const flashMat = new THREE.MeshBasicMaterial({
    color: '#fde047',
    transparent: true,
    opacity: 0.92,
    depthTest: false
  });
  const flashGroup = new THREE.Group();
  flashGroup.add(
    new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.055), flashMat),
    new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.19), flashMat)
  );
  flashGroup.position.copy(gun.userData.muzzlePos);
  flashGroup.visible = false;

  root.add(gun, rArm, rHand, lArm, lHand, flashGroup);
  root.userData = { gun, flashGroup, lArm, lHand, rArm };
  return root;
}

function makeNameplateSprite(name, team, isAlly) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(9, 13, 22, 0.75)';
  ctx.beginPath();
  ctx.roundRect(18, 12, 220, 40, 8);
  ctx.fill();

  const accent = team === 'alpha' ? '#38bdf8' : (team === 'bravo' ? '#f97316' : (isAlly ? '#22c55e' : '#ef4444'));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
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
  sprite.position.set(0, 2.08, 0);
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
  const teamGlowColor = team === 'alpha' ? '#0ea5e9' : (team === 'bravo' ? '#f97316' : (isAlly ? '#10b981' : '#ef4444'));

  const clothMat = new THREE.MeshStandardMaterial({ color: outCfg.primary, roughness: 0.78 });
  const secMat = new THREE.MeshStandardMaterial({ color: outCfg.secondary, roughness: 0.70 });
  const vestMat = new THREE.MeshStandardMaterial({ color: outCfg.vest, roughness: 0.58, metalness: 0.28 });
  const skinMat = new THREE.MeshStandardMaterial({ color: outCfg.skinTone, roughness: 0.65 });
  const accentTrim = new THREE.MeshStandardMaterial({
    color: outCfg.accent || teamGlowColor,
    emissive: teamGlowColor,
    emissiveIntensity: 0.40,
    roughness: 0.32
  });
  const darkBootMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.75 });

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.16, 0.24), secMat);
  hips.position.set(0, 0.88, 0);
  bodyRoot.add(hips);

  function makeLeg(sideX) {
    const legPivot = new THREE.Group();
    legPivot.position.set(sideX, 0.84, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.40, 0.18), clothMat);
    thigh.position.set(0, -0.20, 0);
    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.09, 0.195), darkBootMat);
    kneePad.position.set(0, -0.40, -0.01);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.36, 0.16), secMat);
    shin.position.set(0, -0.60, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.11, 0.24), darkBootMat);
    boot.position.set(0, -0.785, -0.03);
    legPivot.add(thigh, kneePad, shin, boot);
    return legPivot;
  }
  const leftLeg = makeLeg(-0.115);
  const rightLeg = makeLeg(0.115);
  bodyRoot.add(leftLeg, rightLeg);

  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.95, 0);
  bodyRoot.add(upperBody);

  const torsoW = opCfg.helmetStyle === 'heavy' ? 0.49 : 0.43;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, 0.50, 0.25), clothMat);
  torso.position.set(0, 0.25, 0);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(torsoW + 0.03, 0.38, 0.29), vestMat);
  vest.position.set(0, 0.26, 0);

  const lBadge = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.05, 0.22), accentTrim);
  lBadge.position.set(-(torsoW * 0.5 + 0.02), 0.45, 0);
  const rBadge = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.05, 0.22), accentTrim);
  rBadge.position.set(torsoW * 0.5 + 0.02, 0.45, 0);
  upperBody.add(torso, vest, lBadge, rBadge);

  const c4Pack = createC4Mesh();
  c4Pack.position.set(0, 0.28, 0.18);
  c4Pack.rotation.x = Math.PI / 2;
  c4Pack.scale.setScalar(0.8);
  c4Pack.visible = false;
  upperBody.add(c4Pack);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.55, 0);
  upperBody.add(headGroup);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, 0.24), skinMat);
  head.position.set(0, 0.13, 0);
  headGroup.add(head);

  if (opCfg.helmetStyle === 'visor' || opCfg.helmetStyle === 'heavy') {
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.28), opCfg.helmetStyle === 'heavy' ? darkBootMat : vestMat);
    helm.position.set(0, 0.20, 0.01);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.085, 0.04),
      new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.9, roughness: 0.12 })
    );
    visor.position.set(0, 0.16, -0.128);
    headGroup.add(helm, visor);
  } else if (opCfg.helmetStyle === 'nvg') {
    // Shadow NVG 3-Eye Glowing Emerald Night-Vision Goggles!
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.26, 0.255), darkBootMat);
    mask.position.set(0, 0.135, 0);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.275, 0.14, 0.275), vestMat);
    helm.position.set(0, 0.22, 0.01);
    const nvgMat = new THREE.MeshBasicMaterial({ color: '#22c55e' });
    [-0.055, 0, 0.055].forEach((nx, idx) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.075, 10), darkBootMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(nx, idx === 1 ? 0.195 : 0.16, -0.155);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 10), nvgMat);
      lens.rotation.y = Math.PI;
      lens.position.set(nx, idx === 1 ? 0.195 : 0.16, -0.194);
      headGroup.add(tube, lens);
    });
    headGroup.add(mask, helm);
  } else if (opCfg.helmetStyle === 'medic') {
    // Phoenix Combat Medic Helmet with White/Crimson Emblem
    const helm = new THREE.Mesh(
      new THREE.BoxGeometry(0.275, 0.16, 0.28),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 })
    );
    helm.position.set(0, 0.20, 0.01);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.026, 0.02), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    crossH.position.set(0, 0.21, -0.135);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    crossV.position.set(0, 0.21, -0.135);
    headGroup.add(helm, crossH, crossV);
  } else if (opCfg.helmetStyle === 'hood') {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.265, 0.27, 0.265), secMat);
    hood.position.set(0, 0.14, 0.01);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.065, 0.04), accentTrim);
    goggles.position.set(0, 0.155, -0.125);
    headGroup.add(hood, goggles);
  } else {
    const beret = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.08, 0.26), new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.8 }));
    beret.position.set(0.015, 0.26, 0);
    beret.rotation.z = -0.12;
    headGroup.add(beret);
  }

  const armsPivot = new THREE.Group();
  armsPivot.position.set(0, 0.42, 0);
  upperBody.add(armsPivot);

  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.44), clothMat);
  rArm.position.set(0.26, -0.06, -0.16);
  rArm.rotation.y = 0.22;
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.46), clothMat);
  lArm.position.set(-0.22, -0.06, -0.19);
  lArm.rotation.y = -0.35;

  const weaponMount = new THREE.Group();
  weaponMount.position.set(0.12, -0.06, -0.28);
  const gunMesh = createWeaponModel(weaponId, skinId, attachments);
  gunMesh.scale.setScalar(0.92);
  weaponMount.add(gunMesh);

  armsPivot.add(rArm, lArm, weaponMount);

  const shieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.56, 0.56, 1.85, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
  );
  shieldMesh.position.set(0, 0.92, 0);
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
    upperBody,
    headGroup,
    leftLeg,
    rightLeg,
    armsPivot,
    weaponMount,
    c4Pack,
    shieldMesh,
    nameplate,
    currentWeaponId: weaponId,
    walkPhase: Math.random() * Math.PI * 2,
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
  gunMesh.scale.setScalar(0.92);
  rig.weaponMount.add(gunMesh);
}

export function animateOperatorRig(rig, state, dt, timeSec = 0) {
  if (!rig) return;
  if (state.dead) {
    rig.deathProgress = Math.min(1, rig.deathProgress + dt * 4.2);
    rig.bodyRoot.rotation.x = -rig.deathProgress * (Math.PI * 0.48);
    rig.bodyRoot.position.y = -rig.deathProgress * 0.65;
    rig.shieldMesh.visible = false;
    rig.nameplate.visible = false;
    return;
  }

  if (rig.deathProgress > 0) {
    rig.deathProgress = Math.max(0, rig.deathProgress - dt * 6.0);
    rig.bodyRoot.rotation.x = -rig.deathProgress * (Math.PI * 0.48);
  }
  rig.nameplate.visible = state.showNameplate !== false;
  rig.c4Pack.visible = Boolean(state.hasBomb);
  rig.shieldMesh.visible = Boolean(state.shield);
  if (rig.shieldMesh.visible) rig.shieldMesh.rotation.y = timeSec * 2.5;

  const targetCrouchY = state.crouch ? -0.44 : 0;
  rig.bodyRoot.position.y += (targetCrouchY - rig.bodyRoot.position.y) * Math.min(1, 14 * dt);

  const speed = state.moveSpeed || 0;
  if (speed > 0.25) {
    rig.walkPhase += dt * (state.sprint ? 13.5 : 9.2);
    const swing = Math.sin(rig.walkPhase) * (state.crouch ? 0.35 : 0.62);
    rig.leftLeg.rotation.x = swing;
    rig.rightLeg.rotation.x = -swing;
    rig.bodyRoot.position.y += Math.abs(Math.cos(rig.walkPhase)) * 0.025;
  } else {
    rig.leftLeg.rotation.x *= 0.82;
    rig.rightLeg.rotation.x *= 0.82;
    if (state.crouch) {
      rig.leftLeg.rotation.x = 0.55;
      rig.rightLeg.rotation.x = -0.35;
    }
  }

  if (state.victoryPose) {
    rig.upperBody.rotation.y = Math.sin(timeSec * 1.4) * 0.14;
    rig.armsPivot.rotation.x = 0.25 + Math.sin(timeSec * 2.2) * 0.05;
    rig.headGroup.rotation.y = Math.sin(timeSec * 1.1) * 0.18;
    return;
  }

  rig.recoilKick = Math.max(0, rig.recoilKick - dt * 6.5);
  const pitch = state.pitch || 0;
  rig.armsPivot.rotation.x = pitch * 0.85 + rig.recoilKick;
  rig.headGroup.rotation.x = pitch * 0.55;
}

export function createC4Mesh() {
  const g = new THREE.Group();
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.75 }));
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.08), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
  screen.position.set(0, 0.065, -0.02);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff1e1e' }));
  led.position.set(0.10, 0.075, 0.05);
  g.add(pack, screen, led);
  return g;
}

export function createGrenadeMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 10),
    new THREE.MeshStandardMaterial({ color: '#365314', roughness: 0.55, metalness: 0.35 })
  );
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, 0.025, 10),
    new THREE.MeshBasicMaterial({ color: '#facc15' })
  );
  g.add(body, band);
  return g;
}
