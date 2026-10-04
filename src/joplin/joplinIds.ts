// src/joplin/joplinIds.ts
//
// Deterministic identifiers for the My Day Joplin workspace.
//
// Joplin identifies every object (`BaseItem`) with a 32-character lowercase
// hex id. The workspace keeps that shape so a document written by the
// Digitalcatalyst bridge can be handed to the real Joplin application (and
// back) without an id translation table.
//
// Everything here is PURE and dependency-free on purpose:
//
//   · the legacy → Joplin migration must be IDEMPOTENT (`joplinMyDayMigrationV1`),
//     so an old task id has to map to exactly one Joplin id on every device,
//     in every re-run, without a server round-trip;
//   · the Web Clipper, the sync bridge and the scheduler all derive ids on the
//     client, so a random `crypto.randomUUID()` would make a re-run duplicate
//     the learner's data;
//   · the unit tests run the migration against plain node, with no Firebase.
//
// FNV-1a × 4 lanes is used because it needs no WebCrypto (async), no Node
// `crypto` (absent in the browser) and no dependency. It is a name-mangler,
// not a security primitive — collision resistance against an adversary is not
// a property this needs, only stability.

const FNV_OFFSET_BASIS = 0x811c9dc5;

/** One FNV-1a pass over a string, with a lane-specific seed mixed in. */
function fnv1a(input: string, seed: number): number {
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // 32-bit FNV multiply without BigInt: hash * 16777619
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

const hex8 = (value: number): string => (value >>> 0).toString(16).padStart(8, "0");

/**
 * A Joplin-shaped id for an arbitrary stable source string.
 *
 * The four lanes give 128 bits of output (32 hex characters) so the id is the
 * same length as a Joplin one. Lane 0 is the plain FNV-1a of the source and the
 * remaining lanes mix in the seed, which keeps `joplinId("x")` and
 * `joplinId("x" + "y")` from sharing a prefix pattern.
 */
export function joplinId(source: string): string {
  const text = String(source ?? "");
  return [
    hex8(fnv1a(text, 0)),
    hex8(fnv1a(text, 0x9e3779b1)),
    hex8(fnv1a(text, 0x85ebca77)),
    hex8(fnv1a(text, 0xc2b2ae3d)),
  ].join("");
}

/** The legacy object kinds the My Day migration reads. */
export type LegacyKind = "task" | "note" | "reminder" | "schedule";

/** `legacy:<kind>:<id>` — the dedupe source of every migrated object. */
export const legacySourceKey = (kind: LegacyKind, legacyId: string): string =>
  `legacy:${kind}:${String(legacyId ?? "").trim()}`;

/**
 * Joplin id for a migrated legacy object.
 *
 * Deterministic by construction: migrating the same legacy task twice produces
 * the same note id, so the second run merges into the first instead of creating
 * a duplicate. This is what makes the migration safe to resume after a partial
 * failure (see `joplinMigration.ts`).
 */
export const joplinIdForLegacy = (kind: LegacyKind, legacyId: string): string =>
  joplinId(legacySourceKey(kind, legacyId));

/** Joplin notebook/tag ids are derived from a stable workspace-scoped name. */
export const joplinIdForNamed = (scope: string, name: string): string =>
  joplinId(`${scope}:${String(name ?? "").trim().toLowerCase()}`);

/**
 * Id for a universal schedule row.
 *
 * A series gets ONE id (the recurrence is stored on the row, never expanded
 * into thousands of future documents — see `docs/joplin-myday-architecture.md`
 * §"Recurring occurrences"); the occurrence is carried by the fired
 * `occurrenceKey`, so the row count stays flat however long a repeat runs.
 */
export const scheduleIdForSeries = (seriesSource: string): string =>
  `sch_${joplinId(`schedule:${seriesSource}`).slice(0, 28)}`;

/**
 * Firestore document id for a delivered occurrence.
 *
 * Deliberately derived from the logical schedule + occurrence, never from
 * render state, so the server push, the Android local alarm and the in-app
 * bell all resolve to ONE document (§64 alarm deduplication).
 */
export const occurrenceNotificationDocId = (scheduleId: string, occurrenceKey: string): string =>
  `sch_${sanitizeDocIdSegment(scheduleId)}_${sanitizeDocIdSegment(occurrenceKey)}`;

/**
 * Firestore rejects `/` inside a document id, and treats the exact strings `.`
 * and `..` as path segments. Reserved characters are folded to `_` rather than
 * dropped so two different keys can never collapse into the same id.
 */
export function sanitizeDocIdSegment(value: string): string {
  const text = String(value ?? "").trim();
  if (!text || text === "." || text === "..") return "_";
  return text.replace(/[/\u0000-\u001f\u007f]/g, "_").slice(0, 128);
}

/**
 * Stable 31-bit numeric id for an Android local alarm.
 *
 * Android notification ids are signed 32-bit; hashing the notification key
 * (never a counter or an array index) means re-scheduling the same occurrence
 * after an edit replaces the alarm instead of adding a second one.
 */
export function alarmIdForNotificationKey(notificationKey: string): number {
  let hash = 0;
  const text = String(notificationKey ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) || 1;
}
