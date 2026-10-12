import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const store = read("src/components/StorePage.tsx");
const palette = read("src/components/GlassCommandPalette.tsx");
const command = read("src/components/ui/glass-command.tsx");
const bridge = read("src/lib/commandPalette.ts");
const card = read("src/components/StoreProductCard.tsx");
const storeCss = read("src/components/store-marketplace.css");
const purchasesCss = read("src/components/purchases-minimal.css");

test("Store search opens Home's shared command overlay in product-only mode", () => {
  assert.match(store, /data-store-search-trigger/);
  assert.match(store, /onClick=\{\(\) => openCommandPalette\(\{ scope: "products" \}\)\}/);
  assert.match(bridge, /type CommandPaletteScope = "all" \| "products"/);
  assert.match(bridge, /new CustomEvent<CommandPaletteRequest>\(COMMAND_PALETTE_OPEN_EVENT, \{ detail: request \}\)/);
  assert.match(palette, /request\?\.scope === "products" \? "products" : "all"/);
  assert.match(palette, /dc-command-product-image/);
  assert.match(palette, /dc-command-product-title/);
  assert.match(palette, /dc-command-product-pricing/);
  assert.match(palette, /product\.instructor/);
  assert.match(command, /aria-label=\{inputLabel\}/);
  assert.match(command, /role="dialog"/);
  assert.match(command, /event\.key !== "Tab"/);
});

test("Store list rows reuse My Purchases geometry without removing Store actions", () => {
  assert.match(card, /is-list dc-purchases-row/);
  assert.match(card, /dc-purchases-image-fallback/);
  assert.match(card, /data-store-final-price/);
  assert.match(card, /dc-marketplace-list-actions/);
  assert.match(card, /renderPurchaseAction/);
  assert.match(card, /renderSaveButton/);
  assert.match(storeCss, /\.dc-marketplace-card\.is-list\.dc-purchases-row[\s\S]*?min-height: 6\.5rem/);
  assert.match(storeCss, /\.dc-marketplace-card\.is-list \.dc-marketplace-cover[\s\S]*?width: 5rem;[\s\S]*?height: 4rem/);
  assert.match(storeCss, /\.dc-marketplace-card\.is-list \.dc-marketplace-cover img\s*\{\s*object-fit: contain/);
  assert.match(purchasesCss, /\.dc-purchases-row > button\s*\{[\s\S]*?min-height: 6\.5rem/);
  assert.match(purchasesCss, /width: 5rem; height: 4rem/);
  assert.match(store, /viewMode === "mixed" && index % 3 !== 0[\s\S]*?card\(product, true\)/);
  assert.match(store, /return card\(product, false, true\)/);
  assert.match(card, /data-store-card-variant=\{list \? "list" : large \? "large" : "grid"\}/);
});
