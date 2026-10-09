import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";
const require = createRequire(import.meta.url),
  module = { exports: {} };
const compiled = ts.transpileModule(
  fs.readFileSync("src/components/StoreProductCard.tsx", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText;
new Function("require", "module", "exports", compiled)(
  require,
  module,
  module.exports
);
const Card = module.exports.default;
const base = {
  id: "test",
  title: "Physics course",
  image: "",
  category: "Course",
  classLevel: "12",
  subject: "Physics",
  instructor: "Meera Rao",
  price: 1299.95,
  originalPrice: 2499.95,
  rating: 4.8,
  reviews: 12,
};
const render = (overrides = {}, state = {}) =>
  new JSDOM(
    renderToStaticMarkup(
      React.createElement(Card, {
        product: { ...base, ...overrides },
        wishlisted: false,
        inCart: false,
        purchased: false,
        onView() {},
        onAddToCart() {},
        onToggleWishlist() {},
        ...state,
      })
    )
  ).window.document;
test("Native Store shows exact genuine MRP, payable rupees, reductions and meaningful metadata", () => {
  const doc = render();
  assert.equal(doc.querySelector("del").textContent, "₹2,499.95");
  assert.equal(
    doc.querySelector("[data-store-final-price]").textContent,
    "₹1,299.95"
  );
  assert.equal(
    doc.querySelector(".dc-marketplace-saving").textContent,
    "Save ₹1,200"
  );
  assert.equal(doc.querySelector("h3").textContent, "Physics course");
  assert.equal(
    doc.querySelector(".dc-marketplace-details").textContent,
    "12 · Physics"
  );
  assert.equal(
    doc.querySelector(".dc-marketplace-instructor").textContent,
    "Meera Rao"
  );
});
test("Every genuinely free Store card shows numeric zero, with an actual MRP only when present", () => {
  for (const product of [
    { price: 0 },
    { price: 0, isFree: false },
    { isFree: true },
  ]) {
    const doc = render(product);
    assert.equal(
      doc.querySelector("[data-store-final-price]").textContent,
      "₹0"
    );
    assert.equal(doc.querySelector("del").textContent, "₹2,499.95");
    assert.equal(
      doc.querySelector(".dc-marketplace-buy").textContent,
      "Get access"
    );
  }
  for (const originalPrice of [undefined, 0, -1, NaN, Infinity]) {
    const doc = render({ price: 0, originalPrice });
    assert.equal(doc.querySelector("del"), null);
    assert.equal(
      doc.querySelector("[data-store-final-price]").textContent,
      "₹0"
    );
  }
});
test("Unknown, negative and non-finite prices never become a fabricated payable amount", () => {
  for (const price of [undefined, -1, NaN, Infinity]) {
    const doc = render({ price });
    assert.equal(doc.querySelector("[data-store-final-price]"), null);
    assert.equal(doc.querySelector("del"), null);
    assert.equal(doc.querySelector(".dc-marketplace-buy").disabled, true);
    assert.match(doc.body.textContent, /Price unavailable/);
  }
});
test("Undiscounted or invalid originals never masquerade as a sale", () => {
  for (const originalPrice of [0, 100, 1299.95, NaN, Infinity]) {
    const doc = render({ originalPrice });
    assert.equal(doc.querySelector("del"), null);
    assert.equal(doc.querySelector(".dc-marketplace-saving"), null);
  }
});
test("Reviews require evidence; generated catalog defaults do not claim lifetime access or an instructor", () => {
  for (const extra of [
    { rating: 0 },
    { rating: NaN },
    { reviews: 0 },
    { reviews: Infinity },
  ])
    assert.equal(render(extra).querySelector(".dc-marketplace-rating"), null);
  const doc = render({
    classLevel: "Lifetime access",
    subject: "Digital learning",
    instructor: "Digital Catalyst",
  });
  assert.equal(doc.querySelector(".dc-marketplace-details"), null);
  assert.equal(doc.querySelector(".dc-marketplace-instructor"), null);
});
test("Owned, already-in-cart and unavailable items retain navigation/favorites without another purchase CTA", () => {
  for (const [product, state, label] of [
    [{}, { purchased: true }, "Purchased"],
    [{}, { inCart: true }, "In cart"],
    [{ availableForSale: false }, {}, "Not for sale"],
  ]) {
    const doc = render(product, state);
    assert.equal(
      doc.querySelector(".dc-marketplace-purchase-state").textContent,
      label
    );
    assert.equal(doc.querySelector(".dc-marketplace-buy"), null);
    assert.equal(
      doc.querySelector(".dc-marketplace-open").getAttribute("aria-label"),
      "View Physics course"
    );
    assert.equal(
      doc.querySelector(".dc-marketplace-save").getAttribute("aria-pressed"),
      "false"
    );
  }
});
test("Image fallback and favorites keep an honest identity and accessible action names", () => {
  const doc = render({}, { wishlisted: true });
  assert.equal(
    doc.querySelector(".dc-marketplace-cover-fallback").textContent,
    "P"
  );
  assert.equal(
    doc.querySelector(".dc-marketplace-save").getAttribute("aria-label"),
    "Remove Physics course from favorites"
  );
  assert.equal(
    doc.querySelector(".dc-marketplace-save").getAttribute("aria-pressed"),
    "true"
  );
});
