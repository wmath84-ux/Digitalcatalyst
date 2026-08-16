// Local data engine for the Daily Test & Revision system.
//
// The reference implementation shipped as a Next.js + PostgreSQL app
// (drizzle schema in daily-test-revision-system.zip). This module ports that
// exact data model to a per-user localStorage store so the feature runs
// fully client-side inside the hash-routed PWA — the same optimisation the
// My Day feature uses. Every table, column and status enum below mirrors
// the original `src/db/schema.ts` one-to-one.

import { SEED_SUBJECTS, SEED_TOPICS, SEED_QUESTIONS } from "../data/seedData";

export type Difficulty = "easy" | "medium" | "hard";
export type TestStatus = "not_started" | "in_progress" | "completed" | "expired";
export type RevisionStatus = "learning" | "improving" | "mastered";
export type SessionStatus = "in_progress" | "completed";

export type SubjectRow = { id: number; name: string; slug: string; icon: string; color: string };
export type TopicRow = { id: number; subjectId: number; name: string; slug: string };
export type QuestionRow = {
  id: number;
  topicId: number;
  subjectId: number;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  isActive: boolean;
};
export type DailyTestRow = {
  id: number;
  testDate: string;
  title: string;
  questionIds: number[];
  totalQuestions: number;
  estimatedMinutes: number;
};
export type TestAttemptRow = {
  id: number;
  dailyTestId: number;
  status: TestStatus;
  currentIndex: number;
  score: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeSpentSeconds: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
};
export type TestAnswerRow = {
  id: number;
  attemptId: number;
  questionId: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  isSkipped: boolean;
  answeredAt: string | null;
};
export type RevisionItemRow = {
  id: number;
  questionId: number;
  subjectId: number;
  topicId: number;
  status: RevisionStatus;
  successStreak: number;
  timesSeen: number;
  timesCorrect: number;
  timesWrong: number;
  lastResult: string | null;
  sourceAttemptId: number | null;
  addedAt: string;
  lastRevisedAt: string | null;
  masteredAt: string | null;
  updatedAt: string;
};
export type RevisionSessionRow = {
  id: number;
  status: SessionStatus;
  filterSubjectId: number | null;
  filterTopicId: number | null;
  filterStatus: string | null;
  questionIds: number[];
  currentIndex: number;
  totalQuestions: number;
  correctCount: number;
  startedAt: string;
  completedAt: string | null;
};
export type RevisionSessionAnswerRow = {
  id: number;
  sessionId: number;
  revisionItemId: number;
  questionId: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  isSkipped: boolean;
  statusBefore: RevisionStatus | null;
  statusAfter: RevisionStatus | null;
  answeredAt: string | null;
};

export type RevisionDb = {
  seedVersion: number;
  subjects: SubjectRow[];
  topics: TopicRow[];
  questions: QuestionRow[];
  dailyTests: DailyTestRow[];
  testAttempts: TestAttemptRow[];
  testAnswers: TestAnswerRow[];
  revisionItems: RevisionItemRow[];
  revisionSessions: RevisionSessionRow[];
  revisionSessionAnswers: RevisionSessionAnswerRow[];
  nextIds: Record<string, number>;
};

export class ServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const SEED_VERSION = 1;

function buildSeededDb(): RevisionDb {
  const subjects: SubjectRow[] = [];
  const topics: TopicRow[] = [];
  const questions: QuestionRow[] = [];

  const subjectIdBySlug = new Map<string, number>();
  SEED_SUBJECTS.forEach((s, i) => {
    const id = i + 1;
    subjectIdBySlug.set(s.slug, id);
    subjects.push({ id, name: s.name, slug: s.slug, icon: s.icon, color: s.color });
  });

  const topicIdBySlug = new Map<string, number>();
  SEED_TOPICS.forEach((t, i) => {
    const subjectId = subjectIdBySlug.get(t.subjectSlug);
    if (!subjectId) return;
    const id = i + 1;
    topicIdBySlug.set(t.slug, id);
    topics.push({ id, subjectId, name: t.name, slug: t.slug });
  });

  SEED_QUESTIONS.forEach((q, i) => {
    const topicId = topicIdBySlug.get(q.topicSlug);
    const topicMeta = SEED_TOPICS.find((t) => t.slug === q.topicSlug);
    const subjectId = topicMeta ? subjectIdBySlug.get(topicMeta.subjectSlug) : undefined;
    if (!topicId || !subjectId) return;
    questions.push({
      id: i + 1,
      topicId,
      subjectId,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      isActive: true,
    });
  });

  return {
    seedVersion: SEED_VERSION,
    subjects,
    topics,
    questions,
    dailyTests: [],
    testAttempts: [],
    testAnswers: [],
    revisionItems: [],
    revisionSessions: [],
    revisionSessionAnswers: [],
    nextIds: {},
  };
}

const storageKey = (uid: string) => `revision_db_${uid}`;

const cache = new Map<string, RevisionDb>();

export function loadDb(uid: string): RevisionDb {
  const cached = cache.get(uid);
  if (cached) return cached;
  let db: RevisionDb | null = null;
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as RevisionDb;
      if (parsed && parsed.seedVersion === SEED_VERSION && Array.isArray(parsed.questions)) {
        db = parsed;
      }
    }
  } catch {
    db = null;
  }
  if (!db) db = buildSeededDb();
  cache.set(uid, db);
  return db;
}

export function saveDb(uid: string, db: RevisionDb) {
  cache.set(uid, db);
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(db));
  } catch {
    // Persistence is best-effort — a full quota must never crash the UI.
  }
}

export function nextId(db: RevisionDb, table: string): number {
  const current = db.nextIds[table] ?? 1;
  db.nextIds[table] = current + 1;
  return current;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local-date string (yyyy-MM-dd) so "today's test" matches the user's day. */
export function todayDateStr(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysAgoDateStr(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return todayDateStr(d);
}
