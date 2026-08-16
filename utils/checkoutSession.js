// utils/checkoutSession.js
//
// Validated sessionStorage round-trip for the checkout pipeline.
// Pure helpers + thin browser shims so the round-trip can be unit-tested
// in plain Node (no `window`, no `document`).
//
// The previous checkout flow kept a mutable singleton
// (`src/data/checkoutData.ts`) and used `Object.assign` to overwrite
// fields on every navigation. The new flow is:
//   1. the PDP CTA writes a `CheckoutSessionRecordV1` to sessionStorage,
//   2. the CheckoutContext provider reads it on mount,
//   3. every consumer reads from the React context (not the singleton),
//   4. on cancel / completion the record is cleared.
//
// Schema versions let us drop stale records without breaking users with
// old tabs.

export const CHECKOUT_SESSION_STORAGE_KEY = "checkoutSession.v1";
export const CHECKOUT_SESSION_SCHEMA_VERSION = 1;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);

const VALID_KINDS = new Set([
  "full_product",
  "selected_modules",
  "selected_resources",
  "cart_bundle",
  "paid_update",
  "free_entitlement",
  "subscription",
  "subscription_features",
]);

/**
 * Validate a parsed JSON blob against the `CheckoutSessionRecordV1`
 * shape. Returns the normalised record on success or `null` on any
 * structural / version mismatch. The validator is intentionally
 * permissive on extra keys (so future schema versions can be backwards
 * compatible at the read site) but strict on required fields.
 */
export const parseCheckoutSessionRecord = (raw) => {
  if (!isObject(raw)) return null;
  if (raw.schemaVersion !== CHECKOUT_SESSION_SCHEMA_VERSION) return null;
  if (!isObject(raw.selection)) return null;
  if (typeof raw.selection.purchaseKind !== "string") return null;
  if (!VALID_KINDS.has(raw.selection.purchaseKind)) return null;
  if (!isObject(raw.buyer)) return null;
  if (typeof raw.buyer.uid !== "string" || !raw.buyer.uid) return null;
  if (!isObject(raw.returnRoute) || typeof raw.returnRoute.hash !== "string") return null;
  // optional: ServerPriceQuote must have the canonical fields
  let parsedQuote = null;
  if (raw.quote !== null && raw.quote !== undefined) {
    if (isObject(raw.quote)) {
      if (
        typeof raw.quote.quoteId === "string" &&
        typeof raw.quote.uid === "string" &&
        typeof raw.quote.cashPayable === "number"
      ) {
        parsedQuote = raw.quote;
      }
      // else: drop the broken quote, keep the record.
    }
  }
  return {
    schemaVersion: CHECKOUT_SESSION_SCHEMA_VERSION,
    savedAt: typeof raw.savedAt === "number" ? raw.savedAt : Date.now(),
    selection: sanitiseSelection(raw.selection),
    quote: sanitiseQuote(parsedQuote),
    buyer: sanitiseBuyer(raw.buyer),
    returnRoute: sanitiseReturnRoute(raw.returnRoute),
    idempotencyKey: typeof raw.idempotencyKey === "string" ? raw.idempotencyKey.slice(0, 120) : null,
  };
};

const sanitiseSelection = (raw) => {
  return {
    purchaseKind: String(raw.purchaseKind),
    productIds: arr(raw.productIds).map(String).slice(0, 50),
    moduleIds: arr(raw.moduleIds).map(String).slice(0, 50),
    resourceIds: arr(raw.resourceIds).map(String).slice(0, 50),
    updateId: typeof raw.updateId === "string" ? String(raw.updateId) : null,
    subscriptionPlanId: typeof raw.subscriptionPlanId === "string" ? String(raw.subscriptionPlanId) : null,
    billingCycle: raw.billingCycle === "monthly" || raw.billingCycle === "yearly" ? raw.billingCycle : null,
    featureIds: arr(raw.featureIds).map(String).slice(0, 50),
    couponCode: typeof raw.couponCode === "string" ? String(raw.couponCode).slice(0, 60) : null,
    returnRoute: typeof raw.returnRoute === "string" ? String(raw.returnRoute).slice(0, 200) : null,
  };
};

const sanitiseQuote = (raw) => {
  if (!isObject(raw)) return null;
  return {
    quoteId: String(raw.quoteId || ""),
    uid: String(raw.uid || ""),
    purchaseKind: String(raw.purchaseKind || ""),
    verifiedLineItems: arr(raw.verifiedLineItems).map((line) => sanitiseLineItem(line)).filter(Boolean),
    regularSubtotal: numOrZero(raw.regularSubtotal),
    saleDiscount: numOrZero(raw.saleDiscount),
    couponDiscount: numOrZero(raw.couponDiscount),
    cashPayable: numOrZero(raw.cashPayable),
    minimumPayable: numOrZero(raw.minimumPayable),
    currency: String(raw.currency || "INR"),
    expiresAt: numOrZero(raw.expiresAt),
    status: typeof raw.status === "string" ? String(raw.status) : "active",
    // Part 9 — true when this quote is an add-on upgrade (only new
    // features / products are charged). Kept across the sessionStorage
    // round-trip so the review step can render the upgrade copy on a
    // resumed checkout.
    subscriptionAddOn: raw.subscriptionAddOn === true,
  };
};

const sanitiseLineItem = (raw) => {
  if (!isObject(raw)) return null;
  return {
    id: str(raw.id),
    kind: str(raw.kind),
    productId: strOrNull(raw.productId),
    moduleId: strOrNull(raw.moduleId),
    resourceId: strOrNull(raw.resourceId),
    updateId: strOrNull(raw.updateId),
    subscriptionPlanId: strOrNull(raw.subscriptionPlanId),
    featureId: strOrNull(raw.featureId),
    title: str(raw.title),
    parentTitle: str(raw.parentTitle),
    regularPrice: numOrZero(raw.regularPrice),
    salePrice: raw.salePrice === null || raw.salePrice === undefined ? null : numOrZero(raw.salePrice),
    effectivePrice: numOrZero(raw.effectivePrice),
    quantity: Math.max(1, Math.floor(numOrZero(raw.quantity))),
    alreadyOwned: Boolean(raw.alreadyOwned),
    entitlementId: str(raw.entitlementId),
  };
};

const sanitiseBuyer = (raw) => ({
  uid: String(raw.uid || ""),
  name: String(raw.name || ""),
  email: String(raw.email || ""),
  mobile: typeof raw.mobile === "string" ? String(raw.mobile) : null,
  emailVerified: Boolean(raw.emailVerified),
  tokenVerified: Boolean(raw.tokenVerified),
});

const sanitiseReturnRoute = (raw) => ({
  hash: String(raw.hash || "#/store"),
  label: typeof raw.label === "string" ? String(raw.label).slice(0, 80) : null,
});

const str = (v, fallback = "") => (v === null || v === undefined ? fallback : String(v));
const strOrNull = (v) => (v === null || v === undefined ? null : String(v));
const numOrZero = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Build a record from validated fields. Pure — no sessionStorage I/O.
 */
export const buildCheckoutSessionRecord = ({
  selection,
  quote,
  buyer,
  returnRoute,
  idempotencyKey,
  savedAt = Date.now(),
}) => {
  if (!isObject(selection)) return null;
  if (!isObject(buyer) || !buyer.uid) return null;
  if (!isObject(returnRoute) || !returnRoute.hash) return null;
  return {
    schemaVersion: CHECKOUT_SESSION_SCHEMA_VERSION,
    savedAt,
    selection: sanitiseSelection(selection),
    quote: sanitiseQuote(quote),
    buyer: sanitiseBuyer(buyer),
    returnRoute: sanitiseReturnRoute(returnRoute),
    idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey.slice(0, 120) : null,
  };
};

/**
 * Read the session record from the supplied storage. Returns null when
 * the record is missing, malformed, or for a different schema version.
 * Pure: pass any object with a `getItem` method.
 */
export const readCheckoutSessionRecord = (storage) => {
  if (!storage || typeof storage.getItem !== "function") return null;
  let raw;
  try {
    raw = storage.getItem(CHECKOUT_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (typeof raw !== "string" || !raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseCheckoutSessionRecord(parsed);
};

/**
 * Persist the supplied record. Returns true on success, false when the
 * storage backend is unavailable (Safari private mode, quota exceeded).
 * Pure-ish: pass any object with a `setItem` / `removeItem` method.
 */
export const writeCheckoutSessionRecord = (storage, record) => {
  if (!storage || typeof storage.setItem !== "function") return false;
  if (!record) return false;
  try {
    storage.setItem(CHECKOUT_SESSION_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
};

export const clearCheckoutSessionRecord = (storage) => {
  if (!storage || typeof storage.removeItem !== "function") return false;
  try {
    storage.removeItem(CHECKOUT_SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

// Browser-friendly wrappers (only used at runtime; tests pass their own
// storage shim).
export const readFromSessionStorage = () => {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  return readCheckoutSessionRecord(window.sessionStorage);
};
export const writeToSessionStorage = (record) => {
  if (typeof window === "undefined" || !window.sessionStorage) return false;
  return writeCheckoutSessionRecord(window.sessionStorage, record);
};
export const clearFromSessionStorage = () => {
  if (typeof window === "undefined" || !window.sessionStorage) return false;
  return clearCheckoutSessionRecord(window.sessionStorage);
};
