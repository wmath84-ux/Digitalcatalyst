// Port of the reference `src/server/test-service.ts` (daily-test-revision-system.zip)
// to the local engine. Business rules are preserved exactly:
// - deterministic, date-seeded question pick (mulberry32 + round-robin subjects)
// - one attempt per daily test; expired attempts marked when the day rolls over
// - wrong or skipped answers feed the Smart Revision Bank on submit

import type { PlayerQuestion, ReviewQuestion } from "./types";
import {
  loadDb,
  saveDb,
  nextId,
  nowIso,
  todayDateStr,
  ServiceError,
  type DailyTestRow,
  type RevisionDb,
  type TestAttemptRow,
} from "./store";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

const QUESTIONS_PER_TEST = 10;
const ESTIMATED_MINUTES = 5;

export function getOrCreateDailyTest(db: RevisionDb, dateStr: string): DailyTestRow {
  const existing = db.dailyTests.find((t) => t.testDate === dateStr);
  if (existing) return existing;

  const allQuestions = db.questions.filter((q) => q.isActive);
  if (allQuestions.length === 0) {
    throw new ServiceError("NO_QUESTIONS", "No questions available to build a test.");
  }

  // Deterministic shuffle seeded by date so the test is stable across loads
  const rng = mulberry32(hashString(dateStr));
  const bySubject = new Map<number, number[]>();
  for (const q of allQuestions) {
    const arr = bySubject.get(q.subjectId) ?? [];
    arr.push(q.id);
    bySubject.set(q.subjectId, arr);
  }
  // shuffle within each subject bucket then round-robin pick for topic diversity
  const subjectIds = Array.from(bySubject.keys());
  for (const sid of subjectIds) {
    const arr = bySubject.get(sid)!;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  // shuffle subject order too, seeded
  for (let i = subjectIds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [subjectIds[i], subjectIds[j]] = [subjectIds[j], subjectIds[i]];
  }

  const picked: number[] = [];
  let cursor = 0;
  while (picked.length < QUESTIONS_PER_TEST && picked.length < allQuestions.length) {
    const sid = subjectIds[cursor % subjectIds.length];
    const arr = bySubject.get(sid)!;
    const idx = Math.floor(picked.length / subjectIds.length);
    if (idx < arr.length) {
      picked.push(arr[idx]);
    }
    cursor++;
    if (cursor > subjectIds.length * (QUESTIONS_PER_TEST + 2)) break;
  }

  const row: DailyTestRow = {
    id: nextId(db, "dailyTests"),
    testDate: dateStr,
    title: "Daily 5-Minute Test",
    questionIds: picked,
    totalQuestions: picked.length,
    estimatedMinutes: ESTIMATED_MINUTES,
  };
  db.dailyTests.push(row);
  return row;
}

export function markExpiredAttempts(db: RevisionDb, dateStr: string) {
  const staleIds = db.dailyTests.filter((t) => t.testDate < dateStr).map((t) => t.id);
  if (staleIds.length === 0) return;
  for (const attempt of db.testAttempts) {
    if (staleIds.includes(attempt.dailyTestId) && attempt.status === "in_progress") {
      attempt.status = "expired";
      attempt.updatedAt = nowIso();
    }
  }
}

export function getTodayTestState(uid: string) {
  const db = loadDb(uid);
  const dateStr = todayDateStr();
  markExpiredAttempts(db, dateStr);
  const dailyTest = getOrCreateDailyTest(db, dateStr);

  const attempt = db.testAttempts.find((a) => a.dailyTestId === dailyTest.id) ?? null;

  const completed = db.testAttempts
    .filter((a) => a.status === "completed")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  const lastCompletedTest = completed[0]
    ? db.dailyTests.find((t) => t.id === completed[0].dailyTestId) ?? null
    : null;

  saveDb(uid, db);
  return {
    dailyTest: {
      id: dailyTest.id,
      testDate: dailyTest.testDate,
      title: dailyTest.title,
      totalQuestions: dailyTest.totalQuestions,
      estimatedMinutes: dailyTest.estimatedMinutes,
    },
    attempt: attempt
      ? {
          id: attempt.id,
          status: attempt.status,
          currentIndex: attempt.currentIndex,
          startedAt: attempt.startedAt,
        }
      : null,
    lastCompletedDate: lastCompletedTest?.testDate ?? null,
  };
}

export function startOrResumeAttempt(uid: string) {
  const db = loadDb(uid);
  const dateStr = todayDateStr();
  markExpiredAttempts(db, dateStr);
  const dailyTest = getOrCreateDailyTest(db, dateStr);

  const existing = db.testAttempts.find((a) => a.dailyTestId === dailyTest.id);
  if (existing) {
    if (existing.status === "completed") {
      throw new ServiceError("ALREADY_COMPLETED", "Today's test is already completed.");
    }
    if (existing.status === "in_progress") {
      saveDb(uid, db);
      return existing;
    }
  }

  const attempt: TestAttemptRow = {
    id: nextId(db, "testAttempts"),
    dailyTestId: dailyTest.id,
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

function loadAttemptOrThrow(db: RevisionDb, attemptId: number): TestAttemptRow {
  const attempt = db.testAttempts.find((a) => a.id === attemptId);
  if (!attempt) {
    throw new ServiceError("NOT_FOUND", "Test attempt not found.");
  }
  return attempt;
}

export function getAttemptForPlayer(uid: string, attemptId: number) {
  const db = loadDb(uid);
  const attempt = loadAttemptOrThrow(db, attemptId);
  if (attempt.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This test is not in progress.");
  }
  const dailyTest = db.dailyTests.find((t) => t.id === attempt.dailyTestId)!;
  const ids = dailyTest.questionIds;

  const answerByQ = new Map(
    db.testAnswers.filter((a) => a.attemptId === attemptId).map((a) => [a.questionId, a]),
  );

  const ordered: PlayerQuestion[] = ids
    .map((id) => db.questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const topic = db.topics.find((t) => t.id === q.topicId)!;
      const subject = db.subjects.find((s) => s.id === q.subjectId)!;
      return {
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        difficulty: q.difficulty,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectIcon: subject.icon,
        topicId: topic.id,
        topicName: topic.name,
        selectedIndex: answerByQ.get(q.id)?.selectedIndex ?? null,
      };
    });

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      currentIndex: attempt.currentIndex,
      startedAt: attempt.startedAt,
    },
    dailyTest: {
      id: dailyTest.id,
      title: dailyTest.title,
      totalQuestions: dailyTest.totalQuestions,
      estimatedMinutes: dailyTest.estimatedMinutes,
    },
    questions: ordered,
  };
}

export function saveTestAnswer(
  uid: string,
  attemptId: number,
  questionId: number,
  selectedIndex: number | null,
) {
  const db = loadDb(uid);
  const attempt = loadAttemptOrThrow(db, attemptId);
  if (attempt.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This test is not in progress.");
  }
  const dailyTest = db.dailyTests.find((t) => t.id === attempt.dailyTestId)!;
  if (!dailyTest.questionIds.includes(questionId)) {
    throw new ServiceError("INVALID_QUESTION", "Question does not belong to this test.");
  }
  const question = db.questions.find((q) => q.id === questionId);
  if (!question) throw new ServiceError("NOT_FOUND", "Question not found.");
  if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= question.options.length)) {
    throw new ServiceError("INVALID_OPTION", "Selected option is out of range.");
  }

  const isSkipped = selectedIndex === null;
  const isCorrect = isSkipped ? null : selectedIndex === question.correctIndex;

  const existing = db.testAnswers.find((a) => a.attemptId === attemptId && a.questionId === questionId);
  if (existing) {
    existing.selectedIndex = selectedIndex;
    existing.isCorrect = isCorrect;
    existing.isSkipped = isSkipped;
    existing.answeredAt = nowIso();
  } else {
    db.testAnswers.push({
      id: nextId(db, "testAnswers"),
      attemptId,
      questionId,
      selectedIndex,
      isCorrect,
      isSkipped,
      answeredAt: nowIso(),
    });
  }
  attempt.updatedAt = nowIso();
  saveDb(uid, db);
  return { questionId, selectedIndex, isCorrect, isSkipped };
}

export function updateAttemptIndex(uid: string, attemptId: number, index: number) {
  const db = loadDb(uid);
  const attempt = loadAttemptOrThrow(db, attemptId);
  if (attempt.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This test is not in progress.");
  }
  attempt.currentIndex = index;
  attempt.updatedAt = nowIso();
  saveDb(uid, db);
  return { currentIndex: index };
}

export function submitTestAttempt(uid: string, attemptId: number) {
  const db = loadDb(uid);
  const attempt = loadAttemptOrThrow(db, attemptId);
  if (attempt.status === "completed") {
    return { alreadyCompleted: true, attemptId };
  }
  if (attempt.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This test cannot be submitted.");
  }
  const dailyTest = db.dailyTests.find((t) => t.id === attempt.dailyTestId)!;
  const ids = dailyTest.questionIds;

  const answerByQ = new Map(
    db.testAnswers.filter((a) => a.attemptId === attemptId).map((a) => [a.questionId, a]),
  );

  // Fill missing (unanswered) with skipped placeholders
  for (const qid of ids) {
    if (!answerByQ.has(qid)) {
      const inserted = {
        id: nextId(db, "testAnswers"),
        attemptId,
        questionId: qid,
        selectedIndex: null,
        isCorrect: null,
        isSkipped: true,
        answeredAt: null,
      };
      db.testAnswers.push(inserted);
      answerByQ.set(qid, inserted);
    }
  }

  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  for (const qid of ids) {
    const a = answerByQ.get(qid);
    if (!a || a.isSkipped) skippedCount++;
    else if (a.isCorrect) correctCount++;
    else wrongCount++;
  }

  const total = ids.length || 1;
  const score = Math.round((correctCount / total) * 100);
  const timeSpentSeconds = Math.max(
    1,
    Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
  );

  attempt.status = "completed";
  attempt.completedAt = nowIso();
  attempt.correctCount = correctCount;
  attempt.wrongCount = wrongCount;
  attempt.skippedCount = skippedCount;
  attempt.score = score;
  attempt.timeSpentSeconds = timeSpentSeconds;
  attempt.updatedAt = nowIso();

  // Update revision bank: any wrong or skipped question enters/returns to the bank
  for (const qid of ids) {
    const a = answerByQ.get(qid);
    const isWeak = !a || a.isSkipped || a.isCorrect === false;
    if (!isWeak) continue;
    const q = db.questions.find((row) => row.id === qid);
    if (!q) continue;

    const existingItem = db.revisionItems.find((item) => item.questionId === qid);
    if (!existingItem) {
      db.revisionItems.push({
        id: nextId(db, "revisionItems"),
        questionId: qid,
        subjectId: q.subjectId,
        topicId: q.topicId,
        status: "learning",
        successStreak: 0,
        timesSeen: 1,
        timesCorrect: 0,
        timesWrong: a?.isSkipped ? 0 : 1,
        lastResult: a?.isSkipped ? "skipped" : "wrong",
        sourceAttemptId: attemptId,
        addedAt: nowIso(),
        lastRevisedAt: null,
        masteredAt: null,
        updatedAt: nowIso(),
      });
    } else {
      existingItem.status = "learning";
      existingItem.successStreak = 0;
      existingItem.timesSeen += 1;
      existingItem.timesWrong += a?.isSkipped ? 0 : 1;
      existingItem.lastResult = a?.isSkipped ? "skipped" : "wrong";
      existingItem.updatedAt = nowIso();
    }
  }

  saveDb(uid, db);
  return { alreadyCompleted: false, attemptId };
}

export function getTestResult(uid: string, attemptId: number) {
  const db = loadDb(uid);
  const attempt = loadAttemptOrThrow(db, attemptId);
  if (attempt.status !== "completed") {
    throw new ServiceError("INVALID_STATE", "Test has not been completed yet.");
  }
  const dailyTest = db.dailyTests.find((t) => t.id === attempt.dailyTestId)!;
  const answers = db.testAnswers.filter((a) => a.attemptId === attemptId);

  const topicMap = new Map<
    number,
    { topicId: number; topicName: string; subjectName: string; subjectIcon: string; total: number; correct: number }
  >();
  for (const a of answers) {
    const q = db.questions.find((row) => row.id === a.questionId);
    if (!q) continue;
    const topic = db.topics.find((t) => t.id === q.topicId)!;
    const subject = db.subjects.find((s) => s.id === q.subjectId)!;
    const entry = topicMap.get(topic.id) ?? {
      topicId: topic.id,
      topicName: topic.name,
      subjectName: subject.name,
      subjectIcon: subject.icon,
      total: 0,
      correct: 0,
    };
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    topicMap.set(topic.id, entry);
  }

  const total = dailyTest.totalQuestions || 1;
  return {
    attemptId: attempt.id,
    testDate: dailyTest.testDate,
    totalQuestions: dailyTest.totalQuestions,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    skippedCount: attempt.skippedCount,
    accuracy: Math.round((attempt.correctCount / total) * 100),
    score: attempt.score,
    timeSpentSeconds: attempt.timeSpentSeconds,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    topicBreakdown: Array.from(topicMap.values()).map((t) => ({
      ...t,
      accuracy: Math.round((t.correct / t.total) * 100),
    })),
  };
}

export function getTestReview(uid: string, attemptId: number): ReviewQuestion[] {
  const db = loadDb(uid);
  const attempt = loadAttemptOrThrow(db, attemptId);
  if (attempt.status !== "completed") {
    throw new ServiceError("INVALID_STATE", "Test has not been completed yet.");
  }
  const dailyTest = db.dailyTests.find((t) => t.id === attempt.dailyTestId)!;
  const answerByQ = new Map(
    db.testAnswers.filter((a) => a.attemptId === attemptId).map((a) => [a.questionId, a]),
  );

  return dailyTest.questionIds
    .map((id) => {
      const q = db.questions.find((row) => row.id === id);
      const a = answerByQ.get(id);
      if (!q) return null;
      const topic = db.topics.find((t) => t.id === q.topicId)!;
      const subject = db.subjects.find((s) => s.id === q.subjectId)!;
      return {
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: q.difficulty,
        subjectName: subject.name,
        subjectIcon: subject.icon,
        topicName: topic.name,
        selectedIndex: a?.selectedIndex ?? null,
        isCorrect: a?.isCorrect ?? null,
        isSkipped: a?.isSkipped ?? true,
      };
    })
    .filter((r): r is ReviewQuestion => Boolean(r));
}
