// Interactive 3D Military Hangar Showcase for Main Lobby, Operator Select & Weapon Armory
import * as THREE from 'three';
import { WEAPONS } from '/shared/constants.js';
import { createOperatorRig, animateOperatorRig, createWeaponModel, preloadCharacterModels } from './models.js';
import { getStudioEnvMap } from './textures.js';
import { createMuzzleFlashRig, triggerMuzzleFlash, updateMuzzleFlash, ShellEjectionPool } from './weaponEffects.js';
import { soundEngine } from './audio.js';

export class LobbyShowcase {
  constructor(canvas) {
    this.canvas = canvas;
    preloadCharacterModels();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.scene = new THREE.Scene();
    this.scene.environment = getStudioEnvMap();
    this.scene.environmentIntensity = 1.25;
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 60);
    this.camera.position.set(0, 1.35, 3.6);
    this.camera.lookAt(0, 1.05, 0);

    this.mode = 'operator'; // 'operator' | 'weapon'
    this.paused = false;
    this.userYaw = 0.28;
    this.weaponPitch = 0.04;
    this.weaponZoom = 2.25;
    this.isDragging = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.operatorRig = null;
    this.weaponPreview = null;
    this.weaponPreviewMeta = null;
    this._lastOperatorKey = '';
    this._lastWeaponKey = '';
    this.previewRecoilZ = 0;
    this.previewRecoilPitch = 0;
    this.previewReloadEnd = 0;
    this.previewReloadStart = 0;
    this.previewBurstTimers = [];
    this.shellPool = new ShellEjectionPool(this.scene, 18);

    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    this.setupStage();
    this.bindEvents();
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupStage() {
    const hemi = new THREE.HemisphereLight('#e0f2fe', '#334155', 1.32);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.35);
    keyLight.position.set(2.8, 5.2, 4.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(keyLight);

    const frontFill = new THREE.DirectionalLight('#f8fafc', 1.10);
    frontFill.position.set(-1.5, 2.2, 4.4);
    this.scene.add(frontFill);

    const rimCyan = new THREE.PointLight('#38bdf8', 3.4, 12);
    rimCyan.position.set(-2.5, 2.2, -1.8);
    this.scene.add(rimCyan);

    const rimAmber = new THREE.PointLight('#fb923c', 2.6, 12);
    rimAmber.position.set(2.5, 1.5, -1.5);
    this.scene.add(rimAmber);

    // Multi-tiered Tactical Armored Turntable Pedestal
    const outerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.32, 1.48, 0.10, 48),
      new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.82, roughness: 0.24 })
    );
    outerBase.position.y = -0.09;
    outerBase.receiveShadow = true;
    this.stageGroup.add(outerBase);

    const innerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.12, 1.22, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.78, roughness: 0.30 })
    );
    innerBase.position.y = -0.03;
    innerBase.receiveShadow = true;
    this.stageGroup.add(innerBase);

    this.ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(1.06, 1.13, 48),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.015;
    this.stageGroup.add(this.ringMesh);

    this.outerRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(1.26, 1.30, 32),
      new THREE.MeshBasicMaterial({ color: '#f97316', side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    this.outerRingMesh.rotation.x = -Math.PI / 2;
    this.outerRingMesh.position.y = -0.035;
    this.stageGroup.add(this.outerRingMesh);

    // Background Hangar Pillars & Subtle Tactical Grid Floor
    const grid = new THREE.GridHelper(18, 24, '#0f294a', '#0a1426');
    grid.position.y = -0.15;
    this.scene.add(grid);

    const pillarMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.75, roughness: 0.35 });
    const stripMat = new THREE.MeshBasicMaterial({ color: '#0284c7' });
    for (const px of [-3.4, 3.4]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.5, 0.45), pillarMat);
      pillar.position.set(px, 2.1, -3.2);
      const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.6, 0.06), stripMat);
      lightStrip.position.set(px * 0.92, 2.1, -2.96);
      this.scene.add(pillar, lightStrip);
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      if (!this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || this.paused) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.userYaw += dx * 0.01;
      if (this.mode === 'weapon') {
        this.weaponPitch = Math.max(-0.55, Math.min(0.55, this.weaponPitch + dy * 0.007));
      }
    });
    this.canvas.addEventListener('wheel', (e) => {
      if (this.paused || this.mode !== 'weapon') return;
      this.weaponZoom = Math.max(1.45, Math.min(3.10, this.weaponZoom + (e.deltaY > 0 ? 0.14 : -0.14)));
    }, { passive: true });
  }

  setMode(mode = 'operator') {
    this.mode = mode;
    if (this.operatorRig) this.operatorRig.group.visible = mode === 'operator';
    if (this.weaponPreview) this.weaponPreview.visible = mode === 'weapon';
    this._clearPreviewTimers();

    if (mode === 'weapon') {
      this.userYaw = 0.45;
      this.weaponPitch = 0.05;
      this.weaponZoom = 2.25;
    } else {
      this.userYaw = 0.25;
      this.shellPool.clear();
    }
  }

  _clearPreviewTimers() {
    for (const t of this.previewBurstTimers) clearTimeout(t);
    this.previewBurstTimers = [];
  }

  updateOperator({ operator = 'vanguard', outfit = 'urban', primary = 'ak47', skinId = 'default', attachments = {}, username = 'Chiến Binh' }) {
    const key = `${operator}|${outfit}|${primary}|${skinId}|${attachments?.optic || ''}|${attachments?.muzzle || ''}|${attachments?.mag || ''}|${username}`;
    if (this._lastOperatorKey === key && this.operatorRig) {
      this.operatorRig.group.visible = this.mode === 'operator';
      return;
    }
    this._lastOperatorKey = key;

    if (this.operatorRig) {
      this.operatorRig.disposed = true;
      this.stageGroup.remove(this.operatorRig.group);
    }
    this.operatorRig = createOperatorRig({
      operator,
      outfit,
      team: 'alpha',
      weaponId: primary,
      skinId,
      attachments,
      name: username,
      isAlly: true
    });
    this.operatorRig.group.rotation.y = Math.PI;
    this.operatorRig.nameplate.visible = false;
    this.operatorRig.group.visible = this.mode === 'operator';
    this.stageGroup.add(this.operatorRig.group);
  }

  updateWeapon({ weaponId = 'ak47', skinId = 'default', attachments = {} }) {
    const key = `${weaponId}|${skinId}|${attachments?.optic || ''}|${attachments?.muzzle || ''}|${attachments?.mag || ''}`;
    if (this._lastWeaponKey === key && this.weaponPreview) {
      this.weaponPreview.visible = this.mode === 'weapon';
      return;
    }
    this._lastWeaponKey = key;

    this._clearPreviewTimers();
    this.previewReloadEnd = 0;
    this.previewRecoilZ = 0;
    this.previewRecoilPitch = 0;
    this.shellPool.clear();

    if (this.weaponPreview) {
      this.stageGroup.remove(this.weaponPreview);
    }
    const holder = new THREE.Group();
    const gun = createWeaponModel(weaponId, skinId, attachments);
    const wCfg = WEAPONS[weaponId] || WEAPONS.ak47;
    const isPistol = wCfg.subClass === 'pistol';
    const isLong = wCfg.isSniper || wCfg.subClass === 'lmg' || weaponId === 'm16a4' || weaponId === 'fal' || weaponId === 'benellim4' || weaponId === 'db_shotgun';
    const isMelee = Boolean(wCfg.isMelee);
    const scale = isPistol ? 2.35 : (isLong ? 1.56 : 1.92);

    // Attach volumetric muzzle flash & shell ejection port anchor onto Shop/Armory preview weapon
    let flashRig = null;
    let ejectAnchor = null;
    if (!isMelee) {
      flashRig = createMuzzleFlashRig(true);
      if (gun.userData.muzzlePos) flashRig.position.copy(gun.userData.muzzlePos);
      gun.add(flashRig);

      ejectAnchor = new THREE.Object3D();
      ejectAnchor.userData.keepWithGlb = true;
      if (gun.userData.ejectPortPos) ejectAnchor.position.copy(gun.userData.ejectPortPos);
      gun.add(ejectAnchor);
    }

    gun.scale.setScalar(scale);
    gun.rotation.y = Math.PI * 0.5;
    holder.position.set(0, 1.15, 0);
    holder.add(gun);
    holder.visible = this.mode === 'weapon';
    this.weaponPreview = holder;
    this.weaponPreviewMeta = {
      weaponId,
      skinId,
      attachments,
      gun,
      flashRig,
      ejectAnchor,
      isMelee,
      isSuppressed: Boolean(gun.userData.isSuppressed),
      isShotgun: wCfg.subClass === 'shotgun',
      isSniper: Boolean(wCfg.isSniper),
      isAuto: !isMelee && wCfg.fireMode === 'auto'
    };
    this.stageGroup.add(holder);
  }

  _fireSinglePreviewShot() {
    const meta = this.weaponPreviewMeta;
    if (!meta || !this.weaponPreview || this.mode !== 'weapon') return;
    soundEngine.ensureContext();
    soundEngine.playGunshot(meta.weaponId, meta.isSuppressed, 0);

    if (meta.isMelee) {
      this.previewRecoilPitch = -0.55;
      this.previewRecoilZ = 0.16;
      return;
    }

    meta.gun.userData?.glbController?.play('fire');
    const power = meta.isSniper || meta.isShotgun ? 1.25 : 0.95;
    if (meta.flashRig) {
      triggerMuzzleFlash(meta.flashRig, { isAds: false, isSuppressed: meta.isSuppressed, power });
    }
    this.previewRecoilZ = Math.min(0.14, this.previewRecoilZ + (meta.isSniper ? 0.11 : 0.065));
    this.previewRecoilPitch = Math.min(0.28, this.previewRecoilPitch + (meta.isSniper ? 0.22 : 0.10));

    if (meta.ejectAnchor && meta.weaponId !== 'magnum') {
      const origin = new THREE.Vector3();
      meta.ejectAnchor.getWorldPosition(origin);
      const q = new THREE.Quaternion();
      meta.gun.getWorldQuaternion(q);
      const rightW = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
      const upW = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
      const fwdW = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
      this.shellPool.spawn(origin, rightW, upW, fwdW, {
        isShotgun: meta.isShotgun,
        floorY: 0.02,
        onBounce: (isSg) => soundEngine.playShellClink(isSg)
      });
    }
  }

  triggerWeaponPreviewFire() {
    const meta = this.weaponPreviewMeta;
    if (!meta || this.mode !== 'weapon') return;
    this._clearPreviewTimers();
    this.previewReloadEnd = 0;

    // Automatic weapons fire a snappy 3-round tactical burst in Armory showcase!
    this._fireSinglePreviewShot();
    if (meta.isAuto) {
      this.previewBurstTimers.push(setTimeout(() => this._fireSinglePreviewShot(), 105));
      this.previewBurstTimers.push(setTimeout(() => this._fireSinglePreviewShot(), 210));
    }
  }

  triggerWeaponPreviewReload() {
    const meta = this.weaponPreviewMeta;
    if (!meta || meta.isMelee || this.mode !== 'weapon') return;
    this._clearPreviewTimers();
    soundEngine.ensureContext();
    const durMs = 1900;
    this.previewReloadStart = performance.now();
    this.previewReloadEnd = this.previewReloadStart + durMs;
    soundEngine.playReloadSequence(durMs, meta.weaponId);
    meta.gun.userData?.glbController?.play('reload');
  }

  setPaused(flag) {
    this.paused = Boolean(flag);
    this.canvas.style.display = this.paused ? 'none' : 'block';
    if (!this.paused) {
      this.lastTime = performance.now();
    }
  }

  animate(now) {
    requestAnimationFrame(this.animate);
    if (this.paused) return;

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const tSec = now * 0.001;

    if (!this.isDragging && this.previewReloadEnd <= now) {
      this.userYaw += dt * (this.mode === 'weapon' ? 0.30 : 0.14);
    }

    if (this.mode === 'weapon') {
      this.camera.position.lerp(new THREE.Vector3(0, 1.24, this.weaponZoom), Math.min(1, 7 * dt));
      this.camera.lookAt(0, 1.12, 0);
      this.shellPool.update(dt);

      if (this.weaponPreview && this.weaponPreviewMeta) {
        const meta = this.weaponPreviewMeta;
        const gunData = meta.gun.userData;
        gunData?.glbController?.update(dt);
        if (meta.flashRig) updateMuzzleFlash(meta.flashRig, dt);

        this.previewRecoilZ += (0 - this.previewRecoilZ) * Math.min(1, 14 * dt);
        this.previewRecoilPitch += (0 - this.previewRecoilPitch) * Math.min(1, 12 * dt);

        let reloadTiltX = 0;
        let reloadTiltZ = 0;
        let boltOffset = Math.max(0, this.previewRecoilZ * 0.85);

        if (this.previewReloadEnd > now) {
          const total = Math.max(200, this.previewReloadEnd - this.previewReloadStart);
          const r = Math.min(1, (now - this.previewReloadStart) / total);
          // 4-Stage Tactical Reload in Shop Preview: Tilt -> Drop Mag -> Slam Mag -> Rack Charging Handle
          reloadTiltX = Math.sin(r * Math.PI) * 0.24;
          reloadTiltZ = -Math.sin(r * Math.PI) * 0.18;

          if (gunData?.magMesh && gunData?.magBasePos) {
            let dropY = 0;
            let dropTilt = 0;
            if (r < 0.20) {
              dropY = 0;
            } else if (r < 0.48) {
              const p = (r - 0.20) / 0.28;
              dropY = p * 0.26;
              dropTilt = p * 0.28;
            } else if (r < 0.72) {
              const p = 1 - (r - 0.48) / 0.24;
              dropY = p * 0.26;
              dropTilt = p * 0.22;
            }
            gunData.magMesh.position.y = gunData.magBasePos.y - dropY;
            gunData.magMesh.rotation.x = dropTilt;
          }
          // Stage 4: Charging handle pull back & snap forward (0.76 -> 0.94)
          if (r >= 0.76 && r <= 0.95) {
            const cp = (r - 0.76) / 0.19;
            boltOffset = Math.sin(cp * Math.PI) * 0.085;
          }
        } else {
          if (gunData?.magMesh && gunData?.magBasePos) {
            gunData.magMesh.position.copy(gunData.magBasePos);
            gunData.magMesh.rotation.x = 0;
          }
        }

        if (gunData?.boltMesh && gunData.boltBaseZ !== undefined) {
          gunData.boltMesh.position.z = gunData.boltBaseZ + boltOffset;
        }
        if (gunData?.triggerMesh) {
          gunData.triggerMesh.rotation.x = this.previewRecoilZ * 3.5;
        }

        this.weaponPreview.rotation.y = this.userYaw;
        this.weaponPreview.rotation.x = this.weaponPitch + reloadTiltX;
        this.weaponPreview.rotation.z = -this.previewRecoilPitch + reloadTiltZ;
        this.weaponPreview.position.y = 1.14 + Math.sin(tSec * 1.8) * 0.025;
        this.weaponPreview.position.x = -Math.cos(this.userYaw) * this.previewRecoilZ;
        this.weaponPreview.position.z = Math.sin(this.userYaw) * this.previewRecoilZ;
      }
    } else {
      this.camera.position.lerp(new THREE.Vector3(0.22, 1.32, 3.35), Math.min(1, 6 * dt));
      this.camera.lookAt(0, 1.02, 0);
      if (this.operatorRig) {
        this.operatorRig.group.rotation.y = Math.PI + Math.sin(this.userYaw) * 0.65;
        if (this.isDragging) {
          this.operatorRig.group.rotation.y = Math.PI + this.userYaw;
        }
        animateOperatorRig(
          this.operatorRig,
          { dead: false, crouch: false, moveSpeed: 0, victoryPose: true, showNameplate: false },
          dt,
          tSec
        );
      }
    }

    if (this.ringMesh) {
      this.ringMesh.material.opacity = 0.7 + Math.sin(tSec * 3) * 0.25;
    }
    if (this.outerRingMesh) {
      this.outerRingMesh.rotation.z = tSec * 0.4;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
