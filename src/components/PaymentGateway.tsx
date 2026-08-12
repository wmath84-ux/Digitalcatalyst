import { useState } from "react";
import { CheckCircle2, CreditCard, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { auth } from "../../firebase";

export type VerifiedPayment = {
  orderId: string;
  paymentId: string;
  paymentMethod: string;
  free?: boolean;
};

interface PaymentGatewayProps {
  productId: string;
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
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpaySuccess) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, callback: (response: { error?: { description?: string } }) => void) => void };
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
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Secure payment request failed.");
  return data;
};

export default function PaymentGateway({ productId, finalPrice, currency, productName, onPaymentSuccess, onGoBack }: PaymentGatewayProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [error, setError] = useState("");

  const verifyPayment = async (response: RazorpaySuccess) => {
    setPaymentState("verifying");
    setError("");
    try {
      const result = await apiRequest<{ ok: boolean; verified: boolean; orderId: string; paymentId: string }>("/api/razorpay/verify-payment", response);
      if (!result.verified) throw new Error("Payment could not be verified.");
      setPaymentState("success");
      window.setTimeout(() => onPaymentSuccess({ orderId: result.orderId, paymentId: result.paymentId, paymentMethod: "Razorpay" }), 500);
    } catch (verificationError) {
      setPaymentState("error");
      setError(verificationError instanceof Error ? verificationError.message : "Payment verification failed. If money was deducted, contact support with your payment ID.");
    }
  };

  const startPayment = async () => {
    if (paymentState === "creating" || paymentState === "verifying") return;
    setPaymentState("creating");
    setError("");
    try {
      const order = await apiRequest<{
        ok: boolean;
        free: boolean;
        verified?: boolean;
        keyId?: string;
        orderId: string;
        amount?: number;
        currency?: string;
        productName?: string;
        customer?: { name?: string; email?: string };
      }>("/api/razorpay/create-order", { productId });

      if (order.free && order.verified) {
        setPaymentState("success");
        window.setTimeout(() => onPaymentSuccess({ orderId: order.orderId, paymentId: "FREE", paymentMethod: "Free access", free: true }), 400);
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
          ondismiss: () => {
            setPaymentState("idle");
            setError("Payment window was closed. No access was granted.");
          },
        },
        handler: (response) => void verifyPayment(response),
      });
      checkout.on("payment.failed", (response) => {
        setPaymentState("error");
        setError(response.error?.description || "Payment failed. Please try another method.");
      });
      checkout.open();
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
        <p className="mt-1 text-xs text-gray-400">The payable amount comes from Firestore and is verified by Razorpay on the server.</p>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-200">Amount to pay</p>
        <p className="mt-1 text-3xl font-extrabold">{finalPrice === 0 ? "Free" : `${currency}${finalPrice.toLocaleString("en-IN")}`}</p>
        <p className="mt-1 truncate text-xs text-indigo-200">{productName}</p>
      </div>

      {paymentState === "success" && <StatusCard icon={<CheckCircle2 className="h-10 w-10 text-emerald-600" />} title="Payment verified" detail="Access is being added to your Firebase account…" tone="emerald" />}
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
