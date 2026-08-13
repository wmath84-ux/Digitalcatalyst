// api/_lib/coupons.ts
//
// Part 7 — server-side coupon plumbing. The pure engine lives in
// `utils/coupons.js`; this file wraps it with the Firestore +
// transaction-aware glue the API endpoints need.
//
// Responsibilities:
//   1. Load a coupon doc from the `coupons` collection by
//      **normalised** code (the doc id IS the normalised code so
//      the lookup is O(1)).
//   2. Load the user-side context the engine needs:
//        - the user's per-coupon redemption count
//          (from `couponRedemptions`),
//        - whether the user has at least one prior purchase
//          (from `users.purchasedProductIds` or `siteOrders`).
//   3. Build the order context the engine needs from a verified
//      selection + product docs (categories, product ids, etc.).
//   4. Write a `couponRedemptions/{id}` doc atomically with the
//      entitlement grant in the same transaction. The redemption
//      doc is the idempotency key: re-running the entitlement
//      grant is a no-op for the coupon.

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "./firebaseAdmin";
import {
  buildCouponRedemptionDocId,
  normaliseCouponCode,
  normaliseCouponDoc,
  shouldIncrementCouponUsage,
  type CouponDoc,
  type CouponRedemptionDoc,
} from "../../utils/coupons";

const COUPONS_COLLECTION = "coupons";
const REDEMPTIONS_COLLECTION = "couponRedemptions";
const USERS_COLLECTION = "users";
const SITE_ORDERS_COLLECTION = "siteOrders";

/**
 * Load a coupon doc by code. The Firestore doc id is the
 * normalised uppercase code, so the lookup is a single `.doc()`
 * call. Returns `null` when the doc is missing, malformed, or has
 * a `status` of "inactive" / "disabled" / "archived".
 */
export const loadCouponByCode = async (
  rawCode: string,
  options: { db?: Firestore } = {},
): Promise<CouponDoc | null> => {
  const code = normaliseCouponCode(rawCode);
  if (!code) return null;
  const db = options.db ?? adminDb();
  const snap = await db.collection(COUPONS_COLLECTION).doc(code).get();
  if (!snap.exists) return null;
  const coupon = normaliseCouponDoc(snap.data() || {});
  if (!coupon) return null;
  return coupon;
};

/**
 * How many times the user has redeemed the given coupon. Counts
 * `couponRedemptions` docs with `status: "applied"` so a
 * partially-applied redemption (e.g. a payment that failed after
 * the coupon was reserved) does not consume the per-user quota.
 */
export const loadUserCouponUsageCount = async (
  uid: string,
  couponCode: string,
  options: { db?: Firestore } = {},
): Promise<number> => {
  const code = normaliseCouponCode(couponCode);
  if (!uid || !code) return 0;
  const db = options.db ?? adminDb();
  const snap = await db
    .collection(REDEMPTIONS_COLLECTION)
    .where("uid", "==", uid)
    .where("couponCode", "==", code)
    .where("status", "==", "applied")
    .count()
    .get();
  return Number(snap.data().count || 0);
};

/**
 * Whether the user has at least one prior purchase on their
 * account. We check the legacy `users/{uid}.purchasedProductIds`
 * array (Part 6 dual-writer) AND the `siteOrders` collection so
 * the answer is correct even for users who paid via the free
 * grant path (which writes only to `siteOrders`).
 */
export const loadUserHasPriorPurchases = async (
  uid: string,
  options: { db?: Firestore } = {},
): Promise<boolean> => {
  if (!uid) return false;
  const db = options.db ?? adminDb();
  const userSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
  if (userSnap.exists) {
    const ids = userSnap.data()?.purchasedProductIds;
    if (Array.isArray(ids) && ids.length > 0) return true;
  }
  // Fallback: count the user's siteOrders.
  const orderSnap = await db
    .collection(SITE_ORDERS_COLLECTION)
    .where("customerUid", "==", uid)
    .where("status", "==", "Completed")
    .limit(1)
    .get();
  return !orderSnap.empty;
};

/**
 * Pure helper: build the order context the coupon validator
 * needs. The endpoint calls this with the products the engine
 * loaded, so the categories list comes from the **server-side**
 * Firestore docs, never from the request body.
 */
export const buildCouponOrderContext = ({
  subtotalPaise,
  productIds,
  moduleIds,
  resourceIds,
  purchaseKind,
  userHasPriorPurchases,
  userUsageCount,
  products,
}: {
  subtotalPaise: number;
  productIds: string[];
  moduleIds: string[];
  resourceIds: string[];
  purchaseKind: string;
  userHasPriorPurchases: boolean;
  userUsageCount: number;
  products: Map<string, { category?: unknown }> | Array<{ id?: unknown; category?: unknown }>;
}) => {
  const map: string[] = [];
  const list = products instanceof Map
    ? Array.from(products.values())
    : Array.isArray(products) ? products : [];
  for (const p of list) {
    if (!p) continue;
    const cat = (p as { category?: unknown }).category;
    if (typeof cat === "string" && cat) map.push(cat);
  }
  return {
    subtotalPaise: Math.max(0, Math.round(Number(subtotalPaise || 0))),
    productIds: Array.isArray(productIds) ? productIds.map(String) : [],
    moduleIds: Array.isArray(moduleIds) ? moduleIds.map(String) : [],
    resourceIds: Array.isArray(resourceIds) ? resourceIds.map(String) : [],
    categories: Array.from(new Set(map)),
    purchaseKind: purchaseKind || null,
    userHasPriorPurchases: Boolean(userHasPriorPurchases),
    userUsageCount: Math.max(0, Math.floor(Number(userUsageCount || 0))),
  };
};

/**
 * The transactional coupon redemption writer. Runs inside the
 * entitlement grant's `db.runTransaction` block (passed in as
 * `tx`) so coupon usage is committed atomically with the
 * entitlement write. The function:
 *
 *   1. Reads the `couponRedemptions/{id}` doc; if `applied` or
 *      `pending`, the function no-ops (replay-prevention).
 *   2. Writes the redemption doc (status: "applied", appliedAt
 *      now, discountPaise, paymentId).
 *   3. Increments `coupons/{code}.usedCount` by 1.
 *   4. Updates `users/{uid}.lastCouponRedemptionAt`.
 *
 * Returns `true` when the coupon was redeemed in this call,
 * `false` when the redemption was a replay (no-op).
 */
export const applyCouponRedemption = async (
  tx: FirebaseFirestore.Transaction,
  args: {
    uid: string;
    coupon: CouponDoc;
    discountPaise: number;
    orderId: string;
    paymentId: string | null;
    now: number;
  },
): Promise<{ redeemed: boolean; redemptionId: string | null }> => {
  const code = normaliseCouponCode(args.coupon.code);
  const redemptionId = buildCouponRedemptionDocId(code, args.orderId);
  if (!redemptionId) return { redeemed: false, redemptionId: null };
  const redemptionRef = adminDb().collection(REDEMPTIONS_COLLECTION).doc(redemptionId);
  const existing = await tx.get(redemptionRef);
  const existingData = existing.exists ? (existing.data() as Partial<CouponRedemptionDoc>) : null;
  // If a redemption doc already exists for this order, treat as
  // replay. The "applied" + "reverted" statuses are terminal; the
  // "pending" status is reserved for the rare case where a
  // payment was reserved but the entitlement grant was rolled
  // back. In that case we DO re-run the increment so the user's
  // quota reflects the actual successful payment.
  if (existing.exists && existingData && existingData.status === "applied") {
    return { redeemed: false, redemptionId };
  }
  if (existing.exists && existingData && existingData.status === "reverted") {
    return { redeemed: false, redemptionId };
  }
  if (!shouldIncrementCouponUsage(existingData || {}, args.coupon, args.now)) {
    return { redeemed: false, redemptionId };
  }

  const nowTs = Timestamp.fromMillis(args.now);
  const redemptionDoc: CouponRedemptionDoc = {
    uid: args.uid,
    couponCode: code,
    orderId: args.orderId,
    status: "applied",
    createdAt: existingData?.createdAt || args.now,
    appliedAt: args.now,
    discountPaise: Math.max(0, Math.round(Number(args.discountPaise || 0))),
    paymentId: args.paymentId || null,
  };
  tx.set(redemptionRef, redemptionDoc, { merge: false });

  // Increment usedCount.
  const couponRef = adminDb().collection(COUPONS_COLLECTION).doc(code);
  tx.update(couponRef, {
    usedCount: FieldValue.increment(1),
    updatedAt: nowTs,
  });
  if (args.coupon.referralOwnerUid) {
    tx.set(
      adminDb().collection("referralProfiles").doc(args.coupon.referralOwnerUid),
      { usedCount: FieldValue.increment(1), lastUsedAt: nowTs, updatedAt: nowTs },
      { merge: true },
    );
  }

  // Stamp the user doc with the last redemption timestamp so the
  // client UI can show "You used this coupon on YYYY-MM-DD" in a
  // later part.
  const userRef = adminDb().collection(USERS_COLLECTION).doc(args.uid);
  tx.set(
    userRef,
    { lastCouponRedemptionAt: nowTs, lastCouponCode: code, updatedAt: nowTs },
    { merge: true },
  );

  return { redeemed: true, redemptionId };
};
