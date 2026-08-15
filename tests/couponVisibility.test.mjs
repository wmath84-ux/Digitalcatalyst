// tests/couponVisibility.test.mjs
//
// Free orders must never render a coupon field — not on the product
// page, not on the subscription page, and not on the checkout review
// page. This file covers both halves of that rule:
//
//   1. Pure unit tests for `utils/couponVisibility.js`.
//   2. Source-level contract tests asserting that every coupon input
//      in the React tree is gated behind that helper.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FREE_PURCHASE_KINDS,
  isFreeProduct,
  payableBeforeCouponPaise,
  shouldShowCouponInput,
} from "../utils/couponVisibility.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

// ---------------------------------------------------------------------------
// isFreeProduct
// ---------------------------------------------------------------------------

test("isFreeProduct is true when the admin free switch is on", () => {
  assert.equal(isFreeProduct({ isFree: true, price: 499 }), true);
});

test("isFreeProduct is true when the effective price is zero", () => {
  assert.equal(isFreeProduct({ isFree: false, price: 0 }), true);
  assert.equal(isFreeProduct({ price: 0 }), true);
});

test("isFreeProduct is false for a paid product", () => {
  assert.equal(isFreeProduct({ isFree: false, price: 499 }), false);
});

test("isFreeProduct tolerates missing / malformed products", () => {
  assert.equal(isFreeProduct(null), false);
  assert.equal(isFreeProduct(undefined), false);
  assert.equal(isFreeProduct({ price: "not-a-number" }), true);
});

// ---------------------------------------------------------------------------
// payableBeforeCouponPaise
// ---------------------------------------------------------------------------

test("payableBeforeCouponPaise re-adds the applied coupon discount", () => {
  // A ₹300 order with a ₹300 coupon applied is still a paid order:
  // the buyer must be able to see and remove the coupon.
  assert.equal(payableBeforeCouponPaise(0, 30000), 30000);
  assert.equal(payableBeforeCouponPaise(20000, 10000), 30000);
});

test("payableBeforeCouponPaise never returns a negative amount", () => {
  assert.equal(payableBeforeCouponPaise(-500, 0), 0);
  assert.equal(payableBeforeCouponPaise(0, 0), 0);
});

// ---------------------------------------------------------------------------
// shouldShowCouponInput
// ---------------------------------------------------------------------------

test("shouldShowCouponInput hides the field for an explicitly free item", () => {
  assert.equal(shouldShowCouponInput({ payablePaise: 49900, isFree: true }), false);
});

test("shouldShowCouponInput hides the field for free-entitlement purchases", () => {
  assert.equal(shouldShowCouponInput({ purchaseKind: "free_entitlement", payablePaise: 49900 }), false);
  assert.ok(FREE_PURCHASE_KINDS.includes("free_entitlement"));
});

test("shouldShowCouponInput hides the field when nothing is payable", () => {
  assert.equal(shouldShowCouponInput({ purchaseKind: "full_product", payablePaise: 0 }), false);
  assert.equal(shouldShowCouponInput({ purchaseKind: "subscription", payablePaise: 0 }), false);
  assert.equal(shouldShowCouponInput({ purchaseKind: "cart_bundle", payablePaise: -100 }), false);
  assert.equal(shouldShowCouponInput(), false);
});

test("shouldShowCouponInput shows the field for a paid order", () => {
  assert.equal(shouldShowCouponInput({ purchaseKind: "full_product", payablePaise: 49900 }), true);
  assert.equal(shouldShowCouponInput({ purchaseKind: "subscription", payablePaise: 100 }), true);
  assert.equal(shouldShowCouponInput({ purchaseKind: "paid_update", payablePaise: 19900 }), true);
});

// ---------------------------------------------------------------------------
// React contract — every coupon input is gated by the helper
// ---------------------------------------------------------------------------

const pdpApp = readSource("src/PdpApp.tsx");
const reviewStep = readSource("src/components/checkout/CheckoutReviewStep.tsx");
const subscriptionPage = readSource("src/subscription/components/SubscriptionPage.tsx");

test("PdpApp gates the coupon input behind shouldShowCouponInput", () => {
  assert.match(pdpApp, /shouldShowCouponInput/);
  assert.match(pdpApp, /isFreeProduct\(product\)/);
  assert.match(pdpApp, /canShowCouponInput\s*&&\s*\(/);
});

test("PdpApp drops an applied coupon when the product becomes free", () => {
  assert.match(pdpApp, /!canShowCouponInput\s*&&\s*appliedCoupon/);
});

test("CheckoutReviewStep hides the coupon card when nothing is payable", () => {
  assert.match(reviewStep, /shouldShowCouponInput\(/);
  // The pre-coupon payable is used so an applied coupon stays removable.
  assert.match(reviewStep, /payableBeforeCouponPaise\(cashPayable,\s*couponDiscount\)/);
  assert.match(reviewStep, /showCouponCard\s*\?\s*\(/);
});

test("SubscriptionPage hides the coupon input for a zero-total selection", () => {
  assert.match(subscriptionPage, /shouldShowCouponInput\(/);
  assert.match(subscriptionPage, /canShowCouponInput\s*\?\s*\(/);
});

test("SubscriptionPage drops an applied coupon when the total falls to zero", () => {
  assert.match(subscriptionPage, /!canShowCouponInput\s*&&\s*appliedCoupon/);
});

test("no coupon input is rendered outside the gated call sites", () => {
  // Any file that renders a coupon field must import the visibility
  // helper. This guards against a future page re-introducing an
  // ungated coupon box.
  const renderers = [
    ["src/PdpApp.tsx", pdpApp],
    ["src/components/checkout/CheckoutReviewStep.tsx", reviewStep],
    ["src/subscription/components/SubscriptionPage.tsx", subscriptionPage],
  ];
  for (const [rel, source] of renderers) {
    assert.match(source, /couponVisibility/, `${rel} must import the coupon-visibility helper`);
  }
});
