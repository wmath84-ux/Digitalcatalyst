// tests/nature3dGroundPhotoContract.test.mjs
//
// Contract tests for the ground photo — the aerial farmland scan extracted
// from `field_and_garden.glb` (the owner: "jitna bada field hai use pure
// field per yah texture failao" — spread this texture over the whole field).
//
// The brief is two-fold, and both halves regress silently:
//
//   • the WHOLE world wears the photo — every terrain shell, meadow to the
//     2.7 km horizon, at one texels-per-metre (the shells bake their own UV
//     scale from `GROUND_TILE_METRES`, so the tile constant IS the spread);
//   • the first frame is never naked — the procedural grit stays as the
//     instant placeholder and the permanent fallback, and the photo swaps
//     into the LIVE texture without touching colour space, wrap or UVs.
//
// Pure source-shape tests, in the same `node --test` pass as the rest.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));

const TEXTURES = read("src/nature3d/engine/textures.ts");
const PALETTE = read("src/nature3d/engine/palette.ts");
const TERRAIN = read("src/nature3d/engine/terrain.ts");
const SCENE = read("src/nature3d/engine/scene.ts");
// Comment-stripped view for mechanism checks — the comments DOCUMENT the GLB
// the asset came from, and matching prose would fail them for the wrong reason.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. The asset ───────────────────────────────────────────────────────

test("the farmland scan ships as a square JPEG in public/", () => {
  const path = "public/sanctuary/ground_field.jpg";
  assert.ok(exists(path), `${path} is missing from the repo`);
  const buf = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.ok(buf[0] === 0xff && buf[1] === 0xd8, "not a JPEG");
  // Power-of-two sides, or mipmap generation on some GPUs degrades to linear.
  let w = 0;
  let h = 0;
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      h = buf.readUInt16BE(i + 5);
      w = buf.readUInt16BE(i + 7);
      break;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  assert.equal(w, 2048, "width");
  assert.equal(h, 2048, "height");
});

test("the GLB is never loaded at runtime — the extracted JPEG is the asset", () => {
  const runtime = ["src/nature3d/engine/textures.ts", "src/nature3d/engine/scene.ts", "src/nature3d/engine/terrain.ts"]
    .map((p) => strip(read(p)))
    .join("\n");
  assert.doesNotMatch(runtime, /field_and_garden\.(glb|gltf)/i, "no field GLB may be fetched");
  assert.match(runtime, /ground_field\.jpg/, "the extracted JPEG is the runtime asset");
});

// ── 2. The spread over the whole distance ─────────────────────────────

test("the tile constant carries the photo across every shell at field scale", () => {
  assert.match(PALETTE, /export const GROUND_TILE_METRES = 34/, "field-scale tile (was 6 m grit)");
  // The shells must still derive their own tile count from the constant —
  // a shared repeat would stretch the far world and undo the spread.
  assert.match(TERRAIN, /const tiles = size \/ TILE_METRES/, "per-shell texel density");
});

test("the macro-variation fetch follows the new tile scale", () => {
  assert.match(TERRAIN, /texture2D\( map, vMapUv \* 0\.25 \)/, "macro fetch rescaled for the 34 m tile");
  assert.doesNotMatch(TERRAIN, /vMapUv \* 0\.0625/, "the 6 m-tile macro scale is gone");
});

// ── 3. The live swap, never a naked frame ─────────────────────────────

test("the photo swaps into the live texture with the procedural grit as fallback", () => {
  const code = TEXTURES.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /export function patchGroundPhoto\(/, "the patcher is exported");
  assert.match(code, /export const GROUND_PHOTO_URL/, "the URL lives beside the texture set");
  assert.match(code, /tex\.image = /, "an image swap on the LIVE texture, not a second material");
  assert.match(code, /tex\.needsUpdate = true/, "three is told to re-upload");
  assert.match(code, /keeping the procedural grit/, "a failed load degrades to the canvas, not to black");
  assert.match(code, /maxSide/, "low-tier devices get a downsized copy");
});

test("the scene wires the patch right where the texture set is born", () => {
  const code = SCENE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /patchGroundPhoto\(this\.textures\.ground, GROUND_PHOTO_URL/, "wired at creation");
  assert.match(code, /this\.budget\.cheapPlants \? 1024 : 2048/, "the budget decides the resolution");
});
