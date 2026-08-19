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
  nowIso,
  todayDateStr,
  ServiceError,
  type DailyTestRow,
  type Difficulty,
  type RevisionDb,
  type TestAttemptRow,
} from "./store";

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

export type CreateCustomTestInput = {
  title: string;
  estimatedMinutes: number;
  source: "ai" | "bulk";
  questions: CustomTestQuestion[];
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
  const id = Math.max(db.nextIds[table] ?? 1, maxId(rows) + 1);
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
  const id = maxId(db.subjects) + 1;
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
  const id = maxId(db.topics) + 1;
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
    title: input.title.trim() || (input.source === "ai" ? "AI Generated Test" : "Imported Test"),
    questionIds,
    totalQuestions: questionIds.length,
    estimatedMinutes: Math.max(1, Math.min(240, Math.round(input.estimatedMinutes) || 5)),
    kind: "custom",
    source: input.source,
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
};

/** All custom tests (newest first) with their attempt state for the dashboard. */
export function listCustomTests(uid: string): CustomTestListItem[] {
  const db = loadDb(uid);
  return db.dailyTests
    .filter((t) => t.kind === "custom")
    .sort((a, b) => b.id - a.id)
    .map((t) => {
      const attempt = db.testAttempts.find((a) => a.dailyTestId === t.id) ?? null;
      const status: CustomTestListItem["status"] =
        attempt?.status === "completed" ? "completed" : attempt?.status === "in_progress" ? "in_progress" : "available";
      return {
        id: t.id,
        title: t.title,
        source: t.source ?? "ai",
        testDate: t.testDate,
        totalQuestions: t.totalQuestions,
        estimatedMinutes: t.estimatedMinutes,
        status,
        attemptId: attempt?.id ?? null,
        score: attempt?.status === "completed" ? attempt.score : null,
        currentIndex: attempt?.currentIndex ?? 0,
      };
    });
}

/** Start (or resume) an attempt for one specific custom test. */
export function startCustomTestAttempt(uid: string, testId: number): TestAttemptRow {
  const db = loadDb(uid);
  const test = db.dailyTests.find((t) => t.id === testId && t.kind === "custom");
  if (!test) {
    throw new ServiceError("NOT_FOUND", "This test could not be found.");
  }
  const existing = db.testAttempts.find((a) => a.dailyTestId === testId);
  if (existing) {
    if (existing.status === "completed") {
      throw new ServiceError("ALREADY_COMPLETED", "You have already completed this test.");
    }
    if (existing.status === "expired") {
      existing.status = "in_progress";
      existing.updatedAt = nowIso();
    }
    saveDb(uid, db);
    return existing;
  }
  const attempt: TestAttemptRow = {
    id: allocId(db, "testAttempts", db.testAttempts),
    dailyTestId: testId,
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
  saveDb(uid, db);
  return attempt;
}

/** Look up a custom test's completed attempt (for "view results" shortcuts). */
export function getCustomTestAttempt(uid: string, testId: number): TestAttemptRow | null {
  const db = loadDb(uid);
  return db.testAttempts.find((a) => a.dailyTestId === testId) ?? null;
}
