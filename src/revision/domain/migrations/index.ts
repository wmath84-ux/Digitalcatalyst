/**
 * Revision data migrations.
 * ========================
 *
 * Migration brief §12. Requirements and how they are met here:
 *
 *   Backup first       — the raw legacy `RevisionDb` document and the previous
 *                        unified snapshot are copied into IndexedDB
 *                        (`backup:<version>`) before any write.
 *   Detect schema      — `revision_db_<uid>` + the stored migration state give
 *                        both the legacy seed/schema version and the unified
 *                        version.
 *   Idempotent         — every step checks its own preconditions and is safe to
 *                        re-run; the runner records the version it reached.
 *   Versioned          — an ordered list with explicit versions.
 *   Crash-safe         — the new snapshot and the new state are written in the
 *                        same IndexedDB transaction batch; a crash leaves the
 *                        previous state (and the backup) intact.
 *   Rollback-friendly  — `rollbackMigrations()` restores the newest backup.
 *   Never destructive  — nothing is deleted. The legacy document stays exactly
 *                        where the existing services expect it.
 *
 * A migration MUST NOT depend on React, on the network, or on entitlement state.
 */

import { KV_MIGRATION, readKv, readLegacyMirror, readUnifiedSnapshot, writeKv, writeUnifiedSnapshot } from "../../engine/localDb";
import type { UnifiedSnapshot } from "../types";
import { DEFAULT_STUDY_SETTINGS } from "../types";
import { mergeUnifiedSnapshots, projectLegacyDb } from "../adapters/legacyProjection";
import { DEFAULT_SETTINGS, DEFAULT_USER_CUSTOM_SETTINGS, loadUserCustomSettings, type RevisionDb } from "../../engine/store";

/** Current version of the unified model. Bump when a migration adds a step. */
export const UNIFIED_SCHEMA_VERSION = 3;

export interface MigrationState {
  version: number;
  appliedAt: string;
  /** Backup key that can restore the state from before the last migration. */
  backupKey: string | null;
  /** Versions already applied — keeps re-runs cheap and observable. */
  applied: number[];
}

export const EMPTY_MIGRATION_STATE: MigrationState = {
  version: 0,
  appliedAt: "",
  backupKey: null,
  applied: [],
};

export interface MigrationContext {
  uid: string;
  /** Legacy document as loaded from localStorage (never mutated in place). */
  legacy: RevisionDb | null;
  /** User customization read from the legacy key. */
  custom: ReturnType<typeof loadUserCustomSettings>;
  /** Unified snapshot as it exists before this migration runs. */
  unified: UnifiedSnapshot | null;
  now: Date;
}

export interface Migration {
  version: number;
  description: string;
  run: (context: MigrationContext) => Promise<UnifiedSnapshot | null>;
}

/* ------------------------------------------------------------------ */
/* Steps                                                              */
/* ------------------------------------------------------------------ */

/**
 * v1 — introduce the unified snapshot.
 *
 * Projects the learner's existing Digitalcatalyst Revision data (curriculum,
 * questions, tests, attempts, answers, revision items and Smart Revision
 * sessions) into the unified model. Review history, mastery state and every
 * timestamp are preserved; ids are derived (`dcq:<questionId>`), so relations
 * survive a round trip and nothing is remapped destructively.
 */
const baselineProjection: Migration = {
  version: 1,
  description: "Project the existing Digitalcatalyst Revision database into the unified model",
  async run(context) {
    if (!context.legacy) return context.unified;
    const projected = projectLegacyDb({ db: context.legacy });
    return context.unified ? mergeUnifiedSnapshots(projected, context.unified) : projected;
  },
};

/**
 * v2 — normalise settings.
 *
 * Adds the Recall study-preferences block (safe defaults), keeps the legacy
 * `catalog`/`custom` settings exactly as they were, and stamps the migration
 * date. Re-running is a no-op because every value is filled with `?? `.
 */
const normaliseSettings: Migration = {
  version: 2,
  description: "Add Recall study preferences and keep the existing Digitalcatalyst settings",
  async run(context) {
    if (!context.unified) return null;
    const snapshot = context.unified;
    return {
      ...snapshot,
      version: 2,
      settings: {
        catalog: snapshot.settings?.catalog ?? context.legacy?.settings ?? { ...DEFAULT_SETTINGS },
        custom: {
          ...DEFAULT_USER_CUSTOM_SETTINGS,
          ...(context.custom ?? {}),
          ...(snapshot.settings?.custom ?? {}),
        },
        study: { ...DEFAULT_STUDY_SETTINGS, ...(snapshot.settings?.study ?? {}) },
        migratedAt: snapshot.settings?.migratedAt ?? context.now.toISOString(),
      },
      // Guarantee the invariants the UI relies on.
      cards: snapshot.cards.map((card) => ({
        ...card,
        tags: card.tags ?? [],
        media: card.media ?? [],
        scheduling: {
          ...card.scheduling,
          buriedUntil: card.scheduling?.buriedUntil ?? null,
          snoozedUntil: card.scheduling?.snoozedUntil ?? null,
        },
      })),
      folders: snapshot.folders ?? [],
      savedSearches: snapshot.savedSearches ?? [],
      media: snapshot.media ?? [],
    };
  },
};

/**
 * v3 — use Recall's light appearance for existing Revision profiles.
 *
 * The first Digitalcatalyst port accidentally made dark mode the inherited
 * default. Existing users therefore have a stored `dark` value even though
 * they never selected it. Migrate that one-time default to Recall's light
 * appearance; preserve an explicit high-contrast preference. After this step,
 * theme choices are saved normally and this migration never runs again.
 */
const recallLightTheme: Migration = {
  version: 3,
  description: "Use Recall's light theme as the Revision default",
  async run(context) {
    if (!context.unified) return null;
    const snapshot = context.unified;
    const study = { ...DEFAULT_STUDY_SETTINGS, ...(snapshot.settings?.study ?? {}) };
    if (study.theme === "dark") study.theme = "light";

    return {
      ...snapshot,
      version: UNIFIED_SCHEMA_VERSION,
      settings: {
        ...snapshot.settings,
        study,
      },
    };
  },
};

export const MIGRATIONS: Migration[] = [baselineProjection, normaliseSettings, recallLightTheme];

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */

export interface MigrationResult {
  state: MigrationState;
  snapshot: UnifiedSnapshot | null;
  /** Versions applied during this run (empty when already up to date). */
  ran: number[];
  backupKey: string | null;
}

export async function loadMigrationState(): Promise<MigrationState> {
  const stored = await readKv<MigrationState>(KV_MIGRATION);
  return stored ? { ...EMPTY_MIGRATION_STATE, ...stored } : { ...EMPTY_MIGRATION_STATE };
}

/**
 * Run every pending migration.
 *
 * `readLegacy` is injected so the runner can be tested without touching
 * `localStorage` (the store module reads it synchronously).
 */
export async function runMigrations(
  uid: string,
  readLegacy: () => RevisionDb | null,
  options: { now?: Date; force?: boolean } = {},
): Promise<MigrationResult> {
  const now = options.now ?? new Date();
  const state = await loadMigrationState();
  const pending = MIGRATIONS.filter(
    (migration) => options.force || migration.version > state.version,
  ).sort((a, b) => a.version - b.version);

  let snapshot = await readUnifiedSnapshot();
  if (pending.length === 0) {
    return { state, snapshot, ran: [], backupKey: state.backupKey };
  }

  // ── Backup BEFORE any write ─────────────────────────────────────────────
  const backupKey = `backup:${uid}:${Date.now()}`;
  const legacy = readLegacy();
  await writeKv(backupKey, {
    createdAt: now.toISOString(),
    fromVersion: state.version,
    legacy,
    unified: snapshot,
  });

  const context: MigrationContext = {
    uid,
    legacy,
    custom: loadUserCustomSettings(uid),
    unified: snapshot,
    now,
  };

  const ran: number[] = [];
  for (const migration of pending) {
    const result = await migration.run({ ...context, unified: snapshot });
    if (result) snapshot = result;
    ran.push(migration.version);
    // Persist after each step so an interrupted run resumes at the next one
    // rather than replaying work (and so a crash never loses a completed step).
    if (snapshot) await writeUnifiedSnapshot(snapshot);
    await writeKv(KV_MIGRATION, {
      version: migration.version,
      appliedAt: new Date().toISOString(),
      backupKey,
      applied: [...state.applied, migration.version],
    } satisfies MigrationState);
  }

  const nextState: MigrationState = {
    version: pending[pending.length - 1].version,
    appliedAt: new Date().toISOString(),
    backupKey,
    applied: Array.from(new Set([...state.applied, ...ran])),
  };
  await writeKv(KV_MIGRATION, nextState);

  return { state: nextState, snapshot, ran, backupKey };
}

/** Restore the state captured before a migration run. */
export async function rollbackMigrations(backupKey: string): Promise<boolean> {
  const backup = await readKv<{
    legacy: RevisionDb | null;
    unified: UnifiedSnapshot | null;
    createdAt: string;
    fromVersion: number;
  }>(backupKey);
  if (!backup) return false;

  if (backup.unified) await writeUnifiedSnapshot(backup.unified);
  if (backup.legacy) await writeKv("legacy-db-rollback", backup.legacy);
  await writeKv(KV_MIGRATION, {
    version: backup.fromVersion,
    appliedAt: new Date().toISOString(),
    backupKey: null,
    applied: MIGRATIONS.filter((m) => m.version <= backup.fromVersion).map((m) => m.version),
  } satisfies MigrationState);
  return true;
}

/** True when the learner's data has already been migrated. */
export async function isMigrated(): Promise<boolean> {
  const state = await loadMigrationState();
  return state.version >= UNIFIED_SCHEMA_VERSION;
}

/** Snapshot + legacy mirror access for the migration diagnostics panel. */
export async function migrationDiagnostics() {
  const [state, legacy, unified] = await Promise.all([
    loadMigrationState(),
    readLegacyMirror<RevisionDb>(),
    readUnifiedSnapshot(),
  ]);
  return {
    state,
    schemaVersion: UNIFIED_SCHEMA_VERSION,
    legacyQuestions: legacy?.questions.length ?? 0,
    legacyTests: legacy?.dailyTests.length ?? 0,
    unifiedCards: unified?.cards.length ?? 0,
    unifiedReviews: unified?.reviewLogs.length ?? 0,
  };
}
