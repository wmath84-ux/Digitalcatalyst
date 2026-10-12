// src/components/checkout/RupeePrice.tsx
//
// The reference design (Uiverse "warm-bulldog-97") prints a price as
// `<sup>$</sup>57<sub>.99</sub>` — a raised currency mark with the fractional
// part set below the baseline. Indian retail prices are the same two-part
// number (whole rupees + optional paise), so the exact geometry is kept and
// only the currency changes: ₹ in the `<sup>` slot.
//
// Amounts always arrive from the server in integer paise (see
// `src/utils/money.ts`), so the split is exact — never a float truncation.
// Assistive tech reads one clean amount ("₹1,299.50") from the visually
// hidden copy; the drawn parts stay `aria-hidden`.

import { paiseToRupees } from "../../utils/money";

export interface RupeePriceProps {
  /** Integer paise, as returned by the verified `ServerPriceQuote`. */
  paise: number;
  className?: string;
}

/** Split paise into the reference's whole/fraction pair. */
export const splitPaise = (paise: number): { whole: string; fraction: string | null } => {
  const safe = Number.isFinite(paise) ? Math.max(0, Math.round(paise)) : 0;
  const whole = Math.floor(safe / 100);
  const fraction = safe % 100;
  return {
    whole: whole.toLocaleString("en-IN"),
    fraction: fraction === 0 ? null : String(fraction).padStart(2, "0"),
  };
};

/** The buyer-facing amount exactly as it is drawn (for labels / aria text). */
export const rupeeLabel = (paise: number): string => {
  const { whole, fraction } = splitPaise(paise);
  return `₹${whole}${fraction ? `.${fraction}` : ""}`;
};

export default function RupeePrice({ paise, className = "" }: RupeePriceProps) {
  const { whole, fraction } = splitPaise(paise);
  const label = rupeeLabel(paise);
  // Keep the "Free" wording the rest of the checkout uses for a ₹0 line.
  if (paiseToRupees(paise) === 0) {
    return (
      <span className={`cu-price ${className}`.trim()} data-zero="true">
        <strong className="cu-price-free">Free</strong>
      </span>
    );
  }
  return (
    <span className={`cu-price ${className}`.trim()}>
      <sup aria-hidden="true">₹</sup>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{whole}</span>
      {fraction ? (
        <sub aria-hidden="true">.{fraction}</sub>
      ) : null}
    </span>
  );
}
