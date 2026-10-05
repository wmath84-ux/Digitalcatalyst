import { fsrs, Rating, State, Card as FSRSCard } from "ts-fsrs";
import type { Card, ReviewRating, CardState } from "../types";

const DEFAULT_RETENTION = 0.9;

let _customWeights: number[] | null = null;

/**
 * Map our CardState string to ts-fsrs State enum.
 * Critical: "relearning" must map to State.Relearning (3), NOT State.Learning (1).
 * Mapping relearning → Learning causes ts-fsrs to use learning_steps instead of
 * relearning_steps, and prevents the card from ever graduating back to Review.
 */
function toFsrsState(state: CardState): State {
  switch (state) {
    case "new": return State.New;
    case "learning": return State.Learning;
    case "review": return State.Review;
    case "relearning": return State.Relearning;
  }
}

/** Reverse: ts-fsrs State enum → our CardState string. */
function fromFsrsState(state: State): CardState {
  switch (state) {
    case State.New: return "new";
    case State.Learning: return "learning";
    case State.Review: return "review";
    case State.Relearning: return "relearning";
  }
}

/** Set custom FSRS weights (null = use defaults). */
export function setCustomWeights(weights: number[] | null): void {
  _customWeights = weights;
}

/** Get current custom weights (null = using defaults). */
export function getCustomWeights(): number[] | null {
  return _customWeights;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function finiteCount(value: number): number {
  return Math.max(0, Math.trunc(finiteNonNegative(value)));
}

/**
 * Build a safe scheduler card from persisted Recall data. Imports and older
 * cards can have a non-new state without valid FSRS memory (e.g. stability 0,
 * difficulty 9); normalize those rows to a clean new-card state before
 * `repeat()` so previews and ratings cannot throw.
 */
function toSchedulingCard(card: Card, now: Date): FSRSCard {
  const knownState: CardState = ["new", "learning", "review", "relearning"].includes(card.state)
    ? card.state
    : "new";
  const stability = Number.isFinite(card.stability) ? card.stability : 0;
  const difficulty = Number.isFinite(card.difficulty) ? card.difficulty : 0;
  const reps = finiteCount(card.reps);
  const hasValidMemory = stability > 0 && difficulty >= 1 && difficulty <= 10 && reps > 0;
  const state: CardState = knownState === "new" || !hasValidMemory ? "new" : knownState;
  const due = validDate(card.nextReviewDate);
  const malformedReviewedCard = knownState !== "new" && !hasValidMemory;

  return {
    due: malformedReviewedCard ? now : due ?? now,
    stability: state === "new" ? 0 : stability,
    difficulty: state === "new" ? 0 : difficulty,
    elapsed_days: state === "new" ? 0 : finiteNonNegative(card.elapsedDays),
    scheduled_days: state === "new" ? 0 : finiteNonNegative(card.scheduledDays),
    reps: state === "new" ? 0 : reps,
    lapses: state === "new" ? 0 : finiteCount(card.lapses),
    learning_steps: state === "new" ? 0 : finiteCount(card.learningSteps),
    state: toFsrsState(state),
    last_review: state === "new" ? undefined : validDate(card.lastReviewDate) ?? now,
  };
}

/** Format a millisecond duration into a human-readable interval string. */
export function formatInterval(ms: number): string {
  if (ms <= 0) return "<1m";
  const minutes = ms / 60_000;
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${months.toFixed(1)}mo`;
  const years = days / 365;
  return `${years.toFixed(1)}y`;
}

/** Preview the next interval for each rating without mutating the card. */
export function previewIntervals(
  card: Card,
  desiredRetention = DEFAULT_RETENTION,
  now = new Date()
): { again: string; hard: string; good: string; easy: string } {
  const f = fsrs({ request_retention: desiredRetention, w: _customWeights ?? undefined });

  const schedulingCard = toSchedulingCard(card, now);
  const recordLog = f.repeat(schedulingCard, now);

  const dueMs = (rating: 1 | 2 | 3 | 4): number => {
    const dueDate = recordLog[rating].card.due;
    return dueDate.getTime() - now.getTime();
  };

  return {
    again: formatInterval(dueMs(Rating.Again)),
    hard: formatInterval(dueMs(Rating.Hard)),
    good: formatInterval(dueMs(Rating.Good)),
    easy: formatInterval(dueMs(Rating.Easy)),
  };
}

export function getDueCards(cards: Card[], now = new Date()): Card[] {
  return cards
    .filter((card) => new Date(card.nextReviewDate) <= now)
    .sort(
      (a, b) =>
        new Date(a.nextReviewDate).getTime() -
        new Date(b.nextReviewDate).getTime()
    );
}

export function applyReview(card: Card, rating: ReviewRating, reviewedAt: Date, desiredRetention = DEFAULT_RETENTION): Card {
  const f = fsrs({ request_retention: desiredRetention, w: _customWeights ?? undefined });
  const fsrsRating =
    rating === "again"
      ? Rating.Again
      : rating === "hard"
        ? Rating.Hard
        : rating === "good"
          ? Rating.Good
          : Rating.Easy;

  const schedulingCard = toSchedulingCard(card, reviewedAt);
  const recordLog = f.repeat(schedulingCard, reviewedAt);
  const s = recordLog[fsrsRating].card;

  const newState: CardState = fromFsrsState(s.state);

  return {
    ...card,
    state: newState,
    lastReviewDate: reviewedAt.toISOString(),
    nextReviewDate: s.due.toISOString(),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsedDays: s.elapsed_days,
    scheduledDays: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    learningSteps: s.learning_steps,
    updatedAt: reviewedAt.toISOString(),
  };
}

export function calculateNextReview(
  card: Card,
  rating: ReviewRating,
  desiredRetention = DEFAULT_RETENTION
): Partial<Card> {
  const { id: _id, deckId: _deckId, front: _front, back: _back, hint: _hint, tags: _tags, createdAt: _createdAt, ...rest } = applyReview(card, rating, new Date(), desiredRetention);
  return rest;
}

export function createNewCard(
  deckId: string,
  front: string,
  back: string,
  hint: string,
  tags: string[]
): Card {
  const now = new Date().toISOString();
  const isCloze = /\{\{c\d+::[^}]+\}\}/.test(front);
  return {
    id: crypto.randomUUID(),
    deckId,
    front,
    back,
    hint,
    source: "",
    tags,
    cardType: isCloze ? "cloze" : "basic",
    state: "new",
    lastReviewDate: null,
    nextReviewDate: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    createdAt: now,
    updatedAt: now,
  };
}
