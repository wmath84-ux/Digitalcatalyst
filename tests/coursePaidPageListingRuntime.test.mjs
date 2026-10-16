// tests/coursePaidPageListingRuntime.test.mjs
//
// THE PAID PAGE, RENDERED — the owner's two complaints proven fixed on the real
// tree, not on a description of it.
//
// Owner brief (2026-10-16):
//
//   "Paid page per jo bhi dikhaye ja rahe hain paid module vah baar-baar dikhaye
//    ja rahe hain, repeat ho rahe hain; ek hi baar dikhna chahiye. Aur lock
//    sabhi resources per nahin: agar folder hai to keval folder per ek baar, aur
//    alag-alag resources hai to sab per individual lock."
//
// This suite mounts `PaidLibraryPanel` — the exact component the Paid tab
// renders, through the Modules library's own BranchedMenu — in jsdom and counts
// what the learner actually sees:
//
//   · each paid thing appears ONCE (a module already inside a listed update is
//     not a second folder);
//   · ONE lock per folder, on the folder's own head, and NONE on the content
//     rows inside it;
//   · a separate resource is a row of its own, carrying its own individual lock;
//   · tapping a row asks the player for that exact product-page row key
//     (`update:` / `module:` / `resource:`), and nothing else.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real paid panel, mounted by React ──────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PaidLibraryPanel } from ${JSON.stringify(path.join(ROOT, "src/course/CourseOverlay.tsx"))};

const UPDATES = [
  { id: "upd-1", title: "July Update", price: 1299, coinPrice: 90, contentNames: ["Photosynthesis", "Respiration"] },
  { id: "upd-1", title: "July Update (again)", price: 1299, coinPrice: 90, contentNames: ["Photosynthesis"] },
];
const MODULES = [
  { id: "m-1", title: "Covered module", files: [], modules: [],
    accessLevel: "paidUpdate", paidUpdateId: "upd-1", paidUpdatePrice: "\\u20b91,299" },
  { id: "m-2", title: "Lonely module", files: [
      { id: "f-1", name: "Lonely video", type: "video" },
      { id: "f-2", name: "Lonely video", type: "video" },
    ], modules: [], accessLevel: "paidUpdate", paidUpdateId: "upd-2", paidUpdatePrice: "\\u20b9499" },
  { id: "m-3", title: "Free module", files: [
      { id: "f-3", name: "Locked extra", type: "pdf", accessLevel: "paidUpdate", paidUpdateId: "upd-3", paidUpdatePrice: "\\u20b9299" },
      { id: "f-4", name: "Free video", type: "video" },
    ], modules: [] },
];

export function mountPaid(host, options = {}) {
  const root = createRoot(host);
  const opened = [];
  const bought = { updates: [], modules: [] };
  const node = React.createElement(PaidLibraryPanel, {
    updates: UPDATES,
    modules: MODULES,
    ownedUpdateIds: new Set(),
    onBuyUpdate: (update) => { bought.updates.push(update.id); },
    onBuyModule: (module) => { bought.modules.push(module.id); },
    ...(options.withOpenPaid === false ? {} : { onOpenPaid: (key) => { opened.push(key); } }),
    empty: "No paid content for this course.",
  });
  act(() => { root.render(node); });
  return { opened, bought, unmount: () => act(() => root.unmount()) };
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-paid-page-listing-runtime");

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
      // The player's panels pull their own stylesheets (and their fonts) in;
      // jsdom has no use for either, so they come in as inert text.
      "--loader:.css=text",
      "--loader:.woff=empty",
      "--loader:.woff2=empty",
      "--loader:.ttf=empty",
      "--loader:.eot=empty",
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

const bundle = buildFixture();

/* ── the DOM ─────────────────────────────────────────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="paid"></div></body></html>`, {
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
  if (window[key]) define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);
define("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
window.ResizeObserver = globalThis.ResizeObserver;
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 800, width: 1000, height: 800, toJSON: () => ({}) };
};

const fixture = require(bundle);
const act = fixture.act;

const host = window.document.getElementById("paid");
const mount = (options) => fixture.mountPaid(host, options);
const rows = (selector) => Array.from(host.querySelectorAll(selector));
const text = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
const click = (node) => act(() => { node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });

let page = null;
after(() => {
  try { page?.unmount(); } catch { /* already gone */ }
});

/* ── 1 · nothing repeats ─────────────────────────────────────────────────── */

test("each paid thing is on the page once — the covered module is not a folder", () => {
  page = mount();
  const folders = rows("[data-course-paid-folder]");
  assert.deepEqual(folders.map((row) => row.getAttribute("data-paid-key")), [
    "update:upd-1",   // the July update, with its module inside it
    "module:m-2",     // a paid module no listed update holds
  ]);
  // The duplicate update row (same id handed over twice) is ONE folder.
  assert.equal(folders.filter((row) => row.getAttribute("data-paid-key") === "update:upd-1").length, 1);
  // The module July Update already covers never becomes its own folder.
  assert.ok(!rows("[data-paid-key=\"module:m-1\"]").length, "the covered module is content, not a row");
  // A separate locked resource is its own row.
  const resource = rows("[data-course-paid-row=\"resource\"]");
  assert.deepEqual(resource.map((row) => row.getAttribute("data-paid-key")), ["resource:f-3"]);
  assert.equal(text(resource[0]).includes("Locked extra"), true);
  // Every row on the page carries a product-page key, and none repeats.
  const keys = rows("[data-paid-key]").filter((row) => row.hasAttribute("data-course-paid-folder") || row.hasAttribute("data-course-paid-row"))
    .map((row) => row.getAttribute("data-paid-key"));
  assert.equal(new Set(keys).size, keys.length, `repeated rows: ${keys.join(", ")}`);
});

/* ── 2 · where the lock sits ─────────────────────────────────────────────── */

test("a folder carries ONE lock — on its head, and nothing inside it does", () => {
  page = mount();
  const folders = rows("[data-course-paid-folder]");
  const resources = rows("[data-course-paid-row=\"resource\"]");
  // Every folder head: exactly one lock mark, in its icon slot.
  assert.equal(folders.length, 2);
  for (const folder of folders) {
    assert.equal(folder.querySelectorAll(".course-library__lock").length, 1, `${text(folder)} must carry one lock`);
  }
  // The separate resource carries its own individual lock.
  assert.equal(resources.length, 1);
  assert.equal(resources[0].querySelectorAll(".course-library__lock").length, 1);
  // Nothing inside a folder is locked a second time — contents included.
  const contentRows = rows(".branched-menu__item").filter((row) => /Photosynthesis|Respiration|Lonely video/.test(text(row)));
  assert.ok(contentRows.length >= 3, `expected the locked contents, got ${contentRows.length}`);
  for (const row of contentRows) {
    assert.equal(row.querySelectorAll(".course-library__lock").length, 0, `${text(row)} must not carry a lock of its own`);
    assert.equal(row.getAttribute("aria-disabled"), "true", "locked contents stay visible but unselectable");
  }
  // The whole page, in one number: locks = folders + separate resources.
  assert.equal(rows(".course-library__lock").length, folders.length + resources.length);
});

/* ── 3 · price, and the tap that leaves for the product page ─────────────── */

test("the folder shows its price, and every paid tap asks for THAT row", () => {
  page = mount();
  // Price on the folder head and on its Unlock row, in the library's mark.
  assert.ok(rows("[data-course-paid-folder] [data-paid-price]").length >= 1);
  // The buy hooks are still there — the overlay's own contract.
  assert.ok(rows("[data-course-overlay-buy-update]").length >= 1);
  assert.ok(rows("[data-course-overlay-buy-module]").length >= 1);
  // Tap the update's Unlock row.
  const updateUnlock = rows("[data-course-overlay-buy-update]")[0];
  click(updateUnlock);
  assert.deepEqual(page.opened, ["update:upd-1"]);
  // Tap the separate resource row.
  click(rows("[data-course-paid-row=\"resource\"]")[0]);
  assert.deepEqual(page.opened, ["update:upd-1", "resource:f-3"]);
  // Nothing was bought here — the purchase happens on the product page.
  assert.deepEqual(page.bought, { updates: [], modules: [] });
});

test("a host that passes no product-page link keeps the old buy action", () => {
  page = mount({ withOpenPaid: false });
  click(rows("[data-course-overlay-buy-update]")[0]);
  assert.deepEqual(page.bought.updates, ["upd-1"]);
  page.unmount();
  page = null;
});
