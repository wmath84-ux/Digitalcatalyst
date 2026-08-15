// Regression coverage for subscription-selected products.
//
// A subscription used to activate its feature list successfully while the
// product selected and paid for on the same page stayed locked. Product access
// was inferred from receipt lines and was not carried as first-class payment
// metadata; a same-order replay also returned the incomplete record unchanged.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildQuote } from "../utils/serverQuotes.js";
import { resolveCourseAccess } from "../utils/courseAccess.js";

const read = (path) => fs.readFileSync(path, "utf8");

const selection = {
  purchaseKind: "subscription",
  productIds: ["product-doc-1"],
  moduleIds: [],
  resourceIds: [],
  updateId: null,
  subscriptionPlanId: "premium",
  billingCycle: "monthly",
  featureIds: ["my-day"],
  couponCode: null,
  requestedEduCoins: 0,
  returnRoute: "#/subscription",
};

const subscriptionLines = [
  {
    id: "subscription:premium:monthly",
    kind: "subscription",
    productId: null,
    moduleId: null,
    resourceId: null,
    updateId: null,
    subscriptionPlanId: "premium",
    featureId: null,
    title: "Premium",
    parentTitle: "Monthly subscription",
    regularPrice: 0,
    salePrice: null,
    effectivePrice: 0,
    quantity: 1,
    alreadyOwned: false,
    entitlementId: "subscription:premium",
  },
  {
    id: "subscription_product:premium:course-public-1",
    kind: "subscription_features",
    productId: "course-public-1",
    moduleId: null,
    resourceId: null,
    updateId: null,
    subscriptionPlanId: "premium",
    featureId: null,
    title: "React course",
    parentTitle: "Premium",
    regularPrice: 49900,
    salePrice: null,
    effectivePrice: 49900,
    quantity: 1,
    alreadyOwned: false,
    entitlementId: "subscription_product_unlock:premium:course-public-1",
  },
];

test("subscription quote preserves server-resolved product ids independently of receipt lines", () => {
  const result = buildQuote({
    selection,
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "user-1",
    quoteId: "Q-sub-product",
    subscriptionLineItems: subscriptionLines,
    subscriptionExpiresAt: Date.now() + 30 * 86400000,
    subscriptionProductIds: ["course-public-1", "product-doc-1"],
  });

  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.quote.subscriptionProductIds, ["course-public-1", "product-doc-1"]);
  assert.equal(result.quote.verifiedLineItems.find((line) => line.productId)?.productId, "course-public-1");
});

test("subscription quote falls back to selected product ids for older callers", () => {
  const result = buildQuote({
    selection,
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "user-1",
    quoteId: "Q-sub-product-legacy",
    subscriptionLineItems: subscriptionLines,
  });

  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.quote.subscriptionProductIds, ["product-doc-1"]);
});

test("course access accepts Firestore document id as an alias of the public product id", () => {
  const result = resolveCourseAccess({
    product: {
      id: "course-public-1",
      documentId: "product-doc-1",
      canonicalModules: [{ id: "m-1", title: "Lesson", accessLevel: "included", resources: [], modules: [] }],
    },
    subscriptionProductIds: ["product-doc-1"],
  });

  assert.equal(result.hasFullProductAccess, true);
  assert.equal(result.accessibleModuleIds.has("m-1"), true);
  assert.equal(result.moduleAccessSources["m-1"], "full_product");
});

test("product ids survive quote, payment intent, replay, and subscription activation", () => {
  const quotes = read("api/_lib/quotes.ts");
  const createOrder = read("api/razorpay/create-order.ts");
  const verifyPayment = read("api/razorpay/verify-payment.ts");
  const entitlements = read("api/_lib/entitlements.ts");
  const subscriptions = read("api/_lib/subscriptions.ts");

  assert.match(quotes, /subscriptionProductIds = subContext\.selectedProductIds/);
  assert.match(quotes, /subscriptionProductIds,/);
  assert.ok((createOrder.match(/subscriptionProductIds:/g) || []).length >= 2, "free and paid intents must both store product ids");
  assert.match(verifyPayment, /subscriptionProductIds: Array\.isArray\(intent\.subscriptionProductIds\)/);
  assert.match(entitlements, /quote\.subscriptionProductIds/);
  assert.match(entitlements, /includedProductIds: Array\.from\(new Set/);
  assert.match(subscriptions, /mergeSubscriptionAccess/);
  assert.match(subscriptions, /\.\.\.plan\.includedProductIds/);
});

test("subscription picker uses document ids and server resolves legacy public ids", () => {
  const picker = read("src/subscription/components/CourseSelectModal.tsx");
  const server = read("api/_lib/subscriptions.ts");

  assert.match(picker, /product\.documentId \|\| product\.id/);
  assert.match(server, /loadSubscriptionProductByAnyId/);
  assert.match(server, /where\("id", "==", candidate\)/);
  assert.match(server, /selectedProductIds\.add\(publicProductId\)/);
  assert.match(server, /selectedProductIds\.add\(product\.documentId\)/);
});

test("active subscription products appear in the learner library", () => {
  const hook = read("src/hooks/useCourseAccess.ts");
  const purchases = read("src/components/OtherTabs.tsx");

  assert.match(hook, /setSubscriptionProductIds/);
  assert.match(hook, /isSubscriptionRecordActive\(record\)/);
  assert.match(hook, /data\.includedProductIds\.map\(String\)/);
  assert.match(purchases, /product\.documentId/);
});

test("an existing verified order can self-repair without another payment", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  const verify = read("api/razorpay/verify-payment.ts");
  const replayStart = verify.indexOf('if (intent.status === "verified")');
  const missingProofCheck = verify.indexOf('if (!isFree && (!paymentId || !signature))');

  assert.match(page, /activeSubscription\?\.orderId/);
  assert.match(page, /\/api\/razorpay\/verify-payment/);
  assert.match(page, /JSON\.stringify\(\{ orderId \}\)/);
  assert.ok(replayStart >= 0 && missingProofCheck > replayStart, "verified-owner replay must run before new-payment proof validation");
  assert.match(verify.slice(replayStart, missingProofCheck), /grantSubscriptionFromQuote/);
});
