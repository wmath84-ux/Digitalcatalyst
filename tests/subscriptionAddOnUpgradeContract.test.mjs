// tests/subscriptionAddOnUpgradeContract.test.mjs
//
// Contract tests for the add-on upgrade logic + the back-navigation fixes.
//
// Upgrade rules:
//   1. A subscriber can switch to ANY other plan / cycle at any time.
//   2. Keeping the owned plan + cycle is only blocked when the selection adds
//      NOTHING new. When at least one new feature / product is selected the
//      purchase becomes an add-on upgrade: the plan price is not charged
//      again, only the NEW items are charged, and the expiry does not move.
//
// Also covered: auth Back button returns to the page the user came from,
// legal pages turn a system back press into an in-app redirect, and Razorpay
// stops rendering its clipped back-confirmation dialog.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALREADY_ACTIVE_CODE,
  evaluateSubscriptionSelection,
  resolveSubscribeCta,
} from "../utils/subscriptionOwnership.js";
import { recordRouteVisit, resolveBackDestination } from "../src/utils/routeHistory.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 1);

const activeRecord = (overrides = {}) => ({
  status: "active",
  planId: "premium",
  cycle: "yearly",
  features: ["my-day"],
  includedProductIds: ["course-1"],
  expiresAt: NOW + 200 * DAY,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Pure engine — add-on detection
// ---------------------------------------------------------------------------

test("same plan + cycle with a new feature is an add-on upgrade, not a blocked repurchase", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "premium",
    cycle: "yearly",
    featureIds: ["my-day", "ai-mentor"],
    productIds: [],
    now: NOW,
  });
  assert.equal(state.owned, true);
  assert.equal(state.addOnPurchase, true);
  assert.equal(state.blocked, false, "an add-on upgrade must stay purchasable");
  assert.deepEqual(state.newFeatureIds, ["ai-mentor"]);
});

test("same plan + cycle with a new product is an add-on upgrade", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "premium",
    cycle: "yearly",
    featureIds: ["my-day"],
    productIds: ["course-1", "course-2"],
    now: NOW,
  });
  assert.equal(state.addOnPurchase, true);
  assert.deepEqual(state.newProductIds, ["course-2"]);
  assert.equal(state.blocked, false);
});

test("same plan + cycle with NOTHING new stays blocked outside the renewal window", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "premium",
    cycle: "yearly",
    featureIds: ["my-day"],
    productIds: ["course-1"],
    now: NOW,
  });
  assert.equal(state.addOnPurchase, false);
  assert.equal(state.blocked, true);
  assert.equal(state.code, ALREADY_ACTIVE_CODE);
});

test("the add-on upgrade CTA reads Upgrade my membership", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "premium",
    cycle: "yearly",
    featureIds: ["my-day", "ai-mentor"],
    now: NOW,
  });
  const cta = resolveSubscribeCta({ state });
  assert.equal(cta.label, "Upgrade my membership");
  assert.equal(cta.disabled, false);
  assert.equal(cta.owned, false, "an upgrade must use the purchasable styling");
});

test("a plan switch is never an add-on and never blocked", () => {
  const state = evaluateSubscriptionSelection({
    record: activeRecord(),
    planId: "pro",
    cycle: "yearly",
    featureIds: ["my-day"],
    productIds: [],
    now: NOW,
  });
  assert.equal(state.owned, false);
  assert.equal(state.addOnPurchase, false);
  assert.equal(state.blocked, false);
});

// ---------------------------------------------------------------------------
// Server wiring — add-on pricing must reach the quote and the grant
// ---------------------------------------------------------------------------

test("server quote loader drops the already-paid plan and owned lines for add-ons", () => {
  const loader = read("api/_lib/subscriptions.ts");
  assert.match(loader, /evaluateSubscriptionSelection\(\{\s*record: options\.existingSubscription/);
  assert.match(loader, /const isAddOnPurchase = Boolean\(ownershipVerdict && ownershipVerdict\.addOnPurchase\)/);
  // The plan line (already paid) and already-owned feature/product lines are
  // filtered out so only the NEW items are charged.
  assert.match(loader, /if \(item\.kind === "subscription"\) return false; \/\/ plan already paid/);
  assert.match(loader, /if \(item\.featureId && !addOnNewFeatureIds\.has/);
  assert.match(loader, /if \(item\.productId && !addOnNewResolvedProductIds\.has/);
  // Product aliases (requested id / public id / document id) all count as new.
  assert.match(loader, /addOnNewResolvedProductIds\.add\(requestedProductId\)/);
  // The expiry stays where it is for add-ons.
  assert.match(loader, /const expiresAt = isAddOnPurchase && existingExpiresAt > 0/);
});

test("server duplicate guard lets add-on selections through", () => {
  const guard = read("api/_lib/subscriptions.ts");
  assert.match(guard, /featureIds: Array\.isArray\(selection\.featureIds\) \? selection\.featureIds\.map\(String\) : \[\],/);
  assert.match(guard, /productIds: Array\.isArray\(selection\.productIds\) \? selection\.productIds\.map\(String\) : \[\],/);
});

test("add-on grants merge access and never move the expiry", () => {
  const writer = read("api/_lib/subscriptions.ts");
  assert.match(writer, /if \(previous\.exists && args\.addOn && !isPlanChange\)/);
  assert.match(writer, /const access = mergeSubscriptionAccess\(previousData, args\.plan, args\.selectedFeatureIds\)/);
  assert.match(writer, /upgradedAt: nowTs/);
  // No time math for add-ons: expiresAt comes straight from the stored record.
  assert.match(writer, /expiresAt: Timestamp\.fromMillis\(expiresAtMs\),\s*renewalReminderOptOut/);
});

test("the quote engine surfaces subscriptionAddOn", () => {
  const engine = read("utils/serverQuotes.js");
  assert.match(engine, /subscriptionAddOn = false,\s*\} = input/);
  assert.match(engine, /subscriptionAddOn: kind === "subscription" \|\| kind === "subscription_features"\s*\? Boolean\(subscriptionAddOn\)\s*: false,/);
});

test("the quote endpoint loads the current membership and passes the add-on flag through", () => {
  const endpoint = read("api/_lib/quotes.ts");
  assert.match(endpoint, /const currentSubscription = await loadCurrentSubscription\(firebaseUser\.uid\)/);
  assert.match(endpoint, /existingSubscription: currentSubscription/);
  assert.match(endpoint, /subscriptionAddOn = subContext\.addOnPurchase === true/);
  assert.match(endpoint, /subscriptionAddOn,\s*\}\);/);
});

test("create-order and verify-payment carry the add-on flag for replays", () => {
  const createOrder = read("api/razorpay/create-order.ts");
  const verify = read("api/razorpay/verify-payment.ts");
  assert.match(createOrder, /subscriptionAddOn: quote\.subscriptionAddOn === true/);
  assert.match(verify, /subscriptionAddOn: intent\.subscriptionAddOn === true/);
  assert.match(verify, /quote\.subscriptionAddOn\s*\?\s*`⬆️ \$\{planLabel \|\| "Your membership"\} upgraded`/);
});

test("the entitlement writer passes the add-on flag into the subscription write", () => {
  const entitlements = read("api/_lib/entitlements.ts");
  assert.match(entitlements, /addOn: quote\.subscriptionAddOn === true/);
});

// ---------------------------------------------------------------------------
// Client wiring
// ---------------------------------------------------------------------------

test("subscription page evaluates add-ons with the selected features and products", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /featureIds: selectedFeatureIds,\s*productIds: selectedCourseIds,/);
  assert.match(page, /const isAddOnUpgrade = Boolean\(ownershipState\.addOnPurchase && !ownershipState\.blocked\)/);
  assert.match(page, /chargeableFeatureIds/);
  assert.match(page, /data-subscription-addon-upgrade-note/);
  assert.match(page, /no plan price is charged again/);
});

test("the owned-plan card offers the add-more upgrade path", () => {
  const card = read("src/subscription/components/OwnedPlanCard.tsx");
  assert.match(card, /data-subscription-owned-add-more/);
  assert.match(card, /Add features or courses to this plan/);
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /onAddMore=\{\(\) => setAddOnIntent\(true\)\}/);
});

test("the price summary marks the plan row as included for add-on upgrades", () => {
  const summary = read("src/subscription/components/PriceSummary.tsx");
  assert.match(summary, /planAlreadyIncluded/);
  assert.match(summary, /Included in your membership/);
});

// ---------------------------------------------------------------------------
// Auth back button — returns to the page the user came from
// ---------------------------------------------------------------------------

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

test("the auth back button resolves to the exact previous app page", () => {
  const storage = fakeStorage();
  recordRouteVisit("#/store", storage);
  recordRouteVisit("#/product/1001", storage);
  recordRouteVisit("#/auth?mode=login", storage); // never recorded
  assert.equal(resolveBackDestination(storage), "#/product/1001");
});

test("protected routes are skipped so Back can never bounce back to login", () => {
  const storage = fakeStorage();
  recordRouteVisit("#/home", storage);
  recordRouteVisit("#/subscription", storage); // protected — recorded, then skipped
  recordRouteVisit("#/auth?mode=login", storage);
  assert.equal(resolveBackDestination(storage), "#/home");
});

test("an empty history falls back to the public home route", () => {
  assert.equal(resolveBackDestination(fakeStorage()), "#/home");
});

test("the app shell records visited routes and the auth screen uses the resolver", () => {
  const main = read("src/main.tsx");
  const auth = read("src/AuthApp.tsx");
  assert.match(main, /recordRouteVisit\(hash, window\.sessionStorage\)/);
  assert.match(auth, /resolveBackDestination\(window\.sessionStorage\)/);
  assert.match(auth, /sessionStorage\.removeItem\("authReturnHash"\)/);
});

// ---------------------------------------------------------------------------
// Legal pages + Razorpay back navigation
// ---------------------------------------------------------------------------

test("terms and privacy pages turn a system back press into an app redirect", () => {
  for (const file of ["public/terms-of-service.html", "public/privacy-policy.html"]) {
    const html = read(file);
    assert.match(html, /policy-back\.js/);
    assert.match(html, /data-policy-back/);
  }
  const script = read("public/policy-back.js");
  assert.match(script, /eduvora\.routeHistory\.v1/);
  assert.match(script, /window\.history\.pushState\(\{ eduvoraPolicy: true \}/);
  assert.match(script, /window\.location\.replace\(lastAppRoute\(\) \|\| APP_FALLBACK\)/);
});

test("Razorpay no longer renders its clipped back-confirmation dialog", () => {
  const gateway = read("src/components/PaymentGateway.tsx");
  assert.match(gateway, /handleback: false/);
  assert.match(gateway, /handleback\?: boolean/);
});
