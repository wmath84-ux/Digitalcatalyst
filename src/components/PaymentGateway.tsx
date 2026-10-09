// src/components/PaymentGateway.tsx
//
// Part 6 — quote-driven Razorpay checkout. The component now takes
// a single `quoteId` prop (sourced from the Part 5
// `CheckoutContext.quote.quoteId`) and posts only `{ quoteId }` to
// `/api/razorpay/create-order` and `/api/razorpay/verify-payment`.
// The server-side endpoints load the canonical `ServerPriceQuote`
// and grant the entitlements transactionally.
//
// The `productName` / `finalPrice` props are still used for the
// on-screen amount card; they are display-only and never sent to
// the server (the server computes the amount from `quote.cashPayable`).
// `finalPrice` arrives in paise (the quote's `cashPayable`), so it is
// rendered through `formatPaise` everywhere — including the Pay button.
//
// Razorpay Standard Checkout opens full-screen. Closing it (native ×,
// backdrop tap, Esc, or system Back) does not require a payment and
// does not show extra close buttons of our own.

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { PaymentButton } from "./ui/PaymentButton";
import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import {
  revealCheckoutChromeOverRazorpay,
  type CheckoutChromeController,
} from "../utils/razorpayCheckoutChrome";
import { playPaymentSuccessChime, preparePaymentSound } from "../utils/paymentSounds";
import { formatCheckoutMoney } from "./checkout/CheckoutSection";
import "./checkout/checkout-minimal.css";
import { useBranding } from "../context/BrandingContext";

export type VerifiedPayment = {
  orderId: string;
  paymentId: string | null;
  paymentMethod: string;
  free?: boolean;
  grantedEntitlementIds?: string[];
};

interface PaymentGatewayProps {
  /**
   * The Part 4 `ServerPriceQuote.quoteId` from the CheckoutContext.
   * Required: the server uses this to look up the canonical price
   * and to grant the entitlements. No client-supplied product id or
   * price is honoured.
   */
  quoteId: string;
  /**
   * Display-only — the server has already locked the amount on the
   * `ServerPriceQuote`. Kept as a prop so the on-screen amount
   * card never disagrees with the server's number.
   */
  finalPrice: number;
  productName: string;
  onPaymentSuccess: (payment: VerifiedPayment) => void;
  onGoBack: () => void;
}

type PaymentState = "idle" | "creating" | "awaiting" | "verifying" | "success" | "error";

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  modal?: {
    ondismiss?: () => void;
    /**
     * When true (Razorpay's default), a system back-press makes Razorpay
     * render a "Continue payment / Cancel payment" confirmation inside its
     * iframe. We keep this false so Android / iOS Back instantly closes the
     * full-screen checkout — no extra dialog, no extra close button.
     */
    handleback?: boolean;
    /** Esc closes the full-screen checkout immediately (no confirm). */
    escape?: boolean;
    /** Backdrop tap closes the checkout immediately (no confirm). */
    backdropclose?: boolean;
    /** Never ask "are you sure?" — one tap on × is enough to leave unpaid. */
    confirm_close?: boolean;
    /** Skip the slide-up animation so the frame lands full-screen at once. */
    animation?: boolean;
  };
  handler: (response: RazorpaySuccess) => void;
};

type RazorpayInstance = {
  open: () => void;
  close?: () => void;
  on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error("Razorpay Checkout could not be loaded. Check your connection and try again.")
      );
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
};

const apiRequest = async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error("Your session expired. Please log in again.");
  const token = await firebaseUser.getIdToken(true);
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Secure payment request failed.");
  return data;
};

interface CreateOrderResponse {
  ok: boolean;
  free: boolean;
  orderId: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  productName?: string;
  customer?: { name?: string; email?: string };
}

interface VerifyPaymentResponse {
  ok: boolean;
  verified: boolean;
  orderId: string;
  paymentId: string | null;
  free?: boolean;
  replayed?: boolean;
  grantedEntitlementIds?: string[];
}

export default function PaymentGateway({
  quoteId,
  finalPrice,
  productName,
  onPaymentSuccess,
  onGoBack,
}: PaymentGatewayProps) {
  const { appName } = useBranding();
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [error, setError] = useState("");
  const razorpayRef = useRef<RazorpayInstance | null>(null);
  // Holds the fullscreen controller while the Razorpay frame is open so
  // the overlay is released exactly when payment ends or the user leaves.
  const unpinChromeRef = useRef<CheckoutChromeController | null>(null);
  const razorpayHistoryPushedRef = useRef(false);
  const displayAmount = formatCheckoutMoney(finalPrice);

  const releaseCheckoutChrome = () => {
    unpinChromeRef.current?.release();
    unpinChromeRef.current = null;
  };

  const consumeRazorpayHistory = () => {
    if (!razorpayHistoryPushedRef.current) return;
    razorpayHistoryPushedRef.current = false;
    if (typeof window === "undefined") return;
    if (window.history.state?.eduvoraRazorpayOpen) {
      window.history.replaceState(
        { ...(window.history.state || {}), eduvoraRazorpayOpen: false },
        ""
      );
    }
  };

  const closeRazorpayCheckout = () => {
    try {
      razorpayRef.current?.close?.();
    } catch {
      // Razorpay may already have torn the modal down.
    }
    razorpayRef.current = null;
    releaseCheckoutChrome();
    consumeRazorpayHistory();
  };

  /**
   * Close the full-screen checkout without paying. The user stays on the
   * payment step so they can reopen Razorpay or tap "Back to order summary".
   */
  const dismissWithoutPaying = () => {
    try {
      razorpayRef.current?.close?.();
    } catch {
      // Modal may already be gone.
    }
    razorpayRef.current = null;
    releaseCheckoutChrome();
    consumeRazorpayHistory();
    setPaymentState("idle");
    setError("Payment window was closed. No money was charged and no access was granted.");
  };

  useEffect(() => {
    // System Back / swipe-back while the full-screen checkout is open just
    // closes it. CheckoutApp ignores that popstate (it sees the open class)
    // so the user is not thrown off the payment step.
    const onPopState = () => {
      if (!razorpayRef.current) return;
      dismissWithoutPaying();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      closeRazorpayCheckout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyPayment = async (response: RazorpaySuccess) => {
    setPaymentState("verifying");
    setError("");
    try {
      const result = await apiRequest<VerifyPaymentResponse>("/api/razorpay/verify-payment", {
        ...response,
        quoteId,
      });
      if (!result.verified) throw new Error("Payment could not be verified.");
      setPaymentState("success");
      playPaymentSuccessChime();
      window.setTimeout(
        () =>
          onPaymentSuccess({
            orderId: result.orderId,
            paymentId: result.paymentId,
            paymentMethod: "Razorpay",
            grantedEntitlementIds: result.grantedEntitlementIds || [],
          }),
        500
      );
    } catch (verificationError) {
      setPaymentState("error");
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Payment verification failed. If money was deducted, contact support with your payment ID."
      );
    }
  };

  const startPayment = async () => {
    preparePaymentSound();
    if (paymentState === "creating" || paymentState === "verifying") return;
    setPaymentState("creating");
    setError("");
    try {
      // Part 6: only `quoteId` is sent to the server. Product ids
      // and prices are derived server-side from the persisted
      // `ServerPriceQuote`.
      const order = await apiRequest<CreateOrderResponse>("/api/razorpay/create-order", {
        quoteId,
      });

      if (order.free) {
        // Free path: the server-side `verify-payment` will still
        // run via a follow-up call to grant the entitlements.
        setPaymentState("verifying");
        try {
          const verify = await apiRequest<VerifyPaymentResponse>("/api/razorpay/verify-payment", {
            orderId: order.orderId,
            free: true,
            quoteId,
          });
          setPaymentState("success");
          playPaymentSuccessChime();
          window.setTimeout(
            () =>
              onPaymentSuccess({
                orderId: verify.orderId,
                paymentId: verify.paymentId,
                paymentMethod: "Free access",
                free: true,
                grantedEntitlementIds: verify.grantedEntitlementIds || [],
              }),
            400
          );
        } catch (freeError) {
          setPaymentState("error");
          setError(freeError instanceof Error ? freeError.message : "Free grant failed.");
        }
        return;
      }

      await loadRazorpay();
      if (!window.Razorpay || !order.keyId || !order.amount)
        throw new Error("Razorpay Checkout is unavailable.");
      setPaymentState("awaiting");
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || "INR",
        name: appName,
        description: order.productName || productName,
        order_id: order.orderId,
        prefill: order.customer,
        theme: { color: "#4f46e5" },
        modal: {
          // Full-screen checkout: one tap on × / backdrop / Esc / system Back
          // closes it immediately. No extra confirm dialog, no extra buttons.
          handleback: false,
          escape: true,
          backdropclose: true,
          confirm_close: false,
          animation: false,
          ondismiss: () => {
            razorpayRef.current = null;
            releaseCheckoutChrome();
            consumeRazorpayHistory();
            setPaymentState("idle");
            setError("Payment window was closed. No money was charged and no access was granted.");
          },
        },
        handler: (response) => {
          releaseCheckoutChrome();
          consumeRazorpayHistory();
          void verifyPayment(response);
        },
      });
      checkout.on("payment.failed", (response) => {
        releaseCheckoutChrome();
        setPaymentState("error");
        setError(response.error?.description || "Payment failed. Please try another method.");
      });
      razorpayRef.current = checkout;
      if (typeof window !== "undefined" && !window.history.state?.eduvoraRazorpayOpen) {
        window.history.pushState({ eduvoraRazorpayOpen: true }, "");
        razorpayHistoryPushedRef.current = true;
      }
      checkout.open();
      // Stretch Razorpay across the full viewport so the native × and
      // every payment field stay reachable. Released on dismiss / success
      // / failure / unmount.
      unpinChromeRef.current = revealCheckoutChromeOverRazorpay();
    } catch (paymentError) {
      setPaymentState("error");
      setError(
        paymentError instanceof Error ? paymentError.message : "Could not start secure payment."
      );
    }
  };

  const busy =
    paymentState === "creating" || paymentState === "awaiting" || paymentState === "verifying";

  return (
    <div data-payment-gateway data-payment-state={paymentState} className="dc-payment-page">
      <header>
        <h2>{finalPrice === 0 ? "Confirm free access" : "Payment"}</h2>
        <p className="dc-checkout-note">{productName}</p>
      </header>
      <section className="dc-checkout-section">
        <div className="dc-checkout-total">
          <span>{finalPrice === 0 ? "Amount payable" : "Amount to pay"}</span>
          <strong>{displayAmount}</strong>
        </div>
        <p className="dc-checkout-note">The server-verified amount is confirmed before payment.</p>
      </section>
      {paymentState === "success" ? (
        <StatusCard title="Payment verified" detail="Access is being added to your account…" />
      ) : null}
      {busy ? (
        <StatusCard
          title={
            paymentState === "verifying"
              ? "Verifying payment"
              : paymentState === "awaiting"
              ? "Complete payment in Razorpay"
              : "Creating secure order"
          }
          detail={
            paymentState === "verifying"
              ? "Keep this page open until verification finishes."
              : "Access unlocks only after server verification."
          }
        />
      ) : null}
      {error ? (
        <p role="alert" className="dc-checkout-error">
          {error}
        </p>
      ) : null}
      {paymentState !== "success" ? (
        <PaymentButton
          block
          size="lg"
          className="dc-checkout-primary"
          icon={null}
          loading={busy}
          disabled={busy}
          onClick={startPayment}
          data-payment-gateway-pay=""
          label={busy ? "Please wait…" : finalPrice === 0 ? "Confirm free access" : "Pay securely"}
        />
      ) : null}
      {!busy && paymentState !== "success" ? (
        <button type="button" onClick={onGoBack} className="dc-checkout-text-action">
          Back to review
        </button>
      ) : null}
      <p className="dc-checkout-note">
        {finalPrice === 0
          ? "No card or payment is required for this order."
          : "UPI, cards, net banking and supported wallets through Razorpay. Card details are not stored here."}
      </p>
      <details className="dc-checkout-reference">
        <summary>Order reference</summary>
        <p>{quoteId}</p>
      </details>
    </div>
  );
}
function StatusCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" className="dc-checkout-payment-status">
      <LoaderCircle aria-hidden="true" className="h-4 w-4" />
      <div>
        <h3>{title}</h3>
        <p className="dc-checkout-note">{detail}</p>
      </div>
    </div>
  );
}
