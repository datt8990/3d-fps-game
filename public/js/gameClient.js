// Upgraded 3D FPS Engine v2.0: 12 Weapons, Buckshot, Frag Grenades, Kill Streaks, Radio & Dual-Zoom Scope
import * as THREE from 'three';
import {
  PHYSICS,
  OPERATORS,
  WEAPONS,
  getEffectiveWeaponStats
} from '/shared/constants.js';
import { MAPS } from '/shared/maps.js';
import { stepPlayerPhysics, stepAirbornePhysics, depenetratePlayerXZ, hasLineOfSight } from '/shared/physics.js';
import { buildThreeMap, createLootCrateMesh, createDropPlaneMesh, createParachuteMesh } from './mapBuilder.js';
import {
  createFirstPersonRig,
  createOperatorRig,
  swapRigWeapon,
  animateOperatorRig,
  createGrenadeMesh
} from './models.js';
import { soundEngine } from './audio.js';
import { getStudioEnvMap } from './textures.js';

function shortestAngleDiff(from, to) {
  let diff = (to - from + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function expSmooth(rate, dt) {
  return 1 - Math.exp(-rate * dt);
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
    this.renderer.toneMappingExposure = 1.24;

    this.scene = new THREE.Scene();
    this.scene.environment = getStudioEnvMap();
    this.scene.environmentIntensity = 1.0;
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
    this.lootData = new Map();
    this.grenadeMeshes = new Map();
    this.dropPlaneData = null;
    this.dropPlaneMesh = null;
    this.localChuteRig = null;

    this.localId = null;
    this.localMeta = null;
    this.local = {
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: 0,
      onGround: true,
      crouching: false,
      dropPhase: 'ground',
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
      weaponsState: null,
      ammo: 30,
      reserveAmmo: 90,
      grenades: 1,
      reloadingStart: 0,
      reloadingEnd: 0,
      lastFireTime: 0,
      kills: 0
    };

    this.keys = {};
    this.autoRun = false;
    this.mouseDownLeft = false;
    this.adsActive = false;
    this.adsBlend = 0;
    this.sniperZoomStage = 0;
    this.pointerLocked = false;
    this.uiModalOpen = false;
    this.backpackOpen = false;
    this.bigMapOpen = false;
    this.mapPingMarker = null;
    this.radioOpen = false;
    this.currentAimTarget = null;

    this.fpRig = null;
    this.fpSignature = '';
    this.vmKickZ = 0;
    this.vmKickPitch = 0;
    this.recoilAccumPitch = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobTimer = 0;
    this.footstepTimer = 0;

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
    this.lastRenderAt = this.lastFrameAt;
    this.nextFrameAt = this.lastFrameAt;
    this.fpsClockStart = this.lastFrameAt;
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
      const now = performance.now();
      this.frameCount = 0;
      this.fpsAccumTime = 0;
      this.lastRenderAt = now;
      this.nextFrameAt = now;
      this.fpsClockStart = now;
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
          const wasAds = this.adsActive;
          this.sniperZoomStage = (this.sniperZoomStage + 1) % 3;
          this.adsActive = this.sniperZoomStage > 0;
          soundEngine.playMetallicClick(1050, 0.04, 0.18);
          if (!wasAds && this.adsActive) {
            this.triggerAdsSnapAssist();
          }
        } else {
          const wasAds = this.adsActive;
          this.adsActive = !this.adsActive;
          soundEngine.playMetallicClick(780, 0.03, 0.09);
          if (!wasAds && this.adsActive) {
            this.triggerAdsSnapAssist();
          }
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
      let zoomScale = Math.max(
        0.15,
        Math.min(1.0, Math.tan((this.camera.fov * Math.PI) / 360) / Math.tan((this.baseFov * Math.PI) / 360))
      );
      if (this.adsActive && this.currentAimTarget && this.currentAimTarget.angleDev < 0.16) {
        zoomScale *= 0.70; // Aim-assist target friction keeps crosshair securely on target
      }
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
      const validSlots = [1, 2, 3].filter((s) => this.mode !== 'survival' || this.local.weaponsState?.[s]?.id);
      if (validSlots.length > 1) {
        const curIdx = Math.max(0, validSlots.indexOf(this.local.slot));
        const next = validSlots[(curIdx + (e.deltaY > 0 ? 1 : validSlots.length - 1)) % validSlots.length];
        this.requestWeaponSwitch(next);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;

      if (e.code === 'Escape') {
        if (this.backpackOpen) {
          this.toggleBackpackModal(false);
          return;
        }
        if (this.bigMapOpen) {
          this.toggleBigMapModal(false);
          return;
        }
        if (this.uiModalOpen) {
          this.closeInGameChat();
          this.toggleBuyWeaponModal(false);
          return;
        }
        if (this.radioOpen) {
          this.radioOpen = false;
    this.currentAimTarget = null;
          this.hud.toggleRadioMenu(false);
          return;
        }
      }

      if (e.code === 'Tab' || (this.mode === 'survival' && e.code === 'KeyI')) {
        e.preventDefault();
        if (this.mode === 'survival') {
          this.toggleBackpackModal();
        } else {
          this.hud.renderScoreboard(this.enrichPlayersForScoreboard(), this.localId, this.modeConfig?.teamBased);
          this.hud.toggleScoreboard(true);
        }
        return;
      }

      if (this.mode === 'survival' && e.code === 'KeyM') {
        e.preventDefault();
        this.toggleBigMapModal();
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
    this.currentAimTarget = null;
        this.hud.toggleRadioMenu(false);
        soundEngine.playUiTone(880, 0.06);
        return;
      }

      this.keys[e.code] = true;

      // PUBG Auto-Run Toggle [=] or [NumEqual]
      if (e.code === 'Equal' || e.code === 'NumpadEqual' || e.key === '=' || e.key === '+') {
        e.preventDefault();
        if (!this.local.dead && !this.uiModalOpen && this.local.dropPhase === 'ground') {
          this.autoRun = !this.autoRun;
          soundEngine.playUiTone(this.autoRun ? 760 : 440, 0.08);
          this.hud.setAutoRunActive?.(this.autoRun);
        }
        return;
      }

      if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        if (this.autoRun) {
          this.autoRun = false;
          this.hud.setAutoRunActive?.(false);
        }
      }

      if (this.mode === 'survival' && !this.local.dead && !this.uiModalOpen) {
        if (this.local.dropPhase === 'plane' && (e.code === 'KeyF' || e.code === 'Space')) {
          e.preventDefault();
          this.triggerDropAction('jump');
          return;
        }
        if (this.local.dropPhase === 'skydive' && (e.code === 'Space' || e.code === 'KeyF')) {
          e.preventDefault();
          this.triggerDropAction('open_chute');
          return;
        }
      }

      if (e.code === 'Digit1') this.requestWeaponSwitch(1);
      else if (e.code === 'Digit2') this.requestWeaponSwitch(2);
      else if (e.code === 'Digit3') this.requestWeaponSwitch(3);
      else if (e.code === 'KeyQ') {
        const altSlot = this.local.slot === 1 ? (this.local.secondaryId ? 2 : 3) : (this.local.primaryId ? 1 : 3);
        this.requestWeaponSwitch(altSlot);
      }
      else if (e.code === 'KeyR') this.requestReload();
      else if (e.code === 'KeyG') this.requestThrowGrenade();
      else if (e.code === 'Digit7' && this.mode === 'survival') this.useQuickMed(['bandage', 'energy']);
      else if (e.code === 'Digit8' && this.mode === 'survival') this.useQuickMed(['firstaid', 'medkit', 'bandage']);
      else if (e.code === 'KeyE' && this.mode === 'survival' && this.local.dropPhase === 'ground' && !this.local.dead) {
        const nearBox = [...this.lootData.values()].find(
          (c) => c.kind === 'deathbox' && Math.hypot(c.x - this.local.x, c.z - this.local.z) <= 3.6 && Math.abs((c.y || 0) - this.local.y) < 3.0
        );
        if (nearBox) this.toggleBackpackModal(true);
      }
      else if (e.code === 'KeyB' && this.mode !== 'survival') this.toggleBuyWeaponModal();
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

  toggleBackpackModal(forceState) {
    if (this.mode !== 'survival') return;
    const modal = document.getElementById('br-backpack-modal');
    if (!modal) return;
    const willOpen = forceState !== undefined ? forceState : !this.backpackOpen;
    this.backpackOpen = willOpen;
    if (willOpen && this.bigMapOpen) {
      this.bigMapOpen = false;
      document.getElementById('br-bigmap-modal')?.classList.add('hidden');
    }
    modal.classList.toggle('hidden', !willOpen);
    this.uiModalOpen = willOpen;
    if (willOpen) {
      this.refreshBackpackUI();
      document.exitPointerLock?.();
    } else if (this.active) {
      this.requestLock();
    }
  }

  toggleBigMapModal(forceState) {
    if (this.mode !== 'survival') return;
    const modal = document.getElementById('br-bigmap-modal');
    if (!modal) return;
    const willOpen = forceState !== undefined ? forceState : !this.bigMapOpen;
    this.bigMapOpen = willOpen;
    if (willOpen && this.backpackOpen) {
      this.backpackOpen = false;
      document.getElementById('br-backpack-modal')?.classList.add('hidden');
    }
    modal.classList.toggle('hidden', !willOpen);
    this.uiModalOpen = willOpen;
    if (willOpen) {
      this.hud.drawBigMap?.(
        this.mapData,
        { ...this.local, id: this.localId },
        this.latestStorm,
        this.dropPlaneData,
        this.mapPingMarker
      );
      document.exitPointerLock?.();
    } else if (this.active) {
      this.requestLock();
    }
  }

  useQuickMed(preferredIds = ['firstaid', 'medkit', 'bandage', 'energy']) {
    if (!this.active || this.local.dead || this.mode !== 'survival') return;
    const meds = this.local.backpack?.meds || {};
    const picked = preferredIds.find((id) => (meds[id] || 0) > 0);
    if (!picked) {
      this.hud.showRoundBanner?.('Không còn Băng gạc / Y tế trong Balo!', '');
      return;
    }
    this.net.send({ type: 'use_med', medId: picked });
  }

  refreshBackpackUI() {
    if (!this.backpackOpen || this.mode !== 'survival') return;
    const nearby = [];
    for (const c of this.lootData.values()) {
      if (Math.hypot(c.x - this.local.x, c.z - this.local.z) <= 4.1 && Math.abs((c.y || 0) - this.local.y) <= 3.0) {
        nearby.push(c);
      }
    }
    this.hud.renderBackpackModal?.({
      nearbyCrates: nearby,
      local: this.local,
      onLootItem: (crateId, itemId) => this.net.send({ type: 'loot_item', crateId, itemId }),
      onDropItem: (category, key, qty) => this.net.send({ type: 'drop_item', category, key, qty }),
      onUseMed: (medId) => this.net.send({ type: 'use_med', medId })
    });
  }

  startMatchSession(payload, localClientId) {
    this.stopMatchSession();
    this.active = true;
    this.localId = localClientId;
    this.canvas.style.display = 'block';

    this.mapId = payload.mapId || 'warehouse';
    this.mapData = MAPS[this.mapId] || MAPS.warehouse;
    this.camera.far = this.mapData.terrain ? 1100 : 320;
    this.camera.updateProjectionMatrix();
    this.mode = payload.mode || 'tdm';
    this.modeConfig = payload.modeConfig;
    this.latestBomb = null;
    this.latestStorm = payload.storm || null;
    this.dropPlaneData = payload.dropPlane ? { ...payload.dropPlane } : null;
    this.mapPingMarker = null;
    this.lastWorldStateAt = 0;

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

    this.local.meleeId = this.localMeta.melee || 'knife';
    if (this.mode === 'survival') {
      const ws = this.localMeta.weaponsState || {
        1: { id: null, ammo: 0, reserve: 0, magSize: 0 },
        2: { id: null, ammo: 0, reserve: 0, magSize: 0 },
        3: { id: this.local.meleeId, ammo: 0, reserve: 0, magSize: 0 }
      };
      this.local.weaponsState = ws;
      this.local.primaryId = ws[1]?.id || null;
      this.local.secondaryId = ws[2]?.id || null;
      this.local.slot = this.localMeta.slot ?? 3;
      this.local.weaponId = this.localMeta.weaponId || this.local.meleeId;
      this.local.grenades = this.localMeta.grenades ?? 0;
      this.local.ammo = this.localMeta.ammo ?? 0;
      this.local.reserveAmmo = this.localMeta.reserveAmmo ?? 0;
      this.local.armor = this.localMeta.armor ?? 0;
      this.local.dropPhase = this.dropPlaneData?.active ? 'plane' : (this.localMeta.dropPhase || 'ground');
    } else {
      this.local.primaryId = this.localMeta.primary || 'ak47';
      this.local.secondaryId = this.localMeta.secondary || 'deagle';
      this.local.weaponsState = {
        1: { id: this.local.primaryId },
        2: { id: this.local.secondaryId },
        3: { id: this.local.meleeId }
      };
      this.local.grenades = this.localMeta.grenades ?? (this.mode === 'practice' ? 5 : 1);
      this.local.dropPhase = 'ground';
      this.local.slot = 1;
      this.local.weaponId = this.local.primaryId;
      const wStatsInit = getEffectiveWeaponStats(
        this.local.primaryId,
        this.localMeta?.attachments?.[this.local.primaryId] || {},
        this.localMeta?.operator || 'vanguard'
      );
      this.local.ammo = this.localMeta.ammo ?? wStatsInit.magSize;
      this.local.reserveAmmo = this.localMeta.reserveAmmo ?? wStatsInit.reserveAmmo;
      this.local.armor = this.localMeta.armor ?? 100;
    }

    // Initialize local position directly to C-130 plane (BR) or authoritative spawn point
    if (this.mode === 'survival' && this.dropPlaneData?.active) {
      this.local.x = this.dropPlaneData.x;
      this.local.y = this.dropPlaneData.y;
      this.local.z = this.dropPlaneData.z;
      this.local.yaw = this.dropPlaneData.yaw || 0;
      this.local.pitch = -0.38;
      this.local.vx = 0;
      this.local.vy = 0;
      this.local.vz = 0;
      this.local.dead = false;
      this.local.onGround = false;
    } else {
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
      if (this.local.dropPhase === 'ground') {
        depenetratePlayerXZ(this.local, PHYSICS.HEIGHT_STAND, PHYSICS.PLAYER_RADIUS, this.mapData);
      }
    }

    this.local.hp = this.localMeta.hp ?? 100;
    this.local.maxArmor = this.localMeta.maxArmor ?? 100;

    this.mapObjects = buildThreeMap(this.scene, this.mapData, this.mode, this.quality);

    if (this.mode === 'survival') {
      this.dropPlaneMesh = createDropPlaneMesh();
      if (this.dropPlaneData?.active) {
        this.dropPlaneMesh.position.set(this.dropPlaneData.x, this.dropPlaneData.y, this.dropPlaneData.z);
        this.dropPlaneMesh.rotation.y = this.dropPlaneData.yaw || 0;
      } else {
        this.dropPlaneMesh.visible = false;
      }
      this.mapObjects.worldGroup.add(this.dropPlaneMesh);

      const chuteRig = createOperatorRig({
        operator: this.localMeta?.operator || 'vanguard',
        outfit: this.localMeta?.outfit || 'urban',
        team: this.localMeta?.team || 'ffa',
        weaponId: this.local.meleeId || 'knife',
        skins: {},
        attachments: {},
        name: '',
        isAlly: true
      });
      chuteRig.chuteCanopy = createParachuteMesh();
      chuteRig.chuteCanopy.visible = false;
      chuteRig.group.add(chuteRig.chuteCanopy);
      chuteRig.group.visible = false;
      this.mapObjects.worldGroup.add(chuteRig.group);
      this.localChuteRig = chuteRig;
    }

    for (const crate of payload.lootCrates || []) {
      if (!crate.active) continue;
      this.lootData.set(crate.id, crate);
      const m = createLootCrateMesh(crate);
      m.position.set(crate.x, crate.y, crate.z);
      this.mapObjects.worldGroup.add(m);
      this.lootMeshes.set(crate.id, m);
    }

    this.camera.position.set(this.local.x, this.local.y + PHYSICS.EYE_STAND, this.local.z);
    this.camera.rotation.y = this.local.yaw;
    this.camera.rotation.x = this.local.pitch;

    this.rebuildFirstPersonRig(this.local.weaponId);
    if (this.fpRig && this.local.dropPhase !== 'ground') this.fpRig.visible = false;
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
    this.adsBlend = 0;
    this.sniperZoomStage = 0;
    this.uiModalOpen = false;
    this.backpackOpen = false;
    this.bigMapOpen = false;
    this.mapPingMarker = null;
    this.radioOpen = false;
    this.currentAimTarget = null;
    this.dropPlaneData = null;
    this.dropPlaneMesh = null;
    this.localChuteRig = null;
    document.getElementById('br-backpack-modal')?.classList.add('hidden');
    document.getElementById('br-bigmap-modal')?.classList.add('hidden');
    this.hud.updateDropBanner?.(null);
    this.hud.updateSurvivalGear?.(null);
    soundEngine.cancelReloadSequence();
    this.hud.toggleRadioMenu(false);
    this.hud.updateCrosshair(6, false, false, 'iron', 0, 1.0);
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
    this.lootData.clear();

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
      if (p.id === this.localId) {
        this.localMeta = p;
      }
    }
    if (this.active && this.localMeta && this.local.weaponId) {
      const wId = this.local.weaponId;
      const sig = `${wId}|${this.localMeta.skins?.[wId] || 'default'}|${this.localMeta.outfit || 'urban'}|${this.localMeta.operator || 'vanguard'}|${JSON.stringify(this.localMeta.attachments?.[wId] || {})}`;
      if (sig !== this.fpSignature) {
        this.rebuildFirstPersonRig(wId);
      }
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
    const operatorId = this.localMeta?.operator || 'vanguard';
    this.fpSignature = `${weaponId}|${skinId}|${outfitId}|${operatorId}|${JSON.stringify(att)}`;

    this.fpRig = createFirstPersonRig(weaponId, skinId, att, outfitId, operatorId);
    this.fpRig.position.set(0.22, -0.22, -0.38);
    this.camera.add(this.fpRig);
  }

  triggerDropAction(action) {
    if (!this.active || this.local.dead || this.mode !== 'survival') return;
    if (action === 'jump' && this.local.dropPhase === 'plane') {
      this.local.dropPhase = 'skydive';
      this.local.y = (this.dropPlaneData?.y ?? 82) - 2.2;
      this.local.vy = -12;
      this.local.onGround = false;
      this.net.send({ type: 'drop_action', action: 'jump' });
      soundEngine.playUiTone(620, 0.14);
    } else if (action === 'open_chute' && this.local.dropPhase === 'skydive') {
      this.local.dropPhase = 'parachute';
      this.local.vy = Math.max(this.local.vy || -14, -8.5);
      this.net.send({ type: 'drop_action', action: 'open_chute' });
      soundEngine.playUiTone(840, 0.16);
    }
  }

  getLocalWeaponStats() {
    const wId = this.local.weaponId || this.local.meleeId || 'knife';
    const att = this.localMeta?.attachments?.[wId] || {};
    const op = this.localMeta?.operator || 'vanguard';
    return getEffectiveWeaponStats(wId, att, op);
  }

  requestWeaponSwitch(slot) {
    if (this.local.dead || slot === this.local.slot) return;
    if (this.mode === 'survival' && !this.local.weaponsState?.[slot]?.id) return;
    this.adsActive = false;
    this.adsBlend = 0;
    this.sniperZoomStage = 0;
    soundEngine.cancelReloadSequence();
    soundEngine.ensureContext();
    this.net.send({ type: 'switch_weapon', slot });
  }

  requestReload() {
    if (this.local.dead || this.local.dropPhase !== 'ground') return;
    const st = this.getLocalWeaponStats();
    if (st.isMelee || this.local.ammo >= st.magSize || this.local.reserveAmmo <= 0) return;
    if (performance.now() < this.local.reloadingEnd) return;
    this.adsActive = false;
    this.sniperZoomStage = 0;
    soundEngine.ensureContext();
    this.net.send({ type: 'reload' });
  }

  requestThrowGrenade() {
    if (!this.active || this.local.dead || this.local.dropPhase !== 'ground' || this.uiModalOpen || this.local.grenades <= 0) return;
    soundEngine.playGrenadeThrow();
    this.net.send({
      type: 'throw_grenade',
      yaw: this.local.yaw,
      pitch: this.local.pitch
    });
  }

  findBestAimAssistTarget(maxAngle = 0.38, maxDist = 110) {
    if (!this.remoteEntities || this.remoteEntities.size === 0) return null;
    const eyeX = this.local.x;
    const eyeY = this.local.y + this.local.eyeHeight;
    const eyeZ = this.local.z;
    const eyePos = { x: eyeX, y: eyeY, z: eyeZ };

    let bestTarget = null;
    let minDev = maxAngle;

    for (const ent of this.remoteEntities.values()) {
      if (ent.isAlly) continue;
      if (ent.target?.dead) continue;
      if (ent.target?.dp === 1) continue;

      const tgtX = ent.current.x;
      const isCrouched = Boolean(ent.target?.crouch);
      const tgtY = ent.current.y + (isCrouched ? 0.95 : 1.25);
      const tgtZ = ent.current.z;

      const dx = tgtX - eyeX;
      const dy = tgtY - eyeY;
      const dz = tgtZ - eyeZ;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1.0 || dist > maxDist) continue;

      const targetYaw = Math.atan2(-dx, -dz);
      const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));

      const yawDiff = shortestAngleDiff(this.local.yaw, targetYaw);
      const pitchDiff = targetPitch - this.local.pitch;
      const angleDev = Math.hypot(yawDiff, pitchDiff);

      if (angleDev < minDev) {
        if (this.mapData && !hasLineOfSight(eyePos, { x: tgtX, y: tgtY, z: tgtZ }, this.mapData)) {
          continue;
        }
        minDev = angleDev;
        bestTarget = {
          entity: ent,
          dist,
          angleDev,
          targetYaw,
          targetPitch,
          yawDiff,
          pitchDiff
        };
      }
    }
    return bestTarget;
  }

  triggerAdsSnapAssist() {
    if (!this.active || this.local.dead || this.local.dropPhase !== 'ground') return;
    const best = this.findBestAimAssistTarget(0.38, 110);
    if (best) {
      // Ghim tâm 68% vào người địch gần tâm nhất khi bật ngắm
      const snapWeight = 0.68;
      this.local.yaw += best.yawDiff * snapWeight;
      this.local.pitch = Math.max(-1.50, Math.min(1.50, this.local.pitch + best.pitchDiff * snapWeight));
      this.currentAimTarget = best;
    }
  }

  updateAdsAimAssist(dt) {
    if (!this.active || this.local.dead || this.local.dropPhase !== 'ground' || !this.adsActive) {
      this.currentAimTarget = null;
      return;
    }
    const best = this.findBestAimAssistTarget(0.24, 110);
    this.currentAimTarget = best;
    if (best) {
      // Rotational magnetism: hỗ trợ bám tâm mượt mà khi địch di chuyển
      const pullRate = Math.min(1.0, dt * 7.2) * 0.42;
      this.local.yaw += best.yawDiff * pullRate;
      this.local.pitch = Math.max(-1.50, Math.min(1.50, this.local.pitch + best.pitchDiff * pullRate));
    }
  }

  tryFireWeapon(heavyMelee = false) {
    if (!this.active || this.local.dead || this.local.dropPhase !== 'ground' || this.uiModalOpen) return;
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
    soundEngine.playGunshot(st.id, st.suppressed, 0);

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
    const recoilScale = (this.adsActive ? 0.52 : 1.0) * (this.local.crouching ? 0.72 : 1.0);
    const sprayDamp = this.recoilAccumPitch > 0.045 ? 0.25 : 1.0;
    const pitchKick = st.recoilPitch * recoilScale * sprayDamp;

    this.local.pitch = Math.min(1.50, this.local.pitch + pitchKick);
    this.recoilAccumPitch = Math.min(0.068, this.recoilAccumPitch + pitchKick);
    this.local.yaw += (Math.random() - 0.5) * st.recoilYaw * recoilScale * 1.4;
    this.vmKickZ = st.isMelee ? -0.11 : (this.adsActive ? 0.012 : 0.032);
    this.vmKickPitch = st.isMelee ? -0.26 : (this.adsActive ? 0.014 : 0.042);

    // Bolt-action AWP unscopes briefly; semi-auto Barrett M82 stays scoped!
    if (st.fireMode === 'bolt' && this.sniperZoomStage > 0) {
      const prevStage = this.sniperZoomStage;
      this.sniperZoomStage = 0;
      this.adsActive = false;
      setTimeout(() => {
        if (this.active && !this.local.dead && this.local.weaponId === st.id && performance.now() >= this.local.reloadingEnd) {
          this.sniperZoomStage = prevStage;
          this.adsActive = true;
          this.triggerAdsSnapAssist();
        }
      }, 950);
    }
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
      this.local.slot = msg.slot ?? 1;
      if (msg.weaponsState) {
        this.local.weaponsState = msg.weaponsState;
        this.local.primaryId = msg.weaponsState[1]?.id ?? null;
        this.local.secondaryId = msg.weaponsState[2]?.id ?? null;
      }
      if (msg.dropPhase) this.local.dropPhase = msg.dropPhase;
      this.local.weaponId = msg.weaponId || this.local.meleeId;
      this.local.ammo = msg.ammo;
      this.local.reserveAmmo = msg.reserveAmmo;
      this.local.grenades = msg.grenades ?? (this.mode === 'survival' ? 0 : 1);
      this.local.reloadingEnd = 0;
      this.adsActive = false;
      this.adsBlend = 0;
      this.sniperZoomStage = 0;

      this.rebuildFirstPersonRig(this.local.weaponId);
      if (this.fpRig && this.local.dropPhase !== 'ground') this.fpRig.visible = false;
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
      this.adsBlend = 0;
      this.sniperZoomStage = 0;
      soundEngine.cancelReloadSequence();
      soundEngine.playWeaponDraw(msg.weaponId);
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
      this.adsBlend = 0;
      this.sniperZoomStage = 0;
      soundEngine.playReloadSequence(msg.durationMs, msg.weaponId || this.local.weaponId);
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
      this.adsBlend = 0;
      this.sniperZoomStage = 0;
      soundEngine.cancelReloadSequence();
      if (this.fpRig) this.fpRig.visible = false;
    }
  }

  onWeaponsSync(msg) {
    if (msg.weaponsState) this.local.weaponsState = msg.weaponsState;
    this.local.primaryId = msg.weaponsState?.[1]?.id ?? msg.primary ?? null;
    this.local.secondaryId = msg.weaponsState?.[2]?.id ?? msg.secondary ?? null;
    if (msg.slot) this.local.slot = msg.slot;
    this.local.weaponId = msg.weaponId || this.local.meleeId;
    this.local.ammo = msg.ammo ?? 0;
    this.local.reserveAmmo = msg.reserveAmmo ?? 0;
    if (msg.grenades !== undefined) this.local.grenades = msg.grenades;
    this.rebuildFirstPersonRig(this.local.weaponId);
    if (this.fpRig && this.local.dropPhase !== 'ground') this.fpRig.visible = false;
    this.refreshHudWeapon();
  }

  onInventorySync(msg) {
    if (msg.hp !== undefined) this.local.hp = msg.hp;
    if (msg.maxHp !== undefined) this.local.maxHp = msg.maxHp;
    if (msg.armor !== undefined) this.local.armor = msg.armor;
    if (msg.maxArmor !== undefined) this.local.maxArmor = msg.maxArmor;
    if (msg.gear) this.local.gear = msg.gear;
    if (msg.backpack) this.local.backpack = msg.backpack;
    if (msg.backpackWeight !== undefined) this.local.backpackWeight = msg.backpackWeight;
    if (msg.weaponsState) this.local.weaponsState = msg.weaponsState;
    if (msg.grenades !== undefined) this.local.grenades = msg.grenades;
    this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor || 100);
    this.hud.updateSurvivalGear?.(this.local);
    this.refreshHudWeapon();
    this.refreshBackpackUI();
  }

  onLootUpdated(msg) {
    if (!msg?.crate) return;
    if (!msg.crate.active) {
      this.onLootPicked({ crateId: msg.crate.id });
      return;
    }
    this.lootData.set(msg.crate.id, msg.crate);
    this.refreshBackpackUI();
  }

  onLootSpawned(msg) {
    if (!this.mapObjects?.worldGroup) return;
    for (const crate of msg.crates || []) {
      if (!crate.active) continue;
      this.lootData.set(crate.id, crate);
      if (this.lootMeshes.has(crate.id)) {
        this.mapObjects.worldGroup.remove(this.lootMeshes.get(crate.id));
      }
      const m = createLootCrateMesh(crate);
      m.position.set(crate.x, crate.y || 0, crate.z);
      this.mapObjects.worldGroup.add(m);
      this.lootMeshes.set(crate.id, m);
    }
    this.refreshBackpackUI();
  }

  onLootPicked(msg) {
    const mesh = this.lootMeshes.get(msg.crateId);
    if (mesh && this.mapObjects?.worldGroup) {
      this.mapObjects.worldGroup.remove(mesh);
      this.lootMeshes.delete(msg.crateId);
    }
    this.lootData.delete(msg.crateId);
    if (msg.playerId === this.localId) {
      if (msg.weaponsState) this.local.weaponsState = msg.weaponsState;
      if (msg.primary !== undefined) this.local.primaryId = msg.primary;
      if (msg.secondary !== undefined) this.local.secondaryId = msg.secondary;
      this.local.hp = msg.hp;
      this.local.armor = msg.armor;
      if (msg.maxArmor !== undefined) this.local.maxArmor = msg.maxArmor;
      this.local.ammo = msg.ammo;
      this.local.reserveAmmo = msg.reserveAmmo;
      if (msg.grenades !== undefined) this.local.grenades = msg.grenades;
      this.hud.updateVitals(this.local.hp, this.local.maxHp, this.local.armor, this.local.maxArmor || 100);
      this.refreshHudWeapon();
      soundEngine.playUiTone(880, 0.14);
    }
    this.refreshBackpackUI();
  }

  onWorldState(msg) {
    if (!this.active) return;
    if (msg.t && this.lastWorldStateAt && msg.t < this.lastWorldStateAt) return;
    if (msg.t) this.lastWorldStateAt = msg.t;
    this.lastSnapshotPlayers = msg.players || [];
    this.latestBomb = msg.bomb || null;
    this.latestStorm = msg.storm || this.latestStorm;
    if (msg.dropPlane !== undefined) {
      this.dropPlaneData = msg.dropPlane;
    } else if (this.dropPlaneData && this.mode === 'survival') {
      this.dropPlaneData.active = false;
    }

    if (this.dropPlaneMesh) {
      if (this.dropPlaneData?.active) {
        this.dropPlaneMesh.visible = true;
        this.dropPlaneMesh.position.set(this.dropPlaneData.x, this.dropPlaneData.y, this.dropPlaneData.z);
        this.dropPlaneMesh.rotation.y = this.dropPlaneData.yaw || 0;
      } else {
        this.dropPlaneMesh.visible = false;
      }
    }

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
        if (this.mode === 'survival' && ps.dp !== undefined) {
          if (ps.dp === 1) {
            this.local.dropPhase = 'plane';
            this.local.x = ps.x;
            this.local.y = ps.y;
            this.local.z = ps.z;
          } else if (this.local.dropPhase === 'plane' && ps.dp >= 2) {
            this.local.dropPhase = ps.dp === 3 ? 'parachute' : 'skydive';
            this.local.x = ps.x;
            this.local.y = ps.y;
            this.local.z = ps.z;
            this.local.vy = ps.vy || -12;
          } else if (ps.dp === 0 && this.local.dropPhase !== 'ground') {
            this.local.dropPhase = 'ground';
            if (this.localChuteRig) this.localChuteRig.group.visible = false;
          }
        }
        if (this.fpRig) {
          const wSt = this.getLocalWeaponStats();
          const acogHidden = this.adsActive && wSt.opticId === 'acog' && this.adsBlend > 0.62;
          this.fpRig.visible = !this.local.dead && this.local.dropPhase === 'ground' && this.sniperZoomStage === 0 && !acogHidden;
        }
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
        let chuteCanopy = null;
        if (this.mode === 'survival') {
          chuteCanopy = createParachuteMesh();
          chuteCanopy.visible = false;
          rig.group.add(chuteCanopy);
        }
        rig.group.position.set(ps.x, ps.y, ps.z);
        this.scene.add(rig.group);
        ent = {
          id: ps.id,
          meta,
          isAlly,
          rig,
          chuteCanopy,
          current: { x: ps.x, y: ps.y, z: ps.z, yaw: ps.yaw, pitch: ps.pitch },
          pred: { x: ps.x, y: ps.y, z: ps.z },
          predAge: 0,
          target: { ...ps }
        };
        this.remoteEntities.set(ps.id, ent);
      } else {
        if (ps.w && ps.w !== ent.rig.currentWeaponId) {
          swapRigWeapon(ent.rig, ps.w, ent.meta.skins?.[ps.w] || 'default', ent.meta.attachments?.[ps.w] || {});
        }
        const wasDead = Boolean(ent.target?.dead);
        ent.target = { ...ps };
        ent.pred = { x: ps.x, y: ps.y, z: ps.z };
        ent.predAge = 0;
        if ((wasDead && !ps.dead) || Math.hypot(ps.x - ent.current.x, ps.z - ent.current.z) > 8.5) {
          ent.current.x = ps.x;
          ent.current.y = ps.y;
          ent.current.z = ps.z;
        }
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

    if (this.mode === 'bomb') {
      this.hud.updateBombHUD(this.latestBomb, this.local, this.mapData);
    } else if (this.hud.bombBannerEl) {
      this.hud.bombBannerEl.classList.add('hidden');
      this.hud.bombActionWrap?.classList.add('hidden');
      if (this.mode !== 'survival') this.hud.interactHintEl?.classList.add('hidden');
    }
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
    if (p1.distanceTo(p2) < 0.25) return;

    // Start tracer cleanly past muzzle tip with subtle air-trail tint so sights stay completely clear
    p1.lerp(p2, 0.06);
    const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const mat = new THREE.LineBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.36 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.activeEffects.push({ mesh: line, mat, life: 0.055, maxLife: 0.055 });

    if (hitType === 'wall' || hitType === 'player') {
      const sparkColor = hitType === 'player' ? '#ef4444' : '#f59e0b';
      const sparkMat = new THREE.MeshBasicMaterial({ color: sparkColor, transparent: true, opacity: 0.90 });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(hitType === 'player' ? 0.075 : 0.05, 6, 6), sparkMat);
      spark.position.copy(p2);
      this.scene.add(spark);
      this.activeEffects.push({ mesh: spark, mat: sparkMat, life: 0.14, maxLife: 0.14, scaleUp: true });
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
      this.lastRenderAt = now;
      this.nextFrameAt = now;
      this.fpsClockStart = now;
      return;
    }

    if (this.fpsCap > 0) {
      const iv = 1000 / this.fpsCap;
      // 1.5ms tolerance prevents skipping a whole vsync when rAF arrives slightly early
      if (now + 1.5 < this.nextFrameAt) return;
      this.nextFrameAt = this.nextFrameAt + iv;
      if (now - this.nextFrameAt > iv * 2) {
        this.nextFrameAt = now + iv;
      }
    }

    const rawElapsedMs = Math.max(0.5, now - this.lastRenderAt);
    this.lastRenderAt = now;
    const dt = Math.min(0.05, rawElapsedMs / 1000);

    this.frameCount++;
    const fpsWindowMs = now - this.fpsClockStart;
    if (fpsWindowMs >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / fpsWindowMs);
      this.frameCount = 0;
      this.fpsClockStart = now;
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

    for (const [id, mesh] of this.lootMeshes.entries()) {
      const lc = this.lootData.get(id);
      if (lc && this.mapData?.terrain) {
        const d = Math.hypot(lc.x - this.local.x, lc.z - this.local.z);
        const maxD = lc.kind === 'deathbox' ? 220 : 120;
        mesh.visible = d <= maxD;
        if (!mesh.visible) continue;
      }
      if (lc?.kind !== 'deathbox') mesh.rotation.y += dt * 1.6;
    }

    if (this.mapObjects?.sectorGroups?.length) {
      const cullDist = this.local.dropPhase === 'ground' ? 650 : 1200;
      for (const sec of this.mapObjects.sectorGroups) {
        const c = sec.userData.sectorCenter;
        if (c) sec.visible = Math.hypot(c.x - this.local.x, c.z - this.local.z) <= cullDist;
      }
    }

    if (this.mapObjects?.sun && this.mapData?.terrain) {
      this.mapObjects.sun.target.position.set(this.local.x, this.local.y, this.local.z);
      this.mapObjects.sun.position.set(this.local.x + 55, this.local.y + 92, this.local.z + 45);
    }

    if (this.bigMapOpen) {
      this.hud.drawBigMap?.(
        this.mapData,
        { ...this.local, id: this.localId },
        this.latestStorm,
        this.dropPlaneData,
        this.mapPingMarker
      );
    }

    if (this.dropPlaneMesh?.visible && this.dropPlaneMesh.userData?.props) {
      for (const prop of this.dropPlaneMesh.userData.props) {
        prop.rotation.z += dt * 26;
      }
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
      this.latestStorm,
      this.dropPlaneData,
      this.mapPingMarker
    );

    this.renderer.render(this.scene, this.camera);
  }

  updateLocalPlayer(dt, now, wStats) {
    if (this.local.dead) {
      if (this.autoRun) {
        this.autoRun = false;
        this.hud.setAutoRunActive?.(false);
      }
      const left = this.local.respawnUntil > now ? (this.local.respawnUntil - now) / 1000 : 0;
      this.hud.setRespawnState(true, left);
      this.camera.position.lerp(
        new THREE.Vector3(this.local.x, this.local.y + 2.6, this.local.z + 2.2),
        Math.min(1, 3 * dt)
      );
      return;
    }

    const keyForward = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    if (keyForward < 0 && this.autoRun) {
      this.autoRun = false;
      this.hud.setAutoRunActive?.(false);
    }
    const crouch = Boolean(this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyC']);
    if (crouch && this.autoRun) {
      this.autoRun = false;
      this.hud.setAutoRunActive?.(false);
    }
    const forward = this.autoRun ? 1 : keyForward;
    const right = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    const sprint = (this.autoRun || Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'])) && forward > 0 && !crouch && !this.adsActive;
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

    // Battle Royale C-130 Drop Plane / Skydive / Parachute Phase
    if (this.mode === 'survival' && this.local.dropPhase && this.local.dropPhase !== 'ground') {
      if (this.fpRig) this.fpRig.visible = false;
      this.adsActive = false;
      this.hud.updateCrosshair(6, false, false, 'iron', 0, 1.0);

      if (this.local.dropPhase === 'plane') {
        const dp = this.dropPlaneData;
        if (dp) {
          if (dp.endAt > dp.startAt) {
            const spanSec = Math.max(1, (dp.endAt - dp.startAt) / 1000);
            dp.x += ((dp.endX - dp.startX) / spanSec) * dt;
            dp.z += ((dp.endZ - dp.startZ) / spanSec) * dt;
          }
          this.local.x = dp.x;
          this.local.y = dp.y;
          this.local.z = dp.z;
          if (this.dropPlaneMesh) {
            this.dropPlaneMesh.position.set(dp.x, dp.y, dp.z);
          }
        }
        if (this.localChuteRig) this.localChuteRig.group.visible = false;
        const cosP = Math.cos(this.local.pitch);
        const fwdX = -Math.sin(this.local.yaw) * cosP;
        const fwdY = Math.sin(this.local.pitch);
        const fwdZ = -Math.cos(this.local.yaw) * cosP;
        const planeCamDist = this.mapData.terrain ? 24.0 : 16.5;
        this.camera.position.set(
          this.local.x - fwdX * planeCamDist,
          this.local.y - fwdY * planeCamDist + 2.4,
          this.local.z - fwdZ * planeCamDist
        );
        this.camera.rotation.y = this.local.yaw;
        this.camera.rotation.x = this.local.pitch;
        const floorY = this.mapData.terrain ? this.mapData.terrain.floorAt(this.local.x, this.local.z) : 0;
        this.hud.updateDropBanner({
          phase: 'plane',
          altitude: Math.max(0, Math.round((this.local.y || 260) - floorY)),
          vy: 0
        });
      } else {
        stepAirbornePhysics(this.local, input, this.mapData, dt, this.dropPlaneData);
        if (this.local.dropPhase === 'ground') {
          if (this.localChuteRig) this.localChuteRig.group.visible = false;
          this.hud.updateDropBanner(null);
          if (!this.fpRig) this.rebuildFirstPersonRig(this.local.weaponId);
          if (this.fpRig) this.fpRig.visible = true;
          soundEngine.playFootstep(false);
        } else {
          if (this.localChuteRig) {
            this.localChuteRig.group.visible = true;
            this.localChuteRig.group.position.set(this.local.x, this.local.y, this.local.z);
            this.localChuteRig.group.rotation.y = this.local.yaw;
            if (this.localChuteRig.chuteCanopy) {
              this.localChuteRig.chuteCanopy.visible = this.local.dropPhase === 'parachute';
            }
            animateOperatorRig(
              this.localChuteRig,
              {
                dead: false,
                crouch: false,
                sprint: this.local.dropPhase === 'skydive',
                moveSpeed: Math.hypot(this.local.vx, this.local.vz),
                pitch: this.local.pitch,
                showNameplate: false
              },
              dt,
              now * 0.001
            );
          }
          const camDist = this.local.dropPhase === 'parachute' ? 5.6 : 4.4;
          const cosP = Math.cos(this.local.pitch);
          const fwdX = -Math.sin(this.local.yaw) * cosP;
          const fwdY = Math.sin(this.local.pitch);
          const fwdZ = -Math.cos(this.local.yaw) * cosP;
          this.camera.position.set(
            this.local.x - fwdX * camDist,
            this.local.y + 1.65 - fwdY * camDist,
            this.local.z - fwdZ * camDist
          );
          this.camera.rotation.y = this.local.yaw;
          this.camera.rotation.x = this.local.pitch;
          const floorY = this.mapData.terrain ? this.mapData.terrain.floorAt(this.local.x, this.local.z) : 0;
          this.hud.updateDropBanner({
            phase: this.local.dropPhase,
            altitude: Math.max(0, Math.round(this.local.y - floorY)),
            vy: Math.round(Math.abs(this.local.vy || 0))
          });
        }
      }

      if (now - this.lastInputSendAt >= 25) {
        this.lastInputSendAt = now;
        this.net.send({
          type: 'input',
          ...input,
          dropPhase: this.local.dropPhase,
          onGround: this.local.onGround,
          x: Number(this.local.x.toFixed(3)),
          y: Number(this.local.y.toFixed(3)),
          z: Number(this.local.z.toFixed(3)),
          vx: Number((this.local.vx || 0).toFixed(2)),
          vy: Number((this.local.vy || 0).toFixed(2)),
          vz: Number((this.local.vz || 0).toFixed(2))
        });
      }
      if (this.local.dropPhase !== 'ground') return;
    } else if (this.mode === 'survival') {
      this.hud.updateDropBanner(null);
      if (this.localChuteRig) this.localChuteRig.group.visible = false;
      let nearestLoot = null;
      let nearestDist = 2.6;
      for (const lc of this.lootData.values()) {
        const d = Math.hypot(lc.x - this.local.x, lc.z - this.local.z);
        if (d < nearestDist && Math.abs((lc.y || 0) - this.local.y) < 2.2) {
          nearestDist = d;
          nearestLoot = lc;
        }
      }
      this.hud.updateLootHint(nearestLoot, this.local.weaponsState);
    }

    const opMult = OPERATORS[this.localMeta?.operator]?.speedMult || 1.0;
    stepPlayerPhysics(this.local, input, this.mapData, dt, wStats.moveSpeedMult, opMult);

    if (now - this.lastInputSendAt >= 25) {
      this.lastInputSendAt = now;
      this.net.send({
        type: 'input',
        ...input,
        dropPhase: this.local.dropPhase,
        onGround: this.local.onGround,
        x: Number(this.local.x.toFixed(3)),
        y: Number(this.local.y.toFixed(3)),
        z: Number(this.local.z.toFixed(3)),
        vx: Number((this.local.vx || 0).toFixed(2)),
        vy: Number((this.local.vy || 0).toFixed(2)),
        vz: Number((this.local.vz || 0).toFixed(2))
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

    if (this.adsActive && !wStats.isMelee && this.local.dropPhase === 'ground') {
      this.updateAdsAimAssist(dt);
    }

    this.camera.position.set(this.local.x, this.local.y + this.local.eyeHeight + bobY, this.local.z);
    this.camera.rotation.y = this.local.yaw;
    this.camera.rotation.x = this.local.pitch;

    const scopeFovs = wStats.scopeFovs || [24, 10];
    const wantsAds = this.adsActive && !wStats.isMelee;
    this.adsBlend += ((wantsAds ? 1 : 0) - this.adsBlend) * expSmooth(16, dt);

    let targetFov = this.baseFov;
    if (this.sniperZoomStage === 1) targetFov = scopeFovs[0];
    else if (this.sniperZoomStage === 2) targetFov = scopeFovs[1];
    else if (wantsAds) targetFov = wStats.adsFov || 44;
    else if (sprint) targetFov = this.baseFov + 5;

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * expSmooth(14, dt);
      this.camera.updateProjectionMatrix();
    }

    const zoomFactor = Math.tan((this.baseFov * Math.PI) / 360) / Math.tan((Math.max(5, this.camera.fov) * Math.PI) / 360);
    const spreadPx = 4 + horizSpeed * 1.2 + (this.local.onGround ? 0 : 6) + this.vmKickZ * 38;
    this.hud.updateCrosshair(spreadPx, this.sniperZoomStage > 0, wantsAds, wStats.opticId, this.adsBlend, zoomFactor);

    if (this.fpRig) {
      const gunData = this.fpRig.userData.gun?.userData;
      const isAcogScoped = wantsAds && wStats.opticId === 'acog' && this.adsBlend > 0.62;
      this.fpRig.visible = this.sniperZoomStage === 0 && !isAcogScoped;

      this.vmKickZ += (0 - this.vmKickZ) * expSmooth(18, dt);
      this.vmKickPitch += (0 - this.vmKickPitch) * expSmooth(16, dt);
      this.swayX += (0 - this.swayX) * expSmooth(12, dt);
      this.swayY += (0 - this.swayY) * expSmooth(12, dt);

      const sightPos = gunData?.aimSightLocalPos;
      const hipX = 0.22;
      const hipY = -0.22;
      const hipZ = -0.39;
      const adsX = sightPos ? -sightPos.x : 0.0;
      const adsY = sightPos ? -sightPos.y : -0.095;
      const adsZ = gunData?.aimDistanceZ ?? -0.28;

      const b = this.adsBlend;
      const swayScale = 1 - b * 0.78;
      const targetX = hipX + (adsX - hipX) * b;
      const targetY = hipY + (adsY - hipY) * b;
      const targetZ = hipZ + (adsZ - hipZ) * b;

      this.fpRig.position.x = targetX + (this.swayX + bobX) * swayScale;
      this.fpRig.position.y = targetY + (this.swayY + bobY * 0.55) * swayScale;
      this.fpRig.position.z = targetZ + this.vmKickZ;

      if (gunData?.boltMesh && gunData.boltBaseZ !== undefined) {
        gunData.boltMesh.position.z = gunData.boltBaseZ + Math.max(0, this.vmKickZ * 0.75);
      }

      if (this.local.reloadingEnd > now) {
        const total = Math.max(200, this.local.reloadingEnd - this.local.reloadingStart);
        const ratio = Math.min(1, (now - this.local.reloadingStart) / total);
        this.hud.updateReloadProgress(ratio);
        this.fpRig.rotation.z = Math.sin(ratio * Math.PI) * 0.42;
        this.fpRig.rotation.x = -Math.sin(ratio * Math.PI) * 0.22;
        this.fpRig.rotation.y = 0;

        if (gunData?.magMesh && gunData?.magBasePos) {
          const dropOffset = ratio < 0.5 ? Math.sin(ratio * Math.PI) * 0.22 : Math.cos((ratio - 0.5) * Math.PI) * 0.22;
          gunData.magMesh.position.y = gunData.magBasePos.y - dropOffset;
        }
      } else {
        this.hud.updateReloadProgress(0);
        this.fpRig.rotation.y = 0.025 * (1 - b);
        this.fpRig.rotation.z += ((sprint ? 0.18 : 0) * (1 - b) - this.fpRig.rotation.z) * expSmooth(12, dt);
        this.fpRig.rotation.x = this.vmKickPitch - (sprint ? 0.18 * (1 - b) : 0);
        if (gunData?.magMesh && gunData?.magBasePos) {
          gunData.magMesh.position.copy(gunData.magBasePos);
        }
      }
    }
  }

  updateRemotePlayers(dt, timeSec) {
    const posLerp = expSmooth(16, dt);
    const angleLerp = expSmooth(18, dt);
    for (const ent of this.remoteEntities.values()) {
      const tgt = ent.target;
      const cur = ent.current;
      if (tgt.dp === 1) {
        ent.rig.group.visible = false;
        if (ent.chuteCanopy) ent.chuteCanopy.visible = false;
        continue;
      }
      ent.rig.group.visible = !tgt.dead;
      if (ent.chuteCanopy) {
        ent.chuteCanopy.visible = !tgt.dead && tgt.dp === 3;
      }
      const pred = ent.pred || (ent.pred = { x: tgt.x, y: tgt.y, z: tgt.z });
      const prevX = cur.x;
      const prevZ = cur.z;

      // Velocity Dead-Reckoning between network snapshots (up to 280ms)
      if (!tgt.dead) {
        const age = ent.predAge || 0;
        if (age < 0.28) {
          const step = Math.min(dt, 0.28 - age);
          ent.predAge = age + step;
          pred.x += (tgt.vx || 0) * step;
          pred.z += (tgt.vz || 0) * step;
          if (!tgt.ground && tgt.vy !== undefined) {
            pred.y = Math.max(0, pred.y + (tgt.vy || 0) * step);
          }
          if (this.mapData) {
            const h = tgt.crouch ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;
            depenetratePlayerXZ(pred, h, PHYSICS.PLAYER_RADIUS, this.mapData);
          }
        }
      }

      if (Math.hypot(pred.x - cur.x, pred.z - cur.z) > 8.5) {
        cur.x = pred.x;
        cur.y = pred.y;
        cur.z = pred.z;
      } else {
        cur.x += (pred.x - cur.x) * posLerp;
        cur.y += (pred.y - cur.y) * posLerp;
        cur.z += (pred.z - cur.z) * posLerp;

        // Ensure interpolated remote players/bots never visually clip through wall corners
        if (!tgt.dead && this.mapData) {
          const h = tgt.crouch ? PHYSICS.HEIGHT_CROUCH : PHYSICS.HEIGHT_STAND;
          cur.onGround = Boolean(tgt.ground);
          depenetratePlayerXZ(cur, h, PHYSICS.PLAYER_RADIUS, this.mapData);
        }
      }

      cur.yaw += shortestAngleDiff(cur.yaw, tgt.yaw) * angleLerp;
      cur.pitch += ((tgt.pitch || 0) - cur.pitch) * angleLerp;

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
