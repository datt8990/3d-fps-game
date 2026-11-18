// Builds Three.js 3D Arena, UV-Tiled Geometry, Zero-Z-Fighting Decals, Lighting & Bomb/Storm Visuals
import * as THREE from 'three';
import { getMapMaterial } from './textures.js';
import { createC4Mesh } from './models.js';

function makeSiteBadgeSprite(letter, colorHex = '#f59e0b') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = colorHex;
  ctx.font = 'bold 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 67);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.8, 1.8, 1);
  return sp;
}

// Proportionally tile UVs on architectural walls & buildings so textures never look stretched
function applyProportionalBoxUVs(geo, w, h, d, tileSize = 4.0) {
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!uv || !pos || !norm) return;

  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const u = uv.getX(i);
    const v = uv.getY(i);

    if (nx > 0.5) {
      // +X / -X faces (d x h)
      uv.setXY(i, u * Math.max(1, d / tileSize), v * Math.max(1, h / tileSize));
    } else if (ny > 0.5) {
      // +Y / -Y faces (w x d)
      uv.setXY(i, u * Math.max(1, w / tileSize), v * Math.max(1, d / tileSize));
    } else {
      // +Z / -Z faces (w x h)
      uv.setXY(i, u * Math.max(1, w / tileSize), v * Math.max(1, h / tileSize));
    }
  }
  uv.needsUpdate = true;
}

export function buildThreeMap(scene, mapData, mode = 'tdm', quality = 'high') {
  const worldGroup = new THREE.Group();
  scene.background = new THREE.Color(mapData.skyColor || '#6989a8');
  scene.fog = new THREE.FogExp2(mapData.fogColor || '#7c96b0', mapData.fogDensity || 0.005);

  const hemi = new THREE.HemisphereLight('#e2e8f0', '#334155', 0.90);
  worldGroup.add(hemi);

  const sun = new THREE.DirectionalLight('#fffbeb', 1.38);
  sun.position.set(36, 58, 28);
  if (quality !== 'low') {
    sun.castShadow = true;
    const mapSize = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 150;
    const d = 52;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0006;
  }
  worldGroup.add(sun);

  // Ground Plane offset slightly (-0.008m) so block bottoms at y=0 never Z-fight
  const floorW = mapData.bounds.halfW * 2 + 8;
  const floorD = mapData.bounds.halfD * 2 + 8;
  const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
  const floorMesh = new THREE.Mesh(floorGeo, getMapMaterial(mapData.floorMat));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.008;
  floorMesh.receiveShadow = quality !== 'low';
  worldGroup.add(floorMesh);

  const tiledMaterials = new Set(['building_brick', 'building_glass']);

  // Arena Blocks
  for (const b of mapData.blocks) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    if (tiledMaterials.has(b.mat)) {
      applyProportionalBoxUVs(geo, b.w, b.h, b.d, 5.5);
    }
    const mat = getMapMaterial(b.mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y + b.h * 0.5, b.z);
    if (quality !== 'low' && !b.isBoundary) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    worldGroup.add(mesh);
  }

  // Spawn Zone Floor Rings (with polygonOffset + depthWrite:false to eliminate Z-fighting)
  const makeDecalRing = (innerR, outerR, colorHex, opacity) =>
    new THREE.Mesh(
      new THREE.RingGeometry(innerR, outerR, 32),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    );

  if (mapData.spawns?.alpha?.[2]) {
    const aPad = makeDecalRing(2.2, 2.6, '#38bdf8', 0.48);
    aPad.rotation.x = -Math.PI / 2;
    aPad.position.set(mapData.spawns.alpha[2].x, 0.025, mapData.spawns.alpha[2].z);
    worldGroup.add(aPad);
  }
  if (mapData.spawns?.bravo?.[2]) {
    const bPad = makeDecalRing(2.2, 2.6, '#f97316', 0.48);
    bPad.rotation.x = -Math.PI / 2;
    bPad.position.set(mapData.spawns.bravo[2].x, 0.025, mapData.spawns.bravo[2].z);
    worldGroup.add(bPad);
  }

  // Bomb Sites A & B
  const bombMarkers = [];
  for (const site of mapData.bombSites || []) {
    const ring = makeDecalRing(
      site.radius - 0.18,
      site.radius,
      mode === 'bomb' ? '#ef4444' : '#f59e0b',
      mode === 'bomb' ? 0.72 : 0.28
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, (site.y || 0) + 0.03, site.z);
    worldGroup.add(ring);

    if (mode === 'bomb') {
      const badge = makeSiteBadgeSprite(site.id, '#f97316');
      badge.position.set(site.x, (site.y || 0) + 3.1, site.z);
      badge.userData.baseY = (site.y || 0) + 3.1;
      worldGroup.add(badge);
      bombMarkers.push(badge);
    }
  }

  const worldC4 = createC4Mesh();
  worldC4.visible = false;
  worldGroup.add(worldC4);

  let stormMesh = null;
  if (mode === 'survival') {
    stormMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 22, 48, 1, true),
      new THREE.MeshBasicMaterial({
        color: '#a855f7',
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    stormMesh.position.y = 11;
    worldGroup.add(stormMesh);
  }

  scene.add(worldGroup);
  return {
    worldGroup,
    worldC4,
    stormMesh,
    bombMarkers
  };
}

export function createLootCrateMesh(type = 'medkit') {
  const color = type === 'medkit' ? '#22c55e' : (type === 'armor' ? '#38bdf8' : '#eab308');
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.52, 0.68),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.5 })
  );
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.12, 0.72),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65 })
  );
  box.position.y = 0.28;
  trim.position.y = 0.28;
  g.add(box, trim);
  return g;
}
