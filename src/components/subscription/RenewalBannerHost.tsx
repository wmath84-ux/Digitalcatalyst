// src/components/subscription/RenewalBannerHost.tsx
//
// Mounts the renewal banner once, at the app shell level, so a member
// sees an expiry notice wherever they are — not only if they happen to
// open the notifications list.
//
// The host owns everything stateful (the Firestore listener, the
// dismissal memory, the route suppression) and keeps `RenewalBanner`
// a pure presentational component.
//
// Deliberate restraint, because this thing floats over the whole app:
//   * one banner per stage per expiry — dismissing d7 stays dismissed
//     until the d3 stage arrives, so it re-earns attention instead of
//     nagging;
//   * dismissals are keyed by expiry, so a renewal resets the memory;
//   * the two non-dismissible stages (due, expired) still cannot be
//     dismissed here — the presentation layer decides that, not us;
//   * hidden on the subscription and checkout routes, where it would
//     only repeat what the page already says;
//   * opted-out members (renewalReminderOptOut) never see it.

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase";
import { getRenewalReminder } from "../../../utils/subscriptionRenewal";
import { buildRenewalView } from "../../../utils/renewalPresentation";
import RenewalBanner from "./RenewalBanner";

const DISMISS_KEY = (uid: string) => `renewalBannerDismissed:${uid}`;

/** Routes where a floating renewal notice is redundant or intrusive. */
const SUPPRESSED_PREFIXES = ["#/subscription", "#/checkout", "#/admin", "#/auth", "#/landing", "#/dev/"];

type SubscriptionSnapshot = Record<string, unknown> | null;

const readDismissals = (uid: string): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY(uid)) || "{}") || {};
  } catch {
    return {};
  }
};

interface Props {
  uid: string | null;
  planName?: string;
  onRenew: () => void;
}

export default function RenewalBannerHost({ uid, planName, onRenew }: Props) {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [hash, setHash] = useState(() => (typeof window === "undefined" ? "" : window.location.hash));

  useEffect(() => {
    if (!uid) {
      setSubscription(null);
      return undefined;
    }
    setDismissed(readDismissals(uid));
    return onSnapshot(
      doc(db, "users", uid, "subscription", "current"),
      (snapshot) => setSubscription(snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null),
      () => setSubscription(null),
    );
  }, [uid]);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const view = useMemo(() => {
    if (!subscription) return null;
    if (subscription.renewalReminderOptOut === true) return null;
    const reminder = getRenewalReminder(subscription);
    if (!reminder) return null;
    return buildRenewalView(reminder, { planName: planName || String(subscription.planId || "Subscription") });
  }, [subscription, planName]);

  // A dismissal is remembered per (expiry, stage) so the next, more
  // urgent stage always breaks through.
  const dismissKey = view ? `${getRenewalReminder(subscription)?.expiresAt ?? ""}:${view.stage}` : "";

  const suppressedRoute = SUPPRESSED_PREFIXES.some((prefix) => hash.startsWith(prefix));
  if (!uid || !view || suppressedRoute) return null;
  if (view.dismissible && dismissed[dismissKey]) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto max-w-lg">
      <div className="pointer-events-auto">
        <RenewalBanner
          view={view}
          onRenew={onRenew}
          onDismiss={() => {
            if (!uid) return;
            const next = { ...dismissed, [dismissKey]: true };
            setDismissed(next);
            try {
              localStorage.setItem(DISMISS_KEY(uid), JSON.stringify(next));
            } catch {
              /* private mode — the banner simply returns next session */
            }
          }}
          className="shadow-lg shadow-slate-900/10"
        />
      </div>
    </div>
  );
}
