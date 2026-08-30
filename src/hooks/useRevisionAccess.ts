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

const millis = (value: unknown) => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export function useRevisionAccess() {
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  // Phase-1: when admin sets visibilityMode = "hide", the feature is
  // removed from the catalog for non-subscribers. The rail / nav reads
  // this and removes the entry. The paywall still appears on a direct
  // deep-link so the feature can never be silently bypassed.
  const [hidden, setHidden] = useState(false);
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
      const features = Array.isArray(subscription?.features) ? subscription.features.map(String) : [];
      const paid = subscription?.status === "active" &&
        millis(subscription?.expiresAt) > Date.now() &&
        features.includes("revision");
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
      featureLoaded = true;
      update();
    }, () => { featureConfigured = true; visibilityMode = "gate"; featureLoaded = true; update(); });
    const unsubscribeSubscription = onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      subscription = snapshot.data() || {};
      update();
    }, () => { subscription = null; update(); });
    return () => { unsubscribeFeature(); unsubscribeSubscription(); };
  }, [user]);
  return { hasAccess, hidden, loading, uid: user?.id || null };
}
