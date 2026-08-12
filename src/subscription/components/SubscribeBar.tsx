// src/subscription/components/SubscribeBar.tsx
//
// Part 9 — sticky bottom subscribe bar. Uses paise throughout
// (server is the only authority on price math). The previous
// implementation used dollar amounts from a `setTimeout` simulation;
// both are gone.

import { ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  totalPaise: number;
  subtotalPaise: number;
  couponDiscountPaise: number;
  loading: boolean;
  disabled?: boolean;
  onSubscribe: () => void;
  totalRupees: string;
}

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

export default function SubscribeBar({
  totalPaise,
  subtotalPaise,
  couponDiscountPaise,
  loading,
  disabled,
  onSubscribe,
  totalRupees,
}: Props) {
  const hasDiscount = couponDiscountPaise > 0;
  return (
    <div
      className="sticky bottom-0 z-30 border-t border-slate-100 bg-white/90 px-5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg"
      data-subscription-subscribe-bar
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span
            data-subscription-total
            className="text-xl font-extrabold text-slate-900"
          >
            {totalRupees || formatRupee(totalPaise)}
          </span>
          {hasDiscount ? (
            <span className="text-xs font-semibold text-slate-400 line-through">
              {formatRupee(subtotalPaise)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Secure checkout
        </div>
      </div>
      <button
        type="button"
        onClick={onSubscribe}
        disabled={Boolean(loading || disabled)}
        data-subscription-subscribe
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 text-sm font-extrabold text-white shadow-lg shadow-violet-300 active:scale-[0.98] transition-transform disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </>
        ) : (
          "Subscribe via Razorpay"
        )}
      </button>
    </div>
  );
}
