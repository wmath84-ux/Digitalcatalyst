import { adminDb } from "./firebaseAdmin.js";

export type ReferralConfig = {
  enabled: boolean;
  discountPaise: number;
  maxUsesPerReferrer: number | null;
};

export const referralCodeForUid = (uid: string) => `DC${String(uid || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`.slice(0, 60);

export const loadReferralConfig = async (): Promise<ReferralConfig> => {
  const snap = await adminDb().collection("settings").doc("referralProgram").get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    enabled: data.enabled !== false,
    discountPaise: Math.max(0, Math.round(Number(data.discountPaise ?? 25000))),
    // A referral ID can be redeemed exactly once, then it is spent.
    maxUsesPerReferrer: 1,
  };
};

export const ensureReferralCoupon = async (input: { uid: string; name?: string; photoURL?: string | null }) => {
  const db = adminDb();
  const config = await loadReferralConfig();
  const code = referralCodeForUid(input.uid);
  if (!code) throw new Error("Could not generate referral code.");
  const couponRef = db.collection("coupons").doc(code);
  const [existing, userSnap] = await Promise.all([couponRef.get(), db.collection("users").doc(input.uid).get()]);
  const userData = userSnap.data() || {};
  const usedCount = Math.max(0, Number(existing.data()?.usedCount || 0));
  // A referral ID is single-use and terminal: once spent (usedCount
  // >= 1) it stays "inactive" forever. Re-provisioning (renewals,
  // referral refresh) must NEVER resurrect a spent coupon back to
  // "active" — that was the loophole that let a used referral be
  // redeemed again from another account.
  const spent = usedCount >= 1;
  const status = spent ? "inactive" : config.enabled ? "active" : "inactive";
  await Promise.all([
    couponRef.set({
      code,
      type: "flat",
      value: config.discountPaise,
      status,
      perUserLimit: 1,
      globalLimit: 1,
      usedCount,
      allowedPurchaseKinds: ["subscription", "subscription_features"],
      referralOwnerUid: input.uid,
      description: "Subscriber referral discount",
      updatedAt: Date.now(),
    }, { merge: true }),
    db.collection("referralProfiles").doc(input.uid).set({
      uid: input.uid,
      name: input.name || String(userData.name || userData.displayName || "Subscriber"),
      photoURL: input.photoURL || userData.photoURL || null,
      referralCode: code,
      usedCount,
      active: !spent,
      updatedAt: Date.now(),
    }, { merge: true }),
    db.collection("users").doc(input.uid).set({ referralCode: code, referralUsedCount: usedCount, updatedAt: Date.now() }, { merge: true }),
  ]);
  return { code, config, usedCount };
};

/**
 * One-time self-healing repair for referral usage counts.
 *
 * Before the single-use fix, verify-payment never incremented a
 * referral coupon's `usedCount` (the increment helper only accepted
 * the rare "pending" repair path), so coupons that WERE redeemed
 * still read `usedCount: 0` and kept working from other accounts.
 * This routine reconstructs the truth from the `siteOrders` receipts
 * and normalises every referral coupon:
 *
 *   1. Every completed siteOrder that carries a referral couponCode
 *      gets its `couponRedemptions/{code}__{orderId}` doc backfilled
 *      as "applied" (the idempotency key the live pipeline uses).
 *   2. Each referral coupon's `usedCount` is raised to the number of
 *      distinct redeeming orders (never lowered).
 *   3. Any referral coupon with usedCount >= 1 is discontinued:
 *      coupon status -> "inactive", referralProfiles.active -> false,
 *      and the owner's user doc gets referralUsedCount/referralUsedAt
 *      so the profile UI can cross the ID out.
 *
 * Fully idempotent — re-running it is a no-op — so the caller only
 * needs a cheap "already completed" flag, not a lock.
 */
/**
 * Run `repairReferralUsage` exactly once per deployment of the fix,
 * with zero manual steps: the first request that hits an endpoint
 * wired to this helper (leaderboard fetch, referral apply, or the
 * daily cron) performs the repair and stamps
 * `settings/referralUsageRepair.completedAt`; every later call is a
 * single cheap doc read. The repair itself is idempotent, so even a
 * race between two first-requests is harmless.
 */
export const runReferralRepairOnce = async () => {
  const db = adminDb();
  const stateRef = db.collection("settings").doc("referralUsageRepair");
  const state = await stateRef.get();
  if (state.exists && Number(state.data()?.completedAt || 0) > 0) {
    return { ran: false as const };
  }
  const startedAt = Date.now();
  const summary = await repairReferralUsage(startedAt);
  await stateRef.set({
    completedAt: Date.now(),
    startedAt,
    summary,
  }, { merge: true });
  return { ran: true as const, summary };
};

export const repairReferralUsage = async (now = Date.now()) => {
  const db = adminDb();
  const summary = {
    ordersScanned: 0,
    referralOrders: 0,
    redemptionsBackfilled: 0,
    couponsRepaired: 0,
    profilesDeactivated: 0,
  };

  // ---- Pass 1: rebuild redemptions + counts from order receipts. ----
  const ordersSnap = await db.collection("siteOrders").get();
  summary.ordersScanned = ordersSnap.size;
  type OrderLite = { orderId: string; uid: string; discountPaise: number; paymentId: string | null };
  const ordersByCode = new Map<string, OrderLite[]>();
  for (const orderDoc of ordersSnap.docs) {
    const data = orderDoc.data() || {};
    const code = String(data.couponCode || "").trim().toUpperCase();
    if (!code) continue;
    const list = ordersByCode.get(code) || [];
    list.push({
      orderId: orderDoc.id,
      uid: String(data.customerUid || ""),
      discountPaise: Math.max(0, Math.round(Number(data.couponDiscount || 0))),
      paymentId: String(data.paymentId || "") || null,
    });
    ordersByCode.set(code, list);
  }

  const repairedOwners = new Map<string, { code: string; usedCount: number; usedByUid: string | null }>();

  for (const [code, orders] of ordersByCode) {
    const couponRef = db.collection("coupons").doc(code);
    const couponSnap = await couponRef.get();
    const couponData = couponSnap.exists ? couponSnap.data() || {} : {};
    const ownerUid = String(couponData.referralOwnerUid || "");
    if (!couponSnap.exists || !ownerUid) continue; // not a referral coupon
    summary.referralOrders += orders.length;

    // Backfill the applied redemption doc for every redeeming order.
    let firstRedeemerUid: string | null = null;
    for (const order of orders) {
      if (!firstRedeemerUid && order.uid) firstRedeemerUid = order.uid;
      const redemptionId = `${code}__${order.orderId}`;
      const redemptionRef = db.collection("couponRedemptions").doc(redemptionId);
      const redemptionSnap = await redemptionRef.get();
      if (redemptionSnap.exists && String(redemptionSnap.data()?.status || "") === "applied") continue;
      await redemptionRef.set({
        uid: order.uid,
        couponCode: code,
        orderId: order.orderId,
        status: "applied",
        createdAt: Number(redemptionSnap.data()?.createdAt || now),
        appliedAt: now,
        discountPaise: order.discountPaise,
        paymentId: order.paymentId,
        backfilled: true,
      }, { merge: true });
      summary.redemptionsBackfilled += 1;
    }

    // Raise usedCount to the real redemption count (never lower it).
    const targetUsed = Math.max(orders.length, Math.max(0, Number(couponData.usedCount || 0)));
    repairedOwners.set(ownerUid, { code, usedCount: targetUsed, usedByUid: firstRedeemerUid });
  }

  // ---- Pass 2: every referral coupon with usedCount >= 1 must be
  // discontinued (covers coupons whose count was right but whose
  // status was resurrected to "active" by the old ensure helper). ----
  const couponsSnap = await db.collection("coupons").get();
  for (const couponDoc of couponsSnap.docs) {
    const data = couponDoc.data() || {};
    const ownerUid = String(data.referralOwnerUid || "");
    if (!ownerUid) continue;
    const fromOrders = repairedOwners.get(ownerUid);
    const targetUsed = Math.max(
      Math.max(0, Number(data.usedCount || 0)),
      fromOrders && fromOrders.code === couponDoc.id ? fromOrders.usedCount : 0,
    );
    if (targetUsed < 1) continue; // never used — leave it active
    const needsCount = Number(data.usedCount || 0) !== targetUsed;
    const needsStatus = String(data.status || "") !== "inactive";
    if (needsCount || needsStatus) {
      await couponDoc.ref.set({
        usedCount: targetUsed,
        status: "inactive",
        usedByUid: data.usedByUid || fromOrders?.usedByUid || null,
        usedAt: data.usedAt || now,
        updatedAt: now,
      }, { merge: true });
      summary.couponsRepaired += 1;
    }
    // Stamp the owner's profile + user doc so the UI shows Used.
    await Promise.all([
      db.collection("referralProfiles").doc(ownerUid).set({
        usedCount: targetUsed,
        active: false,
        updatedAt: now,
      }, { merge: true }),
      db.collection("users").doc(ownerUid).set({
        referralUsedCount: targetUsed,
        referralUsedAt: now,
        updatedAt: now,
      }, { merge: true }),
    ]);
    summary.profilesDeactivated += 1;
  }

  return summary;
};
