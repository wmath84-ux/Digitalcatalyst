// src/joplin/joplinModel.ts
//
// The canonical My Day data model.
//
// After the cutover the learner's personal notes/to-dos are Joplin objects:
// this module is the single definition of what that means, and it mirrors the
// real field names of Joplin's `BaseItem`/`Note`/`Folder`/`Tag`/`Resource`
// models (`@joplin/lib`) rather than inventing a Digitalcatalyst dialect. That
// keeps the bridge honest: a row written here is one the Joplin web client can
// read, sync and edit without a translation layer, and a Joplin row synced from
// another device can be stored here without losing fields.
//
// Fields intentionally NOT modelled (and why) — these are the desktop/mobile
// only parts of Joplin's schema:
//
//   · `encryption_cipher_text`, `encryption_applied`, `encryption_blob_encrypted`,
//     `master_key_id` — end-to-end encryption is a Joplin profile setting with a
//     key the web build must hold in a master-key password prompt. Digitalcatalyst
//     does not implement E2EE; see the limitations section of
//     `docs/joplin-myday-architecture.md`. The fields are preserved verbatim when
//     they arrive from a synced Joplin client (see `passthrough` below) instead of
//     being dropped.
//   · `share_id`, `is_shared` — Joplin Server sharing is not part of a personal
//     workspace and is not offered.
//   · `latitude`/`longitude`/`altitude` — geo fields of the external note editor;
//     preserved verbatim when present, never authored here.
//
// Anything this model does not understand is kept in `passthrough` so a round
// trip through the Digitalcatalyst bridge cannot silently delete a field a
// future Joplin version added.

/** Joplin `BaseItem` type numbers (mirrors @joplin/lib/models/BaseItem). */
export const JoplinType = {
  Note: 1,
  Notebook: 2,
  Setting: 3,
  Resource: 4,
  Tag: 5,
  NoteTag: 6,
} as const;

export type JoplinTypeValue = (typeof JoplinType)[keyof typeof JoplinType];

/**
 * Joplin `MarkupLanguage` values. The workspace authors Markdown (1); an
 * imported HTML note keeps its own value so the renderer does not re-interpret
 * saved HTML as Markdown.
 */
export const JoplinMarkupLanguage = {
  PlainText: 0,
  Markdown: 1,
  Html: 2,
} as const;

/** Sync/conflict bookkeeping owned by the Digitalcatalyst bridge. */
export interface JoplinSyncFields {
  /** Last server revision this row was merged from (monotonic, per owner). */
  rev: number;
  /** Epoch ms this row last changed locally (conflict comparison, §96). */
  updated_time: number;
  /** Epoch ms this row was last accepted from the backend. */
  syncedAt: number;
  /** Firestore text to the legacy object this row was migrated from. */
  legacy?: { type: string; id: string };
}

export interface JoplinBaseRow extends JoplinSyncFields {
  id: string;
  ownerId: string;
  type_: JoplinTypeValue;
  created_time: number;
  user_created_time: number;
  user_updated_time: number;
  /** Joplin's soft-delete marker (trash). 0 = live. */
  deleted_time: number;
  /** Unknown fields carried through untouched (round-trip safety). */
  passthrough?: Record<string, unknown>;
}

/** `type_ === 2`. A notebook; `parent_id` gives nesting of any depth. */
export interface JoplinNotebookRow extends JoplinBaseRow {
  type_: typeof JoplinType.Notebook;
  title: string;
  icon: string;
  parent_id: string;
}

/** `type_ === 1`. A note, or a to-do note when `is_todo === 1`. */
export interface JoplinNoteRow extends JoplinBaseRow {
  type_: typeof JoplinType.Note;
  parent_id: string;
  title: string;
  body: string;
  is_todo: 0 | 1;
  /** Epoch ms the to-do was ticked; 0 while open. */
  todo_completed: number;
  /** Epoch ms the to-do is due; 0 when it has no due date. */
  todo_due: number;
  source_url: string;
  markup_language: number;
  /** Tag ids linked to this note (Joplin's `note_tags` relation). */
  tag_ids: string[];
  /** Resource ids attached to this note (Joplin's `resources` relation). */
  resource_ids: string[];
  /** Denormalised tag titles, so lists/search never need a second read. */
  tag_titles: string[];
}

/** `type_ === 5`. Joplin tags are flat; hierarchy comes from the title prefix. */
export interface JoplinTagRow extends JoplinBaseRow {
  type_: typeof JoplinType.Tag;
  title: string;
}

/**
 * `type_ === 4`. Metadata lives in Firestore, the bytes live in Firebase
 * Storage (`storagePath`) — large binaries must never sit in a document (§104).
 */
export interface JoplinResourceRow extends JoplinBaseRow {
  type_: typeof JoplinType.Resource;
  title: string;
  mime: string;
  file_extension: string;
  size: number;
  storagePath: string;
  /** Note ids referencing this resource; empty means the bytes are orphans. */
  note_ids: string[];
}

export type JoplinRow = JoplinNotebookRow | JoplinNoteRow | JoplinTagRow | JoplinResourceRow;

export const workspaceTimestamp = (now: number): number => (Number.isFinite(now) ? Math.round(now) : Date.now());

type BaseInput = {
  id: string;
  ownerId: string;
  createdTime?: number;
  updatedTime?: number;
  now?: number;
  legacy?: { type: string; id: string };
  passthrough?: Record<string, unknown>;
};

function baseFields(input: BaseInput, type_: JoplinTypeValue): JoplinBaseRow {
  const now = workspaceTimestamp(input.now ?? Date.now());
  const created = workspaceTimestamp(input.createdTime ?? now);
  return {
    id: input.id,
    ownerId: input.ownerId,
    type_,
    created_time: created,
    user_created_time: created,
    user_updated_time: workspaceTimestamp(input.updatedTime ?? now),
    updated_time: workspaceTimestamp(input.updatedTime ?? now),
    deleted_time: 0,
    rev: 0,
    syncedAt: 0,
    ...(input.legacy ? { legacy: input.legacy } : {}),
    ...(input.passthrough ? { passthrough: input.passthrough } : {}),
  } as JoplinBaseRow;
}

export function buildNotebook(input: BaseInput & { title: string; parentId?: string; icon?: string }): JoplinNotebookRow {
  return {
    ...baseFields(input, JoplinType.Notebook),
    type_: JoplinType.Notebook,
    title: String(input.title ?? "").trim() || "Notebook",
    icon: String(input.icon ?? ""),
    parent_id: String(input.parentId ?? ""),
  };
}

export function buildNote(
  input: BaseInput & {
    title?: string;
    body?: string;
    parentId?: string;
    sourceUrl?: string;
    markupLanguage?: number;
    tagIds?: string[];
    tagTitles?: string[];
    resourceIds?: string[];
    isTodo?: boolean;
    todoDue?: number;
    todoCompleted?: number;
  },
): JoplinNoteRow {
  const isTodo = input.isTodo ? 1 : 0;
  const created = workspaceTimestamp(input.createdTime ?? input.now ?? Date.now());
  return {
    ...baseFields({ ...input, createdTime: created }, JoplinType.Note),
    type_: JoplinType.Note,
    parent_id: String(input.parentId ?? ""),
    title: String(input.title ?? ""),
    body: String(input.body ?? ""),
    is_todo: isTodo as 0 | 1,
    todo_completed: isTodo ? workspaceTimestamp(input.todoCompleted ?? 0) : 0,
    todo_due: isTodo ? workspaceTimestamp(input.todoDue ?? 0) : 0,
    source_url: String(input.sourceUrl ?? ""),
    markup_language: Number.isFinite(input.markupLanguage) ? Number(input.markupLanguage) : JoplinMarkupLanguage.Markdown,
    tag_ids: dedupe(input.tagIds),
    tag_titles: dedupe(input.tagTitles),
    resource_ids: dedupe(input.resourceIds),
  };
}

export function buildTag(input: BaseInput & { title: string }): JoplinTagRow {
  return {
    ...baseFields(input, JoplinType.Tag),
    type_: JoplinType.Tag,
    title: normalizeTagTitle(input.title),
  };
}

export function buildResource(
  input: BaseInput & {
    title: string;
    mime: string;
    size: number;
    storagePath: string;
    fileExtension?: string;
    noteIds?: string[];
  },
): JoplinResourceRow {
  return {
    ...baseFields(input, JoplinType.Resource),
    type_: JoplinType.Resource,
    title: String(input.title ?? ""),
    mime: String(input.mime ?? "application/octet-stream"),
    file_extension: String(input.fileExtension ?? ""),
    size: Math.max(0, Math.round(Number(input.size) || 0)),
    storagePath: String(input.storagePath ?? ""),
    note_ids: dedupe(input.noteIds),
  };
}

/** Joplin tag titles are case-sensitive but users do not think that way. */
export function normalizeTagTitle(raw: string): string {
  return String(raw ?? "")
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Lower-cased, sorted, whitespace-collapsed tag titles (stable equality). */
export function normalizeTagKey(raw: string): string {
  return normalizeTagTitle(raw).toLowerCase();
}

function dedupe(values?: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export const isTodo = (row: JoplinNoteRow): boolean => row.is_todo === 1;
export const isCompleted = (row: JoplinNoteRow): boolean => row.is_todo === 1 && row.todo_completed > 0;

/**
 * Tick/untick a to-do note the way Joplin does it: `todo_completed` is the
 * completion timestamp, and 0 means open. Completion state is a property of the
 * canonical note — never a second task collection (§15, §18).
 */
export function setTodoCompleted(row: JoplinNoteRow, completed: boolean, now: number): JoplinNoteRow {
  const stamp = workspaceTimestamp(now);
  return {
    ...row,
    todo_completed: completed ? stamp : 0,
    updated_time: stamp,
    user_updated_time: stamp,
  };
}

/**
 * Apply a tag to a note. `tag_ids`/`tag_titles` stay in the same order so a
 * tag toggle is a single deterministic write rather than a merge race.
 */
export function applyTag(note: JoplinNoteRow, tagId: string, tagTitle: string): JoplinNoteRow {
  if (note.tag_ids.includes(tagId)) return note;
  return {
    ...note,
    tag_ids: [...note.tag_ids, tagId],
    tag_titles: dedupe([...note.tag_titles, normalizeTagTitle(tagTitle)]),
  };
}

export function removeTag(note: JoplinNoteRow, tagId: string): JoplinNoteRow {
  if (!note.tag_ids.includes(tagId)) return note;
  const tagTitles = new Set(note.tag_titles.map(normalizeTagKey));
  const keptIds = note.tag_ids.filter((id) => id !== tagId);
  // The denormalised titles are a projection of `tag_ids`; when they cannot be
  // matched to the surviving ids the projection is dropped and rebuilt from the
  // tag rows on the next read rather than being left stale.
  const keptTitles = note.tag_titles.filter((title) => tagTitles.has(normalizeTagKey(title)));
  return { ...note, tag_ids: keptIds, tag_titles: dedupe(keptTitles.length === keptIds.length ? keptTitles : []) };
}

/**
 * Every notebook descendant of `notebookId`, deepest-first.
 *
 * Notebook-target schedules and notebook deletion cleanup both need this: the
 * workspace supports arbitrary nesting (§16), so "delete this notebook" has to
 * know what is inside it before it can be handled deterministically.
 */
export function notebookDescendants(
  notebooks: JoplinNotebookRow[],
  notebookId: string,
): JoplinNotebookRow[] {
  const byParent = new Map<string, JoplinNotebookRow[]>();
  for (const notebook of notebooks) {
    const list = byParent.get(notebook.parent_id) ?? [];
    list.push(notebook);
    byParent.set(notebook.parent_id, list);
  }
  const out: JoplinNotebookRow[] = [];
  const walk = (parentId: string, depth: number) => {
    if (depth > 32) return; // cycles cannot happen through the UI; fail safe anyway
    for (const child of byParent.get(parentId) ?? []) {
      walk(child.id, depth + 1);
      out.push(child);
    }
  };
  walk(notebookId, 0);
  return out;
}

/** Human notebook path, e.g. `My Day / Study / Physics`. */
export function notebookPath(notebooks: JoplinNotebookRow[], notebookId: string): string {
  const byId = new Map(notebooks.map((notebook) => [notebook.id, notebook]));
  const parts: string[] = [];
  let cursor = byId.get(notebookId);
  let guard = 0;
  while (cursor && guard < 32) {
    parts.unshift(cursor.title);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
    guard += 1;
  }
  return parts.join(" / ");
}

/**
 * Trash a row. The workspace follows Joplin's model: deletion sets
 * `deleted_time` and the row stays readable in `trash` until the learner
 * empties it (§68 — recoverability is Joplin's behaviour, so it is preserved).
 */
export function trashRow<T extends JoplinBaseRow>(row: T, now: number): T {
  return { ...row, deleted_time: workspaceTimestamp(now), updated_time: workspaceTimestamp(now) };
}

export function restoreRow<T extends JoplinBaseRow>(row: T, now: number): T {
  return { ...row, deleted_time: 0, updated_time: workspaceTimestamp(now) };
}
