// tests/landingDesktopFullBleedContract.test.mjs
//
// The landing page is a standalone marketing page, but DesktopAppHost used to
// wrap it in the desktop AppShell on desktop / tablet-landscape viewports.
// Result: the hero was squeezed into a small window-pane beside the workspace
// rail, page scroll could not reach Features/CTA (they live below the pane),
// the fixed header stretched edge-to-edge and the footer vanished — the whole
// page looked "faila hua / stretched" on every size except the smallest.
//
// Contract: the landing renders full-bleed at every shell-eligible size. The
// header and sections use fluid gutters, the hero fills both columns, and
// the footer shows on desktop again.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const header = fs.readFileSync("src/components/landing/Header.tsx", "utf8");
const footer = fs.readFileSync("src/components/landing/Footer.tsx", "utf8");
const hero = fs.readFileSync("src/components/landing/Hero.tsx", "utf8");
const features = fs.readFileSync("src/components/landing/Features.tsx", "utf8");
const cta = fs.readFileSync("src/components/landing/CtaBanner.tsx", "utf8");
const landingCss = fs.readFileSync("src/landing.css", "utf8");

test("DesktopAppHost passes the landing routes through without the app shell", () => {
  const host = main.slice(main.indexOf("function DesktopAppHost"), main.indexOf("function RootPage"));
  assert.match(host, /!hash\s*\|\|\s*hash\.startsWith\(LANDING_HASH\)/, "empty hash + #/landing skip the shell");
  assert.doesNotMatch(host, /isDesktopBrowserLocked/, "desktop is no longer locked to landing");
});

test("non-landing desktop routes still get the AppShell", () => {
  const host = main.slice(main.indexOf("function DesktopAppHost"), main.indexOf("function RootPage"));
  assert.match(host, /<AppShell[\s\S]*active=\{resolveActiveFromHash\(hash\)\}/);
});

test("landing header paint and content connect across the full viewport", () => {
  assert.match(header, /className="fixed inset-x-0 top-0 z-50 w-full"/);
  assert.match(header, /<GlassSurface\s+radius=\{0\}\s+className="w-full border-b/);
  assert.match(header, /contentClassName="landing-container flex items-center justify-between/);
  assert.doesNotMatch(header, /rounded-b-2xl|max-w-7xl/);
});

test("landing footer renders on desktop too (privacy / terms links)", () => {
  assert.doesNotMatch(footer, /lg:hidden/);
});

test("landing uses fluid gutters and fills unused desktop space", () => {
  assert.match(landingCss, /\.landing-container\s*\{[\s\S]*padding-inline: clamp\(1rem, 3vw, 3\.5rem\)/);
  for (const section of [header, hero, features, cta, footer]) {
    assert.match(section, /landing-container/);
    assert.doesNotMatch(section, /max-w-(?:6xl|7xl)/);
  }
  assert.match(hero, /lg:grid-cols-2/);
  assert.match(hero, /All your learning, in one place/);
  assert.match(features, /lg:grid-cols-6/);
  assert.match(features, /lg:col-span-3/);
});

test("smallest viewport design stays untouched (hero fills the screen, same tokens)", () => {
  assert.match(hero, /min-h-screen/);
  assert.match(hero, /max-w-3xl/);
  assert.match(header, /sm:hidden/);
});

test("landing uses the shared background controller, not a private 3D canvas", () => {
  assert.equal(hero.includes("HeroScene"), false);
  assert.equal(hero.includes("@react-three"), false);
  assert.equal(hero.includes("absolute inset-0 bg-gradient-to-b"), false);
  assert.equal(fs.existsSync("src/components/landing/HeroScene.tsx"), false, "the old three.js landing scene must be deleted");
  assert.equal(main.includes("function RouteBackdrop"), true);
  assert.equal(main.includes("<GlassBackdrop />"), true);
  const host = main.slice(main.indexOf("function DesktopAppHost"), main.indexOf("function RootPage"));
  assert.equal(host.includes("hash.startsWith(LANDING_HASH)"), true, "landing still skips the shell so the shared backdrop is full-bleed");
});
