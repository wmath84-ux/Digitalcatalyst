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
const SKY = read("src/nature3d/engine/sky.ts");
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
  assert.match(TERRAIN, /export const WORLD_SIZE = 1000/);
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
  assert.match(CONTROLS, /const WALK_LIMIT = 430/);
  assert.match(BOARD, /const MAX_RADIUS = 400/);
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
  // You land far enough back to read the whole valley and explore from there.
  assert.match(SCENE, /this\.orbit\.panTo\(new THREE\.Vector3\(0, 6, -6\), 86, -0\.5, 0\.36\)/);
  // And you can pull back far enough to see the kilometre.
  assert.match(CONTROLS, /clamp\(this\.targetDistance \* factor, 2\.4, 420\)/);
  // The board and student presets still exist so you can click straight in.
  assert.match(SCENE, /case "board":/);
  assert.match(SCENE, /case "student":/);
});
