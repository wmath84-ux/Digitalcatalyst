// tests/workLaunchHomeChoiceRuntime.test.mjs
//
// Owner brief (2026-10-15):
//
//   "1. App open hone par default landing page Home hi rehna chahiye. …
//    3. Jab user in dono options mein se kisi bhi option ke visible rehne ke
//    dauran Home par click kare, to Home page open hona chahiye aur dono
//    initial options/overlays close ho jaane chahiye. …
//    6. Sirf overlay ko visually hide karne ke bajay uske actual open/closed
//    state ko bhi sahi tarah update karo. …
//       Home par dobara click → duplicate overlay nahi.
//       Back navigation aur app reopen → unexpected overlay nahi."
//
// This suite mounts the REAL `src/work/WorkLaunchChooser.tsx` in a real DOM and
// drives the real device-preference store (`src/work/storage/workPrefs.ts`)
// through the exact boot the owner reported broken:
//
//   The APK and the installed PWA open on an EMPTY hash. `RootPage` normalises
//   that to `#/home` with `history.replaceState` — which raises NO
//   `hashchange` — while the chooser had already snapshotted the old hash, so
//   the card (and its full-screen backdrop) stayed mounted over an app that was
//   already on Home, and answering the card changed nothing React could see.
//
// The real React component, the real portal, the real CSS-free DOM and the real
// preference module run here; only the *opening splash controller* is a
// controllable stand-in, because the clip itself is a 5 MB MP4 that belongs to
// the browser suite. Its visibility predicate is the production one —
// `isOpeningVisible()` is imported from `src/utils/openingSplash.ts` — so the
// "skipped boot stays untouched" rule is proved against the real rule.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules", ".cache", "work-launch-home-choice-runtime");
const CHOOSER = path.join(ROOT, "src/work/WorkLaunchChooser.tsx");
const OPENING = path.join(ROOT, "src/utils/openingSplash.ts");

fs.mkdirSync(DIR, { recursive: true });

/* ── the opening splash stand-in ────────────────────────────────────────────
 * ONE module, TWO halves: the controller the chooser may ask to dismiss
 * (counted), and the production visibility rule imported from the real file.
 */
const OPENING_STUB = `
import { isOpeningVisible as productionIsOpeningVisible } from ${JSON.stringify(OPENING)};

export const calls = { attach: 0, dismiss: 0 };
let state = "skipped";

/** What the real controller would be reporting at this moment. */
export const setOpeningState = (next) => { state = next; };
export const openingState = () => state;

/** Mirrors the real controller's public shape for the two members used. */
export const attachOpeningSplash = () => {
  calls.attach += 1;
  return {
    get state() { return state; },
    dismiss() { calls.dismiss += 1; state = "done"; },
  };
};

/** The production predicate — never re-implemented here. */
export const isOpeningVisible = productionIsOpeningVisible;
`;

const FIXTURE = `
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import WorkLaunchChooser from ${JSON.stringify(CHOOSER)};
import { calls, setOpeningState, openingState } from "@/utils/openingSplash";

export async function mount() {
  const host = document.createElement("div");
  host.id = "chooser-host";
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<WorkLaunchChooser />); });
  return {
    async unmount() {
      await act(async () => { root.unmount(); });
      host.remove();
    },
  };
}

export { act, calls, setOpeningState, openingState };
`;

await build({
  stdin: { contents: FIXTURE, resolveDir: ROOT, loader: "tsx" },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  loader: { ".css": "empty" },
  logLevel: "silent",
  plugins: [{
    name: "opening-splash-stand-in",
    setup(plugin) {
      // The chooser's own import of the splash module is redirected; every
      // other `@/…` import still resolves through the repo's tsconfig paths.
      plugin.onResolve({ filter: /^@\/utils\/openingSplash$/ }, () => ({ path: "opening-splash-stub", namespace: "opening-stub" }));
      plugin.onLoad({ filter: /.*/, namespace: "opening-stub" }, () => ({ contents: OPENING_STUB, loader: "js", resolveDir: ROOT }));
    },
  }],
});

/* ── the DOM ──────────────────────────────────────────────────────────────── */

const dom = new JSDOM(`<!doctype html><html><body><div id="app"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
const define = (key, value) =>
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
define("Event", window.Event);
define("MouseEvent", window.MouseEvent);
define("HTMLElement", window.HTMLElement);
define("Element", window.Element);
define("Node", window.Node);
define("getComputedStyle", window.getComputedStyle);
define("requestAnimationFrame", window.requestAnimationFrame);
define("cancelAnimationFrame", window.cancelAnimationFrame);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")).href);
const { act, calls, setOpeningState, openingState } = fixture;

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

const settle = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/**
 * Boot the app the way the installed PWA and the APK do, in the app's real
 * order: the chooser snapshots the EMPTY hash during its first render, and
 * `RootPage`'s effect (a descendant's, so it runs first) normalises that to
 * `#/home` with `history.replaceState` — which raises NO `hashchange`.
 *
 * `choice` pre-seeds the Settings answer ("always open Home" / "…Work"), which
 * is exactly the boot where the chooser has no card to paint and routes on its
 * own. The instance is always unmounted, even when an assertion throws, so no
 * card can leak into the next boot.
 */
const bootApp = async (run, { choice, opening = "skipped" } = {}) => {
  await resetBoot();
  if (choice) window.localStorage.setItem("dc.work.launch.v1", choice);
  // What the splash controller reports at the moment the chooser mounts.
  setOpeningState(opening);
  const mounted = await fixture.mount();
  try {
    if (!choice) await normaliseBootToHome();
    await run(mounted);
  } finally {
    await mounted.unmount();
    assert.equal(startupNodes(), 0, "the chooser left no node behind");
  }
};

/** Let a queued `hashchange` from `location.hash = …` be delivered and acted on. */
const settleHash = () => settle(6);

const card = () => window.document.querySelector("[data-work-launch-card]");
const backdrops = () => window.document.querySelectorAll("[data-work-launch-chooser]").length;
const cards = () => window.document.querySelectorAll("[data-work-launch-card]").length;
/** Every node of the startup pair anywhere in the document, portal included. */
const startupNodes = () =>
  window.document.querySelectorAll("[data-work-launch-chooser], [data-work-launch-card]").length;
const homeOption = () => window.document.querySelector("[data-work-launch-card] .dc-work-launch-choice--home");
const workOption = () => window.document.querySelector("[data-work-launch-card] .dc-work-launch-choice--work");
const launchChoice = () => window.localStorage.getItem("dc.work.launch.v1");

const click = async (element) => {
  assert.ok(element, "expected a clickable element");
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await settle(4);
};

/** `RootPage`'s installed-app boot: replaceState to #/home, no hashchange. */
const normaliseBootToHome = async () => {
  window.history.replaceState(null, "", "#/home");
  await settleHash();
};

/** A real navigation (bottom nav, footer nav, a link) → a real hashchange. */
const navigate = async (hash) => {
  window.location.hash = hash;
  await settleHash();
};

/** Device storage, URL and the opening controller back to a clean boot. */
const resetBoot = async () => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  setOpeningState("skipped");
  calls.dismiss = 0;
  calls.attach = 0;
  assert.equal(startupNodes(), 0, "no chooser may leak into the next boot");
};

/* ── 1. the reported boot: Home opens, BOTH startup overlays close ────────── */

test("the APK/PWA boot (Home normalised behind the card) opens Home and closes both startup overlays", async () => {
  await bootApp(async () => {
    assert.equal(window.location.hash, "#/home", "the app is already on the default route");
    assert.equal(cards(), 1, "the startup question is on screen on the first route");
    assert.equal(backdrops(), 1, "…with exactly one backdrop");

    await click(homeOption());
    await settle(20);

    assert.equal(window.location.hash, "#/home", "Home is the page on screen");
    assert.equal(cards(), 0, "the option the learner clicked is gone from the tree");
    assert.equal(backdrops(), 0, "…and so is its backdrop — Home is not blocked");
    assert.equal(startupNodes(), 0, "the whole startup pair left the document, portal included");
  });
});

/* ── 2. the launch opening is released through its owner, and only if live ── */

test("answering the card releases a live launch opening through its owner and leaves a skipped boot alone", async () => {
  // (a) the tap-only default: the opening decided not to show → untouched.
  await bootApp(async () => {
    assert.equal(openingState(), "skipped");
    await click(homeOption());
    assert.equal(calls.dismiss, 0, "a skipped / tap-only boot must not be dismissed (no replay, no fetch)");
  });

  // (b) the admin turned the launch playback on: the clip owns the viewport at
  // the same stacking level and would swallow every tap after the card closes.
  for (const state of ["pending", "playing", "fallback"]) {
    await bootApp(async () => {
      calls.dismiss = 0;
      setOpeningState(state);
      await click(homeOption());
      assert.equal(calls.dismiss, 1, `an on-screen opening (${state}) must be released exactly once`);
      assert.equal(openingState(), "done", "…and its real state becomes closed, not a cosmetic hide");
      assert.equal(startupNodes(), 0);
    });
  }

  // (c) the Work answer hands the screen over the same way.
  await bootApp(async () => {
    calls.dismiss = 0;
    setOpeningState("playing");
    await click(workOption());
    assert.equal(window.location.hash, "#/work");
    assert.equal(calls.dismiss, 1);
    assert.equal(startupNodes(), 0);
  });
});

/* ── 3. answering twice is impossible: no duplicate overlay ───────────────── */

test("Home cannot be blocked twice — the answer is recorded before it is acted on, so no duplicate overlay appears", async () => {
  await bootApp(async () => {
    const option = homeOption();
    await click(option);
    assert.equal(startupNodes(), 0);

    // The learner taps Home again — the bottom-nav Home tab, the header, or a
    // second tap on the button that used to be there. Nothing may come back.
    await click(option);
    assert.equal(cards(), 0, "a second click on Home paints no second card");
    assert.equal(backdrops(), 0);

    // Even a route change that lands back on the default route stays quiet.
    await navigate("#/home");
    assert.equal(cards(), 0);
    assert.equal(backdrops(), 0);
    assert.equal(window.location.hash, "#/home");
  });
});

/* ── 4. Back navigation and an app reopen ────────────────────────────────── */

test("back navigation never resurrects the overlay, and a real app reopen asks again", async () => {
  await bootApp(async () => {
    await click(homeOption());
    assert.equal(startupNodes(), 0);

    // Home → Store → Back to Home: the answered question stays answered for
    // this loaded app instance.
    await navigate("#/store");
    assert.equal(cards(), 0);
    await navigate("#/home");
    assert.equal(cards(), 0, "Back to Home shows no unexpected overlay");
    assert.equal(backdrops(), 0);
  });

  // A genuine reopen (a fresh module instance, the app's own once-per-boot
  // rule) asks the startup question again, and Home is still the default.
  await resetBoot();
  const reopened = await fixture.mount();
  try {
    assert.equal(cards(), 1, "the next cold start asks again while the preference is `ask`");
    await click(homeOption());
    assert.equal(window.location.hash, "#/home");
    assert.equal(startupNodes(), 0);
  } finally {
    await reopened.unmount();
  }
});

/* ── 5. the Settings answers keep Home the default and never paint the card ─ */

test("the Settings answers hand over on the boot that uses them and never paint the card", async () => {
  for (const [choice, hash] of [["home", "#/home"], ["work", "#/work"]]) {
    await bootApp(async () => {
      await settle(20);
      assert.equal(cards(), 0, `"Always open ${choice}" must never paint the card`);
      assert.equal(backdrops(), 0);
      assert.equal(window.location.hash, hash, `"Always open ${choice}" opens ${hash}`);
      assert.equal(calls.dismiss, 1, "…and a live launch opening is released the same way");
    }, { choice, opening: "playing" });
  }
});

/* ── 6. an answered device keeps its answer ──────────────────────────────── */

test("Remember this device stores the answer and the next boot opens it directly", async () => {
  await bootApp(async () => {
    const checkbox = window.document.querySelector("[data-work-launch-card] input[type=checkbox]");
    await click(checkbox);
    await click(homeOption());
    assert.equal(launchChoice(), "home");
  });

  // Next boot: the answer is remembered, so the question is not asked again —
  // and a remembered "home" lands on Home.
  await bootApp(async () => {
    await settle(20);
    assert.equal(cards(), 0);
    assert.equal(window.location.hash, "#/home");
    assert.equal(startupNodes(), 0);
  }, { choice: "home" });
});

/* ── 7. deep links are still never interrupted ───────────────────────────── */

test("a deep link still opens on its own route with no startup overlay", async () => {
  await resetBoot();
  window.history.replaceState(null, "", "/#/course/algebra");
  const mounted = await fixture.mount();
  try {
    await settle(6);
    assert.equal(cards(), 0, "the question never interrupts a deep link");
    assert.equal(backdrops(), 0);
    assert.equal(window.location.hash, "#/course/algebra");
  } finally {
    await mounted.unmount();
  }
});
