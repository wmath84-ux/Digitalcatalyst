import type { QuestionMode } from "./aiGenerate";

export const QUESTION_MODES: QuestionMode[] = ["mixed", "theory", "application"];

export const QUESTION_MODE_LABELS: Record<QuestionMode, string> = {
  mixed: "Mixed",
  theory: "Theory only",
  application: "Application only",
};

export const QUESTION_MODE_DESCRIPTIONS: Record<QuestionMode, string> = {
  mixed: "Theory + application",
  theory: "Definitions, concepts, laws, formulas and units",
  application: "Numerical, problem-based and real-world scenarios",
};

export function normalizeQuestionMode(value: unknown): QuestionMode {
  return QUESTION_MODES.includes(value as QuestionMode) ? (value as QuestionMode) : "mixed";
}

export function questionModeLabel(value: unknown): string {
  return QUESTION_MODE_LABELS[normalizeQuestionMode(value)];
}
