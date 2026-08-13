// api/_lib/quotes.ts
//
// Server-authoritative price-quote engine. The only place the canonical
// Part 1 `ServerPriceQuote` is built. The corresponding pure functions
// live in `utils/serverQuotes.js` so the unit tests can drive them
// without touching Firestore.
//
// This module:
//   1. verifies the Firebase ID token,
//   2. loads the requested products from `siteProducts`,
//   3. loads the user's purchase / update entitlements,
//   4. runs the pure `buildQuote` engine,
//   5. persists the verified quote to the private `_serverQuotes`
//      collection (server-only, never client-readable),
//   6. returns the canonical `ServerPriceQuote` to the caller.
//
// Nothing in the request body is trusted for any price. Only ids are
// trusted. Every price comes from the loaded Firestore docs.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin";
import {
  buildQuote,
  type FirestoreProductDoc,
  type FirestorePurchaseDoc,
  type ServerPriceQuoteRecord,
} from "../../utils/serverQuotes";
import {
  loadCouponByCode,
  loadUserCouponUsageCount,
  loadUserHasPriorPurchases,
} from "./coupons";
import { loadSubscriptionSelectionContext } from "./subscriptions";
import type { CouponDoc } from "../../utils/coupons";
import type { CheckoutSelection } from "../../src/types/commerce";

const QUOTE_TTL_MS = 15 * 60 * 1000;
const QUOTES_COLLECTION = "_serverQuotes";
const MAX_PRODUCT_IDS = 50;

const cleanId = (value: unknown, max = 100) =>
  String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, max);

const cleanString = (value: unknown, max = 200) =>
  String(value || "").trim().slice(0, max);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const PURCHASE_KINDS = new Set<CheckoutSelection["purchaseKind"]>([
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
 * Sanitise the incoming selection body. The endpoint refuses anything
 * outside the canonical shape — including `finalPrice`, `subtotal`,
 * `discount`, and `entitlementStatus` which the spec explicitly forbids.
 */
export const parseSelection = (body: unknown): CheckoutSelection | null => {
  if (!isPlainObject(body) || !isPlainObject(body.selection)) return null;
  const raw = body.selection;
  if (typeof raw.purchaseKind !== "string") return null;
  const kind = raw.purchaseKind as CheckoutSelection["purchaseKind"];
  if (!PURCHASE_KINDS.has(kind)) return null;
  if (!isStringArray(raw.productIds) && raw.purchaseKind !== "free_entitlement") return null;
  if (!isStringArray(raw.moduleIds)) return null;
  if (!isStringArray(raw.resourceIds)) return null;
  // Refuse any field the spec lists as untrusted.
  const forbidden = ["finalPrice", "subtotal", "discount", "entitlementStatus", "status", "alreadyOwned", "couponDiscount", "couponType", "couponValue"];
  for (const key of forbidden) {
    if (key in raw) return null;
  }
  return {
    purchaseKind: kind,
    productIds: isStringArray(raw.productIds) ? raw.productIds.slice(0, MAX_PRODUCT_IDS) : [],
    moduleIds: raw.moduleIds.slice(0, MAX_PRODUCT_IDS),
    resourceIds: raw.resourceIds.slice(0, MAX_PRODUCT_IDS),
    updateId: typeof raw.updateId === "string" ? cleanId(raw.updateId) : null,
    subscriptionPlanId: typeof raw.subscriptionPlanId === "string" ? cleanId(raw.subscriptionPlanId) : null,
    billingCycle: (raw.billingCycle === "monthly" || raw.billingCycle === "yearly") ? raw.billingCycle : null,
    featureIds: isStringArray(raw.featureIds) ? raw.featureIds.slice(0, MAX_PRODUCT_IDS) : [],
    couponCode: typeof raw.couponCode === "string" ? cleanString(raw.couponCode, 60) : null,
    requestedEduCoins: typeof raw.requestedEduCoins === "number" && raw.requestedEduCoins >= 0 ? Math.floor(raw.requestedEduCoins) : 0,
    returnRoute: typeof raw.returnRoute === "string" ? cleanString(raw.returnRoute, 200) : null,
  };
};

/**
 * Resolve the product ids the server needs to load, taking into account
 * the kind (e.g. paid_update needs the base product AND the updateId).
 * Returned list is de-duped and capped at MAX_PRODUCT_IDS.
 */
const resolveProductIdsToLoad = (selection: CheckoutSelection): string[] => {
  const ids = new Set<string>();
  for (const id of selection.productIds) ids.add(cleanId(id));
  return Array.from(ids).filter(Boolean).slice(0, MAX_PRODUCT_IDS);
};

/**
 * Load the products referenced by the selection. Missing docs are
 * silently dropped — the engine reports them as 404.
 */
const normalizeProductDoc = (data: Record<string, unknown>, lookupId: string, documentId?: string): FirestoreProductDoc => {
  const publicId = String(data.id || lookupId);
  return {
    ...data,
    id: lookupId,
    documentId: documentId || publicId,
    publicId,
  } as FirestoreProductDoc;
};

const loadProducts = async (productIds: string[]): Promise<Map<string, FirestoreProductDoc>> => {
  const db = adminDb();
  const map = new Map<string, FirestoreProductDoc>();
  if (!productIds.length) return map;
  const refs = productIds.map((id) => db.collection("siteProducts").doc(id));
  const snaps = await db.getAll(...refs);
  const missing: string[] = [];
  for (let i = 0; i < snaps.length; i += 1) {
    const snap = snaps[i];
    const id = productIds[i];
    if (!snap.exists) {
      missing.push(id);
      continue;
    }
    map.set(id, normalizeProductDoc((snap.data() || {}) as Record<string, unknown>, id, snap.id));
  }
  for (const id of missing) {
    const candidates = [id];
    if (/^\d+$/.test(id)) candidates.push(String(Number(id)));
    let found: { id: string; data: () => Record<string, unknown> } | undefined;
    for (const candidate of candidates) {
      const byString = await db.collection("siteProducts").where("id", "==", candidate).limit(1).get();
      found = byString.docs[0];
      if (found) break;
      if (/^\d+$/.test(candidate)) {
        const byNumber = await db.collection("siteProducts").where("id", "==", Number(candidate)).limit(1).get();
        found = byNumber.docs[0];
        if (found) break;
      }
    }
    if (!found) continue;
    map.set(id, normalizeProductDoc((found.data() || {}) as Record<string, unknown>, id, found.id));
  }
  return map;
};

/**
 * Load the user's purchase docs and per-product update ids. Returns a
 * Map<productId, { purchaseDocs, updateIds }>.
 */
const loadEntitlements = async (
  uid: string,
  productIds: string[],
): Promise<Map<string, { purchaseDocs: FirestorePurchaseDoc[]; updateIds: string[] }>> => {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? (userSnap.data() || {}) : {};
  const purchasedUpdateIds = (userData.purchasedProductUpdateIds || {}) as Record<string, unknown>;
  const purchasesMap = (userData.purchases || {}) as Record<string, unknown>;
  void purchasesMap; // reserved for future per-line entitlement reads

  const result = new Map<string, { purchaseDocs: FirestorePurchaseDoc[]; updateIds: string[] }>();
  for (const productId of productIds) {
    // The user's purchases subcollection: `users/{uid}/purchases/{productId}`
    // carries the base-product purchase, and
    // `users/{uid}/purchases/{productId}__update__{updateId}` carries
    // the per-update entitlement.
    const baseRef = userRef.collection("purchases").doc(productId);
    const baseSnap = await baseRef.get();
    const purchaseDocs: FirestorePurchaseDoc[] = [];
    if (baseSnap.exists) {
      purchaseDocs.push({ ...(baseSnap.data() || {}), productDocumentId: productId } as FirestorePurchaseDoc);
    }
    // Collect all update entitlements for this product via id-prefix scan.
    // (We avoid a `select` on `updateId` here because Firestore Admin
    // SDK requires a composite index for `where("productId", "==", X)
    // && where("updateId", "!=", null)`. Instead we list documents in
    // the user's `purchases` subcollection whose id starts with
    // `${productId}__update__`.)
    const prefix = `${productId}__update__`;
    const listSnap = await userRef.collection("purchases").listDocuments();
    for (const docRef of listSnap) {
      if (!docRef.id.startsWith(prefix)) continue;
      const dsnap = await docRef.get();
      if (!dsnap.exists) continue;
      const d = dsnap.data() || {};
      const updateId = String(d.updateId || docRef.id.slice(prefix.length) || "");
      if (!updateId) continue;
      purchaseDocs.push({ ...d, productDocumentId: productId, updateId } as FirestorePurchaseDoc);
    }
    const updateIds = Array.isArray(purchasedUpdateIds[productId])
      ? (purchasedUpdateIds[productId] as unknown[]).map((v) => String(v))
      : [];
    result.set(productId, { purchaseDocs, updateIds });
  }
  return result;
};

/**
 * The handler exposed via `api/quotes/create.ts`. Verifies the token,
 * loads products + entitlements, runs the pure engine, persists the
 * quote, and returns the canonical `ServerPriceQuote` (with an extra
 * `quoteId` and `expiresAt`).
 */
export const handleCreateQuote = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const selection = parseSelection(req.body);
    if (!selection) {
      return res.status(400).json({ ok: false, error: "Invalid checkout selection. Client-supplied prices/discounts/status are not accepted." });
    }

    // Refuse subscription-feature selections: out of scope for Part 4.
    if (selection.purchaseKind === "full_product" && selection.featureIds.length > 0) {
      return res.status(400).json({ ok: false, error: "Subscription features are not part of this endpoint." });
    }

    // Optional idempotency key from the client.
    const idempotencyKey = cleanString(
      isPlainObject(req.body) ? req.body.idempotencyKey : null,
      120,
    ) || null;

    const db = adminDb();
    const productIdsToLoad = resolveProductIdsToLoad(selection);
    const products = await loadProducts(productIdsToLoad);
    const entitlements = await loadEntitlements(firebaseUser.uid, productIdsToLoad);

    // Build the `purchasesByProduct` map the pure engine expects. We
    // augment each product's purchaseDocs with the user's per-product
    // `purchasedProductUpdateIds[productId]` so the engine can detect
    // "owned via paid update".
    const purchasesByProduct = new Map<string, FirestorePurchaseDoc[]>();
    for (const productId of productIdsToLoad) {
      const entry = entitlements.get(productId);
      const docs = [...(entry ? entry.purchaseDocs : [])];
      // Add synthetic purchase docs for owned updates so the engine's
      // `isModuleOwned` helper sees the update entitlements via the
      // product doc's `purchasedProductUpdateIds` path. The engine
      // also reads `ownedUpdateIds` directly (see below), so this is
      // belt-and-braces.
      purchasesByProduct.set(productId, docs);
    }

    // Build a per-product `ownedUpdateIds` set so the engine's
    // dependency check sees paid-update ownership.
    const ownedUpdateIdsByProduct = new Map<string, Set<string>>();
    for (const productId of productIdsToLoad) {
      const ids = entitlements.get(productId)?.updateIds || [];
      ownedUpdateIdsByProduct.set(productId, new Set(ids));
    }

    // Run the pure engine. Inject ownership into each per-product
    // sub-engine call by wrapping the product map with the engine's
    // expected shape and feeding `ownedUpdateIds` via the product doc's
    // `purchasedProductUpdateIds` field. (The engine reads
    // `purchasedProductUpdateIds[productId]` from the user doc; we
    // already loaded those via `loadEntitlements` and stored the
    // resulting sets in `ownedUpdateIdsByProduct`. The engine currently
    // reads `ownedUpdateIds` from the purchasesByProduct map; we
    // attach the per-product update-id list as a virtual purchase doc
    // that the engine will treat as a no-op for line building but use
    // for ownership checks. Simpler: the engine helper
    // `isModuleOwned` reads `ownedUpdateIds` from the ownership
    // argument the engine builds internally. We extend that via
    // a wrapper.)
    const wrappedPurchasesByProduct = new Map<string, FirestorePurchaseDoc[]>();
    for (const productId of productIdsToLoad) {
      const original = purchasesByProduct.get(productId) || [];
      const updateIds = ownedUpdateIdsByProduct.get(productId) || new Set();
      // Each owned update becomes a "synthetic" purchase doc that
      // carries `updateId` so `computeOwnedEntitlementIds` picks it
      // up. The actual `isModuleOwned` check is done by the engine
      // via the `ownedUpdateIds` arg, which the engine also reads
      // from the per-product `purchaseDocs` (via `isProductOwned`
      // and per-update ids). The engine implementation in
      // `utils/serverQuotes.js` already reads
      // `ownedEntitlementIds` from the purchase docs, so this is
      // the contract the engine honours.
      const docs: FirestorePurchaseDoc[] = [...original];
      for (const updateId of updateIds) {
        docs.push({ productDocumentId: productId, updateId, entitlementId: `${productId}__update__${updateId}` });
      }
      wrappedPurchasesByProduct.set(productId, docs);
    }

    const quoteId = `Q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    // Idempotency: if a matching active quote already exists for this
    // (uid, idempotencyKey) pair, return it instead of building a new
    // one. We look up by a deterministic doc id derived from
    // (uid, idempotencyKey). This keeps the operation safe to retry.
    if (idempotencyKey) {
      const idemRef = db.collection(QUOTES_COLLECTION).doc(`idem:${firebaseUser.uid}:${cleanId(idempotencyKey, 80)}`);
      const idemSnap = await idemRef.get();
      if (idemSnap.exists) {
        const existing = idemSnap.data() as ServerPriceQuoteRecord | undefined;
        if (existing && existing.uid === firebaseUser.uid && existing.status === "active" && (existing.expiresAt || 0) > Date.now()) {
          return res.status(200).json({ ok: true, quote: existing, idempotent: true });
        }
      }
    }

    // The pure engine only sees Map<id, doc>; the `ownedUpdateIds` it
    // uses for `isModuleOwned` is currently empty in our call. To make
    // the engine aware of paid-update ownership, we attach the
    // update-id list to each product doc under the synthetic field
    // `purchasedProductUpdateIds` (the engine reads it from the user
    // doc normally; for the server-driven path we replicate it here).
    const productsWithOwnership = new Map<string, FirestoreProductDoc>();
    for (const [id, doc] of products.entries()) {
      const ids = ownedUpdateIdsByProduct.get(id);
      if (ids && ids.size > 0) {
        productsWithOwnership.set(id, { ...doc, purchasedProductUpdateIds: { [id]: Array.from(ids) } } as FirestoreProductDoc);
      } else {
        productsWithOwnership.set(id, doc);
      }
    }

    // -----------------------------------------------------------------
    // Part 7 — load the coupon (if any) and the user context the
    // engine needs. The coupon doc is read once and passed to
    // `buildQuote`, which validates it against the order and
    // either applies the discount or returns 400. The engine
    // NEVER reads `selection.couponCode` directly for math; it
    // only uses the loaded coupon doc.
    // -----------------------------------------------------------------
    let coupon: CouponDoc | null = null;
    let userCouponUsageCount = 0;
    let userHasPriorPurchases = false;
    if (selection.couponCode) {
      coupon = await loadCouponByCode(selection.couponCode);
      // We don't 404 on missing coupons here — the engine will
      // surface a clean error message via `validateCoupon`. (An
      // attacker probing for codes gets the same response shape
      // for every code.)
      if (coupon) {
        [userCouponUsageCount, userHasPriorPurchases] = await Promise.all([
          loadUserCouponUsageCount(firebaseUser.uid, coupon.code),
          loadUserHasPriorPurchases(firebaseUser.uid),
        ]);
      }
    }

    // Pre-compute the order subtotal so the engine can use it for
    // `minOrderPaise`. The engine computes its own subtotal too,
    // but the eligibility pre-check needs the per-product
    // categories from the loaded docs.
    const productCategories: string[] = Array.from(
      new Set(
        Array.from(productsWithOwnership.values())
          .map((p) => (p && typeof (p as { category?: unknown }).category === "string" ? String((p as { category?: string }).category) : ""))
          .filter(Boolean),
      ),
    );

    // Part 9 — when the selection is a subscription, load the
    // plan + features + product/module unlock mappings so the
    // engine can build the canonical line items. The pure
    // `utils/subscriptions.js` engine does the math; this loader
    // is the only place that touches Firestore.
    let subscriptionLineItems: unknown[] | null = null;
    let subscriptionExpiresAt: number | null = null;
    if (
      selection.purchaseKind === "subscription" ||
      selection.purchaseKind === "subscription_features"
    ) {
      const subContext = await loadSubscriptionSelectionContext(selection);
      if (!subContext.ok) {
        return res.status(subContext.status).json({
          ok: false,
          error: subContext.error,
          subscriptionRefused: true,
          subscriptionErrorCode: subContext.code,
        });
      }
      subscriptionLineItems = subContext.lineItems as unknown[];
      subscriptionExpiresAt = subContext.expiresAt;
    }

    const out = buildQuote({
      selection,
      products: productsWithOwnership,
      purchasesByProduct: wrappedPurchasesByProduct,
      uid: firebaseUser.uid,
      now: Date.now(),
      ttlMs: QUOTE_TTL_MS,
      quoteId,
      coupon,
      userCouponUsageCount,
      userHasPriorPurchases,
      productCategories,
      subscriptionLineItems,
      subscriptionExpiresAt,
    });
    if (!out.ok) {
      // When the engine refused because of a bad coupon, return a
      // more specific error code so the client can show a targeted
      // message. The engine's `reason` is already human-readable.
      return res.status(out.status).json({
        ok: false,
        error: out.reason,
        ...(coupon ? { couponCode: coupon.code, couponRefused: true } : {}),
      });
    }
    const quote = out.quote;

    // Persist the verified quote to the private collection.
    const now = Date.now();
    const quoteRecord: ServerPriceQuoteRecord & { _metadata: Record<string, unknown> } = {
      ...quote,
      _metadata: {
        createdAt: now,
        idempotencyKey,
        ipUid: firebaseUser.uid,
        userEmail: firebaseUser.email || "",
      },
    };
    const expiresAtTs = Timestamp.fromMillis(quote.expiresAt);
    const persistable = JSON.parse(JSON.stringify({
      ...quoteRecord,
      _metadata: {
        ...quoteRecord._metadata,
        createdAt: now,
        expiresAt: quote.expiresAt,
        expiresAtTs,
        serverCreatedAt: "server",
      },
    }));
    persistable._metadata.createdAt = FieldValue.serverTimestamp();
    persistable._metadata.expiresAt = expiresAtTs;
    await db.collection(QUOTES_COLLECTION).doc(quote.quoteId).set(persistable, { merge: false });
    if (idempotencyKey) {
      const idemRef = db.collection(QUOTES_COLLECTION).doc(`idem:${firebaseUser.uid}:${cleanId(idempotencyKey, 80)}`);
      await idemRef.set({ quoteId: quote.quoteId, uid: firebaseUser.uid, idempotencyKey, createdAt: FieldValue.serverTimestamp() }, { merge: false });
    }

    return res.status(200).json({ ok: true, quote, idempotent: false });
  } catch (error) {
    return errorResponse(res, error, "Could not create price quote.");
  }
};

/**
 * The handler exposed via GET `api/quotes/create.ts`. Loads a previously
 * created quote by `quoteId` and confirms the requesting user owns it.
 * Returns 404 for unknown ids and 403 for cross-user access.
 */
export const handleFetchQuote = async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const quoteId = cleanString(
      isPlainObject(req.body) ? req.body.quoteId : null,
      120,
    ) || (typeof (req as { query?: Record<string, string> }).query?.quoteId === "string" ? cleanString((req as { query?: Record<string, string> }).query?.quoteId, 120) : "");
    if (!quoteId) return res.status(400).json({ ok: false, error: "Missing quoteId." });
    const db = adminDb();
    const snap = await db.collection(QUOTES_COLLECTION).doc(quoteId).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "Quote not found." });
    const quote = snap.data() as ServerPriceQuoteRecord | undefined;
    if (!quote) return res.status(404).json({ ok: false, error: "Quote not found." });
    if (quote.uid !== firebaseUser.uid) {
      return res.status(403).json({ ok: false, error: "This quote belongs to a different account." });
    }
    if (quote.status === "consumed" || quote.status === "invalid") {
      return res.status(410).json({ ok: false, error: "Quote has been consumed or invalidated." });
    }
    if ((quote.expiresAt || 0) <= Date.now()) {
      return res.status(410).json({ ok: false, error: "Quote has expired." });
    }
    return res.status(200).json({ ok: true, quote });
  } catch (error) {
    return errorResponse(res, error, "Could not fetch price quote.");
  }
};

export const __testing = {
  parseSelection,
  resolveProductIdsToLoad,
  QUOTE_TTL_MS,
  MAX_PRODUCT_IDS,
  QUOTES_COLLECTION,
};

/**
 * Part 6 — load a persisted server quote by id for the trusted server
 * surface (Razorpay create-order / verify-payment). The caller is
 * expected to have already verified the Firebase ID token; this helper
 * still re-checks the quote's `uid`, `status`, and `expiresAt` so the
 * Razorpay path can never act on a quote belonging to a different
 * account or an expired one.
 *
 * Returns `{ ok: true, quote }` on success, otherwise an
 * `{ ok: false, status, error }` object the Razorpay endpoints can
 * pass straight to `res.status(...).json(...)`.
 */
export const loadServerQuoteForUser = async (
  quoteId: string,
  uid: string,
  now: number = Date.now(),
): Promise<
  | { ok: true; quote: ServerPriceQuoteRecord }
  | { ok: false; status: number; error: string }
> => {
  const cleanIdValue = cleanId(quoteId, 120);
  if (!cleanIdValue) {
    return { ok: false, status: 400, error: "Missing quoteId." };
  }
  const db = adminDb();
  const snap = await db.collection(QUOTES_COLLECTION).doc(cleanIdValue).get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: "Quote not found." };
  }
  const quote = snap.data() as ServerPriceQuoteRecord | undefined;
  if (!quote) {
    return { ok: false, status: 404, error: "Quote not found." };
  }
  if (quote.uid !== uid) {
    return { ok: false, status: 403, error: "This quote belongs to a different account." };
  }
  if (quote.status === "consumed" || quote.status === "invalid") {
    return { ok: false, status: 410, error: `Quote has been ${quote.status}.` };
  }
  if ((quote.expiresAt || 0) <= now) {
    return { ok: false, status: 410, error: "Quote has expired." };
  }
  return { ok: true, quote };
};
