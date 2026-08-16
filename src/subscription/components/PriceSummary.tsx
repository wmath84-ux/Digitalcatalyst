// src/subscription/components/PriceSummary.tsx
//
// Part 9 — Order summary. The cycle / feature / coupon / min-payable
// numbers all come from the server (or, when the user is on the
// subscription page, from the preflight quote). All amounts are in
// **paise** (integer); the component formats to rupees for display.

import { Receipt } from "lucide-react";
import type { SubscriptionPlanDoc } from "../utils/subscriptionCatalog";

interface Props {
  plan: SubscriptionPlanDoc | null;
  cycle: "monthly" | "yearly";
  basePricePaise: number;
  featuresTotalPaise: number;
  featuresCount: number;
  includedFeatureCount: number;
  productsCount: number;
  productsTotalPaise: number;
  couponDiscountPaise: number;
  couponCode: string | null;
  discountLabel?: string;
  minPayablePaise: number;
  totalPaise: number;
}

const formatRupee = (paise: number): string =>
  `₹${Math.max(0, Math.round(paise / 100)).toLocaleString("en-IN")}`;

export default function PriceSummary({
  plan,
  cycle,
  basePricePaise,
  featuresTotalPaise,
  featuresCount,
  includedFeatureCount,
  productsCount,
  productsTotalPaise,
  couponDiscountPaise,
  couponCode,
  discountLabel = "Coupon discount",
  minPayablePaise,
  totalPaise,
}: Props) {
  const cycleLabel = cycle === "monthly" ? "Monthly" : "Yearly";
  return (
    <div className="px-5 pt-5" data-subscription-price-summary>
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/50">
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Order summary</h3>
        </div>
        <div className="space-y-2 text-sm">
          {/* Base plan — a ₹0 admin price means the plan itself is free. */}
          <div className="flex justify-between text-slate-500" data-subscription-row="base">
            <span>
              {plan ? plan.name : "Base plan"} ({cycleLabel})
            </span>
            {basePricePaise <= 0 ? (
              <span className="font-medium text-emerald-600">Free</span>
            ) : (
              <span className="font-medium text-slate-700">{formatRupee(basePricePaise)}</span>
            )}
          </div>

          {/* Features (paid add-ons) */}
          {featuresCount > 0 ? (
            <div className="flex justify-between text-slate-500" data-subscription-row="features">
              <span>Premium features ({featuresCount})</span>
              <span className="font-medium text-slate-700">{formatRupee(featuresTotalPaise)}</span>
            </div>
          ) : null}

          {/* Included features (free with the plan) */}
          {includedFeatureCount > 0 ? (
            <div className="flex justify-between text-emerald-700" data-subscription-row="included">
              <span>Included features ({includedFeatureCount})</span>
              <span className="font-medium">Free</span>
            </div>
          ) : null}

          {productsCount > 0 ? (
            <div className="flex justify-between text-slate-500" data-subscription-row="products">
              <span>Bonus products ({productsCount})</span>
              <span className="font-medium text-slate-700">{formatRupee(productsTotalPaise)}</span>
            </div>
          ) : null}

          {/* Coupon */}
          {couponDiscountPaise > 0 ? (
            <div
              className="flex justify-between font-bold text-emerald-600"
              data-subscription-row="coupon"
              data-applied-coupon={couponCode || ""}
            >
              <span>{discountLabel}{couponCode ? ` (${couponCode})` : ""}</span>
              <span>− {formatRupee(couponDiscountPaise)}</span>
            </div>
          ) : null}

          {/* Minimum payable floor */}
          {minPayablePaise > 0 ? (
            <div className="flex justify-between text-slate-500" data-subscription-row="min-payable">
              <span>Minimum payable</span>
              <span className="font-medium text-slate-700">{formatRupee(minPayablePaise)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-baseline justify-between border-t border-slate-100 pt-3">
          <span className="text-base font-black text-slate-900">Total</span>
          <span
            data-subscription-row="total"
            data-subscription-total-free={totalPaise <= 0 ? "true" : undefined}
            className={`text-2xl font-black sm:text-3xl ${totalPaise <= 0 ? "text-emerald-600" : "text-slate-900"}`}
          >
            {totalPaise <= 0 ? "Free" : formatRupee(totalPaise)}
          </span>
        </div>
      </div>
    </div>
  );
}
