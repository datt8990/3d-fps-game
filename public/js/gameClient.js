// Upgraded 3D FPS Engine v2.0: 12 Weapons, Buckshot, Frag Grenades, Kill Streaks, Radio & Dual-Zoom Scope
import * as THREE from 'three';
import {
  PHYSICS,
  OPERATORS,
  WEAPONS,
  getEffectiveWeaponStats
} from '/shared/constants.js';
import { MAPS } from '/shared/maps.js';
import { stepPlayerPhysics, depenetratePlayerXZ } from '/shared/physics.js';
import { buildThreeMap, createLootCrateMesh } from './mapBuilder.js';
import {
  createFirstPersonRig,
  createOperatorRig,
  swapRigWeapon,
  animateOperatorRig,
  createGrenadeMesh
} from './models.js';
import { soundEngine } from './audio.js';

function shortestAngleDiff(from, to) {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

export class FPSGameClient {
  constructor(canvas, net, hud) {
    this.canvas = canvas;
    this.net = net;
    this.hud = hud;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 320);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.active = false;
    this.quality = 'high';
    this.sensitivity = 0.0022;
    this.baseFov = 75;
    const savedFps = localStorage.getItem('bs_fps_cap');
    this.fpsCap = savedFps !== null && Number.isFinite(Number(savedFps)) ? Number(savedFps) : 60;

    this.mapId = 'warehouse';
    this.mapData = MAPS.warehouse;
    this.mode = 'tdm';
    this.modeConfig = null;
    this.mapObjects = null;
    this.lootMeshes = new Map();
    this.grenadeMeshes = new Map();

    this.localId = null;
    this.localMeta = null;
    this.local = {
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: 0,
      onGround: true,
      crouching: false,
      eyeHeight: PHYSICS.EYE_STAND,
      hp: 100, maxHp: 100,
      armor: 100, maxArmor: 100,
      dead: false,
      respawnUntil: 0,
      hasBomb: false,
      slot: 1,
      weaponId: 'ak47',
      primaryId: 'ak47',
      secondaryId: 'deagle',
      meleeId: 'knife',
      ammo: 30,
      reserveAmmo: 90,
      grenades: 1,
      reloadingStart: 0,
      reloadingEnd: 0,
      lastFireTime: 0,
      kills: 0
    };

    this.keys = {};
    this.mouseDownLeft = false;
    this.adsActive = false;
    this.sniperZoomStage = 0;
    this.pointerLocked = false;
    this.uiModalOpen = false;
    this.radioOpen = false;

    this.fpRig = null;
    this.vmKickZ = 0;
    this.vmKickPitch = 0;
    this.recoilAccumPitch = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobTimer = 0;
    this.footstepTimer = 0;
    this.muzzleLight = new THREE.PointLight('#fbbf24', 0, 7);
    this.camera.add(this.muzzleLight);

    this.remoteEntities = new Map();
    this.rosterMeta = new Map();
    this.activeEffects = [];

    this.latestBomb = null;
    this.latestStorm = null;
    this.lastBombBeepSec = -1;
    this.lastSnapshotPlayers = [];

    this.frameCount = 0;
    this.fpsAccumTime = 0;
    this.currentFps = 60;
    this.inputSeq = 0;
    this.lastInputSendAt = 0;

    this.bindInputEvents();
    this.lastFrameAt = performance.now();
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  }

  applySettings({ sensitivity, quality, volume, fpsCap }) {
    if (sensitivity !== undefined) {
      this.sensitivity = 0.0006 + Number(sensitivity) * 0.0032;
    }
    if (quality) {
      this.quality = quality;
      this.renderer.shadowMap.enabled = quality !== 'low';
      this.renderer.setPixelRatio(quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    }
    if (volume !== undefined) {
      soundEngine.setVolume(volume);
    }
    if (fpsCap !== undefined) {
      this.fpsCap = Number(fpsCap) || 0;
      localStorage.setItem('bs_fps_cap', String(this.fpsCap));
      this.frameCount = 0;
      this.fpsAccumTime = 0;
    }
  }

  refreshHudWeapon() {
    this.hud.updateWeaponHUD(
      this.local.slot,
      this.local.weaponId,
      this.local.ammo,
      this.local.reserveAmmo,
      this.local.primaryId,
      this.local.secondaryId,
      this.local.meleeId,
      this.local.grenades
    );
  }

  bindInputEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const lockPromptEl = document.getElementById('hud-lock-prompt');
    lockPromptEl?.addEventListener('click', () => {
      if (this.active && !this.uiModalOpen) this.requestLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      const lockHint = document.getElementById('hud-lock-prompt');
      if (lockHint && this.active) {
        lockHint.classList.toggle('hidden', this.pointerLocked || this.uiModalOpen);
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.active || this.uiModalOpen) return;
      soundEngine.ensureContext();

      if (!this.pointerLocked) {
        this.requestLock();
        return;
      }

      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.tryFireWeapon(false);
      } else if (e.button === 2) {
        const w = WEAPONS[this.local.weaponId];
        if (w?.isMelee) {
          this.tryFireWeapon(true);
        } else if (w?.isSniper) {
          this.sniperZoomStage = (this.sniperZoomStage + 1) % 3;
          this.adsActive = this.sniperZoomStage > 0;
          soundEngine.playMetallicClick(1050, 0.04, 0.18);
        } else {
          this.adsActive = !this.adsActive;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.pointerLocked || this.uiModalOpen || this.local.dead) return;
      const zoomScale = this.sniperZoomStage === 2 ? 0.22 : (this.adsActive ? 0.55 : 1.0);
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      const pitchDelta = dy * this.sensitivity * zoomScale;

      this.local.yaw -= dx * this.sensitivity * zoomScale;
      this.local.pitch = Math.max(-1.50, Math.min(1.50, this.local.pitch - pitchDelta));

      // If player manually compensates recoil downward, reduce accumulated auto-recovery pitch
      if (pitchDelta > 0 && this.recoilAccumPitch > 0) {
        this.recoilAccumPitch = Math.max(0, this.recoilAccumPitch - pitchDelta);
      }

      this.swayX = Math.max(-0.032, Math.min(0.032, this.swayX - dx * 0.00028));
      this.swayY = Math.max(-0.032, Math.min(0.032, this.swayY + dy * 0.00028));
    });

    window.addEventListener('wheel', (e) => {
      if (!this.active || !this.pointerLocked || this.uiModalOpen || this.local.dead) return;
      const next = e.deltaY > 0 ? (this.local.slot % 3) + 1 : ((this.local.slot + 1) % 3) + 1;
      this.requestWeaponSwitch(next);
    });

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;

      if (e.code === 'Escape') {
        if (this.uiModalOpen) {
          this.closeInGameChat();
          this.toggleBuyWeaponModal(false);
          return;
        }
        if (this.radioOpen) {
          this.radioOpen = false;
          this.hud.toggleRadioMenu(false);
          return;
        }
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        this.hud.renderScoreboard(this.enrichPlayersForScoreboard(), this.localId, this.modeConfig?.teamBased);
        this.hud.toggleScoreboard(true);
        return;
      }

      const chatInput = document.getElementById('ingame-chat-input');
      if (e.code === 'Enter') {
        if (document.activeElement === chatInput) return;
        e.preventDefault();
        this.openInGameChat();
        return;
      }

      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      // Radio Quick Callout Menu [Z] + [1..6]
      if (e.code === 'KeyZ') {
        this.radioOpen = !this.radioOpen;
        this.hud.toggleRadioMenu(this.radioOpen);
        return;
      }
      if (this.radioOpen && /^Digit[1-6]$/.test(e.code)) {
        const keyNum = e.code.replace('Digit', '');
        this.net.send({ type: 'radio', key: keyNum });
        this.radioOpen = false;
        this.hud.toggleRadioMenu(false);
        soundEngine.playUiTone(880, 0.06);
        return;
      }

      this.keys[e.code] = true;

      if (e.code === 'Digit1') this.requestWeaponSwitch(1);
      else if (e.code === 'Digit2') this.requestWeaponSwitch(2);
      else if (e.code === 'Digit3') this.requestWeaponSwitch(3);
      else if (e.code === 'KeyQ') this.requestWeaponSwitch(this.local.slot === 1 ? 2 : 1);
      else if (e.code === 'KeyR') this.requestReload();
      else if (e.code === 'KeyG') this.requestThrowGrenade();
      else if (e.code === 'KeyB') this.toggleBuyWeaponModal();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Tab') {
        this.hud.toggleScoreboard(false);
      }
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  }

  openInGameChat() {
    const wrap = document.getElementById('ingame-chat-form');
    const input = document.getElementById('ingame-chat-input');
    if (!wrap || !input) return;
    this.uiModalOpen = true;
    document.exitPointerLock?.();
    wrap.classList.remove('hidden');
    input.focus();
  }

  closeInGameChat() {
    const wrap = document.getElementById('ingame-chat-form');
    const input = document.getElementById('ingame-chat-input');
    if (wrap) wrap.classList.add('hidden');
    if (input) input.blur();
    this.uiModalOpen = false;
    if (this.active) this.requestLock();
  }

  toggleBuyWeaponModal(forceState) {
    const modal = document.getElementById('ingame-weapon-modal');
    if (!modal) return;
    const willOpen = forceState !== undefined ? forceState : modal.classList.contains('hidden');
    modal.classList.toggle('hidden', !willOpen);
    this.uiModalOpen = willOpen;
    if (willOpen) {
      document.exitPointerLock?.();
    } else if (this.active) {
      this.requestLock();
    }
  }

  startMatchSession(payload, localClientId) {
    this.stopMatchSession();
    this.active = true;
    this.localId = localClientId;
    this.canvas.style.display = 'block';

    this.mapId = payload.mapId || 'warehouse';
    this.mapData = MAPS[this.mapId] || MAPS.warehouse;
    this.mode = payload.mode || 'tdm';
    this.modeConfig = payload.modeConfig;
    this.latestBomb = null;
    this.latestStorm = payload.storm || null;

    this.hud.setRoomCode(payload.room?.code || '');

    this.rosterMeta.clear();
    for (const p of payload.room?.players || []) {
      this.rosterMeta.set(p.id, p);
    }
    this.localMeta = this.rosterMeta.get(this.localId) || {
      operator: 'vanguard',
      outfit: 'urban',
      primary: 'ak47',
      secondary: 'deagle',
      melee: 'knife',
      skins: {},
      attachments: {},
      team: 'alpha'
    };

    this.local.primaryId = this.localMeta.primary || 'ak47';
    this.local.secondaryId = this.localMeta.secondary || 'deagle';
    this.local.meleeId = this.localMeta.melee || 'knife';
    this.local.grenades = this.localMeta.grenades ?? (this.mode === 'practice' ? 5 : 1);

    // Initialize local position directly to authoritative spawn point so we never start at (0,0,0) inside a central block!
    const fallbackSpawn = this.mapData.spawns?.alpha?.[0] || { x: -6, y: 0, z: -28, yaw: Math.PI };
    this.local.x = Number.isFinite(this.localMeta.x) ? this.localMeta.x : fallbackSpawn.x;
    this.local.y = Number.isFinite(this.localMeta.y) ? this.localMeta.y : (fallbackSpawn.y || 0);
    this.local.z = Number.isFinite(this.localMeta.z) ? this.localMeta.z : fallbackSpawn.z;
    this.local.yaw = Number.isFinite(this.localMeta.yaw) ? this.localMeta.yaw : (fallbackSpawn.yaw || Math.PI);
    this.local.pitch = 0;
    this.local.vx = 0;
    this.local.vy = 0;
    this.local.vz = 0;
    this.local.dead = false;
    this.local.onGround = true;
    depenetratePlayerXZ(this.local, PHYSICS.HEIGHT_STAND, PHYSICS.PLAYER_RADIUS, this.mapData);

    const wStats = getEffectiveWeaponStats(
      this.local.primaryId,
      this.localMeta?.attachments?.[this.local.primaryId] || {},
      this.localMeta?.operator || 'vanguard'
    );
    this.local.slot = 1;
    this.local.weaponId = this.local.primaryId;
    this.local.ammo = this.localMeta.ammo ?? wStats.magSize;
    this.local.reserveAmmo = this.localMeta.reserveAmmo ?? wStats.reserveAmmo;
    this.local.hp = this.localMeta.hp ?? 100;
    this.local.armor = this.localMeta.armor ?? 100;
    this.local.maxArmor = this.localMeta.maxArmor ?? 100;

    this.mapObjects = buildThreeMap(this.scene, this.mapData, this.mode, this.quality);

    for (const crate of payload.lootCrates || []) {
      if (!crate.active) continue;
      const m = createLootCrateMesh(crate.type);
      m.position.set(crate.x, crate.y, crate.z);
      this.mapObjects.worldGroup.add(m);
      this.lootMeshes.set(crate.id, m);
    }

    this.camera.position.set(this.local.x, this.local.y + PHYSICS.EYE_STAND, this.local.z);
    this.camera.rotation.y = this.local.yaw;
    this.camera.rotation.x = 0;

    this.rebuildFirstPersonRig(this.local.primaryId);
    this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor);
    this.refreshHudWeapon();

    setTimeout(() => {
      if (this.active && !this.uiModalOpen) this.requestLock();
    }, 120);
  }

  stopMatchSession() {
    this.active = false;
    this.mouseDownLeft = false;
    this.adsActive = false;
    this.sniperZoomStage = 0;
    this.uiModalOpen = false;
    this.radioOpen = false;
    this.hud.toggleRadioMenu(false);
    document.exitPointerLock?.();
    this.canvas.style.display = 'none';

    if (this.mapObjects?.worldGroup) {
      this.scene.remove(this.mapObjects.worldGroup);
      this.mapObjects = null;
    }
    for (const ent of this.remoteEntities.values()) {
      this.scene.remove(ent.rig.group);
    }
    this.remoteEntities.clear();
    this.lootMeshes.clear();

    for (const gm of this.grenadeMeshes.values()) {
      this.scene.remove(gm);
    }
    this.grenadeMeshes.clear();

    for (const eff of this.activeEffects) {
      this.scene.remove(eff.mesh);
    }
    this.activeEffects = [];

    if (this.fpRig) {
      this.camera.remove(this.fpRig);
      this.fpRig = null;
    }
  }

  syncRosterFromLobby(roomPayload) {
    if (!roomPayload?.players) return;
    for (const p of roomPayload.players) {
      this.rosterMeta.set(p.id, p);
      if (p.id === this.localId) this.localMeta = p;
    }
  }

  rebuildFirstPersonRig(weaponId) {
    if (this.fpRig) {
      this.camera.remove(this.fpRig);
      this.fpRig = null;
    }
    const skinId = this.localMeta?.skins?.[weaponId] || 'default';
    const att = this.localMeta?.attachments?.[weaponId] || {};
    const outfitId = this.localMeta?.outfit || 'urban';

    this.fpRig = createFirstPersonRig(weaponId, skinId, att, outfitId);
    this.fpRig.position.set(0.22, -0.22, -0.38);
    this.camera.add(this.fpRig);
  }

  getLocalWeaponStats() {
    const wId = this.local.weaponId || 'ak47';
    const att = this.localMeta?.attachments?.[wId] || {};
    const op = this.localMeta?.operator || 'vanguard';
    return getEffectiveWeaponStats(wId, att, op);
  }

  requestWeaponSwitch(slot) {
    if (this.local.dead || slot === this.local.slot) return;
    this.adsActive = false;
    this.sniperZoomStage = 0;
    soundEngine.playMetallicClick(860, 0.045, 0.16);
    this.net.send({ type: 'switch_weapon', slot });
  }

  requestReload() {
    if (this.local.dead) return;
    const st = this.getLocalWeaponStats();
    if (st.isMelee || this.local.ammo >= st.magSize || this.local.reserveAmmo <= 0) return;
    if (performance.now() < this.local.reloadingEnd) return;
    this.adsActive = false;
    this.sniperZoomStage = 0;
    this.net.send({ type: 'reload' });
  }

  requestThrowGrenade() {
    if (!this.active || this.local.dead || this.uiModalOpen || this.local.grenades <= 0) return;
    soundEngine.playGrenadeThrow();
    this.net.send({
      type: 'throw_grenade',
      yaw: this.local.yaw,
      pitch: this.local.pitch
    });
  }

  tryFireWeapon(heavyMelee = false) {
    if (!this.active || this.local.dead || this.uiModalOpen) return;
    const now = performance.now();
    if (now < this.local.reloadingEnd) return;

    const st = this.getLocalWeaponStats();
    if (now - this.local.lastFireTime < st.fireIntervalMs) return;

    if (!st.isMelee && this.local.ammo <= 0) {
      this.local.lastFireTime = now;
      soundEngine.playEmptyClick();
      if (this.local.reserveAmmo > 0) this.requestReload();
      return;
    }

    this.local.lastFireTime = now;
    if (!st.isMelee) {
      this.local.ammo = Math.max(0, this.local.ammo - 1);
      this.refreshHudWeapon();
    }

    const horizSpeed = Math.hypot(this.local.vx, this.local.vz);
    let spread = this.adsActive ? st.spreadAds : st.spreadStand;
    if (!this.local.onGround) spread += st.spreadJump;
    else if (horizSpeed > 1.2) spread += st.spreadMove * Math.min(1, horizSpeed / 6.5);
    if (this.local.crouching) spread *= 0.68;

    const shotYaw = this.local.yaw + (Math.random() - 0.5) * spread;
    const shotPitch = Math.max(-1.52, Math.min(1.52, this.local.pitch + (Math.random() - 0.5) * spread));
    const eyeOrigin = {
      x: this.local.x,
      y: this.local.y + this.local.eyeHeight,
      z: this.local.z
    };

    this.net.send({
      type: 'fire',
      origin: eyeOrigin,
      yaw: shotYaw,
      pitch: shotPitch,
      heavy: heavyMelee,
      spreadApplied: (st.pellets || 1) <= 1
    });

    // Smooth, low-recoil kick with ADS/crouch stabilization & soft spray ceiling
    const recoilScale = (this.adsActive ? 0.65 : 1.0) * (this.local.crouching ? 0.72 : 1.0);
    const sprayDamp = this.recoilAccumPitch > 0.045 ? 0.25 : 1.0;
    const pitchKick = st.recoilPitch * recoilScale * sprayDamp;

    this.local.pitch = Math.min(1.50, this.local.pitch + pitchKick);
    this.recoilAccumPitch = Math.min(0.068, this.recoilAccumPitch + pitchKick);
    this.local.yaw += (Math.random() - 0.5) * st.recoilYaw * recoilScale * 1.4;
    this.vmKickZ = st.isMelee ? -0.11 : (this.adsActive ? 0.018 : 0.032);
    this.vmKickPitch = st.isMelee ? -0.26 : (this.adsActive ? 0.020 : 0.042);

    if (!st.isMelee && !st.suppressed) {
      this.triggerMuzzleFlash();
    }

    // Bolt-action AWP unscopes briefly; semi-auto Barrett M82 stays scoped!
    if (st.fireMode === 'bolt' && this.sniperZoomStage > 0) {
      const prevStage = this.sniperZoomStage;
      this.sniperZoomStage = 0;
      this.adsActive = false;
      setTimeout(() => {
        if (this.active && !this.local.dead && this.local.weaponId === st.id && performance.now() >= this.local.reloadingEnd) {
          this.sniperZoomStage = prevStage;
          this.adsActive = true;
        }
      }, 950);
    }
  }

  triggerMuzzleFlash() {
    const flash = this.fpRig?.userData?.flashGroup;
    if (flash) {
      flash.visible = true;
      flash.rotation.z = Math.random() * Math.PI;
      setTimeout(() => { flash.visible = false; }, 45);
    }
    this.muzzleLight.intensity = 2.6;
    setTimeout(() => { this.muzzleLight.intensity = 0; }, 50);
  }

  onPlayerSpawned(msg) {
    if (msg.id === this.localId) {
      this.local.x = msg.x;
      this.local.y = msg.y;
      this.local.z = msg.z;
      this.local.vx = 0;
      this.local.vy = 0;
      this.local.vz = 0;
      this.local.yaw = msg.yaw;
      this.local.pitch = 0;
      this.recoilAccumPitch = 0;
      this.local.dead = false;
      this.local.hp = msg.hp;
      this.local.armor = msg.armor;
      this.local.maxArmor = msg.maxArmor || 100;
      this.local.slot = msg.slot || 1;
      this.local.weaponId = msg.weaponId || this.local.primaryId;
      this.local.ammo = msg.ammo;
      this.local.reserveAmmo = msg.reserveAmmo;
      this.local.grenades = msg.grenades ?? 1;
      this.local.reloadingEnd = 0;
      this.adsActive = false;
      this.sniperZoomStage = 0;

      this.rebuildFirstPersonRig(this.local.weaponId);
      this.hud.setRespawnState(false);
      this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor);
      this.refreshHudWeapon();
    } else {
      const ent = this.remoteEntities.get(msg.id);
      if (ent) {
        ent.current.x = ent.target.x = msg.x;
        ent.current.y = ent.target.y = msg.y;
        ent.current.z = ent.target.z = msg.z;
        ent.target.dead = false;
      }
    }
  }

  onWeaponSwitched(msg) {
    if (msg.id === this.localId) {
      this.local.slot = msg.slot;
      this.local.weaponId = msg.weaponId;
      if (msg.slot === 1) this.local.primaryId = msg.weaponId;
      else if (msg.slot === 2) this.local.secondaryId = msg.weaponId;
      else if (msg.slot === 3) this.local.meleeId = msg.weaponId;
      this.local.ammo = msg.ammo;
      this.local.reserveAmmo = msg.reserveAmmo;
      this.local.reloadingEnd = 0;
      this.adsActive = false;
      this.sniperZoomStage = 0;
      this.rebuildFirstPersonRig(msg.weaponId);
      this.refreshHudWeapon();
    } else {
      const ent = this.remoteEntities.get(msg.id);
      if (ent) {
        const meta = this.rosterMeta.get(msg.id);
        swapRigWeapon(ent.rig, msg.weaponId, meta?.skins?.[msg.weaponId] || 'default', meta?.attachments?.[msg.weaponId] || {});
      }
    }
  }

  onPlayerReload(msg) {
    if (msg.id === this.localId) {
      const now = performance.now();
      this.local.reloadingStart = now;
      this.local.reloadingEnd = now + msg.durationMs;
      this.adsActive = false;
      this.sniperZoomStage = 0;
      soundEngine.playReloadSequence(msg.durationMs);
    }
  }

  onAmmoSync(msg) {
    this.local.ammo = msg.ammo;
    this.local.reserveAmmo = msg.reserveAmmo;
    this.local.reloadingEnd = 0;
    this.hud.updateReloadProgress(0);
    this.refreshHudWeapon();
  }

  onShotFired(msg) {
    const isMe = msg.shooterId === this.localId;
    if (isMe) {
      this.local.ammo = msg.ammo;
      this.local.reserveAmmo = msg.reserveAmmo;
      this.refreshHudWeapon();
      soundEngine.playGunshot(msg.weaponId, msg.suppressed, 0);
    } else {
      const dist = Math.hypot((msg.origin?.x || 0) - this.local.x, (msg.origin?.z || 0) - this.local.z);
      soundEngine.playGunshot(msg.weaponId, msg.suppressed, dist);
      if (!msg.suppressed) this.hud.markEnemyFired(msg.shooterId);
      const ent = this.remoteEntities.get(msg.shooterId);
      if (ent) ent.rig.recoilKick = 0.22;
    }

    const isMelee = msg.weaponId === 'knife' || msg.weaponId === 'karambit';
    if (!isMelee && msg.origin && msg.hitPoint) {
      let startPt = msg.origin;
      if (isMe && this.fpRig) {
        const worldMuzzle = new THREE.Vector3();
        this.fpRig.userData.flashGroup.getWorldPosition(worldMuzzle);
        startPt = worldMuzzle;
      }
      this.spawnTracerAndImpact(startPt, msg.hitPoint, msg.hitType);
      if (Array.isArray(msg.extraHits)) {
        for (const eh of msg.extraHits) {
          this.spawnTracerAndImpact(startPt, eh.point, eh.type);
        }
      }
    }
  }

  onGrenadeThrown(msg) {
    if (msg.ownerId === this.localId) {
      this.local.grenades = msg.grenadesLeft ?? 0;
      this.refreshHudWeapon();
    }
  }

  onGrenadeExploded(msg) {
    const gm = this.grenadeMeshes.get(msg.id);
    if (gm) {
      this.scene.remove(gm);
      this.grenadeMeshes.delete(msg.id);
    }
    const dist = Math.hypot(msg.x - this.local.x, msg.z - this.local.z);
    soundEngine.playExplosion(dist);

    // Visual Blast Fireball Sphere!
    const blastMat = new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.85 });
    const blast = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 14), blastMat);
    blast.position.set(msg.x, msg.y + 0.3, msg.z);
    this.scene.add(blast);
    this.activeEffects.push({ mesh: blast, mat: blastMat, life: 0.36, maxLife: 0.36, scaleUp: true, fastExpand: true });
  }

  onHitConfirm(msg) {
    soundEngine.playHitmarker(msg.hitZone === 'head', msg.killed);
    this.hud.showHitmarker(msg.damage, msg.hitZone, msg.killed);
  }

  onDamageTaken(msg) {
    this.local.hp = msg.hp;
    this.local.armor = msg.armor;
    this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor);
    this.hud.flashDamageTaken(msg.isStorm);
    soundEngine.playDamageTaken();
  }

  onKillEvent(msg) {
    this.hud.pushKillFeed(msg);
    if (msg.killerId === this.localId) {
      this.hud.showKillStreak(msg.streak || 1, msg.headshot, msg.firstBlood, msg.victimName);
      if ((msg.streak || 0) >= 2 || msg.firstBlood) {
        soundEngine.playStreakChord(msg.streak || 2);
      }
    }
    if (msg.victimId === this.localId) {
      this.local.dead = true;
      this.local.respawnUntil = msg.respawnSec > 0 ? performance.now() + msg.respawnSec * 1000 : 0;
      this.adsActive = false;
      this.sniperZoomStage = 0;
      if (this.fpRig) this.fpRig.visible = false;
    }
  }

  onLootPicked(msg) {
    const mesh = this.lootMeshes.get(msg.crateId);
    if (mesh && this.mapObjects?.worldGroup) {
      this.mapObjects.worldGroup.remove(mesh);
      this.lootMeshes.delete(msg.crateId);
    }
    if (msg.playerId === this.localId) {
      this.local.hp = msg.hp;
      this.local.armor = msg.armor;
      this.local.ammo = msg.ammo;
      this.local.reserveAmmo = msg.reserveAmmo;
      this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor);
      this.refreshHudWeapon();
      soundEngine.playUiTone(880, 0.14);
    }
  }

  onWorldState(msg) {
    if (!this.active) return;
    this.lastSnapshotPlayers = msg.players || [];
    this.latestBomb = msg.bomb || null;
    this.latestStorm = msg.storm || this.latestStorm;

    // Sync live grenade projectiles
    const activeGrenIds = new Set();
    for (const g of msg.grenades || []) {
      activeGrenIds.add(g.id);
      let gm = this.grenadeMeshes.get(g.id);
      if (!gm) {
        gm = createGrenadeMesh();
        this.scene.add(gm);
        this.grenadeMeshes.set(g.id, gm);
      }
      gm.position.set(g.x, g.y, g.z);
      gm.rotation.x += 0.25;
    }
    for (const [gid, gm] of this.grenadeMeshes.entries()) {
      if (!activeGrenIds.has(gid)) {
        this.scene.remove(gm);
        this.grenadeMeshes.delete(gid);
      }
    }

    const seenIds = new Set();
    let aliveCount = 0;

    for (const ps of msg.players) {
      seenIds.add(ps.id);
      if (!ps.dead) aliveCount++;

      if (ps.id === this.localId) {
        this.local.hp = ps.hp;
        this.local.armor = ps.armor;
        this.local.dead = Boolean(ps.dead);
        this.local.hasBomb = Boolean(ps.hasBomb);
        this.local.kills = ps.k || 0;
        if (this.fpRig) this.fpRig.visible = !this.local.dead && this.sniperZoomStage === 0;
        this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor);
        continue;
      }

      let ent = this.remoteEntities.get(ps.id);
      if (!ent) {
        const meta = this.rosterMeta.get(ps.id) || {
          name: ps.id.startsWith('bot_') ? '[BOT] Đặc Nhiệm' : 'Chiến Binh',
          team: 'bravo',
          operator: 'vanguard',
          outfit: 'crimson',
          skins: {},
          attachments: {}
        };
        const isAlly = Boolean(this.modeConfig?.teamBased && meta.team === this.localMeta?.team);
        const rig = createOperatorRig({
          operator: meta.operator,
          outfit: meta.outfit,
          team: meta.team,
          weaponId: ps.w || 'ak47',
          skinId: meta.skins?.[ps.w] || 'default',
          attachments: meta.attachments?.[ps.w] || {},
          name: meta.name,
          isAlly
        });
        rig.group.position.set(ps.x, ps.y, ps.z);
        this.scene.add(rig.group);
        ent = {
          id: ps.id,
          meta,
          isAlly,
          rig,
          current: { x: ps.x, y: ps.y, z: ps.z, yaw: ps.yaw, pitch: ps.pitch },
          target: { ...ps }
        };
        this.remoteEntities.set(ps.id, ent);
      } else {
        if (ps.w && ps.w !== ent.rig.currentWeaponId) {
          swapRigWeapon(ent.rig, ps.w, ent.meta.skins?.[ps.w] || 'default', ent.meta.attachments?.[ps.w] || {});
        }
        ent.target = { ...ps };
      }
    }

    for (const [id, ent] of this.remoteEntities.entries()) {
      if (!seenIds.has(id)) {
        this.scene.remove(ent.rig.group);
        this.remoteEntities.delete(id);
      }
    }

    this.hud.updateTopScoreAndTimer({
      mode: this.mode,
      modeConfig: this.modeConfig,
      alphaScore: msg.alphaScore,
      bravoScore: msg.bravoScore,
      roundNumber: msg.roundNumber,
      timeLeftSec: msg.timeLeftSec,
      myKills: this.local.kills,
      aliveCount
    });

    this.hud.updateBombHUD(this.latestBomb, this.local, this.mapData);
    this.updateWorldModeVisuals();
  }

  updateWorldModeVisuals() {
    if (!this.mapObjects) return;
    const c4 = this.mapObjects.worldC4;
    if (c4 && this.latestBomb) {
      if (this.latestBomb.planted) {
        c4.visible = true;
        c4.position.set(this.latestBomb.x, this.latestBomb.y + 0.06, this.latestBomb.z);
        const secInt = Math.ceil(this.latestBomb.bombLeftSec);
        if (secInt !== this.lastBombBeepSec && secInt > 0) {
          this.lastBombBeepSec = secInt;
          soundEngine.playBombBeep(secInt <= 10);
        }
      } else if (this.latestBomb.dropped) {
        c4.visible = true;
        c4.position.set(this.latestBomb.dropX, (this.latestBomb.dropY || 0) + 0.06, this.latestBomb.dropZ);
      } else {
        c4.visible = false;
      }
    }

    const sm = this.mapObjects.stormMesh;
    if (sm && this.latestStorm) {
      sm.position.x = this.latestStorm.x;
      sm.position.z = this.latestStorm.z;
      sm.scale.set(this.latestStorm.r, 1, this.latestStorm.r);
    }
  }

  spawnTracerAndImpact(start, end, hitType) {
    const p1 = new THREE.Vector3(start.x, start.y, start.z);
    const p2 = new THREE.Vector3(end.x, end.y, end.z);
    if (p1.distanceTo(p2) < 0.2) return;

    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.85 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.activeEffects.push({ mesh: line, mat, life: 0.075, maxLife: 0.075 });

    if (hitType === 'wall' || hitType === 'player') {
      const sparkColor = hitType === 'player' ? '#ef4444' : '#fbbf24';
      const sparkMat = new THREE.MeshBasicMaterial({ color: sparkColor, transparent: true, opacity: 0.95 });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(hitType === 'player' ? 0.08 : 0.055, 6, 6), sparkMat);
      spark.position.copy(p2);
      this.scene.add(spark);
      this.activeEffects.push({ mesh: spark, mat: sparkMat, life: 0.16, maxLife: 0.16, scaleUp: true });
    }
  }

  enrichPlayersForScoreboard() {
    return (this.lastSnapshotPlayers || []).map((p) => {
      const meta = this.rosterMeta.get(p.id);
      return {
        ...p,
        name: meta?.name || (p.id === this.localId ? 'Bạn' : p.id),
        team: meta?.team || 'ffa'
      };
    });
  }

  renderLoop(now) {
    requestAnimationFrame(this.renderLoop);
    if (!this.active) {
      this.lastFrameAt = now;
      return;
    }

    const elapsed = now - this.lastFrameAt;
    if (this.fpsCap > 0) {
      const iv = 1000 / this.fpsCap;
      if (elapsed < iv - 0.5) return;
      this.lastFrameAt = now - (elapsed % iv);
    } else {
      this.lastFrameAt = now;
    }
    const dt = Math.min(0.05, Math.max(0.001, elapsed / 1000));

    this.frameCount++;
    this.fpsAccumTime += dt;
    if (this.fpsAccumTime >= 0.5) {
      this.currentFps = Math.round(this.frameCount / this.fpsAccumTime);
      this.frameCount = 0;
      this.fpsAccumTime = 0;
      this.hud.updateFpsAndPing(this.currentFps, this.net.pingMs, this.fpsCap);
    }

    const wStats = this.getLocalWeaponStats();
    if (this.mouseDownLeft && wStats.fireMode === 'auto' && this.pointerLocked && !this.uiModalOpen) {
      this.tryFireWeapon(false);
    }

    this.updateLocalPlayer(dt, now, wStats);
    this.updateRemotePlayers(dt, now * 0.001);

    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const eff = this.activeEffects[i];
      eff.life -= dt;
      if (eff.life <= 0) {
        this.scene.remove(eff.mesh);
        eff.mesh.geometry?.dispose();
        eff.mat?.dispose();
        this.activeEffects.splice(i, 1);
      } else {
        eff.mat.opacity = eff.life / eff.maxLife;
        if (eff.scaleUp) {
          eff.mesh.scale.multiplyScalar(1 + dt * (eff.fastExpand ? 16 : 6));
        }
      }
    }

    for (const mesh of this.lootMeshes.values()) {
      mesh.rotation.y += dt * 1.6;
    }

    if (this.mapObjects?.bombMarkers) {
      const floatOff = Math.sin(now * 0.0028) * 0.14;
      for (const bm of this.mapObjects.bombMarkers) {
        if (bm.userData?.baseY !== undefined) {
          bm.position.y = bm.userData.baseY + floatOff;
        }
      }
    }

    if (this.mapObjects?.animatedProps) {
      for (const prop of this.mapObjects.animatedProps) {
        if (prop.type === 'spin_y') {
          prop.mesh.rotation.y += dt * (prop.speed || 1.0);
        } else if (prop.type === 'spin_multi') {
          prop.mesh.rotation.y += dt * (prop.speed || 1.2);
          prop.mesh.rotation.z = Math.sin(now * 0.0015) * 0.22;
        } else if (prop.type === 'crane_sway') {
          prop.mesh.position.x = (prop.baseX || 0) + Math.sin(now * 0.0005) * 6.5;
        }
      }
    }

    const enrichedPlayers = (this.lastSnapshotPlayers || []).map((p) => ({
      ...p,
      team: this.rosterMeta.get(p.id)?.team || ''
    }));
    this.hud.drawMinimap(
      this.mapData,
      { ...this.local, id: this.localId, team: this.localMeta?.team },
      enrichedPlayers,
      Boolean(this.modeConfig?.teamBased),
      this.latestBomb,
      this.latestStorm
    );

    this.renderer.render(this.scene, this.camera);
  }

  updateLocalPlayer(dt, now, wStats) {
    if (this.local.dead) {
      const left = this.local.respawnUntil > now ? (this.local.respawnUntil - now) / 1000 : 0;
      this.hud.setRespawnState(true, left);
      this.camera.position.lerp(
        new THREE.Vector3(this.local.x, this.local.y + 2.6, this.local.z + 2.2),
        Math.min(1, 3 * dt)
      );
      return;
    }

    const forward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    const right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    const crouch = Boolean(this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC']);
    const sprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && forward > 0 && !crouch && !this.adsActive;
    const jump = Boolean(this.keys['Space']);
    const interact = Boolean(this.keys['KeyE'] || this.keys['KeyF']);

    const input = {
      seq: ++this.inputSeq,
      forward: this.uiModalOpen ? 0 : forward,
      right: this.uiModalOpen ? 0 : right,
      yaw: this.local.yaw,
      pitch: this.local.pitch,
      sprint: !this.uiModalOpen && sprint,
      crouch: !this.uiModalOpen && crouch,
      jump: !this.uiModalOpen && jump,
      ads: this.adsActive,
      interact: !this.uiModalOpen && interact
    };

    const opMult = OPERATORS[this.localMeta?.operator]?.speedMult || 1.0;
    stepPlayerPhysics(this.local, input, this.mapData, dt, wStats.moveSpeedMult, opMult);

    if (now - this.lastInputSendAt >= 25) {
      this.lastInputSendAt = now;
      this.net.send({
        type: 'input',
        ...input,
        onGround: this.local.onGround,
        x: Number(this.local.x.toFixed(3)),
        y: Number(this.local.y.toFixed(3)),
        z: Number(this.local.z.toFixed(3))
      });
    }

    const targetEye = this.local.crouching ? PHYSICS.EYE_CROUCH : PHYSICS.EYE_STAND;
    this.local.eyeHeight += (targetEye - this.local.eyeHeight) * Math.min(1, 14 * dt);

    const horizSpeed = Math.hypot(this.local.vx, this.local.vz);
    let bobX = 0;
    let bobY = 0;
    if (this.local.onGround && horizSpeed > 0.6) {
      this.bobTimer += dt * (sprint ? 13.5 : 9.2);
      bobX = Math.cos(this.bobTimer * 0.5) * 0.012;
      bobY = Math.sin(this.bobTimer) * (this.adsActive ? 0.005 : 0.022);

      this.footstepTimer += dt;
      const stepEvery = sprint ? 0.31 : (this.local.crouching ? 0.56 : 0.43);
      if (this.footstepTimer >= stepEvery) {
        this.footstepTimer = 0;
        soundEngine.playFootstep(sprint);
      }
    } else {
      this.bobTimer += dt * 1.6;
      bobY = Math.sin(this.bobTimer) * 0.004;
    }

    // Automatic smooth recoil recovery when not actively firing
    if (now - this.local.lastFireTime > 105 && this.recoilAccumPitch > 0.0002) {
      const recov = this.recoilAccumPitch * Math.min(1, 12 * dt);
      this.local.pitch = Math.max(-1.50, this.local.pitch - recov);
      this.recoilAccumPitch = Math.max(0, this.recoilAccumPitch - recov);
    }

    this.camera.position.set(this.local.x, this.local.y + this.local.eyeHeight + bobY, this.local.z);
    this.camera.rotation.y = this.local.yaw;
    this.camera.rotation.x = this.local.pitch;

    const scopeFovs = wStats.scopeFovs || [26, 11];
    let targetFov = this.baseFov;
    if (this.sniperZoomStage === 1) targetFov = scopeFovs[0];
    else if (this.sniperZoomStage === 2) targetFov = scopeFovs[1];
    else if (this.adsActive) targetFov = wStats.adsFov || 54;
    else if (sprint) targetFov = this.baseFov + 5;

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 14 * dt);
      this.camera.updateProjectionMatrix();
    }

    const spreadPx = 4 + horizSpeed * 1.2 + (this.local.onGround ? 0 : 6) + this.vmKickZ * 38;
    this.hud.updateCrosshair(spreadPx, this.sniperZoomStage > 0, this.adsActive);

    if (this.fpRig) {
      this.fpRig.visible = this.sniperZoomStage === 0;
      this.vmKickZ += (0 - this.vmKickZ) * Math.min(1, 18 * dt);
      this.vmKickPitch += (0 - this.vmKickPitch) * Math.min(1, 16 * dt);
      this.swayX += (0 - this.swayX) * Math.min(1, 12 * dt);
      this.swayY += (0 - this.swayY) * Math.min(1, 12 * dt);

      const targetX = this.adsActive ? 0.0 : 0.22;
      const targetY = this.adsActive ? -0.142 : -0.22;
      const targetZ = this.adsActive ? -0.30 : -0.39;

      this.fpRig.position.x += (targetX + this.swayX + bobX - this.fpRig.position.x) * Math.min(1, 16 * dt);
      this.fpRig.position.y += (targetY + this.swayY + bobY * 0.6 - this.fpRig.position.y) * Math.min(1, 16 * dt);
      this.fpRig.position.z = targetZ + this.vmKickZ;

      const gunData = this.fpRig.userData.gun?.userData;
      if (gunData?.boltMesh && gunData.boltBaseZ !== undefined) {
        gunData.boltMesh.position.z = gunData.boltBaseZ + Math.max(0, this.vmKickZ * 0.75);
      }

      if (this.local.reloadingEnd > now) {
        const total = Math.max(200, this.local.reloadingEnd - this.local.reloadingStart);
        const ratio = Math.min(1, (now - this.local.reloadingStart) / total);
        this.hud.updateReloadProgress(ratio);
        this.fpRig.rotation.z = Math.sin(ratio * Math.PI) * 0.42;
        this.fpRig.rotation.x = -Math.sin(ratio * Math.PI) * 0.22;

        if (gunData?.magMesh && gunData?.magBasePos) {
          const dropOffset = ratio < 0.5 ? Math.sin(ratio * Math.PI) * 0.22 : Math.cos((ratio - 0.5) * Math.PI) * 0.22;
          gunData.magMesh.position.y = gunData.magBasePos.y - dropOffset;
        }
      } else {
        this.hud.updateReloadProgress(0);
        this.fpRig.rotation.z += ((sprint ? 0.18 : 0) - this.fpRig.rotation.z) * Math.min(1, 12 * dt);
        this.fpRig.rotation.x = this.vmKickPitch - (sprint ? 0.18 : 0);
        if (gunData?.magMesh && gunData?.magBasePos) {
          gunData.magMesh.position.copy(gunData.magBasePos);
        }
      }
    }
  }

  updateRemotePlayers(dt, timeSec) {
    const lerpFactor = Math.min(1, 15 * dt);
    for (const ent of this.remoteEntities.values()) {
      const tgt = ent.target;
      const cur = ent.current;
      const prevX = cur.x;
      const prevZ = cur.z;

      if (Math.hypot(tgt.x - cur.x, tgt.z - cur.z) > 6.5) {
        cur.x = tgt.x;
        cur.y = tgt.y;
        cur.z = tgt.z;
      } else {
        cur.x += (tgt.x - cur.x) * lerpFactor;
        cur.y += (tgt.y - cur.y) * lerpFactor;
        cur.z += (tgt.z - cur.z) * lerpFactor;

        // Ensure interpolated remote players/bots never visually clip through wall corners
        if (!tgt.dead && this.mapData) {
          const h = tgt.crouch ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;
          cur.onGround = Boolean(tgt.ground);
          depenetratePlayerXZ(cur, h, PHYSICS.PLAYER_RADIUS, this.mapData);
        }
      }

      cur.yaw += shortestAngleDiff(cur.yaw, tgt.yaw) * lerpFactor;
      cur.pitch += ((tgt.pitch || 0) - cur.pitch) * lerpFactor;

      ent.rig.group.position.set(cur.x, cur.y, cur.z);
      ent.rig.group.rotation.y = cur.yaw;

      const serverSpeed = (tgt.vx !== undefined && tgt.vz !== undefined)
        ? Math.hypot(tgt.vx, tgt.vz)
        : Math.hypot(cur.x - prevX, cur.z - prevZ) / Math.max(0.001, dt);
      const distToMe = Math.hypot(cur.x - this.local.x, cur.z - this.local.z);

      animateOperatorRig(
        ent.rig,
        {
          dead: Boolean(tgt.dead),
          crouch: Boolean(tgt.crouch),
          sprint: Boolean(tgt.sprint),
          moveSpeed: serverSpeed,
          pitch: cur.pitch,
          hasBomb: Boolean(tgt.hasBomb),
          shield: Boolean(tgt.shield),
          showNameplate: ent.isAlly || distToMe < 24
        },
        dt,
        timeSec
      );
    }
  }
}
