// src/hooks/useUsageThisMonth.ts
//
// Reads the `users/{uid}/usage/{YYYY-MM}` document that the AI
// question-generation handler writes each time it produces a question.
// The doc shape is:
//
//   { aiQuestionsGenerated: number, aiQuestionsByFeature: { [key]: number }, updatedAt }
//
// The hook also resolves the per-plan / per-feature cap from the
// admin's `settings/subscriptionGate` document so the profile widget
// can show "X of Y" and a progress bar.

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, getFirestore } from "firebase/firestore";
import { useSubscriptionGateLogic } from "./useSubscriptionGateLogic";
import { resolveAiQuestionsPerDay } from "../utils/subscriptionPricing";

export type UsageThisMonth = {
  month: string; // "YYYY-MM"
  aiQuestionsGenerated: number;
  aiQuestionsByFeature: Record<string, number>;
  updatedAt: number | null;
};

export function monthKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function useUsageThisMonth(uid: string | null | undefined, opts?: { planId?: string | null; featureKey?: string }): {
  usage: UsageThisMonth;
  loading: boolean;
  capPerDay: number | null;
  remainingThisMonth: number | null;
  isSubscriber: boolean;
} {
  const month = useMemo(() => monthKey(), []);
  const [usage, setUsage] = useState<UsageThisMonth>({
    month,
    aiQuestionsGenerated: 0,
    aiQuestionsByFeature: {},
    updatedAt: null,
  });
  const [loading, setLoading] = useState(Boolean(uid));
  const { settings } = useSubscriptionGateLogic();

  useEffect(() => {
    if (!uid) {
      setUsage({ month, aiQuestionsGenerated: 0, aiQuestionsByFeature: {}, updatedAt: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    let unsub: (() => void) | null = null;
    try {
      const db = getFirestore();
      const ref = doc(db, "users", uid, "usage", month);
      unsub = onSnapshot(
        ref,
        (snap) => {
          if (cancelled) return;
          const data = snap.exists() ? (snap.data() as any) : null;
          setUsage({
            month,
            aiQuestionsGenerated: Math.max(0, Math.round(Number(data?.aiQuestionsGenerated || 0))),
            aiQuestionsByFeature:
              data?.aiQuestionsByFeature && typeof data.aiQuestionsByFeature === "object"
                ? { ...data.aiQuestionsByFeature }
                : {},
            updatedAt:
              data?.updatedAt && typeof data.updatedAt === "object" && typeof data.updatedAt.toMillis === "function"
                ? data.updatedAt.toMillis()
                : (typeof data?.updatedAt === "number" ? data.updatedAt : null),
          });
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
  }, [uid, month]);

  // The cap is the per-plan override, falling back to the
  // per-feature override. The resolver lives in
  // `utils/subscriptionPricing` so the same rule applies on the
  // server and the client.
  const capPerDay = useMemo(() => {
    const perFeature = opts?.featureKey === "revision" ? 50 : null;
    return resolveAiQuestionsPerDay(opts?.planId ?? null, perFeature, settings);
  }, [opts?.planId, opts?.featureKey, settings]);

  const remainingThisMonth = useMemo(() => {
    if (capPerDay == null) return null;
    return Math.max(0, capPerDay - usage.aiQuestionsGenerated);
  }, [capPerDay, usage.aiQuestionsGenerated]);

  return { usage, loading, capPerDay, remainingThisMonth, isSubscriber: capPerDay != null && capPerDay > 0 };
}
