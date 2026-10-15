import type { UnifiedSnapshot } from "../../revision/domain/types";

export const WORK_REVISION_BACKUP_FORMAT = "digitalcatalyst-work-revision-backup";
export const WORK_REVISION_BACKUP_VERSION = 1;
export const WORK_REVISION_BACKUP_MAX_BYTES = 50 * 1024 * 1024;

export interface WorkRevisionBackupEnvelope {
  format: typeof WORK_REVISION_BACKUP_FORMAT;
  version: typeof WORK_REVISION_BACKUP_VERSION;
  namespace: "work:device";
  createdAt: string;
  snapshot: UnifiedSnapshot;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isRecordArray = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

function validateSnapshot(value: unknown): asserts value is UnifiedSnapshot {
  if (!isRecord(value)) throw new Error("This backup does not contain a valid Work Revision snapshot.");
  const arrayKeys = [
    "decks", "folders", "cards", "tags", "reviewLogs", "sessions", "tests",
    "attempts", "savedSearches", "media",
  ] as const;
  for (const key of arrayKeys) {
    if (!isRecordArray(value[key])) {
      throw new Error(`This backup is missing a valid ${key} collection.`);
    }
  }
  if (!Number.isSafeInteger(value.version) || Number(value.version) < 0) {
    throw new Error("This backup has an unsupported snapshot version.");
  }
  if (!isRecord(value.settings) || !isRecord(value.settings.catalog) || !isRecord(value.settings.custom) || !isRecord(value.settings.study)) {
    throw new Error("This backup is missing its Revision settings.");
  }

  const decks = value.decks as Record<string, unknown>[];
  const cards = value.cards as Record<string, unknown>[];
  if (decks.some((deck) => typeof deck.id !== "string" || typeof deck.name !== "string")) {
    throw new Error("This backup contains an invalid revision set.");
  }
  if (cards.some((card) => typeof card.id !== "string" || typeof card.deckId !== "string" || typeof card.front !== "string" || typeof card.back !== "string")) {
    throw new Error("This backup contains an invalid revision card.");
  }
}

/** Serialize only the Work Revision snapshot; no course or account data is read. */
export function createWorkRevisionBackup(
  snapshot: UnifiedSnapshot,
  createdAt = new Date().toISOString(),
): string {
  validateSnapshot(snapshot);
  const envelope: WorkRevisionBackupEnvelope = {
    format: WORK_REVISION_BACKUP_FORMAT,
    version: WORK_REVISION_BACKUP_VERSION,
    namespace: "work:device",
    createdAt,
    snapshot,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Parse and structurally validate an explicitly exported Work backup. */
export function parseWorkRevisionBackup(source: string): WorkRevisionBackupEnvelope {
  if (new TextEncoder().encode(source).byteLength > WORK_REVISION_BACKUP_MAX_BYTES) {
    throw new Error("This backup is larger than the 50 MB import limit.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("This file is not valid JSON. Choose a Work Revision backup file.");
  }
  if (!isRecord(parsed) || parsed.format !== WORK_REVISION_BACKUP_FORMAT) {
    throw new Error("This is not a Digitalcatalyst Work Revision backup.");
  }
  if (parsed.version !== WORK_REVISION_BACKUP_VERSION) {
    throw new Error("This backup was created by an unsupported version of Work Revision.");
  }
  if (parsed.namespace !== "work:device") {
    throw new Error("This backup does not belong to the device-only Work Revision library.");
  }
  if (typeof parsed.createdAt !== "string" || !Number.isFinite(Date.parse(parsed.createdAt))) {
    throw new Error("This backup has an invalid creation date.");
  }
  validateSnapshot(parsed.snapshot);

  return parsed as unknown as WorkRevisionBackupEnvelope;
}
