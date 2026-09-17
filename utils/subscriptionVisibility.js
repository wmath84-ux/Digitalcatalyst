// utils/subscriptionVisibility.js
//
// ONE rule for "is this feature / plan shown for this billing cycle?" — shared
// by the subscription page and by the server that prices and validates the
// purchase. Before this file the admin could set per-cycle visibility
// (`feature.visibleCycles`, `plan.visibleCycles`, `hiddenPlanIds`, and the
// `settings/subscriptionGate` duration matrix) but neither the page nor the
// quote engine read it: switching Monthly ↔ Yearly left the feature table
// unchanged, and a hidden feature could still be bought by calling the API.
//
// Resolution order for a feature (first rule that speaks wins):
//   1. `feature.hiddenPlanIds` — the feature is removed from that plan outright
//      (both cycles, everyone), which is what the admin panel promises.
//   2. For a NON-subscriber only, `feature.visibleCycles` — the cycles the
//      feature may be offered on. A member who already paid keeps every cycle.
//   3. For a NON-subscriber only, the gate matrix
//      `settings/subscriptionGate.features[<id>].durations` — the same idea,
//      staged per feature by the admin's kill switch.
// Anything unset means "visible" (a fresh database behaves exactly as before).
//
// Plans use the same idea: `plan.visibleCycles` (+ the gate's
// `planVisibility[id].durations`) lists the cycles a NON-subscriber may pick.
//
// Pure: no Firestore, no React, so the Node tests import it directly and both
// sides of the wire resolve identically.

export const SUBSCRIPTION_CYCLES = ["monthly", "yearly"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Normalise an admin `visibleCycles` field. Invalid or empty input means
 * "both cycles" — never "none", which would silently hide a paid feature.
 */
export const normaliseVisibleCycles = (value) => {
  const list = asArray(value)
    .map((cycle) => String(cycle).toLowerCase())
    .filter((cycle) => SUBSCRIPTION_CYCLES.indexOf(cycle) !== -1);
  return list.length > 0 ? Array.from(new Set(list)) : SUBSCRIPTION_CYCLES.slice();
};

/** The duration flags on a gate row, or null when the row says nothing. */
const gateDurations = (gateRow) => {
  if (!isObject(gateRow)) return null;
  if (!isObject(gateRow.durations)) return null;
  const flags = gateRow.durations;
  const known = SUBSCRIPTION_CYCLES.filter((cycle) => flags[cycle] !== undefined);
  if (known.length === 0) return null;
  return known.filter((cycle) => flags[cycle] !== false);
};

/**
 * The cycles a feature may be offered on for this buyer.
 * `isSubscriber: true` skips the per-cycle rules entirely — an existing member
 * is never retro-locked out of what they already pay for.
 */
export const featureVisibleCycles = (feature, options = {}) => {
  if (!isObject(feature)) return [];
  const isSubscriber = options.isSubscriber === true;
  if (isSubscriber) return SUBSCRIPTION_CYCLES.slice();
  const gate = gateDurations(isObject(options.gateRows) ? options.gateRows[String(feature.id)] : null);
  if (gate) return gate;
  if (feature.visibleCycles === undefined && feature.visibleCycles === null) return SUBSCRIPTION_CYCLES.slice();
  if (Array.isArray(feature.visibleCycles) && feature.visibleCycles.length === 0) return SUBSCRIPTION_CYCLES.slice();
  return normaliseVisibleCycles(feature.visibleCycles);
};

/** True when the admin removed this feature from the given plan outright. */
export const isFeatureHiddenForPlan = (feature, planId) => {
  if (!isObject(feature) || !planId) return false;
  return asArray(feature.hiddenPlanIds).map(String).indexOf(String(planId)) !== -1;
};

/** May this feature be shown on this plan + cycle for this buyer? */
export const isFeatureVisibleForCycle = (feature, planId, cycle, options = {}) => {
  if (!isObject(feature)) return false;
  if (isFeatureHiddenForPlan(feature, planId)) return false;
  return featureVisibleCycles(feature, options).indexOf(String(cycle)) !== -1;
};

/**
 * Filter + sort the catalog for one plan and cycle. This is what the page
 * renders (table rows, tiers, picker) and what the server validates against,
 * so the two can never disagree.
 */
export const featuresForPlanCycle = (features, planId, cycle, options = {}) =>
  asArray(features)
    .filter((feature) => isObject(feature) && feature.active !== false)
    .filter((feature) => isFeatureVisibleForCycle(feature, planId, cycle, options))
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name)));

/**
 * The audience rule for the "hide until purchased" model. A NON-subscriber
 * loses the feature's entry points (rail, home grid, catalog) when the admin
 * turned the model on for that feature — the per-doc `visibilityMode: "hide"`,
 * the global `settings/subscriptionGate.hideUntilPurchasedEnabled` switch, the
 * per-feature `gated` flag, or its `hideFromNonSubscribers` mirror. A
 * subscriber always keeps what they paid for.
 *
 * `tiers[<currentPlanId>]` narrows the model to one plan: `false` keeps the
 * feature visible on that plan even while the model is on, `true` hides it
 * there. The gate is the only place with per-plan granularity, so it wins for
 * the plan it names.
 *
 * This is the same rule `api/_lib/myDay.ts` applies server-side — kept here so
 * every surface (My Day, Roman AI Pro, the store) reads one implementation.
 */
export const isFeatureHiddenForAudience = (feature, options = {}) => {
  if (!isObject(feature)) return false;
  if (options.isSubscriber === true) return false;
  const gate = isObject(options.gateSettings) ? options.gateSettings : {};
  const row = isObject(gate.features) ? gate.features[String(feature.id)] : null;
  const rowOn = isObject(row) && (row.gated === true || row.hideFromNonSubscribers === true);
  const planTier = isObject(row) && isObject(row.tiers) && options.currentPlanId
    ? row.tiers[String(options.currentPlanId)]
    : undefined;
  if (
    feature.visibilityMode !== "hide"
    && gate.hideUntilPurchasedEnabled !== true
    && !rowOn
    && planTier !== true
  ) return false;
  const planId = options.currentPlanId === undefined || options.currentPlanId === null
    ? ""
    : String(options.currentPlanId);
  if (planId && isObject(row) && isObject(row.tiers)) {
    // An explicit per-plan answer is the most specific thing the admin can
    // say, so it wins over the feature-wide flags — in both directions.
    if (row.tiers[planId] === true) return true;
    if (row.tiers[planId] === false) return false;
  }
  return true;
};

/**
 * The cycles a plan may be sold on for this buyer.
 * `plan.allowedCycles` is the hard rule (it also gates the quote); the admin's
 * visibility list only narrows what a non-subscriber is offered.
 */
export const planVisibleCycles = (plan, options = {}) => {
  if (!isObject(plan)) return [];
  const allowed = asArray(plan.allowedCycles)
    .map((cycle) => String(cycle).toLowerCase())
    .filter((cycle) => SUBSCRIPTION_CYCLES.indexOf(cycle) !== -1);
  const hardRule = allowed.length > 0 ? allowed : SUBSCRIPTION_CYCLES.slice();
  if (options.isSubscriber === true) return hardRule;
  const gate = gateDurations(isObject(options.gateRows) ? options.gateRows[String(plan.id)] : null);
  const offered = gate || (Array.isArray(plan.visibleCycles) && plan.visibleCycles.length === 0
    ? SUBSCRIPTION_CYCLES.slice()
    : normaliseVisibleCycles(plan.visibleCycles));
  return hardRule.filter((cycle) => offered.indexOf(cycle) !== -1);
};

/** Is this plan sellable on this cycle for this buyer? */
export const isPlanVisibleForCycle = (plan, cycle, options = {}) =>
  planVisibleCycles(plan, options).indexOf(String(cycle)) !== -1;

export default isFeatureVisibleForCycle;
