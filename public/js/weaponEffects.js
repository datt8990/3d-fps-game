// AAA FPS Ballistic VFX System: Volumetric Muzzle Flash, 3D Shell Ejection, Bullet Decals, Metal Sparks & Explosions
import * as THREE from 'three';

let muzzleStarTex = null;
let muzzleCoreTex = null;
let bulletHoleConcreteTex = null;
let bulletHoleMetalTex = null;
let smokePuffTex = null;

function getMuzzleStarTexture() {
  if (muzzleStarTex) return muzzleStarTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  const cx = 64;
  const cy = 64;
  // Bright radial flame core
  const rad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 56);
  rad.addColorStop(0.0, 'rgba(255, 255, 245, 1.0)');
  rad.addColorStop(0.22, 'rgba(255, 232, 130, 0.92)');
  rad.addColorStop(0.55, 'rgba(255, 130, 28, 0.45)');
  rad.addColorStop(1.0, 'rgba(255, 70, 0, 0.0)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, 128, 128);

  // 6 asymmetrical supersonic gas spikes
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 6; i++) {
    ctx.rotate((Math.PI * 2) / 6 + (i % 2 ? 0.08 : -0.05));
    const g = ctx.createLinearGradient(0, 0, 0, -58);
    g.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
    g.addColorStop(0.45, 'rgba(255, 185, 55, 0.72)');
    g.addColorStop(1, 'rgba(255, 90, 10, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(0, -58);
    ctx.lineTo(7, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  muzzleStarTex = new THREE.CanvasTexture(c);
  muzzleStarTex.colorSpace = THREE.SRGBColorSpace;
  return muzzleStarTex;
}

function getMuzzleCoreTexture() {
  if (muzzleCoreTex) return muzzleCoreTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 64);

  // Elongated flame jet pointing -Z (left-to-right on UV)
  const g = ctx.createLinearGradient(0, 32, 128, 32);
  g.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)');
  g.addColorStop(0.28, 'rgba(255, 210, 90, 0.88)');
  g.addColorStop(0.68, 'rgba(255, 115, 20, 0.35)');
  g.addColorStop(1.0, 'rgba(255, 60, 0, 0.0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(4, 32);
  ctx.quadraticCurveTo(38, 6, 126, 32);
  ctx.quadraticCurveTo(38, 58, 4, 32);
  ctx.closePath();
  ctx.fill();

  muzzleCoreTex = new THREE.CanvasTexture(c);
  muzzleCoreTex.colorSpace = THREE.SRGBColorSpace;
  return muzzleCoreTex;
}

function getSmokePuffTexture() {
  if (smokePuffTex) return smokePuffTex;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(48, 48, 6, 48, 48, 46);
  g.addColorStop(0.0, 'rgba(220, 224, 232, 0.85)');
  g.addColorStop(0.5, 'rgba(148, 163, 184, 0.45)');
  g.addColorStop(1.0, 'rgba(71, 85, 105, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 96, 96);
  smokePuffTex = new THREE.CanvasTexture(c);
  smokePuffTex.colorSpace = THREE.SRGBColorSpace;
  return smokePuffTex;
}

function getBulletHoleTexture(isMetal = false) {
  if (isMetal && bulletHoleMetalTex) return bulletHoleMetalTex;
  if (!isMetal && bulletHoleConcreteTex) return bulletHoleConcreteTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);

  // Outer scorch & dust/metal ring
  const outer = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
  outer.addColorStop(0.0, 'rgba(10, 10, 12, 0.96)');
  outer.addColorStop(0.32, isMetal ? 'rgba(226, 232, 240, 0.72)' : 'rgba(55, 52, 48, 0.78)');
  outer.addColorStop(0.62, isMetal ? 'rgba(30, 41, 59, 0.38)' : 'rgba(120, 113, 108, 0.34)');
  outer.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = outer;
  ctx.fillRect(0, 0, 64, 64);

  // Cracks radiating outward
  ctx.strokeStyle = isMetal ? 'rgba(203, 213, 225, 0.55)' : 'rgba(28, 25, 23, 0.72)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = 14 + (i % 3) * 5;
    ctx.beginPath();
    ctx.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6);
    ctx.lineTo(32 + Math.cos(a) * len, 32 + Math.sin(a) * len);
    ctx.stroke();
  }

  // Pitch black inner puncture crater
  ctx.fillStyle = '#050608';
  ctx.beginPath();
  ctx.arc(32, 32, 7.5, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (isMetal) bulletHoleMetalTex = tex;
  else bulletHoleConcreteTex = tex;
  return tex;
}

/**
 * Volumetric 3D Muzzle Flash assembly (crossed starburst + elongated flame jets + dynamic point light).
 * Designed to look intense in hipfire and automatically tone down in ADS so sights stay crystal clear.
 */
export function createMuzzleFlashRig(withLight = true) {
  const group = new THREE.Group();
  group.userData.keepWithGlb = true;

  const starMat = new THREE.MeshBasicMaterial({
    map: getMuzzleStarTexture(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const jetMat = new THREE.MeshBasicMaterial({
    map: getMuzzleCoreTexture(),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const visualGroup = new THREE.Group();
  visualGroup.visible = false;

  // Front facing starburst
  const starFront = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), starMat);
  starFront.position.z = -0.025;
  visualGroup.add(starFront);

  // Two crossed axial flame jets along -Z barrel axis
  const jetGeo = new THREE.PlaneGeometry(0.24, 0.10);
  jetGeo.translate(0.12, 0, 0);
  const jetH = new THREE.Mesh(jetGeo, jetMat);
  jetH.rotation.y = Math.PI / 2;
  const jetV = new THREE.Mesh(jetGeo, jetMat);
  jetV.rotation.y = Math.PI / 2;
  jetV.rotation.x = Math.PI / 2;
  visualGroup.add(jetH, jetV);

  group.add(visualGroup);

  let light = null;
  if (withLight) {
    light = new THREE.PointLight('#ffaa33', 0, 7.5, 1.8);
    light.position.set(0, 0.02, -0.08);
    group.add(light);
  }

  group.userData.flashState = {
    visualGroup,
    starMat,
    jetMat,
    light,
    timer: 0,
    duration: 0.048
  };
  return group;
}

export function triggerMuzzleFlash(flashGroup, { isAds = false, isSuppressed = false, power = 1.0 } = {}) {
  const st = flashGroup?.userData?.flashState;
  if (!st) return;

  const scaleBase = isSuppressed ? 0.42 : (isAds ? 0.48 : 0.95) * Math.min(1.35, Math.max(0.65, power));
  const jitter = 0.85 + Math.random() * 0.35;
  st.visualGroup.scale.set(scaleBase * jitter, scaleBase * jitter, scaleBase * (0.9 + Math.random() * 0.35));
  st.visualGroup.rotation.z = Math.random() * Math.PI * 2;
  st.visualGroup.visible = true;

  const tint = isSuppressed ? 0xbae6fd : 0xffd27d;
  st.starMat.color.setHex(tint);
  st.jetMat.color.setHex(tint);
  const maxOp = isSuppressed ? 0.38 : (isAds ? 0.46 : 0.92);
  st.starMat.opacity = maxOp;
  st.jetMat.opacity = maxOp;

  if (st.light) {
    st.light.color.setHex(isSuppressed ? 0x93c5fd : 0xff9f2e);
    st.light.intensity = isSuppressed ? 1.2 : (isAds ? 2.4 : 4.6) * power;
  }
  st.duration = isSuppressed ? 0.032 : 0.048;
  st.timer = st.duration;
}

export function updateMuzzleFlash(flashGroup, dt) {
  const st = flashGroup?.userData?.flashState;
  if (!st || st.timer <= 0) return;
  st.timer = Math.max(0, st.timer - dt);
  const ratio = st.timer / st.duration;
  if (ratio <= 0.01) {
    st.visualGroup.visible = false;
    st.starMat.opacity = 0;
    st.jetMat.opacity = 0;
    if (st.light) st.light.intensity = 0;
  } else {
    st.starMat.opacity *= ratio;
    st.jetMat.opacity *= ratio;
    if (st.light) st.light.intensity *= ratio;
  }
}

/**
 * Pooled 3D Shell Casing Ejection Engine (Brass rifle/pistol casings + Red 12ga shotgun hulls)
 */
const sharedShellGeos = {
  brass: new THREE.CylinderGeometry(0.0055, 0.0055, 0.032, 7),
  shotgun: new THREE.CylinderGeometry(0.0095, 0.0095, 0.050, 8)
};
const sharedShellMats = {
  brass: new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.92, roughness: 0.18 }),
  shotgun: new THREE.MeshStandardMaterial({ color: '#dc2626', metalness: 0.25, roughness: 0.45 })
};

export class ShellEjectionPool {
  constructor(scene, maxShells = 36) {
    this.scene = scene;
    this.maxShells = maxShells;
    this.shells = [];
  }

  spawn(originWorld, rightWorld, upWorld, forwardWorld, { isShotgun = false, floorY = 0, onBounce = null } = {}) {
    if (this.shells.length >= this.maxShells) {
      const oldest = this.shells.shift();
      this.scene.remove(oldest.mesh);
    }

    const mesh = new THREE.Mesh(
      isShotgun ? sharedShellGeos.shotgun : sharedShellGeos.brass,
      isShotgun ? sharedShellMats.shotgun : sharedShellMats.brass
    );
    mesh.position.copy(originWorld);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(mesh);

    const speedRight = (isShotgun ? 1.65 : 2.15) + Math.random() * 0.75;
    const speedUp = 1.15 + Math.random() * 0.55;
    const speedBack = -0.35 + Math.random() * 0.4;

    const vel = new THREE.Vector3()
      .addScaledVector(rightWorld, speedRight)
      .addScaledVector(upWorld, speedUp)
      .addScaledVector(forwardWorld, speedBack);

    this.shells.push({
      mesh,
      vel,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 28,
        (Math.random() - 0.5) * 26,
        (Math.random() - 0.5) * 32
      ),
      floorY,
      bounces: 0,
      isShotgun,
      onBounce,
      life: 2.2
    });
  }

  update(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        continue;
      }

      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;

      if (s.mesh.position.y <= s.floorY + 0.015) {
        s.mesh.position.y = s.floorY + 0.015;
        if (Math.abs(s.vel.y) > 0.45) {
          s.vel.y = -s.vel.y * 0.42;
          s.vel.x *= 0.62;
          s.vel.z *= 0.62;
          s.spin.multiplyScalar(0.55);
          if (s.bounces === 0 && typeof s.onBounce === 'function') {
            s.onBounce(s.isShotgun);
          }
          s.bounces++;
        } else {
          s.vel.set(0, 0, 0);
          s.spin.set(0, 0, 0);
        }
      }
    }
  }

  clear() {
    for (const s of this.shells) this.scene.remove(s.mesh);
    this.shells = [];
  }
}

/**
 * Pooled Surface Impact System: Bullet Hole Decals + Metal Sparks + Concrete Dust + Glowing Tracers + Explosions
 */
const sharedImpactGeos = {
  spark: new THREE.BoxGeometry(0.022, 0.022, 0.12),
  debris: new THREE.BoxGeometry(0.045, 0.045, 0.045),
  decal: new THREE.PlaneGeometry(0.14, 0.14),
  smokePlane: new THREE.PlaneGeometry(0.55, 0.55),
  tracerCyl: new THREE.CylinderGeometry(0.008, 0.003, 1.0, 5),
  sphereLow: new THREE.SphereGeometry(0.5, 10, 10),
  ringLow: new THREE.RingGeometry(0.45, 0.72, 24)
};
sharedImpactGeos.tracerCyl.rotateX(Math.PI / 2);

export class BallisticVfxManager {
  constructor(scene, maxDecals = 64) {
    this.scene = scene;
    this.maxDecals = maxDecals;
    this.decals = [];
    this.particles = [];
    this.lights = [];
  }

  /**
   * Detect surface type from map blocks near hit point ('metal' | 'wood' | 'concrete')
   */
  detectSurfaceMaterial(point, mapData) {
    if (!mapData?.blocks) return 'concrete';
    const blocks = mapData.blocks;
    const px = point.x;
    const py = point.y;
    const pz = point.z;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.noVisual) continue;
      const hw = b.w * 0.5 + 0.16;
      const hd = b.d * 0.5 + 0.16;
      if (
        px >= b.x - hw && px <= b.x + hw &&
        pz >= b.z - hd && pz <= b.z + hd &&
        py >= b.y - 0.16 && py <= b.y + b.h + 0.16
      ) {
        const m = b.mat || '';
        if (m.startsWith('container_') || m === 'crate_metal' || m === 'metal_deck' || m === 'metal_step' || m === 'metal_dark') {
          return 'metal';
        }
        if (m === 'crate_wood') return 'wood';
        return 'concrete';
      }
    }
    return 'concrete';
  }

  spawnTracer(p1, p2, isSuppressed = false) {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const totalLen = dir.length();
    if (totalLen < 0.35) return;

    const start = p1.clone().lerp(p2, Math.min(0.08, 0.45 / totalLen));
    const segLen = Math.min(totalLen * 0.88, 28);
    const end = start.clone().addScaledVector(dir.normalize(), segLen);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const mat = new THREE.MeshBasicMaterial({
      color: isSuppressed ? '#bae6fd' : '#fef08a',
      transparent: true,
      opacity: isSuppressed ? 0.32 : 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(sharedImpactGeos.tracerCyl, mat);
    mesh.position.copy(mid);
    mesh.scale.set(1, 1, start.distanceTo(end));
    mesh.lookAt(end);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      mat,
      life: 0.055,
      maxLife: 0.055,
      vel: null,
      gravity: 0,
      scaleGrow: 0
    });
  }

  spawnBarrelSmoke(worldPos, forwardDir) {
    const mat = new THREE.MeshBasicMaterial({
      map: getSmokePuffTexture(),
      color: '#cbd5e1',
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getSmokePuffTexture(),
      color: '#cbd5e1',
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    }));
    sp.position.copy(worldPos).addScaledVector(forwardDir, 0.08);
    sp.scale.setScalar(0.14);
    this.scene.add(sp);
    mat.dispose();

    this.particles.push({
      mesh: sp,
      mat: sp.material,
      life: 0.42,
      maxLife: 0.42,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.45 + Math.random() * 0.2, (Math.random() - 0.5) * 0.25),
      gravity: -0.25,
      scaleGrow: 2.2
    });
  }

  spawnBulletImpact(hitPoint, rayOrigin, hitType, mapData) {
    const p = new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z);
    const toOrigin = new THREE.Vector3(rayOrigin.x - p.x, rayOrigin.y - p.y, rayOrigin.z - p.z).normalize();

    if (hitType === 'player') {
      // Tactical hit spark / mist feedback
      for (let i = 0; i < 6; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: i < 2 ? '#fca5a5' : '#ef4444',
          transparent: true,
          opacity: 0.92
        });
        const m = new THREE.Mesh(sharedImpactGeos.debris, mat);
        m.position.copy(p);
        m.scale.setScalar(0.7 + Math.random() * 0.6);
        this.scene.add(m);
        const vel = toOrigin.clone().multiplyScalar(1.2 + Math.random() * 1.8).add(
          new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 2.4)
        );
        this.particles.push({ mesh: m, mat, life: 0.22, maxLife: 0.22, vel, gravity: 7.5, scaleGrow: -1.5 });
      }
      return 'player';
    }

    const surface = this.detectSurfaceMaterial(p, mapData);
    const isMetal = surface === 'metal';

    // 1. Bullet Hole Decal oriented toward shooter along hit surface
    if (this.decals.length >= this.maxDecals) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
    const decalMat = new THREE.MeshBasicMaterial({
      map: getBulletHoleTexture(isMetal),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });
    const decal = new THREE.Mesh(sharedImpactGeos.decal, decalMat);
    // Estimate crisp axis-aligned surface normal (best match to incoming ray)
    const normal = new THREE.Vector3(0, 1, 0);
    const ax = Math.abs(toOrigin.x);
    const ay = Math.abs(toOrigin.y);
    const az = Math.abs(toOrigin.z);
    if (ax >= ay && ax >= az) normal.set(Math.sign(toOrigin.x), 0, 0);
    else if (az >= ax && az >= ay) normal.set(0, 0, Math.sign(toOrigin.z));
    else normal.set(0, Math.sign(toOrigin.y) || 1, 0);

    decal.position.copy(p).addScaledVector(normal, 0.014);
    decal.lookAt(p.clone().add(normal));
    decal.rotation.z = Math.random() * Math.PI * 2;
    const sc = isMetal ? 0.85 : 1.05;
    decal.scale.setScalar(sc);
    this.scene.add(decal);
    this.decals.push({ mesh: decal, mat: decalMat });

    // 2. Sparks (bright intense shower on Metal, smaller spark + dust chips on Wall/Wood)
    const sparkCount = isMetal ? 9 : 4;
    for (let i = 0; i < sparkCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: isMetal ? (i % 2 === 0 ? '#ffffff' : '#facc15') : '#f59e0b',
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const spark = new THREE.Mesh(sharedImpactGeos.spark, mat);
      spark.position.copy(p).addScaledVector(normal, 0.03);
      const vel = normal.clone().multiplyScalar(2.4 + Math.random() * (isMetal ? 5.2 : 2.6)).add(
        new THREE.Vector3((Math.random() - 0.5) * 4.2, Math.random() * 2.8, (Math.random() - 0.5) * 4.2)
      );
      spark.lookAt(spark.position.clone().add(vel));
      this.scene.add(spark);
      this.particles.push({
        mesh: spark,
        mat,
        life: isMetal ? 0.24 + Math.random() * 0.14 : 0.15,
        maxLife: isMetal ? 0.36 : 0.15,
        vel,
        gravity: 11.5,
        alignToVel: true,
        scaleGrow: 0
      });
    }

    // 3. Dust / Smoke Puff on Concrete / Wood impact
    if (!isMetal) {
      const dustColor = surface === 'wood' ? '#b48a5a' : '#d6d3d1';
      for (let i = 0; i < 2; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: getSmokePuffTexture(),
          color: dustColor,
          transparent: true,
          opacity: 0.58,
          depthWrite: false
        }));
        sp.position.copy(p).addScaledVector(normal, 0.08);
        sp.scale.setScalar(0.22 + i * 0.12);
        this.scene.add(sp);
        this.particles.push({
          mesh: sp,
          mat: sp.material,
          life: 0.45 + i * 0.15,
          maxLife: 0.6,
          vel: normal.clone().multiplyScalar(0.75 + Math.random() * 0.5).add(new THREE.Vector3(0, 0.45, 0)),
          gravity: -0.3,
          scaleGrow: 2.6
        });
      }
    }

    return surface;
  }

  /**
   * Multi-layered Grenade / C4 Explosion: Flash Core + Fireball + Shockwave Ring + Rising Smoke + Embers + Dynamic Light
   */
  spawnExplosion(pos) {
    const center = new THREE.Vector3(pos.x, pos.y + 0.25, pos.z);

    // 1. Dynamic Blast Light Flash
    const blastLight = new THREE.PointLight('#ff7b00', 14, 22, 1.5);
    blastLight.position.copy(center).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(blastLight);
    this.lights.push({ light: blastLight, life: 0.32, maxLife: 0.32, maxIntensity: 14 });

    // 2. White-Hot Core Flash
    const coreMat = new THREE.MeshBasicMaterial({
      color: '#fef9c3',
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const coreMesh = new THREE.Mesh(sharedImpactGeos.sphereLow, coreMat);
    coreMesh.position.copy(center);
    coreMesh.scale.setScalar(0.9);
    this.scene.add(coreMesh);
    this.particles.push({ mesh: coreMesh, mat: coreMat, life: 0.18, maxLife: 0.18, vel: null, gravity: 0, scaleGrow: 18 });

    // 3. Expanding Fireball Cluster
    const fireColors = ['#f97316', '#ea580c', '#dc2626', '#fbbf24'];
    for (let i = 0; i < 4; i++) {
      const fMat = new THREE.MeshBasicMaterial({
        color: fireColors[i],
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const fMesh = new THREE.Mesh(sharedImpactGeos.sphereLow, fMat);
      fMesh.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 0.7, Math.random() * 0.4, (Math.random() - 0.5) * 0.7));
      fMesh.scale.setScalar(0.75 + Math.random() * 0.45);
      this.scene.add(fMesh);
      this.particles.push({
        mesh: fMesh,
        mat: fMat,
        life: 0.36 + i * 0.06,
        maxLife: 0.54,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4),
        gravity: -0.5,
        scaleGrow: 8.5
      });
    }

    // 4. Expanding Ground Shockwave Ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#fdba74',
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ring = new THREE.Mesh(sharedImpactGeos.ringLow, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, pos.y + 0.08, center.z);
    ring.scale.setScalar(0.6);
    this.scene.add(ring);
    this.particles.push({ mesh: ring, mat: ringMat, life: 0.38, maxLife: 0.38, vel: null, gravity: 0, scaleGrow: 22 });

    // 5. Billowing Dark Smoke Plume
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getSmokePuffTexture(),
        color: i % 2 === 0 ? '#334155' : '#1e293b',
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      }));
      sp.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.5, (Math.random() - 0.5) * 1.2));
      sp.scale.setScalar(1.2 + Math.random() * 0.6);
      this.scene.add(sp);
      this.particles.push({
        mesh: sp,
        mat: sp.material,
        life: 1.35 + Math.random() * 0.55,
        maxLife: 1.9,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6),
        gravity: -0.45,
        scaleGrow: 1.85
      });
    }

    // 6. Flying Glowing Shrapnel Sparks
    for (let i = 0; i < 14; i++) {
      const eMat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? '#fef08a' : '#f97316',
        transparent: true,
        opacity: 0.98,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const ember = new THREE.Mesh(sharedImpactGeos.spark, eMat);
      ember.position.copy(center);
      const theta = Math.random() * Math.PI * 2;
      const spd = 4.5 + Math.random() * 7.5;
      const vel = new THREE.Vector3(Math.cos(theta) * spd, 3.2 + Math.random() * 5.8, Math.sin(theta) * spd);
      ember.scale.set(1.5, 1.5, 2.2);
      ember.lookAt(ember.position.clone().add(vel));
      this.scene.add(ember);
      this.particles.push({
        mesh: ember,
        mat: eMat,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1.0,
        vel,
        gravity: 13.5,
        alignToVel: true,
        scaleGrow: 0
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mat?.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const ratio = p.life / p.maxLife;
      if (p.mat) p.mat.opacity = Math.min(1, ratio * 1.15);

      if (p.vel) {
        if (p.gravity) p.vel.y -= p.gravity * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.alignToVel) {
          p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
        }
      }
      if (p.scaleGrow) {
        const mult = Math.max(0.15, 1 + p.scaleGrow * dt);
        p.mesh.scale.multiplyScalar(mult);
      }
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.scene.remove(l.light);
        this.lights.splice(i, 1);
      } else {
        l.light.intensity = l.maxIntensity * Math.pow(l.life / l.maxLife, 1.8);
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mat?.dispose();
    }
    this.particles = [];
    for (const d of this.decals) {
      this.scene.remove(d.mesh);
      d.mat?.dispose();
    }
    this.decals = [];
    for (const l of this.lights) {
      this.scene.remove(l.light);
    }
    this.lights = [];
  }
}
