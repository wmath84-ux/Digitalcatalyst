// tests/desktopFooterNavHiddenContract.test.mjs
//
// Footer navigation (the floating bottom pill) must never appear on
// desktop. The persistent left rail is the primary nav. The previous
// hide rule targeted `[data-site-footer].dc-footer-shell`, but those
// attributes live on DIFFERENT elements, so the pill stayed visible.

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
