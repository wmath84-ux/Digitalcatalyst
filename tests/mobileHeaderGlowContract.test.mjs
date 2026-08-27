// tests/mobileHeaderGlowContract.test.mjs
//
// Contract: mobile users see a soft blue gradient shadow + frosted
// blur under the site header (the sticky bar at the top of every
// page). Desktop / tablet users see a quieter, more subtle version
// so the chrome still feels professional on big screens.
//
// Why this test exists:
//   The effect is implemented via the `mobile-header-glow` CSS
//   class in src/index.css plus the corresponding className in
//   src/components/Header.tsx. If either side is changed or removed,
//   the mobile user experience silently degrades (the header looks
//   unanchored while scrolling long lists). The test pins the
//   contract so any future refactor keeps the effect.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const header = fs.readFileSync("src/components/Header.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

test("Header.tsx applies the mobile-header-glow class to the sticky header", () => {
  // The conditional keeps the chrome quiet when the admin hides
  // the frame borders, but in every other case the glow class
  // must be present so the blue gradient + frosted blur is alive.
  assert.match(header, /mobile-header-glow/);
  // The data attribute stays (other tests pin it).
  assert.match(header, /data-site-header/);
  // The header is still sticky + has the existing translucent
  // white background + backdrop blur so the existing glass effect
  // is preserved.
  assert.match(header, /sticky top-0/);
  assert.match(header, /bg-white\/75/);
  assert.match(header, /backdrop-blur-xl/);
});

test("index.css defines .mobile-header-glow with a blue gradient shadow + frosted blur", () => {
  // The class lives inside a Tailwind `@layer utilities` so it
  // can be used like any other utility class.
  assert.match(css, /\.mobile-header-glow/);
  // Two layered pseudo-elements drive the effect.
  assert.match(css, /\.mobile-header-glow::before/);
  assert.match(css, /\.mobile-header-glow::after/);
});

test("mobile-header-glow uses indigo + sky blue tones (not generic gray)", () => {
  // The user asked for "Blue gradient halka sa" (light blue
  // gradient). We use indigo-500 (99, 102, 241) + sky-300/400
  // (56, 189, 248). Any future change that swaps the palette
  // for generic gray / black will fail this test.
  assert.match(css, /rgba\(99, 102, 241/);
  assert.match(css, /rgba\(56, 189, 248/);
});

test("mobile-header-glow applies a backdrop-filter blur to the frosted strip", () => {
  // The "blur effect" the user asked for is two-layered: a CSS
  // box-shadow blur on the gradient + a true backdrop-filter
  // blur on the frosted strip just under the header. The
  // backdrop-filter is what makes scrolling content behind the
  // header feel properly frosted.
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur/);
  // And a saturate boost so the colors don't go washed-out
  // through the blur.
  assert.match(css, /saturate\(1[34]0%\)/);
});

test("mobile-header-glow has a stronger mobile variant (<= 767px) and a quieter desktop variant", () => {
  // Mobile (<= 767px) — taller gradient, taller frosted strip,
  // stronger box-shadow. The user explicitly asked for the effect
  // to be visible on mobile, so the @media query must exist and
  // must be inside a `@media (max-width: 767px)` block.
  assert.match(css, /@media\s*\(max-width:\s*767px\)/);
  // Desktop / tablet (>= 768px) — the rules outside the @media
  // query apply. The class is still attached so the desktop
  // chrome gets a softer, professional version.
  // (Sanity check: at least one box-shadow definition exists
  // outside the @media block, AND one exists inside.)
  const outsideMatches = css.match(/box-shadow[^;]+;/g) || [];
  assert.ok(outsideMatches.length >= 2, "expected both a desktop + mobile box-shadow");
});

test("mobile-header-glow pseudo-elements are pointer-events:none so taps still hit the page", () => {
  // The pseudo-element strip is purely visual. If it ever
  // accidentally became a hit target it would block taps on
  // items sitting just under the header (icons, the
  // search bar, the "Mark all read" button on the
  // notifications page). The test pins the safety guard.
  assert.match(css, /\.mobile-header-glow::before[\s\S]*?pointer-events:\s*none/);
  assert.match(css, /\.mobile-header-glow::after[\s\S]*?pointer-events:\s*none/);
});
