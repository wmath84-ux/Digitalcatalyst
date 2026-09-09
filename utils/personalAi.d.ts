// Type declarations for `utils/personalAi.js` — the pure shared layer of the
// Personal Module AI Study Engine (Part 2). The runtime lives in the sibling
// `.js` file so the Node test runner, the browser bundle and the serverless
// API all import exactly the same honesty/retrieval/prompt rules.

/** Honest availability vocabulary shared by extractor, API and UI. */
export type PersonalAiState =
  | "ready"
  | "partial"
  | "processing"
  | "unavailable"
  | "permission_required"
  | "unsupported";

export const PERSONAL_AI_STATES: readonly PersonalAiState[];
export const PERSONAL_AI_READABLE_STATES: readonly PersonalAiState[];
export const isPersonalAiReadableState: (state: unknown) => boolean;

/** What the server extractor should attempt for one resource. */
export type PersonalAiReadKind = "google-export" | "pdf" | "text" | "none";
export const PERSONAL_AI_READ_KINDS: readonly PersonalAiReadKind[];

export type PersonalAiOutcomeStatus =
  | "ok"
  | "empty"
  | "invalid"
  | "permission"
  | "error"
  | "skipped"
  | "pending"
  | "unsupported";
export const PERSONAL_AI_OUTCOMES: readonly PersonalAiOutcomeStatus[];

export const PERSONAL_AI_MAX_CONTEXT_CHARS: number;
export const PERSONAL_AI_MAX_CHUNK_CHARS: number;
export const PERSONAL_AI_MAX_CHUNKS: number;
export const PERSONAL_AI_MAX_RESOURCE_CHARS: number;
export const PERSONAL_AI_MAX_AUTHORED_CHARS: number;
export const PERSONAL_AI_MAX_UNITS: number;
export const PERSONAL_AI_MIN_READABLE_CHARS: number;

export const PERSONAL_AI_QUESTION_MIN: number;
export const PERSONAL_AI_QUESTION_MAX: number;
export const PERSONAL_AI_QUESTION_DEFAULT: number;
export const PERSONAL_AI_FLASHCARD_MIN: number;
export const PERSONAL_AI_FLASHCARD_MAX: number;
export const PERSONAL_AI_FLASHCARD_DEFAULT: number;
export const PERSONAL_AI_PLAN_DAY_MIN: number;
export const PERSONAL_AI_PLAN_DAY_MAX: number;
export const PERSONAL_AI_PLAN_DAY_DEFAULT: number;
export const PERSONAL_AI_QUESTION_TYPES: readonly ("mcq" | "short" | "boolean")[];
export const PERSONAL_AI_EXPLAIN_MODES: readonly ("simple" | "steps" | "example" | "exam")[];
export const PERSONAL_AI_ARTIFACT_TYPES: readonly string[];
export const PERSONAL_AI_MAX_HISTORY_MESSAGES: number;
export const PERSONAL_AI_MAX_HISTORY_CHARS: number;
export const PERSONAL_AI_QUESTION_CHARS_MAX: number;
export const PERSONAL_AI_ARTIFACT_TTL_MS: number;
export const PERSONAL_AI_SAVED_LABEL: string;
export const PERSONAL_AI_MODULE_ROOT_LABEL: string;

export const cleanAiText: (value: unknown, max?: number) => string;
export const stripAiMarkup: (value: unknown, max?: number) => string;
export const personalAiHash: (value: unknown) => string;
export const googleFileIdFromUrl: (rawUrl: unknown) => string;

export interface PersonalAiReadPlan {
  kind: PersonalAiReadKind;
  url: string;
  format: string;
  reason: string;
}
export const personalAiReadPlan: (resource: unknown) => PersonalAiReadPlan;

export interface PersonalAiAvailability {
  state: PersonalAiState;
  readable: boolean;
  reason: string;
  chars: number;
  authored: boolean;
  type: string;
  typeLabel: string;
}
export const personalAiState: (input: {
  type?: unknown;
  plan?: unknown;
  outcome?: unknown;
  authored?: boolean;
}) => PersonalAiAvailability;

export interface PersonalAiProvenance {
  scope: "module" | "resource";
  saved: boolean;
  label: string;
  root: string;
  moduleTitle: string;
  resourceName: string;
  kind: "official-copy" | "personal";
  kindLabel: string;
}
export const personalAiProvenance: (input: {
  scope?: "module" | "resource";
  saved?: boolean;
  moduleTitle?: unknown;
  resourceName?: unknown;
  originKind?: unknown;
}) => PersonalAiProvenance;

export type PersonalAiUnitKind = "module-brief" | "resource-meta" | "resource-text" | "note" | "artifact";

export interface PersonalAiUnit {
  id: string;
  kind: PersonalAiUnitKind;
  scope: "module" | "resource";
  resourceId: string | null;
  title: string;
  provenance: string;
  originKind: "official-copy" | "personal";
  readable: boolean;
  weight: number;
  text: string;
  chars: number;
}

export const buildPersonalAiUnits: (input: {
  module?: unknown;
  saved?: boolean;
  resources?: unknown[];
  availability?: Record<string, unknown>;
  extracted?: Record<string, unknown>;
  notes?: Record<string, unknown[]>;
}) => PersonalAiUnit[];

export interface PersonalAiCoverage {
  total: number;
  readable: number;
  ready: number;
  partial: number;
  processing: number;
  permissionRequired: number;
  unsupported: number;
  unavailable: number;
  full: boolean;
  none: boolean;
  sentence: string;
}
export const personalAiCoverage: (input: { resources?: unknown[] }) => PersonalAiCoverage;
export const personalAiCoverageSentence: (input: {
  total?: unknown;
  readable?: unknown;
  ready?: unknown;
}) => string;

export const personalAiTokens: (value: unknown) => string[];
export const chunkPersonalAiText: (text: unknown, maxChars?: number) => string[];

export interface PersonalAiChunk {
  unitId: string;
  kind: string;
  scope: "module" | "resource";
  resourceId: string | null;
  title: string;
  provenance: string;
  originKind: string;
  part: number;
  parts: number;
  text: string;
  chars: number;
  score: number;
}
export const retrievePersonalAiChunks: (input: {
  units?: unknown[];
  query?: unknown;
  resourceId?: unknown;
  maxChunks?: number;
  maxChars?: number;
  chunkChars?: number;
}) => PersonalAiChunk[];

export interface PersonalAiSource {
  unitId: string;
  scope: "module" | "resource";
  resourceId: string | null;
  label: string;
  provenance: string;
  kind: string;
  originKind: string;
}
export const personalAiSources: (chunks: unknown) => PersonalAiSource[];
export const personalAiContentHash: (units: unknown) => string;
export const isReusablePersonalAiArtifact: (input: {
  artifact?: unknown;
  type?: unknown;
  moduleId?: unknown;
  resourceId?: unknown;
  contentHash?: unknown;
  force?: boolean;
  maxAgeMs?: number;
  now?: number;
}) => boolean;

export const PERSONAL_AI_SYSTEM_PROMPT: string;
export const buildPersonalAiAskPrompt: (input: unknown) => string;
export const buildPersonalAiSummaryPrompt: (input: unknown) => string;
export const buildPersonalAiQuestionsPrompt: (input: unknown) => string;
export const buildPersonalAiFlashcardsPrompt: (input: unknown) => string;
export const buildPersonalAiExplainPrompt: (input: unknown) => string;
export const buildPersonalAiPlanPrompt: (input: unknown) => string;
export const buildPersonalAiOrientationPrompt: (input: unknown) => string;

export interface PersonalAiAnswer {
  answer: string;
  sources: string[];
  grounded: boolean;
  followUps: string[];
}
export const normalizePersonalAiAnswer: (raw: unknown, knownUnitIds?: unknown) => PersonalAiAnswer;

export interface PersonalAiSummary {
  overview: string;
  keyConcepts: { title: string; detail: string }[];
  definitions: { term: string; meaning: string }[];
  formulas: { name: string; value: string; when: string }[];
  takeaways: string[];
  remember: string[];
  sources: string[];
  insufficient: boolean;
}
export const normalizePersonalAiSummary: (raw: unknown, knownUnitIds?: unknown) => PersonalAiSummary;

export type PersonalAiQuestionType = "mcq" | "short" | "boolean";
export interface PersonalAiQuestion {
  id: string;
  type: PersonalAiQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  answer: string;
  explanation: string;
  topic: string;
  sources: string[];
}
export interface PersonalAiQuestionSet {
  questions: PersonalAiQuestion[];
  insufficient: boolean;
}
export const normalizePersonalAiQuestions: (raw: unknown, knownUnitIds?: unknown) => PersonalAiQuestionSet;

export interface PersonalAiFlashcard {
  id: string;
  front: string;
  back: string;
  topic: string;
  sources: string[];
}
export interface PersonalAiFlashcardSet {
  cards: PersonalAiFlashcard[];
  insufficient: boolean;
}
export const normalizePersonalAiFlashcards: (raw: unknown, knownUnitIds?: unknown) => PersonalAiFlashcardSet;

export interface PersonalAiPlan {
  days: { day: number; focus: string; tasks: string[]; questions: number }[];
  note: string;
  sources: string[];
  insufficient: boolean;
}
export const normalizePersonalAiPlan: (raw: unknown, knownUnitIds?: unknown) => PersonalAiPlan;

export interface PersonalAiOrientation {
  orientation: string;
  focus: string[];
  watchOut: string[];
  firstStep: string;
  sources: string[];
  insufficient: boolean;
}
export const normalizePersonalAiOrientation: (raw: unknown, knownUnitIds?: unknown) => PersonalAiOrientation;

export interface PersonalAiExplanation {
  explanation: string;
  keyPoint: string;
  sources: string[];
  grounded: boolean;
}
export const normalizePersonalAiExplanation: (raw: unknown, knownUnitIds?: unknown) => PersonalAiExplanation;

export type PersonalAiEvidenceKind =
  | "question_incorrect"
  | "question_repeated"
  | "dont_understand"
  | "flashcard_missed"
  | "low_session_score";

export const PERSONAL_AI_EVIDENCE_KINDS: readonly PersonalAiEvidenceKind[];
export const PERSONAL_AI_EVIDENCE_WEIGHTS: Readonly<Record<PersonalAiEvidenceKind, number>>;
export const PERSONAL_AI_WEAK_MIN_SCORE: number;
export const PERSONAL_AI_WEAK_MAX_TOPICS: number;
export const PERSONAL_AI_WEAK_TOPIC_MIN_CHARS: number;
export const PERSONAL_AI_WEAK_TOPIC_MAX_CHARS: number;
export const PERSONAL_AI_INSUFFICIENT_WEAK_COPY: string;

export const personalAiTopicKey: (value: unknown) => string;
export const personalAiTopicLabel: (value: unknown) => string;

export interface PersonalAiWeakTopic {
  key: string;
  topic: string;
  score: number;
  hits: number;
  firstAt: number;
  lastAt: number;
  evidence: Partial<Record<PersonalAiEvidenceKind, number>>;
  resourceIds: string[];
  moduleId: string;
  level: "low" | "medium" | "high";
}
export const aggregatePersonalAiWeakTopics: (
  events: unknown,
  options?: { now?: number; windowMs?: number },
) => {
  topics: PersonalAiWeakTopic[];
  state: "ready" | "insufficient";
  message: string;
  totalEvents: number;
};

export type PersonalAiFailureKind =
  | "auth"
  | "limit"
  | "entitlement"
  | "config"
  | "content"
  | "ownership"
  | "input"
  | "busy"
  | "provider"
  | "network"
  | "server"
  | "unknown";

export interface PersonalAiFailure {
  code: string;
  message: string;
  retryable: boolean;
  upgrade: boolean;
  kind: PersonalAiFailureKind;
}
export const personalAiFailure: (input: {
  code?: unknown;
  message?: unknown;
  status?: number;
}) => PersonalAiFailure;
export const personalAiUnreadableCopy: (availability: unknown) => string;
