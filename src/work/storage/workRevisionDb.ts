// Device-only storage for Work Revision.
//
// Work Revision shares Revision's Dexie database and domain/FSRS types, but
// lives under its own `work:device:` KV namespace. This module deliberately
// does not import the Revision cloud repository, cloud sync service, auth, or
// migration/bootstrap code. It only reads/writes one namespaced snapshot.

import { hasIndexedDb, readKv, writeKv } from "../../revision/engine/localDb";
import { applyReview, createNewScheduling } from "../../revision/engine/fsrs";
import {
  DEFAULT_STUDY_SETTINGS,
  emptySnapshot,
  makeId,
  type UnifiedCard,
  type UnifiedDeck,
  type UnifiedRating,
  type UnifiedSnapshot,
  type UnifiedStudySession,
} from "../../revision/domain/types";
import { DEFAULT_SETTINGS, DEFAULT_USER_CUSTOM_SETTINGS } from "../../revision/engine/store";

export const WORK_REVISION_NAMESPACE = "work:device";
export const WORK_REVISION_SNAPSHOT_KEY = `${WORK_REVISION_NAMESPACE}:revision-snapshot:v1`;
const LOCAL_FALLBACK_KEY = "dc.work.revision.snapshot.v1";
const CHANGE_EVENT = "dc:work-revision-change";

export type WorkRevisionCardInput = {
  front: string;
  back: string;
  hint?: string;
  explanation?: string;
  tags?: string[];
  cardType?: UnifiedCard["cardType"];
  options?: string[];
  correctIndex?: number;
  source?: UnifiedCard["source"];
  difficulty?: UnifiedCard["difficulty"];
};

export type WorkRevisionDeckInput = {
  name: string;
  description?: string;
  cards: WorkRevisionCardInput[];
  source?: UnifiedCard["source"];
};

function emptyWorkSnapshot(): UnifiedSnapshot {
  return emptySnapshot({
    catalog: { ...DEFAULT_SETTINGS },
    custom: { ...DEFAULT_USER_CUSTOM_SETTINGS, subjectSlugs: [], topicSlugs: [] },
    study: { ...DEFAULT_STUDY_SETTINGS, fsrsWeights: null },
  });
}

function safeFallbackRead(): UnifiedSnapshot | null {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UnifiedSnapshot;
    if (parsed && Array.isArray(parsed.decks) && Array.isArray(parsed.cards) && parsed.settings?.study) return parsed;
  } catch {
    // A blocked or truncated fallback must not stop Work from opening.
  }
  return null;
}

function safeFallbackWrite(snapshot: UnifiedSnapshot): void {
  try {
    globalThis.localStorage?.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(snapshot));
  } catch {
    // IndexedDB remains the primary store; quota/private-mode failures are non-fatal.
  }
}

export async function loadWorkRevisionSnapshot(): Promise<UnifiedSnapshot> {
  if (hasIndexedDb()) {
    try {
      const stored = await readKv<UnifiedSnapshot>(WORK_REVISION_SNAPSHOT_KEY);
      if (stored && Array.isArray(stored.decks) && Array.isArray(stored.cards) && stored.settings?.study) return stored;
    } catch {
      // Fall through to this namespace's device-only localStorage backup.
    }
  }
  return safeFallbackRead() ?? emptyWorkSnapshot();
}

export async function saveWorkRevisionSnapshot(snapshot: UnifiedSnapshot): Promise<void> {
  let savedToDexie = false;
  if (hasIndexedDb()) {
    try {
      await writeKv(WORK_REVISION_SNAPSHOT_KEY, snapshot);
      savedToDexie = true;
    } catch {
      // Continue with the local-only fallback. No cloud queue is involved.
    }
  }
  if (!savedToDexie) safeFallbackWrite(snapshot);
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { namespace: WORK_REVISION_NAMESPACE } }));
    }
  } catch {
    // Persistence does not depend on event delivery.
  }
}

let writeTail: Promise<unknown> = Promise.resolve();

/** Serialize mutations so split panes cannot overwrite each other's edits. */
export function updateWorkRevisionSnapshot(
  updater: (snapshot: UnifiedSnapshot) => UnifiedSnapshot,
): Promise<UnifiedSnapshot> {
  const job = writeTail.then(async () => {
    const current = await loadWorkRevisionSnapshot();
    const next = updater(current);
    await saveWorkRevisionSnapshot(next);
    return next;
  });
  writeTail = job.then(() => undefined, () => undefined);
  return job;
}

function makeToken(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeCardInput(input: WorkRevisionCardInput): WorkRevisionCardInput | null {
  const front = String(input.front ?? "").trim();
  const back = String(input.back ?? "").trim();
  if (!front || !back) return null;
  const options = (input.options ?? []).map((option) => String(option ?? "").trim()).filter(Boolean).slice(0, 6);
  const cardType = input.cardType ?? "basic";
  if (cardType === "mcq" && (options.length < 2 || !Number.isInteger(input.correctIndex) || (input.correctIndex ?? -1) < 0 || (input.correctIndex ?? -1) >= options.length)) {
    return null;
  }
  return {
    ...input,
    front: front.slice(0, 4000),
    back: back.slice(0, 4000),
    hint: String(input.hint ?? "").trim().slice(0, 1000),
    explanation: String(input.explanation ?? "").trim().slice(0, 2000),
    tags: (input.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 24),
    cardType,
    ...(options.length ? { options } : {}),
  };
}

export function createWorkRevisionDeckSnapshot(
  snapshot: UnifiedSnapshot,
  input: WorkRevisionDeckInput,
  now = new Date(),
): { snapshot: UnifiedSnapshot; deck: UnifiedDeck } {
  const name = String(input.name ?? "").trim().slice(0, 100);
  const cards = input.cards.map(normalizeCardInput).filter((card): card is WorkRevisionCardInput => Boolean(card));
  if (!name) throw new Error("Give this revision set a name.");
  if (cards.length === 0) throw new Error("Add at least one card with both a question and an answer.");

  const stamp = now.toISOString();
  const token = makeToken();
  const deckId = makeId("deck", `work-${token}`);
  const deck: UnifiedDeck = {
    id: deckId,
    name,
    description: String(input.description ?? "").trim().slice(0, 500),
    color: "green",
    kind: "user",
    createdAt: stamp,
    updatedAt: stamp,
  };
  const created: UnifiedCard[] = cards.map((card, index) => ({
    id: makeId("usrc", `work-${makeToken()}`),
    deckId,
    tags: card.tags ?? [],
    front: card.front,
    back: card.back,
    hint: card.hint ?? "",
    ...(card.explanation ? { explanation: card.explanation } : {}),
    ...(card.options ? { options: card.options } : {}),
    ...(card.cardType === "mcq" ? { correctIndex: card.correctIndex } : {}),
    cardType: card.cardType ?? "basic",
    media: [],
    source: card.source ?? input.source ?? "user",
    difficulty: card.difficulty ?? "medium",
    createdAt: stamp,
    updatedAt: stamp,
    position: index,
    scheduling: createNewScheduling(now),
  }));
  return {
    deck,
    snapshot: {
      ...snapshot,
      decks: [...snapshot.decks, deck],
      cards: [...snapshot.cards, ...created],
    },
  };
}

export async function createWorkRevisionDeck(input: WorkRevisionDeckInput): Promise<UnifiedDeck> {
  let created: UnifiedDeck | null = null;
  await updateWorkRevisionSnapshot((snapshot) => {
    const result = createWorkRevisionDeckSnapshot(snapshot, input);
    created = result.deck;
    return result.snapshot;
  });
  if (!created) throw new Error("Could not create the revision set.");
  return created;
}

export async function renameWorkRevisionDeck(deckId: string, name: string): Promise<void> {
  const clean = String(name ?? "").trim().slice(0, 100);
  if (!clean) throw new Error("A set name cannot be blank.");
  await updateWorkRevisionSnapshot((snapshot) => ({
    ...snapshot,
    decks: snapshot.decks.map((deck) => deck.id === deckId ? { ...deck, name: clean, updatedAt: new Date().toISOString() } : deck),
  }));
}

export async function deleteWorkRevisionDeck(deckId: string): Promise<void> {
  await updateWorkRevisionSnapshot((snapshot) => {
    const cardIds = new Set(snapshot.cards.filter((card) => card.deckId === deckId).map((card) => card.id));
    return {
      ...snapshot,
      decks: snapshot.decks.filter((deck) => deck.id !== deckId),
      cards: snapshot.cards.filter((card) => card.deckId !== deckId),
      reviewLogs: snapshot.reviewLogs.filter((log) => !cardIds.has(log.cardId)),
      sessions: snapshot.sessions.filter((session) => session.deckId !== deckId),
    };
  });
}

export async function createWorkRevisionSession(deckId: string, cardIds: string[]): Promise<UnifiedStudySession> {
  const id = makeId("ses", `work-${makeToken()}`);
  let created: UnifiedStudySession | null = null;
  await updateWorkRevisionSnapshot((snapshot) => {
    const selected = new Set(cardIds);
    const cards = snapshot.cards.filter((card) => selected.has(card.id) && card.deckId === deckId && !card.deletedAt);
    if (cards.length === 0) throw new Error("There are no cards ready to study in this set.");
    const now = new Date().toISOString();
    created = {
      id,
      deckId,
      cardIds: cards.map((card) => card.id),
      currentIndex: 0,
      startedAt: now,
      endedAt: null,
      completed: false,
      ratings: { again: 0, hard: 0, good: 0, easy: 0 },
      newCardsCount: cards.filter((card) => card.scheduling.state === "new").length,
      queue: "custom",
    };
    return { ...snapshot, sessions: [created, ...snapshot.sessions] };
  });
  if (!created) throw new Error("Could not start the study session.");
  return created;
}

export async function recordWorkRevisionRating(
  sessionId: string,
  cardId: string,
  rating: UnifiedRating,
  responseTime: number,
): Promise<void> {
  await updateWorkRevisionSnapshot((snapshot) => {
    const session = snapshot.sessions.find((row) => row.id === sessionId);
    const card = snapshot.cards.find((row) => row.id === cardId && !row.deletedAt);
    if (!session || !card) throw new Error("This study session is no longer available.");
    const dedupeKey = `${sessionId}:${cardId}`;
    if (snapshot.reviewLogs.some((log) => log.dedupeKey === dedupeKey)) return snapshot;

    const reviewedAt = new Date();
    const result = applyReview({
      scheduling: card.scheduling,
      rating,
      reviewedAt,
      desiredRetention: snapshot.settings.study.desiredRetention,
    });
    const log = {
      id: makeId("rev", `work-${makeToken()}`),
      cardId,
      rating,
      reviewedAt: reviewedAt.toISOString(),
      responseTime: Math.max(0, Math.round(responseTime)),
      source: "custom-study" as const,
      sessionId,
      stability: result.scheduling.stability,
      difficulty: result.scheduling.difficulty,
      elapsedDays: result.scheduling.elapsedDays,
      scheduledDays: result.scheduling.scheduledDays,
      stateBefore: result.before.state,
      stateAfter: result.scheduling.state,
      dedupeKey,
    };
    const nextIndex = Math.max(session.currentIndex, session.cardIds.indexOf(cardId) + 1);
    const complete = nextIndex >= session.cardIds.length;
    const nextSession = {
      ...session,
      currentIndex: nextIndex,
      completed: complete,
      endedAt: complete ? reviewedAt.toISOString() : session.endedAt,
      ratings: { ...session.ratings, [rating]: session.ratings[rating] + 1 },
    };
    return {
      ...snapshot,
      cards: snapshot.cards.map((row) => row.id === cardId ? { ...row, scheduling: result.scheduling, updatedAt: reviewedAt.toISOString() } : row),
      reviewLogs: [...snapshot.reviewLogs, log],
      sessions: snapshot.sessions.map((row) => row.id === sessionId ? nextSession : row),
    };
  });
}

export async function skipWorkRevisionCard(sessionId: string, cardId: string): Promise<void> {
  await updateWorkRevisionSnapshot((snapshot) => {
    const session = snapshot.sessions.find((row) => row.id === sessionId);
    if (!session) throw new Error("This study session is no longer available.");
    const nextIndex = Math.max(session.currentIndex, session.cardIds.indexOf(cardId) + 1);
    const complete = nextIndex >= session.cardIds.length;
    const now = new Date().toISOString();
    return {
      ...snapshot,
      sessions: snapshot.sessions.map((row) => row.id === sessionId
        ? { ...row, currentIndex: nextIndex, completed: complete, endedAt: complete ? now : row.endedAt }
        : row),
    };
  });
}

export function workRevisionChangeEventName(): string {
  return CHANGE_EVENT;
}
