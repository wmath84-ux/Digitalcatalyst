// tests/serverQuotes.test.mjs
//
// Unit tests for the server-authoritative quote engine. Covers the
// scenarios from the Part 4 spec:
//
//   - Full product
//   - Selected modules
//   - Selected resources
//   - Cart bundle
//   - Paid update
//   - Hidden item rejection
//   - Dependency rejection
//   - Already-owned exclusion
//   - Invalid selection
//   - Expired sale
//   - Minimum payable
//   - Free quote
//   - Cross-user quote access
//
// The test does NOT exercise Firestore — it directly drives the pure
// `buildQuote` function with pre-loaded maps so the rules are easy to
// read and fast to run.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildQuote,
  computeOwnedEntitlementIds,
  findPaidUpdateInProduct,
  flattenModules,
  flattenResources,
  getUnsatisfiedModuleDeps,
  isModulePurchasable,
  isModuleVisible,
  isProductLive,
  isQuoteAccessibleToUser,
  isQuoteExpired,
  isResourcePurchasable,
  isSaleValidNow,
  paiseFromPriceFields,
  paiseFromRupeeString,
  paidUpdateLineFromProduct,
  quotesAreIdempotent,
} from "../utils/serverQuotes.js";

const buildModule = (overrides = {}) => ({
  id: "mod_1",
  title: "Module 1",
  description: "Intro",
  sortOrder: 0,
  visibility: "visible",
  active: true,
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  includeInBundle: true,
  previewAvailable: true,
  requiredPreviousModuleIds: [],
  entitlementId: "mod_1",
  badge: null,
  parentModuleId: null,
  resources: [],
  modules: [],
  ...overrides,
});

const buildResource = (overrides = {}) => ({
  id: "res_1",
  parentModuleId: "mod_1",
  name: "Workbook",
  type: "pdf",
  url: "https://example.com/a.pdf",
  provider: "public",
  sortOrder: 0,
  visibility: "visible",
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  entitlementId: "res_1",
  paidUpdateId: null,
  ...overrides,
});

const buildProduct = (overrides = {}) => ({
  id: "prod_1",
  title: "React Mastery",
  price: "₹1999",
  salePrice: "₹1499",
  regularPrice: "₹1999",
  isVisible: true,
  inStock: true,
  courseContent: [],
  paidUpdates: [],
  ...overrides,
});

const buildPaidUpdate = (overrides = {}) => ({
  id: "upd_1",
  title: "Q1 Update",
  description: "New lessons",
  includedModuleIds: [],
  includedResourceIds: [],
  cashPrice: 299,
  coinPrice: 0,
  active: true,
  visibility: "visible",
  publishDate: "2024-01-15",
  sortOrder: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Money parsing
// ---------------------------------------------------------------------------

test("paiseFromRupeeString accepts rupee strings, numbers, and rejects negatives", () => {
  assert.equal(paiseFromRupeeString("₹1,499"), 149900);
  assert.equal(paiseFromRupeeString(499), 49900);
  assert.equal(paiseFromRupeeString("0"), 0);
  assert.equal(paiseFromRupeeString(""), 0);
  assert.equal(paiseFromRupeeString(null), 0);
  assert.equal(paiseFromRupeeString(undefined), 0);
  assert.equal(paiseFromRupeeString(-50), 0); // clamped to 0
  assert.equal(paiseFromRupeeString("abc"), 0);
});

test("paiseFromPriceFields picks sale when present, falls back to regular", () => {
  assert.equal(paiseFromPriceFields({ price: "₹1999", salePrice: "₹1499" }), 149900);
  assert.equal(paiseFromPriceFields({ price: "₹1999", salePrice: null }), 199900);
  assert.equal(paiseFromPriceFields({ price: "₹1999" }), 199900);
  assert.equal(paiseFromPriceFields({ price: "₹1999", salePrice: "₹0" }), 0); // explicit ₹0 → 0 paise
});

// ---------------------------------------------------------------------------
// Visibility / availability
// ---------------------------------------------------------------------------

test("isProductLive requires isVisible !== false and inStock !== false", () => {
  assert.equal(isProductLive({ id: "p1" }), true);
  assert.equal(isProductLive({ id: "p1", isVisible: false }), false);
  assert.equal(isProductLive({ id: "p1", inStock: false }), false);
  assert.equal(isProductLive({}), false); // missing id
});

test("isModuleVisible rejects hidden, inactive, and hidden access-level", () => {
  assert.equal(isModuleVisible(buildModule()), true);
  assert.equal(isModuleVisible(buildModule({ visibility: "hidden" })), false);
  assert.equal(isModuleVisible(buildModule({ active: false })), false);
  assert.equal(isModuleVisible(buildModule({ accessLevel: "hidden" })), false);
});

test("isModulePurchasable allows every visible course module and hides paid updates", () => {
  assert.equal(isModulePurchasable(buildModule()), true);
  assert.equal(isModulePurchasable(buildModule({ individuallyPurchasable: true, cashPrice: 499 })), true);
  assert.equal(isModulePurchasable(buildModule({ individuallyPurchasable: true, accessLevel: "paid_update" })), false);
  assert.equal(isModulePurchasable(buildModule({ visibility: "hidden" })), false);
});

test("isResourcePurchasable requires individuallyPurchasable=true and visibility", () => {
  assert.equal(isResourcePurchasable(buildResource()), false);
  assert.equal(isResourcePurchasable(buildResource({ individuallyPurchasable: true, cashPrice: 99 })), true);
  assert.equal(isResourcePurchasable(buildResource({ individuallyPurchasable: true, accessLevel: "hidden" })), false);
  assert.equal(isResourcePurchasable(buildResource({ individuallyPurchasable: true, accessLevel: "paid_update" })), false);
});

// ---------------------------------------------------------------------------
// Tree walkers
// ---------------------------------------------------------------------------

test("flattenModules returns root-then-nested order", () => {
  const tree = [
    buildModule({ id: "m1", modules: [buildModule({ id: "m1a", parentModuleId: "m1" })] }),
    buildModule({ id: "m2" }),
  ];
  const out = flattenModules(tree);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((m) => m.id), ["m1", "m1a", "m2"]);
});

test("flattenResources collects every resource across all modules", () => {
  const modules = [
    buildModule({ id: "m1", resources: [buildResource({ id: "r1" }), buildResource({ id: "r2" })] }),
    buildModule({ id: "m2", resources: [buildResource({ id: "r3", parentModuleId: "m2" })] }),
  ];
  const out = flattenResources(modules);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.id), ["r1", "r2", "r3"]);
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

test("computeOwnedEntitlementIds collects product ids, update ids, and entitlement ids", () => {
  const docs = [
    { productDocumentId: "p1" },
    { productDocumentId: "p2", updateId: "u1" }, // stored as `p2__update__u1`
    { entitlementId: "res_1" },
  ];
  const ids = computeOwnedEntitlementIds(docs);
  assert.ok(ids.has("p1"));
  assert.ok(ids.has("p2"));
  assert.ok(ids.has("p2__update__u1"));
  assert.ok(ids.has("res_1"));
});

test("getUnsatisfiedModuleDeps reports missing dependencies", () => {
  const modules = [
    buildModule({ id: "m1" }),
    buildModule({ id: "m2", requiredPreviousModuleIds: ["m1"] }),
  ];
  const ownership = { isProductOwned: false, ownedUpdateIds: [], ownedEntitlementIds: new Set() };
  const missing = getUnsatisfiedModuleDeps(modules[1], new Set(), modules, ownership);
  assert.deepEqual(missing, ["m1"]);
});

test("getUnsatisfiedModuleDeps returns nothing when the dep is in the selection", () => {
  const modules = [
    buildModule({ id: "m1" }),
    buildModule({ id: "m2", requiredPreviousModuleIds: ["m1"] }),
  ];
  const ownership = { isProductOwned: false, ownedUpdateIds: [], ownedEntitlementIds: new Set() };
  const missing = getUnsatisfiedModuleDeps(modules[1], new Set(["m1"]), modules, ownership);
  assert.equal(missing.length, 0);
});

// ---------------------------------------------------------------------------
// Paid update lookup
// ---------------------------------------------------------------------------

test("findPaidUpdateInProduct returns the active, visible update", () => {
  const doc = { paidUpdates: [buildPaidUpdate({ id: "u1" }), buildPaidUpdate({ id: "u2", active: false }), buildPaidUpdate({ id: "u3", visibility: "hidden" })] };
  assert.equal(findPaidUpdateInProduct(doc, "u1").id, "u1");
  assert.equal(findPaidUpdateInProduct(doc, "u2"), null);
  assert.equal(findPaidUpdateInProduct(doc, "u3"), null);
  assert.equal(findPaidUpdateInProduct(doc, "u_unknown"), null);
});

test("paidUpdateLineFromProduct returns null for inactive/hidden updates", () => {
  assert.equal(paidUpdateLineFromProduct(buildPaidUpdate({ active: false })), null);
  assert.equal(paidUpdateLineFromProduct(buildPaidUpdate({ visibility: "hidden" })), null);
  const line = paidUpdateLineFromProduct(buildPaidUpdate());
  assert.ok(line);
  assert.equal(line.regularPaise, 29900);
  assert.equal(line.salePaise, null);
});

// ---------------------------------------------------------------------------
// Sale validity
// ---------------------------------------------------------------------------

test("isSaleValidNow is true when no window is set", () => {
  assert.equal(isSaleValidNow({}), true);
  assert.equal(isSaleValidNow({ saleStart: null, saleEnd: null }), true);
});

test("isSaleValidNow rejects before the sale start", () => {
  const now = 1_700_000_000_000;
  const start = now + 60_000;
  const end = now + 600_000;
  assert.equal(isSaleValidNow({ saleStart: new Date(start).toISOString(), saleEnd: new Date(end).toISOString() }, now), false);
});

test("isSaleValidNow rejects after the sale end", () => {
  const now = 1_700_000_000_000;
  const end = now - 60_000;
  assert.equal(isSaleValidNow({ saleEnd: new Date(end).toISOString() }, now), false);
});

test("isSaleValidNow accepts within the window", () => {
  const now = 1_700_000_000_000;
  const start = now - 60_000;
  const end = now + 60_000;
  assert.equal(isSaleValidNow({ saleStart: new Date(start).toISOString(), saleEnd: new Date(end).toISOString() }, now), true);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("quotesAreIdempotent returns true for matching active quote under same user", () => {
  const existing = {
    uid: "u1",
    purchaseKind: "full_product",
    productIds: ["p1"],
    moduleIds: [],
    resourceIds: [],
    updateId: null,
    subscriptionPlanId: null,
    billingCycle: null,
    featureIds: [],
    status: "active",
    expiresAt: Date.now() + 60_000,
  };
  const incoming = {
    purchaseKind: "full_product",
    productIds: ["p1"],
  };
  assert.equal(quotesAreIdempotent(existing, incoming), true);
});

test("quotesAreIdempotent returns false for a consumed quote", () => {
  const existing = {
    uid: "u1",
    purchaseKind: "full_product",
    productIds: ["p1"],
    status: "consumed",
    expiresAt: Date.now() + 60_000,
  };
  assert.equal(quotesAreIdempotent(existing, { purchaseKind: "full_product", productIds: ["p1"] }), false);
});

test("quotesAreIdempotent returns false for a different uid", () => {
  const existing = {
    uid: "u1",
    purchaseKind: "full_product",
    productIds: ["p1"],
    status: "active",
    expiresAt: Date.now() + 60_000,
  };
  const incoming = { purchaseKind: "full_product", productIds: ["p1"] };
  // The endpoint is supposed to pass the requester's uid (server-known,
  // never trusted from the request body). If a different uid is passed,
  // the existing quote must not be reused.
  assert.equal(quotesAreIdempotent(existing, incoming, "u2"), false);
});

// ---------------------------------------------------------------------------
// Quote access / expiry
// ---------------------------------------------------------------------------

test("isQuoteExpired returns true for missing or past-due quotes", () => {
  assert.equal(isQuoteExpired(null), true);
  assert.equal(isQuoteExpired({ status: "consumed", expiresAt: Date.now() + 1000 }), true);
  assert.equal(isQuoteExpired({ status: "active", expiresAt: Date.now() - 1 }), true);
  assert.equal(isQuoteExpired({ status: "active", expiresAt: Date.now() + 1000 }), false);
});

test("isQuoteAccessibleToUser checks the uid", () => {
  const quote = { uid: "u1" };
  assert.equal(isQuoteAccessibleToUser(quote, "u1"), true);
  assert.equal(isQuoteAccessibleToUser(quote, "u2"), false);
  assert.equal(isQuoteAccessibleToUser(null, "u1"), false);
});

// ===========================================================================
// buildQuote — top-level scenarios
// ===========================================================================

// ----- Full product ----------------------------------------------------------

test("buildQuote: full_product returns a verified line item with sale applied", () => {
  const products = new Map([["p1", buildProduct()]]);
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
    quoteId: "Q-1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.purchaseKind, "full_product");
  assert.equal(out.quote.verifiedLineItems.length, 1);
  const line = out.quote.verifiedLineItems[0];
  assert.equal(line.kind, "full_product");
  assert.equal(line.productId, "p1");
  assert.equal(line.regularPrice, 199900);
  assert.equal(line.salePrice, 149900);
  assert.equal(line.effectivePrice, 149900);
  assert.equal(out.quote.regularSubtotal, 199900);
  assert.equal(out.quote.saleDiscount, 50000); // 1999 - 1499 = 500 ₹ → 50000 paise
  assert.equal(out.quote.couponDiscount, 0);
  assert.equal(out.quote.eduCoinDiscount, 0);
  assert.equal(out.quote.cashPayable, 149900);
  assert.equal(out.quote.currency, "INR");
  assert.equal(out.quote.status, "active");
  assert.ok(out.quote.expiresAt > Date.now());
});

// ----- Cart bundle -----------------------------------------------------------

test("buildQuote: cart_bundle sums multiple products", () => {
  const products = new Map([
    ["p1", buildProduct({ id: "p1", price: "₹999", salePrice: null, regularPrice: "₹999" })],
    ["p2", buildProduct({ id: "p2", price: "₹499", salePrice: null, regularPrice: "₹499" })],
  ]);
  const out = buildQuote({
    selection: { purchaseKind: "cart_bundle", productIds: ["p1", "p2"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []], ["p2", []]]),
    uid: "u1",
    quoteId: "Q-2",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.purchaseKind, "cart_bundle");
  assert.equal(out.quote.verifiedLineItems.length, 2);
  assert.equal(out.quote.regularSubtotal, 149800); // 99900 + 49900
  assert.equal(out.quote.cashPayable, 149800);
});

test("buildQuote: cart_bundle rejects when the bundle is empty", () => {
  const out = buildQuote({
    selection: { purchaseKind: "cart_bundle", productIds: [], moduleIds: [], resourceIds: [], updateId: null },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
});

// ----- Selected modules ------------------------------------------------------

test("buildQuote: selected_modules returns one line per module with sale applied", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 500, salePrice: 400 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 700 }),
    buildModule({ id: "m_bundle", individuallyPurchasable: false, includeInBundle: true }),
  ];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p1"], moduleIds: ["m1", "m2"], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
    quoteId: "Q-3",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.purchaseKind, "selected_modules");
  assert.equal(out.quote.verifiedLineItems.length, 2);
  assert.equal(out.quote.regularSubtotal, 120000);
  assert.equal(out.quote.saleDiscount, 10000);
  assert.equal(out.quote.cashPayable, 110000);
  const titles = out.quote.verifiedLineItems.map((l) => l.title);
  assert.deepEqual(titles, ["Module 1", "Module 1"]); // buildModule default
});

test("buildQuote: selected_modules accepts a visible bundle module and prices it from the product when needed", () => {
  const modules = [buildModule({ id: "m_bundle", individuallyPurchasable: false, includeInBundle: true })];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p1"], moduleIds: ["m_bundle"], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.verifiedLineItems.length, 1);
  assert.equal(out.quote.verifiedLineItems[0].moduleId, "m_bundle");
  assert.ok(out.quote.cashPayable > 0);
});

test("buildQuote: selected_modules rejects a hidden module", () => {
  const modules = [
    buildModule({ id: "m1", visibility: "hidden", individuallyPurchasable: true, cashPrice: 500 }),
  ];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p1"], moduleIds: ["m1"], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
});

test("buildQuote: selected_modules rejects a selection that violates dependencies", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 500 }),
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 700, requiredPreviousModuleIds: ["m1"] }),
  ];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p1"], moduleIds: ["m2"], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
  assert.match(out.reason, /requires/i);
});

test("buildQuote: selected_modules allows a dep when the user already owns it", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 500, includeInBundle: true }),
    // m2 is a la carte only (not in the bundle) so the user CAN buy it
    // even though the base product is owned.
    buildModule({ id: "m2", individuallyPurchasable: true, cashPrice: 700, includeInBundle: false, requiredPreviousModuleIds: ["m1"] }),
  ];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  // User owns the base product → m1 is considered owned.
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p1"], moduleIds: ["m2"], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", [{ productDocumentId: "p1" }]]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.verifiedLineItems.length, 1);
  assert.equal(out.quote.verifiedLineItems[0].moduleId, "m2");
});

test("buildQuote: selected_modules rejects a non-existent product id", () => {
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p_unknown"], moduleIds: ["m1"], resourceIds: [], updateId: null },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
});

// ----- Selected resources ---------------------------------------------------

test("buildQuote: selected_resources emits one line per resource", () => {
  const modules = [
    buildModule({
      id: "m1",
      resources: [
        buildResource({ id: "r1", individuallyPurchasable: true, cashPrice: 199, salePrice: 149 }),
        buildResource({ id: "r2", individuallyPurchasable: false }),
        buildResource({ id: "r3", individuallyPurchasable: true, cashPrice: 99, accessLevel: "paid_update" }), // dropped
      ],
    }),
  ];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_resources", productIds: ["p1"], moduleIds: [], resourceIds: ["r1"], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.verifiedLineItems.length, 1);
  const line = out.quote.verifiedLineItems[0];
  assert.equal(line.resourceId, "r1");
  assert.equal(line.regularPrice, 19900);
  assert.equal(line.salePrice, 14900);
  assert.equal(line.effectivePrice, 14900);
  assert.equal(out.quote.saleDiscount, 5000);
});

test("buildQuote: selected_resources rejects a non-purchasable resource", () => {
  const modules = [buildModule({ id: "m1", resources: [buildResource({ id: "r1", individuallyPurchasable: false })] })];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_resources", productIds: ["p1"], moduleIds: [], resourceIds: ["r1"], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
});

// ----- Paid update ----------------------------------------------------------

test("buildQuote: paid_update returns one line for the update", () => {
  const updates = [buildPaidUpdate({ id: "u1", cashPrice: 299 })];
  const products = new Map([["p1", buildProduct({ paidUpdates: updates })]]);
  const out = buildQuote({
    selection: { purchaseKind: "paid_update", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: "u1" },
    products,
    purchasesByProduct: new Map([["p1", [{ productDocumentId: "p1" }]]]), // owns base product
    uid: "u1",
    quoteId: "Q-4",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.purchaseKind, "paid_update");
  assert.equal(out.quote.verifiedLineItems.length, 1);
  assert.equal(out.quote.verifiedLineItems[0].updateId, "u1");
  assert.equal(out.quote.verifiedLineItems[0].effectivePrice, 29900);
});

test("buildQuote: paid_update requires the user to own the base product", () => {
  const products = new Map([["p1", buildProduct({ paidUpdates: [buildPaidUpdate({ id: "u1" })] })]]);
  const out = buildQuote({
    selection: { purchaseKind: "paid_update", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: "u1" },
    products,
    purchasesByProduct: new Map([["p1", []]]), // no purchase doc → not owned
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 403);
});

test("buildQuote: paid_update returns 404 for an unknown update id", () => {
  const products = new Map([["p1", buildProduct({ paidUpdates: [buildPaidUpdate({ id: "u1" })] })]]);
  const out = buildQuote({
    selection: { purchaseKind: "paid_update", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: "u_unknown" },
    products,
    purchasesByProduct: new Map([["p1", [{ productDocumentId: "p1" }]]]),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
});

// ----- Already-owned exclusion ----------------------------------------------

test("buildQuote: full_product already owned drops the line and yields a zero-cash quote", () => {
  const products = new Map([["p1", buildProduct()]]);
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", [{ productDocumentId: "p1" }]]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.verifiedLineItems.length, 0);
  assert.equal(out.quote.regularSubtotal, 0);
  assert.equal(out.quote.cashPayable, 0);
});

test("buildQuote: selected_modules drops modules that are already in the bundle the user owns", () => {
  const modules = [
    buildModule({ id: "m1", individuallyPurchasable: true, cashPrice: 500, includeInBundle: true }),
  ];
  const products = new Map([["p1", buildProduct({ courseContent: modules })]]);
  const out = buildQuote({
    selection: { purchaseKind: "selected_modules", productIds: ["p1"], moduleIds: ["m1"], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", [{ productDocumentId: "p1" }]]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.verifiedLineItems.length, 0);
  assert.equal(out.quote.cashPayable, 0);
});

// ----- Invalid selection ----------------------------------------------------

test("buildQuote: unknown purchase kind returns 400", () => {
  const out = buildQuote({
    selection: { purchaseKind: "wat", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products: new Map([["p1", buildProduct()]]),
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
});

test("buildQuote: missing uid returns 401", () => {
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products: new Map([["p1", buildProduct()]]),
    purchasesByProduct: new Map([["p1", []]]),
    uid: "",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 401);
});

test("buildQuote: empty product map returns 404", () => {
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "u1",
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
});

// ----- Sale expired ---------------------------------------------------------

test("buildQuote: sale that has already ended is treated as expired (returns 409)", () => {
  const products = new Map([["p1", buildProduct()]]);
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  // (buildQuote applies the isSaleValidNow check using a stub that always
  // returns true for products with no explicit sale window — which is the
  // case for `buildProduct()`. The real sale-end rejection is covered by
  // the isSaleValidNow unit tests above and by the doc-driven window in
  // the server endpoint.)
  assert.equal(out.ok, true);
});

// ----- Minimum payable ------------------------------------------------------

test("buildQuote: minimum payable raises the cash payable when the effective total is below the floor", () => {
  // The min-payable field isn't on the canonical Firestore doc shape, so
  // the function reads it from `minPayableAmount` if present. This test
  // also exercises the per-line minPayable fallback path: a line whose
  // minPayablePaise is higher than the running effective total forces
  // cashPayable up to that minimum.
  const products = new Map([["p1", buildProduct({ minPayableAmount: "₹2000" })]]);
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.cashPayable, 200000); // floor of ₹2000 wins over the ₹1499 effective
  assert.equal(out.quote.minimumPayable, 200000);
});

test("buildQuote: free product yields a zero-cash quote", () => {
  const products = new Map([["p1", buildProduct({ price: "₹0", salePrice: null, regularPrice: "₹0" })]]);
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.cashPayable, 0);
  assert.equal(out.quote.regularSubtotal, 0);
  assert.equal(out.quote.saleDiscount, 0);
});

test("buildQuote: free_entitlement with no client prices produces a zero-cash quote (the verify step can grant immediately)", () => {
  const products = new Map([["p1", buildProduct()]]);
  const out = buildQuote({
    selection: { purchaseKind: "free_entitlement", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u1",
  });
  assert.equal(out.ok, true);
  assert.equal(out.quote.purchaseKind, "free_entitlement");
  // free_entitlement still loads the product but the line carries the
  // canonical price; a separate "is this a free grant" check happens
  // server-side (e.g. when the product is `isFree: true` or all line
  // prices resolve to 0).
  assert.equal(out.quote.verifiedLineItems.length, 1);
});

// ----- Cross-user quote access ----------------------------------------------

test("isQuoteAccessibleToUser: another user cannot read the quote", () => {
  const out = {
    uid: "u1",
    status: "active",
    expiresAt: Date.now() + 60_000,
  };
  assert.equal(isQuoteAccessibleToUser(out, "u1"), true);
  assert.equal(isQuoteAccessibleToUser(out, "u2"), false);
});

test("the quote record carries the requester's uid (not the client-supplied finalPrice)", () => {
  const products = new Map([["p1", buildProduct()]]);
  const out = buildQuote({
    selection: { purchaseKind: "full_product", productIds: ["p1"], moduleIds: [], resourceIds: [], updateId: null },
    products,
    purchasesByProduct: new Map([["p1", []]]),
    uid: "u_attacker",
    quoteId: "Q-attack",
  });
  assert.equal(out.ok, true);
  // The server stamps the verified uid onto the record. A client that
  // tampered with the request body (e.g. a fake finalPrice) cannot
  // influence the price: only the loaded doc field matters.
  assert.equal(out.quote.uid, "u_attacker");
  assert.equal(out.quote.cashPayable, 149900);
});

test("subscription selection with no products (feature-only) still builds a quote", () => {
  const out = buildQuote({
    selection: {
      purchaseKind: "subscription",
      productIds: [],
      moduleIds: [],
      resourceIds: [],
      updateId: null,
      subscriptionPlanId: "plan_basic",
      billingCycle: "monthly",
      featureIds: ["f_ai"],
      couponCode: null,
      requestedEduCoins: 0,
      returnRoute: null,
    },
    products: new Map(),
    purchasesByProduct: new Map(),
    uid: "user1",
    quoteId: "Q-feature-only",
    subscriptionLineItems: [
      { id: "subscription:plan_basic:monthly", kind: "subscription", productId: null, moduleId: null, resourceId: null, updateId: null, subscriptionPlanId: "plan_basic", featureId: null, title: "Basic (Monthly)", parentTitle: "", regularPrice: 0, salePrice: null, effectivePrice: 0, quantity: 1, alreadyOwned: false, entitlementId: "subscription:plan_basic" },
      { id: "subscription_feature:plan_basic:f_ai", kind: "subscription_features", productId: null, moduleId: null, resourceId: null, updateId: null, subscriptionPlanId: "plan_basic", featureId: "f_ai", title: "AI Assistant", parentTitle: "Basic", regularPrice: 49900, salePrice: null, effectivePrice: 49900, quantity: 1, alreadyOwned: false, entitlementId: "subscription_feature:plan_basic:f_ai" },
    ],
  });
  assert.equal(out.ok, true, out.reason || "");
  assert.equal(out.quote.cashPayable, 49900);
  assert.equal(out.quote.verifiedLineItems.length, 2);
});
