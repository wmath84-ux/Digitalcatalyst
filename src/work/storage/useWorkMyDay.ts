import { liveQuery } from "dexie";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORK_DEVICE_UID } from "../workIdentity";
import {
  createWorkMyDayItem,
  createWorkMyDayNotebook,
  getWorkMyDayItem,
  deleteWorkMyDayItem,
  deleteWorkMyDayNotebook,
  renameWorkMyDayNotebook,
  toggleWorkMyDayItem,
  updateWorkMyDayItem,
  type WorkMyDayItem,
  type WorkMyDayItemDraft,
  type WorkMyDayNotebook,
} from "./workMyDay";
import { workDatabase } from "./workDb";
import { reconcileWorkReminders, stopForegroundWorkReminders } from "./workReminders";

export interface WorkMyDayController {
  items: WorkMyDayItem[];
  notebooks: WorkMyDayNotebook[];
  loading: boolean;
  error: string | null;
  getItem: (id: string) => Promise<WorkMyDayItem | null>;
  createItem: (draft?: WorkMyDayItemDraft) => Promise<WorkMyDayItem>;
  updateItem: (id: string, patch: WorkMyDayItemDraft) => Promise<WorkMyDayItem | null>;
  toggleComplete: (id: string) => Promise<WorkMyDayItem | null>;
  removeItem: (id: string) => Promise<void>;
  createNotebook: (title: string, parentId?: string) => Promise<WorkMyDayNotebook>;
  renameNotebook: (id: string, title: string) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;
}

export default function useWorkMyDay(): WorkMyDayController {
  const [items, setItems] = useState<WorkMyDayItem[]>([]);
  const [notebooks, setNotebooks] = useState<WorkMyDayNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const notebooksRef = useRef(notebooks);
  notebooksRef.current = notebooks;

  useEffect(() => {
    let cancelled = false;
    const subscription = liveQuery(async () => {
      const database = workDatabase();
      const [rows, folders] = await Promise.all([
        database.myDayItems.where("ownerId").equals(WORK_DEVICE_UID).toArray(),
        database.myDayNotebooks.where("ownerId").equals(WORK_DEVICE_UID).toArray(),
      ]);
      return {
        items: rows.filter((item) => !item.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt),
        notebooks: folders.filter((folder) => !folder.deletedAt).sort((a, b) => a.createdAt - b.createdAt),
      };
    }).subscribe({
      next: (value) => {
        if (cancelled) return;
        setItems(value.items);
        setNotebooks(value.notebooks);
        setLoading(false);
        setError(null);
      },
      error: (thrown: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(thrown instanceof Error ? thrown.message : "Work could not read this device's My Day library.");
      },
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // A starter folder makes the drawer useful on the very first visit. It is a
  // Dexie-only write and does not create a cloud account or Joplin row.
  useEffect(() => {
    let cancelled = false;
    void workDatabase().myDayNotebooks.where("ownerId").equals(WORK_DEVICE_UID).filter((row) => !row.deletedAt).count()
      .then((count) => {
        if (!cancelled && count === 0) return createWorkMyDayNotebook("Inbox");
        return undefined;
      })
      .catch((thrown: unknown) => {
        if (!cancelled) setError(thrown instanceof Error ? thrown.message : "Could not create the local Inbox folder.");
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    void reconcileWorkReminders(items);
    return () => stopForegroundWorkReminders();
  }, [items, loading]);

  const getItem = useCallback((id: string) => getWorkMyDayItem(id, WORK_DEVICE_UID), []);
  const createItem = useCallback(async (draft: WorkMyDayItemDraft = {}) => {
    const notebookId = draft.notebookId || notebooksRef.current[0]?.id;
    return createWorkMyDayItem({ ...draft, ...(notebookId ? { notebookId } : {}) }, WORK_DEVICE_UID);
  }, []);
  const updateItem = useCallback((id: string, patch: WorkMyDayItemDraft) =>
    updateWorkMyDayItem(id, patch, WORK_DEVICE_UID), []);
  const toggleComplete = useCallback((id: string) => toggleWorkMyDayItem(id, WORK_DEVICE_UID), []);
  const removeItem = useCallback((id: string) => deleteWorkMyDayItem(id, WORK_DEVICE_UID), []);
  const createNotebook = useCallback((title: string, parentId?: string) =>
    createWorkMyDayNotebook(title, parentId, WORK_DEVICE_UID), []);
  const renameNotebook = useCallback((id: string, title: string) =>
    renameWorkMyDayNotebook(id, title, WORK_DEVICE_UID), []);
  const deleteNotebook = useCallback((id: string) => deleteWorkMyDayNotebook(id, WORK_DEVICE_UID), []);

  return useMemo(() => ({
    items, notebooks, loading, error, getItem, createItem, updateItem, toggleComplete, removeItem,
    createNotebook, renameNotebook, deleteNotebook,
  }), [items, notebooks, loading, error, getItem, createItem, updateItem, toggleComplete, removeItem, createNotebook, renameNotebook, deleteNotebook]);
}
