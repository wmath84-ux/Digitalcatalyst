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

export function toFsrsCard(scheduling: UnifiedScheduling): FsrsCard {
  return {
    due: new Date(scheduling.due),
    stability: scheduling.stability,
    difficulty: scheduling.difficulty,
    elapsed_days: scheduling.elapsedDays,
    scheduled_days: scheduling.scheduledDays,
    reps: scheduling.reps,
    lapses: scheduling.lapses,
    learning_steps: scheduling.learningSteps,
    state: toFsrsState(scheduling.state),
    last_review: scheduling.lastReview ? new Date(scheduling.lastReview) : undefined,
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
  const recordLog = scheduler(retention).repeat(toFsrsCard(input.scheduling), reviewedAt);
  const next = recordLog[toFsrsRating(input.rating)].card;
  const before = { ...input.scheduling };
  return {
    scheduling: fromFsrsCard(next, input.scheduling, reviewedAt),
    before,
  };
}

/** Preview the four intervals without mutating anything. */
export function previewIntervals(
  scheduling: UnifiedScheduling,
  desiredRetention: number = DEFAULT_RETENTION,
  now = new Date(),
): Record<UnifiedRating, string> {
  const recordLog = scheduler(desiredRetention).repeat(toFsrsCard(scheduling), now);
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
