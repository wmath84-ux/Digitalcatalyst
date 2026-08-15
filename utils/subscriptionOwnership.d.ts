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
  blocked: boolean;
  planId: string | null;
  cycle: OwnedBillingCycle | null;
  expiresAt: number;
  daysRemaining: number;
  renewalOpensAt: number;
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

export interface SubscribeCta {
  label: string;
  tone: "default" | "owned";
  disabled: boolean;
  owned: boolean;
}

export declare const RENEWAL_WINDOW_DAYS: number;
export declare const ALREADY_ACTIVE_CODE: string;

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
  now?: number;
  renewalWindowDays?: number;
}) => SubscriptionSelectionState;

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
}) => SubscribeCta;

declare const _default: typeof evaluateSubscriptionSelection;
export default _default;
