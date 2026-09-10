import { useCallback, useEffect, useMemo, useState } from "react";
import type { Task } from "../types";

const STORAGE_KEY = "myday_streak_days_v1";
const MAX_DAYS = 90;

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readActiveDays(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((d): d is string => typeof d === "string");
  } catch {
    return [];
  }
}

function writeActiveDays(days: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(days.slice(-MAX_DAYS)));
  } catch {
    // Streak is best-effort enrichment — the in-memory value still renders.
  }
}

function countStreak(activeDays: readonly string[], todayKey: string): number {
  const set = new Set(activeDays);
  // A streak stays alive through today even before today's first completion.
  const cursor = new Date();
  if (!set.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (;;) {
    const key = toDayKey(cursor);
    if (!set.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    if (streak > 366) break;
  }
  return streak;
}

/**
 * Real study-streak derived from task completions.
 *
 * Every day on which the learner completes at least one task is recorded in
 * localStorage; the streak is the run of consecutive active days ending
 * today (or yesterday, so the count survives until today's first completion).
 * Learners who already have completed tasks get today seeded once, so an
 * existing habit is never shown as a zero-day streak.
 */
export function useStudyStreak(tasks: Task[]): { streak: number; recordCompletionDay: () => void } {
  const [activeDays, setActiveDays] = useState<string[]>(() => readActiveDays());
  const todayKey = useMemo(() => toDayKey(new Date()), []);

  // One-time migration: existing completed tasks count as activity today.
  useEffect(() => {
    if (activeDays.length > 0) return;
    if (!tasks.some((t) => t.status === "completed")) return;
    setActiveDays((prev) => {
      if (prev.length > 0) return prev;
      const next = [toDayKey(new Date())];
      writeActiveDays(next);
      return next;
    });
    // Only re-run when the completion state flips from none → some.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.some((t) => t.status === "completed")]);

  const recordCompletionDay = useCallback(() => {
    const key = toDayKey(new Date());
    setActiveDays((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      writeActiveDays(next);
      return next;
    });
  }, []);

  const streak = useMemo(() => countStreak(activeDays, todayKey), [activeDays, todayKey]);
  return { streak, recordCompletionDay };
}
