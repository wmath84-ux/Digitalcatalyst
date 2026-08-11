import { useMemo, useState } from "react";
import { Check, Ticket, Wallet } from "lucide-react";
import { useApp } from "../context/AppContext";
import { cn } from "../utils/cn";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function CouponStorePage() {
  const { coupons, coins, redeemCoupon } = useApp();
  const [category, setCategory] = useState("All");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(coupons.map((c) => c.category)))],
    [coupons]
  );

  const filtered = category === "All" ? coupons : coupons.filter((c) => c.category === category);
  const pendingCoupon = coupons.find((c) => c.id === pendingId) || null;

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 pb-6 pt-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-5 text-white shadow-xl shadow-orange-200">
        <div className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-white/80">Your Balance</p>
            <p className="text-2xl font-extrabold">🪙 {coins} EduCoins</p>
          </div>
          <Wallet className="h-8 w-8 text-white/70" />
        </div>
        <p className="relative mt-3 text-[11px] text-white/85">
          Redeem your EduCoins for exclusive discounts, free trials & more!
        </p>
      </section>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-bold transition active:scale-95",
              category === cat
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-500 ring-1 ring-neutral-200"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map((coupon) => (
          <div
            key={coupon.id}
            className="relative overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-neutral-100"
          >
            <div className={cn("h-1.5 w-full bg-gradient-to-r", coupon.gradient)} />
            <div className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md",
                      coupon.gradient
                    )}
                  >
                    <Ticket className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-neutral-900">{coupon.title}</p>
                    <p className="text-[10.5px] text-neutral-400">{coupon.expiry}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full bg-gradient-to-r px-2.5 py-1 text-[10.5px] font-extrabold text-white",
                    coupon.gradient
                  )}
                >
                  {coupon.discount}
                </span>
              </div>
              <p className="mb-3 text-xs text-neutral-500">{coupon.description}</p>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-dashed border-neutral-300 px-3 py-2">
                <span className="text-[11px] font-semibold text-neutral-400">Code</span>
                <span className="font-mono text-xs font-bold tracking-wider text-neutral-800">
                  {coupon.code}
                </span>
              </div>
              <button
                type="button"
                disabled={coupon.redeemed}
                onClick={() => setPendingId(coupon.id)}
                className={cn(
                  "flex w-full items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold transition active:scale-[0.98]",
                  coupon.redeemed
                    ? "bg-emerald-50 text-emerald-600"
                    : coins < coupon.cost
                    ? "bg-neutral-100 text-neutral-400"
                    : "bg-neutral-900 text-white"
                )}
              >
                {coupon.redeemed ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Redeemed
                  </>
                ) : (
                  `Redeem for ${coupon.cost} 🪙`
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!pendingCoupon}
        title={`Redeem "${pendingCoupon?.title ?? ""}"?`}
        description={`This will cost ${pendingCoupon?.cost ?? 0} EduCoins from your wallet.`}
        confirmLabel="Redeem"
        onCancel={() => setPendingId(null)}
        onConfirm={() => {
          if (pendingId) redeemCoupon(pendingId);
          setPendingId(null);
        }}
      />
    </div>
  );
}
