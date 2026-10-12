import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const app = read("src/CartWishlistApp.tsx");
const cart = read("src/cartWishlist/pages/CartPage.tsx");
const cartCss = read("src/cartWishlist/pages/cart-page.css");
const light = read("src/light-theme-pages.css");

test("Cart shell reserves measured footer space only for the mobile Cart tab", () => {
  assert.match(app, /data-cart-wishlist-content/);
  assert.match(app, /data-active-tab=\{activeTab\}/);
  assert.match(cartCss, /\[data-cart-wishlist-content\]\[data-active-tab="cart"\]/);
  assert.match(cartCss, /padding-bottom:\s*max\([\s\S]*?var\(--dc-footer-nav-h, 0px\)[\s\S]*?--dc-system-navigation-inset/);
  assert.match(cartCss, /@media \(max-width: 959px\)/);
});

test("desktop Cart exposes a product column, sticky order summary, and a dedicated checkout action", () => {
  assert.match(cart, /data-cart-items/);
  assert.match(cart, /data-cart-summary/);
  assert.match(cart, /data-cart-checkout-desktop/);
  assert.match(cart, /data-cart-checkout-bar/);
  assert.match(cartCss, /grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(260px, 0\.8fr\)/);
  assert.match(cartCss, /position:\s*sticky/);
  assert.match(cartCss, /\[data-cart-checkout-bar\]\s*\{\s*display:\s*none/);
});

test("light mode uses readable tertiary ink for the last Cart copy and muted totals", () => {
  assert.match(cart, /data-cart-price-note/);
  assert.match(light, /html\[data-theme="light"\][\s\S]*?\[data-cart-price-note\][\s\S]*?color:\s*var\(--dc-ink-3\) !important/);
});
