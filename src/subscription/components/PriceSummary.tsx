import type { SubscriptionPlanDoc } from "../utils/subscriptionCatalog";
import type { SubscriptionModuleSummary } from "../utils/unlockPresentation";

export interface SummaryProduct {
  id: string;
  title: string;
  pricePaise: number;
  originalPricePaise?: number;
}
interface Props {
  plan: SubscriptionPlanDoc | null;
  cycle: "monthly" | "yearly";
  basePricePaise: number;
  planAlreadyIncluded?: boolean;
  featuresTotalPaise: number;
  productsTotalPaise: number;
  features: { id: string; name: string; pricePaise: number }[];
  includedFeatureTitles?: string[];
  includedProductTitles?: string[];
  includedModules?: SubscriptionModuleSummary[];
  alreadyOwnedFeatureTitles?: string[];
  alreadyOwnedProductTitles?: string[];
  products?: SummaryProduct[];
  couponDiscountPaise: number;
  couponCode: string | null;
  discountLabel?: string;
  minPayablePaise: number;
  totalPaise: number;
}
export const formatSubscriptionMoney = (paise: number): string =>
  `₹${(Math.max(0, paise) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** A single named, itemised estimate. Checkout verifies the final payable. */
export default function PriceSummary({
  plan,
  cycle,
  basePricePaise,
  planAlreadyIncluded = false,
  featuresTotalPaise,
  productsTotalPaise,
  features,
  includedFeatureTitles = [],
  includedProductTitles = [],
  includedModules = [],
  alreadyOwnedFeatureTitles = [],
  alreadyOwnedProductTitles = [],
  products = [],
  couponDiscountPaise,
  couponCode,
  discountLabel = "Coupon discount",
  minPayablePaise,
  totalPaise,
}: Props) {
  const subtotalPaise = basePricePaise + featuresTotalPaise + productsTotalPaise;
  const priceDiscountPaise = products.reduce(
    (total, product) =>
      total + Math.max(0, (product.originalPricePaise || product.pricePaise) - product.pricePaise),
    0
  );
  const discountApplied = Math.min(
    couponDiscountPaise,
    Math.max(0, subtotalPaise - minPayablePaise)
  );
  return (
    <section data-subscription-price-summary className="dc-subscription-section">
      <h2>Selection summary</h2>
      <dl className="dc-subscription-items">
        <div data-subscription-summary-plan>
          <dt>
            {plan?.name || "Choose a plan"}
            <small>
              {cycle === "yearly" ? "Yearly" : "Monthly"}
              {planAlreadyIncluded ? " · Already paid" : ""}
            </small>
          </dt>
          <dd>{formatSubscriptionMoney(basePricePaise)}</dd>
        </div>
        {features.map((feature) => (
          <div key={feature.id} data-subscription-summary-feature={feature.id}>
            <dt>
              {feature.name}
              <small>Feature add-on</small>
            </dt>
            <dd>{formatSubscriptionMoney(feature.pricePaise)}</dd>
          </div>
        ))}
        {products.map((product) => (
          <div key={product.id} data-subscription-summary-product={product.id}>
            <dt>
              {product.title}
              <small>Course add-on</small>
            </dt>
            <dd>
              {(product.originalPricePaise || 0) > product.pricePaise ? (
                <del>{formatSubscriptionMoney(product.originalPricePaise!)}</del>
              ) : null}
              <strong>{formatSubscriptionMoney(product.pricePaise)}</strong>
            </dd>
          </div>
        ))}
        {includedFeatureTitles.map((title) => (
          <div key={`included-feature:${title}`} data-subscription-summary-included>
            <dt>
              {title}
              <small>Included with this plan</small>
            </dt>
            <dd>₹0</dd>
          </div>
        ))}
        {includedProductTitles.map((title) => (
          <div key={`included-product:${title}`} data-subscription-summary-included>
            <dt>
              {title}
              <small>Course included with this plan</small>
            </dt>
            <dd>₹0</dd>
          </div>
        ))}
        {includedModules.map((module) => (
          <div key={`included-module:${module.id}`} data-subscription-summary-module={module.id}>
            <dt>
              {module.title}
              <small>Module included with this plan · {module.productTitle}</small>
            </dt>
            <dd>₹0</dd>
          </div>
        ))}
        {alreadyOwnedFeatureTitles
          .filter((title) => !includedFeatureTitles.includes(title))
          .map((title) => (
            <div key={`owned-feature:${title}`} data-subscription-summary-owned>
              <dt>
                {title}
                <small>Already purchased · Carried over</small>
              </dt>
              <dd>₹0</dd>
            </div>
          ))}
        {alreadyOwnedProductTitles
          .filter((title) => !includedProductTitles.includes(title))
          .map((title) => (
            <div key={`owned-product:${title}`} data-subscription-summary-owned>
              <dt>
                {title}
                <small>Already purchased · Carried over</small>
              </dt>
              <dd>₹0</dd>
            </div>
          ))}
      </dl>
      <dl className="dc-subscription-totals">
        <div>
          <dt>Subtotal</dt>
          <dd data-subscription-subtotal>
            {formatSubscriptionMoney(subtotalPaise + priceDiscountPaise)}
          </dd>
        </div>
        {priceDiscountPaise > 0 ? (
          <div data-subscription-summary-sale>
            <dt>Price discount</dt>
            <dd>−{formatSubscriptionMoney(priceDiscountPaise)}</dd>
          </div>
        ) : null}
        {couponCode ? (
          <div data-subscription-summary-discount>
            <dt>
              {discountLabel}
              <small>{couponCode}</small>
            </dt>
            <dd>−{formatSubscriptionMoney(discountApplied)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="dc-subscription-payable">
        <span>Estimated payable</span>
        <strong
          data-subscription-total
          data-subscription-free={totalPaise <= 0 ? "true" : undefined}
        >
          {formatSubscriptionMoney(totalPaise)}
        </strong>
      </div>
      {minPayablePaise > 0 ? (
        <p data-subscription-min-payable className="dc-subscription-note">
          Minimum payable: {formatSubscriptionMoney(minPayablePaise)}. Discounts cannot reduce the
          total below this amount.
        </p>
      ) : null}
      <p className="dc-subscription-note">
        Prices and discounts are checked again in checkout before payment.
      </p>
    </section>
  );
}
