// tests/coursePlayerGradientWavesRuntime.test.mjs
//
// Runtime proof for the Course Player × Gradient Waves brief (2026-10-10),
// driving the REAL preference hook (src/course/playerPreferences.tsx) and the
// REAL background layer (src/course/CourseGradientWavesBackground.tsx) in a DOM,
// wired exactly like CoursePlayerApp wires them:
//
//   1. a new learner with nothing stored gets the switch ON + the waves layer,
//      and NOTHING is written to storage on startup;
//   2. switching OFF unmounts the layer in the same render (legacy backdrop);
//   3. switching ON brings it back in the same render — no reload;
//   4. the choice survives a fresh mount (refresh / navigation);
//   5. a learner who had ALREADY saved OFF stays OFF — startup never overwrites;
//   6. choices are per learner;
//   7. another tab changing the switch is followed live;
//   8. parent re-renders never re-create the layer (memoised, same DOM node);
//   9. without WebGL2 the layer stays an empty, inert box — never a crash.
//
// The WebGL side (real shader frames, context release on unmount, 1x DPR on
// touch, contrast) needs a GPU-backed browser and was verified in headless
// Chromium/SwiftShader — see COURSE_PLAYER_GRADIENT_WAVES_REPORT.md.

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
import {
  useModuleListingStyle,
  isModernModuleListing,
  DEFAULT_MODULE_LISTING_STYLE,
} from ${JSON.stringify(path.join(ROOT, "src/course/playerPreferences.tsx"))};
import CourseGradientWavesBackground from ${JSON.stringify(path.join(ROOT, "src/course/CourseGradientWavesBackground.tsx"))};

// Mirrors CoursePlayerApp: shell attribute + stage-mounted layer + settings switch.
function Player({ uid, tick }) {
  const ctl = useModuleListingStyle(uid, DEFAULT_MODULE_LISTING_STYLE);
  const on = isModernModuleListing(ctl.style);
  return (
    <div data-course-player="" data-course-waves={on ? "on" : "off"} data-tick={tick}>
      <div data-course-stage="">
        {on ? <CourseGradientWavesBackground /> : null}
        <section id="course-viewer">
          <button
            role="switch"
            aria-checked={ctl.style === "modern"}
            data-course-setting="moduleStyle"
            onClick={() => ctl.setStyle(ctl.style === "modern" ? "classic" : "modern")}
          >Modern module listing</button>
        </section>
      </div>
    </div>
  );
}

export function mount(host, props) {
  const root = createRoot(host);
  act(() => root.render(<Player {...props} />));
  return {
    rerender: (next) => act(() => root.render(<Player {...next} />)),
    unmount: () => act(() => root.unmount()),
  };
}
export { act };
`;

const CACHE = path.join(ROOT, "node_modules", ".cache", "course-gradient-waves-runtime");
function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [entry, "--bundle", "--format=cjs", "--platform=node", "--jsx=automatic", "--target=node20",
      `--tsconfig=${path.join(ROOT, "tsconfig.json")}`, `--outfile=${out}`, "--log-level=error"],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}
const bundle = buildFixture();

const dom = new JSDOM(`<!doctype html><html><body></body></html>`, { pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
for (const key of ["HTMLElement", "HTMLCanvasElement", "Element", "Node", "Event", "MouseEvent", "StorageEvent",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "localStorage"]) define(key, window[key]);
// jsdom has no WebGL: the probe must come back false and the layer stay inert.
let probes = 0;
window.HTMLCanvasElement.prototype.getContext = function getContext() { probes += 1; return null; };
window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
define("matchMedia", window.matchMedia);

const { mount, act } = require(bundle);
const KEY = (uid) => `dc.moduleStyle.listing.${uid}`;
const hosts = [];
function fresh(props) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  hosts.push(host);
  const handle = mount(host, props);
  return { host, ...handle };
}
const $ = (host, sel) => host.querySelector(sel);
const click = (el) => act(() => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
const wavesOn = (host) => $(host, "[data-course-player]").getAttribute("data-course-waves") === "on";
const layerCount = (host) => host.querySelectorAll("[data-course-gradient-waves]").length;

after(() => {
  for (const host of hosts) host.remove();
  dom.window.close();
});

test("new learner, nothing stored → ON with the waves layer, and nothing is written", () => {
  window.localStorage.clear();
  const p = fresh({ uid: "new-user", tick: 0 });
  assert.equal(wavesOn(p.host), true);
  assert.equal(layerCount(p.host), 1);
  assert.equal($(p.host, '[role="switch"]').getAttribute("aria-checked"), "true");
  assert.equal(window.localStorage.getItem(KEY("new-user")), null, "the default is a read fallback, never persisted on startup");
  p.unmount();
});

test("the layer is inert: aria-hidden, click-through, behind the content (z -1)", () => {
  const p = fresh({ uid: "inert", tick: 0 });
  const layer = $(p.host, "[data-course-gradient-waves]");
  assert.equal(layer.getAttribute("aria-hidden"), "true");
  for (const cls of ["pointer-events-none", "absolute", "inset-0", "z-[-1]"]) assert.ok(layer.classList.contains(cls), cls);
  // It is the first thing in the stage, before the content section.
  assert.equal($(p.host, "[data-course-stage]").firstElementChild, layer);
  assert.equal(layer.nextElementSibling.id, "course-viewer");
  p.unmount();
});

test("OFF unmounts the layer immediately; ON brings it back immediately", () => {
  window.localStorage.clear();
  const p = fresh({ uid: "toggler", tick: 0 });
  const sw = $(p.host, '[role="switch"]');
  click(sw);
  assert.equal(wavesOn(p.host), false);
  assert.equal(layerCount(p.host), 0, "legacy backdrop: no waves layer at all");
  assert.equal(window.localStorage.getItem(KEY("toggler")), "classic");
  click(sw);
  assert.equal(wavesOn(p.host), true);
  assert.equal(layerCount(p.host), 1);
  assert.equal(window.localStorage.getItem(KEY("toggler")), "modern");
  // Rapid toggling never stacks layers.
  for (let i = 0; i < 9; i += 1) click(sw);
  assert.equal(layerCount(p.host), 0);
  click(sw);
  assert.equal(layerCount(p.host), 1);
  p.unmount();
});

test("the saved choice survives a fresh mount (refresh / navigation)", () => {
  window.localStorage.clear();
  const first = fresh({ uid: "persist", tick: 0 });
  click($(first.host, '[role="switch"]'));
  first.unmount();
  const second = fresh({ uid: "persist", tick: 0 });
  assert.equal(wavesOn(second.host), false);
  assert.equal(layerCount(second.host), 0);
  second.unmount();
});

test("a learner who already saved OFF stays OFF — startup never overwrites it", () => {
  window.localStorage.clear();
  window.localStorage.setItem(KEY("legacy"), "classic");
  for (let i = 0; i < 3; i += 1) {
    const p = fresh({ uid: "legacy", tick: 0 });
    assert.equal(wavesOn(p.host), false);
    assert.equal(window.localStorage.getItem(KEY("legacy")), "classic");
    p.unmount();
  }
});

test("choices are per learner", () => {
  window.localStorage.clear();
  window.localStorage.setItem(KEY("alice"), "classic");
  const p = fresh({ uid: "alice", tick: 0 });
  assert.equal(wavesOn(p.host), false);
  p.rerender({ uid: "bob", tick: 0 });
  assert.equal(wavesOn(p.host), true, "bob has nothing saved → default ON");
  p.rerender({ uid: "alice", tick: 0 });
  assert.equal(wavesOn(p.host), false);
  p.unmount();
});

test("another tab flipping the switch is followed live", () => {
  window.localStorage.clear();
  const p = fresh({ uid: "tabs", tick: 0 });
  assert.equal(wavesOn(p.host), true);
  window.localStorage.setItem(KEY("tabs"), "classic");
  act(() => window.dispatchEvent(new window.StorageEvent("storage", { key: KEY("tabs"), newValue: "classic" })));
  assert.equal(wavesOn(p.host), false);
  p.unmount();
});

test("parent re-renders never re-create the layer, and WebGL2 is probed once", () => {
  window.localStorage.clear();
  const p = fresh({ uid: "memo", tick: 0 });
  const layer = $(p.host, "[data-course-gradient-waves]");
  const before = probes;
  for (let tick = 1; tick <= 25; tick += 1) p.rerender({ uid: "memo", tick });
  assert.equal($(p.host, "[data-course-gradient-waves]"), layer, "same DOM node after 25 parent renders");
  click($(p.host, '[role="switch"]'));
  click($(p.host, '[role="switch"]'));
  assert.equal(probes, before, "the WebGL2 probe result is cached for the session");
  assert.ok(probes <= 1);
  p.unmount();
});

test("without WebGL2 the layer is an empty, inert box — the player keeps working", () => {
  const p = fresh({ uid: "nogl", tick: 0 });
  const layer = $(p.host, "[data-course-gradient-waves]");
  assert.equal(layer.getAttribute("data-webgl2"), "false");
  assert.equal(layer.querySelector("canvas"), null);
  assert.ok($(p.host, '[role="switch"]'), "player UI rendered");
  p.unmount();
});
