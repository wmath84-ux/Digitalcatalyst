// Live AI usage counters for every learner.
//
// Admin publishes daily + rolling-window caps on the revision catalog.
// Each successful AI generate writes a timestamp to
//   users/{uid}/aiUsage/current
// so the profile page can show remaining quota on every device.

import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import type { CatalogAiSettings } from "./aiConfig";

export type AiUsageRecord = {
  uid: string;
  dayKey: string;
  dayCount: number;
  stamps: number[];
  updatedAt: number;
};

export type AiUsageSnapshot = {
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  dailyUnlimited: boolean;
  windowHours: number;
  windowLimit: number;
  windowUsed: number;
  windowRemaining: number;
  windowUnlimited: boolean;
  windowResetsAt: number;
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

export function usageDocRef(uid: string) {
  return doc(db, "users", uid, "aiUsage", "current");
}

export function emptyUsage(uid: string, now = Date.now()): AiUsageRecord {
  return { uid, dayKey: localDayKey(now), dayCount: 0, stamps: [], updatedAt: now };
}

export function parseUsage(uid: string, raw: unknown): AiUsageRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  const stamps = Array.isArray(r.stamps)
    ? r.stamps.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0).slice(-MAX_STAMPS)
    : [];
  return {
    uid,
    dayKey: typeof r.dayKey === "string" && r.dayKey ? r.dayKey : localDayKey(),
    dayCount: Math.max(0, Math.round(Number(r.dayCount) || 0)),
    stamps,
    updatedAt: Number(r.updatedAt) || 0,
  };
}

function effectiveWindowLimit(settings: CatalogAiSettings): number {
  if (settings.windowLimit === -1) return -1;
  if (settings.windowLimit > 0) return settings.windowLimit;
  return settings.dailyLimit;
}

export function computeUsageSnapshot(
  record: AiUsageRecord,
  settings: CatalogAiSettings,
  now = Date.now(),
): AiUsageSnapshot {
  const dayKey = localDayKey(now);
  const dayCount = record.dayKey === dayKey ? record.dayCount : 0;
  const windowMs = Math.max(1, settings.windowHours) * 60 * 60 * 1000;
  const inWindow = record.stamps.filter((t) => now - t < windowMs);
  const windowLimit = effectiveWindowLimit(settings);
  const dailyUnlimited = settings.dailyLimit <= 0;
  const windowUnlimited = windowLimit < 0;
  const dailyRemaining = dailyUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, settings.dailyLimit - dayCount);
  const windowRemaining = windowUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, windowLimit - inWindow.length);
  const oldest = inWindow.length ? Math.min(...inWindow) : now;
  let blockedReason: string | null = null;
  if (!dailyUnlimited && dayCount >= settings.dailyLimit) {
    blockedReason = `Daily AI limit reached (${settings.dailyLimit} generations). Resets tomorrow.`;
  } else if (!windowUnlimited && inWindow.length >= windowLimit) {
    blockedReason = `${settings.windowHours}-hour window limit reached (${windowLimit} generations). Try again later.`;
  }
  return {
    dailyLimit: settings.dailyLimit,
    dailyUsed: dayCount,
    dailyRemaining: dailyUnlimited ? settings.dailyLimit : dailyRemaining,
    dailyUnlimited,
    windowHours: settings.windowHours,
    windowLimit: windowUnlimited ? 0 : windowLimit,
    windowUsed: inWindow.length,
    windowRemaining: windowUnlimited ? 0 : windowRemaining,
    windowUnlimited,
    windowResetsAt: inWindow.length ? oldest + windowMs : now,
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

export function subscribeAiUsage(uid: string, onNext: (record: AiUsageRecord) => void): () => void {
  return onSnapshot(
    usageDocRef(uid),
    (snap) => onNext(snap.exists() ? parseUsage(uid, snap.data()) : emptyUsage(uid)),
    () => onNext(emptyUsage(uid)),
  );
}

/** Record one successful AI generation. Throws if the published cap is already used. */
export async function consumeAiGeneration(uid: string, settings: CatalogAiSettings): Promise<AiUsageSnapshot> {
  const now = Date.now();
  const current = await fetchAiUsage(uid);
  const snapshot = computeUsageSnapshot(current, settings, now);
  if (!snapshot.allowed) {
    throw new Error(snapshot.blockedReason || "AI limit reached.");
  }
  const dayKey = localDayKey(now);
  const dayCount = current.dayKey === dayKey ? current.dayCount + 1 : 1;
  const windowMs = Math.max(1, settings.windowHours) * 60 * 60 * 1000;
  const stamps = [...current.stamps.filter((t) => now - t < windowMs * 2), now].slice(-MAX_STAMPS);
  const next: AiUsageRecord = { uid, dayKey, dayCount, stamps, updatedAt: now };
  await setDoc(usageDocRef(uid), next, { merge: true });
  return computeUsageSnapshot(next, settings, now);
}
