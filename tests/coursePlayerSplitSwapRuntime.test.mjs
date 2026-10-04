// tests/coursePlayerSplitSwapRuntime.test.mjs
//
// Runtime proof for the owner's 2026-10-04 brief:
//
//   "Split mode mein jo center line divide karti hai, us line par click karne
//    par ek bahut chhota sa switch ka icon dikhe. Us par click karne par jo
//    cheez ek taraf chal rahi hai woh dusri taraf aa jaaye aur dusri taraf
//    wali pehle ki jagah — matlab swap ho jaaye. Dobara click karne par bhi
//    wahi same function ho: swap. Aur double tap wali functionality hata do."
//
// This file drives the REAL Split Deck in a real DOM:
//
//   1. at rest the divider is the bare yellow line — no switch;
//   2. a TAP on the line reveals the tiny switch, another tap hides it;
//   3. a DRAG of the line (the resize gesture) never reveals it;
//   4. pressing the switch swaps the panes — the study pane takes the lesson's
//      slot and the lesson takes the study pane's;
//   5. pressing it AGAIN swaps them back (the same one function);
//   6. a swap never remounts a pane — the lesson's DOM node (its viewer stack)
//      is the very same element before and after, so nothing reloads;
//   7. the arrangement is remembered: a fresh mount of the same course comes
//      back swapped.
//
// The removed double-tap gesture is pinned by
// tests/coursePlayerSplitSwapContract.test.mjs.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real Split Deck ────────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SplitDeck } from ${JSON.stringify(path.join(ROOT, "src/course/studyPanels.tsx"))};
import { BookOpen } from "lucide-react";

export function mountDeck(host, options = {}) {
  const axis = options.axis || "column";
  const root = createRoot(host);
  act(() => {
    root.render(
      <SplitDeck
        axis={axis}
        orientation={axis === "row" ? "landscape" : "portrait"}
        courseId={options.courseId || "course-1"}
        accent="#FFBE0B"
        studyIcon={BookOpen}
        lesson={<div data-fake-lesson="" />}
        study={<div data-fake-study="" />}
      />,
    );
  });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-split-swap-runtime");

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
  "KeyboardEvent",
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
define("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
window.ResizeObserver = globalThis.ResizeObserver;
// jsdom lays nothing out: give every box a real 1000×800 rect so the
// divider's pointer maths lands mid-deck instead of on an edge (which the
// deck would — correctly — read as "fill this side").
window.Element.prototype.getBoundingClientRect = () => ({
  x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}),
});
window.Element.prototype.setPointerCapture = () => undefined;
window.Element.prototype.releasePointerCapture = () => undefined;

const fixture = require(bundle);
const { act } = fixture;

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/** Long enough for the switch's 160ms enter / exit animation to finish. */
const settleHint = () => settle(320);

const deckEl = () => window.document.querySelector("[data-course-split-deck]");
const dividerEl = () => window.document.querySelector("[data-course-split-divider]");
const swapEl = () => window.document.querySelector("[data-course-split-swap]");
/** The switch's presence as a BOOLEAN — never assert on a jsdom node. */
const swapShown = () => Boolean(swapEl());
const lessonPane = () => window.document.querySelector("[data-course-lesson-pane]");
const studyPane = () => window.document.querySelector("[data-course-study-pane]");
const orderOf = (element) => String(element.style.order ?? "");

/** A press on the divider: down, (optional travel), up. */
const pressDivider = async ({ from = [500, 400], to = from } = {}) => {
  const divider = dividerEl();
  await act(async () => {
    divider.dispatchEvent(new window.PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, clientX: from[0], clientY: from[1], pointerId: 7, isPrimary: true, button: 0, buttons: 1,
    }));
  });
  if (to[0] !== from[0] || to[1] !== from[1]) {
    await act(async () => {
      divider.dispatchEvent(new window.PointerEvent("pointermove", {
        bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 7, isPrimary: true, buttons: 1,
      }));
    });
  }
  await act(async () => {
    divider.dispatchEvent(new window.PointerEvent("pointerup", {
      bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 7, isPrimary: true, button: 0, buttons: 0,
    }));
  });
  await settle(8);
};

const clickSwap = async () => {
  const button = swapEl();
  assert.equal(Boolean(button), true, "the switch is on screen");
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
  await settle(8);
};

const mountDeck = async (options = {}) => {
  const host = window.document.getElementById("deck");
  host.innerHTML = "";
  const mounted = fixture.mountDeck(host, options);
  await settle(4);
  return mounted;
};

/* --------------------------------------------------------------------------- */
/* 1. At rest: the bare line                                                   */
/* --------------------------------------------------------------------------- */

test("the divider carries no switch until the line is tapped", async () => {
  window.localStorage.clear();
  const mounted = await mountDeck();

  assert.ok(Boolean(dividerEl()), "the divider is there");
  assert.equal(swapShown(), false, "…and the switch is not");
  assert.equal(deckEl().getAttribute("data-split-swapped"), "false", "nothing is swapped yet");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 2. Tap the line → the tiny switch                                           */
/* --------------------------------------------------------------------------- */

test("a tap on the divider reveals the switch, a second tap hides it", async () => {
  window.localStorage.clear();
  const mounted = await mountDeck();

  await pressDivider();
  await settleHint();
  const button = swapEl();
  assert.equal(swapShown(), true, "the switch appeared on the line");
  assert.equal(button.tagName, "BUTTON", "it is a real button");
  assert.match(button.getAttribute("aria-label") || "", /swap/i);
  assert.equal(button.style.width, "22px", "and it is deliberately tiny");

  await pressDivider();
  await settleHint();
  assert.equal(swapShown(), false, "tapping the line again puts it away");

  mounted.unmount();
});

test("dragging the divider (a resize) never reveals the switch", async () => {
  window.localStorage.clear();
  const mounted = await mountDeck();

  await pressDivider({ from: [500, 400], to: [500, 300] });
  await settleHint();
  assert.equal(swapShown(), false, "a resize drag is not a tap");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 3. The switch swaps the two sides — and swaps them back                     */
/* --------------------------------------------------------------------------- */

test("pressing the switch swaps the panes, pressing it again swaps them back", async () => {
  window.localStorage.clear();
  const mounted = await mountDeck();

  // Default: lesson first (order 0), study second (order 2).
  assert.equal(orderOf(lessonPane()), "0");
  assert.equal(orderOf(studyPane()), "2");

  await pressDivider();
  await settleHint();
  await clickSwap();

  assert.equal(deckEl().getAttribute("data-split-swapped"), "true", "the deck reports the swap");
  assert.equal(orderOf(lessonPane()), "2", "the lesson moved to the far side");
  assert.equal(orderOf(studyPane()), "0", "…and the study pane took its place");

  // The switch stays on screen, so the very same press swaps straight back.
  await clickSwap();

  assert.equal(deckEl().getAttribute("data-split-swapped"), "false", "the second press swapped back");
  assert.equal(orderOf(lessonPane()), "0");
  assert.equal(orderOf(studyPane()), "2");

  mounted.unmount();
});

test("a swap never remounts a pane — the lesson keeps its own DOM node", async () => {
  window.localStorage.clear();
  const mounted = await mountDeck();

  const before = window.document.querySelector("[data-fake-lesson]");
  await pressDivider();
  await settleHint();
  await clickSwap();
  const after = window.document.querySelector("[data-fake-lesson]");

  assert.equal(Boolean(before && after), true, "the lesson content is on screen both times");
  assert.equal(before === after, true, "it is the SAME element — no viewer is torn down by a swap");

  mounted.unmount();
});

/* --------------------------------------------------------------------------- */
/* 4. The arrangement is remembered                                            */
/* --------------------------------------------------------------------------- */

test("the swapped arrangement comes back on the next visit to the course", async () => {
  window.localStorage.clear();
  const first = await mountDeck({ courseId: "course-swap" });
  await pressDivider();
  await settleHint();
  await clickSwap();
  assert.equal(deckEl().getAttribute("data-split-swapped"), "true");
  first.unmount();

  const second = await mountDeck({ courseId: "course-swap" });
  assert.equal(deckEl().getAttribute("data-split-swapped"), "true", "the same course opens swapped");
  assert.equal(orderOf(studyPane()), "0");
  second.unmount();

  // A different course is untouched by it.
  const other = await mountDeck({ courseId: "course-other" });
  assert.equal(deckEl().getAttribute("data-split-swapped"), "false", "another course keeps the default");
  other.unmount();
});

after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});
