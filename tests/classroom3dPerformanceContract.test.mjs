// tests/classroom3dPerformanceContract.test.mjs
//
// Part 13 — 3D Classroom performance: real-time-game smoothness (steady 60
// fps on desktop, 30–60 fps on low/mid mobile) with zero functional
// regressions. Same room, same features, a fraction of the per-frame work:
//
//   A. WALL ACTIVITY — only the faced wall renders; unfaced walls keep their
//      mounted instance (no unmount, no lost playback/drafts) but skip
//      rendering and pause their media.
//   B. QUALITY GOVERNOR — an fps monitor steps low/medium/high tiers with
//      hysteresis; resolution follows through AdaptiveDpr, snow/lights/spill
//      through tier props; the tier persists for the session.
//   C. GEOMETRY / LIGHTS / SHADOWS — merged static meshes, consolidated
//      lights, no transmission pass, shadows baked once.
//   D. WALL VISIBILITY — off-screen walls stop painting on a yaw/pitch gate
//      that touches the DOM only on visibility edges.
//   E. RIG HYGIENE — no per-frame useState, ref-only hot paths, no per-event
//      allocation, drag fidelity while the head turns.
//   F. ONE-TIME PROBE — the starting tier is probed once and remembered; the
//      monitor's first window corrects it instead of re-probing.
//
// Style note: like every other contract file in this repo, these tests assert
// the SOURCE so the implementation stays in sync with the part spec.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const classroom = read("src/classroom3d/Classroom3D.tsx");
const seatRig = read("src/classroom3d/SeatRig.tsx");
const panels = read("src/classroom3d/panels.tsx");
const room = read("src/classroom3d/Room.tsx");
const css = read("src/classroom3d/classroom3d.css");
const quality = read("src/classroom3d/quality.ts");
const governor = read("src/classroom3d/QualityGovernor.tsx");
const wallActivity = read("src/classroom3d/WallActivity.tsx");
const wallVisibility = read("src/classroom3d/WallVisibility.tsx");
const mergedStatics = read("src/classroom3d/mergedStatics.ts");
const surfaceFrame = read("src/classroom3d/SurfaceFrame.tsx");
const deskConsole = read("src/classroom3d/DeskConsole.tsx");

// ---------------------------------------------------------------------------
// A1. Unfaced walls skip rendering but keep their mounted instance.
// ---------------------------------------------------------------------------

test("WallActivity skips rendering + input when inactive, without unmounting", () => {
  // Part 14 reconciliation: active walls use `auto` (browser skips the
  // off-screen subtree like a virtualized row) instead of `visible`;
  // inactive walls keep the strictly stronger forced `hidden`.
  assert.match(wallActivity, /contentVisibility: active \? "auto" : "hidden",/);
  assert.match(wallActivity, /pointerEvents: active \? "auto" : "none",/);
  // The children render unconditionally — the gate never unmounts the wall,
  // so viewer state, drafts and listeners survive a look-away.
  assert.match(wallActivity, /\{children\}/);
  assert.ok(!wallActivity.includes("if (!active) return null"));
  // The pause/resume pass runs only on active edges (focus changes).
  assert.match(wallActivity, /\}, \[active\]\);/);
});

// ---------------------------------------------------------------------------
// A2. Inactive walls pause media; return resumes only what was playing.
// ---------------------------------------------------------------------------

test("WallActivity pauses media on look-away and resumes only what played", () => {
  // Native media: skip the already-paused, pause the playing, remember them.
  assert.match(wallActivity, /if \(media\.paused \|\| media\.ended\) return;/);
  assert.match(wallActivity, /pausedMedia\.current\.push\(media\);/);
  assert.match(wallActivity, /media\.pause\(\);/);
  // Resume is best-effort (autoplay policy / detached nodes must not throw).
  assert.match(wallActivity, /if \(!media\.isConnected\) continue;/);
  assert.match(wallActivity, /void media\.play\(\)\?\.catch\?\.\(\(\) => undefined\);/);
  // YouTube embeds pause/resume via the JS API the viewer enables.
  assert.match(wallActivity, /enablejsapi/);
  assert.match(wallActivity, /www\.youtube-nocookie\.com/);
  assert.match(wallActivity, /youTubeCommand\(frame, "pauseVideo"\);/);
  assert.match(wallActivity, /youTubeCommand\(frame, "playVideo"\);/);
  assert.match(wallActivity, /event: "command", func, args: ""/);
});

test("the room gates each live wall on focus; fullscreen counts as facing the board", () => {
  assert.match(
    classroom,
    /<WallActivity wall="board" active=\{focus === "board" \|\| boardFullscreen\}>/,
  );
  assert.match(classroom, /<WallActivity wall="notes" active=\{focus === "notes"\}>/);
  assert.match(classroom, /<WallActivity wall="mind" active=\{focus === "mind"\}>/);
  // Every wall exposes the DOM hook the visibility gate queries.
  assert.match(wallActivity, /data-classroom-wall=\{wall\}/);
  assert.match(panels, /data-classroom-wall="desk"/);
});

// ---------------------------------------------------------------------------
// B1. The tier ladder: what each level actually changes.
// ---------------------------------------------------------------------------

test("quality tiers pin snow, lamp lights and spill behaviour", () => {
  assert.match(quality, /high: \{ snow: 420, lampLights: 2, spillLights: "all" \},/);
  assert.match(quality, /medium: \{ snow: 240, lampLights: 2, spillLights: "all" \},/);
  assert.match(quality, /low: \{ snow: 120, lampLights: 1, spillLights: "active" \},/);
  // Factor → tier with hysteresis bands (0.8 up, 0.5 down).
  assert.match(quality, /factor >= 0\.8 \? "high" : factor >= 0\.5 \? "medium" : "low";/);
  // Monitor start factors per tier.
  assert.match(quality, /high: 1,\n  medium: 0\.65,\n  low: 0\.4,/);
});

// ---------------------------------------------------------------------------
// B2. The governor bridges the monitor to AdaptiveDpr/AdaptiveEvents.
// ---------------------------------------------------------------------------

test("QualityGovernor samples fps and writes tiers to the fiber store", () => {
  assert.match(governor, /<PerformanceMonitor/);
  assert.match(governor, /factor=\{QUALITY_FACTOR\[startTier\]\}/);
  assert.match(governor, /ms=\{SAMPLE_MS\}/);
  assert.match(governor, /iterations=\{SAMPLE_ITERATIONS\}/);
  assert.match(governor, /flipflops=\{FALLBACK_FLIPFLOPS\}/);
  assert.match(governor, /onChange=\{\(api\) => applyTier\(qualityForFactor\(api\.factor\)\)\}/);
  // An unstable device locks to low (which also stops the sampling).
  assert.match(governor, /onFallback=\{\(\) => applyTier\("low"\)\}/);
  // The bridge drei 10 no longer builds itself: the tier's resolution scale
  // is written to performance.current, where AdaptiveDpr/AdaptiveEvents read it.
  assert.match(governor, /performance: \{ \.\.\.state\.performance, current: TIER_PERFORMANCE\[tier\] \},/);
  assert.match(governor, /high: 1,\n  medium: 0\.75,\n  low: 0\.6,/);
  // Tier edges persist for the session and re-render the room once — never
  // per frame — and the governor itself renders exactly once.
  assert.match(governor, /rememberTier\(tier\);/);
  assert.match(governor, /if \(tier === lastTier\.current\) return;/);
  assert.match(governor, /export default memo\(QualityGovernor\);/);
});

test("Classroom3D mounts the governor, adaptive components and baked shadows", () => {
  assert.match(governor, /pickInitialTier/);
  assert.match(classroom, /useState<ClassroomQuality>\(pickInitialTier\)/);
  // Stable setState straight into the memo'd governor: it renders once.
  assert.match(classroom, /<QualityGovernor onTier=\{setQuality\} \/>/);
  assert.match(classroom, /<AdaptiveDpr \/>/);
  assert.match(classroom, /<AdaptiveEvents \/>/);
  assert.match(classroom, /<BakedShadowsOnce \/>/);
  // Mount-time resolution from the area-aware heuristic — runtime dpr is the
  // governor's alone, so the old fixed range is gone.
  assert.match(classroom, /dpr=\{initialDpr\}/);
  assert.ok(!classroom.includes("dpr={[1, 1.75]}"));
  // Tier props flow to the room and the wall/desk spill lights.
  assert.match(classroom, /<Room snow=\{settings\.snow\} lampLights=\{settings\.lampLights\} \/>/);
  assert.equal(
    (classroom.match(/spill=\{settings\.spillLights === "all" \|\| focus ===/g) || []).length,
    3,
  );
  assert.match(classroom, /<DeskConsole spill=\{settings\.spillLights === "all"\}>/);
  // Shadows bake exactly once: a memo'd BakeShadows with no props never
  // re-renders, so focus hops and pinch ticks can't re-bake the map.
  assert.match(classroom, /const BakedShadowsOnce = memo\(function BakedShadowsOnce\(\) \{/);
  assert.match(classroom, /return <BakeShadows \/>;/);
});

// ---------------------------------------------------------------------------
// B3/F. One-time probe: area-aware dpr, static tier probe, session memory.
// ---------------------------------------------------------------------------

test("initial dpr caps effective pixels by viewport area and tier", () => {
  assert.match(quality, /export function computeInitialDpr\(/);
  assert.match(quality, /area >= 8_000_000/);
  assert.match(quality, /area >= 3_700_000/);
  assert.match(quality, /area >= 2_000_000/);
  assert.match(quality, /tier === "high" \? 1 : tier === "medium" \? 0\.85 : 0\.7;/);
});

test("the starting tier is probed once and remembered for the session", () => {
  assert.match(quality, /sessionStorage\.getItem\(TIER_STORAGE_KEY\)/);
  assert.match(quality, /sessionStorage\.setItem\(TIER_STORAGE_KEY, tier\)/);
  // Weak CPUs / thin devices start low; huge or very dense screens medium.
  assert.match(quality, /hardwareConcurrency <= 4 \|\| input\.deviceMemory <= 4/);
  assert.match(quality, /devicePixelRatio >= 3 && area >= 1_000_000/);
});

// ---------------------------------------------------------------------------
// C1. Static geometry is merged once and reused for the app's life.
// ---------------------------------------------------------------------------

test("repeated statics merge into one geometry per material, once", () => {
  assert.match(
    mergedStatics,
    /import \{ mergeGeometries \} from "three\/examples\/jsm\/utils\/BufferGeometryUtils\.js";/,
  );
  // Module-level lazy singleton: built on first use, never per frame/mount.
  assert.match(mergedStatics, /let cache: MergedRoomStatics \| null = null;/);
  assert.match(mergedStatics, /if \(cache\) return cache;/);
  // Desks (4) + window bays (3) + lamps (1) + book colours (5 bins, 1 call).
  assert.equal((mergedStatics.match(/mergeGeometries\(/g) || []).length, 9);
  // The learner's own desk slot stays empty — DeskConsole builds it.
  assert.match(
    mergedStatics,
    /if \(Math\.abs\(x - 0\.15\) < 0\.01 && Math\.abs\(z - 2\.1\) < 0\.01\) continue;/,
  );
});

test("Room renders the merged meshes instead of ~110 individual parts", () => {
  assert.match(room, /const merged = getMergedRoomStatics\(\);/);
  assert.match(room, /geometry=\{merged\.deskTops\}/);
  assert.match(room, /geometry=\{merged\.deskBodies\}/);
  assert.match(room, /geometry=\{merged\.deskLegs\}/);
  assert.match(room, /geometry=\{merged\.chairParts\}/);
  assert.match(room, /geometry=\{merged\.windowFrames\}/);
  assert.match(room, /geometry=\{merged\.windowGlass\}/);
  assert.match(room, /geometry=\{merged\.windowLedges\}/);
  assert.match(room, /geometry=\{merged\.lampBoxes\}/);
  assert.match(room, /merged\.books\.map\(\(geometry, index\)/);
  // The room is static between tier changes, so it memoizes.
  assert.match(room, /export default memo\(Room\);/);
});

// ---------------------------------------------------------------------------
// C2. Lights consolidated, transmission gone, shadows small and baked.
// ---------------------------------------------------------------------------

test("Room consolidates lights and drops the transmission pass", () => {
  // No transmission anywhere: frosted glass is plain transparency now (the
  // old per-surface scene re-render is gone).
  assert.ok(!room.includes("transmission"));
  // One shared window light plus one or two ceiling fills (was 3 + 6).
  assert.match(room, /lampLights === 2 \?/);
  assert.equal((room.match(/<pointLight/g) || []).length, 4);
  // The single shadow-casting light keeps a small map — and it bakes once.
  assert.match(room, /shadow-mapSize=\{\[512, 512\]\}/);
  // Snow follows the tier through a prop (rebuilds only on tier edges).
  assert.match(room, /function Snowfall\(\{ count = 420 \}/);
  assert.match(room, /<Snowfall count=\{snow\} \/>/);
});

test("spill lights are tier-gated; only visible masses cast shadows", () => {
  assert.match(surfaceFrame, /spill\?: boolean;/);
  assert.match(surfaceFrame, /\{spill && \(/);
  assert.match(deskConsole, /spill = true,/);
  assert.match(deskConsole, /\{spill && \(/);
  // The desk keeps exactly two casters (top + tablet); thin/hidden parts
  // stay out of the one-time bake.
  assert.equal((deskConsole.match(/castShadow/g) || []).length, 2);
});

// ---------------------------------------------------------------------------
// D. Off-screen walls stop painting on a yaw/pitch gate.
// ---------------------------------------------------------------------------

test("WallVisibility gates walls on yaw and the desk on pitch", () => {
  // Directions from the seat to each wall centre (rotation.y, radians).
  assert.match(wallVisibility, /wall: "board", yaw: 0\.025/);
  assert.match(wallVisibility, /wall: "notes", yaw: 0\.976/);
  assert.match(wallVisibility, /wall: "mind", yaw: 1\.551/);
  assert.match(wallVisibility, /HALF_FOV_H/);
  assert.match(wallVisibility, /DESK_PITCH/);
  // Hysteresis so a wall on the frame edge never flickers.
  assert.match(wallVisibility, /EDGE_BAND/);
  // Lazily resolved, cached elements — the DOM is written only on edges.
  assert.ok(wallVisibility.includes('[data-classroom-wall="${entry.wall}"]'));
  assert.match(wallVisibility, /if \(show === entry\.visible\) continue;/);
  assert.match(wallVisibility, /entry\.el\.style\.visibility = show \? "visible" : "hidden";/);
  // `visibility` (not display/content-visibility) so it composes with the
  // WallActivity gate, which owns content-visibility via React — the live
  // frame body below the imports must name neither rival mechanism.
  const frameBody = wallVisibility.slice(wallVisibility.indexOf("useFrame("));
  assert.ok(!frameBody.includes("content-visibility"));
  assert.ok(!frameBody.includes("contentVisibility"));
  assert.ok(!frameBody.includes("display:"));
  // No React state — a ref-only useFrame.
  assert.ok(!wallVisibility.includes("useState"));
});

test("WallVisibility reads the fresh rotation and never gates fullscreen", () => {
  assert.match(classroom, /<WallVisibility forceVisible=\{boardFullscreen\} \/>/);
  assert.match(wallVisibility, /forceRef\.current/);
  // Mounted after SeatRig so it reads the same frame's rotation.
  assert.ok(classroom.indexOf("<WallVisibility") > classroom.indexOf("<SeatRig"));
});

// ---------------------------------------------------------------------------
// E. Rig hygiene: ref-only hot paths, no per-event allocation, drag fidelity.
// ---------------------------------------------------------------------------

test("SeatRig gestures allocate nothing and never setState", () => {
  // No Array.from on the hot path — the map iterator is read directly.
  assert.ok(!seatRig.includes("Array.from"));
  assert.equal((seatRig.match(/\.next\(\)\.value/g) || []).length, 5);
  // The last-pointer tracker is mutated in place, not replaced per event.
  assert.match(seatRig, /last\.current\.x = event\.clientX;/);
  assert.match(seatRig, /last\.current\.y = event\.clientY;/);
  assert.ok(!seatRig.includes("useState"));
  // The spring targets still report zoom deltas and manual looks.
  assert.match(seatRig, /onZoomDeltaRef\.current\?\.(\(delta\));/);
  assert.match(seatRig, /onManualLook\?\.\(\);/);
});

test("SeatRig dips resolution + fidelity while dragging, then restores", () => {
  assert.match(seatRig, /classList\.add\("dc-dragging"\);/);
  assert.match(seatRig, /classList\.remove\("dc-dragging"\);/);
  assert.match(seatRig, /dipDpr\.current = dprRef\.current;/);
  assert.match(seatRig, /setDprRef\.current\(1\);/);
  // Dragend restores the snapshot only if the governor hasn't moved dpr
  // meanwhile — its live decision always wins over the stale snapshot.
  assert.match(seatRig, /if \(dprRef\.current <= 1\.01\) setDprRef\.current\(dipDpr\.current\);/);
  // rotation.order is assigned once in the lens effect, never per frame.
  assert.equal((seatRig.match(/rotation\.order\s*=/g) || []).length, 1);
});

test("the drag-fidelity rule sheds paint cost without fighting the gates", () => {
  assert.match(css, /\.dc-dragging \.dc-classroom-surface \*/);
  assert.match(css, /box-shadow: none !important;/);
  assert.match(css, /backdrop-filter: none !important;/);
  assert.match(css, /animation: none !important;/);
  // The rule must not touch visibility/display — those belong to
  // WallVisibility (visibility) and WallActivity (content-visibility).
  // (Sliced from the selector, not the section comment — the comment names
  // the mechanisms the rule must NOT touch.)
  const dragStart = css.indexOf(".dc-dragging .dc-classroom-surface");
  assert.ok(dragStart >= 0);
  const dragBlock = css.slice(dragStart, css.indexOf("\n}", dragStart));
  assert.ok(!dragBlock.includes("visibility"));
  assert.ok(!dragBlock.includes("display"));
});

// ---------------------------------------------------------------------------
// Render hygiene: static subtrees memoize so ticks don't reconcile them.
// ---------------------------------------------------------------------------

test("panels and the room memoize against focus hops and pinch ticks", () => {
  assert.match(panels, /export const BoardPanel = memo\(function BoardPanel\(/);
  assert.match(panels, /export const DeskPanel = memo\(function DeskPanel\(/);
  assert.match(panels, /export const WallHeader = memo\(function WallHeader\(/);
  assert.equal((panels.match(/^}\);$/gm) || []).length, 3);
  assert.match(room, /export default memo\(Room\);/);
});

// ---------------------------------------------------------------------------
// No new heavy dependencies: three / fiber / drei only.
// ---------------------------------------------------------------------------

test("classroom3d imports no new runtime dependencies", () => {
  const files = [
    "Classroom3D.tsx",
    "SeatRig.tsx",
    "Room.tsx",
    "SurfaceFrame.tsx",
    "DeskConsole.tsx",
    "panels.tsx",
    "state.ts",
    "quality.ts",
    "QualityGovernor.tsx",
    "WallActivity.tsx",
    "WallVisibility.tsx",
    "mergedStatics.ts",
  ];
  const allowed = new Set(["react", "@react-three/fiber", "@react-three/drei", "three", "lucide-react"]);
  for (const file of files) {
    const source = read(`src/classroom3d/${file}`);
    for (const match of source.matchAll(/from "([^"]+)"/g)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) continue;
      if (specifier === "three/examples/jsm/utils/BufferGeometryUtils.js") continue;
      assert.ok(allowed.has(specifier), `${file} imports unexpected dependency ${specifier}`);
    }
  }
});
