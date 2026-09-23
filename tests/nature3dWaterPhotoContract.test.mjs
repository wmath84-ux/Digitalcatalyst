// tests/nature3dWaterPhotoContract.test.mjs
//
// Contract tests for the GLB water texture — the Sketchfab
// "small flat cube of water" maps worn by EVERY water surface (the centre
// river, the ocean ring, the waterfall sheet).
//
// The owner's brief: "jahan jahan bhi water hai vahan per water texture ke
// liye yeh exactly apply karo … width der animation and shining and make
// sure no lag on low device". The pieces that keep that true:
//
//   • the three baked maps ship as assets; the GLB itself is never fetched;
//   • the caustics pattern is ANIMATED IN THE SHADER (dual-phase, uTime) —
//     zero new per-frame CPU on any tier;
//   • the SHINE is textured — the GLB's roughness map modulates the sun
//     glint instead of a uniform sparkle;
//   • the LOW tier compiles the extra layers out (one extra fetch total)
//     but keeps the caustics — the point of the directive;
//   • photos arrive async onto LIVE uniforms; the procedural water is the
//     frame-one look and the permanent fallback.
//
// Pure source-shape tests, same `node --test` pass as the rest.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TEXTURES = strip(read("src/nature3d/engine/textures.ts"));
const WATER = read("src/nature3d/engine/water.ts");
const WATER_CODE = strip(read("src/nature3d/engine/water.ts"));
const SCENE = strip(read("src/nature3d/engine/scene.ts"));

// ── 1. The assets ──────────────────────────────────────────────────────

test("the three GLB water maps ship as runtime assets", () => {
  // Caustics: greyscale JPEG (the 227 KB PNG recompressed).
  const caus = readFileSync(new URL("public/sanctuary/water_caustics.jpg", ROOT));
  assert.ok(caus[0] === 0xff && caus[1] === 0xd8, "caustics is not a JPEG");
  // Roughness: PNG — its smooth/rough signal lives in the R/G separation,
  // which JPEG chroma subsampling would average away.
  const rough = readFileSync(new URL("public/sanctuary/water_roughness.png", ROOT));
  assert.ok(rough[0] === 0x89 && rough[1] === 0x50, "roughness is not a PNG");
  assert.ok(exists("public/sanctuary/water_surface.jpg"), "the photographic surface is missing");
});

test("the GLB is never fetched at runtime", () => {
  const runtime = TEXTURES + WATER_CODE + SCENE;
  assert.doesNotMatch(runtime, /small_flat_cube_of_water/i, "no GLB fetch may appear");
  assert.match(WATER_CODE + SCENE + TEXTURES, /water_caustics\.jpg/, "the extracted maps are the runtime assets");
});

// ── 2. Every water surface wears it ───────────────────────────────────

test("river AND ocean shaders both sample the caustics, roughness and photo", () => {
  const riverBlock = WATER.slice(WATER.indexOf("riverMat.onBeforeCompile"), WATER.indexOf("const river ="));
  const oceanBlock = WATER.slice(WATER.indexOf("oceanMat.onBeforeCompile"), WATER.indexOf("const ocean ="));
  for (const [name, block] of [["river", riverBlock], ["ocean", oceanBlock]]) {
    assert.match(block, /uCaustics/, `${name}: caustics uniform`);
    assert.match(block, /uRoughTex/, `${name}: roughness uniform`);
    assert.match(block, /uEmis/, `${name}: photographic layer uniform`);
    assert.match(block, /dcCau/, `${name}: animated caustics term`);
    assert.match(block, /dcGlint/, `${name}: textured glint`);
    assert.match(block, /dcPhoto/, `${name}: photo layer`);
  }
});

test("the waterfall sheet wears the same caustics image", () => {
  assert.match(WATER_CODE, /fallTex\.image = photos\.caustics\.image/, "fall albedo swaps to the GLB caustics");
  assert.match(WATER_CODE, /flowTex\.image = photos\.caustics\.image/, "river albedo swaps to the GLB caustics");
});

// ── 3. Animation and shine cost nothing on the CPU ────────────────────

test("the water animation stays shader-side (uTime), no new CPU loops", () => {
  // The caustics scroll MUST be driven by the dual-phase uTime clocks.
  const riverBlock = WATER.slice(WATER.indexOf("riverMat.onBeforeCompile"), WATER.indexOf("const river ="));
  const oceanBlock = WATER.slice(WATER.indexOf("oceanMat.onBeforeCompile"), WATER.indexOf("const ocean ="));
  assert.match(riverBlock, /dcPhase0.*dcCau|dcCau[\s\S]*?dcMix/s, "river caustics ride the uTime phases");
  assert.match(oceanBlock, /dcPhase0/, "ocean caustics ride the uTime phases");
  // setPhotos does uniform/image swaps only — never an interval or rAF.
  const setBlock = WATER.slice(WATER.indexOf("setPhotos(photos)"), WATER.indexOf("update(dt, time, cameraPos)"));
  assert.ok(!/setInterval|requestAnimationFrame/.test(setBlock), "no timers in setPhotos");
  assert.match(setBlock, /uCaustics\.value/, "live uniform swap");
});

// ── 4. The low-device contract ────────────────────────────────────────

test("the low tier compiles the heavy layers out but keeps the caustics", () => {
  const defines = WATER_CODE.match(/if \(budget\.tier === "low"\) \(\w+Mat as THREE\.Material & \{ defines\?[^}]+\}\)\.defines = \{ DC_WATER_LOW: "" \}/g);
  assert.ok(defines && defines.length === 2, "both river and ocean carry the low-tier define");
  // Roughness + photo fetches sit behind the guard; the caustics do not.
  const riverBlock = WATER.slice(WATER.indexOf("riverMat.onBeforeCompile"), WATER.indexOf("const river ="));
  const oceanBlock = WATER.slice(WATER.indexOf("oceanMat.onBeforeCompile"), WATER.indexOf("const ocean ="));
  for (const [name, block] of [["river", riverBlock], ["ocean", oceanBlock]]) {
    const roughGuarded = block.includes("#ifndef DC_WATER_LOW\n        float dcRgh") || block.includes("#ifndef DC_WATER_LOW\n          float dcRgh");
    const photoGuarded = /#ifndef DC_WATER_LOW[\s\S]*?dcPhoto/.test(block);
    assert.ok(roughGuarded, `${name}: roughness fetch compiled out on low`);
    assert.ok(photoGuarded, `${name}: photo fetch compiled out on low`);
    assert.match(block, /float dcCau/, `${name}: caustics survive on low`);
  }
});

// ── 5. Fallback and lifetime ──────────────────────────────────────────

test("a failed photo load keeps the procedural water", () => {
  assert.match(TEXTURES, /return null/, "loadWaterPhotos resolves null on failure");
  assert.match(TEXTURES, /console\.warn/, "the failure is reported");
  assert.match(SCENE, /loadWaterPhotos\(aniso\)\.then\(\(photos\) => \{\s*if \(photos\) this\.water\.setPhotos\(photos\);\s*\}\)/, "scene wires photos only when they land");
  assert.match(WATER_CODE, /waterPhotos\.caustics\.dispose\(\)/, "water dispose frees the photos");
});
