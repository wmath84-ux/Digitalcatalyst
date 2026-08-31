// src/flowpath/hooks/useFlowPathSync.ts
//
// One-way mirror: whenever the local FlowPath state (localStorage
// via useFlowPath) creates / updates / completes / deletes an
// activity, the same change is sent to the server multiplexer
// (/api/flowpath/control flowpath.create / update / complete /
// delete). The server is authoritative — it writes the
// flowpathActivities doc, mirrors to My Day / Revision, schedules
// the TWA local alarm, and fires the push notifications.
//
// The local state is the visual source of truth (for the 3D
// flow layout) and Firestore is the system source of truth (for
// the rest of the app). After every local mutation, the new
// state is written to Firestore with a small debounce so a flurry
// of edits becomes one network call.
//
// The sync is DIFF-based: a fingerprint snapshot of the last
// synced state decides which items are new (create), changed
// (update) or removed (delete). Sending the whole list on every
// change used to re-fire immediate push notifications and re-write
// every doc on each keystroke — and every call forced an id-token
// refresh. Only real changes leave the client now.
//
// If the network is down, the mutations queue in localStorage
// (`flowpath:pending-sync.v1`) and are replayed on the next
// successful edit. The dashboard never blocks on the network.

import { useEffect, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { flowpathControl } from "../lib/flowpathControlClient";
import type { Activity } from "../types/flowpath";
import type { FlowPathActivity } from "../types/flowpath";

const PENDING_KEY = "flowpath:pending-sync.v1";

type Pending = {
  type: "create" | "update" | "complete" | "delete";
  activityId: string;
  // payload for create / update
  payload?: Record<string, unknown>;
  // server activity id (set after create resolves)
  serverId?: string;
  // for create: the local Activity at the time of the action,
  // so we can rebuild the FlowPathActivity for the server.
  snapshot?: Activity;
  attempts: number;
  ts: number;
};

const readPending = (): Pending[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePending = (list: Pending[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
};

const toFlowPathActivity = (activity: Activity, uid: string): Partial<FlowPathActivity> => {
  const datetime = activity.datetime ? Date.parse(activity.datetime) : null;
  const base: Partial<FlowPathActivity> = {
    id: activity.id,
    uid,
    kind: activity.type,
    title: activity.title,
    description: activity.description,
    scheduledFor: Number.isFinite(datetime) ? datetime : null,
    status: activity.completedAt ? "completed" : "active",
    createdBy: uid,
    source: "user",
    createdAt: activity.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  // Per-kind fields.
  if (activity.type === "task") {
    base.taskPriority = (activity as { priority?: "low" | "medium" | "high" }).priority || "medium";
    base.taskStatus = activity.completedAt ? "completed" : (activity as { status?: "pending" | "in-progress" | "completed" }).status || "pending";
    if ((activity as { subject?: string }).subject) base.taskSubject = (activity as { subject?: string }).subject;
  } else if (activity.type === "reminder") {
    if ((activity as { time?: string }).time) base.reminderTime = (activity as { time?: string }).time;
  } else if (activity.type === "schedule") {
    // Local schedules store human labels (startLabel/endLabel) from the
    // CreateModal; merged Firestore ones carry startTime/endTime.
    // Mirror whichever flavour is present.
    const start = (activity as { startTime?: string }).startTime ?? (activity as { startLabel?: string }).startLabel;
    const end = (activity as { endTime?: string }).endTime ?? (activity as { endLabel?: string }).endLabel;
    if (start) base.scheduleStartTime = start;
    if (end) base.scheduleEndTime = end;
    base.scheduleType = ((activity as unknown as { type?: "class" | "study" | "break" | "personal" | "exam" }).type) || "personal";
  } else if (activity.type === "note") {
    base.noteColor = (activity as { color?: "amber" | "sky" | "rose" | "emerald" | "violet" }).color || "amber";
  } else if (activity.type === "revision" || activity.type === "mcq") {
    base.testConfig = {
      totalQuestions: (activity as { totalQuestions?: number }).totalQuestions || 10,
      difficulty: (activity as { difficulty?: "easy" | "medium" | "hard" | "mixed" }).difficulty || "medium",
      questionMode: (activity as { questionMode?: "theory" | "application" | "mixed" }).questionMode || "mixed",
      estimatedMinutes: (activity as { estimatedMinutes?: number }).estimatedMinutes || 15,
    };
    if ((activity as { testId?: number }).testId) base.testId = (activity as { testId?: number }).testId;
  }
  return base;
};

/**
 * Stable fingerprint of everything that matters for the server mirror.
 * `order` is excluded on purpose: re-indexing after a delete is a
 * layout-only change and must not produce a server update.
 */
const fingerprintOf = (activity: Activity): string => {
  const { order: _order, timeLabel: _timeLabel, ...rest } = activity;
  return JSON.stringify(rest);
};

/** Hook that watches the local FlowPath state and mirrors every
 *  mutation to the server multiplexer. Called once from the
 *  FlowPath page (or from the existing useFlowPath if you prefer
 *  to keep all side effects inside the same file). */
export function useFlowPathSync(items: Array<{ activity: Activity }>) {
  const { user } = useAuth();
  const debounceRef = useRef<number | null>(null);
  const replayedRef = useRef<boolean>(false);
  // id -> fingerprint of the last state mirrored to the server.
  const lastSyncRef = useRef<Map<string, string> | null>(null);

  // Replay any queued mutations from a previous offline session on
  // first mount. We don't await — each one is a single network call
  // and the server is idempotent (the doc id is stable).
  useEffect(() => {
    if (replayedRef.current) return;
    replayedRef.current = true;
    if (!user?.id) return;
    const pending = readPending();
    if (pending.length === 0) return;
    void replayQueue(pending, user.id);
  }, [user?.id]);

  // Watch the items array for changes. On any change, diff against
  // the last synced snapshot and queue only what actually moved:
  // new -> create, changed -> update, missing -> delete. The debounce
  // collapses a flurry of edits into one batch.
  useEffect(() => {
    if (!user?.id) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const uid = user.id;
      const prior = lastSyncRef.current;
      const seen = new Set<string>();
      const pending: Pending[] = [];
      for (const { activity } of items) {
        if (!activity) continue;
        seen.add(activity.id);
        const fingerprint = fingerprintOf(activity);
        const known = prior?.get(activity.id);
        if (known === undefined) {
          // Brand new locally (or the first sync of pre-existing
          // local data — the initial seed upload).
          pending.push({
            type: "create",
            activityId: activity.id,
            payload: toFlowPathActivity(activity, uid),
            snapshot: activity,
            attempts: 0,
            ts: Date.now(),
          });
        } else if (known !== fingerprint) {
          pending.push({
            type: "update",
            activityId: activity.id,
            payload: toFlowPathActivity(activity, uid),
            snapshot: activity,
            attempts: 0,
            ts: Date.now(),
          });
        }
      }
      // Queue deletes for any prior local activity not in the current
      // list. We track prior ids in localStorage so a single browser
      // session can detect deletions even after a refresh.
      const priorIds = readPriorIds();
      for (const id of priorIds) {
        if (!seen.has(id)) {
          pending.push({ type: "delete", activityId: id, attempts: 0, ts: Date.now() });
        }
      }
      writePriorIds(Array.from(seen));
      // Remember this state as the new baseline. Items whose calls
      // fail are retried via the persistent pending queue on the next
      // session; the next local edit will re-diff them anyway.
      lastSyncRef.current = new Map(
        items.filter((i) => i && i.activity).map((i) => [i.activity.id, fingerprintOf(i.activity)]),
      );
      if (pending.length > 0) void replayQueue(pending, uid);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [items, user?.id]);
}

const PRIOR_IDS_KEY = "flowpath:prior-ids.v1";
const readPriorIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRIOR_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writePriorIds = (ids: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRIOR_IDS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
};

async function replayQueue(initial: Pending[], uid: string): Promise<void> {
  let pending = [...initial];
  // Retry up to 3 times per item. Successful items leave the queue.
  for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
    const survivors: Pending[] = [];
    for (const item of pending) {
      const ok = await runOne(item, uid);
      if (!ok) {
        item.attempts += 1;
        if (item.attempts < 3) survivors.push(item);
      }
    }
    pending = survivors;
    if (pending.length > 0) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  // Whatever remains, persist so the next session retries.
  writePending(pending);
}

async function runOne(item: Pending, uid: string): Promise<boolean> {
  try {
    if (item.type === "create") {
      const res = await flowpathControl<{ activity: FlowPathActivity }>({
        action: "flowpath.create",
        uid,
        activity: item.payload,
      });
      return res.ok;
    }
    if (item.type === "update") {
      const res = await flowpathControl<{ activity: FlowPathActivity; status?: number }>({
        action: "flowpath.update",
        uid,
        id: item.activityId,
        ...(item.payload || {}),
      });
      if (res.ok) return true;
      // The server doc may not exist yet (e.g. the original create
      // never landed). Fall back to a create so the edit still
      // reaches the server instead of failing forever.
      if ((res as { status?: number }).status === 404 && item.payload) {
        const created = await flowpathControl<unknown>({
          action: "flowpath.create",
          uid,
          activity: item.payload,
        });
        return created.ok;
      }
      return false;
    }
    if (item.type === "complete") {
      const res = await flowpathControl<unknown>({
        action: "flowpath.complete",
        uid,
        id: item.activityId,
      });
      return res.ok;
    }
    if (item.type === "delete") {
      const res = await flowpathControl<unknown>({
        action: "flowpath.delete",
        uid,
        id: item.activityId,
      });
      return res.ok;
    }
  } catch {
    return false;
  }
  return false;
}
