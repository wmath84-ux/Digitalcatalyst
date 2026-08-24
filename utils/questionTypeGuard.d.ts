export type QuestionKindLabel = "theory" | "application" | "unknown";
export type QuestionKind = "theory" | "application";

export type ModeNeed = { kind: QuestionKind; count: number };

export type ModeEnforcementSummary = {
  total: number;
  theory: number;
  application: number;
  unknown: number;
  targetTheory: number;
  targetApplication: number;
};

export type ModeEnforcementPlan<T = unknown> = {
  /** True when keep already satisfies the selected mode exactly. */
  ok: boolean;
  /** Compliant questions to retain (never contains a wrong-type question). */
  keep: T[];
  /** What a repair generation call must produce to complete the test. */
  needs: ModeNeed[];
  /** The detected wrong-type questions, used as rewrite context for repairs. */
  rejects: T[];
  summary: ModeEnforcementSummary;
};

export const QUESTION_KINDS: string[];
export declare function normalizeModelTypeTag(value: unknown): "" | QuestionKind;
export declare function mixedModeSplit(count: unknown): { theory: number; application: number };
export declare function classifyQuestionKind(question: unknown): QuestionKindLabel;
export declare function resolveQuestionKind(question: unknown): QuestionKindLabel;
export declare function planModeEnforcement<T = unknown>(
  questions: unknown,
  mode: unknown,
  requestedCount: unknown,
): ModeEnforcementPlan<T>;
