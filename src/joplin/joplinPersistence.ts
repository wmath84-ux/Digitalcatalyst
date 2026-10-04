// src/joplin/joplinPersistence.ts
//
// Firestore ⇄ model translation.
//
// Two things have to be true of everything written by the workspace:
//
//   · NO `undefined` ever reaches Firestore. The Firebase SDK throws on an
//     undefined field value, and the failure lands in the middle of a sync —
//     which is exactly how a learner's note silently fails to save. Every
//     optional field is either present with a real value or absent entirely
//     (`pruneUndefined`), the same rule `utils/productFirestoreDoc.js` applies
//     to product documents in this codebase.
//   · Numbers stay numbers. `Timestamp` fields are converted on read
//     (`timestampMs`) so a row that has been through Firestore compares equal to
//     a row built locally — otherwise every sync would look like a conflict.
//
// The field names themselves are Joplin's (see `joplinModel.ts`): the bridge must
// not invent a second dialect for the same objects.

import { Timestamp } from "firebase/firestore";
import { JoplinType } from "./joplinModel";
import type { JoplinNoteRow, JoplinNotebookRow, JoplinResourceRow, JoplinRow, JoplinTagRow } from "./joplinModel";

/** Canonical collections under `users/{uid}`. Declared once, used everywhere. */
export const JOPLIN_COLLECTIONS = {
  items: "joplinItems",
  tags: "joplinTags",
  resources: "joplinResources",
  meta: "joplinMeta",
  schedules: "scheduledItems",
} as const;

export const JOPLIN_META_DOCS = {
  profile: "profile",
  migrationV1: "migrationV1",
  syncState: "syncState",
} as const;

/** Recursively drop `undefined` (and `NaN`, which Firestore also rejects). */
export function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefined(entry)).filter((entry) => entry !== undefined) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      if (typeof entry === "number" && !Number.isFinite(entry)) continue;
      out[key] = pruneUndefined(entry);
    }
    return out as unknown as T;
  }
  return value;
}

export const rowToJson = (row: Record<string, unknown>): Record<string, unknown> => pruneUndefined({ ...row });

export const timestampMs = (value: unknown): number => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    try {
      return (value as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

/** Rebuild a model row from Firestore data, normalising every timestamp field. */
export function jsonToRow(data: Record<string, unknown>): JoplinRow {
  const base = {
    id: String(data.id ?? ""),
    ownerId: String(data.ownerId ?? ""),
    type_: Number(data.type_ ?? JoplinType.Note) as JoplinRow["type_"],
    created_time: timestampMs(data.created_time),
    user_created_time: timestampMs(data.user_created_time ?? data.created_time),
    user_updated_time: timestampMs(data.user_updated_time ?? data.updated_time),
    updated_time: timestampMs(data.updated_time),
    deleted_time: timestampMs(data.deleted_time),
    rev: Number(data.rev ?? 0),
    syncedAt: timestampMs(data.syncedAt),
    ...(data.legacy ? { legacy: data.legacy as { type: string; id: string } } : {}),
    ...(data.passthrough ? { passthrough: data.passthrough as Record<string, unknown> } : {}),
  };
  switch (base.type_) {
    case JoplinType.Notebook:
      return {
        ...base,
        type_: JoplinType.Notebook,
        title: String(data.title ?? ""),
        icon: String(data.icon ?? ""),
        parent_id: String(data.parent_id ?? ""),
      } as JoplinNotebookRow;
    case JoplinType.Tag:
      return { ...base, type_: JoplinType.Tag, title: String(data.title ?? "") } as JoplinTagRow;
    case JoplinType.Resource:
      return {
        ...base,
        type_: JoplinType.Resource,
        title: String(data.title ?? ""),
        mime: String(data.mime ?? "application/octet-stream"),
        file_extension: String(data.file_extension ?? ""),
        size: Number(data.size ?? 0),
        storagePath: String(data.storagePath ?? ""),
        note_ids: Array.isArray(data.note_ids) ? (data.note_ids as string[]) : [],
      } as JoplinResourceRow;
    default:
      return {
        ...base,
        type_: JoplinType.Note,
        parent_id: String(data.parent_id ?? ""),
        title: String(data.title ?? ""),
        body: String(data.body ?? ""),
        is_todo: Number(data.is_todo ?? 0) === 1 ? 1 : 0,
        todo_completed: timestampMs(data.todo_completed),
        todo_due: timestampMs(data.todo_due),
        source_url: String(data.source_url ?? ""),
        markup_language: Number(data.markup_language ?? 1),
        tag_ids: Array.isArray(data.tag_ids) ? (data.tag_ids as string[]) : [],
        tag_titles: Array.isArray(data.tag_titles) ? (data.tag_titles as string[]) : [],
        resource_ids: Array.isArray(data.resource_ids) ? (data.resource_ids as string[]) : [],
      } as JoplinNoteRow;
  }
}

/** Size guards mirrored by firestore.rules — one document must stay well under 1 MB. */
export const LIMITS = {
  noteBodyChars: 180_000,
  noteTitleChars: 200,
  tagTitleChars: 120,
  notebookTitleChars: 120,
  scheduleBodyChars: 900,
  noteTags: 64,
  noteResources: 64,
} as const;

/**
 * Hard-clamp a note before it is written.
 *
 * The body cap is a *transport* limit, not a product limit: the full text stays
 * in the local Joplin profile, which is the offline source of truth (§13). The
 * clamp only keeps one Firestore document legal.
 */
export function clampNoteRow(row: JoplinNoteRow): JoplinNoteRow {
  return {
    ...row,
    title: row.title.slice(0, LIMITS.noteTitleChars),
    body: row.body.length > LIMITS.noteBodyChars ? row.body.slice(0, LIMITS.noteBodyChars) : row.body,
    tag_ids: row.tag_ids.slice(0, LIMITS.noteTags),
    tag_titles: row.tag_titles.slice(0, LIMITS.noteTags).map((title) => title.slice(0, LIMITS.tagTitleChars)),
    resource_ids: row.resource_ids.slice(0, LIMITS.noteResources),
  };
}
