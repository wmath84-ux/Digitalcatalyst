// tests/quadFlexModel.test.mjs
//
// RUNTIME proof of the DYNAMIC CROSS model (the owner's 2026-10-16+ upgrade):
//
//   "screen ke center mein point hoga jahan per left se aur right se ek-ek
//    divider usse connect honge aur ek upar se aur ek niche se — matlab total
//    4 divider, aur charon ka apna alag drag position hoga … center se
//    directly ham drag karenge to charon ek saath resize honge."
//
// Pure model — quadFlex.ts, the free-blocks half of quadLayout.ts and the
// step-back history — so `node --test` pins every rule without a browser:
//
//   · the four arms keep their OWN positions and each block hugs its outer
//     corner + its own two arms;
//   · the centre joint is exactly what the arms leave between them — the
//     tiling is complete at every setting, a point when all four agree;
//   · one arm's drag moves one value; the joint's drag moves all four;
//   · a block starts blank and holds at most one copy of a page (a pick
//     elsewhere MOVES it);
//   · the footer navigation shows only in the single-split layout (2 blocks);
//   · the back walk steps one page at a time and never passes its start.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

// The model is TypeScript; esbuild compiles it once for `node --test`, the
// same pattern every runtime suite in this repo uses.
const CACHE = path.join(ROOT, "node_modules", ".cache", "course-quad-flex-model");
fs.mkdirSync(CACHE, { recursive: true });
const entry = path.join(CACHE, "fixture.ts");
const out = path.join(CACHE, "fixture.cjs");
fs.writeFileSync(
  entry,
  `export * from ${JSON.stringify(path.join(ROOT, "src/course/quadFlex.ts"))};
export * from ${JSON.stringify(path.join(ROOT, "src/course/quadLayout.ts"))};
export * from ${JSON.stringify(path.join(ROOT, "src/course/pageHistory.ts"))};
`,
);
execFileSync(
  require.resolve("esbuild/bin/esbuild"),
  [entry, "--bundle", "--format=cjs", "--platform=node", "--jsx=automatic", "--target=node20",
    `--tsconfig=${path.join(ROOT, "tsconfig.json")}`, `--outfile=${out}`, "--log-level=error"],
  { cwd: ROOT, stdio: "pipe" },
);
const M = require(out);

const {
  QUAD_FLEX_DEFAULT,
  clampQuadFlex,
  mirrorQuadFlex,
  moveQuadFlexArm,
  moveQuadFlexJoint,
  quadFlexArms,
  quadFlexBlocks,
  quadFlexJoint,
  quadFlexSignature,
  setQuadFlexArm,
  QUAD_FLEX_X_MAX,
  QUAD_FLEX_X_MIN,
  QUAD_FLEX_Y_MAX,
  QUAD_FLEX_Y_MIN,
  quadClearBlockPage,
  quadFindPageBlock,
  quadOpenBlockCount,
  quadSetBlockPage,
  quadSetFocus,
  quadSingleSplit,
  quadSwapFlex,
  loadQuadLayout,
  saveQuadLayout,
  QUAD_DEFAULT_STATE,
  QUAD_PANE_ORDER,
  backPageHistory,
  canPageHistoryBack,
  clearPageHistory,
  pageHistoryOf,
  pushPageHistory,
  resetPageHistory,
} = M;

/* ── 1 · the four arms, their own positions ────────────────────────────── */

test("the model: four arm positions — xTop, xBottom, yLeft, yRight — each in its own band", () => {
  assert.deepEqual(QUAD_FLEX_DEFAULT, { xTop: 50, xBottom: 50, yLeft: 50, yRight: 50 });
  // The bands are the ones the old cross used: the blocks stay usable.
  assert.equal(QUAD_FLEX_X_MIN, 20);
  assert.equal(QUAD_FLEX_X_MAX, 80);
  assert.equal(QUAD_FLEX_Y_MIN, 15);
  assert.equal(QUAD_FLEX_Y_MAX, 85);
  const clamped = clampQuadFlex({ xTop: 5, xBottom: 99, yLeft: -3, yRight: 120 });
  assert.deepEqual(clamped, { xTop: 20, xBottom: 80, yLeft: 15, yRight: 85 });
  // Junk (or a deck stored before the cross) becomes the even plus.
  assert.deepEqual(clampQuadFlex(null), QUAD_FLEX_DEFAULT);
  assert.deepEqual(clampQuadFlex({ xTop: Number.NaN }), { ...QUAD_FLEX_DEFAULT });
});

test("the model: each block hugs its outer corner and ITS two arms", () => {
  const flex = { xTop: 40, xBottom: 60, yLeft: 30, yRight: 70 };
  const blocks = quadFlexBlocks(flex);
  assert.deepEqual(blocks.c11, { left: 0, top: 0, width: 40, height: 30 });
  assert.deepEqual(blocks.c12, { left: 40, top: 0, width: 60, height: 70 });
  assert.deepEqual(blocks.c21, { left: 0, top: 30, width: 60, height: 70 });
  assert.deepEqual(blocks.c22, { left: 60, top: 70, width: 40, height: 30 });
});

test("the model: the centre joint is exactly the zone the arms leave — complete at every setting", () => {
  // Diverged arms: the joint covers the overlap/hole so the four blocks plus
  // the joint tile the deck exactly once (a drag can never fall in a gap).
  const flex = { xTop: 40, xBottom: 60, yLeft: 30, yRight: 70 };
  assert.deepEqual(quadFlexJoint(flex), { left: 40, top: 30, width: 20, height: 40 });
  // All four agree: the joint is the owner's single centre POINT.
  assert.deepEqual(quadFlexJoint(QUAD_FLEX_DEFAULT), { left: 50, top: 50, width: 0, height: 0 });
  // Every arm runs from its outer edge in to the joint — "left se aur right
  // se ek-ek divider usse connect honge".
  const arms = quadFlexArms(flex);
  assert.deepEqual(arms.top, { value: 40, from: 0, to: 30 });
  assert.deepEqual(arms.bottom, { value: 60, from: 70, to: 100 });
  assert.deepEqual(arms.left, { value: 30, from: 0, to: 40 });
  assert.deepEqual(arms.right, { value: 70, from: 60, to: 100 });
});

/* ── 2 · one arm's drag, the joint's drag ──────────────────────────────── */

test("the model: dragging ONE arm moves ONE position — the other three stay put", () => {
  const flex = { xTop: 50, xBottom: 50, yLeft: 50, yRight: 50 };
  const top = moveQuadFlexArm(flex, "top", -10);
  assert.deepEqual(top, { xTop: 40, xBottom: 50, yLeft: 50, yRight: 50 });
  const right = moveQuadFlexArm(flex, "right", 12);
  assert.deepEqual(right, { xTop: 50, xBottom: 50, yLeft: 50, yRight: 62 });
  // Settled placement clamps to the band — a block can never be dragged away.
  assert.equal(setQuadFlexArm(flex, "bottom", 999).xBottom, QUAD_FLEX_X_MAX);
  assert.equal(setQuadFlexArm(flex, "left", -50).yLeft, QUAD_FLEX_Y_MIN);
});

test("the model: dragging the CENTRE JOINT moves all four together", () => {
  const flex = { xTop: 50, xBottom: 50, yLeft: 50, yRight: 50 };
  const next = moveQuadFlexJoint(flex, -10, 8);
  assert.deepEqual(next, { xTop: 40, xBottom: 40, yLeft: 58, yRight: 58 });
  // Clamped per arm: the joint keeps every block usable even at the edges.
  const edge = moveQuadFlexJoint(flex, -100, 100);
  assert.deepEqual(edge, {
    xTop: QUAD_FLEX_X_MIN,
    xBottom: QUAD_FLEX_X_MIN,
    yLeft: QUAD_FLEX_Y_MAX,
    yRight: QUAD_FLEX_Y_MAX,
  });
});

test("the model: the cluster's swap mirrors the arms on that axis", () => {
  const flex = { xTop: 40, xBottom: 60, yLeft: 30, yRight: 70 };
  const cols = mirrorQuadFlex(flex, "cols");
  assert.deepEqual(cols, { xTop: 60, xBottom: 40, yLeft: 30, yRight: 70 });
  const rows = mirrorQuadFlex(flex, "rows");
  assert.deepEqual(rows, { xTop: 40, xBottom: 60, yLeft: 70, yRight: 30 });
  assert.equal(quadFlexSignature(QUAD_FLEX_DEFAULT), "xTop:50 xBottom:50 yLeft:50 yRight:50");
});

/* ── 3 · free blocks: blank by default, one page one block ─────────────── */

test("the model: every block starts on its blank page, and a pick elsewhere MOVES the page", () => {
  let state = { ...QUAD_DEFAULT_STATE };
  assert.deepEqual(state.pages, { c11: null, c12: null, c21: null, c22: null });
  // Open Notes in c12.
  state = quadSetBlockPage(state, "c12", "notes");
  assert.equal(state.pages.c12, "notes");
  assert.equal(state.focus, "c12");
  // The same page picked in c22 MOVES — one page, one block, ever.
  state = quadSetBlockPage(state, "c22", "notes");
  assert.equal(state.pages.c12, null);
  assert.equal(state.pages.c22, "notes");
  assert.equal(quadFindPageBlock(state, "notes"), "c22");
  // The blank page comes back with the clear.
  state = quadClearBlockPage(state, "c22");
  assert.deepEqual(state.pages, { c11: null, c12: null, c21: null, c22: null });
  // Focus follows the learner's hands.
  assert.equal(quadSetFocus(state, "c11").focus, "c11");
});

test("the model: the cross's swap mirrors the arms AND trades the blocks' pages", () => {
  let state = {
    ...QUAD_DEFAULT_STATE,
    flex: { xTop: 40, xBottom: 60, yLeft: 50, yRight: 50 },
    pages: { c11: "lesson", c12: "notes", c21: "modules", c22: "mindmap" },
  };
  state = quadSwapFlex(state, "cols");
  assert.deepEqual(state.pages, { c11: "notes", c12: "lesson", c21: "mindmap", c22: "modules" });
  assert.equal(state.flex.xTop, 60);
  assert.equal(state.flex.xBottom, 40);
  // The grid shapes keep their own mirror flags — the cross never touches them.
  assert.equal(state.swappedCols, false);
});

/* ── 4 · the footer rule: single split mode = exactly two blocks ───────── */

test("the model: the footer navigation shows ONLY in single split mode — Keval do block", () => {
  assert.equal(quadSingleSplit(QUAD_DEFAULT_STATE), false, "the 2×2 cross is not two blocks");
  assert.equal(quadSingleSplit({ ...QUAD_DEFAULT_STATE, format: "pair" }), true);
  assert.equal(quadSingleSplit({ ...QUAD_DEFAULT_STATE, format: "triple" }), false);
  // Closing down to exactly two blocks is single split again; one block is not.
  assert.equal(
    quadSingleSplit({ ...QUAD_DEFAULT_STATE, closed: ["c11", "c12"] }),
    true,
  );
  assert.equal(quadSingleSplit({ ...QUAD_DEFAULT_STATE, closed: ["c11", "c12", "c21"] }), false);
  assert.equal(quadOpenBlockCount(QUAD_DEFAULT_STATE), 4);
  assert.equal(quadOpenBlockCount({ ...QUAD_DEFAULT_STATE, format: "pair" }), 2);
});

/* ── 5 · persistence: old decks migrate onto the cross ─────────────────── */

test("the model: a stored deck from before the cross migrates — even plus, blank pages", () => {
  globalThis.window = {
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.get(key) ?? null;
      },
      setItem(key, value) {
        this.store.set(key, value);
      },
      removeItem(key) {
        this.store.delete(key);
      },
    },
  };
  // The OLD shape of the store (no flex / pages / focus).
  window.localStorage.setItem(
    "dc.course.quadLayout.v1.c1",
    JSON.stringify({ format: "top2", closed: ["c22"], col: 61, col2: 67, row: 40, swappedCols: true, swappedRows: false }),
  );
  const migrated = loadQuadLayout("c1");
  assert.equal(migrated.format, "top2");
  assert.equal(migrated.col, 61);
  assert.equal(migrated.swappedCols, true);
  assert.deepEqual(migrated.flex, QUAD_FLEX_DEFAULT);
  assert.deepEqual(migrated.pages, { c11: null, c12: null, c21: null, c22: null });
  assert.equal(migrated.focus, "c11");
  // A cross-state round-trips, clamped and with its pages.
  const saved = {
    ...migrated,
    flex: { xTop: 33, xBottom: 62, yLeft: 41, yRight: 88 },
    pages: { c11: "lesson", c12: "notes", c21: null, c22: "music" },
    focus: "c22",
  };
  saveQuadLayout("c1", saved);
  const restored = loadQuadLayout("c1");
  assert.deepEqual(restored.flex, { xTop: 33, xBottom: 62, yLeft: 41, yRight: 85 });
  assert.deepEqual(restored.pages, { c11: "lesson", c12: "notes", c21: null, c22: "music" });
  assert.equal(restored.focus, "c22");
  // A junk page id becomes the blank page.
  window.localStorage.setItem(
    "dc.course.quadLayout.v1.c2",
    JSON.stringify({ pages: { c11: "nonsense", c12: 42, c21: "brain", c22: null }, focus: "zzz" }),
  );
  const junk = loadQuadLayout("c2");
  assert.deepEqual(junk.pages, { c11: null, c12: null, c21: "brain", c22: null });
  assert.equal(junk.focus, "c11");
  delete globalThis.window;
});

/* ── 6 · the step-back walk ────────────────────────────────────────────── */

test("the model: the back walk steps one page at a time and never passes its start", () => {
  resetPageHistory();
  // A block's walk: blank starter → pages the learner opened.
  pushPageHistory("block:c11", "blank");
  pushPageHistory("block:c11", "lesson");
  pushPageHistory("block:c11", "notes");
  assert.deepEqual(pageHistoryOf("block:c11"), ["blank", "lesson", "notes"]);
  assert.equal(canPageHistoryBack("block:c11"), true);
  // One step back per click — "step bye step previous pages per click karne
  // per back kare" — and the walk's own page comes back to the caller.
  assert.equal(backPageHistory("block:c11"), "lesson");
  assert.deepEqual(pageHistoryOf("block:c11"), ["blank", "lesson"]);
  assert.equal(backPageHistory("block:c11"), "blank");
  // At the walk's end the button goes quiet — it NEVER jumps home instead.
  assert.equal(canPageHistoryBack("block:c11"), false);
  assert.equal(backPageHistory("block:c11"), null);
  assert.deepEqual(pageHistoryOf("block:c11"), ["blank"]);
  // Re-opening the current page never stacks.
  pushPageHistory("block:c11", "blank");
  assert.deepEqual(pageHistoryOf("block:c11"), ["blank"]);
  // Every surface has its own walk; clearing one leaves the others.
  pushPageHistory("study", "modules");
  clearPageHistory("block:c11");
  assert.deepEqual(pageHistoryOf("study"), ["modules"]);
  resetPageHistory();
  assert.deepEqual(pageHistoryOf("study"), []);
  assert.equal(QUAD_PANE_ORDER.length, 4);
});
