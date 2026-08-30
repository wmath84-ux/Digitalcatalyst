// src/hooks/useSubscriptionGateLogic.ts
//
// Client-side reader for the `settings/subscriptionGate` document. The
// document is the admin's "kill switch" + per-feature / per-duration /
// per-tier matrix. The hook returns the live settings + a few derived
// helpers that the rest of the app uses without re-implementing the
// resolution rules.
//
// The hook is the only place the app touches the document. Other
// components call `useFeatureVisibility` (which composes this hook with
// the per-feature access hook) and never read the raw shape.

import { useEffect, useState, useCallback } from "react";
import { onSnapshot, doc, getFirestore } from "firebase/firestore";

export type SubscriptionGateDurationFlags = {
  monthly: boolean;
  yearly: boolean;
  lifetime: boolean;
};

export type SubscriptionGateFeatureRow = {
  gated: boolean;
  durations: SubscriptionGateDurationFlags;
  tiers: Record<string, boolean>;
  hideFromNonSubscribers: boolean;
};

export type SubscriptionGatePlanRow = {
  visible: boolean;
  durations: SubscriptionGateDurationFlags;
};

export type SubscriptionGateSettings = {
  oldGateEnabled: boolean;
  hideUntilPurchasedEnabled: boolean;
  features: Record<string, SubscriptionGateFeatureRow>;
  planVisibility: Record<string, SubscriptionGatePlanRow>;
  subscriberPricing: Record<string, {
    monthly: number | null;
    yearly: number | null;
    lifetime: number | null;
  }>;
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

function normaliseSettings(input: any): SubscriptionGateSettings {
  if (!input || typeof input !== "object") return { ...SUBSCRIPTION_GATE_DEFAULTS };
  const features: Record<string, SubscriptionGateFeatureRow> = {};
  if (input.features && typeof input.features === "object") {
    for (const [k, v] of Object.entries(input.features)) features[k] = normaliseFeatureRow(v);
  }
  const planVisibility: Record<string, SubscriptionGatePlanRow> = {};
  if (input.planVisibility && typeof input.planVisibility === "object") {
    for (const [k, v] of Object.entries(planVisibility)) ;  // satisfy TS-lint w/o effect
    for (const [k, v] of Object.entries(input.planVisibility)) planVisibility[k] = normalisePlanRow(v);
  }
  const subscriberPricing: Record<string, { monthly: number | null; yearly: number | null; lifetime: number | null }> = {};
  if (input.subscriberPricing && typeof input.subscriberPricing === "object") {
    for (const [k, v] of Object.entries(input.subscriberPricing)) subscriberPricing[k] = normalisePricingOverride(v);
  }
  return {
    oldGateEnabled: input.oldGateEnabled === false ? false : true,
    hideUntilPurchasedEnabled: Boolean(input.hideUntilPurchasedEnabled),
    features,
    planVisibility,
    subscriberPricing,
    usageLimits: normaliseUsageLimits(input.usageLimits),
    updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : null,
  };
}

export function useSubscriptionGateLogic(): {
  settings: SubscriptionGateSettings;
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [settings, setSettings] = useState<SubscriptionGateSettings>({ ...SUBSCRIPTION_GATE_DEFAULTS });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription-gate", { method: "GET" });
      if (!res.ok) {
        setSettings({ ...SUBSCRIPTION_GATE_DEFAULTS });
        return;
      }
      const json = await res.json().catch(() => ({}));
      setSettings(normaliseSettings(json?.settings));
    } catch {
      // Network failure → keep the safe defaults so the legacy gate
      // continues to work.
      setSettings({ ...SUBSCRIPTION_GATE_DEFAULTS });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    try {
      const db = getFirestore();
      const ref = doc(db, "settings", "subscriptionGate");
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (cancelled) return;
          setSettings(normaliseSettings(snap.exists() ? snap.data() : null));
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setLoading(false);
        },
      );
    } catch {
      setLoading(false);
    }
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  return { settings, loading, refetch };
}
