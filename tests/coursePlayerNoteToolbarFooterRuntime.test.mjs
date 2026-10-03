// tests/coursePlayerNoteToolbarFooterRuntime.test.mjs
//
// RUNTIME proof for the owner's direction:
//
//   "Course player toolbar only when the keyboard is open — a big tablet in
//    desktop view, a desktop browser or a floating window never opens one, so
//    the toolbar must come up the moment a cursor is detected, and it must sit
//    just above the footer navigation — and when the footer navigation is off,
//    care for that too."
//
// The caret half of that rule is pinned in the source by
// tests/noteEditorContract.test.mjs and driven in a real browser by
// tests/noteEditorBrowser.test.mjs. This file runs the OTHER half — where the
// toolbar ends — for real: the actual `measureFooterInset` /
// `readCourseFooterInset` maths (src/course/courseFooterInset.ts) and the
// actual `useCourseFooterInset` hook (src/course/useCourseFooterInset.ts)
// mounted in real React 19 inside jsdom.
//
// jsdom does no layout, so every box here is an explicit rect the test pins to
// an element — which is exactly the three numbers (`top` / `bottom` / `height`)
// the rule reads. What is proved, in behaviour rather than in text:
//
//   1. an overlaying footer (the bottom-centre peek dock) lifts the toolbar by
//      precisely the px it covers — line, hit strip and open panel alike;
//   2. an in-flow footer (the legacy always-visible dock, the last child of the
//      study pane) lifts it by NOTHING — the toolbar already ends at it;
//   3. a footer hidden by the player's keyboard rule (`display: none`, i.e. a
//      zeroed rect) — the "footer navigation is off" case — lifts nothing, so
//      the toolbar drops flush to the bottom edge with no phantom gap, and it
//      comes back when the footer does, with no remount;
//   4. if there is no footer element, it lifts nothing;
//   5. the learner flipping the player's footer-dock setting — one footer
//      unmounts, the other mounts — is picked up live;
//   6. the hook subscribes to nothing at all while there is no toolbar to place.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const { build } = viteRequire("esbuild");

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".tmp-note-toolbar-footer-runtime");
fs.mkdirSync(DIR, { recursive: true });

/* ── DOM + globals (before the bundle is imported) ────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
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
  "CustomEvent",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "getComputedStyle",
]) {
  define(key, window[key]);
}

// jsdom does no layout: every rect is zero. The rule reads rects, so the test
// pins an explicit box per element and lets the REAL code read it. The shell
// (the note pane) is 800px tall and ends at the very bottom of the player.
const SHELL_BOX = { top: 0, bottom: 800, height: 800, width: 400, left: 0, right: 400, x: 0, y: 0 };
const setBox = (element, box) => {
  element.__box = box ? { width: 400, left: 0, right: 400, x: 0, y: box.top, height: box.bottom - box.top, ...box } : null;
};
window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const box = this.__box !== undefined ? this.__box : this.id === "shell" ? SHELL_BOX : null;
  if (!box) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  return { height: box.bottom - box.top, ...box, toJSON: () => ({}) };
};

// A ResizeObserver the test can fire by hand (jsdom has none). It records what
// the hook watches, which is itself part of the proof.
const observed = new Set();
const resizeWatchers = new Set();
class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    resizeWatchers.add(this);
  }
  observe(element) {
    observed.add(element);
  }
  unobserve(element) {
    observed.delete(element);
  }
  disconnect() {
    for (const element of Array.from(observed)) observed.delete(element);
    resizeWatchers.delete(this);
  }
}
define("ResizeObserver", FakeResizeObserver);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── fixture: the real maths + the real hook, mounted ─────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  COURSE_FOOTER_INSET_PROPERTY,
  COURSE_FOOTER_SELECTOR,
  measureFooterInset,
  readCourseFooterInset,
} from "./src/course/courseFooterInset";
import { useCourseFooterInset } from "./src/course/useCourseFooterInset";

/** The note shell, publishing the lift exactly as NoteEditor does. */
function Shell({ active }) {
  const ref = React.useRef(null);
  const footerInset = useCourseFooterInset(active, ref);
  React.useLayoutEffect(() => {
    const shell = ref.current;
    if (!shell) return;
    if (footerInset > 0) shell.style.setProperty(COURSE_FOOTER_INSET_PROPERTY, \`\${footerInset}px\`);
    else shell.style.removeProperty(COURSE_FOOTER_INSET_PROPERTY);
  }, [footerInset]);
  return (
    <div id="shell" ref={ref} data-note-footer-inset={footerInset > 0 ? footerInset : undefined}>
      <div id="dock" />
    </div>
  );
}

export { act, measureFooterInset, readCourseFooterInset, COURSE_FOOTER_SELECTOR };

// root.render() hands back a thenable, so every render is an AWAITED async act:
// a sync act here would return before React flushed, and the assertions would
// read the previous commit.
export async function mount(active = true) {
  const host = document.getElementById("host");
  const root = createRoot(host);
  const render = (next) =>
    act(async () => {
      root.render(<Shell active={next} />);
    });
  await render(active);
  return { render, unmount: () => act(async () => root.unmount()) };
}
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act, measureFooterInset, readCourseFooterInset } = fixture;

after(() => {
  dom.window.close();
  // React's scheduler drives itself through a Node MessageChannel, which keeps
  // the runner alive after the last test (same as the repo's other runtime suites).
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const shell = () => window.document.getElementById("shell");
const dock = () => window.document.getElementById("dock");
const published = () => shell()?.style.getPropertyValue("--dc-note-footer-inset") || "";

/** The player's footer navigation, in one of its two homes. */
const addFooter = (home, box) => {
  const footer = window.document.createElement("div");
  footer.setAttribute(home, "");
  setBox(footer, box);
  window.document.body.appendChild(footer);
  return footer;
};

const clearFooters = () => {
  for (const footer of Array.from(window.document.querySelectorAll("[data-course-peek-dock], [data-course-dock]"))) {
    footer.remove();
  }
};

/** Let the hook's own subscriptions (MutationObserver → rAF) do the re-read. */
const settle = async () => {
  await act(async () => {
    await sleep(60);
  });
};

/** Fire the hook's ResizeObserver directly: a box moved with no DOM mutation. */
const resize = async () => {
  act(() => {
    for (const watcher of Array.from(resizeWatchers)) watcher.callback([], watcher);
  });
  await settle();
};

/* ── 1. The maths, on its own ─────────────────────────────────────────────── */

test("an overlaying footer lifts the toolbar by exactly what it covers", () => {
  // The peek dock: line + hit strip + its own padding = the bottom 48px.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 752, bottom: 800, height: 48 }), 48);
  // …and by more when the footer is open (its panel expands upward).
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 690, bottom: 800, height: 110 }), 110);
  // A footer that only part-covers the pane's bottom still lifts by what it covers.
  assert.equal(measureFooterInset({ top: 100, bottom: 500, height: 400 }, { top: 460, bottom: 700, height: 240 }), 40);
});

test("a footer below the writing surface — the in-flow dock — lifts nothing", () => {
  // The legacy always-visible dock starts exactly where the notes panel ends.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 800, bottom: 864, height: 64 }), 0);
  // …as does one further down still.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 900, bottom: 964, height: 64 }), 0);
  // A sub-pixel seam is not a footer.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 799.6, bottom: 863, height: 63.4 }), 0);
});

test("a footer that is not on screen lifts nothing — no phantom gap", () => {
  // `display: none` (the player's keyboard rule) reports a zeroed rect.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 0, bottom: 0, height: 0 }), 0);
  // No footer at all.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, null), 0);
  assert.equal(measureFooterInset(null, { top: 752, bottom: 800, height: 48 }), 0);
  // And a full-height footer can never invert the page.
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: 0, bottom: 800, height: 800 }), 800);
  assert.equal(measureFooterInset({ top: 0, bottom: 800, height: 800 }, { top: -500, bottom: 800, height: 1300 }), 800);
});

test("the maths reads whichever footer is actually in the document", () => {
  clearFooters();
  // A writing surface of its own — this case is about the maths, not the hook.
  const surface = window.document.createElement("div");
  surface.setAttribute("data-note-shell", "");
  setBox(surface, SHELL_BOX);
  window.document.body.appendChild(surface);

  assert.equal(readCourseFooterInset(surface), 0, "no footer in the DOM at all");
  addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  assert.equal(readCourseFooterInset(surface), 48);
  // A hidden footer alongside a visible one never wins.
  addFooter("data-course-dock", { top: 0, bottom: 0, height: 0 });
  assert.equal(readCourseFooterInset(surface), 48);
  assert.equal(readCourseFooterInset(null), 0);

  surface.remove();
  clearFooters();
});

/* ── 2. The hook, mounted in real React ───────────────────────────────────── */

test("the toolbar is lifted clear of the peek dock, and published on the shell", async () => {
  clearFooters();
  addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  assert.equal(shell().dataset.noteFooterInset, "48");
  assert.equal(published(), "48px", "the custom property the CSS lifts by");
  assert.equal(observed.has(shell()), true, "the writing surface is watched");
  assert.equal(
    Array.from(observed).some((element) => element.hasAttribute("data-course-peek-dock")),
    true,
    "the footer is watched, so it opening / hiding re-measures without a remount",
  );
  await probe.unmount();
});

test("the lift follows the footer opening and closing, live", async () => {
  clearFooters();
  const footer = addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  assert.equal(shell().dataset.noteFooterInset, "48");

  // The peek dock opens: its panel expands, the dock grows upward.
  act(() => {
    footer.setAttribute("data-open", "true");
    setBox(footer, { top: 690, bottom: 800, height: 110 });
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, "110");
  assert.equal(published(), "110px");

  // …and closes again.
  act(() => {
    footer.setAttribute("data-open", "false");
    setBox(footer, { top: 752, bottom: 800, height: 48 });
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, "48");
  await probe.unmount();
});

test("a footer that merely MOVES (the split divider drags the pane) is followed", async () => {
  clearFooters();
  const footer = addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  assert.equal(shell().dataset.noteFooterInset, "48");

  // No DOM mutation at all — only boxes, which is what the ResizeObserver is for.
  setBox(footer, { top: 700, bottom: 800, height: 100 });
  await resize();
  assert.equal(shell().dataset.noteFooterInset, "100");
  await probe.unmount();
});

test("footer navigation OFF: the keyboard rule hides the footer and the toolbar drops flush", async () => {
  clearFooters();
  const footer = addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  const before = shell();
  assert.equal(shell().dataset.noteFooterInset, "48");

  // The player's ONE keyboard rule: `display: none` on the footer, which is a
  // zeroed rect — the toolbar must lose its lift, not keep a gap above nothing.
  act(() => {
    footer.classList.add("hidden");
    setBox(footer, null);
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, undefined, "no lift while the footer is hidden");
  assert.equal(published(), "", "and the custom property is removed, not left at its old value");
  assert.equal(shell(), before, "the shell was never remounted");

  // Dismissing the keyboard brings the footer — and the lift — back.
  act(() => {
    footer.classList.remove("hidden");
    setBox(footer, { top: 752, bottom: 800, height: 48 });
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, "48");
  await probe.unmount();
});

test("no footer navigation at all: the toolbar sits at the very bottom", async () => {
  clearFooters();
  const probe = await fixture.mount();
  assert.equal(shell().dataset.noteFooterInset, undefined);
  assert.equal(published(), "");
  // The footer appearing later (the player mounts it after the panel) is caught.
  act(() => {
    addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, "48");
  await probe.unmount();
});

test("the legacy in-flow dock needs no lift, and swapping footers is picked up", async () => {
  clearFooters();
  // In flow below the notes panel: it starts exactly where the pane ends.
  addFooter("data-course-dock", { top: 800, bottom: 864, height: 64 });
  const probe = await fixture.mount();
  assert.equal(shell().dataset.noteFooterInset, undefined, "the toolbar already ends at the in-flow dock");

  // The learner turns "Always-visible footer dock" off: that dock unmounts and
  // the peek dock takes over, overlaying the pane.
  act(() => {
    window.document.querySelector("[data-course-dock]")?.remove();
    addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, "48", "the swapped footer is measured without a remount");
  await probe.unmount();
});

test("with no toolbar on screen the hook measures nothing and watches nothing", async () => {
  clearFooters();
  addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount(false);
  assert.equal(shell().dataset.noteFooterInset, undefined);
  assert.equal(published(), "");
  assert.equal(observed.size, 0, "nothing is observed while there is no toolbar to place");

  // The toolbar appearing (a caret lands in the note) starts the measurement.
  await probe.render(true);
  assert.equal(shell().dataset.noteFooterInset, "48");
  assert.equal(observed.size, 2, "the writing surface and the footer");

  // …and leaving stops it again.
  await probe.render(false);
  assert.equal(shell().dataset.noteFooterInset, undefined);
  assert.equal(published(), "");
  assert.equal(observed.size, 0);
  await probe.unmount();
});

test("the shared CSS backstop: the shell republishing the keyboard state re-measures the footer", async () => {
  clearFooters();
  // The player shell, the way the player renders it: the footer lives inside it,
  // and src/index.css hides the footer off the shell's own attribute.
  const playerShell = window.document.createElement("div");
  playerShell.className = "course-player-shell";
  const footer = addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  playerShell.appendChild(footer);
  window.document.body.appendChild(playerShell);

  const probe = await fixture.mount();
  assert.equal(shell().dataset.noteFooterInset, "48");

  // The ONLY DOM change is the attribute the player publishes its keyboard
  // state on; the footer's box goes to zero because the shared rule
  // (`display: none !important`) now applies to it. Nothing touches the footer
  // element itself, so only that attribute can have triggered the re-read.
  act(() => {
    playerShell.setAttribute("data-course-keyboard", "open");
    setBox(footer, null);
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, undefined, "the hidden footer no longer lifts the toolbar");

  act(() => {
    playerShell.setAttribute("data-course-keyboard", "closed");
    setBox(footer, { top: 752, bottom: 800, height: 48 });
  });
  await settle();
  assert.equal(shell().dataset.noteFooterInset, "48", "and it comes back with the footer");

  await probe.unmount();
  playerShell.remove();
});

test("the lift is published where the CSS that margins the dock inherits it", async () => {
  clearFooters();
  addFooter("data-course-peek-dock", { top: 752, bottom: 800, height: 48 });
  const probe = await fixture.mount();
  // `.dc-note .dc-note-dock { margin-bottom: var(--dc-note-footer-inset, 0px) }`
  // reads the property off the shell the dock lives in.
  assert.equal(dock()?.parentElement, shell());
  assert.equal(published(), "48px");
  await probe.unmount();
});
