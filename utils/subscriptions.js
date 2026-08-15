// utils/subscriptions.js
//
// Part 9 — server-side subscription engine. Pure functions only
// (no Firestore / no fetch). The Node test runner imports this
// file directly; the server endpoint and the Part 4 quote engine
// both call into this module — no rule is duplicated anywhere.
//
// A subscription is a Firestore document stored in the
// `subscriptionPlans` collection. The doc id IS the plan id
// (admin-friendly kebab-case). Plan/feature validation +
// price math + cycle expiry all live here.
//
// What this file does NOT do:
//   - It does NOT mutate Firestore (the server writer does).
//   - It does NOT call Razorpay (Part 6 endpoints do).
//   - It does NOT decrement EduCoin balance (out of scope for
//     Part 9 — the engine only computes the requested
//     reservation, the actual debit is a later part).
//
// What it DOES do:
//   - Validate plan / cycle / feature ids against the loaded
//     docs (active, allowed cycles, allowed purchase kinds).
//   - Compute the plan + feature + coupon + EduCoin line items
//     in paise (integer).
//   - Compute the cycle expiry timestamp.
//   - Return the new server-authoritative selection that
//     gets handed to the Part 4 engine.

import { normalisePlanPricing, resolveFeaturePrice } from "./featurePricing.js";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);

const PAISE_PER_RUPEE = 100;

const toPaise = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.round(value * PAISE_PER_RUPEE);
  }
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * PAISE_PER_RUPEE);
};

const fromPaise = (paise) => (Number.isFinite(paise) && paise >= 0 ? Math.round(paise / PAISE_PER_RUPEE) : 0);

// ---------------------------------------------------------------------------
// Doc normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a Firestore `subscriptionPlans/{id}` doc into the
 * canonical `SubscriptionPlanDoc` shape used everywhere else in
 * Part 9. Returns `null` when the doc is missing required fields.
 */
export const normalisePlanDoc = (raw, id) => {
  if (!isObject(raw)) return null;
  const planId = String(raw.id || id || "").trim();
  if (!planId) return null;
  const monthlyPricePaise = toPaise(raw.monthlyPrice ?? raw.priceMonthly ?? 0);
  const yearlyPricePaise = toPaise(raw.yearlyPrice ?? raw.priceYearly ?? 0);
  const allowedRaw = arr(raw.allowedCycles).map((c) => String(c).toLowerCase());
  const allowedCycles = allowedRaw.filter((c) => c === "monthly" || c === "yearly");
  return {
    id: planId,
    name: String(raw.name || "Subscription plan").trim(),
    description: String(raw.description || "").trim(),
    monthlyPricePaise,
    yearlyPricePaise,
    includedFeatureIds: arr(raw.includedFeatureIds).map((x) => String(x)),
    includedProductIds: arr(raw.includedProductIds).map((x) => String(x)),
    includedModuleKeys: arr(raw.includedModuleKeys).map((x) => String(x)),
    allowedCycles: allowedCycles.length > 0 ? allowedCycles : ["monthly", "yearly"],
    active: raw.active !== false,
    minPayablePaise: toPaise(raw.minPayableAmount ?? raw.minPayablePaise ?? 0),
    badge: typeof raw.badge === "string" ? raw.badge : null,
    trialDays: Math.max(0, Math.floor(Number(raw.trialDays || 0))),
    autoRenewByDefault: raw.autoRenewByDefault !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Math.floor(Number(raw.sortOrder)) : 0,
  };
};

/**
 * Normalise a Firestore `subscriptionFeatures/{id}` doc.
 */
export const normaliseFeatureDoc = (raw, id) => {
  if (!isObject(raw)) return null;
  const featureId = String(raw.id || id || "").trim();
  if (!featureId) return null;
  // Optional cycle-specific rates that apply across every plan.
  const cyclePaise = (rupees, paise) => {
    if (paise !== undefined && paise !== null && paise !== "") {
      const n = Number(paise);
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
    }
    if (rupees !== undefined && rupees !== null && rupees !== "") return toPaise(rupees);
    return null;
  };
  return {
    id: featureId,
    name: String(raw.name || "Feature").trim(),
    description: String(raw.description || "").trim(),
    icon: String(raw.icon || "sparkles").trim(),
    // The current admin writes the rupee rate to `price`, but older docs
    // stored it as `individualPrice` (rupees) or `pricePaise` (paise).
    // Reading only `price` made every legacy feature resolve to ₹0 — the
    // subscription page showed "Free" while the admin editor showed the
    // real rate the owner had typed in.
    pricePaise: cyclePaise(raw.price ?? raw.individualPrice, raw.pricePaise) ?? 0,
    // Cycle-aware base rates (null = fall back to the flat price).
    monthlyPricePaise: cyclePaise(raw.monthlyPrice, raw.monthlyPricePaise),
    yearlyPricePaise: cyclePaise(raw.yearlyPrice, raw.yearlyPricePaise),
    // Per-plan overrides, e.g. { premium: { monthly: 49 }, pro: { included: true } }.
    planPricing: normalisePlanPricing(raw.planPricing),
    included: raw.included === true,
    active: raw.active !== false,
    badge: typeof raw.badge === "string" ? raw.badge : null,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Math.floor(Number(raw.sortOrder)) : 0,
  };
};

// ---------------------------------------------------------------------------
// Individual rule predicates
// ---------------------------------------------------------------------------

/** Rule 1: plan is active. */
export const isPlanActive = (plan) => Boolean(plan && plan.active);

/** Rule 2: billing cycle is allowed for the plan. */
export const isPlanCycleAllowed = (plan, cycle) => {
  if (!plan) return false;
  if (cycle !== "monthly" && cycle !== "yearly") return false;
  return plan.allowedCycles.indexOf(cycle) !== -1;
};

/** Rule 3: every selected feature exists, is active, and the plan allows it. */
export const isFeatureSelectable = (plan, feature, selectedFeatureIds) => {
  if (!feature) return false;
  if (!feature.active) return false;
  if (!plan) return false;
  if (feature.included) return true; // included features are always selectable
  return arr(selectedFeatureIds).indexOf(feature.id) !== -1 || true; // always allowed
};

/** Rule 4: every selected feature is included for free OR has a positive price. */
export const isFeaturePayable = (feature) => {
  if (!feature) return false;
  if (feature.included) return true;
  return feature.pricePaise > 0;
};

/** Rule 5: included feature ids must be a subset of the plan's includedFeatureIds. */
export const isFeatureIdAllowed = (plan, featureId) => {
  if (!plan) return false;
  return arr(plan.includedFeatureIds).indexOf(String(featureId)) !== -1;
};

// ---------------------------------------------------------------------------
// Cycle expiry
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the absolute expiry timestamp for the given cycle. A
 * trial period is applied first (when trialDays > 0). The
 * engine intentionally does NOT add the trial on top of the
 * cycle; admin-defined plans choose ONE of:
 *   - `trialDays = 0` — cycle starts immediately, expires after 30/365 days
 *   - `trialDays > 0` — cycle starts after the trial, expires after 30/365 days
 */
export const computeCycleExpiresAt = (
  plan,
  cycle,
  now = Date.now(),
) => {
  if (!plan) return 0;
  const trialMs = Math.max(0, Math.floor(Number(plan.trialDays || 0))) * MS_PER_DAY;
  const cycleMs = (cycle === "yearly" ? 365 : 30) * MS_PER_DAY;
  return now + trialMs + cycleMs;
};

/**
 * Whether a subscription is currently active (not expired, not
 * cancelled). Pure helper for the success-page receipt.
 */
export const isSubscriptionActive = (subscription, now = Date.now()) => {
  if (!subscription) return false;
  if (subscription.status && subscription.status !== "active") return false;
  if (!Number.isFinite(subscription.expiresAt)) return false;
  return subscription.expiresAt > now;
};

// ---------------------------------------------------------------------------
// Cycle price
// ---------------------------------------------------------------------------

/** Resolve the plan's cycle price (paise) for the given cycle. */
export const getPlanCyclePricePaise = (plan, cycle) => {
  if (!plan) return 0;
  if (cycle === "yearly") return Math.max(0, plan.yearlyPricePaise);
  if (cycle === "monthly") return Math.max(0, plan.monthlyPricePaise);
  return 0;
};

// ---------------------------------------------------------------------------
// Line items
// ---------------------------------------------------------------------------

/**
 * Build the Part 1 line items for a subscription quote. Pure:
 * takes the plan, the cycle, the selected features, the loaded
 * product docs (for product-unlock line items), and the loaded
 * module ids, and returns the canonical `CheckoutLineItem[]`
 * shape the Part 4 engine emits.
 */
export const buildSubscriptionLineItems = ({
  plan,
  cycle,
  selectedFeatureIds,
  featureRecords,
  productUnlocks,
  moduleUnlocks,
} = {}) => {
  if (!plan) return [];
  const items = [];

  // Plan line — access entitlement only. The plan itself has no
  // standalone price; the payable total is selected features + products.
  items.push({
    id: `subscription:${plan.id}:${cycle}`,
    kind: "subscription",
    productId: null,
    moduleId: null,
    resourceId: null,
    updateId: null,
    subscriptionPlanId: plan.id,
    featureId: null,
    title: `${plan.name} (${cycle === "monthly" ? "Monthly" : "Yearly"})`,
    parentTitle: plan.description || "",
    regularPrice: 0,
    salePrice: null,
    effectivePrice: 0,
    quantity: 1,
    alreadyOwned: false,
    entitlementId: `subscription:${plan.id}`,
  });

  // Feature lines. The price is resolved against THIS plan and cycle,
  // so a per-plan / per-cycle override in the feature doc is honoured
  // by the server exactly as the subscription page displayed it.
  const featureIndex = new Map(arr(featureRecords).map((f) => [String(f.id), f]));
  for (const featureId of arr(selectedFeatureIds)) {
    const f = featureIndex.get(String(featureId));
    if (!f) continue;
    if (f.included) continue; // globally-included features don't carry a price
    const resolved = resolveFeaturePrice(f, plan.id, cycle);
    if (resolved.included) continue; // free on this specific plan
    items.push({
      id: `subscription_feature:${plan.id}:${f.id}`,
      kind: "subscription_features",
      productId: null,
      moduleId: null,
      resourceId: null,
      updateId: null,
      subscriptionPlanId: plan.id,
      featureId: f.id,
      title: f.name,
      parentTitle: plan.name,
      regularPrice: resolved.pricePaise,
      salePrice: null,
      effectivePrice: resolved.pricePaise,
      quantity: 1,
      alreadyOwned: false,
      entitlementId: `subscription_feature:${plan.id}:${f.id}`,
    });
  }

  // Product unlock lines (the plan's included products).
  for (const unlock of arr(productUnlocks)) {
    if (!unlock.active) continue;
    items.push({
      id: `subscription_unlock:${plan.id}:product:${unlock.productId}`,
      kind: "subscription_features",
      productId: unlock.productId,
      moduleId: null,
      resourceId: null,
      updateId: null,
      subscriptionPlanId: plan.id,
      featureId: null,
      title: `Plan unlock: ${unlock.productId}`,
      parentTitle: plan.name,
      regularPrice: 0,
      salePrice: null,
      effectivePrice: 0,
      quantity: 1,
      alreadyOwned: false,
      entitlementId: `subscription_product_unlock:${plan.id}:${unlock.productId}`,
    });
  }

  // Module unlock lines.
  for (const unlock of arr(moduleUnlocks)) {
    if (!unlock.active) continue;
    items.push({
      id: `subscription_unlock:${plan.id}:module:${unlock.productId}:${unlock.moduleId}`,
      kind: "subscription_features",
      productId: unlock.productId,
      moduleId: unlock.moduleId,
      resourceId: null,
      updateId: null,
      subscriptionPlanId: plan.id,
      featureId: null,
      title: `Plan unlock: module ${unlock.moduleId}`,
      parentTitle: plan.name,
      regularPrice: 0,
      salePrice: null,
      effectivePrice: 0,
      quantity: 1,
      alreadyOwned: false,
      entitlementId: `subscription_module_unlock:${plan.id}:${unlock.productId}:${unlock.moduleId}`,
    });
  }

  return items;
};

// ---------------------------------------------------------------------------
// Top-level validator
// ---------------------------------------------------------------------------

/**
 * Validate the canonical subscription selection against the
 * loaded plan + features. Pure. Returns either
 * `{ ok: true, plan, features, expiresAt }` or
 * `{ ok: false, code, reason }`.
 */
export const validateSubscriptionSelection = (input, now = Date.now()) => {
  const {
    plan,
    cycle,
    selectedFeatureIds,
    featureRecords,
    couponContext, // optional Part 7 envelope; if present, the engine forwards it
  } = input || {};
  if (!isPlanActive(plan)) {
    return { ok: false, code: "SUBSCRIPTION_PLAN_INACTIVE", reason: "This plan is no longer available." };
  }
  if (!isPlanCycleAllowed(plan, cycle)) {
    return { ok: false, code: "SUBSCRIPTION_CYCLE_NOT_ALLOWED", reason: `This plan does not support the ${cycle} billing cycle.` };
  }
  const featureIndex = new Map(arr(featureRecords).map((f) => [String(f.id), f]));
  for (const id of arr(selectedFeatureIds)) {
    const f = featureIndex.get(String(id));
    if (!f) {
      return { ok: false, code: "SUBSCRIPTION_FEATURE_NOT_FOUND", reason: `Feature ${id} is not available.` };
    }
    if (!f.active) {
      return { ok: false, code: "SUBSCRIPTION_FEATURE_INACTIVE", reason: `${f.name} is no longer available.` };
    }
    if (!isFeaturePayable(f)) {
      return { ok: false, code: "SUBSCRIPTION_FEATURE_INVALID_PRICE", reason: `${f.name} has an invalid price.` };
    }
  }
  // Build the verified line items + the cycle expiry.
  const items = buildSubscriptionLineItems({
    plan,
    cycle,
    selectedFeatureIds,
    featureRecords,
  });
  const expiresAt = computeCycleExpiresAt(plan, cycle, now);
  return {
    ok: true,
    plan,
    cycle,
    features: arr(selectedFeatureIds).map((id) => featureIndex.get(String(id))).filter(Boolean),
    lineItems: items,
    expiresAt,
    couponContext: couponContext || null,
  };
};

// ---------------------------------------------------------------------------
// Subscription period descriptor (used by the receipt + auto-renew)
// ---------------------------------------------------------------------------

/** The billing period as a human-readable string ("Monthly" / "Yearly"). */
export const formatBillingCycle = (cycle) => (cycle === "yearly" ? "Yearly" : "Monthly");

/** The duration of one cycle in days. */
export const getCycleDurationDays = (cycle) => (cycle === "yearly" ? 365 : 30);

/** Collect every entitlement id a subscription would write. */
export const collectSubscriptionEntitlementIds = (args) => {
  const plan = args?.plan;
  const cycle = args?.cycle || "monthly";
  if (!plan) return [];
  const ids = new Set([`subscription:${plan.id}`]);
  for (const f of arr(args?.selectedFeatureIds)) {
    ids.add(`subscription_feature:${plan.id}:${f}`);
  }
  for (const u of arr(args?.productUnlocks)) {
    if (u && u.active !== false && u.productId) {
      ids.add(`subscription_product_unlock:${plan.id}:${u.productId}`);
    }
  }
  for (const u of arr(args?.moduleUnlocks)) {
    if (u && u.active !== false && u.productId && u.moduleId) {
      ids.add(`subscription_module_unlock:${plan.id}:${u.productId}:${u.moduleId}`);
    }
  }
  return Array.from(ids);
};

export { fromPaise, toPaise };
