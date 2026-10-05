/**
 * Unified reviews → legacy Digitalcatalyst Revision engine.
 * ========================================================
 *
 * The ported Recall study flow records reviews in the unified model. Four
 * existing, still-shipping Digitalcatalyst surfaces read their numbers from the
 * legacy `RevisionDb` document instead:
 *
 *   • Weak Topics      (`statsService.getWeakTopics`)
 *   • Progress         (`statsService.getProgressData`)
 *   • Dashboard/Test Bank summary (`revisionService.getRevisionSummary`)
 *   • Smart Revision result + resume (`revisionService.submitRevisionSession`)
 *
 * …plus the cloud sync contract, which persists `revisionItems`,
 * `revisionAttempts` and `revisionSessions`. So every unified review has to be
 * mirrored into that document, using the exact same mastery state machine the
 * legacy service implements — otherwise the learner would see two different
 * progress numbers for the same study session.
 *
 * Guarantees
 *   • Never duplicate an application: applied review ids are remembered in
 *     IndexedDB, so a crash between "recorded" and "mirrored" can be retried at
 *     boot without double-counting.
 *   • Never delete: this module only updates fields the legacy engine already
 *     owns and only creates a revision item for a card that was actually
 *     reviewed in this feature.
 *   • Never reschedule legacy work: FSRS scheduling stays in the unified model
 *     and in `revisionItems`' own existing semantics.
 */

import { loadDb, nowIso, saveDb, type RevisionDb, type RevisionItemRow, type RevisionStatus } from "./store";
import { readKv, writeKv } from "./localDb";
import type { UnifiedCard, UnifiedId, UnifiedRating, UnifiedSnapshot } from "../domain/types";
import { projectLegacyDb } from "../domain/adapters/legacyProjection";

export const KV_MIRRORED_REVIEWS = "legacy-mirror-applied";

/** How many applied ids to remember — a few days of heavy reviewing. */
const MIRROR_HISTORY_LIMIT = 4000;

async function loadApplied(): Promise<Set<string>> {
  const stored = await readKv<string[]>(KV_MIRRORED_REVIEWS);
  return new Set(stored ?? []);
}

async function saveApplied(applied: Set<string>): Promise<void> {
  const values = Array.from(applied);
  await writeKv(KV_MIRRORED_REVIEWS, values.slice(Math.max(0, values.length - MIRROR_HISTORY_LIMIT)));
}

/**
 * The legacy engine treats everything as correct/incorrect. `hard` is a correct
 * answer that needed effort, so it counts as correct for accuracy but does not
 * by itself promote the mastery state — the learner has not demonstrated the
 * clean recall the state machine rewards.
 */
export function legacyOutcome(rating: UnifiedRating): {
  isCorrect: boolean;
  advancesMastery: boolean;
  countsAsWrong: boolean;
} {
  switch (rating) {
    case "again":
      return { isCorrect: false, advancesMastery: false, countsAsWrong: true };
    case "hard":
      return { isCorrect: true, advancesMastery: false, countsAsWrong: false };
    case "good":
    case "easy":
      return { isCorrect: true, advancesMastery: true, countsAsWrong: false };
  }
}

function nextStatus(
  statusBefore: RevisionStatus,
  isCorrect: boolean,
  advancesMastery: boolean,
): RevisionStatus {
  if (isCorrect) {
    if (!advancesMastery) return statusBefore;
    if (statusBefore === "learning") return "improving";
    return "mastered";
  }
  return statusBefore === "mastered" ? "improving" : "learning";
}

/**
 * Apply one unified review to the legacy revision item, exactly mirroring
 * `revisionService.submitRevisionSession`'s state machine.
 */
export function applyReviewToLegacyDb(
  db: RevisionDb,
  questionId: number,
  rating: UnifiedRating,
  reviewedAt: string,
): boolean {
  const question = db.questions.find((row) => row.id === questionId);
  if (!question) return false;

  const outcome = legacyOutcome(rating);
  const item: RevisionItemRow =
    db.revisionItems.find((row) => row.questionId === questionId) ??
    createRevisionItem(db, questionId, question.subjectId, question.topicId, reviewedAt);

  const statusBefore = item.status;
  item.status = nextStatus(statusBefore, outcome.isCorrect, outcome.advancesMastery);
  item.successStreak = outcome.isCorrect ? item.successStreak + 1 : 0;
  item.timesSeen += 1;
  if (outcome.isCorrect) item.timesCorrect += 1;
  if (outcome.countsAsWrong) item.timesWrong += 1;
  item.lastResult = outcome.isCorrect ? "correct" : "wrong";
  item.lastRevisedAt = reviewedAt;
  if (item.status === "mastered" && statusBefore !== "mastered") item.masteredAt = reviewedAt;
  item.updatedAt = nowIso();
  return true;
}

function createRevisionItem(
  db: RevisionDb,
  questionId: number,
  subjectId: number,
  topicId: number,
  addedAt: string,
): RevisionItemRow {
  const item: RevisionItemRow = {
    id: Date.now() * 1_000_000 + Math.floor(Math.random() * 1_000_000),
    questionId,
    subjectId,
    topicId,
    status: "learning",
    successStreak: 0,
    timesSeen: 0,
    timesCorrect: 0,
    timesWrong: 0,
    lastResult: null,
    sourceAttemptId: null,
    addedAt,
    lastRevisedAt: null,
    masteredAt: null,
    updatedAt: nowIso(),
  };
  db.revisionItems.push(item);
  return item;
}

/**
 * Mirror every unified review that has not been mirrored yet.
 *
 * `reviews` is normally "the tail of the review log"; passing the whole log is
 * safe because applied ids are remembered.
 */
export async function mirrorReviewsToLegacy(
  uid: string,
  snapshot: UnifiedSnapshot,
  reviews?: Array<{ id: UnifiedId; cardId: UnifiedId; rating: UnifiedRating; reviewedAt: string }>,
): Promise<number> {
  const applied = await loadApplied();
  const pending = (reviews ?? snapshot.reviewLogs).filter((review) => !applied.has(review.id));
  if (pending.length === 0) return 0;

  const cardById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const db = loadDb(uid);
  let mirrored = 0;

  const ordered = [...pending].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  for (const review of ordered) {
    const card = cardById.get(review.cardId);
    const questionId = card?.legacy?.questionId;
    applied.add(review.id);
    if (questionId === undefined) continue;
    if (applyReviewToLegacyDb(db, questionId, review.rating, review.reviewedAt)) mirrored += 1;
  }

  if (mirrored > 0) saveDb(uid, db);
  await saveApplied(applied);
  return mirrored;
}

/** Track smart-revision answers so the legacy result page shows real data. */
export async function mirrorRevisionSessionAnswer(
  uid: string,
  sessionId: number,
  questionId: number,
  rating: UnifiedRating,
  answeredAt: string,
): Promise<void> {
  const db = loadDb(uid);
  const session = db.revisionSessions.find((row) => row.id === sessionId);
  if (!session || session.status !== "in_progress") return;
  if (!session.questionIds.includes(questionId)) return;

  const outcome = legacyOutcome(rating);
  const isSkipped = false;
  const existing = db.revisionSessionAnswers.find(
    (row) => row.sessionId === sessionId && row.questionId === questionId,
  );
  const item = db.revisionItems.find((row) => row.questionId === questionId);
  if (existing) {
    existing.selectedIndex = outcome.isCorrect ? 0 : -1;
    existing.isCorrect = outcome.isCorrect;
    existing.isSkipped = isSkipped;
    existing.answeredAt = answeredAt;
  } else {
    db.revisionSessionAnswers.push({
      id: Date.now() * 1_000_000 + Math.floor(Math.random() * 1_000_000),
      sessionId,
      revisionItemId: item?.id ?? 0,
      questionId,
      selectedIndex: outcome.isCorrect ? 0 : -1,
      isCorrect: outcome.isCorrect,
      isSkipped,
      statusBefore: item?.status ?? null,
      statusAfter: null,
      answeredAt,
    });
  }
  if (outcome.isCorrect) session.correctCount += 1;
  saveDb(uid, db);
}

/**
 * Re-project the legacy document and merge it into the unified snapshot.
 *
 * Used at boot and after any legacy-only write (a submitted Daily Test, an AI
 * generation saved to the Test Bank, a bulk import) so the Recall surfaces pick
 * the new content up without a reload, while cards the learner created directly
 * in Revision are preserved.
 */
export function projectLegacyForMerge(uid: string, options?: { classSlug?: string; classNames?: Record<number, string> }) {
  const db = loadDb(uid);
  return projectLegacyDb({ db, classSlug: options?.classSlug, classNames: options?.classNames });
}

/** Convenience for callers that only need the question id of a card. */
export function legacyQuestionId(card: UnifiedCard | undefined): number | undefined {
  return card?.legacy?.questionId;
}
