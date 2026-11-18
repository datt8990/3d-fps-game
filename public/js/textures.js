// Procedural Canvas PBR Texture & Material Library for Maps and 8 Weapon Skins
import * as THREE from 'three';
import { WEAPON_SKINS } from '/shared/constants.js';

const materialCache = new Map();
const skinTextureCache = new Map();

function createCanvas(w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function addNoise(ctx, w, h, alpha = 0.06) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() - 0.5) * 255 * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
  }
  ctx.putImageData(img, 0, 0);
}

function makeContainerTexture(baseHex, stripeHex) {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, 0, 5, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 5, 0, 4, 256);
  }
  ctx.strokeStyle = stripeHex;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 246);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('BS-CARGO 40FT', 24, 42);
  addNoise(ctx, 256, 256, 0.05);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCrateWoodTexture() {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8b6239';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#4a3119';
  ctx.lineWidth = 4;
  for (let y = 32; y < 256; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  ctx.strokeStyle = '#5c3d20';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, 238, 238);
  ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(244, 244); ctx.stroke();
  addNoise(ctx, 256, 256, 0.08);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCrateMetalTexture() {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3b4452';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#1f2630';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, 240, 240);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(22, 200, 90, 24);
  ctx.fillStyle = '#111827';
  for (let x = 26; x < 108; x += 18) ctx.fillRect(x, 200, 8, 24);
  addNoise(ctx, 256, 256, 0.06);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBuildingTexture(isGlass = false) {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = isGlass ? '#263345' : '#694538';
  ctx.fillRect(0, 0, 256, 256);
  if (!isGlass) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < 256; y += 16) ctx.fillRect(0, y, 256, 2);
  }
  for (let y = 24; y < 230; y += 56) {
    for (let x = 20; x < 235; x += 54) {
      const lit = (x + y) % 3 === 0;
      ctx.fillStyle = isGlass ? (lit ? '#38bdf8' : '#0f172a') : (lit ? '#fde68a' : '#1e293b');
      ctx.fillRect(x, y, 34, 38);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, 34, 38);
    }
  }
  addNoise(ctx, 256, 256, 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorTexture(type = 'concrete_warehouse') {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  if (type === 'sand_tactical') {
    ctx.fillStyle = '#b4976c';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = 'rgba(92,70,42,0.15)';
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 8 + Math.random() * 28, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === 'asphalt_city') {
    ctx.fillStyle = '#2d333d';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(250,204,21,0.45)';
    ctx.lineWidth = 6;
    ctx.setLineDash([28, 22]);
    ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = '#525b66';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(20,24,30,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
  }
  addNoise(ctx, 512, 512, 0.08);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function getMapMaterial(matKey = 'concrete') {
  if (materialCache.has(matKey)) return materialCache.get(matKey);
  let mat;
  switch (matKey) {
    case 'container_red': mat = new THREE.MeshStandardMaterial({ map: makeContainerTexture('#991b1b', '#7f1d1d'), roughness: 0.55, metalness: 0.35 }); break;
    case 'container_blue': mat = new THREE.MeshStandardMaterial({ map: makeContainerTexture('#1d4ed8', '#1e3a8a'), roughness: 0.55, metalness: 0.35 }); break;
    case 'container_yellow': mat = new THREE.MeshStandardMaterial({ map: makeContainerTexture('#ca8a04', '#854d0e'), roughness: 0.55, metalness: 0.35 }); break;
    case 'container_green': mat = new THREE.MeshStandardMaterial({ map: makeContainerTexture('#15803d', '#14532d'), roughness: 0.55, metalness: 0.35 }); break;
    case 'crate_wood': mat = new THREE.MeshStandardMaterial({ map: makeCrateWoodTexture(), roughness: 0.82, metalness: 0.05 }); break;
    case 'crate_metal': mat = new THREE.MeshStandardMaterial({ map: makeCrateMetalTexture(), roughness: 0.45, metalness: 0.55 }); break;
    case 'building_brick': mat = new THREE.MeshStandardMaterial({ map: makeBuildingTexture(false), roughness: 0.80, metalness: 0.1 }); break;
    case 'building_glass': mat = new THREE.MeshStandardMaterial({ map: makeBuildingTexture(true), roughness: 0.32, metalness: 0.55 }); break;
    case 'sandbag': mat = new THREE.MeshStandardMaterial({ color: '#9c855c', roughness: 0.92, metalness: 0.02 }); break;
    case 'metal_deck':
    case 'metal_step': mat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.48, metalness: 0.62 }); break;
    case 'metal_dark': mat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.40, metalness: 0.72 }); break;
    case 'marble_dark': mat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.25, metalness: 0.40 }); break;
    case 'bunker_concrete': mat = new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.85, metalness: 0.08 }); break;
    case 'warehouse_wall': mat = new THREE.MeshStandardMaterial({ color: '#3f4854', roughness: 0.78, metalness: 0.20 }); break;
    case 'military_wall': mat = new THREE.MeshStandardMaterial({ color: '#786b59', roughness: 0.88, metalness: 0.08 }); break;
    case 'city_wall': mat = new THREE.MeshStandardMaterial({ color: '#2b3445', roughness: 0.75, metalness: 0.20 }); break;
    case 'concrete_warehouse':
    case 'sand_tactical':
    case 'asphalt_city': mat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(matKey), roughness: 0.86, metalness: 0.06 }); break;
    default: mat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.82, metalness: 0.10 }); break;
  }
  materialCache.set(matKey, mat);
  return mat;
}

export function getWeaponSkinTexture(skinId = 'default') {
  if (skinTextureCache.has(skinId)) return skinTextureCache.get(skinId);
  const skin = WEAPON_SKINS[skinId] || WEAPON_SKINS.default;
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');

  ctx.fillStyle = skin.bodyColor;
  ctx.fillRect(0, 0, 256, 256);

  if (skin.pattern === 'stripes') {
    ctx.fillStyle = skin.accentColor;
    ctx.beginPath(); ctx.moveTo(0, 180); ctx.lineTo(256, 40); ctx.lineTo(256, 105); ctx.lineTo(0, 245); ctx.fill();
    ctx.fillStyle = skin.woodOrGrip;
    ctx.fillRect(0, 0, 256, 36);
  } else if (skin.pattern === 'gold') {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.5, '#eab308');
    grad.addColorStop(1, '#854d0e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 6;
    for (let i = 20; i < 240; i += 45) {
      ctx.beginPath(); ctx.arc(i, 128, 32, 0, Math.PI * 1.4); ctx.stroke();
    }
  } else if (skin.pattern === 'cyber') {
    ctx.strokeStyle = skin.accentColor;
    ctx.lineWidth = 5;
    for (let y = 24; y < 256; y += 48) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(110, y); ctx.lineTo(145, y + 24); ctx.lineTo(256, y + 24); ctx.stroke();
    }
    ctx.fillStyle = skin.woodOrGrip;
    ctx.fillRect(40, 110, 180, 12);
  } else if (skin.pattern === 'web') {
    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 3;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.cos(a) * 180, 128 + Math.sin(a) * 180); ctx.stroke();
    }
    for (let r = 28; r < 160; r += 30) {
      ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (skin.pattern === 'glacier') {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#f0f9ff');
    grad.addColorStop(0.5, '#7dd3fc');
    grad.addColorStop(1, '#0284c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 22, 0);
      ctx.lineTo(i * 18 + 40, 128);
      ctx.lineTo(i * 24 - 10, 256);
      ctx.stroke();
    }
  } else if (skin.pattern === 'jade') {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(0.55, '#047857');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, 228, 228);
    ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
  } else if (skin.pattern === 'magma') {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 6;
    for (let y = 20; y < 250; y += 38) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y - 22, 170, y + 22, 256, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    for (let y = 20; y < 250; y += 38) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y - 22, 170, y + 22, 256, y);
      ctx.stroke();
    }
  }

  addNoise(ctx, 256, 256, 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  skinTextureCache.set(skinId, tex);
  return tex;
}
