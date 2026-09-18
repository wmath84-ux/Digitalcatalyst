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
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const DESKTOP_SHELL = read("src/components/DesktopShell.tsx");
const MAIN = read("src/main.tsx");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SCENE = read("src/nature3d/engine/scene.ts");
const BOARD = read("src/nature3d/engine/board.ts");
const GRASS = read("src/nature3d/engine/grass.ts");
const WILDLIFE = read("src/nature3d/engine/wildlife.ts");
const FLORA = read("src/nature3d/engine/flora.ts");
const TERRAIN = read("src/nature3d/engine/terrain.ts");
const QUALITY = read("src/nature3d/engine/quality.ts");
const CONTROLS = read("src/nature3d/engine/controls.ts");
const STUDENT = read("src/nature3d/engine/student.ts");
const JOYSTICK = read("src/nature3d/components/Joystick.tsx");

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

test("the page renders inside the shell, so the side panel stays visible", () => {
  // DesktopAppHost bails out of the shell for full-bleed routes. The sanctuary
  // must NOT be in that list — the whole point is that it opens beside the rail.
  const bailout = MAIN.slice(MAIN.indexOf("Skip the shell on routes"), MAIN.indexOf("return (\n    <AppShell"));
  assert.ok(
    !bailout.includes("nature-studio"),
    "the sanctuary must not opt out of the desktop shell",
  );
  // And it publishes a title/subtitle for the shell's top bar.
  assert.match(MAIN, /3D Study Sanctuary/);
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

test("one finger drags the board on a screen-parallel plane", () => {
  assert.match(BOARD, /class BoardController/);
  assert.match(BOARD, /setFromNormalAndCoplanarPoint/, "the drag plane must face the camera");
  assert.match(BOARD, /pointerdown/);
  assert.match(BOARD, /pointermove/);
  assert.match(BOARD, /setPointerCapture/, "the finger must keep control outside the element");
  // Pinch + wheel push the board away / pull it closer.
  assert.match(BOARD, /pinchStart/);
  assert.match(BOARD, /setDepth\(/);
});

test("the board can never sink below the ground or leave the meadow", () => {
  const clamp = BOARD.slice(BOARD.indexOf("clamp() {"), BOARD.indexOf("/** Per-frame"));
  assert.match(clamp, /terrainHeight/, "the clamp must sample the real terrain");
  assert.match(clamp, /BOARD_HEIGHT \* 0\.5/, "it must account for the board's half height");
  assert.match(clamp, /MAX_RADIUS/);
  assert.match(clamp, /MAX_HEIGHT/);
  // The footprint (not just the centre) is sampled, so a slope cannot clip a corner.
  assert.ok(
    /for \(const \[ox, oz\] of/.test(clamp),
    "the clamp must sample several points under the board, not only its centre",
  );
  // And it runs every frame, not only on pointer events.
  assert.match(BOARD, /update\(dt: number\) \{[\s\S]*this\.clamp\(\);/);
});

test("the board stays readable by facing the viewer", () => {
  assert.match(BOARD, /faceCamera/);
  assert.match(BOARD, /Math\.atan2\(cam\.x - board\.position\.x/);
});

// ── 3. Grass to the horizon ───────────────────────────────────────────

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

test("first person is a camera only — the student body is hidden", () => {
  const setMode = SCENE.slice(SCENE.indexOf("setMode(mode: CameraMode)"), SCENE.indexOf("getMode()"));
  assert.match(setMode, /this\.student\.setVisible\(false\)/, "FPP must hide the body");
  assert.match(setMode, /this\.student\.setVisible\(true\)/, "orbit must bring it back");
  assert.match(STUDENT, /setVisible\(v\) \{\s*group\.visible = v;/);
  // And a hidden student must not burn CPU on animation.
  assert.match(STUDENT, /if \(!group\.visible\) return;/);
});

test("the FPP button and twin joysticks are wired to the engine", () => {
  assert.match(PAGE, /FPP/);
  assert.match(PAGE, /toggleMode/);
  assert.match(PAGE, /<Joystick[\s\S]*?onChange=\{onMoveStick\}/);
  assert.match(PAGE, /<Joystick[\s\S]*?onChange=\{onLookStick\}/);
  assert.match(PAGE, /setMoveStick/);
  assert.match(PAGE, /setLookStick/);
  // Sticks are only mounted in walk mode.
  assert.match(PAGE, /mode === "fpp" \? \(/);
});

test("the joystick never re-renders React while it is being dragged", () => {
  assert.ok(
    !/useState/.test(JOYSTICK),
    "the joystick must not hold its vector in React state — it would re-render at 60 Hz",
  );
  assert.match(JOYSTICK, /requestAnimationFrame/, "moves must be coalesced to one per frame");
  assert.match(JOYSTICK, /setPointerCapture/);
  assert.match(JOYSTICK, /touchAction: "none"/, "a drag must never scroll the page");
});

test("walking follows the ground and cannot enter the river", () => {
  assert.match(CONTROLS, /class FirstPersonRig/);
  assert.match(CONTROLS, /terrainHeight\(this\.position\.x, this\.position\.z\)/);
  assert.match(CONTROLS, /insideRiver\(/);
  assert.match(CONTROLS, /WALK_LIMIT/);
  // Keyboard capture must be gated, or arrow keys break the rest of the app.
  assert.match(CONTROLS, /if \(!this\.enabled\) return;/);
  assert.match(CONTROLS, /el\.tagName === "INPUT"/, "typing in a field must not drive the camera");
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
  // Heavy systems run on their own cadence.
  assert.match(SCENE, /this\.aiClock >= 1 \/ 30/);
  assert.match(SCENE, /this\.skyClock >= 1 \/ 20/);
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
  for (const sys of ["grass", "flora", "birds", "wildlife", "water", "sky", "board", "student", "textures"]) {
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
  for (const consumer of [GRASS, WILDLIFE, FLORA, BOARD, CONTROLS, STUDENT]) {
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
