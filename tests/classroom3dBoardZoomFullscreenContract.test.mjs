// tests/classroom3dBoardZoomFullscreenContract.test.mjs
//
// Part 12 — 3D Classroom board zoom + fit + fullscreen.
//
// The room lets the learner turn their head between Board / Notes / Mind /
// Desk, but until this part there was no way to lean closer to the board,
// fit it to the screen, or read it fullscreen without leaving the room for
// the flat player. These contract tests pin the implementation to the spec:
//
//   1. CAMERA ZOOM — a clamped board lean (1 = the seat, 2.5 = the closest
//      look) on the same spring as the head turn, driven by the wheel /
//      pinch on the empty room and by a double-tap / double-click on the
//      board. It glides back to the seat whenever the focus leaves "board".
//   2. BOARD CONTROLS — a + / − / fit / fullscreen cluster on the board's
//      own title bar, in the HUD chip language, with Fit reusing the room's
//      `portrait` flag.
//   3. FULLSCREEN — the SAME viewer instance shown with the Fullscreen API
//      (the exact ResourceViewer mechanism), so there is no unmount, no
//      iframe reload and no lost playback. Esc exits fullscreen first and
//      only otherwise drops back to the desk.
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
const state = read("src/classroom3d/state.ts");
const css = read("src/classroom3d/classroom3d.css");
const resourceViewer = read("src/course/ResourceViewer.tsx");
const player = read("src/CoursePlayerApp.tsx");

// ---------------------------------------------------------------------------
// 1. The zoom range is clamped so the camera can neither leave the seat
//    backwards nor clip through the board.
// ---------------------------------------------------------------------------

test("the board lean has a clamped, seat-safe range", () => {
  assert.match(state, /export const BOARD_ZOOM_MIN = 1;/);
  assert.match(state, /export const BOARD_ZOOM_MAX = 2\.5;/);
  assert.match(state, /export const BOARD_ZOOM_STEP = 0\.25;/);
  assert.match(state, /export const BOARD_ZOOM_TOGGLE = 2;/);
  assert.match(state, /export const BOARD_ZOOM_PORTRAIT_FIT = 1\.15;/);
  assert.match(state, /export const BOARD_DOLLY_METRES = 2\.4;/);
  // NaN / Infinity / out-of-range input collapses to the safe range.
  assert.match(state, /export const clampBoardZoom = \(value: number\): number =>/);
  assert.match(
    state,
    /Number\.isFinite\(value\) \? Math\.min\(BOARD_ZOOM_MAX, Math\.max\(BOARD_ZOOM_MIN, value\)\) : BOARD_ZOOM_MIN;/,
  );
});

test("SeatRig turns the lean into a forward dolly on the head-turn spring", () => {
  // The lean rides the very same critically-damped spring as yaw / pitch.
  assert.match(seatRig, /current\.current\.zoom \+= \(target\.current\.zoom - current\.current\.zoom\) \* k;/);
  // …and becomes a forward dolly from the seat, clamped at both ends.
  assert.match(
    seatRig,
    /\(clamp\(current\.current\.zoom, BOARD_ZOOM_MIN, BOARD_ZOOM_MAX\) - BOARD_ZOOM_MIN\) \* BOARD_DOLLY_METRES/,
  );
  assert.match(seatRig, /camera\.position\.set\(SEAT\.x, SEAT\.y \+ Math\.sin\(t \* 0\.8\) \* 0\.006, SEAT\.z - lean\);/);
});

test("the lean glides back to the seat when the focus leaves the board", () => {
  // Same effect pattern as the head re-aim: the TARGET resets, the spring
  // below makes the return a lean-back rather than a jump-cut.
  assert.match(seatRig, /target\.current\.zoom = focus === "board" \? clampBoardZoom\(zoom\) : BOARD_ZOOM_MIN;/);
});

test("the room owns the zoom state and feeds it to the rig and the wall", () => {
  assert.match(classroom, /const \[boardZoom, setBoardZoom\] = useState\(BOARD_ZOOM_MIN\);/);
  assert.match(classroom, /const zoomBoardBy = useCallback\(\(delta: number\) => \{/);
  assert.match(classroom, /clampBoardZoom\(Number\(\(current \+ delta\)\.toFixed\(3\)\)\)/);
  assert.match(
    classroom,
    /<SeatRig focus=\{focus\} zoom=\{boardZoom\} recenterSignal=\{boardFitSignal\} onZoomDelta=\{zoomBoardBy\} \/>/,
  );
  assert.match(classroom, /zoom=\{boardZoom\}/);
  assert.match(classroom, /boardFullscreen=\{boardFullscreen\}/);
});

// ---------------------------------------------------------------------------
// 2. Wheel / pinch on the empty room lean the seat — board only.
// ---------------------------------------------------------------------------

test("the wheel leans toward the board, and only while facing it", () => {
  // Native listener so preventDefault actually holds (React onWheel is
  // passive-by-default and the room must never scroll under the learner).
  assert.match(seatRig, /element\.addEventListener\("wheel", onWheel, \{ passive: false \}\);/);
  assert.match(seatRig, /if \(focusRef\.current !== "board"\) return;/);
  assert.match(seatRig, /event\.preventDefault\(\);/);
  // Same notch as the image viewer's wheel zoom.
  assert.match(seatRig, /onZoomDeltaRef\.current\?\.\(event\.deltaY < 0 \? 0\.2 : -0\.2\);/);
});

test("a two-finger pinch on the room drives the lean from the finger spread", () => {
  // The second fingertip converts the drag into a pinch.
  assert.match(seatRig, /if \(pointers\.current\.size === 2\) \{/);
  assert.match(seatRig, /dragging\.current = false;/);
  assert.match(seatRig, /pinch\.current = \{ distance, zoom: target\.current\.zoom, applied: target\.current\.zoom \};/);
  // Same distance-ratio maths as the image viewer's pinch zoom, clamped.
  assert.match(seatRig, /const next = clampBoardZoom\(\(pinch\.current\.zoom \* distance\) \/ pinch\.current\.distance\);/);
  assert.match(seatRig, /if \(delta !== 0\) onZoomDeltaRef\.current\?\.\(delta\);/);
  // Pinch, like the wheel, is a no-op anywhere but the board.
  assert.match(seatRig, /if \(focusRef\.current === "board" && pinch\.current && pinch\.current\.distance > 0\) \{/);
  // Lifting back to one fingertip resumes the head turn from where it is.
  assert.match(seatRig, /if \(pointers\.current\.size === 1\) \{/);
});

test("the single-finger head turn is unchanged by the pinch split", () => {
  assert.match(seatRig, /target\.current\.yaw = clamp\(target\.current\.yaw \+ dx \* 0\.0042, YAW_LIMIT\.min, YAW_LIMIT\.max\);/);
  assert.match(
    seatRig,
    /target\.current\.pitch = clamp\(target\.current\.pitch - dy \* 0\.0032, PITCH_LIMIT\.min, PITCH_LIMIT\.max\);/,
  );
});

// ---------------------------------------------------------------------------
// 3. The board wall carries zoom in / zoom out / fit / fullscreen.
// ---------------------------------------------------------------------------

test("BoardPanel renders the zoom + fit + fullscreen cluster", () => {
  assert.match(panels, /data-classroom-board-panel/);
  assert.match(panels, /data-classroom-board-controls/);
  assert.match(panels, /data-classroom-board-zoom-out/);
  assert.match(panels, /data-classroom-board-zoom-in/);
  assert.match(panels, /data-classroom-board-zoom-fit/);
  assert.match(panels, /data-classroom-board-fullscreen/);
  assert.match(panels, /data-classroom-board-zoom-pct/);
  // Fit reuses the image viewer's Maximize glyph; fullscreen gets Expand/Shrink.
  assert.match(panels, /<ZoomOut size=\{14\} \/>/);
  assert.match(panels, /<ZoomIn size=\{14\} \/>/);
  assert.match(panels, /<Maximize size=\{14\} \/>/);
  assert.match(panels, /<Expand size=\{14\} \/>/);
  assert.match(panels, /<Shrink size=\{14\} \/>/);
  assert.match(panels, /aria-label="Fit to screen"/);
  assert.match(panels, /aria-label=\{boardFullscreen \? "Exit fullscreen" : "Fullscreen"\}/);
});

test("the zoom keys disable at the ends of the lean", () => {
  assert.match(panels, /disabled=\{!onZoomOut \|\| zoomedOut\}/);
  assert.match(panels, /disabled=\{!onZoomIn \|\| zoomedIn\}/);
  assert.match(panels, /const zoomedOut = zoom <= BOARD_ZOOM_MIN \+ 1e-6;/);
  assert.match(panels, /const zoomedIn = zoom >= BOARD_ZOOM_MAX - 1e-6;/);
  // The percentage re-keys on every change so the CSS pop re-fires.
  assert.match(panels, /key=\{Math\.round\(zoom \* 100\)\}/);
});

test("the board's zoom keys face the board before leaning", () => {
  assert.match(classroom, /onZoomIn=\{\(\) => \{\s+setFocus\("board"\);\s+zoomBoardBy\(BOARD_ZOOM_STEP\);\s+\}\}/);
  assert.match(classroom, /onZoomOut=\{\(\) => \{\s+setFocus\("board"\);\s+zoomBoardBy\(-BOARD_ZOOM_STEP\);\s+\}\}/);
  assert.match(classroom, /onFit=\{fitBoard\}/);
  assert.match(classroom, /onToggleFullscreen=\{toggleBoardFullscreen\}/);
  assert.match(classroom, /onToggleZoom=\{toggleBoardZoom\}/);
});

// ---------------------------------------------------------------------------
// 4. Double-click / double-tap on the board toggles the close-up — viewer
//    gestures stay the viewer's.
// ---------------------------------------------------------------------------

test("double-click and double-tap on the board toggle the close-up", () => {
  // Mouse path.
  assert.match(panels, /onDoubleClick=\{\(event\) => \{/);
  // Touch path: two pointer-ups within 350 ms and 48 px (mobile browsers
  // don't reliably fire dblclick).
  assert.match(panels, /event\.pointerType === "mouse"/);
  assert.match(panels, /now - tap\.current\.time < 350 && travelled < 48/);
  // A touch toggle's trailing synthetic dblclick must not toggle straight back.
  assert.match(panels, /if \(Date\.now\(\) - touchToggledAt\.current < 600\) return;/);
  assert.match(panels, /onToggleZoom\(\);/);
  // The room recentres the head and toggles between fit and the close-up.
  assert.match(classroom, /const toggleBoardZoom = useCallback\(\(\) => \{/);
  assert.match(classroom, /: BOARD_ZOOM_TOGGLE,/);
});

test("gestures inside the lesson viewer never lean the camera", () => {
  // Double-clicking a diagram zooms the DIAGRAM (flat-mode behaviour) — the
  // board ignores anything that starts inside the viewer, and the control
  // cluster is not a double-tap target either.
  assert.match(panels, /\(target as HTMLElement\)\.closest\("\[data-course-viewer\]"\)/);
  assert.match(panels, /if \(!onToggleZoom \|\| insideViewer\(event\.target\)\) return;/);
  assert.match(panels, /onDoubleClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(panels, /onPointerUp=\{\(event\) => event\.stopPropagation\(\)\}/);
});

// ---------------------------------------------------------------------------
// 5. Fit-to-screen resets the lean and recentres, reusing `portrait`.
// ---------------------------------------------------------------------------

test("fit-to-screen resets the lean and recentres the board", () => {
  // Portrait fits a touch closer (the widened lens shrinks the board);
  // landscape returns to the seat's exact normal position.
  assert.match(classroom, /setBoardZoom\(portrait \? BOARD_ZOOM_PORTRAIT_FIT : BOARD_ZOOM_MIN\);/);
  assert.match(classroom, /const fitBoard = useCallback\(\(\) => \{/);
  assert.match(classroom, /setBoardFitSignal\(\(value\) => value \+ 1\);/);
  // The signal re-aims the head even when the focus never changed.
  assert.match(seatRig, /\}, \[focus, recenterSignal\]\);/);
  assert.match(classroom, /const \[boardFitSignal, setBoardFitSignal\] = useState\(0\);/);
});

// ---------------------------------------------------------------------------
// 6. Fullscreen reuses ResourceViewer's mechanism on the SAME instance.
// ---------------------------------------------------------------------------

test("board fullscreen is ResourceViewer's mechanism aimed at the board panel", () => {
  assert.match(classroom, /const toggleBoardFullscreen = useCallback\(\(\) => \{/);
  assert.match(classroom, /const root = document\.querySelector\("\[data-classroom-board-panel\]"\);/);
  assert.match(classroom, /if \(document\.fullscreenElement\) void document\.exitFullscreen\(\);/);
  assert.match(classroom, /void \(root as HTMLElement\)\.requestFullscreen\?\.\(\);/);
  // …and the flat player's own toggle is untouched (no second mechanism).
  assert.match(resourceViewer, /const toggleFullscreen = useCallback\(\(\) => \{/);
  assert.match(resourceViewer, /document\.querySelector\("\[data-course-viewer\]\[data-active=\\"true\\"\]"\)/);
});

test("the SAME board instance goes fullscreen — the viewer is never duplicated", () => {
  // The `board` node is rendered exactly once, inside the wall panel; the
  // Fullscreen API only changes WHERE that one instance is displayed (top
  // layer over the live canvas), so there is no unmount, no iframe reload
  // and no lost playback position.
  assert.strictEqual((classroom.match(/\{board\}/g) || []).length, 1);
  assert.doesNotMatch(classroom, /createPortal/);
  assert.match(classroom, /boardFullscreen=\{boardFullscreen\}/);
});

test("the fullscreen sync ignores the YouTube player's own fullscreen", () => {
  assert.match(classroom, /document\.addEventListener\("fullscreenchange", sync\);/);
  assert.match(classroom, /document\.removeEventListener\("fullscreenchange", sync\);/);
  assert.match(
    classroom,
    /setBoardFullscreen\(Boolean\(active && panel && \(active === panel \|\| panel\.contains\(active\)\)\)\);/,
  );
});

// ---------------------------------------------------------------------------
// 7. Esc exits board-fullscreen first; the room is otherwise untouched.
// ---------------------------------------------------------------------------

test("Esc exits board-fullscreen first and only otherwise drops to the desk", () => {
  // Order matters: the live top layer is read BEFORE any focus change, so a
  // lagging state sync can neither re-request fullscreen nor yank the head.
  assert.match(
    classroom,
    /else if \(event\.key === "Escape"\) \{[\s\S]*?if \(document\.fullscreenElement\) void document\.exitFullscreen\(\);[\s\S]*?else setFocus\("desk"\);/,
  );
  assert.match(classroom, /else if \(boardFullscreen\) setBoardFullscreen\(false\);/);
  assert.match(classroom, /\}, \[step, focus, boardFullscreen, zoomBoardBy, fitBoard\]\);/);
});

test("exiting fullscreen returns to the same focus, head and lean", () => {
  // The toggle and the sync touch ONLY the top layer + the label state —
  // focus, the fit signal and the zoom are never written on the way in or out.
  const toggle = classroom.slice(
    classroom.indexOf("const toggleBoardFullscreen"),
    classroom.indexOf("Keep the Fullscreen / Exit label"),
  );
  assert.doesNotMatch(toggle, /setFocus/);
  assert.doesNotMatch(toggle, /setBoardZoom/);
  assert.doesNotMatch(toggle, /setBoardFitSignal/);
  const sync = classroom.slice(classroom.indexOf("const sync = () => {"), classroom.indexOf("sync();"));
  assert.doesNotMatch(sync, /setFocus/);
  assert.doesNotMatch(sync, /setBoardZoom/);
});

test("keyboard +/−/0 lean only while facing the board", () => {
  assert.match(classroom, /focus === "board" && \(event\.key === "\+" \|\| event\.key === "="\)/);
  assert.match(classroom, /zoomBoardBy\(BOARD_ZOOM_STEP\)/);
  assert.match(classroom, /focus === "board" && \(event\.key === "-" \|\| event\.key === "_"\)/);
  assert.match(classroom, /zoomBoardBy\(-BOARD_ZOOM_STEP\)/);
  assert.match(classroom, /focus === "board" && event\.key === "0"\) fitBoard\(\)/);
});

// ---------------------------------------------------------------------------
// 8. Regression guards — everything else stays exactly as it was.
// ---------------------------------------------------------------------------

test("module switching and lesson stepping are untouched", () => {
  assert.match(classroom, /onSelectFile\(file\);\s+setFocus\("board"\);/);
  assert.match(classroom, /if \(flat\[m\]\.locked\) \{/);
  assert.match(classroom, /openFile\(m, f\);/);
  assert.match(classroom, /else if \(event\.key === "ArrowRight"\) step\(1\);/);
  assert.match(classroom, /else if \(event\.key === "ArrowLeft"\) step\(-1\);/);
});

test("the player still owns course state — the room stays a shell", () => {
  assert.match(player, /board=\{viewerStack\}/);
  assert.match(player, /<NotesPanel/);
  assert.match(player, /<MindMapPanel/);
  assert.doesNotMatch(player, /boardZoom/);
  assert.doesNotMatch(player, /toggleBoardFullscreen/);
  assert.doesNotMatch(player, /BOARD_ZOOM/);
});

test("the orientation-aware lens and the hint's portrait wording survive", () => {
  assert.match(seatRig, /const targetHorizontalFov = THREE\.MathUtils\.degToRad\(76\);/);
  assert.match(classroom, /window\.innerHeight > window\.innerWidth/);
  assert.match(classroom, /double-tap the board to lean in/);
  assert.match(classroom, /scroll to lean in/);
});

test("no HDRI or environment maps — the room still renders offline", () => {
  assert.match(classroom, /No HDRI env map on purpose/);
  assert.doesNotMatch(classroom, /<Environment/);
  assert.doesNotMatch(room, /<Environment/);
  assert.doesNotMatch(seatRig, /<Environment/);
});

test("the board CSS speaks the HUD chip language and sizes the top layer", () => {
  assert.match(css, /\.dc-classroom-board-controls \{/);
  assert.match(css, /\.dc-classroom-board-btn \{/);
  assert.match(css, /\.dc-classroom-board-btn\[data-active="true"\] \{/);
  assert.match(css, /\.dc-classroom-board-pct \{/);
  assert.match(css, /@keyframes dc-classroom-pct-pop \{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  // Viewport units (not %) so the wall's fixed-pixel box can't constrain it.
  assert.match(css, /\[data-classroom-board-panel\]:fullscreen \{/);
  assert.match(css, /width: 100vw;/);
  assert.match(css, /height: 100vh;/);
  assert.match(css, /height: 100dvh;/);
  assert.match(css, /\[data-classroom-board-panel\]::backdrop \{/);
});
