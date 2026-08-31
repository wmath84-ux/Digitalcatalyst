// api/razorpay/create-order.ts
//
// Part 6 — quote-driven Razorpay order creation. The client posts
// only `{ quoteId }`; the server loads the persisted
// `ServerPriceQuote` from the private `_serverQuotes` collection,
// re-verifies its ownership + status + expiry, uses the canonical
// `quote.cashPayable` (in paise) as the Razorpay amount, creates the
// Razorpay order, and saves the payment intent with the full quote
// snapshot for the verify-payment step.
//
// Out of scope: subscription, coupon, EduCoin. The `ServerPriceQuote`
// already covers all five Part 6 entitlement kinds (full_product,
// selected_modules, selected_resources, cart_bundle, paid_update)
// plus free entitlements.

import { Timestamp } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/firebaseAdmin.js";
import { applyCors } from "../_lib/cors.js";
import { loadServerQuoteForUser } from "../_lib/quotes.js";

const cleanId = (value: unknown, max = 120) =>
  String(value || "").trim().replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, max);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const firebaseUser = await requireFirebaseUser(req);

    const rawQuoteId = (req.body && typeof req.body === "object") ? (req.body as Record<string, unknown>).quoteId : null;
    const quoteId = cleanId(rawQuoteId, 120);
    if (!quoteId) {
      return res.status(400).json({ ok: false, error: "Missing quoteId. The client must POST { quoteId } only." });
    }

    const loaded = await loadServerQuoteForUser(quoteId, firebaseUser.uid);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error });
    }
    const quote = loaded.quote;

    // Reject quote kinds we don't accept in Part 6. The Part 4 server
    // already 400s on subscription-feature selections, but the
    // The `free_entitlement` kind is handled by the free path
    // below (cashPayable === 0). `subscription` and
    // `subscription_features` ARE payable via Razorpay — they
    // share the same entitlement pipeline as products.
    const allowedKinds = new Set([
      "full_product",
      "selected_modules",
      "selected_resources",
      "cart_bundle",
      "paid_update",
      "subscription",
      "subscription_features",
    ]);
    if (!allowedKinds.has(quote.purchaseKind)) {
      return res.status(400).json({ ok: false, error: `Purchase kind "${quote.purchaseKind}" is not payable via Razorpay.` });
    }

    // The canonical payable amount — in **paise** (Razorpay's
    // smallest unit for INR).
    const amountPaise = Math.max(
      0,
      Math.round(Number(quote.cashPayable || 0)),
    );

    const productName = deriveProductName(quote);

    const db = adminDb();

    // Free path: cashPayable === 0. The legacy free path used
    // `FREE-…` ids. We keep a separate doc id prefix so the
    // verify-payment step can detect a "free" call deterministically.
    if (amountPaise === 0) {
      const freeOrderId = `FREE-${Date.now().toString(36)}-${firebaseUser.uid.slice(0, 8)}`;
      await db.collection("_paymentIntents").doc(freeOrderId).set({
        uid: firebaseUser.uid,
        quoteId: quote.quoteId,
        purchaseKind: quote.purchaseKind,
        verifiedLineItems: quote.verifiedLineItems,
        couponCode: quote.couponCode || null,
        couponType: quote.couponType || null,
        couponValue: typeof quote.couponValue === "number" ? quote.couponValue : null,
        couponDiscount: Number(quote.couponDiscount || 0),
        subscriptionPlanId: quote.subscriptionPlanId || null,
        subscriptionCycle: quote.subscriptionCycle || null,
        subscriptionExpiresAt: quote.subscriptionExpiresAt || null,
        subscriptionFeatureIds: Array.isArray(quote.subscriptionFeatureIds) ? quote.subscriptionFeatureIds : null,
        subscriptionProductIds: Array.isArray(quote.subscriptionProductIds) ? quote.subscriptionProductIds : null,
        subscriptionAddOn: quote.subscriptionAddOn === true,
        amountPaise: 0,
        currency: "INR",
        status: "created",
        free: true,
        createdAt: Timestamp.now(),
      });
      return res.status(200).json({
        ok: true,
        free: true,
        verified: false, // the verify step still needs to run for entitlement writes
        orderId: freeOrderId,
        amount: 0,
        currency: "INR",
        productName,
        customer: { name: firebaseUser.name || "", email: firebaseUser.email || "" },
      });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(503).json({ ok: false, error: "Secure payments are not configured yet." });
    }

    const receipt = `dc_${Date.now()}_${firebaseUser.uid.slice(0, 6)}`.slice(0, 40);
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          userId: firebaseUser.uid,
          quoteId: quote.quoteId,
          purchaseKind: quote.purchaseKind,
        },
      }),
    });
    const razorpayData = (await razorpayResponse.json().catch(() => ({}))) as Record<string, any>;
    if (!razorpayResponse.ok) {
      return res
        .status(razorpayResponse.status)
        .json({ ok: false, error: razorpayData?.error?.description || "Could not create Razorpay order." });
    }

    // Save the payment intent with the FULL quote snapshot so the
    // verify-payment step never has to re-load the quote. This is
    // also the single source of truth for replay-prevention (status
    // transitions: created → verified) and for the
    // `verifiedLineItems` + `quoteId` linkage the entitlement
    // writer needs.
    await db.collection("_paymentIntents").doc(String(razorpayData.id)).set({
      uid: firebaseUser.uid,
      quoteId: quote.quoteId,
      purchaseKind: quote.purchaseKind,
      verifiedLineItems: quote.verifiedLineItems,
      quoteCashPayable: quote.cashPayable,
      quoteExpiresAt: quote.expiresAt,
      // Part 7 — the coupon is part of the canonical quote, so
      // the intent snapshot carries it too. The verify-payment
      // step uses these fields on a replay to surface the coupon
      // on the response without re-running the redemption.
      couponCode: quote.couponCode || null,
      couponType: quote.couponType || null,
      couponValue: typeof quote.couponValue === "number" ? quote.couponValue : null,
      couponDiscount: Number(quote.couponDiscount || 0),
      // Part 9 — subscription metadata. The verify-payment
      // step uses these fields to (a) restore the consumed-replay
      // fallback quote and (b) drive the post-payment
      // subscription writer.
      subscriptionPlanId: quote.subscriptionPlanId || null,
      subscriptionCycle: quote.subscriptionCycle || null,
      subscriptionExpiresAt: quote.subscriptionExpiresAt || null,
      subscriptionFeatureIds: Array.isArray(quote.subscriptionFeatureIds) ? quote.subscriptionFeatureIds : null,
      subscriptionProductIds: Array.isArray(quote.subscriptionProductIds) ? quote.subscriptionProductIds : null,
      subscriptionAddOn: quote.subscriptionAddOn === true,
      amountPaise,
      currency: "INR",
      status: "created",
      receipt,
      createdAt: Timestamp.now(),
    });

    return res.status(200).json({
      ok: true,
      free: false,
      orderId: razorpayData.id,
      amount: amountPaise,
      currency: "INR",
      productName,
      keyId,
      customer: { name: firebaseUser.name || "", email: firebaseUser.email || "" },
    });
  } catch (error) {
    console.error("Create Razorpay order failed", error);
    return errorResponse(res, error, "Could not start secure checkout.");
  }
}

/**
 * Pick a human-readable product name for the Razorpay checkout.
 * Falls back to "Digital Catalyst" when the quote is empty (which
 * the server already 400s on, but defence-in-depth is cheap).
 */
function deriveProductName(quote: { verifiedLineItems?: unknown[]; purchaseKind?: string }): string {
  const lines = Array.isArray(quote.verifiedLineItems) ? (quote.verifiedLineItems as Array<{ title?: string }>) : [];
  if (lines.length === 0) return "Digital Catalyst";
  if (lines.length === 1) return lines[0].title || "Digital Catalyst";
  return `${lines.length} Digital Catalyst items`;
}
