// Types for utils/mentorAnswer.js — the AI mentor's answer contract.

/** Every layout a mentor answer can take (mirrors the Course Player's ResponseFormat). */
export type MentorFormat =
  | "concise"
  | "steps"
  | "comparison"
  | "deep-dive"
  | "code"
  | "timeline"
  | "visual"
  | "practice"
  | "feedback";

export const MENTOR_FORMATS: readonly MentorFormat[];
export const MENTOR_FORMAT_LABELS: Readonly<Record<MentorFormat, string>>;
export const isMentorFormat: (value: unknown) => value is MentorFormat;

/** Which layout a question deserves. `text` must be the learner's own words only. */
export const detectMentorFormat: (text: unknown, hasMedia?: boolean) => MentorFormat;
export const requestedMentorQuestionCount: (text: unknown, fallback?: number) => number;

export const cleanMentorInline: (value: unknown, max?: number) => string;
export const splitMentorSentences: (text: unknown) => string[];

export type MentorParseMode = "json" | "repaired" | "text" | "empty";
export const repairMentorJson: (input: unknown) => string;
export const parseMentorModelText: (raw: unknown) => { value: Record<string, unknown>; how: MentorParseMode };

export interface MentorStep { title: string; detail: string }
export interface MentorEvent { when: string; what: string }
export interface MentorTable { columns: string[]; rows: string[][] }
export interface MentorCode { language: string; source: string }
export interface MentorLegendRow { label: string; meaning: string }
export interface MentorQuestion { question: string; options: string[]; answer: string; why: string }
export interface MentorImprovement { issue: string; fix: string }

/** The fields a model fills and the renderer lays out. */
export interface MentorSlots {
  lead: string;
  points: string[];
  steps: MentorStep[];
  table: MentorTable | null;
  events: MentorEvent[];
  code: MentorCode | null;
  walk: string[];
  diagram: string;
  legend: MentorLegendRow[];
  questions: MentorQuestion[];
  strengths: string[];
  improvements: MentorImprovement[];
  pitfall: string;
  takeaway: string;
  closing: string;
  nextStep: string;
}

export const hasMentorStructure: (slots: unknown) => boolean;
export const readMentorSlots: (raw: unknown) => MentorSlots;
export type MentorBlock =
  | { type: "p"; text: string }
  | { type: "heading"; text: string }
  | { type: "quote"; text: string }
  | { type: "rule" }
  | { type: "fence"; lang: string; code: string }
  | { type: "table"; text: string }
  | { type: "ul" | "ol"; items: string[] };
export const parseMentorBlocks: (input: unknown) => MentorBlock[];
export const slotsFromMentorText: (text: unknown, format?: MentorFormat) => MentorSlots;
export const collectMentorSlots: (raw: unknown, format?: MentorFormat) => { slots: MentorSlots; reshaped: boolean };

export const renderMentorAnswer: (slots: Partial<MentorSlots>, format: MentorFormat) => string;

export type MentorOutlineElement =
  | { kind: "p"; italic: boolean }
  | { kind: "heading"; level: number; title: string }
  | { kind: "ul" | "ol"; items: number }
  | { kind: "table"; columns: number; rows: number; consistent: boolean }
  | { kind: "fence"; lang: string; lines: number; closed: boolean }
  | { kind: "quote"; text: string }
  | { kind: "rule" };
export const mentorOutline: (markdown: unknown) => MentorOutlineElement[];
export const validateMentorAnswer: (
  markdown: unknown,
  format: string,
) => { ok: boolean; problems: string[]; outline: MentorOutlineElement[] };

export interface MentorFinalAnswer {
  answer: string;
  /** The layout actually delivered — what the learner's chip should say. */
  format: MentorFormat;
  requested: MentorFormat;
  reshaped: boolean;
  downgraded: boolean;
  empty?: boolean;
}
export const finalizeMentorAnswer: (raw: unknown, options?: { format?: unknown }) => MentorFinalAnswer;

export const isMentorDeadEnd: (markdown: unknown) => boolean;
export function mentorMarkdownToPlainText(markdown: unknown): string;

export const MENTOR_SYSTEM_PROMPT: string;
export const MENTOR_RETRY_NOTE: string;
export const mentorFormatInstructions: (format: unknown, options?: { question?: unknown }) => string;
