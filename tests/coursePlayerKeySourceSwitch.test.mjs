// The KEY SOURCE SWITCH — the learner's own choice, in Settings.
//
// Two engines have a key, and both can be paid for in two ways: the
// learner's own key (their quota) or the MASTER's (the school's). The
// learner chooses — and the background rule keeps running either way: their
// own key first, and the master's takes over BY ITSELF the moment their
// quota is gone.
//
// This file mounts the real switch and drives it, and then checks that both
// Settings cards really carry it.

import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

/* ── fixture: the real switch ────────────────────────────────────────────── */

const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import KeySourceSwitch from ${JSON.stringify(path.join(ROOT, "src/course/KeySourceSwitch.tsx"))};

let root = null;

export function mountSwitch(host, props) {
  if (!root) root = createRoot(host);
  act(() => {
    root.render(React.createElement(KeySourceSwitch, props));
  });
}

export function unmountSwitch() {
  if (root) act(() => root.unmount());
  root = null;
}

export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-key-source-switch");

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

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
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
  "HTMLElement", "HTMLButtonElement", "HTMLInputElement", "HTMLFormElement", "HTMLAnchorElement",
  "SVGElement", "Element", "Node", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "MutationObserver", "localStorage",
]) {
  define(key, window[key]);
}
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, addEventListener: () => undefined,
    removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}
define("matchMedia", window.matchMedia);
define("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
window.ResizeObserver = globalThis.ResizeObserver;

const fixture = require(bundle);
const { act } = fixture;

const host = () => window.document.getElementById("host");
const q = (selector) => window.document.querySelector(selector);
const qa = (selector) => [...window.document.querySelectorAll(selector)];
const text = (selector) => (q(selector)?.textContent || "");

function click(el) {
  return act(async () => { el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
}

beforeEach(() => {
  window.localStorage.clear();
});

after(() => {
  fixture.unmountSwitch();
  window.close();
  for (const handle of process._getActiveHandles?.() ?? []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

/* ── the tests ───────────────────────────────────────────────────────────── */

test("the switch starts on the learner's own key, and the master is one tap away", async () => {
  const chosen = [];
  fixture.mountSwitch(host(), {
    engine: "youtube",
    uid: "learner-1",
    masterAvailable: true,
    onChoose: (source) => chosen.push(source),
    label: "YouTube search ki API key",
  });

  const box = q("[data-key-source-switch]");
  assert.ok(Boolean(box), "the switch is on the page");
  assert.equal(box.getAttribute("data-key-source-engine"), "youtube");
  assert.equal(box.getAttribute("data-key-source-active"), "mine", "the learner's own key is the default");

  const mine = q('[data-key-source-option="mine"]');
  const master = q('[data-key-source-option="master"]');
  assert.ok(Boolean(mine && master), "both options are there");
  assert.equal(mine.getAttribute("aria-pressed"), "true");
  assert.equal(master.getAttribute("aria-pressed"), "false");
  assert.match(text("[data-key-source-hint]"), /quota khatam/,
    "and the background rule is spelled out");

  // One tap on "master" chooses it.
  await click(master);
  assert.deepEqual(chosen, ["master"], "the choice is handed to the engine");
  assert.equal(q("[data-key-source-switch]").getAttribute("data-key-source-active"), "master");
  assert.match(text("[data-key-source-hint]"), /school ki key/i);
});

test("with no master key configured the master option stays out of the way", async () => {
  const chosen = [];
  fixture.mountSwitch(host(), {
    engine: "google",
    uid: "learner-1",
    masterAvailable: false,
    onChoose: (source) => chosen.push(source),
  });

  const master = q('[data-key-source-option="master"]');
  assert.ok(Boolean(master));
  assert.equal(master.hasAttribute("disabled"), true, "a dead search is never offered");
  assert.equal(master.getAttribute("data-key-source-disabled"), "true");
  assert.match(text("[data-key-source-hint]"), /configure nahi hai/);

  await click(master);
  assert.deepEqual(chosen, [], "and it cannot be chosen");
});

test("both Settings cards carry the switch — one per engine", () => {
  const youtube = fs.readFileSync(path.join(ROOT, "src/course/YouTubeKeyCard.tsx"), "utf8");
  const google = fs.readFileSync(path.join(ROOT, "src/course/GoogleSearchCard.tsx"), "utf8");

  assert.match(youtube, /import KeySourceSwitch from "\.\/KeySourceSwitch";/);
  assert.match(youtube, /<KeySourceSwitch[\s\S]*?engine="youtube"/);
  assert.match(youtube, /masterAvailable=\{masterYouTubeKeyAvailable\(\)\}/);
  assert.match(youtube, /onChoose=\{\(source\) => setYouTubeKeySource\(source, uid\)\}/);

  assert.match(google, /import KeySourceSwitch from "\.\/KeySourceSwitch";/);
  assert.match(google, /<KeySourceSwitch[\s\S]*?engine="google"/);
  assert.match(google, /masterAvailable=\{masterGoogleSearchAvailable\(\)\}/);
  assert.match(google, /onChoose=\{\(source\) => setGoogleSearchSource\(source, uid\)\}/);
});
