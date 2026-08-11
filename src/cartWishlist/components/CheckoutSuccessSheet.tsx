import { PartyPopper, X } from "lucide-react";
import { formatINR } from "../utils/format";

interface CheckoutSuccessSheetProps {
  open: boolean;
  itemsCount: number;
  amountPaid: number;
  coinsUsed: number;
  onClose: () => void;
}

export default function CheckoutSuccessSheet({
  open,
  itemsCount,
  amountPaid,
  coinsUsed,
  onClose,
}: CheckoutSuccessSheetProps) {
  return (
    <div
      className={`absolute inset-0 z-50 flex items-end justify-center transition-all duration-300 ${
        open ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`relative z-10 w-full rounded-t-[2rem] bg-white p-6 pb-8 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-slate-200" />
        <button
          onClick={onClose}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
        >
          <X size={16} />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-200">
            <PartyPopper size={36} className="text-white" />
          </div>
          <h2 className="mt-5 text-xl font-extrabold text-slate-900">
            Order Confirmed!
          </h2>
          <p className="mt-1.5 max-w-[260px] text-sm leading-relaxed text-slate-500">
            You've unlocked {itemsCount} course{itemsCount > 1 ? "s" : ""}. Happy
            learning! Access it anytime from "My Library".
          </p>

          <div className="mt-5 w-full rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Amount Paid</span>
              <span className="font-bold text-slate-900">
                {formatINR(amountPaid)}
              </span>
            </div>
            {coinsUsed > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">EduCoins Redeemed</span>
                <span className="font-bold text-amber-600">{coinsUsed} coins</span>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-300/50 transition active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
