import type { Attachment, Chat, MistakeKind, ResponseFormat } from "../lib/types";
import type { GenerationSpec } from "../lib/engine";

/* ── Student learning memory (long-term, evidence-gated) ──── */

export type { MistakeKind };

export interface MistakeRecord {
  concept: string;
  kind: MistakeKind;
  note: string;
  at: number;
  /** Turns since this was last re-tested — drives spaced revision. */
  sinceReinforced: number;
}

/**
 * Body of evidence about ONE concept. `ability` is an EMA mastery estimate
 * in [-1, 1]; `confidence` [0, 1] says how much we trust it, so one answer
 * never rewrites the picture of a student.
 */
export interface ConceptState {
  id: string;
  label: string;
  ability: number;
  confidence: number;
  exposures: number;
  correct: number;
  wrong: number;
  /** Signed streak: +consistently right, −consistently wrong. */
  streak: number;
  mistakes: MistakeRecord[]; // recent, capped
  lastSeen: number;
  lastResult?: "correct" | "wrong";
  /** Topics discussed since last contact — spacing signal. */
  turnsSinceSeen: number;
}

export type StyleChannel = "examples" | "intuition" | "formulas" | "steps" | "visual";

export interface StudentModel {
  version: 2;
  concepts: Record<string, ConceptState>;
  prefs: {
    /** −1 prefers simpler … +1 prefers depth. Drifts slowly with evidence. */
    depthLean: number;
    style: Record<StyleChannel, number>;
    examPressure: number; // 0..1, decayed
    examMentionAt?: number;
  };
  updatedAt: number;
}

/* ── Conversation memory (per chat, compact + retrievable) ── */

export interface Turn {
  role: "user" | "assistant";
  excerpt: string; // capped — never the full blob
  topicId: string;
  format?: ResponseFormat;
  at: number;
}

export interface ChatMemory {
  turns: Turn[]; // recent window only
  gist: string; // rolling one-paragraph summary of older turns
  gistTurns: number; // how many turns the gist covers
  corrections: string[]; // concept ids the student was corrected on
  servedQuestions: string[]; // quiz question texts already served here
  pendingClarify?: { about: string; question: string; intent: string };
}

/* ── Session state (only for the live task) ───────────────── */

export interface ProblemState {
  topicId: string;
  step: number;
  total: number;
  awaiting: string; // what the student was asked to do
}

export interface RecallState {
  topicId: string;
  expected: string[]; // key terms that signal recall
  answer: string; // canonical answer revealed after attempt
  attempts: number;
}

export interface SessionState {
  chatId: string;
  turn: number;
  topicId?: string;
  confusion: number;
  problem?: ProblemState;
  recall?: RecallState;
  lastFormat?: ResponseFormat;
}

/* ── Course context (injected by the product surface) ─────── */

export interface CourseCtx {
  course: string;
  short: string;
  lesson: string; // e.g. "Lesson 4.2 · Binary search"
  chapter: string; // the visible section / video chapter
  position: string; // e.g. "72% through · paused at 12:41"
  topicId: string;
  inPlayer: boolean;
}

/* ── Pipeline contracts ───────────────────────────────────── */

export type IntentId =
  | "greeting"
  | "thanks"
  | "reexplain" // "explain that again"
  | "confusion" // "I still don't get it"
  | "followup" // refers to the active thread without restating it
  | "question" // a fresh, self-contained question
  | "solve" // "help me solve this" — candidate for guidance
  | "continue-problem" // student is mid multi-turn solution
  | "answer-please" // explicitly wants the bottom line
  | "recall-answer" // a reply to an active recall prompt
  | "practice"
  | "exam"
  | "visual"
  | "feedback"
  | "image-analysis"
  | "clarify-reply" // answering a clarification we asked
  | "statement";

export interface TutorInput {
  text: string;
  attachments: Attachment[];
  chat: Chat;
  model: StudentModel;
  course: CourseCtx;
}

export interface TutorOutput {
  spec: GenerationSpec;
  model: StudentModel; // already-updated model to persist
}

export interface GradingOutput extends TutorOutput {
  scoreSummary: string;
}
