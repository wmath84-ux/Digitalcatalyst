// tests/nature3dHillGrassContract.test.mjs
//
// Contract tests for the owner's directive:
//
//   "Sanctuary ki andar jitne bhi hills aur stones aur pahadiya hai sabhi
//    per ghas ... 360 degree all around har jagah dense grass dikhna chahie"
//
// The reference design is the blend scene uploaded to the repo root —
// `pahadon ke upar gras replace hill.blend` — a terrain plane covered by a
// dense, WORLD-WIDE scatter of grass clumps (Grass_Basic_A/D spring-summer
// instances on every part of the ground, ~5 000 of them, in every
// direction). The engine implements it as:
//
//   • `hillGrass.ts` — one InstancedMesh sowing clumps over a FULL CIRCLE
//     from the meadow to the island edge, on every slope, aligned to the
//     surface normal, with the meadow's own wind animation;
//   • the terrain's altitude bands re-graded from bare rock/snow to GRASS
//     bands, so every hill wears the sward in its ground colour too;
//   • a budget line in every quality tier, wired into the scene's build,
//     thermal shed ladder, frame tick and dispose.
//
// Pure source-shape tests — no DOM, no WebGL — in the same `node --test`
// pass as the rest of the suite.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));

const HILL = read("src/nature3d/engine/hillGrass.ts");
const QUALITY = read("src/nature3d/engine/quality.ts");
const SCENE = read("src/nature3d/engine/scene.ts");
const TERRAIN = read("src/nature3d/engine/terrain.ts");
const ENV = read("src/nature3d/engine/environment.ts");

// ── 1. The field itself ───────────────────────────────────────────────

test("the hill sward is one instanced draw call on the shared height field", () => {
  assert.ok(exists("src/nature3d/engine/hillGrass.ts"), "hillGrass.ts is missing");
  assert.match(HILL, /new THREE\.InstancedMesh\(geo, material, count\)/);
  assert.match(HILL, /terrainHeight\(x, z\)/, "clumps must sit on the shared terrain");
  // One geometry, one material, one mesh: the whole mountain sward is a
  // single draw call.
  assert.equal(HILL.match(/new THREE\.MeshLambertMaterial/g).length, 1);
});

test("the sward wears the meadow's proven material recipe — never black", () => {
  // The owner reported the first solid-card version rendered BLACK. The
  // meadow's blade field is the engine's known-green reference, so the hill
  // sward must use the SAME recipe: the engine's blade texture as map,
  // alphaTest (no sorting/overdraw), DoubleSide, instance tints via
  // setColorAt — and NO vertexColors on a geometry with no colour attribute.
  assert.match(HILL, /map: bladeTex/);
  assert.match(HILL, /alphaTest: 0\.5/);
  assert.match(HILL, /side: THREE\.DoubleSide/);
  assert.match(HILL, /mesh\.setColorAt\(placed, color\)/);
  // (checked on the comment-stripped source — the file DOCUMENTS why the
  // flag must stay off)
  const HILL_CODE = HILL.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/vertexColors:\s*true/.test(HILL_CODE), "no vertexColors on an attribute-less geometry");
  // And the green is the meadow's own natural-grass recipe: hue 0.30 base.
  assert.match(HILL, /const hue = 0\.3 \+ hsl\.l \* 0\.02/);
  // Scene hands the field the same blade texture the meadow wears.
  assert.match(SCENE, /createHillGrassField\(this\.textures\.grassBlade, this\.budget, this\.rocks\.skirtPoints\)/);
});

test("the sward covers a full 360° circle from the meadow to the island edge", () => {
  // Full-circle azimuth sampling — every bearing, no sector skipped.
  assert.match(HILL, /Math\.random\(\) \* Math\.PI \* 2/);
  // Area-uniform annulus sampling, so density does not clump at the centre.
  assert.match(HILL, /Math\.sqrt\(inner2 \+ Math\.random\(\) \* \(outer2 - inner2\)\)/);
  // The ring really spans the world: the hills sit 300–900 m out, the
  // 100 m arc to ~1 120 m, and the sward must ride the rim itself.
  const out = Number(/const HILL_GRASS_OUT = (\d+)/.exec(HILL)[1]);
  const inn = Number(/const HILL_GRASS_IN = (\d+)/.exec(HILL)[1]);
  assert.ok(out >= 1100, `coverage stops at ${out} m — the far hills go bare`);
  assert.ok(inn <= 40, `coverage starts at ${inn} m — a bald ring around the meadow`);
});

test("grass climbs every slope: clumps align to the surface normal", () => {
  // The card's up axis follows the terrain normal — the blend reference
  // keeps its scatter flush with the plane on every hill.
  assert.match(HILL, /dummy\.quaternion\.setFromUnitVectors\(UP, NORMAL\)/);
  assert.match(HILL, /NORMAL\.set\(-hx \/ e, 1, -hz \/ e\)\.normalize\(\)/);
  // No altitude veto anywhere: the old rock band / snowline must NOT stop
  // the sward short of the crests.
  assert.ok(!/h > 18/.test(HILL), "an altitude veto re-bares the high slopes");
  assert.ok(!/h > 52/.test(HILL), "a crest veto re-bares the peaks");
  // The only physical refusals remain: water, the pad, the sea floor, the
  // beach and near-vertical cliffs.
  assert.match(HILL, /insideRiver\(x, z\)/);
  assert.match(HILL, /insideWarehouse\(x, z/);
  assert.match(HILL, /OCEAN_LEVEL \+ 0\.45/);
});

test("stones wear grass too — every boulder gets a skirt AND a top crop", () => {
  // Skirts: the world-wide sward rings every boulder's base.
  assert.match(HILL, /skirtPoints/);
  assert.match(SCENE, /createHillGrassField\(this\.textures\.grassBlade, this\.budget, this\.rocks\.skirtPoints\)/);
  // Tops: the rock kit probes each boulder's own geometry for up-facing
  // facets and the real 3-D tuft field plants clumps on them ("stones pe
  // bhi grass" done with real geometry where it is still worth triangles).
  const ROCKS = read("src/nature3d/engine/rocks.ts");
  const TUFTS = read("src/nature3d/engine/grassTufts.ts");
  assert.match(ROCKS, /grassPoints: Float32Array/);
  assert.match(TUFTS, /stonePoints\?: Float32Array/);
  assert.match(TUFTS, /function plantOnStones\(/);
  assert.match(SCENE, /createGrassTuftField\(this\.budget, aniso, this\.rocks\.grassPoints\)/);
});

test("the wind animation rides the vertex shader, like the meadow's", () => {
  assert.match(HILL, /onBeforeCompile/, "wind must be a shader effect, not a JS loop");
  assert.match(HILL, /uniform float uTime/);
  assert.match(HILL, /uniform float uWind/);
  assert.match(HILL, /smoothstep\(70\.0, 240\.0, -dcView\.z\)/, "far motion fades out, never shimmers");
});

test("distant hills stay solid green — cards grow with distance", () => {
  // Size LOD: the far rim grows the cards instead of multiplying instances.
  assert.match(HILL, /grow \* 4\.2/); // height ramp
  assert.match(HILL, /grow \* 12/); // width ramp
  assert.match(HILL, /farBoost/, "weak devices grow bigger cards, not more instances");
});

// ── 2. The budget, in every tier ──────────────────────────────────────

test("every quality tier budgets the world-wide sward", () => {
  const counts = [...QUALITY.matchAll(/hillGrass: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(counts.length, 4, "all four tiers need a hillGrass budget");
  assert.ok(Math.min(...counts) >= 25000, "even the low tier must keep the hills dense");
  assert.ok(counts[3] >= counts[0], "the budget must not shrink towards ultra");
});

// ── 3. The ground colour: grass mountains, not rock or snow ───────────

test("the altitude bands grade GRASS, never bare rock or snow", () => {
  // The two band lines stay (the sanctuary contract and the props read the
  // 18 m / 52 m thresholds) — but their anchors are now grass colours.
  assert.match(TERRAIN, /if \(h > 18\) tmp\.lerp\(rock/);
  assert.match(TERRAIN, /if \(h > 52\) tmp\.lerp\(snow/);
  assert.match(TERRAIN, /const rock = new THREE\.Color\(0x8a9a4b\)/, "upland band must be pasture grass");
  assert.match(TERRAIN, /const snow = new THREE\.Color\(0xc9d68a\)/, "crest band must be pale grass");
  // And the blends are capped so green stays the majority at every height.
  assert.match(TERRAIN, /Math\.min\(0\.52, \(h - 18\) \/ 30\)/);
  assert.match(TERRAIN, /shelf \* 0\.5\)/);
  assert.ok(!/0xf4efe0/.test(TERRAIN), "the old snow-white crest is back");
});

test("steep faces keep their grass instead of flashing bare rock", () => {
  // The slope blend is held back to a minority mix — stone UNDER the sward.
  assert.match(ENV, /out\.lerp\(palette\.rock, steep \* 0\.38\)/);
  assert.ok(!/steep \* 0\.92/.test(ENV), "the full rock takeover is back");
});

// ── 4. Scene wiring: build, shed, animate, dispose ────────────────────

test("the scene builds, sheds, animates and disposes the hill sward", () => {
  assert.match(SCENE, /import \{ createHillGrassField, type HillGrassField \} from "\.\/hillGrass"/);
  assert.match(SCENE, /private hillGrass: HillGrassField/);
  assert.match(SCENE, /this\.hillGrass = createHillGrassField\(/);
  assert.match(SCENE, /this\.scene\.add\(this\.hillGrass\.group\)/);
  // Foliage everywhere: atmosphere glow + winter registration.
  assert.match(SCENE, /this\.hillGrass\.materials\.forEach\(\(m\) => this\.atmosphere\.register\(m, this\.foliageOpts\)\)/);
  assert.match(SCENE, /this\.hillGrass\.materials\.forEach\(\(m\) => this\.winter\.register\(m, "foliage"\)\)/);
  // Thermal fail-safe and the frame tick.
  assert.match(SCENE, /this\.hillGrass\.setShed\(this\.shedLevel\)/);
  assert.match(SCENE, /this\.hillGrass\.update\(time, this\.wind\)/);
  assert.match(SCENE, /this\.hillGrass\.dispose\(\)/);
});

// ── 5. The reference design ships with the repo ───────────────────────

test("the owner's reference blend stays in the repo root", () => {
  assert.ok(
    exists("pahadon ke upar gras replace hill.blend"),
    "the uploaded reference scene must remain available",
  );
});
