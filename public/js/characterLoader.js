// Preloads, caches, clones & retargets high-detail smooth PBR & Stylized GLB character models
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const CHARACTER_ARCHETYPES = {
  soldier: {
    url: '/assets/models/Soldier.glb',
    facingY: 0,
    scale: 1.0,
    rigType: 'mixamo',
    animSource: 'soldier'
  },
  xbot: {
    url: '/assets/models/Xbot.glb',
    facingY: Math.PI,
    scale: 1.0,
    rigType: 'mixamo',
    animSource: 'xbot'
  },
  rpm: {
    url: '/assets/models/readyplayer.me.glb',
    facingY: Math.PI,
    scale: 0.96,
    rigType: 'rpm',
    animSource: 'xbot'
  },
  orion: {
    url: '/assets/models/Avatar_Orion.glb',
    facingY: 0,
    scale: 1.06,
    rigType: 'mixamo',
    animSource: 'xbot'
  },
  vita: {
    url: '/assets/models/VitaFemale.glb',
    facingY: 0,
    scale: 1.02,
    rigType: 'vroid',
    animSource: 'xbot'
  },
  vivi: {
    url: '/assets/models/ViviFemale.glb',
    facingY: 0,
    scale: 1.22,
    rigType: 'vroid',
    animSource: 'xbot'
  },
  shino: {
    url: '/assets/models/ShinoFemale.glb',
    facingY: 0,
    scale: 1.05,
    rigType: 'vroid',
    animSource: 'xbot'
  },
  shibu: {
    url: '/assets/models/ShibuFemale.glb',
    facingY: 0,
    scale: 1.07,
    rigType: 'vroid',
    animSource: 'xbot'
  },
  sample_a: {
    url: '/assets/models/SampleAFemale.glb',
    facingY: 0,
    scale: 1.07,
    yOffset: 0.056,
    rigType: 'vroid',
    animSource: 'xbot'
  },
  ghost_male: {
    url: '/assets/models/GhostMale.glb',
    facingY: 0,
    scale: 1.08,
    yOffset: 0.02,
    rigType: 'vroid',
    animSource: 'xbot'
  }
};

export function resolveCharacterArchetype(operatorId = 'vanguard') {
  switch (operatorId) {
    case 'siren':
      return 'shino';
    case 'valkyrie':
      return 'shibu';
    case 'aria':
      return 'sample_a';
    case 'phoenix':
      return 'vita';
    case 'kagura':
      return 'vivi';
    case 'ghost':
      return 'ghost_male';
    case 'titan':
      return 'xbot';
    case 'shadow':
      return 'orion';
    case 'vanguard':
    default:
      return 'soldier';
  }
}

const rawCache = new Map();
const clipBankCache = new Map();
let preloadPromise = null;
const loader = new GLTFLoader();

const downscaledTexCache = new WeakMap();

// Downscales oversized 2048px-4096px embedded VRoid GLB textures to crisp 512px once on load (4x-16x less GPU VRAM!)
function downscaleGlbTextureIfHuge(tex, maxDim = 512) {
  if (!tex || !tex.image || typeof document === 'undefined') return tex;
  if (downscaledTexCache.has(tex)) return downscaledTexCache.get(tex);
  const img = tex.image;
  const w = img.width || 0;
  const h = img.height || 0;
  if (w <= maxDim && h <= maxDim) {
    downscaledTexCache.set(tex, tex);
    return tex;
  }
  try {
    const scale = maxDim / Math.max(w, h);
    const nw = Math.max(64, Math.round(w * scale));
    const nh = Math.max(64, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, nw, nh);
    const out = new THREE.CanvasTexture(canvas);
    out.colorSpace = tex.colorSpace || THREE.SRGBColorSpace;
    out.flipY = tex.flipY;
    out.wrapS = tex.wrapS;
    out.wrapT = tex.wrapT;
    out.repeat.copy(tex.repeat);
    out.offset.copy(tex.offset);
    out.needsUpdate = true;
    downscaledTexCache.set(tex, out);
    return out;
  } catch {
    downscaledTexCache.set(tex, tex);
    return tex;
  }
}

// AAA Runtime GLB Optimizer (runs ONCE per archetype on load — ZERO visual loss!):
// 1. Strips 410+ unused VRoid facial morph targets (eliminates morph vertex-texture shaders)
// 2. Merges 60-78 sibling Hair/Body SkinnedMesh primitives per material -> ~3-4 draw calls (20x fewer draw calls!)
// 3. Downscales 2048px+ embedded GLB textures to crisp 512px to slash VRAM & bandwidth on weak GPUs
function optimizeLoadedGlbScene(sceneRoot) {
  if (!sceneRoot) return;
  try {
    // Pass 1: Strip unused morph targets & downscale huge textures
    const parentGroups = new Set();
    sceneRoot.traverse((obj) => {
      if (obj.isMesh && obj.geometry) {
        if (obj.geometry.morphAttributes && Object.keys(obj.geometry.morphAttributes).length > 0) {
          obj.geometry.morphAttributes = {};
          obj.morphTargetInfluences = undefined;
          obj.morphTargetDictionary = undefined;
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && m.map) m.map = downscaleGlbTextureIfHuge(m.map, 512);
        }
        if (obj.isSkinnedMesh && obj.parent) {
          parentGroups.add(obj.parent);
        }
      }
    });

    // Pass 2: Merge sibling SkinnedMeshes sharing the exact same material & skeleton (e.g., 78 VRoid Hair primitives -> 3-4!)
    if (BufferGeometryUtils?.mergeGeometries) {
      for (const parent of parentGroups) {
        const buckets = new Map();
        for (const ch of parent.children) {
          if (!ch.isSkinnedMesh || !ch.geometry || !ch.skeleton || Array.isArray(ch.material)) continue;
          if (ch.position.lengthSq() > 1e-6 || ch.scale.x !== 1 || ch.scale.y !== 1 || ch.scale.z !== 1) continue;
          const sk = ch.skeleton;
          const bKey = `${ch.material.uuid}|${sk.bones.length}|${sk.bones[0]?.uuid || ''}|${sk.bones[sk.bones.length - 1]?.uuid || ''}`;
          let arr = buckets.get(bKey);
          if (!arr) { arr = []; buckets.set(bKey, arr); }
          arr.push(ch);
        }

        for (const list of buckets.values()) {
          if (list.length < 2) continue;
          const first = list[0];
          const geos = [];
          let compatible = true;
          const allIndexed = list.every((sm) => Boolean(sm.geometry.index));
          const keepAttrs = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'];
          for (const sm of list) {
            if (!sm.geometry.attributes.skinIndex || !sm.geometry.attributes.skinWeight) {
              compatible = false;
              break;
            }
            // Keep indexed geometries indexed to avoid 3x vertex expansion; only de-index if mixed
            const g = allIndexed ? sm.geometry.clone() : (sm.geometry.index ? sm.geometry.toNonIndexed() : sm.geometry.clone());
            for (const attrName of Object.keys(g.attributes)) {
              if (!keepAttrs.includes(attrName)) g.deleteAttribute(attrName);
            }
            // Normalize skinIndex to Uint16Array & skinWeight to Float32Array so mergeGeometries never rejects mixed types
            const si = g.attributes.skinIndex;
            if (!(si.array instanceof Uint16Array)) {
              g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(si.array), si.itemSize));
            }
            const sw = g.attributes.skinWeight;
            if (!(sw.array instanceof Float32Array)) {
              g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(sw.array), sw.itemSize));
            }
            if (!g.attributes.normal) g.computeVertexNormals();
            if (!g.attributes.uv) {
              g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
            }
            geos.push(g);
          }
          if (!compatible || geos.length < 2) {
            for (const g of geos) g.dispose();
            continue;
          }
          const mergedGeo = BufferGeometryUtils.mergeGeometries(geos, false);
          for (const g of geos) g.dispose();
          if (!mergedGeo) continue;

          const mergedSkinned = new THREE.SkinnedMesh(mergedGeo, first.material);
          mergedSkinned.name = first.name;
          mergedSkinned.bindMode = first.bindMode;
          mergedSkinned.bind(first.skeleton, first.bindMatrix.clone());
          mergedSkinned.frustumCulled = false;

          parent.add(mergedSkinned);
          for (const old of list) {
            parent.remove(old);
            old.geometry?.dispose();
          }
        }
      }
    }
  } catch (err) {
    console.warn('[CharacterLoader] optimizeLoadedGlbScene warning:', err);
  }
}

function trackedLoadRaw(key) {
  const existing = rawCache.get(key);
  if (existing) return existing;
  const cfg = CHARACTER_ARCHETYPES[key];
  if (!cfg || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  const p = new Promise((resolve) => {
    loader.load(
      cfg.url,
      (gltf) => {
        optimizeLoadedGlbScene(gltf.scene);
        gltf.scene.updateMatrixWorld(true);
        resolve(gltf);
      },
      undefined,
      (err) => {
        console.warn(`[CharacterLoader] Failed to load ${cfg.url}:`, err);
        resolve(null);
      }
    );
  });
  p.resolved = null;
  p.then((g) => { p.resolved = g; });
  rawCache.set(key, p);
  return p;
}

const UPPER_LIMB_TRACK_RE = /(Shoulder|Arm|ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky)/i;

function stripUpperArmAndDriftTracks(clip, hipNodeName) {
  const tracks = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const nodeName = dot >= 0 ? t.name.slice(0, dot) : t.name;
    const prop = dot >= 0 ? t.name.slice(dot + 1) : '';

    // Arms & hands are solved deterministically by the weapon-grip solver (zero keyframe jitter)
    if (UPPER_LIMB_TRACK_RE.test(nodeName)) continue;

    if (prop === 'position') {
      if (nodeName !== hipNodeName) continue;
      const cloned = t.clone();
      const baseX = cloned.values[0];
      const baseZ = cloned.values[2];
      for (let i = 0; i < cloned.values.length; i += 3) {
        cloned.values[i] = baseX;
        cloned.values[i + 2] = baseZ;
      }
      tracks.push(cloned);
    } else if (prop === 'quaternion') {
      tracks.push(t.clone());
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// World-Delta lower-body/spine retargeting invariant to bind roll, root rotation, and scale
function retargetWorldDeltaClip(targetRoot, targetFacingY, sourceRoot, sourceFacingY, sourceClip, targetToSourceMap, fps = 30) {
  const sWrap = new THREE.Group();
  const sClone = SkeletonUtils.clone(sourceRoot);
  sClone.rotation.y = sourceFacingY;
  sWrap.add(sClone);
  sWrap.updateMatrixWorld(true);

  const tWrap = new THREE.Group();
  const tClone = SkeletonUtils.clone(targetRoot);
  tClone.rotation.y = targetFacingY;
  tWrap.add(tClone);
  tWrap.updateMatrixWorld(true);

  const pairs = [];
  const targetRestWorld = new Map();
  const sourceRestInvWorld = new Map();

  tClone.traverse((node) => {
    if (UPPER_LIMB_TRACK_RE.test(node.name)) return;
    const srcName = targetToSourceMap[node.name];
    if (!srcName) return;
    const srcBone = sClone.getObjectByName(srcName);
    if (!srcBone) return;

    const twq = new THREE.Quaternion();
    node.getWorldQuaternion(twq);
    targetRestWorld.set(node, twq);

    const swq = new THREE.Quaternion();
    srcBone.getWorldQuaternion(swq);
    sourceRestInvWorld.set(node, swq.invert());
    pairs.push({ target: node, source: srcBone, times: [], values: [] });
  });

  if (pairs.length === 0) return stripUpperArmAndDriftTracks(sourceClip, 'Hips');

  const mixer = new THREE.AnimationMixer(sClone);
  mixer.clipAction(sourceClip).play();

  const duration = Math.max(0.05, sourceClip.duration);
  const frameCount = Math.max(2, Math.round(duration * fps) + 1);
  const dt = duration / (frameCount - 1);

  const sCurQ = new THREE.Quaternion();
  const deltaQ = new THREE.Quaternion();
  const desiredWorldQ = new THREE.Quaternion();
  const parentWorldQ = new THREE.Quaternion();
  const localQ = new THREE.Quaternion();

  for (let f = 0; f < frameCount; f++) {
    const time = Math.min(duration, f * dt);
    mixer.setTime(time);
    sWrap.updateMatrixWorld(true);

    for (const p of pairs) {
      p.source.getWorldQuaternion(sCurQ);
      deltaQ.multiplyQuaternions(sCurQ, sourceRestInvWorld.get(p.target));
      desiredWorldQ.multiplyQuaternions(deltaQ, targetRestWorld.get(p.target));
      if (p.target.parent) {
        p.target.parent.getWorldQuaternion(parentWorldQ);
        localQ.multiplyQuaternions(parentWorldQ.invert(), desiredWorldQ);
      } else {
        localQ.copy(desiredWorldQ);
      }
      p.target.quaternion.copy(localQ);
      p.target.updateMatrixWorld(true);
      p.times.push(time);
      p.values.push(localQ.x, localQ.y, localQ.z, localQ.w);
    }
  }

  const tracks = pairs.map((p) => new THREE.QuaternionKeyframeTrack(`${p.target.name}.quaternion`, p.times, p.values));
  return new THREE.AnimationClip(sourceClip.name, duration, tracks);
}

const VROID_TO_MIXAMO = {
  J_Bip_C_Hips: 'mixamorigHips',
  J_Bip_C_Spine: 'mixamorigSpine',
  J_Bip_C_Chest: 'mixamorigSpine1',
  J_Bip_C_UpperChest: 'mixamorigSpine2',
  J_Bip_C_Neck: 'mixamorigNeck',
  J_Bip_C_Head: 'mixamorigHead',
  J_Bip_L_UpperLeg: 'mixamorigLeftUpLeg',
  J_Bip_L_LowerLeg: 'mixamorigLeftLeg',
  J_Bip_L_Foot: 'mixamorigLeftFoot',
  J_Bip_L_ToeBase: 'mixamorigLeftToeBase',
  J_Bip_R_UpperLeg: 'mixamorigRightUpLeg',
  J_Bip_R_LowerLeg: 'mixamorigRightLeg',
  J_Bip_R_Foot: 'mixamorigRightFoot',
  J_Bip_R_ToeBase: 'mixamorigRightToeBase'
};

function buildClipBank(key, targetGltf, animSourceGltf) {
  if (clipBankCache.has(key)) return clipBankCache.get(key);
  const cfg = CHARACTER_ARCHETYPES[key];
  const srcCfg = CHARACTER_ARCHETYPES[cfg.animSource];
  const bank = {};

  if (cfg.animSource === key) {
    const findClip = (name) => targetGltf.animations.find((a) => a.name.toLowerCase() === name);
    const iClip = findClip('idle');
    const wClip = findClip('walk');
    const rClip = findClip('run');
    if (iClip) bank.idle = stripUpperArmAndDriftTracks(iClip, 'mixamorigHips');
    if (wClip) bank.walk = stripUpperArmAndDriftTracks(wClip, 'mixamorigHips');
    if (rClip) bank.run = stripUpperArmAndDriftTracks(rClip, 'mixamorigHips');
  } else if (animSourceGltf) {
    const map = {};
    let skin = null;
    targetGltf.scene.traverse((c) => { if (c.isSkinnedMesh && !skin) skin = c; });
    if (skin) {
      for (const b of skin.skeleton.bones) {
        if (VROID_TO_MIXAMO[b.name]) {
          map[b.name] = VROID_TO_MIXAMO[b.name];
        } else {
          map[b.name] = b.name.startsWith('mixamorig') ? b.name : `mixamorig${b.name}`;
        }
      }
    }
    const findSrc = (name) => animSourceGltf.animations.find((a) => a.name.toLowerCase() === name);
    const iClip = findSrc('idle');
    const wClip = findSrc('walk');
    const rClip = findSrc('run');
    if (iClip) bank.idle = retargetWorldDeltaClip(targetGltf.scene, cfg.facingY, animSourceGltf.scene, srcCfg.facingY, iClip, map, 30);
    if (wClip) bank.walk = retargetWorldDeltaClip(targetGltf.scene, cfg.facingY, animSourceGltf.scene, srcCfg.facingY, wClip, map, 30);
    if (rClip) bank.run = retargetWorldDeltaClip(targetGltf.scene, cfg.facingY, animSourceGltf.scene, srcCfg.facingY, rClip, map, 30);
  }

  clipBankCache.set(key, bank);
  return bank;
}

export async function preloadCharacterModels(priorityKey = 'soldier') {
  if (typeof window === 'undefined') return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const keys = Object.keys(CHARACTER_ARCHETYPES).filter((k) => k !== 'rpm');
    const priorityList = [priorityKey, 'soldier', 'xbot'].filter((k) => k && CHARACTER_ARCHETYPES[k]);
    const remaining = keys.filter((k) => !priorityList.includes(k));
    const loadOrder = [...new Set([...priorityList, ...remaining])];

    const byKey = {};
    for (const k of loadOrder) {
      try {
        const gltf = await trackedLoadRaw(k);
        byKey[k] = gltf;
        if (gltf) {
          const srcKey = CHARACTER_ARCHETYPES[k].animSource;
          if (byKey[srcKey]) {
            buildClipBank(k, gltf, byKey[srcKey]);
          }
        }
        await new Promise((r) => setTimeout(r, 80));
      } catch (err) {
        console.warn(`[CharacterLoader] Preload failed for ${k}:`, err);
      }
    }
    return byKey;
  })();

  return preloadPromise;
}

export function getLoadedCharacterSync(key) {
  const gltf = rawCache.get(key)?.resolved || null;
  if (!gltf) return null;
  const srcKey = CHARACTER_ARCHETYPES[key]?.animSource;
  const srcGltf = srcKey ? (rawCache.get(srcKey)?.resolved || null) : null;
  const clips = buildClipBank(key, gltf, srcGltf);
  return { gltf, clips, cfg: CHARACTER_ARCHETYPES[key] };
}

export async function loadCharacterArchetype(key) {
  const cfg = CHARACTER_ARCHETYPES[key];
  if (!cfg) return null;
  const [gltf, srcGltf] = await Promise.all([
    trackedLoadRaw(key),
    cfg.animSource && cfg.animSource !== key ? trackedLoadRaw(cfg.animSource) : Promise.resolve(null)
  ]);
  if (!gltf) return null;
  const clips = buildClipBank(key, gltf, srcGltf || gltf);
  return { gltf, clips, cfg };
}

function blendWithWhite(hex, tintStrength = 0.35) {
  const white = new THREE.Color('#ffffff');
  return white.lerp(new THREE.Color(hex), tintStrength);
}

const recolorTexCache = new Map();

function recolorGlbTexture(srcTex, primaryHex, secondaryHex, minLum = 0.24, accentHex = '', outfitId = 'urban') {
  if (!srcTex || typeof document === 'undefined') return null;
  const img = srcTex.image;
  if (!img || !img.width || !img.height) return null;

  const cacheKey = `${srcTex.uuid}_${primaryHex}_${secondaryHex}_${accentHex}_${outfitId}_${minLum.toFixed(2)}`;
  if (recolorTexCache.has(cacheKey)) return recolorTexCache.get(cacheKey);

  try {
    const maxDim = 256;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const c1 = new THREE.Color(primaryHex);
    const c2 = new THREE.Color(secondaryHex);
    const pR = c1.r * 255, pG = c1.g * 255, pB = c1.b * 255;
    const sR = c2.r * 255, sG = c2.g * 255, sB = c2.b * 255;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 8) continue;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const shade = minLum + (1 - minLum) * Math.pow(lum, 0.68);
      const t = Math.min(1, Math.max(0, (lum - 0.10) / 0.52));
      const rMix = sR + (pR - sR) * t;
      const gMix = sG + (pG - sG) * t;
      const bMix = sB + (pB - sB) * t;
      data[i] = Math.min(255, Math.round(rMix * shade));
      data[i + 1] = Math.min(255, Math.round(gMix * shade));
      data[i + 2] = Math.min(255, Math.round(bMix * shade));
    }
    ctx.putImageData(imgData, 0, 0);

    // Paint distinct high-contrast tactical / luxury outfit patterns directly onto garment UVs
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    if (outfitId === 'jungle' || outfitId === 'desert' || outfitId === 'arctic') {
      ctx.fillStyle = secondaryHex;
      ctx.globalAlpha = outfitId === 'arctic' ? 0.34 : 0.44;
      for (let k = 0; k < 26; k++) {
        const cx = ((k * 97 + 29) % w);
        const cy = ((k * 139 + 41) % h);
        const rw = (w * 0.08) + ((k * 23) % Math.round(w * 0.10));
        const rh = (h * 0.04) + ((k * 17) % Math.round(h * 0.07));
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, (k % 6) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (accentHex) {
        ctx.fillStyle = accentHex;
        ctx.globalAlpha = outfitId === 'arctic' ? 0.25 : 0.16;
        for (let k = 0; k < 12; k++) {
          ctx.fillRect(((k * 127 + 19) % w), ((k * 83 + 11) % h), w * 0.07, h * 0.03);
        }
      }
    } else if (outfitId === 'crimson') {
      // Aggressive Crimson Elite diagonal dark-carbon armor chevrons & glowing red tactical piping
      ctx.strokeStyle = '#09090b';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(4, w * 0.028);
      for (let d = -h; d < w + h; d += Math.round(w * 0.16)) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + h * 0.55, h);
        ctx.stroke();
      }
      ctx.strokeStyle = accentHex || '#ff4d4f';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(2, w * 0.010);
      for (let d = -h; d < w + h; d += Math.round(w * 0.16)) {
        ctx.beginPath();
        ctx.moveTo(d + 8, 0);
        ctx.lineTo(d + h * 0.55 + 8, h);
        ctx.stroke();
      }
    } else if (outfitId === 'stealth_ops') {
      // Stealth Night-Ops carbon diamond weave + sharp glowing emerald tactical seam lines
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1.5;
      const step = Math.max(14, Math.round(w * 0.045));
      for (let i = -h; i < w + h; i += step) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
      }
      ctx.strokeStyle = accentHex || '#10b981';
      ctx.globalAlpha = 0.90;
      ctx.lineWidth = Math.max(3, w * 0.012);
      for (let y = Math.round(h * 0.16); y < h; y += Math.round(h * 0.24)) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (outfitId === 'cyber') {
      // Electric Cyberpunk Neon cyan & hot-magenta glowing circuit traces!
      const step = Math.max(24, Math.round(w * 0.09));
      ctx.strokeStyle = '#22d3ee';
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = Math.max(3, w * 0.011);
      for (let y = step; y < h; y += step * 2) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w * 0.34, y);
        ctx.lineTo(w * 0.44, y + step * 0.5);
        ctx.lineTo(w, y + step * 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = '#f472b6';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(2.5, w * 0.009);
      for (let y = Math.round(step * 1.5); y < h; y += step * 2) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w * 0.58, y);
        ctx.lineTo(w * 0.68, y - step * 0.45);
        ctx.lineTo(w, y - step * 0.45);
        ctx.stroke();
      }
    } else if (outfitId === 'royal_gold') {
      // Imperial Royal Gold: rich gilded filigree borders & obsidian-gold luxury chevron panels
      ctx.strokeStyle = '#1c1917';
      ctx.globalAlpha = 0.52;
      ctx.lineWidth = Math.max(5, w * 0.032);
      for (let y = Math.round(h * 0.14); y < h; y += Math.round(h * 0.22)) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w * 0.5, y + h * 0.08);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#fef08a';
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = Math.max(2.5, w * 0.012);
      for (let y = Math.round(h * 0.14); y < h; y += Math.round(h * 0.22)) {
        ctx.beginPath();
        ctx.moveTo(0, y - 5);
        ctx.lineTo(w * 0.5, y + h * 0.08 - 5);
        ctx.lineTo(w, y - 5);
        ctx.stroke();
      }
    }
    ctx.restore();

    const outTex = new THREE.CanvasTexture(canvas);
    outTex.colorSpace = THREE.SRGBColorSpace;
    outTex.flipY = srcTex.flipY;
    outTex.wrapS = srcTex.wrapS;
    outTex.wrapT = srcTex.wrapT;
    outTex.repeat.copy(srcTex.repeat);
    outTex.offset.copy(srcTex.offset);
    outTex.needsUpdate = true;

    if (recolorTexCache.size > 96) {
      const firstKey = recolorTexCache.keys().next().value;
      recolorTexCache.delete(firstKey);
    }
    recolorTexCache.set(cacheKey, outTex);
    return outTex;
  } catch {
    return null;
  }
}

function upgradeToStandardMaterial(srcMat) {
  if (!srcMat.isMeshBasicMaterial) return srcMat.clone();
  return new THREE.MeshStandardMaterial({
    name: srcMat.name,
    color: srcMat.color ? srcMat.color.clone() : new THREE.Color('#ffffff'),
    map: srcMat.map || null,
    alphaMap: srcMat.alphaMap || null,
    alphaTest: srcMat.alphaTest || 0,
    transparent: Boolean(srcMat.transparent),
    opacity: srcMat.opacity ?? 1,
    side: srcMat.side ?? THREE.FrontSide,
    depthWrite: srcMat.depthWrite ?? !srcMat.transparent,
    vertexColors: Boolean(srcMat.vertexColors),
    roughness: 0.65,
    metalness: 0.04
  });
}

function applyRecoloredClothingMat(mat, primaryHex, secondaryHex, minLum = 0.25, fallbackTintStrength = 0.65, accentHex = '', outfitId = 'urban') {
  const recolored = mat.map ? recolorGlbTexture(mat.map, primaryHex, secondaryHex, minLum, accentHex, outfitId) : null;
  if (recolored) {
    mat.map = recolored;
    mat.color.set('#ffffff');
    // Lightweight flat emissive accents (avoids expensive per-pixel emissiveMap shader variant)
    if (outfitId === 'cyber') {
      mat.emissive.set('#22114a');
      mat.emissiveIntensity = 0.45;
    } else if (outfitId === 'royal_gold') {
      mat.emissive.set('#713f12');
      mat.emissiveIntensity = 0.22;
    } else if (outfitId === 'crimson') {
      mat.emissive.set('#450a0a');
      mat.emissiveIntensity = 0.22;
    } else if (outfitId === 'stealth_ops') {
      mat.emissive.set('#052e16');
      mat.emissiveIntensity = 0.20;
    }
  } else {
    mat.color.copy(blendWithWhite(primaryHex, fallbackTintStrength));
  }
}

const bikiniTexCache = new Map();

// Generates a seamless luminous porcelain-skin + 2-piece sculpted bikini texture on standardized VRoid Body_00_SKIN UVs
function createVroidBikiniBodyTexture(srcTex, primaryHex, secHex, accentHex) {
  if (typeof document === 'undefined') return null;
  const img = srcTex?.image;
  const cacheKey = `${srcTex?.uuid || 'nobase'}_${primaryHex}_${secHex}_${accentHex}`;
  if (bikiniTexCache.has(cacheKey)) return bikiniTexCache.get(cacheKey);

  try {
    const W = 512;
    const H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    let baseR = 248, baseG = 207, baseB = 183;
    if (img && img.width && img.height) {
      ctx.drawImage(img, 0, 0, W, H);
      const imgData = ctx.getImageData(0, 0, W, H);
      const d = imgData.data;

      // Sample natural belly / collarbone skin color from source body texture so torso matches face tone cleanly
      let sr = 0, sg = 0, sb = 0, sc = 0;
      for (let py = Math.round(H * 0.38); py < Math.round(H * 0.44); py++) {
        for (let px = Math.round(W * 0.40); px < Math.round(W * 0.60); px++) {
          const idx = (py * W + px) * 4;
          if (d[idx + 3] > 235 && d[idx] > 195 && d[idx] > d[idx + 1] + 6 && d[idx + 1] > d[idx + 2] + 4) {
            sr += d[idx]; sg += d[idx + 1]; sb += d[idx + 2]; sc++;
          }
        }
      }
      if (sc > 25) {
        baseR = Math.round(sr / sc);
        baseG = Math.round(sg / sc);
        baseB = Math.round(sb / sc);
      }

      // Erase any cutout alpha holes, socks, arm sleeves, bodysuits, or default panties while keeping subtle skin shading/toes/fingers
      for (let py = 0; py < H; py++) {
        const v = py / H;
        for (let px = 0; px < W; px++) {
          const u = px / W;
          const idx = (py * W + px) * 4;
          const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];
          const isTorsoCenter = u >= 0.236 && u <= 0.764;
          const isOuterLimb = !isTorsoCenter;
          const isWarmSkin = r > 176 && (r - b) > 16 && r >= g;
          const inChestMaskZone = isTorsoCenter && v >= 0.13 && v <= 0.372;
          const inPantyMaskZone = isTorsoCenter && v >= 0.455 && v <= 0.655;
          const inFootSockMask = isTorsoCenter && v >= 0.56 && r < 168;

          if (a < 245 || !isWarmSkin || inChestMaskZone || inPantyMaskZone || inFootSockMask || (isOuterLimb && (r < 185 || b > r - 12))) {
            d[idx] = baseR;
            d[idx + 1] = baseG;
            d[idx + 2] = baseB;
            d[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } else {
      ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Add soft natural cleavage & collarbone shading on upper chest
    const cleaveGrad = ctx.createRadialGradient(W * 0.50, H * 0.295, 2, W * 0.50, H * 0.295, W * 0.065);
    cleaveGrad.addColorStop(0, 'rgba(195, 130, 108, 0.34)');
    cleaveGrad.addColorStop(1, 'rgba(195, 130, 108, 0)');
    ctx.fillStyle = cleaveGrad;
    ctx.beginPath();
    ctx.arc(W * 0.50, H * 0.295, W * 0.065, 0, Math.PI * 2);
    ctx.fill();

    // Paint Sleek 2-Piece Summer Bikini
    const trimCol = accentHex || '#fde047';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Back bra strap & side torso straps wrapping cleanly around u = 0.238..0.38 and 0.62..0.762
    ctx.fillStyle = primaryHex;
    ctx.fillRect(W * 0.236, H * 0.292, W * 0.145, H * 0.022);
    ctx.fillRect(W * 0.619, H * 0.292, W * 0.145, H * 0.022);
    ctx.strokeStyle = trimCol;
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.236, H * 0.292, W * 0.145, H * 0.022);
    ctx.strokeRect(W * 0.619, H * 0.292, W * 0.145, H * 0.022);

    // Thin halter neck straps rising cleanly from bra cup apices to collarbone
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 5;
    for (const [ax, ay, nx, ny] of [
      [0.440, 0.228, 0.420, 0.108],
      [0.560, 0.228, 0.580, 0.108]
    ]) {
      ctx.beginPath();
      ctx.moveTo(W * ax, H * ay);
      ctx.quadraticCurveTo(W * ((ax + nx) * 0.5), H * ((ay + ny) * 0.5), W * nx, H * ny);
      ctx.stroke();
    }

    // Center cleavage connector + metallic bikini clasp ring
    ctx.strokeStyle = trimCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.484, H * 0.318);
    ctx.lineTo(W * 0.516, H * 0.318);
    ctx.stroke();

    // Sculpted Left & Right Triangle Bikini Cups aligned with VRoid J_Sec Bust UV peaks (0.442 / 0.558, 0.295)
    for (const side of [-1, 1]) {
      const cx = side < 0 ? 0.440 : 0.560;
      const innerX = side < 0 ? 0.488 : 0.512;
      const outerX = side < 0 ? 0.362 : 0.638;

      const cupGrad = ctx.createLinearGradient(W * cx, H * 0.226, W * cx, H * 0.354);
      cupGrad.addColorStop(0, primaryHex);
      cupGrad.addColorStop(0.65, primaryHex);
      cupGrad.addColorStop(1, secHex || primaryHex);

      ctx.fillStyle = cupGrad;
      ctx.beginPath();
      ctx.moveTo(W * cx, H * 0.224);
      ctx.quadraticCurveTo(W * ((cx + outerX) * 0.52), H * 0.275, W * outerX, H * 0.330);
      ctx.quadraticCurveTo(W * cx, H * 0.358, W * innerX, H * 0.326);
      ctx.quadraticCurveTo(W * ((cx + innerX) * 0.49), H * 0.274, W * cx, H * 0.224);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = trimCol;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }

    // Sculpted Low-Rise Side-Tie Bikini Bottoms aligned with VRoid Pelvis UV band (v = 0.470..0.636)
    const botGrad = ctx.createLinearGradient(W * 0.50, H * 0.470, W * 0.50, H * 0.636);
    botGrad.addColorStop(0, primaryHex);
    botGrad.addColorStop(0.7, primaryHex);
    botGrad.addColorStop(1, secHex || primaryHex);

    ctx.fillStyle = botGrad;
    ctx.beginPath();
    ctx.moveTo(W * 0.236, H * 0.486);
    ctx.quadraticCurveTo(W * 0.36, H * 0.466, W * 0.500, H * 0.495);
    ctx.quadraticCurveTo(W * 0.64, H * 0.466, W * 0.764, H * 0.486);
    ctx.lineTo(W * 0.764, H * 0.576);
    ctx.quadraticCurveTo(W * 0.695, H * 0.506, W * 0.500, H * 0.638);
    ctx.quadraticCurveTo(W * 0.305, H * 0.506, W * 0.236, H * 0.576);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = trimCol;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Hip tie rings
    ctx.fillStyle = trimCol;
    for (const rx of [0.34, 0.66]) {
      ctx.beginPath();
      ctx.arc(W * rx, H * 0.486, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const outTex = new THREE.CanvasTexture(canvas);
    outTex.colorSpace = THREE.SRGBColorSpace;
    outTex.flipY = srcTex ? srcTex.flipY : false;
    outTex.wrapS = THREE.ClampToEdgeWrapping;
    outTex.wrapT = THREE.ClampToEdgeWrapping;
    outTex.needsUpdate = true;

    if (bikiniTexCache.size > 24) {
      bikiniTexCache.delete(bikiniTexCache.keys().next().value);
    }
    bikiniTexCache.set(cacheKey, outTex);
    return outTex;
  } catch {
    return null;
  }
}

// Creates Phoenix tactical skin texture: bare upper thighs + sheer dark charcoal thigh-high stockings + garters + dark sleeve/gloves
function createPhoenixTacticalBodyTexture(srcTex, suitHex = '#232730', trimHex = '#11151d') {
  if (typeof document === 'undefined') return null;
  const cacheKey = `phx_tac_${srcTex?.uuid || 'x'}_${suitHex}_${trimHex}`;
  if (bikiniTexCache.has(cacheKey)) return bikiniTexCache.get(cacheKey);
  try {
    const W = 512, H = 512;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const skinHex = '#f9d6c1';
    ctx.fillStyle = skinHex;
    ctx.fillRect(0, 0, W, H);
    if (srcTex?.image?.width) {
      ctx.drawImage(srcTex.image, 0, 0, W, H);
    }
    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    const cSuit = new THREE.Color(suitHex);
    const sr = cSuit.r * 255, sg = cSuit.g * 255, sb = cSuit.b * 255;

    for (let py = 0; py < H; py++) {
      const v = py / H;
      for (let px = 0; px < W; px++) {
        const u = px / W;
        const idx = (py * W + px) * 4;
        const isOuter = u < 0.236 || u > 0.764;
        const isTorso = !isOuter;

        if (isTorso && v >= 0.145 && v <= 0.65) {
          // Sleek dark tactical collar shirt & shorts
          d[idx] = Math.round(sr); d[idx + 1] = Math.round(sg); d[idx + 2] = Math.round(sb); d[idx + 3] = 255;
        } else if (isTorso && v >= 0.65 && v <= 0.76) {
          // Boots/socks interior
          d[idx] = 24; d[idx + 1] = 26; d[idx + 2] = 32; d[idx + 3] = 255;
        } else if (isOuter && v < 0.14) {
          // Bare upper thigh skin gap
          d[idx] = 248; d[idx + 1] = 208; d[idx + 2] = 184; d[idx + 3] = 255;
        } else if (isOuter && v >= 0.14 && v < 0.49) {
          // Sheer dark charcoal thigh-high stockings (semi-sheer blend over skin)
          const sheer = v < 0.165 ? 0.92 : 0.76;
          d[idx] = Math.round(248 * (1 - sheer) + sr * sheer);
          d[idx + 1] = Math.round(208 * (1 - sheer) + sg * sheer);
          d[idx + 2] = Math.round(184 * (1 - sheer) + sb * sheer);
          d[idx + 3] = 255;
        } else if (isOuter && v >= 0.50) {
          // Tactical long sleeves & dark fingerless gloves
          const isHandSkin = v > 0.955;
          if (isHandSkin) {
            d[idx] = 248; d[idx + 1] = 208; d[idx + 2] = 184;
          } else {
            d[idx] = Math.round(sr * (v > 0.85 ? 0.78 : 1.0));
            d[idx + 1] = Math.round(sg * (v > 0.85 ? 0.78 : 1.0));
            d[idx + 2] = Math.round(sb * (v > 0.85 ? 0.78 : 1.0));
          }
          d[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Garter straps on outer thighs & crisp collar detail
    ctx.fillStyle = trimHex;
    ctx.fillRect(0, H * 0.140, W * 0.236, H * 0.018);
    ctx.fillRect(W * 0.764, H * 0.140, W * 0.236, H * 0.018);
    ctx.fillRect(W * 0.236, H * 0.46, W * 0.528, H * 0.025); // Tactical waist belt

    const outTex = new THREE.CanvasTexture(canvas);
    outTex.colorSpace = THREE.SRGBColorSpace;
    outTex.flipY = srcTex ? srcTex.flipY : false;
    outTex.wrapS = THREE.ClampToEdgeWrapping;
    outTex.wrapT = THREE.ClampToEdgeWrapping;
    outTex.needsUpdate = true;
    bikiniTexCache.set(cacheKey, outTex);
    return outTex;
  } catch {
    return null;
  }
}

// Cache sculpted female geometries per (archetypeKey, isSwimwear, meshName, matName) so we never clone 15MB vertex buffers per bot!
const sculptedGeoCache = new Map();

// Sculpt slender athletic anime proportions + Vong 1 & Vong 3 curves (tailoring loose cloth meshes inward when not in bikini)
function applyFemaleCurveSculpt(modelRoot, isSwimwear = false, archetypeKey = 'vroid') {
  modelRoot.updateMatrixWorld(true);
  const bustL = modelRoot.getObjectByName('J_Sec_L_Bust1');
  const hipsB = modelRoot.getObjectByName('J_Bip_C_Hips');
  if (!hipsB) return;

  const hp = new THREE.Vector3();
  hipsB.getWorldPosition(hp);
  const bp = new THREE.Vector3();
  if (bustL) bustL.getWorldPosition(bp);
  else bp.set(0.056, hp.y + 0.265, -0.075);

  const bustY = bp.y - 0.012;
  const xBust = Math.max(0.050, Math.abs(bp.x));
  const waistY = hp.y + 0.115;
  const hipY = hp.y - 0.052;

  const invWorld = new THREE.Matrix4().copy(modelRoot.matrixWorld).invert();
  const p = new THREE.Vector3();
  const modelPos = new THREE.Vector3();

  modelRoot.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    if (/face|eye|hair/i.test(child.name)) return;
    const matName = Array.isArray(child.material)
      ? child.material.map((m) => m?.name || '').join(' ')
      : (child.material?.name || '');
    if (/face|eye|hair|shoes_/i.test(matName)) return;

    const geoCacheKey = `${archetypeKey}|${isSwimwear ? '1' : '0'}|${child.name}|${matName}`;
    const cachedGeo = sculptedGeoCache.get(geoCacheKey);
    if (cachedGeo) {
      child.geometry = cachedGeo;
      return;
    }

    const isOuterGarment = /(tops_|bottoms_|accessory)/i.test(matName);
    child.geometry = child.geometry.clone();
    const posAttr = child.geometry.attributes.position;
    const childToModel = new THREE.Matrix4().multiplyMatrices(invWorld, child.matrixWorld);
    const modelToChild = new THREE.Matrix4().copy(childToModel).invert();

    let modified = false;
    for (let i = 0; i < posAttr.count; i++) {
      p.fromBufferAttribute(posAttr, i).applyMatrix4(childToModel);
      modelPos.copy(p);
      let changed = false;

      if (!isSwimwear) {
        // Tailored clothed uniform: inner covered Body_00_SKIN stays tucked 8-12mm inside outer Tops/Bottoms so glutes/hips NEVER poke through skirts!
        const xFade = Math.max(0, Math.min(1, (0.20 - Math.abs(p.x)) / 0.055));
        const yBotFade = Math.max(0, Math.min(1, (p.y - (hipY - 0.08)) / 0.06));
        const yTopFade = Math.max(0, Math.min(1, (bustY + 0.10 - p.y) / 0.06));
        const torsoMask = xFade * yBotFade * yTopFade;

        if (!isOuterGarment && torsoMask > 0.001) {
          // Tuck covered body skin inside garments cleanly (leaves arms, shoulders & bare thighs untouched)
          modelPos.x *= 1 - 0.115 * torsoMask;
          modelPos.z *= 1 - 0.095 * torsoMask;
          changed = true;
        } else if (isOuterGarment && torsoMask > 0.001) {
          // Slender tailored upper uniform + waist taper while preserving natural lower hip contour
          const upperWaistFade = Math.max(0, Math.min(1, (p.y - (hipY + 0.015)) / 0.09));
          const waistFocus = Math.exp(-Math.pow((p.y - waistY) / 0.105, 2));
          modelPos.x *= 1 - (0.036 * upperWaistFade + 0.032 * waistFocus) * torsoMask;
          changed = true;
        }
      } else {
        // Bikini / Summer Swimwear: slender upper ribcage & waist, fading cleanly before the hips for natural hourglass balance
        if (p.y > hipY + 0.01 && p.y < bustY + 0.12 && Math.abs(p.x) < 0.21) {
          const xFade = Math.max(0, Math.min(1, (0.21 - Math.abs(p.x)) / 0.05));
          const yBotFade = Math.max(0, Math.min(1, (p.y - (hipY + 0.01)) / 0.085));
          const yTopFade = Math.max(0, Math.min(1, (bustY + 0.12 - p.y) / 0.06));
          modelPos.x *= 1 - 0.048 * xFade * yBotFade * yTopFade;
          changed = true;
        }
      }

      // 1. Vong 1 (Natural anatomical teardrop fullness — smooth upper slope, fuller lower curve, subtle cleavage separation, zero horizontal ballooning)
      if (p.y > bustY - 0.125 && p.y < bustY + 0.125 && Math.abs(p.x) < 0.175 && p.z < 0.02) {
        const frontGate = Math.max(0, Math.min(1, (-p.z - 0.008) / 0.062));
        if (frontGate > 0.001) {
          const apexY = bustY - 0.005;
          const sigmaY = p.y >= apexY ? 0.076 : 0.062;
          const dy = (p.y - apexY) / sigmaY;
          const dxL = (p.x + xBust * 0.94) / 0.058;
          const dxR = (p.x - xBust * 0.94) / 0.058;
          const lobe = Math.max(Math.exp(-(dxL * dxL + dy * dy)), Math.exp(-(dxR * dxR + dy * dy)));
          const cleftDip = 1 - 0.24 * Math.exp(-Math.pow(p.x / 0.022, 2));
          const wBust = Math.min(1.0, lobe * cleftDip) * frontGate;
          if (wBust > 0.008) {
            const bustProj = !isSwimwear && !isOuterGarment ? 0.015 : (!isSwimwear ? 0.046 : 0.044);
            modelPos.z -= wBust * bustProj;
            modelPos.y -= wBust * 0.0075;
            // Subtle outer breast rounding (~5-6mm max) to keep natural spherical depth without widening the silhouette
            const outerSide = Math.max(0, Math.min(1, (Math.abs(p.x) - xBust * 0.85) / 0.055));
            modelPos.x += Math.sign(p.x) * wBust * outerSide * (!isSwimwear && !isOuterGarment ? 0.002 : 0.0055);
            changed = true;
          }
        }
      }

      // 2. Vong 2 (Balanced natural waist taper + subtle lower-back lumbar S-curve)
      if (Math.abs(p.y - waistY) < 0.095 && Math.abs(p.x) < 0.165) {
        const wWaist = Math.exp(-Math.pow((p.y - waistY) / 0.056, 2));
        if (wWaist > 0.008) {
          modelPos.x *= 1 - 0.046 * wWaist;
          changed = true;
        }
        if (p.z > 0.015) {
          const lumbarY = Math.exp(-Math.pow((p.y - (waistY - 0.022)) / 0.048, 2));
          const lumbarGate = Math.max(0, Math.min(1, (p.z - 0.015) / 0.050));
          const wLumbar = lumbarY * lumbarGate;
          if (wLumbar > 0.008) {
            modelPos.z -= wLumbar * (!isSwimwear && !isOuterGarment ? 0.004 : 0.010);
            changed = true;
          }
        }
      }

      // 3. Vong 3 (Full natural rounded glutes + subtle balanced hip/upper-thigh curve — realistic proportions, never stretched wide)
      if (p.y > hipY - 0.195 && p.y < hipY + 0.145 && Math.abs(p.x) < 0.23) {
        const gluteCenterY = hipY - 0.022;
        const rearGate = Math.max(0, Math.min(1, p.z / 0.048));
        if (rearGate > 0.008) {
          const sigmaGY = p.y >= gluteCenterY ? 0.088 : 0.082;
          const wGluteY = Math.exp(-Math.pow((p.y - gluteCenterY) / sigmaGY, 2));
          const cheekL = Math.exp(-Math.pow((p.x + 0.054) / 0.068, 2));
          const cheekR = Math.exp(-Math.pow((p.x - 0.054) / 0.068, 2));
          const cleftDip = 1 - 0.20 * Math.exp(-Math.pow(p.x / 0.020, 2));
          const wGlute = rearGate * wGluteY * Math.min(1.0, Math.max(cheekL, cheekR) * cleftDip);
          if (wGlute > 0.008) {
            const gluteProj = !isSwimwear && !isOuterGarment ? 0.016 : (!isSwimwear ? 0.064 : 0.060);
            const liftBias = p.y >= gluteCenterY ? 0.008 : 0.003;
            modelPos.z += wGlute * gluteProj;
            modelPos.y += wGlute * liftBias;
            changed = true;
          }
        }

        // Smooth proportional outer hip-to-upper-thigh curve (~1.1cm max per side) for realistic waist-to-hip harmony
        const sideGate = Math.max(0, Math.min(1, (Math.abs(p.x) - 0.045) / 0.065));
        if (sideGate > 0.008) {
          const wHipCurveY = Math.exp(-Math.pow((p.y - (hipY - 0.038)) / 0.088, 2));
          const wSide = sideGate * wHipCurveY;
          if (wSide > 0.008) {
            const hipSideAmt = !isSwimwear && !isOuterGarment ? 0.003 : (!isSwimwear ? 0.012 : 0.011);
            modelPos.x += Math.sign(p.x) * wSide * hipSideAmt;
            changed = true;
          }
        }
      }

      if (changed) {
        modelPos.applyMatrix4(modelToChild);
        posAttr.setXYZ(i, modelPos.x, modelPos.y, modelPos.z);
        modified = true;
      }
    }

    if (modified) {
      posAttr.needsUpdate = true;
      child.geometry.computeVertexNormals();
      // Weld/average normals at coincident UV-split seams (e.g. x = 0 center spine) so back/chest lighting stays seamless
      const normAttr = child.geometry.attributes.normal;
      if (normAttr) {
        const seamBuckets = new Map();
        for (let i = 0; i < posAttr.count; i++) {
          const k = `${Math.round(posAttr.getX(i) * 5000)}_${Math.round(posAttr.getY(i) * 5000)}_${Math.round(posAttr.getZ(i) * 5000)}`;
          let acc = seamBuckets.get(k);
          if (!acc) {
            acc = [0, 0, 0, []];
            seamBuckets.set(k, acc);
          }
          acc[0] += normAttr.getX(i);
          acc[1] += normAttr.getY(i);
          acc[2] += normAttr.getZ(i);
          acc[3].push(i);
        }
        for (const acc of seamBuckets.values()) {
          if (acc[3].length <= 1) continue;
          const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
          const nx = acc[0] / len, ny = acc[1] / len, nz = acc[2] / len;
          for (const vi of acc[3]) normAttr.setXYZ(vi, nx, ny, nz);
        }
        normAttr.needsUpdate = true;
      }
    }
    sculptedGeoCache.set(geoCacheKey, child.geometry);
  });
}

const styledMatCache = new Map();

export function styleOperatorGlbMaterials(modelRoot, key, opCfg, outCfg, teamGlowColor) {
  const isSwimwear = Boolean(outCfg?.isSwimwear);
  const outfitId = outCfg?.id || 'urban';
  const isVroidFemale = ['vita', 'vivi', 'shino', 'shibu', 'sample_a'].includes(key);
  const isPhoenix = opCfg?.id === 'phoenix';
  const primaryHex = outCfg?.primary || (opCfg?.id === 'aria' ? '#22d3ee' : '#38bdf8');
  const secHex = outCfg?.secondary || '#1e293b';
  const vestHex = outCfg?.vest || secHex;
  const accentHex = outCfg?.accent || teamGlowColor;
  const glowCol = new THREE.Color(
    outfitId !== 'urban' && outCfg?.accent
      ? outCfg.accent
      : (opCfg?.id === 'titan' ? '#f59e0b'
        : (opCfg?.id === 'shadow' ? '#10b981'
          : (opCfg?.id === 'aria' ? '#22d3ee'
            : (opCfg?.id === 'kagura' ? '#06b6d4' : teamGlowColor))))
  );
  const isRoyalGold = outfitId === 'royal_gold';
  const isCyber = outfitId === 'cyber';

  const shadowMeshes = [];
  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = false;
    child.frustumCulled = false;
    shadowMeshes.push(child);

    const rawMatName = Array.isArray(child.material)
      ? child.material.map((m) => m?.name || '').join(' ')
      : (child.material?.name || '');

    // Female Bikini Mode: hide ALL outer garments (Tops, Bottoms, Skirts, Neckties, Shoes) -> wear ONLY Bikini
    if (isVroidFemale && isSwimwear && /(tops_|bottoms_|shoes_|accessory)/i.test(rawMatName)) {
      child.visible = false;
      return;
    }

    const applyMat = (srcMat) => {
      const cacheKey = `${key}_${opCfg?.id || 'op'}_${outfitId}_${teamGlowColor}_${srcMat.name || srcMat.uuid}`;
      if (styledMatCache.has(cacheKey)) {
        return styledMatCache.get(cacheKey);
      }
      const mat = upgradeToStandardMaterial(srcMat);
      mat.envMapIntensity = isRoyalGold ? 1.75 : 1.28;
      const mName = (mat.name || '').toLowerCase();

      if (key === 'soldier') {
        const isGhost = opCfg?.id === 'ghost';
        if (mName.includes('visor')) {
          if (isGhost && outfitId === 'urban') {
            mat.color.set('#0f141c');
            mat.emissive.set('#1e293b');
            mat.emissiveIntensity = 0.25;
            mat.metalness = 0.55;
            mat.roughness = 0.35;
          } else {
            mat.color.set('#e2e8f0');
            mat.emissive.copy(glowCol);
            mat.emissiveIntensity = 1.05;
            mat.metalness = 0.88;
            mat.roughness = 0.10;
          }
        } else {
          const pCol = outfitId === 'urban' ? (isGhost ? '#1b222e' : '#475569') : primaryHex;
          const sCol = outfitId === 'urban' ? (isGhost ? '#090d14' : '#1e293b') : secHex;
          applyRecoloredClothingMat(mat, pCol, sCol, isGhost ? 0.22 : 0.28, 0.76, accentHex, outfitId);
          mat.metalness = isRoyalGold ? 0.74 : (isCyber ? 0.45 : (isGhost ? 0.20 : 0.24));
          mat.roughness = isRoyalGold ? 0.22 : (isCyber ? 0.30 : (isGhost ? 0.56 : 0.44));
        }
      } else if (key === 'xbot') {
        const isGhost = opCfg?.id === 'ghost';
        if (isGhost) {
          // Phantom Recon Ghost: Pitch-matte tactical stealth bodysuit (zero shiny robot metal!) + ghostly ice-cyan seam accents
          const clothCol = outfitId === 'urban' ? '#141923' : primaryHex;
          const seamCol = outfitId === 'urban' ? '#090d14' : secHex;
          const spectralGlow = outfitId === 'urban' ? '#38bdf8' : glowCol;
          if (mName.includes('joint')) {
            mat.color.set(seamCol);
            mat.emissive.set(spectralGlow);
            mat.emissiveIntensity = isCyber ? 1.15 : 0.42;
            mat.metalness = 0.18;
            mat.roughness = 0.62;
          } else {
            mat.color.set(clothCol);
            if (isRoyalGold) {
              mat.emissive.set('#854d0e');
              mat.emissiveIntensity = 0.18;
            } else if (isCyber) {
              mat.emissive.set('#2e1065');
              mat.emissiveIntensity = 0.24;
            }
            mat.metalness = isRoyalGold ? 0.65 : 0.10;
            mat.roughness = isRoyalGold ? 0.26 : 0.84;
          }
        } else {
          const armorBase = opCfg?.id === 'titan' && outfitId === 'urban' ? '#94a3b8' : primaryHex;
          if (mName.includes('joint')) {
            mat.color.set(secHex);
            mat.emissive.copy(glowCol);
            mat.emissiveIntensity = isCyber ? 1.35 : 0.95;
            mat.metalness = 0.76;
            mat.roughness = 0.20;
          } else {
            mat.color.copy(blendWithWhite(armorBase, 0.92));
            if (isRoyalGold) {
              mat.emissive.set('#ca8a04');
              mat.emissiveIntensity = 0.16;
            } else if (isCyber) {
              mat.emissive.set('#4c1d95');
              mat.emissiveIntensity = 0.25;
            }
            mat.metalness = isRoyalGold ? 0.88 : 0.62;
            mat.roughness = isRoyalGold ? 0.18 : 0.24;
          }
        }
      } else if (key === 'orion') {
        if (mName.includes('wireframe')) {
          mat.color.set(accentHex);
          mat.emissive.copy(glowCol);
          mat.emissiveIntensity = 1.35;
          mat.metalness = 0.78;
          mat.roughness = 0.20;
        } else {
          const stealthCol = outfitId === 'urban' ? '#1e2636' : primaryHex;
          const stealthSec = outfitId === 'urban' ? '#0b0f19' : secHex;
          applyRecoloredClothingMat(mat, stealthCol, stealthSec, 0.26, 0.78, accentHex, outfitId);
          mat.metalness = isRoyalGold ? 0.78 : (isCyber ? 0.48 : 0.42);
          mat.roughness = isRoyalGold ? 0.20 : 0.32;
        }
      } else if (key === 'rpm' || key === 'male_specops') {
        if (mName.includes('outfit_top')) {
          applyRecoloredClothingMat(mat, primaryHex, secHex, 0.30, 0.78, accentHex, outfitId);
          mat.metalness = isRoyalGold ? 0.72 : (isCyber ? 0.42 : 0.14);
          mat.roughness = isRoyalGold ? 0.24 : 0.44;
        } else if (mName.includes('outfit_bottom')) {
          applyRecoloredClothingMat(mat, secHex, vestHex, 0.26, 0.70, accentHex, outfitId);
          mat.metalness = isRoyalGold ? 0.45 : 0.10;
          mat.roughness = 0.50;
        } else if (mName.includes('footwear')) {
          applyRecoloredClothingMat(mat, vestHex, '#111827', 0.24, 0.60, accentHex, outfitId);
          mat.roughness = 0.36;
        } else if (mName.includes('headwear')) {
          applyRecoloredClothingMat(mat, primaryHex, secHex, 0.28, 0.68, accentHex, outfitId);
          mat.roughness = 0.52;
        } else {
          mat.color.set('#ffffff');
          mat.roughness = 0.48;
          mat.metalness = 0.04;
          mat.envMapIntensity = 0.85;
        }
      } else if (isVroidFemale) {
        if (mName.includes('body_00_skin') && isSwimwear) {
          const bikiniTex = createVroidBikiniBodyTexture(mat.map, primaryHex, secHex, accentHex);
          if (bikiniTex) {
            mat.map = bikiniTex;
            mat.emissive.set('#ffffff');
            mat.emissiveMap = bikiniTex;
            mat.emissiveIntensity = 0.16;
          } else {
            mat.color.set('#f8d5bf');
          }
          mat.alphaTest = 0;
          mat.transparent = false;
          mat.side = THREE.FrontSide;
          mat.roughness = 0.42;
          mat.metalness = 0.02;
          mat.envMapIntensity = 0.88;
        } else if (mName.includes('body_00_skin') && isPhoenix && !isSwimwear) {
          const phxSuit = outfitId === 'urban' ? '#232730' : primaryHex;
          const phxTrim = outfitId === 'urban' ? '#12151c' : accentHex;
          const phxTex = createPhoenixTacticalBodyTexture(mat.map, phxSuit, phxTrim);
          if (phxTex) {
            mat.map = phxTex;
            mat.emissive.set('#ffffff');
            mat.emissiveMap = phxTex;
            mat.emissiveIntensity = isCyber ? 0.26 : 0.16;
          }
          mat.alphaTest = 0;
          mat.transparent = false;
          mat.metalness = isRoyalGold ? 0.55 : 0.12;
          mat.roughness = isRoyalGold ? 0.26 : 0.46;
        } else if (mName.includes('tops_')) {
          const useBlackSpecOps = (key === 'vita' || key === 'vivi' || isPhoenix) && outfitId === 'urban';
          const suitPrim = useBlackSpecOps ? '#232730' : primaryHex;
          const suitSec = useBlackSpecOps ? '#11151d' : secHex;
          applyRecoloredClothingMat(mat, suitPrim, suitSec, 0.36, 0.82, accentHex, outfitId);
          mat.roughness = isRoyalGold ? 0.22 : (isCyber ? 0.28 : ((key === 'vita' || key === 'vivi') ? 0.38 : 0.46));
          mat.metalness = isRoyalGold ? 0.72 : (isCyber ? 0.42 : ((key === 'vita' || key === 'vivi') ? 0.20 : 0.08));
        } else if (mName.includes('bottoms_')) {
          const useBlackSpecOps = (key === 'vita' || key === 'vivi' || isPhoenix) && outfitId === 'urban';
          const botPrim = useBlackSpecOps ? '#181c24' : (outfitId === 'crimson' || outfitId === 'royal_gold' ? vestHex : primaryHex);
          const botSec = useBlackSpecOps ? '#0e1117' : secHex;
          applyRecoloredClothingMat(mat, botPrim, botSec, 0.32, 0.78, accentHex, outfitId);
          mat.roughness = isRoyalGold ? 0.26 : 0.46;
          mat.metalness = isRoyalGold ? 0.52 : (isCyber ? 0.34 : 0.10);
        } else if (mName.includes('accessory')) {
          applyRecoloredClothingMat(mat, accentHex, primaryHex, 0.38, 0.85, accentHex, outfitId);
          mat.roughness = isRoyalGold ? 0.20 : 0.34;
          mat.metalness = isRoyalGold ? 0.80 : 0.30;
          if (isCyber || outfitId === 'stealth_ops' || outfitId === 'crimson') {
            mat.emissive.set(accentHex);
            mat.emissiveIntensity = 0.45;
          }
        } else if (mName.includes('shoes_')) {
          const bootCol = ((key === 'vita' || key === 'vivi' || isPhoenix) && outfitId === 'urban') ? '#14171e' : vestHex;
          applyRecoloredClothingMat(mat, bootCol, accentHex, 0.30, 0.72, accentHex, outfitId);
          mat.roughness = isRoyalGold ? 0.24 : 0.36;
          mat.metalness = isRoyalGold ? 0.65 : 0.24;
        } else if (mName.includes('hair')) {
          if (isPhoenix) {
            // Pure platinum silver-white hair like reference Spec-Ops photo
            mat.color.set('#f1f5f9');
            mat.emissive.set('#e2e8f0');
            mat.emissiveIntensity = 0.18;
          } else {
            mat.roughness = 0.36;
            mat.metalness = 0.14;
            if (mat.map) {
              mat.emissive.set('#ffffff');
              mat.emissiveMap = mat.map;
              mat.emissiveIntensity = 0.12;
            }
          }
        } else {
          // Luminous anime face, eyes & porcelain skin
          mat.color.set('#ffffff');
          mat.roughness = 0.52;
          mat.metalness = 0.02;
          mat.envMapIntensity = 0.85;
          if (mat.map) {
            mat.emissive.set('#ffffff');
            mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.18;
          }
        }
      } else if (key === 'ghost_male') {
        const useNativeDark = outfitId === 'urban' || isSwimwear;
        if (mName.includes('tops_')) {
          if (useNativeDark) {
            mat.color.set('#e2e8f0');
            mat.roughness = 0.46;
            mat.metalness = 0.14;
          } else {
            applyRecoloredClothingMat(mat, primaryHex, secHex, 0.34, 0.82, accentHex, outfitId);
            mat.roughness = isRoyalGold ? 0.22 : (isCyber ? 0.28 : 0.44);
            mat.metalness = isRoyalGold ? 0.72 : (isCyber ? 0.42 : 0.16);
          }
        } else if (mName.includes('bottoms_')) {
          if (useNativeDark) {
            mat.color.set('#d8dee9');
            mat.roughness = 0.52;
            mat.metalness = 0.08;
          } else {
            applyRecoloredClothingMat(mat, secHex, vestHex, 0.30, 0.78, accentHex, outfitId);
            mat.roughness = isRoyalGold ? 0.26 : 0.48;
            mat.metalness = isRoyalGold ? 0.52 : 0.12;
          }
        } else if (mName.includes('shoes_')) {
          if (useNativeDark) {
            mat.color.set('#cbd5e1');
            mat.roughness = 0.38;
            mat.metalness = 0.22;
          } else {
            applyRecoloredClothingMat(mat, vestHex, accentHex, 0.28, 0.72, accentHex, outfitId);
            mat.roughness = isRoyalGold ? 0.24 : 0.38;
            mat.metalness = isRoyalGold ? 0.65 : 0.24;
          }
        } else if (mName.includes('hair')) {
          mat.roughness = 0.38;
          mat.metalness = 0.12;
          if (mat.map) {
            mat.emissive.set('#ffffff');
            mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.10;
          }
        } else {
          // Crisp anime male face, crimson eyes & skin
          mat.color.set('#ffffff');
          mat.roughness = 0.50;
          mat.metalness = 0.02;
          mat.envMapIntensity = 0.85;
          if (mat.map) {
            mat.emissive.set('#ffffff');
            mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.18;
          }
        }
      }

      styledMatCache.set(cacheKey, mat);
      return mat;
    };

    if (Array.isArray(child.material)) {
      child.material = child.material.map(applyMat);
    } else if (child.material) {
      child.material = applyMat(child.material);
    }
  });
  return shadowMeshes;
}

// Curl hand finger bones naturally around weapon grips
function curlHandsIntoGrip(modelRoot) {
  modelRoot.updateMatrixWorld(true);
  for (const side of ['Right', 'Left']) {
    const vSide = side === 'Right' ? 'R' : 'L';
    const idx1 = modelRoot.getObjectByName(`mixamorig${side}HandIndex1`)
      || modelRoot.getObjectByName(`${side}HandIndex1`)
      || modelRoot.getObjectByName(`J_Bip_${vSide}_Index1`);
    const pnk1 = modelRoot.getObjectByName(`mixamorig${side}HandPinky1`)
      || modelRoot.getObjectByName(`${side}HandPinky1`)
      || modelRoot.getObjectByName(`J_Bip_${vSide}_Little1`);
    if (!idx1 || !pnk1) continue;

    const pIdx = new THREE.Vector3(), pPnk = new THREE.Vector3();
    idx1.getWorldPosition(pIdx);
    pnk1.getWorldPosition(pPnk);
    const curlAxisW = pIdx.clone().sub(pPnk).normalize();
    if (curlAxisW.lengthSq() < 1e-6) continue;
    const qWorldCurl = (angle) => new THREE.Quaternion().setFromAxisAngle(curlAxisW, angle);

    for (const [digit, vDigit] of [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Pinky', 'Little']]) {
      for (const [seg, ang] of [['1', 0.65], ['2', 0.85], ['3', 0.45]]) {
        const b = modelRoot.getObjectByName(`mixamorig${side}Hand${digit}${seg}`)
          || modelRoot.getObjectByName(`${side}Hand${digit}${seg}`)
          || modelRoot.getObjectByName(`J_Bip_${vSide}_${vDigit}${seg}`);
        if (!b || !b.parent) continue;
        const pQ = new THREE.Quaternion();
        b.parent.getWorldQuaternion(pQ);
        const curWQ = new THREE.Quaternion();
        b.getWorldQuaternion(curWQ);
        const targetWQ = new THREE.Quaternion().multiplyQuaternions(qWorldCurl(side === 'Right' ? ang : -ang), curWQ);
        b.quaternion.copy(pQ.invert().multiply(targetWQ));
        b.updateMatrixWorld(true);
      }
    }
  }
}

export function extractRigBones(modelRoot) {
  const find = (...candidates) => {
    for (const c of candidates) {
      const obj = modelRoot.getObjectByName(c);
      if (obj) return obj;
    }
    return null;
  };
  const bones = {
    hips: find('mixamorigHips', 'Hips', 'J_Bip_C_Hips'),
    spine: find('mixamorigSpine2', 'Spine2', 'J_Bip_C_UpperChest', 'mixamorigSpine1', 'Spine1', 'J_Bip_C_Chest'),
    neck: find('mixamorigNeck', 'Neck', 'J_Bip_C_Neck'),
    head: find('mixamorigHead', 'Head', 'J_Bip_C_Head'),
    upperArmR: find('mixamorigRightArm', 'RightArm', 'J_Bip_R_UpperArm'),
    lowerArmR: find('mixamorigRightForeArm', 'RightForeArm', 'J_Bip_R_LowerArm'),
    handR: find('mixamorigRightHand', 'RightHand', 'J_Bip_R_Hand'),
    upperArmL: find('mixamorigLeftArm', 'LeftArm', 'J_Bip_L_UpperArm'),
    lowerArmL: find('mixamorigLeftForeArm', 'LeftForeArm', 'J_Bip_L_LowerArm'),
    handL: find('mixamorigLeftHand', 'LeftHand', 'J_Bip_L_Hand'),
    upperLegR: find('mixamorigRightUpLeg', 'RightUpLeg', 'J_Bip_R_UpperLeg'),
    lowerLegR: find('mixamorigRightLeg', 'RightLeg', 'J_Bip_R_LowerLeg'),
    upperLegL: find('mixamorigLeftUpLeg', 'LeftUpLeg', 'J_Bip_L_UpperLeg'),
    lowerLegL: find('mixamorigLeftLeg', 'LeftLeg', 'J_Bip_L_LowerLeg')
  };
  const restArmQuats = {};
  for (const k of ['upperArmR', 'lowerArmR', 'handR', 'upperArmL', 'lowerArmL', 'handL']) {
    if (bones[k]) restArmQuats[k] = bones[k].quaternion.clone();
  }
  const restHeadQuat = bones.head ? bones.head.quaternion.clone() : null;
  return { bones, restArmQuats, restHeadQuat };
}

export function instantiateGlbInstance(loadedBundle, opCfg, outCfg, teamGlowColor) {
  try {
    const { gltf, clips, cfg } = loadedBundle;
    const cloned = SkeletonUtils.clone(gltf.scene);
    const key = Object.keys(CHARACTER_ARCHETYPES).find((k) => CHARACTER_ARCHETYPES[k] === cfg) || 'soldier';
    if (cfg.rigType === 'vroid' && key !== 'ghost_male') {
      applyFemaleCurveSculpt(cloned, Boolean(outCfg?.isSwimwear), key);
    }
    const scaleMult = opCfg?.helmetStyle === 'heavy' ? 1.07 : 1.0;
    cloned.scale.setScalar(cfg.scale * scaleMult);
    cloned.rotation.y = cfg.facingY;
    if (cfg.yOffset) {
      cloned.position.y = cfg.yOffset * cfg.scale * scaleMult;
    }

    const shadowMeshes = styleOperatorGlbMaterials(cloned, key, opCfg, outCfg, teamGlowColor);
    curlHandsIntoGrip(cloned);

    // Unify duplicate Skeleton objects across sibling SkinnedMeshes (computes bone matrices 1x per character instead of 15x!)
    // & collect microscopic facial overlay meshes (eyelashes, mouth, eye highlights) to auto-cull beyond 22m
    const microDetailMeshes = [];
    const skelBySig = new Map();
    cloned.traverse((ch) => {
      if (!ch.isMesh) return;
      const mName = Array.isArray(ch.material)
        ? ch.material.map((m) => m?.name || '').join(' ')
        : (ch.material?.name || '');
      if (/(facemouth|eyelash|eyeline|facebrow|eyehighlight|eyeextra)/i.test(mName)) {
        microDetailMeshes.push(ch);
      }
      if (ch.isSkinnedMesh && ch.skeleton?.bones?.length) {
        const sig = `${ch.skeleton.bones.length}|${ch.skeleton.bones[0]?.name || ''}|${ch.skeleton.bones[ch.skeleton.bones.length - 1]?.name || ''}`;
        const sharedSkel = skelBySig.get(sig);
        if (sharedSkel) {
          ch.skeleton = sharedSkel;
        } else {
          skelBySig.set(sig, ch.skeleton);
        }
      }
    });

    const mixer = new THREE.AnimationMixer(cloned);
    const actions = {};
    for (const [k, clip] of Object.entries(clips || {})) {
      if (!clip) continue;
      const act = mixer.clipAction(clip);
      act.setLoop(THREE.LoopRepeat, Infinity);
      actions[k] = act;
    }
    if (actions.idle) {
      actions.idle.play();
    }

    const { bones, restArmQuats, restHeadQuat } = extractRigBones(cloned);
    return { modelRoot: cloned, mixer, actions, bones, restArmQuats, restHeadQuat, activeAnim: 'idle', shadowMeshes, microDetailMeshes };
  } catch (err) {
    console.warn('[CharacterLoader] instantiateGlbInstance error:', err);
    return null;
  }
}
