// utils/featurePricing.d.ts
//
// Types for the pure plan/cycle-aware feature pricing helpers.

export type FeatureBillingCycle = "monthly" | "yearly";

export interface FeaturePlanOverride {
  included: boolean;
  monthlyPaise: number | null;
  yearlyPaise: number | null;
  flatPaise: number | null;
}

export interface ResolvedFeaturePrice {
  pricePaise: number;
  included: boolean;
  source: string;
}

export interface ResolvedFeature {
  id: string;
  name: string;
  description: string;
  icon: string;
  pricePaise: number;
  included: boolean;
  active: boolean;
  badge: string | null;
  sortOrder: number;
  planPricing?: Record<string, unknown>;
  monthlyPricePaise?: number | null;
  yearlyPricePaise?: number | null;
  resolvedPricePaise: number;
  resolvedIncluded: boolean;
  resolvedSource: string;
}

export interface FeaturePriceTier {
  pricePaise: number;
  free: boolean;
  features: ResolvedFeature[];
}

export declare const BILLING_CYCLES: FeatureBillingCycle[];
export declare const toPaise: (value: unknown) => number;
export declare const isBillingCycle: (cycle: unknown) => boolean;
export declare const normalisePlanOverride: (raw: unknown) => FeaturePlanOverride | null;
export declare const normalisePlanPricing: (raw: unknown) => Record<string, FeaturePlanOverride>;
export declare const resolveFeaturePrice: (
  feature: unknown,
  planId?: string | null,
  cycle?: string | null,
) => ResolvedFeaturePrice;
export declare const featurePricePaise: (
  feature: unknown,
  planId?: string | null,
  cycle?: string | null,
) => number;
export declare const resolveFeaturesForPlan: <T extends object>(
  features: T[],
  planId?: string | null,
  cycle?: string | null,
) => Array<T & { resolvedPricePaise: number; resolvedIncluded: boolean; resolvedSource: string }>;
export declare const sumSelectedFeaturePaise: (
  features: unknown[],
  selectedIds: string[],
  planId?: string | null,
  cycle?: string | null,
) => number;
export declare const groupFeaturesByPriceTier: (
  features: unknown[],
  planId?: string | null,
  cycle?: string | null,
) => FeaturePriceTier[];

declare const _default: typeof resolveFeaturePrice;
export default _default;
