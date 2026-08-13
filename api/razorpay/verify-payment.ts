// api/razorpay/verify-payment.ts
//
// Part 6 — quote-driven Razorpay verification + entitlement grant.
// The client posts the standard Razorpay response:
//   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// plus an optional `quoteId` (the legacy free path may also post
// `{ orderId, free: true }` to trigger a free grant).
//
// The handler:
//   1. Verifies the Firebase ID token.
//   2. Looks up the payment intent (`_paymentIntents/{orderId}`) and
//      confirms ownership + linkage to the quote.
//   3. For paid orders:
//      a. Verifies the Razorpay HMAC signature.
//      b. Replays the payment status from Razorpay; captures
//         authorized payments.
//      c. Compares amount + order_id against the intent.
//      d. If the intent is already `verified` (replay), returns
//         the original verification result without re-granting.
//   4. Calls `grantEntitlementsFromQuote` to:
//      - write canonical `entitlements/{uid}__{entitlementId}` docs
//        for every non-owned Part 6 line item;
//      - dual-write to legacy `purchasedProductIds` /
//        `purchasedProductUpdateIds` / `users/{uid}/purchases/...`;
//      - write the `siteOrders/{orderId}` receipt;
//      - flip the quote to `consumed` (idempotently) and the
//        intent to `verified`.
//   5. Returns the orderId, paymentId, and the list of granted
//      entitlement ids so the success page can render the receipt.

import crypto from "crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "../_lib/firebaseAdmin.js";
import { loadServerQuoteForUser } from "../_lib/quotes.js";
import { grantEntitlementsFromQuote, grantSubscriptionFromQuote } from "../_lib/entitlements.js";
import { pushToUser } from "../_lib/pushNotify.js";

const cleanRazorpayId = (value: unknown) =>
  String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);

// Instant unlock fan-out: the moment verification succeeds the buyer gets a
// cross-device bell entry AND a system push on every subscribed device —
// neither waits for the cron scheduler. Best-effort: a push failure must
// never fail payment verification. The bell doc id is per-order, so retries
// and replays never duplicate it.
async function announceUnlock(
  db: Firestore,
  uid: string,
  quote: { purchaseKind?: string; verifiedLineItems?: Array<{ title?: unknown }> },
  orderId: string,
) {
  const titles = (quote.verifiedLineItems || [])
    .map((item) => String(item?.title || "").trim())
    .filter(Boolean);
  const isSubscription = quote.purchaseKind === "subscription";
  const title = isSubscription
    ? "✅ Subscription activated"
    : titles.length > 1
      ? `🔓 ${titles.length} products unlocked`
      : "🔓 Product unlocked";
  const shown = titles.slice(0, 2).join(" · ");
  const body = shown
    ? shown + (titles.length > 2 ? ` +${titles.length - 2} more` : "")
    : "Your purchase is ready.";
  const docId = `unlock:${orderId}`;
  await db.collection("users").doc(uid).collection("notifications").doc(docId).set({
    id: docId,
    title,
    body,
    category: "unlock",
    read: false,
    source: "system",
    createdAt: Timestamp.now(),
    target: { type: "purchases" },
  }, { merge: true });
  await pushToUser(db, uid, { title, body, tag: `unlock-${orderId}`, url: "/#/store/purchases" });
}

const cleanQuoteId = (value: unknown) =>
  String(value || "").trim().replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 120);

interface PaymentIntent {
  uid?: string;
  quoteId?: string;
  purchaseKind?: string;
  verifiedLineItems?: unknown[];
  amountPaise?: number;
  quoteCashPayable?: number;
  quoteExpiresAt?: number;
  /** Part 7 — the verified coupon carried on the original intent. */
  couponCode?: string | null;
  couponType?: "percent" | "flat" | null;
  couponValue?: number | null;
  couponDiscount?: number;
  status?: string;
  paymentId?: string;
  consumedOrderId?: string;
  consumedPaymentId?: string;
  free?: boolean;
  /** Part 9 — subscription metadata for the replay path. */
  subscriptionPlanId?: string | null;
  subscriptionCycle?: "monthly" | "yearly" | null;
  subscriptionExpiresAt?: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const firebaseUser = await requireFirebaseUser(req);

    // -----------------------------------------------------------------
    // 1. Parse the body. Two flows:
    //    a) Razorpay checkout: { razorpay_order_id, razorpay_payment_id,
    //       razorpay_signature, quoteId? }
    //    b) Free path: { orderId, free: true, quoteId? }
    // -----------------------------------------------------------------
    const body = (req.body && typeof req.body === "object") ? (req.body as Record<string, unknown>) : {};
    const orderId = cleanRazorpayId(body.razorpay_order_id || body.orderId);
    const paymentId = cleanRazorpayId(body.razorpay_payment_id);
    const signature = String(body.razorpay_signature || "").trim();
    const isFree = body.free === true;
    const quoteIdHint = cleanQuoteId(body.quoteId);

    if (!orderId) {
      return res.status(400).json({ ok: false, verified: false, error: "Missing Razorpay order id." });
    }
    if (!isFree && (!paymentId || !signature)) {
      return res.status(400).json({ ok: false, verified: false, error: "Missing payment verification fields." });
    }

    const db = adminDb();
    const intentRef = db.collection("_paymentIntents").doc(orderId);
    const intentSnap = await intentRef.get();
    if (!intentSnap.exists) {
      return res.status(404).json({ ok: false, verified: false, error: "Secure payment intent was not found." });
    }
    const intent = intentSnap.data() as PaymentIntent | undefined;
    if (!intent) {
      return res.status(404).json({ ok: false, verified: false, error: "Secure payment intent was not found." });
    }
    if (intent.uid !== firebaseUser.uid) {
      return res.status(403).json({ ok: false, verified: false, error: "This payment belongs to a different account." });
    }
    if (!intent.quoteId) {
      return res.status(409).json({ ok: false, verified: false, error: "Payment intent is not linked to a quote. Re-create the order from the CheckoutContext." });
    }

    // -----------------------------------------------------------------
    // 2. Load + verify the quote. The intent carries the quoteId
    //    already; we re-load it so the verify step is robust against
    //    an intent that was created before the quote expired.
    // -----------------------------------------------------------------
    const loaded = await loadServerQuoteForUser(intent.quoteId, firebaseUser.uid);
    if (!loaded.ok) {
      // A consumed/expired quote is OK on a replay: the
      // grantEntitlementsFromQuote function is itself idempotent.
      // We only fail-hard on cross-user (403) or unknown quote
      // (404). For consumed/expired, fall through and let the
      // entitlement writer short-circuit.
      if (loaded.status === 403 || loaded.status === 404) {
        return res.status(loaded.status).json({ ok: false, verified: false, error: loaded.error });
      }
    }
    const quote = loaded.ok
      ? loaded.quote
      : // Replay path — the quote was consumed; fall back to the
        // intent snapshot for the entitlement write. The
        // entitlement writer only uses quote.uid, quote.quoteId,
        // quote.purchaseKind, quote.verifiedLineItems, quote.cashPayable
        // and quote.minimumPayable, so the other totals can be
        // defaulted to zero.
        {
          quoteId: intent.quoteId,
          uid: firebaseUser.uid,
          purchaseKind: (intent.purchaseKind || "full_product") as never,
          verifiedLineItems: Array.isArray(intent.verifiedLineItems) ? intent.verifiedLineItems as never[] : [],
          regularSubtotal: Number(intent.quoteCashPayable || 0),
          saleDiscount: 0,
          // Part 7 — the coupon is preserved across the consumed
          // → intent → entitlement-write path so a replay still
          // knows what coupon to redeem.
          couponDiscount: Number(intent.couponDiscount || 0),
          couponCode: intent.couponCode || null,
          couponType: intent.couponType || null,
          couponValue: typeof intent.couponValue === "number" ? intent.couponValue : null,
          eduCoinDiscount: 0,
          eduCoinsReserved: 0,
          cashPayable: Number(intent.amountPaise || 0),
          minimumPayable: 0,
          currency: "INR" as const,
          expiresAt: Number(intent.quoteExpiresAt || Date.now()),
          status: "consumed" as const,
          // Part 9 — subscription metadata. The consumed-replay
          // path needs to know which plan / cycle was applied.
          subscriptionPlanId: intent.subscriptionPlanId || null,
          subscriptionCycle: intent.subscriptionCycle || null,
          subscriptionExpiresAt: intent.subscriptionExpiresAt || null,
        };

    // Optional client-supplied quoteId hint must match the intent.
    if (quoteIdHint && quoteIdHint !== intent.quoteId) {
      return res.status(409).json({ ok: false, verified: false, error: "Quote id on the verify call does not match the payment intent." });
    }

    // -----------------------------------------------------------------
    // 3. Idempotency / replay-prevention at the intent layer. If the
    //    intent is already verified, return the original orderId +
    //    paymentId without re-running Razorpay, the signature check,
    //    or the entitlement grant. The entitlement writer is also
    //    idempotent, but skipping here saves a round-trip + a
    //    transaction.
    // -----------------------------------------------------------------
    if (intent.status === "verified") {
      return res.status(200).json({
        ok: true,
        verified: true,
        orderId,
        paymentId: intent.paymentId || paymentId || null,
        alreadyVerified: true,
        replayed: true,
        grantedEntitlementIds: [],
        // Part 7 — surface the coupon that was applied. On a
        // replay we don't re-run the redemption, so the response
        // always reports the coupon code + type from the intent.
        couponCode: intent.couponCode || null,
        couponType: intent.couponType || null,
        couponValue: typeof intent.couponValue === "number" ? intent.couponValue : null,
        couponDiscount: Number(intent.couponDiscount || 0),
        couponRedemption: intent.couponCode
          ? {
              couponCode: String(intent.couponCode),
              discountPaise: Number(intent.couponDiscount || 0),
              redeemed: true,
              redemptionId: null,
            }
          : undefined,
      });
    }

    // -----------------------------------------------------------------
    // 4. Free path: signature check + Razorpay round-trip skipped.
    // -----------------------------------------------------------------
    if (isFree) {
      const grant = await grantEntitlementsFromQuote({
        quote,
        orderId,
        paymentId: null,
        source: "free",
      });
      const subscription = await grantSubscriptionFromQuote({
        quote,
        orderId,
        paymentId: null,
        source: "free",
      });
      if (!grant.replayed) {
        try {
          await announceUnlock(adminDb(), firebaseUser.uid, quote, orderId);
        } catch (announceError) {
          console.warn("[verify-payment] unlock announcement failed (free path)", announceError);
        }
      }
      return res.status(200).json({
        ok: true,
        verified: true,
        free: true,
        orderId,
        paymentId: null,
        replayed: grant.replayed,
        grantedEntitlementIds: grant.grantedEntitlementIds,
        amountPaise: grant.amountPaise,
        couponCode: quote.couponCode || null,
        couponType: quote.couponType || null,
        couponValue: typeof quote.couponValue === "number" ? quote.couponValue : null,
        couponDiscount: Number(quote.couponDiscount || 0),
        couponRedemption: grant.couponRedemption,
        subscription: subscription
          ? {
              planId: subscription.plan.id,
              cycle: quote.subscriptionCycle || null,
              features: subscription.features,
              activatedAt: subscription.activatedAt,
              expiresAt: subscription.expiresAt,
              orderId: subscription.orderId,
            }
          : null,
      });
    }

    // -----------------------------------------------------------------
    // 5. Razorpay signature + payment verification.
    // -----------------------------------------------------------------
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(503).json({ ok: false, verified: false, error: "Razorpay verification is not configured." });
    }

    const expectedHex = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    const expected = Buffer.from(expectedHex, "utf8");
    const actual = Buffer.from(signature, "utf8");
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(400).json({ ok: false, verified: false, error: "Payment signature verification failed." });
    }

    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    // Fetch the payment.
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Basic ${authorization}` },
    });
    let payment: Record<string, any> = (await paymentResponse.json().catch(() => ({}))) as Record<string, any>;
    if (!paymentResponse.ok) {
      return res
        .status(400)
        .json({ ok: false, verified: false, error: payment?.error?.description || "Could not confirm payment with Razorpay." });
    }

    // Capture if still authorized.
    if (payment.status === "authorized") {
      const captureResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/capture`, {
        method: "POST",
        headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(intent.amountPaise || 0), currency: "INR" }),
      });
      payment = (await captureResponse.json().catch(() => payment)) as Record<string, any>;
      if (!captureResponse.ok) {
        return res
          .status(409)
          .json({ ok: false, verified: false, error: payment?.error?.description || "Payment was authorized but could not be captured." });
      }
    }

    if (payment.status !== "captured") {
      return res.status(409).json({ ok: false, verified: false, error: `Payment is ${String(payment.status || "not captured")}.` });
    }
    if (String(payment.order_id || "") !== orderId) {
      return res.status(400).json({ ok: false, verified: false, error: "Payment order mismatch." });
    }
    if (Number(payment.amount) !== Number(intent.amountPaise || 0)) {
      return res.status(400).json({ ok: false, verified: false, error: "Payment amount mismatch." });
    }

    // -----------------------------------------------------------------
    // 6. Grant entitlements in a single transaction.
    // -----------------------------------------------------------------
    const grant = await grantEntitlementsFromQuote({
      quote,
      orderId,
      paymentId,
      source: "razorpay",
    });

    // 7. Part 9 — for subscription purchases, write the
    //    subscription record + per-feature / per-unlock
    //    entitlements. Runs after the main grant so the
    //    subscription write can be retried independently.
    const subscription = await grantSubscriptionFromQuote({
      quote,
      orderId,
      paymentId,
      source: "razorpay",
    });

    if (!grant.replayed) {
      try {
        await announceUnlock(adminDb(), firebaseUser.uid, quote, orderId);
      } catch (announceError) {
        console.warn("[verify-payment] unlock announcement failed (paid path)", announceError);
      }
    }

    return res.status(200).json({
      ok: true,
      verified: true,
      orderId,
      paymentId,
      replayed: grant.replayed,
      grantedEntitlementIds: grant.grantedEntitlementIds,
      amountPaise: grant.amountPaise,
      couponCode: quote.couponCode || null,
      couponType: quote.couponType || null,
      couponValue: typeof quote.couponValue === "number" ? quote.couponValue : null,
      couponDiscount: Number(quote.couponDiscount || 0),
      couponRedemption: grant.couponRedemption,
      subscription: subscription
        ? {
            planId: subscription.plan.id,
            cycle: quote.subscriptionCycle || null,
            features: subscription.features,
            activatedAt: subscription.activatedAt,
            expiresAt: subscription.expiresAt,
            orderId: subscription.orderId,
          }
        : null,
    });
  } catch (error) {
    console.error("Verify Razorpay payment failed", error);
    return errorResponse(res, error, "Payment could not be verified.");
  }
}
