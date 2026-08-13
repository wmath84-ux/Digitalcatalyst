import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const catalog = fs.readFileSync("src/context/CatalogContext.tsx", "utf8");

test("product detail reuses the exact store header and bottom navigation components", () => {
  assert.match(pdp, /import Header from "\.\/components\/Header"/);
  assert.match(pdp, /import BottomNav/);
  assert.match(pdp, /<Header/);
  assert.match(pdp, /<BottomNav/);
  assert.match(pdp, /active="store"/);
});

test("premium PDP uses live products rather than imported showcase product data", () => {
  assert.doesNotMatch(pdp, /import\s+\{?\s*product\s*\}?\s+from/);
  assert.match(pdp, /product\.title/);
  assert.match(pdp, /product\.canonicalModules/);
  assert.match(pdp, /product\.paidUpdates/);
  assert.match(pdp, /product\.images/);
});

test("related products are deterministic live-catalog matches", () => {
  assert.match(pdp, /getRelatedProducts/);
  assert.match(pdp, /candidate\.id !== product\.id/);
  assert.match(pdp, /candidate\.subject\.toLowerCase\(\) === product\.subject\.toLowerCase\(\)/);
  assert.match(pdp, /candidate\.category === product\.category/);
  assert.match(main, /products=\{products\}/);
  assert.doesNotMatch(pdp, /Math\.random/);
});

test("all premium PDP commerce controls are wired to app handlers", () => {
  assert.match(pdp, /onAddToCart\?\.\(product\.id\)/);
  assert.match(pdp, /onToggleFavorite\?\.\(product\.id\)/);
  assert.match(pdp, /onCheckoutSelection\(selection, summary\.effectiveSubtotal\)/);
  assert.match(main, /onCheckoutSelection=\{navigatePdpSelectionToCheckout\}/);
  assert.match(main, /startCheckout\(\{/);
});

test("catalog maps the complete configured image list for the live PDP gallery", () => {
  assert.match(catalog, /configuredImages/);
  assert.match(catalog, /images: configuredImages\.length > 0/);
});
