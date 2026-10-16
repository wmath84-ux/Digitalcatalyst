// tests/courseResourceLibrarySearchRuntime.test.mjs
//
// The owner's brief (2026-10-16), run for real:
//
//   1. the Resource Library page is pure white and its name, icon and count sit
//      ON THE PAGE, just under the header;
//   2. the header area carries a circular search box with the long sentence
//      sliding left and right inside it;
//   3. a click on that box opens a NESTED search page inside the library — a
//      back arrow beside the box (on its left), the box itself ready to write
//      in, and a format button on its right;
//   4. the format button shows NO options: it converts itself, and the list
//      follows — the music library's own two formats (rows / thumbnails);
//   5. the Enter button sits INSIDE the box on the right, and the keyboard's
//      own Enter runs the same search;
//   6. typing runs a flash scan with a full one-second floor however fast the
//      network is, and the results appear when it ends;
//   7. one search answers with the whole library's content AND YouTube;
//   8. the page shows previous searches in YouTube's own search-page design.
//
// The harness is the Course Player's own: esbuild bundles the real component,
// jsdom hosts it, and nothing is stubbed except the network.

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real Resource Library ──────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import CourseResourceLibrary from ${JSON.stringify(path.join(ROOT, "src/course/CourseResourceLibrary.tsx"))};

let root = null;
let visits = 0;
/** What the page asked the player to open, in order. */
export const opened = [];

export function mountLibrary(host, modules, options = {}) {
  if (!root) root = createRoot(host);
  visits += 1;
  act(() => {
    root.render(
      React.createElement(CourseResourceLibrary, {
        key: options.key || ("visit-" + visits),
        modules,
        courseTitle: "Algebra Mastery",
        completedFileIds: new Set(options.completedIds || []),
        accessibleModuleIds: new Set(options.accessibleModuleIds || ["m1", "m1a", "m2"]),
        ownedUpdateIds: new Set(),
        previewModuleIds: new Set(),
        accessibleResourceIds: new Set(),
        masterNotes: options.masterNotes || [],
        onSelectFile: (file) => { opened.push(["file", file.id]); },
        onOpenMasterNote: (note) => { opened.push(["note", note.id]); },
        onOpenMindMapResource: (file) => { opened.push(["mindmap", file.id]); },
        personalEntry: null,
      }),
    );
  });
}

export function unmountLibrary() {
  if (root) act(() => root.unmount());
  root = null;
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-resource-library-runtime");

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

const dom = new JSDOM(`<!doctype html><html><body><div id="library"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "https://learn.example.test/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of [
  "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLFormElement", "HTMLAnchorElement", "HTMLImageElement",
  "SVGElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "SubmitEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "MutationObserver", "localStorage", "DOMParser",
]) {
  define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, addEventListener: () => undefined,
    removeEventListener: () => undefined, addListener: () => undefined,
    removeListener: () => undefined, dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);
define("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
window.ResizeObserver = globalThis.ResizeObserver;

// jsdom lays nothing out: the test owns every box the page measures.
let paneWidth = 720;
let paneHeight = 800;
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return { x: 0, y: 0, left: 0, top: 0, right: paneWidth, bottom: paneHeight, width: paneWidth, height: paneHeight, toJSON: () => ({}) };
};
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return paneWidth; } });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return paneHeight; } });

// NO network in a unit test: a switchable stub for the YouTube Data API.
let fetchResponder = () => Promise.reject(new Error("offline"));
define("fetch", (...args) => Promise.resolve(fetchResponder(...args)));
delete globalThis.__DC_YOUTUBE_API_KEY__;

const fixture = require(bundle);
const { act } = fixture;

/* ── the course ──────────────────────────────────────────────────────────── */

const MODULES = [
  {
    id: "m1",
    title: "Foundations",
    accessLevel: "free",
    files: [
      { id: "f1", name: "Intro to Algebra", type: "youtube", url: "https://youtu.be/aaaa", provider: "youtube", accessLevel: "free" },
      { id: "f2", name: "Algebra worksheet", type: "pdf", url: "https://cdn.example.test/algebra.pdf", accessLevel: "free" },
      { id: "f3", name: "Brain practice: Algebra", type: "brain", url: "https://cdn.example.test/brain.json", accessLevel: "free" },
    ],
    modules: [
      {
        id: "m1a",
        title: "Trigonometry basics",
        accessLevel: "free",
        files: [
          { id: "f4", name: "Sin and cos lecture", type: "video", url: "https://cdn.example.test/sin.mp4", accessLevel: "free" },
        ],
      },
    ],
  },
  {
    id: "m2",
    title: "Advanced",
    accessLevel: "free",
    files: [
      { id: "f5", name: "Calculus mind map", type: "mind_map", url: "https://cdn.example.test/map", accessLevel: "free" },
    ],
  },
];

const YOUTUBE_ITEMS = {
  items: [
    { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "Algebra basics — full lecture", channelTitle: "Khan Academy" } },
    { id: { videoId: "9bZkp7q19f0" }, snippet: { title: "Trigonometry song", channelTitle: "officialpsy" } },
  ],
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

const settle = async (ms = 40) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

// jsdom nodes NEVER go to assert directly (a failed strict comparison makes
// node inspect the element, walk the window graph and OOM the runner).
const host = () => window.document.getElementById("library");
const q = (selector) => window.document.querySelector(selector);
const qa = (selector) => [...window.document.querySelectorAll(selector)];
const text = (selector) => (q(selector)?.textContent || "");

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(input, String(value));
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

function click(el) {
  return act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
}

/** The keyboard's own Enter: the form's submit, exactly as a browser sends it. */
function pressEnter() {
  return act(async () => {
    q("[data-library-search-form]").dispatchEvent(new window.SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

const mount = (options = {}) => fixture.mountLibrary(host(), MODULES, options);

beforeEach(() => {
  fetchResponder = () => Promise.reject(new Error("offline"));
  paneWidth = 720;
});

after(() => {
  fixture.unmountLibrary();
  window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

/* ── the tests ───────────────────────────────────────────────────────────── */

test("the page opens with its name row on the page and the search box in the header", async () => {
  window.localStorage.clear();
  mount();
  await settle();

  // The name, the icon and the count are the PAGE's own now…
  const row = q("[data-library-title-row]");
  assert.ok(Boolean(row), "the title row rides on the page");
  assert.match(row.textContent, /Resource Library/);
  assert.match(text("[data-library-title-row] .library-header__count"), /^[0-9]+ resources$/);
  // …and the page under it is still the course listing.
  assert.equal(Boolean(q("[data-course-library-menu]")), true);

  // The header strip carries the circular search box, and nothing else.
  const header = q("[data-library-header]");
  const box = q("[data-library-search-open-button]");
  assert.ok(Boolean(header && box && header.contains(box)), "the box lives in the header");
  assert.equal(Boolean(q("[data-course-page-title]") && q("[data-course-page-title]").closest("[data-library-header]")), false, "the header names nothing");
  // The long sentence rides inside it, unsplit.
  const slide = q("[data-library-searchbox] [data-dc-slide], [data-library-search-open-button] [data-dc-slide]");
  assert.ok(Boolean(slide), "the sentence is inside the box");
  assert.match(slide.textContent, /Search your favourite lecture on YouTube or listen songs/);
  assert.match(slide.textContent, /annotating PDFs/);
});

test("a click on the box opens the nested search page: back arrow · box · self-convertible format", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();

  const body = q("[data-library-search-page-body]");
  assert.ok(Boolean(body), "the nested search page is inside the library body");
  assert.equal(Boolean(q("[data-course-library-menu]")), false, "the listing steps aside");

  // The header now holds: the back arrow, the box, the format button — in
  // that order, and the box is ready to write in.
  const strip = q("[data-library-search-header]");
  const part = q("[data-library-searchbar]");
  assert.ok(Boolean(strip && part && strip.contains(part)), "the search strip is the header");
  const cells = [...part.children].map((node) => node.getAttribute("data-library-search-back") !== null ? "back"
    : node.getAttribute("data-library-search-form") !== null ? "box"
      : node.getAttribute("data-library-search-format-toggle") !== null ? "format" : "other");
  assert.deepEqual(cells, ["back", "box", "format"], "arrow left, box centre, format right");
  assert.equal(window.document.activeElement, q("[data-library-search-input]"), "the box is ready to write");

  // The format control shows no options at all: one button, and its glyph is
  // the format the next tap gives you.
  assert.equal(qa("[data-library-search-format-toggle]").length, 1);
  assert.equal(q("[data-library-search-format-toggle]").getAttribute("data-library-search-format-next"), "grid");
  assert.equal(qa('[data-library-search-listing]').length, 0, "nothing is listed before a search");

  // The back arrow returns to the library itself.
  await click(q("[data-library-search-back]"));
  await settle();
  assert.equal(Boolean(q("[data-library-search-page-body]")), false);
  assert.equal(Boolean(q("[data-course-library-menu]")), true, "the listing is back");
});

test("the box searches the whole library AND YouTube: flash scan first, then both lists", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({ ok: true, json: () => Promise.resolve(YOUTUBE_ITEMS) });
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();

  typeInto(q("[data-library-search-input]"), "algebra");
  // The Enter button is INSIDE the box, on its right, and is the form's submit.
  const box = q("[data-library-search-form]");
  const enter = q("[data-library-search-enter]");
  assert.ok(Boolean(enter && box.contains(enter)), "the Enter button lives inside the box");
  assert.equal(enter.getAttribute("type"), "submit");

  const startedAt = Date.now();
  await click(enter);
  // The flash scan: a full second even though this stub answers at once.
  await settle(60);
  assert.equal(Boolean(q("[data-dc-flash-scan]")), true, "the flash scan animates while the search runs");
  assert.equal(Boolean(q("[data-library-search-listing]")), false, "nothing lands before the floor");
  await settle(1200);
  assert.ok(Date.now() - startedAt >= 1000, "the one-second floor really elapsed");
  assert.equal(Boolean(q("[data-dc-flash-scan]")), false, "the scan ends with the results");

  // The whole library answered…
  const local = qa('[data-library-search-hit]');
  assert.equal(local.length, 3, "every library resource that matches is listed");
  assert.match(text('[data-library-search-section="library"]'), /In this library/i);
  // …and so did YouTube, from the ONE box.
  const online = qa("[data-library-search-youtube-hit]");
  assert.equal(online.length, 2);
  assert.match(text('[data-library-search-section="youtube"]'), /On YouTube/i);
  assert.match(text("[data-library-search-youtube-hit]"), /Algebra basics/);

  // Keyboard Enter runs the very same search (a submit on the same form).
  typeInto(q("[data-library-search-input]"), "sin and cos");
  await pressEnter();
  await settle(1200);
  assert.equal(qa("[data-library-search-hit]").length, 1, "the lecture under the submodule matches");
  assert.equal(Boolean(q("[data-library-search-youtube-hit]")), true);
});

test("the format button converts itself and the whole listing follows it", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({ ok: true, json: () => Promise.resolve(YOUTUBE_ITEMS) });
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();
  typeInto(q("[data-library-search-input]"), "algebra");
  await pressEnter();
  await settle(1200);

  // The music library's own two formats, rows first.
  assert.equal(Boolean(q('[data-library-search-listing="list"]')), true);
  assert.equal(qa('[data-library-hit-format="list"]').length, 5);
  assert.equal(qa('[data-library-hit-format="grid"]').length, 0);

  await click(q("[data-library-search-format-toggle]"));
  await settle();
  assert.equal(Boolean(q('[data-library-search-listing="grid"]')), true, "the same button gives the other format");
  assert.equal(qa('[data-library-hit-format="grid"]').length, 5, "and the whole listing converts with it");
  assert.equal(q("[data-library-search-format-toggle]").getAttribute("data-library-search-format-next"), "list");

  await click(q("[data-library-search-format-toggle]"));
  await settle();
  assert.equal(Boolean(q('[data-library-search-listing="list"]')), true, "one tap each way");
});

test("a library hit opens the resource; the search page steps aside", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();
  typeInto(q("[data-library-search-input]"), "worksheet");
  await pressEnter();
  await settle(1200);
  const hits = qa("[data-library-search-hit]");
  assert.equal(hits.length, 1);
  assert.match(hits[0].getAttribute("data-library-hit-id"), /f2$/);
  await click(hits[0]);
  await settle();
  assert.deepEqual(fixture.opened, [["file", "f2"]], "the player opened that very resource");
  assert.equal(Boolean(q("[data-library-search-page-body]")), false, "and the library listing is back");
});

test("previous searches come back in YouTube's own search-page shape", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({ ok: true, json: () => Promise.resolve(YOUTUBE_ITEMS) });
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();
  // Nothing searched yet: the page says what the box can do.
  assert.equal(Boolean(q("[data-library-search-hint]")), true);
  assert.equal(Boolean(q("[data-dc-search-history]")), false);

  typeInto(q("[data-library-search-input]"), "trigonometry");
  await pressEnter();
  await settle(1200);
  // The query is kept on this device…
  assert.deepEqual(JSON.parse(window.localStorage.getItem("dc.searchHistory.v1.course-library")), ["trigonometry"]);

  // …and comes back the next time the box is empty — heading, one row per
  // search, a remove control and Clear, exactly as YouTube's own page shows it.
  typeInto(q("[data-library-search-input]"), "");
  await pressEnter();
  await settle();
  assert.equal(Boolean(q("[data-dc-search-history]")), true, "the history list is there");
  assert.equal(Boolean(q("[data-dc-history-clear]")), true, "with YouTube's Clear button");
  const rows = qa("[data-dc-history-entry]");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].getAttribute("data-dc-history-entry"), "trigonometry");
  assert.equal(Boolean(q("[data-dc-history-pick]")), true);

  // Picking one runs that search again through the very same box.
  await click(q("[data-dc-history-pick]"));
  await settle(1200);
  assert.equal(Boolean(q("[data-library-search-listing]")), true);
  assert.equal(q("[data-library-search-input]").value, "trigonometry");

  // Clearing the history empties it, and the hint comes back.
  typeInto(q("[data-library-search-input]"), "");
  await pressEnter();
  await settle();
  await click(q("[data-dc-history-clear]"));
  await settle();
  assert.equal(Boolean(q("[data-dc-search-history]")), false);
  assert.equal(Boolean(q("[data-library-search-hint]")), true);
});

test("without a YouTube key the search still answers, and hands the query over", async () => {
  window.localStorage.clear();
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();
  typeInto(q("[data-library-search-input]"), "algebra");
  await pressEnter();
  await settle(1200);
  // The library's own half still works…
  assert.equal(qa("[data-library-search-hit]").length, 3);
  // …and the online half is an honest hand-off, never a silent nothing.
  assert.equal(Boolean(q("[data-library-search-no-online-hits]")), true);
  const link = q("[data-library-search-external]");
  assert.ok(Boolean(link));
  assert.equal(link.getAttribute("target"), "_blank");
  assert.equal(link.getAttribute("href"), "https://www.youtube.com/results?search_query=algebra");
});

test("a query that matches nothing says so in both halves", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("dc.music.youtubeKey", "test-key");
  fetchResponder = () => ({ ok: true, json: () => Promise.resolve({ items: [] }) });
  mount();
  await settle();
  await click(q("[data-library-search-open-button]"));
  await settle();
  typeInto(q("[data-library-search-input]"), "quantum basket weaving");
  await pressEnter();
  await settle(1200);
  assert.equal(qa("[data-library-search-hit]").length, 0);
  assert.equal(Boolean(q("[data-library-search-no-library-hits]")), true);
  assert.equal(Boolean(q("[data-library-search-no-online-hits]")), true);
  assert.equal(Boolean(q("[data-library-search-external]")), true, "the hand-off is still offered");
});
