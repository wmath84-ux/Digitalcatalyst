// Port of the reference `src/server/stats-service.ts`
// (daily-test-revision-system.zip) to the local engine. Uses plain Date math
// instead of date-fns so no new dependency is introduced.

import { loadDb, saveDb, todayDateStr, daysAgoDateStr } from "./store";
import { getOrCreateDailyTests, markExpiredAttempts } from "./testService";
import { getRevisionSummary } from "./revisionService";

type TopicAgg = {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  subjectIcon: string;
  total: number;
  correct: number;
  wrong: number;
  skipped: number;
  recentTotal: number;
  recentCorrect: number;
  priorTotal: number;
  priorCorrect: number;
};

type AnswerLike = {
  isCorrect: boolean | null;
  isSkipped: boolean;
  answeredAt: string | null;
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  subjectIcon: string;
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function subDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - days);
  return copy;
}

function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function subWeeks(d: Date, weeks: number): Date {
  return subDays(d, weeks * 7);
}

function startOfMonth(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(1);
  return copy;
}

function subMonths(d: Date, months: number): Date {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() - months);
  return copy;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDayLabel(d: Date): string {
  return DAY_LABELS[d.getDay()];
}

function formatMonthDay(d: Date): string {
  return `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

function collectTopicAnswers(uid: string): AnswerLike[] {
  const db = loadDb(uid);

  const joinMeta = (questionId: number) => {
    const q = db.questions.find((row) => row.id === questionId);
    if (!q) return null;
    const topic = db.topics.find((t) => t.id === q.topicId);
    const subject = db.subjects.find((s) => s.id === q.subjectId);
    if (!topic || !subject) return null;
    return {
      topicId: topic.id,
      topicName: topic.name,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectIcon: subject.icon,
    };
  };

  const completedAttemptIds = new Set(
    db.testAttempts.filter((a) => a.status === "completed").map((a) => a.id),
  );
  const testRows: AnswerLike[] = db.testAnswers
    .filter((a) => completedAttemptIds.has(a.attemptId))
    .map((a) => {
      const meta = joinMeta(a.questionId);
      if (!meta) return null;
      return { isCorrect: a.isCorrect, isSkipped: a.isSkipped, answeredAt: a.answeredAt, ...meta };
    })
    .filter((r): r is AnswerLike => Boolean(r));

  const completedSessionIds = new Set(
    db.revisionSessions.filter((s) => s.status === "completed").map((s) => s.id),
  );
  const revisionRows: AnswerLike[] = db.revisionSessionAnswers
    .filter((a) => completedSessionIds.has(a.sessionId))
    .map((a) => {
      const meta = joinMeta(a.questionId);
      if (!meta) return null;
      return { isCorrect: a.isCorrect, isSkipped: a.isSkipped, answeredAt: a.answeredAt, ...meta };
    })
    .filter((r): r is AnswerLike => Boolean(r));

  return [...testRows, ...revisionRows];
}

export function getWeakTopics(uid: string) {
  const answers = collectTopicAnswers(uid);

  const now = new Date();
  const recentStart = subDays(now, 7);
  const priorStart = subDays(now, 14);

  const map = new Map<number, TopicAgg>();
  for (const a of answers) {
    const entry = map.get(a.topicId) ?? {
      topicId: a.topicId,
      topicName: a.topicName,
      subjectId: a.subjectId,
      subjectName: a.subjectName,
      subjectIcon: a.subjectIcon,
      total: 0,
      correct: 0,
      wrong: 0,
      skipped: 0,
      recentTotal: 0,
      recentCorrect: 0,
      priorTotal: 0,
      priorCorrect: 0,
    };
    entry.total += 1;
    if (a.isSkipped) entry.skipped += 1;
    else if (a.isCorrect) entry.correct += 1;
    else entry.wrong += 1;

    const answeredAt = a.answeredAt ? new Date(a.answeredAt) : null;
    if (answeredAt) {
      if (answeredAt.getTime() > recentStart.getTime()) {
        entry.recentTotal += 1;
        if (a.isCorrect) entry.recentCorrect += 1;
      } else if (answeredAt.getTime() > priorStart.getTime() && answeredAt.getTime() < recentStart.getTime()) {
        entry.priorTotal += 1;
        if (a.isCorrect) entry.priorCorrect += 1;
      }
    }
    map.set(a.topicId, entry);
  }

  const topicList = Array.from(map.values()).map((t) => {
    const accuracy = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
    const recentAcc = t.recentTotal > 0 ? Math.round((t.recentCorrect / t.recentTotal) * 100) : null;
    const priorAcc = t.priorTotal > 0 ? Math.round((t.priorCorrect / t.priorTotal) * 100) : null;
    let trend: "improving" | "declining" | "stable" | "new" = "new";
    if (recentAcc !== null && priorAcc !== null) {
      if (recentAcc - priorAcc >= 5) trend = "improving";
      else if (priorAcc - recentAcc >= 5) trend = "declining";
      else trend = "stable";
    } else if (recentAcc !== null) {
      trend = "new";
    }
    return { ...t, accuracy, recentAccuracy: recentAcc, trend };
  });

  const weakest = [...topicList]
    .filter((t) => t.total >= 1)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8);

  const mostMissed = [...topicList]
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 6);

  const frequentlySkipped = [...topicList]
    .filter((t) => t.skipped > 0)
    .sort((a, b) => b.skipped - a.skipped)
    .slice(0, 6);

  const weakestSubjectsMap = new Map<number, { subjectId: number; name: string; icon: string; total: number; correct: number }>();
  for (const t of topicList) {
    const s = weakestSubjectsMap.get(t.subjectId) ?? {
      subjectId: t.subjectId,
      name: t.subjectName,
      icon: t.subjectIcon,
      total: 0,
      correct: 0,
    };
    s.total += t.total;
    s.correct += t.correct;
    weakestSubjectsMap.set(t.subjectId, s);
  }
  const weakestSubjects = Array.from(weakestSubjectsMap.values())
    .map((s) => ({ ...s, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }))
    .filter((s) => s.total >= 1)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);

  const recommended = weakest.filter((t) => t.accuracy < 80).slice(0, 3);

  return {
    hasData: answers.length > 0,
    weakestTopics: weakest,
    weakestSubjects,
    mostMissedTopics: mostMissed,
    frequentlySkippedTopics: frequentlySkipped,
    recommendedTopics: recommended,
  };
}

function getCurrentStreak(uid: string) {
  const db = loadDb(uid);
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const dateStr = daysAgoDateStr(i);
    const testsThatDay = db.dailyTests.filter((t) => t.testDate === dateStr);
    const completedAny = testsThatDay.some((dt) =>
      db.testAttempts.some((a) => a.dailyTestId === dt.id && a.status === "completed"),
    );
    if (completedAny) {
      streak += 1;
      continue;
    }
    if (i === 0) continue; // today may still be in progress
    break;
  }
  return streak;
}

/**
 * Revision-only dashboard metrics. Unlike the legacy daily dashboard this
 * function never creates a random daily test as a side effect. The learner's
 * dashboard is driven exclusively by plans they explicitly generated/imported.
 */
export function getRevisionOverview(uid: string) {
  const db = loadDb(uid);
  const completed = db.testAttempts.filter((attempt) => attempt.status === "completed");
  const totals = completed.map((attempt) => ({
    correct: attempt.correctCount,
    questions: db.dailyTests.find((test) => test.id === attempt.dailyTestId)?.totalQuestions ?? 0,
  }));
  const totalQuestions = totals.reduce((sum, item) => sum + item.questions, 0);
  const totalCorrect = totals.reduce((sum, item) => sum + item.correct, 0);

  return {
    quickStats: {
      testsCompleted: completed.length,
      overallAccuracy: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0,
      streak: getCurrentStreak(uid),
    },
    weakTopicSummary: getWeakTopics(uid).weakestTopics.slice(0, 3),
    revisionBankSummary: getRevisionSummary(uid),
  };
}

export type RevisionOverview = ReturnType<typeof getRevisionOverview>;

/** @deprecated Kept for old deep links; the Revision dashboard no longer calls this. */
export function getDashboardData(uid: string) {
  const db = loadDb(uid);
  const dateStr = todayDateStr();
  markExpiredAttempts(db, dateStr);
  const todaysTests = getOrCreateDailyTests(db, dateStr, uid);
  saveDb(uid, db);

  // The next test to offer is the first slot without a completed attempt.
  const dailyTest =
    todaysTests.find((t) => {
      const a = db.testAttempts.find((x) => x.dailyTestId === t.id);
      return !a || a.status !== "completed";
    }) ?? todaysTests[todaysTests.length - 1];

  const todayAttempt = db.testAttempts.find((a) => a.dailyTestId === dailyTest.id) ?? null;

  const completed = db.testAttempts
    .filter((a) => a.status === "completed")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  const lastCompletedTest = completed[0]
    ? db.dailyTests.find((t) => t.id === completed[0].dailyTestId) ?? null
    : null;

  const allCompleted = completed.map((a) => ({
    correctCount: a.correctCount,
    totalQuestions: db.dailyTests.find((t) => t.id === a.dailyTestId)?.totalQuestions ?? 0,
  }));

  const testsCompleted = allCompleted.length;
  const totalCorrect = allCompleted.reduce((sum, a) => sum + a.correctCount, 0);
  const totalQ = allCompleted.reduce((sum, a) => sum + a.totalQuestions, 0);
  const overallAccuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

  const completedToday = todaysTests.filter((t) =>
    db.testAttempts.some((a) => a.dailyTestId === t.id && a.status === "completed"),
  ).length;

  const streak = getCurrentStreak(uid);
  const weakTopics = getWeakTopics(uid);
  const revisionSummary = getRevisionSummary(uid);

  let status: "available" | "in_progress" | "completed" | "expired" = "available";
  if (todayAttempt) {
    status = todayAttempt.status === "completed" ? "completed" : todayAttempt.status === "expired" ? "expired" : "in_progress";
  }

  return {
    today: {
      dailyTestId: dailyTest.id,
      slot: dailyTest.slot,
      title: dailyTest.title,
      totalQuestions: dailyTest.totalQuestions,
      estimatedMinutes: dailyTest.estimatedMinutes,
      status,
      attemptId: todayAttempt?.id ?? null,
      currentIndex: todayAttempt?.currentIndex ?? 0,
      score: todayAttempt?.status === "completed" ? todayAttempt.score : null,
    },
    testsToday: {
      total: todaysTests.length,
      completed: completedToday,
    },
    lastCompletedDate: lastCompletedTest?.testDate ?? null,
    quickStats: {
      testsCompleted,
      overallAccuracy,
      streak,
    },
    weakTopicSummary: weakTopics.weakestTopics.slice(0, 3),
    revisionBankSummary: revisionSummary,
  };
}

type BucketAnswer = { isCorrect: boolean | null; isSkipped: boolean; answeredAt: string | null };

function bucketDaily(answers: BucketAnswer[], days: number) {
  const buckets: { date: string; label: string; attempted: number; correct: number; accuracy: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = startOfDay(subDays(new Date(), i));
    let attempted = 0;
    let correct = 0;
    for (const a of answers) {
      if (!a.answeredAt) continue;
      const d = startOfDay(new Date(a.answeredAt));
      if (d.getTime() === day.getTime()) {
        if (!a.isSkipped) attempted += 1;
        if (a.isCorrect) correct += 1;
      }
    }
    buckets.push({
      date: todayDateStr(day),
      label: formatDayLabel(day),
      attempted,
      correct,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    });
  }
  return buckets;
}

function bucketWeekly(answers: BucketAnswer[], weeks: number) {
  const buckets: { date: string; label: string; attempted: number; correct: number; accuracy: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(new Date(), i));
    const weekEnd = startOfWeek(subWeeks(new Date(), i - 1));
    let attempted = 0;
    let correct = 0;
    for (const a of answers) {
      if (!a.answeredAt) continue;
      const d = new Date(a.answeredAt);
      if (d.getTime() >= weekStart.getTime() && d.getTime() < weekEnd.getTime()) {
        if (!a.isSkipped) attempted += 1;
        if (a.isCorrect) correct += 1;
      }
    }
    buckets.push({
      date: todayDateStr(weekStart),
      label: `Wk of ${formatMonthDay(weekStart)}`,
      attempted,
      correct,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    });
  }
  return buckets;
}

function bucketMonthly(answers: BucketAnswer[], months: number) {
  const buckets: { date: string; label: string; attempted: number; correct: number; accuracy: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(new Date(), i));
    const monthEnd = startOfMonth(subMonths(new Date(), i - 1));
    let attempted = 0;
    let correct = 0;
    for (const a of answers) {
      if (!a.answeredAt) continue;
      const d = new Date(a.answeredAt);
      if (d.getTime() >= monthStart.getTime() && d.getTime() < monthEnd.getTime()) {
        if (!a.isSkipped) attempted += 1;
        if (a.isCorrect) correct += 1;
      }
    }
    buckets.push({
      date: todayDateStr(monthStart),
      label: MONTH_LABELS[monthStart.getMonth()],
      attempted,
      correct,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    });
  }
  return buckets;
}

export function getProgressData(uid: string) {
  const db = loadDb(uid);
  const answers = collectTopicAnswers(uid);

  const completedAttempts = db.testAttempts
    .filter((a) => a.status === "completed")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
    .slice(0, 15);

  const completedSessions = db.revisionSessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime())
    .slice(0, 15);

  const masteredItems = db.revisionItems.filter((item) => item.status === "mastered");

  const questionsAttempted = answers.filter((a) => !a.isSkipped).length;
  const questionsCorrect = answers.filter((a) => a.isCorrect).length;
  const questionsIncorrect = answers.filter((a) => !a.isSkipped && a.isCorrect === false).length;

  const daily = bucketDaily(answers, 14);
  const weekly = bucketWeekly(answers, 8);
  const monthly = bucketMonthly(answers, 6);

  const accuracyTrend = [...completedAttempts]
    .reverse()
    .map((a) => ({
      date: a.completedAt ? formatMonthDay(new Date(a.completedAt)) : "",
      score: a.score,
    }));

  const activityHistory = [
    ...completedAttempts.map((a) => ({
      type: "test" as const,
      title: "Daily Test completed",
      date: a.completedAt ?? a.startedAt,
      detail: `${a.correctCount}/${a.correctCount + a.wrongCount + a.skippedCount} correct · Score ${a.score}%`,
      refId: a.id,
    })),
    ...completedSessions.map((s) => ({
      type: "revision" as const,
      title: "Revision session completed",
      date: s.completedAt ?? s.startedAt,
      detail: `${s.correctCount}/${s.totalQuestions} correct`,
      refId: s.id,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  return {
    totals: {
      testsCompleted: db.testAttempts.filter((a) => a.status === "completed").length,
      questionsAttempted,
      questionsCorrect,
      questionsIncorrect,
      revisionSessionsCompleted: db.revisionSessions.filter((s) => s.status === "completed").length,
      masteredCount: masteredItems.length,
      overallAccuracy: questionsAttempted > 0 ? Math.round((questionsCorrect / questionsAttempted) * 100) : 0,
      currentStreak: getCurrentStreak(uid),
    },
    daily,
    weekly,
    monthly,
    accuracyTrend,
    activityHistory,
  };
}

export type DashboardData = ReturnType<typeof getDashboardData>;
export type WeakTopicsData = ReturnType<typeof getWeakTopics>;
export type ProgressData = ReturnType<typeof getProgressData>;
