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
//
// Razorpay Standard Checkout opens full-screen. Closing it (native ×,
// backdrop tap, Esc, or system Back) does not require a payment and
// does not show extra close buttons of our own.

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { GlassSurface } from "./ui/glass";
import { GlassButton } from "./ui/glass-button";
import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import { revealCheckoutChromeOverRazorpay, type CheckoutChromeController } from "../utils/razorpayCheckoutChrome";
import { playPaymentSuccessChime, preparePaymentSound } from "../utils/paymentSounds";
import { formatPaise } from "../utils/money";
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
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded. Check your connection and try again."));
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

export default function PaymentGateway({ quoteId, finalPrice, currency, productName, onPaymentSuccess, onGoBack }: PaymentGatewayProps) {
  const { appName } = useBranding();
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [error, setError] = useState("");
  const razorpayRef = useRef<RazorpayInstance | null>(null);
  // Holds the fullscreen controller while the Razorpay frame is open so
  // the overlay is released exactly when payment ends or the user leaves.
  const unpinChromeRef = useRef<CheckoutChromeController | null>(null);
  const razorpayHistoryPushedRef = useRef(false);
  const displayAmount = formatPaise(finalPrice);

  const releaseCheckoutChrome = () => {
    unpinChromeRef.current?.release();
    unpinChromeRef.current = null;
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
      setError(paymentError instanceof Error ? paymentError.message : "Could not start secure payment.");
    }
  };

  const busy = paymentState === "creating" || paymentState === "awaiting" || paymentState === "verifying";

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      <GlassSurface radius={16} className="text-white" contentClassName="p-5 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-emerald-300" />
        <p className="mt-2 text-sm font-black text-white">Server-verified secure checkout</p>
        <p className="mt-1 text-xs text-white/55">The payable amount comes from the verified quote and is reconfirmed by Razorpay on the server.</p>
      </GlassSurface>

      <div className="dc-quote rounded-2xl bg-indigo-600 p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">{finalPrice === 0 ? "No payment needed" : "Amount to pay"}</p>
        <p className="mt-1 text-3xl font-extrabold">{finalPrice === 0 ? "FREE" : displayAmount}</p>
        <p className="mt-1 truncate text-xs text-indigo-200">{productName}</p>
        <p className="mt-2 truncate text-[10px] font-mono text-indigo-200">quote {quoteId}</p>
      </div>

      {paymentState === "success" && <StatusCard icon={<CheckCircle2 className="h-10 w-10 text-emerald-300" />} title="Payment verified" detail="Access is being added to your account…" tone="emerald" />}
      {busy && <StatusCard icon={<LoaderCircle className="h-10 w-10 animate-spin text-indigo-300" />} title={paymentState === "verifying" ? "Verifying payment" : paymentState === "awaiting" ? "Complete payment in Razorpay" : "Creating secure order"} detail={paymentState === "verifying" ? "Do not close this page while the server confirms your payment." : "Your access will unlock only after server verification."} tone="indigo" />}
      {error && <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/15 p-4 text-sm font-semibold leading-6 text-rose-200"><TriangleAlert className="mb-2 h-5 w-5" />{error}</div>}

      {paymentState !== "success" && (
        <button disabled={busy} onClick={startPayment} className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-emerald-600 py-4 text-base font-black text-white transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60">
          {/* Checkout's money button keeps its emerald identity (it is the one
              colour a user is told to trust) and wears the pack's specular
              layer over it — frost + rim + sheen, content above the gloss. */}
          <GlassSurface className="pointer-events-none absolute inset-0" />
          <span className="relative z-10 flex items-center justify-center gap-2">
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
            {finalPrice === 0 ? "Unlock free access" : busy ? "Please wait…" : `Pay securely — ${currency}${finalPrice.toLocaleString("en-IN")}`}
          </span>
        </button>
      )}
      {!busy && paymentState !== "success" && <GlassButton variant="capsule" onClick={onGoBack} className="w-full [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:font-bold">← Back to order summary</GlassButton>}
      <p className="text-center text-[11px] font-medium text-white/55">Razorpay handles UPI, cards, net banking and supported wallets. Card details never touch this app.</p>
    </div>
  );
}

function StatusCard({ icon, title, detail, tone }: { icon: React.ReactNode; title: string; detail: string; tone: "emerald" | "indigo" }) {
  return <div className={`rounded-2xl border p-6 text-center ${tone === "emerald" ? "border-emerald-400/30 bg-emerald-500/15" : "border-indigo-400/30 bg-indigo-500/15"}`}><div className="flex justify-center">{icon}</div><p className="mt-3 text-sm font-black text-white">{title}</p><p className="mt-1 text-xs leading-5 text-white/55">{detail}</p></div>;
}
