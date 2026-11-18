// Builds Three.js 3D Arena, Lighting, Bomb Zones, C4 & Survival Storm/Loot from shared/maps.js
import * as THREE from 'three';
import { getMapMaterial } from './textures.js';
import { createC4Mesh } from './models.js';

function makeSiteBadgeSprite(letter, colorHex = '#f59e0b') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
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
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(1.8, 1.8, 1);
  return sp;
}

export function buildThreeMap(scene, mapData, mode = 'tdm', quality = 'high') {
  const worldGroup = new THREE.Group();
  scene.background = new THREE.Color(mapData.skyColor || '#6989a8');
  scene.fog = new THREE.FogExp2(mapData.fogColor || '#7c96b0', mapData.fogDensity || 0.006);

  // Hemisphere + Directional Sun Light
  const hemi = new THREE.HemisphereLight('#e2e8f0', '#334155', 0.85);
  worldGroup.add(hemi);

  const sun = new THREE.DirectionalLight('#fffbeb', 1.35);
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
    sun.shadow.bias = -0.0005;
  }
  worldGroup.add(sun);

  // Ground Plane
  const floorW = mapData.bounds.halfW * 2 + 8;
  const floorD = mapData.bounds.halfD * 2 + 8;
  const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
  const floorMesh = new THREE.Mesh(floorGeo, getMapMaterial(mapData.floorMat));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = quality !== 'low';
  worldGroup.add(floorMesh);

  // Arena Blocks
  for (const b of mapData.blocks) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const mat = getMapMaterial(b.mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y + b.h * 0.5, b.z);
    if (quality !== 'low' && !b.isBoundary) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    worldGroup.add(mesh);
  }

  // Spawn Zone Subtle Team FloorPads (Alpha Cyan / Bravo Amber)
  if (mapData.spawns?.alpha?.[2]) {
    const aPad = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 28),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    aPad.rotation.x = -Math.PI / 2;
    aPad.position.set(mapData.spawns.alpha[2].x, 0.03, mapData.spawns.alpha[2].z);
    worldGroup.add(aPad);
  }
  if (mapData.spawns?.bravo?.[2]) {
    const bPad = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 28),
      new THREE.MeshBasicMaterial({ color: '#f97316', side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
    );
    bPad.rotation.x = -Math.PI / 2;
    bPad.position.set(mapData.spawns.bravo[2].x, 0.03, mapData.spawns.bravo[2].z);
    worldGroup.add(bPad);
  }

  // Bomb Sites A & B (Highlighted strongly in Bomb mode, subtle tactical markers in others)
  const bombMarkers = [];
  for (const site of mapData.bombSites || []) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.18, site.radius, 36),
      new THREE.MeshBasicMaterial({
        color: mode === 'bomb' ? '#ef4444' : '#f59e0b',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: mode === 'bomb' ? 0.72 : 0.25
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, (site.y || 0) + 0.04, site.z);
    worldGroup.add(ring);

    if (mode === 'bomb') {
      const badge = makeSiteBadgeSprite(site.id, '#f97316');
      badge.position.set(site.x, (site.y || 0) + 3.2, site.z);
      worldGroup.add(badge);
      bombMarkers.push(badge);
    }
  }

  // World C4 Mesh (for Planted or Dropped state)
  const worldC4 = createC4Mesh();
  worldC4.visible = false;
  worldGroup.add(worldC4);

  // Survival Mode Storm Wall Cylinder
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
