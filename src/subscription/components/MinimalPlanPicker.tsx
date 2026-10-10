import type { SubscriptionPlanDoc } from "../utils/subscriptionCatalog";
import { planVisibleCycles, type VisibilityOptions } from "../../../utils/subscriptionVisibility";
import { resolveEffectiveSubscriberPrice } from "../../utils/subscriptionPricing";

import { formatSubscriptionMoney as money } from "./PriceSummary";

export default function MinimalPlanPicker({
  plans,
  selectedPlanId,
  onChangePlan,
  cycle,
  onChangeCycle,
  supportedCycles,
  subscriber,
  ownedPlanId,
  ownedCycle,
  subscriberPricing,
  planVisibility,
}: {
  plans: SubscriptionPlanDoc[];
  selectedPlanId: string | null;
  onChangePlan: (id: string) => void;
  cycle: "monthly" | "yearly";
  onChangeCycle: (cycle: "monthly" | "yearly") => void;
  supportedCycles: ("monthly" | "yearly")[];
  subscriber: boolean;
  ownedPlanId: string | null;
  ownedCycle: "monthly" | "yearly" | null;
  planVisibility: VisibilityOptions;
  subscriberPricing: Parameters<typeof resolveEffectiveSubscriberPrice>[5];
}) {
  const allowance = plans.find((plan) => plan.id === selectedPlanId)?.aiAllowances?.[cycle];
  return (
    <section data-subscription-plan-picker className="dc-subscription-section">
      <h2>Plan and duration</h2>
      <fieldset className="dc-subscription-plan-list">
        <legend className="sr-only">Choose a plan</legend>
        {plans.map((plan) => {
          const cycles = planVisibleCycles(plan, planVisibility);
          const displayCycle = cycles.includes(cycle) ? cycle : cycles[0] || cycle;
          const publicPaise =
            displayCycle === "yearly" ? plan.yearlyPricePaise : plan.monthlyPricePaise;
          const price =
            subscriber && publicPaise > 0
              ? Math.round(
                  resolveEffectiveSubscriberPrice(
                    plan.id,
                    displayCycle,
                    publicPaise / 100,
                    true,
                    plan.subscriberPricingOverride ?? null,
                    subscriberPricing
                  ) * 100
                )
              : publicPaise;
          const capacity = plan.revisionTestBankLimits?.[displayCycle];
          return (
            <label
              key={plan.id}
              data-subscription-plan={plan.id}
              data-subscription-plan-owned={
                subscriber && ownedPlanId === plan.id ? "true" : undefined
              }
              className="dc-subscription-plan-row"
              data-selected={selectedPlanId === plan.id ? "true" : "false"}
            >
              <input
                type="radio"
                name="subscription-plan"
                value={plan.id}
                checked={selectedPlanId === plan.id}
                onChange={() => onChangePlan(plan.id)}
              />
              <span>
                <strong>{plan.name}</strong>
                {subscriber && ownedPlanId === plan.id ? <small>Current plan</small> : null}
                {plan.description ? <small>{plan.description}</small> : null}
                {typeof capacity === "number" ? (
                  <small>
                    With Roman AI Pro:{" "}
                    {capacity === -1 ? "Unlimited saved tests" : `${capacity} saved tests`}
                  </small>
                ) : null}
              </span>
              <span className="dc-subscription-plan-price">
                <strong>{money(price)}</strong>
                <small>{displayCycle === "yearly" ? "per year" : "per month"}</small>
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset className="dc-subscription-duration">
        <legend>Duration</legend>
        <div>
          {(["monthly", "yearly"] as const)
            .filter((option) => supportedCycles.includes(option))
            .map((option) => {
              const blocked =
                subscriber &&
                selectedPlanId === ownedPlanId &&
                ownedCycle === "yearly" &&
                option === "monthly";
              return (
                <label
                  key={option}
                  data-subscription-cycle-owned={
                    subscriber && selectedPlanId === ownedPlanId && ownedCycle === option
                      ? "true"
                      : undefined
                  }
                >
                  <input
                    type="radio"
                    name="subscription-cycle"
                    checked={cycle === option}
                    disabled={blocked}
                    onChange={() => onChangeCycle(option)}
                  />
                  <span>{option === "yearly" ? "Yearly" : "Monthly"}</span>
                </label>
              );
            })}
        </div>
      </fieldset>
      {allowance ? (
        <details className="dc-subscription-disclosure" data-plan-ai-allowance>
          <summary>AI usage limits for this plan</summary>
          <p className="dc-subscription-note">
            These limits apply when Roman AI Pro is included or selected.
          </p>
          <dl className="dc-subscription-totals">
            {typeof allowance.dailyTokenBudget === "number" ? (
              <div>
                <dt>Daily tokens</dt>
                <dd>
                  {allowance.dailyTokenBudget < 0
                    ? "Unlimited"
                    : allowance.dailyTokenBudget.toLocaleString("en-IN")}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Daily AI tests</dt>
              <dd>
                {allowance.dailyGenerationLimit === 0
                  ? "Unlimited"
                  : allowance.dailyGenerationLimit}
              </dd>
            </div>
          </dl>
          <p className="dc-subscription-note">
            Daily allowances reset at your local midnight. Failed or cancelled requests are not
            counted.
            {allowance.costBudgetMicros >= 0
              ? " A fair-use cost cap also applies to this term."
              : ""}
          </p>
        </details>
      ) : null}
      {subscriber && selectedPlanId === ownedPlanId && ownedCycle === "yearly" ? (
        <p className="dc-subscription-note">
          An active yearly membership cannot switch to monthly.
        </p>
      ) : null}
    </section>
  );
}
