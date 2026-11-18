// Preloads, caches, clones & retargets high-detail smooth PBR & Stylized GLB character models
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

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
  male_specops: {
    url: '/assets/models/MaleSpecOps.glb',
    facingY: Math.PI,
    scale: 0.98,
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
    case 'kagura':
      return 'vita';
    case 'ghost':
      return 'rpm';
    case 'phoenix':
      return 'male_specops';
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

export async function preloadCharacterModels() {
  if (typeof window === 'undefined') return;
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const keys = Object.keys(CHARACTER_ARCHETYPES);
    const results = await Promise.all(keys.map((k) => trackedLoadRaw(k)));
    const byKey = {};
    keys.forEach((k, idx) => { byKey[k] = results[idx]; });
    for (const k of keys) {
      if (byKey[k]) {
        const srcKey = CHARACTER_ARCHETYPES[k].animSource;
        buildClipBank(k, byKey[k], byKey[srcKey]);
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

function recolorGlbTexture(srcTex, primaryHex, secondaryHex, minLum = 0.24) {
  if (!srcTex || typeof document === 'undefined') return null;
  const img = srcTex.image;
  if (!img || !img.width || !img.height) return null;

  const cacheKey = `${srcTex.uuid}_${primaryHex}_${secondaryHex}_${minLum.toFixed(2)}`;
  if (recolorTexCache.has(cacheKey)) return recolorTexCache.get(cacheKey);

  try {
    const maxDim = 512;
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
      const shade = minLum + (1 - minLum) * Math.pow(lum, 0.72);
      const t = Math.min(1, Math.max(0, (lum - 0.14) / 0.58));
      const rMix = sR + (pR - sR) * t;
      const gMix = sG + (pG - sG) * t;
      const bMix = sB + (pB - sB) * t;
      data[i] = Math.min(255, Math.round(rMix * shade));
      data[i + 1] = Math.min(255, Math.round(gMix * shade));
      data[i + 2] = Math.min(255, Math.round(bMix * shade));
    }
    ctx.putImageData(imgData, 0, 0);

    const outTex = new THREE.CanvasTexture(canvas);
    outTex.colorSpace = THREE.SRGBColorSpace;
    outTex.flipY = srcTex.flipY;
    outTex.wrapS = srcTex.wrapS;
    outTex.wrapT = srcTex.wrapT;
    outTex.repeat.copy(srcTex.repeat);
    outTex.offset.copy(srcTex.offset);
    outTex.needsUpdate = true;

    if (recolorTexCache.size > 48) {
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

function applyRecoloredClothingMat(mat, primaryHex, secondaryHex, minLum = 0.25, fallbackTintStrength = 0.65) {
  const recolored = mat.map ? recolorGlbTexture(mat.map, primaryHex, secondaryHex, minLum) : null;
  if (recolored) {
    mat.map = recolored;
    mat.color.set('#ffffff');
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

// Sculpt fuller balanced feminine hourglass proportions (Vong 1 Bust, Vong 2 Waist, Vong 3 Hips & Glutes)
function applyFemaleCurveSculpt(modelRoot) {
  modelRoot.updateMatrixWorld(true);
  const bustL = modelRoot.getObjectByName('J_Sec_L_Bust1');
  const bustR = modelRoot.getObjectByName('J_Sec_R_Bust1');
  const hipsB = modelRoot.getObjectByName('J_Bip_C_Hips');
  if (!hipsB) return;

  const hp = new THREE.Vector3();
  hipsB.getWorldPosition(hp);
  const bp = new THREE.Vector3();
  if (bustL) bustL.getWorldPosition(bp);
  else bp.set(0.056, hp.y + 0.265, -0.075);

  const bustY = bp.y - 0.012;
  const xBust = Math.max(0.052, Math.abs(bp.x));
  const waistY = hp.y + 0.115;
  const hipY = hp.y - 0.052;

  const mInv = new THREE.Matrix4();
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

    child.geometry = child.geometry.clone();
    const posAttr = child.geometry.attributes.position;
    mInv.copy(child.matrixWorld).invert();
    const childToModel = new THREE.Matrix4().multiplyMatrices(invWorld, child.matrixWorld);
    const modelToChild = new THREE.Matrix4().copy(childToModel).invert();

    let modified = false;
    for (let i = 0; i < posAttr.count; i++) {
      p.fromBufferAttribute(posAttr, i).applyMatrix4(childToModel);
      modelPos.copy(p);
      let changed = false;

      // 1. Vong 1 (Bust fullness - balanced rounded projection in front of chest)
      if (p.y > bustY - 0.13 && p.y < bustY + 0.13 && Math.abs(p.x) < 0.185 && p.z < 0.02) {
        const frontGate = Math.max(0, Math.min(1, (-p.z - 0.012) / 0.065));
        if (frontGate > 0.001) {
          const dy = (p.y - bustY) / 0.074;
          const dxL = (p.x + xBust) / 0.064;
          const dxR = (p.x - xBust) / 0.064;
          const lobe = Math.max(Math.exp(-(dxL * dxL + dy * dy)), Math.exp(-(dxR * dxR + dy * dy)));
          const bridge = Math.exp(-((p.x / 0.030) ** 2 + ((p.y - bustY) / 0.052) ** 2)) * 0.35;
          const wBust = Math.min(1.0, lobe + bridge * 0.25) * frontGate;
          if (wBust > 0.01) {
            modelPos.z -= wBust * 0.028;
            modelPos.x += Math.sign(p.x) * wBust * 0.004 * Math.min(1, Math.abs(p.x) / 0.025);
            modelPos.y -= wBust * 0.005;
            changed = true;
          }
        }
      }

      // 2. Vong 2 (Subtle natural athletic waist line - avoid harsh shelf pinch)
      if (Math.abs(p.y - waistY) < 0.085 && Math.abs(p.x) < 0.165) {
        const wWaist = Math.exp(-Math.pow((p.y - waistY) / 0.055, 2));
        if (wWaist > 0.01) {
          modelPos.x *= 1 - 0.018 * wWaist;
          changed = true;
        }
      }

      // 3. Vong 3 (Sleek proportional hips sideways + full lifted rounded rear glutes +Z)
      if (p.y > hipY - 0.16 && p.y < hipY + 0.14 && Math.abs(p.x) < 0.22) {
        const wHipY = Math.exp(-Math.pow((p.y - hipY) / 0.10, 2));
        const sideGate = Math.max(0, Math.min(1, (Math.abs(p.x) - 0.03) / 0.065));
        if (wHipY * sideGate > 0.01) {
          modelPos.x += Math.sign(p.x) * wHipY * sideGate * 0.006;
          changed = true;
        }
        const rearGate = Math.max(0, Math.min(1, (p.z - 0.002) / 0.052));
        if (rearGate > 0.01) {
          const wGluteY = Math.exp(-Math.pow((p.y - (hipY - 0.018)) / 0.098, 2));
          const cheekL = Math.exp(-Math.pow((p.x + 0.048) / 0.072, 2));
          const cheekR = Math.exp(-Math.pow((p.x - 0.048) / 0.072, 2));
          const midBridge = Math.exp(-(p.x * p.x) / 0.0022) * 0.42;
          const wGlute = rearGate * wGluteY * Math.min(1.0, Math.max(cheekL, cheekR) + midBridge);
          if (wGlute > 0.01) {
            modelPos.z += wGlute * 0.036;
            modelPos.y += wGlute * 0.008;
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
  });
}

export function styleOperatorGlbMaterials(modelRoot, key, opCfg, outCfg, teamGlowColor) {
  const isSwimwear = Boolean(outCfg?.isSwimwear);
  const isVroidFemale = ['vita', 'shino', 'shibu', 'sample_a'].includes(key);
  const primaryHex = outCfg?.primary || (opCfg?.id === 'aria' ? '#22d3ee' : '#38bdf8');
  const secHex = outCfg?.secondary || '#1e293b';
  const vestHex = outCfg?.vest || secHex;
  const accentHex = outCfg?.accent || teamGlowColor;
  const glowCol = new THREE.Color(
    opCfg?.id === 'titan' ? '#f59e0b'
      : (opCfg?.id === 'shadow' ? '#10b981'
        : (opCfg?.id === 'aria' ? '#22d3ee'
          : (opCfg?.id === 'kagura' ? '#06b6d4' : teamGlowColor)))
  );

  modelRoot.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;

    const rawMatName = Array.isArray(child.material)
      ? child.material.map((m) => m?.name || '').join(' ')
      : (child.material?.name || '');

    // Female Bikini Mode: hide ALL outer garments (Tops, Bottoms, Skirts, Neckties, Shoes) -> wear ONLY Bikini
    if (isVroidFemale && isSwimwear && /(tops_|bottoms_|shoes_|accessory)/i.test(rawMatName)) {
      child.visible = false;
      return;
    }

    const applyMat = (srcMat) => {
      const mat = upgradeToStandardMaterial(srcMat);
      mat.envMapIntensity = 1.25;
      const mName = (mat.name || '').toLowerCase();

      if (key === 'soldier') {
        if (mName.includes('visor')) {
          mat.color.set('#e2e8f0');
          mat.emissive.copy(glowCol);
          mat.emissiveIntensity = 0.95;
          mat.metalness = 0.85;
          mat.roughness = 0.10;
        } else {
          const pCol = outCfg?.id === 'urban' ? '#475569' : primaryHex;
          const sCol = outCfg?.id === 'urban' ? '#1e293b' : secHex;
          applyRecoloredClothingMat(mat, pCol, sCol, 0.24, 0.55);
          mat.metalness = 0.24;
          mat.roughness = 0.46;
        }
      } else if (key === 'xbot') {
        const armorBase = opCfg?.id === 'titan' && outCfg?.id === 'urban' ? '#94a3b8' : primaryHex;
        if (mName.includes('joint')) {
          mat.color.set('#1e293b');
          mat.emissive.copy(glowCol);
          mat.emissiveIntensity = 0.85;
          mat.metalness = 0.72;
          mat.roughness = 0.24;
        } else {
          mat.color.copy(blendWithWhite(armorBase, 0.85));
          mat.metalness = 0.58;
          mat.roughness = 0.24;
        }
      } else if (key === 'orion') {
        if (mName.includes('wireframe')) {
          mat.color.set(accentHex);
          mat.emissive.copy(glowCol);
          mat.emissiveIntensity = 1.15;
          mat.metalness = 0.75;
          mat.roughness = 0.22;
        } else {
          const stealthCol = (outCfg?.id === 'urban' || outCfg?.id === 'stealth_ops') ? '#1e2636' : primaryHex;
          const stealthSec = (outCfg?.id === 'urban' || outCfg?.id === 'stealth_ops') ? '#0b0f19' : secHex;
          applyRecoloredClothingMat(mat, stealthCol, stealthSec, 0.20, 0.75);
          mat.metalness = 0.42;
          mat.roughness = 0.34;
        }
      } else if (key === 'rpm' || key === 'male_specops') {
        if (mName.includes('outfit_top')) {
          applyRecoloredClothingMat(mat, primaryHex, secHex, 0.26, 0.72);
          mat.roughness = 0.48;
        } else if (mName.includes('outfit_bottom')) {
          applyRecoloredClothingMat(mat, secHex, vestHex, 0.22, 0.65);
          mat.roughness = 0.54;
        } else if (mName.includes('footwear')) {
          applyRecoloredClothingMat(mat, vestHex, '#111827', 0.20, 0.55);
          mat.roughness = 0.38;
        } else if (mName.includes('headwear')) {
          applyRecoloredClothingMat(mat, secHex, primaryHex, 0.24, 0.60);
          mat.roughness = 0.62;
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
        } else if (mName.includes('tops_') || mName.includes('bottoms_') || mName.includes('accessory')) {
          const useBlackSpecOps = key === 'vita' && outCfg?.id === 'urban';
          const suitPrim = useBlackSpecOps ? '#1c2331' : primaryHex;
          const suitSec = useBlackSpecOps ? '#0b101b' : secHex;
          applyRecoloredClothingMat(mat, suitPrim, suitSec, 0.24, 0.72);
          mat.roughness = key === 'vita' ? 0.36 : 0.48;
          mat.metalness = key === 'vita' ? 0.22 : 0.06;
        } else if (mName.includes('shoes_')) {
          const bootCol = (key === 'vita' && outCfg?.id === 'urban') ? '#111827' : vestHex;
          applyRecoloredClothingMat(mat, bootCol, secHex, 0.22, 0.65);
          mat.roughness = 0.36;
          mat.metalness = 0.24;
        } else if (mName.includes('hair')) {
          mat.roughness = 0.36;
          mat.metalness = 0.14;
          if (mat.map) {
            mat.emissive.set('#ffffff');
            mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.12;
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
      }

      return mat;
    };

    if (Array.isArray(child.material)) {
      child.material = child.material.map(applyMat);
    } else if (child.material) {
      child.material = applyMat(child.material);
    }
  });
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
  const { gltf, clips, cfg } = loadedBundle;
  const cloned = SkeletonUtils.clone(gltf.scene);
  const key = Object.keys(CHARACTER_ARCHETYPES).find((k) => CHARACTER_ARCHETYPES[k] === cfg) || 'soldier';
  if (cfg.rigType === 'vroid') {
    applyFemaleCurveSculpt(cloned);
  }
  const scaleMult = opCfg?.helmetStyle === 'heavy' ? 1.07 : 1.0;
  cloned.scale.setScalar(cfg.scale * scaleMult);
  cloned.rotation.y = cfg.facingY;
  if (cfg.yOffset) {
    cloned.position.y = cfg.yOffset * cfg.scale * scaleMult;
  }

  styleOperatorGlbMaterials(cloned, key, opCfg, outCfg, teamGlowColor);
  curlHandsIntoGrip(cloned);

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
  return { modelRoot: cloned, mixer, actions, bones, restArmQuats, restHeadQuat, activeAnim: 'idle' };
}
