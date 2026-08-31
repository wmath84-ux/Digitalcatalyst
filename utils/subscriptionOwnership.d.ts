// utils/subscriptionOwnership.d.ts
//
// Types for the pure duplicate-purchase helpers in `subscriptionOwnership.js`.

export type OwnedBillingCycle = "monthly" | "yearly";

export interface OwnedSubscription {
  planId: string;
  cycle: OwnedBillingCycle;
  status: string;
  featureIds: string[];
  productIds: string[];
  expiresAt: number;
}

export interface SubscriptionSelectionState {
  active: boolean;
  owned: boolean;
  renewalEligible: boolean;
  /** Same plan + cycle plus at least one new feature / product: purchasable add-on upgrade. */
  addOnPurchase: boolean;
  blocked: boolean;
  planId: string | null;
  cycle: OwnedBillingCycle | null;
  expiresAt: number;
  daysRemaining: number;
  renewalOpensAt: number;
  /** Features the current membership does not already unlock (empty unless addOnPurchase). */
  newFeatureIds: string[];
  /** Products the current membership does not already unlock (empty unless addOnPurchase). */
  newProductIds: string[];
  /**
   * Feature ids the ACTIVE membership already unlocks (paid with the current
   * plan, or free on the current plan/cycle). These are never charged again —
   * even when the buyer switches to a higher plan — but they stay granted.
   */
  ownedFeatureIds: string[];
  /**
   * Product ids the ACTIVE membership already unlocks. Same carry-over rule
   * as `ownedFeatureIds`: never charged twice, always kept.
   */
  ownedProductIds: string[];
  code: string | null;
  reason: string | null;
}

export interface OwnedPlanSummaryFeature {
  id: string;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface OwnedPlanSummary<F = OwnedPlanSummaryFeature> {
  planId: string;
  planName: string;
  cycle: OwnedBillingCycle;
  cycleLabel: string;
  expiresAt: number;
  daysRemaining: number;
  remainingLabel: string;
  renewalEligible: boolean;
  renewalOpensAt: number;
  features: F[];
  featureCount: number;
  productTitles: string[];
}

export interface PlanChangeState {
  /** The buyer currently holds an active, unexpired membership. */
  active: boolean;
  /** The selection is a forbidden downgrade while the membership is active. */
  downgrade: boolean;
  /** The selection is a legitimate move to a higher plan / longer cycle. */
  upgrade: boolean;
  /** The purchase must be refused (same value as `downgrade`). */
  blocked: boolean;
  code: string | null;
  reason: string | null;
  ownedPlanId: string | null;
  ownedCycle: OwnedBillingCycle | null;
}

export interface SubscribeCta {
  label: string;
  tone: "default" | "owned" | "upgrade" | "blocked";
  disabled: boolean;
  owned: boolean;
}

export declare const RENEWAL_WINDOW_DAYS: number;
export declare const ALREADY_ACTIVE_CODE: string;
export declare const DOWNGRADE_CODE: string;

export declare const normaliseOwnedSubscription: (record: unknown) => OwnedSubscription | null;
export declare const isOwnedSubscriptionActive: (record: unknown, now?: number) => boolean;
export declare const matchesOwnedSelection: (
  record: unknown,
  selection?: { planId?: string | null; cycle?: string | null },
) => boolean;
export declare const daysUntilExpiry: (record: unknown, now?: number) => number;
export declare const renewalOpensAt: (record: unknown, renewalWindowDays?: number) => number;

export declare const evaluateSubscriptionSelection: (input?: {
  record?: unknown;
  planId?: string | null;
  cycle?: string | null;
  /** Selected feature ids (used to detect add-on upgrades). */
  featureIds?: string[];
  /** Selected product ids (used to detect add-on upgrades). */
  productIds?: string[];
  now?: number;
  renewalWindowDays?: number;
}) => SubscriptionSelectionState;

/**
 * The no-downgrade rule: while a membership is active the buyer can only move
 * UP (higher plan, or monthly → yearly on the same plan), never DOWN (lower
 * plan, or yearly → monthly on the same plan). Plan ranking is supplied by
 * the caller as plain sort orders; unknown ranks never block.
 */
export declare const evaluatePlanChange: (input?: {
  record?: unknown;
  planId?: string | null;
  cycle?: string | null;
  /** Sort order of the plan the buyer currently owns (higher = bigger plan). */
  ownedPlanOrder?: number | null;
  /** Sort order of the plan being considered. */
  selectedPlanOrder?: number | null;
  now?: number;
}) => PlanChangeState;

export declare const buildOwnedPlanSummary: <F extends { id: string }>(input?: {
  record?: unknown;
  planName?: string;
  features?: F[];
  productTitles?: string[];
  now?: number;
  renewalWindowDays?: number;
}) => OwnedPlanSummary<F> | null;

export declare const resolveSubscribeCta: (input?: {
  state?: SubscriptionSelectionState | null;
  loading?: boolean;
  hasPlan?: boolean;
  /** True when the verified total is ₹0 — the CTA switches to the free-activation label. */
  freeSelection?: boolean;
}) => SubscribeCta;

declare const _default: typeof evaluateSubscriptionSelection;
export default _default;
