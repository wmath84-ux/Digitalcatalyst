import { useCallback, useEffect, useMemo, useState } from "react";
import type { Activity, ActivityType } from "../types/flowpath";
import {
  buildTimeLabel,
  deriveStatus,
  determineCurrentId,
  loadActivities,
  makeId,
  persistActivities,
  typeCreatesDefault,
} from "../lib/activityService";
import { LEAD_SENTINEL } from "../lib/layout";

export interface CreateActivityInput {
  type: ActivityType;
  title: string;
  description?: string;
  datetime: string; // ISO string
  extra?: Record<string, unknown>;
  /** insert immediately after this activity id; omit to append at end */
  afterId?: string | null;
}

export function useFlowPath() {
  const [activities, setActivities] = useState<Activity[]>(() => loadActivities());
  const [pulseToken, setPulseToken] = useState<{ id: string; key: number } | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  useEffect(() => {
    persistActivities(activities);
  }, [activities]);

  const currentId = useMemo(() => determineCurrentId(activities), [activities]);

  const ordered = useMemo(
    () => [...activities].sort((a, b) => a.order - b.order),
    [activities]
  );

  const withStatus = useMemo(
    () => ordered.map((activity) => ({ activity, status: deriveStatus(activity, currentId) })),
    [ordered, currentId]
  );

  const createActivity = useCallback((input: CreateActivityInput) => {
    setActivities((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      let insertIndex = sorted.length;
      if (input.afterId === LEAD_SENTINEL) {
        insertIndex = 0;
      } else if (input.afterId) {
        const idx = sorted.findIndex((a) => a.id === input.afterId);
        if (idx !== -1) insertIndex = idx + 1;
      }

      const date = new Date(input.datetime);
      const base = {
        id: makeId(input.type),
        type: input.type,
        title: input.title || "Untitled",
        description: input.description,
        datetime: input.datetime,
        timeLabel: buildTimeLabel(date),
        createdAt: Date.now(),
        order: 0,
        ...typeCreatesDefault(input.type),
        ...(input.extra ?? {}),
      } as Activity;

      const next = [...sorted];
      next.splice(insertIndex, 0, base);
      const reindexed = next.map((a, i) => ({ ...a, order: i }));
      setJustCreatedId(base.id);
      return reindexed;
    });
  }, []);

  const completeActivity = useCallback((id: string) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, completedAt: Date.now() } : a))
    );
    setPulseToken({ id, key: Date.now() });
  }, []);

  const uncompleteActivity = useCallback((id: string) => {
    setActivities((prev) =>
      prev.map((a) => (a.id === id ? { ...a, completedAt: undefined } : a))
    );
  }, []);

  const updateActivity = useCallback(
    (id: string, patch: {
      title?: string;
      description?: string;
      datetime?: string;
      extra?: Record<string, unknown>;
    }) => {
      setActivities((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          // Build the next activity without erasing the per-type required
          // fields (priority for task, progress for revision, etc.). We only
          // touch title / description / datetime from the patch, then merge
          // any extra overrides for type-specific fields.
          const next: Activity = { ...a };
          if (patch.title !== undefined) next.title = patch.title;
          if (patch.description !== undefined) next.description = patch.description;
          if (patch.datetime !== undefined) {
            next.datetime = patch.datetime;
            next.timeLabel = buildTimeLabel(new Date(patch.datetime));
          }
          if (patch.extra) {
            for (const [k, v] of Object.entries(patch.extra)) {
              (next as unknown as Record<string, unknown>)[k] = v;
            }
          }
          return next;
        })
      );
    },
    []
  );

  const deleteActivity = useCallback((id: string) => {
    setActivities((prev) => {
      const filtered = prev.filter((a) => a.id !== id);
      return filtered.map((a, i) => ({ ...a, order: i }));
    });
    setJustCreatedId((prev) => (prev === id ? null : prev));
  }, []);

  return {
    items: withStatus,
    currentId,
    createActivity,
    completeActivity,
    uncompleteActivity,
    updateActivity,
    deleteActivity,
    pulseToken,
    justCreatedId,
    clearJustCreated: () => setJustCreatedId(null),
  };
}
