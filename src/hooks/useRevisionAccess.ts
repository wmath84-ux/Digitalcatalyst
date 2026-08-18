// src/hooks/useRevisionAccess.ts
//
// Revision is a subscription feature. It is paywalled only while the
// `revision` feature exists and is active in the subscription catalog
// (Firestore `subscriptionFeatures/revision`) — exactly the same rule the
// My Day cloud-saving gate uses. If an admin removes the feature document
// (or marks it inactive), the gate is intentionally removed and Revision
// becomes free, so the app never soft-locks a learner.

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
  const [loading, setLoading] = useState(Boolean(user));
  useEffect(() => {
    if (!user) { setHasAccess(false); setLoading(false); return undefined; }
    let subscription: Record<string, any> | null = null;
    let featureConfigured = true;
    let featureLoaded = false;

    const update = () => {
      if (!featureLoaded) return;
      // Missing/inactive catalog entry means the feature no longer has a gate.
      if (!featureConfigured) { setHasAccess(true); setLoading(false); return; }
      const features = Array.isArray(subscription?.features) ? subscription.features.map(String) : [];
      setHasAccess(
        subscription?.status === "active" &&
        millis(subscription?.expiresAt) > Date.now() &&
        features.includes("revision"),
      );
      setLoading(false);
    };

    const unsubscribeFeature = onSnapshot(doc(db, "subscriptionFeatures", "revision"), (snapshot) => {
      featureConfigured = snapshot.exists() && (snapshot.data()?.active !== false);
      featureLoaded = true;
      update();
    }, () => { featureConfigured = true; featureLoaded = true; update(); });
    const unsubscribeSubscription = onSnapshot(doc(db, "users", user.id, "subscription", "current"), (snapshot) => {
      subscription = snapshot.data() || {};
      update();
    }, () => { subscription = null; update(); });
    return () => { unsubscribeFeature(); unsubscribeSubscription(); };
  }, [user]);
  return { hasAccess, loading, uid: user?.id || null };
}
