// Local data engine for the Daily Test & Revision system.
//
// The reference implementation shipped as a Next.js + PostgreSQL app
// (drizzle schema in daily-test-revision-system.zip). This module ports that
// exact data model to a per-user localStorage store so the feature runs
// fully client-side inside the hash-routed PWA — the same optimisation the
// My Day feature uses. Every table, column and status enum below mirrors
// the original `src/db/schema.ts` one-to-one.

import { SEED_SUBJECTS, SEED_TOPICS, SEED_QUESTIONS } from "../data/seedData";

export type TestStatus = "not_started" | "in_progress" | "completed" | "expired";
export type RevisionStatus = "learning" | "improving" | "mastered";
export type SessionStatus = "in_progress" | "completed";

/**
 * Admin-configurable revision settings. These control how the daily test is
 * built and are synced from the global Firestore catalog (settings/revisionCatalog).
 */
export type RevisionSettings = {
  /** How many distinct tests are generated for each day. */
  testsPerDay: number;
  /** How many questions each daily test contains. */
  questionsPerTest: number;
  /** Estimated completion time (minutes) shown on the dashboard card. */
  estimatedMinutes: number;
};

export const DEFAULT_SETTINGS: RevisionSettings = {
  testsPerDay: 1,
  questionsPerTest: 10,
  estimatedMinutes: 5,
};

/* ------------------------------------------------------------------ */
/* User Custom Settings                                                */
/* ------------------------------------------------------------------ */

export type Difficulty = "easy" | "medium" | "hard";

export type UserCustomSettings = {
  /** Whether the user has opted into custom settings (vs using admin defaults). */
  enabled: boolean;
  /** User-selected class slug (filters which subjects/topics are available). */
  classSlug: string;
  /** User-selected subject slugs (empty = all). */
  subjectSlugs: string[];
  /** User-selected topic slugs (empty = all). */
  topicSlugs: string[];
  /** User-defined tests per day. */
  testsPerDay: number;
  /** User-defined questions per test. */
  questionsPerTest: number;
  /** User-defined estimated minutes. */
  estimatedMinutes: number;
  /** User-selected difficulty filter. */
  difficulty: Difficulty | "mixed";
};

export const DEFAULT_USER_CUSTOM_SETTINGS: UserCustomSettings = {
  enabled: false,
  classSlug: "",
  subjectSlugs: [],
  topicSlugs: [],
  testsPerDay: 1,
  questionsPerTest: 10,
  estimatedMinutes: 5,
  difficulty: "mixed",
};

/* ------------------------------------------------------------------ */
/* Admin Customization Limits                                          */
/* ------------------------------------------------------------------ */

export type CustomizationLimits = {
  /** Whether users are allowed to customize their revision settings. */
  allowUserCustomization: boolean;
  /** Min tests per day the user can set. */
  minTestsPerDay: number;
  /** Max tests per day the user can set. */
  maxTestsPerDay: number;
  /** Min questions per test the user can set. */
  minQuestionsPerTest: number;
  /** Max questions per test the user can set. */
  maxQuestionsPerTest: number;
  /** Min estimated minutes. */
  minEstimatedMinutes: number;
  /** Max estimated minutes. */
  maxEstimatedMinutes: number;
  /** If true, user MUST pick a class. */
  requireClassSelection: boolean;
};

export const DEFAULT_CUSTOMIZATION_LIMITS: CustomizationLimits = {
  allowUserCustomization: true,
  minTestsPerDay: 1,
  maxTestsPerDay: 5,
  minQuestionsPerTest: 5,
  maxQuestionsPerTest: 50,
  minEstimatedMinutes: 5,
  maxEstimatedMinutes: 120,
  requireClassSelection: false,
};

/* ------------------------------------------------------------------ */
/* Class management                                                    */
/* ------------------------------------------------------------------ */

export type CatalogClass = {
  name: string;
  slug: string;
  icon: string;
  /** Subject slugs available for this class. */
  subjectSlugs: string[];
};

/** Portable (slug-based) catalog shapes — the form stored in Firestore and
 *  editable in the admin panel, independent of the local numeric row ids. */
export type CatalogSubject = { name: string; slug: string; icon: string; color: string };
export type CatalogTopic = { subjectSlug: string; name: string; slug: string };
export type CatalogQuestion = {
  topicSlug: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  isActive: boolean;
};

export type RevisionCatalogInput = {
  settings?: Partial<RevisionSettings>;
  classes?: CatalogClass[];
  customizationLimits?: Partial<CustomizationLimits>;
  subjects: CatalogSubject[];
  topics: CatalogTopic[];
  questions: CatalogQuestion[];
};

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
  /** 0-based slot within the day — supports multiple tests per day. */
  slot: number;
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
  /** Monotonic version of the remote catalog last applied (0 = never). */
  catalogVersion: number;
  settings: RevisionSettings;
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

/**
 * Build a fresh runtime DB from a slug-based catalog. Used for both the
 * bundled seed content and the remote Firestore catalog published by the
 * admin panel, so a single builder guarantees identical id assignment
 * (deterministic, ordered) in both paths.
 */
export function buildDbFromCatalog(input: RevisionCatalogInput): RevisionDb {
  const subjects: SubjectRow[] = [];
  const topics: TopicRow[] = [];
  const questions: QuestionRow[] = [];

  const subjectIdBySlug = new Map<string, number>();
  input.subjects.forEach((s, i) => {
    const id = i + 1;
    subjectIdBySlug.set(s.slug, id);
    subjects.push({ id, name: s.name, slug: s.slug, icon: s.icon, color: s.color });
  });

  const topicIdBySlug = new Map<string, number>();
  input.topics.forEach((t, i) => {
    const subjectId = subjectIdBySlug.get(t.subjectSlug);
    if (!subjectId) return;
    const id = i + 1;
    topicIdBySlug.set(t.slug, id);
    topics.push({ id, subjectId, name: t.name, slug: t.slug });
  });

  input.questions.forEach((q, i) => {
    const topicId = topicIdBySlug.get(q.topicSlug);
    const topicMeta = input.topics.find((t) => t.slug === q.topicSlug);
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
      isActive: q.isActive !== false,
    });
  });

  return {
    seedVersion: SEED_VERSION,
    catalogVersion: 0,
    settings: { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) },
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

function buildSeededDb(): RevisionDb {
  return buildDbFromCatalog({
    subjects: SEED_SUBJECTS.map((s) => ({ ...s })),
    topics: SEED_TOPICS.map((t) => ({ ...t })),
    questions: SEED_QUESTIONS.map((q) => ({ ...q, isActive: true })),
  });
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
        db = normalizeDb(parsed);
      }
    }
  } catch {
    db = null;
  }
  if (!db) db = buildSeededDb();
  cache.set(uid, db);
  return db;
}

/** Repair older persisted DBs that predate settings / catalogVersion / slots. */
function normalizeDb(db: RevisionDb): RevisionDb {
  if (!db.settings || typeof db.settings !== "object") {
    db.settings = { ...DEFAULT_SETTINGS };
  } else {
    db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  }
  if (typeof db.catalogVersion !== "number") db.catalogVersion = 0;
  if (!db.nextIds || typeof db.nextIds !== "object") db.nextIds = {};
  for (const test of db.dailyTests ?? []) {
    if (typeof test.slot !== "number") test.slot = 0;
  }
  return db;
}

/** Replace the catalog (subjects/topics/questions/settings) from remote data,
 *  keeping the user's own progress (attempts, revision items, sessions). */
export function applyCatalog(uid: string, input: RevisionCatalogInput, catalogVersion: number): RevisionDb {
  const fresh = buildDbFromCatalog(input);
  const current = loadDb(uid);
  const db: RevisionDb = {
    ...current,
    seedVersion: SEED_VERSION,
    catalogVersion,
    settings: fresh.settings,
    subjects: fresh.subjects,
    topics: fresh.topics,
    questions: fresh.questions,
  };
  saveDb(uid, db);
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

/* ------------------------------------------------------------------ */
/* User Custom Settings Storage                                        */
/* ------------------------------------------------------------------ */

const userSettingsKey = (uid: string) => `revision_custom_settings_${uid}`;

export function loadUserCustomSettings(uid: string): UserCustomSettings {
  try {
    const raw = localStorage.getItem(userSettingsKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as UserCustomSettings;
      return { ...DEFAULT_USER_CUSTOM_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_USER_CUSTOM_SETTINGS };
}

export function saveUserCustomSettings(uid: string, settings: UserCustomSettings) {
  try {
    localStorage.setItem(userSettingsKey(uid), JSON.stringify(settings));
  } catch {
    // Persistence is best-effort
  }
}

/**
 * Resolve the effective settings for a user by merging admin defaults with
 * user customizations (if enabled and allowed by admin limits).
 */
export function getEffectiveSettings(uid: string, db: RevisionDb): RevisionSettings {
  const custom = loadUserCustomSettings(uid);
  if (!custom.enabled) return db.settings;
  // User custom settings override admin defaults
  return {
    testsPerDay: custom.testsPerDay || db.settings.testsPerDay,
    questionsPerTest: custom.questionsPerTest || db.settings.questionsPerTest,
    estimatedMinutes: custom.estimatedMinutes || db.settings.estimatedMinutes,
  };
}
