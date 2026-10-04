// tests/revisionSlideDeckRuntime.test.mjs
//
// Runtime proof for the owner's 2026-10-04 brief:
//
//   "Revision Dashboard ke sabse upar jo current stock/card design hai, use
//    completely remove karo. Uski jagah ye exact design implement karo:
//    https://aicanvas.me/components/slide-deck … Card ka design aur animation
//    reference ke according exactly implement karo … Revision Dashboard ke new
//    Slide Deck card mein existing count same rehna chahiye … Card par: Top:
//    Subject, Main: Test ka Count, Count ke neeche: Test Name, supporting
//    information: Chapter Name … card ka size itna hona chahiye ki woh dashboard
//    ke main visible area ko properly cover kare … lekin footer navigation ke
//    neeche na jaaye … Mobile, tablet aur desktop sabhi sizes par fit ho."
//
// tests/revisionSlideDeckContract.test.mjs pins the reference's source shape
// (the stack numbers, the exit / enter-from-right targets, the spring, the drag
// thresholds, the palette). This file drives the REAL deck in a real DOM and
// asserts what the owner actually gets:
//
//   1. EVERY saved test is a card (the existing count, unchanged) and only the
//      reference's three visible layers are on stage — the rest wait offscreen;
//   2. the card shows the mapping: subject on top, the test's count as the big
//      numeral, the test name under it, the chapter as support, and the
//      `XX / NN` counter in the corner;
//   3. a swipe advances the deck (and the swipe is NOT a tap: it never opens a
//      test), a dot jumps the deck, and a plain tap on the front card opens
//      that test;
//   4. the stage solves its height from the page's own scroller on a phone, a
//      tablet and a desktop, and the scaled card fits inside it — never under
//      the footer navigation, never clipped, never overflowing sideways.
//
// The fixture is the real deck (and so the real Framer Motion transitions),
// bundled with the repo's own esbuild and mounted into jsdom. jsdom has no
// layout engine, so the boxes the scroller would hand the deck are supplied
// here — the code under test (the measurement, the ring, the gestures) is not.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real deck, inside the real Revision scroller ───────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PlanSlideDeck } from ${JSON.stringify(path.join(ROOT, "src/revision/components/PlanSlideDeck.tsx"))};

export function mountDeck(host, slides, onOpen) {
  const root = createRoot(host);
  act(() => {
    root.render(
      <div data-revision-page-main>
        <div style={{ padding: "16px" }}>
          <PlanSlideDeck slides={slides} onOpen={onOpen} />
        </div>
      </div>
    );
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "revision-slide-deck-runtime");

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

const dom = new JSDOM(`<!doctype html><html><body><div id="deck"></div></body></html>`, {
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

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/** Give an element the box jsdom cannot: what the Revision scroller hands it. */
const box = (element, { width, height, top = 0 }) => {
  Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
  Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
  element.getBoundingClientRect = () => ({
    top,
    left: 0,
    right: width,
    bottom: top + height,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
};

/** Whatever moved (the page, the pane), let the deck measure again. */
const remeasure = async (target) => {
  await act(async () => {
    for (const observer of observers) if (observer.targets.has(target)) observer.callback([], observer);
  });
  await settle(60);
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
const click = (x, y) => new window.MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 });

const tap = async (element, x = 120, y = 160) => {
  await act(async () => {
    element.dispatchEvent(click(x, y));
  });
  await settle(30);
};

/** Grab the front card and throw it — the reference's swipe. */
const flick = async (card, dx) => {
  await act(async () => {
    card.dispatchEvent(pointer("pointerdown", 200, 200));
  });
  await act(async () => {
    card.dispatchEvent(pointer("pointermove", 200 + dx * 0.7, 200));
  });
  await settle(16);
  await act(async () => {
    card.dispatchEvent(pointer("pointermove", 200 + dx, 200));
    card.dispatchEvent(pointer("pointerup", 200 + dx, 200));
  });
  await settle(120);
};

const stage = () => window.document.querySelector("[data-plan-slide-deck]");
const scroller = () => window.document.querySelector("[data-revision-page-main]");
const cards = () => [...window.document.querySelectorAll("[data-plan-slide]")];
const front = () => cards().find((card) => card.getAttribute("data-slide-front") === "true");
const frontId = () => Number(front()?.getAttribute("data-plan-slide"));
const counter = () => front()?.querySelector("[data-slide-counter]")?.textContent?.trim();
const dots = () => [...window.document.querySelectorAll("[data-plan-slide-dot]")];
const text = (selector) => front()?.querySelector(selector)?.textContent?.trim();

const SLIDES = [
  { id: 11, subject: "Physics", countLabel: "10", countUnit: "Questions", title: "Physics Chapter Test", chapter: "Electrostatics", position: 1, total: 5, actionLabel: "Start Revision", meta: "10 min · Mixed" },
  { id: 12, subject: "Chemistry", countLabel: "8", countUnit: "Questions", title: "Chemical Bonding Drill", chapter: "Chemical Bonding", position: 2, total: 5, actionLabel: "Continue Revision" },
  { id: 13, subject: "Maths", countLabel: "12", countUnit: "Questions", title: "Integration Sprint", chapter: "Integrals", position: 3, total: 5, actionLabel: "Start Revision" },
  { id: 14, subject: "Biology", countLabel: "15", countUnit: "Questions", title: "Cell Biology Recall", chapter: "Cell Structure", position: 4, total: 5, actionLabel: "View Results" },
  { id: 15, subject: "History", countLabel: "6", countUnit: "Questions", title: "Modern India Quick Test", chapter: "Freedom Struggle", position: 5, total: 5, actionLabel: "Start Revision" },
];

/** Mount the deck in a phone-sized Revision page (the default for a test). */
const mountDeck = async (slides = SLIDES) => {
  const host = window.document.getElementById("deck");
  host.innerHTML = "";
  const opened = [];
  const mounted = fixture.mountDeck(host, slides, (slide) => opened.push(slide.id));
  const pane = scroller();
  const deckStage = stage();
  box(pane, { width: 390, height: 700, top: 0 });
  box(deckStage, { width: 390, height: 672, top: 16 });
  await remeasure(deckStage);
  return { mounted, opened };
};

/* --------------------------------------------------------------------------- */
/* 1. Every saved test is a card; the reference's three layers are on stage    */
/* --------------------------------------------------------------------------- */

test("every saved test is a card, and only the reference's three layers are on stage", async () => {
  const { mounted } = await mountDeck();
  const mountedCards = cards();
  assert.equal(mountedCards.length, 5, "the deck keeps the existing count — one card per saved test");
  assert.deepEqual(
    mountedCards.map((card) => card.getAttribute("data-slide-offset")),
    ["0", "1", "2", "3", "4"],
    "cards sit on the reference's ring: the first three layers, the rest offscreen",
  );
  assert.equal(mountedCards.filter((card) => card.getAttribute("data-slide-front") === "true").length, 1, "exactly one front card");
  // Only the front card is offered to the pointer / keyboard: the cards behind
  // it are the reference's background layers, not extra targets.
  assert.equal(front()?.getAttribute("tabindex"), "0");
  for (const behind of mountedCards.filter((card) => card !== front())) {
    assert.equal(behind.getAttribute("tabindex"), "-1", "a card behind the front one is not focusable");
  }
  mounted.unmount();
});

test("the card carries subject, count, test name and chapter — plus XX / NN", async () => {
  const { mounted } = await mountDeck();

  assert.equal(text("[data-slide-subject]"), "Physics", "the top label is the subject");
  assert.equal(text("[data-slide-counter]"), "01 / 05", "the corner counter keeps the existing count");
  assert.equal(text("[data-slide-count]"), "10", "the big numeral is the test's count");
  assert.equal(text("[data-slide-title]"), "Physics Chapter Test", "the test name sits under the count");
  assert.match(front()?.querySelector("[data-slide-chapter]")?.textContent ?? "", /Electrostatics/, "the chapter is the supporting line");
  assert.equal(text("[data-slide-action]")?.startsWith("Start Revision"), true, "the card names the action it opens");

  // …and it is the same card the second test is on, once the deck moves.
  const dotsNode = window.document.querySelector("[data-rev-plan-dots]");
  assert.ok(dotsNode, "the deck navigates by dots (the reference has no arrows)");
  assert.equal(dots().length, 5, "one dot per saved test");
  assert.equal(dots()[0].getAttribute("data-dot-active"), "true", "the front card's dot is the active one");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. The gestures: swipe advances, tap opens, dots jump                       */
/* --------------------------------------------------------------------------- */

test("a swipe sends the front card away and brings the next test up", async () => {
  const { mounted, opened } = await mountDeck();
  assert.equal(frontId(), 11);

  await flick(front(), -220);

  assert.equal(frontId(), 12, "the next saved test is now the front card");
  assert.equal(counter(), "02 / 05");
  assert.equal(text("[data-slide-title]"), "Chemical Bonding Drill");
  assert.deepEqual(opened, [], "a swipe is a gesture, never a tap: nothing opened");
  // The card that left is still mounted (the ring closes behind it) and the
  // ring's offsets all moved on by one.
  assert.deepEqual(
    cards().map((card) => card.getAttribute("data-slide-offset")),
    ["4", "0", "1", "2", "3"],
    "the ring rotated: the departed card took the last layer",
  );

  mounted.unmount();
});

test("a weak drag springs back and changes nothing", async () => {
  const { mounted, opened } = await mountDeck();
  assert.equal(frontId(), 11);

  await act(async () => {
    const card = front();
    card.dispatchEvent(pointer("pointerdown", 200, 200));
    card.dispatchEvent(pointer("pointermove", 212, 202));
    card.dispatchEvent(pointer("pointerup", 212, 202));
  });
  await settle(200);

  assert.equal(frontId(), 11, "a drag under the dismiss thresholds is not a swipe");
  assert.deepEqual(opened, [], "…and it is not a tap either");
  mounted.unmount();
});

test("a dot jumps the deck, and a plain tap on the front card opens that test", async () => {
  const { mounted, opened } = await mountDeck();

  await tap(dots()[3]);
  assert.equal(frontId(), 14, "the fourth saved test is on top");
  assert.equal(counter(), "04 / 05");
  assert.equal(text("[data-slide-action]")?.startsWith("View Results"), true, "a finished test offers its result");
  assert.deepEqual(opened, [], "jumping is not opening");

  await tap(front());
  assert.deepEqual(opened, [14], "a plain tap opens exactly the card that is on top");
  mounted.unmount();
});

test("a tap that was actually a drag never opens anything", async () => {
  const { mounted, opened } = await mountDeck();
  const card = front();
  assert.equal(frontId(), 11);

  // Pointer down, a long sideways move, pointer up — and the click the browser
  // still fires on the element under the finger. The deck must read that click
  // as the tail of a DRAG: the card leaves the way it was thrown, and nothing
  // opens (the same rule as the repo's own `useDragScroll`).
  await act(async () => {
    card.dispatchEvent(pointer("pointerdown", 120, 160));
  });
  await settle(16);
  await act(async () => {
    card.dispatchEvent(pointer("pointermove", 300, 160));
  });
  await settle(16);
  await act(async () => {
    card.dispatchEvent(pointer("pointerup", 300, 160));
    card.dispatchEvent(click(300, 160));
  });
  await settle(150);

  assert.deepEqual(opened, [], "the drag released over the card did not open it");
  // A RIGHTWARD drag is the reference's step BACK (the previous test slides in
  // from the right) — the fifth test here, wrapping the ring.
  assert.equal(frontId(), 15, "…it moved the deck instead");
  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. The stage fills the visible area — phone, tablet, desktop                */
/* --------------------------------------------------------------------------- */

test("the stage solves its height from the page's own scroller on every device", async () => {
  const { mounted } = await mountDeck();
  const pane = scroller();
  const deckStage = stage();

  const cases = [
    // The Revision page on a phone: the deck takes the visible area under the
    // page's own 16 px inset and keeps a sliver for the next card.
    { name: "phone", width: 390, height: 700, top: 16, expect: { stageHeight: 672, cardWidth: 362, cardHeight: 418 } },
    // A tablet: the card grows to the deck's ceiling rather than filling the
    // whole stage — it stays a card.
    { name: "tablet", width: 768, height: 900, top: 16, expect: { stageHeight: 872, cardWidth: 468, cardHeight: 540 } },
    // A desktop window: same ceiling, centred, still inside the stage.
    { name: "desktop", width: 1200, height: 800, top: 16, expect: { stageHeight: 772, cardWidth: 468, cardHeight: 540 } },
  ];

  for (const device of cases) {
    box(pane, { width: device.width, height: device.height, top: 0 });
    box(deckStage, { width: device.width, height: 10, top: device.top });
    await remeasure(deckStage);

    assert.equal(
      deckStage.style.height,
      `${device.expect.stageHeight}px`,
      `${device.name}: the stage is the space between the page top and the bottom of its scroller (minus the sliver)`,
    );
    assert.equal(front().style.width, `${device.expect.cardWidth}px`, `${device.name}: the card's width`);
    assert.equal(front().style.height, `${device.expect.cardHeight}px`, `${device.name}: the card's height`);

    // Fits: the scaled card + the stack's peek + the dots/hint strip never
    // reach the stage's bottom edge, so the footer navigation can never sit
    // under the deck.
    const cardWidth = Number.parseInt(front().style.width, 10);
    const cardHeight = Number.parseInt(front().style.height, 10);
    const stageHeight = Number.parseInt(deckStage.style.height, 10);
    assert.ok(cardWidth + 28 <= device.width, `${device.name}: the card cannot overflow sideways (${cardWidth} + 28 > ${device.width})`);
    assert.ok(cardHeight + 88 <= stageHeight, `${device.name}: the card + its chrome stay inside the stage (${cardHeight} + 88 > ${stageHeight})`);
    assert.ok(cardHeight >= 240, `${device.name}: the card never shrinks below the reference's readable floor`);
    assert.ok(cardWidth <= 468, `${device.name}: the card never grows past the reference's ceiling (260 × 1.8)`);
  }

  mounted.unmount();
});

test("a short viewport keeps the deck usable instead of collapsing it", async () => {
  const { mounted } = await mountDeck();
  // A phone in landscape, or a desktop window dragged very short: 360 px of
  // scroller, the page's own 16 px inset, and the sliver kept under the deck.
  box(scroller(), { width: 700, height: 360, top: 0 });
  box(stage(), { width: 700, height: 10, top: 16 });
  await remeasure(stage());

  assert.equal(stage().style.height, "332px", "the stage still takes what is there (360 − 16 − 12)");
  const cardHeight = Number.parseInt(front().style.height, 10);
  assert.ok(cardHeight >= 240, "the card keeps the reference's readable floor rather than shrinking to nothing");
  mounted.unmount();
});

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});
