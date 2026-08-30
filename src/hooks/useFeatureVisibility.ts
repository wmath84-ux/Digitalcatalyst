// src/hooks/useFeatureVisibility.ts
//
// Resolves the VISIBLE / GATE / HIDDEN status for a single feature,
// using the admin's kill switch + the feature's own access state.
//
//   - "visible" → show the feature to the user, no gate.
//   - "gate"    → show the feature, but block creation / save behind
//                  the existing PremiumGate (the old paywall).
//   - "hidden"  → remove the feature from the catalog, rail, and nav
//                  entirely. Direct deep-links still land on the gate
//                  so the "no free access" contract is preserved.
//
// The hook is the SINGLE place the rule is computed — pages, rail
// components, the plan picker, and the catalog all call it. Any change
// to the matrix (per-feature / per-duration / per-tier toggles) is
// honoured automatically.

import { useMemo } from "react";
import { useSubscriptionGateLogic } from "./useSubscriptionGateLogic";
import { useMyDayAccess } from "./useMyDayAccess";
import { useRevisionAccess } from "./useRevisionAccess";

export type FeatureVisibilityStatus = "visible" | "gate" | "hidden" | "loading";

export function useFeatureVisibility(featureKey: "myday" | "revision"): {
  status: FeatureVisibilityStatus;
  hasAccess: boolean;
  hidden: boolean;
  oldGateEnabled: boolean;
} {
  const { settings, loading: settingsLoading } = useSubscriptionGateLogic();

  // Both hooks are always called (React rules of hooks). The
  // selected one wins; the other is ignored.
  const myDay = useMyDayAccess();
  const revision = useRevisionAccess();

  const { hasAccess, hidden } = useMemo(() => {
    if (featureKey === "myday") {
      return { hasAccess: Boolean(myDay.hasAccess), hidden: Boolean(myDay.hidden) };
    }
    return { hasAccess: Boolean(revision.hasAccess), hidden: Boolean(revision.hidden) };
  }, [featureKey, myDay.hasAccess, myDay.hidden, revision.hasAccess, revision.hidden]);

  const status = useMemo<FeatureVisibilityStatus>(() => {
    if (settingsLoading) return "loading";
    if (hidden) return "hidden";
    if (hasAccess) return "visible";
    // Kill switch hierarchy: per-feature override > global kill switch.
    const perFeature = settings.features?.[featureKey]?.gated || settings.features?.[featureKey]?.hideFromNonSubscribers;
    const globalOn = settings.hideUntilPurchasedEnabled || perFeature;
    if (globalOn) return "hidden";
    return settings.oldGateEnabled ? "gate" : "hidden";
  }, [settingsLoading, hidden, hasAccess, settings, featureKey]);

  return {
    status,
    hasAccess,
    hidden,
    oldGateEnabled: settings.oldGateEnabled,
  };
}
