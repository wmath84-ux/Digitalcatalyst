// src/subscription/data/fallbackCatalog.ts
//
// Fallback subscription catalog used ONLY when the server-driven
// catalog (`/api/subscription-catalog`) cannot be loaded. The
// live catalog (Firestore `subscriptionPlans` / `subscriptionFeatures`)
// remains the source of truth for pricing and is always preferred.
// These defaults keep the Go Premium page open and browsable when
// the server is unreachable, still seeding, or misconfigured — the
// real checkout flow re-verifies everything server-side.

import type { SubscriptionCatalog } from "../utils/subscriptionCatalog";

export const FALLBACK_SUBSCRIPTION_CATALOG: SubscriptionCatalog = {
  plans: [
    {
      id: "basic",
      name: "Basic",
      description: "Flexible subscription access with optional My Day cloud saving.",
      monthlyPricePaise: 19900,
      yearlyPricePaise: 199000,
      includedFeatureIds: [],
      includedProductIds: [],
      includedModuleKeys: [],
      allowedCycles: ["monthly", "yearly"],
      active: true,
      minPayablePaise: 0,
      badge: null,
      trialDays: 0,
      autoRenewByDefault: true,
      sortOrder: 0,
    },
    {
      id: "premium",
      name: "Premium",
      description: "Premium subscription access with selectable My Day cloud saving.",
      monthlyPricePaise: 49900,
      yearlyPricePaise: 499000,
      includedFeatureIds: [],
      includedProductIds: [],
      includedModuleKeys: [],
      allowedCycles: ["monthly", "yearly"],
      active: true,
      minPayablePaise: 0,
      badge: "POPULAR",
      trialDays: 0,
      autoRenewByDefault: true,
      sortOrder: 1,
    },
    {
      id: "pro",
      name: "Pro",
      description: "Pro subscription access with selectable products and My Day cloud saving.",
      monthlyPricePaise: 99900,
      yearlyPricePaise: 999000,
      includedFeatureIds: [],
      includedProductIds: [],
      includedModuleKeys: [],
      allowedCycles: ["monthly", "yearly"],
      active: true,
      minPayablePaise: 0,
      badge: null,
      trialDays: 0,
      autoRenewByDefault: true,
      sortOrder: 2,
    },
  ],
  features: [
    {
      id: "my-day",
      name: "My Day cloud saving",
      description: "Securely save and sync your tasks, schedules, reminders and notes.",
      icon: "calendar",
      pricePaise: 14900,
      included: false,
      active: true,
      badge: "PAID",
      sortOrder: 0,
    },
  ],
  productUnlocks: [],
  moduleUnlocks: [],
  loadedAt: Date.now(),
};
