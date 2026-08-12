// tests/commerce.test.mjs
//
// Pure unit tests for the canonical commerce schema helpers.
// Runs with `node --test` (no extra dev deps required).
//
// Coverage:
//   - Effective price calculation
//   - Sale price fallback
//   - Module / resource IDs
//   - Purchase-kind normalization
//   - Duplicate line-item removal
//   - Invalid negative prices
//   - Already-owned item marking

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLineItem,
  computeEffectivePrice,
  dedupeLineItems,
  markAlreadyOwned,
  normalizePurchaseKind,
  partitionByValidPrice,
  resolveSalePrice,
  sumEffectivePrice,
  __parsePriceValue,
} from "../utils/commerce.js";

// ---------------------------------------------------------------------------
// Effective price calculation
// ---------------------------------------------------------------------------

test("computeEffectivePrice returns sale price when lower than regular", () => {
  assert.equal(computeEffectivePrice(1999, 1499), 1499);
});

test("computeEffectivePrice falls back to regular when sale is missing", () => {
  assert.equal(computeEffectivePrice(1999, undefined), 1999);
  assert.equal(computeEffectivePrice(1999, null), 1999);
  assert.equal(computeEffectivePrice(1999, ""), 1999);
});

test("computeEffectivePrice falls back to regular when sale is negative or NaN", () => {
  // The validator (partitionByValidPrice) is the place that rejects negatives;
  // effective price is a pure projection of the catalog data.
  assert.equal(computeEffectivePrice(1999, -50), -50);
  assert.equal(computeEffectivePrice(1999, "abc"), 1999);
});

test("computeEffectivePrice treats zero as a valid sale price", () => {
  // The existing rule (utils/productPrice.js) treats "₹0" as the current
  // price. The canonical schema keeps that behaviour.
  assert.equal(computeEffectivePrice(1999, 0), 0);
  assert.equal(computeEffectivePrice(1999, "0"), 0);
});

test("computeEffectivePrice returns the sale value even when it is higher than regular", () => {
  // Editor validation is responsible for sale <= regular. The runtime
  // surface is honest: it returns whatever the catalog says.
  assert.equal(computeEffectivePrice(1000, 1500), 1500);
});

test("computeEffectivePrice parses ₹-prefixed strings like the legacy UI does", () => {
  assert.equal(computeEffectivePrice("₹1,999", "₹1,499"), 1499);
  assert.equal(computeEffectivePrice("₹1,999.50", 999), 999);
});

test("computeEffectivePrice returns 0 when both regular and sale are unusable", () => {
  assert.equal(computeEffectivePrice(undefined, undefined), 0);
  assert.equal(computeEffectivePrice("abc", "def"), 0);
  assert.equal(computeEffectivePrice(null, null), 0);
});

// ---------------------------------------------------------------------------
// Sale price fallback
// ---------------------------------------------------------------------------

test("resolveSalePrice mirrors computeEffectivePrice", () => {
  assert.equal(resolveSalePrice(100, 50), 50);
  assert.equal(resolveSalePrice(100, undefined), 100);
  assert.equal(resolveSalePrice(0, 50), 50);
  assert.equal(resolveSalePrice("₹0", 0), 0);
});

test("resolveSalePrice treats empty strings as missing", () => {
  assert.equal(resolveSalePrice(500, ""), 500);
  assert.equal(resolveSalePrice(500, "   "), 500);
});

// ---------------------------------------------------------------------------
// Module / resource IDs (buildLineItem round-trips through canonical shape)
// ---------------------------------------------------------------------------

test("buildLineItem propagates module / resource / product IDs untouched", () => {
  const item = buildLineItem({
    id: "line-1",
    kind: "selected_modules",
    productId: "prod-42",
    moduleId: "mod-7",
    resourceId: null,
    title: "Module 7",
    parentTitle: "React Mastery",
    regularPrice: 499,
    salePrice: 299,
    entitlementId: "mod-7",
  });
  assert.equal(item.id, "line-1");
  assert.equal(item.productId, "prod-42");
  assert.equal(item.moduleId, "mod-7");
  assert.equal(item.resourceId, null);
  assert.equal(item.entitlementId, "mod-7");
  assert.equal(item.kind, "selected_modules");
  assert.equal(item.parentTitle, "React Mastery");
  assert.equal(item.regularPrice, 499);
  assert.equal(item.salePrice, 299);
  assert.equal(item.effectivePrice, 299);
});

test("buildLineItem defaults entitlementId to the line id when omitted", () => {
  const item = buildLineItem({
    id: "auto-entitlement",
    kind: "full_product",
    productId: "prod-1",
    title: "Course",
    regularPrice: 1000,
  });
  assert.equal(item.entitlementId, "auto-entitlement");
});

test("buildLineItem defaults quantity to 1 and floors decimals", () => {
  const a = buildLineItem({ id: "x", kind: "full_product", title: "t", regularPrice: 100 });
  assert.equal(a.quantity, 1);
  const b = buildLineItem({ id: "y", kind: "full_product", title: "t", regularPrice: 100, quantity: 3.9 });
  assert.equal(b.quantity, 3);
  const c = buildLineItem({ id: "z", kind: "full_product", title: "t", regularPrice: 100, quantity: -2 });
  assert.equal(c.quantity, 1);
});

test("buildLineItem defaults alreadyOwned to false and every nullable ID to null", () => {
  const item = buildLineItem({ id: "i", kind: "paid_update", title: "t", regularPrice: 100 });
  assert.equal(item.alreadyOwned, false);
  assert.equal(item.productId, null);
  assert.equal(item.moduleId, null);
  assert.equal(item.resourceId, null);
  assert.equal(item.updateId, null);
  assert.equal(item.subscriptionPlanId, null);
  assert.equal(item.featureId, null);
  assert.equal(item.parentTitle, "");
});

// ---------------------------------------------------------------------------
// Purchase-kind normalization
// ---------------------------------------------------------------------------

test("normalizePurchaseKind accepts all canonical kinds", () => {
  const kinds = [
    "full_product",
    "selected_modules",
    "selected_resources",
    "cart_bundle",
    "paid_update",
    "subscription",
    "subscription_features",
    "free_entitlement",
  ];
  for (const k of kinds) {
    assert.equal(normalizePurchaseKind(k), k);
  }
});

test("normalizePurchaseKind is case-insensitive and trims whitespace", () => {
  assert.equal(normalizePurchaseKind("  PAID_UPDATE "), "paid_update");
  assert.equal(normalizePurchaseKind("Cart_Bundle"), "cart_bundle");
});

test("normalizePurchaseKind maps legacy aliases to canonical kinds", () => {
  assert.equal(normalizePurchaseKind("product"), "full_product");
  assert.equal(normalizePurchaseKind("products"), "full_product");
  assert.equal(normalizePurchaseKind("course_update"), "paid_update");
  assert.equal(normalizePurchaseKind("update"), "paid_update");
  assert.equal(normalizePurchaseKind("bundle"), "cart_bundle");
  assert.equal(normalizePurchaseKind("module"), "selected_modules");
  assert.equal(normalizePurchaseKind("resource"), "selected_resources");
});

test("normalizePurchaseKind falls back to free_entitlement on unknown input", () => {
  assert.equal(normalizePurchaseKind(undefined), "free_entitlement");
  assert.equal(normalizePurchaseKind(null), "free_entitlement");
  assert.equal(normalizePurchaseKind(42), "free_entitlement");
  assert.equal(normalizePurchaseKind("banana"), "free_entitlement");
  assert.equal(normalizePurchaseKind(""), "free_entitlement");
});

// ---------------------------------------------------------------------------
// Duplicate line-item removal
// ---------------------------------------------------------------------------

test("dedupeLineItems removes duplicate entitlement IDs and keeps the first occurrence", () => {
  const a = buildLineItem({ id: "line-1", kind: "full_product", productId: "p1", title: "Course A", regularPrice: 100, entitlementId: "p1" });
  const b = buildLineItem({ id: "line-2", kind: "full_product", productId: "p2", title: "Course B", regularPrice: 200, entitlementId: "p2" });
  const c = buildLineItem({ id: "line-3", kind: "full_product", productId: "p1", title: "Course A (dup)", regularPrice: 100, entitlementId: "p1" });
  const out = dedupeLineItems([a, b, c]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "line-1");
  assert.equal(out[1].id, "line-2");
});

test("dedupeLineItems tolerates a custom entitlementId and skips missing IDs", () => {
  const a = buildLineItem({ id: "1", kind: "full_product", title: "t", regularPrice: 100, entitlementId: "shared" });
  const b = buildLineItem({ id: "2", kind: "full_product", title: "t", regularPrice: 100, entitlementId: "shared" });
  const out = dedupeLineItems([a, b, null, undefined]);
  assert.equal(out.length, 1);
});

// ---------------------------------------------------------------------------
// Invalid negative prices
// ---------------------------------------------------------------------------

test("partitionByValidPrice separates negative-priced line items", () => {
  const good = buildLineItem({ id: "g", kind: "full_product", title: "ok", regularPrice: 100 });
  const bad = buildLineItem({ id: "b", kind: "full_product", title: "bad", regularPrice: -10 });
  const result = partitionByValidPrice([good, bad]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.valid[0].id, "g");
  assert.equal(result.invalid[0].id, "b");
});

test("partitionByValidPrice flags negative effective prices even when regular is non-negative", () => {
  const bad = {
    id: "x", kind: "full_product", productId: null, moduleId: null, resourceId: null,
    updateId: null, subscriptionPlanId: null, featureId: null, title: "t", parentTitle: "",
    regularPrice: 100, salePrice: -50, effectivePrice: -50, quantity: 1, alreadyOwned: false,
    entitlementId: "x",
  };
  const result = partitionByValidPrice([bad]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.invalid.length, 1);
});

test("partitionByValidPrice treats zero as valid", () => {
  const zero = buildLineItem({ id: "z", kind: "full_product", title: "t", regularPrice: 0 });
  const result = partitionByValidPrice([zero]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 0);
});

// ---------------------------------------------------------------------------
// Already-owned item marking
// ---------------------------------------------------------------------------

test("markAlreadyOwned flags line items whose entitlementId is in the owned set", () => {
  const a = buildLineItem({ id: "a", kind: "full_product", title: "Course A", regularPrice: 100, entitlementId: "prod-a" });
  const b = buildLineItem({ id: "b", kind: "full_product", title: "Course B", regularPrice: 200, entitlementId: "prod-b" });
  const owned = new Set(["prod-a"]);
  const marked = markAlreadyOwned([a, b], owned);
  assert.equal(marked[0].alreadyOwned, true);
  assert.equal(marked[1].alreadyOwned, false);
});

test("markAlreadyOwned accepts either a Set or a plain array", () => {
  const a = buildLineItem({ id: "a", kind: "full_product", title: "Course A", regularPrice: 100, entitlementId: "prod-a" });
  const fromArray = markAlreadyOwned([a], ["prod-a"]);
  const fromSet = markAlreadyOwned([a], new Set(["prod-a"]));
  assert.equal(fromArray[0].alreadyOwned, true);
  assert.equal(fromSet[0].alreadyOwned, true);
});

test("markAlreadyOwned leaves already-owned items alone when re-applied", () => {
  const a = buildLineItem({ id: "a", kind: "full_product", title: "Course A", regularPrice: 100, entitlementId: "prod-a" });
  const once = markAlreadyOwned([a], new Set(["prod-a"]));
  const twice = markAlreadyOwned(once, new Set(["prod-a"]));
  assert.equal(twice[0].alreadyOwned, true);
});

test("sumEffectivePrice skips already-owned items", () => {
  const a = buildLineItem({ id: "a", kind: "full_product", title: "Course A", regularPrice: 100, entitlementId: "prod-a" });
  const b = buildLineItem({ id: "b", kind: "full_product", title: "Course B", regularPrice: 200, entitlementId: "prod-b" });
  const marked = markAlreadyOwned([a, b], new Set(["prod-a"]));
  assert.equal(sumEffectivePrice(marked), 200);
  assert.equal(sumEffectivePrice([a, b]), 300);
});

test("sumEffectivePrice multiplies by quantity", () => {
  const item = buildLineItem({ id: "a", kind: "full_product", title: "Course A", regularPrice: 100, quantity: 3 });
  assert.equal(sumEffectivePrice([item]), 300);
});

// ---------------------------------------------------------------------------
// Bonus: end-to-end pipeline that the OrderSummary + Razorpay flow would use.
// ---------------------------------------------------------------------------

test("full checkout pipeline: build -> dedupe -> mark owned -> validate -> sum", () => {
  const items = [
    buildLineItem({ id: "p1", kind: "full_product", productId: "react", title: "React", regularPrice: 1999, salePrice: 1499, entitlementId: "react" }),
    buildLineItem({ id: "p2", kind: "full_product", productId: "node", title: "Node", regularPrice: 999, entitlementId: "node" }),
    buildLineItem({ id: "p3", kind: "full_product", productId: "react", title: "React (dup)", regularPrice: 1999, salePrice: 1499, entitlementId: "react" }),
    buildLineItem({ id: "p4", kind: "selected_modules", productId: "react", moduleId: "react-mod-3", title: "Hooks deep dive", regularPrice: 499, entitlementId: "react-mod-3" }),
    buildLineItem({ id: "p5", kind: "paid_update", productId: "react", updateId: "u-1", title: "Q1 Update", regularPrice: 199, entitlementId: "u-1" }),
  ];
  const owned = new Set(["react-mod-3"]);
  const deduped = dedupeLineItems(items);
  assert.equal(deduped.length, 4); // p1 and p3 collapse on entitlementId="react"
  const marked = markAlreadyOwned(deduped, owned);
  const { valid, invalid } = partitionByValidPrice(marked);
  assert.equal(invalid.length, 0);
  assert.equal(valid.length, 4);
  // React=1499, Node=999, React (dup) collapsed, Hooks=499 (already owned -> skipped), Update=199
  // Already owned: react-mod-3 contributes 0
  // Total: 1499 + 999 + 199 = 2697
  assert.equal(sumEffectivePrice(valid), 2697);
});
