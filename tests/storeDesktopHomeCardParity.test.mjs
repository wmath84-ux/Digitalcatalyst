import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = path => fs.readFileSync(path, "utf8");
const shared = read("src/components/marketplace-card-shared.css");
test("Home and Store use the same card component, variant and shared CSS", () => {
  for (const file of ["src/home/App.tsx", "src/components/StorePage.tsx"]) {
    assert.match(read(file), /<StoreProductCard/);
    assert.match(read(file), /marketplace-card-shared.css/);
  }
  assert.match(shared, /data-home-grid/);
  assert.match(shared, /data-store-grid/);
  assert.match(shared, /data-store-mixed/);
  assert.match(shared, /aspect-ratio: 16 \/ 9/);
  assert.match(shared, /repeat\(auto-fill, minmax\(min\(100%, 290px\), 1fr\)\)/);
});
test("Store has no desktop-only card redesign to drift from Home or native WebView", () => {
  assert.doesNotMatch(read("src/components/store-marketplace.css"), /\.dc-desktop-shell \[data-store-marketplace\] \[data-store-grid\] > \.dc-marketplace-card/);
  assert.doesNotMatch(shared, /Capacitor|isNativePlatform/);
});
