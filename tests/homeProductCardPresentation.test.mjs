import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

// Execute the real card render logic without a browser. Only the visual glass
// wrapper is replaced; this test needs neither Firebase nor a Chromium binary.
const require = createRequire(import.meta.url);
const cardModule = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync("src/home/components/ProductCard.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("require", "module", "exports", compiled)((name) => {
  if (name === "../../components/ui/GlassCard") return { GlassCard: ({ children }) => React.createElement("div", null, children) };
  return require(name);
}, cardModule, cardModule.exports);
const ProductCard = cardModule.exports.default;
const baseProduct = {
  id: "test", title: "Mathematics", type: "video", category: "video",
  author: "Ananya", classLevel: "Class 12", subject: "Algebra", image: "/course.png",
  price: 1299, mrp: 2499, rating: 4.8, ratingCount: 1240,
};
const render = (overrides = {}, isFavorite = false) => new JSDOM(renderToStaticMarkup(
  React.createElement(ProductCard, { product: { ...baseProduct, ...overrides }, isFavorite, onToggleFavorite() {}, onOpen() {} }),
)).window.document;

test("paid cards render actual price, discount price, product details and review count", () => {
  const card = render({ price: 123456, mrp: 199999 });
  assert.equal(card.querySelector(".dc-home-product-current-price").textContent, "₹1,23,456");
  assert.equal(card.querySelector(".dc-home-product-price del").textContent, "₹1,99,999");
  assert.equal(card.querySelector(".dc-home-product-title").textContent, "Mathematics");
  assert.equal(card.querySelector(".dc-home-product-details").textContent, "Class 12 · Algebra");
  assert.equal(card.querySelector(".dc-home-product-rating-count").textContent, "(1,240)");
});

test("free products show their real original price followed by numeric ₹0", () => {
  for (const overrides of [{ price: 0 }, { price: 0, isFree: false }, { isFree: true }]) {
    const card = render(overrides);
    assert.equal(card.querySelector(".dc-home-product-current-price").textContent, "₹0");
    assert.equal(card.querySelector(".dc-home-product-price del").textContent, "₹2,499");
    assert.equal(card.querySelector(".dc-home-product-price").firstElementChild.tagName, "DEL");
  }
});

test("invalid prices are not fabricated and invalid/undiscounted MRP is not shown", () => {
  for (const price of [Number.NaN, Infinity, -1, undefined]) {
    const card = render({ price });
    assert.equal(card.querySelector(".dc-home-product-price"), null);
  }
  for (const mrp of [Number.NaN, Infinity, 0, 1299, 999]) {
    const card = render({ mrp });
    assert.equal(card.querySelector(".dc-home-product-price del"), null);
    assert.equal(card.querySelector(".dc-home-product-current-price").textContent, "₹1,299");
  }
});

test("only real rating evidence is shown; product and favorite buttons remain accessible", () => {
  for (const overrides of [{ rating: 0 }, { rating: Number.NaN }, { ratingCount: 0 }]) {
    assert.equal(render(overrides).querySelector(".dc-home-product-rating"), null);
  }
  const card = render({}, true);
  assert.equal(card.querySelector(".dc-home-product-open").getAttribute("aria-label"), "View Mathematics");
  assert.equal(card.querySelector(".dc-home-product-favorite").getAttribute("aria-label"), "Remove Mathematics from favorites");
  assert.equal(card.querySelector(".dc-home-product-favorite").getAttribute("aria-pressed"), "true");
});


test("free products without a valid original price never get a fabricated strike-through", () => {
  for (const mrp of [undefined, Number.NaN, Infinity, -1, 0]) {
    const card = render({ price: 0, mrp });
    assert.equal(card.querySelector(".dc-home-product-current-price").textContent, "₹0");
    assert.equal(card.querySelector(".dc-home-product-price del"), null);
  }
  assert.equal(render({ price: 0, mrp: 399 }).querySelector(".dc-home-product-price del").textContent, "₹399");
});


test("original and final prices retain real paise values rather than rounding the catalog amount", () => {
  const free = render({ price: 0, mrp: 399.95 });
  assert.equal(free.querySelector(".dc-home-product-price del").textContent, "₹399.95");
  assert.equal(free.querySelector(".dc-home-product-current-price").textContent, "₹0");
  const paid = render({ price: 1299.95, mrp: 2499.95 });
  assert.equal(paid.querySelector(".dc-home-product-current-price").textContent, "₹1,299.95");
  assert.equal(paid.querySelector(".dc-home-product-price del").textContent, "₹2,499.95");
});
