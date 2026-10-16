// tests/personalLibraryCoursePlayerParity.test.mjs
//
// The owner's second ask in the same message (2026-10-16):
//
//   "Dekho personal library ke course player mein bhi sab acche se kaam kar raha
//    hai ki nahin."
//
// The Personal Library's course player IS the same `CoursePlayerApp`, opened
// with `mine={{ courseId }}` (`src/personal-library/MyCoursePlayerPage.tsx`, the
// `#/my-course/<id>` route), so everything the owner asked for in this wave has
// to work there too:
//
//   · the plus deck and the placeable navigation are DEVICE questions, never
//     entitlement questions — a learner-authored course gets them at 768px up;
//   · the Course view page (zoom + divider switches) is the same page;
//   · nothing the learner writes in their own course can touch an official
//     course's data — notes, mind maps, the sketch scene, progress and the
//     deck's own shape are all keyed on `mine-<courseId>`;
//   · the only tab a learner-authored course hides is Paid.
//
// This file checks the plumbing that makes that true, and round-trips the deck's
// own storage under the learner's namespace for real.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import ts from "typescript";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const HOST = read("src/personal-library/MyCoursePlayerPage.tsx");
const APP = read("src/CoursePlayerApp.tsx");
const OVERLAY = read("src/course/CourseOverlay.tsx");
const PANEL = read("src/course/PlayerPanel.tsx");

test("the Personal Library opens the SAME player, flagged as the learner's own", () => {
  // The host still LAZY-loads the one true player — through the app's own
  // chunk-recovery lazy() wrapper, which retries a failed fetch and survives
  // a redeploy swapping the hashed chunk under an open tab.
  assert.match(HOST, /const CoursePlayer = lazyWithChunkRecovery\(\(\) => import\("\.\.\/CoursePlayerApp"\)\);/);
  assert.match(HOST, /<CoursePlayer\n\s+key=\{course\.id\}\n\s+product=\{product\}\n\s+onBack=\{onBack\}/);
  assert.match(HOST, /mine=\{\{ courseId: course\.id \}\}/);
  // One player instance per course: opening another course starts it clean.
  assert.match(HOST, /key=\{course\.id\}/);
});

test("the plus deck, the navigation and the Course view page are not entitlement-gated", () => {
  // The device gate is the only gate.
  assert.match(APP, /const quadWide = useQuadDeckEnabled\(\);/);
  // The block that actually hands the deck its four blocks, its state, its
  // navigation and its reveal signal: not one of those asks who owns the
  // course.
  const quadConfig = APP.slice(APP.indexOf("const quadOverlay"), APP.indexOf("const quadOverlay") + 420);
  assert.match(quadConfig, /playerPane: viewerStack/);
  assert.doesNotMatch(quadConfig, /isMine/, "the deck never asks who owns the course");
  // The Course view page renders for every player, whatever `mine` says.
  assert.match(PANEL, /<CourseViewPanel quadWide=\{quadWide\} \/>/);
  assert.doesNotMatch(PANEL, /isMine[\s\S]{0,200}<CourseViewPanel|<CourseViewPanel[\s\S]{0,200}isMine/);
  // And the overlay hands the deck its four blocks for the mine player too —
  // the branch has no ownership condition.
  const overlayQuad = OVERLAY.slice(OVERLAY.indexOf("if (props.quad) {"));
  assert.match(overlayQuad, /<QuadDeck/);
  assert.doesNotMatch(overlayQuad.slice(0, 900), /isMine|mine\b/);
});

test("everything a learner writes in their own course is namespaced, deck shape included", () => {
  assert.match(APP, /const storageProductId = isMine && mine \? `mine-\$\{mine\.courseId\}` : String\(product\.id\);/);
  // The three local stores the quad deck's blocks show.
  assert.match(APP, /useCourseNotes\(\{ uid: user\?\.id \?\? null, productId: storageProductId \}\)/);
  assert.match(APP, /useCourseMindMap\(\{\s*uid: user\?\.id,\s*productId: storageProductId,/);
  assert.match(APP, /useCourseSketch\(\{\s*uid: user\?\.id,\s*productId: storageProductId,/);
  // …and so is the SHAPE of the deck itself (dividers, closed blocks, format).
  assert.match(APP, /useState<QuadLayoutState>\(\(\) => loadQuadLayout\(storageProductId\)\)/);
  assert.match(APP, /saveQuadLayout\(storageProductId, next\)/);
});

test("a learner-authored course hides Paid and nothing else", () => {
  assert.match(APP, /const MINE_HIDDEN_TABS: DockTab\[\] = \["paid"\];/);
  assert.match(APP, /const hiddenTabs = useMemo<DockTab\[\]>\(\(\) => \(isMine \? MINE_HIDDEN_TABS : \[\]\), \[isMine\]\);/);
});

test("the deck's shape round-trips under the learner's own namespace", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test" });
  globalThis.window = dom.window;
  globalThis.localStorage = dom.window.localStorage;
  // quadLayout pulls its free-block geometry from ./quadFlex since the
  // dynamic-cross work, so the shim transpiles RELATIVE imports from
  // src/course too instead of letting require() look beside this test file.
  const moduleCache = new Map();
  const loadCourseModule = (file) => {
    if (moduleCache.has(file)) return moduleCache.get(file).exports;
    const code = ts.transpileModule(read(`src/course/${file}.ts`), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = { exports: {} };
    moduleCache.set(file, mod);
    new Function("require", "module", "exports", code)(
      (id) => (id.startsWith("./") ? loadCourseModule(id.slice(2)) : require(id)),
      mod,
      mod.exports,
    );
    return mod.exports;
  };
  const { loadQuadLayout, saveQuadLayout, QUAD_DEFAULT_STATE } = loadCourseModule("quadLayout");

  const mineKey = "mine-abc";
  const officialKey = "official-9";
  assert.deepEqual(loadQuadLayout(mineKey), QUAD_DEFAULT_STATE, "a fresh own-course starts in the default + shape");

  // The free-blocks deck added `flex`, `pages` and `focus` to the stored
  // shape; a save that omits them gets the defaults back on load.
  const mine = {
    format: "pair",
    closed: ["c22"],
    col: 32,
    col2: 40,
    row: 71,
    swappedCols: true,
    swappedRows: false,
    flex: QUAD_DEFAULT_STATE.flex,
    pages: QUAD_DEFAULT_STATE.pages,
    focus: QUAD_DEFAULT_STATE.focus,
  };
  saveQuadLayout(mineKey, mine);
  assert.deepEqual(loadQuadLayout(mineKey), mine, "the own-course shape is remembered");

  // A shape saved BEFORE the three-column button existed (no `col2`) still
  // loads: the second vertical divider falls back to its default — and the
  // dynamic cross's own fields fall back the same way.
  localStorage.setItem(
    "dc.course.quadLayout.v1.old-shape",
    JSON.stringify({ format: "quad", closed: [], col: 44, row: 55, swappedCols: false, swappedRows: false }),
  );
  assert.deepEqual(loadQuadLayout("old-shape"), {
    format: "quad",
    closed: [],
    col: 44,
    col2: QUAD_DEFAULT_STATE.col2,
    row: 55,
    swappedCols: false,
    swappedRows: false,
    flex: QUAD_DEFAULT_STATE.flex,
    pages: QUAD_DEFAULT_STATE.pages,
    focus: QUAD_DEFAULT_STATE.focus,
  });

  // The official course is untouched — one learner's own layout never leaks.
  assert.equal(localStorage.getItem("dc.course.quadLayout.v1.mine-abc") !== null, true);
  assert.deepEqual(loadQuadLayout(officialKey), QUAD_DEFAULT_STATE);
  assert.equal(localStorage.getItem("dc.course.quadLayout.v1.official-9"), null);
});
