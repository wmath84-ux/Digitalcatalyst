/**
 * Legacy Digitalcatalyst Revision → Unified Revision Domain adapter.
 * ==================================================================
 *
 * The existing feature stores everything in a single `RevisionDb` document
 * (subjects / topics / questions / dailyTests / testAttempts / testAnswers /
 * revisionItems / revisionSessions / revisionSessionAnswers) in
 * `localStorage`. That document is the learner's data of record today, so this
 * adapter PROJECTS it into the unified domain — it never replaces or deletes
 * it (migration brief §12: "Never silently delete existing learner data").
 *
 * Mapping decisions (documented so they can be audited):
 *
 *   Subject           → Deck(kind: "subject")           `deck:subject:<id>`
 *   Test              → Deck(kind: "test")              `deck:test:<id>`
 *   Question          → Card(cardType: "mcq")           `dcq:<id>`
 *   Class / Chapter   → hierarchical Tags               `Class:…`, `Chapter:…`
 *   Topic             → hierarchical Tag + `topicId`
 *   TestAttempt       → UnifiedAttempt
 *   TestAnswer        → UnifiedReviewLog (rated good/again)
 *   RevisionItem      → FSRS scheduling seed on the card
 *   RevisionSession   → UnifiedStudySession
 *   RevisionSessionAnswer → UnifiedReviewLog
 *
 * Nothing is derived from UI state; every value comes from persisted rows.
 */

import {
  DEFAULT_SETTINGS,
  DEFAULT_USER_CUSTOM_SETTINGS,
  type DailyTestRow,
  type QuestionRow,
  type RevisionDb,
  type RevisionItemRow,
  type RevisionSessionRow,
  type SubjectRow,
  type TestAnswerRow,
  type TestAttemptRow,
  type TopicRow,
  type UserCustomSettings,
} from "../../engine/store";
import {
  DEFAULT_STUDY_SETTINGS,
  ID_PREFIX,
  makeId,
  normalizeTagPath,
  reviewDedupeKey,
  tagLeaf,
  tagParent,
  type CardDifficulty,
  type UnifiedCard,
  type UnifiedCardState,
  type UnifiedDeck,
  type UnifiedId,
  type UnifiedReviewLog,
  type UnifiedSessionId,
  type UnifiedSnapshot,
  type UnifiedStudySession,
  type UnifiedTag,
  type UnifiedTest,
  type UnifiedAttempt,
  type UnifiedRating,
} from "../types";

export const SUBJECT_DECK_ID = (subjectId: number): UnifiedId => makeId(ID_PREFIX.deck, `subject:${subjectId}`);
export const TEST_DECK_ID = (testId: number): UnifiedId => makeId(ID_PREFIX.deck, `test:${testId}`);
export const USER_DECK_ID = (raw: string): UnifiedId => makeId(ID_PREFIX.deck, `user:${raw}`);
export const CARD_ID = (questionId: number): UnifiedId => makeId(ID_PREFIX.curriculumQuestion, questionId);

const DECK_COLORS: UnifiedDeck["color"][] = ["blue", "green", "amber", "rose", "violet", "slate"];

function deckColor(seed: number): UnifiedDeck["color"] {
  return DECK_COLORS[Math.abs(seed) % DECK_COLORS.length];
}

/**
 * The interval semantics the legacy engine already implied:
 *   learning  → due now (it was counted in `summary.due`)
 *   improving → due now
 *   mastered  → due 30 days after the mastery date
 * `nextReview` therefore reproduces exactly what the old dashboard showed,
 * so migrating does not suddenly change anybody's due count.
 */
const MASTERED_INTERVAL_DAYS = 30;

function schedulingFromRevisionItem(item: RevisionItemRow | undefined, now: Date) {
  if (!item) {
    return {
      due: now.toISOString(),
      lastReview: null,
      stability: 0,
      difficulty: 6.2,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: "new" as UnifiedCardState,
      learningSteps: 0,
    };
  }

  const seen = item.timesSeen > 0;
  const state: UnifiedCardState = !seen ? "new" : item.status === "mastered" ? "review" : "learning";
  const anchor = item.lastRevisedAt ?? item.addedAt;
  const due =
    state === "review" && anchor
      ? new Date(new Date(anchor).getTime() + MASTERED_INTERVAL_DAYS * 86_400_000)
      : now;

  const total = item.timesCorrect + item.timesWrong;
  const accuracy = total > 0 ? item.timesCorrect / total : 0;
  // Every seen legacy item carries a non-new state. Give it at least one day
  // of memory even when old rows have no correct/wrong counters, otherwise
  // ts-fsrs rejects the `state: review, stability: 0` projection.
  const stability = state === "new" ? 0 : Math.max(1, item.successStreak, accuracy > 0 ? 1 : 0);

  return {
    due: due.toISOString(),
    lastReview: item.lastRevisedAt,
    // A conservative stability seed: one day per successful streak, floored at
    // 1 day once the learner has actually answered it.
    stability,
    difficulty: 4 + (1 - accuracy) * 5,
    elapsedDays: 0,
    scheduledDays: state === "review" ? MASTERED_INTERVAL_DAYS : 0,
    reps: item.timesSeen,
    lapses: item.timesWrong,
    state,
    learningSteps: 0,
  };
}

function curriculumTags(input: {
  classSlug?: string;
  className?: string;
  subjectName: string;
  topicName?: string;
  difficulty: QuestionRow["difficulty"];
  source?: string;
}): string[] {
  const out: string[] = [];
  if (input.className) out.push(normalizeTagPath(`Class/${input.className}`));
  else if (input.classSlug) out.push(normalizeTagPath(`Class/${input.classSlug}`));
  out.push(normalizeTagPath(`Subject/${input.subjectName}`));
  if (input.topicName) out.push(normalizeTagPath(`Topic/${input.topicName}`));
  out.push(normalizeTagPath(`Difficulty/${input.difficulty}`));
  if (input.source) out.push(normalizeTagPath(`Source/${input.source}`));
  return out;
}

export interface LegacyProjectionContext {
  db: RevisionDb;
  /** Class name for each subject id, resolved from the user's custom settings. */
  classNames?: Record<number, string>;
  /** Slug of the class the learner filtered to, when any. */
  classSlug?: string;
  userName?: string;
}

/**
 * Project the legacy database into the unified domain.
 *
 * Pure + synchronous: it reads the legacy document and returns a snapshot. The
 * caller decides whether to persist it, which keeps the migration runner
 * crash-safe (nothing is written until the whole projection succeeds).
 */
export function projectLegacyDb(ctx: LegacyProjectionContext, now = new Date()): UnifiedSnapshot {
  const { db } = ctx;
  const decks: UnifiedDeck[] = [];
  const cards: UnifiedCard[] = [];
  const tags = new Map<string, UnifiedTag>();
  const reviewLogs: UnifiedReviewLog[] = [];
  const sessions: UnifiedStudySession[] = [];
  const tests: UnifiedTest[] = [];
  const attempts: UnifiedAttempt[] = [];

  const subjectById = new Map<number, SubjectRow>(db.subjects.map((s) => [s.id, s]));
  const topicById = new Map<number, TopicRow>(db.topics.map((t) => [t.id, t]));
  const revisionItemByQuestion = new Map<number, RevisionItemRow>(
    db.revisionItems.map((item) => [item.questionId, item]),
  );

  const addTag = (path: string) => {
    const normalized = normalizeTagPath(path);
    if (!normalized) return;
    const all = normalized.split("/");
    for (let i = 0; i < all.length; i += 1) {
      const current = all.slice(0, i + 1).join("/");
      const existing = tags.get(current);
      if (existing) {
        existing.count += i === all.length - 1 ? 1 : 0;
      } else {
        tags.set(current, {
          id: makeId(ID_PREFIX.tag, current),
          path: current,
          name: tagLeaf(current),
          parent: i === 0 ? null : all.slice(0, i).join("/"),
          count: i === all.length - 1 ? 1 : 0,
          createdAt: now.toISOString(),
        });
      }
    }
  };

  // ── Decks: one per curriculum subject ────────────────────────────────────
  db.subjects.forEach((subject, index) => {
    decks.push({
      id: SUBJECT_DECK_ID(subject.id),
      name: subject.name,
      description: `${subject.name} — ${db.questions.filter((q) => q.subjectId === subject.id).length} questions in your curriculum`,
      color: deckColor(index),
      kind: "subject",
      subjectId: subject.id,
      classSlug: ctx.classSlug,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  // ── Cards: one per question, carrying the legacy revision state ──────────
  db.questions.forEach((question, index) => {
    const topic = topicById.get(question.topicId);
    const subject = subjectById.get(question.subjectId);
    if (!subject) return;
    const item = revisionItemByQuestion.get(question.id);
    const cardTags = curriculumTags({
      classSlug: ctx.classSlug,
      className: subject ? ctx.classNames?.[subject.id] : undefined,
      subjectName: subject.name,
      topicName: topic?.name,
      difficulty: question.difficulty,
    });
    cardTags.forEach(addTag);

    cards.push({
      id: CARD_ID(question.id),
      deckId: SUBJECT_DECK_ID(subject.id),
      subjectId: subject.id,
      topicId: question.topicId,
      classSlug: ctx.classSlug,
      tags: cardTags,
      front: question.prompt,
      back: (question.options[question.correctIndex] ?? "").trim(),
      hint: "",
      explanation: question.explanation || undefined,
      options: question.options,
      correctIndex: question.correctIndex,
      cardType: "mcq",
      media: [],
      source: "curriculum",
      difficulty: question.difficulty as CardDifficulty,
      legacy: {
        questionId: question.id,
        revisionItemId: item?.id,
        revisionStatus: item?.status,
        subjectId: subject.id,
        topicId: question.topicId,
      },
      createdAt: item?.addedAt ?? now.toISOString(),
      updatedAt: item?.updatedAt ?? now.toISOString(),
      position: index,
      scheduling: schedulingFromRevisionItem(item, now),
    });
  });

  // ── Tests → decks + unified tests ────────────────────────────────────────
  const testById = new Map<number, DailyTestRow>(db.dailyTests.map((test) => [test.id, test]));
  db.dailyTests.forEach((test, index) => {
    decks.push({
      id: TEST_DECK_ID(test.id),
      name: test.title,
      description:
        test.kind === "custom"
          ? `Custom ${test.source === "bulk" ? "imported" : "generated"} test · ${test.totalQuestions} questions`
          : `Daily Test · ${test.testDate} · ${test.totalQuestions} questions`,
      color: test.kind === "custom" ? "violet" : "blue",
      kind: "test",
      subjectId: test.questionIds.length ? db.questions.find((q) => q.id === test.questionIds[0])?.subjectId : undefined,
      createdAt: `${test.testDate}T00:00:00.000Z`,
      updatedAt: `${test.testDate}T00:00:00.000Z`,
    });
    if (test.kind === "custom" && test.source) {
      test.questionIds.forEach((questionId) => {
        const card = cards.find((c) => c.legacy?.questionId === questionId);
        if (!card) return;
        const tag = normalizeTagPath(`Source/${test.source === "bulk" ? "Bulk Import" : "AI Generated"}`);
        if (!card.tags.includes(tag)) card.tags.push(tag);
        addTag(tag);
      });
    }
    tests.push({
      id: makeId(ID_PREFIX.test, test.id),
      legacyId: test.id,
      deckId: TEST_DECK_ID(test.id),
      title: test.title,
      testDate: test.testDate,
      slot: test.slot,
      kind: test.kind === "custom" ? "custom" : "daily",
      source: test.source,
      questionIds: test.questionIds,
      totalQuestions: test.totalQuestions,
      estimatedMinutes: test.estimatedMinutes,
      planDetails: test.planDetails,
      createdAt: `${test.testDate}T00:00:00.000Z`,
    });
    void index;
  });

  // ── Attempts ─────────────────────────────────────────────────────────────
  db.testAttempts.forEach((attempt: TestAttemptRow) => {
    attempts.push({
      id: makeId(ID_PREFIX.attempt, attempt.id),
      legacyId: attempt.id,
      testId: makeId(ID_PREFIX.test, attempt.dailyTestId),
      legacyTestId: attempt.dailyTestId,
      status: attempt.status,
      attemptKind: attempt.attemptKind === "skipped" ? "skipped" : "full",
      parentAttemptId: attempt.parentAttemptId ?? null,
      questionIds: attempt.questionIds,
      currentIndex: attempt.currentIndex,
      score: attempt.score,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      skippedCount: attempt.skippedCount,
      timeSpentSeconds: attempt.timeSpentSeconds,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      updatedAt: attempt.updatedAt,
    });
  });

  // ── Review history from exam answers ─────────────────────────────────────
  const attemptById = new Map<number, TestAttemptRow>(db.testAttempts.map((a) => [a.id, a]));
  const pushReview = (input: {
    answerId: number;
    questionId: number;
    isCorrect: boolean | null;
    isSkipped: boolean;
    answeredAt: string | null;
    sessionId: UnifiedSessionId | null;
    source: UnifiedReviewLog["source"];
    timeSpentSeconds?: number;
  }) => {
    if (input.isSkipped || input.isCorrect === null || !input.answeredAt) return;
    const cardId = CARD_ID(input.questionId);
    const rating: UnifiedRating = input.isCorrect ? "good" : "again";
    const reviewedAt = input.answeredAt;
    reviewLogs.push({
      id: makeId(ID_PREFIX.review, `legacy:${input.answerId}`),
      cardId,
      rating,
      reviewedAt,
      responseTime: Math.max(0, Math.round((input.timeSpentSeconds ?? 0) * 1000)),
      source: input.source,
      sessionId: input.sessionId,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      stateBefore: "new",
      stateAfter: input.isCorrect ? "review" : "learning",
      legacyAnswerId: input.answerId,
      dedupeKey: reviewDedupeKey({ cardId, rating, sessionId: input.sessionId, reviewedAt }),
    });
  };

  const testAnswerByQuestion = new Map<number, TestAnswerRow[]>();
  db.testAnswers.forEach((answer) => {
    const list = testAnswerByQuestion.get(answer.attemptId) ?? [];
    list.push(answer);
    testAnswerByQuestion.set(answer.attemptId, list);
  });

  db.testAnswers.forEach((answer) => {
    const attempt = attemptById.get(answer.attemptId);
    const timeSpent = attempt
      ? attempt.timeSpentSeconds / Math.max(1, attempt.correctCount + attempt.wrongCount + attempt.skippedCount)
      : 0;
    pushReview({
      answerId: answer.id,
      questionId: answer.questionId,
      isCorrect: answer.isCorrect,
      isSkipped: answer.isSkipped,
      answeredAt: answer.answeredAt,
      sessionId: attempt ? makeId(ID_PREFIX.session, `attempt:${attempt.id}`) : null,
      source: attempt && testById.get(attempt.dailyTestId)?.kind === "custom" ? "smart-revision" : "daily-test",
      timeSpentSeconds: timeSpent,
    });
  });

  // ── Smart Revision sessions ──────────────────────────────────────────────
  db.revisionSessions.forEach((session: RevisionSessionRow) => {
    const sessionId = makeId(ID_PREFIX.session, session.id);
    sessions.push({
      id: sessionId,
      deckId: session.filterSubjectId ? SUBJECT_DECK_ID(session.filterSubjectId) : null,
      cardIds: session.questionIds.map(CARD_ID),
      currentIndex: session.currentIndex,
      startedAt: session.startedAt,
      endedAt: session.completedAt,
      completed: session.status === "completed",
      ratings: { again: 0, hard: 0, good: 0, easy: 0 },
      newCardsCount: 0,
      queue: session.filterStatus === "mastered" ? "custom" : "due",
      legacy: { revisionSessionId: session.id },
    });
  });

  db.revisionSessionAnswers.forEach((answer) => {
    if (answer.isSkipped || answer.isCorrect === null || !answer.answeredAt) return;
    const cardId = CARD_ID(answer.questionId);
    const rating: UnifiedRating = answer.isCorrect ? "good" : "again";
    const sessionId = makeId(ID_PREFIX.session, answer.sessionId);
    reviewLogs.push({
      id: makeId(ID_PREFIX.review, `legacy-session:${answer.id}`),
      cardId,
      rating,
      reviewedAt: answer.answeredAt,
      responseTime: 0,
      source: "smart-revision",
      sessionId,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      stateBefore: (answer.statusBefore ?? "new") as UnifiedCardState,
      stateAfter: (answer.statusAfter ?? "learning") as UnifiedCardState,
      legacyAnswerId: answer.id,
      dedupeKey: reviewDedupeKey({ cardId, rating, sessionId, reviewedAt: answer.answeredAt }),
    });
  });

  // Fill session rating tallies from the logs we just built.
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  reviewLogs.forEach((log) => {
    if (!log.sessionId) return;
    const session = sessionById.get(log.sessionId);
    if (session) session.ratings[log.rating] += 1;
  });

  return {
    version: 0,
    decks,
    folders: [],
    cards,
    tags: Array.from(tags.values()),
    reviewLogs: dedupeReviewLogs(reviewLogs),
    sessions,
    tests,
    attempts,
    savedSearches: [],
    settings: {
      catalog: db.settings ?? { ...DEFAULT_SETTINGS },
      custom: { ...DEFAULT_USER_CUSTOM_SETTINGS },
      study: { ...DEFAULT_STUDY_SETTINGS, ...(ctx.userName ? {} : {}) },
    },
    media: [],
  };
}

/**
 * Collapse duplicate review events. Export/import round trips and cloud
 * retries can legitimately hand us the same event twice; the unified model
 * stores each review exactly once (§14: "No duplicate cards/reviews when
 * synchronization retries").
 */
export function dedupeReviewLogs(logs: UnifiedReviewLog[]): UnifiedReviewLog[] {
  const byKey = new Map<string, UnifiedReviewLog>();
  for (const log of logs) {
    const existing = byKey.get(log.dedupeKey);
    if (!existing) {
      byKey.set(log.dedupeKey, log);
      continue;
    }
    // Prefer the row that carries richer FSRS metadata.
    if (existing.stability === 0 && log.stability > 0) byKey.set(log.dedupeKey, log);
  }
  return Array.from(byKey.values()).sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
}

/** Merge two unified snapshots without duplicating cards, decks or reviews. */
export function mergeUnifiedSnapshots(base: UnifiedSnapshot, incoming: UnifiedSnapshot): UnifiedSnapshot {
  const mergeById = <T extends { id: string; updatedAt?: string }>(a: T[], b: T[]): T[] => {
    const map = new Map<string, T>();
    a.forEach((row) => map.set(row.id, row));
    b.forEach((row) => {
      const existing = map.get(row.id);
      if (!existing) {
        map.set(row.id, row);
        return;
      }
      const aTime = existing.updatedAt ?? "";
      const bTime = row.updatedAt ?? "";
      map.set(row.id, bTime >= aTime ? { ...existing, ...row } : existing);
    });
    return Array.from(map.values());
  };

  return {
    version: Math.max(base.version, incoming.version),
    decks: mergeById(base.decks, incoming.decks),
    folders: mergeById(base.folders, incoming.folders),
    cards: mergeById(base.cards, incoming.cards),
    tags: mergeById(base.tags as Array<UnifiedTag & { updatedAt?: string }>, incoming.tags as Array<UnifiedTag & { updatedAt?: string }>) as UnifiedTag[],
    reviewLogs: dedupeReviewLogs([...base.reviewLogs, ...incoming.reviewLogs]),
    sessions: mergeById(base.sessions, incoming.sessions),
    tests: mergeById(base.tests, incoming.tests),
    attempts: mergeById(base.attempts, incoming.attempts),
    savedSearches: mergeById(base.savedSearches, incoming.savedSearches),
    settings: { ...base.settings, ...incoming.settings },
    media: mergeById(base.media, incoming.media),
  };
}

/** Coerce an unknown value into the legacy user-custom shape (schema drift safe). */
export function normalizeCustomSettings(raw: Partial<UserCustomSettings> | undefined): UserCustomSettings {
  return { ...DEFAULT_USER_CUSTOM_SETTINGS, ...(raw ?? {}) };
}

export { tagParent };
