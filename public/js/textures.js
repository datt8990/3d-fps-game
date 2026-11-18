// High-Definition Procedural PBR Texture, Bump Map & Material Library for Maps, Props & Weapon Skins
import * as THREE from 'three';
import { WEAPON_SKINS } from '/shared/constants.js';

const materialCache = new Map();
const skinTextureCache = new Map();
let skyTextureCache = new Map();

function createCanvas(w = 512, h = 512) {
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

function makeContainerTextures(baseHex, stripeHex, codeLabel = 'BS-CARGO 40FT') {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  const b = createCanvas(512, 512);
  const bctx = b.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  // Deep corrugated steel ribs
  for (let x = 0; x < 512; x += 24) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, 28, 8, 456);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 8, 28, 6, 456);

    bctx.fillStyle = '#303030';
    bctx.fillRect(x, 28, 8, 456);
    bctx.fillStyle = '#d8d8d8';
    bctx.fillRect(x + 8, 28, 8, 456);
  }

  // Heavy top/bottom structural rail & corner castings
  ctx.fillStyle = stripeHex;
  ctx.fillRect(0, 0, 512, 30);
  ctx.fillRect(0, 482, 512, 30);
  ctx.fillRect(0, 0, 26, 512);
  ctx.fillRect(486, 0, 26, 512);

  // Stenciled logistics markings & hazard decal
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 28px monospace';
  ctx.fillText(codeLabel, 42, 74);
  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('MAX GROSS 32,500 KG • TARE 3,800 KG', 42, 102);

  // Weathering & grime gradient at bottom
  const grime = ctx.createLinearGradient(0, 380, 0, 512);
  grime.addColorStop(0, 'rgba(15, 23, 42, 0)');
  grime.addColorStop(1, 'rgba(15, 23, 42, 0.42)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 380, 512, 132);

  addNoise(ctx, 512, 512, 0.05);
  addNoise(bctx, 512, 512, 0.04);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

function makeCrateWoodTextures() {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  const b = createCanvas(512, 512);
  const bctx = b.getContext('2d');

  ctx.fillStyle = '#8c6238';
  ctx.fillRect(0, 0, 512, 512);
  bctx.fillStyle = '#787878';
  bctx.fillRect(0, 0, 512, 512);

  // Wood grain fibers & plank seams
  for (let y = 0; y < 512; y += 52) {
    ctx.fillStyle = y % 104 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, y, 512, 50);
    ctx.fillStyle = '#3b2410';
    ctx.fillRect(0, y, 512, 4);
    bctx.fillStyle = '#222222';
    bctx.fillRect(0, y, 512, 4);
  }

  // Outer reinforced frame & diagonal brace
  ctx.strokeStyle = '#5c3c1e';
  ctx.lineWidth = 36;
  ctx.strokeRect(18, 18, 476, 476);
  bctx.strokeStyle = '#d0d0d0';
  bctx.lineWidth = 36;
  bctx.strokeRect(18, 18, 476, 476);

  ctx.strokeStyle = '#6b4624';
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(28, 28);
  ctx.lineTo(484, 484);
  ctx.stroke();

  // Stencil mark
  ctx.fillStyle = 'rgba(20, 20, 20, 0.72)';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('ORDNANCE // 7.62MM', 110, 260);

  // Corner metal bolts
  ctx.fillStyle = '#1e293b';
  for (const [bx, by] of [[24, 24], [488, 24], [24, 488], [488, 488]]) {
    ctx.beginPath();
    ctx.arc(bx, by, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  addNoise(ctx, 512, 512, 0.08);
  addNoise(bctx, 512, 512, 0.08);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);
  return { map, bumpMap };
}

function makeCrateMetalTextures() {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  const b = createCanvas(512, 512);
  const bctx = b.getContext('2d');

  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, 512, 512);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  // Recessed armored panel
  ctx.fillStyle = '#263142';
  ctx.fillRect(44, 44, 424, 424);
  bctx.fillStyle = '#505050';
  bctx.fillRect(44, 44, 424, 424);

  // Industrial X-ribbing inside panel
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 14;
  ctx.strokeRect(44, 44, 424, 424);
  ctx.beginPath();
  ctx.moveTo(64, 64); ctx.lineTo(448, 448);
  ctx.moveTo(448, 64); ctx.lineTo(64, 448);
  ctx.stroke();

  bctx.strokeStyle = '#c8c8c8';
  bctx.lineWidth = 14;
  bctx.strokeRect(44, 44, 424, 424);
  bctx.beginPath();
  bctx.moveTo(64, 64); bctx.lineTo(448, 448);
  bctx.moveTo(448, 64); bctx.lineTo(64, 448);
  bctx.stroke();

  // Hazard warning chevron bar
  ctx.fillStyle = '#eab308';
  ctx.fillRect(56, 404, 190, 38);
  ctx.fillStyle = '#0f172a';
  for (let x = 62; x < 240; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 404);
    ctx.lineTo(x + 14, 404);
    ctx.lineTo(x + 4, 442);
    ctx.lineTo(x - 10, 442);
    ctx.closePath();
    ctx.fill();
  }

  addNoise(ctx, 512, 512, 0.06);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);
  return { map, bumpMap };
}

function makeBuildingTextures(isGlass = false) {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  const b = createCanvas(512, 512);
  const bctx = b.getContext('2d');

  ctx.fillStyle = isGlass ? '#1e293b' : '#6e473b';
  ctx.fillRect(0, 0, 512, 512);
  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, 512, 512);

  if (!isGlass) {
    // Detailed brick coursework & concrete floor bands
    for (let y = 0; y < 512; y += 16) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, y, 512, 2);
      bctx.fillStyle = '#404040';
      bctx.fillRect(0, y, 512, 2);
      const shift = (y / 16) % 2 === 0 ? 0 : 16;
      for (let x = shift; x < 512; x += 32) {
        ctx.fillRect(x, y, 2, 16);
        bctx.fillRect(x, y, 2, 16);
      }
    }
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 512, 22);
    ctx.fillRect(0, 248, 512, 18);
  } else {
    // Modern curtain-wall aluminum mullions
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    for (let x = 0; x <= 512; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }
    for (let y = 0; y <= 512; y += 64) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    }
  }

  // Architectural Windows with depth & curtains/reflections
  for (let y = 38; y < 470; y += 112) {
    for (let x = 32; x < 470; x += 108) {
      const lit = (x * 3 + y * 7) % 5 === 0;
      const warm = (x + y) % 2 === 0;
      const grad = ctx.createLinearGradient(x, y, x + 68, y + 76);
      if (lit) {
        grad.addColorStop(0, isGlass ? '#38bdf8' : (warm ? '#fef08a' : '#bae6fd'));
        grad.addColorStop(1, isGlass ? '#0284c7' : (warm ? '#ca8a04' : '#0369a1'));
      } else {
        grad.addColorStop(0, '#1e293b');
        grad.addColorStop(1, '#090d16');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 68, 76);

      // Window sill & frame
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 6;
      ctx.strokeRect(x, y, 68, 76);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x - 4, y + 74, 76, 7);

      bctx.fillStyle = '#303030';
      bctx.fillRect(x, y, 68, 76);
      bctx.fillStyle = '#e0e0e0';
      bctx.fillRect(x - 4, y + 74, 76, 7);
    }
  }

  addNoise(ctx, 512, 512, 0.05);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

function makeFloorTextures(type = 'concrete_warehouse') {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  const b = createCanvas(512, 512);
  const bctx = b.getContext('2d');

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  if (type === 'sand_tactical') {
    ctx.fillStyle = '#bfa074';
    ctx.fillRect(0, 0, 512, 512);
    // Wind-swept desert sand ripples & pebbles
    for (let y = 0; y < 512; y += 16) {
      ctx.strokeStyle = 'rgba(120, 88, 50, 0.16)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + 8, 340, y - 8, 512, y);
      ctx.stroke();

      bctx.strokeStyle = '#9e9e9e';
      bctx.lineWidth = 5;
      bctx.beginPath();
      ctx.moveTo(0, y);
      bctx.bezierCurveTo(170, y + 8, 340, y - 8, 512, y);
      bctx.stroke();
    }
    ctx.fillStyle = 'rgba(92,70,42,0.18)';
    for (let i = 0; i < 95; i++) {
      const rx = Math.random() * 512;
      const ry = Math.random() * 512;
      const rr = 3 + Math.random() * 14;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
      bctx.fillStyle = '#606060';
      bctx.beginPath(); bctx.arc(rx, ry, rr, 0, Math.PI * 2); bctx.fill();
    }
  } else if (type === 'asphalt_city') {
    ctx.fillStyle = '#252b36';
    ctx.fillRect(0, 0, 512, 512);
    // Sidewalk stone border & road lane markings
    ctx.fillStyle = '#333b48';
    ctx.fillRect(0, 0, 48, 512);
    ctx.fillRect(464, 0, 48, 512);

    ctx.strokeStyle = 'rgba(250,204,21,0.58)';
    ctx.lineWidth = 8;
    ctx.setLineDash([36, 28]);
    ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 512); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(226,232,240,0.22)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(52, 0); ctx.lineTo(52, 512);
    ctx.moveTo(460, 0); ctx.lineTo(460, 512);
    ctx.stroke();
  } else {
    // Polished industrial warehouse concrete slabs with expansion joints & yellow safety lines
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.48)';
    ctx.lineWidth = 4;
    bctx.strokeStyle = '#303030';
    bctx.lineWidth = 4;
    for (let i = 0; i <= 512; i += 128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      bctx.beginPath(); bctx.moveTo(i, 0); bctx.lineTo(i, 512); bctx.stroke();
      bctx.beginPath(); bctx.moveTo(0, i); bctx.lineTo(512, i); bctx.stroke();
    }
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, 488, 488);
  }

  addNoise(ctx, 512, 512, 0.09);
  addNoise(bctx, 512, 512, 0.12);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(14, 14);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(14, 14);
  return { map, bumpMap };
}

function makeDiamondPlateTextures() {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  const b = createCanvas(256, 256);
  const bctx = b.getContext('2d');

  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#707070';
  bctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#64748b';
  bctx.fillStyle = '#d8d8d8';
  for (let y = 8; y < 256; y += 24) {
    for (let x = 8; x < 256; x += 24) {
      ctx.fillRect(x, y, 10, 4);
      ctx.fillRect(x + 12, y + 10, 4, 10);
      bctx.fillRect(x, y, 10, 4);
      bctx.fillRect(x + 12, y + 10, 4, 10);
    }
  }
  addNoise(ctx, 256, 256, 0.05);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(4, 4);
  return { map, bumpMap };
}

function makeWallConcreteTextures(baseHex = '#64748b', stripeColor = null) {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  const b = createCanvas(512, 512);
  const bctx = b.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 512, 512);

  // Architectural concrete panel joints & tie-rod holes
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.30)';
  ctx.lineWidth = 3;
  bctx.strokeStyle = '#404040';
  bctx.lineWidth = 3;
  for (let y = 0; y <= 512; y += 128) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    bctx.beginPath(); bctx.moveTo(0, y); bctx.lineTo(512, y); bctx.stroke();
  }
  for (let x = 0; x <= 512; x += 256) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    bctx.beginPath(); bctx.moveTo(x, 0); bctx.lineTo(x, 512); bctx.stroke();
  }

  if (stripeColor) {
    ctx.fillStyle = stripeColor;
    ctx.fillRect(0, 380, 512, 24);
  }

  addNoise(ctx, 512, 512, 0.07);
  addNoise(bctx, 512, 512, 0.09);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

export function getSkyDomeTexture(theme = 'industrial') {
  if (skyTextureCache.has(theme)) return skyTextureCache.get(theme);
  const c = createCanvas(1024, 512);
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  if (theme === 'desert_military') {
    grad.addColorStop(0.0, '#1e3a5f');
    grad.addColorStop(0.42, '#5b82a6');
    grad.addColorStop(0.75, '#d4a373');
    grad.addColorStop(1.0, '#c9a679');
  } else if (theme === 'urban_dusk') {
    grad.addColorStop(0.0, '#090d16');
    grad.addColorStop(0.38, '#1e293b');
    grad.addColorStop(0.72, '#475569');
    grad.addColorStop(0.92, '#f97316');
    grad.addColorStop(1.0, '#3a4b6e');
  } else {
    grad.addColorStop(0.0, '#1e3a8a');
    grad.addColorStop(0.45, '#476b9e');
    grad.addColorStop(0.82, '#94a3b8');
    grad.addColorStop(1.0, '#6989a8');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Soft atmospheric clouds
  for (let i = 0; i < 45; i++) {
    const cx = Math.random() * 1024;
    const cy = 90 + Math.random() * 220;
    const rw = 50 + Math.random() * 130;
    const rh = 14 + Math.random() * 32;
    const cgrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, rw);
    cgrad.addColorStop(0, theme === 'urban_dusk' ? 'rgba(253, 186, 116, 0.20)' : 'rgba(255, 255, 255, 0.22)');
    cgrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = cgrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  skyTextureCache.set(theme, tex);
  return tex;
}

export function getMapMaterial(matKey = 'concrete') {
  if (materialCache.has(matKey)) return materialCache.get(matKey);
  let mat;
  switch (matKey) {
    case 'container_red': {
      const t = makeContainerTextures('#991b1b', '#7f1d1d', 'BS-ALPHA 40HC');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.04, roughness: 0.48, metalness: 0.42 });
      break;
    }
    case 'container_blue': {
      const t = makeContainerTextures('#1d4ed8', '#1e3a8a', 'BS-NAVY 40HC');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.04, roughness: 0.48, metalness: 0.42 });
      break;
    }
    case 'container_yellow': {
      const t = makeContainerTextures('#ca8a04', '#854d0e', 'HAZMAT-CARGO');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.04, roughness: 0.48, metalness: 0.42 });
      break;
    }
    case 'container_green': {
      const t = makeContainerTextures('#15803d', '#14532d', 'TAC-MILITARY');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.04, roughness: 0.48, metalness: 0.42 });
      break;
    }
    case 'crate_wood': {
      const t = makeCrateWoodTextures();
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.035, roughness: 0.78, metalness: 0.08 });
      break;
    }
    case 'crate_metal': {
      const t = makeCrateMetalTextures();
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.04, roughness: 0.38, metalness: 0.62 });
      break;
    }
    case 'building_brick': {
      const t = makeBuildingTextures(false);
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.045, roughness: 0.75, metalness: 0.12 });
      break;
    }
    case 'building_glass': {
      const t = makeBuildingTextures(true);
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.025, roughness: 0.24, metalness: 0.68 });
      break;
    }
    case 'sandbag': {
      const t = makeWallConcreteTextures('#a68b5b');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.05, roughness: 0.92, metalness: 0.02 });
      break;
    }
    case 'metal_deck':
    case 'metal_step': {
      const t = makeDiamondPlateTextures();
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.03, roughness: 0.42, metalness: 0.68 });
      break;
    }
    case 'metal_dark':
      mat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.35, metalness: 0.78 });
      break;
    case 'marble_dark':
      mat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.18, metalness: 0.55 });
      break;
    case 'bunker_concrete': {
      const t = makeWallConcreteTextures('#6b7280', 'rgba(234, 179, 8, 0.45)');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.04, roughness: 0.82, metalness: 0.10 });
      break;
    }
    case 'warehouse_wall': {
      const t = makeWallConcreteTextures('#3b4452', 'rgba(249, 115, 22, 0.55)');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.035, roughness: 0.72, metalness: 0.25 });
      break;
    }
    case 'military_wall': {
      const t = makeWallConcreteTextures('#786b59', 'rgba(202, 138, 4, 0.45)');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.045, roughness: 0.85, metalness: 0.08 });
      break;
    }
    case 'city_wall': {
      const t = makeWallConcreteTextures('#27303f', 'rgba(56, 189, 248, 0.45)');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.035, roughness: 0.70, metalness: 0.24 });
      break;
    }
    case 'concrete_warehouse':
    case 'sand_tactical':
    case 'asphalt_city': {
      const t = makeFloorTextures(matKey);
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.035, roughness: 0.82, metalness: 0.08 });
      break;
    }
    default: {
      const t = makeWallConcreteTextures('#64748b');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.035, roughness: 0.78, metalness: 0.12 });
      break;
    }
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
