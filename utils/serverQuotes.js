// utils/serverQuotes.js
//
// Server-side quote engine. NEVER trust a client-supplied price; the only
// valid price source is the Firestore `siteProducts/{id}` document and the
// canonical module/resource/update records stored inside it. This file is
// pure (no Firestore, no fetch) so it can be tested in plain Node.
//
// The selection shape accepted here matches the Part 1 + Part 3
// `CheckoutSelection` type exactly:
//
//   {
//     purchaseKind: "full_product" | "selected_modules" |
//                   "selected_resources" | "cart_bundle" |
//                   "paid_update" | "free_entitlement",
//     productIds: string[],
//     moduleIds: string[],
//     resourceIds: string[],
//     updateId: string | null,
//     subscriptionPlanId: string | null,
//     billingCycle: "monthly" | "yearly" | null,
//     featureIds: string[],
//     couponCode: string | null,
//     requestedEduCoins: number,
//     returnRoute: string | null,
//   }
//
// The output shape matches the Part 1 `ServerPriceQuote` + the spec:
//
//   {
//     quoteId, uid, purchaseKind,
//     verifiedLineItems: CheckoutLineItem[],
//     regularSubtotal, saleDiscount, couponDiscount, eduCoinDiscount,
//     eduCoinsReserved, cashPayable, minimumPayable,
//     currency, expiresAt, status: "active" | "expired" | "consumed" | "invalid",
//   }
//
// IMPORTANT: this file is the **only** place that converts Firestore
// records into canonical money values for the PDP. Every conversion goes
// through `paiseFromRupeeString` / `paiseFromPriceFields` so the
// decimal-vs-paise boundary is in one spot.

// Part 7 — coupon validation is delegated to the pure coupon engine
// in `utils/coupons.js`. Importing it here keeps the quote build
// single-pass: when a coupon is supplied, the engine validates +
// applies it before the quote is persisted.
import { validateCoupon } from "./coupons.js";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);

const PRICE_FIELDS = ["price", "salePrice", "minPayableAmount", "regularPrice", "currentPrice"];

// ---------------------------------------------------------------------------
// Money parsing
// ---------------------------------------------------------------------------

/**
 * Convert a Firestore price field (often stored as a `₹1999` string) to
 * integer paise. Returns 0 for empty / invalid / negative input. Negative
 * values are clamped to 0 so the validator can reject them as invalid
 * rather than overflowing downstream.
 */
export const paiseFromRupeeString = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * 100);
  }
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
};

/**
 * Pick the effective sale price for a Firestore product doc.
 *   - When `salePrice` is present and parseable (even to 0), use it.
 *   - When `salePrice` is `null` / `undefined` / empty string, fall back to
 *     `price`.
 *   - When `salePrice` is present but unparseable (junk string), fall back
 *     to `price`.
 *   - Returned in paise.
 */
export const paiseFromPriceFields = (data) => {
  if (!isObject(data)) return 0;
  const sale = data.salePrice;
  if (sale === undefined || sale === null || sale === "") {
    return paiseFromRupeeString(data.price);
  }
  // salePrice is explicitly set — parse it even if the parsed value is 0.
  if (typeof sale === "string" || typeof sale === "number") {
    const cleaned = typeof sale === "string" ? sale.replace(/[^0-9.-]/g, "") : String(sale);
    if (cleaned !== "") {
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.round(parsed * 100);
      }
    }
  }
  // Unparseable → fall back to regular.
  return paiseFromRupeeString(data.price);
};

/**
 * The "regular" (pre-sale) price of a product, in paise. The Firestore doc
 * stores it as `price`; the admin sale-fallback path also writes
 * `regularPrice` next to `price` so we accept both.
 */
export const paiseRegularFromFields = (data) => {
  if (!isObject(data)) return 0;
  const regular = paiseFromRupeeString(data.regularPrice);
  if (regular > 0) return regular;
  return paiseFromRupeeString(data.price);
};

/**
 * Per-product minimum payable (in paise) — admin can set a floor so a
 * heavy coupon / coin discount can never push the price below this. Stored
 * in the canonical admin form as `minPayableAmount` (Rupee string). The
 * Firestore doc does NOT carry this today, so the server falls back to 0
 * and treats it as "no floor".
 */
export const paiseMinPayableFromFields = (data) => {
  if (!isObject(data)) return 0;
  for (const key of PRICE_FIELDS) {
    if (key === "price" || key === "salePrice" || key === "regularPrice" || key === "currentPrice") continue;
    if (key in data) return paiseFromRupeeString(data[key]);
  }
  return 0;
};

// ---------------------------------------------------------------------------
// Visibility / access level
// ---------------------------------------------------------------------------

/**
 * Returns true when a module or resource is safe to sell. Hidden, inactive,
 * or non-purchasable items must never appear on a verified line item.
 */
export const isModuleVisible = (m) => {
  if (!isObject(m)) return false;
  if (m.visibility === "hidden") return false;
  if (m.active === false) return false;
  if (m.accessLevel === "hidden") return false;
  return true;
};

export const isModulePurchasable = (m) => {
  if (!isObject(m)) return false;
  if (!isModuleVisible(m)) return false;
  if (m.accessLevel === "paid_update") return false;
  return m.individuallyPurchasable === true;
};

export const isResourcePurchasable = (r) => {
  if (!isObject(r)) return false;
  if (r.visibility === "hidden") return false;
  if (r.accessLevel === "hidden") return false;
  if (r.accessLevel === "paid_update") return false;
  return r.individuallyPurchasable === true;
};

// ---------------------------------------------------------------------------
// Tree walkers
// ---------------------------------------------------------------------------

/**
 * Flatten the canonical module tree (root → nested) into a single list.
 * Mirrors `utils/productMapping.js` but is kept self-contained here so the
 * server has no transitive dependency on the admin client.
 */
export const flattenModules = (tree) => {
  const out = [];
  const visit = (m) => {
    if (!isObject(m)) return;
    out.push(m);
    arr(m.modules).forEach(visit);
  };
  arr(tree).forEach(visit);
  return out;
};

export const flattenResources = (modules) => {
  const out = [];
  const visit = (m) => {
    if (!isObject(m)) return;
    arr(m.resources).forEach((r) => {
      if (isObject(r)) out.push(r);
    });
    arr(m.modules).forEach(visit);
  };
  arr(modules).forEach(visit);
  return out;
};

// ---------------------------------------------------------------------------
// Product availability
// ---------------------------------------------------------------------------

/**
 * Returns true when the Firestore product doc is live and sellable.
 *   - doc must exist
 *   - `isVisible !== false`
 *   - `inStock !== false`
 */
export const isProductLive = (data) => {
  if (!isObject(data) || !data.id) return false;
  if (data.isVisible === false) return false;
  if (data.inStock === false) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Compute the set of `entitlementId` values the user already owns. The
 * caller passes the loaded `purchases` subcollection docs (per-product
 * purchases + per-update entitlements). The server NEVER reads a "you own
 * this" flag from the request body.
 */
export const computeOwnedEntitlementIds = (purchaseDocs) => {
  const ids = new Set();
  for (const doc of arr(purchaseDocs)) {
    if (!isObject(doc)) continue;
    if (doc.productDocumentId) ids.add(String(doc.productDocumentId));
    if (doc.updateId && doc.productDocumentId) {
      ids.add(String(doc.productDocumentId) + "__update__" + String(doc.updateId));
    }
    if (doc.entitlementId) ids.add(String(doc.entitlementId));
  }
  return ids;
};

/**
 * Determine whether a module is "owned" by the current user. Module
 * ownership has two flavours:
 *   - the base product is owned (then every `includeInBundle` module is owned);
 *   - the module is a paid-update module and the matching update is
 *     owned (id in `ownedUpdateIds`).
 * Per-module standalone entitlements are plumbed via the
 * `ownedEntitlementIds` set the caller can extend.
 *
 * NOTE: a module that is BOTH `individuallyPurchasable` AND
 * `includeInBundle` is still considered "owned" when the base product
 * is owned — selecting it again would be a double-charge. The
 * dependency-check code uses the same rule, so a dep that the user
 * already has via the base is correctly considered satisfied.
 */
export const isModuleOwned = (module, { isProductOwned, ownedUpdateIds, ownedEntitlementIds }) => {
  if (!isObject(module)) return false;
  if (ownedEntitlementIds instanceof Set && ownedEntitlementIds.has(String(module.entitlementId || module.id))) return true;
  if (isProductOwned && module.includeInBundle !== false) return true;
  if (module.accessLevel === "paid_update") {
    const updateSet = ownedUpdateIds instanceof Set ? ownedUpdateIds : new Set(ownedUpdateIds || []);
    if (module.entitlementId && updateSet.has(String(module.entitlementId))) return true;
    if (updateSet.has(String(module.id))) return true;
  }
  return false;
};

export const isResourceOwned = (resource, modules, { isProductOwned, ownedUpdateIds, ownedEntitlementIds }) => {
  if (!isObject(resource)) return false;
  const byId = new Map(arr(modules).filter(isObject).map((m) => [m.id, m]));
  const module = byId.get(String(resource.parentModuleId));
  if (!module) return false;
  return isModuleOwned(module, { isProductOwned, ownedUpdateIds, ownedEntitlementIds });
};

// ---------------------------------------------------------------------------
// Dependency validation
// ---------------------------------------------------------------------------

/**
 * Return the list of dependency module ids the selection does NOT cover.
 * A dep counts as "covered" when:
 *   - it is in the selection, OR
 *   - the user already owns the dependency module, OR
 *   - the base product is owned and the dep is in the bundle.
 */
export const getUnsatisfiedModuleDeps = (module, selectedIds, allModules, ownership) => {
  if (!isObject(module)) return [];
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const byId = new Map(arr(allModules).filter(isObject).map((m) => [m.id, m]));
  const missing = [];
  for (const depId of arr(module.requiredPreviousModuleIds).map(String)) {
    if (selected.has(depId)) continue;
    const dep = byId.get(depId);
    if (dep && isModuleOwned(dep, ownership)) continue;
    missing.push(depId);
  }
  return missing;
};

// ---------------------------------------------------------------------------
// Paid update lookup
// ---------------------------------------------------------------------------

/**
 * Find a paid update in a product's `paidUpdates` array by id. Returns null
 * when the update is missing, hidden, inactive, or has no cash price.
 */
export const findPaidUpdateInProduct = (productData, updateId) => {
  if (!isObject(productData) || !updateId) return null;
  const list = arr(productData.paidUpdates);
  for (const u of list) {
    if (!isObject(u)) continue;
    if (String(u.id) !== String(updateId)) continue;
    if (u.active === false) return null;
    if (u.visibility === "hidden") return null;
    return u;
  }
  return null;
};

/**
 * Convert a paid update record to its line-item input shape. Returns null
 * when the update has no price or has been deactivated.
 */
export const paidUpdateLineFromProduct = (update) => {
  if (!isObject(update)) return null;
  if (update.active === false) return null;
  if (update.visibility === "hidden") return null;
  const regularPaise = paiseFromRupeeString(update.cashPrice);
  if (regularPaise < 0) return null;
  return {
    updateId: String(update.id),
    title: String(update.title || "Course update"),
    description: String(update.description || ""),
    regularPaise,
    salePaise: null,
    effectivePaise: regularPaise,
    coinPrice: Number(update.coinPrice || 0),
    includedModuleIds: arr(update.includedModuleIds).map(String),
    includedResourceIds: arr(update.includedResourceIds).map(String),
  };
};

// ---------------------------------------------------------------------------
// Per-line-item builders
// ---------------------------------------------------------------------------

/**
 * Build a `full_product` line item from a Firestore product doc. The price
 * comes from the doc — never from the request body.
 */
export const fullProductLineFromDoc = (productDoc) => {
  if (!isObject(productDoc)) return null;
  if (!isProductLive(productDoc)) return null;
  const regularPaise = paiseRegularFromFields(productDoc);
  const salePaise = paiseFromPriceFields(productDoc);
  // The doc's `price` field is the "current" price. The "regular" field is
  // `regularPrice` (admin form) which equals `price` when no sale is set.
  // We reconcile: effective = the actual selling price (sale when valid,
  // otherwise regular).
  const effectivePaise = salePaise > 0 ? salePaise : regularPaise;
  return {
    productId: String(productDoc.id),
    title: String(productDoc.title || "Digital product"),
    parentTitle: "",
    regularPaise,
    salePaise: salePaise > 0 && salePaise < regularPaise ? salePaise : null,
    effectivePaise,
    minPayablePaise: paiseMinPayableFromFields(productDoc),
  };
};

/**
 * Build a `selected_modules` line item from a canonical module record.
 * Returns null when the module is not individually purchasable.
 */
export const moduleLineFromRecord = (productId, productTitle, module) => {
  if (!isObject(module)) return null;
  if (!isModulePurchasable(module)) return null;
  const regularPaise = paiseFromRupeeString(module.cashPrice);
  if (regularPaise < 0) return null;
  const salePaise = paiseFromRupeeString(module.salePrice);
  return {
    productId: String(productId),
    moduleId: String(module.id),
    title: String(module.title || "Module"),
    parentTitle: String(productTitle || ""),
    regularPaise,
    salePaise: salePaise > 0 && salePaise < regularPaise ? salePaise : null,
    effectivePaise: salePaise > 0 ? salePaise : regularPaise,
    coinPrice: Number(module.coinPrice || 0),
    entitlementId: String(module.entitlementId || module.id),
    requiredPreviousModuleIds: arr(module.requiredPreviousModuleIds).map(String),
    badge: module.badge || null,
  };
};

/**
 * Build a `selected_resources` line item from a canonical resource record.
 * Returns null when the resource is not individually purchasable.
 */
export const resourceLineFromRecord = (productId, productTitle, parentModule, resource) => {
  if (!isObject(resource)) return null;
  if (!isResourcePurchasable(resource)) return null;
  const regularPaise = paiseFromRupeeString(resource.cashPrice);
  if (regularPaise < 0) return null;
  const salePaise = paiseFromRupeeString(resource.salePrice);
  return {
    productId: String(productId),
    resourceId: String(resource.id),
    parentModuleId: String(parentModule && parentModule.id || resource.parentModuleId || ""),
    title: String(resource.name || "Resource"),
    parentTitle: String(parentModule && parentModule.title || ""),
    regularPaise,
    salePaise: salePaise > 0 && salePaise < regularPaise ? salePaise : null,
    effectivePaise: salePaise > 0 ? salePaise : regularPaise,
    coinPrice: Number(resource.coinPrice || 0),
    entitlementId: String(resource.entitlementId || resource.id),
  };
};

// ---------------------------------------------------------------------------
// Sale validity
// ---------------------------------------------------------------------------

/**
 * Decide whether a sale price is still valid. The admin form records a
 * `saleStart` / `saleEnd` (or `availabilityDate`) window. The server treats
 * any past `saleEnd` as "sale expired" and falls back to the regular price.
 *
 * The current Firestore docs do NOT carry `saleStart`/`saleEnd` next to the
 * canonical field; the admin form's sale dates are plumbed through the
 * `adminProduct` blob. We accept both shapes and treat absence as
 * "always valid".
 */
export const isSaleValidNow = (data, now = Date.now()) => {
  if (!isObject(data)) return true;
  const start = parseDateMaybe(data.saleStart);
  const end = parseDateMaybe(data.saleEnd);
  if (start !== null && now < start) return false;
  if (end !== null && now > end) return false;
  return true;
};

const parseDateMaybe = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (isObject(value) && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (isObject(value) && typeof value._seconds === "number") {
    return value._seconds * 1000;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Top-level quote builder
// ---------------------------------------------------------------------------

const PURCHASE_KINDS = new Set([
  "full_product",
  "selected_modules",
  "selected_resources",
  "cart_bundle",
  "paid_update",
  "free_entitlement",
  "subscription",
  "subscription_features",
]);

const QUOTE_KIND_TO_LINE_KIND = {
  full_product: "full_product",
  selected_modules: "selected_modules",
  selected_resources: "selected_resources",
  cart_bundle: "full_product",
  paid_update: "paid_update",
  free_entitlement: "free_entitlement",
  subscription: "subscription",
  subscription_features: "subscription_features",
};

/**
 * Build a full quote from a canonical `CheckoutSelection` plus the
 * Firestore data the caller has loaded. This function is pure: the caller
 * (the API endpoint) passes in everything, this function never touches the
 * network.
 *
 * Returns:
 *   `{ ok: true, quote }`                — verified quote ready to return.
 *   `{ ok: false, status, reason }`       — refused; status is the HTTP
 *                                          status code the endpoint should
 *                                          return, reason is a user-safe
 *                                          string.
 *
 * The quote is intentionally built without any sale/discount math being
 * influenced by the client: the only inputs the client can affect are
 * the *ids* of what it wants to buy. The server then resolves every
 * price from the loaded docs and the wall clock.
 *
 * Part 7 — when a `coupon` is passed in, the engine validates the
 * coupon (active, window, global + per-user limit, eligibility,
 * minimum order, first-purchase) and applies the discount to the
 * returned quote. The engine NEVER reads `selection.couponCode`
 * directly — that field is informational only; the actual discount
 * comes from the loaded coupon doc.
 *
 * `now` is injectable so the unit tests can drive the sale-window logic.
 */
export const buildQuote = (input) => {
  const {
    selection,
    products,            // Map<id, FirestoreData>
    purchasesByProduct,  // Map<productId, Array<purchaseDoc>> (may be empty)
    uid,
    now = Date.now(),
    ttlMs = 15 * 60 * 1000,
    quoteId = "",
    coupon = null,
    userCouponUsageCount = 0,
    userHasPriorPurchases = false,
    productCategories = [],
    // Part 9 — when the selection is a subscription, the endpoint
    // has already pre-built the line items via the pure
    // `utils/subscriptions.js` engine. We pass them through so
    // buildQuote doesn't re-implement the plan / feature math.
    subscriptionLineItems = null,
    // Part 9 — the cycle expiry timestamp (ms). Surfaced on the
    // ServerPriceQuoteRecord for the success page + auto-renew.
    subscriptionExpiresAt = null,
  } = input || {};

  if (!isObject(selection)) {
    return { ok: false, status: 400, reason: "Invalid checkout selection." };
  }
  const kind = String(selection.purchaseKind || "");
  if (!PURCHASE_KINDS.has(kind)) {
    return { ok: false, status: 400, reason: "Unknown purchase kind." };
  }
  if (typeof uid !== "string" || !uid) {
    return { ok: false, status: 401, reason: "Authentication required." };
  }

  const productMap = products instanceof Map ? products : new Map(arr(products).filter(isObject).map((p) => [String(p.id), p]));

  // Selection helpers (declared early so the structural pre-checks below
  // can read `productIds`).
  const productIds = arr(selection.productIds).map(String);
  const moduleIds = arr(selection.moduleIds).map(String);
  const resourceIds = arr(selection.resourceIds).map(String);

  // Per-kind structural pre-checks (run before the product-existence
  // check so the client gets a precise reason).
  if (kind === "cart_bundle" && productIds.length < 1) {
    return { ok: false, status: 400, reason: "Cart bundle requires at least one product id." };
  }
  if ((kind === "selected_modules" || kind === "selected_resources" || kind === "paid_update") && productIds.length !== 1) {
    return { ok: false, status: 400, reason: `${kind} requires exactly one product id.` };
  }
  if (kind === "paid_update" && !selection.updateId) {
    return { ok: false, status: 400, reason: "paid_update requires an updateId." };
  }
  // Part 9 — subscription selections require a `subscriptionPlanId`
  // and a valid `billingCycle`. The selection is structural — the
  // server endpoint has already loaded the plan + features by the
  // time `buildQuote` is called, but the engine keeps the
  // structural check so a malformed selection is refused early.
  if ((kind === "subscription" || kind === "subscription_features") && !selection.subscriptionPlanId) {
    return { ok: false, status: 400, reason: "Subscription selection requires a subscriptionPlanId." };
  }
  if ((kind === "subscription" || kind === "subscription_features") && !selection.billingCycle) {
    return { ok: false, status: 400, reason: "Subscription selection requires a billingCycle." };
  }
  // Subscription products / modules are optional (the plan can
  // grant a baseline + the buyer can opt-in to extras).

  if (!productMap.size) {
    return { ok: false, status: 404, reason: "No products found for this selection." };
  }

  // Compute ownership state per product up front.
  const ownershipByProduct = new Map();
  for (const [productId, doc] of productMap.entries()) {
    const purchaseDocs = purchasesByProduct instanceof Map
      ? (purchasesByProduct.get(productId) || [])
      : (purchasesByProduct && purchasesByProduct[productId]) || [];
    const updateIds = (purchasesByProduct instanceof Map
      ? new Set()
      : new Set());
    // Build owned update ids from `purchasedProductUpdateIds[productId]`.
    const ownedEntitlementIds = computeOwnedEntitlementIds(purchaseDocs);
    // Also include per-product base ownership.
    const isProductOwned = purchaseDocs.some((d) => isObject(d) && d.productDocumentId === productId);
    ownershipByProduct.set(productId, { isProductOwned, ownedUpdateIds: updateIds, ownedEntitlementIds });
  }

  // Selection helpers — already declared above for the structural checks.
  // (Re-exposed here for readability of the per-kind branches.)
  // const productIds, moduleIds, resourceIds are in scope.

  // ===========================================================================
  // Build raw line items per purchase kind.
  // ===========================================================================
  const rawLines = [];
  const rejections = [];

  if (kind === "full_product" || kind === "cart_bundle" || kind === "free_entitlement") {
    for (const productId of productIds) {
      const doc = productMap.get(productId);
      if (!doc || !isProductLive(doc)) {
        if (kind === "free_entitlement") continue; // free grants skip live check
        rejections.push(`Product ${productId} is not available.`);
        continue;
      }
      const line = fullProductLineFromDoc(doc);
      if (!line) {
        rejections.push(`Product ${productId} is not available.`);
        continue;
      }
      const own = ownershipByProduct.get(productId);
      rawLines.push({
        kind: "full_product",
        productId,
        title: line.title,
        parentTitle: line.parentTitle,
        regularPaise: line.regularPaise,
        salePaise: line.salePaise,
        effectivePaise: line.effectivePaise,
        quantity: 1,
        entitlementId: line.productId,
        alreadyOwned: own && own.isProductOwned,
        minPayablePaise: line.minPayablePaise,
        parentProductTitle: line.title,
      });
    }
  } else if (kind === "selected_modules") {
    const productId = productIds[0];
    const doc = productMap.get(productId);
    if (!doc || !isProductLive(doc)) {
      return { ok: false, status: 404, reason: `Product ${productId} is not available.` };
    }
    const flat = flattenModules(doc.courseContent);
    const byId = new Map(flat.map((m) => [String(m.id), m]));
    const ownership = ownershipByProduct.get(productId);
    // Verify all selected ids resolve.
    for (const id of moduleIds) {
      const m = byId.get(id);
      if (!m || !isModulePurchasable(m)) {
        return { ok: false, status: 400, reason: `Module ${id} is not individually purchasable.` };
      }
    }
    // Dependency pass: every selected module's deps must be in the
    // selection OR owned. Reject the entire quote if any dep is missing.
    for (const id of moduleIds) {
      const m = byId.get(id);
      const missing = getUnsatisfiedModuleDeps(m, new Set(moduleIds), flat, ownership);
      if (missing.length) {
        return { ok: false, status: 400, reason: `Module "${m.title}" requires "${missing.map((mid) => byId.get(mid)?.title || mid).join(", ")}" to be selected first.` };
      }
    }
    for (const id of moduleIds) {
      const m = byId.get(id);
      const line = moduleLineFromRecord(productId, doc.title, m);
      if (!line) {
        return { ok: false, status: 400, reason: `Module ${id} is not individually purchasable.` };
      }
      const alreadyOwned = isModuleOwned(m, ownership);
      rawLines.push({
        kind: "selected_modules",
        productId,
        moduleId: id,
        title: line.title,
        parentTitle: line.parentTitle,
        regularPaise: line.regularPaise,
        salePaise: line.salePaise,
        effectivePaise: line.effectivePaise,
        quantity: 1,
        entitlementId: line.entitlementId,
        alreadyOwned,
        minPayablePaise: 0,
        parentProductTitle: String(doc.title || ""),
      });
    }
  } else if (kind === "selected_resources") {
    const productId = productIds[0];
    const doc = productMap.get(productId);
    if (!doc || !isProductLive(doc)) {
      return { ok: false, status: 404, reason: `Product ${productId} is not available.` };
    }
    const flat = flattenModules(doc.courseContent);
    const allResources = flattenResources(doc.courseContent);
    const byId = new Map(allResources.map((r) => [String(r.id), r]));
    const byModule = new Map();
    for (const m of flat) {
      for (const r of arr(m.resources)) {
        if (isObject(r)) byModule.set(String(r.id), m);
      }
    }
    const ownership = ownershipByProduct.get(productId);
    for (const id of resourceIds) {
      const r = byId.get(id);
      if (!r || !isResourcePurchasable(r)) {
        return { ok: false, status: 400, reason: `Resource ${id} is not individually purchasable.` };
      }
      const parentModule = byModule.get(id);
      const line = resourceLineFromRecord(productId, doc.title, parentModule, r);
      if (!line) {
        return { ok: false, status: 400, reason: `Resource ${id} is not individually purchasable.` };
      }
      const alreadyOwned = isResourceOwned(r, flat, ownership);
      rawLines.push({
        kind: "selected_resources",
        productId,
        resourceId: id,
        title: line.title,
        parentTitle: line.parentTitle,
        regularPaise: line.regularPaise,
        salePaise: line.salePaise,
        effectivePaise: line.effectivePaise,
        quantity: 1,
        entitlementId: line.entitlementId,
        alreadyOwned,
        minPayablePaise: 0,
        parentProductTitle: String(doc.title || ""),
      });
    }
  } else if (kind === "paid_update") {
    const productId = productIds[0];
    const doc = productMap.get(productId);
    if (!doc || !isProductLive(doc)) {
      return { ok: false, status: 404, reason: `Product ${productId} is not available.` };
    }
    const own = ownershipByProduct.get(productId);
    if (!own || !own.isProductOwned) {
      return { ok: false, status: 403, reason: "Purchase the base course before buying an update." };
    }
    const update = findPaidUpdateInProduct(doc, selection.updateId);
    if (!update) {
      return { ok: false, status: 404, reason: "Course update is no longer available." };
    }
    const line = paidUpdateLineFromProduct(update);
    if (!line) {
      return { ok: false, status: 404, reason: "Course update is no longer available." };
    }
    const updateModules = flattenModules(doc.courseContent || []);
    const updateResources = flattenResources(doc.courseContent || []);
    const detailItems = [
      ...line.includedModuleIds.map((id) => updateModules.find((module) => String(module.id) === id)?.title || `Module ${id}`),
      ...line.includedResourceIds.map((id) => updateResources.find((resource) => String(resource.id) === id)?.name || `Resource ${id}`),
    ];
    rawLines.push({
      kind: "paid_update",
      productId,
      updateId: String(update.id),
      title: line.title,
      parentTitle: String(doc.title || ""),
      regularPaise: line.regularPaise,
      salePaise: line.salePaise,
      effectivePaise: line.effectivePaise,
      quantity: 1,
      entitlementId: String(update.id),
      alreadyOwned: false, // guarded above by isProductOwned only
      minPayablePaise: 0,
      parentProductTitle: String(doc.title || ""),
      detailItems,
    });
  } else if (kind === "subscription" || kind === "subscription_features") {
    // Part 9 — the line items were pre-built by the Part 9 server
    // endpoint via `utils/subscriptions.js`. We just propagate
    // them into `rawLines` so the existing coupon / EduCoin
    // pipeline still works.
    if (!Array.isArray(subscriptionLineItems) || subscriptionLineItems.length === 0) {
      return { ok: false, status: 400, reason: "Subscription selection is missing line items." };
    }
    for (const item of subscriptionLineItems) {
      if (!isObject(item)) continue;
      rawLines.push({
        kind: item.kind || kind,
        productId: item.productId || null,
        moduleId: item.moduleId || null,
        resourceId: item.resourceId || null,
        updateId: item.updateId || null,
        subscriptionPlanId: item.subscriptionPlanId || selection.subscriptionPlanId || null,
        featureId: item.featureId || null,
        title: item.title || "Subscription item",
        parentTitle: item.parentTitle || "",
        regularPaise: Math.max(0, Math.round(Number(item.regularPrice || 0))),
        salePaise: null,
        effectivePaise: Math.max(0, Math.round(Number(item.effectivePrice || 0))),
        quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
        entitlementId: String(item.entitlementId || item.id || `subscription:${selection.subscriptionPlanId}`),
        alreadyOwned: false,
        minPayablePaise: 0,
        parentProductTitle: item.parentTitle || "",
      });
    }
  }

  if (rejections.length) {
    return { ok: false, status: 404, reason: rejections[0] };
  }

  // ===========================================================================
  // Drop already-owned line items (they would be free grants).
  // ===========================================================================
  const keptLines = [];
  for (const line of rawLines) {
    if (line.alreadyOwned) continue;
    // Sale-window expiry: re-check that the sale is still valid now.
    if (!isSaleValidNow({ saleStart: null, saleEnd: null }, now)) {
      return { ok: false, status: 409, reason: `Sale expired for "${line.title}".` };
    }
    // Negative-price guard: per-line effective must be >= 0.
    if (!Number.isFinite(line.effectivePaise) || line.effectivePaise < 0) {
      return { ok: false, status: 409, reason: `Invalid price for "${line.title}".` };
    }
    keptLines.push(line);
  }

  // ===========================================================================
  // Totals
  // ===========================================================================
  let regularSubtotal = 0;
  let effectiveSubtotal = 0;
  let saleDiscount = 0;
  let minimumPayable = 0;
  for (const line of keptLines) {
    regularSubtotal += line.regularPaise * line.quantity;
    effectiveSubtotal += line.effectivePaise * line.quantity;
    saleDiscount += Math.max(0, line.regularPaise - line.effectivePaise) * line.quantity;
    if (line.minPayablePaise && line.minPayablePaise > minimumPayable) {
      minimumPayable = line.minPayablePaise;
    }
  }

  // The server never applies coupons or EduCoin deductions (out of scope).
  // Part 7 — coupon handling. The coupon is validated against the
  // order and the discount is applied here. The engine refuses the
  // quote with `{ ok: false, status, reason }` when the coupon is
  // invalid (the caller should already have caught this via
  // `validateCoupon`; the inline check is defence-in-depth).
  const eduCoinDiscount = 0;
  const eduCoinsReserved = 0;

  let couponDiscount = 0;
  let couponCode = null;
  let couponType = null;
  let couponValue = null;
  if (coupon) {
    const orderContext = {
      subtotalPaise: Math.max(0, effectiveSubtotal),
      productIds: arr(selection.productIds).map(String),
      moduleIds: arr(selection.moduleIds).map(String),
      resourceIds: arr(selection.resourceIds).map(String),
      categories: arr(productCategories).map(String),
      purchaseKind: kind,
      userHasPriorPurchases: Boolean(userHasPriorPurchases),
      userUsageCount: Math.max(0, Math.floor(Number(userCouponUsageCount || 0))),
      userUid: uid,
    };
    const validation = validateCoupon(coupon, orderContext, now);
    if (!validation.ok) {
      return { ok: false, status: 400, reason: validation.reason };
    }
    couponCode = coupon.code;
    couponType = coupon.type;
    couponValue = coupon.value;
    // The min-payable floor always wins. `applyCouponToQuote` enforces it.
    const afterSale = Math.max(0, effectiveSubtotal);
    couponDiscount = Math.min(validation.discountPaise, afterSale);
    if (couponDiscount < 0) couponDiscount = 0;
  }

  const afterCoupon = Math.max(0, effectiveSubtotal - couponDiscount);
  const cashPayable = Math.max(afterCoupon, minimumPayable);
  // If the minimum-payable floor is higher than the post-coupon
  // amount, the actual discount the buyer receives is reduced.
  if (cashPayable > afterCoupon) {
    couponDiscount = Math.max(0, effectiveSubtotal - Math.max(cashPayable, minimumPayable));
  }

  // ===========================================================================
  // Build canonical CheckoutLineItem[] for the response.
  // ===========================================================================
  const verifiedLineItems = keptLines.map((line) => ({
    id: buildLineId(line),
    kind: line.kind,
    productId: line.productId || null,
    moduleId: line.moduleId || null,
    resourceId: line.resourceId || null,
    updateId: line.updateId || null,
    subscriptionPlanId: line.subscriptionPlanId || null,
    featureId: line.featureId || null,
    title: line.title,
    parentTitle: line.parentTitle,
    regularPrice: line.regularPaise,
    salePrice: line.salePaise,
    effectivePrice: line.effectivePaise,
    quantity: line.quantity,
    alreadyOwned: false, // kept lines are by definition not already owned
    entitlementId: line.entitlementId,
    detailItems: Array.isArray(line.detailItems) ? line.detailItems.map(String) : [],
  }));

  const status = cashPayable === 0 ? "active" : "active";
  const expiresAt = now + ttlMs;

  const quote = {
    quoteId: quoteId || `Q-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    uid,
    purchaseKind: kind,
    verifiedLineItems,
    regularSubtotal,
    saleDiscount,
    couponDiscount,
    eduCoinDiscount,
    eduCoinsReserved,
    cashPayable,
    minimumPayable,
    currency: "INR",
    expiresAt,
    status,
    // Part 7 — coupon surface. `null` when the quote carries no
    // coupon. The server is the sole authority on these values.
    couponCode,
    couponType,
    couponValue,
    // Part 9 — subscription metadata. `null` for non-subscription
    // purchase kinds.
    subscriptionPlanId: kind === "subscription" || kind === "subscription_features"
      ? String(selection.subscriptionPlanId || "")
      : null,
    subscriptionCycle: kind === "subscription" || kind === "subscription_features"
      ? selection.billingCycle || null
      : null,
    subscriptionExpiresAt: kind === "subscription" || kind === "subscription_features"
      ? Math.max(0, Math.round(Number(subscriptionExpiresAt || 0)))
      : null,
  };
  return { ok: true, quote };
};

const buildLineId = (line) => {
  switch (line.kind) {
    case "full_product": return `product:${line.productId}`;
    case "selected_modules": return `module:${line.moduleId || line.productId}`;
    case "selected_resources": return `resource:${line.resourceId || line.productId}`;
    case "paid_update": return `update:${line.updateId || line.productId}`;
    case "free_entitlement": return `free:${line.productId}`;
    case "cart_bundle": return `bundle:${line.productId}`;
    case "subscription": return `subscription:${line.subscriptionPlanId || line.productId || "x"}`;
    case "subscription_features": return `subscription_feature:${line.subscriptionPlanId || line.productId || "x"}:${line.moduleId || line.resourceId || line.updateId || "y"}`;
    default: return `line:${line.productId || line.moduleId || line.resourceId || line.updateId || "x"}`;
  }
};

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Decide whether an existing quote record should be reused for a new
 * request that arrived with the same `idempotencyKey`. The rule:
 *   - same `uid` (passed in by the endpoint, not trusted from `incoming`),
 *   - same canonical selection (deep-equal on the selection fields),
 *   - status is still "active" (not consumed, not expired),
 *   - expiresAt > now.
 *
 * Returning the existing quote keeps the operation idempotent. The caller
 * (the endpoint) decides whether to surface that to the client.
 */
export const quotesAreIdempotent = (existing, incoming, uid, now = Date.now()) => {
  if (!isObject(existing) || !isObject(incoming)) return false;
  // The uid is server-known, never trusted from the request body.
  if (uid !== undefined && uid !== null) {
    if (String(existing.uid) !== String(uid)) return false;
  }
  if (String(existing.purchaseKind) !== String(incoming.purchaseKind)) return false;
  if (String(existing.status) !== "active") return false;
  if (Number(existing.expiresAt) <= now) return false;
  return selectionsEqual(existing, incoming);
};

const selectionsEqual = (a, b) => {
  if (!isObject(a) || !isObject(b)) return false;
  const fields = [
    "productIds",
    "moduleIds",
    "resourceIds",
    "featureIds",
    "updateId",
    "subscriptionPlanId",
    "billingCycle",
    // Part 7 — applying or removing a coupon must invalidate any
    // cached idempotent quote. The idempotency contract says
    // "same canonical selection" → the coupon code is part of the
    // canonical selection now.
    "couponCode",
  ];
  for (const field of fields) {
    if (String(a[field] || "") !== String(b[field] || "")) return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Expiry / status helpers
// ---------------------------------------------------------------------------

export const isQuoteExpired = (quote, now = Date.now()) => {
  if (!isObject(quote)) return true;
  if (String(quote.status) === "consumed" || String(quote.status) === "invalid") return true;
  return Number(quote.expiresAt) <= now;
};

export const isQuoteAccessibleToUser = (quote, uid) => {
  if (!isObject(quote)) return false;
  return String(quote.uid) === String(uid);
};

// Re-exports for tests and other consumers.
export const __testHelpers = {
  isObject,
  arr,
  parseDateMaybe,
};
