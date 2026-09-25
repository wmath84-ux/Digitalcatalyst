// Measures the winter shader instead of eyeballing it.
//
// The whole seasonal transformation lives in injected GLSL, so the only way to
// assert "35 % of the meadow is snow and the rest is untouched" — rather than
// "the meadow is 35 % paler" — is to evaluate that GLSL. This module compiles
// the real material hooks against three's actual shader sources, lifts the
// injected block out, and runs it on the CPU with a hand-written evaluator for
// the subset of GLSL it uses. Anything unexpected throws rather than guessing.
//
// This is the guard against the original defect: a coverage mask that is
// spatially uniform reads as a white filter, however it is written.

import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = mkdtempSync(path.join(tmpdir(), "sanctuary-winter-glsl-"));
const bundle = path.join(temp, "winter.mjs");
buildSync({
  stdin: {
    contents: `
      export * as THREE from "three";
      export { createWinter, winterDaylight, WINTER_SURFACES, SURFACE_RULES } from "./src/nature3d/engine/winter";
      export { daylightAt } from "./src/nature3d/engine/daylight";
      export { pathWeight } from "./src/nature3d/engine/environment";
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
  logLevel: "silent",
});
const { THREE, createWinter, winterDaylight, WINTER_SURFACES, SURFACE_RULES, daylightAt, pathWeight } =
  await import(pathToFileURL(bundle));
rmSync(temp, { recursive: true, force: true });

const ICEAGE = "uIceAge";

/** Run a material's real hooks over a three shader source and return the result. */
export function compile(material, { publishWorn = false } = {}) {
  const lib = material.isPointsMaterial
    ? "points"
    : material.isMeshBasicMaterial
      ? "basic"
      : material.isMeshLambertMaterial
        ? "lambert"
        : "standard";
  const shader = { ...THREE.ShaderLib[lib], uniforms: {} };
  if (publishWorn) {
    // terrain.ts publishes this; the terrain's own hook runs inside
    // <color_fragment>, so a plain stand-in is enough to compile the block.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vDcWorn;",
    );
  }
  material.onBeforeCompile(shader, {});
  return shader;
}

/** The injected winter block, verbatim, for one material. */
export function winterBlock(material, options) {
  const shader = compile(material, options);
  const start = shader.fragmentShader.indexOf("// ── Winter: this surface's snow");
  const end = shader.fragmentShader.indexOf("#include <emissivemap_fragment>", start);
  if (start < 0 || end < 0) throw new Error("winter block not found");
  return { block: shader.fragmentShader.slice(start, end), shader };
}

// ── A tiny GLSL evaluator for the mask expressions ──────────────────────────
const strip = (block) =>
  block
    .replace(/\/\/[^\n]*/g, "")
    .replace(/#ifdef STANDARD[\s\S]*?#endif/g, "")
    .replace(/#ifdef USE_MAP[\s\S]*?#else[\s\S]*?#endif/g, "")
    .replace(/diffuseColor\.rgb\s*=\s*[^;]+;/g, "")
    .replace(/float dcRime[^;]*;/, "")
    .replace(/float snowCover\s*=\s*0\.0;/, "")
    .replace(/snowCover\s*=\s*clamp\(snowCover, 0\.0, 1\.0\);/, "")
    .replace(/snowCover\s*\*=\s*[^;]+;/g, "")
    .replace(/vec3 snowColor[^;]*;/, "")
    .replace(/float snowUp\s*=\s*max\(normalize\(vDcWorldNormal\)\.y, 0\.0\);/, "")
    .replace(/if \(snowCover > 0\.002\) \{/, "")
    .replace(/if \(uIceAge > 0\.001\) \{/, "")
    .replace(/^\s*\}/gm, "");

const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Mirror of dcHash12 + dcSnowNoise + dcSnowFbm. Must stay in step with them. */
export function snowNoise(px, py) {
  const hash = (hx, hy) => {
    const s = Math.sin(hx * 127.1 + hy * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const vnoise = (nx, ny) => {
    const ix = Math.floor(nx);
    const iy = Math.floor(ny);
    const fx = nx - ix;
    const fy = ny - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  };
  const n = vnoise(px, py) * 0.66 + vnoise(px * 2.31 + 17.3, py * 2.31 + 17.3) * 0.34;
  return smooth01(0.16, 0.84, n);
}

const V2 = (x, y) => ({ x: Number(x), y: Number(y) });
const V3 = (x, y, z) => ({ x: Number(x), y: Number(y), z: Number(z) });
const mix = (a, b, t) =>
  typeof a === "number"
    ? a + (b - a) * t
    : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoothstep = (a, b, x) => smooth01(a, b, x);
const normalizeY = (n) => {
  const l = Math.hypot(n.x, n.y, n.z) || 1;
  return Math.max(n.y / l, 0);
};

function evalBlock(block, vars) {
  const lines = strip(block)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const env = {
    uIceAge: vars.uIceAge,
    snowUp: vars.snowUp,
    vDcWorldPos: vars.vDcWorldPos,
    vDcWorldNormal: vars.vDcWorldNormal,
    vDcWorn: vars.vDcWorn,
    V2,
    V3,
    mix,
    dot,
    normalizeY,
    smoothstep,
    clamp,
    dcSnowFbm: (p) => snowNoise(p.x, p.y),
    dcSnowStencil: (p, cover, patch) => {
      if (cover <= 0.001) return 0;
      const n = snowNoise(p.x * patch, p.y * patch);
      const edge = 1 - clamp(cover, 0, 1);
      const w = 0.09 + 0.13 * cover;
      return smoothstep(edge - w, edge + w, n);
    },
    dcSnowNoise: (p) => snowNoise(p.x, p.y),
    dcHash12: () => 0,
    dcSnowTone: () => V3(0, 0, 0),
    dcRimeTint: () => V3(0, 0, 0),
  };
  const names = Object.keys(env);
  const vals = names.map((n) => env[n]);
  // GLSL → JS for the subset this block uses. Swizzles are expanded first
  // because JS has no operator overloading.
  const expr = (text) =>
    text
      .replace(/(\w+)\.xz\s*\*\s*([0-9.]+)\s*\+\s*(\w+(?:\.\w+)*)\s*\*\s*([0-9.]+)/g, "V2($1.x*$2 + $3*$4, $1.z*$2 + $3*$4)")
      .replace(/(\w+)\.xz\s*\*\s*([0-9.]+)\s*\+\s*([0-9.]+)/g, "V2($1.x*$2 + $3, $1.z*$2 + $3)")
      .replace(/(\w+)\.xz\s*\*\s*([0-9.]+)/g, "V2($1.x*$2, $1.z*$2)")
      .replace(/(\w+)\.xz/g, "V2($1.x, $1.z)")
      .replace(/normalize\(([^)]*)\)\.y/g, "normalizeY($1)")
      .replace(/\bpow\b/g, "Math.pow");

  let cover = 0;
  let stencil = 0;
  let pathSnow = 0;
  for (const line of lines) {
    const st = line.match(/^float snow\s*=\s*dcSnowStencil\(([\s\S]+)\);$/);
    if (st) {
      stencil = Function(...names, `return (dcSnowStencil(${expr(st[1])}));`)(...vals);
      continue;
    }
    const ps = line.match(/^float pathSnow\s*=\s*dcSnowStencil\(([\s\S]+)\);$/);
    if (ps) {
      pathSnow = Function(...names, `return (dcSnowStencil(${expr(ps[1])}));`)(...vals);
      continue;
    }
    const m = line.match(/^float\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+);$/);
    if (m) {
      const value = Function(...names, `return (${expr(m[2])});`)(...vals);
      env[m[1]] = value;
      names.push(m[1]);
      vals.push(value);
      continue;
    }
    const a = line.match(/^snowCover\s*=\s*([\s\S]+);$/);
    if (a) {
      cover = Function(...names, `return (${expr(a[1])});`)(...vals);
      // The stencil line below reads snowCover, so it must be in scope.
      env.snowCover = cover;
      names.push("snowCover");
      vals.push(cover);
      continue;
    }
  }
  return { cover, stencil, pathSnow };
}

/** One pixel of one surface: { cover, stencil, pathSnow }. */

/**
 * One pixel of one surface. `normalY` is the world-space up component of the
 * surface normal (1 = flat ground, 0 = a wall), `worn` is the published trail
 * weight from terrain.ts.
 */
export function sampleSurface(block, { x = 0, y = 0, z = 0, normalY = 1, worn = 0, iceAge = 1 }) {
  return evalBlock(block, {
    uIceAge: iceAge,
    snowUp: Math.max(normalY, 0),
    vDcWorldPos: V3(x, y, z),
    vDcWorldNormal: V3(0, normalY, 0),
    vDcWorn: worn,
  });
}

/** The block for one surface, compiled once and sampled many times. */
export function surfaceBlock(surface, options = {}) {
  const material = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });
  const winter = createWinter("medium");
  winter.register(material, surface);
  const { block, shader } = winterBlock(material, options);
  return { block, shader, material, winter };
}

export function stats(list, key) {
  const v = list.map((s) => s[key]).sort((a, b) => a - b);
  const n = v.length;
  const at = (f) => v[Math.min(n - 1, Math.floor(n * f))];
  return {
    min: v[0],
    p10: at(0.1),
    median: at(0.5),
    p90: at(0.9),
    max: v[n - 1],
    mean: v.reduce((a, b) => a + b, 0) / n,
    // Fraction of pixels the stencil actually puts snow on. This is the number
    // that has to track intended coverage: 0.35 must mean 0.35 of the pixels.
    fraction: v.filter((t) => t > 0.5).length / n,
  };
}

/** A flat sweep of one surface over a square patch of ground. */
export function sweep(block, { y = 0.5, size = 60, span = 40, normalY = 1, worn = 0, iceAge = 1 } = {}) {
  const out = [];
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) {
      out.push(sampleSurface(block, { x: -span + i * 1.7, y, z: -span + j * 1.7, normalY, worn, iceAge }));
    }
  }
  return out;
}

export { THREE, createWinter, winterDaylight, WINTER_SURFACES, SURFACE_RULES, daylightAt, pathWeight };
