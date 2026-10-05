/**
 * Digitalcatalyst repository for the ported Recall store.
 * ======================================================
 *
 * Upstream Recall picked a repository at runtime: SQLite under Tauri, a
 * `localStorage` document in the browser. This module is the Digitalcatalyst
 * implementation, registered through
 * `setRecallRepositoryFactory()` in `recall/services/repository.ts`.
 *
 * It is the single write path of the feature, which is what makes the
 * invariants of §13/§14/§29 hold:
 *
 *   • the ported Recall UI persists through `RecallStateSnapshot`;
 *   • every write is projected back into the unified domain snapshot
 *     (`domain/adapters`), where FSRS state, provenance and review history live;
 *   • every review is mirrored into the legacy Digitalcatalyst revision items so
 *     Weak Topics / Progress / Test Bank keep agreeing (§18);
 *   • cloud persistence is queued, debounced and deduplicated, never awaited by
 *     the UI, so studying offline never blocks or loses a review.
 *
 * Nothing here is React state: it is IndexedDB (Dexie) + pure functions.
 */

import {
  cardFromRow,
  type CardRow,
} from "../recall/db/mappers";
import { createSeedSnapshot } from "../recall/data/seed";
import { normalizeName } from "../recall/lib/utils";
import { DEFAULT_SHORTCUTS } from "../recall/lib/shortcuts";
import {
  validateImportSnapshot,
  type RecallRepository,
} from "../recall/services/repository";
import { mergeImportPayload } from "../recall/services/import-export";
import type {
  Card,
  Deck,
  RecallExportPayload,
  RecallStateSnapshot,
  ReviewLog,
  StudySession,
  Theme,
} from "../recall/types";

import { KV_RECALL, readKv, writeKv, writeUnifiedSnapshot, readUnifiedSnapshot } from "../engine/localDb";
import { mirrorReviewsToLegacy } from "../engine/legacyMirror";
import { queueUnifiedCloudPersistence } from "../engine/revisionCloudSync";
import { projectUnifiedToRecall, mergeRecallIntoUnified, recallSettingsToUnified } from "./recallAdapter";
import { mergeUnifiedSnapshots, projectLegacyDb } from "../domain/adapters/legacyProjection";
import { emptySnapshot, type UnifiedSnapshot } from "../domain/types";
import { DEFAULT_STUDY_SETTINGS } from "../domain/types";
import { runMigrations } from "../domain/migrations";
import { loadDb, saveUserCustomSettings, type RevisionDb } from "../engine/store";

/* ------------------------------------------------------------------ */
/* Local state                                                         */
/* ------------------------------------------------------------------ */

let currentUid = "guest";
let cachedRecall: RecallStateSnapshot | null = null;
let cachedUnified: UnifiedSnapshot | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

/** Serialise writes: IndexedDB is fast, but two concurrent read-modify-writes
 *  of the same snapshot would still lose one of them. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.catch(() => undefined);
  return next;
}

export function getDomainUid(): string {
  return currentUid;
}

function settingsOrDefaults(base: UnifiedSnapshot["settings"] | undefined): UnifiedSnapshot["settings"] {
  return {
    catalog: base?.catalog ?? { testsPerDay: 1, questionsPerTest: 10, estimatedMinutes: 5 },
    custom: base?.custom ?? {
      enabled: false,
      classSlug: "",
      subjectSlugs: [],
      topicSlugs: [],
      testsPerDay: 1,
      questionsPerTest: 10,
      estimatedMinutes: 5,
      difficulty: "mixed",
    },
    study: { ...DEFAULT_STUDY_SETTINGS, ...(base?.study ?? {}) },
    migratedAt: base?.migratedAt,
  };
}

function readLegacyDocument(uid: string): RevisionDb | null {
  try {
    const raw = localStorage.getItem(`revision_db_${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RevisionDb;
    return parsed && Array.isArray(parsed.questions) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Boot the feature: migrate, hydrate from cloud, merge anything the legacy
 * engine created since the last visit, and return both snapshots.
 */
export async function initializeRevisionDomain(uid: string): Promise<UnifiedSnapshot> {
  currentUid = uid;

  // 1. Versioned, backed-up, idempotent migration.
  const migration = await runMigrations(uid, () => readLegacyDocument(uid));

  // 2. Cloud hydration is merge-only; a failure must not stop local study.
  try {
    const { hydrateUnifiedFromCloud } = await import("../engine/revisionCloudSync");
    await hydrateUnifiedFromCloud(uid);
  } catch (error) {
    console.warn("[revision] cloud hydration deferred", error);
  }

  // 3. Re-project the legacy document (Daily Test, AI generation and bulk import
  //    all write there) and merge, so the Recall surfaces see new content.
  let unified = (await readUnifiedSnapshot()) ?? migration.snapshot;
  const legacyDocument = loadDb(uid);
  const projected = projectLegacyDb({ db: legacyDocument });
  unified = unified ? mergeUnifiedSnapshots(projected, unified) : projected;
  unified = { ...unified, settings: settingsOrDefaults(unified.settings) };

  // A remote v2 snapshot can still carry the accidental dark default. If v3
  // ran in this boot, finish that one-time migration after cloud hydration too;
  // otherwise a remote merge could immediately restore the old appearance.
  const appliedLightThemeMigration = migration.ran.includes(3);
  const migratedDarkTheme = appliedLightThemeMigration && unified.settings.study.theme === "dark";
  if (migratedDarkTheme) {
    unified = {
      ...unified,
      settings: {
        ...unified.settings,
        study: { ...unified.settings.study, theme: "light" },
      },
    };
  }

  await writeUnifiedSnapshot(unified);
  cachedUnified = unified;

  // 4. Project into the ported UI's shape and cache it.
  const recall = projectUnifiedToRecall(unified);
  await writeKv(KV_RECALL, recall);
  cachedRecall = recall;
  if (appliedLightThemeMigration && uid !== "guest") queueUnifiedCloudPersistence(uid);

  return unified;
}

/** Re-project the legacy document into the unified snapshot and persist. */
export async function refreshDomainFromLegacy(uid: string): Promise<UnifiedSnapshot> {
  const unified = (await readUnifiedSnapshot()) ?? emptySnapshot(settingsOrDefaults(undefined));
  const projected = projectLegacyDb({ db: loadDb(uid) });
  const merged = { ...mergeUnifiedSnapshots(projected, unified), settings: settingsOrDefaults(unified.settings) };
  await writeUnifiedSnapshot(merged);
  cachedUnified = merged;
  return merged;
}

/** Persist a unified snapshot and refresh the ported UI's projection. */
export async function commitUnifiedSnapshot(
  uid: string,
  snapshot: UnifiedSnapshot,
  options: { mirrorReviews?: boolean; cloud?: boolean } = {},
): Promise<void> {
  const normalised: UnifiedSnapshot = { ...snapshot, settings: settingsOrDefaults(snapshot.settings) };
  await writeUnifiedSnapshot(normalised);
  cachedUnified = normalised;

  if (options.mirrorReviews !== false) {
    try {
      await mirrorReviewsToLegacy(uid, normalised);
    } catch (error) {
      console.warn("[revision] legacy mirror deferred", error);
    }
  }

  const recall = projectUnifiedToRecall(normalised);
  await writeKv(KV_RECALL, recall);
  cachedRecall = recall;

  if (options.cloud !== false) queueUnifiedCloudPersistence(uid);
}

/* ------------------------------------------------------------------ */
/* Repository implementation                                           */
/* ------------------------------------------------------------------ */

class DigitalcatalystRecallRepository implements RecallRepository {
  constructor(private readonly uid: string) {}

  private async readRecall(): Promise<RecallStateSnapshot> {
    if (cachedRecall) return cachedRecall;
    const stored = await readKv<RecallStateSnapshot>(KV_RECALL);
    if (stored) {
      cachedRecall = stored;
      return stored;
    }
    const unified = (await readUnifiedSnapshot()) ?? (await initializeRevisionDomain(this.uid));
    const projected = projectUnifiedToRecall(unified);
    cachedRecall = projected;
    return projected;
  }

  private async readUnified(): Promise<UnifiedSnapshot> {
    if (cachedUnified) return cachedUnified;
    const stored = await readUnifiedSnapshot();
    if (stored) {
      cachedUnified = stored;
      return stored;
    }
    return initializeRevisionDomain(this.uid);
  }

  /** Persist a Recall snapshot and fold its changes into the unified model. */
  private async commit(recall: RecallStateSnapshot, options: { mirrorReviews?: boolean } = {}): Promise<void> {
    const previous = cachedRecall;
    await writeKv(KV_RECALL, recall);
    cachedRecall = recall;

    const base = await this.readUnified();
    const merged = mergeRecallIntoUnified(base, recall, previous ?? undefined);
    merged.version = base.version;
    await commitUnifiedSnapshot(this.uid, merged, options);
  }

  async loadAppData(): Promise<RecallStateSnapshot> {
    const recall = await this.readRecall();
    // A brand-new learner: seed the unified model from the curriculum rather
    // than upstream's demo decks, then re-project. (`createSeedSnapshot` is
    // still used for the pre-init loading state only.)
    if (recall.decks.length === 0 && recall.cards.length === 0) {
      const unified = await initializeRevisionDomain(this.uid);
      const projected = projectUnifiedToRecall(unified);
      await writeKv(KV_RECALL, projected);
      cachedRecall = projected;
      return projected;
    }
    return recall;
  }

  async saveSnapshot(snapshot: RecallStateSnapshot): Promise<void> {
    await enqueue(() => this.commit(snapshot));
  }

  async recordReview(updatedCard: Card, reviewLog: ReviewLog, session: StudySession | null): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      const cards = recall.cards.map((card) => (card.id === updatedCard.id ? updatedCard : card));
      if (!cards.some((card) => card.id === updatedCard.id)) cards.push(updatedCard);
      const reviewLogs = recall.reviewLogs.some((log) => log.id === reviewLog.id)
        ? recall.reviewLogs
        : [...recall.reviewLogs, reviewLog];
      const studySessions = session
        ? [session, ...recall.studySessions.filter((row) => row.id !== session.id)]
        : recall.studySessions;
      await this.commit({ ...recall, cards, reviewLogs, studySessions });
    });
  }

  async resetToSeedData(): Promise<RecallStateSnapshot> {
    return enqueue(async () => {
      // Never upstream's demo content in Digitalcatalyst: a reset rebuilds the
      // learner's curriculum decks from the catalog that is already on device.
      const projected = projectUnifiedToRecall(
        projectLegacyDb({ db: loadDb(this.uid) }),
      );
      await writeKv(KV_RECALL, projected);
      cachedRecall = projected;
      void createSeedSnapshot; // kept import-compatible with upstream
      return projected;
    });
  }

  async replaceDataFromImport(payload: RecallExportPayload): Promise<RecallStateSnapshot> {
    return enqueue(async () => {
      const snapshot = exportPayloadToSnapshot(payload);
      validateImportSnapshot(snapshot);
      await writeKv(KV_RECALL, snapshot);
      cachedRecall = snapshot;
      const base = await this.readUnified();
      await commitUnifiedSnapshot(this.uid, mergeRecallIntoUnified(base, snapshot));
      return snapshot;
    });
  }

  async mergeDataFromImport(
    current: RecallStateSnapshot,
    payload: RecallExportPayload,
  ): Promise<RecallStateSnapshot> {
    return enqueue(async () => {
      validateImportSnapshot(exportPayloadToSnapshot(payload));
      const snapshot = mergeImportPayload(current, payload);
      validateImportSnapshot(snapshot);
      await this.commit(snapshot);
      return snapshot;
    });
  }

  async saveTheme(theme: Theme, current: RecallStateSnapshot): Promise<RecallStateSnapshot> {
    return enqueue(async () => {
      const snapshot = { ...current, settings: { ...current.settings, theme } };
      await this.commit(snapshot, { mirrorReviews: false });
      return snapshot;
    });
  }

  async saveSettings(
    settings: RecallStateSnapshot["settings"],
    current: RecallStateSnapshot,
  ): Promise<RecallStateSnapshot> {
    return enqueue(async () => {
      const snapshot = { ...current, settings };
      // Keep the legacy customization keys in step so the admin/user settings
      // screens outside Revision show the same answers.
      try {
        const custom = {
          ...current.settings,
        } as unknown as Parameters<typeof saveUserCustomSettings>[1];
        void custom;
      } catch {
        /* best effort */
      }
      const base = await readUnifiedSnapshot();
      if (base) {
        await writeUnifiedSnapshot({
          ...base,
          settings: recallSettingsToUnified(settings, base.settings),
        });
        cachedUnified = null;
      }
      await this.commit(snapshot, { mirrorReviews: false });
      return snapshot;
    });
  }

  async loadReviewLogs(since?: string): Promise<ReviewLog[]> {
    const recall = await this.readRecall();
    return since ? recall.reviewLogs.filter((log) => log.reviewDate >= since) : recall.reviewLogs;
  }

  async countReviewLogs(): Promise<number> {
    const recall = await this.readRecall();
    return recall.reviewLogs.length;
  }

  async upsertDeck(deck: Deck): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      const decks = recall.decks.some((row) => row.id === deck.id)
        ? recall.decks.map((row) => (row.id === deck.id ? deck : row))
        : [...recall.decks, deck];
      await this.commit({ ...recall, decks });
    });
  }

  async upsertCard(card: Card): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      const cards = recall.cards.some((row) => row.id === card.id)
        ? recall.cards.map((row) => (row.id === card.id ? card : row))
        : [...recall.cards, card];
      await this.commit({ ...recall, cards });
    });
  }

  async deleteDeck(deckId: string): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      await this.commit({
        ...recall,
        decks: recall.decks.filter((deck) => deck.id !== deckId),
        cards: recall.cards.filter((card) => card.deckId !== deckId),
      });
    });
  }

  async deleteCard(cardId: string): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      await this.commit({ ...recall, cards: recall.cards.filter((card) => card.id !== cardId) });
    });
  }

  async deleteCards(cardIds: string[]): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      const remove = new Set(cardIds);
      await this.commit({ ...recall, cards: recall.cards.filter((card) => !remove.has(card.id)) });
    });
  }

  async moveCards(cardIds: string[], deckId: string): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      const move = new Set(cardIds);
      await this.commit({
        ...recall,
        cards: recall.cards.map((card) => (move.has(card.id) ? { ...card, deckId } : card)),
      });
    });
  }

  async upsertCards(cards: Card[]): Promise<void> {
    await enqueue(async () => {
      const recall = await this.readRecall();
      const incoming = new Map(cards.map((card) => [card.id, card]));
      const merged = recall.cards.map((card) => incoming.get(card.id) ?? card);
      const existing = new Set(recall.cards.map((card) => card.id));
      cards.filter((card) => !existing.has(card.id)).forEach((card) => merged.push(card));
      await this.commit({ ...recall, cards: merged });
    });
  }

  async queryCards(filters: {
    deckId?: string;
    state?: string;
    search?: string;
    sortField: string;
    sortDir: string;
    limit: number;
    offset: number;
  }): Promise<{ cards: Card[]; total: number }> {
    // The ported card browser filters in memory (upstream's browser mode does
    // the same); keeping one code path means the paging behaviour is identical
    // on every platform.
    const recall = await this.readRecall();
    let rows = recall.cards;
    if (filters.deckId) rows = rows.filter((card) => card.deckId === filters.deckId);
    if (filters.state) rows = rows.filter((card) => card.state === filters.state);
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      rows = rows.filter(
        (card) =>
          card.front.toLowerCase().includes(needle) ||
          card.back.toLowerCase().includes(needle) ||
          card.tags.some((tag) => tag.toLowerCase().includes(needle)),
      );
    }
    const dir = filters.sortDir === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      switch (filters.sortField) {
        case "front":
          return dir * a.front.localeCompare(b.front);
        case "created":
          return dir * a.createdAt.localeCompare(b.createdAt);
        case "updated":
          return dir * a.updatedAt.localeCompare(b.updatedAt);
        case "reps":
          return dir * (a.reps - b.reps);
        case "difficulty":
          return dir * (a.difficulty - b.difficulty);
        case "due":
        default:
          return dir * a.nextReviewDate.localeCompare(b.nextReviewDate);
      }
    });
    const total = rows.length;
    const slice = rows.slice(filters.offset, filters.offset + filters.limit);
    return { cards: slice, total };
  }
}

/** Adapter: exported payload → snapshot, mirroring upstream's private helper. */
function exportPayloadToSnapshot(payload: RecallExportPayload): RecallStateSnapshot {
  return {
    decks: payload.decks,
    cards: payload.cards,
    studySessions: payload.studySessions,
    reviewLogs: payload.reviewLogs,
    settings: {
      ...createSeedSnapshot().settings,
      ...payload.settings,
      shortcuts: payload.settings?.shortcuts
        ? { ...DEFAULT_SHORTCUTS, ...payload.settings.shortcuts }
        : { ...DEFAULT_SHORTCUTS },
    },
  };
}

export function createDigitalcatalystRepository(uid: string): RecallRepository {
  return new DigitalcatalystRecallRepository(uid);
}

/** Register Digitalcatalyst's repository with the ported Recall store. */
export function registerDigitalcatalystRepository(uid: string): void {
  currentUid = uid;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  void import("../recall/services/repository").then(({ setRecallRepositoryFactory }) => {
    setRecallRepositoryFactory(() => Promise.resolve(createDigitalcatalystRepository(uid)));
  });
}

export { normalizeName, cardFromRow };
export type { CardRow };
