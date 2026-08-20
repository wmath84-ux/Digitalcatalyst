// src/subscription/components/PriceSummary.tsx
//
// Part 9 — Order summary. The cycle / feature / coupon / min-payable
// numbers all come from the server (or, when the user is on the
// subscription page, from the preflight quote). All amounts are in
// **paise** (integer); the component formats to rupees for display.
//
// Every row now carries the NAMES of what was selected (features and
// bonus products) in addition to the counts, so the buyer can verify
// the exact package — not just aggregate numbers — before checkout.

import { Receipt } from "lucide-react";
import type { SubscriptionPlanDoc } from "../utils/subscriptionCatalog";

export interface SummaryProduct {
  id: string;
  title: string;
}

interface Props {
  plan: SubscriptionPlanDoc | null;
  cycle: "monthly" | "yearly";
  basePricePaise: number;
  /** True for add-on upgrades: the plan row is already paid and reads "Included". */
  planAlreadyIncluded?: boolean;
  featuresTotalPaise: number;
  featuresCount: number;
  includedFeatureCount: number;
  productsCount: number;
  productsTotalPaise: number;
  /** Names of the paid (chargeable) features, in the order they were selected. */
  featureTitles?: string[];
  /** Names of the plan-included features. */
  includedFeatureTitles?: string[];
  /** Selected bonus products (title shown next to the count). */
  products?: SummaryProduct[];
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
  planAlreadyIncluded = false,
  featuresTotalPaise,
  featuresCount,
  includedFeatureCount,
  productsCount,
  productsTotalPaise,
  featureTitles = [],
  includedFeatureTitles = [],
  products = [],
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
          {/* Base plan — a ₹0 admin price means the plan itself is free. For an
              add-on upgrade the plan row was already paid with the original
              membership, so it reads "Included" and carries no charge. */}
          <div className="flex justify-between text-slate-500" data-subscription-row="base">
            <span>
              {plan ? plan.name : "Base plan"} ({cycleLabel})
            </span>
            {planAlreadyIncluded ? (
              <span
                className="font-medium text-emerald-600"
                data-subscription-row-plan-included
              >
                Included in your membership
              </span>
            ) : basePricePaise <= 0 ? (
              <span className="font-medium text-emerald-600">Free</span>
            ) : (
              <span className="font-medium text-slate-700">{formatRupee(basePricePaise)}</span>
            )}
          </div>

          {/* Features (paid add-ons) — names + count so the buyer sees exactly
              which features are being paid for. */}
          {featuresCount > 0 ? (
            <div data-subscription-row="features">
              <div className="flex justify-between text-slate-500">
                <span>Premium features ({featuresCount})</span>
                <span className="font-medium text-slate-700">{formatRupee(featuresTotalPaise)}</span>
              </div>
              {featureTitles.length > 0 ? (
                <ul className="mt-1.5 space-y-1 pl-4" data-subscription-feature-names>
                  {featureTitles.map((title) => (
                    <li key={title} className="list-disc text-xs font-medium text-slate-600">
                      {title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Included features (free with the plan) */}
          {includedFeatureCount > 0 ? (
            <div data-subscription-row="included">
              <div className="flex justify-between text-emerald-700">
                <span>Included features ({includedFeatureCount})</span>
                <span className="font-medium">Free</span>
              </div>
              {includedFeatureTitles.length > 0 ? (
                <ul className="mt-1.5 space-y-1 pl-4" data-subscription-included-feature-names>
                  {includedFeatureTitles.map((title) => (
                    <li key={title} className="list-disc text-xs font-medium text-emerald-700/80">
                      {title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Bonus products — names + count so the buyer sees exactly which
              products were selected and how many. */}
          {productsCount > 0 ? (
            <div data-subscription-row="products">
              <div className="flex justify-between text-slate-500">
                <span>Bonus products ({productsCount})</span>
                <span className="font-medium text-slate-700">{formatRupee(productsTotalPaise)}</span>
              </div>
              {products.length > 0 ? (
                <ul className="mt-1.5 space-y-1 pl-4" data-subscription-product-names>
                  {products.map((product) => (
                    <li key={product.id} className="list-disc text-xs font-medium text-slate-600">
                      {product.title}
                    </li>
                  ))}
                </ul>
              ) : null}
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
