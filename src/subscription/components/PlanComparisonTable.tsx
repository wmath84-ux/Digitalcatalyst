import { resolveFeaturePrice } from "../../../utils/featurePricing";
import {
  isFeatureVisibleForCycle,
  planVisibleCycles,
  type VisibilityOptions,
} from "../../../utils/subscriptionVisibility";
import { resolveEffectiveSubscriberPrice } from "../../utils/subscriptionPricing";
import type {
  BillingCycle,
  SubscriptionFeatureDoc,
  SubscriptionPlanDoc,
} from "../utils/subscriptionCatalog";
import { formatSubscriptionMoney } from "./PriceSummary";

interface Props {
  plans: SubscriptionPlanDoc[];
  features: SubscriptionFeatureDoc[];
  cycle: BillingCycle;
  selectedPlanId: string | null;
  planVisibility: VisibilityOptions;
  featureVisibility: VisibilityOptions;
  subscriberPricing: Parameters<typeof resolveEffectiveSubscriberPrice>[5];
}

/** Read-only comparison is disclosed on demand, not a second plan picker. */
export default function PlanComparisonTable({
  plans,
  features,
  cycle,
  selectedPlanId,
  planVisibility,
  featureVisibility,
  subscriberPricing,
}: Props) {
  const sellablePlans = plans.filter((plan) => plan.active);
  if (!sellablePlans.length) return null;
  const offered = (plan: SubscriptionPlanDoc, feature: SubscriptionFeatureDoc) =>
    planVisibleCycles(plan, planVisibility).includes(cycle) &&
    isFeatureVisibleForCycle(feature, plan.id, cycle, featureVisibility);
  const comparableFeatures = features
    .filter((feature) => feature.active && sellablePlans.some((plan) => offered(plan, feature)))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <details data-subscription-comparison className="dc-subscription-disclosure">
      <summary>Compare plan features</summary>
      <div
        className="dc-subscription-compare-scroll"
        role="region"
        aria-label="Plan comparison"
        tabIndex={0}
      >
        <table>
          <caption>
            {cycle === "yearly" ? "Yearly" : "Monthly"} plans. Add-ons are priced separately.
          </caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              {sellablePlans.map((plan) => {
                const available = planVisibleCycles(plan, planVisibility).includes(cycle);
                const publicPrice =
                  cycle === "yearly" ? plan.yearlyPricePaise : plan.monthlyPricePaise;
                const price =
                  planVisibility.isSubscriber && publicPrice > 0
                    ? Math.round(
                        resolveEffectiveSubscriberPrice(
                          plan.id,
                          cycle,
                          publicPrice / 100,
                          true,
                          plan.subscriberPricingOverride ?? null,
                          subscriberPricing
                        ) * 100
                      )
                    : publicPrice;
                return (
                  <th key={plan.id} scope="col">
                    {plan.name}
                    {selectedPlanId === plan.id ? <small>Selected</small> : null}
                    <small>
                      {available ? formatSubscriptionMoney(price) : "Duration unavailable"}
                    </small>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {comparableFeatures.map((feature) => (
              <tr key={feature.id}>
                <th scope="row">{feature.name}</th>
                {sellablePlans.map((plan) => {
                  const resolved = resolveFeaturePrice(feature as never, plan.id, cycle);
                  return (
                    <td key={plan.id}>
                      {!offered(plan, feature)
                        ? "Not offered"
                        : plan.includedFeatureIds.includes(feature.id) ||
                          feature.included ||
                          resolved.included
                        ? "Included · ₹0"
                        : formatSubscriptionMoney(resolved.pricePaise)}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Cloud Test Bank</th>
              {sellablePlans.map((plan) => (
                <td key={plan.id}>
                  {!planVisibleCycles(plan, planVisibility).includes(cycle)
                    ? "Not offered"
                    : plan.revisionTestBankLimits?.[cycle] === -1
                    ? "Unlimited saved tests"
                    : typeof plan.revisionTestBankLimits?.[cycle] === "number"
                    ? `${plan.revisionTestBankLimits[cycle]} saved tests`
                    : "Not specified"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
