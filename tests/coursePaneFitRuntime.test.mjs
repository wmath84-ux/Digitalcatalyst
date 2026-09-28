// tests/coursePaneFitRuntime.test.mjs
//
// Runtime proof for the owner's 2026-09-28 brief, part two:
//
//   "Course player ke andar jo Brain page ka design hai, itna flexible banao
//    ki vah screen size / jaise area ke according question, option aur jo bhi
//    button hai sab kuchh properly visible ho jaaye … jaise split mode mein
//    ham donon hisson ko jitna man kahe utna khinchkar upar niche kar sakte
//    hain, to uske according yah Brain page utna hi flexible ho … aur isi
//    tarah module mein jo music player hai uska bhi design utna hi flexible
//    banao taki vah apne area mein jitna bhi ho uske according vah acche se
//    dikhe pura bina cut hue."
//
// tests/coursePanelFitContract.test.mjs pins the arithmetic and the shape;
// this file drives the REAL components in a real DOM and asserts the thing the
// owner actually asked for: when the box changes — which is exactly what the
// Split Deck divider does, once per frame — the Brain page and the music card
// re-solve themselves, instantly, with no re-mount and no re-render storm.
//
// The fixture is the real CourseBrainPanel and the real AudioPlayer, bundled
// with the repo's own esbuild and mounted into jsdom. jsdom has no layout
// engine, so each surface's box (`clientWidth` / `clientHeight`) and the
// ResizeObserver are stubbed — the code under test (the fit, the publishing,
// the DOM the CSS reads) is not.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the two real surfaces ──────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import CourseBrainPanel from ${JSON.stringify(path.join(ROOT, "src/course/CourseBrainPanel.tsx"))};
import AudioPlayer from ${JSON.stringify(path.join(ROOT, "src/course/AudioPlayer.tsx"))};

export function mountBrain(host, sets) {
  const root = createRoot(host);
  act(() => {
    root.render(<CourseBrainPanel productId="p1" sets={sets} />);
  });
  return { unmount: () => act(() => root.unmount()) };
}

export function mountAudio(host) {
  const root = createRoot(host);
  act(() => {
    root.render(<AudioPlayer url="https://cdn.example.com/lesson.mp3" name="Lesson one" />);
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-pane-fit-runtime");

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--jsx=automatic",
      "--target=node20",
      `--tsconfig=${path.join(ROOT, "tsconfig.json")}`,
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

const bundle = buildFixture();

/* ── the DOM ─────────────────────────────────────────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="brain"></div><div id="audio"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
  "MutationObserver",
  "localStorage",
]) {
  define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);

/* ResizeObserver — jsdom has none. Instances are kept so a test can fire one. */
const observers = [];
class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    observers.push(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  /** Re-run the callback for every element this observer watches. */
  fire() {
    this.callback([], this);
  }
}
define("ResizeObserver", StubResizeObserver);
window.ResizeObserver = StubResizeObserver;

const fixture = require(bundle);

/**
 * Fire the ResizeObserver that watches THIS element — the surfaces under test
 * are not the only ResizeObserver users (the glass lenses register their own),
 * so the observer is found by what it watches, never by creation order.
 */
const refit = (el) => {
  let fired = 0;
  for (const observer of observers) {
    if (!observer.targets.has(el)) continue;
    observer.fire();
    fired += 1;
  }
  return fired;
};

/** Give an element the box jsdom cannot: what the Split Deck would hand it. */
const resize = (el, width, height) => {
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: height, configurable: true });
};

const scaleOf = (el) => el.style.getPropertyValue("--brain-scale") || el.style.getPropertyValue("--audio-scale");

const SETS = [
  {
    id: "set-1",
    moduleId: "m1",
    moduleTitle: "Module one",
    title: "Algebra warm-up",
    questions: [
      {
        id: "q1",
        prompt: "What is 2 + 2?",
        options: ["2", "3", "4"],
        correctIndex: 2,
        explanation: "Arithmetic.",
        difficulty: "easy",
        topic: "Arithmetic",
      },
    ],
  },
];

/* --------------------------------------------------------------------------- */
/* 1. The Brain page follows the pane it is given                            */
/* --------------------------------------------------------------------------- */

test("the Brain page publishes its scale for its OWN box, and re-solves when the split moves", () => {
  const host = window.document.getElementById("brain");
  const mounted = fixture.mountBrain(host, SETS);

  const panel = () => window.document.querySelector("[data-course-brain-panel]");
  assert.ok(panel(), "the Brain page mounted");
  assert.equal(panel().getAttribute("data-brain-screen"), "library");
  // A pane with no measurement yet is the design's own size — never a guess.
  assert.equal(scaleOf(panel()), "1");

  // The Split Deck dragged so the study pane is 390 × 310 — a landscape
  // phone's pane, and the case where the revision page used to be cut.
  resize(panel(), 390, 310);
  assert.ok(refit(panel()) > 0, "the panel's own box is watched");
  assert.equal(scaleOf(panel()), "0.8", "a short pane shrinks the design to the floor");

  // …and dragged wide again (a desktop window, the pane opened up): the very
  // same mounted page grows, through the window-resize path this time.
  resize(panel(), 900, 800);
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(scaleOf(panel()), "1.127", "a wide pane grows the design, on the pane's own width");

  // A phone-sized pane is the design exactly (1×), whatever the screen is.
  resize(panel(), 390, 640);
  refit(panel());
  assert.equal(scaleOf(panel()), "1");

  mounted.unmount();
  assert.equal(window.document.querySelector("[data-course-brain-panel]"), null, "unmounts clean");
});

test("the Brain page is still the revision design, and its action bar is docked", () => {
  const host = window.document.getElementById("brain");
  const mounted = fixture.mountBrain(host, SETS);
  const panel = window.document.querySelector("[data-course-brain-panel]");

  // The scaled type scale is on the root, so every S() metric below inherits it.
  assert.match(panel.getAttribute("style") ?? "", /font-size: calc\(16px \* var\(--brain-scale, 1\)\)/);
  // The answer sets render as the revision library (dock-style cards with the
  // Start practice action) — the screen the learner scrolls.
  assert.ok(panel.querySelector("[data-brain-set='set-1']"), "the set card is there");
  assert.ok(panel.textContent.includes("Start practice"));

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. The music card fits whatever stage the lesson pane has                 */
/* --------------------------------------------------------------------------- */

test("the music card's frame mirrors the scaled card inside the stage it has", () => {
  const host = window.document.getElementById("audio");
  const mounted = fixture.mountAudio(host);

  const stage = () => window.document.querySelector("[data-course-viewer-audio]");
  const frame = () => window.document.querySelector("[data-course-audio-frame]");
  const scaler = () => window.document.querySelector("[data-course-audio-scaler]");
  const card = () => window.document.querySelector("[data-course-audio-player]");

  assert.ok(stage() && frame() && scaler() && card(), "stage → frame → scaler → card");
  assert.ok(frame().contains(scaler()), "the frame wraps the scaler");
  assert.ok(scaler().contains(card()), "the scaler wraps the whole card");
  // The frame's box is expressed in the scale var, so the scaled card IS the
  // box the stage centres and scrolls…
  assert.match(frame().getAttribute("style") ?? "", /calc\(320px \* var\(--audio-scale, 1\)\)/);
  assert.match(frame().getAttribute("style") ?? "", /calc\(var\(--audio-card-h, 490px\) \* var\(--audio-scale, 1\)\)/);
  // …and the scaler is the one transform. The card keeps its reference width.
  assert.match(scaler().getAttribute("style") ?? "", /scale\(var\(--audio-scale, 1\)\)/);
  assert.equal(card().className.includes("w-[320px]"), true);
  assert.equal(card().className.includes("max-w-full"), false, "the card cannot shrink out of its frame");

  // Unmeasured = the reference card.
  assert.equal(scaleOf(stage()), "1");
  assert.equal(stage().style.getPropertyValue("--audio-card-h"), "490px");

  // A portrait phone's lesson pane: the card comes down to 0.906 and is whole.
  resize(stage(), 366, 444);
  assert.ok(refit(stage()) > 0, "the stage's own box is watched");
  assert.equal(scaleOf(stage()), "0.906");
  assert.ok(320 * 0.906 <= 366 && 490 * 0.906 <= 444, "the card fits the stage it was given");

  // Landscape (a 310 px tall stage): smaller still, still whole, still above
  // the floor where the 52 px play button stops being a control.
  resize(stage(), 366, 310);
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(scaleOf(stage()), "0.632");
  assert.ok(490 * 0.632 <= 310, "nothing is cut in the short pane either");

  // A big desktop stage: the card may grow, but only a fifth.
  resize(stage(), 1400, 900);
  refit(stage());
  assert.equal(scaleOf(stage()), "1.2");

  mounted.unmount();
  assert.equal(window.document.querySelector("[data-course-viewer-audio]"), null, "unmounts clean");
});
