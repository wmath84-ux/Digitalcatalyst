// utils/commerce.js
//
// Pure (no DOM, no Firebase) helpers for the canonical commerce schema.
// Imported by:
//   - `src/types/commerce.ts` (re-exported for the React app)
//   - `tests/commerce.test.mjs` (node:test)
//
// This file is intentionally framework-free so the test runner (plain Node)
// can require it without a TypeScript toolchain.

// Parse a value that might be a number, a "₹1,234" string, or junk.
// Returns `null` for any unusable input. The caller decides whether null
// is acceptable (e.g. missing sale price) or whether to fall back to 0.
export const parsePriceValue = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isPresent = (value) => value !== undefined && value !== null && value !== "";

/**
 * Effective price resolution rules:
 *   - If both regular and sale are missing/unparseable → 0.
 *   - If only the regular is usable → use regular.
 *   - If only the sale is usable → use sale.
 *   - If both are usable → use sale (the smaller / better price).
 *
 * The function does NOT clamp `sale > regular`; the editor's own validator
 * is the right place to enforce that rule. The runtime is honest: it
 * surfaces whatever the catalog says and lets the validator catch it.
 */
export const computeEffectivePrice = (regularPrice, salePrice) => {
  const regular = parsePriceValue(regularPrice);
  const sale = parsePriceValue(salePrice);
  if (regular === null && sale === null) return 0;
  if (sale === null) return regular ?? 0;
  if (regular === null) return sale;
  return sale;
};

export const resolveSalePrice = (regularPrice, salePrice) => {
  const sale = parsePriceValue(salePrice);
  if (sale === null) {
    const regular = parsePriceValue(regularPrice);
    return regular ?? 0;
  }
  return sale;
};

export const buildLineItem = (input) => {
  // Preserve the raw parsed numbers so the validator can reject negative
  // values. Only coerce missing values to 0 for the `regularPrice` field
  // (every line item must have a non-null regular price).
  const regular = isPresent(input.regularPrice)
    ? parsePriceValue(input.regularPrice)
    : null;
  const sale = isPresent(input.salePrice)
    ? parsePriceValue(input.salePrice)
    : null;
  const quantityRaw = isPresent(input.quantity)
    ? parsePriceValue(input.quantity)
    : null;
  const quantity = Math.max(1, Math.floor(quantityRaw ?? 1));
  return {
    id: input.id,
    kind: input.kind,
    productId: input.productId ?? null,
    moduleId: input.moduleId ?? null,
    resourceId: input.resourceId ?? null,
    updateId: input.updateId ?? null,
    subscriptionPlanId: input.subscriptionPlanId ?? null,
    featureId: input.featureId ?? null,
    title: input.title,
    parentTitle: input.parentTitle ?? "",
    regularPrice: regular ?? 0,
    salePrice: sale,
    effectivePrice: computeEffectivePrice(input.regularPrice, input.salePrice),
    quantity,
    alreadyOwned: Boolean(input.alreadyOwned),
    entitlementId: input.entitlementId ?? input.id,
  };
};

export const normalizePurchaseKind = (raw) => {
  if (typeof raw !== "string") return "free_entitlement";
  const value = raw.trim().toLowerCase();
  switch (value) {
    case "full_product":
    case "selected_modules":
    case "selected_resources":
    case "cart_bundle":
    case "paid_update":
    case "subscription":
    case "subscription_features":
    case "free_entitlement":
      return value;
    case "course_update":
    case "update":
      return "paid_update";
    case "product":
    case "products":
      return "full_product";
    case "bundle":
      return "cart_bundle";
    case "module":
      return "selected_modules";
    case "resource":
      return "selected_resources";
    default:
      return "free_entitlement";
  }
};

export const dedupeLineItems = (items) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item || !item.id) continue;
    if (seen.has(item.entitlementId)) continue;
    seen.add(item.entitlementId);
    out.push(item);
  }
  return out;
};

export const partitionByValidPrice = (items) => {
  const valid = [];
  const invalid = [];
  for (const item of items) {
    if (item.regularPrice < 0 || item.effectivePrice < 0) invalid.push(item);
    else valid.push(item);
  }
  return { valid, invalid };
};

export const markAlreadyOwned = (items, ownedEntitlementIds) => {
  const owned = ownedEntitlementIds instanceof Set
    ? ownedEntitlementIds
    : new Set(ownedEntitlementIds);
  return items.map((item) => ({ ...item, alreadyOwned: owned.has(item.entitlementId) }));
};

export const sumEffectivePrice = (items) =>
  items.reduce((sum, item) => {
    if (item.alreadyOwned) return sum;
    return sum + item.effectivePrice * item.quantity;
  }, 0);

// Internal export for tests that want to assert the parser behaves.
export const __parsePriceValue = parsePriceValue;
