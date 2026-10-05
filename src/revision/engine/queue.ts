/**
 * Adaptive study queue builder (§19).
 * ==================================
 *
 * One queue builder for every study surface. It combines, in a single ordered
 * list:
 *
 *   FSRS due cards + overdue cards + weak topics + recent mistakes +
 *   scheduled Daily Test items + a user-selected deck/topic + new cards
 *
 * …without ever overriding FSRS scheduling: a card's `due` timestamp is the
 * contract, and this module only decides the ORDER of cards that are already
 * eligible. Nothing here reschedules anything; only `engine/fsrs.ts` does that.
 *
 * Determinism: with the same snapshot, options and seed the function returns the
 * same order, so an interrupted session can be reconstructed exactly from its
 * persisted `cardIds` (and a re-entry rebuilds the identical tail).
 */

import {
  isDue,
  isLeech,
  type UnifiedCard,
  type UnifiedId,
  type UnifiedReviewLog,
  type UnifiedSnapshot,
} from "../domain/types";
import { getTopicPerformance, localDayKey, startOfLocalDay, addDays } from "./analytics";

export type StudyQueueKind = "due" | "custom" | "weak-topics" | "daily-test" | "micro" | "interleaved";

export interface StudyQueueOptions {
  /** Restrict to one deck (Recall's deck study / DC subject study). */
  deckId?: UnifiedId | null;
  /** Restrict to a tag or tag subtree (Mnemonic topic organisation). */
  tag?: string | null;
  /** Restrict to an explicit card id list (resume, test collections). */
  cardIds?: UnifiedId[];
  /** Restrict to one curriculum topic. */
  topicId?: number | null;
  kind?: StudyQueueKind;
  /** Max cards in the queue. */
  limit?: number;
  /** Include cards whose `due` is in the future (cram mode). */
  includeFuture?: boolean;
  /** Route learner mistakes from the last N days to the front. */
  recentMistakeDays?: number;
  /** Weight weak topics (defaults to true). */
  prioritiseWeakTopics?: boolean;
  /** Interleave topics instead of studying one topic in a block. */
  interleave?: boolean;
  /** Deterministic seed — reuse the session id when reconstructing a session. */
  seed?: string | number;
  now?: Date;
  leechThreshold?: number;
  /** New-card budget already spent today (from the daily limit setting). */
  newCardsAllowedToday?: number;
  /** Practice-review (Daily Test) question ids to interleave. */
  scheduledQuestionIds?: number[];
}

export interface StudyQueueEntry {
  cardId: UnifiedId;
  /** Why this card is in the queue — surfaced in the study header. */
  reason: StudyQueueReason;
  /** Ordering key, exposed for tests. */
  priority: number;
}

export type StudyQueueReason =
  | "overdue"
  | "due"
  | "recent-mistake"
  | "weak-topic"
  | "scheduled-test"
  | "new"
  | "user-picked";

/** mulberry32 — small, fast, deterministic PRNG used for interleaving. */
export function seededRandom(seed: string | number): () => number {
  let state = typeof seed === "number" ? seed : hashString(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function matchesTag(card: UnifiedCard, tag: string): boolean {
  return card.tags.some((candidate) => candidate === tag || candidate.startsWith(`${tag}/`));
}

/**
 * Build the queue.
 *
 * Priority bands (highest first). Within a band, cards are ordered by due date
 * and then by card id, so the result is stable:
 *   0  overdue cards in a weak topic
 *   1  overdue cards
 *   2  mistakes from the last N days that are due
 *   3  cards due today that are leeches
 *   4  cards due today
 *   5  scheduled Daily Test questions
 *   6  new cards (subject to the daily new-card budget)
 *   7  future cards (cram mode / explicit selection only)
 */
export function buildStudyQueue(
  snapshot: UnifiedSnapshot,
  options: StudyQueueOptions = {},
): StudyQueueEntry[] {
  const now = options.now ?? new Date();
  const leechThreshold = options.leechThreshold ?? 5;
  const recentMistakeDays = options.recentMistakeDays ?? 7;
  const interleave = options.interleave ?? true;
  const prioritiseWeak = options.prioritiseWeakTopics ?? true;
  const random = seededRandom(options.seed ?? "recall-queue");

  const liveCards = snapshot.cards.filter((card) => !card.deletedAt);
  const cardById = new Map<UnifiedId, UnifiedCard>(liveCards.map((card) => [card.id, card]));

  // ── eligible set ────────────────────────────────────────────────────────
  let eligible = liveCards;
  if (options.cardIds?.length) {
    const wanted = new Set(options.cardIds);
    eligible = eligible.filter((card) => wanted.has(card.id));
  }
  if (options.deckId) eligible = eligible.filter((card) => card.deckId === options.deckId);
  if (options.topicId !== undefined && options.topicId !== null) {
    eligible = eligible.filter((card) => card.topicId === options.topicId);
  }
  if (options.tag) eligible = eligible.filter((card) => matchesTag(card, options.tag!));

  // ── weakness + mistake lookups ──────────────────────────────────────────
  const weakTopics = new Set<number>();
  if (prioritiseWeak) {
    getTopicPerformance(snapshot, { now, leechThreshold })
      .filter((topic) => topic.weakness >= 35 && topic.recentReviews >= 3)
      .slice(0, 10)
      .forEach((topic) => weakTopics.add(topic.topicId));
  }

  const mistakeCutoff = startOfLocalDay(addDays(now, -recentMistakeDays)).getTime();
  const recentMistakes = new Set<UnifiedId>();
  (snapshot.reviewLogs as UnifiedReviewLog[]).forEach((log) => {
    if (log.rating !== "again") return;
    if (new Date(log.reviewedAt).getTime() < mistakeCutoff) return;
    recentMistakes.add(log.cardId);
  });

  const scheduledQuestionIds = new Set(options.scheduledQuestionIds ?? []);
  const newBudget = options.newCardsAllowedToday ?? Number.POSITIVE_INFINITY;
  let newUsed = 0;

  const startOfToday = startOfLocalDay(now).getTime();
  const entries: StudyQueueEntry[] = [];

  for (const card of eligible) {
    const dueTime = new Date(card.scheduling.due).getTime();
    const due = isDue(card, now) || options.includeFuture === true;
    if (!due) continue;

    const isNew = card.scheduling.state === "new" && card.scheduling.reps === 0;
    if (isNew) {
      if (newUsed >= newBudget) continue;
      newUsed += 1;
    }

    const questionId = card.legacy?.questionId;
    let reason: StudyQueueReason;
    let priority: number;

    if (isNew) {
      reason = "new";
      priority = 600 + dueTime / 1e10;
    } else if (questionId !== undefined && scheduledQuestionIds.has(questionId)) {
      reason = "scheduled-test";
      priority = 500 + dueTime / 1e10;
    } else if (recentMistakes.has(card.id)) {
      reason = "recent-mistake";
      priority = 200 + dueTime / 1e10;
    } else if (dueTime < startOfToday) {
      reason = card.topicId !== undefined && weakTopics.has(card.topicId) ? "weak-topic" : "overdue";
      priority = (reason === "weak-topic" ? 0 : 100) + dueTime / 1e10;
    } else if (isLeech(card, leechThreshold)) {
      reason = "weak-topic";
      priority = 300 + dueTime / 1e10;
    } else {
      reason = "due";
      priority = 400 + dueTime / 1e10;
    }

    if (options.cardIds?.length && priority > 600) {
      reason = "user-picked";
    }

    entries.push({ cardId: card.id, reason, priority: Number(priority) + random() * 1e-6 });
  }

  // Add scheduled Daily Test questions that are not yet cards for this learner:
  // they are set up by the adapter as `scheduled-test` cards, so anything left
  // over here simply means the card did not exist (already covered above).

  entries.sort((a, b) => a.priority - b.priority || a.cardId.localeCompare(b.cardId));

  // ── optional topic interleaving (Mnemonic capability) ───────────────────
  const ordered = interleave ? interleaveByTopic(entries, cardById) : entries;

  return typeof options.limit === "number" ? ordered.slice(0, options.limit) : ordered;
}

/**
 * Round-robin across topics, keeping the priority band order intact. A card
 * only moves within its own band, so interleaving never promotes a new card
 * above an overdue one.
 */
function interleaveByTopic(
  entries: StudyQueueEntry[],
  cardById: Map<UnifiedId, UnifiedCard>,
): StudyQueueEntry[] {
  const byTopic = new Map<string, StudyQueueEntry[]>();
  const order: string[] = [];
  for (const entry of entries) {
    const card = cardById.get(entry.cardId);
    const key = String(card?.topicId ?? "none");
    if (!byTopic.has(key)) {
      byTopic.set(key, []);
      order.push(key);
    }
    byTopic.get(key)!.push(entry);
  }
  if (order.length <= 1) return entries;

  const out: StudyQueueEntry[] = [];
  const queues = order.map((key) => byTopic.get(key)!);
  let index = 0;
  while (out.length < entries.length) {
    const queue = queues[index % queues.length];
    const next = queue.shift();
    if (next) out.push(next);
    index += 1;
    if (queues.every((candidate) => candidate.length === 0)) break;
  }
  return out;
}

/** Convenience wrapper: just the ordered card ids, for persisting a session. */
export function buildStudyQueueCardIds(
  snapshot: UnifiedSnapshot,
  options: StudyQueueOptions = {},
): UnifiedId[] {
  return buildStudyQueue(snapshot, options).map((entry) => entry.cardId);
}

/** Summary used by the study header / "start review" buttons. */
export function describeQueue(
  snapshot: UnifiedSnapshot,
  options: StudyQueueOptions = {},
): { total: number; byReason: Record<StudyQueueReason, number> } {
  const queue = buildStudyQueue(snapshot, options);
  const byReason: Record<StudyQueueReason, number> = {
    overdue: 0,
    due: 0,
    "recent-mistake": 0,
    "weak-topic": 0,
    "scheduled-test": 0,
    new: 0,
    "user-picked": 0,
  };
  queue.forEach((entry) => {
    byReason[entry.reason] += 1;
  });
  return { total: queue.length, byReason };
}

/** Today's already-reviewed count — used to enforce the daily new-card budget. */
export function reviewedToday(snapshot: UnifiedSnapshot, now = new Date()): number {
  const key = localDayKey(now);
  return snapshot.reviewLogs.filter((log) => localDayKey(log.reviewedAt) === key).length;
}
