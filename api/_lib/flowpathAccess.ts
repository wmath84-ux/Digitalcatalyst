// api/_lib/flowpathAccess.ts
//
// Capability check for the FlowPath control center. Mirrors the
// My Day free-allowance counter and the Revision plan gate so
// creating a task / reminder / schedule / note / test via
// FlowPath enforces the same limits as creating it via the
// My Day or Revision pages directly.
//
//   • My Day kinds (task / reminder / schedule / note) — free
//     users get N creations per local day, subscribers get
//     unlimited. Same code path as api/_lib/myDay.ts.
//   • Revision kinds — requires an active subscription that
//     includes the `revision` feature. Test Bank capacity is
//     enforced by the underlying handleRevisionData call (this
//     helper only checks the subscription presence; the bank
//     cap is checked in commitTest).

import type { Firestore } from "firebase-admin/firestore";
import type { FlowPathActivityKind } from "./flowpathControl.js";

export type FlowPathAccess = {
  /** If set, the request must be refused with this HTTP status. */
  status?: number;
  /** Stable code the client can switch on. */
  code?: string;
  /** Human-readable error message. */
  error?: string;
  /** True when the user is allowed to create more. */
  canCreate: boolean;
  /** Plan / cycle context. */
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  /** Free-tier remaining creations today (only meaningful for
   *  My Day kinds; -1 means unlimited / subscribed). */
  freeRemaining: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const millis = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function dayKeyInZone(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validTimeZone(value: unknown): string {
  const zone = text(value, 80) || "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "UTC";
  }
}

export async function resolveFlowPathAccess(
  db: Firestore,
  uid: string,
  kind: FlowPathActivityKind,
): Promise<FlowPathAccess> {
  const now = Date.now();
  // ---------- Revision: needs active subscription with `revision` feature
  if (kind === "revision" || kind === "mcq") {
    const feature = await db.collection("subscriptionFeatures").doc("revision").get();
    const featureConfigured = feature.exists && feature.data()?.active !== false;
    if (!featureConfigured) {
      return {
        status: 403,
        code: "PLAN_REQUIRED",
        error: "Revision Studio is not configured on this account. Subscribers can create revision tests; the public preview is browse-only.",
        canCreate: true,
        planId: "basic",
        planName: "Basic",
        cycle: "monthly",
        freeRemaining: -1,
      };
    }
    const subscription = await db.collection("users").doc(uid).collection("subscription").doc("current").get();
    const sub = asRecord(subscription.data());
    const active = subscription.exists && sub.status === "active" && millis(sub.expiresAt) > now;
    const features = Array.isArray(sub.features) ? sub.features.map(String) : [];
    if (!active || !features.includes("revision")) {
      return {
        status: 403,
        code: "PLAN_REQUIRED",
        error: "Creating a Revision test requires an active Revision Studio subscription. Subscribe from the Subscription page to continue.",
        canCreate: false,
        planId: text(sub.planId, 100) || "basic",
        planName: text(sub.planName, 100) || text(sub.planId, 100) || "Basic",
        cycle: sub.cycle === "yearly" ? "yearly" : "monthly",
        freeRemaining: 0,
      };
    }
    return {
      canCreate: true,
      planId: text(sub.planId, 100) || "basic",
      planName: text(sub.planName, 100) || text(sub.planId, 100) || "Basic",
      cycle: sub.cycle === "yearly" ? "yearly" : "monthly",
      freeRemaining: -1,
    };
  }

  // ---------- My Day kinds: free-tier daily counter
  const feature = await db.collection("subscriptionFeatures").doc("my-day").get();
  const featureConfigured = feature.exists && feature.data()?.active !== false;
  if (!featureConfigured) {
    // No gate — anyone can use My Day.
    return {
      canCreate: true,
      planId: "basic",
      planName: "Basic",
      cycle: "monthly",
      freeRemaining: -1,
    };
  }
  const subscription = await db.collection("users").doc(uid).collection("subscription").doc("current").get();
  const sub = asRecord(subscription.data());
  const active = subscription.exists && sub.status === "active" && millis(sub.expiresAt) > now;
  const features = Array.isArray(sub.features) ? sub.features.map(String) : [];
  const paid = active && features.includes("my-day");
  if (paid) {
    return {
      canCreate: true,
      planId: text(sub.planId, 100) || "basic",
      planName: text(sub.planName, 100) || text(sub.planId, 100) || "Basic",
      cycle: sub.cycle === "yearly" ? "yearly" : "monthly",
      freeRemaining: -1,
    };
  }
  const freeLimit = Math.max(0, Math.min(100, Math.round(Number(feature.data()?.freeItemsPerDay ?? 1) || 0)));
  const usage = asRecord((await db.collection("users").doc(uid).collection("myDayUsage").doc("current").get()).data() || {});
  const timeZone = validTimeZone(usage.timeZone || "UTC");
  const today = dayKeyInZone(now, timeZone);
  const freeUsed = String(usage.dayKey || "") === today ? Math.max(0, Math.round(Number(usage.dayCount) || 0)) : 0;
  const freeRemaining = Math.max(0, freeLimit - freeUsed);
  if (freeRemaining <= 0) {
    return {
      status: 403,
      code: "MYDAY_DAILY_FREE_USED",
      error:
        freeLimit === 0
          ? "Your plan currently includes browse-only My Day access. Subscribe to create items."
          : `Today's ${freeLimit} free My Day creation${freeLimit === 1 ? "" : "s"} ${freeUsed >= freeLimit ? "has" : "would be"} used. Subscribe for unlimited creation or return after the daily reset.`,
      canCreate: false,
      planId: text(sub.planId, 100) || "basic",
      planName: text(sub.planName, 100) || text(sub.planId, 100) || "Basic",
      cycle: sub.cycle === "yearly" ? "yearly" : "monthly",
      freeRemaining,
    };
  }
  return {
    canCreate: true,
    planId: text(sub.planId, 100) || "basic",
    planName: text(sub.planName, 100) || text(sub.planId, 100) || "Basic",
    cycle: sub.cycle === "yearly" ? "yearly" : "monthly",
    freeRemaining,
  };
}
