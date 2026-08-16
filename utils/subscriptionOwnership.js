// utils/subscriptionOwnership.js
//
// Duplicate-purchase rules for subscriptions.
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
//     types", so switching either one is still a legitimate purchase.
//   * An owned selection is BLOCKED (not purchasable) until the membership
//     enters its renewal window — the final `RENEWAL_WINDOW_DAYS` days before
//     expiry — or has expired. That keeps deliberate renewals working while
//     making an accidental double purchase impossible.
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
 *   blocked          — the purchase must be refused
 *   code / reason    — machine + human explanation when blocked
 */
export const evaluateSubscriptionSelection = ({
  record,
  planId,
  cycle,
  now = Date.now(),
  renewalWindowDays = RENEWAL_WINDOW_DAYS,
} = {}) => {
  const owned = normaliseOwnedSubscription(record);
  const active = isOwnedSubscriptionActive(record, now);
  const isSameSelection = matchesOwnedSelection(record, { planId, cycle });
  const isOwned = Boolean(active && isSameSelection);
  const opensAt = renewalOpensAt(record, renewalWindowDays);
  const renewalEligible = isOwned ? now >= opensAt : true;
  const blocked = isOwned && !renewalEligible;
  const daysRemaining = daysUntilExpiry(record, now);

  return {
    active,
    owned: isOwned,
    renewalEligible,
    blocked,
    planId: owned ? owned.planId : null,
    cycle: owned ? owned.cycle : null,
    expiresAt: owned ? owned.expiresAt : 0,
    daysRemaining,
    renewalOpensAt: opensAt,
    code: blocked ? ALREADY_ACTIVE_CODE : null,
    reason: blocked
      ? `You already have an active ${normaliseCycle(cycle) === "yearly" ? "yearly" : "monthly"} membership on this plan. You can renew it in the last ${renewalWindowDays} days before it ends.`
      : null,
  };
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
 */
export const resolveSubscribeCta = ({ state, loading = false, hasPlan = true, freeSelection = false } = {}) => {
  if (loading) return { label: "Processing…", tone: "default", disabled: true, owned: false };
  if (state && state.owned) {
    return {
      label: state.renewalEligible ? "Subscribed · Renew" : "Subscribed",
      tone: "owned",
      disabled: !state.renewalEligible,
      owned: true,
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
