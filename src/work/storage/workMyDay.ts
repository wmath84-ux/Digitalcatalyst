import type { Recurrence } from "../../joplin/scheduling/recurrence";
import { nextOccurrence } from "../../joplin/scheduling/recurrence";
import { richTextToPlain, sanitizeRichText } from "../../utils/richText";
import type { WorkMyDayFilter } from "./workPrefs";
import { WORK_DEVICE_UID } from "../workIdentity";
import { workDatabase } from "./workDb";

export type WorkMyDayKind = "task" | "scheduled" | "reminder" | "note";

export interface WorkMyDaySchedule {
  /** The schedule's IANA wall-clock zone; never inferred during a reminder. */
  timeZone: string;
  recurrence: Recurrence;
}

/** Work's own local item. This is not a Joplin/Firestore document. */
export interface WorkMyDayItem {
  id: string;
  ownerId: string;
  kind: WorkMyDayKind;
  title: string;
  bodyHtml?: string;
  bodyJson?: unknown;
  bodyText?: string;
  notebookId?: string;
  tags?: string[];
  completed: boolean;
  completedAt?: number;
  /** Epoch-ms due/anchor time. */
  dueAt?: number;
  allDay?: boolean;
  schedule?: WorkMyDaySchedule;
  reminderAt?: number[];
  notifiedAt?: number[];
  createdAt: number;
  updatedAt: number;
  /** Soft-delete marker, retained for recoverability and backup. */
  deletedAt?: number;
}

export interface WorkMyDayNotebook {
  id: string;
  ownerId: string;
  title: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type WorkMyDayItemDraft = Partial<Pick<
  WorkMyDayItem,
  "kind" | "title" | "bodyHtml" | "bodyJson" | "notebookId" | "tags" | "completed" | "dueAt" | "allDay" | "schedule" | "reminderAt"
>>;

const MAX_TITLE = 200;
const MAX_TAGS = 64;

export const createWorkMyDayId = (): string => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* continue with a local fallback */ }
  return `work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
};

const normalizeKind = (kind: unknown): WorkMyDayKind =>
  kind === "scheduled" || kind === "reminder" || kind === "note" ? kind : "task";

const normalizeDueAt = (value: unknown): number | undefined => {
  const dueAt = Number(value);
  return Number.isFinite(dueAt) && dueAt > 0 ? Math.round(dueAt) : undefined;
};

const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((tag) => String(tag ?? "").trim().slice(0, 64)).filter(Boolean))].slice(0, MAX_TAGS);
};

const normalizeSchedule = (schedule: unknown): WorkMyDaySchedule | undefined => {
  if (!schedule || typeof schedule !== "object") return undefined;
  const row = schedule as Record<string, unknown>;
  const recurrence = row.recurrence;
  if (!recurrence || typeof recurrence !== "object" || typeof (recurrence as Record<string, unknown>).freq !== "string") return undefined;
  const timeZone = String(row.timeZone || "UTC").trim() || "UTC";
  return { timeZone, recurrence: recurrence as Recurrence };
};

const cleanDraft = (draft: WorkMyDayItemDraft): Partial<WorkMyDayItem> => {
  const result: Partial<WorkMyDayItem> = {};
  if (draft.kind !== undefined) result.kind = normalizeKind(draft.kind);
  if (draft.title !== undefined) result.title = String(draft.title ?? "").slice(0, MAX_TITLE);
  if (draft.bodyHtml !== undefined) {
    result.bodyHtml = sanitizeRichText(String(draft.bodyHtml ?? ""));
    result.bodyText = richTextToPlain(result.bodyHtml);
  }
  if (draft.bodyJson !== undefined) result.bodyJson = draft.bodyJson;
  if (draft.notebookId !== undefined) result.notebookId = String(draft.notebookId || "");
  if (draft.tags !== undefined) result.tags = normalizeTags(draft.tags);
  if (draft.completed !== undefined) result.completed = Boolean(draft.completed);
  if (draft.dueAt !== undefined) result.dueAt = normalizeDueAt(draft.dueAt);
  if (draft.allDay !== undefined) result.allDay = Boolean(draft.allDay);
  if (draft.schedule !== undefined) result.schedule = normalizeSchedule(draft.schedule);
  if (draft.reminderAt !== undefined) result.reminderAt = Array.isArray(draft.reminderAt)
    ? draft.reminderAt.map(Number).filter((stamp) => Number.isFinite(stamp) && stamp > 0).map(Math.round).slice(0, 32)
    : [];
  return result;
};

export async function listWorkMyDayItems(ownerId = WORK_DEVICE_UID): Promise<WorkMyDayItem[]> {
  return workDatabase().myDayItems.where("ownerId").equals(ownerId).toArray();
}

export async function getWorkMyDayItem(id: string, ownerId = WORK_DEVICE_UID): Promise<WorkMyDayItem | null> {
  const item = await workDatabase().myDayItems.get(id);
  return item && item.ownerId === ownerId && !item.deletedAt ? item : null;
}

export async function listWorkMyDayNotebooks(ownerId = WORK_DEVICE_UID): Promise<WorkMyDayNotebook[]> {
  return workDatabase().myDayNotebooks.where("ownerId").equals(ownerId).toArray();
}

export async function createWorkMyDayItem(
  draft: WorkMyDayItemDraft = {},
  ownerId = WORK_DEVICE_UID,
): Promise<WorkMyDayItem> {
  const now = Date.now();
  const item: WorkMyDayItem = {
    id: createWorkMyDayId(),
    ownerId,
    kind: "task",
    title: "",
    completed: false,
    createdAt: now,
    updatedAt: now,
    ...cleanDraft(draft),
  };
  await workDatabase().myDayItems.put(item);
  return item;
}

export async function updateWorkMyDayItem(
  id: string,
  patch: WorkMyDayItemDraft,
  ownerId = WORK_DEVICE_UID,
): Promise<WorkMyDayItem | null> {
  const table = workDatabase().myDayItems;
  const current = await table.get(id);
  if (!current || current.ownerId !== ownerId || current.deletedAt) return null;
  const next = { ...current, ...cleanDraft(patch), updatedAt: Date.now() };
  if (patch.completed !== undefined) next.completedAt = next.completed ? next.updatedAt : undefined;
  await table.put(next);
  return next;
}

export async function toggleWorkMyDayItem(id: string, ownerId = WORK_DEVICE_UID): Promise<WorkMyDayItem | null> {
  const table = workDatabase().myDayItems;
  const current = await table.get(id);
  if (!current || current.ownerId !== ownerId || current.deletedAt) return null;
  const updatedAt = Date.now();
  const next = { ...current, completed: !current.completed, completedAt: !current.completed ? updatedAt : undefined, updatedAt };
  await table.put(next);
  return next;
}

export async function deleteWorkMyDayItem(id: string, ownerId = WORK_DEVICE_UID): Promise<void> {
  const table = workDatabase().myDayItems;
  const current = await table.get(id);
  if (!current || current.ownerId !== ownerId || current.deletedAt) return;
  const now = Date.now();
  await table.put({ ...current, completed: true, deletedAt: now, updatedAt: now });
}

export async function createWorkMyDayNotebook(
  title: string,
  parentId?: string,
  ownerId = WORK_DEVICE_UID,
): Promise<WorkMyDayNotebook> {
  const now = Date.now();
  const notebook: WorkMyDayNotebook = {
    id: createWorkMyDayId(), ownerId, title: String(title || "").trim().slice(0, MAX_TITLE) || "Notebook",
    ...(parentId ? { parentId } : {}), createdAt: now, updatedAt: now,
  };
  await workDatabase().myDayNotebooks.put(notebook);
  return notebook;
}

export async function renameWorkMyDayNotebook(id: string, title: string, ownerId = WORK_DEVICE_UID): Promise<void> {
  const table = workDatabase().myDayNotebooks;
  const notebook = await table.get(id);
  if (!notebook || notebook.ownerId !== ownerId || notebook.deletedAt) return;
  await table.put({ ...notebook, title: String(title || "").trim().slice(0, MAX_TITLE) || notebook.title, updatedAt: Date.now() });
}

export async function deleteWorkMyDayNotebook(id: string, ownerId = WORK_DEVICE_UID): Promise<void> {
  const table = workDatabase().myDayNotebooks;
  const notebook = await table.get(id);
  if (!notebook || notebook.ownerId !== ownerId || notebook.deletedAt) return;
  const now = Date.now();
  await table.put({ ...notebook, deletedAt: now, updatedAt: now });
  await workDatabase().myDayItems.where("notebookId").equals(id).modify((item) => {
    if (item.ownerId === ownerId && !item.deletedAt) {
      item.notebookId = undefined;
      item.updatedAt = now;
    }
  });
}

export function filterWorkMyDayItems(items: WorkMyDayItem[], filter: WorkMyDayFilter): WorkMyDayItem[] {
  const visible = items.filter((item) => !item.deletedAt).filter((item) => {
    switch (filter) {
      case "task": return item.kind === "task" && !item.completed;
      case "scheduled": return !item.completed && (item.kind === "scheduled" || Boolean(item.schedule));
      case "reminder": return !item.completed && item.kind === "reminder";
      case "note": return !item.completed && item.kind === "note";
      case "done": return item.completed;
      default: return true;
    }
  });
  return visible.sort((a, b) => {
    const aDue = a.dueAt || Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt || Number.MAX_SAFE_INTEGER;
    return aDue - bDue || b.updatedAt - a.updatedAt;
  });
}

/** Next due occurrence, computed from one local rule rather than expanded rows. */
export function nextWorkMyDayOccurrence(item: WorkMyDayItem, after = Date.now()): number | null {
  const dueAt = normalizeDueAt(item.dueAt);
  if (!dueAt) return null;
  if (!item.schedule) return dueAt > after ? dueAt : null;
  return nextOccurrence({
    dueAt,
    timeZone: item.schedule.timeZone || "UTC",
    recurrence: item.schedule.recurrence,
  }, after);
}

export function formatWorkMyDayDue(item: WorkMyDayItem, now = Date.now()): string {
  const recurring = Boolean(item.schedule && item.schedule.recurrence.freq !== "once");
  const dueAt = normalizeDueAt(item.dueAt);
  const next = nextWorkMyDayOccurrence(item, now - 1);
  if (!next) {
    if (item.completed) return "Completed";
    if (dueAt && dueAt <= now && !recurring) {
      const overdueDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(item.allDay ? {} : { hour: "numeric", minute: "2-digit" }) }).format(dueAt);
      return `Overdue · ${overdueDate}`;
    }
    return "No time set";
  }
  const date = new Date(next);
  const today = new Date(now);
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const time = item.allDay ? "" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  if (recurring) return `Repeats ${item.schedule!.recurrence.freq}${time ? ` · ${time}` : ""}`;
  if (sameDay) return item.allDay ? "Today · All day" : `Today · ${time}`;
  const dateText = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(item.allDay ? {} : { hour: "numeric", minute: "2-digit" }) }).format(date);
  return dateText;
}
