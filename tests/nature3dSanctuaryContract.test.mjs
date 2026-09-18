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
  assert.match(BOARD, /const MAX_RADIUS = WORLD_REACH;/);
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

test("the board can be resized by dragging any edge or corner", () => {
  // UV margins turn the panel border into a resize gutter.
  assert.match(BOARD, /const M = 0\.18/);
  assert.match(BOARD, /this\.resizeEdge = u === 0 && v === 0 \? null : \{ u, v \}/);
  assert.match(BOARD, /setScale\(w: number, h: number\)/);
  assert.match(BOARD, /const MIN_SCALE = 0\.35/);
  assert.match(BOARD, /const MAX_SCALE = 4\.5/);
  // Free aspect: width and height are clamped independently.
  assert.match(BOARD, /THREE\.MathUtils\.clamp\(w, MIN_SCALE, MAX_SCALE\)/);
  assert.match(BOARD, /THREE\.MathUtils\.clamp\(h, MIN_SCALE, MAX_SCALE\)/);
  // Visible grips so the affordance is discoverable, and a HUD path too.
  assert.match(BOARD, /board-grip/);
  assert.match(SCENE, /scaleBoard\(factor: number\)/);
  assert.match(PAGE, /scaleBoard\(1\.15\)/);
});

test("a pinch sticks — the board does not snap back when a finger lifts", () => {
  // The drag plane is captured at pointerdown; a pinch moves the board off it.
  // Re-anchoring on every pointer-count change is what commits the zoom.
  assert.match(BOARD, /private reanchor\(clientX: number, clientY: number\)/);
  const onUp = BOARD.slice(BOARD.indexOf("private onUp ="), BOARD.indexOf("private onWheel ="));
  assert.match(onUp, /this\.reanchor\(survivor\.x, survivor\.y\)/,
    "lifting one finger of a pinch must re-anchor the surviving finger");
  // Pinch out = nearer, pinch in = farther, and it persists.
  assert.match(BOARD, /this\.setDepth\(this\.depthAtPinch \* ratio\)/);
});

test("the leftover black slab is gone and the clamp scales with the board", () => {
  // The granite plinth and its black steel mast/backplate are deleted.
  assert.ok(!/const mast = new THREE\.Mesh/.test(BOARD), "the black mast must be gone");
  assert.ok(!/const backPlate = new THREE\.Mesh/.test(BOARD), "the black backplate must be gone");
  assert.ok(!/DodecahedronGeometry\(1\.7/.test(BOARD), "the granite plinth must be gone");
  assert.match(BOARD, /plinth\.visible = false/);

  // Ground clearance and footprint both follow the current scale ...
  assert.match(BOARD, /const half = BOARD_WIDTH \* 0\.5 \* this\.scale\.x/);
  assert.match(BOARD, /BOARD_HEIGHT \* 0\.5 \* this\.scale\.y \+ 0\.12/);
  // ... and the ceiling is relative to the ground, because the hills are 90 m
  // tall now and a fixed world-Y ceiling would bury the board in a hillside.
  assert.match(BOARD, /const MAX_HEIGHT_ABOVE_GROUND = 14/);
  assert.match(BOARD, /const maxY = minY \+ MAX_HEIGHT_ABOVE_GROUND/);
  assert.ok(!/p\.y > MAX_HEIGHT\b/.test(BOARD), "the absolute height ceiling must be gone");
});

test("the opening camera is a wide establishing shot", () => {
  // You now land far enough back to read the ENTIRE connected world — all
  // three districts at once — and explore in from there.
  assert.match(SCENE, /this\.orbit\.panTo\(new THREE\.Vector3\(0, 30, 0\), 1500, -0\.30, 0\.34\)/);
  // And you can pull back at least that far by hand.
  assert.match(CONTROLS, /clamp\(this\.targetDistance \* factor, 2\.4, 2400\)/);
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
  const m = /clamp\(this\.pitch - dy, (-?[\d.]+), ([\d.]+)\)/.exec(CONTROLS);
  assert.ok(m, "expected the first-person pitch clamp");
  const hi = Number(m[2]);
  assert.ok(hi >= 1.5, `pitch cap ${hi} rad is too low — the sky must be reachable`);
  // Never a full 90 degrees: at exactly PI/2 the yaw frame degenerates.
  assert.ok(hi < Math.PI / 2, "pitch must stop just short of vertical to avoid gimbal flip");
  assert.equal(Number(m[1]), -hi, "looking down must be as free as looking up");
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

test("the board remembers where and how big the learner left it", () => {
  assert.match(BOARD, /const BOARD_STORAGE_KEY = "nature3d\.board\.placement\.v1"/);
  for (const fn of ["loadBoardPlacement", "saveBoardPlacement", "clearBoardPlacement"]) {
    assert.ok(BOARD.includes(`export function ${fn}`), `${fn} must be exported`);
  }
  // Position, rotation AND size are all persisted.
  assert.match(BOARD, /px: b\.position\.x, py: b\.position\.y, pz: b\.position\.z/);
  assert.match(BOARD, /rx: b\.rotation\.x, ry: b\.rotation\.y, rz: b\.rotation\.z/);
  assert.match(BOARD, /sw: this\.scale\.x, sh: this\.scale\.y/);
  // Restoring must switch billboarding off or the saved angle is thrown away.
  assert.match(BOARD, /restore\(p: BoardPlacement \| null\): boolean/);
  assert.match(BOARD, /this\.faceCamera = false;\s*\n\s*this\.setScale\(p\.sw, p\.sh\)/);
  // Writes are debounced, and flushed on teardown so nothing is lost.
  assert.match(BOARD, /scheduleSave\(\)/);
  assert.match(BOARD, /}, 400\);/, "saves should coalesce rather than run per pointermove");
  assert.match(BOARD, /if \(this\.saveTimer !== null\) \{\s*\n\s*clearTimeout/);
  // Every storage touch is guarded — localStorage throws in private mode.
  const storageCalls = (BOARD.match(/localStorage\./g) || []).length;
  const tryBlocks = (BOARD.match(/try \{/g) || []).length;
  assert.ok(tryBlocks >= 3, `expected every localStorage access wrapped in try (${storageCalls} calls, ${tryBlocks} try blocks)`);
  // The scene restores on boot.
  assert.match(SCENE, /this\.boardCtl\.restore\(loadBoardPlacement\(\)\)/);
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
  assert.ok(far > dist + spread, `far plane ${far} clips the far district`);
  const zoomMax = Number(/clamp\(this\.targetDistance \* factor, [\d.]+, (\d+)\)/.exec(CONTROLS)[1]);
  assert.ok(zoomMax >= dist, `orbit zoom caps at ${zoomMax}, short of the ${dist}m world view`);
  // Fog must not erase the far districts.
  const fog = Math.max(...[...QUALITY.matchAll(/fogDensity: ([\d.]+)/g)].map((x) => Number(x[1])));
  const visibility = Math.exp(-((fog * (dist + spread)) ** 2));
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
  assert.match(SCENE, /this\.safari\.update\(dt, time\)/);
  assert.match(SCENE, /this\.safari\.dispose\(\)/);
});

test("the walking character is TerrainTrek's, implemented to its constants", () => {
  const trek = read("src/nature3d/engine/trekAvatar.ts");
  // Movement and camera constants, verbatim from the source project.
  assert.match(trek, /WALK_SPEED = 10/);
  assert.match(trek, /BOOST_SPEED = 30/);
  assert.match(trek, /CAM_DISTANCE = 15/);
  assert.match(trek, /CAM_PHI = Math\.PI \* 0\.45/);
  assert.match(trek, /CAM_THETA = -Math\.PI \* 0\.25/);
  assert.match(trek, /CAM_ABOVE_OFFSET = 2/);
  assert.match(trek, /PHI_MIN = 0\.1/);
  assert.match(trek, /PHI_MAX = Math\.PI - 0\.1/);

  // The distinctive movement model: heading comes FROM the camera's theta,
  // then the eight-way offsets are applied.
  assert.match(trek, /this\.rotation = this\.theta/);
  assert.match(trek, /this\.rotation \+= Math\.PI \* 0\.25/);
  assert.match(trek, /this\.rotation -= Math\.PI \* 0\.75/);
  assert.match(trek, /this\.rotation \+= Math\.PI \* 0\.5/);
  // The joystick threshold is the source's.
  assert.match(trek, /const DEAD = 0\.25/);

  // The body is the source's stick human, part for part.
  assert.match(trek, /SphereGeometry\(0\.24, 24, 18\)/);      // head
  assert.match(trek, /CapsuleGeometry\(0\.09, 0\.15, 6, 12\)/); // neck
  assert.match(trek, /CapsuleGeometry\(0\.22, 0\.75, 6, 18\)/); // torso
  assert.match(trek, /CapsuleGeometry\(0\.09, 0\.6, 6, 12\)/);  // arms
  assert.match(trek, /CapsuleGeometry\(0\.12, 0\.85, 6, 14\)/); // legs
  assert.match(trek, /shoulderY = 1\.45/);
  assert.match(trek, /shoulderX = 0\.34/);
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
