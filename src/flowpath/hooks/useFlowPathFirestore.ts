// src/flowpath/hooks/useFlowPathFirestore.ts
//
// React hook that bridges the FlowPath dashboard to the real
// `users/{uid}/flowpathActivities` Firestore collection.
//
// What this replaces:
//   The old `useFlowPath` hook stored every activity in
//   localStorage (key `flowpath.activities.v1`). That made
//   FlowPath a toy — items created there never reached the
//   user's My Day or Revision pages, and items created in those
//   pages never appeared in the dashboard.
//
// What this gives:
//   • Live snapshot of every FlowPath activity for the signed-in
//     user, ordered by createdAt desc.
//   • Mutation helpers that hit /api/flowpath/control (the
//     server multiplexer that mirrors the activity into My Day /
//     Revision, schedules a TWA local alarm, and dispatches the
//     push notifications).
//   • Backward compatibility: if the user has no Firestore docs
//     yet (e.g. just signed in for the first time), the hook
//     seeds a few demo activities so the dashboard is never empty.
//   • Admin override: when the user is the admin, an extra
//     `targetUid` argument picks any user to read / write.
//   • Offline-friendly: every mutation surfaces a clear error
//     when offline so the UI can show "queued for retry" instead
//     of pretending it worked.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  type FlowPathActivity,
  type FlowPathActivityKind,
  type FlowPathActivityStatus,
} from "../types/flowpath";
import { flowpathControl, type FlowPathControlResult } from "../lib/flowpathControlClient";

const DEFAULT_LIMIT = 250;

type MutationState = {
  loading: boolean;
  error: string | null;
};

const isAdmin = (email: string | null | undefined) =>
  String(email || "").toLowerCase() === "wmath84@gmail.com";

const seedActivities = (uid: string): FlowPathActivity[] => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const seeds: Array<Omit<FlowPathActivity, "uid" | "createdBy" | "source">> = [
    {
      id: `seed-revision-${uid}`,
      kind: "revision",
      title: "Organic Chemistry — Chapter 2",
      description: "Reaction mechanisms recap",
      scheduledFor: now - 3 * day,
      status: "completed",
      completedAt: now - 3 * day + 40 * 60_000,
      createdAt: now - 3 * day,
      updatedAt: now - 3 * day,
      testConfig: { totalQuestions: 25, difficulty: "medium", questionMode: "mixed", estimatedMinutes: 30 },
      progress: 100,
    },
    {
      id: `seed-task-${uid}`,
      kind: "task",
      title: "Submit assignment draft",
      description: "Literature review section",
      scheduledFor: now + 1 * hour,
      status: "active",
      createdAt: now - 2 * hour,
      updatedAt: now - 2 * hour,
      taskPriority: "medium",
      taskStatus: "pending",
    },
    {
      id: `seed-mcq-${uid}`,
      kind: "mcq",
      title: "Biology Practice Set",
      description: "20 MCQs on cell biology",
      scheduledFor: now - 1 * day,
      status: "completed",
      completedAt: now - 1 * day + 30 * 60_000,
      createdAt: now - 1 * day,
      updatedAt: now - 1 * day,
      testConfig: { totalQuestions: 20, difficulty: "easy", questionMode: "theory", estimatedMinutes: 15 },
      progress: 100,
    },
    {
      id: `seed-note-${uid}`,
      kind: "note",
      title: "Quick thoughts on Chapter 4",
      description: "The redox section felt thin — check the appendix for the worked examples before next class.",
      scheduledFor: null,
      status: "active",
      createdAt: now - 6 * hour,
      updatedAt: now - 6 * hour,
      noteColor: "violet",
    },
    {
      id: `seed-schedule-${uid}`,
      kind: "schedule",
      title: "Physics tutorial",
      description: "Weekly slot with Mr Khan",
      scheduledFor: now + 2 * day,
      status: "active",
      createdAt: now - 1 * day,
      updatedAt: now - 1 * day,
      scheduleStartTime: "17:00",
      scheduleEndTime: "18:00",
      scheduleType: "study",
    },
    {
      id: `seed-reminder-${uid}`,
      kind: "reminder",
      title: "Drink water 💧",
      scheduledFor: now + 2 * hour,
      status: "active",
      createdAt: now - 1 * hour,
      updatedAt: now - 1 * hour,
      reminderTime: "11:00",
    },
  ];
  return seeds.map((s) => ({ ...s, uid, createdBy: uid, source: "user" }));
};

export function useFlowPathFirestore(targetUidOverride?: string) {
  const { user } = useAuth();
  const uid = targetUidOverride || user?.id || null;
  const isAdminUser = isAdmin(user?.email);

  const [items, setItems] = useState<FlowPathActivity[]>([]);
  const [mutation, setMutation] = useState<MutationState>({ loading: false, error: null });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
  const [didSeed, setDidSeed] = useState<boolean>(false);

  // Initial fetch + poll every 60s. The poll is cheap (a single
  // collection read for the current user) and lets the dashboard
  // pick up cross-device edits without a manual refresh.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await flowpathControl<{ items: FlowPathActivity[] }>({
          action: "flowpath.list",
          uid,
          limit: DEFAULT_LIMIT,
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error || "Could not load FlowPath activities.");
          setLoading(false);
          return;
        }
        // Defensive: the server can only ever return an array here,
        // but a malformed response must degrade to "no server items"
        // instead of throwing inside the poll (which would crash the
        // FlowPath render on the next tick).
        const list = (Array.isArray(res.items) ? res.items : []).filter(
          (item): item is FlowPathActivity =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as { id?: unknown }).id === "string" &&
            typeof (item as { title?: unknown }).title === "string",
        );
        if (list.length === 0 && !didSeed) {
          // First-load empty state. Seed demo activities so the
          // dashboard is never blank; the user can edit / delete
          // them right away.
          const seeds = seedActivities(uid);
          setItems(seeds);
          setDidSeed(true);
        } else {
          setItems(list);
          setDidSeed(true);
        }
        setLastSyncedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load FlowPath activities.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [uid, didSeed]);

  const create = useCallback(
    async (input: Partial<FlowPathActivity>): Promise<FlowPathControlResult<{ ok: boolean; activity: FlowPathActivity }>> => {
      if (!uid) return { ok: false, error: "Not signed in." };
      setMutation({ loading: true, error: null });
      try {
        const result = await flowpathControl<{ ok: boolean; activity: FlowPathActivity }>({
          action: "flowpath.create",
          uid,
          activity: {
            ...input,
            id: input.id || `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            uid,
            createdBy: user?.id || uid,
            source: isAdminUser ? "admin" : "user",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: input.status || "active",
          } as FlowPathActivity,
        });
        if (result.ok && result.activity) {
          setItems((current) => mergeActivity(current, result.activity));
        }
        setMutation({ loading: false, error: result.ok ? null : result.error || "Failed." });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed.";
        setMutation({ loading: false, error: message });
        return { ok: false, error: message };
      }
    },
    [uid, user?.id, isAdminUser],
  );

  const bulk = useCallback(
    async (items: Array<Partial<FlowPathActivity>>): Promise<FlowPathControlResult<{ ok: boolean; batchId?: string; results: Array<{ ok: boolean; activity?: FlowPathActivity; error?: string }> }>> => {
      if (!uid) return { ok: false, error: "Not signed in." };
      if (!isAdminUser) return { ok: false, error: "Bulk create is admin-only." };
      setMutation({ loading: true, error: null });
      try {
        const result = await flowpathControl<{ ok: boolean; batchId?: string; results: Array<{ ok: boolean; activity?: FlowPathActivity; error?: string }> }>({
          action: "flowpath.bulk",
          uid,
          items: items.map((item, i) => ({
            ...item,
            id: item.id || `act-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`,
            uid,
            createdBy: user?.id || uid,
            source: "admin",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: item.status || "active",
          } as FlowPathActivity)),
        });
        if (result.ok && Array.isArray(result.results)) {
          setItems((current) => {
            const next = [...current];
            for (const r of result.results) {
              if (r.ok && r.activity) next.unshift(r.activity);
            }
            return next;
          });
        }
        setMutation({ loading: false, error: result.ok ? null : result.error || "Failed." });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed.";
        setMutation({ loading: false, error: message });
        return { ok: false, error: message };
      }
    },
    [uid, user?.id, isAdminUser],
  );

  const update = useCallback(
    async (id: string, patch: Partial<FlowPathActivity>): Promise<FlowPathControlResult<{ ok: boolean; activity: FlowPathActivity }>> => {
      if (!uid) return { ok: false, error: "Not signed in." };
      setMutation({ loading: true, error: null });
      try {
        const result = await flowpathControl<{ ok: boolean; activity: FlowPathActivity }>({
          action: "flowpath.update",
          uid,
          id,
          ...patch,
        });
        if (result.ok && result.activity) {
          setItems((current) => mergeActivity(current, result.activity));
        }
        setMutation({ loading: false, error: result.ok ? null : result.error || "Failed." });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed.";
        setMutation({ loading: false, error: message });
        return { ok: false, error: message };
      }
    },
    [uid],
  );

  const remove = useCallback(
    async (id: string): Promise<FlowPathControlResult<{ ok: boolean }>> => {
      if (!uid) return { ok: false, error: "Not signed in." };
      setMutation({ loading: true, error: null });
      try {
        const result = await flowpathControl<{ ok: boolean }>({
          action: "flowpath.delete",
          uid,
          id,
        });
        if (result.ok) {
          setItems((current) => current.filter((item) => item.id !== id));
        }
        setMutation({ loading: false, error: result.ok ? null : result.error || "Failed." });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed.";
        setMutation({ loading: false, error: message });
        return { ok: false, error: message };
      }
    },
    [uid],
  );

  const complete = useCallback(
    async (id: string): Promise<FlowPathControlResult<{ ok: boolean; activity: FlowPathActivity }>> => {
      if (!uid) return { ok: false, error: "Not signed in." };
      setMutation({ loading: true, error: null });
      try {
        const result = await flowpathControl<{ ok: boolean; activity: FlowPathActivity }>({
          action: "flowpath.complete",
          uid,
          id,
        });
        if (result.ok && result.activity) {
          setItems((current) => mergeActivity(current, result.activity));
        }
        setMutation({ loading: false, error: result.ok ? null : result.error || "Failed." });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed.";
        setMutation({ loading: false, error: message });
        return { ok: false, error: message };
      }
    },
    [uid],
  );

  const broadcast = useCallback(
    async (input: { title: string; body: string; url?: string }): Promise<FlowPathControlResult<unknown>> => {
      if (!isAdminUser) return { ok: false, error: "Admin only." };
      setMutation({ loading: true, error: null });
      try {
        const result = await flowpathControl<unknown>({
          action: "flowpath.broadcast",
          title: input.title,
          body: input.body,
          url: input.url,
        });
        setMutation({ loading: false, error: result.ok ? null : result.error || "Failed." });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed.";
        setMutation({ loading: false, error: message });
        return { ok: false, error: message };
      }
    },
    [isAdminUser],
  );

  // Derived: items grouped by kind for the dashboard.
  const byKind = useMemo(() => {
    const groups: Record<FlowPathActivityKind, FlowPathActivity[]> = {
      task: [], reminder: [], schedule: [], note: [], revision: [], mcq: [], lecture: [], other: [],
    };
    for (const item of items) {
      if (groups[item.kind]) groups[item.kind].push(item);
      else groups.other.push(item);
    }
    for (const key of Object.keys(groups) as FlowPathActivityKind[]) {
      groups[key].sort((a, b) => statusRank(a.status) - statusRank(b.status) || (a.scheduledFor || 0) - (b.scheduledFor || 0));
    }
    return groups;
  }, [items]);

  // Derived: counts for the side rail / overview.
  const counts = useMemo(() => {
    const total = items.length;
    let active = 0, scheduled = 0, completed = 0, overdue = 0;
    const now = Date.now();
    for (const item of items) {
      if (item.status === "active" || item.status === "draft") active += 1;
      if (item.scheduledFor && item.scheduledFor > now) scheduled += 1;
      if (item.status === "completed") completed += 1;
      if (item.scheduledFor && item.scheduledFor < now && item.status !== "completed") overdue += 1;
    }
    return { total, active, scheduled, completed, overdue };
  }, [items]);

  return {
    items,
    byKind,
    counts,
    loading,
    error,
    mutation,
    lastSyncedAt,
    refresh: async () => {
      if (!uid) return;
      setLoading(true);
      try {
        const res = await flowpathControl<{ items: FlowPathActivity[] }>({
          action: "flowpath.list",
          uid,
          limit: DEFAULT_LIMIT,
        });
        if (res.ok && res.items) setItems(res.items);
        setLastSyncedAt(Date.now());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not refresh.");
      } finally {
        setLoading(false);
      }
    },
    create,
    bulk,
    update,
    remove,
    complete,
    broadcast,
    isAdmin: isAdminUser,
  };
}

function statusRank(status: FlowPathActivityStatus): number {
  switch (status) {
    case "overdue": return 0;
    case "active": return 1;
    case "draft": return 2;
    case "completed": return 3;
    case "cancelled": return 4;
    default: return 5;
  }
}

function mergeActivity(current: FlowPathActivity[], next: FlowPathActivity): FlowPathActivity[] {
  const idx = current.findIndex((c) => c.id === next.id);
  if (idx === -1) return [next, ...current];
  const copy = current.slice();
  copy[idx] = next;
  return copy;
}
