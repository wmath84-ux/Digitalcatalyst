// src/components/PaymentGateway.tsx
//
// Part 6 — quote-driven Razorpay checkout. The component now takes
// a single `quoteId` prop (sourced from the Part 5
// `CheckoutContext.quote.quoteId`) and posts only `{ quoteId }` to
// `/api/razorpay/create-order` and `/api/razorpay/verify-payment`.
// The server-side endpoints load the canonical `ServerPriceQuote`
// and grant the entitlements transactionally.
//
// The `productName` / `finalPrice` / `currency` props are still
// used for the on-screen amount card; they are display-only and
// never sent to the server (the server computes the amount from
// `quote.cashPayable`).

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { auth } from "../../firebase";
import { revealCheckoutChromeOverRazorpay, type CheckoutChromeController } from "../utils/razorpayCheckoutChrome";
import { playPaymentSuccessChime, preparePaymentSound } from "../utils/paymentSounds";
import { formatPaise } from "../utils/money";

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
  currency: string;
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
     * simulate its own back gesture and render a "Continue payment / Cancel
     * payment" confirmation dialog INSIDE its iframe. Because the app insets
     * that iframe between the pinned header and footer, the dialog's buttons
     * render half outside the frame and get clipped — the Cancel button was
     * not visible. With `handleback: false` Razorpay leaves the back press to
     * the app: our `popstate` handler closes the checkout and returns to the
     * order summary, so back navigation behaves cleanly on the payment page.
     */
    handleback?: boolean;
    /** Disable Razorpay's own Esc-to-close so our exit flow stays the only path. */
    escape?: boolean;
    /** Disable close-on-backdrop-tap (the backdrop is mostly hidden anyway). */
    backdropclose?: boolean;
    /** Disable Razorpay's in-iframe close confirmation (we render our own). */
    confirm_close?: boolean;
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
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded. Check your connection and try again."));
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
};

const apiRequest = async <T,>(path: string, body: Record<string, unknown>): Promise<T> => {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error("Your session expired. Please log in again.");
  const token = await firebaseUser.getIdToken(true);
  const response = await fetch(path, {
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

export default function PaymentGateway({ quoteId, finalPrice, currency, productName, onPaymentSuccess, onGoBack }: PaymentGatewayProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [error, setError] = useState("");
  const razorpayRef = useRef<RazorpayInstance | null>(null);
  const chromeRef = useRef<CheckoutChromeController | null>(null);
  const razorpayHistoryPushedRef = useRef(false);
  const goBackRef = useRef(onGoBack);
  goBackRef.current = onGoBack;
  const displayAmount = formatPaise(finalPrice);

  const releaseCheckoutChrome = () => {
    chromeRef.current?.release();
    chromeRef.current = null;
  };

  const consumeRazorpayHistory = () => {
    if (!razorpayHistoryPushedRef.current) return;
    razorpayHistoryPushedRef.current = false;
    if (typeof window === "undefined") return;
    if (window.history.state?.eduvoraRazorpayOpen) {
      window.history.replaceState({ ...(window.history.state || {}), eduvoraRazorpayOpen: false }, "");
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
   * Abandon the payment for real: tear down the Razorpay modal, drop our
   * history entry and hand the user back to the order summary.
   */
  const abandonPayment = () => {
    try {
      razorpayRef.current?.close?.();
    } catch {
      // Modal may already be gone.
    }
    razorpayRef.current = null;
    releaseCheckoutChrome();
    consumeRazorpayHistory();
    setPaymentState("idle");
    setError("Payment was cancelled. No money was charged and no access was granted.");
    goBackRef.current();
  };

  useEffect(() => {
    // Back / swipe-back while the payment frame is open must NOT silently
    // walk the history stack. Razorpay's own "Continue payment / Cancel
    // payment" prompt lives inside its cross-origin iframe (and gets clipped
    // by our inset layout), so we show the identical prompt from our own DOM
    // instead, and immediately re-arm the history entry so the guard keeps
    // working for repeated back presses.
    const onPopState = () => {
      if (!razorpayRef.current || !chromeRef.current) return;
      if (typeof window !== "undefined") {
        window.history.pushState({ eduvoraRazorpayOpen: true }, "");
        razorpayHistoryPushedRef.current = true;
      }
      chromeRef.current.requestExit();
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
        500,
      );
    } catch (verificationError) {
      setPaymentState("error");
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Payment verification failed. If money was deducted, contact support with your payment ID.",
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
      const order = await apiRequest<CreateOrderResponse>("/api/razorpay/create-order", { quoteId });

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
            400,
          );
        } catch (freeError) {
          setPaymentState("error");
          setError(freeError instanceof Error ? freeError.message : "Free grant failed.");
        }
        return;
      }

      await loadRazorpay();
      if (!window.Razorpay || !order.keyId || !order.amount) throw new Error("Razorpay Checkout is unavailable.");
      setPaymentState("awaiting");
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Digital Catalyst",
        description: order.productName || productName,
        order_id: order.orderId,
        prefill: order.customer,
        theme: { color: "#4f46e5" },
        modal: {
          // Razorpay's own back handling renders a confirmation dialog INSIDE
          // its iframe, which our inset layout clips. We disable it and show
          // our own always-visible "Continue payment / Cancel payment" sheet
          // (see the RazorpayOptions type for the full explanation).
          handleback: false,
          // Keep the frame on screen if the user taps the dim backdrop; the
          // only ways out are our Cancel bar and Razorpay's own close button.
          escape: false,
          backdropclose: false,
          confirm_close: false,
          ondismiss: () => {
            razorpayRef.current = null;
            releaseCheckoutChrome();
            consumeRazorpayHistory();
            setPaymentState("idle");
            setError("Payment window was closed. No access was granted.");
            // Razorpay closed its own overlay (its × button) — return to the
            // order summary so the user isn't left stranded on the payment
            // step with no way back.
            goBackRef.current();
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
      chromeRef.current = revealCheckoutChromeOverRazorpay({
        label: order.productName || productName,
        onCancel: abandonPayment,
      });
    } catch (paymentError) {
      setPaymentState("error");
      setError(paymentError instanceof Error ? paymentError.message : "Could not start secure payment.");
    }
  };

  const busy = paymentState === "creating" || paymentState === "awaiting" || paymentState === "verifying";

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-9 w-9 text-emerald-600" />
        <p className="mt-2 text-sm font-black text-gray-800">Server-verified secure checkout</p>
        <p className="mt-1 text-xs text-gray-400">The payable amount comes from the verified quote and is reconfirmed by Razorpay on the server.</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">{finalPrice === 0 ? "No payment needed" : "Amount to pay"}</p>
        <p className="mt-1 text-3xl font-extrabold">{finalPrice === 0 ? "FREE" : displayAmount}</p>
        <p className="mt-1 truncate text-xs text-indigo-200">{productName}</p>
        <p className="mt-2 truncate text-[10px] font-mono text-indigo-200/70">quote {quoteId}</p>
      </div>

      {paymentState === "success" && <StatusCard icon={<CheckCircle2 className="h-10 w-10 text-emerald-600" />} title="Payment verified" detail="Access is being added to your account…" tone="emerald" />}
      {busy && <StatusCard icon={<LoaderCircle className="h-10 w-10 animate-spin text-indigo-600" />} title={paymentState === "verifying" ? "Verifying payment" : paymentState === "awaiting" ? "Complete payment in Razorpay" : "Creating secure order"} detail={paymentState === "verifying" ? "Do not close this page while the server confirms your payment." : "Your access will unlock only after server verification."} tone="indigo" />}
      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-700"><TriangleAlert className="mb-2 h-5 w-5" />{error}</div>}

      {paymentState !== "success" && (
        <button disabled={busy} onClick={startPayment} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-black text-white shadow-lg shadow-emerald-200 transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">
          {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
          {finalPrice === 0 ? "Unlock free access" : busy ? "Please wait…" : `Pay securely — ${currency}${finalPrice.toLocaleString("en-IN")}`}
        </button>
      )}
      {!busy && paymentState !== "success" && <button onClick={onGoBack} className="w-full rounded-2xl bg-gray-100 py-3 text-sm font-bold text-gray-600">← Back to order summary</button>}
      <p className="text-center text-[11px] font-medium text-gray-400">Razorpay handles UPI, cards, net banking and supported wallets. Card details never touch this app.</p>
    </div>
  );
}

function StatusCard({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: "emerald" | "indigo" }) {
  return <div className={`rounded-2xl border p-6 text-center ${tone === "emerald" ? "border-emerald-200 bg-emerald-50" : "border-indigo-200 bg-indigo-50"}`}><div className="flex justify-center">{icon}</div><p className="mt-3 text-sm font-black text-gray-800">{title}</p><p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p></div>;
}
