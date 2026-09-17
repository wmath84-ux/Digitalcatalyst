// src/hooks/useRevisionAccess.ts
//
// Revision is a subscription feature. It is paywalled only while the
// `revision` feature exists and is active in the subscription catalog
// (Firestore `subscriptionFeatures/revision`) — exactly the same rule the
// My Day cloud-saving gate uses. If an admin removes the feature document
// (or marks it inactive), the gate is intentionally removed and Revision
// becomes free, so the app never soft-locks a learner.
//
// Phase-1 added a new admin control: `visibilityMode`.
//
//   "gate" (default, legacy): the rail entry / page card stays visible, the
//                              paywall appears when the learner tries to use
//                              a paywalled action.
//   "hide"                     the rail entry / page card is REMOVED for
//                              non-subscribers — the feature is gone from
//                              the catalog, the nav, and the home grid
//                              until the learner has an active subscription.
//                              Direct deep-links land on the same paywall
//                              the legacy "gate" mode showed, so the
//                              "you can never access it without paying"
//                              contract is preserved.

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";
import { subscriptionUnlocksFeature } from "../../utils/subscriptions.js";
import { isFeatureHiddenForAudience } from "../../utils/subscriptionVisibility.js";
import { useSubscriptionGateLogic } from "./useSubscriptionGateLogic";

export function useRevisionAccess() {
  const { user } = useAuth();
  // The admin's `settings/subscriptionGate` matrix: the per-feature
  // `gated` / `hideFromNonSubscribers` flags, the global
  // "hide until purchased" switch and the per-plan `tiers` toggle all decide
  // whether a NON-subscriber still sees the Roman AI Pro entry point. The
  // rail now honours them instead of only the feature doc's own
  // `visibilityMode`, so a toggle in the admin panel reaches the learner.
  const { settings: gateSettings } = useSubscriptionGateLogic();
  const [hasAccess, setHasAccess] = useState(false);
  // Phase-1: when admin sets visibilityMode = "hide", the feature is
  // removed from the catalog for non-subscribers. The rail / nav reads
  // this and removes the entry. The paywall still appears on a direct
  // deep-link so the feature can never be silently bypassed.
  const [hidden, setHidden] = useState(false);
  // The per-doc mode is also an input of the audience rule below, so the
  // snapshot value is kept in state (not only in the effect's closure).
  const [gateVisibilityMode, setGateVisibilityMode] = useState<"gate" | "hide">("gate");
  const [loading, setLoading] = useState(Boolean(user));
  useEffect(() => {
    if (!user) { setHasAccess(false); setHidden(false); setLoading(false); return undefined; }
    let subscription: Record<string, any> | null = null;
    let featureLoaded = false;
    let featureConfigured = true;
    let visibilityMode: "gate" | "hide" = "gate";

    const update = () => {
      if (!featureLoaded) return;
      // Missing/inactive catalog entry means the feature no longer has a gate.
      if (!featureConfigured) { setHasAccess(true); setHidden(false); setLoading(false); return; }
      // Single-source entitlement rule shared with the server gates: the
      // stored feature list wins, but any active membership unlocks the core
      // Roman AI Pro feature. This keeps Profile, My Day and Revision in
      // sync with the admin plan configuration.
      const paid = subscriptionUnlocksFeature(subscription, "revision");
      // Phase-1: hide mode only hides for non-subscribers. Subscribers
      // (paid === true) always see the feature regardless of mode.
      setHasAccess(paid || visibilityMode !== "hide");
      setHidden(visibilityMode === "hide" && !paid);
      setLoading(false);
    };

    const unsubscribeFeature = onSnapshot(doc(db, "subscriptionFeatures", "revision"), (snapshot) => {
      const data = (snapshot.data() || {}) as Record<string, any>;
      featureConfigured = snapshot.exists() && data.active !== false;
      visibilityMode = data.visibilityMode === "hide" ? "hide" : "gate";
      setGateVisibilityMode(visibilityMode);
      featureLoaded = true;
      update();
    }, () => { featureConfigured = true; visibilityMode = "gate"; featureLoaded = true; update(); });
    const unsubscribeSubscription = onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      subscription = snapshot.data() || {};
      update();
    }, () => { subscription = null; update(); });
    return () => { unsubscribeFeature(); unsubscribeSubscription(); };
  }, [user]);

  // Plan-scoped hiding: the gate's `tiers` toggle names the plan the learner
  // is on right now (the subscription snapshot carries `planId`). A member is
  // exempt — `paid` is folded into `hidden` by the same rule the server uses.
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setCurrentPlanId(null); return undefined; }
    return onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      const data = (snapshot.data() || {}) as Record<string, any>;
      setCurrentPlanId(data.planId ? String(data.planId) : null);
    }, () => setCurrentPlanId(null));
  }, [user]);

  const hiddenByGate = isFeatureHiddenForAudience(
    { id: "revision", visibilityMode: gateVisibilityMode },
    { isSubscriber: hasAccess && !hidden, currentPlanId, gateSettings },
  );
  return { hasAccess, hidden: hidden || hiddenByGate, loading, uid: user?.id || null };
}
