// src/components/subscription/SubscriberOnlyPriceBadge.tsx
//
// Per-card "Subscriber price" badge with the discounted value. The
// label is intentionally different from a regular strikethrough so a
// member sees the discount as a perk, not a regular sale.

import { memo } from "react";

type Props = {
  price: number;
  basePrice: number;
  currency?: string;
  cycleLabel?: string | null;
  className?: string;
};

function formatRupees(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function SubscriberOnlyPriceBadgeImpl({ price, basePrice, currency, cycleLabel, className }: Props) {
  const isFree = price === 0;
  const isDiscounted = basePrice > 0 && price < basePrice;
  return (
    <div
      data-subscriber-only-price-badge
      data-subscriber-only-price-badge="true"
      role="note"
      className={
        "inline-flex flex-col items-start gap-0.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-1.5 " +
        (className || "")
      }
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
        Your subscriber price
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-base font-extrabold text-emerald-900">
          {isFree ? "Free" : formatRupees(price)}
        </span>
        {isDiscounted ? (
          <span className="text-[11px] font-medium text-slate-500 line-through">
            {formatRupees(basePrice)}
          </span>
        ) : null}
        {cycleLabel ? (
          <span className="text-[11px] font-medium text-emerald-800/80">/ {cycleLabel}</span>
        ) : null}
      </span>
      {currency ? null : null}
    </div>
  );
}

export const SubscriberOnlyPriceBadge = memo(SubscriberOnlyPriceBadgeImpl);
export default SubscriberOnlyPriceBadge;
