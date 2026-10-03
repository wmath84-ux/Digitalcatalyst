// tests/courseBrainDeckRuntime.test.mjs
//
// Runtime proof for the owner's 2026-10-03 brief:
//
//   "MCQ card ke andar jo navigation buttons hain unko remove karo: Previous,
//    Next, Skip, extra action buttons … user jis option per click kare vahi
//    submit ho jaaye aur card out ho slide hokar next per jaaye … user kisi
//    bhi direction mein swipe kar sake (left, right, up, down, diagonal) …
//    Final question par existing submit / review / result flow properly
//    continue hona chahiye."
//
// tests/courseBrainPracticeContract.test.mjs pins the deck's source (the
// reference geometry, the palette, the no-button rule). This file drives the
// REAL panel in a real DOM instead, and asserts the things the owner actually
// asked for:
//
//   1. the card carries the question, its answers and the `n/N` counter — and
//      no Previous / Next / Skip button;
//   2. tapping an answer records it and the card flicks ITSELF away — the next
//      question is simply there, with no button pressed;
//   3. a flick in any direction skips the question; a weak drag costs nothing;
//   4. when the last card has flown, the practice continues into the existing
//      review → Submit Practice flow on its own;
//   5. the deck re-solves its own box when the Split Deck divider moves it.
//
// The fixture is the real CourseBrainPanel (and so the real deck), bundled with
// the repo's own esbuild and mounted into jsdom. jsdom has no layout engine and
// no click synthesis, so the surfaces' boxes, the ResizeObserver and the click
// that follows a pointer release are supplied here — the code under test (the
// deck's flow, the state, the DOM) is not.

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

export function mountBrain(host, sets) {
  const root = createRoot(host);
  act(() => {
    root.render(<CourseBrainPanel productId="p1" sets={sets} />);
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-brain-deck-runtime");

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

/** jsdom has no ResizeObserver; instances are kept so a test can fire one. */
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
}
define("ResizeObserver", StubResizeObserver);
window.ResizeObserver = StubResizeObserver;

const fixture = require(bundle);
const { act } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Let React flush, and give the deck's timers / animations real time to run. */
const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/** Give an element the box jsdom cannot: what the Split Deck would hand it. */
const resize = (element, width, height) => {
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
};

const pointer = (type, x, y) =>
  new window.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
/** The click a browser fires after the release (jsdom does not synthesise it). */
const click = (x, y) => new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 });

/** A full press-and-release on an element (a button, or an answer). */
const tap = async (element, x = 40, y = 40) => {
  await act(async () => {
    element.dispatchEvent(pointer("pointerdown", x, y));
    element.dispatchEvent(pointer("pointerup", x, y));
    element.dispatchEvent(click(x, y));
  });
  await settle();
};

/** Grab the top card and throw it — the owner's swipe. */
const flick = async (card, dx, dy) => {
  await act(async () => {
    card.dispatchEvent(pointer("pointerdown", 200, 200));
  });
  // Two moves, so the gesture has both a direction and a velocity.
  await act(async () => {
    card.dispatchEvent(pointer("pointermove", 200 + dx * 0.7, 200 + dy * 0.7));
  });
  await settle(16);
  await act(async () => {
    card.dispatchEvent(pointer("pointermove", 200 + dx, 200 + dy));
    card.dispatchEvent(pointer("pointerup", 200 + dx, 200 + dy));
  });
  await settle(60);
};

const panel = () => window.document.querySelector("[data-course-brain-panel]");
const screen = () => panel()?.getAttribute("data-brain-screen");
const deck = () => window.document.querySelector("[data-brain-deck]");
/** The question the deck is showing: the exiting card is still in the DOM. */
const queue = () => deck()?.getAttribute("data-brain-deck-top");
const cardOf = (index) => window.document.querySelector(`[data-brain-card="${index}"]`);
const counterOf = (index) => cardOf(index)?.querySelector("[data-brain-counter]")?.textContent;
const actionNamed = (pattern) =>
  [...window.document.querySelectorAll("button")].find((button) => pattern.test(button.textContent ?? ""));

const SETS = [
  {
    id: "set-1",
    moduleId: "m1",
    moduleTitle: "Module one",
    title: "Algebra warm-up",
    questions: [
      { id: "q1", prompt: "What is 2 + 2?", options: ["2", "3", "4"], correctIndex: 2, explanation: "Arithmetic.", difficulty: "easy", topic: "Arithmetic" },
      { id: "q2", prompt: "What is 3 × 3?", options: ["6", "9"], correctIndex: 1, explanation: "Nine.", difficulty: "medium", topic: "Arithmetic" },
      { id: "q3", prompt: "What is 10 ÷ 2?", options: ["4", "5", "6"], correctIndex: 1, explanation: "Five.", difficulty: "hard", topic: "Arithmetic" },
    ],
  },
];

/** Mount the panel and open the practice set — every test starts here. */
const mountAndStart = async () => {
  const host = window.document.getElementById("brain");
  host.innerHTML = "";
  const mounted = fixture.mountBrain(host, SETS);
  resize(panel(), 390, 640);
  const start = actionNamed(/Start practice/);
  assert.ok(start, "the library offers a Start practice action");
  await tap(start);
  assert.equal(screen(), "question", "the practice deck is open");
  return mounted;
};

/* --------------------------------------------------------------------------- */
/* 1. The card: question, answers, counter — and no navigation button         */
/* --------------------------------------------------------------------------- */

test("the top card carries the question, its answers and the n/N counter only", async () => {
  const mounted = await mountAndStart();

  const stage = deck();
  assert.ok(stage, "the practice deck is on screen");
  assert.equal(queue(), "0", "the first question is the one on top");
  assert.match(cardOf("0")?.textContent ?? "", /What is 2 \+ 2\?/, "the question is on the card");
  assert.equal(cardOf("0")?.querySelectorAll("[data-brain-option]").length, 3, "…with its three answers");
  assert.equal(counterOf("0"), "1/3", "and the round counter of the current question");
  // No navigation button anywhere on the practice screen: the answers are the
  // only controls, and the swipe is the skip.
  const deckText = stage.textContent ?? "";
  for (const banned of ["Previous", "Next", "Skip", "Review & Submit"]) {
    assert.ok(!deckText.includes(banned), `the deck must not offer "${banned}"`);
  }
  assert.equal(cardOf("0").querySelectorAll("button").length, 3, "the top card's only buttons are its answers");
  assert.ok(
    [...stage.querySelectorAll("button")].every((button) => button.hasAttribute("data-brain-option")),
    "every button in the deck is an answer — nothing navigates",
  );
  assert.ok(stage.textContent.includes("Tap an answer to submit"), "the hint says what to do");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. An answer tap records it and the card flicks itself away                */
/* --------------------------------------------------------------------------- */

test("tapping an answer submits it: the card leaves by itself, no button pressed", async () => {
  const mounted = await mountAndStart();

  const answer = cardOf("0")?.querySelector('[data-brain-option="2"]');
  assert.ok(answer, "the third answer of the first question");
  await tap(answer);

  // The choice lights up first (the card holds it for a beat before leaving).
  assert.equal(
    cardOf("0")?.querySelector('[data-brain-option="2"]')?.getAttribute("data-brain-option-chosen"),
    "true",
    "the tapped answer is the chosen one",
  );

  // …then the card slides out on its own and the next question rises into the
  // top slot: `2/3`, without a single button having been pressed.
  await settle(400);
  assert.equal(queue(), "1", "the second question is now the deck's top card");
  assert.equal(counterOf("1"), "2/3", "…and the counter follows it");
  assert.match(cardOf("1")?.textContent ?? "", /What is 3 × 3\?/);
  // The card that answered itself away has finished flying and is gone.
  await settle(600);
  assert.equal(cardOf("0"), null, "the answered card left the DOM");

  mounted.unmount();
});

test("answering through the deck lands in the existing review → submit flow", async () => {
  const mounted = await mountAndStart();

  for (const [index, option] of [["0", "2"], ["1", "1"], ["2", "1"]]) {
    const answer = cardOf(index)?.querySelector(`[data-brain-option="${option}"]`);
    assert.ok(answer, `question ${index} is answerable`);
    await tap(answer);
    await settle(400);
    assert.equal(queue(), index === "2" ? "" : String(Number(index) + 1), `question ${index} handed the deck on`);
  }

  // The last card's fly-off hands the practice to the submit flow by itself.
  await settle(1000);
  assert.equal(screen(), "review", "the review screen arrives on its own after the last card");
  const review = panel();
  assert.equal(review.querySelectorAll("[data-brain-review-tile]").length, 3, "every question has its tile");
  assert.match(review.textContent ?? "", /Submit Practice/, "…and the submit flow is right there");
  assert.match(review.textContent ?? "", /Tap any question to jump back/, "…with the way back into the deck");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. Any-direction swipe skips; a weak drag costs nothing                    */
/* --------------------------------------------------------------------------- */

test("a flick in any direction skips the question and shows the next card", async () => {
  for (const [dx, dy, label] of [
    [-180, 0, "left"],
    [180, 0, "right"],
    [0, -180, "up"],
    [0, 180, "down"],
    [140, 140, "diagonal"],
  ]) {
    const mounted = await mountAndStart();
    assert.equal(queue(), "0", `the first question is up before the ${label} swipe`);

    await flick(cardOf("0"), dx, dy);
    await settle(120);

    assert.equal(queue(), "1", `a ${label} swipe moves on to the next question`);
    assert.equal(counterOf("1"), "2/3", `…and the counter follows the ${label} swipe`);
    mounted.unmount();
  }
});

test("a weak drag is not a swipe: the card springs back and the question stays", async () => {
  const mounted = await mountAndStart();

  await act(async () => {
    const card = cardOf("0");
    card.dispatchEvent(pointer("pointerdown", 200, 200));
    card.dispatchEvent(pointer("pointermove", 220, 210));
    card.dispatchEvent(pointer("pointerup", 220, 210));
  });
  await settle(300);

  assert.equal(queue(), "0", "the question is still the learner's");
  assert.equal(counterOf("0"), "1/3");

  mounted.unmount();
});

test("a question swiped without an answer is skipped, not answered", async () => {
  const mounted = await mountAndStart();

  // Skip the first question, answer the second, skip the third: the review
  // grid must show the skipped ones as unanswered.
  await flick(cardOf("0"), -180, 0);
  await settle(200);
  const answer = cardOf("1")?.querySelector('[data-brain-option="1"]');
  await tap(answer);
  await settle(400);
  await flick(cardOf("2"), 0, 180);
  await settle(1200);

  assert.equal(screen(), "review", "the practice still reaches its review step");
  const tiles = [...panel().querySelectorAll("[data-brain-review-tile]")];
  assert.equal(tiles.length, 3);
  const answered = tiles.filter((tile) => tile.style.background.includes("20, 19, 18"));
  assert.equal(answered.length, 1, "only the answered question is marked answered");
  // …and the submit confirmation counts the two skips before it submits.
  await tap(actionNamed(/Submit Practice/));
  await settle(60);
  assert.match(panel().textContent ?? "", /2 unanswered questions/, "the two skipped questions are flagged before submitting");

  mounted.unmount();
});

test("Back from the review resumes at the first unanswered question", async () => {
  const mounted = await mountAndStart();

  // Skip the first question, answer the second, skip the third.
  await flick(cardOf("0"), -180, 0);
  await settle(200);
  await tap(cardOf("1")?.querySelector('[data-brain-option="1"]'));
  await settle(400);
  await flick(cardOf("2"), 0, 180);
  await settle(1200);
  assert.equal(screen(), "review");

  // Back into the deck: the first question that still has no answer is Q1, so
  // that is the card the learner is handed — not the top of the set.
  await tap(actionNamed(/^Back$/));
  await settle(200);
  assert.equal(screen(), "question");
  assert.equal(queue(), "0", "the deck resumes at the first unanswered question");
  assert.equal(counterOf("0"), "1/3");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 4. The deck follows the pane the Split Deck hands it                       */
/* --------------------------------------------------------------------------- */

test("the deck solves its own box, whatever the divider leaves", async () => {
  const mounted = await mountAndStart();

  const stage = window.document.querySelector("[data-brain-deck-stage]");
  assert.ok(stage);

  // A phone pane gives the reference card: 72% of the box, plus the deck's own
  // strip of reserved space (the stack's peek, then the hint line).
  resize(deck(), 390, 640);
  await act(async () => {
    for (const observer of observers) if (observer.targets.has(deck())) observer.callback([], observer);
  });
  await settle();
  assert.equal(stage.style.width, "281px", "72% of the pane");
  assert.equal(stage.style.height, "373px", "the reference silhouette + the stack's peek strip");

  // The divider dragged wide: the deck re-solves from the same signal, and the
  // card grows — but it stays a card.
  resize(deck(), 900, 700);
  await act(async () => {
    for (const observer of observers) if (observer.targets.has(deck())) observer.callback([], observer);
  });
  await settle();
  assert.equal(stage.style.width, "360px", "the card grows, but stays a card");
  // The reference silhouette is the floor and the ceiling is the pane's own
  // height, so the card is the silhouette here — with its content centred.
  assert.equal(stage.style.height, "452px");

  mounted.unmount();
});

after(() => {
  // jsdom's rAF loop (pretendToBeVisual) would otherwise keep the runner alive
  // after the last test — the repo's other runtime tests close the window too.
  dom.window.close();
  // React's scheduler drives itself through a Node `MessageChannel`, and Node
  // re-refs a port the moment React attaches `onmessage` to it, so the pair
  // outlives every root and pins the runner open after the last assertion.
  // Un-ref'ing them here changes nothing about the tests (messages are still
  // delivered while the runner is alive) and lets the process exit.
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});
