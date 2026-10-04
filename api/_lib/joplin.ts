// api/_lib/joplin.ts
//
// The ONE server write path for the Joplin My Day workspace.
//
// Why a server path at all (§58): the day the legacy planner shipped, the
// allowance was consumed by `/api/myday` inside a Firestore transaction
// (`firestore.rules` refuses direct owner writes to `myDay/*` and
// `myDayUsage/*` for exactly that reason). The Joplin workspace replaces the
// planner but must not replace the allowance, so every *creation* — a note, a
// notebook, a tag, an attachment, a schedule — arrives here, where the same
// `accessSnapshot` the legacy endpoint uses decides whether it is allowed and
// consumes one unit of the same daily counter. There is exactly one counter:
// a learner who spent today's free creation in the planner cannot spend a
// second one in the workspace.
//
// What this module owns:
//
//   POST /api/joplin/items      create one canonical row
//                               (`joplinItems` / `joplinTags` / `joplinResources`)
//   POST /api/joplin/schedules  create one schedule row (`scheduledItems`)
//   POST /api/joplin/migrate    write ONE migration phase (idempotent, staged)
//   POST /api/joplin/resources  create the attachment metadata row, then the
//                               client uploads the bytes and merges the URL
//
// What it does not own: updates and deletes. Those are a client merge write
// guarded by `rev`/`updated_time` (§96 conflict policy) and authorised by
// rules, because an edit must work offline and must never consume an
// allowance. Creates cannot be done offline — a queued create is flushed
// through this endpoint (`joplinSyncBridge.flushSyncQueue`).
//
// Idempotency: every row id is deterministic (32-hex, derived from the
// workspace identity), so a retry after a network timeout finds the row
// already present and returns `{ ok: true, replayed: true }` *without*
// consuming a second allowance unit. Two phones creating the same note id
// cannot double-charge the learner.

import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { getSubscriptionGateSettings } from "./subscriptionGate.js";
import { accessSnapshot, validTimeZone } from "./myDay.js";

/** Collections a learner may create through this endpoint. */
export const joplinCollections = {
  items: "joplinItems",
  tags: "joplinTags",
  resources: "joplinResources",
} as const;

const SCHEDULES_COLLECTION = "scheduledItems";

/** 3.8 MB — under Vercel's 4.5 MB serverless request-body ceiling. */
const MAX_REQUEST_BYTES = 3_800_000;
const MAX_ITEM_BODY_BYTES = 400_000;
const MAX_TITLE_CHARS = 500;
const MAX_ROW_BYTES = 600_000;
const MAX_MIGRATION_ROWS = 400;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const BATCH_LIMIT = 300;

const ALLOWED_RESOURCE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "video/mp4",
];

const SCHEDULE_TARGET_TYPES = ["note", "todo", "notebook", "tag", "web-clip", "resource", "custom"];
const RECURRENCE_FREQS = ["once", "daily", "weekly", "weekdays", "monthly", "interval"];

type Row = Record<string, unknown>;

const asRecord = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};

const text = (value: unknown, max = MAX_TITLE_CHARS): string => String(value ?? "").trim().slice(0, max);
const int = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};
const clampStringList = (value: unknown, max = 500): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    const id = text(entry, 120);
    if (id) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
};

/** Deterministic workspace ids are 32 lowercase hex chars (see `joplinIds.ts`). */
const isValidWorkspaceId = (value: unknown): boolean => /^[0-9a-f]{32}$/.test(String(value ?? ""));
/** Conflict copies have their own shape: `<id>_conflict_<epochMs>`. */
const isConflictCopyId = (value: unknown): boolean => /^[0-9a-f]{32}_conflict_\d{6,}$/.test(String(value ?? ""));

/**
 * Fields the SERVER owns. Everything else in the incoming row is preserved
 * verbatim — a Joplin field this version does not know about must survive the
 * round trip — but these can never be set by a client.
 */
function stripReserved(raw: Row): Row {
  const { ownerId: _ownerId, uid: _uid, rev: _rev, syncedAt: _syncedAt, baseRev: _baseRev, migrationSource: _migrationSource, ...rest } = raw;
  return rest;
}

const error = (statusCode: number, code: string, message: string) =>
  Object.assign(new Error(message), { statusCode, code });

const requestBytes = (value: unknown): number => {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return MAX_REQUEST_BYTES + 1;
  }
};

// ── row sanitising ─────────────────────────────────────────────────────────
//
// The client sends a fully built Joplin row. The server re-validates the
// fields it can reason about and KEEPS everything else it does not understand
// (`passthrough`-style extension tolerance, §Joplin model): a future Joplin
// field must survive a round trip through this endpoint.

function sanitizeNoteOrNotebook(raw: Row, uid: string): Row {
  const type = int(raw.type_, 0);
  const isNotebook = type === 2;
  const isNote = type === 1;
  if (!isNotebook && !isNote) {
    throw error(400, "JOPLIN_BAD_TYPE", "Only notes, to-do notes and notebooks can be created here.");
  }
  const id = String(raw.id ?? "");
  if (!isValidWorkspaceId(id) && !isConflictCopyId(id)) {
    throw error(400, "JOPLIN_BAD_ID", "That row id is not a workspace id.");
  }
  const title = text(raw.title);
  const body = String(raw.body ?? "");
  if (Buffer.byteLength(body, "utf8") > MAX_ITEM_BODY_BYTES) {
    throw error(413, "JOPLIN_BODY_TOO_LARGE", "That note is too large to sync. Split it into smaller notes.");
  }
  const parentId = text(raw.parent_id, 120);
  if (parentId && !isValidWorkspaceId(parentId)) {
    throw error(400, "JOPLIN_BAD_PARENT", "The parent notebook is not a workspace notebook.");
  }
  const now = Date.now();
  const created = int(raw.created_time, now) || now;
  const legacy = asRecord(raw.legacy);
  return {
    ...stripReserved(raw),
    id,
    ownerId: uid,
    uid,
    type_: type,
    parent_id: parentId,
    title,
    ...(isNote ? { body } : {}),
    source_url: text(raw.source_url, 2000),
    markup_language: int(raw.markup_language, 1),
    is_todo: int(raw.is_todo, 0) ? 1 : 0,
    todo_due: int(raw.todo_due, 0),
    todo_completed: int(raw.todo_completed, 0),
    created_time: created,
    updated_time: int(raw.updated_time, now) || now,
    user_created_time: int(raw.user_created_time, created) || created,
    user_updated_time: int(raw.user_updated_time, now) || now,
    deleted_time: int(raw.deleted_time, 0),
    passthrough: asRecord(raw.passthrough),
    ...(Object.keys(legacy).length ? { legacy: { type: text(legacy.type, 40), id: text(legacy.id, 200) } } : {}),
    is_conflict: int(raw.is_conflict, 0) ? 1 : 0,
    conflict_original_id: text(raw.conflict_original_id, 120),
  };
}

function sanitizeTag(raw: Row, uid: string): Row {
  const id = String(raw.id ?? "");
  if (!isValidWorkspaceId(id)) throw error(400, "JOPLIN_BAD_ID", "That tag id is not a workspace id.");
  const title = text(raw.title, 120);
  if (!title) throw error(400, "JOPLIN_BAD_TITLE", "A tag needs a name.");
  const now = Date.now();
  return {
    ...stripReserved(raw),
    passthrough: asRecord(raw.passthrough),
    id,
    ownerId: uid,
    uid,
    type_: 5,
    title,
    created_time: int(raw.created_time, now) || now,
    updated_time: int(raw.updated_time, now) || now,
    deleted_time: int(raw.deleted_time, 0),
  };
}

function sanitizeResource(raw: Row, uid: string): Row {
  const id = String(raw.id ?? "");
  if (!isValidWorkspaceId(id)) throw error(400, "JOPLIN_BAD_ID", "That attachment id is not a workspace id.");
  const storagePath = text(raw.storagePath, 400);
  const expectedPrefix = `myDayWorkspace/${uid}/resources/${id}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw error(400, "JOPLIN_BAD_PATH", "The attachment must be stored under your own workspace folder.");
  }
  const mime = text(raw.mime, 120) || "application/octet-stream";
  if (!ALLOWED_RESOURCE_MIME.includes(mime)) {
    throw error(415, "JOPLIN_MIME_NOT_ALLOWED", "That file type cannot be attached.");
  }
  const size = Math.max(0, int(raw.size, 0));
  if (size > MAX_ATTACHMENT_BYTES) {
    throw error(413, "JOPLIN_RESOURCE_TOO_LARGE", "Attachments are limited to 25 MB.");
  }
  const now = Date.now();
  return {
    ...stripReserved(raw),
    passthrough: asRecord(raw.passthrough),
    id,
    ownerId: uid,
    uid,
    type_: 4,
    title: text(raw.title),
    mime,
    file_extension: text(raw.file_extension, 20),
    size,
    storagePath,
    note_ids: clampStringList(raw.note_ids ?? raw.noteIds),
    created_time: int(raw.created_time, now) || now,
    updated_time: int(raw.updated_time, now) || now,
    deleted_time: int(raw.deleted_time, 0),
  };
}

/**
 * Validate a schedule row.
 *
 * The client's `scheduledItem.ts` owns the full rule set; this is the server's
 * copy of the invariants that must never reach the database through a crafted
 * request. It is deliberately a *subset*: anything the client accepted and the
 * server does not understand is still stored, because the schedule shape is the
 * one thing both sides compute occurrences from.
 */
function sanitizeSchedule(raw: Row, uid: string): Row {
  const id = String(raw.id ?? "");
  if (!isValidWorkspaceId(id)) throw error(400, "JOPLIN_BAD_ID", "That schedule id is not a workspace id.");
  const targetType = String(raw.targetType ?? "");
  if (!SCHEDULE_TARGET_TYPES.includes(targetType)) {
    throw error(400, "JOPLIN_BAD_TARGET", "That schedule target is not supported.");
  }
  const dueAt = int(raw.dueAt, 0);
  if (!dueAt) throw error(400, "JOPLIN_BAD_DUE", "A schedule needs a first occurrence.");
  const timeZone = validTimeZone(raw.timeZone);
  const recurrence = asRecord(raw.recurrence);
  const freq = String(recurrence.freq ?? "once");
  if (!RECURRENCE_FREQS.includes(freq)) {
    throw error(400, "JOPLIN_BAD_RECURRENCE", "That recurrence is not supported.");
  }
  const weekdaysRaw = recurrence.weekdays ?? recurrence.byWeekday;
  const weekdays = Array.isArray(weekdaysRaw)
    ? (weekdaysRaw as unknown[]).map((d) => int(d, 0)).filter((d) => d >= 0 && d <= 6)
    : undefined;
  const dayOfMonth = int(recurrence.dayOfMonth ?? recurrence.monthDay, 0);
  const intervalMinutes = int(recurrence.intervalMinutes, 0);
  const count = Math.max(0, int(recurrence.count, 0));
  const until = Math.max(0, int(recurrence.until, 0));
  const now = Date.now();
  return {
    ...stripReserved(raw),
    passthrough: asRecord(raw.passthrough),
    id,
    ownerId: uid,
    uid,
    targetType,
    targetId: text(raw.targetId, 120),
    notebookId: text(raw.notebookId, 120),
    title: text(raw.title) || "Reminder",
    body: text(raw.body, 2000),
    dueAt,
    timeZone,
    endAt: int(raw.endAt, 0),
    durationMinutes: Math.max(0, int(raw.durationMinutes, 0)),
    recurrence: {
      freq,
      interval: Math.max(1, int(recurrence.interval, 1)),
      ...(weekdays && weekdays.length ? { weekdays, byWeekday: weekdays } : {}),
      ...(dayOfMonth ? { dayOfMonth, monthDay: dayOfMonth } : {}),
      ...(intervalMinutes ? { intervalMinutes } : {}),
      ...(count ? { count } : {}),
      ...(until ? { until } : {}),
    },
    enabled: raw.enabled === false ? false : true,
    completionHandling: ["continue", "stop-on-complete", "disable-after-fire"].includes(String(raw.completionHandling))
      ? String(raw.completionHandling)
      : "continue",
    deepLink: text(raw.deepLink, 400) || `#/my-day?schedule=${id}`,
    lastFiredKey: text(raw.lastFiredKey, 120),
    lastFiredAt: int(raw.lastFiredAt, 0),
    deleted: raw.deleted === true,
    createdAt: int(raw.createdAt, now) || now,
    updatedAt: int(raw.updatedAt, now) || now,
  };
}

const sanitizeRow = (uid: string, collection: string, raw: Row): Row => {
  if (collection === joplinCollections.items) return sanitizeNoteOrNotebook(raw, uid);
  if (collection === joplinCollections.tags) return sanitizeTag(raw, uid);
  if (collection === joplinCollections.resources) return sanitizeResource(raw, uid);
  if (collection === SCHEDULES_COLLECTION) return sanitizeSchedule(raw, uid);
  throw error(400, "JOPLIN_BAD_COLLECTION", "That workspace collection cannot be written from a client.");
};

// ── the write ──────────────────────────────────────────────────────────────

type WriteOutcome = { ok: true; rev: number; replayed: boolean; id: string; allowNew: boolean };

/**
 * Create one row, consuming ONE unit of the shared daily allowance.
 *
 * Runs in a transaction so the entitlement read, the existence check and the
 * counter increment cannot interleave with a second device doing the same
 * thing. A row that already exists is a replay: it is returned untouched, and
 * the allowance is not touched either.
 */
export async function createJoplinRow(params: {
  uid: string;
  collection: string;
  raw: Row;
  clientTimeZone: string;
}): Promise<WriteOutcome> {
  const { uid, collection, clientTimeZone } = params;
  const row = sanitizeRow(uid, collection, params.raw);
  const id = String(row.id);
  const db = adminDb();
  const rowRef = db.collection("users").doc(uid).collection(collection).doc(id);
  const featureRef = db.collection("subscriptionFeatures").doc("my-day");
  const subscriptionRef = db.collection("users").doc(uid).collection("subscription").doc("current");
  const usageRef = db.collection("users").doc(uid).collection("myDayUsage").doc("current");
  const gateSettings = await getSubscriptionGateSettings();

  return db.runTransaction(async (tx) => {
    const [featureSnap, subscriptionSnap, usageSnap, existing] = await Promise.all([
      tx.get(featureRef),
      tx.get(subscriptionRef),
      tx.get(usageRef),
      tx.get(rowRef),
    ]);
    if (existing.exists) {
      const data = asRecord(existing.data());
      return { ok: true as const, rev: int(data.rev, 1) || 1, replayed: true, id, allowNew: false };
    }
    const requestedTimeZone = validTimeZone(clientTimeZone);
    const access = accessSnapshot(
      featureSnap.exists ? asRecord(featureSnap.data()) : null,
      asRecord(subscriptionSnap.data()),
      asRecord(usageSnap.data()),
      requestedTimeZone,
      Date.now(),
      gateSettings,
    );
    if (!access.canCreate) {
      throw error(
        403,
        "MYDAY_DAILY_FREE_USED",
        access.freeLimit === 0
          ? "Your plan currently includes browse-only My Day access. Subscribe to create items."
          : `Today's ${access.freeLimit} free My Day creation${access.freeLimit === 1 ? "" : "s"} ${access.freeUsed >= access.freeLimit ? "has" : "would be"} used. Subscribe for unlimited creation or return after the daily reset.`,
      );
    }
    const now = Date.now();
    const stored = { ...row, rev: 1, updated_time: now, syncedAt: now, created_time: int(row.created_time, now) || now };
    tx.set(rowRef, stored, { merge: false });
    tx.set(
      usageRef,
      {
        uid,
        dayKey: access.dayKey,
        dayCount: access.unlimited ? access.freeUsed : access.freeUsed + 1,
        timeZone: access.timeZone,
        freeLimit: access.freeLimit,
        lastCreatedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    return { ok: true as const, rev: 1, replayed: false, id, allowNew: true };
  });
}

/**
 * Write many rows for one migration phase.
 *
 * Migration is a transport of data the learner ALREADY owns, so it does not
 * consume the daily allowance — but it is still staged, idempotent and
 * resumable: rows that already exist are reported as written and never
 * overwritten (a second run cannot duplicate or clobber an edit made after the
 * first run). Batches are capped well under Firestore's 500-write limit.
 */
async function writeMigrationRows(uid: string, collection: string, raws: Row[]): Promise<string[]> {
  if (!raws.length) return [];
  const db = adminDb();
  const collectionRef = db.collection("users").doc(uid).collection(collection);
  const rows = raws.map((raw) => sanitizeRow(uid, collection, raw));
  const refs = rows.map((row) => collectionRef.doc(String(row.id)));
  const written: string[] = [];

  const existing = await db.getAll(...refs);
  const missing: Row[] = [];
  existing.forEach((snapshot, index) => {
    if (snapshot.exists) written.push(String(rows[index].id));
    else missing.push(rows[index]);
  });

  const now = Date.now();
  for (let start = 0; start < missing.length; start += BATCH_LIMIT) {
    const slice = missing.slice(start, start + BATCH_LIMIT);
    const batch = db.batch();
    for (const row of slice) {
      batch.set(
        collectionRef.doc(String(row.id)),
        { ...row, rev: 1, syncedAt: now, migrationSource: "myday-legacy-v1" },
        { merge: false },
      );
      written.push(String(row.id));
    }
    await batch.commit();
  }
  return written;
}

// ── handlers ───────────────────────────────────────────────────────────────

const readBody = (req: VercelRequest): Row => {
  const body = req.body;
  if (typeof body === "string") {
    try {
      return asRecord(JSON.parse(body));
    } catch {
      return {};
    }
  }
  return asRecord(body);
};

const assertBodySize = (body: Row) => {
  if (requestBytes(body) > MAX_REQUEST_BYTES) {
    throw error(413, "JOPLIN_REQUEST_TOO_LARGE", "That change is too large to sync in one request.");
  }
};

/**
 * Create one canonical row.
 *
 * Accepts the shape the sync bridge sends (`{ collection, item, clientTimeZone }`)
 * and the `{ action: "joplin.item.create", … }` shape a queued or older client
 * may send.
 */
export async function handleJoplinItems(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return void res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  try {
    const { uid } = await requireFirebaseUser(req);
    const body = readBody(req);
    assertBodySize(body);
    const collection = String(body.collection ?? joplinCollections.items);
    const raw = asRecord(body.item ?? body.row);
    const outcome = await createJoplinRow({ uid, collection, raw, clientTimeZone: String(body.clientTimeZone ?? "") });
    res.status(200).json({ ok: true, id: outcome.id, rev: outcome.rev, replayed: outcome.replayed });
  } catch (caught) {
    errorResponse(res, caught, "Could not save that item.");
  }
}

/** Create one schedule row. Accepts `{ schedule }` and `{ collection, item }`. */
export async function handleJoplinSchedules(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return void res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  try {
    const { uid } = await requireFirebaseUser(req);
    const body = readBody(req);
    assertBodySize(body);
    const raw = asRecord(body.schedule ?? body.item ?? body.row);
    const outcome = await createJoplinRow({ uid, collection: SCHEDULES_COLLECTION, raw, clientTimeZone: String(body.clientTimeZone ?? "") });
    res.status(200).json({ ok: true, id: outcome.id, rev: outcome.rev, replayed: outcome.replayed });
  } catch (caught) {
    errorResponse(res, caught, "Could not save that reminder.");
  }
}

/**
 * One migration phase.
 *
 * The client computes the plan (pure, tested, `joplinMigration.ts`) and sends
 * the rows for ONE phase; the server writes them idempotently and answers with
 * the ids it actually stored, which the client feeds to `verifyMigrationPlan`.
 * A phase that fails leaves its marker incomplete, so the next run resumes
 * exactly there and legacy data is never deleted (§ migration contract).
 */
export async function handleJoplinMigrate(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return void res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  try {
    const { uid } = await requireFirebaseUser(req);
    const body = readBody(req);
    assertBodySize(body);
    const phase = String(body.phase ?? "");
    if (!["tasks", "notes", "reminders", "schedule"].includes(phase)) {
      throw error(400, "JOPLIN_BAD_PHASE", "Unknown migration phase.");
    }
    const notebooks = Array.isArray(body.notebooks) ? (body.notebooks as Row[]) : [];
    const notes = Array.isArray(body.notes) ? (body.notes as Row[]) : [];
    const plainNotes = Array.isArray(body.plainNotes) ? (body.plainNotes as Row[]) : [];
    const tags = Array.isArray(body.tags) ? (body.tags as Row[]) : [];
    const schedules = Array.isArray(body.schedules) ? (body.schedules as Row[]) : [];
    const rows = notes.length + plainNotes.length + tags.length + schedules.length;
    if (rows > MAX_MIGRATION_ROWS) {
      throw error(413, "JOPLIN_MIGRATION_PHASE_TOO_LARGE", "This migration phase is too large for one request. Nothing was lost — the phase will retry.");
    }

    // Notebooks and tags are shared across every phase: writing them first means
    // a note can never land in a notebook that does not exist yet.
    const notebookIds = await writeMigrationRows(uid, joplinCollections.items, notebooks);
    const tagIds = await writeMigrationRows(uid, joplinCollections.tags, tags);
    const noteIds = await writeMigrationRows(uid, joplinCollections.items, [...notes, ...plainNotes]);
    const scheduleIds = await writeMigrationRows(uid, SCHEDULES_COLLECTION, schedules);

    res.status(200).json({
      ok: true,
      phase,
      written: { noteIds, notebookIds, tagIds, scheduleIds },
      counts: { notebooks: notebooks.length, notes: noteIds.length, tags: tagIds.length, schedules: scheduleIds.length },
    });
  } catch (caught) {
    errorResponse(res, caught, "Could not migrate that part of My Day.");
  }
}

/**
 * Attachment metadata.
 *
 * The metadata row is written here (so the allowance and the owner path are
 * server-verified); the bytes then go to Storage from the client, which merges
 * the download `url` back into the same row. If the upload fails the row stays
 * with `metadataPending`, which is the recoverable direction.
 */
export async function handleJoplinResources(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return void res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  try {
    const { uid } = await requireFirebaseUser(req);
    const body = readBody(req);
    assertBodySize(body);
    const raw = asRecord(body.resource ?? body.item ?? body.row);
    const outcome = await createJoplinRow({ uid, collection: joplinCollections.resources, raw, clientTimeZone: String(body.clientTimeZone ?? "") });
    res.status(200).json({ ok: true, id: outcome.id, rev: outcome.rev, replayed: outcome.replayed });
  } catch (caught) {
    errorResponse(res, caught, "Could not attach that file.");
  }
}

export type JoplinRoute = "joplin/items" | "joplin/schedules" | "joplin/migrate" | "joplin/resources";

export async function handleJoplinRoute(req: VercelRequest, res: VercelResponse, route: JoplinRoute): Promise<void> {
  if (route === "joplin/items") return handleJoplinItems(req, res);
  if (route === "joplin/schedules") return handleJoplinSchedules(req, res);
  if (route === "joplin/migrate") return handleJoplinMigrate(req, res);
  return handleJoplinResources(req, res);
}
