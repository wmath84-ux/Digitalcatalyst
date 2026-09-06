// api/_lib/subscriptionGate.ts
//
// Server-side reader for the `settings/subscriptionGate` document. The
// shape is the same one the admin client writes. The reader always
// returns a fully-populated object with safe defaults so callers never
// have to deal with undefined branches.
//
// The defaults are intentionally "do nothing" — a fresh database (no
// settings document) behaves EXACTLY like the legacy gate, which is the
// only behaviour the current test suite assumes.
//
// All readers in the rest of the codebase (`accessSnapshot`, the
// subscription page plan picker, the rail filter) call this helper
// instead of reading the Firestore doc directly so the cache + the
// shape normalisation stay in one place.

import { adminDb } from "./firebaseAdmin.js";

export type SubscriptionGateDurationFlags = {
  monthly: boolean;
  yearly: boolean;
  lifetime: boolean;
};

export type SubscriptionGateFeatureRow = {
  // The admin's per-feature override.
  // - `gated: true` means the new hide-logic is ON for this feature
  //   (independent of the global kill switch, so the admin can stage
  //   features one by one).
  // - `durations` controls which billing cycles are visible to
  //   non-subscribers on the public pricing cards.
  // - `tiers` is the per-plan toggle (e.g. hide Revision on the free
  //   trial plan).
  // - `hideFromNonSubscribers: true` mirrors the per-feature
  //   `visibilityMode === "hide"` flag — it tells the rail and the
  //   catalog to remove the feature entirely.
  gated: boolean;
  durations: SubscriptionGateDurationFlags;
  tiers: Record<string, boolean>;
  hideFromNonSubscribers: boolean;
};

export type SubscriptionGatePlanRow = {
  // Per-plan visibility: `visible: false` removes the plan from the
  // picker for guests / non-subscribers; `visibleToSubscribers: false`
  // hides it from users who already have an active subscription.
  // `durations` overrides which cycles are shown.
  visible: boolean;
  visibleToSubscribers: boolean;
  durations: SubscriptionGateDurationFlags;
};

export type SubscriptionGateSettings = {
  // The global kill switch. `oldGateEnabled` is the legacy "paywall on
  // access" behaviour — it stays ON by default so a fresh database
  // behaves like before.
  oldGateEnabled: boolean;
  // The new "hide until purchased" model — OFF by default. Admin
  // flips it ON per feature via `features[key].gated` (or globally
  // here).
  hideUntilPurchasedEnabled: boolean;
  // Per-feature overrides (key matches the feature doc id, e.g.
  // "myday", "revision").
  features: Record<string, SubscriptionGateFeatureRow>;
  // Per-plan overrides (key matches the plan doc id).
  planVisibility: Record<string, SubscriptionGatePlanRow>;
  // Subscriber-only override prices, indexed by plan id. The price
  // resolver ONLY returns the override when the caller's subscription
  // is active — so a non-subscriber never sees the discounted value
  // even via direct network inspection.
  subscriberPricing: Record<string, {
    monthly: number | null;
    yearly: number | null;
    lifetime: number | null;
  }>;
  // Per-plan usage limit overrides. Currently only AI questions per
  // day is used; future metrics join the same shape.
  usageLimits: {
    aiQuestionsPerDay: Record<string, number>;
  };
  updatedAt: number | null;
};

export const SUBSCRIPTION_GATE_DEFAULTS: SubscriptionGateSettings = {
  oldGateEnabled: true,
  hideUntilPurchasedEnabled: false,
  features: {},
  planVisibility: {},
  subscriberPricing: {},
  usageLimits: { aiQuestionsPerDay: {} },
  updatedAt: null,
};

function normaliseDurationFlags(input: any, fallback: SubscriptionGateDurationFlags): SubscriptionGateDurationFlags {
  if (!input || typeof input !== "object") return { ...fallback };
  return {
    monthly: Boolean(input.monthly ?? fallback.monthly),
    yearly: Boolean(input.yearly ?? fallback.yearly),
    lifetime: Boolean(input.lifetime ?? fallback.lifetime),
  };
}

function normaliseFeatureRow(input: any): SubscriptionGateFeatureRow {
  const durations = normaliseDurationFlags(input?.durations, { monthly: true, yearly: true, lifetime: true });
  const tiers: Record<string, boolean> = {};
  if (input?.tiers && typeof input.tiers === "object") {
    for (const [k, v] of Object.entries(input.tiers)) tiers[k] = Boolean(v);
  }
  return {
    gated: Boolean(input?.gated),
    durations,
    tiers,
    hideFromNonSubscribers: Boolean(input?.hideFromNonSubscribers),
  };
}

function normalisePlanRow(input: any): SubscriptionGatePlanRow {
  const durations = normaliseDurationFlags(input?.durations, { monthly: true, yearly: true, lifetime: true });
  return {
    visible: input?.visible === false ? false : true,
    visibleToSubscribers: input?.visibleToSubscribers === false ? false : true,
    durations,
  };
}

function normalisePricingOverride(input: any) {
  return {
    monthly: input?.monthly == null || Number.isNaN(Number(input.monthly)) ? null : Number(input.monthly),
    yearly: input?.yearly == null || Number.isNaN(Number(input.yearly)) ? null : Number(input.yearly),
    lifetime: input?.lifetime == null || Number.isNaN(Number(input.lifetime)) ? null : Number(input.lifetime),
  };
}

function normaliseUsageLimits(input: any) {
  const ai: Record<string, number> = {};
  const raw = input?.aiQuestionsPerDay;
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const num = Number(v);
      if (!Number.isNaN(num) && num > 0) ai[k] = num;
    }
  }
  return { aiQuestionsPerDay: ai };
}

export async function getSubscriptionGateSettings(): Promise<SubscriptionGateSettings> {
  // Use the shared Admin Firestore instance. This helper is only called
  // inside authenticated serverless handlers, where the Admin app has
  // already been booted by `requireFirebaseUser`/`adminDb`; the indirection
  // through `adminDb()` also gives the test suite an overridable seam.
  const db = adminDb();
  const snap = await db.doc("settings/subscriptionGate").get();
  if (!snap.exists) {
    return { ...SUBSCRIPTION_GATE_DEFAULTS };
  }
  const data = (snap.data() || {}) as any;
  const features: Record<string, SubscriptionGateFeatureRow> = {};
  if (data.features && typeof data.features === "object") {
    for (const [k, v] of Object.entries(data.features)) features[k] = normaliseFeatureRow(v);
  }
  const planVisibility: Record<string, SubscriptionGatePlanRow> = {};
  if (data.planVisibility && typeof data.planVisibility === "object") {
    for (const [k, v] of Object.entries(data.planVisibility)) planVisibility[k] = normalisePlanRow(v);
  }
  const subscriberPricing: Record<string, { monthly: number | null; yearly: number | null; lifetime: number | null }> = {};
  if (data.subscriberPricing && typeof data.subscriberPricing === "object") {
    for (const [k, v] of Object.entries(data.subscriberPricing)) subscriberPricing[k] = normalisePricingOverride(v);
  }
  return {
    oldGateEnabled: data.oldGateEnabled === false ? false : true,
    hideUntilPurchasedEnabled: Boolean(data.hideUntilPurchasedEnabled),
    features,
    planVisibility,
    subscriberPricing,
    usageLimits: normaliseUsageLimits(data.usageLimits),
    updatedAt: data.updatedAt && typeof data.updatedAt === "object" && typeof data.updatedAt.toMillis === "function"
      ? data.updatedAt.toMillis()
      : (typeof data.updatedAt === "number" ? data.updatedAt : null),
  };
}

// Resolve the price the user should actually pay for a given plan +
// cycle. Returns the override when the caller's subscription is
// active, otherwise returns `basePrice`. The override is intentionally
// only consulted server-side so a non-subscriber who pokes the admin
// endpoint still cannot discover the discounted price.
export function resolveSubscriberOnlyPrice(
  planId: string,
  cycle: "monthly" | "yearly" | "lifetime",
  basePrice: number,
  isSubscriber: boolean,
  settings: SubscriptionGateSettings,
): number {
  if (!isSubscriber) return basePrice;
  const override = settings.subscriberPricing?.[planId];
  if (!override) return basePrice;
  const candidate = override[cycle];
  if (candidate == null || Number.isNaN(Number(candidate))) return basePrice;
  // Defensive: a negative or zero override is treated as "no override".
  if (Number(candidate) <= 0) return basePrice;
  return Number(candidate);
}

// Resolve the daily AI-questions cap for a given plan (or the
// feature's own cap when the admin set one). Returns `null` for
// "no cap / unlimited".
export function resolveAiQuestionsPerDay(
  planId: string | null | undefined,
  featureCap: number | null | undefined,
  settings: SubscriptionGateSettings,
): number | null {
  // The plan-level override wins when it is set (> 0). Admin can
  // express "unlimited" by removing the override entry.
  if (planId) {
    const planCap = settings.usageLimits?.aiQuestionsPerDay?.[planId];
    if (typeof planCap === "number" && planCap > 0) return planCap;
  }
  if (featureCap == null) return null;
  if (Number.isNaN(Number(featureCap))) return null;
  if (Number(featureCap) <= 0) return null;
  return Number(featureCap);
}

export function isPlanVisibleForAudience(
  planId: string,
  isSubscriber: boolean,
  settings: SubscriptionGateSettings,
  options?: { ownedPlanId?: string | null } | null,
): boolean {
  const ownedPlanId = options?.ownedPlanId ? String(options.ownedPlanId) : "";
  if (ownedPlanId && String(planId) === ownedPlanId) return true;
  const row = settings.planVisibility?.[planId];
  if (!row) return true;
  if (isSubscriber) return row.visibleToSubscribers !== false;
  return row.visible !== false;
}
