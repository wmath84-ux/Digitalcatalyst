// utils/subscriptionOwnership.js
//
// Duplicate-purchase rules for subscriptions — including UPGRADES.
//
// Problem this solves: a member who already owns (say) "Premium · yearly"
// could re-open the subscription page, pick that exact same plan + cycle and
// pay for it a second time. Nothing on the page told them they already owned
// it, so the money was taken and the only visible effect was a silently
// extended expiry date.
//
// The rule implemented here is deliberately narrow:
//
//   * A selection is OWNED when the buyer has an active (non-expired)
//     subscription whose planId AND billing cycle both match the selection.
//     Basic/Premium/Pro and monthly/yearly are all distinct "subscription
//     types", so switching to ANY other plan (or cycle) is always a
//     legitimate upgrade / downgrade purchase.
//   * An owned selection is BLOCKED (not purchasable) until the membership
//     enters its renewal window — the final `RENEWAL_WINDOW_DAYS` days before
//     expiry — or has expired. That keeps deliberate renewals working while
//     making an accidental double purchase impossible.
//   * ADD-ON UPGRADE exception: when the selection keeps the owned plan +
//     cycle but adds at least one feature or product the membership does NOT
//     already include, the selection is purchasable right away. The buyer is
//     only charged for the NEW items (the plan price is not charged again and
//     the expiry does not move) — this is the mechanism that lets an admin
//     price an extra feature/course cheaper inside the member's own plan so
//     upgrading costs less than buying the item separately.
//
// The client uses these helpers to render the "already active" state and to
// disable the subscribe button; the quote endpoint uses the very same helpers
// to refuse the order server-side, so the guard cannot be bypassed by editing
// the page state.
//
// Pure functions only: no React, no Firestore. The Node test runner imports
// this module directly.

import { toMillis } from "./subscriptionRenewal.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many days before expiry a member may renew the plan they already own.
 * Outside this window the same plan + cycle cannot be bought again.
 */
export const RENEWAL_WINDOW_DAYS = 7;

/** Error code returned when a duplicate purchase is refused. */
export const ALREADY_ACTIVE_CODE = "SUBSCRIPTION_ALREADY_ACTIVE";

/** Error code returned when a plan / cycle downgrade is refused. */
export const DOWNGRADE_CODE = "SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED";

const toStringArray = (value) =>
  Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];

const normaliseCycle = (value) => (String(value || "") === "yearly" ? "yearly" : "monthly");

/**
 * Coerce a stored `users/{uid}/subscription/current` document into the small,
 * predictable shape the rules below reason about. Returns null when there is
 * no usable record at all.
 */
export const normaliseOwnedSubscription = (record) => {
  if (!record || typeof record !== "object") return null;
  const planId = String(record.planId || "").trim();
  if (!planId) return null;
  return {
    planId,
    cycle: normaliseCycle(record.cycle),
    status: String(record.status || "active"),
    featureIds: toStringArray(record.features),
    productIds: toStringArray(record.includedProductIds),
    expiresAt: toMillis(record.expiresAt),
  };
};

/** True when the stored record is active and has not yet expired. */
export const isOwnedSubscriptionActive = (record, now = Date.now()) => {
  const owned = normaliseOwnedSubscription(record);
  if (!owned) return false;
  return owned.status === "active" && owned.expiresAt > now;
};

/** True when the selection targets exactly the plan + cycle already owned. */
export const matchesOwnedSelection = (record, selection = {}) => {
  const owned = normaliseOwnedSubscription(record);
  if (!owned) return false;
  const planId = String(selection.planId || "").trim();
  if (!planId) return false;
  return owned.planId === planId && owned.cycle === normaliseCycle(selection.cycle);
};

/**
 * Whole days left before expiry, rounded up so "20 hours left" reads as 1.
 * Negative once the membership has ended.
 */
export const daysUntilExpiry = (record, now = Date.now()) => {
  const owned = normaliseOwnedSubscription(record);
  if (!owned || !owned.expiresAt) return 0;
  const diff = owned.expiresAt - now;
  return diff >= 0 ? Math.ceil(diff / DAY_MS) : -Math.ceil(Math.abs(diff) / DAY_MS);
};

/** Timestamp at which renewing the owned plan becomes possible again. */
export const renewalOpensAt = (record, renewalWindowDays = RENEWAL_WINDOW_DAYS) => {
  const owned = normaliseOwnedSubscription(record);
  if (!owned || !owned.expiresAt) return 0;
  return owned.expiresAt - Math.max(0, Number(renewalWindowDays) || 0) * DAY_MS;
};

/**
 * The single decision function every surface calls.
 *
 * Returns:
 *   active           — the buyer currently holds an active membership
 *   owned            — the selection is that exact membership (plan + cycle)
 *   renewalEligible  — the owned selection may be renewed right now
 *   addOnPurchase    — same plan + cycle, but the selection adds at least one
 *                      feature / product the membership does not have yet.
 *                      Purchasable immediately; only the NEW items are charged.
 *   blocked          — the purchase must be refused
 *   code / reason    — machine + human explanation when blocked
 */
export const evaluateSubscriptionSelection = ({
  record,
  planId,
  cycle,
  featureIds = [],
  productIds = [],
  now = Date.now(),
  renewalWindowDays = RENEWAL_WINDOW_DAYS,
} = {}) => {
  const owned = normaliseOwnedSubscription(record);
  const active = isOwnedSubscriptionActive(record, now);
  const isSameSelection = matchesOwnedSelection(record, { planId, cycle });
  const isOwned = Boolean(active && isSameSelection);
  const opensAt = renewalOpensAt(record, renewalWindowDays);
  const renewalEligible = isOwned ? now >= opensAt : true;

  // Add-on upgrade detection: the selection must keep the owned plan + cycle
  // AND include something the current membership does not already unlock.
  const selectedFeatureIds = toStringArray(featureIds);
  const selectedProductIds = toStringArray(productIds);
  const ownedFeatureIds = new Set(owned ? owned.featureIds : []);
  const ownedProductIds = new Set(owned ? owned.productIds : []);
  const newFeatureIds = selectedFeatureIds.filter((id) => !ownedFeatureIds.has(id));
  const newProductIds = selectedProductIds.filter((id) => !ownedProductIds.has(id));
  const addOnPurchase = Boolean(isOwned && (newFeatureIds.length > 0 || newProductIds.length > 0));

  const blocked = isOwned && !renewalEligible && !addOnPurchase;
  const daysRemaining = daysUntilExpiry(record, now);

  return {
    active,
    owned: isOwned,
    renewalEligible,
    addOnPurchase,
    blocked,
    planId: owned ? owned.planId : null,
    cycle: owned ? owned.cycle : null,
    expiresAt: owned ? owned.expiresAt : 0,
    daysRemaining,
    renewalOpensAt: opensAt,
    newFeatureIds,
    newProductIds,
    code: blocked ? ALREADY_ACTIVE_CODE : null,
    reason: blocked
      ? `You already have an active ${normaliseCycle(cycle) === "yearly" ? "yearly" : "monthly"} membership on this plan. You can renew it in the last ${renewalWindowDays} days before it ends.`
      : null,
  };
};

/**
 * The NO-DOWNGRADE rule.
 *
 * While a membership is active the buyer can only ever move UP the ladder,
 * never down:
 *
 *   * A member on a higher plan (e.g. Premium, sortOrder 1) can never buy a
 *     lower plan (Basic, sortOrder 0) in either cycle — they may buy a higher
 *     plan (Pro, sortOrder 2) on EITHER cycle.
 *   * A member on the YEARLY cycle of a plan cannot switch to the MONTHLY
 *     cycle of that same plan until the yearly membership ends. The reverse
 *     (monthly → yearly on the same plan) is an upgrade and stays allowed.
 *   * Once the membership has expired the rule lifts entirely — any plan and
 *     any cycle can be bought again.
 *
 * Plan ranking is supplied by the caller as plain sort orders
 * (`ownedPlanOrder` / `selectedPlanOrder`): the client ranks from the loaded
 * catalog's `sortOrder`, the server from the live `subscriptionPlans` docs.
 * When either rank is unknown (plan deleted / deactivated) the function
 * refuses to guess and does NOT block — the duplicate-purchase guard above
 * still applies.
 *
 * Returns:
 *   active    — the buyer currently holds an active membership
 *   downgrade — the selection is a forbidden downgrade while active
 *   upgrade   — the selection is a legitimate move to a higher plan / cycle
 *   blocked   — the purchase must be refused (same value as `downgrade`)
 *   code / reason — machine + human explanation when blocked
 */
export const evaluatePlanChange = ({
  record,
  planId,
  cycle,
  ownedPlanOrder = null,
  selectedPlanOrder = null,
  now = Date.now(),
} = {}) => {
  const owned = normaliseOwnedSubscription(record);
  const active = isOwnedSubscriptionActive(record, now);
  const base = {
    active,
    downgrade: false,
    upgrade: false,
    blocked: false,
    code: null,
    reason: null,
    ownedPlanId: owned ? owned.planId : null,
    ownedCycle: owned ? owned.cycle : null,
  };
  if (!active || !owned) return base;
  const selectedPlanId = String(planId || "").trim();
  if (!selectedPlanId) return base;
  const selectedCycle = normaliseCycle(cycle);

  // Same plan: only the cycle can move. Yearly → monthly while the yearly
  // membership is active is a downgrade; monthly → yearly is an upgrade;
  // same cycle is the OWNED selection (handled by the guard above).
  if (owned.planId === selectedPlanId) {
    if (owned.cycle === "yearly" && selectedCycle === "monthly") {
      return {
        ...base,
        downgrade: true,
        blocked: true,
        code: DOWNGRADE_CODE,
        reason:
          "Your yearly membership is still active, so you can't switch to the monthly cycle of the same plan. You can renew yearly, add features, or move up to a higher plan.",
      };
    }
    if (owned.cycle === "monthly" && selectedCycle === "yearly") {
      return { ...base, upgrade: true };
    }
    return base;
  }

  // Different plans: rank them. A lower rank is a smaller plan.
  const ownedOrder = Number(ownedPlanOrder);
  const selectedOrder = Number(selectedPlanOrder);
  if (!Number.isFinite(ownedOrder) || !Number.isFinite(selectedOrder)) return base;
  if (selectedOrder < ownedOrder) {
    return {
      ...base,
      downgrade: true,
      blocked: true,
      code: DOWNGRADE_CODE,
      reason:
        "You already have a higher plan active. Downgrading to a lower plan isn't possible while your membership is active — you can upgrade to an even higher plan anytime.",
    };
  }
  if (selectedOrder > ownedOrder) return { ...base, upgrade: true };
  // Same rank but a different plan id: treat as a sideways move, allowed.
  return base;
};

/**
 * View-model for the "you already own this" card. Keeps the copy and the
 * feature/product lists in one place so the page and any future surface
 * (profile, admin preview) stay in sync.
 */
export const buildOwnedPlanSummary = ({
  record,
  planName = "",
  features = [],
  productTitles = [],
  now = Date.now(),
  renewalWindowDays = RENEWAL_WINDOW_DAYS,
} = {}) => {
  const owned = normaliseOwnedSubscription(record);
  if (!owned) return null;
  const ownedFeatureIds = new Set(owned.featureIds);
  const state = evaluateSubscriptionSelection({
    record,
    planId: owned.planId,
    cycle: owned.cycle,
    now,
    renewalWindowDays,
  });
  const days = state.daysRemaining;
  return {
    planId: owned.planId,
    planName: String(planName || owned.planId),
    cycle: owned.cycle,
    cycleLabel: owned.cycle === "yearly" ? "Yearly" : "Monthly",
    expiresAt: owned.expiresAt,
    daysRemaining: days,
    remainingLabel: days > 1 ? `${days} days left` : days === 1 ? "1 day left" : "Ends today",
    renewalEligible: state.renewalEligible,
    renewalOpensAt: state.renewalOpensAt,
    features: (Array.isArray(features) ? features : []).filter((feature) =>
      ownedFeatureIds.has(String(feature && feature.id)),
    ),
    featureCount: ownedFeatureIds.size,
    productTitles: (Array.isArray(productTitles) ? productTitles : []).map(String),
  };
};

/**
 * Label / colour intent / disabled flag for the sticky bottom button. The
 * "owned" tone is what the page renders in emerald instead of violet so the
 * colour itself communicates that the plan is already subscribed.
 *
 * Add-on upgrades: when the member keeps their plan + cycle but adds new
 * features / products, the CTA reads "Upgrade my membership" so it is clear
 * only the NEW items will be charged (the server re-verifies the same rule).
 */
export const resolveSubscribeCta = ({ state, loading = false, hasPlan = true, freeSelection = false } = {}) => {
  if (loading) return { label: "Processing…", tone: "default", disabled: true, owned: false };
  if (state && state.addOnPurchase && !state.blocked) {
    return {
      label: "Upgrade my membership",
      tone: "upgrade",
      disabled: !hasPlan,
      owned: false,
    };
  }
  if (state && state.owned) {
    return {
      label: state.renewalEligible ? "Subscribed · Renew" : "Subscribed",
      tone: "owned",
      disabled: !state.renewalEligible,
      owned: true,
    };
  }
  // Downgrade-blocked selection (lower plan, or yearly → monthly on the same
  // plan while that yearly membership is active): the CTA must be disabled
  // and say so, instead of advertising a Razorpay payment that the server
  // would refuse anyway.
  if (state && state.blocked) {
    return {
      label: "Downgrade not allowed",
      tone: "blocked",
      disabled: true,
      owned: false,
    };
  }
  // Zero-price selection (admin set the plan price — and every selected
  // add-on — to ₹0): nothing is charged, so the CTA must not promise a
  // Razorpay payment. The server still verifies the ₹0 total and issues
  // the same entitlements through the free-order path.
  if (freeSelection) {
    return {
      label: "Activate free subscription",
      tone: "default",
      disabled: !hasPlan,
      owned: false,
    };
  }
  return {
    label: "Subscribe via Razorpay",
    tone: "default",
    disabled: !hasPlan,
    owned: false,
  };
};

export default evaluateSubscriptionSelection;
