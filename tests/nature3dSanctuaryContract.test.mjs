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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ROOT = new URL("../", import.meta.url);
const exists = (p) => existsSync(new URL(p, ROOT));
const listDir = (p) => readdirSync(new URL(p, ROOT));

const DESKTOP_SHELL = read("src/components/DesktopShell.tsx");
const MAIN = read("src/main.tsx");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const SCENE = read("src/nature3d/engine/scene.ts");
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

test("first person is a camera only — the student body is hidden", () => {
  const setMode = SCENE.slice(SCENE.indexOf("setMode(mode: CameraMode)"), SCENE.indexOf("getMode()"));
  assert.match(setMode, /this\.student\.setVisible\(false\)/, "FPP must hide the body");
  assert.match(setMode, /this\.student\.setVisible\(true\)/, "orbit must bring it back");
  assert.match(STUDENT, /setVisible\(v\) \{\s*group\.visible = v;/);
  // And a hidden student must not burn CPU on animation.
  assert.match(STUDENT, /if \(!group\.visible\) return;/);
});

test("FPP has ONE move stick — looking is done by swiping", () => {
  assert.match(PAGE, /FPP/);
  assert.match(PAGE, /toggleMode/);
  assert.match(PAGE, /<Joystick[\s\S]*?onChange=\{onMoveStick\}/);
  assert.match(PAGE, /setMoveStick/);
  // The look stick is gone: you swipe the screen while the other thumb walks.
  assert.ok(!/onLookStick/.test(PAGE), "the look joystick must be removed");
  assert.ok(!/setLookStick/.test(SCENE), "the engine must not keep a look-stick channel");
  assert.equal(
    (PAGE.match(/<Joystick/g) ?? []).length,
    1,
    "exactly one joystick — move only",
  );
  // Sticks are only mounted in walk mode.
  assert.match(PAGE, /mode === "fpp" \? \(/);
});

test("the move stick walks the camera FORWARD, not backwards", () => {
  // The camera's forward vector for a yaw rotation about +Y is
  // (-sin(yaw), 0, -cos(yaw)). The rig must use those signs; the original bug
  // was (+sin, +cos), i.e. exactly the reverse, so pushing up walked back.
  const body = CONTROLS.slice(CONTROLS.indexOf("const desiredX"), CONTROLS.indexOf("const a = damp(11"));
  assert.match(body, /desiredX = \(forward \* -sin \+ strafe \* cos\)/);
  assert.match(body, /desiredZ = \(forward \* -cos - strafe \* sin\)/);
  assert.match(CONTROLS, /const forward = -move\.y/, "stick up (y = -1) must mean forward");

  // Prove it numerically over a full turn rather than trusting the regex.
  const facing = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
  const move = (yaw, sx, sy) => {
    const forward = -sy, strafe = sx, sin = Math.sin(yaw), cos = Math.cos(yaw);
    return { x: forward * -sin + strafe * cos, z: forward * -cos - strafe * sin };
  };
  for (let deg = 0; deg < 360; deg += 15) {
    const yaw = (deg * Math.PI) / 180;
    const f = facing(yaw);
    const fwd = move(yaw, 0, -1);
    assert.ok(fwd.x * f.x + fwd.z * f.z > 0.999, `stick up must walk forward at yaw ${deg}`);
    const right = move(yaw, 1, 0);
    assert.ok(Math.abs(right.x * f.x + right.z * f.z) < 1e-9, `strafe must be perpendicular at yaw ${deg}`);
    assert.ok(Math.hypot(right.x - -f.z, right.z - f.x) < 1e-9, `strafe must go right at yaw ${deg}`);
  }
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

test("the student faces the board, not the backrest", () => {
  assert.ok(
    !/boy\.rotation\.y = Math\.PI/.test(STUDENT),
    "the boy is authored facing -Z already; a half-turn seats him backwards",
  );
  // The pose really is authored on the board side: everything that should
  // point at the board sits at negative z, and the chair back is at +z.
  for (const part of [
    /eye\.position\.set\(x, 0\.02, -0\.19\)/,
    /thigh\.position\.set\(x, 0\.86, -0\.2\)/,
    /hand\.position\.set\(0, -0\.4, -0\.24\)/,
  ]) {
    assert.match(STUDENT, part, "the boy's front must stay on the -Z (board) side");
  }
  assert.match(STUDENT, /post\.position\.set\(x, 1\.25, 0\.4\)/, "the chair back belongs behind him at +z");
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

test("the world is one connected chain of three districts", () => {
  const regions = read("src/nature3d/engine/regions.ts");
  for (const id of ["sanctuary", "safari", "trek"]) {
    assert.ok(regions.includes(`id: "${id}"`), `${id} must be a district of the world`);
  }
  // They are laid out along X, and the world reaches past the outermost.
  const safariX = Number(/SAFARI: Region = \{ id: "safari", centerX: (-?\d+)/.exec(regions)[1]);
  const trekX = Number(/TREK: Region = \{ id: "trek", centerX: (-?\d+)/.exec(regions)[1]);
  const reach = Number(/WORLD_REACH = (\d+)/.exec(regions)[1]);
  assert.ok(safariX > 0 && trekX < 0, "the districts must flank the sanctuary");
  assert.ok(reach > Math.max(Math.abs(safariX), Math.abs(trekX)), "the world must contain every district");

  // ONE height field answers for all of them — that is what makes it walkable.
  assert.match(TERRAIN, /import \{[\s\S]*?regionWeight,\s*safariRelief,\s*trekRelief,[\s\S]*?\} from "\.\/regions"/);
  assert.match(TERRAIN, /const wSanct = regionWeight\(SANCTUARY, x, z\)/);
  assert.match(TERRAIN, /const wSafari = regionWeight\(SAFARI, x, z\)/);
  assert.match(TERRAIN, /const wTrek = regionWeight\(TREK, x, z\)/);
  // The ring of hills is opened up so the districts are not walled off.
  assert.match(TERRAIN, /corridor/, "the sanctuary's hill ring needs passes to the neighbours");

  // You can actually walk the whole way.
  assert.match(CONTROLS, /const WALK_LIMIT = WORLD_REACH;/);
});

test("all three districts are framed by the default opening view", () => {
  // The establishing shot pulls back far enough to hold the whole chain.
  const m = /panTo\(new THREE\.Vector3\(0, 30, 0\), (\d+), /.exec(SCENE);
  assert.ok(m, "expected the opening establishing shot");
  const dist = Number(m[1]);
  const regions = read("src/nature3d/engine/regions.ts");
  const spread = Number(/SAFARI: Region = \{ id: "safari", centerX: (\d+)/.exec(regions)[1]);
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
  for (const key of ["world", "trek", "safari"]) {
    assert.ok(PAGE.includes(`key: "${key}"`), `the HUD needs a ${key} view preset`);
    assert.ok(SCENE.includes(`case "${key}":`), `the engine needs a ${key} preset`);
  }
});

test("the safari is built into the one scene, without a second sky or sun", () => {
  const district = read("src/nature3d/engine/safariDistrict.ts");
  assert.match(district, /group\.position\.set\(SAFARI\.centerX, 0, SAFARI\.centerZ\)/);
  assert.match(district, /buildWorld\(group, \{ isMobile: false, district: true \}\)/);
  // A district must not bring its own global lighting: that would mean two
  // directional lights and two shadow passes.
  const world = read("src/nature3d/safari/world.js");
  assert.match(world, /export function buildWorld\(scene, \{ isMobile, district = false \}\)/);
  assert.match(world, /\/\/ ---- lights & sky \(own-world only\)\s*\n\s*if \(!district\) \{/);
  assert.match(world, /\/\/ ---- clouds \(own-world only[\s\S]{0,80}\n\s*if \(!district\) \{/);
  // The animals still ship and still load.
  assert.match(district, /new Creature\(def, model, world, i\)/);
  const models = listDir("public/safari/models").filter((f) => f.endsWith(".glb"));
  assert.ok(models.length >= 15, `expected the safari models, found ${models.length}`);
  // The scene wires it in and disposes it.
  assert.match(SCENE, /this\.safari = createSafariDistrict\(\)/);
  assert.match(SCENE, /this\.scene\.add\(this\.safari\.group\)/);
  // The safari runs on the shared ambient budget (Group 13), so its dt is the
  // accumulated ambient step rather than the raw frame dt.
  assert.match(SCENE, /this\.safari\.update\(adt, time\)/);
  assert.match(SCENE, /this\.safari\.dispose\(\)/);
});

test("the walking character keeps TerrainTrek's gameplay constants", () => {
  const trek = read("src/nature3d/engine/trekAvatar.ts");
  // Movement and camera constants, verbatim from the source project — the
  // presentation and locomotion were upgraded, the GAMEPLAY was preserved.
  assert.match(trek, /WALK_SPEED = 10/);
  assert.match(trek, /BOOST_SPEED = 30/);
  assert.match(trek, /CAM_DISTANCE = 15/);
  assert.match(trek, /CAM_PHI = Math\.PI \* 0\.45/);
  assert.match(trek, /CAM_THETA = -Math\.PI \* 0\.25/);
  assert.match(trek, /CAM_ABOVE_OFFSET = 2/);
  assert.match(trek, /PHI_MIN = 0\.1/);
  assert.match(trek, /PHI_MAX = Math\.PI - 0\.1/);
  // The joystick threshold is the source's.
  assert.match(trek, /const DEAD = 0\.25/);
});

test("locomotion is analog with turn-rate limiting — the 8-way snap is gone", () => {
  const trek = read("src/nature3d/engine/trekAvatar.ts");
  // The heading reference is STILL the camera's theta (the source's
  // distinctive contract), but the offset is the stick's ANALOG angle now.
  assert.match(trek, /wishHeading = this\.theta - Math\.atan2\(stick\.x, -stick\.y\)/);
  // ...and the heading turns toward it at a limited rate instead of popping.
  assert.match(trek, /angDiff\(this\.rotation, wishHeading\)/);
  assert.match(trek, /clamp\(dHead, -maxTurn \* dt, maxTurn \* dt\)/);
  // The old compass-pop table must be GONE, not just unused.
  assert.ok(!/this\.rotation \+= Math\.PI \* 0\.25/.test(trek), "8-way snap table is back");
  assert.ok(!/this\.rotation -= Math\.PI \* 0\.75/.test(trek), "8-way snap table is back");
  assert.ok(!/this\.rotation \+= Math\.PI \* 0\.5/.test(trek), "8-way snap table is back");
  // Asymmetric accel/decel through frame-rate independent filters.
  assert.match(trek, /ACCEL_K = 6\.5/);
  assert.match(trek, /DECEL_K = 9/);
  // Gait phase is locked to distance over stride — the no-skate law.
  assert.match(trek, /gaitPhase \+= \(this\.speed \* dt\) \/ this\.strideLen \* Math\.PI/);
  // Locomotion states exist for gait selection.
  assert.match(trek, /export type LocoState/);
  assert.match(trek, /"jump" \| "fall" \| "land"/);
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

test("jump, camera feel and the scene wiring exist", () => {
  const trek = read("src/nature3d/engine/trekAvatar.ts");
  // Buffered + coyote-time jump.
  assert.match(trek, /JUMP_V = 7\.4/);
  assert.match(trek, /COYOTE = 0\.1/);
  assert.match(trek, /jumpQueued/);
  // Camera: damped placement with a soft low-angle limit, shoulder offset,
  // sprint FOV kick.
  assert.match(trek, /placePhi = Math\.min\(this\.smoothPhi, Math\.PI \/ 2 \+ 0\.35\)/);
  assert.match(trek, /SHOULDER_RIGHT = 0\.55/);
  assert.match(trek, /fovKickDegrees\(\)/);
  // The rig poses from the player every frame in both camera modes.
  assert.match(SCENE, /this\.avatar\.update\(dt, time, this\.trek, this\.camera\)/);
  // Jump input: Space on desktop, HUD button on touch.
  assert.match(CONTROLS, /code === "Space"/);
  assert.match(SCENE, /queueJump\(\)/);
  assert.match(SCENE, /consumeJump\(\)/);
});

test("the character sits on the chair and stands up to walk", () => {
  const trek = read("src/nature3d/engine/trekAvatar.ts");
  assert.match(trek, /setSeated\(seated: boolean, chair\?: THREE\.Vector3\): void/);
  // Sitting folds the legs and drops the hips — not just a translation.
  assert.match(trek, /legL\.rotation\.x = -Math\.PI \/ 2/);
  assert.match(trek, /body\.position\.y = -0\.42/);
  // Seated, they face the board (which is on -Z).
  assert.match(trek, /group\.rotation\.y = Math\.PI/);
  // The scene seats them at boot, and stands them up when walking starts.
  assert.match(SCENE, /this\.avatar\.setSeated\(true, new THREE\.Vector3\(0, terrainHeight\(0, 2\.6\), 2\.6\)\)/);
  assert.match(SCENE, /if \(this\.avatar\.seated && active\) this\.avatar\.setSeated\(false\)/);
  // Walk mode drives the avatar, and the swipe steers its orbit camera.
  assert.match(SCENE, /this\.trek\.update\(dt, \{ x: mx, y: my, active \}, this\.camera, WORLD_REACH\)/);
  assert.match(SCENE, /this\.trek\.look\(dx \* 0\.9, dy \* 0\.9\)/);
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
  // note the player shows.
  assert.match(STUDY_BOARDS, /loadLocalNotes|persistLocalNotes/);
});

test("the reading board lists only purchased courses", () => {
  // Ownership now comes from the full entitlement resolver (Group 15), not
  // from the legacy purchases subcollection alone.
  assert.match(PAGE, /useOwnedCourses\(\)/);
  assert.match(PAGE, /<BoardPortals/);
  // Drilling down: course -> module -> resource, chosen by the learner.
  assert.match(READING_BOARD, /courses\.map\(/);
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
  assert.match(PAGE, /engineRef\.current\?\.focus\(key\)/);
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
  // rectangle: the flat overlay stays pixel-exact, and off-axis large
  // boards — where device hit-testing starts dropping taps — are never
  // framed. The board still clears the HUD: screen-centred, it needs to
  // clear each chrome edge by a HALF board.
  const focusBoard = SCENE.slice(SCENE.indexOf("private focusBoard(slot: LecternSlot)"), SCENE.indexOf("private focusStudentDesk"));
  assert.match(focusBoard, /this\.orbit\.panTo\(this\.tmpV\.copy\(placement\.position\), distance, placement\.yaw, 0\)/);
  assert.ok(!/nx|ny|rightX|rightZ/.test(focusBoard), "the target offset that sheared the board is gone");
  assert.match(focusBoard, /Math\.min\(this\.viewH [\/] 2 - ins\.top, this\.viewH [\/] 2 - ins\.bottom\)/);
  assert.match(focusBoard, /Math\.min\(this\.viewW [\/] 2 - ins\.left, this\.viewW [\/] 2 - ins\.right\)/);

  // The symmetric fit still keeps every pixel of the board clear of the
  // chrome at every aspect (the chrome insets here mirror the page's).
  const L = solveLectern();
  const H = (L.W * 9) / 16;
  const margin = 0.5;
  const chrome = { top: 84, bottom: 152, left: 84, right: 20 };
  for (const [viewW, viewH] of [[390, 844], [844, 390], [1180, 820], [1920, 1080], [320, 568]]) {
    const aspect = viewW / viewH;
    let fov = 52;
    if (aspect < 16 / 9) {
      const halfH = (Math.tan((52 * Math.PI) / 360) * (16 / 9)) / aspect;
      fov = (Math.atan(halfH) * 360) / Math.PI;
    }
    fov = Math.min(fov, 100);
    const v = (fov * Math.PI) / 180;
    const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
    const needW = L.W + 2 * margin;
    const needH = H + 2 * margin;
    const limitH = Math.max(8, Math.min(viewH / 2 - chrome.top, viewH / 2 - chrome.bottom));
    const limitW = Math.max(8, Math.min(viewW / 2 - chrome.left, viewW / 2 - chrome.right));
    const d = Math.max(
      (needH / 2 / Math.tan(v / 2)) / (2 * limitH / viewH),
      (needW / 2 / Math.tan(h / 2)) / (2 * limitW / viewW),
    );
    const fy = viewH / 2 / Math.tan(v / 2);
    const pxW = L.W * (fy / d);
    const pxH = H * (fy / d);
    // The board is screen-centred: it must clear each chrome edge.
    assert.ok(viewW / 2 - pxW / 2 >= Math.max(chrome.left, chrome.right) - 0.5, `${viewW}x${viewH}: the board eats the side chrome`);
    assert.ok(viewH / 2 - pxH / 2 >= Math.max(chrome.top, chrome.bottom) - 0.5, `${viewW}x${viewH}: the board's bottom rows sit under the tray`);
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
  assert.match(SCREENS, /if \(!moved && !changed\) return;/);
  // 2. Frustum + back-face culled per board.
  assert.match(SCREENS, /frustum\.intersectsSphere\(sphere\)/);
  assert.match(SCREENS, /boardNormal\.dot\(toCamera\) > 0/);
  // 3. display:none, NOT visibility:hidden — only the former stops an
  //    off-screen YouTube iframe from decoding video.
  assert.match(SCREENS, /style\.display = visible \? "" : "none"/);
  assert.ok(!/visibility = "hidden"/.test(SCREENS), "visibility:hidden keeps video decoding");

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
  const ceiling = WORLD_HALF * 2;
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
  // 16 km — outside every tier's far plane. The altitude ceiling catches it.
  assert.match(CONTROLS, /const ceiling = WORLD_HALF \* 2;/);
  assert.ok(maxDistance(Math.PI / 2 - 0.001) <= ceiling, "a top-down view must be bounded by altitude");
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
const SAFARI_DISTRICT = read("src/nature3d/engine/safariDistrict.ts");

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

test("nothing is auto-selected, so the side boards open empty", () => {
  // THE BUG: `activeCourse={ownedCourses[0]}` silently scoped the notes and
  // mind-map boards to whichever course the catalogue happened to return
  // first, so they opened showing somebody's existing notes.
  assert.ok(
    !/activeCourse=\{ownedCourses\[0\]/.test(PAGE),
    "the first owned course must not be auto-selected",
  );
  assert.match(STUDY_BOARDS, /const \[selectedCourseId, setSelectedCourseId\] = useState<string \| null>\(null\)/);
  assert.match(STUDY_BOARDS, /const \[selectedModuleId, setSelectedModuleId\] = useState<string \| null>\(null\)/);

  // With no course picked the notes panel is handed an empty list — so the
  // board shows only the circular "+", as asked.
  assert.match(STUDY_BOARDS, /notes=\{activeCourse \? notes\.notes : EMPTY_NOTES\}/);
  // Stable identity: a fresh [] every render would rebuild the grid forever.
  assert.match(STUDY_BOARDS, /const EMPTY_NOTES: CoursePlayerNote\[\] = \[\];/);

  // Losing entitlement to the selected course must clear it.
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
  // ...and the mind map scopes to it, exactly as the player does.
  assert.match(STUDY_BOARDS, /moduleId: selectedModuleId \?\? undefined/);
});

test("the notes and mind map panels are the player's own, unmodified", () => {
  // The brief is explicit that the design must not change: same toolbar, same
  // editor, same library. So they are imported, never re-implemented.
  assert.match(STUDY_BOARDS, /import NotesPanel from "\.\.\/\.\.\/course\/NotesPanel"/);
  assert.match(STUDY_BOARDS, /import\("\.\.\/\.\.\/course\/MindMapPanel"\)/);
  assert.match(STUDY_BOARDS, /import useCourseMindMap from "\.\.\/\.\.\/course\/useCourseMindMap"/);
  assert.match(STUDY_BOARDS, /loadLocalNotes|persistLocalNotes/);
});

test("animals standing on the ground are gone, birds are not", () => {
  // The meadow herd: constructed with a zero budget rather than deleted, so
  // the fur material, the species banks and the update/dispose paths all stay
  // honest. (Verified separately: every tier yields 0 meshes.)
  assert.match(SCENE, /createWildlife\(\{ \.\.\.this\.budget, animalCount: 0 \}/);

  // The safari floor: filtered on the AUTHORED placement rather than a
  // hand-typed id list, so a new entry in data.js classifies itself.
  assert.match(SAFARI_DISTRICT, /const isGroundAnimal =/);
  assert.match(SAFARI_DISTRICT, /item\.kind === "animal" && \(item\.y === "ground" \|\| item\.y === "rock"\)/);
  assert.match(SAFARI_DISTRICT, /\.filter\(\s*\(item\) => !isGroundAnimal\(item\),?\s*\)/);

  // Prove the filter keeps what it should. Birds stay, as asked; so do the
  // perched monkey, the water creatures and every prop.
  const data = read("src/nature3d/safari/data.js");
  const items = [...data.matchAll(/\{ id: '([a-z]+)',\s*kind: '(\w+)'[^}]*?y: '?([\w.]+)'?/g)];
  assert.ok(items.length >= 17, `expected the safari item table, parsed ${items.length}`);
  const removed = items.filter(([, , kind, y]) => kind === "animal" && (y === "ground" || y === "rock"));
  const kept = items.filter((m) => !removed.includes(m));
  assert.deepEqual(
    removed.map(([, id]) => id).sort(),
    ["crocodile", "elephant", "giraffe", "lion", "snake", "zebra"],
    "exactly the ground/rock animals must be dropped",
  );
  assert.ok(kept.some(([, id]) => id === "bird"), "the bird must stay");
  assert.ok(kept.some(([, id]) => id === "monkey"), "the perched monkey is not on the ground");
  for (const id of ["hippo", "fish"]) {
    assert.ok(kept.some(([, k]) => k === id), `${id} is in the water, not on the ground`);
  }
  for (const id of ["flower", "bone", "stump", "banana", "truck", "camera", "binoculars"]) {
    assert.ok(kept.some(([, k]) => k === id), `prop ${id} must be untouched`);
  }
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

test("the side boards stay empty until the learner picks a course", () => {
  // Verified separately by rendering the real NotesPanel in jsdom:
  //   notes=[]           -> 0 cards, only the circular "+"
  //   notes=[2 notes]    -> 2 cards          (the panel is not simply broken)
  //   click "+"          -> mode "compose", 13 toolbar buttons
  // so an empty board is the DATA's doing, which is what these pin.
  assert.match(STUDY_BOARDS, /notes=\{activeCourse \? notes\.notes : EMPTY_NOTES\}/);
  assert.match(STUDY_BOARDS, /const EMPTY_NOTES: CoursePlayerNote\[\] = \[\];/);
  // Notes are keyed per user AND per product, so one course's notes can never
  // appear under another.
  assert.match(STUDY_BOARDS, /useBoardNotes\(uid, productId\)/);
  assert.match(STUDY_BOARDS, /const productId = activeCourse\?\.id \?\? null;/);
  assert.match(
    read("src/course/notesStore.ts"),
    /`dc\.courseNotes\.\$\{uid\}\.\$\{productId\}`/,
  );
  // The mind map is scoped the same way and gets no product until one is picked.
  assert.match(STUDY_BOARDS, /productId: productId \?\? ""/);
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
  //   elevation  4.0 → 72.0 → 4.0 deg                  (rises, peaks, falls)
  //   intensity 1.11 → 3.15 → 1.11, exposure 0.938 → 1.160 → 0.938
  //   colour   #ff8b46 → #fff6e8 → #ff8242             (warm, white, warm)
});

test("brightness and warmth follow the sun's height", () => {
  // One driver for everything: dayFactor = sin(elevation) normalised, so
  // midday really is the brightest and the ends really are the warmest
  // without any of them being tuned by hand.
  assert.match(DAYLIGHT, /const dayFactor = THREE\.MathUtils\.clamp\(Math\.sin\(elevation\) \/ Math\.sin\(MAX_ELEVATION\), 0, 1\)/);
  assert.match(DAYLIGHT, /sunIntensity: THREE\.MathUtils\.lerp\(0\.95, 3\.15, dayFactor\)/);
  assert.match(DAYLIGHT, /exposure: THREE\.MathUtils\.lerp\(0\.92, 1\.16, dayFactor\)/);
  assert.match(DAYLIGHT, /const warm = 1 - THREE\.MathUtils\.smoothstep\(dayFactor, 0\.06, 0\.62\)/);
});

test("night holds the evening look and the sun never touches the horizon", () => {
  // A study space must stay readable: 23:00 renders as sunset, not darkness.
  // Measured: 23h, 21h and 19.5h all resolve to hour 18.50; 02h and 04:30 to
  // 06.00 — and the sun's y stays above 0.05 at every hour of the clock.
  assert.match(DAYLIGHT, /clampToDaylight = \(hour: number\): number =>\s*\n?\s*THREE\.MathUtils\.clamp\(hour, DAY_START, DAY_END\)/);
  // At exactly 0 elevation the shadow frustum degenerates and shadows stretch
  // to infinity — which reads as a black screen, not a sunset.
  assert.match(DAYLIGHT, /const MIN_ELEVATION = THREE\.MathUtils\.degToRad\(4\)/);
  assert.match(DAYLIGHT, /Math\.max\(Math\.sin\(Math\.PI \* t\) \* MAX_ELEVATION, MIN_ELEVATION\)/);
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

test("the learner can switch lighting from the top tray", () => {
  assert.match(PAGE, /const DAYLIGHT_MODES/);
  for (const mode of ["auto", "morning", "midday", "evening"]) {
    assert.ok(PAGE.includes(`key: "${mode}"`), `${mode} must be offered`);
  }
  // Auto is the default, so the sanctuary matches the real world unprompted.
  assert.match(PAGE, /useState<DaylightMode>\("auto"\)/);
  assert.match(PAGE, /engineRef\.current\?\.setDaylightMode\(key\)/);
  assert.match(SCENE, /setDaylightMode\(mode: DaylightMode\)/);
  // Auto re-reads the clock while the page is open — otherwise a long session
  // started in the morning would still be lit as morning at dusk.
  assert.match(SCENE, /if \(this\.daylightMode === "auto"\)/);
  assert.match(SCENE, /if \(this\.daylightClock >= 20\)/);
  // Moving the sun invalidates every shadow in the static shadow map.
  const applyBody = SCENE.slice(SCENE.indexOf("private applyDaylight()"));
  assert.match(applyBody.slice(0, applyBody.indexOf("\n  }")), /this\.requestShadowRefresh\(\)/);
});
