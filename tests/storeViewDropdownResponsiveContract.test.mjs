// tests/storeViewDropdownResponsiveContract.test.mjs
//
// Contract for the reported store-page bug: the view-mode popover
// (Grid / Cards / Mixed) opened by the layout-toggle button rendered as a
// thin, crushed sliver on tablets.
//
// Why it happened: the popover is anchored to the 36 px layout-toggle
// button (`absolute right-4 top-1/2`, shrink-to-fit), so its containing
// block is that tiny box. An absolutely-positioned child with `right: 0`
// and auto width is capped by its containing block, and the three
// `flex: 1 1 0%` option buttons were squeezed into ~5 px slivers — an
// unusable "thin line" on every screen size.
//
// The contract: the popover sizes itself from its own content
// (`width: max-content`, also spelled out as an unlayered CSS rule) and
// the option buttons keep their fixed 36 px tap-target size
// (`flex: 0 0 auto`), so the three options always render side-by-side,
// fully visible and selectable, on every tablet width and desktop
// viewport.
//
// Pure code-shape — no React, no DOM, no browser.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const storePage = fs.readFileSync("src/components/StorePage.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("the view-mode popover opts out of the 36px anchor's width cap", () => {
  // The popover carries a data attribute and an explicit max-content width
  // (Tailwind `w-max`), so the containing block can never crush it.
  assert.match(
    storePage,
    /data-store-view-options\s*\n\s*className="[^"]*\bw-max\b/,
    "the popover must declare width: max-content (w-max)",
  );
});

test("the three option buttons keep their fixed tap-target size", () => {
  // `flex-none` (flex: 0 0 auto) pins each button to h-9 w-9 regardless of
  // how wide the popover's containing block is.
  assert.match(
    storePage,
    /className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl transition/,
    "each option button must be flex-none with a fixed 36px box",
  );
  // The popover is a horizontal row — options must never stack.
  assert.match(storePage, /flex w-max gap-1 rounded-2xl/);
});

test("the unlayered CSS rule pins the same guarantees", () => {
  const optionsRule = /\[data-store-view-options\]\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(optionsRule, "expected a [data-store-view-options] rule in index.css");
  assert.match(optionsRule, /width:\s*max-content/);
  assert.match(optionsRule, /min-width:\s*max-content/);

  const buttonRule = /\[data-store-view-options\]\s*>\s*button\s*\{([^}]*)\}/.exec(css)?.[1];
  assert.ok(buttonRule, "expected a [data-store-view-options] > button rule in index.css");
  assert.match(buttonRule, /flex:\s*0\s*0\s*auto/);
});

test("the popover still opens below the toggle, right-aligned to it", () => {
  // The anchor geometry is untouched — the popover drops below the button
  // (top-full) and stays right-aligned (right-0), just at its natural size.
  assert.match(storePage, /className="absolute right-0 top-full z-30 mt-1\.5 flex w-max gap-1 rounded-2xl/);
});
