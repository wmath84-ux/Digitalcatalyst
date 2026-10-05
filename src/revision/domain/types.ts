/**
 * Digitalcatalyst Revision — Unified Revision Domain Model
 * ========================================================
 *
 * ONE canonical model for every card, deck, tag, review and test the Revision
 * feature knows about, regardless of which engine produced it:
 *
 *   • Digitalcatalyst curriculum questions (Test Bank / Daily Test / Smart Revision)
 *   • AI-generated + bulk-imported questions
 *   • User-authored cards
 *   • Recall cards (ported UI, MIT — see THIRD_PARTY_NOTICES.md)
 *   • Mnemonic capabilities (topic tree, formula/cloze cards)
 *   • Openlet capabilities (image occlusion, folders, study modes)
 *
 * The React layer never depends on three unrelated data models: it reads this
 * model (through the Recall store projection in `integrations/recallAdapter.ts`)
 * and writes back through the adapter layer.
 *
 * Separation of concerns (migration brief §3 / §13):
 *   card content        -> `UnifiedCard.front/back/media/...`
 *   scheduling state    -> `UnifiedCard.scheduling`   (FSRS, ts-fsrs)
 *   review log          -> `UnifiedReviewLog[]`
 *   due state           -> derived (`engine/queue.ts`, `engine/analytics.ts`)
 *   user settings       -> `UnifiedSettings`
 *   analytics state     -> derived from review logs, never stored
 *   persistence         -> `integrations/dcxRepository.ts` (IndexedDB/Dexie)
 *   cloud sync          -> `engine/cloudRevisionService.ts` (unchanged contract)
 */

import type { DailyTestRow, RevisionSettings, RevisionStatus, UserCustomSettings } from "../engine/store";

/* ------------------------------------------------------------------ */
/* Identifiers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Stable string ids. Legacy numeric row ids are preserved inside the id
 * (e.g. `dcq:1234` for a Digitalcatalyst question) so a migration is
 * loss-free and reversible, and so relations survive a round trip.
 */
export type UnifiedId = string;

export const ID_PREFIX = {
  curriculumQuestion: "dcq",
  userCard: "usrc",
  recallCard: "recall",
  deck: "deck",
  folder: "folder",
  tag: "tag",
  review: "rev",
  session: "ses",
  test: "test",
  attempt: "att",
  media: "media",
} as const;

/** Namespaced id helpers — one place, so every adapter agrees. */
export function makeId(prefix: string, value: string | number): UnifiedId {
  return `${prefix}:${value}`;
}

export function parseId(id: UnifiedId): { prefix: string; value: string } {
  const index = id.indexOf(":");
  if (index < 0) return { prefix: "", value: id };
  return { prefix: id.slice(0, index), value: id.slice(index + 1) };
}

/* ------------------------------------------------------------------ */
/* Card content                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every card shape the unified model must be able to represent (§10).
 * `mcq` is Digitalcatalyst's native exam shape; `basic`/`cloze`/`formula` are
 * Recall + Mnemonic; `image-occlusion` is Openlet.
 */
export type UnifiedCardType =
  | "basic"
  | "mcq"
  | "cloze"
  | "formula"
  | "image"
  | "image-occlusion"
  | "markdown"
  | "latex"
  | "code";

/** Where a card came from. Drives import/export fidelity and analytics. */
export type CardSourceId =
  | "curriculum"
  | "daily-test"
  | "smart-revision"
  | "custom-test"
  | "ai"
  | "bulk-import"
  | "user"
  | "recall"
  | "openlet";

export type CardDifficulty = "easy" | "medium" | "hard";

/** One occlusion mask (Openlet capability, ported). Percent geometry. */
export interface UnifiedOcclusionMask {
  id: string;
  /** x/y/width/height as a percentage of the image box (0-100). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The hidden answer revealed when the mask is tapped. */
  label: string;
}

export interface UnifiedOcclusion {
  masks: UnifiedOcclusionMask[];
}

/** A media attachment. `dataUrl` is the portable form; `storageKey` the DB one. */
export interface UnifiedMediaRef {
  id: UnifiedId;
  kind: "image";
  mimeType: string;
  name: string;
  /** Object/Data URL used for rendering. */
  url?: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdAt: string;
}

/**
 * FSRS scheduling state — deliberately its own object so no scheduling value
 * is ever buried inside a React component or mixed into card content (§9).
 * Field names mirror `ts-fsrs`'s `Card` so the engine can be swapped for a
 * newer maintained implementation without touching the UI.
 */
export interface UnifiedScheduling {
  /** ISO timestamp the card is next due. */
  due: string;
  /** ISO timestamp of the last review, or null for a brand-new card. */
  lastReview: string | null;
  /** FSRS memory stability (days). */
  stability: number;
  /** FSRS item difficulty (1-10). */
  difficulty: number;
  /** Days since the previous review. */
  elapsedDays: number;
  /** Days the scheduler planned between the last review and the next one. */
  scheduledDays: number;
  /** Total number of reviews (ts-fsrs `reps`). */
  reps: number;
  /** Number of times the card lapsed into relearning. */
  lapses: number;
  state: UnifiedCardState;
  /** Index into the learning/relearning step ladder (ts-fsrs `learning_steps`). */
  learningSteps: number;
  /** Set while the card is buried (manual bury / sibling bury). */
  buriedUntil?: string | null;
  /** Set while the card is snoozed (`snoozeCard`). */
  snoozedUntil?: string | null;
}

export type UnifiedCardState = "new" | "learning" | "review" | "relearning";

/** Recall's four FSRS ratings, reused verbatim so no second rating scale exists. */
export type UnifiedRating = "again" | "hard" | "good" | "easy";

/** Back-reference to the Digitalcatalyst rows a card was projected from. */
export interface LegacyCardLink {
  questionId?: number;
  revisionItemId?: number;
  dailyTestId?: number;
  /** Revision Bank mastery status, mirrored so Weak Topics keeps working. */
  revisionStatus?: RevisionStatus;
  /** The legacy deck this card belonged to (subject id as a string). */
  subjectId?: number;
  topicId?: number;
}

export interface UnifiedCard {
  id: UnifiedId;
  deckId: UnifiedId;
  subjectId?: number;
  topicId?: number;
  /** Curriculum class slug — the coarsest scope (§11). */
  classSlug?: string;
  /** Openlet-style folder the deck/card lives in. */
  folderId?: UnifiedId;
  tags: string[];
  /* ── content ── */
  front: string;
  back: string;
  hint: string;
  explanation?: string;
  /** MCQ options when `cardType === "mcq"`. */
  options?: string[];
  /** MCQ correct option index when `cardType === "mcq"`. */
  correctIndex?: number;
  cardType: UnifiedCardType;
  /** Reversed sibling for formula ↔ name cards (Mnemonic capability). */
  reversible?: { enabled: boolean; backTemplate?: string };
  occlusion?: UnifiedOcclusion;
  media: UnifiedMediaRef[];
  /* ── provenance ── */
  source: CardSourceId;
  difficulty: CardDifficulty;
  /** Upstream row pointer for two-way sync with the existing engine. */
  legacy?: LegacyCardLink;
  /* ── lifecycle ── */
  createdAt: string;
  updatedAt: string;
  /** Soft delete marker so a rejected/reverted card never resurrects. */
  deletedAt?: string | null;
  /** Denormalised order for deterministic imports. */
  position?: number;
  /* ── scheduling + history pointers ── */
  scheduling: UnifiedScheduling;
}

/* ------------------------------------------------------------------ */
/* Review history                                                      */
/* ------------------------------------------------------------------ */

export interface UnifiedReviewLog {
  id: UnifiedId;
  cardId: UnifiedId;
  rating: UnifiedRating;
  /** ISO timestamp. */
  reviewedAt: string;
  /** Milliseconds the learner spent on the card before rating. */
  responseTime: number;
  /** Which surface produced the review — analytics + dedupe both use it. */
  source: ReviewSource;
  sessionId: UnifiedSessionId | null;
  /* ── FSRS snapshot AFTER the review (kept so an optimizer can run later) ── */
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  stateBefore: UnifiedCardState;
  stateAfter: UnifiedCardState;
  /** Legacy `revisionSessionAnswers.id` when the review came from a schedule. */
  legacyAnswerId?: number;
  /**
   * Idempotency key. Two devices (or StrictMode double-invokes, reconnect
   * retries, listener re-attachment) that produce the same review collapse
   * into one row because this key is the table's primary key (§14).
   */
  dedupeKey: string;
}

export type ReviewSource = "recall-study" | "match-game" | "custom-study" | "smart-revision" | "daily-test" | "restore";

export type UnifiedSessionId = UnifiedId;

export interface UnifiedStudySession {
  id: UnifiedSessionId;
  deckId: UnifiedId | null;
  /** Ordered card ids — deterministic so an interrupted session resumes. */
  cardIds: UnifiedId[];
  currentIndex: number;
  startedAt: string;
  endedAt: string | null;
  completed: boolean;
  ratings: Record<UnifiedRating, number>;
  newCardsCount: number;
  /** Which queue builder produced the session (`engine/queue.ts`). */
  queue: StudyQueueKind;
  legacy?: { revisionSessionId?: number; attemptId?: number };
}

export type StudyQueueKind = "due" | "custom" | "weak-topics" | "daily-test" | "micro" | "interleaved";

/* ------------------------------------------------------------------ */
/* Organisation: decks, folders, tags (Mnemonic + Openlet)             */
/* ------------------------------------------------------------------ */

export type DeckColor = "blue" | "green" | "amber" | "rose" | "violet" | "slate";

/**
 * Deck kinds keep the existing curriculum hierarchy addressable without a
 * destructive schema change (§11): a `subject` deck exists per curriculum
 * subject, a `test` deck per saved test, and `user` decks for anything the
 * learner (or Openlet import) creates.
 */
export type DeckKind = "subject" | "topic" | "test" | "user" | "imported" | "folder";

export interface UnifiedDeck {
  id: UnifiedId;
  name: string;
  description: string;
  color: DeckColor;
  kind: DeckKind;
  folderId?: UnifiedId;
  /** Back-reference into the curriculum so the hierarchy stays navigable. */
  subjectId?: number;
  topicId?: number;
  classSlug?: string;
  examDeadline?: string;
  createdAt: string;
  updatedAt: string;
  /** Openlet capability: a deck can be shared/duplicated by reference. */
  shareRef?: { ownerUid: string; version: number } | null;
}

/** Mnemonic capability: hierarchical topic tree + Openlet folders. */
export interface UnifiedFolder {
  id: UnifiedId;
  name: string;
  parentId: UnifiedId | null;
  color: DeckColor;
  createdAt: string;
  updatedAt: string;
}

/**
 * Hierarchical tags (`chapter › topic`), Mnemonic's topic tree expressed in
 * Recall's tag UI. `path` is the canonical key, `parent` the tree edge.
 */
export interface UnifiedTag {
  id: UnifiedId;
  /** Full path, e.g. `Physics/Units/Kinematics`. */
  path: string;
  /** Final segment, what the tag chip renders. */
  name: string;
  parent: string | null;
  /** Number of live cards carrying the tag — computed, cached for the browser. */
  count: number;
  createdAt: string;
}

export interface UnifiedSavedSearch {
  id: UnifiedId;
  name: string;
  /** Serialised card-browser filter state. */
  query: SavedSearchQuery;
  createdAt: string;
}

export interface SavedSearchQuery {
  search?: string;
  deckId?: UnifiedId | null;
  tags?: string[];
  tagMode?: "all" | "any";
  state?: UnifiedCardState | "all";
  cardType?: UnifiedCardType | "all";
  source?: CardSourceId | "all";
  sortField?: "due" | "created" | "updated" | "front" | "reps" | "difficulty";
  sortDir?: "asc" | "desc";
}

/* ------------------------------------------------------------------ */
/* Tests + attempts (Digitalcatalyst exam mode)                        */
/* ------------------------------------------------------------------ */

/**
 * Exam mode is preserved as a first-class domain concept: the legacy
 * `DailyTestRow` / `TestAttemptRow` / answers stay the source of truth, and
 * this is the shape the Recall-styled Test surfaces read.
 */
export interface UnifiedTest {
  id: UnifiedId;
  legacyId: number;
  deckId: UnifiedId;
  title: string;
  testDate: string;
  slot: number;
  kind: "daily" | "custom";
  source?: string;
  questionIds: number[];
  totalQuestions: number;
  estimatedMinutes: number;
  planDetails?: DailyTestRow["planDetails"];
  createdAt: string;
}

export interface UnifiedAttempt {
  id: UnifiedId;
  legacyId: number;
  testId: UnifiedId;
  legacyTestId: number;
  status: "not_started" | "in_progress" | "completed" | "expired";
  attemptKind: "full" | "skipped";
  parentAttemptId: number | null;
  questionIds?: number[];
  currentIndex: number;
  score: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeSpentSeconds: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/**
 * Revision settings. Admin catalog values stay in
 * `RevisionSettings`; user overrides keep the legacy shape so existing
 * profiles migrate without prompting, with the new study prefs beside them.
 */
export interface UnifiedSettings {
  /** Legacy admin defaults (unchanged contract). */
  catalog: RevisionSettings;
  /** Legacy user customization (unchanged contract). */
  custom: UserCustomSettings;
  /**
   * Recall study preferences. Field names match the ported Recall settings so
   * that the ported UI reads them directly.
   */
  study: UnifiedStudySettings;
  /** Preference to hide the pinyin/roman helpers; kept for avatar parity. */
  migratedAt?: string;
}

export interface UnifiedStudySettings {
  theme: "light" | "dark" | "high-contrast";
  accentColor: "zinc" | "blue" | "green" | "rose" | "amber" | "violet";
  dyslexiaFont: boolean;
  dailyNewCardLimit: number;
  leechThreshold: number;
  dailyGoal: number;
  desiredRetention: number;
  notificationsEnabled: boolean;
  soundVolume: number;
  ttsEnabled: boolean;
  ttsAutoRead: boolean;
  ttsSpeed: number;
  swipeGestures: boolean;
  voiceInputEnabled: boolean;
  colorBlindMode: boolean;
  fsrsWeights: number[] | null;
  /** Focus-timer default length in minutes. */
  focusMinutes: number;
  /** Adaptive queue ordering (§19). */
  interleaveTopics: boolean;
  /** Micro-review mode card budget. */
  microSessionSize: number;
}

export const DEFAULT_STUDY_SETTINGS: UnifiedStudySettings = {
  theme: "dark",
  accentColor: "blue",
  dyslexiaFont: false,
  dailyNewCardLimit: 20,
  leechThreshold: 5,
  dailyGoal: 20,
  desiredRetention: 0.9,
  notificationsEnabled: false,
  soundVolume: 100,
  ttsEnabled: false,
  ttsAutoRead: false,
  ttsSpeed: 1,
  swipeGestures: true,
  voiceInputEnabled: true,
  colorBlindMode: false,
  fsrsWeights: null,
  focusMinutes: 25,
  interleaveTopics: true,
  microSessionSize: 8,
};

/* ------------------------------------------------------------------ */
/* The snapshot                                                        */
/* ------------------------------------------------------------------ */

export interface UnifiedSnapshot {
  /** Schema version of the unified model itself (see `domain/migrations`). */
  version: number;
  decks: UnifiedDeck[];
  folders: UnifiedFolder[];
  cards: UnifiedCard[];
  tags: UnifiedTag[];
  reviewLogs: UnifiedReviewLog[];
  sessions: UnifiedStudySession[];
  tests: UnifiedTest[];
  attempts: UnifiedAttempt[];
  savedSearches: UnifiedSavedSearch[];
  settings: UnifiedSettings;
  media: UnifiedMediaRef[];
}

export function emptySnapshot(settings: UnifiedSettings): UnifiedSnapshot {
  return {
    version: 0,
    decks: [],
    folders: [],
    cards: [],
    tags: [],
    reviewLogs: [],
    sessions: [],
    tests: [],
    attempts: [],
    savedSearches: [],
    settings,
    media: [],
  };
}

/* ------------------------------------------------------------------ */
/* Derived helpers (pure, unit-tested in tests/revisionDomain.test.mjs) */
/* ------------------------------------------------------------------ */

export function isNewCard(card: UnifiedCard): boolean {
  return card.scheduling.state === "new" && card.scheduling.reps === 0;
}

export function isDue(card: UnifiedCard, now: Date = new Date()): boolean {
  if (card.deletedAt) return false;
  if (card.scheduling.snoozedUntil && new Date(card.scheduling.snoozedUntil) > now) return false;
  if (card.scheduling.buriedUntil && new Date(card.scheduling.buriedUntil) > now) return false;
  return new Date(card.scheduling.due).getTime() <= now.getTime();
}

export function isBuried(card: UnifiedCard, now: Date = new Date()): boolean {
  return Boolean(card.scheduling.buriedUntil && new Date(card.scheduling.buriedUntil) > now);
}

export function isSnoozed(card: UnifiedCard, now: Date = new Date()): boolean {
  return Boolean(card.scheduling.snoozedUntil && new Date(card.scheduling.snoozedUntil) > now);
}

export function isLeech(card: UnifiedCard, threshold: number): boolean {
  return card.scheduling.lapses >= threshold;
}

/** Recall's cloze grammar: `{{c1::answer}}`, optionally `::hint`. */
export const CLOZE_PATTERN = /\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g;

export function hasCloze(text: string): boolean {
  CLOZE_PATTERN.lastIndex = 0;
  return CLOZE_PATTERN.test(text);
}

/** Mnemonic's formula grammar: `Formula :: Name` on the front of a card. */
export const FORMULA_PATTERN = /^(.+?)\s*::\s*(.+)$/;

export function isFormulaCard(front: string, back: string): boolean {
  if (hasCloze(front)) return false;
  return /\\frac|\\sqrt|\^|_\}|=|\\times|\\cdot/.test(front) && back.trim().length > 0;
}

/** Stable, sortable tag path: trims, collapses separators, lower-cases nothing. */
export function normalizeTagPath(raw: string): string {
  return raw
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("/");
}

export function tagParent(path: string): string | null {
  const index = path.lastIndexOf("/");
  return index < 0 ? null : path.slice(0, index);
}

export function tagLeaf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

/**
 * Deterministic idempotency key for a review event. Same card + same session +
 * same rating + same second collapses to one row, which is what makes the sync
 * layer duplicate-free under StrictMode double-invokes and reconnect retries.
 */
export function reviewDedupeKey(input: {
  cardId: UnifiedId;
  rating: UnifiedRating;
  sessionId: UnifiedSessionId | null;
  reviewedAt: string;
}): string {
  const second = input.reviewedAt.slice(0, 19);
  return `${input.cardId}|${input.sessionId ?? "-"}|${input.rating}|${second}`;
}
