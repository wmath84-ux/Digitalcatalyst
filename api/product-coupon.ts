// api/product-coupon.ts
//
// POST endpoint that re-quotes a product selection (full product, module, or
// paid-update purchase) with a coupon code and returns the server-validated
// `couponDiscount` (in paise) plus the resulting `cashPayable`. This is the
// product equivalent of `api/subscription-coupon.ts` and powers the coupon
// field on the Product Detail Page — it lets the buyer preview "Verified
// savings" before entering checkout, using the exact same Part 7 coupon
// engine + Part 4 quote engine the real checkout uses.
//
// It does NOT persist the quote; the actual purchase goes through the full
// Razorpay pipeline via `/api/quotes/create`.

import {
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "./_lib/firebaseAdmin.js";
import {
  loadCouponByCode,
  loadUserCouponUsageCount,
  loadUserHasPriorPurchases,
} from "./_lib/coupons.js";
import {
  loadEntitlements,
  loadProducts,
  parseSelection,
  resolveProductIdsToLoad,
} from "./_lib/quotes.js";
import { buildQuote, type FirestorePurchaseDoc } from "../utils/serverQuotes.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const firebaseUser = await requireFirebaseUser(req);
    const selection = parseSelection(req.body);
    if (!selection) {
      return res.status(400).json({ ok: false, error: "Invalid checkout selection." });
    }
    // Refuse subscription-feature selections: this endpoint is for products.
    if (selection.purchaseKind === "subscription" || selection.purchaseKind === "subscription_features") {
      return res.status(400).json({ ok: false, error: "Use the subscription coupon endpoint for subscriptions." });
    }
    if (selection.purchaseKind === "full_product" && selection.featureIds.length > 0) {
      return res.status(400).json({ ok: false, error: "Subscription features are not part of this endpoint." });
    }

    const productIdsToLoad = resolveProductIdsToLoad(selection);
    const products = await loadProducts(productIdsToLoad);
    const entitlements = await loadEntitlements(firebaseUser.uid, productIdsToLoad);

    const purchasesByProduct = new Map<string, FirestorePurchaseDoc[]>();
    const ownedUpdateIdsByProduct = new Map<string, Set<string>>();
    for (const productId of productIdsToLoad) {
      const entry = entitlements.get(productId);
      purchasesByProduct.set(productId, entry ? entry.purchaseDocs : []);
      ownedUpdateIdsByProduct.set(productId, new Set(entry ? entry.updateIds : []));
    }

    const wrappedPurchasesByProduct = new Map<string, FirestorePurchaseDoc[]>();
    const productsWithOwnership = new Map(products);
    for (const productId of productIdsToLoad) {
      const original = purchasesByProduct.get(productId) || [];
      const updateIds = ownedUpdateIdsByProduct.get(productId) || new Set();
      const docs: FirestorePurchaseDoc[] = [...original];
      for (const updateId of updateIds) {
        docs.push({ productDocumentId: productId, updateId, entitlementId: `${productId}__update__${updateId}` });
      }
      wrappedPurchasesByProduct.set(productId, docs);

      const doc = products.get(productId);
      if (doc && updateIds.size > 0) {
        productsWithOwnership.set(productId, { ...doc, purchasedProductUpdateIds: { [productId]: Array.from(updateIds) } } as typeof doc);
      }
    }

    const couponCode = typeof selection.couponCode === "string" ? selection.couponCode.trim() : "";
    const coupon = couponCode ? await loadCouponByCode(couponCode) : null;
    const [userCouponUsageCount, userHasPriorPurchases] = coupon
      ? await Promise.all([
          loadUserCouponUsageCount(firebaseUser.uid, coupon.code),
          loadUserHasPriorPurchases(firebaseUser.uid),
        ])
      : [0, false];

    const productCategories: string[] = Array.from(
      new Set(
        Array.from(productsWithOwnership.values())
          .map((p) => (p && typeof (p as { category?: unknown }).category === "string" ? String((p as { category?: string }).category) : ""))
          .filter(Boolean),
      ),
    );

    const out = buildQuote({
      selection,
      products: productsWithOwnership,
      purchasesByProduct: wrappedPurchasesByProduct,
      uid: firebaseUser.uid,
      now: Date.now(),
      ttlMs: 15 * 60 * 1000,
      coupon,
      userCouponUsageCount,
      userHasPriorPurchases,
      productCategories,
      subscriptionLineItems: null,
      subscriptionExpiresAt: null,
    });
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, error: out.reason });
    }
    return res.status(200).json({
      ok: true,
      couponCode: coupon ? coupon.code : couponCode,
      discountPaise: Math.max(0, Math.round(Number(out.quote.couponDiscount || 0))),
      cashPayable: Math.max(0, Math.round(Number(out.quote.cashPayable || 0))),
      regularSubtotal: Math.max(0, Math.round(Number(out.quote.regularSubtotal || 0))),
    });
  } catch (error) {
    return errorResponse(res, error, "Could not validate coupon.");
  }
}
