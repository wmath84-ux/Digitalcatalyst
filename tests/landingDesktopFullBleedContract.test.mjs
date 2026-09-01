// tests/landingDesktopFullBleedContract.test.mjs
//
// The landing page is a standalone marketing page, but DesktopAppHost used to
// wrap it in the desktop AppShell on desktop / tablet-landscape viewports.
// Result: the hero was squeezed into a small window-pane beside the workspace
// rail, page scroll could not reach Features/CTA (they live below the pane),
// the fixed header stretched edge-to-edge and the footer vanished — the whole
// page looked "faila hua / stretched" on every size except the smallest.
//
// Contract: the landing renders full-bleed at every shell-eligible size, its
// header content rides the shared content column, and the footer shows on
// desktop again.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const header = fs.readFileSync("src/components/landing/Header.tsx", "utf8");
const footer = fs.readFileSync("src/components/landing/Footer.tsx", "utf8");
const hero = fs.readFileSync("src/components/landing/Hero.tsx", "utf8");
const features = fs.readFileSync("src/components/landing/Features.tsx", "utf8");
const cta = fs.readFileSync("src/components/landing/CtaBanner.tsx", "utf8");

test("DesktopAppHost passes the landing routes through without the app shell", () => {
  const host = main.slice(main.indexOf("function DesktopAppHost"), main.indexOf("function RootPage"));
  assert.match(host, /!hash\s*\|\|\s*hash\.startsWith\(LANDING_HASH\)/, "empty hash + #/landing skip the shell");
  assert.doesNotMatch(host, /isDesktopBrowserLocked/, "desktop is no longer locked to landing");
});

test("non-landing desktop routes still get the AppShell", () => {
  const host = main.slice(main.indexOf("function DesktopAppHost"), main.indexOf("function RootPage"));
  assert.match(host, /<AppShell active=\{resolveActiveFromHash\(hash\)\}>/);
});

test("landing header content is centred on the shared content column, not stretched edge-to-edge", () => {
  assert.match(header, /glass-panel w-full rounded-b-2xl/, "glass strip keeps its full-bleed background");
  assert.match(header, /mx-auto flex w-full max-w-7xl items-center justify-between/, "inner content capped at the content width");
});

test("landing footer renders on desktop too (privacy / terms links)", () => {
  assert.doesNotMatch(footer, /lg:hidden/);
});

test("landing sections keep their content-width containers (no wide-screen stretch)", () => {
  assert.match(hero, /max-w-7xl/);
  assert.match(features, /max-w-7xl/);
  assert.match(cta, /max-w-6xl/);
  assert.match(footer, /max-w-7xl/);
});

test("smallest viewport design stays untouched (hero fills the screen, same tokens)", () => {
  assert.match(hero, /min-h-screen/);
  assert.match(hero, /max-w-3xl/);
  assert.match(header, /sm:hidden/);
});
