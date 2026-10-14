// tests/openingAdRuntime.test.mjs
//
// Runtime contract for the `ad` option after it moved into the side panels
// (2026-10-14 — see src/components/ad/OpeningAdControl.tsx and
// docs/app-opening-animation.md).
//
// tests/openingAdControl.test.mjs reads the source; this one BUNDLES the real
// component with esbuild, mounts it in jsdom and drives it, so the behaviour a
// learner actually gets is what is asserted:
//
//   · the faded label opens the player, and NOTHING is fetched before the tap
//     (no <video> element, no src, no request);
//   · the player is portalled into <body> (the app chrome is backdrop-blurred,
//     which would trap a fixed child inside the header);
//   · Escape and the Close button both release it;
//   · `useOpeningAdPlayer().available` is false while the launch playback is on
//     (the row is hidden, not inert) and while the animation is disabled.
//
// The two `@/` imports the component needs are aliased to local stubs, so the
// bundle never touches Firebase — only the component under test is real.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { JSDOM } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Inside the repo but inside node_modules, so the stubs and the bundle are
// never committed.
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-opening-ad-runtime");
fs.mkdirSync(OUT_DIR, { recursive: true });

// The branding stub is BUNDLED into the component, so it cannot be a module the
// test imports and mutates — the two copies would be separate objects. It reads
// a global instead, which the test drives below.
const BRANDING_STUB = path.join(OUT_DIR, "branding-stub.js");
fs.writeFileSync(
  BRANDING_STUB,
  `const DEFAULTS = {
  appName: "EduOS Test",
  openingAnimationEnabled: true,
  openingPlayOnLaunch: false,
  openingAnimationUrl: "",
  openingAnimationUrlMobile: "",
  openingAnimationUrlDesktop: "",
};
export const useBranding = () => ({ ...DEFAULTS, ...(globalThis.__openingAdBranding ?? {}) });
`,
);

const SPLASH_STUB = path.join(OUT_DIR, "opening-splash-stub.js");
fs.writeFileSync(
  SPLASH_STUB,
  `export const OPENING_CLIP_DURATION_MS = 9600;
export const openingClipForWidth = () => "mobile";
export const openingClipSrcFor = () => "https://example.test/opening.mp4";
`,
);

const OUT = path.join(OUT_DIR, "OpeningAdControl.mjs");
execFileSync(
  path.join(ROOT, "node_modules/.bin/esbuild"),
  [
    "src/components/ad/OpeningAdControl.tsx",
    "--bundle",
    "--format=esm",
    "--jsx=automatic",
    "--target=es2022",
    "--external:react",
    "--external:react/jsx-runtime",
    "--external:react-dom",
    "--external:react-dom/client",
    `--alias:@/context/BrandingContext=${BRANDING_STUB}`,
    `--alias:@/utils/openingSplash=${SPLASH_STUB}`,
    `--outfile=${OUT}`,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
for (const key of [
  "window", "document", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent",
  "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "localStorage", "matchMedia",
]) {
  globalThis[key] = window[key];
}
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const controlModule = await import(OUT);
const OpeningAdControl = controlModule.default;
const { useOpeningAdPlayer, OPENING_AD_ITEM, OPENING_AD_ITEM_ID } = controlModule;
const setBranding = (overrides) => {
  globalThis.__openingAdBranding = overrides;
};

const tick = () => new Promise((r) => window.setTimeout(r, 20));
const waitUntil = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await tick();
  }
  return false;
};

let container = null;
let root = null;
const mount = async (element) => {
  if (root) await act(async () => root.unmount());
  container = window.document.createElement("div");
  window.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
};

const player = () => window.document.body.querySelector("[data-opening-ad-player]");
const label = () => container.querySelector("[data-opening-ad]");
const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
};
const pressEscape = async () => {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
};

after(() => {
  if (root) root.unmount();
  window.close();
});

test("the label opens the player on tap — and fetches nothing before that", async () => {
  await mount(React.createElement(OpeningAdControl));
  assert.ok(label(), "the faded `ad` label is rendered");
  assert.equal(label().textContent.trim(), "ad", "…and it is the owner's own word");
  // The ~5 MB clip must not be touched until the learner asks for it.
  assert.equal(window.document.querySelector("video"), null, "no <video> is mounted on boot");
  assert.equal(player(), null, "no player is mounted on boot");

  await click(label());
  assert.ok(await waitUntil(() => Boolean(player())), "the player opens on tap");
  const video = player().querySelector("video");
  assert.ok(video, "the player holds the clip");
  assert.equal(video.getAttribute("src"), "https://example.test/opening.mp4", "…resolved for this band");
  assert.equal(player().parentElement, window.document.body, "the player is portalled into <body>");
});

test("Escape and the Close button both release the player and its buffer", async () => {
  await pressEscape();
  assert.ok(await waitUntil(() => player() === null), "Escape closes it");
  assert.equal(window.document.querySelector("video"), null, "the <video> is unmounted with it");

  await click(label());
  assert.ok(await waitUntil(() => Boolean(player())));
  const close = [...player().querySelectorAll("button")].find((b) => /Close/.test(b.textContent));
  assert.ok(close, "the Close button exists");
  await click(close);
  assert.ok(await waitUntil(() => player() === null), "Close closes it");
});

test("the option is the same on every panel: one id, the owner's word, an icon", () => {
  assert.equal(OPENING_AD_ITEM_ID, "opening-ad");
  assert.equal(OPENING_AD_ITEM.label, "Ad", "the row says what the owner called it");
  assert.match(OPENING_AD_ITEM.ariaLabel, /opening animation/, "…and spells out what it does");
  assert.ok(OPENING_AD_ITEM.Icon, "the row carries an icon for the glass tiles");
});

test("`available` goes false when the animation is off or already playing at launch", async () => {
  const HookProbe = () => {
    const { available } = useOpeningAdPlayer();
    return React.createElement("span", { "data-available": String(available) });
  };

  // Default branding: the row exists.
  await mount(React.createElement(HookProbe));
  assert.equal(container.querySelector("[data-available]").dataset.available, "true");

  // The admin turned the launch playback on → a tap control would be redundant.
  setBranding({ openingPlayOnLaunch: true });
  await mount(React.createElement(HookProbe));
  assert.equal(container.querySelector("[data-available]").dataset.available, "false");

  // …and with the whole animation switched off, too.
  setBranding({ openingPlayOnLaunch: false, openingAnimationEnabled: false });
  await mount(React.createElement(HookProbe));
  assert.equal(container.querySelector("[data-available]").dataset.available, "false");

  // A disabled animation also means the label itself renders nothing at all.
  await mount(React.createElement(OpeningAdControl));
  assert.equal(label(), null, "no `ad` label while the animation is off");

  // Restore for any later run of this file.
  setBranding({});
});
