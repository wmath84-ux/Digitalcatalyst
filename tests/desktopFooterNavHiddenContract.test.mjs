// tests/desktopFooterNavHiddenContract.test.mjs
//
// Footer navigation (the floating bottom pill) must never appear on
// desktop as persistent chrome. The persistent left rail is the primary
// nav. A hover-to-reveal MAG dock (`[data-desktop-peek-dock]`) is allowed
// on shell screens only — it is not tagged as the site footer.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/index.css", "utf8");
const footer = fs.readFileSync("src/components/BottomNav.tsx", "utf8");
const cartFooter = fs.readFileSync("src/cartWishlist/components/BottomNav.tsx", "utf8");
const myDayFooter = fs.readFileSync("src/components/myday/BottomNav.tsx", "utf8");
const revisionFooter = fs.readFileSync("src/revision/components/BottomNav.tsx", "utf8");

test("every site footer nav is tagged so CSS can hide the whole bar", () => {
  for (const [label, source] of [
    ["main", footer],
    ["cart", cartFooter],
    ["myday", myDayFooter],
    ["revision", revisionFooter],
  ]) {
    assert.match(source, /data-site-footer-nav/, `${label} BottomNav must tag the wrapping nav`);
    assert.match(source, /data-site-footer/, `${label} BottomNav must keep data-site-footer on the pill`);
  }
});

test("desktop CSS actually hides the footer nav, not a non-matching selector", () => {
  const desktop = css.slice(css.indexOf("HARD RULE: Footer navigation never appears on desktop"));
  assert.match(desktop, /@media \(min-width: 960px\)/);
  assert.match(desktop, /\[data-site-footer-nav\]/);
  assert.match(desktop, /\[data-site-footer\]/);
  assert.match(desktop, /display: none !important/);
  assert.match(desktop, /\.dc-desktop-shell \[data-site-footer-nav\]/);
  assert.match(desktop, /body\.is-desktop \[data-site-footer-nav\]/);
});

test("tablet-as-desktop also hides the wrapping footer nav", () => {
  assert.match(css, /html\[data-tablet-landscape-desktop="true"\] \[data-site-footer-nav\]/);
});

test("desktop shell peeks the MAG dock from a thin bottom line, not the persistent footer", () => {
  const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
  const peek = fs.readFileSync("src/components/glass-dock/DesktopPeekDock.tsx", "utf8");
  assert.match(shell, /<DesktopPeekDock /);
  assert.match(peek, /data-desktop-peek-dock/);
  assert.match(peek, /data-desktop-peek-line/);
  assert.doesNotMatch(peek, /data-site-footer-nav/);
  assert.doesNotMatch(peek, /data-site-footer/);
  assert.match(css, /\[data-desktop-peek-line\]/);
  assert.match(css, /\[data-desktop-peek-dock\]\[data-open="true"\] \[data-desktop-peek-panel\]/);
});
