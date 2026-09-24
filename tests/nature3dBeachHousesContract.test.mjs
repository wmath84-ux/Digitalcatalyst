// tests/nature3dBeachHousesContract.test.mjs
//
// Contract tests for THE BEACH-HOUSE DISTRICT — the owner's uploaded
// `Beach+House_Pack+JSGraphics_CGTrader.blend`, standing six times across the
// sanctuary's fields.
//
// The brief: "field bahut badi hai sanctuary ke andar fields per panch se
// chhah alag alag jagahon per door-door yah house add karo … koi bhi glitch
// ya problem nahin aani chahiye". Both halves of that are testable source
// shape, and both halves are the kind that silently regress:
//
//   • SIX houses, spread far apart, on the FIELDS — not on the beach, not in
//     the river, not stacked on the villa, not all in one corner;
//   • every one of them sits on LEVEL ground (the pad), because a building
//     perched on a slope is the single most obvious "pasted asset" tell;
//   • nothing is allowed to grow through the walls (the same veto every other
//     prop kit already carries);
//   • the asset ships OFFLINE (in `public/`), has a provenance record, and is
//     loaded fail-soft so a dropped download cannot break the sanctuary;
//   • the pads are solved BEFORE the first scatter pass, or the grass would
//     describe a world that never exists;
//   • the district costs a handful of draw calls.
//
// Pure source-shape tests — no DOM, no WebGL — so they run in the same
// `node --test` pass as the rest of the suite. The runtime behaviour (the
// solved sites, the flattening, the vetoes) is asserted against the real
// engine by `scripts/verify-nature3d-world.mts`.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));
const size = (p) => statSync(new URL(p, ROOT)).size;

/** Comment-stripped view: prose must never satisfy a code assertion. */
const code = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");

const HOUSES = read("src/nature3d/engine/beachHouses.ts");
const SITE = read("src/nature3d/engine/beachHouseSite.ts");
const SCENE = read("src/nature3d/engine/scene.ts");
const TERRAIN = read("src/nature3d/engine/terrain.ts");
const ENVIRONMENT = read("src/nature3d/engine/environment.ts");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const HOUSE_CODE = code(HOUSES);
const SITE_CODE = code(SITE);

const GLB = "public/sanctuary/models/beach_house.glb";

test("houses: the model ships offline, with provenance", () => {
  assert.ok(exists(GLB), "the glTF must be in public/ (the sanctuary is offline-first)");
  // A real building, not a placeholder: the authored house is 22 410 tris.
  assert.ok(size(GLB) > 500_000, `model looks empty (${size(GLB)} bytes)`);
  assert.ok(exists("scripts/blend/extract-beach-house.py"), "the offline bake script is committed for traceability");
  const extract = read("scripts/blend/extract-beach-house.py");
  assert.match(extract, /Beach\+House_Pack\+JSGraphics_CGTrader\.blend/, "the source .blend is named");
  assert.match(extract, /CD_MLOOPUV/, "UV layers are read from the DNA");
  assert.match(extract, /mn\[1\] \+ mx\[1\]/, "the depth centre comes off Blender's Y");
  assert.match(extract, /floor = mn\[2\]/, "the floor comes off Blender's Z");
});

test("houses: six placements, solved — never hand-typed", () => {
  assert.match(HOUSE_CODE, /export const BEACH_HOUSE_COUNT = 6;/);
  assert.match(HOUSE_CODE, /function pickSites\(\)/);
  assert.match(HOUSE_CODE, /function acceptsSite\(/);
  assert.match(HOUSE_CODE, /mulberry32\(/);
  // The solve runs against the real height field, so the pads and the mesh
  // can never disagree.
  assert.match(HOUSE_CODE, /terrainHeight\(x, z\)/);
  assert.match(HOUSE_CODE, /padRelief\(/);
  assert.match(HOUSE_CODE, /MIN_SEPARATION/);
});

test("houses: the gates that keep them on the fields", () => {
  // On the fields: inside the meadow band, off the beach, off the foothills.
  assert.match(HOUSE_CODE, /const R_MIN = 130;/);
  assert.match(HOUSE_CODE, /const R_MAX = 520;/);
  assert.match(HOUSE_CODE, /const ALT_MIN = /);
  assert.match(HOUSE_CODE, /const ALT_MAX = /);
  // Off the river gorge, the worn trails, the villa's apron and the lesson hill.
  assert.match(HOUSE_CODE, /RIVER_CLEAR/);
  assert.match(HOUSE_CODE, /pathWeight\(x, z\) > TRAIL_CLEAR/);
  assert.match(HOUSE_CODE, /insideWarehouse\(x, z, VILLA_CLEAR\)/);
  assert.match(HOUSE_CODE, /LESSON_HILL_CLEAR/);
  // Flat enough to sit on.
  assert.match(HOUSE_CODE, /RELIEF_MAX/);
});

test("houses: the pads exist BEFORE the world is built", () => {
  // `scene.ts` must install the sites before the terrain mesh, the grass and
  // the tropical field read `terrainHeight` — otherwise the scatter would
  // describe a world that never exists (grass standing in a floor).
  const install = SCENE.indexOf("ensureBeachHouseSites();");
  const terrainBuild = SCENE.indexOf("buildTerrain(this.budget, this.textures.ground)");
  const grass = SCENE.indexOf("createGrassField(");
  const tropical = SCENE.indexOf("createTropicalField(");
  assert.ok(install > 0, "scene.ts installs the sites");
  assert.ok(install < terrainBuild, "…before the ground mesh");
  assert.ok(install < grass, "…before the grass");
  assert.ok(install < tropical, "…before the tropical field");
});

test("houses: the ground is levelled, and released again", () => {
  // terrainHeight must route through the pad on EVERY path out of the
  // function — the two early returns and the final one.
  const calls = TERRAIN.match(/levelBeachHouseGround\(/g) ?? [];
  assert.equal(calls.length, 3, `every terrainHeight exit flattens the pads (${calls.length}/3)`);
  assert.match(TERRAIN, /import \{ levelBeachHouseGround \} from "\.\/beachHouseSite";/);
  // The pad is cut DOWN to the lowest sample under the walls (never built up),
  // feathers back to natural ground, and answers instantly when installed=false.
  assert.match(SITE_CODE, /if \(!installed\) return natural;/);
  assert.match(HOUSE_CODE, /let padY = Infinity;/);
  assert.match(SITE_CODE, /const cos = Math\.cos\(s\.yaw\);/);
  assert.match(SITE_CODE, /if \(e <= 0\) return s\.padY;/);
  assert.match(SITE_CODE, /return s\.padY \+ \(natural - s\.padY\) \* t;/);
  // No imports: terrain.ts imports this file, so a cycle here would decide
  // whether the houses exist. It must stay pure maths.
  assert.equal((SITE_CODE.match(/^import /gm) ?? []).length, 0, "beachHouseSite.ts has no imports");
});

test("houses: nothing grows through a wall", () => {
  const vetoFiles = [
    "src/nature3d/engine/grass.ts",
    "src/nature3d/engine/grassTufts.ts",
    "src/nature3d/engine/hillGrass.ts",
    "src/nature3d/engine/sorrel.ts",
    "src/nature3d/engine/tropicalFlora.ts",
    "src/nature3d/engine/flora.ts",
    "src/nature3d/engine/rocks.ts",
  ];
  for (const file of vetoFiles) {
    const src = read(file);
    assert.match(src, /import \{ insideBeachHouse \} from "\.\/beachHouseSite";/, `${file} imports the veto`);
    assert.ok((src.match(/insideBeachHouse\(/g) ?? []).length >= 1, `${file} vetoes on it`);
  }
  // The house keeps grass OUT of the walls but lets it grow under the eaves:
  // the veto is measured on the WALL box, not the roof's flare.
  assert.match(SITE_CODE, /HOUSE_WALL_HALF_X = 14\.19 \/ 2;/);
  assert.match(SITE_CODE, /HOUSE_WALL_HALF_Z = 14\.04 \/ 2;/);
});

test("houses: the district is cheap and static", () => {
  assert.match(HOUSE_CODE, /new THREE\.InstancedMesh\(/);
  assert.match(HOUSE_CODE, /for \(let i = 0; i < sites\.length; i \+= 1\)/);
  assert.match(HOUSE_CODE, /StaticDrawUsage/);
  // Six instances span the sanctuary, so one bounding sphere would cull the
  // wrong half of them: the district switches the test off on purpose.
  assert.match(HOUSE_CODE, /frustumCulled = false/);
  assert.match(HOUSE_CODE, /castShadow = false/);
  // The low tier takes the plant diet rather than paying for PBR.
  assert.match(HOUSE_CODE, /budget\.cheapPlants/);
  assert.match(HOUSE_CODE, /MeshLambertMaterial/);
  // Textures: the pack ships none, so the runtime must not invent UV fetches.
  assert.match(HOUSE_CODE, /deleteAttribute\("uv"\)/);
});

test("houses: fail-soft, and torn down honestly", () => {
  assert.match(HOUSE_CODE, /new GLTFLoader\(\)\.load/);
  assert.match(HOUSE_CODE, /reject\(err instanceof Error \? err : new Error\(String\(err\)\)\)/);
  assert.match(SCENE, /createBeachHouses\(this\.budget, aniso\)/);
  assert.match(SCENE, /\.catch\(\(err\) => console\.warn\("\[sanctuary\] beach houses failed", err\)\)/);
  assert.match(SCENE, /this\.beachHouses\?\.dispose\(\);/);
  // Unloaded before the scene is cleared, and the atmosphere + winter passes
  // get the district's materials like every other solid.
  assert.match(SCENE, /this\.atmosphere\.registerTree\(district\.group\);/);
  assert.match(SCENE, /this\.winter\.registerTree\(district\.group\);/);
  assert.match(HOUSE_CODE, /materials\.push\(material\)/);
});

test("houses: the homesteads read as lived-in ground", () => {
  // The yard is fed through `pathWeight`, so the bare ground, the missing
  // grass and the packed-dirt tint all come from one number — and every
  // existing consumer inherits it for free.
  assert.match(SITE_CODE, /export function beachHouseYardWeight\(/);
  assert.match(ENVIRONMENT, /import \{ beachHouseYardWeight \} from "\.\/beachHouseSite";/);
  assert.match(ENVIRONMENT, /beachHouseYardWeight\(x, z\)/);
  assert.match(ENVIRONMENT, /w = Math\.max\(w, 0\.62 \* beachHouseYardWeight\(x, z\)\);/);
});

test("houses: reachable from the UI", () => {
  assert.match(PAGE, /\{ key: "houses", label: "Beach Houses", Icon: Trees \}/);
  assert.match(SCENE, /case "houses": \{/);
  assert.match(SCENE, /"trek" \| "world" \| "warehouse" \| "houses"/);
  assert.match(SCENE, /private focusHouseSite\(\)/);
});
