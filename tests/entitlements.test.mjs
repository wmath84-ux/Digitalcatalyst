// tests/entitlements.test.mjs
//
// Part 6 — unit tests for the pure entitlement engine in
// `utils/entitlements.js`. These cover entitlement-id derivation,
// grantability, the replay-detection predicate, the partition
// helper, and the receipt builder. The Firestore-transactional
// writer (`api/_lib/entitlements.ts`) is exercised by the contract
// tests in `tests/entitlementsContract.test.mjs`.

import test from "node:test";
import assert from "node:assert/strict";
import {
  ENTITLEMENT_KINDS,
  toEntitlementKind,
  isGrantableLine,
  deriveEntitlementId,
  buildEntitlementDocId,
  buildEntitlementRecord,
  collectGrantableEntitlementIds,
  isQuoteReplayable,
  isEntitlementActive,
  partitionGrantable,
  buildSuccessReceipt,
} from "../utils/entitlements.js";

const baseLine = (overrides = {}) => ({
  id: "line-1",
  kind: "full_product",
  productId: "p-1",
  moduleId: null,
  resourceId: null,
  updateId: null,
  title: "React course",
  parentTitle: "",
  regularPrice: 199900,
  salePrice: null,
  effectivePrice: 199900,
  quantity: 1,
  alreadyOwned: false,
  entitlementId: "ent:p-1:full",
  ...overrides,
});

const baseQuote = (overrides = {}) => ({
  quoteId: "Q-1",
  uid: "u-1",
  purchaseKind: "full_product",
  verifiedLineItems: [baseLine()],
  regularSubtotal: 199900,
  saleDiscount: 0,
  couponDiscount: 0,
  eduCoinDiscount: 0,
  eduCoinsReserved: 0,
  cashPayable: 199900,
  minimumPayable: 0,
  currency: "INR",
  expiresAt: Date.now() + 60_000,
  status: "active",
  ...overrides,
});

// -----------------------------------------------------------------------
// toEntitlementKind
// -----------------------------------------------------------------------

test("toEntitlementKind maps Part 1 purchase kinds to Part 6 entitlement kinds", () => {
  assert.equal(toEntitlementKind("full_product"), "full_product");
  assert.equal(toEntitlementKind("selected_modules"), "module");
  assert.equal(toEntitlementKind("selected_resources"), "resource");
  assert.equal(toEntitlementKind("paid_update"), "paid_update");
  assert.equal(toEntitlementKind("cart_bundle"), "full_product");
  assert.equal(toEntitlementKind("free_entitlement"), "free");
  assert.equal(toEntitlementKind("subscription"), null);
  assert.equal(toEntitlementKind("subscription_features"), null);
  assert.equal(toEntitlementKind(null), null);
});

test("ENTITLEMENT_KINDS is the Part 6 set", () => {
  assert.equal(ENTITLEMENT_KINDS.size, 5);
  for (const k of ["full_product", "module", "resource", "paid_update", "free"]) {
    assert.ok(ENTITLEMENT_KINDS.has(k), `ENTITLEMENT_KINDS missing ${k}`);
  }
});

// -----------------------------------------------------------------------
// isGrantableLine
// -----------------------------------------------------------------------

test("isGrantableLine accepts the five Part 6 kinds and rejects already-owned", () => {
  assert.equal(isGrantableLine(baseLine({ kind: "full_product" })), true);
  assert.equal(isGrantableLine(baseLine({ kind: "selected_modules" })), true);
  assert.equal(isGrantableLine(baseLine({ kind: "selected_resources" })), true);
  assert.equal(isGrantableLine(baseLine({ kind: "paid_update" })), true);
  assert.equal(isGrantableLine(baseLine({ kind: "free_entitlement" })), true);
  assert.equal(isGrantableLine(baseLine({ kind: "subscription" })), false);
  assert.equal(isGrantableLine(baseLine({ kind: "subscription_features" })), false);
  assert.equal(isGrantableLine(baseLine({ alreadyOwned: true })), false);
  assert.equal(isGrantableLine(null), false);
  assert.equal(isGrantableLine(undefined), false);
});

// -----------------------------------------------------------------------
// deriveEntitlementId
// -----------------------------------------------------------------------

test("deriveEntitlementId trusts the line's own entitlementId when present", () => {
  assert.equal(deriveEntitlementId(baseLine({ entitlementId: "ent:custom" })), "ent:custom");
});

test("deriveEntitlementId falls back to productId for full_product", () => {
  const line = baseLine({ kind: "full_product", productId: "p-2", entitlementId: "" });
  assert.equal(deriveEntitlementId(line), "product:p-2");
});

test("deriveEntitlementId falls back to productId+moduleId for selected_modules", () => {
  const line = baseLine({ kind: "selected_modules", productId: "p-1", moduleId: "m-1", entitlementId: "" });
  assert.equal(deriveEntitlementId(line), "module:p-1:m-1");
});

test("deriveEntitlementId falls back to productId+resourceId for selected_resources", () => {
  const line = baseLine({ kind: "selected_resources", productId: "p-1", resourceId: "r-1", entitlementId: "" });
  assert.equal(deriveEntitlementId(line), "resource:p-1:r-1");
});

test("deriveEntitlementId falls back to productId+updateId for paid_update", () => {
  const line = baseLine({ kind: "paid_update", productId: "p-1", updateId: "u-1", entitlementId: "" });
  assert.equal(deriveEntitlementId(line), "update:p-1:u-1");
});

test("deriveEntitlementId returns null when required ids are missing", () => {
  assert.equal(deriveEntitlementId(baseLine({ kind: "selected_modules", moduleId: null, entitlementId: "" })), null);
  assert.equal(deriveEntitlementId(baseLine({ kind: "paid_update", updateId: null, entitlementId: "" })), null);
});

// -----------------------------------------------------------------------
// buildEntitlementDocId
// -----------------------------------------------------------------------

test("buildEntitlementDocId composes uid + entitlementId", () => {
  assert.equal(buildEntitlementDocId("u-1", "ent:p-1:full"), "u-1__ent:p-1:full");
});

test("buildEntitlementDocId returns null for missing inputs", () => {
  assert.equal(buildEntitlementDocId(null, "e"), null);
  assert.equal(buildEntitlementDocId("u", null), null);
  assert.equal(buildEntitlementDocId("", ""), null);
});

// -----------------------------------------------------------------------
// buildEntitlementRecord
// -----------------------------------------------------------------------

test("buildEntitlementRecord produces a spec-shaped record", () => {
  const record = buildEntitlementRecord({
    uid: "u-1",
    line: baseLine(),
    orderId: "O-1",
    paymentId: "P-1",
    source: "razorpay",
    now: 1700000000000,
  });
  assert.equal(record.uid, "u-1");
  assert.equal(record.productId, "p-1");
  assert.equal(record.kind, "full_product");
  assert.equal(record.moduleId, null);
  assert.equal(record.resourceId, null);
  assert.equal(record.updateId, null);
  assert.equal(record.entitlementId, "ent:p-1:full");
  assert.equal(record.orderId, "O-1");
  assert.equal(record.paymentId, "P-1");
  assert.equal(record.status, "active");
  assert.equal(record.amount, 199900);
  assert.equal(record.currency, "INR");
  assert.equal(record.source, "razorpay");
  assert.equal(record.unlockedAt, 1700000000000);
});

test("buildEntitlementRecord returns null for non-Part-6 kinds", () => {
  const record = buildEntitlementRecord({
    uid: "u-1",
    line: baseLine({ kind: "subscription" }),
    orderId: "O-1",
    paymentId: "P-1",
    source: "razorpay",
    now: 1,
  });
  assert.equal(record, null);
});

// -----------------------------------------------------------------------
// collectGrantableEntitlementIds
// -----------------------------------------------------------------------

test("collectGrantableEntitlementIds returns one id per grantable line", () => {
  const quote = baseQuote({
    verifiedLineItems: [
      baseLine({ id: "l1", entitlementId: "ent-1", kind: "full_product" }),
      baseLine({ id: "l2", entitlementId: "ent-2", kind: "paid_update", productId: "p-1", updateId: "u-1" }),
      baseLine({ id: "l3", entitlementId: "ent-3", kind: "subscription", alreadyOwned: false }),
    ],
  });
  const ids = collectGrantableEntitlementIds(quote);
  assert.equal(ids.size, 2);
  assert.ok(ids.has("ent-1"));
  assert.ok(ids.has("ent-2"));
});

test("collectGrantableEntitlementIds skips already-owned and returns empty on null quote", () => {
  const quote = baseQuote({
    verifiedLineItems: [baseLine({ alreadyOwned: true })],
  });
  assert.equal(collectGrantableEntitlementIds(quote).size, 0);
  assert.equal(collectGrantableEntitlementIds(null).size, 0);
});

// -----------------------------------------------------------------------
// isQuoteReplayable
// -----------------------------------------------------------------------

test("isQuoteReplayable is true only when status === consumed and consumedOrderId is set", () => {
  assert.equal(isQuoteReplayable(baseQuote({ status: "active" })), false);
  assert.equal(isQuoteReplayable(baseQuote({ status: "consumed" })), false);
  assert.equal(
    isQuoteReplayable(baseQuote({ status: "consumed", consumedAt: 1, consumedOrderId: "O-1" })),
    true,
  );
  assert.equal(isQuoteReplayable(null), false);
});

// -----------------------------------------------------------------------
// isEntitlementActive
// -----------------------------------------------------------------------

test("isEntitlementActive is true when status is active and no expiry", () => {
  const record = buildEntitlementRecord({
    uid: "u-1",
    line: baseLine(),
    orderId: "O-1",
    paymentId: "P-1",
    source: "razorpay",
    now: 1,
  });
  assert.equal(isEntitlementActive(record, 100), true);
  assert.equal(isEntitlementActive({ status: "revoked" }, 100), false);
  assert.equal(isEntitlementActive({ status: "active", expiresAt: 50 }, 100), false);
  assert.equal(isEntitlementActive({ status: "active", expiresAt: 200 }, 100), true);
  assert.equal(isEntitlementActive(null, 100), false);
});

// -----------------------------------------------------------------------
// partitionGrantable
// -----------------------------------------------------------------------

test("partitionGrantable splits by isGrantableLine", () => {
  const quote = baseQuote({
    verifiedLineItems: [
      baseLine({ id: "l1", kind: "full_product" }),
      baseLine({ id: "l2", kind: "subscription" }),
      baseLine({ id: "l3", kind: "paid_update", productId: "p-1", updateId: "u-1" }),
      baseLine({ id: "l4", kind: "full_product", alreadyOwned: true }),
    ],
  });
  const { grantable, skip } = partitionGrantable(quote);
  assert.equal(grantable.length, 2);
  assert.deepEqual(grantable.map((line) => line.id), ["l1", "l3"]);
  assert.deepEqual(skip.map((line) => line.id), ["l2", "l4"]);
});

test("partitionGrantable on null quote returns two empty arrays", () => {
  const { grantable, skip } = partitionGrantable(null);
  assert.equal(grantable.length, 0);
  assert.equal(skip.length, 0);
});

// -----------------------------------------------------------------------
// buildSuccessReceipt
// -----------------------------------------------------------------------

test("buildSuccessReceipt assembles the spec-shaped receipt", () => {
  const quote = baseQuote({
    verifiedLineItems: [
      baseLine({ id: "l1", alreadyOwned: false }),
      baseLine({ id: "l2", kind: "paid_update", productId: "p-1", updateId: "u-1", alreadyOwned: true }),
    ],
  });
  const receipt = buildSuccessReceipt({
    quote,
    orderId: "O-1",
    paymentId: "P-1",
    paymentMethod: "Razorpay",
    grantedEntitlementIds: ["ent:p-1:full"],
  });
  assert.equal(receipt.orderId, "O-1");
  assert.equal(receipt.paymentId, "P-1");
  assert.equal(receipt.paymentMethod, "Razorpay");
  assert.equal(receipt.quoteId, "Q-1");
  assert.equal(receipt.purchaseKind, "full_product");
  assert.equal(receipt.lineItems.length, 2);
  assert.equal(receipt.newItems.length, 1);
  assert.equal(receipt.cashPaid, 199900);
  assert.equal(receipt.currency, "INR");
  assert.deepEqual(receipt.grantedEntitlementIds, ["ent:p-1:full"]);
  assert.equal(receipt.issuedAt > 0, true);
});

test("buildSuccessReceipt handles null quote by returning null", () => {
  assert.equal(buildSuccessReceipt({ quote: null }), null);
});

test("buildSuccessReceipt uses quote.quoteId when orderId is omitted", () => {
  const receipt = buildSuccessReceipt({ quote: baseQuote(), paymentId: "P-2" });
  assert.equal(receipt.orderId, "Q-1");
  assert.equal(receipt.paymentId, "P-2");
});

test("buildSuccessReceipt max()s cashPayable vs minimumPayable", () => {
  const quote = baseQuote({ cashPayable: 0, minimumPayable: 9900 });
  const receipt = buildSuccessReceipt({ quote });
  assert.equal(receipt.cashPaid, 9900);
});
