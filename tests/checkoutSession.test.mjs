// tests/checkoutSession.test.mjs
//
// Pure unit tests for the validated sessionStorage round-trip that
// replaces the old mutable `src/data/checkoutData.ts` singleton +
// `Object.assign` flow. The new flow is:
//
//   1. PDP CTA builds a `CheckoutSessionRecordV1` and writes it to
//      sessionStorage via `writeToSessionStorage`.
//   2. `CheckoutProvider` reads the record on mount via
//      `readFromSessionStorage`.
//   3. Any version mismatch / missing field is dropped so the next
//      user action is forced to start a new checkout.
//
// These tests pass a tiny in-memory storage shim — no `window`, no
// `document`, no React.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckoutSessionRecord,
  CHECKOUT_SESSION_SCHEMA_VERSION,
  CHECKOUT_SESSION_STORAGE_KEY,
  clearCheckoutSessionRecord,
  parseCheckoutSessionRecord,
  readCheckoutSessionRecord,
  writeCheckoutSessionRecord,
} from "../utils/checkoutSession.js";

const makeStorage = (initial = {}) => {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    removeItem: (k) => { delete map[k]; },
  };
};

const buildSelection = (overrides = {}) => ({
  purchaseKind: "full_product",
  productIds: ["prod_1"],
  moduleIds: [],
  resourceIds: [],
  updateId: null,
  subscriptionPlanId: null,
  billingCycle: null,
  featureIds: [],
  couponCode: null,
  requestedEduCoins: 0,
  returnRoute: null,
  ...overrides,
});

const buildBuyer = (overrides = {}) => ({
  uid: "u_1",
  name: "Jane Doe",
  email: "jane@example.com",
  mobile: "+91 9999999999",
  emailVerified: true,
  tokenVerified: true,
  coins: 0,
  ...overrides,
});

const buildReturnRoute = (overrides = {}) => ({
  hash: "#/product/prod_1",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

test("buildCheckoutSessionRecord produces a schema-1 record", () => {
  const record = buildCheckoutSessionRecord({
    selection: buildSelection(),
    buyer: buildBuyer(),
    returnRoute: buildReturnRoute(),
  });
  assert.ok(record, "expected a record");
  assert.equal(record.schemaVersion, CHECKOUT_SESSION_SCHEMA_VERSION);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.selection.purchaseKind, "full_product");
  assert.equal(record.buyer.uid, "u_1");
  assert.equal(record.returnRoute.hash, "#/product/prod_1");
  assert.equal(record.quote, null);
  assert.equal(record.idempotencyKey, null);
});

test("writeCheckoutSessionRecord persists the record to the storage shim", () => {
  const storage = makeStorage();
  const record = buildCheckoutSessionRecord({
    selection: buildSelection(),
    buyer: buildBuyer(),
    returnRoute: buildReturnRoute(),
  });
  assert.equal(writeCheckoutSessionRecord(storage, record), true);
  const raw = storage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
  assert.ok(raw, "expected a stored value");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.selection.purchaseKind, "full_product");
});

test("readCheckoutSessionRecord round-trips a valid record", () => {
  const storage = makeStorage();
  const original = buildCheckoutSessionRecord({
    selection: buildSelection({ moduleIds: ["mod_a", "mod_b"] }),
    buyer: buildBuyer(),
    returnRoute: buildReturnRoute(),
    idempotencyKey: "idem_abc",
  });
  writeCheckoutSessionRecord(storage, original);
  const back = readCheckoutSessionRecord(storage);
  assert.ok(back, "expected a record back");
  assert.equal(back.schemaVersion, 1);
  assert.deepEqual(back.selection.moduleIds, ["mod_a", "mod_b"]);
  assert.equal(back.idempotencyKey, "idem_abc");
  assert.equal(back.buyer.uid, "u_1");
});

test("readCheckoutSessionRecord returns null for a missing key", () => {
  const storage = makeStorage();
  assert.equal(readCheckoutSessionRecord(storage), null);
});

test("readCheckoutSessionRecord returns null for a non-JSON value", () => {
  const storage = makeStorage({ [CHECKOUT_SESSION_STORAGE_KEY]: "not-json{" });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

test("readCheckoutSessionRecord returns null for an empty string", () => {
  const storage = makeStorage({ [CHECKOUT_SESSION_STORAGE_KEY]: "" });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

// ---------------------------------------------------------------------------
// Versioning — old tabs with a different schema must NOT crash the app.
// ---------------------------------------------------------------------------

test("readCheckoutSessionRecord rejects a record with a different schema version", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 999,
      selection: buildSelection(),
      buyer: buildBuyer(),
      returnRoute: buildReturnRoute(),
    }),
  });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

test("readCheckoutSessionRecord rejects a record with no schemaVersion", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      selection: buildSelection(),
      buyer: buildBuyer(),
      returnRoute: buildReturnRoute(),
    }),
  });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

// ---------------------------------------------------------------------------
// Sanitisation — bad data must not leak into the React context.
// ---------------------------------------------------------------------------

test("readCheckoutSessionRecord drops an unknown purchaseKind", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      selection: { purchaseKind: "wat" },
      buyer: buildBuyer(),
      returnRoute: buildReturnRoute(),
    }),
  });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

test("readCheckoutSessionRecord drops a record with no buyer uid", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      selection: buildSelection(),
      buyer: { uid: "" },
      returnRoute: buildReturnRoute(),
    }),
  });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

test("readCheckoutSessionRecord drops a record with no returnRoute", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      selection: buildSelection(),
      buyer: buildBuyer(),
    }),
  });
  assert.equal(readCheckoutSessionRecord(storage), null);
});

test("readCheckoutSessionRecord sanitises oversized id lists", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      selection: {
        purchaseKind: "full_product",
        productIds: Array.from({ length: 200 }, (_, i) => `p_${i}`),
        moduleIds: Array.from({ length: 200 }, (_, i) => `m_${i}`),
        resourceIds: Array.from({ length: 200 }, (_, i) => `r_${i}`),
      },
      buyer: buildBuyer(),
      returnRoute: buildReturnRoute(),
    }),
  });
  const back = readCheckoutSessionRecord(storage);
  assert.ok(back, "expected the record back");
  assert.equal(back.selection.productIds.length, 50, "capped at 50");
  assert.equal(back.selection.moduleIds.length, 50, "capped at 50");
  assert.equal(back.selection.resourceIds.length, 50, "capped at 50");
});

test("readCheckoutSessionRecord strips unparseable quote fields", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      selection: buildSelection(),
      buyer: buildBuyer(),
      returnRoute: buildReturnRoute(),
      quote: {
        quoteId: "Q-1",
        uid: "u_1",
        purchaseKind: "full_product",
        verifiedLineItems: [{ id: "li_1", kind: "full_product", productId: "p_1", title: "T", regularPrice: 100, effectivePrice: 100, quantity: 1, alreadyOwned: false, entitlementId: "p_1" }],
        regularSubtotal: 100,
        saleDiscount: 0,
        couponDiscount: 0,
        eduCoinDiscount: 0,
        eduCoinsReserved: 0,
        cashPayable: 100,
        minimumPayable: 0,
        currency: "INR",
        expiresAt: 0,
      },
    }),
  });
  const back = readCheckoutSessionRecord(storage);
  assert.ok(back, "expected the record back");
  assert.ok(back.quote, "expected the quote to be present");
  assert.equal(back.quote.quoteId, "Q-1");
  assert.equal(back.quote.verifiedLineItems.length, 1);
  assert.equal(back.quote.verifiedLineItems[0].id, "li_1");
  assert.equal(back.quote.verifiedLineItems[0].title, "T");
});

test("readCheckoutSessionRecord drops a record with an unparseable quote", () => {
  const storage = makeStorage({
    [CHECKOUT_SESSION_STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      selection: buildSelection(),
      buyer: buildBuyer(),
      returnRoute: buildReturnRoute(),
      quote: { quoteId: 42 }, // missing required fields
    }),
  });
  const back = readCheckoutSessionRecord(storage);
  assert.ok(back, "record should be retained");
  assert.equal(back.quote, null, "unparseable quote must be dropped, not the whole record");
});

// ---------------------------------------------------------------------------
// Storage safety
// ---------------------------------------------------------------------------

test("clearCheckoutSessionRecord removes the record from the storage shim", () => {
  const storage = makeStorage({ [CHECKOUT_SESSION_STORAGE_KEY]: "{}" });
  assert.equal(clearCheckoutSessionRecord(storage), true);
  // The shim returns `null` (not `undefined`) when the key has been
  // removed. Both are acceptable for "no value".
  const after = storage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
  assert.ok(after === undefined || after === null, `expected key removed, got ${after}`);
});

test("writeCheckoutSessionRecord refuses a null record", () => {
  const storage = makeStorage();
  assert.equal(writeCheckoutSessionRecord(storage, null), false);
});

test("writeCheckoutSessionRecord refuses when storage is null", () => {
  assert.equal(writeCheckoutSessionRecord(null, { schemaVersion: 1 }), false);
});

test("readCheckoutSessionRecord refuses when storage is null", () => {
  assert.equal(readCheckoutSessionRecord(null), null);
});

test("parseCheckoutSessionRecord rejects the legacy {product, user} shape from the old singleton", () => {
  // The old flow stored a {product, user} object. The new flow must
  // never accept it — even if an old tab has a stale value sitting in
  // sessionStorage, the new provider should treat it as invalid.
  const legacy = {
    product: { id: "p_legacy", name: "Legacy", price: 1499 },
    user: { id: "u_legacy", name: "Legacy", email: "x@y.z" },
  };
  assert.equal(parseCheckoutSessionRecord(legacy), null);
});
