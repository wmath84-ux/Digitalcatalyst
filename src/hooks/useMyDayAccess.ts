import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";
import { fetchMyDayStatus, type MyDayAccessSnapshot } from "../lib/myDayClient";

const initialAccess = (): MyDayAccessSnapshot => ({
  paid: false,
  paidExpiresAt: 0,
  unlimited: false,
  featureConfigured: true,
  freeLimit: 1,
  freeUsed: 0,
  freeRemaining: 1,
  canCreate: true,
  dayKey: "",
  resetAt: 0,
  timeZone: "UTC",
});

/**
 * My Day remains browseable for everyone. The server resolves whether the
 * learner has paid/unlimited access or today's Admin-configured free creation
 * allowance. Server access still requires subscription status === "active", a
 * future expiresAt and features.includes("my-day"); the browser never grants
 * that entitlement itself. The hook listens to feature, subscription and usage
 * documents so an Admin change, purchase, creation or daily reset is reflected live.
 *
 * Phase-1: the feature doc now also carries `visibilityMode`. When the admin
 * sets it to "hide", the rail/nav removes the My Day entry for
 * non-subscribers. Direct deep-links still land on the paywall, so the
 * "you can never access it without paying" contract is preserved.
 */
export function useMyDayAccess() {
  const { user } = useAuth();
  const [access, setAccess] = useState<MyDayAccessSnapshot>(initialAccess);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState<string | null>(null);
  // Phase-1: hide mode = feature is removed from the catalog for
  // non-subscribers. The rail reads this and the page is replaced by
  // the paywall on a direct deep-link.
  const [hidden, setHidden] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return null;
    try {
      const result = await fetchMyDayStatus();
      setAccess(result.access);
      // The server echoes `hidden` on the access snapshot (Phase-1).
      // We mirror it into the hook so the rail / nav can read it
      // synchronously.
      setHidden(Boolean((result.access as any)?.hidden));
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh My Day access.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAccess(initialAccess());
      setLoading(false);
      setError(null);
      setHidden(false);
      return undefined;
    }
    setLoading(true);
    void refresh();
    // Keep the original real-time catalog/subscription contract, but ask the
    // server to recompute instead of trusting client-side entitlement math.
    const unsubscribeFeature = onSnapshot(doc(db, "subscriptionFeatures", "my-day"), () => { void refresh(); }, () => undefined);
    const unsubscribeSubscription = onSnapshot(doc(db, "users", user.id, "subscription", "current"), () => { void refresh(); }, () => undefined);
    const unsubscribeUsage = onSnapshot(doc(db, "users", user.id, "myDayUsage", "current"), (snapshot) => {
      if (!snapshot.exists()) return;
      const row = snapshot.data() || {};
      setAccess((current) => {
        const sameDay = !current.dayKey || String(row.dayKey || "") === current.dayKey;
        const used = sameDay ? Math.max(0, Math.round(Number(row.dayCount) || 0)) : 0;
        const limit = Math.max(0, Math.round(Number(row.freeLimit ?? current.freeLimit) || 0));
        return {
          ...current,
          dayKey: String(row.dayKey || current.dayKey),
          timeZone: String(row.timeZone || current.timeZone),
          freeLimit: limit,
          freeUsed: used,
          freeRemaining: current.unlimited ? limit : Math.max(0, limit - used),
          canCreate: current.unlimited || used < limit,
        };
      });
    }, () => undefined);
    return () => {
      unsubscribeFeature();
      unsubscribeSubscription();
      unsubscribeUsage();
    };
  }, [refresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    const now = Date.now();
    const deadlines = [access.resetAt, access.paidExpiresAt].filter((value) => value > now);
    if (!deadlines.length) return undefined;
    const deadline = Math.min(...deadlines);
    const delay = Math.min(2_147_000_000, Math.max(1_000, deadline - now + 1_000));
    const timer = window.setTimeout(() => { void refresh(); }, delay);
    return () => window.clearTimeout(timer);
  }, [access.paidExpiresAt, access.resetAt, refresh, user]);

  return {
    hasAccess: access.unlimited,
    paid: access.paid,
    unlimited: access.unlimited,
    canCreate: access.canCreate,
    freeLimit: access.freeLimit,
    freeUsed: access.freeUsed,
    freeRemaining: access.freeRemaining,
    resetAt: access.resetAt,
    loading,
    error,
    uid: user?.id || null,
    access,
    setAccess,
    refresh,
    hidden, // Phase-1
  };
}
