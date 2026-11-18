// Deterministic heightfield terrain (shared by Node server & browser client).
// A single Float32 grid is the single source of truth for physics, raycasts, rendering & minimap.

export const WATER_LEVEL = 9.5;
export const SWIM_DEPTH = 1.15;

function hashInt(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash01(ix, iz, seed = 0) {
  return hashInt(ix, iz, seed);
}

export function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  return t * t * (3 - 2 * t);
}

export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hashInt(ix, iz, seed);
  const b = hashInt(ix + 1, iz, seed);
  const c = hashInt(ix, iz + 1, seed);
  const d = hashInt(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, seed, octaves = 4, gain = 0.5) {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, z * f, seed + i * 17);
    norm += amp;
    amp *= gain;
    f *= 2.03;
  }
  return sum / norm;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1e-9;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

/**
 * spec: { half, cell, water, mountains[], rivers[], lakes[], flats[], roads[], edge }
 */
export function buildTerrain(spec) {
  const half = spec.half;
  const cell = spec.cell;
  const W = spec.water ?? WATER_LEVEL;
  const nx = Math.round((half * 2) / cell) + 1;
  const heights = new Float32Array(nx * nx);
  const flatMask = new Uint8Array(nx * nx);
  const roadMask = new Uint8Array(nx * nx);
  const mountains = spec.mountains || [];
  const lakes = spec.lakes || [];
  const edgeFalloff = spec.edgeFalloff ?? 300;

  // 1. Base elevation + massifs + lakes + island edge
  for (let iz = 0; iz < nx; iz++) {
    const z = -half + iz * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = -half + ix * cell;
      let h = 15
        + (fbm(x / 900, z / 900, 11, 3) - 0.5) * 18
        + (fbm(x / 260, z / 260, 23, 3) - 0.5) * 7
        + (fbm(x / 80, z / 80, 37, 2) - 0.5) * 2.4;

      let mh = 0;
      for (let m = 0; m < mountains.length; m++) {
        const mt = mountains[m];
        const d = Math.hypot(x - mt.x, z - mt.z) / mt.r;
        if (d < 1.15) {
          const prof = Math.pow(Math.max(0, 1 - (d * d) / 1.32), 1.5);
          const ridge = 1 - Math.abs(fbm(x / 190, z / 190, mt.seed, 3) * 2 - 1);
          const rough = fbm(x / 60, z / 60, mt.seed + 5, 2);
          mh += mt.peak * prof * (0.70 + 0.44 * ridge) + (rough - 0.5) * 9 * prof;
        }
      }
      if (mh > 22) {
        // Terrace bands -> real sheer cliff faces (vách đá) on part of every massif
        const t = mh / 16;
        const fl = Math.floor(t);
        const fr = t - fl;
        const terr = (fl + smoothstep(0.80, 0.97, fr)) * 16;
        const mask = smoothstep(0.42, 0.62, fbm(x / 320, z / 320, 91, 2));
        mh = mh * (1 - mask) + terr * mask;
      }
      h += mh;

      for (let l = 0; l < lakes.length; l++) {
        const lk = lakes[l];
        const d = Math.hypot(x - lk.x, z - lk.z);
        if (d < lk.r) {
          h -= lk.depth * (1 - smoothstep(0, lk.r, d)) * (1 - smoothstep(0, lk.r, d) * 0.25);
        }
      }

      const edge = half - Math.max(Math.abs(x), Math.abs(z));
      if (edge < edgeFalloff) {
        const t = smoothstep(edgeFalloff, 60, edge);
        h = h * (1 - t) + (W - 7) * t;
      }
      heights[iz * nx + ix] = h;
    }
  }

  const cellIndexRange = (cx, cz, rad) => ({
    x0: Math.max(0, Math.floor((cx - rad + half) / cell)),
    x1: Math.min(nx - 1, Math.ceil((cx + rad + half) / cell)),
    z0: Math.max(0, Math.floor((cz - rad + half) / cell)),
    z1: Math.min(nx - 1, Math.ceil((cz + rad + half) / cell))
  });

  // 2. Rivers (carved trench + parabolic bed, wading banks)
  const bank = 26;
  for (const river of spec.rivers || []) {
    const hw = river.width * 0.5;
    const reach = hw + bank + 2;
    const dist = new Float32Array(nx * nx).fill(1e9);
    let minIx = nx; let maxIx = 0; let minIz = nx; let maxIz = 0;
    for (let s = 0; s < river.pts.length - 1; s++) {
      const [ax, az] = river.pts[s];
      const [bx, bz] = river.pts[s + 1];
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / cell));
      const x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + reach + half) / cell));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / cell));
      const z1 = Math.min(nx - 1, Math.ceil((Math.max(az, bz) + reach + half) / cell));
      if (x0 < minIx) minIx = x0;
      if (x1 > maxIx) maxIx = x1;
      if (z0 < minIz) minIz = z0;
      if (z1 > maxIz) maxIz = z1;
      for (let iz = z0; iz <= z1; iz++) {
        const z = -half + iz * cell;
        for (let ix = x0; ix <= x1; ix++) {
          const x = -half + ix * cell;
          const d = distToSegment(x, z, ax, az, bx, bz);
          const idx = iz * nx + ix;
          if (d < dist[idx]) dist[idx] = d;
        }
      }
    }
    for (let iz = minIz; iz <= maxIz; iz++) {
      for (let ix = minIx; ix <= maxIx; ix++) {
        const idx = iz * nx + ix;
        const d = dist[idx];
        if (d >= hw + bank) continue;
        let bed;
        let t;
        if (d <= hw) {
          const q = d / hw;
          bed = W - 2.4 + 2.4 * q * q;
          t = 1;
        } else {
          bed = W;
          t = 1 - smoothstep(hw, hw + bank, d);
        }
        const carved = heights[idx] * (1 - t) + bed * t;
        if (carved < heights[idx]) heights[idx] = carved;
      }
    }
  }

  // 3. Flat plateaus (towns, bridge heads, outposts)
  const sampleRaw = (x, z) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x + half) / cell));
    const fz = Math.min(nx - 1.001, Math.max(0, (z + half) / cell));
    const ix = fx | 0;
    const iz = fz | 0;
    return heights[iz * nx + ix];
  };
  for (const flat of spec.flats || []) {
    if (flat.h === undefined || flat.h === null) {
      flat.h = Math.max(W + 3.2, sampleRaw(flat.x, flat.z));
    }
    const reach = flat.r + flat.blend;
    const rg = cellIndexRange(flat.x, flat.z, reach);
    const tintStrength = flat.tint ?? 1;
    for (let iz = rg.z0; iz <= rg.z1; iz++) {
      const z = -half + iz * cell;
      for (let ix = rg.x0; ix <= rg.x1; ix++) {
        const x = -half + ix * cell;
        const d = Math.hypot(x - flat.x, z - flat.z);
        if (d >= reach) continue;
        const t = d <= flat.r ? 1 : 1 - smoothstep(flat.r, reach, d);
        const idx = iz * nx + ix;
        heights[idx] = heights[idx] * (1 - t) + flat.h * t;
        const tv = Math.round(255 * t * tintStrength);
        if (tv > flatMask[idx]) flatMask[idx] = tv;
      }
    }
  }

  // 4. Dirt roads (visual mask only)
  for (const road of spec.roads || []) {
    const rw = road.width ?? 4.5;
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [ax, az] = road.pts[s];
      const [bx, bz] = road.pts[s + 1];
      const reach = rw + 3;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / cell));
      const x1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + reach + half) / cell));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / cell));
      const z1 = Math.min(nx - 1, Math.ceil((Math.max(az, bz) + reach + half) / cell));
      for (let iz = z0; iz <= z1; iz++) {
        const z = -half + iz * cell;
        for (let ix = x0; ix <= x1; ix++) {
          const x = -half + ix * cell;
          const d = distToSegment(x, z, ax, az, bx, bz);
          if (d >= reach) continue;
          const tv = Math.round(255 * (1 - smoothstep(rw * 0.55, reach, d)));
          const idx = iz * nx + ix;
          if (tv > roadMask[idx]) roadMask[idx] = tv;
        }
      }
    }
  }

  const terrain = {
    half,
    cell,
    nx,
    heights,
    flatMask,
    roadMask,
    waterLevel: W,
    heightAt(x, z) {
      let fx = (x + half) / cell;
      let fz = (z + half) / cell;
      if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
      if (fz < 0) fz = 0; else if (fz > nx - 1.001) fz = nx - 1.001;
      const ix = fx | 0;
      const iz = fz | 0;
      const u = fx - ix;
      const v = fz - iz;
      const i = iz * nx + ix;
      const h00 = heights[i];
      const h10 = heights[i + 1];
      const h01 = heights[i + nx];
      const h11 = heights[i + nx + 1];
      return (u + v <= 1)
        ? h00 + u * (h10 - h00) + v * (h01 - h00)
        : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
    },
    floorAt(x, z) {
      const h = terrain.heightAt(x, z);
      const swim = W - SWIM_DEPTH;
      return h > swim ? h : swim;
    },
    depthAt(x, z) {
      const d = W - terrain.heightAt(x, z);
      return d > 0 ? d : 0;
    },
    slopeAt(x, z) {
      const e = 2.5;
      const gx = (terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z)) / (2 * e);
      const gz = (terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e);
      return Math.hypot(gx, gz);
    },
    normalAt(x, z) {
      const e = 2.0;
      const gx = (terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z)) / (2 * e);
      const gz = (terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e);
      const l = Math.hypot(gx, 1, gz);
      return { x: -gx / l, y: 1 / l, z: -gz / l };
    },
    colorAt(ix, iz, out) {
      const i = iz * nx + ix;
      const h = heights[i];
      const xl = ix > 0 ? ix - 1 : ix;
      const xr = ix < nx - 1 ? ix + 1 : ix;
      const zu = iz > 0 ? iz - 1 : iz;
      const zd = iz < nx - 1 ? iz + 1 : iz;
      const gx = (heights[iz * nx + xr] - heights[iz * nx + xl]) / ((xr - xl || 1) * cell);
      const gz = (heights[zd * nx + ix] - heights[zu * nx + ix]) / ((zd - zu || 1) * cell);
      const slope = Math.hypot(gx, gz);
      const x = -half + ix * cell;
      const z = -half + iz * cell;
      const jit = (hashInt(ix, iz, 5) - 0.5) * 0.07;
      let r; let g; let b;
      if (h < W - 0.3) {
        const dd = Math.min(1, (W - h) / 3);
        r = 0.50 - 0.14 * dd; g = 0.47 - 0.10 * dd; b = 0.33 - 0.04 * dd;
      } else if (h < W + 0.9) {
        r = 0.80; g = 0.74; b = 0.52;
      } else {
        const forest = smoothstep(0.46, 0.64, fbm(x / 150, z / 150, 71, 2));
        r = 0.36 + (0.22 - 0.36) * forest;
        g = 0.55 + (0.40 - 0.55) * forest;
        b = 0.22 + (0.17 - 0.22) * forest;
        const alpine = smoothstep(55, 92, h);
        r += (0.50 - r) * alpine; g += (0.54 - g) * alpine; b += (0.42 - b) * alpine;
        const snow = smoothstep(108, 128, h) * (1 - smoothstep(0.7, 1.1, slope));
        r += (0.93 - r) * snow; g += (0.95 - g) * snow; b += (0.97 - b) * snow;
      }
      const rockT = smoothstep(0.55, 0.98, slope);
      if (rockT > 0 && h >= W - 0.3) {
        const rv = 0.46 + (hashInt(ix, iz, 9) - 0.5) * 0.10;
        r += (rv - r) * rockT; g += ((rv - 0.01) - g) * rockT; b += ((rv - 0.03) - b) * rockT;
      }
      const fm = flatMask[i] / 255;
      if (fm > 0) {
        r += (0.58 - r) * fm * 0.8; g += (0.56 - g) * fm * 0.8; b += (0.50 - b) * fm * 0.8;
      }
      const rm = roadMask[i] / 255;
      if (rm > 0 && h >= W - 0.3) {
        r += (0.50 - r) * rm * 0.85; g += (0.41 - g) * rm * 0.85; b += (0.30 - b) * rm * 0.85;
      }
      out[0] = Math.max(0, Math.min(1, r + jit));
      out[1] = Math.max(0, Math.min(1, g + jit));
      out[2] = Math.max(0, Math.min(1, b + jit));
      return out;
    }
  };
  return terrain;
}

/**
 * Renders a whole-map RGBA image (no DOM) for minimap / big map with simple hill-shading.
 */
export function renderTerrainRGBA(terrain, size = 640) {
  const data = new Uint8ClampedArray(size * size * 4);
  const rgb = [0, 0, 0];
  const span = terrain.half * 2;
  const W = terrain.waterLevel;
  for (let py = 0; py < size; py++) {
    const z = -terrain.half + ((py + 0.5) / size) * span;
    for (let px = 0; px < size; px++) {
      const x = -terrain.half + ((px + 0.5) / size) * span;
      const ix = Math.min(terrain.nx - 1, Math.max(0, Math.round((x + terrain.half) / terrain.cell)));
      const iz = Math.min(terrain.nx - 1, Math.max(0, Math.round((z + terrain.half) / terrain.cell)));
      terrain.colorAt(ix, iz, rgb);
      const h = terrain.heightAt(x, z);
      let shade = 1;
      if (h >= W) {
        const e = span / size * 1.2;
        const dh = terrain.heightAt(x - e, z - e) - terrain.heightAt(x + e, z + e);
        shade = 1 + Math.max(-0.35, Math.min(0.35, dh * 0.012));
      } else {
        const depth = Math.min(1, (W - h) / 3);
        rgb[0] = 0.20 - 0.08 * depth; rgb[1] = 0.46 - 0.12 * depth; rgb[2] = 0.68 - 0.10 * depth;
      }
      const o = (py * size + px) * 4;
      data[o] = rgb[0] * 255 * shade;
      data[o + 1] = rgb[1] * 255 * shade;
      data[o + 2] = rgb[2] * 255 * shade;
      data[o + 3] = 255;
    }
  }
  return data;
}
