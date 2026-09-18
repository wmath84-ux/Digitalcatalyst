// src/nature3d/engine/textures.ts
//
// Every texture in the sanctuary is PROCEDURAL — painted once into an
// OffscreenCanvas/HTMLCanvas at boot. No network request, no texture atlas to
// ship, nothing to cache-bust, and the whole scene boots in a single frame
// even on a cold, offline load.
//
// The canvases are deliberately small (256–1024 px) and mipmapped with
// anisotropy, which is what actually buys perceived sharpness at grazing
// angles — far cheaper than shipping 2K photo textures.

import * as THREE from "three";

export interface TextureSet {
  bark: THREE.Texture;
  barkNormal: THREE.Texture;
  leaf: THREE.Texture;
  grassBlade: THREE.Texture;
  ground: THREE.Texture;
  rock: THREE.Texture;
  rockNormal: THREE.Texture;
  water: THREE.Texture;
  waterNormal: THREE.Texture;
  fur: THREE.Texture;
  cloud: THREE.Texture;
  feather: THREE.Texture;
  dispose(): void;
}

function canvas2d(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, anisotropy: number, repeat?: [number, number]): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Simple value-noise helper — deterministic, no dependency. */
function noise2(x: number, y: number, seed = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o += 1) {
    const xi = Math.floor(x * freq);
    const yi = Math.floor(y * freq);
    const xf = x * freq - xi;
    const yf = y * freq - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = noise2(xi, yi, seed);
    const b = noise2(xi + 1, yi, seed);
    const c = noise2(xi, yi + 1, seed);
    const d = noise2(xi + 1, yi + 1, seed);
    value += amp * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v);
    amp *= 0.5;
    freq *= 2;
  }
  return value;
}

/** Derive a tangent-space normal map from a grayscale height canvas. */
function heightToNormal(src: HTMLCanvasElement, strength = 2.2): THREE.Texture {
  const { c, ctx } = canvas2d(src.width, src.height);
  const sctx = src.getContext("2d")!;
  const data = sctx.getImageData(0, 0, src.width, src.height).data;
  const out = ctx.createImageData(src.width, src.height);
  const w = src.width;
  const h = src.height;
  const at = (x: number, y: number) => {
    const xi = (x + w) % w;
    const yi = (y + h) % h;
    const i = (yi * w + xi) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 765;
  };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createTextures(anisotropy: number): TextureSet {
  // ── Bark ──────────────────────────────────────────────────────────────
  const bark = canvas2d(512, 512);
  bark.ctx.fillStyle = "#3a2a1d";
  bark.ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 2) {
      const f = fbm(x / 26, y / 150, 4, 3);
      const ridge = Math.abs(Math.sin(x * 0.09 + f * 5.5));
      const lum = 26 + ridge * 62 + f * 40;
      bark.ctx.fillStyle = `rgb(${lum + 16},${lum * 0.78},${lum * 0.55})`;
      bark.ctx.fillRect(x, y, 2, 1);
    }
  }
  // deep vertical fissures
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * 512;
    bark.ctx.strokeStyle = `rgba(14,9,5,${0.25 + Math.random() * 0.4})`;
    bark.ctx.lineWidth = 1 + Math.random() * 3.5;
    bark.ctx.beginPath();
    bark.ctx.moveTo(x, 0);
    for (let y = 0; y < 512; y += 24) bark.ctx.lineTo(x + Math.sin(y * 0.05 + i) * 6, y);
    bark.ctx.stroke();
  }

  // ── Leaf (alpha card with vein detail) ───────────────────────────────
  const leaf = canvas2d(256, 256);
  leaf.ctx.clearRect(0, 0, 256, 256);
  const drawLeaf = (cx: number, cy: number, w: number, h: number, hue: number) => {
    const g = leaf.ctx.createLinearGradient(cx, cy - h, cx, cy + h);
    g.addColorStop(0, `hsl(${hue},58%,46%)`);
    g.addColorStop(0.55, `hsl(${hue + 6},54%,34%)`);
    g.addColorStop(1, `hsl(${hue + 10},52%,22%)`);
    leaf.ctx.fillStyle = g;
    leaf.ctx.beginPath();
    leaf.ctx.moveTo(cx, cy - h);
    leaf.ctx.bezierCurveTo(cx + w, cy - h * 0.45, cx + w * 0.86, cy + h * 0.52, cx, cy + h);
    leaf.ctx.bezierCurveTo(cx - w * 0.86, cy + h * 0.52, cx - w, cy - h * 0.45, cx, cy - h);
    leaf.ctx.fill();
    leaf.ctx.strokeStyle = "rgba(196,236,150,0.42)";
    leaf.ctx.lineWidth = 1.6;
    leaf.ctx.beginPath();
    leaf.ctx.moveTo(cx, cy - h * 0.92);
    leaf.ctx.lineTo(cx, cy + h * 0.92);
    leaf.ctx.stroke();
    for (let v = -5; v <= 5; v += 1) {
      const vy = cy + (v / 6) * h * 0.8;
      leaf.ctx.lineWidth = 0.9;
      leaf.ctx.beginPath();
      leaf.ctx.moveTo(cx, vy);
      leaf.ctx.lineTo(cx + w * 0.62, vy + h * 0.16);
      leaf.ctx.moveTo(cx, vy);
      leaf.ctx.lineTo(cx - w * 0.62, vy + h * 0.16);
      leaf.ctx.stroke();
    }
  };
  // A cluster card: three overlapping leaves reads as real foliage volume
  // for the cost of one quad.
  drawLeaf(84, 96, 52, 78, 96);
  drawLeaf(170, 120, 56, 86, 104);
  drawLeaf(124, 186, 48, 66, 88);

  // ── Grass blade (single alpha-tested blade, gradient root→tip) ───────
  const blade = canvas2d(64, 256);
  blade.ctx.clearRect(0, 0, 64, 256);
  const bg = blade.ctx.createLinearGradient(0, 256, 0, 0);
  bg.addColorStop(0, "#254d16");
  bg.addColorStop(0.42, "#3f7d22");
  bg.addColorStop(0.78, "#68a83a");
  bg.addColorStop(1, "#a8cf63");
  blade.ctx.fillStyle = bg;
  blade.ctx.beginPath();
  blade.ctx.moveTo(24, 256);
  blade.ctx.quadraticCurveTo(10, 130, 30, 6);
  blade.ctx.lineTo(34, 2);
  blade.ctx.quadraticCurveTo(48, 130, 40, 256);
  blade.ctx.closePath();
  blade.ctx.fill();
  blade.ctx.strokeStyle = "rgba(20,48,10,0.45)";
  blade.ctx.lineWidth = 1.4;
  blade.ctx.beginPath();
  blade.ctx.moveTo(32, 250);
  blade.ctx.quadraticCurveTo(28, 128, 32, 8);
  blade.ctx.stroke();

  // ── Ground (soil + dry thatch + pebbles) ─────────────────────────────
  const ground = canvas2d(512, 512);
  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const f = fbm(x / 40, y / 40, 5, 11);
      const g2 = fbm(x / 9, y / 9, 3, 23);
      const r = 46 + f * 52 + g2 * 22;
      const g = 62 + f * 74 + g2 * 20;
      const b = 28 + f * 34 + g2 * 14;
      ground.ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ground.ctx.fillRect(x, y, 2, 2);
    }
  }
  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ground.ctx.strokeStyle = `rgba(${120 + Math.random() * 70 | 0},${130 + Math.random() * 60 | 0},60,0.22)`;
    ground.ctx.lineWidth = 0.8;
    ground.ctx.beginPath();
    ground.ctx.moveTo(x, y);
    ground.ctx.lineTo(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12);
    ground.ctx.stroke();
  }

  // ── Rock ─────────────────────────────────────────────────────────────
  const rock = canvas2d(512, 512);
  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const f = fbm(x / 34, y / 34, 5, 7);
      const speck = noise2(x, y, 5) > 0.93 ? 34 : 0;
      const lum = 78 + f * 78 + speck;
      rock.ctx.fillStyle = `rgb(${lum | 0},${(lum * 1.02) | 0},${(lum * 0.98) | 0})`;
      rock.ctx.fillRect(x, y, 2, 2);
    }
  }
  for (let i = 0; i < 40; i += 1) {
    rock.ctx.strokeStyle = `rgba(40,44,42,${0.2 + Math.random() * 0.25})`;
    rock.ctx.lineWidth = 1 + Math.random() * 2;
    rock.ctx.beginPath();
    const sx = Math.random() * 512;
    const sy = Math.random() * 512;
    rock.ctx.moveTo(sx, sy);
    rock.ctx.lineTo(sx + (Math.random() - 0.5) * 220, sy + (Math.random() - 0.5) * 220);
    rock.ctx.stroke();
  }

  // ── Water normal-ish ripple ──────────────────────────────────────────
  const water = canvas2d(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const v = (Math.sin(x * 0.12 + fbm(x / 30, y / 30, 3, 2) * 7) + Math.sin(y * 0.09 + x * 0.03)) * 0.25 + 0.5;
      const lum = 120 + v * 110;
      water.ctx.fillStyle = `rgb(${lum * 0.6 | 0},${lum * 0.85 | 0},${lum | 0})`;
      water.ctx.fillRect(x, y, 1, 1);
    }
  }

  // ── Fur (animal coats) ───────────────────────────────────────────────
  const fur = canvas2d(256, 256);
  fur.ctx.fillStyle = "#ffffff";
  fur.ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const shade = 200 + Math.random() * 55;
    fur.ctx.strokeStyle = `rgba(${shade | 0},${shade | 0},${shade | 0},0.5)`;
    fur.ctx.lineWidth = 0.7 + Math.random();
    fur.ctx.beginPath();
    fur.ctx.moveTo(x, y);
    fur.ctx.lineTo(x + (Math.random() - 0.5) * 7, y + 3 + Math.random() * 6);
    fur.ctx.stroke();
  }

  // ── Soft cloud puff (billboards) ─────────────────────────────────────
  const cloud = canvas2d(256, 256);
  const cg = cloud.ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
  cg.addColorStop(0, "rgba(255,255,255,0.95)");
  cg.addColorStop(0.45, "rgba(255,255,255,0.55)");
  cg.addColorStop(1, "rgba(255,255,255,0)");
  cloud.ctx.fillStyle = cg;
  cloud.ctx.fillRect(0, 0, 256, 256);

  // ── Feather / wing card ──────────────────────────────────────────────
  const feather = canvas2d(128, 64);
  feather.ctx.clearRect(0, 0, 128, 64);
  const fg = feather.ctx.createLinearGradient(0, 0, 128, 0);
  fg.addColorStop(0, "rgba(58,52,48,1)");
  fg.addColorStop(0.7, "rgba(96,86,76,0.95)");
  fg.addColorStop(1, "rgba(120,110,98,0)");
  feather.ctx.fillStyle = fg;
  feather.ctx.beginPath();
  feather.ctx.ellipse(52, 32, 52, 24, 0, 0, Math.PI * 2);
  feather.ctx.fill();

  const barkTex = toTexture(bark.c, anisotropy, [1, 3]);
  const groundTex = toTexture(ground.c, anisotropy, [42, 42]);
  const rockTex = toTexture(rock.c, anisotropy, [2, 2]);
  const waterTex = toTexture(water.c, anisotropy, [6, 30]);

  const set: TextureSet = {
    bark: barkTex,
    barkNormal: heightToNormal(bark.c, 2.4),
    leaf: toTexture(leaf.c, anisotropy),
    grassBlade: toTexture(blade.c, anisotropy),
    ground: groundTex,
    rock: rockTex,
    rockNormal: heightToNormal(rock.c, 1.8),
    water: waterTex,
    // Normal map for the river's dual-phase flow shader.
    waterNormal: heightToNormal(water.c, 1.5),
    fur: toTexture(fur.c, anisotropy, [3, 3]),
    cloud: toTexture(cloud.c, anisotropy),
    feather: toTexture(feather.c, anisotropy),
    dispose() {
      Object.values(this).forEach((v) => {
        if (v instanceof THREE.Texture) v.dispose();
      });
    },
  };
  set.barkNormal.repeat.set(1, 3);
  set.rockNormal.repeat.set(2, 2);
  set.waterNormal.wrapS = THREE.RepeatWrapping;
  set.waterNormal.wrapT = THREE.RepeatWrapping;
  set.waterNormal.repeat.set(6, 30);
  return set;
}
