import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const storeCard = read("src/components/StoreProductCard.tsx");
const storePage = read("src/components/StorePage.tsx");
const storeCss = read("src/components/store-marketplace.css");
const lightCss = read("src/light-theme-pages.css");
const paletteCss = read("src/components/GlassCommandPalette.css");
const glassCss = read("src/glass.css");
const pdp = read("src/PdpApp.tsx");

test("Store artwork has no product badges, rating or favorite control layered over it", () => {
  const cover = /const renderCover = \(\) => \(([\s\S]*?)\n  \);/.exec(storeCard)?.[1];
  assert.ok(cover, "expected a standalone image-only cover renderer");
  assert.match(cover, /className="dc-marketplace-cover"/);
  assert.match(cover, /<img/);
  assert.doesNotMatch(cover, /dc-marketplace-status|discount|Heart|Star|button|absolute/);
  assert.match(storeCard, /<div className="dc-marketplace-card-actions"/);
  assert.match(storeCard, /className="dc-marketplace-status"/);
});

test("Mixed list cards keep the same paper surface and ink on idle, hover and focus", () => {
  assert.match(
    lightCss,
    /html\[data-theme="light"\] \[data-store-marketplace\] \.dc-marketplace-card\.is-list\.dc-purchases-row,[\s\S]*?\.dc-marketplace-card\.is-list\.dc-purchases-row:hover,[\s\S]*?\.dc-marketplace-card\.is-list\.dc-purchases-row:focus-within[\s\S]*?background: var\(--dc-bg-secondary\)/,
  );
  assert.match(
    lightCss,
    /html\[data-theme="light"\] \[data-store-marketplace\] \.dc-marketplace-card\.is-list \.dc-marketplace-copy h3\s*\{\s*color: var\(--dc-ink\)/,
  );
  assert.match(storeCss, /\.dc-marketplace-card\.is-list\.dc-purchases-row\s*\{[\s\S]*?background: linear-gradient/);
  assert.match(lightCss, /html\[data-theme="light"\] \[data-store-marketplace\] \.dc-marketplace-card\.is-large,[\s\S]*?background: var\(--dc-bg-secondary\)/);
  assert.match(lightCss, /html\[data-theme="light"\] \[data-store-marketplace\] \.dc-marketplace-card\.is-large \.dc-marketplace-cover\s*\{[\s\S]*?background: var\(--dc-bg-muted-2\)/);
});

test("Store search results use readable, theme-aware panel and product row surfaces", () => {
  assert.match(paletteCss, /\.dc-product-search-palette-panel\s*\{[\s\S]*?background: rgba\(9, 14, 24, 0\.94\)/);
  assert.match(paletteCss, /\.dc-command-product-row\s*\{[\s\S]*?background: rgba\(15, 23, 42, 0\.24\)/);
  assert.match(paletteCss, /html\[data-theme="light"\] \.dc-product-search-palette-panel \.dc-command-product-row\s*\{[\s\S]*?background: #f7f9fb/);
  assert.match(paletteCss, /html\[data-theme="light"\] \.dc-command-product-meta\s*\{[\s\S]*?color:/);
  assert.match(paletteCss, /html\[data-theme="light"\] \.dc-command-product-title\s*\{[\s\S]*?color:/);
  assert.match(paletteCss, /html\[data-theme="light"\] \.dc-command-product-instructor\s*\{[\s\S]*?color:/);
  assert.match(paletteCss, /html\[data-theme="light"\] \.dc-command-product-pricing\s*\{[\s\S]*?color:/);
  assert.match(paletteCss, /#dc-command-palette input\[type="search"\][\s\S]*?color: #191c1e/);
});

test("Store sort/view popovers and PDP sharing share one gentle glass blur", () => {
  assert.match(glassCss, /backdrop-filter: blur\(5px\) saturate\(1\.2\)/);
  assert.match(glassCss, /-webkit-backdrop-filter: blur\(5px\) saturate\(1\.2\)/);
  assert.match(pdp, /className="dc-compact-glass-window dc-pdp-share-menu"/);
  assert.match(storePage, /className=\{`dc-compact-glass-window/);
});
