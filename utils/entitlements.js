// utils/entitlements.js
//
// Part 6 — Canonical entitlement engine. Pure functions only (no
// Firestore / no React). The server-side transactional writer lives
// in `api/_lib/entitlements.ts`; the client-side entitlement display
// logic lives in `src/components/checkout/CheckoutSuccessStep.tsx`.
//
// Why a separate `utils/` module?
//   - The Node test runner imports `.js` directly without a TS toolchain.
//   - The same shape is used by the transaction writer (server) and
//     by the receipt display (client) — sharing the entitlement-id
//     derivation rules here guarantees both sides agree on what an
//     "entitlement" means for a given line item.
//
// Spec (Part 6):
//   Support: full_product, module, resource, paid_update, free
//   Store:    uid, productId, kind, moduleId/resourceId/updateId,
//             entitlementId, orderId, paymentId, status, amount,
//             source, unlockedAt
//
// The pure helpers in this file derive the canonical entitlement
// record from a `CheckoutLineItem` + an `{ orderId, paymentId,
// source, now }` envelope. They never touch Firestore.
//
// Types live in `utils/entitlements.d.ts` — never import them from
// here (this is a `.js` file imported by the Node test runner
// without a TS toolchain).

/**
 * The five entitlement kinds we support in Part 6. The client-facing
 * `PurchaseKind` includes `subscription` and `subscription_features`
 * which are out of scope; we narrow to the Part 6 set here.
 */
export const ENTITLEMENT_KINDS = new Set([
  "full_product",
  "module",
  "resource",
  "paid_update",
  "free",
]);

/**
 * The Part 1 line-item `kind` values that map onto the Part 6
 * entitlement kinds. Subscription / subscription_features are
 * deliberately omitted — they belong to a later part.
 */
const PURCHASE_KIND_TO_ENTITLEMENT_KIND = {
  full_product: "full_product",
  selected_modules: "module",
  selected_resources: "resource",
  cart_bundle: "full_product", // cart bundle grants base product per product
  paid_update: "paid_update",
  free_entitlement: "free",
};

/**
 * Map a Part 1 `PurchaseKind` to the canonical Part 6 entitlement
 * kind. Returns `null` for kinds we don't support in Part 6
 * (subscription / subscription_features).
 */
export const toEntitlementKind = (purchaseKind) => {
  if (!purchaseKind) return null;
  return PURCHASE_KIND_TO_ENTITLEMENT_KIND[purchaseKind] || null;
};

/**
 * Whether a line item is one of the Part 6 entitlement kinds we
 * should persist. Already-owned items are still skipped at the
 * transaction layer (we don't double-grant), but this predicate
 * determines whether the line is *eligible* to be granted.
 */
export const isGrantableLine = (line) => {
  if (!line) return false;
  if (line.alreadyOwned) return false;
  return Boolean(toEntitlementKind(line.kind));
};

/**
 * Derive the canonical `entitlementId` for a line item. Falls back
 * to the line's own `entitlementId` if the engine already produced
 * one (the Part 4 server-quote engine does for modules/resources).
 */
export const deriveEntitlementId = (line) => {
  if (!line) return null;
  // Trust the line's own entitlementId when present — the server
  // engine already encoded the product / module / resource
  // provenance into it.
  if (line.entitlementId && typeof line.entitlementId === "string" && line.entitlementId.length > 0) {
    return line.entitlementId;
  }
  switch (line.kind) {
    case "full_product":
    case "cart_bundle":
      return line.productId ? `product:${line.productId}` : null;
    case "paid_update":
      return line.productId && line.updateId
        ? `update:${line.productId}:${line.updateId}`
        : null;
    case "free_entitlement":
      return line.id || (line.productId ? `free:${line.productId}` : null);
    case "selected_modules":
      return line.productId && line.moduleId
        ? `module:${line.productId}:${line.moduleId}`
        : null;
    case "selected_resources":
      return line.productId && line.resourceId
        ? `resource:${line.productId}:${line.resourceId}`
        : null;
    default:
      return null;
  }
};

/**
 * The Firestore doc id for the canonical entitlement record. This is
 * `<uid>__<entitlementId>` so each (user, entitlement) pair is unique
 * and idempotent writes are safe.
 */
export const buildEntitlementDocId = (uid, entitlementId) => {
  if (!uid || !entitlementId) return null;
  return `${uid}__${entitlementId}`;
};

/**
 * Build the canonical entitlement record that will be written to
 * Firestore (under `entitlements/{uid}__{entitlementId}`) AND the
 * legacy-compatible fields the old `users/{uid}/purchases` writers
 * relied on. The transaction writer applies them; the receipt
 * renderer reads them.
 */
export const buildEntitlementRecord = ({
  uid,
  line,
  orderId,
  paymentId,
  source,
  now,
}) => {
  if (!uid || !line) return null;
  const entitlementKind = toEntitlementKind(line.kind);
  if (!entitlementKind) return null;
  const entitlementId = deriveEntitlementId(line);
  if (!entitlementId) return null;
  const amountPaise = Math.max(
    0,
    Math.round(Number(line.effectivePrice || 0)),
  );
  return {
    uid,
    productId: line.productId || null,
    kind: entitlementKind,
    moduleId: line.moduleId || null,
    resourceId: line.resourceId || null,
    updateId: line.updateId || null,
    subscriptionPlanId: null,
    featureId: null,
    entitlementId,
    orderId: orderId || null,
    paymentId: paymentId || null,
    status: "active",
    amount: amountPaise,
    currency: "INR",
    source: source || "razorpay",
    unlockedAt: now || Date.now(),
    title: line.title || null,
    parentTitle: line.parentTitle || null,
  };
};

/**
 * The set of entitlement ids that would be (re-)granted for the given
 * quote's line items, skipping already-owned ones. Used by the
 * transaction writer for the idempotency skip check.
 */
export const collectGrantableEntitlementIds = (quote) => {
  const ids = new Set();
  if (!quote || !Array.isArray(quote.verifiedLineItems)) return ids;
  for (const line of quote.verifiedLineItems) {
    if (!isGrantableLine(line)) continue;
    const eid = deriveEntitlementId(line);
    if (eid) ids.add(eid);
  }
  return ids;
};

/**
 * Whether a `quote.status === "consumed"` write should be skipped —
 * the verify-payment step is the only place allowed to flip a quote
 * from `active` → `consumed`, and only once per quote. If the quote
 * is already consumed we treat the verify call as a successful
 * replay and return the previously-recorded orderId/paymentId
 * without re-granting.
 */
export const isQuoteReplayable = (quote) => {
  if (!quote) return false;
  if (quote.status !== "consumed") return false;
  return Boolean(quote.consumedAt) && Boolean(quote.consumedOrderId);
};

/**
 * Pure helper: given an entitlement record and a `now` timestamp,
 * return whether the entitlement is "live" (active, not expired,
 * etc.). Part 6 only supports perpetual entitlements so this is
 * trivially true when status === "active".
 */
export const isEntitlementActive = (record, now = Date.now()) => {
  if (!record) return false;
  if (record.status !== "active") return false;
  if (typeof record.expiresAt === "number" && record.expiresAt <= now) return false;
  return true;
};

/**
 * Partition a quote's line items by whether they would produce a
 * new entitlement (`grantable`) or would be skipped because they're
 * already owned / not Part 6 eligible (`skip`). Useful for the
 * verify-payment response and the success page.
 */
export const partitionGrantable = (quote) => {
  const grantable = [];
  const skip = [];
  if (!quote || !Array.isArray(quote.verifiedLineItems)) {
    return { grantable, skip };
  }
  for (const line of quote.verifiedLineItems) {
    if (isGrantableLine(line)) {
      grantable.push(line);
    } else {
      skip.push(line);
    }
  }
  return { grantable, skip };
};

/**
 * Shape the receipt-friendly summary the success page renders. Pure:
 * takes a quote + the verify-payment response envelope and returns
 * the structured data the success step needs.
 */
export const buildSuccessReceipt = ({
  quote,
  orderId,
  paymentId,
  paymentMethod,
  grantedEntitlementIds,
}) => {
  if (!quote) return null;
  const lineItems = Array.isArray(quote.verifiedLineItems) ? quote.verifiedLineItems : [];
  const newItems = lineItems.filter((line) => !line.alreadyOwned);
  const cashPaid = Math.max(
    Number(quote.cashPayable || 0),
    Number(quote.minimumPayable || 0),
  );
  return {
    orderId: orderId || quote.quoteId || null,
    paymentId: paymentId || null,
    paymentMethod: paymentMethod || "Razorpay",
    quoteId: quote.quoteId,
    purchaseKind: quote.purchaseKind,
    lineItems,
    newItems,
    cashPaid,
    currency: quote.currency || "INR",
    grantedEntitlementIds: Array.from(new Set(grantedEntitlementIds || [])),
    issuedAt: Date.now(),
  };
};

// Type re-exports live in `utils/entitlements.d.ts` so this `.js`
// file stays importable by the Node test runner without a TS
// toolchain.
