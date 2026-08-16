// tests/subscriptionsServerContract.test.mjs
//
// Part 9 — source-level contract tests for the subscription
// server-side plumbing. These tests are SOURCE-only; they
// assert that:
//
//   - `utils/subscriptions.js` is a pure module (no Firestore
//     / no fetch / no Node-only imports).
//   - `api/_lib/subscriptions.ts` loads plans + features +
//     product/module unlocks from Firestore.
//   - `api/_lib/quotes.ts` calls
//     `loadSubscriptionSelectionContext` when the selection
//     is a subscription.
//   - `api/razorpay/create-order.ts` accepts the
//     `subscription` + `subscription_features` purchase
//     kinds.
//   - `api/razorpay/verify-payment.ts` calls
//     `grantSubscriptionFromQuote` after a successful
//     payment.
//   - The Post-Part 6 entitlement writer stamps the
//     `users/{uid}.subscriptionPlanId` +
//     `subscriptions/{uid}/current` doc atomically.
//   - The simulation bits (`setTimeout` / `SuccessOverlay`)
//     are gone.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const subscriptions = readSource("utils/subscriptions.js");
const subscriptionsDts = readSource("utils/subscriptions.d.ts");
const subscriptionsLib = readSource("api/_lib/subscriptions.ts");
const subscriptionsLibCode = stripComments(subscriptionsLib);
const entitlements = readSource("api/_lib/entitlements.ts");
const entitlementsCode = stripComments(entitlements);
const quotes = readSource("api/_lib/quotes.ts");
const quotesCode = stripComments(quotes);
const createOrder = readSource("api/razorpay/create-order.ts");
const createOrderCode = stripComments(createOrder);
const verifyPayment = readSource("api/razorpay/verify-payment.ts");
const verifyCode = stripComments(verifyPayment);
const serverQuotes = readSource("utils/serverQuotes.js");
const serverQuotesCode = stripComments(serverQuotes);
const subscriptionPage = readSource("src/subscription/components/SubscriptionPage.tsx");
const successOverlay = "src/subscription/components/SuccessOverlay.tsx";

// ---------------------------------------------------------------------------
// utils/subscriptions.js — pure engine
// ---------------------------------------------------------------------------

test("utils/subscriptions.js is pure (no Firestore / no fetch / no Node-only imports)", () => {
  assert.doesNotMatch(subscriptions, /firebase-admin/);
  assert.doesNotMatch(subscriptions, /require\(/);
  assert.doesNotMatch(subscriptions, /process\.env/);
  assert.doesNotMatch(subscriptions, /from "node:/);
});

test("utils/subscriptions.js declares every Part 9 spec helper", () => {
  for (const name of [
    "normalisePlanDoc",
    "normaliseFeatureDoc",
    "isPlanActive",
    "isPlanCycleAllowed",
    "isFeatureSelectable",
    "isFeaturePayable",
    "isFeatureIdAllowed",
    "computeCycleExpiresAt",
    "isSubscriptionActive",
    "getPlanCyclePricePaise",
    "buildSubscriptionLineItems",
    "validateSubscriptionSelection",
    "formatBillingCycle",
    "getCycleDurationDays",
    "collectSubscriptionEntitlementIds",
  ]) {
    assert.match(subscriptions, new RegExp(`export const ${name}`), `missing export ${name}`);
  }
});

test("utils/subscriptions.d.ts declares the spec-shaped plan + feature + record types", () => {
  for (const field of [
    "id",
    "name",
    "description",
    "monthlyPricePaise",
    "yearlyPricePaise",
    "includedFeatureIds",
    "includedProductIds",
    "includedModuleKeys",
    "allowedCycles",
    "active",
    "minPayablePaise",
    "trialDays",
    "autoRenewByDefault",
  ]) {
    assert.match(subscriptionsDts, new RegExp(`\\b${field}\\b`), `plan missing field ${field}`);
  }
  for (const field of [
    "uid",
    "planId",
    "cycle",
    "features",
    "includedProductIds",
    "includedModuleKeys",
    "status",
    "activatedAt",
    "expiresAt",
    "autoRenew",
    "orderId",
    "paymentId",
    "amountPaise",
    "source",
    "couponCode",
  ]) {
    assert.match(subscriptionsDts, new RegExp(`\\b${field}\\b`), `record missing field ${field}`);
  }
});

// ---------------------------------------------------------------------------
// api/_lib/subscriptions.ts — server-side plumbing
// ---------------------------------------------------------------------------

test("api/_lib/subscriptions.ts loads plans from Firestore", () => {
  assert.match(subscriptionsLib, /loadPlanById/);
  assert.match(subscriptionsLib, /loadActivePlans/);
  assert.match(subscriptionsLib, /PLANS_COLLECTION\s*=\s*"subscriptionPlans"/);
});

test("api/_lib/subscriptions.ts loads features + product/module unlocks", () => {
  assert.match(subscriptionsLib, /loadActiveFeatures/);
  assert.match(subscriptionsLib, /FEATURES_COLLECTION\s*=\s*"subscriptionFeatures"/);
  assert.match(subscriptionsLib, /loadPlanProductUnlocks/);
  assert.match(subscriptionsLib, /PRODUCT_UNLOCKS_COLLECTION\s*=\s*"subscriptionPlanProductUnlocks"/);
  assert.match(subscriptionsLib, /loadPlanModuleUnlocks/);
  assert.match(subscriptionsLib, /MODULE_UNLOCKS_COLLECTION\s*=\s*"subscriptionPlanModuleUnlocks"/);
});

test("api/_lib/subscriptions.ts loadSubscriptionSelectionContext returns line items + expiresAt", () => {
  assert.match(subscriptionsLib, /loadSubscriptionSelectionContext/);
  assert.match(subscriptionsLib, /buildSubscriptionLineItems/);
  assert.match(subscriptionsLib, /computeCycleExpiresAt/);
});

test("api/_lib/subscriptions.ts writeSubscriptionAfterPayment stamps the canonical record", () => {
  assert.match(subscriptionsLib, /writeSubscriptionAfterPayment/);
  // Canonical collection.
  assert.match(subscriptionsLib, /subscription/);
  // User-doc mirror for legacy readers.
  assert.match(subscriptionsLib, /subscriptionPlanId/);
  assert.match(subscriptionsLib, /subscriptionCycle/);
  assert.match(subscriptionsLib, /subscriptionExpiresAt/);
  assert.match(subscriptionsLib, /subscriptionAutoRenew/);
  assert.match(subscriptionsLib, /subscriptionTier/);
});

test("api/_lib/subscriptions.ts is idempotent (re-running does not double-write the entitlements)", () => {
  // The per-entitlement idempotency lives in
  // `api/_lib/entitlements.ts`: the writer reads each canonical
  // `entitlements` doc and short-circuits on a hit. Assert that
  // behaviour rather than one variable name — this used to pin a
  // literal `existing.exists` and broke when the snapshot was renamed,
  // even though the guarantee never changed.
  assert.match(
    entitlementsCode,
    /if\s*\(\s*[A-Za-z_$][\w$]*(?:\[[^\]]+\])?\.exists\s*\)\s*continue\s*;?/,
    "an already-granted entitlement must be skipped, not rewritten",
  );
  assert.match(entitlements, /collectSubscriptionEntitlementIds/);
  // The subscription's own entitlement docs get the same treatment.
  assert.match(entitlementsCode, /existingEntitlements\[index\]\.exists\s*\)\s*continue/);
  // `users/{uid}/subscription/current` is one per-user record, so a
  // re-grant overwrites with the same values — except for the expiry,
  // which must NOT be extended when the same order is replayed.
  assert.match(subscriptionsLib, /previousData\.orderId \|\| ""\) === args\.orderId/);
});

// ---------------------------------------------------------------------------
// api/_lib/quotes.ts — load subscription context for `subscription` / `subscription_features` purchase kinds
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts loads the subscription context when the selection is a subscription", () => {
  assert.match(quotesCode, /loadSubscriptionSelectionContext/);
  assert.match(quotesCode, /subscriptionLineItems/);
  assert.match(quotesCode, /subscriptionExpiresAt/);
  // The handler must accept both subscription kinds.
  assert.match(quotesCode, /purchaseKind === "subscription"/);
  assert.match(quotesCode, /purchaseKind === "subscription_features"/);
});

test("api/_lib/quotes.ts refuses an invalid subscription with a 400 + error code", () => {
  // When the engine rejects the subscription selection, the
  // response carries `subscriptionRefused: true` + the
  // machine-readable error code.
  assert.match(quotesCode, /subscriptionRefused/);
  assert.match(quotesCode, /subscriptionErrorCode/);
});

// ---------------------------------------------------------------------------
// Part 4 engine — accepts `subscription` + `subscription_features` purchase kinds
// ---------------------------------------------------------------------------

test("utils/serverQuotes.js: PURCHASE_KINDS includes subscription + subscription_features", () => {
  assert.match(serverQuotes, /"subscription"/);
  assert.match(serverQuotes, /"subscription_features"/);
});

test("utils/serverQuotes.js: buildQuote validates subscription selections (subscriptionPlanId + billingCycle)", () => {
  // The engine must refuse a subscription selection that's
  // missing either the plan id or the cycle.
  assert.match(serverQuotesCode, /Subscription selection requires a subscriptionPlanId/);
  assert.match(serverQuotesCode, /Subscription selection requires a billingCycle/);
});

test("utils/serverQuotes.js: ServerPriceQuoteRecord carries subscription metadata", () => {
  assert.match(serverQuotesCode, /subscriptionPlanId/);
  assert.match(serverQuotesCode, /subscriptionCycle/);
  assert.match(serverQuotesCode, /subscriptionExpiresAt/);
});

// ---------------------------------------------------------------------------
// api/razorpay/create-order.ts — accepts subscription purchase kinds
// ---------------------------------------------------------------------------

test("create-order allows subscription + subscription_features purchase kinds", () => {
  assert.match(createOrderCode, /"subscription"/);
  assert.match(createOrderCode, /"subscription_features"/);
});

test("create-order persists the subscription metadata on the payment intent", () => {
  // The intent snapshot carries the plan / cycle / expiry so
  // a verify-payment replay still knows what subscription
  // was applied.
  assert.match(createOrderCode, /subscriptionPlanId: quote\.subscriptionPlanId/);
  assert.match(createOrderCode, /subscriptionCycle: quote\.subscriptionCycle/);
  assert.match(createOrderCode, /subscriptionExpiresAt: quote\.subscriptionExpiresAt/);
});

// ---------------------------------------------------------------------------
// api/razorpay/verify-payment.ts — grant the subscription
// ---------------------------------------------------------------------------

test("verify-payment calls grantSubscriptionFromQuote on a successful payment", () => {
  assert.match(verifyCode, /grantSubscriptionFromQuote/);
});

test("verify-payment returns the subscription summary in the response", () => {
  // The success response carries `subscription: { planId, cycle,
  // features, activatedAt, expiresAt, orderId }` when the
  // quote has a subscription. The object literal is
  // constructed via the variable `subscription` (not an inline
  // `{`); the test only asserts the field is present.
  assert.match(verifyCode, /subscription: subscription/);
  assert.match(verifyCode, /planId/);
  assert.match(verifyCode, /cycle/);
  assert.match(verifyCode, /features/);
  assert.match(verifyCode, /activatedAt/);
  assert.match(verifyCode, /expiresAt/);
});

// ---------------------------------------------------------------------------
// api/_lib/entitlements.ts — atomic subscription write
// ---------------------------------------------------------------------------

test("grantEntitlementsFromQuote calls writeSubscriptionAfterPayment through grantSubscriptionFromQuote", () => {
  // The Part 9 writer delegates the subscription write to
  // `grantSubscriptionFromQuote` (which itself wraps
  // `writeSubscriptionAfterPayment` in a transaction).
  assert.match(entitlementsCode, /grantSubscriptionFromQuote/);
  assert.match(entitlementsCode, /writeSubscriptionAfterPayment/);
});

test("grantSubscriptionFromQuote runs inside a Firestore transaction (atomic)", () => {
  const txBlocks = entitlementsCode.match(/(?:adminDb\(\)|db)?\.runTransaction\(/g) || [];
  assert.ok(txBlocks.length >= 1, "expected at least one runTransaction call");
});

test("grantSubscriptionFromQuote writes the canonical entitlements collection", () => {
  assert.match(entitlementsCode, /"entitlements"/);
  assert.match(entitlementsCode, /collectSubscriptionEntitlementIds/);
});

// ---------------------------------------------------------------------------
// Sim removal — setTimeout / SuccessOverlay / fake activation
// ---------------------------------------------------------------------------

test("SubscriptionPage does not use setTimeout for subscription activation", () => {
  // The previous implementation had a `setTimeout` simulation
  // inside `handleSubscribe`. Part 9 routes through the
  // Razorpay flow + CheckoutContext instead. Strip comments
  // so the doc-comments that *mention* "setTimeout" don't
  // cause a false positive.
  const codeOnly = stripComments(subscriptionPage);
  assert.doesNotMatch(codeOnly, /setTimeout/);
});

test("SubscriptionPage no longer references the fake SuccessOverlay component", () => {
  // The success overlay was a client-only fake activation
  // effect. Part 9 deleted the file. Strip comments so the
  // doc-comments that *mention* "SuccessOverlay" don't cause
  // a false positive.
  const codeOnly = stripComments(subscriptionPage);
  assert.doesNotMatch(codeOnly, /SuccessOverlay/);
  // The file itself should be gone.
  assert.equal(fs.existsSync(path.join(repoRoot, successOverlay)), false);
});

test("SubscriptionPage does not hard-code BASE_MONTHLY / BASE_YEARLY", () => {
  // The old simulation wired the page against a hard-coded
  // $4.99 / $29.99 pair. Part 9 loads plans from Firestore.
  const codeOnly = stripComments(subscriptionPage);
  assert.doesNotMatch(codeOnly, /4\.99/);
  assert.doesNotMatch(codeOnly, /29\.99/);
});

test("SubscriptionPage does not hard-code COURSES / FEATURES / COUPONS / REFERRALS", () => {
  // The old simulation shipped its own course + feature +
  // coupon + referral lists. Part 9 reads everything from the
  // server.
  const codeOnly = stripComments(subscriptionPage);
  assert.doesNotMatch(codeOnly, /const COURSES/);
  assert.doesNotMatch(codeOnly, /const FEATURES/);
  assert.doesNotMatch(codeOnly, /const COUPONS/);
  assert.doesNotMatch(codeOnly, /const REFERRALS/);
});
