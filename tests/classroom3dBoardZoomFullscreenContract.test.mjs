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

test("the view blend has a clamped, seat-safe range", () => {
  // MIN = FIT (the seat's own view), MAX = FILL (square-on, board covering the
  // whole screen). The blend is a pose interpolation now, not a dolly in
  // metres, so there is no hand-tuned travel constant to drift out of sync.
  assert.match(state, /export const BOARD_ZOOM_MIN = 1;/);
  assert.match(state, /export const BOARD_ZOOM_MAX = 2;/);
  assert.match(state, /export const BOARD_ZOOM_STEP = 0\.25;/);
  assert.match(state, /export const BOARD_ZOOM_WHEEL = 0\.2;/);
  // The hand-tuned per-orientation fit constant is gone: FILL is computed from
  // the LIVE lens, which is exact in portrait and landscape alike.
  assert.doesNotMatch(state, /BOARD_ZOOM_PORTRAIT_FIT/);
  assert.doesNotMatch(state, /BOARD_DOLLY_METRES/);
  assert.doesNotMatch(state, /BOARD_ZOOM_TOGGLE/);
  // NaN / Infinity / out-of-range input collapses to the safe range.
  assert.match(state, /export const clampBoardZoom = \(value: number\): number =>/);
  assert.match(
    state,
    /Number\.isFinite\(value\) \? Math\.min\(BOARD_ZOOM_MAX, Math\.max\(BOARD_ZOOM_MIN, value\)\) : BOARD_ZOOM_MIN;/,
  );
  // 0 at FIT, 1 at FILL, clamped — the value SeatRig interpolates poses with.
  assert.match(state, /export const zoomBlend = \(value: number\): number => \{/);
  assert.match(state, /Math\.min\(1, Math\.max\(0, \(value - BOARD_ZOOM_MIN\) \/ span\)\);/);
});

test("SeatRig blends the FIT and FILL poses on the head-turn spring", () => {
  // The blend rides the very same critically-damped spring as yaw / pitch.
  assert.match(seatRig, /current\.current\.zoom \+= \(target\.current\.zoom - current\.current\.zoom\) \* k;/);
  assert.match(seatRig, /const blend = zoomBlend\(current\.current\.zoom\);/);
  // FIT pose = the seat itself.
  assert.match(seatRig, /let eyeX = SEAT\.x;/);
  assert.match(seatRig, /let eyeZ = SEAT\.z;/);
  // FILL pose = square-on to the focused board (yaw 0, pitch 0 — no skew) at
  // the distance the LIVE lens needs for the slab to cover the whole frame.
  assert.match(seatRig, /const side = FOCUS_BOARD\[focusRef\.current\];/);
  assert.match(seatRig, /if \(side && blend > 0\) \{/);
  assert.match(
    seatRig,
    /const distance = fillDistance\(\s+BOARD\.width,\s+BOARD\.height,[\s\S]*?size\.width \/ Math\.max\(1, size\.height\),\s+\);/,
  );
  assert.match(seatRig, /eyeZ \+= \(BOARD\.z \+ distance - eyeZ\) \* blend;/);
  assert.match(seatRig, /eyeX \+= \(boardX - eyeX\) \* blend;/);
  assert.match(seatRig, /yaw \+= \(0 - yaw\) \* blend;/);
  assert.match(seatRig, /pitch \+= \(0 - pitch\) \* blend;/);
  assert.match(seatRig, /camera\.position\.set\(eyeX, eyeY, eyeZ\);/);
});

test("the blend glides back to FIT when the head leaves the boards", () => {
  // Any of the THREE boards can fill — only the desk has no FILL pose, and the
  // spring below makes the return an ease rather than a jump-cut.
  assert.match(seatRig, /target\.current\.zoom = FOCUS_BOARD\[focus\] \? clampBoardZoom\(zoom\) : BOARD_ZOOM_MIN;/);
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

test("the wheel drives FIT ⇄ FILL, and only while facing a board", () => {
  // Native listener so preventDefault actually holds (React onWheel is
  // passive-by-default and the room must never scroll under the learner).
  assert.match(seatRig, /element\.addEventListener\("wheel", onWheel, \{ passive: false \}\);/);
  assert.match(seatRig, /if \(!FOCUS_BOARD\[focusRef\.current\]\) return;/);
  assert.match(seatRig, /event\.preventDefault\(\);/);
  // Same notch as the image viewer's wheel zoom, from one shared constant.
  assert.match(
    seatRig,
    /onZoomDeltaRef\.current\?\.\(event\.deltaY < 0 \? BOARD_ZOOM_WHEEL : -BOARD_ZOOM_WHEEL\);/,
  );
});

test("a two-finger pinch on the room drives the blend from the finger spread", () => {
  // The second fingertip converts the drag into a pinch.
  assert.match(seatRig, /if \(pointers\.current\.size === 2\) \{/);
  assert.match(seatRig, /dragging\.current = false;/);
  assert.match(seatRig, /pinch\.current = \{ distance, zoom: target\.current\.zoom, applied: target\.current\.zoom \};/);
  // Same distance-ratio maths as the image viewer's pinch zoom, clamped.
  assert.match(seatRig, /const next = clampBoardZoom\(\(pinch\.current\.zoom \* distance\) \/ pinch\.current\.distance\);/);
  assert.match(seatRig, /if \(delta !== 0\) onZoomDeltaRef\.current\?\.\(delta\);/);
  // Pinch, like the wheel, works on any board and is a no-op over the desk.
  assert.match(
    seatRig,
    /if \(FOCUS_BOARD\[focusRef\.current\] && pinch\.current && pinch\.current\.distance > 0\) \{/,
  );
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

test("BoardPanel renders the cycle + fit/fill + fullscreen cluster", () => {
  assert.match(panels, /data-classroom-board-panel/);
  assert.match(panels, /data-classroom-board-controls/);
  // The THREE-TAP focus key: Board → Notes → Mind map → Board …
  assert.match(panels, /data-classroom-board-cycle/);
  assert.match(panels, /<Repeat size=\{14\} \/>/);
  assert.match(panels, /aria-label="Switch surface: board, notes, mind map"/);
  // It carries the surface it is ON, so the order never has to be remembered.
  assert.match(panels, /<span className="dc-classroom-board-cycle-label">\{focusLabel\}<\/span>/);
  // The DUAL-FUNCTION fit key: FIT ⇄ FILL.
  assert.match(panels, /data-classroom-board-zoom-fit/);
  assert.match(panels, /data-filled=\{filled \? "true" : "false"\}/);
  assert.match(panels, /\{filled \? <Minimize size=\{14\} \/> : <Maximize size=\{14\} \/>\}/);
  assert.match(
    panels,
    /aria-label=\{filled \? "Fit the board to the room view" : "Zoom the board to fill the screen"\}/,
  );
  assert.match(panels, /data-classroom-board-fullscreen/);
  assert.match(panels, /<Expand size=\{14\} \/>/);
  assert.match(panels, /<Shrink size=\{14\} \/>/);
  assert.match(panels, /aria-label=\{boardFullscreen \? "Exit fullscreen" : "Fullscreen"\}/);
  // The old +/− pair is gone: one cycle key and one two-state fit key replace
  // them, and continuous sweep stays on the wheel, the pinch and +/− on the
  // keyboard. Nothing in the room may still offer a dead zoom key.
  assert.doesNotMatch(panels, /data-classroom-board-zoom-in/);
  assert.doesNotMatch(panels, /data-classroom-board-zoom-out/);
});

test("the blend readout tracks the live pose", () => {
  // Past halfway the camera is on its way to FILL, so the key offers FIT — and
  // the readout says how far along the blend is.
  assert.match(panels, /const filled = zoomBlend\(zoom\) >= 0\.5;/);
  // The percentage re-keys on every change so the CSS pop re-fires.
  assert.match(panels, /key=\{Math\.round\(zoom \* 100\)\}/);
  assert.match(panels, /\{Math\.round\(zoomBlend\(zoom\) \* 100\)\}%/);
  // Both keys disable when the room did not supply them.
  assert.match(panels, /disabled=\{!onCycleFocus\}/);
  assert.match(panels, /disabled=\{!onToggleFitFill && !onFit\}/);
});

test("the room wires the cycle and fit/fill keys to the board chrome", () => {
  assert.match(classroom, /onCycleFocus=\{cycleFocus\}/);
  assert.match(classroom, /onToggleFitFill=\{toggleFitFill\}/);
  assert.match(classroom, /onFit=\{fitBoard\}/);
  assert.match(classroom, /focusLabel=\{focusLabel\}/);
  assert.match(classroom, /onToggleFullscreen=\{toggleBoardFullscreen\}/);
  assert.match(classroom, /onToggleZoom=\{toggleBoardZoom\}/);
  // Both keys also live in the ALWAYS-VISIBLE control tray: the board chrome is
  // only readable while the board is faced, and the whole point of the cycle
  // key is to leave the board you are looking at.
  assert.match(classroom, /data-classroom-cycle-focus/);
  assert.match(classroom, /data-classroom-fit-fill/);
  assert.match(classroom, /onClick=\{cycleFocus\}/);
  assert.match(classroom, /onClick=\{toggleFitFill\}/);
});

// ---------------------------------------------------------------------------
// 4. Double-click / double-tap on the board toggles the close-up — viewer
//    gestures stay the viewer's.
// ---------------------------------------------------------------------------

test("double-click and double-tap on a board flip FIT ⇄ FILL", () => {
  // Mouse path.
  assert.match(panels, /onDoubleClick=\{\(event\) => \{/);
  // Touch path: two pointer-ups within 350 ms and 48 px (mobile browsers
  // don't reliably fire dblclick).
  assert.match(panels, /event\.pointerType === "mouse"/);
  assert.match(panels, /now - tap\.current\.time < 350 && travelled < 48/);
  // A touch toggle's trailing synthetic dblclick must not toggle straight back.
  assert.match(panels, /if \(Date\.now\(\) - touchToggledAt\.current < 600\) return;/);
  assert.match(panels, /onToggleZoom\(\);/);
  // The room's double-tap handler IS the fit/fill key — one behaviour, two ways
  // to reach it.
  assert.match(classroom, /const toggleBoardZoom = toggleFitFill;/);
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

test("FIT resets the blend and recentres the head", () => {
  assert.match(classroom, /const fitBoard = useCallback\(\(\) => \{/);
  assert.match(classroom, /setBoardZoom\(BOARD_ZOOM_MIN\);/);
  assert.match(classroom, /setBoardFitSignal\(\(value\) => value \+ 1\);/);
  // The signal re-aims the head even when the focus never changed.
  assert.match(seatRig, /\}, \[focus, recenterSignal\]\);/);
  assert.match(classroom, /const \[boardFitSignal, setBoardFitSignal\] = useState\(0\);/);
});

test("the fit key is DUAL-FUNCTION: fit, then only-the-board, then fit again", () => {
  // The owner's spec, exactly: "pahle click mein fit, dusre click mein keval
  // board zoom, aur again click wapas fit — ese continuous chalta rahe."
  assert.match(classroom, /const toggleFitFill = useCallback\(\(\) => \{/);
  assert.match(
    classroom,
    /setBoardZoom\(\(current\) =>\s+current > BOARD_ZOOM_MIN \+ 1e-6 \? BOARD_ZOOM_MIN : BOARD_ZOOM_MAX,\s+\);/,
  );
  // Read from the live blend, never a second flag, so the wheel and the pinch
  // can't leave the key disagreeing with the camera.
  assert.match(classroom, /const filled = zoomBlend\(boardZoom\) >= 0\.5;/);
});

test("the zoom key is THREE-TAP: board, then notes, then mind map, forever", () => {
  // The owner's spec: "pahle click mein board per focus, dusre mein note per,
  // teesre mein mind map per — aur ese baar baar click karne par switch hota
  // rahe."
  assert.match(state, /export const FOCUS_CYCLE: readonly ClassroomFocus\[\] = \["board", "notes", "mind"\] as const;/);
  assert.match(state, /export const nextFocusInCycle = \(current: ClassroomFocus\): ClassroomFocus => \{/);
  assert.match(state, /return FOCUS_CYCLE\[\(index \+ 1\) % FOCUS_CYCLE\.length\];/);
  // Off-cycle (the desk) starts the cycle at the board instead of skipping.
  assert.match(state, /if \(index < 0\) return FOCUS_CYCLE\[0\];/);
  assert.match(classroom, /const cycleFocus = useCallback\(\(\) => \{/);
  assert.match(classroom, /setFocus\(\(current\) => nextFocusInCycle\(current\)\);/);
  // The blend is deliberately NOT reset, so a filled learner cycles through
  // three full-screen boards and a fitted one cycles through the room.
  const body = classroom.slice(
    classroom.indexOf("const cycleFocus = useCallback"),
    classroom.indexOf("/** Which surface the cycle key is sitting on"),
  );
  assert.doesNotMatch(body, /setBoardZoom/);
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
  // `sheet` joined the deps when the floating library landed, and the two new
  // keys (C = cycle, F = fit/fill) joined with them: Esc closes an open
  // chooser first, then fullscreen, then drops to the desk.
  assert.match(
    classroom,
    /\}, \[step, focus, sheet, boardFullscreen, zoomBoardBy, fitBoard, toggleFitFill, cycleFocus\]\);/,
  );
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

test("keyboard +/−/0 sweep the blend while facing any board; C and F are the new keys", () => {
  assert.match(classroom, /FOCUS_CYCLE\.includes\(focus\) && \(event\.key === "\+" \|\| event\.key === "="\)/);
  assert.match(classroom, /zoomBoardBy\(BOARD_ZOOM_STEP\)/);
  assert.match(classroom, /FOCUS_CYCLE\.includes\(focus\) && \(event\.key === "-" \|\| event\.key === "_"\)/);
  assert.match(classroom, /zoomBoardBy\(-BOARD_ZOOM_STEP\)/);
  assert.match(classroom, /else if \(event\.key === "0"\) fitBoard\(\);/);
  assert.match(classroom, /else if \(event\.key === "f" \|\| event\.key === "F"\) toggleFitFill\(\);/);
  assert.match(classroom, /else if \(event\.key === "c" \|\| event\.key === "C"\) cycleFocus\(\);/);
});

// ---------------------------------------------------------------------------
// 8. Regression guards — everything else stays exactly as it was.
// ---------------------------------------------------------------------------

test("module switching and lesson stepping are untouched", () => {
  // Opening a file also dismisses the floating chooser — it is a chooser,
  // not a place content lives — and then puts the head back on the board.
  assert.match(classroom, /onSelectFile\(file\);[\s\S]{0,220}?setSheet\(null\);\s+setFocus\("board"\);/);
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
  // The hint teaches the two keys the owner asked for, in both orientations.
  assert.match(classroom, /tap Zoom to fill the screen with one board/);
  assert.match(classroom, /F flips Fit ⇄ Zoom/);
  assert.match(classroom, /C cycles Board → Notes → Mind map/);
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
