// tests/coursePlayerSplitDividerContract.test.mjs
//
// Source contract for the shared split-divider fixes (Course Player, Work
// Mode and My Study Library all render the same SplitDeck — My Study
// Library through CoursePlayerApp itself):
//
//   · the nested ExtraPaneRegion root is a real flex container, so its
//     panes arrange along the split axis and their flexGrow shares are the
//     visible sizes;
//   · every divider owns its pointer capture: capture is taken on the
//     divider element that owns the move/up handlers (never on a parent
//     container, which would retarget the events away from the handlers),
//     the drag maps the pointer to the ADDED pane's share oriented by the
//     pair's swap state, release commits + persists, and cancel restores
//     the pre-drag share without committing;
//   · the divider toolbar is one floating glass pill of 36px buttons with
//     16px icons — no dark chips, no yellow glow (the 2px line is the only
//     yellow), centred on the line except at a deck edge, where it steps
//     fully inside so the deck's overflow cannot clip it;
//   · mode-specific configuration is preserved: the Course Player keeps
//     its per-course/per-axis ratio + extras persistence and peek rails,
//     Work keeps fullRange + parked edges (railAtEdge off).
//
// Runtime behaviour: tests/coursePlayerSplitDividerDragRuntime.test.mjs,
// tests/coursePlayerSplitExtraPanesRuntime.test.mjs,
// tests/workModeSplitRuntime.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const DECK = read("src/course/studyPanels.tsx");
const MOTION = read("src/course/splitMotion.ts");
const INDEX_CSS = read("src/index.css");
const PLAYER = read("src/CoursePlayerApp.tsx");
const WORK_DECK = read("src/work/WorkDeck.tsx");
const region = DECK.slice(DECK.indexOf("function ExtraPaneRegion"), DECK.indexOf("// ── The deck"));

test("the nested region root is an explicit flex container", () => {
  assert.match(region, /className=\{`relative flex \$\{className\}`\}/, "display:flex comes from the shared region itself");
  assert.match(DECK, /className=\{`h-full w-full \$\{row \? "flex-row" : "flex-col"\}`\}/, "the lesson region only chooses direction + sizing");
  assert.match(DECK, /className=\{`min-h-0 min-w-0 flex-1 \$\{row \? "flex-row" : "flex-col"\}`\}/, "the study region only chooses direction + sizing");
  assert.match(region, /data-region-pane="primary"[\s\S]*?flexGrow: Math\.max\(0\.0001, 100 - initial\)/, "the primary's share is 100 − percent");
  assert.match(region, /data-region-pane="extra"[\s\S]*?flexGrow: Math\.max\(0\.0001, initial\)/, "the added pane's share is the percent itself");
  assert.match(region, /overflow-hidden/, "pane content cannot force the pair outside its region");
  assert.match(DECK, /className=\{`relative flex min-h-0 min-w-0 flex-1 overflow-hidden \$\{axis === "row" \? "flex-row" : "flex-col"\}`\}/, "the deck root arranges along the axis too");
});

test("every divider owns its pointer capture; drag, release and cancel have one owner each", () => {
  assert.match(region, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/, "nested: capture is taken on the divider that owns the handlers");
  assert.doesNotMatch(region, /containerRef\.current\?\.setPointerCapture/, "nested: never on the region container (events would retarget away from the divider)");
  assert.match(region, /releasePointerCapture/, "nested: capture is released on up/cancel");
  assert.match(DECK, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/, "main: the deck's drag captures on its divider too");
  assert.match(region, /const raw = \(\(pointer - drag\.start\) \/ drag\.size\) \* 100;\s*percentMv\.set\(clampExtraPercent\(swapped \? raw : 100 - raw\)\);/, "the pointer maps to the added pane's share, oriented by the swap state");
  assert.match(region, /onPercent\(settled\)/, "release commits the settled share (the deck persists it)");
  assert.match(region, /const restored = clampExtraPercent\(percent\);\s*percentMv\.set\(restored\);/, "cancel restores the pre-drag share and commits nothing");
  assert.match(region, /onPointerCancel=\{handlePointerCancel\}/, "cancellation has its own handler");
  assert.match(region, /if \(!drag \|\| drag\.pointerId !== event\.pointerId \|\| drag\.size <= 0\) return;/, "stray pointers cannot move the pair");
});

test("the divider toolbar is one glass pill of 36px buttons with 16px icons", () => {
  assert.match(MOTION, /export const SWAP_BUTTON_PX = 36;/, "buttons are 36px targets");
  assert.match(MOTION, /export const SWAP_ICON_PX = 16;/, "icons are 16px");
  assert.match(DECK, /className="pointer-events-auto flex items-center justify-center gap-1 rounded-full p-1"/, "one horizontal pill in both axes");
  assert.match(DECK, /style=\{CLUSTER_GLASS\}/, "the pill wears the chrome glass");
  assert.match(DECK, /const CLUSTER_GLASS: CSSProperties = \{\s*\.\.\.CHROME_GLASS,/, "the same glass tokens as the peek rails");
  assert.doesNotMatch(DECK, /rgba\(10, 12, 18, 0\.88\)|0 0 12px /, "no dark chips and no glow shadow on the buttons");
  assert.match(DECK, /data-course-split-cluster=\{kind\}/, "the pill keeps its marker for both divider kinds");
  assert.match(INDEX_CSS, /\[data-course-split-cluster\] button:hover \{\s*background: color-mix\(in srgb, currentColor 12%, transparent\);/, "hover washes come from shared CSS, valid in every shell");
  assert.match(INDEX_CSS, /\[data-course-split-cluster\] button:focus-visible \{\s*outline: 2px solid currentColor;/, "keyboard focus stays visible on the toolbar");
});

test("the toolbar steps inside at a deck edge instead of clipping", () => {
  assert.match(DECK, /const firstShare = swapped \? ratio\.get\(\) : 100 - ratio\.get\(\);/, "edge proximity derives from the divider's own position");
  assert.match(DECK, /translate\(calc\(50% \+ 8px\), -50%\)/, "hugging the start edge: the pill sits just inside");
  assert.match(DECK, /translate\(calc\(-150% - 8px\), -50%\)/, "hugging the far edge: the pill sits just inside");
  assert.match(DECK, /style=\{\{ transform: clusterShift \}\}/, "the shift is applied to the cluster, not the divider line");
  assert.match(DECK, /<motion\.span\s+key=\{axis\}[\s\S]*?data-course-split-line=""/, "the 2px core line is otherwise untouched");
  assert.match(MOTION, /export const DIVIDER_LINE = "#FFBE0B";/, "the line keeps its one fixed colour");
});

test("mode-specific configuration and persistence are preserved at the call sites", () => {
  assert.match(PLAYER, /renderExtraPane=\{renderExtraPane\}/, "Course Player (and My Study Library through it) offers extra panes");
  assert.match(PLAYER, /extraPaneTab=\{extraPaneTab\}/, "…with its own free-tab rule");
  assert.match(MOTION, /`dc\.splitDeck\.ratio\.v1:\$\{courseId\}:\$\{axis\}`/, "ratio persists per course + axis");
  assert.match(MOTION, /`dc\.splitDeck\.extras\.v1:\$\{courseId\}:\$\{axis\}`/, "extras persist per course + axis");
  assert.match(WORK_DECK, /restRatio=\{100\}/, "Work keeps its top-parked rest ratio");
  assert.match(WORK_DECK, /fullRange/, "Work keeps the full 0–100% band");
  assert.match(WORK_DECK, /railAtEdge=\{false\}/, "Work keeps edge-to-edge parking — no 28px peek rail");
  assert.match(WORK_DECK, /courseId="work"/, "Work's saved layout lives under its own id");
  assert.match(DECK, /const wide = renderExtraPane \? deckWidth >= SPLIT_WIDE_MIN_PX : false;/, "the split controls still belong to wide stages only");
});
