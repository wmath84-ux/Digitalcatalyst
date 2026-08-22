// User-created custom tests (AI generator + bulk import).
//
// Both the student AI question generator and the student bulk importer
// produce a ready-to-take test that shows up on the dashboard immediately.
// Custom tests are stored as normal DailyTestRow entries flagged with
// kind:"custom", so the existing player / result / review pipeline works
// unchanged — but they never join the automatic daily rotation and they
// never expire.

import {
  loadDb,
  saveDb,
  nextId,
  nowIso,
  todayDateStr,
  ServiceError,
  type DailyTestRow,
  type Difficulty,
  type RevisionDb,
  type TestAttemptRow,
} from "./store";
import type { QuestionMode } from "./aiGenerate";

export type CustomTestQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: Difficulty;
  /** Display subject the question belongs to (created on the fly). */
  subjectName: string;
  /** Display topic/chapter the question belongs to (created on the fly). */
  topicName: string;
};

export type RevisionPlanDetails = {
  classNames: string[];
  subjectNames: string[];
  chapterNames: string[];
  topicNames: string[];
  difficulty: Difficulty | "mixed";
  questionMode?: QuestionMode;
};

export type CreateCustomTestInput = {
  title: string;
  estimatedMinutes: number;
  source: "ai" | "bulk";
  questions: CustomTestQuestion[];
  /** Stored separately so the dashboard never has to guess a plan's syllabus. */
  planDetails?: RevisionPlanDetails;
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
  `item-${Date.now().toString(36)}`;

/** Collision-safe id: always one past the current max in the table. */
function maxId(rows: Array<{ id: number }>): number {
  let max = 0;
  for (const r of rows) if (r.id > max) max = r.id;
  return max;
}

/**
 * Allocate an id that can never collide: takes the larger of the shared
 * nextIds counter and (max existing row id + 1), then advances the counter so
 * the rest of the engine (which uses nextId) stays in sync.
 */
function allocId(db: RevisionDb, table: string, rows: Array<{ id: number }>): number {
  // nextId is globally collision-resistant; maxId remains a defensive guard
  // for data imported from much older sequential-id databases.
  const id = Math.max(nextId(db, table), maxId(rows) + 1);
  db.nextIds[table] = id + 1;
  return id;
}

function ensureSubject(db: RevisionDb, name: string): number {
  const clean = name.trim() || "General";
  const slug = slugify(clean);
  const existing =
    db.subjects.find((s) => s.slug === slug) ??
    db.subjects.find((s) => s.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const id = allocId(db, "subjects", db.subjects);
  db.subjects.push({ id, name: clean, slug, icon: "✨", color: "violet" });
  return id;
}

function ensureTopic(db: RevisionDb, subjectId: number, name: string): number {
  const clean = name.trim() || "General";
  const slug = slugify(clean);
  const existing = db.topics.find(
    (t) => t.subjectId === subjectId && (t.slug === slug || t.name.toLowerCase() === clean.toLowerCase()),
  );
  if (existing) return existing.id;
  const id = allocId(db, "topics", db.topics);
  db.topics.push({ id, subjectId, name: clean, slug: `${slug}-${id}` });
  return id;
}

/** Create a ready-to-take custom test. Returns the new test id. */
export function createCustomTest(uid: string, input: CreateCustomTestInput): { testId: number } {
  const usable = input.questions.filter(
    (q) => q.prompt.trim().length > 0 && q.options.filter((o) => o.trim()).length >= 2,
  );
  if (usable.length === 0) {
    throw new ServiceError("NO_QUESTIONS", "No usable questions to build the test.");
  }

  const db = loadDb(uid);
  const questionIds: number[] = [];

  for (const q of usable) {
    const subjectId = ensureSubject(db, q.subjectName);
    const topicId = ensureTopic(db, subjectId, q.topicName);
    const options = q.options.map((o) => o.trim()).filter((o) => o.length > 0).slice(0, 6);
    const id = allocId(db, "questions", db.questions);
    db.questions.push({
      id,
      topicId,
      subjectId,
      difficulty: q.difficulty,
      prompt: q.prompt.trim().slice(0, 600),
      options,
      correctIndex: Math.max(0, Math.min(options.length - 1, q.correctIndex)),
      explanation: q.explanation.trim().slice(0, 600),
      isActive: true,
    });
    questionIds.push(id);
  }

  const testDate = todayDateStr();
  const customToday = db.dailyTests.filter((t) => t.kind === "custom" && t.testDate === testDate).length;
  const test: DailyTestRow = {
    id: allocId(db, "dailyTests", db.dailyTests),
    testDate,
    // Slots ≥ 1000 keep custom tests visually and logically apart from the
    // automatic rotation even if the data is inspected manually.
    slot: 1000 + customToday,
    title: (input.title.trim() || (input.source === "ai" ? "AI Generated Test" : "Imported Test")).slice(0, 160),
    questionIds,
    totalQuestions: questionIds.length,
    estimatedMinutes: Math.max(1, Math.min(240, Math.round(input.estimatedMinutes) || 5)),
    kind: "custom",
    source: input.source,
    planDetails: input.planDetails
      ? {
          classNames: [...input.planDetails.classNames],
          subjectNames: [...input.planDetails.subjectNames],
          chapterNames: [...input.planDetails.chapterNames],
          topicNames: [...input.planDetails.topicNames],
          difficulty: input.planDetails.difficulty,
          questionMode: input.planDetails.questionMode,
        }
      : undefined,
  };
  db.dailyTests.push(test);
  saveDb(uid, db);
  return { testId: test.id };
}

export type CustomTestListItem = {
  id: number;
  title: string;
  source: string;
  testDate: string;
  totalQuestions: number;
  estimatedMinutes: number;
  status: "available" | "in_progress" | "completed";
  attemptId: number | null;
  score: number | null;
  currentIndex: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  attemptCount: number;
  completedAt: string | null;
  planDetails: RevisionPlanDetails;
};

/** All custom tests (newest first) with their attempt state for the dashboard. */
export function listCustomTests(uid: string): CustomTestListItem[] {
  const db = loadDb(uid);
  return db.dailyTests
    .filter((t) => t.kind === "custom")
    .sort((a, b) => b.id - a.id)
    .map((t) => {
      const attempts = db.testAttempts
        .filter((attempt) => attempt.dailyTestId === t.id)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      const inProgress = attempts.find((attempt) => attempt.status === "in_progress") ?? null;
      const latestCompleted = attempts.find((attempt) => attempt.status === "completed") ?? null;
      const attempt = inProgress ?? latestCompleted;
      const status: CustomTestListItem["status"] =
        inProgress ? "in_progress" : latestCompleted ? "completed" : "available";
      const subjects = Array.from(
        new Set(
          t.questionIds
            .map((questionId) => db.questions.find((q) => q.id === questionId)?.subjectId)
            .map((subjectId) => db.subjects.find((s) => s.id === subjectId)?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const topics = Array.from(
        new Set(
          t.questionIds
            .map((questionId) => db.questions.find((q) => q.id === questionId)?.topicId)
            .map((topicId) => db.topics.find((topic) => topic.id === topicId)?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      );
      return {
        id: t.id,
        title: t.title,
        source: t.source ?? "ai",
        testDate: t.testDate,
        totalQuestions: t.totalQuestions,
        estimatedMinutes: t.estimatedMinutes,
        status,
        attemptId: attempt?.id ?? null,
        score: latestCompleted?.score ?? null,
        currentIndex: inProgress?.currentIndex ?? 0,
        correctCount: latestCompleted?.correctCount ?? 0,
        wrongCount: latestCompleted?.wrongCount ?? 0,
        skippedCount: latestCompleted?.skippedCount ?? 0,
        attemptCount: attempts.filter((row) => row.status === "completed").length,
        completedAt: latestCompleted?.completedAt ?? null,
        // Old saved tests did not have planDetails. Derive honest labels from
        // their questions instead of displaying made-up/random syllabus text.
        planDetails: t.planDetails ?? {
          classNames: [],
          subjectNames: subjects,
          chapterNames: topics,
          topicNames: [],
          difficulty: "mixed",
        },
      };
    });
}

function createAttempt(
  db: RevisionDb,
  testId: number,
  questionIds: number[],
  attemptKind: "full" | "skipped",
  parentAttemptId: number | null,
): TestAttemptRow {
  const attempt: TestAttemptRow = {
    id: allocId(db, "testAttempts", db.testAttempts),
    dailyTestId: testId,
    questionIds: [...questionIds],
    attemptKind,
    parentAttemptId,
    status: "in_progress",
    currentIndex: 0,
    score: 0,
    correctCount: 0,
    wrongCount: 0,
    skippedCount: 0,
    timeSpentSeconds: 0,
    startedAt: nowIso(),
    completedAt: null,
    updatedAt: nowIso(),
  };
  db.testAttempts.push(attempt);
  return attempt;
}

/** Start the first attempt, or resume this test's current in-progress attempt. */
export function startCustomTestAttempt(uid: string, testId: number): TestAttemptRow {
  const db = loadDb(uid);
  const test = db.dailyTests.find((t) => t.id === testId && t.kind === "custom");
  if (!test) throw new ServiceError("NOT_FOUND", "This test could not be found.");
  const existing = db.testAttempts
    .filter((attempt) => attempt.dailyTestId === testId && attempt.status === "in_progress")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  if (existing) return existing;
  const completed = db.testAttempts.some((attempt) => attempt.dailyTestId === testId && attempt.status === "completed");
  if (completed) throw new ServiceError("ALREADY_COMPLETED", "Choose Revise Again to start a new attempt.");
  const attempt = createAttempt(db, testId, test.questionIds, "full", null);
  saveDb(uid, db);
  return attempt;
}

/** Create a fresh full-test attempt without overwriting any previous result. */
export function startCustomTestRetake(uid: string, testId: number): TestAttemptRow {
  const db = loadDb(uid);
  const test = db.dailyTests.find((row) => row.id === testId && row.kind === "custom");
  if (!test) throw new ServiceError("NOT_FOUND", "This test could not be found.");
  const inProgress = db.testAttempts.find((attempt) => attempt.dailyTestId === testId && attempt.status === "in_progress");
  if (inProgress) return inProgress;
  const parent = db.testAttempts
    .filter((attempt) => attempt.dailyTestId === testId && attempt.status === "completed")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())[0] ?? null;
  const attempt = createAttempt(db, testId, test.questionIds, "full", parent?.id ?? null);
  saveDb(uid, db);
  return attempt;
}

/** Create an attempt containing only questions skipped in the latest result. */
export function startSkippedQuestionsRetake(uid: string, testId: number): TestAttemptRow {
  const db = loadDb(uid);
  const test = db.dailyTests.find((row) => row.id === testId && row.kind === "custom");
  if (!test) throw new ServiceError("NOT_FOUND", "This test could not be found.");
  const inProgress = db.testAttempts
    .filter((attempt) => attempt.dailyTestId === testId && attempt.status === "in_progress")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  if (inProgress) return inProgress;
  const latest = db.testAttempts
    .filter((attempt) => attempt.dailyTestId === testId && attempt.status === "completed")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())[0];
  if (!latest) throw new ServiceError("NO_RESULT", "Complete this test once before revising skipped questions.");
  const skippedIds = db.testAnswers
    .filter((answer) => answer.attemptId === latest.id && answer.isSkipped)
    .map((answer) => answer.questionId)
    .filter((questionId) => test.questionIds.includes(questionId));
  if (skippedIds.length === 0) throw new ServiceError("NO_SKIPPED", "There are no skipped questions in your latest attempt.");
  const attempt = createAttempt(db, testId, skippedIds, "skipped", latest.id);
  saveDb(uid, db);
  return attempt;
}

export type CustomTestAttemptSummary = {
  id: number;
  status: TestAttemptRow["status"];
  attemptKind: "full" | "skipped";
  questionCount: number;
  currentIndex: number;
  score: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  startedAt: string;
  completedAt: string | null;
};

/** Immutable attempt history for a saved test, newest first. */
export function listCustomTestAttempts(uid: string, testId: number): CustomTestAttemptSummary[] {
  const db = loadDb(uid);
  const test = db.dailyTests.find((row) => row.id === testId && row.kind === "custom");
  if (!test) return [];
  return db.testAttempts
    .filter((attempt) => attempt.dailyTestId === testId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      attemptKind: attempt.attemptKind ?? "full",
      questionCount: attempt.questionIds?.length || test.questionIds.length,
      currentIndex: attempt.currentIndex,
      score: attempt.score,
      correctCount: attempt.correctCount,
      wrongCount: attempt.wrongCount,
      skippedCount: attempt.skippedCount,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
    }));
}

/** Latest relevant attempt for dashboard/result shortcuts. */
export function getCustomTestAttempt(uid: string, testId: number): TestAttemptRow | null {
  const db = loadDb(uid);
  return db.testAttempts
    .filter((attempt) => attempt.dailyTestId === testId)
    .sort((a, b) => {
      if (a.status === "in_progress" && b.status !== "in_progress") return -1;
      if (b.status === "in_progress" && a.status !== "in_progress") return 1;
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    })[0] ?? null;
}

/** Local half of a server-authoritative delete/failed cloud-create rollback. */
export function deleteCustomTestLocal(uid: string, testId: number): void {
  const db = loadDb(uid);
  const test = db.dailyTests.find((row) => row.id === testId && row.kind === "custom");
  if (!test) return;
  const questionIds = new Set(test.questionIds);
  const deletedQuestions = db.questions.filter((question) => questionIds.has(question.id));
  const deletedSubjectIds = new Set(deletedQuestions.map((question) => question.subjectId));
  const deletedTopicIds = new Set(deletedQuestions.map((question) => question.topicId));
  const attemptIds = new Set(db.testAttempts.filter((attempt) => attempt.dailyTestId === testId).map((attempt) => attempt.id));
  const sessionIds = new Set(db.revisionSessions.filter((session) => session.questionIds.some((id) => questionIds.has(id))).map((session) => session.id));
  db.dailyTests = db.dailyTests.filter((row) => row.id !== testId);
  db.testAttempts = db.testAttempts.filter((attempt) => !attemptIds.has(attempt.id));
  db.testAnswers = db.testAnswers.filter((answer) => !attemptIds.has(answer.attemptId));
  db.revisionItems = db.revisionItems.filter((item) => !questionIds.has(item.questionId));
  db.revisionSessions = db.revisionSessions.filter((session) => !sessionIds.has(session.id));
  db.revisionSessionAnswers = db.revisionSessionAnswers.filter((answer) => !sessionIds.has(answer.sessionId));
  db.questions = db.questions.filter((question) => !questionIds.has(question.id));
  const remainingSubjectIds = new Set(db.questions.map((question) => question.subjectId));
  const remainingTopicIds = new Set(db.questions.map((question) => question.topicId));
  db.subjects = db.subjects.filter((subject) => !deletedSubjectIds.has(subject.id) || remainingSubjectIds.has(subject.id));
  db.topics = db.topics.filter((topic) => !deletedTopicIds.has(topic.id) || remainingTopicIds.has(topic.id));
  saveDb(uid, db);
}
