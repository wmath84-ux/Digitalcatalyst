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
  /**
   * CHANNEL-PACKED ORM: R = ambient occlusion, G = roughness, B = metalness.
   *
   * Three maps' worth of surface variation in one file — the memory and
   * bandwidth saving the research calls out (principle 36, §20), and the
   * reason the rock can afford roughness detail at all: as three separate
   * textures it would cost triple the VRAM for the same look, and on a
   * mobile budget that trade is never worth making.
   */
  rockORM: THREE.Texture;
  /**
   * The weathering detail map, one lookup for three effects:
   * R = moss speckle, G = dust/silt grit, B = vertical water streaks.
   */
  weather: THREE.Texture;
  /**
   * The contact decal: the soft dark ring a prop leaves on the ground, which
   * is what merges a hand-placed object into the terrain (principle 50).
   */
  contact: THREE.Texture;
  /** A painted canopy silhouette, stamped on the far-tree impostor cards. */
  canopy: THREE.Texture;
  /** Painted palm frond (alpha card) — the crown of every palm tree. */
  frond: THREE.Texture;
  /** Ringed palm-trunk bark. */
  palmBark: THREE.Texture;
  /** A painted palm-crown silhouette, stamped on the far-palm impostor cards. */
  palmCanopy: THREE.Texture;
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

/**
 * `MIPMAP_BIAS` diet for the low tier.
 *
 * The research prescription is "force the low mip to be the one that is
 * always resident". WebGL cannot select a base mip level from JS, so we take
 * the honest equivalent: repaint every procedural canvas at HALF size before
 * upload. Every texture in the set occupies a quarter of the bytes from then
 * on (512² → 256² etc. — and the mip chain shrinks with it), so VRAM and
 * per-frame texture bandwidth drop together at the cost of detail the low
 * tier's 0.85× render scale was never displaying anyway.
 *
 * Runs once at boot on the finished TextureSet — no painter needs to know.
 */
export function halveTextureSet(set: TextureSet): void {
  for (const key of Object.keys(set) as Array<keyof TextureSet>) {
    const value = set[key];
    if (!(value instanceof THREE.Texture)) continue;
    const img = value.image as HTMLCanvasElement | undefined;
    if (!(img instanceof HTMLCanvasElement) || img.width <= 128 || img.height <= 128) continue;
    const small = document.createElement("canvas");
    small.width = Math.max(64, img.width >> 1);
    small.height = Math.max(64, img.height >> 1);
    const sctx = small.getContext("2d");
    if (!sctx) continue;
    sctx.drawImage(img, 0, 0, small.width, small.height);
    value.image = small;
    value.needsUpdate = true;
  }
}

/** The aerial farmland scan (from `field_and_garden.glb`) the ground wears. */
export const GROUND_PHOTO_URL = "sanctuary/ground_field.jpg";

/**
 * The three baked maps of the Sketchfab "small flat cube of water" GLB —
 * the exact material the owner asked to wear every water surface:
 *
 *   • `caustics`  — greyscale wave-caustic noise (the GLB's base-colour
 *     multiply / specular map). THE visible water pattern, animated.
 *   • `roughness` — the GLB's metallicRoughness map, kept as PNG because its
 *     smooth/rough information lives in the red/green separation and 4:2:0
 *     JPEG chroma subsampling would average it away.
 *   • `emissive`  — the GLB's own photographic ocean surface.
 *
 * Loaded once, lazily; a failed fetch resolves to null and the procedural
 * water carries on unchanged (a missing photo is cosmetic, never fatal).
 */
export interface WaterPhotoSet {
  caustics: THREE.Texture;
  roughness: THREE.Texture;
  emissive: THREE.Texture;
}

export function loadWaterPhotos(anisotropy: number): Promise<WaterPhotoSet | null> {
  const loader = new THREE.TextureLoader();
  const load = (url: string, srgb: boolean) =>
    loader.loadAsync(`sanctuary/${url}`).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(4, anisotropy);
      return t;
    });
  return Promise.all([
    load("water_caustics.jpg", true),
    load("water_roughness.png", false), // data, not colour — must stay linear
    load("water_surface.jpg", true),
  ])
    .then(([caustics, roughness, emissive]) => ({ caustics, roughness, emissive }))
    .catch((err) => {
      console.warn("[sanctuary] water photos failed to load; keeping the procedural water:", err);
      return null;
    });
}

/**
 * Swap the placeholder grit for the aerial farmland photo once it streams
 * in. Purely an image swap on the LIVE texture: colour space, wrap and the
 * shells' baked UV scale stay untouched, so the world never relayouts — the
 * mud under the student simply gains its fields. The procedural canvas is
 * the permanent fallback if the photo never lands, and `maxSide` downsizes
 * the scan for low-tier devices (the scene passes its budget's verdict).
 */
export function patchGroundPhoto(tex: THREE.Texture, url: string, maxSide: number): void {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale < 1) {
      const small = document.createElement("canvas");
      small.width = Math.round(w * scale);
      small.height = Math.round(h * scale);
      const sctx = small.getContext("2d");
      if (!sctx) return;
      sctx.drawImage(img, 0, 0, small.width, small.height);
      tex.image = small;
    } else {
      tex.image = img;
    }
    tex.needsUpdate = true;
  };
  img.onerror = () =>
    console.warn("[sanctuary] ground photo failed to load; keeping the procedural grit");
  img.src = url;
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
    g.addColorStop(0, `hsl(${hue},72%,48%)`);
    g.addColorStop(0.55, `hsl(${hue + 4},68%,36%)`);
    g.addColorStop(1, `hsl(${hue + 8},64%,24%)`);
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
  // for the cost of one quad. USER DIRECTIVE (natural green): hue sits in
  // true grass green (112–128), chroma raised so the canopy pops in sun.
  drawLeaf(84, 96, 52, 78, 118);
  drawLeaf(170, 120, 56, 86, 128);
  drawLeaf(124, 186, 48, 66, 112);

  // ── Grass blade (single alpha-tested blade, gradient root→tip) ───────
  // USER DIRECTIVE (natural green): deep green root, vivid mid, sunlit lime
  // tip — no straw-yellow, so the field stays grass in afternoon sun.
  const blade = canvas2d(64, 256);
  blade.ctx.clearRect(0, 0, 64, 256);
  const bg = blade.ctx.createLinearGradient(0, 256, 0, 0);
  bg.addColorStop(0, "#1e6e12");
  bg.addColorStop(0.42, "#32b01c");
  bg.addColorStop(0.78, "#4cc828");
  bg.addColorStop(1, "#72dc3a");
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

  // ── Ground (neutral warm grit — the instant placeholder) ─────────────
  // The texture multiplies the vertex colour. A green-dominant grit turned
  // a desert vertex back into olive, which is why the land read as green
  // everywhere. The grit is now a warm grey; lush and dry vertex colours
  // are what make a hollow grass and a rise earth.
  //
  // ROLE: this canvas is what the ground shows on frame one and forever if
  // the aerial farmland photo never lands — `patchGroundPhoto` (below)
  // swaps the image out from under the same texture once the photo
  // streams in, keeping wrap, colour space and the shells' baked UVs.
  const ground = canvas2d(512, 512);
  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const f = fbm(x / 40, y / 40, 5, 11);
      const g2 = fbm(x / 9, y / 9, 3, 23);
      const tone = 168 + f * 42 + g2 * 20;
      const r = tone + 10;
      const g = tone - 2;
      const b = tone - 16;
      ground.ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ground.ctx.fillRect(x, y, 2, 2);
    }
  }
  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ground.ctx.strokeStyle = `rgba(${150 + Math.random() * 40 | 0},${140 + Math.random() * 36 | 0},${110 + Math.random() * 28 | 0},0.22)`;
    ground.ctx.lineWidth = 0.8;
    ground.ctx.beginPath();
    ground.ctx.moveTo(x, y);
    ground.ctx.lineTo(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12);
    ground.ctx.stroke();
  }

  // ── Rock (warm coral limestone) ──────────────────────────────────────
  const rock = canvas2d(512, 512);
  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const f = fbm(x / 34, y / 34, 5, 7);
      const speck = noise2(x, y, 5) > 0.93 ? 34 : 0;
      const lum = 78 + f * 78 + speck;
      // Warm, sun-baked limestone: red up, blue down — an island's rock is
      // bleached by salt and sun, never neutral grey.
      rock.ctx.fillStyle = `rgb(${(lum * 1.07) | 0},${(lum * 1.0) | 0},${(lum * 0.88) | 0})`;
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
      water.ctx.fillStyle = `rgb(${lum * 0.42 | 0},${lum * 0.68 | 0},${lum | 0})`;
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

  // ── Cloud puff (fBm cumulus, painted once, stamped on billboards) ────
  // The same cheap trick BGMI-class games use for distant weather: no 3D
  // puffs, no per-pixel cloud shader — a single fBm-painted alpha card,
  // stamped on a few dozen instanced billboards that cluster into banks.
  // Two details are what sell it as a cloud rather than a white blob:
  //   * DOMAIN WARP — a low-frequency noise offsets the fBm coordinates,
  //     which stretches the lobes into lumpy, drifting cumulus shapes;
  //   * FAKE VOLUME — bright white tops, cool grey bases (real clouds are
  //     lit from above; a uniform white puff always reads as a sticker).
  const cloud = canvas2d(256, 256);
  const cImg = cloud.ctx.createImageData(256, 256);
  const cData = cImg.data;
  const sstep = (a: number, b: number, x: number) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const w = fbm(x / 42, y / 42, 3, 91); // warp field
      const n = fbm(x / 19 + (w - 0.5) * 9, y / 27 + (w - 0.5) * 9, 4, 37);
      // Elliptical falloff — the card has no hard square edge.
      const ex = (x - 128) / 132;
      const ey = (y - 138) / 108;
      const fall = 1 - (ex * ex + ey * ey);
      if (fall <= 0) continue;
      const body = sstep(0.36, 0.62, n) * Math.pow(fall, 1.6);
      if (body <= 0.004) continue;
      const lum = 196 + body * 59 + (1 - n) * 26 + (1 - y / 256) * 12;
      const i4 = (y * 256 + x) * 4;
      cData[i4] = Math.min(255, lum - 5);
      cData[i4 + 1] = Math.min(255, lum - 2);
      cData[i4 + 2] = Math.min(255, lum + 6);
      cData[i4 + 3] = body * 255;
    }
  }
  cloud.ctx.putImageData(cImg, 0, 0);

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

  // ── Rock ORM (R = AO, G = roughness, B = metalness) ──────────────────
  //
  // The stone is a dielectric, so metalness is a hard zero everywhere — the
  // B channel exists only so the channel layout matches the standard ORM
  // convention and the material can bind one texture to three slots.
  //
  // The roughness channel is the interesting one: mineral faces sit ~0.75,
  // polished/water-scoured patches drop to ~0.62 and weathered pits rise to
  // ~0.95. That spread is what makes the low sun break across a boulder
  // instead of washing it out flat (principle 12).
  const rockORMCanvas = canvas2d(256, 256);
  const ormImg = rockORMCanvas.ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const ao = 0.72 + fbm(x / 48, y / 48, 3, 61) * 0.28;
      const roughVal = 0.62 + fbm(x / 22, y / 22, 4, 17) * 0.33;
      const i4 = (y * 256 + x) * 4;
      ormImg.data[i4] = ao * 255;
      ormImg.data[i4 + 1] = roughVal * 255;
      ormImg.data[i4 + 2] = 0;
      ormImg.data[i4 + 3] = 255;
    }
  }
  rockORMCanvas.ctx.putImageData(ormImg, 0, 0);
  const rockORM = new THREE.CanvasTexture(rockORMCanvas.c);
  rockORM.wrapS = THREE.RepeatWrapping;
  rockORM.wrapT = THREE.RepeatWrapping;
  rockORM.anisotropy = anisotropy;

  // ── Weathering detail (R moss, G dust, B streaks) ────────────────────
  const weatherCanvas = canvas2d(256, 256);
  const wImg = weatherCanvas.ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      // Moss: clumped blobs, thresholded so it never becomes an even wash —
      // a uniform green tint reads as paint, a patchy one reads as growth.
      const mossN = fbm(x / 30, y / 34, 4, 5);
      const moss = Math.max(0, (mossN - 0.42) / 0.5);
      // Dust: fine, high-frequency grit.
      const dust = fbm(x / 7, y / 7, 3, 71) * 0.75 + noise2(x, y, 9) * 0.25;
      // Streaks: vertical runs, so water marks always travel downhill in
      // world space (principle 9) rather than in some arbitrary UV direction.
      const streak = fbm(x / 5, y / 90, 3, 33) * (0.5 + 0.5 * Math.sin(x * 0.35));
      const i4 = (y * 256 + x) * 4;
      wImg.data[i4] = Math.min(255, moss * 255);
      wImg.data[i4 + 1] = Math.min(255, dust * 255);
      wImg.data[i4 + 2] = Math.min(255, streak * 255);
      wImg.data[i4 + 3] = 255;
    }
  }
  weatherCanvas.ctx.putImageData(wImg, 0, 0);
  const weather = new THREE.CanvasTexture(weatherCanvas.c);
  weather.wrapS = THREE.RepeatWrapping;
  weather.wrapT = THREE.RepeatWrapping;
  weather.anisotropy = anisotropy;

  // ── Contact decal (soft, slightly irregular dark ring) ───────────────
  const contactCanvas = canvas2d(128, 128);
  const cImg2 = contactCanvas.ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const dx = (x - 64) / 64;
      const dy = (y - 64) / 64;
      // A wobbled radius: a perfectly circular contact shadow is the same
      // "too perfect" tell as a perfectly spherical rock (principle 3).
      const wobble = 0.86 + 0.14 * fbm(x / 18, y / 18, 3, 44);
      const d = Math.hypot(dx, dy) / wobble;
      const alpha = Math.pow(1 - Math.min(1, d), 2.1) * 0.66;
      const i4 = (y * 128 + x) * 4;
      // Dark brown-black — never pure black, which would read as a hole.
      cImg2.data[i4] = 30;
      cImg2.data[i4 + 1] = 26;
      cImg2.data[i4 + 2] = 20;
      cImg2.data[i4 + 3] = alpha * 255;
    }
  }
  contactCanvas.ctx.putImageData(cImg2, 0, 0);
  const contact = toTexture(contactCanvas.c, anisotropy);

  // ── Canopy silhouette (the far-tree impostor card) ───────────────────
  //
  // Painted the way a foliage atlas is painted: many overlapping leaf
  // clusters, each with its own light/dark break-up, plus a jagged alpha
  // edge. The silhouette does the work — at 300 m the eye reads the shape of
  // the crown, not the leaves inside it (research §5, §19).
  const canopyCanvas = canvas2d(256, 256);
  canopyCanvas.ctx.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.pow(Math.random(), 0.55) * 96;
    const cx = 128 + Math.cos(a) * rad;
    const cy = 132 + Math.sin(a) * rad * 0.78;
    const r = 12 + Math.random() * 26;
    const shade = 0.55 + Math.random() * 0.45;
    // Sunlit crown top, shaded underside: the same top-lit rule a real crown
    // obeys, so the impostor still reads as lit by the same sun.
    const up = 1 - Math.min(1, Math.max(0, (cy - 96) / 140));
    canopyCanvas.ctx.fillStyle = `rgb(${(28 + 40 * shade) | 0},${(110 + 72 * shade) | 0},${(26 + 22 * shade) | 0})`;
    canopyCanvas.ctx.globalAlpha = 0.55 + up * 0.35;
    canopyCanvas.ctx.beginPath();
    canopyCanvas.ctx.ellipse(cx, cy, r, r * (0.7 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    canopyCanvas.ctx.fill();
  }
  canopyCanvas.ctx.globalAlpha = 1;
  const canopy = toTexture(canopyCanvas.c, anisotropy);

  // ── Palm frond (alpha card) ──────────────────────────────────────────
  //
  // One card = one complete pinnate frond: a central rachis with paired
  // leaflets that shrink toward the tip and fold along a gentle arc. Painted,
  // not modelled — a palm crown is 8–10 of these cards and the whole crown
  // costs less than one broadleaf's leaf cluster, which is what makes a
  // thousand-palm island affordable.
  const frond = canvas2d(256, 128);
  frond.ctx.clearRect(0, 0, 256, 128);
  {
    const fg = frond.ctx.createLinearGradient(0, 0, 256, 0);
    fg.addColorStop(0, "#227018");
    fg.addColorStop(0.55, "#3cb024");
    fg.addColorStop(1, "#6ad438");
    // Rachis: a shallow arc from root (left) to tip (right).
    frond.ctx.strokeStyle = "#7a6a3e";
    frond.ctx.lineWidth = 4;
    frond.ctx.beginPath();
    frond.ctx.moveTo(6, 64);
    frond.ctx.quadraticCurveTo(128, 40, 250, 58);
    frond.ctx.stroke();
    // Leaflets: paired strokes, longer at the base, shorter at the tip, each
    // with a slight forward sweep — the V-arrangement that reads as "palm".
    frond.ctx.strokeStyle = fg;
    frond.ctx.lineCap = "round";
    for (let i = 0; i < 22; i += 1) {
      const t = i / 21;
      const x = 12 + t * 226;
      const y = 64 - (1 - Math.abs(t - 0.62) * 1.25) * 20;
      const len = 52 * (1 - t * 0.72) * (0.85 + Math.random() * 0.3);
      const sweep = 0.5 + t * 0.3;
      frond.ctx.lineWidth = 4.6 - t * 2.2;
      frond.ctx.beginPath();
      frond.ctx.moveTo(x, y);
      frond.ctx.quadraticCurveTo(x + len * 0.5, y - len * sweep, x + len * 0.86, y - len * 0.42);
      frond.ctx.stroke();
      frond.ctx.beginPath();
      frond.ctx.moveTo(x, y);
      frond.ctx.quadraticCurveTo(x + len * 0.5, y + len * sweep * 1.06, x + len * 0.86, y + len * 0.46);
      frond.ctx.stroke();
    }
  }
  const frondTex = toTexture(frond.c, anisotropy);

  // ── Palm trunk bark (ringed scars) ───────────────────────────────────
  const palmBark = canvas2d(256, 256);
  {
    const pb = palmBark.ctx;
    pb.fillStyle = "#93805f";
    pb.fillRect(0, 0, 256, 256);
    // Growth-ring scars: horizontal bands, slightly irregular, darker in the
    // gap and lighter on the ridge — the signature palm-texture read.
    for (let y = 0; y < 256; y += 14 + ((Math.random() * 8) | 0)) {
      const shade = 0.75 + Math.random() * 0.5;
      pb.fillStyle = `rgb(${(126 * shade) | 0},${(110 * shade) | 0},${(82 * shade) | 0})`;
      pb.fillRect(0, y, 256, 5 + ((Math.random() * 4) | 0));
      pb.fillStyle = `rgba(52,40,26,${0.22 + Math.random() * 0.2})`;
      pb.fillRect(0, y + 6, 256, 2 + ((Math.random() * 3) | 0));
    }
    // Vertical fibre streaks.
    for (let i = 0; i < 130; i += 1) {
      const x = Math.random() * 256;
      pb.strokeStyle = `rgba(60,48,30,${0.1 + Math.random() * 0.16})`;
      pb.lineWidth = 1;
      pb.beginPath();
      pb.moveTo(x, 0);
      pb.lineTo(x + (Math.random() - 0.5) * 5, 256);
      pb.stroke();
    }
  }
  const palmBarkTex = toTexture(palmBark.c, anisotropy, [1, 2]);

  // ── Palm impostor silhouette ─────────────────────────────────────────
  //
  // At 300 m a palm is a trunk line and a burst of fronds. The card paints
  // exactly that: a slim curved trunk with a radiating crown, so the distant
  // forest keeps the palm's unmistakable silhouette instead of a blob.
  const palmCanopy = canvas2d(128, 256);
  palmCanopy.ctx.clearRect(0, 0, 128, 256);
  {
    const pc = palmCanopy.ctx;
    // Trunk: a curved tapering line from bottom to upper third.
    pc.strokeStyle = "#8f7c5c";
    pc.lineCap = "round";
    pc.lineWidth = 9;
    pc.beginPath();
    pc.moveTo(64, 252);
    pc.quadraticCurveTo(58, 170, 70, 96);
    pc.stroke();
    // Crown: 9 radiating fronds with a drooping arc.
    pc.strokeStyle = "#4e8a2f";
    for (let i = 0; i < 9; i += 1) {
      const a = -Math.PI * 0.92 + (i / 8) * Math.PI * 0.92;
      const len = 46 + Math.random() * 18;
      const tx = 70 + Math.cos(a) * len;
      const ty = 92 + Math.sin(a) * len * 0.78 + len * 0.34;
      pc.lineWidth = 5.5 - Math.abs(i - 4) * 0.55;
      pc.beginPath();
      pc.moveTo(70, 92);
      pc.quadraticCurveTo(70 + Math.cos(a) * len * 0.6, 92 + Math.sin(a) * len * 0.55 - 8, tx, ty + 12);
      pc.stroke();
    }
    pc.fillStyle = "#5c4a30";
    pc.beginPath();
    pc.ellipse(70, 94, 5, 4, 0, 0, Math.PI * 2);
    pc.fill();
  }
  const palmCanopyTex = toTexture(palmCanopy.c, anisotropy);

  const barkTex = toTexture(bark.c, anisotropy, [1, 3]);
  // Repeat (1, 1) on purpose: the terrain shells bake their own UV scale so
  // every shell gets the same texels per metre (see `terrain.buildTerrain`
  // and `palette.GROUND_TILE_METRES`). A repeat here would multiply on top of
  // that and put the near shell and the far shell back out of step.
  const groundTex = toTexture(ground.c, anisotropy, [1, 1]);
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
    rockORM,
    weather,
    contact,
    canopy,
    frond: frondTex,
    palmBark: palmBarkTex,
    palmCanopy: palmCanopyTex,
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
  // The ORM map has to tile with the albedo it modulates, or the roughness
  // and the colour of the same stone would drift apart across the surface.
  set.rockORM.repeat.set(2, 2);
  // The weathering detail is projected in WORLD space (see `weathering.ts`),
  // so it tiles once per unit and the shader supplies the scale — setting a
  // repeat here would double-apply the scale and make every boulder look
  // tiled.
  set.weather.repeat.set(1, 1);
  set.waterNormal.wrapS = THREE.RepeatWrapping;
  set.waterNormal.wrapT = THREE.RepeatWrapping;
  set.waterNormal.repeat.set(6, 30);
  return set;
}
