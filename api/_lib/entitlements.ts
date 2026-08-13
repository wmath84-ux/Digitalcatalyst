// api/_lib/entitlements.ts
//
// Part 6 — Server-side entitlement writer. Runs the canonical
// entitlement grant inside a Firestore transaction so the operation
// is atomic + idempotent. The pure shape logic lives in
// `utils/entitlements.js` so the Node test runner can drive it
// without touching Firestore.
//
// This module:
//   1. Reads the canonical `ServerPriceQuote` (caller has already
//      loaded + verified it via `loadServerQuoteForUser`).
//   2. For each non-owned line item, writes:
//        a. `entitlements/{uid}__{entitlementId}` — the canonical
//           per-entitlement doc (one doc per purchase-kind
//           sub-item: module, resource, paid_update, free, or
//           full_product).
//        b. `users/{uid}.purchasedProductIds` (legacy array) — for
//           every full_product line.
//        c. `users/{uid}.purchasedProductUpdateIds[productId]`
//           (legacy map) — for every paid_update line.
//        d. `users/{uid}/purchases/{productId}` — the legacy
//           base-product purchase doc that PDP / Course Player
//           already read from.
//        e. `users/{uid}/purchases/{productId}__update__{updateId}`
//           — the legacy paid-update doc.
//   3. Marks the quote `status: "consumed"` (transition only from
//      `"active"`; consumed quotes stay consumed for replay).
//   4. Marks the payment intent `status: "verified"` and writes
//      `paymentId` / `verifiedAt`.
//   5. Writes the `siteOrders/{orderId}` receipt (idempotent — never
//      overwrites an existing order).
//
// All five writes happen inside a single `db.runTransaction` so
// either everything lands or nothing does. The replay-prevention
// story is: if the caller is calling us a second time, the quote is
// already `consumed`, the entitlements already exist, the order
// already exists, and the function short-circuits with
// `{ ok: true, replayed: true, ... }`.

import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import {
  buildEntitlementDocId,
  buildEntitlementRecord,
  collectGrantableEntitlementIds,
  isGrantableLine,
  type EntitlementRecord,
  type ServerPriceQuote,
} from "../../utils/entitlements";
import { applyCouponRedemption, loadCouponByCode } from "./coupons";
import type { CouponDoc } from "../../utils/coupons";
import { ensureReferralCoupon } from "./referrals";
import {
  collectSubscriptionEntitlementIds,
  loadPlanById,
  writeSubscriptionAfterPayment,
  type BillingCycle,
  type SubscriptionPlanDoc,
} from "./subscriptions";

/** Firestore collection / subcollection names. Kept here for testability. */
const ENTITLEMENTS_COLLECTION = "entitlements";
const ORDERS_COLLECTION = "siteOrders";
const USERS_COLLECTION = "users";
const PURCHASES_SUBCOLLECTION = "purchases";
const PAYMENT_INTENTS_COLLECTION = "_paymentIntents";

/** Build the `users/{uid}/purchases/{productId}` doc id for an update. */
const updatePurchaseDocId = (productId: string, updateId: string): string =>
  `${productId}__update__${updateId}`;

/**
 * Options accepted by `grantEntitlementsFromQuote`. All fields are
 * required; the helper has no defaults because every consumer is
 * server-driven.
 */
export interface GrantEntitlementsInput {
  /** The verified `ServerPriceQuoteRecord` (caller has already checked uid/status/expiry). */
  quote: ServerPriceQuote;
  /** The Razorpay order id. */
  orderId: string;
  /** The Razorpay payment id (may be `null` for free / replay-without-payment). */
  paymentId: string | null;
  /** Payment source. */
  source: "razorpay" | "free" | "admin";
  /** Whether the write was triggered by a replay (used for response shape only). */
  isReplay?: boolean;
}

export interface GrantEntitlementsResult {
  ok: true;
  /** Whether this call was an idempotent replay of an already-granted quote. */
  replayed: boolean;
  /** Entitlement ids that were (re-)granted or already existed for this quote. */
  grantedEntitlementIds: string[];
  /** Total paise paid (from `quote.cashPayable`). */
  amountPaise: number;
  /** The new / existing `siteOrders/{orderId}` snapshot (best-effort). */
  order: {
    id: string;
    total: string;
    items: Array<{ id: string; name: string; quantity: number; price: string }>;
  };
  /**
   * Part 7 — coupon redemption details (when the quote carried a
   * coupon). `redeemed: true` means the coupon usage counter was
   * incremented in this call; `replay: true` means the redemption
   * was a no-op (a prior successful payment already redeemed the
   * coupon for this orderId).
   */
  couponRedemption?: {
    couponCode: string;
    discountPaise: number;
    redeemed: boolean;
    redemptionId: string | null;
  };
}

/**
 * Construct the `siteOrders/{orderId}` payload. Pure: takes a quote
 * + the envelope and returns the order data the transaction writer
 * will persist.
 *
 * Money convention (matches the existing `grantProductEntitlements`
 * writer): the `price` / `total` fields are human-readable
 * rupee-strings (`"₹X.XX"`), and `amountPaise` / `pricePaise` are
 * integer paise.
 */
export const buildSiteOrder = ({
  uid,
  email,
  name,
  quote,
  orderId,
  paymentId,
  source,
  grantedEntitlementIds,
  now,
}: {
  uid: string;
  email?: string | null;
  name?: string | null;
  quote: ServerPriceQuote;
  orderId: string;
  paymentId: string | null;
  source: "razorpay" | "free" | "admin";
  grantedEntitlementIds: string[];
  now: number;
}) => {
  const cashPayable = Math.max(Number(quote.cashPayable || 0), Number(quote.minimumPayable || 0));
  const lines = (Array.isArray(quote.verifiedLineItems) ? quote.verifiedLineItems : []) as Array<{
    id: string;
    title?: string;
    kind: string;
    productId?: string | null;
    moduleId?: string | null;
    resourceId?: string | null;
    updateId?: string | null;
    entitlementId?: string | null;
    quantity?: number;
    effectivePrice?: number;
    alreadyOwned?: boolean;
  }>;
  const items = lines.map((line) => {
    const pricePaise = Math.max(0, Math.round(Number(line.effectivePrice || 0)));
    const priceRupees = (pricePaise / 100).toFixed(2);
    return {
      id: line.id,
      name: line.title || "Digital product",
      kind: line.kind,
      productId: line.productId || null,
      moduleId: line.moduleId || null,
      resourceId: line.resourceId || null,
      updateId: line.updateId || null,
      entitlementId: line.entitlementId || null,
      quantity: Number(line.quantity || 1),
      price: `₹${priceRupees}`,
      pricePaise,
      alreadyOwned: Boolean(line.alreadyOwned),
    };
  });
  return {
    id: orderId,
    customerUid: uid,
    customerName: name || "",
    customerEmail: email || "",
    date: new Date(now).toISOString(),
    total: `₹${(cashPayable / 100).toFixed(2)}`,
    amountPaise: cashPayable,
    currency: "INR",
    status: "Completed",
    paymentStatus: source === "razorpay" ? "Verified" : source === "free" ? "Free" : "Admin",
    paymentProvider: source,
    paymentId: paymentId || "",
    quoteId: quote.quoteId,
    purchaseKind: quote.purchaseKind,
    // Part 7 — surface the verified coupon on the receipt so the
    // success page can render it.
    couponCode: quote.couponCode || null,
    couponType: quote.couponType || null,
    couponValue: typeof quote.couponValue === "number" ? quote.couponValue : null,
    couponDiscount: Number(quote.couponDiscount || 0),
    entitlementIds: grantedEntitlementIds,
    items,
    createdAt: now,
  };
};

/**
 * Write the canonical entitlements, legacy `purchasedProductIds`,
 * legacy `purchases/{productId}` subcollection, the `siteOrders`
 * receipt, and the quote / payment-intent status transitions — all
 * in one Firestore transaction.
 *
 * The function is idempotent. Calling it twice for the same quote is
 * safe; the second call returns `{ replayed: true, ... }` without
 * re-writing the entitlements.
 */
export const grantEntitlementsFromQuote = async (
  input: GrantEntitlementsInput,
  options: { db?: Firestore; now?: number } = {},
): Promise<GrantEntitlementsResult> => {
  const db = options.db ?? adminDb();
  const now = options.now ?? Date.now();
  const { quote, orderId, paymentId, source, isReplay } = input;

  // The caller should have already verified the quote's uid/status/expiry.
  // We re-assert here to defend against misuse.
  if (!quote || !quote.quoteId) {
    throw Object.assign(new Error("Invalid quote."), { statusCode: 500 });
  }

  // Pre-compute the entitlement records outside the transaction so
  // the transaction body stays small.
  const grantedEntitlementIds: string[] = [];
  const records: EntitlementRecord[] = [];
  const productIdsForLegacy: string[] = [];
  const updateIdsByProduct: Record<string, string[]> = {};
  for (const line of quote.verifiedLineItems || []) {
    if (!isGrantableLine(line)) continue;
    const record = buildEntitlementRecord({
      uid: quote.uid,
      line,
      orderId,
      paymentId,
      source,
      now,
    });
    if (!record) continue;
    records.push(record);
    grantedEntitlementIds.push(record.entitlementId);
    // Legacy dual-write paths.
    if (record.kind === "full_product" && record.productId) {
      productIdsForLegacy.push(record.productId);
    }
    if (record.kind === "paid_update" && record.productId && record.updateId) {
      const arr = updateIdsByProduct[record.productId] || (updateIdsByProduct[record.productId] = []);
      if (!arr.includes(record.updateId)) arr.push(record.updateId);
    }
  }

  const userRef = db.collection(USERS_COLLECTION).doc(quote.uid);
  const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
  const intentRef = db.collection(PAYMENT_INTENTS_COLLECTION).doc(orderId);

  let replayed = Boolean(isReplay);
  const nowTs = Timestamp.fromMillis(now);

  await db.runTransaction(async (tx: Transaction) => {
    const intentSnap = await tx.get(intentRef);
    if (intentSnap.exists) {
      const intent = intentSnap.data() as { status?: string } | undefined;
      if (intent && intent.status === "verified") {
        replayed = true;
      }
    }

    // 1. Canonical entitlements — one doc per (uid, entitlementId).
    for (const record of records) {
      const docId = buildEntitlementDocId(quote.uid, record.entitlementId);
      if (!docId) continue;
      const ref = db.collection(ENTITLEMENTS_COLLECTION).doc(docId);
      const existing = await tx.get(ref);
      if (existing.exists) {
        // Idempotent: keep the existing record; do not overwrite.
        continue;
      }
      tx.set(ref, { ...record, unlockedAt: nowTs });
    }

    // 2. Legacy `purchasedProductIds` array on the user doc.
    if (productIdsForLegacy.length) {
      tx.set(
        userRef,
        {
          purchasedProductIds: FieldValue.arrayUnion(...productIdsForLegacy),
          updatedAt: nowTs,
        },
        { merge: true },
      );
    }

    // 3. Legacy `purchasedProductUpdateIds[productId]` map on the user doc.
    const updateMerge: Record<string, unknown> = { updatedAt: nowTs };
    for (const [productId, updateIds] of Object.entries(updateIdsByProduct)) {
      if (!updateIds.length) continue;
      updateMerge[`purchasedProductUpdateIds.${productId}`] = FieldValue.arrayUnion(...updateIds);
    }
    if (Object.keys(updateMerge).length > 1) {
      tx.set(userRef, updateMerge, { merge: true });
    }

    // 4. Legacy `users/{uid}/purchases/{productId}` + update docs.
    for (const record of records) {
      if (!record.productId) continue;
      if (record.kind === "full_product") {
        const ref = userRef.collection(PURCHASES_SUBCOLLECTION).doc(record.productId);
        const existing = await tx.get(ref);
        if (existing.exists) continue; // idempotent
        const paise = Math.max(0, Math.round(Number(record.amount || 0)));
        tx.set(ref, {
          productId: Number.isFinite(Number(record.productId))
            ? Number(record.productId)
            : record.productId,
          productDocumentId: record.productId,
          title: record.title || "Digital product",
          quantity: 1,
          total: `₹${(paise / 100).toFixed(2)}`,
          amountPaise: paise,
          currency: "INR",
          status: "Verified",
          source,
          orderId,
          paymentId: paymentId || "",
          unlockedAt: nowTs,
        });
      } else if (record.kind === "paid_update" && record.updateId) {
        const ref = userRef
          .collection(PURCHASES_SUBCOLLECTION)
          .doc(updatePurchaseDocId(record.productId, record.updateId));
        const existing = await tx.get(ref);
        if (existing.exists) continue;
        const paise = Math.max(0, Math.round(Number(record.amount || 0)));
        tx.set(ref, {
          productId: record.productId,
          productDocumentId: record.productId,
          updateId: record.updateId,
          title: record.title || "Course update",
          contentNames: [],
          amountPaise: paise,
          total: `₹${(paise / 100).toFixed(2)}`,
          status: "Verified",
          source,
          orderId,
          paymentId: paymentId || "",
          unlockedAt: nowTs,
        });
      } else if (record.kind === "module" && record.moduleId) {
        // Modules don't have a legacy writer — they only exist in
        // the canonical `entitlements` collection. PDP / Course
        // Player should read module ownership from
        // `computeOwnedEntitlementIds` (Part 4 helpers) or from the
        // canonical collection in a follow-up.
      } else if (record.kind === "resource" && record.resourceId) {
        // Same note as modules — no legacy writer.
      } else if (record.kind === "free") {
        // Free entitlements are tracked only in the canonical
        // collection.
      }
    }

    // 5. siteOrders/{orderId} — idempotent (set with merge; but only
    //    set the immutable fields if the doc doesn't already exist).
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) {
      const order = buildSiteOrder({
        uid: quote.uid,
        email: quote.uid, // The caller (verify-payment) overrides this with the real email.
        name: "",
        quote,
        orderId,
        paymentId,
        source,
        grantedEntitlementIds: grantedEntitlementIds.slice(),
        now,
      });
      tx.set(orderRef, { ...order, createdAt: nowTs }, { merge: false });
    }

    // 6. Payment intent → verified.
    tx.set(
      intentRef,
      {
        status: "verified",
        paymentId: paymentId || null,
        verifiedAt: nowTs,
        uid: quote.uid,
        quoteId: quote.quoteId,
      },
      { merge: true },
    );

    // 7. Quote → consumed (only if still active; never overwrite a
    //    consumed record's consumedAt).
    const quoteRef = db.collection("_serverQuotes").doc(quote.quoteId);
    const quoteSnap = await tx.get(quoteRef);
    if (quoteSnap.exists) {
      const current = quoteSnap.data() as { status?: string; consumedAt?: unknown } | undefined;
      if (!current || current.status === "active") {
        tx.update(quoteRef, {
          status: "consumed",
          consumedAt: nowTs,
          consumedOrderId: orderId,
          consumedPaymentId: paymentId || null,
        });
      } else if (current.status === "consumed") {
        // Replay: do not re-stamp consumedAt. The verify-payment
        // caller is expected to have already loaded the original
        // paymentId / orderId via the consumedOrderId/consumedPaymentId
        // fields.
      }
    }
  });

  // -----------------------------------------------------------------
  // Part 7 — coupon redemption. Runs in a SEPARATE transaction
  // from the entitlement write so the coupon increment is
  // independent. The redemption writer is itself idempotent (the
  // `couponRedemptions/{code}__{orderId}` doc is the key), so a
  // verify-payment replay will not double-count.
  //
  // We deliberately do this in a second transaction so a coupon
  // failure (e.g. a coupon that just hit its global limit
  // between quote and payment) does NOT roll back the entitlement
  // grant. The user keeps what they paid for; the coupon
  // redemption surfaces the failure in the response.
  // -----------------------------------------------------------------
  let couponRedemption: GrantEntitlementsResult["couponRedemption"] | undefined;
  if (quote.couponCode) {
    const coupon = (await loadCouponByCode(quote.couponCode)) as CouponDoc | null;
    if (coupon) {
      const redemption = await adminDb().runTransaction(async (tx: Transaction) => {
        return applyCouponRedemption(tx, {
          uid: quote.uid,
          coupon,
          discountPaise: Math.max(0, Math.round(Number(quote.couponDiscount || 0))),
          orderId,
          paymentId,
          now,
        });
      });
      couponRedemption = {
        couponCode: coupon.code,
        discountPaise: Math.max(0, Math.round(Number(quote.couponDiscount || 0))),
        redeemed: redemption.redeemed,
        redemptionId: redemption.redemptionId,
      };
    } else {
      // Coupon doc disappeared between quote and payment. Surface
      // the inconsistency in the response so the caller can log it.
      couponRedemption = {
        couponCode: String(quote.couponCode || ""),
        discountPaise: 0,
        redeemed: false,
        redemptionId: null,
      };
    }
  }

  // Build a fresh siteOrder summary for the response.
  const orderSummary = buildSiteOrder({
    uid: quote.uid,
    email: "",
    name: "",
    quote,
    orderId,
    paymentId,
    source,
    grantedEntitlementIds: grantedEntitlementIds.slice(),
    now,
  });

  // For the response, include the union of (a) entitlements we just
  // wrote in this call and (b) any other grantable entitlement ids
  // the quote already had on file (in case the quote was a replay of
  // a partially-completed prior call). Both are derived from the
  // quote + this call, so the response is deterministic.
  const allGrantable = collectGrantableEntitlementIds(quote);
  const responseGranted = Array.from(new Set([...grantedEntitlementIds, ...allGrantable]));

  return {
    ok: true,
    replayed,
    grantedEntitlementIds: responseGranted,
    amountPaise: Math.max(Number(quote.cashPayable || 0), Number(quote.minimumPayable || 0)),
    order: {
      id: orderSummary.id,
      total: orderSummary.total,
      items: orderSummary.items.map((item: { id: string; name: string; quantity: number; price: string }) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
    },
    couponRedemption,
  };
};

// ---------------------------------------------------------------------------
// Part 9 — subscription grant. After the entitlement transaction
// completes, this helper writes the `subscriptions/{uid}/current`
// record + the user-doc mirror + a one-row summary for the
// success page receipt. Runs in its own transaction so a
// subscription write failure does not roll back the
// entitlement grant (mirrors the coupon redemption contract).
// ---------------------------------------------------------------------------
export interface GrantSubscriptionResult {
  ok: true;
  plan: SubscriptionPlanDoc;
  features: string[];
  expiresAt: number;
  activatedAt: number;
  orderId: string;
}

export const grantSubscriptionFromQuote = async (
  input: { quote: ServerPriceQuote; orderId: string; paymentId: string | null; source: "razorpay" | "free" | "admin" },
  options: { now?: number } = {},
): Promise<GrantSubscriptionResult | null> => {
  const now = options.now ?? Date.now();
  const { quote, orderId, paymentId, source } = input;
  if (!quote || !quote.subscriptionPlanId) return null;
  const plan = await loadPlanById(quote.subscriptionPlanId);
  if (!plan) return null;
  const cycle: BillingCycle = quote.subscriptionCycle === "yearly" ? "yearly" : "monthly";
  const selectedFeatureIds = (quote.verifiedLineItems || [])
    .filter((line) => line.kind === "subscription_features" && typeof line.featureId === "string")
    .map((line) => String(line.featureId));
  // Dedupe.
  const uniqueFeatures = Array.from(new Set(selectedFeatureIds));
  const productUnlocks = (quote.verifiedLineItems || [])
    .filter((line) => line.kind === "subscription_features" && line.productId && !line.moduleId)
    .map((line) => ({ planId: plan.id, productId: String(line.productId), active: true }));
  const moduleUnlocks = (quote.verifiedLineItems || [])
    .filter((line) => line.kind === "subscription_features" && line.productId && line.moduleId)
    .map((line) => ({ planId: plan.id, productId: String(line.productId), moduleId: String(line.moduleId), active: true }));
  const effectivePlan: SubscriptionPlanDoc = {
    ...plan,
    includedProductIds: Array.from(new Set([...(plan.includedProductIds || []), ...productUnlocks.map((unlock) => unlock.productId)])),
    includedModuleKeys: Array.from(new Set([...(plan.includedModuleKeys || []), ...moduleUnlocks.map((unlock) => `${unlock.productId}:${unlock.moduleId}`)])),
  };
  // Subscription-specific entitlement ids.
  const subscriptionEntitlementIds = collectSubscriptionEntitlementIds({
    plan: effectivePlan,
    cycle,
    selectedFeatureIds: uniqueFeatures,
    productUnlocks: productUnlocks as never,
    moduleUnlocks: moduleUnlocks as never,
  });
  // Run the subscription write + the per-entitlement entitlements
  // in a single transaction. Idempotency: the existing-entitlement
  // check inside `grantEntitlementsFromQuote` already covers
  // product / module / update entitlements; for subscriptions the
  // `subscriptions/{uid}/current` doc is the idempotency key (a
  // re-write overwrites with the same values).
  const result = await adminDb().runTransaction(async (tx: Transaction) => {
    // Firestore requires every transaction read before its first write.
    const subscriptionRef = adminDb().collection("users").doc(quote.uid).collection("subscription").doc("current");
    const existingSubscriptionSnapshot = await tx.get(subscriptionRef);
    // 1. Per-feature / per-unlock entitlements. Read every target first.
    const entitlementEntries = subscriptionEntitlementIds.map((entId) => ({ entId, ref: adminDb().collection("entitlements").doc(`${quote.uid}__${entId}`) }));
    const existingEntitlements = await Promise.all(entitlementEntries.map((entry) => tx.get(entry.ref)));
    for (let index = 0; index < entitlementEntries.length; index += 1) {
      const { entId, ref } = entitlementEntries[index];
      if (existingEntitlements[index].exists) continue;
      tx.set(
        ref,
        {
          uid: quote.uid,
          productId: null,
          kind: "subscription",
          moduleId: null,
          resourceId: null,
          updateId: null,
          subscriptionPlanId: plan.id,
          featureId: entId.startsWith("subscription_feature:") ? entId.split(":")[2] : null,
          entitlementId: entId,
          orderId,
          paymentId: paymentId || null,
          status: "active",
          amount: 0,
          currency: "INR",
          source,
          unlockedAt: Timestamp.fromMillis(now),
        },
        { merge: false },
      );
    }
    // 2. The subscription record.
    const sub = await writeSubscriptionAfterPayment(tx, {
      uid: quote.uid,
      plan: effectivePlan,
      cycle,
      selectedFeatureIds: uniqueFeatures,
      orderId,
      paymentId,
      amountPaise: Math.max(Number(quote.cashPayable || 0), Number(quote.minimumPayable || 0)),
      source,
      couponCode: quote.couponCode || null,
      requestedEduCoins: Number(quote.eduCoinsReserved || 0),
      now,
      existingSubscription: { exists: existingSubscriptionSnapshot.exists, data: existingSubscriptionSnapshot.data() || {} },
    });
    return sub;
  });
  // Every successfully activated subscriber receives one stable referral
  // identity. The helper is idempotent, so renewals preserve usage counts.
  try {
    await ensureReferralCoupon({ uid: quote.uid });
  } catch (error) {
    // Referral provisioning is recoverable and must never turn an already
    // verified subscription payment into a client-visible failure.
    console.error("Referral provisioning failed", error);
  }
  return {
    ok: true,
    plan,
    features: uniqueFeatures,
    expiresAt: result.expiresAt,
    activatedAt: result.activatedAt,
    orderId,
  };
};
