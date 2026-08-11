import { ShieldCheck, Loader2 } from "lucide-react";

interface Props {
  total: number;
  originalTotal: number;
  hasDiscount: boolean;
  loading: boolean;
  onSubscribe: () => void;
}

export default function SubscribeBar({
  total,
  originalTotal,
  hasDiscount,
  loading,
  onSubscribe,
}: Props) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-slate-100 bg-white/90 px-5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-slate-900">
            ${total.toFixed(2)}
          </span>
          {hasDiscount && (
            <span className="text-xs font-semibold text-slate-400 line-through">
              ${originalTotal.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          Secure checkout
        </div>
      </div>
      <button
        onClick={onSubscribe}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-4 text-sm font-extrabold text-white shadow-lg shadow-violet-300 active:scale-[0.98] transition-transform disabled:opacity-70"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing...
          </>
        ) : (
          "Subscribe Now"
        )}
      </button>
    </div>
  );
}
