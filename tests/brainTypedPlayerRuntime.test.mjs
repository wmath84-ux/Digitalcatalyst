// tests/brainTypedPlayerRuntime.test.mjs
//
// Runtime proof for the typed Brain questions (owner brief: har question
// type ko uski apni answering screen, MCQ wali sliding deck sab par nahi):
//
//   1. a MIXED set (MCQ + fill-in-the-blank + one-word + match) opens the
//      typed player, NOT the swipe deck — each question answered in its own
//      way: tap, type, tap-to-pair;
//   2. typing into a blank is just typing: the value lands, nothing swipes
//      or skips underneath it;
//   3. Check gives feedback (Correct! / Not quite + the right answer +
//      explanation), Skip records nothing, and the Finish hands over to the
//      SAME review → Submit → result pipeline the deck uses — score,
//      correct/wrong split and the pass→completion callback included;
//   4. a review tile jumps back into the typed player AT that question;
//   5. a pure-MCQ set still opens the sliding deck, untouched;
//   6. an image question whose image never arrived shows the honest
//      missing-image state and cannot be checked.
//
// The fixture is the real CourseBrainPanel (so the real typed player),
// bundled with the repo's own esbuild and mounted into jsdom. jsdom has no
// layout engine, so element boxes and the ResizeObserver are supplied here —
// the code under test (flow, state, DOM) is not.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real Brain panel ───────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import CourseBrainPanel from ${JSON.stringify(path.join(ROOT, "src/course/CourseBrainPanel.tsx"))};

export function mountBrain(host, sets, props = {}) {
  const root = createRoot(host);
  act(() => {
    root.render(<CourseBrainPanel productId="p1" sets={sets} {...props} />);
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "brain-typed-player-runtime");

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

const dom = new JSDOM(`<!doctype html><html><body><div id="brain"></div></body></html>`, {
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
  "HTMLButtonElement",
  "HTMLInputElement",
  "SVGElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
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

class StubResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
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
}
define("ResizeObserver", StubResizeObserver);
window.ResizeObserver = StubResizeObserver;

const fixture = require(bundle);
const { act } = fixture;

after(() => {
  window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const resize = (element, width, height) => {
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
};

const clickEvent = (x = 40, y = 40) =>
  new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 });

const tap = async (element) => {
  assert.ok(element, "tappable element exists");
  await act(async () => {
    element.dispatchEvent(clickEvent());
  });
  await settle();
};

/** Type into a controlled React input the way a keyboard would land it. */
const typeInto = async (input, value) => {
  assert.ok(input, "input exists");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await settle();
};

const panel = () => window.document.querySelector("[data-course-brain-panel]");
const screen = () => panel()?.getAttribute("data-brain-screen");
const player = () => window.document.querySelector("[data-brain-typed-player]");
const playerType = () => player()?.getAttribute("data-brain-typed-type");
const progress = () => window.document.querySelector("[data-brain-typed-progress]")?.textContent ?? "";
const buttonNamed = (pattern) =>
  [...window.document.querySelectorAll("button")].find((button) => pattern.test(button.textContent ?? ""));

const MIXED_SETS = [
  {
    id: "mix-1",
    moduleId: "m1",
    moduleTitle: "Module one",
    title: "Mixed practice",
    questions: [
      { id: "mq1", questionType: "mcq", prompt: "What is 2 + 2?", options: ["3", "4"], correctIndex: 1, explanation: "Two plus two is four.", difficulty: "easy", topic: "Maths" },
      { id: "fb1", questionType: "fill_blank", prompt: "The chemical symbol for water is ___ .", blankAnswers: [["H2O"]], explanation: "Two hydrogen atoms, one oxygen.", difficulty: "easy", topic: "Chemistry" },
      { id: "ow1", questionType: "one_word", prompt: "What is the SI unit of force?", acceptedAnswers: ["newton", "N"], explanation: "Force is measured in newtons.", difficulty: "easy", topic: "Physics" },
      {
        id: "mt1", questionType: "match", prompt: "Match the capitals",
        matchPairs: [
          { left: "India", right: "New Delhi" },
          { left: "Japan", right: "Tokyo" },
        ],
        explanation: "Capital cities.", difficulty: "easy", topic: "GK",
      },
    ],
  },
];

const MCQ_SETS = [
  {
    id: "mcq-1",
    moduleId: "m1",
    moduleTitle: "Module one",
    title: "Pure MCQ",
    questions: [
      { id: "p1", prompt: "What is 5 + 5?", options: ["9", "10"], correctIndex: 1, explanation: "Ten.", difficulty: "easy", topic: "Maths" },
      { id: "p2", prompt: "What is 6 × 6?", options: ["36", "42"], correctIndex: 0, explanation: "Thirty-six.", difficulty: "easy", topic: "Maths" },
    ],
  },
];

const BROKEN_IMAGE_SETS = [
  {
    id: "img-1",
    moduleId: "m1",
    moduleTitle: "Module one",
    title: "Missing image",
    questions: [
      {
        id: "hs1", questionType: "hotspot", prompt: "Tap the heart", imageUrl: "",
        hotspots: [{ id: "h", x: 50, y: 40, r: 10 }], correctHotspotIds: ["h"],
        explanation: "Centre-left.", difficulty: "easy", topic: "Body",
      },
    ],
  },
];

const mountAndOpen = async (sets, props = {}) => {
  const host = window.document.getElementById("brain");
  host.innerHTML = "";
  const mounted = fixture.mountBrain(host, sets, props);
  resize(panel(), 390, 640);
  const start = window.document.querySelector("[data-brain-set]");
  assert.ok(start, "the library row starts practice");
  await tap(start);
  return mounted;
};

/* --------------------------------------------------------------------------- */
/* 1. The mixed set plays typed, end to end                                    */
/* --------------------------------------------------------------------------- */

test("a mixed set plays in the typed player — tap, type, pair — into review, result and pass", async () => {
  const passed = [];
  const mounted = await mountAndOpen(MIXED_SETS, { onPass: (id, score) => passed.push([id, score]) });

  // The typed player, not the deck.
  assert.equal(screen(), "question");
  assert.ok(player(), "the typed player is on screen");
  assert.equal(window.document.querySelector("[data-brain-deck]"), null, "no swipe deck for a typed set");
  assert.equal(playerType(), "mcq");
  assert.match(progress(), /Question 1 of 4/);

  // Q1 — an MCQ inside a mixed set: tap a choice, then Check.
  await tap(window.document.querySelector('[data-brain-typed-choice="1"]'));
  await tap(window.document.querySelector("[data-brain-typed-check]"));
  let feedback = window.document.querySelector("[data-brain-typed-feedback]");
  assert.equal(feedback?.getAttribute("data-brain-typed-feedback"), "correct");
  await tap(window.document.querySelector("[data-brain-typed-next]"));

  // Q2 — fill in the blank: typing is typing (nothing swipes away).
  assert.equal(playerType(), "fill_blank");
  const blank = window.document.querySelector('[data-brain-typed-blank="0"]');
  await typeInto(blank, " h2o ");
  assert.equal(blank.value, " h2o ", "the typed text stays in the blank");
  assert.equal(playerType(), "fill_blank", "typing never advances or skips the question");
  await tap(window.document.querySelector("[data-brain-typed-check]"));
  feedback = window.document.querySelector("[data-brain-typed-feedback]");
  assert.equal(feedback?.getAttribute("data-brain-typed-feedback"), "correct", "case/space-insensitive check");
  await tap(window.document.querySelector("[data-brain-typed-next]"));

  // Q3 — one word, answered wrong: feedback names the right answer.
  assert.equal(playerType(), "one_word");
  await typeInto(window.document.querySelector("[data-brain-typed-input]"), "joule");
  await tap(window.document.querySelector("[data-brain-typed-check]"));
  feedback = window.document.querySelector("[data-brain-typed-feedback]");
  assert.equal(feedback?.getAttribute("data-brain-typed-feedback"), "wrong");
  assert.match(feedback?.textContent ?? "", /Correct answer: newton/);
  assert.match(feedback?.textContent ?? "", /Force is measured in newtons\./, "the explanation is shown");
  await tap(window.document.querySelector("[data-brain-typed-next]"));

  // Q4 — match the following by tap-to-pair.
  assert.equal(playerType(), "match");
  await tap(window.document.querySelector('[data-brain-match-left="India"]'));
  await tap(window.document.querySelector('[data-brain-match-right="New Delhi"]'));
  await tap(window.document.querySelector('[data-brain-match-left="Japan"]'));
  await tap(window.document.querySelector('[data-brain-match-right="Tokyo"]'));
  await tap(window.document.querySelector("[data-brain-typed-check]"));
  feedback = window.document.querySelector("[data-brain-typed-feedback]");
  assert.equal(feedback?.getAttribute("data-brain-typed-feedback"), "correct");

  // Finish → the existing review screen.
  await tap(window.document.querySelector("[data-brain-typed-next]"));
  assert.equal(screen(), "review");
  assert.equal(panel().querySelectorAll("[data-brain-review-tile]").length, 4);

  // Submit → confirm → result, with the panel's own counting.
  await tap(buttonNamed(/^Submit Practice$/));
  const dialog = window.document.querySelector("[data-brain-submit-dialog]");
  assert.ok(dialog, "the submit confirmation opens");
  await tap([...dialog.querySelectorAll("button")].find((button) => button.textContent.trim() === "Submit"));
  assert.equal(screen(), "result");
  assert.match(window.document.querySelector("[data-brain-score-card]")?.textContent ?? "", /75%/);
  const grid = window.document.querySelector("[data-brain-result-grid]")?.textContent ?? "";
  assert.match(grid, /3\s*Correct/);
  assert.match(grid, /1\s*Wrong/);
  assert.match(grid, /0\s*Skipped/);
  assert.deepEqual(passed, [["mix-1", 75]], "75% passes: the completion callback fired once with the set and score");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. Skip records nothing; a review tile reopens the typed player there       */
/* --------------------------------------------------------------------------- */

test("Skip leaves questions unanswered, and a review tile jumps back into the typed player", async () => {
  const mounted = await mountAndOpen(MIXED_SETS);

  // Skip all four without answering.
  for (let step = 0; step < 4; step += 1) {
    await tap(buttonNamed(/^Skip$/));
  }
  assert.equal(screen(), "review", "skipping the last question lands on review");
  const tile = (n) => panel().querySelector(`[data-brain-review-tile="${n}"]`);
  for (const n of [1, 2, 3, 4]) {
    assert.equal(tile(n)?.getAttribute("data-brain-answered"), "false", `tile ${n} stayed unanswered`);
  }

  // Tile 2 reopens the typed player AT the fill-in-the-blank question.
  await tap(tile(2));
  assert.equal(screen(), "question");
  assert.equal(playerType(), "fill_blank");
  assert.match(progress(), /Question 2 of 4/);
  await typeInto(window.document.querySelector('[data-brain-typed-blank="0"]'), "H2O");
  await tap(window.document.querySelector("[data-brain-typed-check]"));
  await tap(window.document.querySelector("[data-brain-typed-next]"));
  await tap(buttonNamed(/^Skip$/));
  await tap(buttonNamed(/^Skip$/));
  assert.equal(screen(), "review");
  assert.equal(tile(2)?.getAttribute("data-brain-answered"), "true", "tile 2 is answered now");
  assert.equal(tile(1)?.getAttribute("data-brain-answered"), "false");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. Pure MCQ keeps the deck                                                  */
/* --------------------------------------------------------------------------- */

test("a pure-MCQ set still opens the sliding deck, not the typed player", async () => {
  const mounted = await mountAndOpen(MCQ_SETS);
  assert.equal(screen(), "question");
  assert.ok(window.document.querySelector("[data-brain-deck]"), "the deck owns a pure-MCQ set");
  assert.equal(player(), null, "the typed player stays out of it");
  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 4. A missing image is honest, never playable                                */
/* --------------------------------------------------------------------------- */

test("an image question without its image shows the missing state and cannot be checked", async () => {
  const mounted = await mountAndOpen(BROKEN_IMAGE_SETS);
  assert.equal(playerType(), "hotspot");
  assert.ok(window.document.querySelector("[data-brain-typed-missing-image]"), "the missing-image state is explicit");
  const check = window.document.querySelector("[data-brain-typed-check]");
  assert.equal(check.disabled, true, "Check stays off: there is nothing valid to submit");
  mounted.unmount();
});
