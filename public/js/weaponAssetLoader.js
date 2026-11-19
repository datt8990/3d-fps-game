// Modular GLB Weapon & WAV Firearm Audio Asset Loader
// Supports CuiGames Animated FPS Weapons (.glb) & 3DAssets.dev GLB packs + WAV/MP3 Sound Packs
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MANIFEST_URL = '/assets/weapons/manifest.json';

let manifestPromise = null;
let manifestData = { weapons: {}, sounds: {} };

const gltfLoader = new GLTFLoader();
const glbCache = new Map();       // url -> Promise<{ scene, animations }>
const audioBufCache = new Map();  // url -> Promise<AudioBuffer | null>

export function loadWeaponAssetManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((res) => (res.ok ? res.json() : { weapons: {}, sounds: {} }))
      .then((data) => {
        manifestData = {
          weapons: data?.weapons || {},
          sounds: data?.sounds || {}
        };
        return manifestData;
      })
      .catch(() => ({ weapons: {}, sounds: {} }));
  }
  return manifestPromise;
}

// Kick off manifest fetch early so configured assets are ready before first match
loadWeaponAssetManifest();

export function getWeaponGlbConfig(weaponId) {
  return manifestData.weapons?.[weaponId] || null;
}

export function loadGlbWeaponAsset(url) {
  if (glbCache.has(url)) return glbCache.get(url);
  const p = new Promise((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations || [] }),
      undefined,
      () => resolve(null)
    );
  });
  glbCache.set(url, p);
  return p;
}

function resolveClip(animations, names) {
  if (!animations?.length) return null;
  const lower = names.map((n) => n.toLowerCase());
  for (const target of lower) {
    const exact = animations.find((a) => (a.name || '').toLowerCase() === target);
    if (exact) return exact;
  }
  for (const target of lower) {
    const partial = animations.find((a) => (a.name || '').toLowerCase().includes(target));
    if (partial) return partial;
  }
  return null;
}

/**
 * If `weaponId` has a registered `.glb` in manifest.json, replaces the visual
 * procedural sub-meshes inside `targetGroup` with the animated GLB model and
 * wires up a THREE.AnimationMixer controller (`playAction('fire' | 'reload' | 'draw' | 'idle' | 'ads' | 'charge')`).
 */
export function hydrateGlbWeaponIfConfigured(targetGroup, weaponId) {
  const cfg = getWeaponGlbConfig(weaponId);
  if (!cfg?.url) return;

  loadGlbWeaponAsset(cfg.url).then((loaded) => {
    if (!loaded?.scene || !targetGroup) return;
    const cloned = SkeletonUtils.clone(loaded.scene);
    const scale = cfg.scale ?? 1.0;
    cloned.scale.setScalar(scale);
    if (Array.isArray(cfg.position)) cloned.position.set(...cfg.position);
    if (Array.isArray(cfg.rotation)) cloned.rotation.set(...cfg.rotation);

    cloned.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material && 'envMapIntensity' in obj.material) {
          obj.material.envMapIntensity = 1.35;
        }
      }
    });

    // Hide fallback procedural meshes while keeping anchors (muzzle, eject port) intact
    for (const child of targetGroup.children) {
      if (!child.userData?.keepWithGlb) {
        child.visible = false;
      }
    }
    targetGroup.add(cloned);

    const mixer = new THREE.AnimationMixer(cloned);
    const clips = {
      idle: resolveClip(loaded.animations, cfg.clips?.idle || ['Idle', 'idle']),
      fire: resolveClip(loaded.animations, cfg.clips?.fire || ['Fire', 'FireLoop', 'Shoot', 'fire']),
      reload: resolveClip(loaded.animations, cfg.clips?.reload || ['Reload', 'reload']),
      charge: resolveClip(loaded.animations, cfg.clips?.charge || ['ChargingHandle', 'Bolt', 'Charge']),
      draw: resolveClip(loaded.animations, cfg.clips?.draw || ['Draw', 'Equip', 'Raise']),
      ads: resolveClip(loaded.animations, cfg.clips?.ads || ['ADS', 'Aim'])
    };

    const actions = {};
    for (const [key, clip] of Object.entries(clips)) {
      if (!clip) continue;
      const act = mixer.clipAction(clip);
      if (key !== 'idle') {
        act.setLoop(THREE.LoopOnce, 1);
        act.clampWhenFinished = false;
      }
      actions[key] = act;
    }
    actions.idle?.play();

    targetGroup.userData.glbController = {
      mixer,
      actions,
      play(actionName) {
        const act = actions[actionName];
        if (!act) return false;
        act.reset();
        act.fadeIn(0.05).play();
        return true;
      },
      update(dt) {
        mixer.update(dt);
      }
    };
  });
}

/**
 * Optional WAV/MP3 firearm audio buffer loader (for Free Firearm Sound Library,
 * Gun Reload Sounds, Free Military SFX, Modern Military Weapons 38 WAV).
 */
export function getConfiguredSoundUrl(soundKey, weaponId = null) {
  const s = manifestData.sounds || {};
  if (weaponId && s[`${weaponId}_${soundKey}`]) return s[`${weaponId}_${soundKey}`];
  return s[soundKey] || null;
}

export function getAudioSampleBuffer(ctx, url) {
  if (!ctx || !url) return Promise.resolve(null);
  if (audioBufCache.has(url)) return audioBufCache.get(url);
  const p = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((ab) => (ab ? ctx.decodeAudioData(ab) : null))
    .catch(() => null);
  audioBufCache.set(url, p);
  return p;
}
