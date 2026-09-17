import type { PersonalAiCoverage, PersonalAiSource, PersonalAiState } from "../../utils/personalAi";

/** One resource's honest AI availability inside a personal module. */
export interface PersonalAiResourceAvailability {
  id: string;
  name: string;
  type: string;
  state: PersonalAiState;
  readable: boolean;
  reason: string;
  chars: number;
  planKind: string;
  originKind: "official" | "manual";
  provenance: string;
  fromCache: boolean;
}

export interface PersonalAiThreadMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: { unitId: string; label: string; provenance: string }[];
  grounded: boolean;
  resourceId: string | null;
  at: number;
}

export interface PersonalAiEvidenceEvent {
  id: string;
  kind: string;
  topic: string;
  weight: number;
  at: number;
  moduleId: string | null;
  resourceId: string | null;
}

export interface PersonalAiArtifactMeta {
  id: string;
  type: string;
  moduleId: string;
  resourceId: string | null;
  contentHash: string;
  createdAt: number;
  updatedAt: number;
  summary: string;
}

/** Allowance snapshot returned by the existing revision AI usage engine. */
export interface PersonalAiAllowance {
  planId?: string;
  planName?: string;
  cycle?: "monthly" | "yearly";
  dailyLimit?: number;
  dailyUsed?: number;
  dailyRemaining?: number | null;
  dailyUnlimited?: boolean;
  dailyResetsAt?: number;
  windowLimit?: number;
  windowUsed?: number;
  windowRemaining?: number | null;
  windowUnlimited?: boolean;
  costEnabled?: boolean;
  costBudgetMicros?: number;
  costUsedMicros?: number;
  costRemainingMicros?: number | null;
  allowed?: boolean;
  blockedReason?: string | null;
}

export interface PersonalAiStateSnapshot {
  scope: {
    moduleId: string | null;
    storageModuleId: string;
    saved: boolean;
    title: string;
    description: string;
    resourceId: string | null;
    provenance: string;
  };
  resources: PersonalAiResourceAvailability[];
  coverage: PersonalAiCoverage;
  /**
   * Why the grounding is the size it is, in the learner's terms — e.g. "2
   * sub-modules of this module are not unlocked for your account, so their files
   * were not read." Set by the server from the resolved scope. Surfaced under the
   * coverage line so "the AI didn't read it" is never mistaken for "the AI
   * doesn't have access to my course".
   */
  scopeNote?: string;
  contentHash: string;
  unitCount: number;
  unitKinds: Record<string, number>;
  thread: PersonalAiThreadMessage[];
  evidence: PersonalAiEvidenceEvent[];
  artifacts: PersonalAiArtifactMeta[];
  ai: {
    source: "own" | "default";
    configured: boolean;
    hasAccess: boolean;
    planId: string;
    planName: string;
    cycle: "monthly" | "yearly";
    dailyLimit: number;
    windowLimit: number;
    allowed: boolean;
    blockedReason: string | null;
    usage: PersonalAiAllowance | null;
  };
  unreadable: { id: string; name: string; type: string; state: PersonalAiState; reason: string }[];
}

export interface PersonalAiAnswerResult {
  kind: "answer";
  question: string;
  answer: string;
  sources: string[];
  grounded: boolean;
  followUps: string[];
  sourceDetails: PersonalAiSource[];
  coverage: PersonalAiCoverage;
  unreadable: { id: string; name: string; type: string; state: PersonalAiState; reason: string }[];
  scopeLabel: string;
  /**
   * Why the grounding is the size it is — e.g. "3 of 9 files in this lesson
   * could be read." or "2 sub-modules of this module are locked for your
   * account". Set by the server from the resolved scope, so a thin answer can
   * be explained to the learner instead of reading like a permissions problem.
   */
  scopeNote?: string;
  provider: string;
  model: string;
  aiSource: "own" | "default";
  allowance: PersonalAiAllowance | { unmetered: true; source: "own"; message: string } | null;
  at: number;
}

export type PersonalAiGenerationKind =
  | "summary"
  | "resource-summary"
  | "questions"
  | "flashcards"
  | "plan"
  | "orientation"
  | "explain";

export interface PersonalAiGenerationResult<T = unknown> {
  kind: string;
  reused: boolean;
  artifactId: string | null;
  payload: T;
  sources: PersonalAiSource[];
  coverage: PersonalAiCoverage;
  authoredOnly?: boolean;
  contentHash: string;
  scopeLabel: string;
  provider: string;
  model: string;
  aiSource: "own" | "default";
  allowance: PersonalAiAllowance | { unmetered: true; source: "own"; message: string } | null;
  createdAt: number;
  insufficientReadable?: boolean;
}

/** Learner-authored note text offered to the grounding corpus. */
export interface PersonalAiNoteInput {
  id: string;
  text: string;
  resourceId: string | null;
}

export type PersonalAiEvidenceKind =
  | "question_incorrect"
  | "question_repeated"
  | "dont_understand"
  | "flashcard_missed"
  | "low_session_score";
