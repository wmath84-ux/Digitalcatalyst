// api/subscription-coupon.ts
//
// Part 9 — POST endpoint that re-quotes a subscription
// selection with a coupon code and returns the
// server-validated `couponDiscount` (in paise). The endpoint
// is a thin proxy: it builds a canonical subscription
// selection, calls the Part 4 quote engine via the same
// path the main `/api/quotes/create` uses, and returns
// just the discount math. It does NOT persist the quote —
// the actual subscription flow goes through the full
// Razorpay pipeline.

import {
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "./_lib/firebaseAdmin";
import {
  loadCouponByCode,
  loadUserCouponUsageCount,
  loadUserHasPriorPurchases,
} from "./_lib/coupons";
import { loadSubscriptionSelectionContext } from "./_lib/subscriptions";
import { buildQuote } from "../utils/serverQuotes";

const cleanId = (value: unknown, max = 100) =>
  String(value || "").trim().replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, max);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const body = (req.body && typeof req.body === "object") ? (req.body as Record<string, unknown>) : {};
    const planId = cleanId(body.planId, 100);
    const cycle: "monthly" | "yearly" = body.cycle === "yearly" ? "yearly" : "monthly";
    const featureIds = Array.isArray(body.selectedFeatureIds) ? body.selectedFeatureIds.map((x) => String(x)) : [];
    const productIds = Array.isArray(body.selectedProductIds) ? body.selectedProductIds.map((x) => String(x)) : [];
    const moduleIds = Array.isArray(body.selectedModuleIds) ? body.selectedModuleIds.map((x) => String(x)) : [];
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";

    if (!planId) {
      return res.status(400).json({ ok: false, error: "Missing planId." });
    }
    if (!couponCode) {
      return res.status(400).json({ ok: false, error: "Missing couponCode." });
    }
    const selection = {
      purchaseKind: "subscription" as const,
      productIds,
      moduleIds,
      resourceIds: [],
      updateId: null,
      subscriptionPlanId: planId,
      billingCycle: cycle,
      featureIds,
      couponCode: null,
      requestedEduCoins: 0,
      returnRoute: null,
    };
    const subContext = await loadSubscriptionSelectionContext(selection);
    if (!subContext.ok) {
      return res.status(subContext.status).json({ ok: false, error: subContext.error });
    }
    const coupon = await loadCouponByCode(couponCode);
    if (!coupon) {
      return res.status(404).json({ ok: false, error: "Coupon not found." });
    }
    const [userCouponUsageCount, userHasPriorPurchases] = await Promise.all([
      loadUserCouponUsageCount(firebaseUser.uid, coupon.code),
      loadUserHasPriorPurchases(firebaseUser.uid),
    ]);
    const out = buildQuote({
      selection,
      products: new Map(),
      uid: firebaseUser.uid,
      now: Date.now(),
      ttlMs: 15 * 60 * 1000,
      subscriptionLineItems: subContext.lineItems,
      subscriptionExpiresAt: subContext.expiresAt,
      coupon,
      userCouponUsageCount,
      userHasPriorPurchases,
    });
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, error: out.reason });
    }
    return res.status(200).json({
      ok: true,
      discountPaise: Math.max(0, Math.round(Number(out.quote.couponDiscount || 0))),
      cashPayable: Math.max(0, Math.round(Number(out.quote.cashPayable || 0))),
      cycle,
      planId,
    });
  } catch (error) {
    return errorResponse(res, error, "Could not validate coupon.");
  }
}
