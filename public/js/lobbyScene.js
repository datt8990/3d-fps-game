// Interactive 3D Hangar Showcase for Main Lobby, Operator Select & Weapon Armory
import * as THREE from 'three';
import { createOperatorRig, animateOperatorRig, createWeaponModel } from './models.js';

export class LobbyShowcase {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 60);
    this.camera.position.set(0, 1.35, 3.6);
    this.camera.lookAt(0, 1.05, 0);

    this.mode = 'operator'; // 'operator' | 'weapon'
    this.paused = false;
    this.userYaw = 0.28;
    this.isDragging = false;
    this.lastMouseX = 0;

    this.operatorRig = null;
    this.weaponPreview = null;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    this.setupStage();
    this.bindEvents();
    this.lastTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupStage() {
    const hemi = new THREE.HemisphereLight('#93c5fd', '#0f172a', 1.0);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight('#f8fafc', 1.65);
    keyLight.position.set(3, 5, 4);
    this.scene.add(keyLight);

    const rimCyan = new THREE.PointLight('#06b6d4', 2.4, 10);
    rimCyan.position.set(-2.5, 2.2, -1.8);
    this.scene.add(rimCyan);

    const rimAmber = new THREE.PointLight('#f97316', 1.8, 10);
    rimAmber.position.set(2.5, 1.5, -1.5);
    this.scene.add(rimAmber);

    // Tactical Glowing Pedestal
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.28, 0.12, 40),
      new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.75, roughness: 0.28 })
    );
    base.position.y = -0.06;
    this.stageGroup.add(base);

    this.ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(1.06, 1.13, 48),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide })
    );
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.005;
    this.stageGroup.add(this.ringMesh);

    // Subtle background tactical grid floor
    const grid = new THREE.GridHelper(18, 24, '#1e3a8a', '#0f172a');
    grid.position.y = -0.12;
    this.scene.add(grid);
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
    });
    window.addEventListener('pointerup', () => {
      this.isDragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging || this.paused) return;
      const dx = e.clientX - this.lastMouseX;
      this.lastMouseX = e.clientX;
      this.userYaw += dx * 0.01;
    });
  }

  setMode(mode = 'operator') {
    this.mode = mode;
    if (this.operatorRig) this.operatorRig.group.visible = mode === 'operator';
    if (this.weaponPreview) this.weaponPreview.visible = mode === 'weapon';

    if (mode === 'weapon') {
      this.userYaw = 0.65;
    } else {
      this.userYaw = 0.25;
    }
  }

  updateOperator({ operator = 'vanguard', outfit = 'urban', primary = 'ak47', skinId = 'default', attachments = {}, username = 'Chiến Binh' }) {
    if (this.operatorRig) {
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
    // Face toward camera (+Z -> rotation.y = Math.PI)
    this.operatorRig.group.rotation.y = Math.PI;
    this.operatorRig.nameplate.visible = false;
    this.operatorRig.group.visible = this.mode === 'operator';
    this.stageGroup.add(this.operatorRig.group);
  }

  updateWeapon({ weaponId = 'ak47', skinId = 'default', attachments = {} }) {
    if (this.weaponPreview) {
      this.stageGroup.remove(this.weaponPreview);
    }
    const holder = new THREE.Group();
    const gun = createWeaponModel(weaponId, skinId, attachments);
    const scale = weaponId === 'deagle' ? 2.25 : (weaponId === 'awp' ? 1.55 : 1.85);
    gun.scale.setScalar(scale);
    gun.rotation.y = Math.PI * 0.5;
    holder.position.set(0, 1.15, 0);
    holder.add(gun);
    holder.visible = this.mode === 'weapon';
    this.weaponPreview = holder;
    this.stageGroup.add(holder);
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

    if (!this.isDragging) {
      this.userYaw += dt * (this.mode === 'weapon' ? 0.38 : 0.14);
    }

    if (this.mode === 'weapon') {
      this.camera.position.lerp(new THREE.Vector3(0, 1.24, 2.35), Math.min(1, 6 * dt));
      this.camera.lookAt(0, 1.12, 0);
      if (this.weaponPreview) {
        this.weaponPreview.rotation.y = this.userYaw;
        this.weaponPreview.position.y = 1.14 + Math.sin(tSec * 1.8) * 0.03;
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

    this.renderer.render(this.scene, this.camera);
  }
}
