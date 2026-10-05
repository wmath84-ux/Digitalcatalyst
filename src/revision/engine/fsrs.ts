/**
 * The Revision feature's single FSRS engine.
 * ==========================================
 *
 * Wraps the maintained TypeScript Free Spaced Repetition Scheduler
 * (`ts-fsrs`, https://github.com/open-spaced-repetition/ts-fsrs, MIT) and
 * exposes it in terms of the unified domain model.
 *
 * Rules this module exists to enforce (migration brief §9, §19, §40):
 *   • exactly ONE scheduler for the whole feature — Recall's study flow,
 *     Digitalcatalyst's Smart Revision, Mnemonic's micro/interleaved queues and
 *     Openlet's occlusion reviews all call these functions;
 *   • scheduling state is never stored inside a React component — it is
 *     converted to/from `UnifiedScheduling`;
 *   • the full review log is preserved so a future parameter optimizer
 *     (`ts-fsrs`'s optimiser) stays possible.
 */

import { Rating, State, createEmptyCard, fsrs, type Card as FsrsCard, type Grade } from "ts-fsrs";

import type { UnifiedRating, UnifiedScheduling, UnifiedCardState } from "../domain/types";

export const DEFAULT_RETENTION = 0.9;

/** Custom FSRS weights, applied process-wide (set from user settings). */
let customWeights: number[] | null = null;

export function setCustomWeights(weights: number[] | null): void {
  customWeights = weights && weights.length ? weights : null;
}

export function getCustomWeights(): number[] | null {
  return customWeights;
}

/* ------------------------------------------------------------------ */
/* State + rating maps (the ONLY place these two enums are bridged)     */
/* ------------------------------------------------------------------ */

export function toFsrsState(state: UnifiedCardState): State {
  switch (state) {
    case "new":
      return State.New;
    case "learning":
      return State.Learning;
    case "review":
      return State.Review;
    case "relearning":
      return State.Relearning;
  }
}

export function fromFsrsState(state: State): UnifiedCardState {
  switch (state) {
    case State.New:
      return "new";
    case State.Learning:
      return "learning";
    case State.Review:
      return "review";
    case State.Relearning:
      return "relearning";
    default:
      return "new";
  }
}

export function toFsrsRating(rating: UnifiedRating): Grade {
  switch (rating) {
    case "again":
      return Rating.Again;
    case "hard":
      return Rating.Hard;
    case "good":
      return Rating.Good;
    case "easy":
      return Rating.Easy;
  }
}

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function finiteCount(value: number): number {
  return Math.max(0, Math.trunc(finiteNonNegative(value)));
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Repair persisted FSRS rows before handing them to ts-fsrs. Old imports and
 * legacy projections can mark a card as reviewed while leaving its memory
 * state empty (for example difficulty 9 with stability 0). Such a row is
 * treated as new until it has a valid FSRS memory state, rather than crashing
 * preview/review with an invalid-memory-state exception.
 */
export function normalizeFsrsScheduling(
  scheduling: UnifiedScheduling,
  now = new Date(),
): UnifiedScheduling {
  const knownState = ["new", "learning", "review", "relearning"].includes(scheduling.state)
    ? scheduling.state
    : "new";
  const stability = Number.isFinite(scheduling.stability) ? scheduling.stability : 0;
  const difficulty = Number.isFinite(scheduling.difficulty) ? scheduling.difficulty : 0;
  const reps = finiteCount(scheduling.reps);
  const hasValidMemory = stability > 0 && difficulty >= 1 && difficulty <= 10 && reps > 0;
  const state: UnifiedCardState =
    knownState === "new" || !hasValidMemory ? "new" : knownState;
  const due = validDate(scheduling.due);

  if (state === "new") {
    const wasMalformedReviewedCard = knownState !== "new" && !hasValidMemory;
    return {
      ...scheduling,
      due: (wasMalformedReviewedCard ? now : due ?? now).toISOString(),
      lastReview: null,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: "new",
      learningSteps: 0,
    };
  }

  return {
    ...scheduling,
    due: (due ?? now).toISOString(),
    lastReview: validDate(scheduling.lastReview)?.toISOString() ?? null,
    stability,
    difficulty,
    elapsedDays: finiteNonNegative(scheduling.elapsedDays),
    scheduledDays: finiteNonNegative(scheduling.scheduledDays),
    reps,
    lapses: finiteCount(scheduling.lapses),
    state,
    learningSteps: finiteCount(scheduling.learningSteps),
  };
}

export function toFsrsCard(scheduling: UnifiedScheduling, now = new Date()): FsrsCard {
  const normalized = normalizeFsrsScheduling(scheduling, now);
  return {
    due: new Date(normalized.due),
    stability: normalized.stability,
    difficulty: normalized.difficulty,
    elapsed_days: normalized.elapsedDays,
    scheduled_days: normalized.scheduledDays,
    reps: normalized.reps,
    lapses: normalized.lapses,
    learning_steps: normalized.learningSteps,
    state: toFsrsState(normalized.state),
    last_review: normalized.lastReview
      ? new Date(normalized.lastReview)
      : normalized.state === "new"
        ? undefined
        : now,
  };
}

export function fromFsrsCard(
  card: FsrsCard,
  previous: UnifiedScheduling,
  reviewedAt: Date,
): UnifiedScheduling {
  return {
    due: card.due.toISOString(),
    lastReview: reviewedAt.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: fromFsrsState(card.state),
    learningSteps: card.learning_steps,
    buriedUntil: previous.buriedUntil ?? null,
    snoozedUntil: previous.snoozedUntil ?? null,
  };
}

/** A brand new scheduling record, due immediately. */
export function createNewScheduling(now = new Date()): UnifiedScheduling {
  const empty = createEmptyCard(now);
  return {
    due: empty.due.toISOString(),
    lastReview: null,
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsedDays: empty.elapsed_days,
    scheduledDays: empty.scheduled_days,
    reps: empty.reps,
    lapses: empty.lapses,
    state: "new",
    learningSteps: empty.learning_steps,
    buriedUntil: null,
    snoozedUntil: null,
  };
}

function scheduler(desiredRetention: number) {
  return fsrs({
    request_retention: desiredRetention,
    w: customWeights ?? undefined,
  });
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export interface ApplyReviewInput {
  scheduling: UnifiedScheduling;
  rating: UnifiedRating;
  /** When the learner pressed the rating button. */
  reviewedAt?: Date;
  desiredRetention?: number;
}

export interface ApplyReviewResult {
  scheduling: UnifiedScheduling;
  /** Scheduling before the review, for the review log. */
  before: UnifiedScheduling;
}

/** Apply one review with FSRS and return the new scheduling state. */
export function applyReview(input: ApplyReviewInput): ApplyReviewResult {
  const reviewedAt = input.reviewedAt ?? new Date();
  const retention = input.desiredRetention ?? DEFAULT_RETENTION;
  const before = normalizeFsrsScheduling(input.scheduling, reviewedAt);
  const recordLog = scheduler(retention).repeat(toFsrsCard(before, reviewedAt), reviewedAt);
  const next = recordLog[toFsrsRating(input.rating)].card;
  return {
    scheduling: fromFsrsCard(next, before, reviewedAt),
    before,
  };
}

/** Preview the four intervals without mutating anything. */
export function previewIntervals(
  scheduling: UnifiedScheduling,
  desiredRetention: number = DEFAULT_RETENTION,
  now = new Date(),
): Record<UnifiedRating, string> {
  const recordLog = scheduler(desiredRetention).repeat(toFsrsCard(scheduling, now), now);
  const label = (rating: UnifiedRating) =>
    formatInterval(recordLog[toFsrsRating(rating)].card.due.getTime() - now.getTime());
  return {
    again: label("again"),
    hard: label("hard"),
    good: label("good"),
    easy: label("easy"),
  };
}

/** Human-readable interval label, identical to Recall's formatting. */
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
  return `${(days / 365).toFixed(1)}y`;
}

/** Shallow equality for "did the scheduler change anything" checks. */
export function sameScheduling(a: UnifiedScheduling, b: UnifiedScheduling): boolean {
  return (
    a.due === b.due &&
    a.stability === b.stability &&
    a.difficulty === b.difficulty &&
    a.reps === b.reps &&
    a.lapses === b.lapses &&
    a.state === b.state
  );
}

export { Rating, State };
export type { FsrsCard };
