// tests/courseViewSettingsSnapshotRuntime.test.mjs
//
// RUNTIME proof that the Course view settings store hands React a STABLE
// snapshot — the one rule a `useSyncExternalStore` getter has to keep, and the
// bug that broke "opening a course".
//
// ── The failure this file exists for ─────────────────────────────────────
//
// The owner's Course view page (Settings → Course view: zoom + the four
// divider switches) stores its two values in localStorage and publishes them
// through `useCourseViewSettings()`. Both the Course Player (CoursePlayerApp)
// and Work mode call that hook at the top of their render, so it runs on the
// very first paint of the course.
//
// The getter used to build the object inline:
//
//     return normalize(JSON.parse(raw));           // ← a NEW object every call
//
// React calls a `useSyncExternalStore` getter during render and again right
// after; two different answers mean "the store changed", so it re-rendered…
// and the next read produced yet another object. That is an infinite render
// loop: React logs "The result of getSnapshot should be cached to avoid an
// infinite loop", then throws **error #185 — "Maximum update depth exceeded"**
// — which the Course Player's error boundary renders as the "Course Player hit
// a snag" screen ("Reload and retry"). It hit every learner who had EVER
// touched the Course view settings (their device had a stored value), which is
// why the owner's own device crashed while a fresh profile opened the same
// course fine. `COURSE_VIEW_DEFAULT_SETTINGS` (the shared module object) hid it
// for anyone with nothing stored.
//
// ── What is asserted now ─────────────────────────────────────────────────
//
//   1. a learner WITH stored settings mounts the player's own call site without
//      a single React error — no "#185", no "getSnapshot should be cached";
//   2. every read while the stored value is unchanged returns the SAME object
//      (including across unrelated re-renders: identity, not deep equality);
//   3. a REAL change still lands — one re-parse, one new object, the requested
//      zoom / divider on screen, live, with no reload;
//   4. another tab's write (the `storage` event) is followed the same way;
//   5. nothing stored — and unreadable JSON — answers the shared default
//      object, stably, and the deck still mounts;
//   6. leaving and re-entering the course (unmount → mount again) is clean.
//
// The store is driven in a real DOM through the REAL hook, bundled with
// esbuild — the same harness the other Course Player runtime tests use.

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real store + the player's own call site ────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  COURSE_VIEW_DEFAULT_SETTINGS,
  getCourseViewSettings,
  setCourseDividerVisible,
  setCourseViewZoom,
  useCourseViewSettings,
} from ${JSON.stringify(path.join(ROOT, "src/course/courseViewSettings.ts"))};

// Every object the component has rendered with, in order — the identity trail
// the test inspects. (Deep equality would prove nothing here: the bug produced
// objects that were always deep-equal and never the same reference.)
let seen = [];

/** Mirrors CoursePlayerApp: the hook is read at the top of the render. */
function Player({ tick }) {
  const view = useCourseViewSettings();
  seen.push(view);
  return (
    <div
      data-probe=""
      data-tick={String(tick ?? 0)}
      data-zoom={String(view.zoom)}
      data-vtop={view.dividers.vTop ? "on" : "off"}
      data-hleft={view.dividers.hLeft ? "on" : "off"}
    />
  );
}

let root = null;

export function mount(host, props = {}) {
  if (!root) root = createRoot(host);
  act(() => root.render(<Player tick={props.tick} />));
}

export function rerender(props = {}) {
  act(() => root.render(<Player tick={props.tick} />));
}

export function unmount() {
  if (!root) return;
  act(() => root.unmount());
  root = null;
}

export function resetSeen() { seen = []; }
export function rendered() { return seen; }
export function lastRendered() { return seen[seen.length - 1] ?? null; }

export {
  act,
  COURSE_VIEW_DEFAULT_SETTINGS,
  getCourseViewSettings,
  setCourseDividerVisible,
  setCourseViewZoom,
};
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-view-settings-snapshot-runtime");

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

const dom = new JSDOM(`<!doctype html><html><body><div id="player"></div></body></html>`, {
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
  "HTMLElement", "HTMLDivElement", "Element", "Node", "Event", "StorageEvent", "MouseEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "MutationObserver", "localStorage",
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

/* React reports the two symptoms of an unstable snapshot through console.error:
 * the caching warning, and the invariant that reaches the error boundary. The
 * test owns that channel so a regression can never pass quietly. */
const reactErrors = [];
const realConsoleError = console.error;
console.error = (...args) => {
  reactErrors.push(args.map((value) => String(value)).join(" "));
};
const errorChannel = () => reactErrors;
const cacheWarnings = () =>
  reactErrors.filter((line) => /getSnapshot should be cached|infinite loop/i.test(line));
const depthErrors = () =>
  reactErrors.filter((line) => /Maximum update depth|error #185|Minified React error #185/i.test(line));

/** The store's own key — the one the Settings page and the player share. */
const VIEW_KEY = "dc-course-view-settings";

const fixture = require(bundle);
const { act } = fixture;

const host = () => window.document.getElementById("player");
const probe = () => window.document.querySelector("[data-probe]");
const attr = (name) => String(probe()?.getAttribute(name) ?? "");
const storedRaw = () => window.localStorage.getItem(VIEW_KEY);
const store = (value) => window.localStorage.setItem(VIEW_KEY, JSON.stringify(value));

/** The mount the learner actually performs, with the loop trap around it. */
const openCourse = (props = {}) => {
  let thrown = null;
  try {
    fixture.mount(host(), props);
  } catch (error) {
    thrown = error;
  }
  return thrown;
};

/** A write from ANOTHER tab — same origin, no DOM here. */
const otherTabWrote = (value) => {
  window.localStorage.setItem(VIEW_KEY, JSON.stringify(value));
  act(() => {
    window.dispatchEvent(new window.StorageEvent("storage", { key: VIEW_KEY, newValue: storedRaw() }));
  });
};

beforeEach(() => {
  reactErrors.length = 0;
  fixture.resetSeen();
  fixture.unmount();
  window.localStorage.clear();
  host().innerHTML = "";
});

after(() => {
  try {
    fixture.unmount();
  } catch {
    // the runner is done with this DOM either way
  }
  console.error = realConsoleError;
});

/* ── 1 · the crash the owner saw ─────────────────────────────────────────── */

test("stored Course view settings no longer loop React to death when a course opens", () => {
  // The Settings page wrote these — exactly the state every learner who ever
  // touched Course view is in.
  store({ zoom: 110, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } });

  const thrown = openCourse();

  assert.equal(thrown, null, `opening the course threw: ${thrown?.message ?? ""}`);
  assert.deepEqual(depthErrors(), [], "React hit its nested-update limit (#185)");
  assert.deepEqual(cacheWarnings(), [], "the snapshot is not cached — React warns about an infinite loop");
  assert.equal(reactErrors.length, 0, `React logged: ${reactErrors.join(" | ")}`);
  assert.equal(Boolean(probe()), true, "the course rendered");
  assert.equal(attr("data-zoom"), "110", "the stored zoom reached the player");
});

test("a mount with nothing stored is equally clean and shows the shipped view", () => {
  const thrown = openCourse();
  assert.equal(thrown, null, `opening the course threw: ${thrown?.message ?? ""}`);
  assert.equal(attr("data-zoom"), String(fixture.COURSE_VIEW_DEFAULT_SETTINGS.zoom));
  assert.equal(reactErrors.length, 0, reactErrors.join(" | "));
});

/* ── 2 · the identity rule itself ────────────────────────────────────────── */

test("every read returns the SAME object while the stored value is unchanged", () => {
  store({ zoom: 95, dividers: { vTop: false, vBottom: true, hLeft: true, hRight: true } });
  openCourse();

  const first = fixture.getCourseViewSettings();
  const second = fixture.getCourseViewSettings();
  assert.equal(first === second, true, "two reads handed React two different objects");

  // Unrelated re-renders (the player re-renders constantly: progress, keyboard,
  // tabs) must keep seeing that one object — a new identity per render is the
  // loop.
  const before = fixture.rendered().length;
  fixture.rerender({ tick: 1 });
  fixture.rerender({ tick: 2 });
  const after = fixture.rendered().slice(before);
  assert.equal(after.length >= 2, true, "the re-renders really happened");
  assert.equal(after.every((snapshot) => snapshot === first), true, "a re-render saw a new snapshot object");
  assert.equal(cacheWarnings().length, 0, cacheWarnings().join(" | "));
});

test("the stored value and the object identity agree: same JSON → same object, new JSON → new object", () => {
  store({ zoom: 120, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } });
  const withStoredValue = fixture.getCourseViewSettings();
  // Re-writing the identical JSON (a no-op save) is not a change.
  fixture.setCourseDividerVisible("vTop", true);
  assert.equal(fixture.getCourseViewSettings(), withStoredValue, "an identical stored value re-created the snapshot");
  // A real change is.
  fixture.setCourseDividerVisible("vTop", false);
  const changed = fixture.getCourseViewSettings();
  assert.equal(changed === withStoredValue, false, "a real change kept the stale snapshot");
  assert.equal(changed.dividers.vTop, false);
});

/* ── 3 · live updates still work ─────────────────────────────────────────── */

test("zoom and divider switches still reach the open course, with no reload", () => {
  store({ zoom: 100, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } });
  openCourse();
  assert.equal(attr("data-zoom"), "100");
  assert.equal(attr("data-vtop"), "on");

  act(() => fixture.setCourseViewZoom(130));
  assert.equal(attr("data-zoom"), "130", "the deck did not follow the zoom");
  assert.equal(cacheWarnings().length, 0);

  act(() => fixture.setCourseDividerVisible("vTop", false));
  assert.equal(attr("data-vtop"), "off", "the deck did not follow the divider switch");
  assert.equal(attr("data-hleft"), "on", "an untouched divider moved");
  assert.equal(reactErrors.length, 0, reactErrors.join(" | "));
});

test("a write from another tab is followed, and does not loop either", () => {
  store({ zoom: 100, dividers: { vTop: true, vBottom: true, hLeft: true, hRight: true } });
  openCourse();

  otherTabWrote({ zoom: 85, dividers: { vTop: false, vBottom: true, hLeft: true, hRight: true } });
  assert.equal(attr("data-zoom"), "85", "the other tab's zoom was ignored");
  assert.equal(attr("data-vtop"), "off", "the other tab's divider switch was ignored");
  assert.equal(reactErrors.length, 0, reactErrors.join(" | "));
});

/* ── 4 · the degenerate stored values ────────────────────────────────────── */

test("unreadable stored JSON answers the shared default, stably, and still opens", () => {
  window.localStorage.setItem(VIEW_KEY, "{ not json");
  const thrown = openCourse();
  assert.equal(thrown, null, `opening the course threw: ${thrown?.message ?? ""}`);
  assert.equal(
    fixture.getCourseViewSettings(),
    fixture.COURSE_VIEW_DEFAULT_SETTINGS,
    "a broken stored value did not fall back to the shared default object",
  );
  assert.equal(attr("data-zoom"), String(fixture.COURSE_VIEW_DEFAULT_SETTINGS.zoom));
  assert.equal(reactErrors.length, 0, reactErrors.join(" | "));
});

test("clearing the value goes back to the shared default — and mounting again is clean", () => {
  store({ zoom: 140, dividers: { vTop: false, vBottom: false, hLeft: false, hRight: false } });
  openCourse();
  assert.equal(attr("data-zoom"), "140");
  assert.equal(attr("data-vtop"), "off");

  act(() => {
    window.localStorage.removeItem(VIEW_KEY);
    window.dispatchEvent(new window.StorageEvent("storage", { key: VIEW_KEY, newValue: null }));
  });
  assert.equal(attr("data-zoom"), String(fixture.COURSE_VIEW_DEFAULT_SETTINGS.zoom));
  assert.equal(attr("data-vtop"), "on");
  assert.equal(
    fixture.getCourseViewSettings(),
    fixture.COURSE_VIEW_DEFAULT_SETTINGS,
    "nothing stored must answer the shared default object",
  );
  assert.equal(reactErrors.length, 0, reactErrors.join(" | "));

  // Leaving the course and coming back (unmount → mount) is the "Reload and
  // retry" the learner was offered: it must simply work.
  fixture.unmount();
  reactErrors.length = 0;
  const thrown = openCourse();
  assert.equal(thrown, null, `re-entering the course threw: ${thrown?.message ?? ""}`);
  assert.equal(reactErrors.length, 0, reactErrors.join(" | "));
  assert.equal(
    fixture.getCourseViewSettings(),
    fixture.COURSE_VIEW_DEFAULT_SETTINGS,
    "the default object identity did not survive the second visit",
  );
});
