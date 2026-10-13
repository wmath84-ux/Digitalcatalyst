import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync("src/components/store-marketplace.css", "utf8");
const storePage = fs.readFileSync("src/components/StorePage.tsx", "utf8");

test("desktop Store Grid matches Home Trending's vertical marketplace-card layout", () => {
  const parityStart = css.lastIndexOf("Desktop Store/Home card parity");
  assert.notEqual(parityStart, -1, "desktop parity rule must be present");
  const parity = css.slice(parityStart);
  assert.match(parity, /@media \(min-width: 1024px\)/);
  assert.match(parity, /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 290px\), 1fr\)\)/);
  assert.match(parity, /gap: 16px/);
  assert.match(parity, /aspect-ratio: 16 \/ 9/);
  assert.match(parity, /flex-direction: column/);
  assert.match(parity, /font-size: 18px/);
  assert.match(parity, /min-height: 46px/);
  assert.match(storePage, /data-store-grid=\{viewMode === "grid" \? "" : undefined\}/);
});

test("desktop parity is scoped to Store Grid so mobile and explicit List/Mixed views keep their own layouts", () => {
  const parity = css.slice(css.lastIndexOf("Desktop Store/Home card parity"));
  assert.match(parity, /\.dc-desktop-shell \[data-store-marketplace\] \[data-store-grid\]/);
  assert.doesNotMatch(parity, /\.dc-marketplace-list/);
  assert.doesNotMatch(parity, /\.dc-marketplace-grid\.is-mixed/);
});
