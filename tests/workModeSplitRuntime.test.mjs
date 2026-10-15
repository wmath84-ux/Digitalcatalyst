// tests/workModeSplitRuntime.test.mjs
//
// Drives the real WorkDeck + Course Player SplitDeck in jsdom. The key owner
// rules under test are: start full-page with the line parked at the top; a
// plain divider tap reveals only the swap affordance and does not fill the
// primary slot; a real drag fills the top with the previous page; navigation
// while split replaces only the lower/secondary page; and both ratios and the
// flex-order swap remain device-local.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import WorkDeck from ${JSON.stringify(path.join(ROOT, "src/work/WorkDeck.tsx"))};

export function mountWorkDeck(host, options = {}) {
  const root = createRoot(host);
  const render = (page) => (
    <WorkDeck
      page={page}
      axis={options.axis || "column"}
      renderPage={(id, slotKey) => <div data-work-fixture-page={id} data-work-fixture-slot={slotKey}>{id}</div>}
    />
  );
  act(() => root.render(render(options.page || "notes")));
  return {
    update: (page) => act(() => root.render(render(page))),
    unmount: () => act(() => root.unmount()),
  };
}
export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "work-mode-split-runtime");
function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(require.resolve("esbuild/bin/esbuild"), [
    entry, "--bundle", "--format=cjs", "--platform=node", "--jsx=automatic", "--target=node20",
    `--tsconfig=${path.join(ROOT, "tsconfig.json")}`, `--outfile=${out}`, "--log-level=error",
  ], { cwd: ROOT, stdio: "pipe" });
  return out;
}

const bundle = buildFixture();
const dom = new JSDOM("<!doctype html><html><body><div id='work'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/notes",
});
const { window } = dom;
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of ["HTMLElement", "HTMLButtonElement", "SVGElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "MutationObserver", "localStorage"]) {
  define(key, window[key]);
}
if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false });
define("matchMedia", window.matchMedia);
define("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
window.ResizeObserver = globalThis.ResizeObserver;
window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) });
window.Element.prototype.setPointerCapture = () => undefined;
window.Element.prototype.releasePointerCapture = () => undefined;

const fixture = require(bundle);
const { act } = fixture;
const settle = async (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
const deck = () => window.document.querySelector("[data-course-split-deck]");
const divider = () => window.document.querySelector("[data-course-split-divider]");
const swapButton = () => window.document.querySelector("[data-course-split-swap]");
const primary = () => window.document.querySelector("[data-work-primary-page]");
const secondary = () => window.document.querySelector("[data-work-secondary-page]");
const lessonPane = () => window.document.querySelector("[data-course-lesson-pane]");
const studyPane = () => window.document.querySelector("[data-course-study-pane]");

const pressDivider = async ({ from = [500, 2], to = from } = {}) => {
  const node = divider();
  await act(async () => node.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: from[0], clientY: from[1], pointerId: 19, isPrimary: true, button: 0, buttons: 1 })));
  if (to[0] !== from[0] || to[1] !== from[1]) {
    await act(async () => node.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 19, isPrimary: true, buttons: 1 })));
  }
  await act(async () => node.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX: to[0], clientY: to[1], pointerId: 19, isPrimary: true, button: 0, buttons: 0 })));
  await settle(12);
};

let mounted;

test("Work opens with its last page full-screen below a parked divider", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.work.history.v1", JSON.stringify(["notes", "myday"]));
  const host = window.document.getElementById("work");
  mounted = fixture.mountWorkDeck(host, { page: "notes" });
  await settle(24);
  assert.equal(secondary()?.getAttribute("data-work-secondary-page"), "notes");
  assert.equal(primary(), null, "the primary pane stays empty until the learner actually splits");
  assert.equal(deck()?.getAttribute("data-split-axis"), "column");
  assert.equal(deck()?.getAttribute("data-split-collapsed"), "none");
  assert.equal(studyPane()?.style.flexGrow, "100");
  assert.equal(lessonPane()?.style.flexGrow, "0.0001");
  assert.equal(divider()?.getAttribute("data-grab-inset"), "26");
});

test("a divider tap reveals only the swap button; a real drag opens the previous page above it", async () => {
  await pressDivider();
  await settle(320);
  assert.ok(swapButton(), "the tiny swap control is revealed by a tap");
  assert.equal(primary(), null, "tap did not open a page in the primary slot");

  // The Uiverse swap button retains the course player's flex-order swap. The
  // previous page remains mounted in its own pane; no navigation happens.
  const button = swapButton();
  await act(async () => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
  await settle(8);
  assert.equal(deck()?.getAttribute("data-split-swapped"), "true");
  assert.ok(Number(studyPane()?.style.order) < Number(lessonPane()?.style.order));

  // Toggle back to the default top-divider orientation, then make a genuine
  // downward drag. The newest history row is the current page; the next row is
  // the one WorkDeck places above the divider.
  const back = swapButton();
  await act(async () => back.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
  await settle(8);
  assert.equal(deck()?.getAttribute("data-split-swapped"), "false");

  await pressDivider({ from: [500, 2], to: [500, 402] });
  await settle(320);
  assert.equal(primary()?.getAttribute("data-work-primary-page"), "myday");
  assert.equal(secondary()?.getAttribute("data-work-secondary-page"), "notes");
  assert.equal(deck()?.getAttribute("data-split-collapsed"), "none", "edge-to-edge Work splits do not grow peek rails");
  assert.equal(window.localStorage.getItem("dc.splitDeck.ratio.v1:work:column"), "50");
});

test("a third page replaces only the secondary page and preserves the primary pane", async () => {
  assert.equal(primary()?.getAttribute("data-work-primary-page"), "myday");
  mounted.update("revision");
  await settle(24);
  assert.equal(primary()?.getAttribute("data-work-primary-page"), "myday");
  assert.equal(secondary()?.getAttribute("data-work-secondary-page"), "revision");
  assert.ok(window.document.querySelector('[data-work-fixture-page="revision"][data-work-fixture-slot="secondary:revision"]'));
});

after(() => {
  try { mounted?.unmount(); } catch {}
  dom.window.close();
  // React's scheduler uses MessageChannel ports in Node. This fixture renders
  // several page swaps, so close the scheduler ports after the root is gone —
  // exactly like closing the visual DOM, never while a test is still running.
  for (const handle of process._getActiveHandles()) {
    if (handle?.constructor?.name === "MessagePort") handle.close?.();
  }
});
