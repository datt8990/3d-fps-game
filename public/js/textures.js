// High-Definition Procedural PBR Texture, Bump Map & Material Library for Maps, Props & Weapon Skins
import * as THREE from 'three';
import { WEAPON_SKINS } from '/shared/constants.js';

const materialCache = new Map();
const skinTextureCache = new Map();
let skyTextureCache = new Map();

let _graphicsAnisotropy = 4;
let _useMapBumpMaps = false;

function tuneMapMaterial(mat) {
  if (!mat) return mat;
  if (mat._origBumpMap === undefined) {
    mat._origBumpMap = mat.bumpMap || null;
  }
  if (mat.map) {
    mat.map.anisotropy = _graphicsAnisotropy;
    mat.map.needsUpdate = true;
  }
  const wantBump = _useMapBumpMaps ? mat._origBumpMap : null;
  if (mat.bumpMap !== wantBump) {
    mat.bumpMap = wantBump;
    mat.needsUpdate = true;
  }
  // Cut expensive per-pixel cubemap IBL on static matte arena walls/floors while keeping crisp textures
  if ('envMapIntensity' in mat) {
    mat.envMapIntensity = _useMapBumpMaps ? 0.55 : 0.0;
  }
  return mat;
}

export function configureGraphicsProfile(maxGpuAniso = 8, quality = 'medium') {
  const cap = Math.max(1, Math.min(maxGpuAniso || 4, quality === 'low' ? 4 : 8));
  _graphicsAnisotropy = cap;
  _useMapBumpMaps = quality === 'high';
  for (const mat of materialCache.values()) {
    tuneMapMaterial(mat);
  }
  for (const tex of skinTextureCache.values()) {
    if (tex) {
      tex.anisotropy = cap;
      tex.needsUpdate = true;
    }
  }
}

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
  } else if (type === 'jungle_floor') {
    // Rich tropical jungle earth + mossy grass patches + compacted dirt trails
    ctx.fillStyle = '#3f5a36';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 120; i++) {
      const rx = Math.random() * 512;
      const ry = Math.random() * 512;
      const rr = 8 + Math.random() * 26;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(92, 72, 46, 0.34)' : (i % 3 === 1 ? 'rgba(34, 84, 42, 0.38)' : 'rgba(74, 108, 48, 0.30)');
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
      bctx.fillStyle = i % 2 === 0 ? '#686868' : '#969696';
      bctx.beginPath(); bctx.arc(rx, ry, rr * 0.7, 0, Math.PI * 2); bctx.fill();
    }
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(133, 94, 52, 0.42)' : 'rgba(163, 190, 90, 0.25)';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 5, 3);
    }
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
  } else if (theme === 'jungle') {
    grad.addColorStop(0.0, '#0f3d3e');
    grad.addColorStop(0.42, '#2d7a78');
    grad.addColorStop(0.76, '#9ed2be');
    grad.addColorStop(1.0, '#5a8f69');
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
    case 'jungle_stone': {
      const t = makeWallConcreteTextures('#5b6352', 'rgba(74, 124, 58, 0.55)');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.055, roughness: 0.90, metalness: 0.05 });
      break;
    }
    case 'jungle_wall': {
      const t = makeWallConcreteTextures('#3b4a35', 'rgba(132, 204, 22, 0.32)');
      mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bumpMap, bumpScale: 0.045, roughness: 0.86, metalness: 0.08 });
      break;
    }
    case 'concrete_warehouse':
    case 'sand_tactical':
    case 'asphalt_city':
    case 'jungle_floor': {
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
  tuneMapMaterial(mat);
  materialCache.set(matKey, mat);
  return mat;
}

const outfitTextureCache = new Map();
const miscTextureCache = new Map();

export function getWeaponSkinTexture(skinId = 'default') {
  if (skinTextureCache.has(skinId)) return skinTextureCache.get(skinId);
  const skin = WEAPON_SKINS[skinId] || WEAPON_SKINS.default;
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');

  ctx.fillStyle = skin.bodyColor;
  ctx.fillRect(0, 0, 512, 512);

  if (skin.pattern === 'solid') {
    // Realistic Parkerized phosphate gunmetal with directional brush strokes, grain speckles & panel seams
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#3e4450');
    grad.addColorStop(0.28, '#2d323b');
    grad.addColorStop(0.72, '#22262e');
    grad.addColorStop(1, '#16191f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.055)';
      ctx.fillRect(0, y, 512, 1);
    }
    // Fine Parkerized bead-blasted steel micro-speckle
    for (let i = 0; i < 2400; i++) {
      const px = (i * 73) % 512;
      const py = (i * 139 + Math.floor(i / 7) * 19) % 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
      ctx.fillRect(px, py, 2, 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 476, 476);
    // Subtle receiver pins & stamped ribbing accents
    ctx.fillStyle = 'rgba(15,18,24,0.45)';
    for (const [rx, ry] of [[68, 92], [68, 420], [444, 92], [444, 420], [256, 76], [256, 436]]) {
      ctx.beginPath();
      ctx.arc(rx, ry, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skin.pattern === 'stripes') {
    // Asiimov precision sci-fi geometric plating
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(190, 0); ctx.lineTo(90, 120); ctx.lineTo(0, 120);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = skin.accentColor;
    ctx.beginPath();
    ctx.moveTo(0, 340); ctx.lineTo(512, 70); ctx.lineTo(512, 195); ctx.lineTo(0, 465);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.moveTo(0, 445); ctx.lineTo(512, 175); ctx.lineTo(512, 220); ctx.lineTo(0, 490);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(24,24,27,0.35)';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 472, 472);
  } else if (skin.pattern === 'gold') {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#fef9c3');
    grad.addColorStop(0.35, '#facc15');
    grad.addColorStop(0.7, '#ca8a04');
    grad.addColorStop(1, '#78350f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Ornate engraved dragon scales
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.58)';
    ctx.lineWidth = 4;
    for (let row = 0; row < 10; row++) {
      const y = row * 56;
      const offsetX = (row % 2) * 32;
      for (let x = -32; x < 544; x += 64) {
        ctx.beginPath();
        ctx.arc(x + offsetX, y, 30, 0, Math.PI, false);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 484, 484);
  } else if (skin.pattern === 'cyber') {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#0f0c29');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 512; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 6;
    for (let y = 40; y < 500; y += 84) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(180, y); ctx.lineTo(240, y + 40); ctx.lineTo(512, y + 40);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 260); ctx.lineTo(210, 260); ctx.lineTo(270, 200); ctx.lineTo(512, 200); ctx.stroke();
  } else if (skin.pattern === 'web') {
    const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 360);
    grad.addColorStop(0, '#dc2626');
    grad.addColorStop(0.55, '#991b1b');
    grad.addColorStop(1, '#270707');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#09090b';
    ctx.lineWidth = 4;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
      ctx.beginPath(); ctx.moveTo(256, 256); ctx.lineTo(256 + Math.cos(a) * 380, 256 + Math.sin(a) * 380); ctx.stroke();
    }
    for (let r = 44; r < 340; r += 48) {
      ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (skin.pattern === 'glacier') {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#f0f9ff');
    grad.addColorStop(0.45, '#7dd3fc');
    grad.addColorStop(1, '#0369a1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const facets = [
      [0, 0, 180, 90, 90, 240, 'rgba(255,255,255,0.28)'],
      [180, 90, 390, 30, 290, 260, 'rgba(14,165,233,0.22)'],
      [90, 240, 290, 260, 180, 470, 'rgba(224,242,254,0.34)'],
      [290, 260, 512, 190, 430, 490, 'rgba(2,132,199,0.28)']
    ];
    for (const [x1, y1, x2, y2, x3, y3, col] of facets) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 42, 0);
      ctx.lineTo(i * 36 + 54, 256);
      ctx.lineTo(i * 44 - 20, 512);
      ctx.stroke();
    }
  } else if (skin.pattern === 'jade') {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#34d399');
    grad.addColorStop(0.45, '#059669');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(167, 243, 208, 0.25)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 30 + Math.random() * 65, 0, Math.PI * 1.3);
      ctx.stroke();
    }
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 472, 472);
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, 440, 440);
  } else if (skin.pattern === 'magma') {
    ctx.fillStyle = '#121215';
    ctx.fillRect(0, 0, 512, 512);

    for (let y = 32; y < 500; y += 64) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(150, y - 34, 340, y + 34, 512, y);
      ctx.stroke();

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  addNoise(ctx, 512, 512, 0.045);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = _graphicsAnisotropy;
  skinTextureCache.set(skinId, tex);
  return tex;
}

export function getOutfitTextures(outfitId = 'urban', basePrimary = '#2b3648', baseSecondary = '#1a202c', accent = '#38bdf8') {
  const key = `${outfitId}_${basePrimary}_${baseSecondary}`;
  if (outfitTextureCache.has(key)) return outfitTextureCache.get(key);

  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  const b = createCanvas(256, 256);
  const bctx = b.getContext('2d');

  ctx.fillStyle = basePrimary;
  ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, 256, 256);

  // Ripstop tactical grid weave in bump map + subtle diffuse
  for (let i = 0; i < 256; i += 8) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(i, 0, 1, 256);
    ctx.fillRect(0, i, 256, 1);
    bctx.fillStyle = '#9c9c9c';
    bctx.fillRect(i, 0, 2, 256);
    bctx.fillRect(0, i, 256, 2);
  }

  if (outfitId === 'cyber') {
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 2;
    for (let y = 16; y < 256; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(100, y); ctx.lineTo(128, y + 16); ctx.lineTo(256, y + 16); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (outfitId === 'royal_gold') {
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y + 32); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    // Organic / digital tactical camo blotches
    ctx.fillStyle = baseSecondary;
    ctx.globalAlpha = 0.42;
    for (let i = 0; i < 28; i++) {
      const rx = ((i * 73) % 230) + 12;
      const ry = ((i * 137) % 230) + 12;
      const rw = 22 + ((i * 19) % 34);
      const rh = 12 + ((i * 29) % 24);
      if (outfitId === 'urban' || outfitId === 'stealth_ops') {
        ctx.fillRect(rx - rw * 0.5, ry - rh * 0.5, rw, rh);
      } else {
        ctx.beginPath();
        ctx.ellipse(rx, ry, rw * 0.6, rh * 0.5, (i % 5) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
      const rx = ((i * 97 + 40) % 220) + 16;
      const ry = ((i * 53 + 20) % 220) + 16;
      ctx.fillRect(rx, ry, 18, 10);
    }
    ctx.globalAlpha = 1;
  }

  addNoise(ctx, 256, 256, 0.05);
  const map = new THREE.CanvasTexture(c);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  const res = { map, bumpMap };
  outfitTextureCache.set(key, res);
  return res;
}

export function getMolleVestTextures() {
  if (miscTextureCache.has('molle')) return miscTextureCache.get('molle');
  const b = createCanvas(256, 256);
  const bctx = b.getContext('2d');
  bctx.fillStyle = '#707070';
  bctx.fillRect(0, 0, 256, 256);

  // Heavy ballistic Cordura nylon + MOLLE PALS webbing straps
  for (let y = 16; y < 256; y += 32) {
    bctx.fillStyle = '#c8c8c8';
    bctx.fillRect(0, y, 256, 14);
    bctx.fillStyle = '#383838';
    for (let x = 0; x < 256; x += 32) {
      bctx.fillRect(x, y, 4, 14);
    }
  }
  addNoise(bctx, 256, 256, 0.06);
  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  miscTextureCache.set('molle', bumpMap);
  return bumpMap;
}

export function getBalaclavaTexture(isSkull = false) {
  const key = isSkull ? 'balaclava_skull' : 'balaclava_plain';
  if (miscTextureCache.has(key)) return miscTextureCache.get(key);

  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle knit weave
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < 256; y += 6) {
    ctx.fillRect(0, y, 256, 2);
  }

  if (isSkull) {
    // Iconic Ghost Jaw & Teeth Print
    ctx.fillStyle = '#e2e8f0';
    // Cheekbone ridges
    ctx.beginPath();
    ctx.moveTo(42, 70); ctx.lineTo(95, 92); ctx.lineTo(82, 130); ctx.lineTo(50, 118);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(214, 70); ctx.lineTo(161, 92); ctx.lineTo(174, 130); ctx.lineTo(206, 118);
    ctx.closePath();
    ctx.fill();

    // Nasal cavity
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.moveTo(128, 66); ctx.lineTo(114, 108); ctx.lineTo(142, 108);
    ctx.closePath();
    ctx.fill();

    // Skull teeth row
    ctx.fillStyle = '#f1f5f9';
    for (let x = 76; x <= 164; x += 18) {
      ctx.fillRect(x, 140, 13, 38);
      ctx.fillRect(x + 1, 184, 11, 30);
    }
    ctx.fillStyle = '#090d16';
    ctx.fillRect(68, 176, 120, 6);
  } else {
    // Breathable mesh vents on lower mask
    ctx.fillStyle = '#090d16';
    for (let y = 110; y < 200; y += 14) {
      for (let x = 86; x < 174; x += 14) {
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  miscTextureCache.set(key, tex);
  return tex;
}

export function getWatchFaceTexture(accent = '#38bdf8') {
  const key = `watch_${accent}`;
  if (miscTextureCache.has(key)) return miscTextureCache.get(key);

  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#040812';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 112, 112);
  ctx.fillStyle = accent;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('100 HP', 64, 52);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('TAC-LINK', 64, 82);
  ctx.fillRect(24, 96, 80, 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  miscTextureCache.set(key, tex);
  return tex;
}

export function getStudioEnvMap() {
  if (miscTextureCache.has('studio_env')) return miscTextureCache.get('studio_env');
  const c = createCanvas(512, 256);
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#1e3a5f');
  grad.addColorStop(0.32, '#64748b');
  grad.addColorStop(0.50, '#cbd5e1');
  grad.addColorStop(0.52, '#1e293b');
  grad.addColorStop(1.0, '#090d16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Studio softbox key & rim reflections for metallic gunsteel, gold & visors
  const softboxes = [
    [130, 60, 90, 32, 'rgba(255,255,255,0.92)'],
    [390, 72, 70, 24, 'rgba(186,230,253,0.85)'],
    [256, 118, 120, 14, 'rgba(253,186,116,0.55)']
  ];
  for (const [x, y, rw, rh, col] of softboxes) {
    const sg = ctx.createRadialGradient(x, y, 2, x, y, rw);
    sg.addColorStop(0, col);
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  miscTextureCache.set('studio_env', tex);
  return tex;
}

export function getWeaponMetalBumpTexture() {
  if (miscTextureCache.has('weapon_metal_bump')) return miscTextureCache.get('weapon_metal_bump');
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  // Crisp CNC directional milling / brushed gunsteel grain
  for (let y = 0; y < 256; y += 2) {
    const v = 118 + ((y * 17) % 22);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 1600; i++) {
    const x = (i * 73) % 256;
    const y = (i * 131) % 256;
    const v = i % 3 === 0 ? 160 : (i % 3 === 1 ? 98 : 138);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = _graphicsAnisotropy;
  miscTextureCache.set('weapon_metal_bump', tex);
  return tex;
}

export function getWeaponRoughnessTexture() {
  if (miscTextureCache.has('weapon_roughness')) return miscTextureCache.get('weapon_roughness');
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  // Base matte-satin military phosphate finish (~0.45) with subtle oiled/worn metallic sheen bands
  ctx.fillStyle = '#787878';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 3) {
    const v = 104 + ((y * 23) % 34);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 512, 2);
  }
  // Subtle polished edge wear along receiver borders (lower roughness -> sharper specular glint)
  ctx.strokeStyle = '#383838';
  ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, 500, 500);
  for (let i = 0; i < 2400; i++) {
    const x = (i * 97) % 512;
    const y = (i * 61) % 512;
    const v = 90 + (i % 55);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 3, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = _graphicsAnisotropy;
  miscTextureCache.set('weapon_roughness', tex);
  return tex;
}

export function getWoodStockTexture(tone = '#85461e') {
  const key = `wood_stock_${tone}`;
  if (miscTextureCache.has(key)) return miscTextureCache.get(key);
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, 512, 512);
  // Rich hand-rubbed Russian laminated birch / walnut wood rings
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, 'rgba(245, 158, 11, 0.22)');
  g.addColorStop(0.45, 'rgba(54, 18, 6, 0.28)');
  g.addColorStop(1, 'rgba(180, 83, 9, 0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 5) {
    ctx.strokeStyle = y % 10 === 0 ? 'rgba(42, 14, 5, 0.40)' : 'rgba(217, 119, 6, 0.18)';
    ctx.lineWidth = y % 15 === 0 ? 2.8 : 1.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      const wave = Math.sin(x * 0.032 + y * 0.09) * 5.2 + Math.cos(x * 0.015) * 2.4;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  addNoise(ctx, 512, 512, 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = _graphicsAnisotropy;
  miscTextureCache.set(key, tex);
  return tex;
}

export function getPolymerGripTexture(baseHex = '#1f242d') {
  const key = `poly_grip_${baseHex}`;
  if (miscTextureCache.has(key)) return miscTextureCache.get(key);
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);
  // Ultra-crisp Magpul diamond checkering + anti-slip stipple micro-texture
  ctx.strokeStyle = 'rgba(0,0,0,0.46)';
  ctx.lineWidth = 2;
  for (let i = -512; i < 1024; i += 14) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 512, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 512); ctx.lineTo(i + 512, 0); ctx.stroke();
  }
  for (let y = 0; y < 512; y += 10) {
    for (let x = (y % 20 === 0 ? 0 : 5); x < 512; x += 10) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, 2, 2);
    }
  }
  addNoise(ctx, 512, 512, 0.035);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = _graphicsAnisotropy;
  miscTextureCache.set(key, tex);
  return tex;
}
