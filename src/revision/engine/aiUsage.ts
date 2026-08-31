// Server-authoritative school-AI usage snapshots.
//
// The generation API reserves quota transactionally, calls the provider, then
// records one generation only after a complete test succeeds. Browser code is
// read-only: this module requests a fresh effective plan/cycle policy and
// subscribes to the resulting Firestore snapshot for live profile updates.

import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { apiFetch } from "../../utils/apiBase";
import type { CatalogAiSettings } from "./aiConfig";

export type AiUsageRecord = {
  uid: string;
  dayKey: string;
  dayCount: number;
  stamps: number[];
  updatedAt: number;
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  hasAccess: boolean;
  dailyLimit: number | null;
  windowHours: number | null;
  windowLimit: number | null;
  costEnabled: boolean;
  costBudgetMicros: number;
  termKey: string;
  termStartsAt: number;
  termEndsAt: number;
  termCostMicros: number;
  lastUsage: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    usageSource: "actual" | "estimated";
    actualCostMicros: number;
    completedAt: number;
  } | null;
};

export type AiUsageSnapshot = {
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  dailyUnlimited: boolean;
  /** Next learner-local midnight, supplied by the server status endpoint. */
  dailyResetsAt: number;
  windowHours: number;
  windowLimit: number;
  windowUsed: number;
  windowRemaining: number;
  windowUnlimited: boolean;
  windowResetsAt: number;
  costEnabled: boolean;
  costBudgetMicros: number;
  costUsedMicros: number;
  costRemainingMicros: number;
  costUnlimited: boolean;
  termEndsAt: number;
  allowed: boolean;
  blockedReason: string | null;
};

const MAX_STAMPS = 200;

export function localDayKey(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextLocalDayResetAt(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function usageDocRef(uid: string) {
  return doc(db, "users", uid, "aiUsage", "current");
}

export function emptyUsage(uid: string, now = Date.now()): AiUsageRecord {
  return {
    uid,
    dayKey: localDayKey(now),
    dayCount: 0,
    stamps: [],
    updatedAt: now,
    planId: "free",
    planName: "Free learner",
    cycle: "monthly",
    hasAccess: false,
    dailyLimit: null,
    windowHours: null,
    windowLimit: null,
    costEnabled: false,
    costBudgetMicros: -1,
    termKey: "",
    termStartsAt: 0,
    termEndsAt: 0,
    termCostMicros: 0,
    lastUsage: null,
  };
}

const finiteOrNull = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function parseUsage(uid: string, raw: unknown): AiUsageRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const stamps = Array.isArray(r.stamps)
    ? r.stamps.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0).slice(-MAX_STAMPS)
    : [];
  const last = r.lastUsage && typeof r.lastUsage === "object" ? r.lastUsage as Record<string, unknown> : null;
  return {
    uid,
    dayKey: typeof r.dayKey === "string" && r.dayKey ? r.dayKey : localDayKey(),
    dayCount: Math.max(0, Math.round(Number(r.dayCount) || 0)),
    stamps,
    updatedAt: Number(r.updatedAt) || 0,
    planId: String(r.planId || "basic"),
    planName: String(r.planName || r.planId || "Basic"),
    cycle: r.cycle === "yearly" ? "yearly" : "monthly",
    hasAccess: r.hasAccess !== false,
    dailyLimit: finiteOrNull(r.dailyLimit),
    windowHours: finiteOrNull(r.windowHours),
    windowLimit: finiteOrNull(r.windowLimit),
    costEnabled: r.costEnabled === true,
    costBudgetMicros: Math.max(-1, Math.round(Number(r.costBudgetMicros) || 0)),
    termKey: String(r.termKey || ""),
    termStartsAt: Number(r.termStartsAt) || 0,
    termEndsAt: Number(r.termEndsAt) || 0,
    termCostMicros: Math.max(0, Math.round(Number(r.termCostMicros) || 0)),
    lastUsage: last ? {
      provider: String(last.provider || ""),
      model: String(last.model || ""),
      inputTokens: Math.max(0, Math.round(Number(last.inputTokens) || 0)),
      outputTokens: Math.max(0, Math.round(Number(last.outputTokens) || 0)),
      totalTokens: Math.max(0, Math.round(Number(last.totalTokens) || 0)),
      usageSource: last.usageSource === "actual" ? "actual" : "estimated",
      actualCostMicros: Math.max(0, Math.round(Number(last.actualCostMicros) || 0)),
      completedAt: Number(last.completedAt) || 0,
    } : null,
  };
}

function effectiveWindowLimit(dailyLimit: number, value: number): number {
  if (value === -1) return -1;
  if (value > 0) return value;
  return dailyLimit > 0 ? dailyLimit : -1;
}

export function computeUsageSnapshot(
  record: AiUsageRecord,
  settings: CatalogAiSettings,
  now = Date.now(),
): AiUsageSnapshot {
  const currentDay = localDayKey(now);
  const dayCount = record.dayKey === currentDay ? record.dayCount : 0;
  const dailyLimit = record.dailyLimit === null ? settings.dailyLimit : Math.max(0, Math.round(record.dailyLimit));
  const windowHours = record.windowHours === null ? settings.windowHours : Math.max(1, Math.round(record.windowHours));
  const configuredWindow = record.windowLimit === null ? settings.windowLimit : Math.round(record.windowLimit);
  const windowMs = windowHours * 60 * 60 * 1000;
  const inWindow = record.stamps.filter((t) => now - t < windowMs);
  const windowLimit = effectiveWindowLimit(dailyLimit, configuredWindow);
  const dailyUnlimited = dailyLimit <= 0;
  const windowUnlimited = windowLimit < 0;
  const costEnabled = record.costEnabled;
  const costUnlimited = record.costBudgetMicros < 0;
  const oldest = inWindow.length ? Math.min(...inWindow) : now;
  let blockedReason: string | null = null;
  if (!record.hasAccess) {
    blockedReason = "An active Revision Studio subscription is required for new AI tests.";
  } else if (!dailyUnlimited && dayCount >= dailyLimit) {
    blockedReason = `Daily school-AI allowance reached (${dailyLimit} successful tests). It resets tomorrow.`;
  } else if (!windowUnlimited && inWindow.length >= windowLimit) {
    blockedReason = `${windowHours}-hour school-AI limit reached (${windowLimit} tests). Try again later.`;
  } else if (costEnabled && !costUnlimited && record.termCostMicros >= record.costBudgetMicros) {
    blockedReason = "School-AI model-cost allowance used for this billing term. Use your own API key or renew/upgrade.";
  }
  return {
    planId: record.planId,
    planName: record.planName,
    cycle: record.cycle,
    dailyLimit,
    dailyUsed: dayCount,
    dailyRemaining: dailyUnlimited ? 0 : Math.max(0, dailyLimit - dayCount),
    dailyUnlimited,
    dailyResetsAt: nextLocalDayResetAt(now),
    windowHours,
    windowLimit: windowUnlimited ? 0 : windowLimit,
    windowUsed: inWindow.length,
    windowRemaining: windowUnlimited ? 0 : Math.max(0, windowLimit - inWindow.length),
    windowUnlimited,
    windowResetsAt: inWindow.length ? oldest + windowMs : now,
    costEnabled,
    costBudgetMicros: record.costBudgetMicros,
    costUsedMicros: record.termCostMicros,
    costRemainingMicros: costUnlimited ? 0 : Math.max(0, record.costBudgetMicros - record.termCostMicros),
    costUnlimited,
    termEndsAt: record.termEndsAt,
    allowed: !blockedReason,
    blockedReason,
  };
}

export async function fetchAiUsage(uid: string): Promise<AiUsageRecord> {
  try {
    const snap = await getDoc(usageDocRef(uid));
    if (!snap.exists()) return emptyUsage(uid);
    return parseUsage(uid, snap.data());
  } catch {
    return emptyUsage(uid);
  }
}

const snapshotNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

/** Parse the authenticated server response instead of trusting a client value. */
export function parseAiUsageSnapshot(raw: unknown, now = Date.now()): AiUsageSnapshot {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const dailyLimit = Math.max(0, Math.round(snapshotNumber(row.dailyLimit)));
  const windowLimitRaw = Math.round(snapshotNumber(row.windowLimit, -1));
  const costBudgetMicros = Math.max(-1, Math.round(snapshotNumber(row.costBudgetMicros, -1)));
  const dailyUnlimited = row.dailyUnlimited === true || dailyLimit <= 0;
  const windowUnlimited = row.windowUnlimited === true || windowLimitRaw < 0;
  const costUnlimited = row.costUnlimited === true || costBudgetMicros < 0;
  const blockedReason = typeof row.blockedReason === "string" && row.blockedReason.trim()
    ? row.blockedReason.trim()
    : null;
  return {
    planId: String(row.planId || "free"),
    planName: String(row.planName || row.planId || "Free learner"),
    cycle: row.cycle === "yearly" ? "yearly" : "monthly",
    dailyLimit,
    dailyUsed: Math.max(0, Math.round(snapshotNumber(row.dailyUsed))),
    dailyRemaining: dailyUnlimited ? 0 : Math.max(0, Math.round(snapshotNumber(row.dailyRemaining))),
    dailyUnlimited,
    dailyResetsAt: Math.max(now, snapshotNumber(row.dailyResetsAt, nextLocalDayResetAt(now))),
    windowHours: Math.max(1, Math.round(snapshotNumber(row.windowHours, 5))),
    windowLimit: windowUnlimited ? 0 : Math.max(0, windowLimitRaw),
    windowUsed: Math.max(0, Math.round(snapshotNumber(row.windowUsed))),
    windowRemaining: windowUnlimited ? 0 : Math.max(0, Math.round(snapshotNumber(row.windowRemaining))),
    windowUnlimited,
    windowResetsAt: Math.max(now, snapshotNumber(row.windowResetsAt, now)),
    costEnabled: row.costEnabled === true,
    costBudgetMicros,
    costUsedMicros: Math.max(0, Math.round(snapshotNumber(row.costUsedMicros))),
    costRemainingMicros: costUnlimited ? 0 : Math.max(0, Math.round(snapshotNumber(row.costRemainingMicros))),
    costUnlimited,
    termEndsAt: Math.max(0, snapshotNumber(row.termEndsAt)),
    allowed: row.allowed === true && !blockedReason,
    blockedReason,
  };
}

/**
 * Refresh effective plan/cycle limits on the server and return that same
 * authoritative snapshot. Returning it directly keeps the profile functional
 * even while newly committed Firestore read rules are still being deployed.
 */
export async function refreshAiUsageStatus(): Promise<AiUsageSnapshot> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to check the AI allowance.");
  const token = await user.getIdToken();
  const response = await apiFetch("/api/revision/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "revision.usage.status", tzOffsetMinutes: new Date().getTimezoneOffset() }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "Could not refresh AI allowance.");
  }
  return parseAiUsageSnapshot(payload.usage);
}

export type AiUsageSubscriptionState = { exists: boolean; error: boolean };

export function subscribeAiUsage(
  uid: string,
  onNext: (record: AiUsageRecord, state: AiUsageSubscriptionState) => void,
): () => void {
  return onSnapshot(
    usageDocRef(uid),
    (snap) => onNext(snap.exists() ? parseUsage(uid, snap.data()) : emptyUsage(uid), { exists: snap.exists(), error: false }),
    () => onNext(emptyUsage(uid), { exists: false, error: true }),
  );
}

/**
 * Legacy export retained for compatible callers. Quota writes are deliberately
 * refused in the browser; only the transactional generation API may consume.
 */
export async function consumeAiGeneration(): Promise<never> {
  throw new Error("AI usage is server-authoritative and is consumed only after a complete test succeeds.");
}
