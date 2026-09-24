// tests/nature3dHillGrassContract.test.mjs
//
// Contract tests for THE HILL COVER — grass on every hill, stone and pahad.
//
// The owner's brief ("sanctuary ke andar jitne bhi hills aur stones aur
// pahadiya hai sabhi per ya ghas likhna chahiye") has four halves, and every
// one of them can regress silently:
//
//   • the cover REACHES — clumps are scattered out to WORLD_REACH, not to the
//     meadow's own 145–420 m grass radius, so no pahad is left bare;
//   • the cover is BUDGETED — a per-tier count exists and the field is
//     instanced, alpha-tested and statically scattered (no per-frame JS);
//   • the cover follows the REFERENCE FILE the owner uploaded —
//     `pahadon ke upar gras replace hill.blend`: its three family shares, its
//     off-vertical tilt (never surface-normal aligned), its rooting rule, and
//     its "no slope veto" behaviour;
//   • the cover is DRESSED ON THE STONES TOO — the rock kit publishes
//     up-facing anchors and the tuft field plants real clumps on them.
//
// Pure source-shape tests, in the same `node --test` pass as the rest.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const HILL = read("src/nature3d/engine/hillGrass.ts");
const QUALITY = read("src/nature3d/engine/quality.ts");
const SCENE = read("src/nature3d/engine/scene.ts");
const ROCKS = read("src/nature3d/engine/rocks.ts");
const TUFTS = read("src/nature3d/engine/grassTufts.ts");
const TERRAIN = read("src/nature3d/engine/terrain.ts");
const ENVIRONMENT = read("src/nature3d/engine/environment.ts");
const REGIONS = read("src/nature3d/engine/regions.ts");

/** Comment-stripped view, for the mechanism checks (the prose explains the
 *  measurement and would otherwise match the strings under test). */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. The reference file ──────────────────────────────────────────────

test("the reference .blend the recipe was measured from is in the repo", () => {
  const blob = readFileSync(new URL("../pahadon ke upar gras replace hill.blend", import.meta.url));
  assert.ok(blob.length > 1024 * 1024, "the reference file is missing or truncated");
  // A Blender file is compressed with zstd and carries the BLENDER magic in
  // its uncompressed header — check the parts that survive compression.
  assert.ok(blob.includes("BLENDER") || blob[0] === 0x28, "not a .blend container");
});

test("the measured recipe is published with the file's own numbers", () => {
  // 5 000 clumps over the 2 m × 2 m plot, relief 0.543 m, and the three
  // family counts as shares: 1666 / 2334 / 1000 of 5000.
  assert.match(HILL, /clumps: 5000/);
  assert.match(HILL, /plotMetres: 2/);
  assert.match(HILL, /plotRelief: 0\.543/);
  assert.match(HILL, /clumpsPerSquareMetre: 1250/);
  assert.match(HILL, /share: 0\.333/);
  assert.match(HILL, /share: 0\.467/);
  assert.match(HILL, /share: 0\.200\b/);
  // Every family carries the measured tilt cap: 32° for the two grasses, 18°
  // for the daisy.
  assert.match(HILL, /tiltDeg: 32/);
  assert.match(HILL, /tiltDeg: 18/);
  // The file has NO animation to port — that is a finding, not a gap, and it
  // is pinned so nobody "restores" a non-existent animation later.
  assert.match(HILL, /animated: false/);
  assert.match(HILL, /NO ANIMATION|no actions|STATIC/i);
});

// ── 2. It reaches the whole world ──────────────────────────────────────

test("the cover is scattered out to WORLD_REACH, not to the meadow radius", () => {
  assert.match(HILL, /import \{[^}]*WORLD_REACH[^}]*\} from "\.\/regions"/);
  assert.match(HILL, /const reach = WORLD_REACH/);
  // It must START where the meadow's own field fades, or the two fields leave
  // a bare ring between them.
  assert.match(HILL, /budget\.grassFarRadius \* 0\.92/);
  // Three belts, all three reachable from the tier budgets.
  assert.match(HILL, /belt 1|hillGrassNear/);
  assert.match(HILL, /budget\.hillGrassNear/);
  assert.match(HILL, /budget\.hillGrassFar/);
  assert.match(HILL, /budget\.hillGrassHaze/);
});

test("every tier budgets the cover, and the budgets climb with the tier", () => {
  const near = [...QUALITY.matchAll(/hillGrassNear: (\d+)/g)].map((m) => Number(m[1]));
  const far = [...QUALITY.matchAll(/hillGrassFar: (\d+)/g)].map((m) => Number(m[1]));
  const haze = [...QUALITY.matchAll(/hillGrassHaze: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(near.length, 4, "every tier needs a hill-cover near budget");
  assert.equal(far.length, 4);
  assert.equal(haze.length, 4);
  for (let i = 1; i < 4; i += 1) {
    assert.ok(near[i] >= near[i - 1], "the near belt must not shrink with the tier");
    assert.ok(haze[i] >= haze[i - 1], "the horizon belt must not shrink with the tier");
  }
  // Even the phone tier has to be able to dress a pahad.
  assert.ok(near[0] >= 4000, "the low tier's near belt is too thin to read as cover");
});

test("the belts size clumps by the DISTRICT they stand in, not by the origin", () => {
  assert.match(HILL, /REGIONS/);
  assert.match(HILL, /function districtDistance/);
  assert.match(strip(HILL), /bandFor\(fromHome/);
});

// ── 3. How it is drawn and animated ────────────────────────────────────

test("the cover is instanced, alpha-tested and statically scattered", () => {
  assert.match(HILL, /InstancedMesh/);
  assert.match(HILL, /alphaTest/);
  assert.match(HILL, /setUsage\(THREE\.StaticDrawUsage\)/);
  // alpha TEST, never alpha blend: a blended 1 km grass mat is the classic
  // overdraw disaster on a tile GPU.
  assert.ok(!/transparent:\s*true/.test(strip(HILL)), "the hill cover must not alpha-blend");
  // Budgets are per tier; the scatter never runs per frame.
  assert.ok(!/function update\(/.test(HILL), "the update API must stay a method, not a free function");
});

test("the wind is one uniform, and the far belts compile it out", () => {
  // The sway is a vertex-shader injection with the grass idiom's uniforms.
  assert.match(HILL, /onBeforeCompile/);
  assert.match(HILL, /uTime/);
  assert.match(HILL, /uWind/);
  // Only the near belt sways; belts 2 and 3 share a program with no wind ALU.
  assert.match(HILL, /if \(sway\) material\.onBeforeCompile/);
  assert.match(HILL, /dc-hill-grass-still/);
  assert.match(HILL, /dc-hill-grass-sway/);
  // The distance fade is present: past ~450 m the sway would only shimmer.
  assert.match(HILL, /smoothstep\(260\.0, 450\.0/);
});

test("the scatter is deterministic, and the frame loop never allocates", () => {
  assert.match(HILL, /mulberry32/);
  assert.match(HILL, /setShed\(level\)/);
  assert.match(HILL, /dispose\(\)/);
  // The update path writes uniforms only.
  assert.match(HILL, /shader\.uniforms\.uTime\.value = time/);
});

test("the scene creates, registers, updates, sheds and disposes the cover", () => {
  assert.match(SCENE, /createHillGrassField\(this\.textures\.grassBlade, this\.budget\)/);
  assert.match(SCENE, /this\.scene\.add\(this\.hillGrass\.group\)/);
  assert.match(SCENE, /hillGrass\.materials\.forEach\(\(m\) => this\.atmosphere\.register\(m, this\.foliageOpts\)\)/);
  assert.match(SCENE, /hillGrass\.materials\.forEach\(\(m\) => this\.winter\.register\(m, "foliage"\)\)/);
  assert.match(SCENE, /this\.hillGrass\.update\(time, this\.wind\)/);
  assert.match(SCENE, /this\.hillGrass\.setShed\(this\.shedLevel\)/);
  assert.match(SCENE, /this\.hillGrass\.dispose\(\)/);
});

// ── 4. Grass ON the stones ─────────────────────────────────────────────

test("the rock kit publishes up-facing grass anchors per boulder", () => {
  assert.match(ROCKS, /grassPoints: Float32Array/);
  assert.match(ROCKS, /function pushStoneAnchors/);
  // The probe must read the INSTANCED geometry (position + normal under the
  // instance matrix), because the masters are sheared and tilted.
  assert.match(ROCKS, /getNormalMatrix\(matrix\)/);
  assert.match(ROCKS, /STONE_N\.y < 0\.45/);
  // Buried facets are refused — nothing grows at the contact line.
  assert.match(ROCKS, /lift < 0\.06/);
  assert.match(ROCKS, /grassPoints: new Float32Array\(stoneGrass\)/);
});

test("the tuft field plants real clumps on those anchors, without breaking the meadow", () => {
  assert.match(TUFTS, /function plantOnStones/);
  assert.match(SCENE, /createGrassTuftField\(this\.budget, aniso, this\.rocks\.grassPoints\)/);
  // The stone crop is capped relative to the near ring, spread across the
  // district, and owns the FRONT slots so the fail-safe trims the meadow first.
  assert.match(TUFTS, /stoneBudget = stoneAnchors > 0 \? Math\.max\(variants\.length, Math\.round\(nearCount \* 0\.2\)\) : 0/);
  assert.match(TUFTS, /const stride = Math\.max\(1, Math\.ceil\(\(anchors \* 1\.5\) \/ budget\)\)/);
  assert.match(TUFTS, /const planted = plantOnStones\(nearMeshes, variants\.length, stonePoints, stoneBudget\)/);
  assert.match(TUFTS, /Math\.max\(stonePerVariant, Math\.floor\(fullNear\[i\] \* 0\.5\)\)/);
  // The ring scatter continues past the stone slots instead of overwriting them.
  assert.match(TUFTS, /let placed = startPlaced;/);
  assert.match(TUFTS, /while \(placed < startPlaced \+ total/);
});

// ── 5. The rules the brief is actually about ───────────────────────────

test("the hill cover has no 30-degree slope veto — that is what left the pahads bare", () => {
  const body = strip(HILL);
  assert.ok(!/slopeDeg > 30\) return false/.test(body), "the meadow's old slope veto is back");
  assert.ok(!/slope > 30/.test(body), "the meadow's old slope veto is back");
  // Full cover to 34°, thinning to a quarter on a cliff.
  assert.match(body, /slopeDeg > 34/);
  assert.match(body, /Math\.min\(slopeDeg, 60\) - 34\) \/ 26/);
  assert.match(body, /0\.22 \+ 0\.78/);
});

test("the tilt is off the surface normal, with the measured caps — never combed", () => {
  const body = strip(HILL);
  // Aligned to the slope, THEN a random-azimuth tilt inside the family's cap.
  assert.match(body, /qAlign\.setFromUnitVectors\(UP, normal\)/);
  assert.match(body, /recipe\.tiltDeg \* Math\.PI\) \/ 180/);
  assert.match(body, /qTilt\.setFromAxisAngle\(axis, tilt\)/);
  // Yaw is a full 2π, uniform.
  assert.match(body, /qYaw\.setFromAxisAngle\(UP, rand\(\) \* Math\.PI \* 2\)/);
  // Rooting: on the surface, sunk a centimetre (the file's +2.4 mm mean with a
  // margin for a clump whose base card is wider than the reference's blades).
  assert.match(body, /rootOffset\.mean - 0\.02/);
});

test("the hills' ground colour and altitude bands obey the same turf rule", () => {
  assert.match(ENVIRONMENT, /export function hillTurf\(h: number, normalY: number, coastal: number\): number/);
  assert.match(ENVIRONMENT, /smoothstep\(2\.5, 14, h\)/);
  assert.match(ENVIRONMENT, /smoothstep\(0\.55, 0\.8, normalY\)/);
  // The ground rule holds its earth tint back on a hill…
  assert.match(ENVIRONMENT, /dryCover\(x, z, h, wet\) \* \(1 - 0\.74 \* hillTurf\(h, normalY, coast\)\)/);
  // …and the terrain's altitude bands scale by it, so the rock band and the
  // crest keep the cliffs and give the grassable slopes back to the grass.
  assert.match(TERRAIN, /if \(h > 18\) tmp\.lerp\(rock, Math\.min\(1, \(h - 18\) \/ 30\) \* \(1 - 0\.62 \* turf\)\)/);
  assert.match(TERRAIN, /1 - 0\.55 \* turf/);
  // The surviving band literals the rest of the engine reads stay pinned.
  assert.match(TERRAIN, /if \(h > 18\) tmp\.lerp\(rock/);
  assert.match(TERRAIN, /if \(h > 52\) tmp\.lerp\(snow/);
});

test("the two districts' names still drive the belts", () => {
  assert.match(REGIONS, /TREK: Region = \{ id: "trek", centerX: -700/);
  assert.match(REGIONS, /export const WORLD_REACH = 1180/);
});
