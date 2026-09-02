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
import { GlassCard } from "../../components/ui/glass-card";
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
  /**
   * Features the buyer ALREADY purchased with their active membership and
   * kept selected. They carry over at ₹0 — never charged again, and shown
   * here so it is impossible to miss there is no double charge.
   */
  alreadyOwnedFeatureTitles?: string[];
  /**
   * Products the buyer ALREADY purchased with their active membership and
   * kept selected. Same carry-over rule: ₹0, never charged again.
   */
  alreadyOwnedProductTitles?: string[];
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
  alreadyOwnedFeatureTitles = [],
  alreadyOwnedProductTitles = [],
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
      <GlassCard>
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-white/55" />
          <h3 className="text-sm font-bold text-white/85">Order summary</h3>
        </div>
        <div className="space-y-2 text-sm">
          {/* Base plan — a ₹0 admin price means the plan itself is free. For an
              add-on upgrade the plan row was already paid with the original
              membership, so it reads "Included" and carries no charge. */}
          <div className="flex justify-between text-white/55" data-subscription-row="base">
            <span>
              {plan ? plan.name : "Base plan"} ({cycleLabel})
            </span>
            {planAlreadyIncluded ? (
              <span
                className="font-medium text-emerald-300"
                data-subscription-row-plan-included
              >
                Included in your membership
              </span>
            ) : basePricePaise <= 0 ? (
              <span className="font-medium text-emerald-300">Free</span>
            ) : (
              <span className="font-medium text-white/85">{formatRupee(basePricePaise)}</span>
            )}
          </div>

          {/* Features (paid add-ons) — names + count so the buyer sees exactly
              which features are being paid for. */}
          {featuresCount > 0 ? (
            <div data-subscription-row="features">
              <div className="flex justify-between text-white/55">
                <span>Premium features ({featuresCount})</span>
                <span className="font-medium text-white/85">{formatRupee(featuresTotalPaise)}</span>
              </div>
              {featureTitles.length > 0 ? (
                <ul className="mt-1.5 space-y-1 pl-4" data-subscription-feature-names>
                  {featureTitles.map((title) => (
                    <li key={title} className="list-disc text-xs font-medium text-white/75">
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
              <div className="flex justify-between text-emerald-200">
                <span>Included features ({includedFeatureCount})</span>
                <span className="font-medium">Free</span>
              </div>
              {includedFeatureTitles.length > 0 ? (
                <ul className="mt-1.5 space-y-1 pl-4" data-subscription-included-feature-names>
                  {includedFeatureTitles.map((title) => (
                    <li key={title} className="list-disc text-xs font-medium text-emerald-200">
                      {title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Already-purchased features — carried over from the active
              membership at ₹0. The buyer paid for them once already, so this
              row states "Already purchased" instead of showing a price. */}
          {alreadyOwnedFeatureTitles.length > 0 ? (
            <div data-subscription-row="owned">
              <div className="flex justify-between text-emerald-200">
                <span>Already purchased features ({alreadyOwnedFeatureTitles.length})</span>
                <span className="font-medium">₹0 — no charge</span>
              </div>
              <ul className="mt-1.5 space-y-1 pl-4" data-subscription-owned-feature-names>
                {alreadyOwnedFeatureTitles.map((title) => (
                  <li key={title} className="list-disc text-xs font-medium text-emerald-200">
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Already-purchased products — same carry-over rule. */}
          {alreadyOwnedProductTitles.length > 0 ? (
            <div data-subscription-row="owned-products">
              <div className="flex justify-between text-emerald-200">
                <span>Already purchased courses ({alreadyOwnedProductTitles.length})</span>
                <span className="font-medium">₹0 — no charge</span>
              </div>
              <ul className="mt-1.5 space-y-1 pl-4" data-subscription-owned-product-names>
                {alreadyOwnedProductTitles.map((title) => (
                  <li key={title} className="list-disc text-xs font-medium text-emerald-200">
                    {title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Bonus products — names + count so the buyer sees exactly which
              products were selected and how many. */}
          {productsCount > 0 ? (
            <div data-subscription-row="products">
              <div className="flex justify-between text-white/55">
                <span>Bonus products ({productsCount})</span>
                <span className="font-medium text-white/85">{formatRupee(productsTotalPaise)}</span>
              </div>
              {products.length > 0 ? (
                <ul className="mt-1.5 space-y-1 pl-4" data-subscription-product-names>
                  {products.map((product) => (
                    <li key={product.id} className="list-disc text-xs font-medium text-white/75">
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
              className="flex justify-between font-bold text-emerald-300"
              data-subscription-row="coupon"
              data-applied-coupon={couponCode || ""}
            >
              <span>{discountLabel}{couponCode ? ` (${couponCode})` : ""}</span>
              <span>− {formatRupee(couponDiscountPaise)}</span>
            </div>
          ) : null}

          {/* Minimum payable floor */}
          {minPayablePaise > 0 ? (
            <div className="flex justify-between text-white/55" data-subscription-row="min-payable">
              <span>Minimum payable</span>
              <span className="font-medium text-white/85">{formatRupee(minPayablePaise)}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
          <span className="text-base font-black text-white">Total</span>
          <span
            data-subscription-row="total"
            data-subscription-total-free={totalPaise <= 0 ? "true" : undefined}
            className={`text-2xl font-black sm:text-3xl ${totalPaise <= 0 ? "text-emerald-300" : "text-white"}`}
          >
            {totalPaise <= 0 ? "Free" : formatRupee(totalPaise)}
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
