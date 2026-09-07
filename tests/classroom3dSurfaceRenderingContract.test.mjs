// tests/classroom3dSurfaceRenderingContract.test.mjs
//
// THE 3D CLASSROOM — surfaces that actually show something, and scroll.
//
// Reported by the owner, sitting in the finished room: "board dikh raha hai,
// sabhi board dikh rahe hain — bas un par koi content nahi dikh raha, kuch
// bhi nahi dikh raha." Every slab was there, lit and framed. Every slab was
// empty.
//
// Three separate faults produced that one symptom, and this file pins all
// three fixes:
//
//   1. SCALE — the px → metre mapping for drei's <Html transform> was
//      hand-rolled as `width / pixelWidth`, which is 40× too small, because
//      drei maps 40 CSS px to one world unit (`1 / ((distanceFactor || 10) /
//      400)` in its transform maths). The 6.4 m lecture board therefore
//      carried a 16 cm sliver of DOM and the desk tablet a 3 cm one: present,
//      correct, invisible. All surfaces now go through `surfaceScale()`.
//
//   2. WAKE-UP — a wall only rendered while it was the room's `focus`, which
//      only a HUD chip or a desk button could set. Dragging the view round to
//      the notes wall showed a wall that had switched itself off. Walls now
//      wake on focus OR on-screen (wallFocus.ts, published by WallVisibility).
//
//   3. SCROLL — the room is `touch-action: none` (a head-turn drag must never
//      scroll the page), and touch-action is intersected down the ancestor
//      chain, so no panel could be scrolled by finger at all. The room now
//      scrolls its own panels with pointer events: drag anywhere, plus
//      press-and-HOLD scroll keys on the board that run on rAF instead of
//      jumping a fixed amount per click.
//
// Plus the floating in-room library the owner asked for: the Modules / Notes
// / Maps keys open a chooser in the middle of the room that scrolls with a
// thumb — and every pick closes it and renders the content ON A BOARD.
//
// Style note: like every other contract file in this repo, these tests assert
// the SOURCE, so the implementation stays in sync with the spec.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const surfaceScale = read("src/classroom3d/surfaceScale.ts");
const surfaceFrame = read("src/classroom3d/SurfaceFrame.tsx");
const deskConsole = read("src/classroom3d/DeskConsole.tsx");
const surfaceScroll = read("src/classroom3d/surfaceScroll.ts");
const useSurfaceScroll = read("src/classroom3d/useSurfaceScroll.ts");
const wallFocus = read("src/classroom3d/wallFocus.ts");
const wallVisibility = read("src/classroom3d/WallVisibility.tsx");
const classroom = read("src/classroom3d/Classroom3D.tsx");
const roomSheet = read("src/classroom3d/RoomSheet.tsx");
const panels = read("src/classroom3d/panels.tsx");
const notesPanel = read("src/course/NotesPanel.tsx");
const player = read("src/CoursePlayerApp.tsx");
const preview = read("src/classroom3d/Classroom3DPreview.tsx");
const css = read("src/classroom3d/classroom3d.css");

// ---------------------------------------------------------------------------
// 1. The px → metre mapping, pinned to drei's own maths.
// ---------------------------------------------------------------------------

test("the surface scale is derived from drei's transform ratio, not guessed", () => {
  assert.match(surfaceScale, /export const HTML_PX_PER_UNIT = 40;/);
  assert.match(
    surfaceScale,
    /export const surfaceScale = \(widthMetres: number, pixelWidth: number\): number =>\s*\(widthMetres \/ pixelWidth\) \* HTML_PX_PER_UNIT;/,
  );
  // The header must keep explaining WHERE 40 comes from — the next person to
  // touch a slab size needs the derivation, not the number.
  assert.match(surfaceScale, /distanceFactor \|\| 10\) \/ 400/);
});

test("the installed drei still maps 40 CSS px to one world unit", () => {
  // A library bump that changes this ratio silently un-fixes every surface in
  // the room, so the constant is pinned to drei's shipped source.
  const dreiRoot = path.join(repoRoot, "node_modules/.pnpm");
  const candidates = fs.existsSync(dreiRoot)
    ? fs
        .readdirSync(dreiRoot)
        .filter((entry) => entry.startsWith("@react-three+drei@"))
        .map((entry) => path.join(dreiRoot, entry, "node_modules/@react-three/drei/web/Html.js"))
        .filter((file) => fs.existsSync(file))
    : [];
  if (candidates.length === 0) return; // deps not installed in this checkout
  const html = fs.readFileSync(candidates[0], "utf8");
  assert.match(html, /getObjectCSSMatrix\(matrix, 1 \/ \(\(distanceFactor \|\| 10\) \/ 400\)\)/);
});

test("every live surface scales through the helper — never the bare ratio", () => {
  assert.match(surfaceFrame, /import \{ surfaceScale \} from "\.\/surfaceScale";/);
  assert.match(surfaceFrame, /const scale = surfaceScale\(width, pixelWidth\);/);
  assert.match(deskConsole, /import \{ surfaceScale \} from "\.\/surfaceScale";/);
  assert.match(deskConsole, /const scale = surfaceScale\(width, pixelWidth\);/);
  // The 40×-too-small formula must not come back anywhere.
  assert.doesNotMatch(surfaceFrame, /const scale = width \/ pixelWidth;/);
  assert.doesNotMatch(deskConsole, /const scale = width \/ pixelWidth;/);
  // The panels are still welded to the slab face with an explicit scale.
  assert.match(surfaceFrame, /scale=\{scale\}/);
  assert.match(deskConsole, /scale=\{scale\}/);
});

// ---------------------------------------------------------------------------
// 2. A wall the learner turns to must wake up.
// ---------------------------------------------------------------------------

test("on-screen walls are published as their own signal", () => {
  assert.match(wallFocus, /export const setWallOnScreen/);
  assert.match(wallFocus, /export const subscribeWallOnScreen/);
  assert.match(wallFocus, /export const getWallOnScreen/);
  // Edge-triggered: identical state never notifies, so this can't churn React.
  assert.match(wallFocus, /if \(state\[wall\] === onScreen\) return;/);
  // Module-scope state must be reset when a room unmounts.
  assert.match(wallFocus, /export const resetWallOnScreen/);
  assert.match(wallVisibility, /setWallOnScreen\(entry\.wall, show\);/);
  assert.match(wallVisibility, /useEffect\(\(\) => resetWallOnScreen, \[\]\);/);
});

test("the room ORs focus with on-screen when it gates a wall", () => {
  assert.match(classroom, /useSyncExternalStore\(subscribeWallOnScreen, getWallOnScreen, getWallOnScreen\)/);
  assert.match(classroom, /wall="board" active=\{focus === "board" \|\| onScreen\.board \|\| boardFullscreen\}/);
  assert.match(classroom, /wall="notes" active=\{focus === "notes" \|\| onScreen\.notes\}/);
  assert.match(classroom, /wall="mind" active=\{focus === "mind" \|\| onScreen\.mind\}/);
});

// ---------------------------------------------------------------------------
// 3. Scrolling: drag anywhere, and press-and-hold keys.
// ---------------------------------------------------------------------------

test("panels are scrolled by pointer, because touch-action makes native impossible", () => {
  // The room root stays `none` (head-turn drags must not scroll the page) and
  // the surfaces say so explicitly rather than pretending `auto` works.
  assert.match(css, /\.dc-classroom-root \{[\s\S]*?touch-action: none;/);
  assert.match(css, /\.dc-classroom-surface \{[\s\S]*?touch-action: none;/);
  assert.match(surfaceScroll, /export function attachDragScroll/);
  // A gesture only becomes a scroll once something scrollable is under it.
  assert.match(surfaceScroll, /export const findScrollable/);
  assert.match(surfaceScroll, /const found = findScrollable\(event\.target, root\);\s*\n\s*if \(!found\) return;/);
  // A drag is not a tap: past the threshold the trailing click is swallowed.
  assert.match(surfaceScroll, /if \(travelled < THRESHOLD\) return;/);
  assert.match(surfaceScroll, /root\.addEventListener\("click", onClickCapture, true\);/);
  // Release glides, and reduced motion stops dead.
  assert.match(surfaceScroll, /const FRICTION = 0\.94;/);
  assert.match(surfaceScroll, /if \(!reducedMotion\(\) && Math\.abs\(speed\) > MIN_FLING_SPEED\)/);
  // Text entry and self-owning gestures keep their pointer stream.
  assert.match(surfaceScroll, /data-no-surface-scroll/);
  assert.match(surfaceScroll, /contenteditable/);
});

test("every surface in the room gets drag scrolling", () => {
  for (const source of [surfaceFrame, deskConsole]) {
    assert.match(source, /import \{ useDragScroll \} from "\.\/useSurfaceScroll";/);
    assert.match(source, /const panelRef = useDragScroll<HTMLDivElement>\(\);/);
    assert.match(source, /ref=\{panelRef\}/);
  }
  // The floating chooser lives above the canvas but under the same
  // `touch-action: none` ancestor, so it needs the very same treatment.
  assert.match(roomSheet, /const body = useDragScroll<HTMLDivElement>\(\);/);
});

test("the board's scroll keys are press-and-hold, not one jump per click", () => {
  assert.match(surfaceScroll, /export function startHoldScroll/);
  // A continuous rAF loop with an accelerating ramp — the owner's "press and
  // hold should keep moving, smoothly".
  assert.match(surfaceScroll, /frame = requestAnimationFrame\(step\);/);
  assert.match(surfaceScroll, /const HOLD_RAMP_MS = 550;/);
  assert.match(surfaceScroll, /cancelAnimationFrame\(frame\)/);
  // The hook binds pointerdown/up/leave/cancel — explicitly NOT onClick.
  assert.match(useSurfaceScroll, /onPointerDown:/);
  assert.match(useSurfaceScroll, /onPointerUp: cancel/);
  assert.match(useSurfaceScroll, /onPointerLeave: cancel/);
  assert.match(useSurfaceScroll, /onPointerCancel: cancel/);
  assert.doesNotMatch(useSurfaceScroll, /onClick:/);
  // And the board wears them, resolving its scroller at press time because
  // the body is a different viewer on every lesson.
  assert.match(panels, /const holdScroll = useHoldScroll\(useCallback\(\(\) => bodyRef\.current, \[\]\)\);/);
  assert.match(panels, /data-classroom-board-scroll-up[\s\S]*?\{\.\.\.holdScroll\(-1\)\}/);
  assert.match(panels, /data-classroom-board-scroll-down[\s\S]*?\{\.\.\.holdScroll\(1\)\}/);
  assert.match(panels, /data-classroom-board-body/);
});

// ---------------------------------------------------------------------------
// 4. The floating library: a chooser, never a content surface.
// ---------------------------------------------------------------------------

test("the right-hand keys open the floating in-room library", () => {
  assert.match(classroom, /data-classroom-open-modules/);
  assert.match(classroom, /data-classroom-open-notes/);
  assert.match(classroom, /data-classroom-open-maps/);
  // Toggle semantics: the same key closes what it opened.
  assert.match(classroom, /setSheet\(\(current\) => \(current === "modules" \? null : "modules"\)\)/);
  // Esc closes the chooser before it touches fullscreen or the head.
  assert.match(classroom, /if \(sheet\) setSheet\(null\);\s*\n\s*else if \(document\.fullscreenElement\)/);
});

test("the chooser holds NO viewer, editor or canvas — content lives on boards", () => {
  for (const forbidden of ["ResourceViewer", "MindMapPanel", "RichTextEditor", "<iframe"]) {
    assert.ok(!roomSheet.includes(forbidden), `RoomSheet must not contain ${forbidden}`);
  }
  // Every pick: close the chooser, turn the head, hand the job to the wall.
  assert.match(classroom, /setSheet\(null\);\s+setFocus\("notes"\);\s+onOpenNote\?\.\(id\);/);
  assert.match(classroom, /setSheet\(null\);\s+setFocus\("mind"\);\s+onSelectMap\?\.\(mapKey\);/);
  assert.match(classroom, /setSheet\(null\);\s+setFocus\("notes"\);\s+onComposeNote\(\);/);
  assert.match(classroom, /setSheet\(null\);\s+setFocus\("mind"\);\s+onCreateMap\(\);/);
});

test("the module chooser scrolls and switches lessons onto the board", () => {
  assert.match(roomSheet, /data-classroom-sheet-module/);
  assert.match(roomSheet, /data-classroom-sheet-lesson/);
  assert.match(roomSheet, /onOpenFile\(moduleIndex, fileIndex\)/);
  // Expanding a module in the floating panel must not empty the desk
  // console's own lesson column behind it.
  assert.match(classroom, /const \[sheetModuleIndex, setSheetModuleIndex\] = useState\(position\.moduleIndex\);/);
  assert.match(classroom, /browseIndex=\{sheetModuleIndex\}/);
  assert.match(classroom, /onBrowseModule=\{setSheetModuleIndex\}/);
});

test("the note library opens the picked note in the wall's own editor", () => {
  assert.match(notesPanel, /openNoteSignal\?: number;/);
  assert.match(notesPanel, /openNoteId\?: string \| null;/);
  assert.match(notesPanel, /const note = notes\.find\(\(entry\) => entry\.id === openNoteId\);\s*\n\s*if \(note\) startEdit\(note\);/);
  // The player owns the request; the room only reports it.
  assert.match(player, /const \[roomNoteRequest, setRoomNoteRequest\]/);
  assert.match(player, /openNoteSignal=\{roomNoteRequest\.signal\}/);
  assert.match(player, /openNoteId=\{roomNoteRequest\.id\}/);
  assert.match(player, /noteItems=\{roomNoteItems\}/);
  assert.match(player, /mapItems=\{roomMapItems\}/);
  assert.match(player, /activeMapKey=\{mindMap\.activeMapKey\}/);
  assert.match(player, /onSelectMap=\{\(mapKey\) => mindMap\.selectMap\(mapKey\)\}/);
  assert.match(player, /onCreateMap=\{\(\) => mindMap\.createMap\(\)\}/);
});

test("the dev sandbox exercises the same contract", () => {
  assert.match(preview, /noteItems=\{/);
  assert.match(preview, /mapItems=\{/);
  assert.match(preview, /onOpenNote=\{\(id\) =>/);
  assert.match(preview, /openNoteSignal=\{noteRequest\.signal\}/);
});

test("the sheet's accent respects the app's browser floor", () => {
  // browserslist floors this app at Chrome 96 / Safari 15; `color-mix` needs
  // Chrome 111 / Safari 16.2, and Lightning CSS cannot lower one that reads a
  // CSS variable — it would ship as-is and be dropped whole on an older
  // engine. The accent is therefore pre-mixed to rgba in JS.
  assert.doesNotMatch(css, /color-mix/);
  assert.match(roomSheet, /const accentTints = \(accent: string\)/);
  assert.match(roomSheet, /"--dc-sheet-accent-wash": `rgba\(\$\{rgb\}, 0\.16\)`/);
});

test("the floating sheet is styled as a panel inside the room", () => {
  assert.match(css, /\.dc-room-sheet-layer \{/);
  // The room stays visible and tappable-to-dismiss behind it.
  assert.match(css, /\.dc-room-sheet-scrim \{/);
  assert.match(roomSheet, /data-classroom-room-sheet-scrim/);
  assert.match(css, /\.dc-room-sheet-body \{[\s\S]*?overflow-y: auto;/);
});
