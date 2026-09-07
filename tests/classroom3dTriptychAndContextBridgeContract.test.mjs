// tests/classroom3dTriptychAndContextBridgeContract.test.mjs
//
// THE 3D CLASSROOM — boards that load, and three boards that sit side by side.
//
// Reported by the owner, sitting in the room:
//   · "content play nahin ho raha main board par — 'Lecture board could not
//      load. The rest of the classroom is still live.'"
//   · "mind map aur note save nahin ho rahe."
//   · "center mein main board, left side mein mind map, right side mein note —
//      aur size utna hi bada jitna main board."
//   · "zoom button ko three-tap banao: board → note → mind map, aur fit screen
//      ko dual: fit, phir keval board zoom, phir wapas fit."
//
// ── The board crash ────────────────────────────────────────────────────────
// drei's `<Html>` does not portal its children — it calls
// `ReactDOM.createRoot(el)` and renders into that (see the installed source,
// asserted below). A second React root is a second context universe: nothing
// provided above `<Canvas>` is visible inside it. `ResourceViewer`, which is
// the body of the lecture board, calls `useAuth()`, and `useAuth` throws when
// its context is missing:
//
//     if (!context) throw new Error("useAuth must be used within an AuthProvider");
//
// So the board threw on mount, `SurfaceFrame`'s boundary swallowed it and
// painted "Lecture board could not load" — while the notes and mind boards,
// which consume no app context, kept working and made the failure look
// board-specific. Every surface now wears <SurfaceContexts>, which reads the
// app's contexts inside the canvas (R3F bridges them there) and re-provides
// them inside the <Html> root.
//
// ── The save failures ──────────────────────────────────────────────────────
// Two independent causes, both pinned here:
//   1. a debounced mind-map write was dropped whenever the scope changed
//      inside the debounce window (a lesson switch in the room has no tab
//      change to flush it), and
//   2. entering the room reset the mind board to its LIBRARY overlay, so the
//      wall showed a list of maps instead of the canvas the learner draws on.
//
// Style note: like every other contract file in this repo, these tests assert
// the SOURCE, so the implementation stays in sync with the spec. The drei and
// React-DOM assertions read the INSTALLED packages, so a library bump that
// changes the root/portal behaviour fails the suite instead of silently
// emptying the room again.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const bridge = read("src/classroom3d/SurfaceContexts.tsx");
const surfaceFrame = read("src/classroom3d/SurfaceFrame.tsx");
const deskConsole = read("src/classroom3d/DeskConsole.tsx");
const geometry = read("src/classroom3d/roomGeometry.ts");
const state = read("src/classroom3d/state.ts");
const classroom = read("src/classroom3d/Classroom3D.tsx");
const room = read("src/classroom3d/Room.tsx");
const mergedStatics = read("src/classroom3d/mergedStatics.ts");
const seatRig = read("src/classroom3d/SeatRig.tsx");
const wallVisibility = read("src/classroom3d/WallVisibility.tsx");
const mindMapHook = read("src/course/useCourseMindMap.ts");
const player = read("src/CoursePlayerApp.tsx");
const authContext = read("src/context/AuthContext.tsx");

// The installed libraries, read from node_modules so a bump is caught.
const dreiHtml = read("node_modules/@react-three/drei/web/Html.js");

/* ── 1. The premise: drei's <Html> really is a second React root ─────────── */

test("drei's <Html> renders its children into a SECOND React root", () => {
  // Not a portal — a root. This is the whole reason the bridge exists, and it
  // is asserted against the installed package rather than a memory of it.
  assert.match(dreiHtml, /ReactDOM\.createRoot\(el\)/);
  assert.match(dreiHtml, /import \* as ReactDOM from 'react-dom\/client';/);
  assert.match(dreiHtml, /root\.current\) == null \|\| _root\$current\.render\(/);
  // A root gets none of the context above it — the failure mode this file pins.
  assert.doesNotMatch(dreiHtml, /createPortal/);
});

test("useAuth throws when its context is missing — the board's exact failure", () => {
  assert.match(
    authContext,
    /if \(!context\) throw new Error\("useAuth must be used within an AuthProvider"\);/,
  );
  // …and the board's body is the one component in the room that calls it.
  const resourceViewer = read("src/course/ResourceViewer.tsx");
  assert.match(resourceViewer, /const \{ user \} = useAuth\(\);/);
});

/* ── 2. The bridge ───────────────────────────────────────────────────────── */

test("every app context a surface might need is captured and re-provided", () => {
  // Captured with a FIXED, unconditional list of useContext calls — hook order
  // can never vary between renders, which matters because a surface re-renders
  // on every focus hop and pinch tick.
  for (const context of ["AuthContext", "BrandingContext", "CatalogContext", "CommerceContext", "ConnectivityContext", "FeatureVisibilityContext"]) {
    assert.match(bridge, new RegExp(`useContext\\(${context}\\)`), `${context} must be captured`);
    assert.match(bridge, new RegExp(`<${context}\\.Provider value=`), `${context} must be re-provided`);
  }
  assert.match(bridge, /export function useSurfaceContexts\(\)/);
  // Memoised so a pinch tick does not hand every consumer a fresh identity.
  assert.match(bridge, /return useMemo\(/);
  assert.match(bridge, /\[auth, branding, catalog, commerce, connectivity, features\],/);
});

test("the contexts are exported for the bridge, not re-declared", () => {
  assert.match(authContext, /export const AuthContext = createContext/);
  assert.match(read("src/context/BrandingContext.tsx"), /export const BrandingContext = createContext/);
  assert.match(read("src/context/CatalogContext.tsx"), /export const CatalogContext = createContext/);
  assert.match(read("src/context/CommerceContext.tsx"), /export const CommerceContext = createContext/);
  assert.match(read("src/context/ConnectivityContext.tsx"), /export const ConnectivityContext = createContext/);
  assert.match(read("src/context/FeatureVisibilityContext.tsx"), /export const FeatureVisibilityContext = createContext/);
});

test("every surface in the room wears the bridge", () => {
  // The three walls…
  assert.match(surfaceFrame, /const contexts = useSurfaceContexts\(\);/);
  assert.match(surfaceFrame, /<SurfaceContexts value=\{contexts\}>/);
  // …and the desk tablet, which is a <Html> of its own.
  assert.match(deskConsole, /const contexts = useSurfaceContexts\(\);/);
  assert.match(deskConsole, /<SurfaceContexts value=\{contexts\}>/);
  // The bridge is the OUTERMOST thing inside the <Html>, so anything a panel
  // mounts later is under the same providers.
  const html = surfaceFrame.slice(surfaceFrame.indexOf("<Html"), surfaceFrame.indexOf("</Html>"));
  assert.ok(html.indexOf("<SurfaceContexts") < html.indexOf("PanelBoundary"));
});

/* ── 3. A crashed panel is a recoverable state, not a dead end ───────────── */

test("a failed surface says why and offers a retry", () => {
  assert.match(surfaceFrame, /data-classroom-surface-error/);
  assert.match(surfaceFrame, /data-classroom-surface-error-detail/);
  // The real message, on the slab itself — readable by a learner, actionable
  // by a developer, no console required.
  assert.match(surfaceFrame, /error instanceof Error \? error\.message : String\(error \?\? "Unknown error"\)/);
  assert.match(surfaceFrame, /data-classroom-surface-retry/);
  assert.match(surfaceFrame, /private readonly retry = \(\) => this\.setState\(\{ failed: false, message: "" \}\);/);
  // …and it still never takes the rest of the room down with it.
  assert.match(surfaceFrame, /static getDerivedStateFromError\(error: unknown\)/);
  assert.match(surfaceFrame, /console\.error\("\[classroom3d\] panel crashed"/);
});

/* ── 4. The triptych: three equal boards, mind LEFT / lesson CENTRE / notes RIGHT ── */

test("the three boards are one row of EQUAL slabs on the front wall", () => {
  // One shared size — the owner's "size utna hi bada jitna main board".
  assert.match(geometry, /export const BOARD = \{[\s\S]*?width: 6\.4,[\s\S]*?height: 3\.05,/);
  assert.match(geometry, /export const BOARD_PITCH = BOARD\.width \+ BOARD\.gap;/);
  // Mind map LEFT, lesson CENTRE, notes RIGHT.
  assert.match(geometry, /mind: -BOARD_PITCH,/);
  assert.match(geometry, /board: 0,/);
  assert.match(geometry, /notes: BOARD_PITCH,/);
  // All three are hung from the same row constants in the room.
  for (const side of ["mind", "board", "notes"]) {
    assert.match(classroom, new RegExp(`position=\\{\\[BOARD_X\\.${side}, BOARD\\.y, BOARD\\.z\\]\\}`));
  }
  assert.equal((classroom.match(/width=\{BOARD\.width\}/g) || []).length, 3);
  assert.equal((classroom.match(/height=\{BOARD\.height\}/g) || []).length, 3);
  assert.equal((classroom.match(/pixelWidth=\{BOARD_PIXEL_WIDTH\}/g) || []).length, 3);
  // Square-on: no board is angled away any more. A slab turned 56°/90° projects
  // its DOM through a CSS perspective, and every pointer→content mapping inside
  // it (React Flow dragging, a contentEditable caret) is computed against a
  // bounding box that no longer matches the pixels.
  assert.doesNotMatch(classroom, /rotation=\{\[0, 0\.98, 0\]\}/);
  assert.doesNotMatch(classroom, /rotation=\{\[0, Math\.PI \/ 2, 0\]\}/);
});

test("the room is wide enough for the row, from ONE shared width", () => {
  // 3 × 6.4 m + 2 × 0.5 m = 20.2 m of board, so the side walls sit outside the
  // outer bezels instead of cutting through them.
  assert.match(geometry, /export const ROOM = \{ width: 21\.5, depth: 13, height: 3\.5 \} as const;/);
  assert.match(room, /import \{ ROOM \} from "\.\/roomGeometry";/);
  assert.doesNotMatch(room, /const ROOM = \{ width: 12/);
  // The merged statics derive their wall x from the SAME constant — a hardcoded
  // 5.94 here is what would leave the windows floating in mid-air.
  assert.match(mergedStatics, /import \{ ROOM \} from "\.\/roomGeometry";/);
  assert.match(mergedStatics, /const RIGHT_WALL_X = ROOM\.width \/ 2 - 0\.06;/);
  assert.match(mergedStatics, /bay\.setPosition\(RIGHT_WALL_X, 1\.85, z\);/);
  // The old hardcoded bay x is gone from the geometry itself (it survives only
  // in the comment explaining why it must never come back).
  assert.doesNotMatch(mergedStatics, /setPosition\(5\.94/);
  assert.doesNotMatch(mergedStatics, /box\(0\.26, 0\.34, 0\.07 \+ \(i % 3\) \* 0\.02, -5\.63/);
});

test("the head presets are DERIVED from the board row, never retyped", () => {
  // A board that moves must not leave a preset aiming at empty wall.
  assert.match(geometry, /export const yawToBoard = \(boardX: number\): number =>/);
  assert.match(geometry, /Math\.atan2\(-\(boardX - SEAT\.x\), -\(BOARD\.z - SEAT\.z\)\);/);
  assert.match(geometry, /export const pitchToBoard = \(boardX: number\): number => \{/);
  assert.match(state, /yaw: yawToBoard\(BOARD_X\.board\)/);
  assert.match(state, /yaw: yawToBoard\(BOARD_X\.notes\)/);
  assert.match(state, /yaw: yawToBoard\(BOARD_X\.mind\)/);
  // The notes board is on the RIGHT, so its yaw is negative — asserted through
  // the maths rather than a magic number.
  const yawToBoard = (x) => Math.atan2(-(x - 0.15), -(-3.28 - 2.62));
  assert.ok(yawToBoard(6.9) < 0, "the notes board (right) must yaw negative");
  assert.ok(yawToBoard(-6.9) > 0, "the mind board (left) must yaw positive");
  // Wide enough to look past the OUTER edge of each end board.
  assert.match(state, /export const YAW_LIMIT = \{ min: -1\.14, max: 1\.16 \};/);
  const outer = Math.atan2(-(-6.9 - 3.2 - 0.15), 5.9);
  assert.ok(outer < 1.14, "the yaw limit must reach past the mind board's outer edge");
});

test("wall visibility reads the LIVE camera position, not a seat-relative angle", () => {
  // The FIT ⇄ FILL blend slides the eye up to 7 m sideways; a baked seat angle
  // would keep the other two boards "on screen" long after the camera had
  // glided past them.
  assert.match(wallVisibility, /const dx = entry\.x - camera\.position\.x;/);
  assert.match(wallVisibility, /bearingToBoard\(entry\.x, camera\.position\.x, camera\.position\.z\)/);
  assert.match(wallVisibility, /const halfSize = range > 0\.2 \? Math\.atan\(BOARD\.width \/ 2 \/ range\) : Math\.PI;/);
  // Still edge-triggered: the DOM is touched only on visibility edges.
  assert.match(wallVisibility, /if \(show === entry\.visible\) continue;/);
  assert.match(wallVisibility, /setWallOnScreen\(entry\.wall, show\);/);
});

/* ── 5. FILL: the board covers the screen and nothing else shows ─────────── */

test("fillDistance covers BOTH axes of the live lens", () => {
  assert.match(geometry, /export const FILL_OVERSCAN = 0\.97;/);
  assert.match(geometry, /export const FILL_MIN_DISTANCE = 0\.45;/);
  assert.match(geometry, /const byHeight = height \/ 2 \/ tanVertical;/);
  assert.match(geometry, /const byWidth = width \/ 2 \/ tanHorizontal;/);
  // The tighter constraint wins — covering one axis and not the other still
  // leaves wall on show.
  assert.match(geometry, /Math\.max\(FILL_MIN_DISTANCE, Math\.min\(byHeight, byWidth\) \* FILL_OVERSCAN\);/);
  // tan(horizontal) = tan(vertical) × aspect: three.js `fov` is the VERTICAL
  // angle and SeatRig derives the horizontal one from the aspect ratio.
  assert.match(geometry, /const tanHorizontal = tanVertical \* safeAspect;/);

  // Executed, not just pattern-matched: the answer must actually cover the frame.
  const src = geometry.slice(geometry.indexOf("export const fillDistance"));
  const fillDistance = new Function(
    "BOARD_W", "FILL_OVERSCAN", "FILL_MIN_DISTANCE",
    `${src
      .replace("export const fillDistance", "const fillDistance")
      .replace(/:\s*number/g, "")
      .replace(/\(\s*width, height, fovDeg, aspect\s*\)/, "(width, height, fovDeg, aspect)")}\nreturn fillDistance;`,
  )(6.4, 0.97, 0.45);

  const covers = (distance, fovDeg, aspect) => {
    const tanV = Math.tan((fovDeg * Math.PI) / 360);
    const tanH = tanV * aspect;
    // Angular half-size of the slab at that distance must exceed the lens's.
    return Math.atan(3.05 / 2 / distance) >= Math.atan(tanV) &&
      Math.atan(6.4 / 2 / distance) >= Math.atan(tanH);
  };

  // Landscape 16:9 with SeatRig's composed lens (76° horizontal → ~47.4° vertical).
  const landscape = fillDistance(6.4, 3.05, 47.4, 16 / 9);
  assert.ok(covers(landscape, 47.4, 16 / 9), "landscape FILL must cover the frame");
  assert.ok(landscape > 0.45, "never inside the near plane");
  // Portrait 9:16, where the lens is clamped to 96° vertical.
  const portrait = fillDistance(6.4, 3.05, 96, 9 / 16);
  assert.ok(covers(portrait, 96, 9 / 16), "portrait FILL must cover the frame");
  assert.ok(portrait < landscape, "a portrait lens is wider, so it must dolly closer");
  // Degenerate input can never produce NaN or a camera inside the slab.
  assert.ok(Number.isFinite(fillDistance(6.4, 3.05, NaN, NaN)));
  assert.ok(fillDistance(6.4, 3.05, 0, 0) >= 0.45);
});

test("SeatRig reads the LIVE fov and aspect, so FILL is exact in both orientations", () => {
  assert.match(seatRig, /"fov" in camera \? Number\(\(camera as \{ fov: number \}\)\.fov\) : 62,/);
  assert.match(seatRig, /size\.width \/ Math\.max\(1, size\.height\),/);
  // No hand-tuned per-orientation constant survives anywhere in the room.
  assert.doesNotMatch(state, /PORTRAIT_FIT/);
  assert.doesNotMatch(classroom, /PORTRAIT_FIT/);
  // The FILL path never runs for the desk, which has no board to fill.
  assert.match(seatRig, /const side = FOCUS_BOARD\[focusRef\.current\];\s+if \(side && blend > 0\) \{/);
});

test("the camera cannot clip the room on its way to FILL", () => {
  // The FILL path is a straight glide from the seat to a point square-on to the
  // focused board. Every prop the learner could clip is checked against it.
  const SEAT = { x: 0.15, y: 1.24, z: 2.62 };
  const fillPose = (boardX, distance) => ({ x: boardX, y: 1.8, z: -3.28 + distance });
  const obstacles = [
    { name: "learner's desk top", x: 0.15, y: 0.795, z: 2.02, r: 0.8 },
    { name: "winter mug", x: 0.8, y: 0.86, z: 1.9, r: 0.12 },
    { name: "teacher's desk", x: -3.6, y: 0.81, z: -2.4, r: 1.0 },
    { name: "front desk row (right)", x: 3.3, y: 0.74, z: 2.1, r: 0.8 },
    { name: "front desk row (left)", x: -3.1, y: 0.74, z: 2.1, r: 0.8 },
  ];
  for (const boardX of [-6.9, 0, 6.9]) {
    const to = fillPose(boardX, 3.5);
    for (let i = 1; i < 200; i += 1) {
      const t = i / 200;
      const px = SEAT.x + (to.x - SEAT.x) * t;
      const py = SEAT.y + (to.y - SEAT.y) * t;
      const pz = SEAT.z + (to.z - SEAT.z) * t;
      for (const obstacle of obstacles) {
        const near = Math.hypot(px - obstacle.x, pz - obstacle.z);
        if (near < obstacle.r) {
          assert.ok(
            py > obstacle.y + 0.35,
            `the FILL path to board x=${boardX} clips the ${obstacle.name} at t=${t.toFixed(2)}`,
          );
        }
      }
    }
  }
});

/* ── 6. The mind map write is never dropped on a scope change ────────────── */

test("a pending mind-map write survives a module or map switch", () => {
  // The scope a debounce belongs to is captured when it is QUEUED, because
  // `scopeRef` is reassigned on every render and would otherwise point at the
  // document the learner just navigated AWAY from.
  assert.match(mindMapHook, /pendingScopeRef\.current = \{ \.\.\.scopeRef\.current \};/);
  assert.match(mindMapHook, /persist\(pendingScopeRef\.current\);/);
  assert.match(mindMapHook, /const persist = useCallback\(\(override\?: typeof scopeRef\.current \| null\) => \{/);
  assert.match(mindMapHook, /\} = override \?\? scopeRef\.current;/);
  // The load effect writes the outgoing map out BEFORE it drops `readyRef` —
  // after that point `persist` refuses to run, which is exactly how the edit
  // used to vanish.
  // Sliced past the effect's `!scoped` guard, which drops readyRef on its own
  // (a different, legitimate path: there is nothing to write without a scope).
  const loadEffect = mindMapHook.slice(
    mindMapHook.indexOf("let cancelled = false;", mindMapHook.indexOf("// ── Load: Firestore first")),
  );
  const flushAt = loadEffect.indexOf("persistRef.current(pendingScopeRef.current);");
  const readyAt = loadEffect.indexOf("readyRef.current = false;");
  assert.ok(flushAt > -1, "the load effect must flush the outgoing map");
  assert.ok(readyAt > -1, "the load effect must still gate persist");
  assert.ok(flushAt < readyAt, "the flush must happen BEFORE readyRef is dropped");
  // flush() honours the pending scope too, so leaving the room is safe.
  assert.match(mindMapHook, /const pending = timerRef\.current !== null \? pendingScopeRef\.current : null;/);
});

test("the room opens the mind board on the CANVAS, not the library overlay", () => {
  // A dedicated mind board with its own Maps key in the tray has no use for a
  // library covering the canvas: the learner tapped the wall to draw.
  assert.match(player, /const returnStudySurfacesToLibrary = useCallback\(\(room = false\) => \{/);
  assert.match(player, /setMindMapSessionView\(room \? "canvas" : "library"\);/);
  assert.match(player, /returnStudySurfacesToLibrary\(true\);/);
  // The flat player is untouched: its mind map tab still starts on the library,
  // because there that tab IS the map chooser.
  assert.match(player, /setNotesSessionView\(\{ view: "list" \}\);/);
});

/* ── 7. The two keys the owner asked for ─────────────────────────────────── */

test("the room is one shell over one brain — nothing was duplicated", () => {
  // The board, notes and mind surfaces are still the player's OWN panels.
  assert.equal((classroom.match(/\{board\}/g) || []).length, 1);
  assert.equal((classroom.match(/\{notes\}/g) || []).length, 1);
  assert.equal((classroom.match(/\{mind\}/g) || []).length, 1);
  assert.doesNotMatch(classroom, /createPortal/);
  assert.match(player, /board=\{viewerStack\}/);
});
