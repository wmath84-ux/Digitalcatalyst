// utils/subscriptionVisibility.d.ts
//
// Types for the shared per-cycle visibility rules (see the .js file).

export type SubscriptionVisibilityCycle = "monthly" | "yearly";

export const SUBSCRIPTION_CYCLES: SubscriptionVisibilityCycle[];

export interface VisibilityGateRow {
  gated?: boolean;
  durations?: Partial<Record<SubscriptionVisibilityCycle | "lifetime", boolean>>;
  tiers?: Record<string, boolean>;
  hideFromNonSubscribers?: boolean;
}

export interface VisibilityOptions {
  /** True for a buyer whose membership is already active. */
  isSubscriber?: boolean;
  /** `settings/subscriptionGate.features` (features) or `.planVisibility` (plans). */
  gateRows?: Record<string, VisibilityGateRow> | null;
}

export interface VisibilityFeature {
  id?: string;
  name?: string;
  active?: boolean;
  sortOrder?: number;
  visibleCycles?: SubscriptionVisibilityCycle[] | null;
  hiddenPlanIds?: string[] | null;
  /** `"hide"` removes the feature's entry points until it is purchased. */
  visibilityMode?: "gate" | "hide" | null;
}

export interface VisibilityGateSettings {
  hideUntilPurchasedEnabled?: boolean;
  features?: Record<string, VisibilityGateRow> | null;
}

export interface VisibilityPlan {
  id?: string;
  allowedCycles?: string[] | null;
  visibleCycles?: SubscriptionVisibilityCycle[] | null;
}

export function normaliseVisibleCycles(value: unknown): SubscriptionVisibilityCycle[];
export function featureVisibleCycles(feature: VisibilityFeature, options?: VisibilityOptions): SubscriptionVisibilityCycle[];
export function isFeatureHiddenForPlan(feature: VisibilityFeature, planId: string | null | undefined): boolean;
export function isFeatureVisibleForCycle(
  feature: VisibilityFeature,
  planId: string | null | undefined,
  cycle: string,
  options?: VisibilityOptions,
): boolean;
export function featuresForPlanCycle<T extends VisibilityFeature>(
  features: T[] | null | undefined,
  planId: string | null | undefined,
  cycle: string,
  options?: VisibilityOptions,
): T[];
export function isFeatureHiddenForAudience(
  feature: VisibilityFeature,
  options?: VisibilityOptions & { gateSettings?: VisibilityGateSettings | null; currentPlanId?: string | null },
): boolean;
export function planVisibleCycles(plan: VisibilityPlan, options?: VisibilityOptions): SubscriptionVisibilityCycle[];
export function isPlanVisibleForCycle(plan: VisibilityPlan, cycle: string, options?: VisibilityOptions): boolean;

export default isFeatureVisibleForCycle;
