// tests/coursePlayerSplitSwapContract.test.mjs
//
// Source-shape contract for the owner's 2026-10-04 brief:
//
//   · the module-file DOUBLE TAP that opened a file in the lower split area is
//     GONE — a module row has one gesture again (single press = upper area);
//   · the split's divider carries the new SWITCH: tap the line, press the tiny
//     icon, and the two panes trade places (press it again → back).
//
// tests/coursePlayerSplitSwapRuntime.test.mjs drives the real deck; this file
// keeps the removal (and the pieces the swap is built from) from quietly
// coming back.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const OVERLAY = read("src/course/CourseOverlay.tsx");
const PLAYER = read("src/CoursePlayerApp.tsx");
const DECK = read("src/course/studyPanels.tsx");
const MOTION = read("src/course/splitMotion.ts");

/* ── the double tap is gone ──────────────────────────────────────────────── */

test("no module row carries a second (double tap) gesture any more", () => {
  for (const [name, source] of [["CourseOverlay", OVERLAY], ["CoursePlayerApp", PLAYER]]) {
    assert.equal(/doublePress/.test(source), false, `${name} has no doublePress row gesture`);
    assert.equal(/onSelectFileInSplit/.test(source), false, `${name} has no split-open callback`);
    assert.equal(/DOUBLE_TAP/.test(source), false, `${name} has no double-tap window`);
    assert.equal(/onDoubleClick/.test(source), false, `${name} binds no dblclick on a row`);
  }
});

test("the lower pane's split-file host is gone with it", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "src/course/SplitFilePane.tsx")), false);
  assert.equal(/SplitFilePane|splitPaneActive|splitFile/.test(PLAYER), false);
  assert.equal(/splitPane/.test(OVERLAY), false);
});

test("a single press still opens the file in the upper area", () => {
  assert.match(OVERLAY, /press: fileLocked \? undefined : \(\) => onSelectFile\(file\)/);
});

/* ── the divider's switch ────────────────────────────────────────────────── */

test("the divider hosts a tap-revealed switch button", () => {
  assert.match(DECK, /data-course-split-swap/, "the switch is a marked element");
  assert.match(DECK, /const \[swapVisible, setSwapVisible\] = useState\(false\)/, "hidden until the line is tapped");
  assert.match(DECK, /SWAP_TAP_SLOP_PX/, "a drag is not a tap");
  assert.match(DECK, /SWAP_TAP_MS/, "…and neither is a long press");
  assert.match(DECK, /setTimeout\(\(\) => setSwapVisible\(false\), SWAP_HINT_MS\)/, "it fades away on its own");
  assert.match(DECK, /<ArrowLeftRight size=\{SWAP_ICON_PX\}/, "landscape gets the left/right switch");
  assert.match(DECK, /<ArrowUpDown size=\{SWAP_ICON_PX\}/, "portrait gets the up/down switch");
});

test("the switch's press is a pure toggle — every press swaps", () => {
  assert.match(DECK, /const toggleSwap = useCallback\(\(\) => \{\s*setSwapped\(\(current\) => \{\s*const next = !current;/);
  assert.match(DECK, /onSwap=\{toggleSwap\}/);
});

test("the switch never starts a divider drag", () => {
  assert.match(DECK, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(DECK, /onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);/);
});

/* ── what a swap actually does ───────────────────────────────────────────── */

test("the swap is a flex REORDER, so no pane is ever remounted", () => {
  assert.match(DECK, /order: swapped \? 2 : 0/, "the lesson pane moves slot");
  assert.match(DECK, /order: swapped \? 0 : 2/, "…and the study pane takes the other");
  assert.match(DECK, /order: 1,/, "the divider always keeps the middle slot");
  assert.match(DECK, /data-split-swapped=\{swapped \? "true" : "false"\}/);
});

test("the divider's drag maths follows the swap", () => {
  assert.match(DECK, /const oriented = swappedRef\.current \? 100 - raw : raw;/);
});

test("the peek rail's glow stays on the divider-facing edge after a swap", () => {
  assert.match(DECK, /glowSide=\{swapped \? "study" : "lesson"\}/);
  assert.match(DECK, /glowSide=\{swapped \? "lesson" : "study"\}/);
});

test("the arrangement is remembered per course (not per axis)", () => {
  assert.match(MOTION, /export const splitSwappedKey = \(courseId: string\) =>/);
  assert.match(MOTION, /export const loadSplitSwapped/);
  assert.match(MOTION, /export const saveSplitSwapped/);
  assert.match(DECK, /setSwapped\(loadSplitSwapped\(courseId\)\)/);
  assert.match(DECK, /saveSplitSwapped\(courseId, next\)/);
});
