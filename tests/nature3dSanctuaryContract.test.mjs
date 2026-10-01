// tests/nature3dSanctuaryContract.test.mjs
//
// Contract tests for the 3D Study Sanctuary (`src/nature3d/**`) and the rail
// button that opens it.
//
// The brief that produced this feature was very specific, and several of its
// requirements are the kind that silently regress in a refactor:
//
//   • the button sits in the desktop side rail, directly under Study Library,
//     and the environment opens BESIDE that rail like every other page;
//   • the class board is LANDSCAPE (16:9) and can be dragged with one finger,
//     zoomed, and can never sink below the ground or be hidden;
//   • the wildlife is a real herd — buffalo, cows, deer, sheep, goats and
//     their babies — grazing, walking and playing at a distance;
//   • the ground is dense grass that reaches the horizon;
//   • birds are PERCHED in the trees, not only circling;
//   • there is an FPP button with a joystick, and in first person the student
//     body is hidden so only a camera moves;
//   • the whole thing has to hold a frame budget on a low-end device, which
//     means instancing, LODs, merged static geometry and adaptive resolution
//     are load-bearing, not decoration.
//
// These are pure source-shape tests — no DOM, no WebGL — so they run in the
// same `node --test` pass as the rest of the suite.

import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));

const DESKTOP_SHELL = read("src/components/DesktopShell.tsx");
const MAIN = read("src/main.tsx");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SCENE = read("src/nature3d/engine/scene.ts");
const SCENE_CODE = SCENE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BOARD = read("src/nature3d/engine/board.ts");
// Comment-stripped view: several assertions below check that a mechanism is
// GONE, and the file documents what was removed and why. Matching prose would
// fail those checks for the wrong reason.
const BOARD_CODE = BOARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const GRASS = read("src/nature3d/engine/grass.ts");
const WILDLIFE = read("src/nature3d/engine/wildlife.ts");
const FLORA = read("src/nature3d/engine/flora.ts");
const TERRAIN = read("src/nature3d/engine/terrain.ts");
const QUALITY = read("src/nature3d/engine/quality.ts");
const CONTROLS = read("src/nature3d/engine/controls.ts");
const SKY = read("src/nature3d/engine/sky.ts");
const WATER = read("src/nature3d/engine/water.ts");
const CHARACTER = read("src/nature3d/engine/characterController.ts");
const CHARACTER_CONFIG = read("src/nature3d/engine/characterConfig.ts");
const CHARACTER_UI = read("src/nature3d/CharacterControls.tsx");
const JOYSTICK = CHARACTER_UI.slice(CHARACTER_UI.indexOf("function Joystick"));

// ── 1. The rail button ────────────────────────────────────────────────

test("the rail exposes a 3D Sanctuary entry directly under Study Library", () => {
  const study = DESKTOP_SHELL.indexOf('key: "study"');
  const nature = DESKTOP_SHELL.indexOf('key: "nature3d"');
  assert.ok(study > 0, "Study Library rail entry is missing");
  assert.ok(nature > study, "the 3D Sanctuary entry must come after Study Library");

  // Nothing may be inserted between them — "uske niche" means immediately below.
  const between = DESKTOP_SHELL.slice(study, nature);
  assert.equal(
    (between.match(/key: "/g) || []).length,
    1,
    "the 3D Sanctuary entry must sit immediately below Study Library",
  );

  assert.match(DESKTOP_SHELL, /hash: "#\/nature-studio"/);
  assert.match(DESKTOP_SHELL, /\| "nature3d"/, "nature3d must be a DesktopRailKey");
  assert.match(DESKTOP_SHELL, /nature3d: "#/, "the rail entry needs an accent colour");
  assert.match(
    DESKTOP_SHELL,
    /hash\.startsWith\("#\/nature-studio"\)\) return "nature3d"/,
    "the hash must resolve back to the rail key so the entry lights up",
  );
});

test("the route is registered and lazy-loaded like every other page", () => {
  assert.match(MAIN, /const NATURE_STUDIO_HASH = "#\/nature-studio";/);
  assert.match(MAIN, /lazyRoute\(\(\) => import\("\.\/nature3d\/NatureStudioPage"\)\)/);
  assert.match(
    MAIN,
    /hash\.startsWith\(NATURE_STUDIO_HASH\)\) return NatureStudioPage;/,
    "the route must be preloadable via routeChunkFor",
  );
  assert.match(MAIN, /hash\.startsWith\(NATURE_STUDIO_HASH\)\) return <NatureStudioPage \/>/);
});

test("the sanctuary takes over the whole viewport — no rail, no top bar", () => {
  // DesktopAppHost bails out of the shell for full-bleed routes. The sanctuary
  // MUST be in that list: clicking the rail button hides every other chrome
  // element and hands the entire viewport to the WebGL canvas.
  const bailout = MAIN.slice(MAIN.indexOf("Skip the shell on routes"), MAIN.indexOf("return (\n    <AppShell"));
  assert.ok(
    bailout.includes("NATURE_STUDIO_HASH"),
    "the sanctuary must opt out of the desktop shell",
  );
  // The page itself pins to the viewport instead of living in a flex column,
  // which is what previously collapsed the canvas to zero height.
  assert.match(PAGE, /<main className="fixed inset-0 z-\[90\]/);
  assert.ok(
    !/clamp\(520px/.test(PAGE),
    "the canvas host must not depend on a clamped flex height any more",
  );
  // And there is still a way back out, since the rail is gone.
  assert.match(PAGE, /exitSanctuary/);
  assert.match(PAGE, /window\.location\.hash = "#\/home"/);
});

// ── 2. The board: landscape, draggable, never under the ground ────────

test("the board is a 16:9 landscape panel", () => {
  const w = Number(/export const BOARD_WIDTH = ([\d.]+)/.exec(BOARD)[1]);
  const h = Number(/export const BOARD_HEIGHT = ([\d.]+)/.exec(BOARD)[1]);
  assert.ok(w > h, "the board must be wider than it is tall");
  const ratio = w / h;
  assert.ok(Math.abs(ratio - 16 / 9) < 0.02, `expected ~16:9, got ${ratio.toFixed(3)}`);

  // The painted texture must match the geometry's aspect or the text stretches.
  const cw = Number(/canvas\.width = (\d+)/.exec(BOARD)[1]);
  const ch = Number(/canvas\.height = (\d+)/.exec(BOARD)[1]);
  assert.ok(Math.abs(cw / ch - 16 / 9) < 0.02, "the board canvas must be 16:9 too");
});

test("grass is instanced, GPU-animated and reaches the far field", () => {
  assert.match(GRASS, /InstancedMesh/);
  assert.match(GRASS, /onBeforeCompile/, "wind must be a vertex shader effect, not a JS loop");
  assert.match(GRASS, /uniform float uTime/);
  assert.match(GRASS, /alphaTest/, "alpha test avoids the sorting + overdraw cost of blending");
  // Two LOD rings: dense near, sparse far.
  assert.match(GRASS, /grassNear/);
  assert.match(GRASS, /grassFar/);
  assert.match(GRASS, /setColorAt/, "per-blade colour variation is what stops it reading as CGI");

  // The far ring must actually be far, and the near ring dense.
  const budgets = QUALITY.slice(QUALITY.indexOf("const BASE"));
  const farRadii = [...budgets.matchAll(/grassFarRadius: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(farRadii.length === 4, "every tier needs a far-grass radius");
  assert.ok(Math.min(...farRadii) >= 50, "even the low tier must reach ~50 m of grass");
  const nearCounts = [...budgets.matchAll(/grassNear: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...nearCounts) >= 10000, "the low tier still needs a dense near field");
});

// ── 4. The herd ───────────────────────────────────────────────────────

test("the meadow is stocked with buffalo, cows and the rest of the herd", () => {
  for (const species of ["buffalo", "cow", "deer", "sheep", "goat"]) {
    assert.ok(WILDLIFE.includes(`${species}:`), `${species} is missing from SPECS`);
  }
  // Babies exist and stay near their mother.
  assert.match(WILDLIFE, /baby/);
  assert.match(WILDLIFE, /motherIndex/);
  // The behaviour machine covers eating, walking, looking up and playing.
  for (const b of ['"graze"', '"walk"', '"look"', '"play"']) {
    assert.ok(WILDLIFE.includes(b), `behaviour ${b} is missing`);
  }
  assert.match(WILDLIFE, /herds:/, "animals must be placed in herds, spread across the meadow");
});

test("wildlife cost is bounded by distance LODs and merged geometry", () => {
  assert.match(WILDLIFE, /mergeGeometries/, "animal parts must be merged into few draw calls");
  assert.match(WILDLIFE, /type Lod = "near" \| "mid" \| "far"/);
  assert.match(WILDLIFE, /class SpeciesBank/, "geometry must be shared across a species");
  // The update loop must bail out early for distant animals.
  assert.match(WILDLIFE, /if \(a\.distance > 62\) continue;/);
  assert.match(WILDLIFE, /if \(mid\) continue;/);
});

// ── 5. Birds in the trees ─────────────────────────────────────────────

test("birds are perched on real branches, not only circling", () => {
  assert.match(FLORA, /perches: THREE\.Vector3\[\]/, "the tree factory must report branch perches");
  assert.match(FLORA, /perches\.push\(/);
  assert.match(FLORA, /budget\.perchedBirds/);
  assert.match(FLORA, /budget\.flyingBirds/);
  // Perched birds idle, preen, flutter and hop.
  for (const s of ['"idle"', '"preen"', '"flutter"', '"hop"']) {
    assert.ok(FLORA.includes(s), `perched bird state ${s} is missing`);
  }
  // Every tier has birds in the trees.
  const perchCounts = [...QUALITY.matchAll(/perchedBirds: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(perchCounts.length, 4);
  assert.ok(Math.min(...perchCounts) > 0, "even the low tier must keep birds in the trees");
});

// ── 6. FPP + joystick ─────────────────────────────────────────────────

test("first person hides the playable guide, never a seated student", () => {
  assert.match(CHARACTER, /this\.bodyVisible = false/);
  assert.match(SCENE, /this\.avatar\.setVisible\(!this\.character\.enabled \|\| this\.character\.cameraRig\.bodyVisible\)/);
  assert.doesNotMatch(SCENE_CODE, /createStudent|this\.student\./);
});

test("TPP/FPP expose independent move and look sticks, with drag-look too", () => {
  assert.match(PAGE, /<CharacterControls/);
  assert.match(CHARACTER_UI, /toggleCharacterCamera/);
  assert.equal((CHARACTER_UI.match(/<Joystick/g) ?? []).length, 2);
  assert.match(CHARACTER_UI, /label="Move character"/);
  assert.match(CHARACTER_UI, /label="Look around"/);
  assert.match(SCENE, /this\.character\.rotateCamera\(dx, dy\)/);
});

test("the move stick follows camera-forward with normalized analog strafe", () => {
  assert.match(CHARACTER_UI, /setCharacterMove\(x, -y\)/);
  assert.match(CHARACTER, /wishX = cy \* this\.inputX - sy \* this\.inputY/);
  assert.match(CHARACTER, /wishZ = -sy \* this\.inputX - cy \* this\.inputY/);
  assert.match(CHARACTER, /const norm = Math\.max\(1, length\)/);
  // Numerical movement is exercised by sanctuaryCharacterRuntime.test.mjs.
});

test("the joystick stores pointer/vector data in refs, not frame React state", () => {
  assert.doesNotMatch(JOYSTICK, /useState/);
  assert.match(JOYSTICK, /useRef/);
  assert.match(JOYSTICK, /setPointerCapture/);
  assert.match(JOYSTICK, /onPointerCancel/);
  assert.match(JOYSTICK, /stageLocalDelta/);
  assert.match(SCENE, /this\.movementStick\.set\(strafe, forward\)/);
});

test("playable physics follows terrain, blocks deep water, and ignores editor keyboard targets", () => {
  assert.match(CHARACTER, /this\.world\.terrainAt/);
  assert.match(CHARACTER, /this\.world\.waterAt/);
  assert.match(CHARACTER, /water - terrain > 0\.65/);
  assert.match(CHARACTER, /this\.world\.resolve/);
  assert.match(SCENE, /this\.boardTarget\(t\)/);
  assert.match(SCENE, /tagName === "INPUT"/);
});

// ── 7. Performance contract ───────────────────────────────────────────

test("quality tiers scale the whole world, not just the resolution", () => {
  for (const tier of ["low", "medium", "high", "ultra"]) {
    assert.ok(QUALITY.includes(`${tier}: {`), `tier ${tier} is missing`);
  }
  assert.match(QUALITY, /function detectTier/);
  assert.match(QUALITY, /WEBGL_debug_renderer_info/, "the GPU string must inform the tier");
  assert.match(QUALITY, /swiftshader\|llvmpipe/, "software renderers must drop to the low tier");
  // The low tier must be genuinely cheap.
  const low = QUALITY.slice(QUALITY.indexOf("low: {"), QUALITY.indexOf("medium: {"));
  assert.match(low, /shadowMapSize: 0/, "the low tier must disable shadows");
  assert.match(low, /antialias: false/);
  assert.match(low, /richBoardMaterial: false/, "no transmission material on weak GPUs");
});

test("adaptive resolution trims pixels instead of popping content", () => {
  assert.match(QUALITY, /class AdaptiveResolution/);
  assert.match(QUALITY, /sample\(frameMs: number, now: number\)/);
  assert.match(SCENE, /this\.adaptive\.sample\(/);
  assert.match(SCENE, /this\.renderer\.setPixelRatio\(newRatio\)/);
});

test("the frame loop is allocation-free, staggered and pausable", () => {
  // Heavy systems run on their own cadence. Each one also has a slower
  // study-mode rate used while a single board is framed (Group 13) — the
  // normal rate is the second arm of that conditional.
  assert.match(SCENE, /this\.aiClock >= \(study \? 1 \/ 12 : 1 \/ 30\)/);
  assert.match(SCENE, /this\.skyClock >= \(study \? 1 \/ 8 : 1 \/ 20\)/);
  // Long stalls can never teleport the world.
  assert.match(SCENE, /Math\.min\(this\.clock\.getDelta\(\), 0\.05\)/);
  // Shadows are static and refreshed on demand only.
  assert.match(SCENE, /shadowMap\.autoUpdate = false/);
  assert.match(SCENE, /requestShadowRefresh/);
  // No `new THREE.` inside the tick — every vector is hoisted.
  const tick = SCENE.slice(SCENE.indexOf("private tick = () => {"), SCENE.indexOf("dispose() {"));
  assert.ok(!/new THREE\./.test(tick), "the frame loop must not allocate Three.js objects");
});

test("the scene parks itself when it is off-screen or the tab is hidden", () => {
  assert.match(PAGE, /IntersectionObserver/);
  assert.match(PAGE, /visibilitychange/);
  assert.match(SCENE, /setVisible\(v: boolean\)/);
  assert.match(SCENE, /if \(!this\.visible\) \{/);
});

test("everything is disposed when the page unmounts", () => {
  assert.match(SCENE, /dispose\(\) \{/);
  assert.match(SCENE, /this\.renderer\.dispose\(\)/);
  for (const sys of ["grass", "flora", "wildlife", "water", "sky", "board", "avatar", "textures"]) {
    assert.ok(
      new RegExp(`this\\.${sys}\\.dispose\\(\\)`).test(SCENE),
      `${sys} is leaked on unmount`,
    );
  }
  assert.match(PAGE, /engine\?\.dispose\(\)/);
});

test("static forest geometry is merged into a handful of draw calls", () => {
  assert.match(FLORA, /mergeGeometries/);
  assert.match(FLORA, /forest-wood/);
  assert.match(FLORA, /InstancedMesh/, "leaves, flowers, shrubs and rocks must be instanced");
});

// ── 8. Terrain is the single source of truth ──────────────────────────

test("one height field drives the mesh, the grass, the herd and the board", () => {
  assert.match(TERRAIN, /export function terrainHeight/);
  for (const consumer of [GRASS, WILDLIFE, FLORA, BOARD, CONTROLS, SCENE]) {
    assert.ok(consumer.includes("terrainHeight"), "a consumer is not sampling the shared terrain");
  }
  // Nothing may hardcode its own ground height.
  assert.match(TERRAIN, /export function insideRiver/);
});

test("the study clearing is flat and the river bed is carved", () => {
  assert.match(TERRAIN, /CLEARING_RADIUS/);
  assert.match(TERRAIN, /RIVER_CENTER_X/);
  assert.match(TERRAIN, /flatten/);
});

// ── 9. The lockfile CI actually installs from ─────────────────────────
//
// The repo declares `packageManager: pnpm@…`, and Vercel/CI run
// `pnpm install` — which defaults to `--frozen-lockfile`. Adding a dependency
// with npm updates package-lock.json but leaves pnpm-lock.yaml untouched, and
// the build then dies with ERR_PNPM_OUTDATED_LOCKFILE before a single line of
// app code runs. It is invisible locally and fatal in CI, so it gets a test.

test("every runtime dependency is present in the pnpm lockfile", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = read("pnpm-lock.yaml");

  assert.match(
    pkg.packageManager ?? "",
    /^pnpm@/,
    "this repo installs with pnpm — keep pnpm-lock.yaml authoritative",
  );

  for (const [name, range] of Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    // Scoped names are YAML-quoted in the importers block ('@scope/pkg':),
    // plain ones are not — accept either form.
    assert.ok(
      lock.includes(`\n      ${name}:\n`) || lock.includes(`\n      '${name}':\n`),
      `${name} is missing from pnpm-lock.yaml — run \`pnpm install --lockfile-only\``,
    );
    assert.ok(
      lock.includes(`specifier: ${range}`),
      `pnpm-lock.yaml has no "specifier: ${range}" entry for ${name} — the lockfile is stale`,
    );
  }
});

test("three and its types are locked for CI", () => {
  const lock = read("pnpm-lock.yaml");
  // The exact failure that broke the first deploy of this feature.
  assert.match(lock, /\n {6}three:\n/, "three is not an importer dependency in pnpm-lock.yaml");
  assert.match(lock, /\n {6}'@types\/three':\n/, "@types/three is not in pnpm-lock.yaml");
  assert.match(lock, /\n {2}three@[\d.]+:/, "three has no resolved package entry");
});

// ── 10. The kilometre world, and what does NOT move in it ─────────────

test("the world is a full kilometre across, built as LOD shells", () => {
  // The ground now has to cover the whole three-district chain, so its size
  // is derived from the chain's reach rather than hard-coded at 1000.
  assert.match(TERRAIN, /export const WORLD_SIZE = WORLD_REACH \* 2 \+ 400/);
  const reach = Number(/WORLD_REACH = (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  assert.ok(reach * 2 + 400 >= 1000, "the world must still be at least a kilometre across");
  assert.match(TERRAIN, /export const WORLD_HALF = WORLD_SIZE \/ 2/);
  // Three concentric shells, not one giant plane: detail where the camera is.
  const shells = TERRAIN.slice(TERRAIN.indexOf("const shells"), TERRAIN.indexOf("const mat ="));
  assert.match(shells, /half: 90/);
  assert.match(shells, /half: 260/);
  assert.match(shells, /half: WORLD_HALF/);
  // The camera has to be able to SEE a kilometre.
  for (const [, far] of QUALITY.matchAll(/farPlane: (\d+)/g)) {
    assert.ok(Number(far) >= 1500, `farPlane ${far} cannot show a 1 km world`);
  }
  // Walking and board placement must both use the bigger world.
  // The walk limit now spans the whole connected chain, not just the meadow.
  assert.match(CONTROLS, /const WALK_LIMIT = WORLD_REACH;/);
  // The board travels with the learner across the whole connected world.
  // (The board's own MAX_RADIUS clamp went with the deleted placement
  // controller — the board no longer moves, so it cannot leave the world.)
});

test("the distant hills are real eroded terrain, not cardboard pyramids", () => {
  assert.match(TERRAIN, /function distantRelief/);
  // Ridged noise (1 - |n|) is what gives crests and flanks instead of cones.
  assert.match(TERRAIN, /1 - Math\.abs\(a\)/);
  assert.match(TERRAIN, /distantRelief\(x, z\)/, "the height field must include the hills");
  // Altitude banding — bare rock then snow on the tops.
  assert.match(TERRAIN, /if \(h > 18\) tmp\.lerp\(rock/);
  assert.match(TERRAIN, /if \(h > 52\) tmp\.lerp\(snow/);
  // The old triangle ring in the sky is gone.
  assert.ok(!/peakCount/.test(SKY), "the fake mountain ring must be deleted");
  assert.ok(!/const ridge = new THREE\.Mesh/.test(SKY), "no cardboard ridge mesh");
});

test("only a minority of trees animate, and distance switches motion off", () => {
  // Trees carry an explicit sways flag ...
  assert.match(FLORA, /sways: boolean/);
  assert.match(FLORA, /sways: Math\.random\(\) < \(r < 70 \? 0\.55 : r < 150 \? 0\.3 : 0\.08\)/);
  // ... and the still ones use a material with NO wind shader at all.
  assert.match(FLORA, /const leafMatStill = makeLeafMaterial\(false\)/);
  assert.match(FLORA, /const leafMatSway = makeLeafMaterial\(true\)/);
  assert.match(FLORA, /group\.add\(leavesSway, leavesStill\)/);

  // Weighted over the real radius distribution, well under half the forest
  // should animate — "3 trees in 10" as asked.
  let sway = 0;
  const N = 200000;
  for (let i = 0; i < N; i += 1) {
    const r = 9 + Math.sqrt(i / N) * 430;
    sway += r < 70 ? 0.55 : r < 150 ? 0.3 : 0.08;
  }
  const fraction = sway / N;
  assert.ok(fraction < 0.4, `too many trees animate: ${(fraction * 100).toFixed(1)}%`);
  assert.ok(fraction > 0.05, `nothing animates: ${(fraction * 100).toFixed(1)}%`);

  // Both grass and leaves fade their wind out with distance.
  assert.match(GRASS, /smoothstep\(45\.0, 95\.0, -dcView\.z\)/);
  assert.match(FLORA, /smoothstep\(60\.0, 130\.0, -dcView\.z\)/);
});

test("the world is populated to the horizon", () => {
  // Trees scatter out to the foot of the hills, evenly per unit area.
  assert.match(FLORA, /const maxRadius = 430/);
  assert.match(FLORA, /Math\.sqrt\(Math\.random\(\)\) \* maxRadius/);
  // Herds occupy far bands, not just a ring around the clearing.
  assert.ok(/radius: \[200, 330\]/.test(WILDLIFE), "there must be herds out at 300 m");
  assert.ok(/radius: \[220, 360\]/.test(WILDLIFE), "and beyond");
  // Distant animals must not be dragged back to the origin by a global fence.
  assert.match(WILDLIFE, /const fromHome = Math\.hypot\(nx - a\.homeX, nz - a\.homeZ\)/);
  assert.ok(!/Math\.hypot\(nx, nz\) > 78/.test(WILDLIFE), "the old origin fence must be gone");
  // Grass must reach far enough to meet them.
  for (const [, far] of QUALITY.matchAll(/grassFarRadius: (\d+)/g)) {
    assert.ok(Number(far) >= 165, `grassFarRadius ${far} leaves bare ground`);
  }
});

// ── 11. Board: resize, pinch persistence, no leftover slab ────────────

test("the lesson board is scenery: no drag, no resize, no zoom", () => {
  // SUPERSEDED. This board used to be draggable, edge-resizable and
  // pinch-zoomable. It now stands on the hillside and takes no input at all,
  // so the whole controller is deleted rather than left dormant — a dormant
  // one would keep competing with the orbit camera for pointer events.
  for (const gone of ["class BoardController", "resizeEdge", "setScale(", "MIN_SCALE", "MAX_SCALE", "onWheel"]) {
    assert.ok(!BOARD_CODE.includes(gone), `${gone} must be gone from board.ts`);
  }
  assert.ok(!/pointerdown|pointermove/.test(BOARD_CODE), "the board must not listen for pointer input");
  // And the HUD controls that drove it are gone from the page + scene.
  for (const gone of ["nudgeBoard", "zoomBoard", "scaleBoard", "resetBoard"]) {
    assert.ok(!SCENE.includes(gone), `Sanctuary.${gone} must be gone`);
    assert.ok(!PAGE.includes(gone), `the HUD must not call ${gone}`);
  }
  assert.ok(!/showPlacer|PadBtn/.test(PAGE), "the board placement pad must be gone");
});

test("the opening camera is a wide establishing shot", () => {
  // You now land far enough back to read the ENTIRE connected world — all
  // three districts at once — and explore in from there.
  assert.match(SCENE, /this\.orbit\.panTo\(new THREE\.Vector3\(0, 30, 0\), 1500, -0\.30, 0\.34\)/);
  // And you can pull back by hand — as far as the world allows. The limit is
  // no longer a fixed 2400 m (which flew the camera off the 1380 m plate);
  // it is derived from the plate itself. See Group 14.
  assert.match(CONTROLS, /clamp\(this\.targetDistance \* factor, 2\.4, this\.maxDistance\)/);
  // The board and student presets still exist so you can click straight in.
  assert.match(SCENE, /case "board":/);
  assert.match(SCENE, /case "student":/);
});

// ── 12. Water, sun and birds: open-source techniques, no new deps ─────

test("the river uses dual-phase flow so the texture never visibly slides", () => {
  // Valve's Portal 2 / three.js Water2 trick: sample the normal map twice at
  // half-cycle-offset phases and cross-fade, so the pattern regenerates
  // instead of scrolling. A single scrolling sample always reads as a sliding
  // texture, which is the classic "blue plastic" look.
  assert.match(WATER, /dcPhase0 = fract\(uTime \* dcCycle\)/);
  assert.match(WATER, /dcPhase1 = fract\(uTime \* dcCycle \+ dcHalf\)/);
  assert.match(WATER, /dcMix = abs\(\(dcPhase0 - dcHalf\) \/ dcHalf\)/);
  assert.match(WATER, /mix\(dcN0, dcN1, dcMix\)/);

  // Schlick Fresnel with water's real normal reflectance.
  assert.match(WATER, /dcFres = 0\.02 \+ 0\.98 \* pow\(1\.0 - dcCos, 5\.0\)/);
  // Depth tint and a sun glint.
  assert.match(WATER, /dcShallow/);
  assert.match(WATER, /dcDeep/);
  assert.match(WATER, /dcSpec = pow\(max\(dot\(dcNormal, dcH\), 0\.0\), 220\.0\)/);

  // No new runtime dependency was pulled in for any of this.
  const pkg = JSON.parse(read("package.json"));
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    assert.ok(
      !/water|ocean|godray|postprocessing/i.test(name),
      `${name} must not be added — the effects are re-implemented in-shader`,
    );
  }
});

test("the river runs the full kilometre and stays in its bed", () => {
  assert.match(WATER, /const RIVER_LENGTH = 1000/);
  // The channel is carved explicitly rather than by tuning a falloff.
  assert.match(TERRAIN, /THE RIVER CARVES/);
  assert.match(TERRAIN, /const bedDepth = 3\.4 - across \* across \* 2\.2/);
  assert.match(TERRAIN, /Math\.min\(bed, base\)/, "the carve must never RAISE the ground");
  // And the clearing must win against the near bank.
  assert.match(TERRAIN, /bankBlend \*= smoothstep\(CLEARING_RADIUS, CLEARING_RADIUS \+ 7, dist\)/);
});

test("the waterfall aerates and breaks into ropes", () => {
  // Two scroll speeds, vertical strands, and foam that builds toward the base.
  assert.match(WATER, /dcA = texture2D\(map, vMapUv \* vec2\(1\.0, 2\.0\)/);
  assert.match(WATER, /dcB = texture2D\(map, vMapUv \* vec2\(2\.3, 3\.7\)/);
  assert.match(WATER, /dcRope/);
  assert.match(WATER, /dcFoam = smoothstep\(0\.25, 1\.0, dcDrop\)/);
});

test("the spray is ballistic, not rising smoke", () => {
  // Particles burst up and outward from the plunge point, fall under gravity
  // and respawn — the old version drifted straight up and teleported back.
  assert.match(WATER, /const seedParticle = \(i: number\) =>/);
  assert.match(WATER, /velocities\[p \+ 1\] -= g/, "gravity must act on the spray");
  assert.match(WATER, /life\[i\] -= dt/);
  assert.ok(!/if \(arr\[yi\] > 2\.6\) arr\[yi\] = -1\.3/.test(WATER), "the teleport-loop must be gone");
});

test("the sky is physically motivated Rayleigh + Mie scattering", () => {
  assert.match(SKY, /RAYLEIGH_BETA = vec3\(5\.8e-3, 1\.35e-2, 3\.31e-2\)/);
  assert.match(SKY, /float henyeyGreenstein\(float cosTheta, float g\)/);
  assert.match(SKY, /henyeyGreenstein\(cosTheta, 0\.76\)/);
  // Rayleigh phase is (3/16pi)(1 + cos^2).
  assert.match(SKY, /rayleighPhase = 0\.0596831 \* \(1\.0 \+ cosTheta \* cosTheta\)/);
  // Blue must scatter more than red, or it is not Rayleigh at all.
  const [, rs, gs, bs] = /RAYLEIGH_BETA = vec3\(([\d.e-]+), ([\d.e-]+), ([\d.e-]+)\)/.exec(SKY);
  assert.ok(Number(bs) > Number(gs) && Number(gs) > Number(rs), "beta must rise from red to blue");
  // The sun disc survives.
  assert.match(SKY, /pow\(d, 900\.0\) \* 3\.2/);
});

test("soaring birds flap in bursts and bank into their turns", () => {
  // Continuous flapping on a perfect circle is the give-away of a fake bird.
  assert.match(FLORA, /function smootherstep/);
  assert.match(FLORA, /const beating = smootherstep\(0\.42, 0\.62, cycle\)/);
  assert.match(FLORA, /const glide = \(1 - beating\) \* 0\.16/);
  assert.match(FLORA, /f\.g\.rotation\.z = THREE\.MathUtils\.clamp\(turnRate \* 2\.6/);
  // Birds still actually sit in the trees.
  assert.match(FLORA, /perched\.push/);
});

// ───────────────────────────────────────────────────────────────────────────
// Group 11 — look freedom, the seated student, board persistence, and the
// second world (Clay Safari) installed alongside the Sanctuary.
// ───────────────────────────────────────────────────────────────────────────

test("the learner can look straight up and all the way behind", () => {
  const m = /clamp\(this\.pitch - dy, (-?[\d.]+), [^)]+\)/.exec(CONTROLS);
  assert.ok(m, "expected the first-person pitch clamp");
  // Looking UP now reaches a full 90 degrees, as the brief asks. The old cap
  // stopped 3 degrees short on gimbal-flip grounds, which do not apply: this
  // rig stores yaw and pitch as state and only ever writes them out (YXZ), so
  // the pole is an ordinary rotation — nothing recovers yaw from a direction.
  assert.match(CONTROLS, /clamp\(this\.pitch - dy, -1\.52, Math\.PI \/ 2\)/);
  assert.ok(Number(m[1]) <= -1.5, "looking down must stay nearly as free");
  // Yaw has to stay unbounded so you can turn to face behind you.
  assert.match(CONTROLS, /this\.yaw -= dx;/);
  assert.ok(
    !/clamp\([^)]*this\.yaw/.test(CONTROLS),
    "yaw must not be clamped — the learner has to be able to look behind",
  );
});

test("the seated student is removed and the sofa remains alone in the clearing", () => {
  assert.doesNotMatch(SCENE_CODE, /createStudent|this\.student\.|\.setSeated\(true/);
  assert.match(SCENE, /createDayBed\(this\.budget, aniso\)/);
  assert.match(CHARACTER_CONFIG, /CHARACTER_SPAWN = Object\.freeze\(\{ x: -10, z: 10, yaw: 0 \}\)/);
  assert.match(read("src/nature3d/engine/dayBed.ts"), /DAY_BED_SCALE = PREVIOUS_DAY_BED_SCALE \* 2/);
});

test("the lesson board is bolted to the hill the student can actually see", () => {
  // SUPERSEDED: nothing is persisted any more, because nothing can be moved.
  assert.ok(!BOARD_CODE.includes("nature3d.board.placement"), "the placement key must be gone");
  assert.ok(!/localStorage/.test(BOARD_CODE), "the board stores nothing");

  // Its position is measured, not eyeballed. The three 30 m study boards cover
  // a continuous -41.3..+41.3 deg fan from the chair, so a board inside that
  // range would simply be hidden behind one of them. BOARD_HILL sits at -45
  // deg — the first clear bearing — on the highest ground there.
  assert.match(BOARD, /export const BOARD_HILL = \{/);
  assert.match(BOARD, /new THREE\.Vector3\(-268\.7, 38\.3 \+ 15\.5, -266\.1\)/);
  // Turned back towards the chair, or the learner reads the back of it.
  assert.match(BOARD, /yaw: Math\.atan2\(-268\.7 - 0, -266\.1 - 2\.6\) \+ Math\.PI/);
  // 380 m away a 4.8 m board subtends 0.72 deg — unreadable. 8x makes it 38 m
  // wide and ~5.7 deg, comparable to a study board seen from the desk.
  assert.match(BOARD, /scale: 8/);

  // It stands on posts rather than floating, and the scene mounts both.
  assert.match(BOARD, /export function createBoardStand/);
  assert.match(SCENE, /this\.board\.group\.position\.copy\(BOARD_HILL\.position\)/);
  assert.match(SCENE, /createBoardStand\(BOARD_HILL/);
  // The plinth is gone for good, not just hidden.
  assert.ok(!/plinth/.test(SCENE), "the scene must not mount a plinth any more");
});

test("there is ONE 3D route — the districts are not separate pages", () => {
  // The whole point of this round: no second button, no second page.
  assert.match(MAIN, /NATURE_STUDIO_HASH = "#\/nature-studio"/);
  assert.ok(!/CLAY_SAFARI_HASH/.test(MAIN), "the safari must not have its own route");
  assert.ok(!exists("src/nature3d/SafariStudioPage.tsx"), "the safari must not have its own page");
  const shell = read("src/components/DesktopShell.tsx");
  assert.ok(!/safari3d/.test(shell), "the safari must not have its own rail button");
  // The one rail button still sits under Study Library.
  const study = shell.indexOf('key: "study"');
  const nature = shell.indexOf('key: "nature3d"');
  assert.ok(study > 0 && nature > study, "the 3D button stays directly under Study Library");
});

test("the world connects Sanctuary and Highlands without Safari", () => {
  const regions = read("src/nature3d/engine/regions.ts");
  for (const id of ["sanctuary", "trek"]) {
    assert.ok(regions.includes(`id: "${id}"`), `${id} must be a district of the world`);
  }
  // They are laid out along X, and the world reaches past the outermost.
  const trekX = Number(/TREK: Region = \{ id: "trek", centerX: (-?\d+)/.exec(regions)[1]);
  const reach = Number(/WORLD_REACH = (\d+)/.exec(regions)[1]);
  assert.ok(reach > Math.abs(trekX), "the world must contain every district");

  // ONE height field answers for all of them — that is what makes it walkable.
  assert.match(TERRAIN, /import \{[\s\S]*?regionWeight,\s*trekRelief,[\s\S]*?\} from "\.\/regions"/);
  assert.match(TERRAIN, /const wSanct = regionWeight\(SANCTUARY, x, z\)/);
  assert.match(TERRAIN, /const wTrek = regionWeight\(TREK, x, z\)/);
  // The ring of hills is opened up so the districts are not walled off.
  assert.match(TERRAIN, /corridor/, "the sanctuary's hill ring needs passes to the neighbours");

  // You can actually walk the whole way.
  assert.match(CONTROLS, /const WALK_LIMIT = WORLD_REACH;/);
});

test("both districts are framed by the default opening view", () => {
  // The establishing shot pulls back far enough to hold the whole chain.
  const m = /panTo\(new THREE\.Vector3\(0, 30, 0\), (\d+), /.exec(SCENE);
  assert.ok(m, "expected the opening establishing shot");
  const dist = Number(m[1]);
  const regions = read("src/nature3d/engine/regions.ts");
  const spread = Math.abs(Number(/TREK: Region = \{ id: "trek", centerX: (-?\d+)/.exec(regions)[1]));
  // Half-width `spread` must fit in half the 52-degree fov at `dist`.
  const needed = spread / Math.tan((52 * Math.PI) / 180 / 2);
  assert.ok(dist >= needed * 0.98, `camera at ${dist}m cannot frame districts ${spread}m out (needs ~${Math.round(needed)}m)`);
  // ...and the far plane and zoom limit must both reach that far.
  const far = Math.min(...[...QUALITY.matchAll(/farPlane: (\d+)/g)].map((x) => Number(x[1])));
  // The zoom cap is world-derived now, so compute it the way OrbitRig does
  // and check the DISTRICTS still fit — the requested 1500 m is pulled in to
  // whatever keeps the camera over its own terrain.
  const reach = Number(/WORLD_REACH = (\d+)/.exec(regions)[1]);
  const worldHalf = reach + 200;
  const zoomMax = (worldHalf * 0.93) / Math.cos(0.34);
  const settled = Math.min(dist, zoomMax);
  const halfWidth = Math.tan((52 * Math.PI) / 180 / 2) * (16 / 9) * settled;
  assert.ok(halfWidth > spread, `at the capped ${settled.toFixed(0)}m only ${halfWidth.toFixed(0)}m is visible`);
  // Fog must not erase the far districts.
  assert.ok(far > settled + spread, `far plane ${far} clips the far district`);
  const fog = Math.max(...[...QUALITY.matchAll(/fogDensity: ([\d.]+)/g)].map((x) => Number(x[1])));
  const visibility = Math.exp(-((fog * (settled + spread)) ** 2));
  assert.ok(visibility > 0.15, `fog leaves only ${(visibility * 100).toFixed(0)}% of the far district visible`);
  // And there are HUD presets to fly to each district.
  for (const key of ["world", "trek"]) {
    assert.ok(PAGE.includes(`key: "${key}"`), `the HUD needs a ${key} view preset`);
    assert.ok(SCENE.includes(`case "${key}":`), `the engine needs a ${key} preset`);
  }
});

test("Safari is removed from navigation, scene lifecycle and the height field", () => {
  assert.doesNotMatch(PAGE, /key: "safari"|label: "Safari"/);
  assert.doesNotMatch(SCENE, /safariDistrict|this\.safari|case "safari"|SAFARI/);
  assert.doesNotMatch(TERRAIN, /safariRelief|wSafari|SAFARI/);
  assert.doesNotMatch(read("src/nature3d/engine/regions.ts"), /SAFARI|id: "safari"/);
});

test("the playable character uses metre-scale six-foot dimensions and a 4m spring arm", () => {
  assert.match(CHARACTER_CONFIG, /CHARACTER_HEIGHT = 6 \* 0\.3048/);
  assert.match(CHARACTER_CONFIG, /walkSpeed: 2\.2/);
  assert.match(CHARACTER_CONFIG, /runSpeed: 5/);
  assert.match(CHARACTER_CONFIG, /cameraDistance: 4/);
  assert.match(CHARACTER_CONFIG, /simulationStep: 1 \/ 120/);
});

test("locomotion has analog normalization, limited turn and distance-driven gait", () => {
  assert.match(CHARACTER, /const norm = Math\.max\(1, length\)/);
  assert.match(CHARACTER, /clamp\(directionDifference, -T\.turnRate \* dt, T\.turnRate \* dt\)/);
  assert.match(CHARACTER, /travel \/ this\.strideLen \* Math\.PI \* 2/);
  assert.match(CHARACTER, /T\.acceleration : T\.braking/);
  assert.match(CHARACTER, /turnInPlaceDelay/);
});

test("the character is a jointed rig with foot IK, not the stick human", () => {
  const trek = read("src/nature3d/engine/trekAvatar.ts");
  // Full joint hierarchy: spine chain, arms with elbows + wrists, legs with
  // knees + ankles.
  assert.match(trek, /const pelvisG = joint\(body, 0, PELVIS_Y, 0\)/);
  assert.match(trek, /const neckG = joint\(chestG, 0, 0\.2, 0\)/);
  assert.match(trek, /const elbowL = armBuildL\.elbow/);
  assert.match(trek, /const wristL = armBuildL\.wrist/);
  assert.match(trek, /const kneeL = legBuildL\.knee/);
  assert.match(trek, /const ankleL = legBuildL\.ankle/);
  // Two materials, vertex-coloured, nothing transparent anywhere.
  assert.match(trek, /vertexColors: true/);
  assert.ok(!/transparent:\s*true/.test(trek), "the rig must stay fully opaque");
  // Analytic two-bone foot IK with staggered updates.
  assert.match(trek, /function solveLeg\(/);
  assert.match(trek, /function updateFoot\(/);
  assert.match(trek, /STAGGER/i);
  // The old monochrome body must be GONE.
  assert.ok(!/SphereGeometry\(0\.24, 24, 18\)/.test(trek), "stick-human head is back");
  assert.ok(!/CapsuleGeometry\(0\.22, 0\.75, 6, 18\)/.test(trek), "stick-human torso is back");
  // Deterministic: no Math.random in the character (seeded PRNG instead).
  const code = trek.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/Math\.random\(\)/.test(code), "the character must stay deterministic");
});

test("jump, collision-tested camera and player pose are wired into the live scene", () => {
  assert.match(CHARACTER, /jumpBuffered/); assert.match(CHARACTER, /coyote/);
  assert.match(CHARACTER, /world\.cameraBlocked/);
  assert.match(SCENE, /this\.avatar\.update\(dt, time, this\.character, this\.camera\)/);
  assert.match(SCENE, /this\.character\.update\(dt, this\.camera, this\.characterPaused\)/);
  assert.match(SCENE, /case "Space"/);
  assert.match(CHARACTER_UI, /characterAction\("jump"\)/);
});

test("the guide starts standing, stays separate from the sofa and safely leaves player mode", () => {
  assert.doesNotMatch(SCENE_CODE, /\.setSeated\(true|this\.student\./);
  assert.match(SCENE, /this\.avatar\.group\.position\.copy\(this\.character\.position\)/);
  assert.match(SCENE, /if \(this\.character\.enabled\) this\.setCharacterMode\("orbit"\)/);
  assert.match(SCENE, /this\.screens\.setInteractive\(leaving\)/);
});

// ───────────────────────────────────────────────────────────────────────────
// Group 12 — regressions from growing the world to three districts. Each of
// these was a real bug the learner hit, so each gets a guard.
// ───────────────────────────────────────────────────────────────────────────

test("the sanctuary's hill ring is not keyed to the world size", () => {
  // THE FLAT-GROUND BUG. The ring's ramp used to end at WORLD_HALF * 0.92.
  // When the world grew from 1000 m to hold three districts, that ramp
  // stretched with it and the hills collapsed to a tenth of their height at
  // the meadow rim — the meadow read as flat ground.
  assert.match(TERRAIN, /const SANCTUARY_HILL_RIM = \d+/, "the ring needs its own fixed radius");
  assert.ok(
    !/smoothstep\(150, WORLD_HALF \* 0\.92, d\)/.test(TERRAIN),
    "the hill ramp must not be derived from WORLD_HALF",
  );
  assert.match(TERRAIN, /smoothstep\(150, SANCTUARY_HILL_RIM, d\)/);
  const rim = Number(/const SANCTUARY_HILL_RIM = (\d+)/.exec(TERRAIN)[1]);
  assert.ok(rim >= 400 && rim <= 700, `hill rim ${rim} should sit around the old meadow edge`);
});

test("the terrain mesh is fine enough to show mountains at world scale", () => {
  // A 2760 m world on the old three shells meant one vertex every 21 m, which
  // smooths crests away. A fourth shell keeps the spacing usable.
  const shells = TERRAIN.slice(TERRAIN.indexOf("const shells"), TERRAIN.indexOf("const mat ="));
  const halves = [...shells.matchAll(/half: (\d+|WORLD_HALF)/g)].map((m) => m[1]);
  assert.ok(halves.length >= 4, `expected at least 4 LOD shells, found ${halves.length}`);
  const segs = [...shells.matchAll(/segs: Math\.round\((\d+) \* density\)/g)].map((m) => Number(m[1]));
  const reach = Number(/WORLD_REACH = (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  const worldHalf = reach + 200;
  // Worst-case spacing on the outermost shell, at the lowest density (0.62).
  const outerSpacing = (worldHalf * 2) / Math.round(segs[segs.length - 1] * 0.62);
  assert.ok(outerSpacing < 16, `outer shell samples every ${outerSpacing.toFixed(1)} m — mountains will flatten`);
});

test("the highlands use real simplex noise, not a sin/cos approximation", () => {
  const regions = read("src/nature3d/engine/regions.ts");
  const simplex = read("src/nature3d/engine/simplex.ts");
  // A separable sin/cos field repeats on an axis-aligned lattice and cannot
  // look eroded no matter how many octaves are stacked on it.
  assert.match(regions, /import \{ noise \} from "\.\/simplex"/);
  assert.match(regions, /noise\.noise2D\(lx \* frequency \+ ox, lz \* frequency \+ oz\)/);
  assert.ok(
    !/Math\.sin\(lx \* frequency/.test(regions),
    "the trek octaves must not be built from sin/cos",
  );
  // The generator really is simplex: skew factors and the 12-gradient table.
  assert.match(simplex, /F2 = 0\.5 \* \(Math\.sqrt\(3\) - 1\)/);
  assert.match(simplex, /G2 = \(3 - Math\.sqrt\(3\)\) \/ 6/);
  assert.match(simplex, /GRAD3/);
  // Deterministic: the world must be identical on every machine and reload.
  // Strip comments first: the file's own docstring mentions Math.random().
  const simplexCode = simplex.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/Math\.random\(\)/.test(simplexCode), "the noise seed must not be random");

  // TerrainTrek's published fractal settings.
  assert.match(regions, /LACUNARITY = 2\.05/);
  assert.match(regions, /PERSISTENCE = 0\.45/);
  assert.match(regions, /POWER = 2/);
  assert.match(regions, /BASE_FREQUENCY = 0\.003/);
  assert.match(regions, /ELEVATION_OFFSET = 1/);
});

test("shrinking the window never pushes the world off screen", () => {
  // THE DISAPPEARING-WORLD BUG. fov is VERTICAL, so a narrow window loses
  // horizontal extent and the districts fell off both edges.
  assert.match(SCENE, /private applyFov\(\)/);
  assert.match(SCENE, /const REFERENCE_ASPECT = 16 \/ 9/);
  assert.match(SCENE, /if \(this\.camera\.aspect < REFERENCE_ASPECT\)/);
  // resize() and setMode() must BOTH go through it, or a mode switch would
  // silently restore the uncorrected fov.
  assert.match(SCENE, /this\.applyFov\(\);\s*\n\s*this\.camera\.updateProjectionMatrix\(\);/);
  const modeFovs = SCENE.match(/this\.camera\.fov = \d+;/g) || [];
  assert.equal(modeFovs.length, 0, `setMode must not hard-set fov (found ${modeFovs.join(", ")})`);
  assert.match(SCENE, /Math\.min\(fov, 100\)/, "the correction needs an upper bound");

  // Prove the framing actually holds: at every aspect the horizontal
  // half-extent at the establishing distance must still cover the districts.
  const dist = Number(/panTo\(new THREE\.Vector3\(0, 30, 0\), (\d+), /.exec(SCENE)[1]);
  const spread = Number(/centerX: (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  for (const aspect of [16 / 9, 4 / 3, 1, 0.86, 0.6]) {
    const base = 52;
    let fov = base;
    if (aspect < 16 / 9) {
      fov = (Math.atan((Math.tan((base * Math.PI) / 360) * (16 / 9)) / aspect) * 360) / Math.PI;
    }
    fov = Math.min(fov, 100);
    const halfWidth = Math.tan(Math.atan(Math.tan((fov * Math.PI) / 360) * aspect)) * dist;
    assert.ok(
      halfWidth > spread,
      `at aspect ${aspect.toFixed(2)} only ${halfWidth.toFixed(0)} m is visible, districts are ${spread} m out`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  Group 13 — the three-board study lectern
//
//  Three 30 m boards stand around the chair, each showing a live page from
//  the course player. The geometry is exact and is proved here rather than
//  eyeballed, because "1 m apart and square on to the student" is the kind
//  of constraint that silently drifts the moment a number is touched.
// ─────────────────────────────────────────────────────────────────────────

const LECTERN = read("src/nature3d/engine/lectern.ts");
const SCREENS = read("src/nature3d/engine/boardScreens.ts");
const READING_BOARD = read("src/nature3d/boards/ReadingBoard.tsx");
const STUDY_BOARDS = read("src/nature3d/boards/StudyBoards.tsx");

/**
 * Re-derive the layout from the shipped constants, exactly as `lectern.ts`
 * does. If the source's own maths changes, these assertions move with it —
 * what they pin down is the RESULT: 30 m boards, 1 m gaps, dead square on.
 */
function solveLectern() {
  const W = Number(/LECTERN_BOARD_WIDTH = (\d+)/.exec(LECTERN)[1]);
  const GAP = Number(/LECTERN_GAP = (\d+)/.exec(LECTERN)[1]);
  const R = Number(/LECTERN_RADIUS = (\d+)/.exec(LECTERN)[1]);
  const HW = W / 2;
  const k = GAP + HW;
  const residual = (p) => Math.atan2(HW + k * Math.cos(p), R + k * Math.sin(p)) - p;
  let lo = 0.01;
  let hi = 1.5;
  for (let i = 0; i < 90; i += 1) {
    const mid = (lo + hi) / 2;
    if (residual(lo) * residual(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const p = (lo + hi) / 2;
  const rx = HW + k * Math.cos(p);
  const rz = -R - k * Math.sin(p);
  return { W, GAP, R, HW, swing: p, boards: [
    { slot: "mindmap", x: -rx, z: rz, yaw: -p },
    { slot: "reading", x: 0, z: -R, yaw: 0 },
    { slot: "notes", x: rx, z: rz, yaw: p },
  ] };
}

test("the three study boards are 30 m wide, 1 m apart and square on to the student", () => {
  const L = solveLectern();
  assert.equal(L.W, 30, "the brief fixes the board width at 30 m");
  assert.equal(L.GAP, 1, "there must be exactly 1 m between neighbouring boards");

  const corners = (b) => {
    const ax = Math.cos(b.yaw);
    const az = -Math.sin(b.yaw);
    return {
      left: { x: b.x - L.HW * ax, z: b.z - L.HW * az },
      right: { x: b.x + L.HW * ax, z: b.z + L.HW * az },
    };
  };

  // Every board faces the seat dead-on, so no page is ever read at a slant.
  for (const b of L.boards) {
    const bearing = Math.atan2(b.x, -b.z);
    assert.ok(
      Math.abs(bearing - b.yaw) < 1e-6,
      `${b.slot} is ${(((bearing - b.yaw) * 180) / Math.PI).toFixed(2)}deg off square`,
    );
  }

  // And the gaps are the specified 1 m — on BOTH sides.
  const [mm, rd, nt] = L.boards.map(corners);
  const gapLeft = Math.hypot(mm.right.x - rd.left.x, mm.right.z - rd.left.z);
  const gapRight = Math.hypot(rd.right.x - nt.left.x, rd.right.z - nt.left.z);
  assert.ok(Math.abs(gapLeft - 1) < 1e-6, `left gap is ${gapLeft.toFixed(3)} m, not 1 m`);
  assert.ok(Math.abs(gapRight - 1) < 1e-6, `right gap is ${gapRight.toFixed(3)} m, not 1 m`);
});

test("all three boards share one ground datum so the set is not staggered", () => {
  // Sampling the rolling terrain under each board put them at three different
  // heights (11.5 / 10.6 / 8.5 m). One datum under the chair, legs take the
  // slack — a lectern is one piece of furniture.
  assert.match(LECTERN, /const groundY = terrainHeight\(0, pivotZ\)/);
  assert.match(LECTERN, /position: new THREE\.Vector3\(x, groundY \+ y, z \+ pivotZ\)/);
  // The legs, by contrast, MUST be measured per board or they float/sink.
  assert.match(SCREENS, /legH = p\.position\.y - H \/ 2 - terrainHeight\(p\.position\.x, p\.position\.z\)/);
});

test("each board frames edge-to-edge at every aspect with a half-metre of air", () => {
  const L = solveLectern();
  const H = (L.W * 9) / 16;
  const margin = Number(/const BOARD_VIEW_MARGIN = ([\d.]+)/.exec(SCENE)[1]);
  assert.equal(margin, 0.5, "the brief asks for ~0.5 m of world still showing");

  // The distance must be COMPUTED from the live projection, never stored:
  // the fov is aspect-dependent, so a fixed distance crops on a narrow window.
  assert.match(SCENE, /private focusBoard\(slot: LecternSlot\)/);
  assert.match(SCENE, /needH \/ 2 \/ Math\.tan\(vFov \/ 2\)/);
  assert.match(SCENE, /needW \/ 2 \/ Math\.tan\(hFov \/ 2\)/);

  for (const aspect of [2.4, 16 / 9, 1.5, 4 / 3, 1, 0.75, 0.55]) {
    const base = 52;
    let fov = base;
    if (aspect < 16 / 9) {
      fov = (Math.atan((Math.tan((base * Math.PI) / 360) * (16 / 9)) / aspect) * 360) / Math.PI;
    }
    fov = Math.min(fov, 100);
    const v = (fov * Math.PI) / 180;
    const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
    const d = Math.max((H + 2 * margin) / 2 / Math.tan(v / 2), (L.W + 2 * margin) / 2 / Math.tan(h / 2));
    const visibleW = 2 * d * Math.tan(h / 2);
    const visibleH = 2 * d * Math.tan(v / 2);
    assert.ok(visibleW >= L.W, `at aspect ${aspect.toFixed(2)} the board is cut off sideways`);
    assert.ok(visibleH >= H, `at aspect ${aspect.toFixed(2)} the board is cut off vertically`);
  }
});

test("the desk view fits all three boards without cutting any off", () => {
  const L = solveLectern();
  const H = (L.W * 9) / 16;
  assert.match(SCENE, /private focusStudentDesk\(\)/);
  // "Student" must route to it — that is the button that shows the trio.
  assert.match(SCENE, /case "student":[\s\S]{0,200}this\.focusStudentDesk\(\)/);

  let halfSpan = 0;
  for (const b of L.boards) {
    const ax = Math.cos(b.yaw);
    halfSpan = Math.max(halfSpan, Math.abs(b.x + L.HW * ax), Math.abs(b.x - L.HW * ax));
  }
  for (const aspect of [2.4, 16 / 9, 4 / 3, 1, 0.75]) {
    const base = 52;
    let fov = base;
    if (aspect < 16 / 9) {
      fov = (Math.atan((Math.tan((base * Math.PI) / 360) * (16 / 9)) / aspect) * 360) / Math.PI;
    }
    fov = Math.min(fov, 100);
    const v = (fov * Math.PI) / 180;
    const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
    const d = Math.max((H + 1) / 2 / Math.tan(v / 2), (halfSpan * 2 + 1) / 2 / Math.tan(h / 2));
    assert.ok(2 * d * Math.tan(h / 2) >= halfSpan * 2, `aspect ${aspect.toFixed(2)} clips the outer boards`);
  }
});

test("the boards are live DOM surfaces, not textures, so every file type works", () => {
  // A canvas texture cannot host an iframe, which rules out YouTube and PDF
  // outright, and no render-target resolution keeps body text legible on a
  // 30 m board. CSS3D is the only approach that satisfies the brief.
  assert.match(SCREENS, /CSS3DRenderer/);
  assert.match(SCREENS, /CSS3DObject/);
  assert.ok(!/WebGLRenderTarget/.test(SCREENS), "the boards must not be render targets");

  // The real player viewer is reused, so every CourseFileType is covered by
  // construction rather than re-implemented per type.
  assert.match(READING_BOARD, /import ResourceViewer from "\.\.\/\.\.\/course\/ResourceViewer"/);
  assert.match(READING_BOARD, /<ResourceViewer file=\{file\}/);

  // Notes and mind map are the player's OWN panels — the brief says the
  // design must not change.
  assert.match(STUDY_BOARDS, /import NotesPanel from "\.\.\/\.\.\/course\/NotesPanel"/);
  assert.match(STUDY_BOARDS, /import\("\.\.\/\.\.\/course\/MindMapPanel"\)/);
  assert.match(STUDY_BOARDS, /import useCourseMindMap from "\.\.\/\.\.\/course\/useCourseMindMap"/);
  // ...and they share the player's stores, so a note taken here is the same
  // note the player shows — one Firestore document per note under
  // `users/{uid}/notes`, not a device-local list.
  assert.match(STUDY_BOARDS, /import useCourseNotes from "\.\.\/\.\.\/course\/useCourseNotes"/);
  assert.match(STUDY_BOARDS, /useCourseNotes\(\{/);
});

test("the reading board lists purchased courses and sanctuary-created modules", () => {
  // Ownership now comes from the full entitlement resolver (Group 15), not
  // from the legacy purchases subcollection alone.
  assert.match(PAGE, /useOwnedCourses\(\)/);
  assert.match(PAGE, /<BoardPortals/);
  // Drilling down: course -> module -> resource, chosen by the learner.
  assert.match(READING_BOARD, /courses\.map\(/);
  assert.match(READING_BOARD, /myCourses\.map\(/);
  assert.match(READING_BOARD, /Created by you/);
  assert.match(READING_BOARD, /course\.courseContent/);
  // Opening a resource also records which module it came from, so the notes
  // and mind-map boards scope to it (Group 15).
  assert.match(READING_BOARD, /onSelectModule\(ownerId\);/);
  assert.match(READING_BOARD, /setFile\(f\);/);
});

test("the tray switches boards and the camera turns to the one picked", () => {
  // The three named buttons, plus the desk view that shows all of them.
  assert.match(PAGE, /const BOARD_VIEWS/);
  for (const [key, label] of [["mindmap", "Mind map"], ["reading", "Reading"], ["notes", "Note taking"]]) {
    assert.ok(
      new RegExp(`key: "${key}", label: "${label}"`).test(PAGE),
      `the tray is missing the ${label} button`,
    );
  }
  assert.match(PAGE, /key: "student", label: "Desk"/);
  assert.match(PAGE, /engineRef\.current\?\.focus\(preset\)/);
  // And the engine knows those presets.
  assert.match(SCENE, /\| "reading" \| "notes" \| "mindmap"/);
});

test("board input does not fight the camera", () => {
  // The board is a child of the element carrying the orbit/look handlers, so
  // without this every click in a panel would also spin the world.
  assert.match(SCREENS, /stopPropagation/);
  assert.match(SCREENS, /pointerdown", "pointermove", "pointerup", "wheel"/);
  // The CSS layer itself must stay transparent to pointers.
  assert.match(SCREENS, /domElement\.style\.pointerEvents = "none"/);
  assert.match(SCREENS, /element\.style\.pointerEvents = "auto"/);
});

test("a missed board tap can never drag the camera", () => {
  // Some device browsers deliver board touches to the host anyway (their
  // hit-test of the large 3D-transformed element is unreliable). stopPropagation
  // is the first line of defence; the rig itself must refuse board targets,
  // or the "first tap nudges the world" symptom comes back.
  assert.match(SCENE, /private boardTarget\(target: EventTarget \| null\): boolean/);
  assert.match(SCENE, /closest\("\.nature3d-board-screen"\)/);
  const down = SCENE.slice(SCENE.indexOf("private onPointerDown"), SCENE.indexOf("private onPointerMove"));
  assert.match(down, /if \(this\.boardTarget\(e\.target\)\) return;/);
  const wheel = SCENE.slice(SCENE.indexOf("private onWheel"), SCENE.indexOf("setMode(mode: CameraMode)"));
  assert.match(wheel, /if \(this\.boardTarget\(e\.target\)\) return;/);
});

test("board taps are guaranteed by the engine's raycast bridge, not by device hit-testing", () => {
  // The learner looks at the board ITSELF — the 2D reading page (a flat
  // overlay standing in for the 3D board) is removed, per the owner. The
  // device's 3D hit-test is still the only thing between the finger and a
  // full-size board's buttons, so the engine stops trusting it: when a
  // touch the device mis-delivers to the canvas lands on a board face by
  // raycast, the engine replays it into the board's own DOM.
  //
  // The two input paths are mutually exclusive BY CONSTRUCTION: native
  // delivery is swallowed by the board's stopPropagation before the host
  // handlers run, so the bridge can never double-fire a click the device
  // already landed, and on desktop (where native always works) the bridge
  // stays completely dormant.

  // The 2D reading page is removed from every layer.
  for (const [name, src] of [["scene", SCENE], ["page", PAGE], ["screens", SCREENS], ["boards", STUDY_BOARDS]]) {
    for (const gone of ["setBoardPresented", "presentedSlot", "stageHost", "panelRef", "dc-reading-page"]) {
      assert.ok(!src.includes(gone), `${name} still carries the removed reading-page mechanism: ${gone}`);
    }
  }
  assert.ok(!SCREENS.includes("setPresented"), "the presented-culling fold must be gone");
  assert.ok(!/createPortal\(/.test(PAGE), "the page must not portal a reading page any more");

  // The bridge re-aims the touch with pure geometry: a world plane per
  // board face, a ray from the camera through the exact touch point ...
  assert.match(SCENE, /private localOnBoard\(/);
  assert.match(SCENE, /setFromNormalAndCoplanarPoint/);
  assert.match(SCENE, /intersectPlane\(/);
  // ... into the board's 1920×1080 layout box, with the exact inverse of
  // CSS3DRenderer's transform (object +Y is the element's TOP — CSS y is
  // downward — so the y term is negated).
  assert.match(SCENE, /const x = lx \/ PX_TO_M \+ SCREEN_PX_WIDTH \/ 2;/);
  assert.match(SCENE, /const y = -dy \/ PX_TO_M \+ SCREEN_PX_HEIGHT \/ 2;/);
  // ... and a faithful synthetic replay (pointerdown/up, click, pointercancel).
  assert.match(SCENE, /new PointerEvent\(/);
  assert.match(SCENE, /\.dispatchEvent\(/);
  // FAITHFUL means the legacy mouse half too: panels wire controls to
  // onMouseDown (the notes editor's whole formatting toolbar), and a
  // pointer-only replay left every one of those dead under the bridge while
  // the same board worked pinched out (native path). mousedown rides at the
  // native moment (after pointerdown), mouseup before the click.
  assert.match(SCENE, /private syntheticMouse\(/);
  assert.match(SCENE, /new MouseEvent\(/);
  assert.match(SCENE, /this\.syntheticMouse\("mousedown"/);
  assert.match(SCENE, /this\.syntheticMouse\("mouseup"/);
  // And the pointerdown DEFAULT ACTION is reproduced by hand: synthetic
  // events carry no focus/caret, which is why typing in the notes editor
  // never worked under the bridge. The bridge focuses the editable the
  // finger touched and places the caret at the finger's coordinates, unless
  // the panel cancelled mousedown to manage focus itself.
  assert.match(SCENE, /private focusTapTarget\(/);
  assert.match(SCENE, /el\.focus\(\{ preventScroll: true \}\)/);
  assert.match(SCENE, /caretRangeFromPoint|caretPositionFromPoint/);
  assert.match(SCENE, /if \(!mouse\.defaultPrevented\) this\.focusTapTarget\(/);
  // Targeting is PAINT ORDER (elementFromPoint), not document order: the
  // panels portal dropdown menus to <body>, outside the board element, and
  // overlay viewers stack absolutely-positioned planes — the old
  // last-in-document-order scan picked the wrong element in both.
  assert.match(SCENE, /document\.elementFromPoint\(x, y\)/);
  assert.match(SCENE, /private bridgeMayTarget\(/);
  // The bridge owns the mis-delivered touch the moment it re-aims it.
  const down = SCENE.slice(SCENE.indexOf("private onPointerDown"), SCENE.indexOf("private onPointerMove"));
  assert.match(down, /if \(this\.boardTarget\(e\.target\)\) return;/);
  assert.match(down, /e\.preventDefault\(\);/);
  assert.match(down, /this\.localOnBoard\(e\)/);
  // ... and scrolls the panel's overflow boxes itself, because native touch
  // scroll is a compositor gesture a synthetic pointermove cannot drive.
  assert.match(SCENE, /el\.scrollTop = THREE\.MathUtils\.clamp\(el\.scrollTop - dly/);
  assert.match(SCENE, /el\.scrollLeft = THREE\.MathUtils\.clamp\(el\.scrollLeft - dlx/);

  // Prove the px mapping's constants: with PX_TO_M = 30/1920 the four
  // corners of the board's object frame must land on the four corners of
  // the 1920×1080 element (the mirror of the pinned formula above).
  const L = solveLectern();
  const pxPerM = L.W / 1920;
  const H = (L.W * 9) / 16;
  for (const [lxM, lyM, expectX, expectY] of [
    [-L.HW, H / 2, 0, 0],
    [L.HW, H / 2, 1920, 0],
    [-L.HW, -H / 2, 0, 1080],
    [L.HW, -H / 2, 1920, 1080],
  ]) {
    const x = lxM / pxPerM + 960;
    const y = -lyM / pxPerM + 540;
    assert.ok(Math.abs(x - expectX) < 1e-9 && Math.abs(y - expectY) < 1e-9,
      `board corner (${lxM}, ${lyM}) maps to (${x}, ${y}), not (${expectX}, ${expectY})`);
  }
});

test("board framing is square-on the face normal at every aspect", () => {
  // The camera parks ON the board's face normal (orbit target = the board's
  // own centre, pitch 0), so the full-screen board projects as an exact
  // rectangle. The floating page letterboxes into the HUD-free rect so a
  // landscape phone is not a shrunk overlay in front of the 3D shell.
  const focusBoard = SCENE.slice(SCENE.indexOf("private focusBoard(slot: LecternSlot)"), SCENE.indexOf("private fitStudyDistance"));
  assert.match(focusBoard, /this\.orbit\.panTo\(this\.tmpV\.copy\(placement\.position\), distance, placement\.yaw, 0\)/);
  assert.ok(!/nx|ny|rightX|rightZ/.test(focusBoard), "the target offset that sheared the board is gone");
  assert.match(SCENE, /private fitStudyDistance\(needW: number, needH: number\)/);
  assert.match(SCENE, /studyLetterbox\(this\.viewW, this\.viewH, this\.hudInsets/);
  assert.match(SCREENS, /export function studyLetterbox/);

  const L = solveLectern();
  const H = (L.W * 9) / 16;
  const chrome = { top: 48, bottom: 80, left: 12, right: 12 };
  const gutter = 8;
  for (const [viewW, viewH] of [[390, 844], [844, 390], [1180, 820], [1920, 1080], [320, 568]]) {
    const padT = chrome.top + gutter;
    const padB = chrome.bottom + gutter;
    const padL = chrome.left + gutter;
    const padR = chrome.right + gutter;
    const usableW = Math.max(48, viewW - padL - padR);
    const usableH = Math.max(48, viewH - padT - padB);
    const boardAspect = 1920 / 1080;
    let pinW;
    let pinH;
    if (usableW / usableH > boardAspect) {
      pinH = usableH;
      pinW = pinH * boardAspect;
    } else {
      pinW = usableW;
      pinH = pinW / boardAspect;
    }
    const pinX = padL + (usableW - pinW) / 2;
    const pinY = padT + (usableH - pinH) / 2;
    assert.ok(pinW <= usableW + 0.5, `${viewW}x${viewH}: pin wider than the free rect`);
    assert.ok(pinH <= usableH + 0.5, `${viewW}x${viewH}: pin taller than the free rect`);
    assert.ok(pinX >= padL - 0.5, `${viewW}x${viewH}: pin eats the left chrome`);
    assert.ok(pinY >= padT - 0.5, `${viewW}x${viewH}: pin eats the top chrome`);
    assert.ok(pinX + pinW <= viewW - padR + 0.5, `${viewW}x${viewH}: pin eats the right chrome`);
    assert.ok(pinY + pinH <= viewH - padB + 0.5, `${viewW}x${viewH}: pin sits under the tray`);
    assert.ok(Math.abs(pinW / pinH - L.W / H) < 0.02, `${viewW}x${viewH}: pin is not 16:9`);
  }
});

test("board panels keep native vertical scroll on touch", () => {
  // `pan-y`: the notes list and library scroll natively on a phone (they
  // could not while `manipulation`'s wider gesture set — and the old
  // `manipulation` also let a double-tap inside the board page-zoom the
  // whole app). JS-driven gestures (mind-map pan/zoom) use pointer events
  // and are unaffected.
  assert.match(SCREENS, /element\.style\.touchAction = "pan-y"/);
  assert.ok(!/touchAction = "manipulation"/.test(SCREENS), "manipulation re-enables the double-tap delay the brief killed");
});

test("the DOM boards are culled the way BGMI culls the world", () => {
  // 1. An idle camera writes no styles at all.
  assert.match(SCREENS, /if \(!moved\) return;/);
  // 2. Frustum + back-face culled per board.
  assert.match(SCREENS, /frustum\.intersectsSphere\(sphere\)/);
  assert.match(SCREENS, /boardNormal\.dot\(toCamera\) > 0/);
  // 3. Camera culling suppresses paint, never detaches/stops a live video.
  assert.match(SCREENS, /style\.opacity = visible \? "1" : "0"/);
  assert.match(SCREENS, /visible \|\| screen\.slot === "reading" \? "visible" : "hidden"/);
  assert.doesNotMatch(SCREENS, /style\.display =/);

  // 4. Reading one board drops the ambient world to a quarter rate, the same
  //    trade BGMI makes when the scope opens.
  assert.match(SCENE, /private studyFocus = false;/);
  assert.match(SCENE, /const study = this\.studyFocus;/);
  assert.match(SCENE, /study \? 1 \/ 12 : 1 \/ 30/);
  assert.match(SCENE, /study \? 1 \/ 8 : 1 \/ 20/);
  // Leaving a board view must restore the full world.
  // Leaving a single-board view restores the full world. Asserted on the
  // slice of focus() itself rather than a brittle character window, so
  // unrelated lines added to the preamble cannot break it.
  const focusBody = SCENE.slice(SCENE.indexOf("focus(preset: ViewPreset) {"));
  const preamble = focusBody.slice(0, focusBody.indexOf("switch (preset)"));
  assert.match(preamble, /this\.studyFocus = false;/);
});

test("the student can look a full 90 degrees straight up", () => {
  // Was clamped 3 degrees short against gimbal flip. That only applies when an
  // orientation is RECOVERED from a direction vector; this rig stores yaw and
  // pitch and only writes them, so the pole is an ordinary rotation.
  assert.match(CONTROLS, /clamp\(this\.pitch - dy, -1\.52, Math\.PI \/ 2\)/);
  assert.ok(!/clamp\(this\.pitch - dy, -1\.52, 1\.52\)/.test(CONTROLS), "the 87-degree cap is back");
});

test("the student has a desk in front of the chair", () => {
  assert.match(LECTERN, /export function createDesk/);
  assert.match(SCENE, /this\.desk = createDesk\(/);
  assert.match(SCENE, /this\.scene\.add\(this\.desk\)/);
  // Between the chair and the boards, not behind the learner.
  assert.match(LECTERN, /const z = LECTERN_PIVOT_Z - 1\.05;/);
  // And it is cleaned up.
  assert.match(SCENE, /disposeGroup\(this\.desk\)/);
});

// ─────────────────────────────────────────────────────────────────────────
//  Group 14 — zooming all the way out must still show the world
//
//  Pulling back far enough used to reach a point where nothing was visible:
//  a black/grey screen, or a view from underneath the ground, or from outside
//  the world looking at its edge. Those are THREE separate failures that all
//  arrive together, so all three are pinned here.
// ─────────────────────────────────────────────────────────────────────────

test("the orbit zoom-out limit is derived from the world, not guessed", () => {
  // The old cap was a hardcoded 2400 m — nearly twice the 1380 m plate, so
  // the camera flew clean off its own terrain.
  assert.ok(
    !/clamp\(this\.targetDistance \* factor, 2\.4, 2400\)/.test(CONTROLS),
    "the hardcoded 2400 m zoom cap is back",
  );
  assert.match(CONTROLS, /get maxDistance\(\): number/);
  assert.match(CONTROLS, /const usable = WORLD_HALF \* 0\.93;/);
  assert.match(CONTROLS, /clamp\(this\.targetDistance \* factor, 2\.4, this\.maxDistance\)/);

  // The cap depends on PITCH, so it has to be re-applied in update() too —
  // tilting down after zooming, or a panTo() preset, both bypass zoom().
  assert.match(CONTROLS, /const cap = this\.maxDistance;/);
  assert.match(CONTROLS, /if \(this\.targetDistance > cap\) this\.targetDistance = cap;/);
  assert.match(CONTROLS, /if \(this\.distance > cap\) this\.distance = cap;/);
});

test("the camera can never orbit off its own terrain plate", () => {
  const WORLD_REACH = Number(/WORLD_REACH = (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  const WORLD_HALF = WORLD_REACH + 200;
  const usable = WORLD_HALF * 0.93;
  // Skybox hard cap: camera stays inside the sky dome (never leaves the skybox).
  const flyMatch = /FLY_LIMIT_RADIUS\s*=\s*(\d+)/.exec(read("src/nature3d/engine/terrain.ts"));
  const FLY_LIMIT_RADIUS = flyMatch ? Number(flyMatch[1]) : 1180;
  const ceiling = Math.min(FLY_LIMIT_RADIUS * 1.35, WORLD_HALF * 1.55);
  const maxDistance = (pitch) => {
    const cp = Math.cos(pitch);
    return cp < 0.05 ? ceiling : Math.min(usable / cp, ceiling);
  };

  // Ground reach is cos(pitch) * distance. At every pitch it must stay on the
  // plate, which is what stops the "out of the world" view.
  for (const pitch of [0.03, 0.12, 0.3, 0.34, 0.5, 0.8, 1.2, 1.5]) {
    const reach = Math.cos(pitch) * maxDistance(pitch);
    assert.ok(
      reach <= WORLD_HALF,
      `at pitch ${pitch} the camera sits ${reach.toFixed(0)} m out, past the ${WORLD_HALF} m plate`,
    );
  }

  // Looking straight down, cos goes to zero and `usable / cp` runs away to
  // 16 km — outside every tier's far plane. The skybox-safe ceiling catches it.
  assert.match(CONTROLS, /skyboxSafe/);
  assert.match(CONTROLS, /FLY_LIMIT_RADIUS/);
  assert.ok(maxDistance(Math.PI / 2 - 0.001) <= ceiling, "a top-down view must be bounded by altitude");
  // Sky dome is camera-locked at ~farPlane * 0.48 — orbit must stay well
  // inside that radius so the eye never sits outside the sphere.
  const minFar = 6200;
  const skyRadius = minFar * 0.48;
  assert.ok(ceiling < skyRadius, `orbit ceiling ${ceiling} must be inside sky radius ${skyRadius}`);
  assert.match(read("src/nature3d/engine/sky.ts"), /dome\.position\.copy\(camera\.position\)/, "sky follows the camera");
});

test("the ground floor is sampled on the plate, so it cannot fake a hill", () => {
  // `terrainHeight` is analytic and has no domain limit: outside the drawn
  // plate it keeps returning hill values for ground that was never built, so
  // the floor clamp was shoving the camera up to clear phantom terrain — or
  // judging it underground while it floated over nothing.
  assert.match(CONTROLS, /const sx = THREE\.MathUtils\.clamp\(camera\.position\.x, -WORLD_HALF, WORLD_HALF\)/);
  assert.match(CONTROLS, /const sz = THREE\.MathUtils\.clamp\(camera\.position\.z, -WORLD_HALF, WORLD_HALF\)/);
  assert.match(CONTROLS, /const floor = terrainHeight\(sx, sz\) \+ 0\.9;/);
  assert.ok(
    !/const floor = terrainHeight\(camera\.position\.x, camera\.position\.z\)/.test(CONTROLS),
    "the floor must not be sampled at the unclamped position",
  );
});

test("the fully zoomed-out world is not fogged into a grey screen", () => {
  const WORLD_REACH = Number(/WORLD_REACH = (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  const WORLD_HALF = WORLD_REACH + 200;
  const densities = [...QUALITY.matchAll(/fogDensity: ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.equal(densities.length, 4, "every tier needs a fog density");

  // FogExp2 is exponential in the SQUARE of distance. At 0.0006 the far rim
  // was 49 % obscured at the new cap and 87 % at the old one — the grey-out.
  const cap = (WORLD_HALF * 0.93) / Math.cos(0.34);
  for (const density of densities) {
    const obscured = 1 - Math.exp(-((cap * density) ** 2));
    assert.ok(
      obscured < 0.25,
      `fog hides ${(obscured * 100).toFixed(0)}% of the far rim at full zoom-out`,
    );
  }
});

test("every tier's far plane clears the far corner of the world", () => {
  const WORLD_REACH = Number(/WORLD_REACH = (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  const WORLD_HALF = WORLD_REACH + 200;
  const planes = [...QUALITY.matchAll(/farPlane: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(planes.length, 4, "every tier needs a far plane");

  // Worst case is the steep top-down view, where the camera is highest: the
  // opposite corner of the plate is the furthest thing that can be on screen.
  const ceiling = WORLD_HALF * 2;
  const worstCorner = Math.hypot(WORLD_HALF, WORLD_HALF, ceiling * 0.95);
  for (const plane of planes) {
    assert.ok(
      plane >= 3400,
      `far plane ${plane} slices the far hills off at full zoom-out (corner is ~${worstCorner.toFixed(0)} m)`,
    );
  }
});

test("the establishing shot still frames all three districts after the cap", () => {
  const WORLD_REACH = Number(/WORLD_REACH = (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  const WORLD_HALF = WORLD_REACH + 200;
  const spread = Number(/centerX: (\d+)/.exec(read("src/nature3d/engine/regions.ts"))[1]);
  // The preset asks for 1500 m; the cap pulls it in to ~1361 m at pitch 0.34.
  const settled = Math.min(1500, (WORLD_HALF * 0.93) / Math.cos(0.34));

  for (const aspect of [2.4, 16 / 9, 4 / 3, 1, 0.86, 0.6]) {
    const base = 52;
    let fov = base;
    if (aspect < 16 / 9) {
      fov = (Math.atan((Math.tan((base * Math.PI) / 360) * (16 / 9)) / aspect) * 360) / Math.PI;
    }
    fov = Math.min(fov, 100);
    const halfWidth = Math.tan(Math.atan(Math.tan((fov * Math.PI) / 360) * aspect)) * settled;
    assert.ok(
      halfWidth > spread,
      `at aspect ${aspect.toFixed(2)} the capped distance shows only ${halfWidth.toFixed(0)} m`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────
//  Group 15 — real entitlements, empty boards, no ground animals, 90° neck
// ─────────────────────────────────────────────────────────────────────────

const OWNED = read("src/nature3d/boards/useOwnedCourses.ts");

test("course ownership is resolved from every source, not just the legacy one", () => {
  // `purchasedIds` alone is only `users/{uid}/purchases/*` — the narrowest of
  // the five places access can live, so subscribers saw an empty library.
  assert.match(OWNED, /collectEntitlementOwnership/);
  assert.match(OWNED, /isSubscriptionRecordActive/);
  assert.match(OWNED, /entitlements:\$\{uid\}/);
  assert.match(OWNED, /users\/\$\{uid\}\/subscription\/current/);
  assert.match(OWNED, /purchasedProductIds/);

  // The shared-snapshot helpers mean these join the listeners the player and
  // the catalogue already hold, rather than opening duplicates.
  assert.match(OWNED, /subscribeShared\b/);
  assert.match(OWNED, /subscribeSharedDoc\b/);

  // An expired plan must stop unlocking courses.
  assert.match(OWNED, /setSubscriptionIds\(active \? new Set\(included\) : new Set\(\)\)/);

  // The page uses it instead of the old narrow filter.
  assert.match(PAGE, /useOwnedCourses\(\)/);
  assert.ok(
    !/purchasedIds\.has\(p\.id\)/.test(PAGE),
    "the page must not fall back to the legacy purchases-only filter",
  );
});

test("no catalogue course is auto-selected; unpicked boards have a private saveable scope", () => {
  assert.doesNotMatch(PAGE, /activeCourse=\{ownedCourses\[0\]/);
  assert.match(STUDY_BOARDS, /const \[selectedCourseId, setSelectedCourseId\] = useState<string \| null>\(null\)/);
  assert.match(STUDY_BOARDS, /const \[selectedModuleId, setSelectedModuleId\] = useState<string \| null>\(null\)/);
  // Empty ONLY on first use: returning learners must see their own saved
  // personal work. An unscoped editable panel was the original save bug.
  assert.match(STUDY_BOARDS, /SANCTUARY_PERSONAL_SCOPE = "__sanctuary__"/);
  assert.match(STUDY_BOARDS, /const productId = activeCourse\?\.id \?\? \(uid \? SANCTUARY_PERSONAL_SCOPE : null\)/);
  assert.match(STUDY_BOARDS, /if \(selectedCourseId && !activeCourse\)/);
});

test("the learner picks the course and then the module themselves", () => {
  // Selection is lifted out of the reading board so all three boards agree.
  assert.match(READING_BOARD, /courseId: string \| null;/);
  assert.match(READING_BOARD, /onSelectCourse: \(id: string \| null\) => void;/);
  assert.match(READING_BOARD, /moduleId: string \| null;/);
  assert.match(READING_BOARD, /onSelectModule: \(id: string \| null\) => void;/);
  // Opening a resource reports the module it came from...
  assert.match(READING_BOARD, /onOpen: \(f: CourseFile, moduleId: string\) => void/);
  assert.match(READING_BOARD, /onOpen\(f, module\.id\)/);
  // ...and the mind map scopes to it, exactly as the player does. Until a
  // resource is opened there is no module id, so the board falls back to the
  // course's own bucket — an UNSCOPED hook writes nothing at all, which is why
  // maps drawn on the board used to vanish (see
  // tests/sanctuaryMindMapScopeContract.test.mjs).
  assert.match(STUDY_BOARDS, /moduleId: boardModuleId \?\? undefined/);
  assert.match(STUDY_BOARDS, /const boardModuleId = selectedModuleId \?\? \(productId \? SANCTUARY_COURSE_MAP_SCOPE : null\);/);
});

test("the boards reuse the player panels and cloud hooks, with isolated editor sessions", () => {
  // The brief is explicit that the design must not change: same toolbar, same
  // editor, same library. So they are imported, never re-implemented.
  assert.match(STUDY_BOARDS, /import NotesPanel from "\.\.\/\.\.\/course\/NotesPanel"/);
  assert.match(STUDY_BOARDS, /import\("\.\.\/\.\.\/course\/MindMapPanel"\)/);
  assert.match(STUDY_BOARDS, /import useCourseMindMap from "\.\.\/\.\.\/course\/useCourseMindMap"/);
  // The DATA layer is the player's own too — the same cloud hook, so a note
  // written on the board is the same Firestore document the player shows.
  assert.match(STUDY_BOARDS, /import useCourseNotes from "\.\.\/\.\.\/course\/useCourseNotes"/);
  assert.match(STUDY_BOARDS, /const \{ notes, add, edit, remove, flush, status, errorMessage, lastSavedAt \} = useCourseNotes\(\{/);
  assert.match(STUDY_BOARDS, /const notes = useBoardNotes\(uid, productId\)/);
  assert.match(STUDY_BOARDS, /sessionKey=\{notesSessionKey\}/);
  assert.match(STUDY_BOARDS, /notes=\{notes\.notes\}/);
});

test("animals standing on the ground are gone, birds are not", () => {
  // The meadow herd: constructed with a zero budget rather than deleted, so
  // the fur material, the species banks and the update/dispose paths all stay
  // honest. (Verified separately: every tier yields 0 meshes.)
  assert.match(SCENE, /createWildlife\(\{ \.\.\.this\.budget, animalCount: 0 \}/);

  assert.match(SCENE, /this\.birds = createBirds/);
  assert.doesNotMatch(SCENE, /createSafariDistrict/);
});

test("looking up must not flip the picture upside down", () => {
  // REGRESSION. The up vector was built by rotating the tilted view a quarter
  // turn about the right axis and then NEGATING it. That yields (0,-1,0) at
  // rest — the camera upside down — so the picture flipped the instant the
  // neck left zero, and only then travelled upward. Rotating the other way
  // flips it just the same: the sign has to match the tilt, so there is no
  // negate and no minus in this expression.
  assert.match(
    CONTROLS,
    /ORBIT_UP\.copy\(ORBIT_TILTED\)\.applyAxisAngle\(ORBIT_RIGHT, Math\.PI \/ 2\);/,
  );
  const upLine = CONTROLS.split("\n").find((l) => l.includes("ORBIT_UP.copy("));
  assert.ok(upLine && !/negate|-Math\.PI/.test(upLine), `up vector must not be inverted: ${upLine}`);

  // And it applies to every camera again, not just the desk — the per-view
  // gate existed only to contain this bug and is gone with it.
  assert.ok(
    !/lookUpAllowed|setLookUpAllowed/.test(CONTROLS + SCENE),
    "looking up is available from every camera",
  );
});

test("any camera can be rotated, and the seated student can look straight up", () => {
  // An orbit camera looks AT its target, so its view can never point above
  // the horizon however far the pitch is pushed — that is why the sky was
  // unreachable. Looking up is a separate degree of freedom applied to the
  // view direction, with the camera left where it is.
  assert.match(CONTROLS, /lookUp = 0;/);
  assert.match(CONTROLS, /private targetLookUp = 0;/);
  assert.match(CONTROLS, /const LOOK_UP_MAX = Math\.PI \/ 2;/);

  // The ceiling carries the orbit's own downward tilt, or a flat PI/2 tops
  // out at 88.3 degrees instead of a full 90.
  assert.match(CONTROLS, /const ceiling = LOOK_UP_MAX \+ this\.targetPitch;/);

  // The pole must not degenerate: an explicit perpendicular up vector is
  // supplied rather than relying on lookAt's default.
  assert.match(CONTROLS, /camera\.up\.copy\(ORBIT_UP\)/);
  // (The exact form of the up vector is pinned by the flip test above — this
  // assertion used to pin the inverted version, which is how the bug shipped.)
  assert.match(CONTROLS, /applyAxisAngle\(ORBIT_RIGHT, Math\.PI \/ 2\)/);
  // ...and restored the moment the neck is level, or every later view rolls.
  assert.match(CONTROLS, /camera\.up\.set\(0, 1, 0\);/);

  // A preset frames something specific, so it resets the neck.
  assert.match(CONTROLS, /this\.targetLookUp = 0;\s*\n\s*this\.target\.copy\(target\)/);

  // The frame path allocates nothing.
  assert.match(CONTROLS, /const ORBIT_DIR = new THREE\.Vector3\(\);/);
  const update = CONTROLS.slice(CONTROLS.indexOf("update(dt: number, camera"));
  assert.ok(
    !/new THREE\.(Vector3|Quaternion)/.test(update.slice(0, update.indexOf("\n  }"))),
    "OrbitRig.update must not allocate",
  );
});

// ─────────────────────────────────────────────────────────────────────────
//  Group 16 — the boards are the real course player, and the lesson board
//             is scenery on the hill
// ─────────────────────────────────────────────────────────────────────────

test("the boards render inside the course-player style scope", () => {
  // THE BUG behind "the toolbar doesn't look or work like the real editor".
  // Every course-player surface — the rich-text toolbar, note cards, mind-map
  // chrome — is styled through CSS custom properties (--course-border,
  // --course-text, --course-surface, --dc-chrome-glass ...) that are declared
  // ON `.course-player-shell` and inherited by its descendants. The 3D boards
  // rendered outside it, so those variables resolved to nothing: borders,
  // plates and ink all vanished and the editor stopped looking like itself.
  assert.match(READING_BOARD, /className="course-player-shell flex h-full w-full flex-col/);

  // Proof the scope really is where the tokens live, so this is not cargo cult.
  const css = read("src/index.css");
  const scope = css.slice(css.indexOf(".course-player-shell {"));
  const block = scope.slice(0, scope.indexOf("}"));
  for (const token of ["--course-text", "--course-border", "--course-surface"]) {
    assert.ok(block.includes(token), `${token} is scoped to .course-player-shell`);
  }
  // StudyLibraryPage hosts the same panels the same way.
  assert.match(read("src/personal-library/StudyLibraryPage.tsx"), /course-player-shell/);
});

test("side boards isolate personal/course/account data and require sign-in to edit", () => {
  assert.match(STUDY_BOARDS, /notes=\{notes\.notes\}/);
  assert.match(STUDY_BOARDS, /useBoardNotes\(uid, productId\)/);
  assert.match(STUDY_BOARDS, /const productId = activeCourse\?\.id \?\? \(uid \? SANCTUARY_PERSONAL_SCOPE : null\)/);
  assert.match(read("src/course/notesStore.ts"), /`dc\.courseNotes\.\$\{uid\}\.\$\{productId\}`/);
  assert.match(STUDY_BOARDS, /productId: productId \?\? undefined,/);
  assert.doesNotMatch(STUDY_BOARDS, /productId: productId \?\? ""/);
  assert.match(STUDY_BOARDS, /signedIn \? <NotesPanel/);
  assert.match(STUDY_BOARDS, /signedIn \? <MindMapPanel/);
  assert.match(STUDY_BOARDS, /Sign in to create and save/);
});

test("the lesson board sits where a seated learner can read it", () => {
  // Numbers come from measuring the real terrain along the sight lines the
  // chair actually has, not from taste:
  //   - study boards cover -41.3..+41.3 deg, so -45 deg is the first clear
  //     bearing; it is also the highest ground outside the fan
  //   - crest there: 380 m out, 38.3 m high => ~5.5 deg above eye level, so it
  //     reads as "up on the mountain" rather than beside the boards
  //   - 8x scale => 38 m wide => ~5.7 deg, about as big as a study board looks
  //     from the desk, and the texture is 2048 px so it stays sharp
  assert.match(BOARD, /export const BOARD_HILL/);
  assert.match(SCENE, /this\.board\.group\.rotation\.y = BOARD_HILL\.yaw/);
  assert.match(SCENE, /this\.board\.group\.scale\.setScalar\(BOARD_HILL\.scale\)/);

  // The stand is derived from the board's scaled size and the ground under it,
  // so it cannot float or leave a gap when the terrain changes.
  assert.match(BOARD, /const groundY = terrainHeight\(hill\.position\.x, hill\.position\.z\)/);
  assert.match(BOARD, /const legLength = hill\.position\.y - halfH - groundY \+ 3/);

  // The lesson text itself is untouched — the brief was to keep it.
  assert.match(BOARD, /ctx\.fillText\("Morning Nature Study"/);
});

// ─────────────────────────────────────────────────────────────────────────
//  Group 17 — time of day: a real moving sun, and morning/midday/evening
// ─────────────────────────────────────────────────────────────────────────

const DAYLIGHT = read("src/nature3d/engine/daylight.ts");
const SETTINGS = read("src/nature3d/SanctuarySettings.tsx");
// SKY and WATER are already declared at the top of this file — reuse them.

test("the sun is computed from the clock, not keyframed", () => {
  // Three presets plus a crossfade cannot answer "where is the sun at 10:40":
  // blending two directions cuts the chord of the arc, so the sun would sag
  // below its true path all mid-morning. The arc is evaluated from the hour
  // instead, and the named modes are just three hours through the same
  // function — so "auto" and "manual" can never drift apart.
  assert.match(DAYLIGHT, /export function daylightAt\(hour: number\): DaylightState/);
  assert.match(DAYLIGHT, /export const MODE_HOURS/);
  assert.match(DAYLIGHT, /hourForMode = \(mode: DaylightMode, now: Date = new Date\(\)\)/);
  assert.match(DAYLIGHT, /mode === "auto" \? clampToDaylight\(currentHour\(now\)\) : MODE_HOURS\[mode\]/);
  // Elevation on a sine and azimuth sweeping east→west — an actual arc.
  assert.match(DAYLIGHT, /Math\.sin\(Math\.PI \* t\) \* MAX_ELEVATION/);
  assert.match(DAYLIGHT, /const azimuth = \(1 - 2 \* t\) \* HORIZON_SWING/);

  // Verified numerically against the real module (hours 6.00 → 18.50):
  //   azimuth  +70.0 → -70.0 deg, strictly decreasing  (east to west)
  //   elevation 10.0 → 72.0 → 10.0 deg                 (rises, peaks, falls)
  //   intensity 1.42 → 3.15 → 1.42, exposure 1.031 → 1.160 → 1.031
  //   colour   #ff8b46 → #fff6e8 → #ff8242             (warm, white, warm)
});

test("brightness and warmth follow the sun's height", () => {
  // One driver for everything: dayFactor = sin(elevation) normalised, so
  // midday really is the brightest and the ends really are the warmest
  // without any of them being tuned by hand.
  assert.match(DAYLIGHT, /const dayFactor = THREE\.MathUtils\.clamp\(Math\.sin\(elevation\) \/ Math\.sin\(MAX_ELEVATION\), 0, 1\)/);
  assert.match(DAYLIGHT, /sunIntensity: THREE\.MathUtils\.lerp\(1\.28, 3\.15, dayFactor\)/);
  assert.match(DAYLIGHT, /exposure: THREE\.MathUtils\.lerp\(1\.02, 1\.16, dayFactor\)/);
  assert.match(DAYLIGHT, /const warm = 1 - THREE\.MathUtils\.smoothstep\(dayFactor, 0\.06, 0\.62\)/);
});

test("the dusk floor keeps evening and night a readable DARK GREEN", () => {
  // OWNER DIRECTIVE (2026-09-24): "raat ke samay aur shaam ke samay colour
  // ekdam black dikhta hai … dark green dikhna chahiye, na ki black."
  // Every curve has a LIFTED low-sun end (a camera's night adaptation) and
  // the dusk ground bounce stays green instead of turning olive-brown.
  assert.match(DAYLIGHT, /hemiIntensity: THREE\.MathUtils\.lerp\(1\.95, 1\.85, dayFactor\)/);
  assert.match(DAYLIGHT, /fillIntensity: THREE\.MathUtils\.lerp\(0\.8, 1\.05, dayFactor\)/);
  assert.match(DAYLIGHT, /hemiGround: lerpColor\(0x62b032, 0x3d8f2e, warm\)/);
  assert.ok(!/0x6a5a32/.test(DAYLIGHT), "the olive dusk bounce is what read as mud-black");
  // The baked panorama's night grade must dim, not black out (sky.ts). With
  // the real night scene the dip may go a little deeper than dusk (up to
  // 60 %), but the ANIME_NIGHT colour stays the light slate-blue — never a
  // black multiply.
  assert.match(SKY, /ANIME_NIGHT = new THREE\.Color\(0x46597e\)/);
  assert.match(SKY, /\(1 - state\.dayFactor\) \* \(0\.42 \+ 0\.18 \* state\.night\)/);
  // And the dusk haze tint is multiplied INTO the fog, so it must stay pale.
  // Comment-stripped: palette.ts documents the old value it replaced.
  const PALETTE = read("src/nature3d/engine/palette.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(PALETTE, /haze: new THREE\.Color\(0xe0b489\)/);
  assert.ok(!/0xc49262/.test(PALETTE), "the dark ochre dusk haze is back");
});

test("night is a real starlit scene, and the sun never touches the horizon", () => {
  // OWNER DIRECTIVE (2026-09-29): "abhi kya hai ki raat nahin hoti hai,
  // raat wala bhi scene design karo." The clock's night hours are REAL now:
  // clampToDaylight folds the pre-sunrise hours past midnight onto one
  // timeline (0:00–6:00 → 24:00–30:00) instead of clamping to the sunset,
  // and daylightAt blends a dedicated night state across two 1.5 h
  // twilights — dusk melts into starlight, starlight melts into dawn.
  assert.match(DAYLIGHT, /const h = \(\(hour % 24\) \+ 24\) % 24;/);
  assert.match(DAYLIGHT, /return h < DAY_START \? h \+ 24 : h;/);
  assert.match(DAYLIGHT, /function nightAmount\(h: number\): number/);
  assert.match(DAYLIGHT, /function nightState\(h: number\): DaylightState/);
  // The moon TAKES OVER the sun's slot (one arc, opposite half of the
  // clock) so every consumer — shadow rig, water glint, dome disc — renders
  // moonlight with no per-consumer wiring.
  assert.match(DAYLIGHT, /sunDir: moonDir/);
  assert.match(DAYLIGHT, /night: 1/);
  // Still a study space: the night is deep blue and GREEN-floored, never a
  // black screen (the standing "dark green dikhna chahiye, na ki black"
  // directive) — a lifted exposure and a green ground bounce.
  assert.match(DAYLIGHT, /hemiGround: new THREE\.Color\(0x1c3a24\)/);
  assert.match(DAYLIGHT, /exposure: 0\.98/);
  // The dome shader owns the stars: a uNight-driven field (twilight blends
  // it in), and the moon rides the sun-disc code.
  assert.match(SKY, /uniform float uNight;/);
  assert.match(SKY, /float stars\(vec3 dir, float h\)/);
  assert.match(SKY, /domeMat\.uniforms\.uNight\.value = state\.night/);
  // At exactly 0 elevation the shadow frustum degenerates and shadows stretch
  // to infinity — which reads as a black screen, not a sunset. 10° is the
  // floor now: at 4° the ground lost the sun entirely (dot N,L = 0.07) and
  // the shadow map raked the meadow at a grazing angle — the second half of
  // the "shaam ko sab black dikhta hai" report.
  assert.match(DAYLIGHT, /const MIN_ELEVATION = THREE\.MathUtils\.degToRad\(10\)/);
  assert.match(DAYLIGHT, /Math\.max\(Math\.sin\(Math\.PI \* t\) \* MAX_ELEVATION, MIN_ELEVATION\)/);
});

test("time-of-day smoke: dawn haze burns off, day is clear, dusk and night keep it", () => {
  // OWNER DIRECTIVE (2026-09-29): "subah ke samay thoda sa smoke …
  // jaise-jaise sun aata hai smoke gayab hone lagte hain … din mein hat
  // jaaye, aur shaam aur raat mein rahe." daylight.ts publishes the curve,
  // scene.applyDaylight turns it into the live fog ramp.
  assert.match(DAYLIGHT, /export function smokeForHour\(h: number\): number/);
  assert.match(DAYLIGHT, /smoke: smokeForHour\(h\)/);
  const applyBody = SCENE.slice(SCENE.indexOf("private applyDaylight()"));
  assert.match(applyBody, /const smoke = state\.smoke;/);
  assert.match(applyBody, /fog\.near = this\.budget\.fogNear \* \(1\.5 - 0\.9 \* smoke\)/);
  assert.match(applyBody, /fog\.far = this\.budget\.fogFar \* \(1 - 0\.58 \* smoke\)/);
  // THE SMOKE REDUCTION (same brief): the tier budget itself breathes —
  // fogNear 16 → 90 m of guaranteed-clear air, fogFar 420 → 4200 m so the
  // far range and the open sea resolve on a clear midday. Every tier.
  const nears = [...QUALITY.matchAll(/fogNear: (\d+)/g)].map((m) => Number(m[1]));
  const fars = [...QUALITY.matchAll(/fogFar: (\d+)/g)].map((m) => Number(m[1]));
  assert.equal(nears.length, 4);
  assert.equal(fars.length, 4);
  for (const n of nears) assert.ok(n >= 90, `fogNear ${n} must keep the near field clear`);
  for (const f of fars) assert.ok(f >= 4200, `fogFar ${f} must clear the far range`);
});

test("everything that reads the sun shares one vector", () => {
  // The water glint has to track the sun or the river sparkles from the dawn
  // position all evening. Rather than wiring an update through, the shader
  // holds the SAME Vector3 the sky writes — so the daylight code writes once
  // and every consumer follows, with no per-frame copying. The reflection
  // schedule itself is untouched, as the owner asked.
  assert.match(SKY, /sunDir: THREE\.Vector3;/);
  assert.match(SKY, /applyDaylight\(state: DaylightState\): void;/);
  assert.match(SKY, /sunDir\.copy\(state\.sunDir\)/);
  assert.match(WATER, /shader\.uniforms\.uSunDir = \{ value: sunDir \}/);
  assert.ok(
    !/uSunDir = \{ value: new THREE\.Vector3\(0\.62/.test(WATER),
    "the water must not keep its own frozen sun direction",
  );
  // The call grew a fourth argument — the live sky colours the water reflects —
  // but the contract is unchanged and now covers all THREE shared instances:
  // the sun vector, the haze colour and the sun colour are handed over by
  // reference, so `daylight.ts` still writes once and every consumer follows.
  assert.match(SCENE, /createWater\(this\.textures, this\.budget, this\.sky\.sunDir, \{/);
  assert.match(SCENE, /sky: this\.atmosphere\.uniforms\.uDcHazeColor\.value/);
  assert.match(SCENE, /sun: this\.atmosphere\.uniforms\.uDcSunColor\.value/);
  assert.ok(
    !/new THREE\.Color\(.*\).*createWater/s.test(SCENE),
    "the water must borrow the atmosphere's colours, not freeze its own",
  );
  // And the river fades into that air with everything else.
  assert.match(SCENE, /this\.water\.materials\.forEach\(\(m\) => this\.atmosphere\.register\(m\)\)/);

  // The shadow-casting light must sit on the real sun direction. The old
  // hardcoded (+44, 48, -50) offset was a permanent morning sun, so shadows
  // pointed the same way at dusk as at dawn — the tell that gives away a fake
  // moving sun.
  assert.match(SCENE, /this\.sky\.sun\.position\.copy\(this\.sky\.sunDir\)\.multiplyScalar\(70\)/);
  assert.ok(!/position\.set\(\s*\n?\s*this\.camera\.position\.x \+ 44/.test(SCENE));
});

test("the learner can switch lighting from the settings overlay", () => {
  // The mode tiles live on the settings overlay's Light page (the tray
  // itself holds only the gear). Five moments now: auto, morning, midday,
  // evening and — since the night scene — NIGHT.
  assert.match(SETTINGS, /const DAYLIGHT_MODES/);
  for (const mode of ["auto", "morning", "midday", "evening", "night"]) {
    assert.ok(SETTINGS.includes(`key: "${mode}"`), `${mode} must be offered`);
  }
  // Auto is the default, so the sanctuary matches the real world unprompted.
  assert.match(PAGE, /useState<DaylightMode>\("auto"\)/);
  assert.match(PAGE, /engineRef\.current\?\.setDaylightMode\(mode\)/);
  assert.match(SCENE, /setDaylightMode\(mode: DaylightMode\)/);
  // Auto re-reads the clock while the page is open — otherwise a long session
  // started in the morning would still be lit as morning at dusk.
  assert.match(SCENE, /if \(this\.daylightMode === "auto"\)/);
  assert.match(SCENE, /if \(this\.daylightClock >= 20\)/);
  // Moving the sun invalidates every shadow in the static shadow map.
  const applyBody = SCENE.slice(SCENE.indexOf("private applyDaylight()"));
  assert.match(applyBody.slice(0, applyBody.indexOf("\n  }")), /this\.requestShadowRefresh\(\)/);
});


test("Ice Age is an accessible reversible top-tray toggle independent of daylight", () => {
  const SETTINGS = read("src/nature3d/SanctuarySettings.tsx");
  assert.match(PAGE, /useState\(false\)/);
  assert.match(SETTINGS, /pressed=\{iceAge\}/);
  assert.match(SETTINGS, /ariaLabel="Ice Age"/);
  assert.match(PAGE, /engineRef\.current\?\.setIceAge\(next\)/);
  const seasonal = SCENE.slice(SCENE.indexOf("setIceAge(enabled"), SCENE.indexOf("setDaylightMode(mode"));
  assert.match(seasonal, /this\.winter\.setEnabled\(enabled\)/);
  assert.match(seasonal, /this\.water\.setFrozen\(enabled\)/);
  assert.match(seasonal, /this\.applyDaylight\(\)/);
  assert.doesNotMatch(seasonal, /this\.daylightMode =/);
  for (const target of ["terrain", "this.rocks.group", "this.structures.group", "this.desk", "this.screens.shells", "boardStand"]) {
    assert.ok(SCENE.includes(`this.winter.registerTree(${target}`));
  }
  assert.match(SCENE, /this\.winter\.dispose\(\)/);
});


test("winter reaches board faces and every palm frond material", () => {
  assert.match(SCENE, /this\.winter\.register\(boardMaterials\[4\], "board"\)/);
  assert.match(SCENE, /this\.screens\.setWinter\(enabled\)/);
  assert.match(FLORA, /foliageMaterials: \[[^\]]*frondMatSway, frondMatStill\]/);
});
