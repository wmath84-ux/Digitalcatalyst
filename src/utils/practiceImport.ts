// src/utils/practiceImport.ts
//
// ONE paste → preview → validate step for Brain practice sets, shared by every
// surface that accepts an AI reply (the Course Player's “Create your own
// practice set” composer today; the admin importer reads the same parser).
//
// It sits on the shared text parser (src/revision/engine/bulkParser.ts) and the
// shared per-question rule (utils/practiceSet.js → `practiceQuestionIssues`), so
// “ready” means the same thing everywhere. Nothing here writes anything: the
// caller previews `questions`, shows `errors`, and saves only when
// `createReady` is true.

import { parseQuestionTextDetailed, type ParsedQuestion } from "../revision/engine/bulkParser.ts";
import {
  MAX_PRACTICE_QUESTIONS,
  MIN_PRACTICE_OPTIONS,
  PRACTICE_QUESTION_TYPES,
  normalizePracticeQuestion,
  practiceQuestionIssues,
  type NormalizedPracticeQuestion,
} from "../../utils/practiceSet.js";

export interface PracticeImportResult {
  /** The parsed questions in paste order — exactly what the preview shows. */
  questions: ParsedQuestion[];
  /** Human-readable reasons, each naming the line or question it is about. */
  errors: string[];
  /** Non-blocking notes (a repeated question text): shown, but Create stays enabled. */
  warnings: string[];
  /** True only when there is at least one question and no error at all. */
  createReady: boolean;
}

const EMPTY_PASTE =
  "Paste the AI’s reply first — the questions are read from that text.";
const NONE_FOUND =
  "No questions found. Each question needs a numbered prompt (1.) and lettered options (A. B. C. D.).";

const normalizePrompt = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Parse a pasted AI reply and validate every question. Errors are collected
 * per question (“Q2: no explanation”) and per block the parser could not read
 * (“Line 14: … has 1 option line”), so a learner sees every thing to fix at
 * once, not one failure at a time.
 */
export const parsePracticeImport = (text: string): PracticeImportResult => {
  if (!String(text ?? "").trim()) {
    return { questions: [], errors: [EMPTY_PASTE], warnings: [], createReady: false };
  }

  const { questions, problems } = parseQuestionTextDetailed(text);
  const errors: string[] = problems.map((problem) => `Line ${problem.line}: ${problem.message}.`);

  if (questions.length === 0 && errors.length === 0) {
    return { questions: [], errors: [NONE_FOUND], warnings: [], createReady: false };
  }

  if (questions.length > MAX_PRACTICE_QUESTIONS) {
    errors.push(
      `A set holds at most ${MAX_PRACTICE_QUESTIONS} questions — remove ${questions.length - MAX_PRACTICE_QUESTIONS} to continue.`,
    );
  }

  const warnings: string[] = [];
  const seenPrompts = new Map<string, number>();
  questions.forEach((question, index) => {
    const number = index + 1;
    const label = `Q${number}`;

    if (question.options.length < MIN_PRACTICE_OPTIONS) {
      errors.push(`${label}: needs ${MIN_PRACTICE_OPTIONS} options`);
    }
    question.options.forEach((option, optionIndex) => {
      if (!option.trim()) {
        errors.push(`${label}: option ${String.fromCharCode(65 + optionIndex)} is empty`);
      }
    });

    if (question.correctIndex < 0) {
      errors.push(
        question.answerHint
          ? `${label}: “Answer: ${question.answerHint}” does not match an option — use a letter (A–D) or the option’s text`
          : `${label}: no answer marked — put ✓ at the end of the correct option`,
      );
    }

    if (!question.explanation.trim()) {
      errors.push(`${label}: no explanation — add an “Explanation:” line`);
    }

    // Anything else the shared rule reports (kept in one place, not re-derived).
    for (const issue of practiceQuestionIssues(question)) {
      if (["no answer marked", "no explanation", `needs ${MIN_PRACTICE_OPTIONS} options`].includes(issue)) continue;
      errors.push(`${label}: ${issue}`);
    }

    const key = normalizePrompt(question.prompt);
    const firstSeen = seenPrompts.get(key);
    if (firstSeen !== undefined) {
      // A repeat is a warning, not a blocker: the teacher may keep it on purpose.
      warnings.push(`${label}: repeats Q${firstSeen}’s question text — remove one if it is a copy`);
    } else {
      seenPrompts.set(key, number);
    }
  });

  return {
    questions,
    errors,
    warnings,
    createReady: questions.length > 0 && errors.length === 0,
  };
}

/* ── the structured (JSON) import — every non-MCQ type ─────────────────── */

export interface TypedPracticeImportResult {
  /** The parsed questions, normalised to their own type — ready to review. */
  questions: NormalizedPracticeQuestion[];
  /** Human-readable reasons, each naming the question it is about. */
  errors: string[];
  /** Non-blocking notes (a repeated question text). */
  warnings: string[];
  /** True only when there is at least one question and no error at all. */
  createReady: boolean;
}

const NOT_JSON =
  "No JSON found. For this question type the AI must reply with the JSON the CMD asks for — paste that reply, or switch the type to MCQ for the plain-text format.";

/** Find and parse the JSON object/array inside a pasted AI reply. */
const extractJson = (text: string): unknown => {
  const trimmed = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to the substring search */
  }
  const start = Math.min(
    ...["{", "["].map((mark) => {
      const at = trimmed.indexOf(mark);
      return at === -1 ? Number.POSITIVE_INFINITY : at;
    }),
  );
  if (!Number.isFinite(start)) return undefined;
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (end <= start) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

/**
 * Parse a structured AI reply (the JSON the typed CMDs prescribe) into typed
 * question objects. Every question keeps its OWN declared type; a missing
 * type falls back to the type the learner selected in the creator (their
 * explicit choice, not a guess), an unrecognised type is reported — never
 * silently converted into an MCQ — and valid questions are never dropped
 * without a named error.
 */
export const parseTypedPracticeImport = (
  text: string,
  fallbackType: string = "mcq",
): TypedPracticeImportResult => {
  if (!String(text ?? "").trim()) {
    return { questions: [], errors: [EMPTY_PASTE], warnings: [], createReady: false };
  }
  const parsed = extractJson(text);
  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { questions?: unknown })?.questions)
      ? ((parsed as { questions: unknown[] }).questions as unknown[])
      : [];
  if (entries.length === 0) {
    return { questions: [], errors: [NOT_JSON], warnings: [], createReady: false };
  }

  const errors: string[] = [];
  if (entries.length > MAX_PRACTICE_QUESTIONS) {
    errors.push(
      `A set holds at most ${MAX_PRACTICE_QUESTIONS} questions — remove ${entries.length - MAX_PRACTICE_QUESTIONS} to continue.`,
    );
  }

  const questions: NormalizedPracticeQuestion[] = [];
  const warnings: string[] = [];
  const seenPrompts = new Map<string, number>();
  entries.slice(0, MAX_PRACTICE_QUESTIONS).forEach((entry, index) => {
    const label = `Q${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label}: not a question object — check the JSON shape.`);
      return;
    }
    const record = entry as Record<string, unknown>;
    const declared = String(record.questionType ?? record.type ?? "").trim().toLowerCase();
    if (declared && !(PRACTICE_QUESTION_TYPES as string[]).includes(declared)) {
      errors.push(`${label}: unsupported question type "${declared}" — it was not converted into an MCQ.`);
    }
    const question = normalizePracticeQuestion(
      { ...record, questionType: declared || fallbackType },
      questions.length,
    );
    if (!question) {
      errors.push(`${label}: could not be read as a question — give it its prompt and required fields.`);
      return;
    }
    questions.push(question);
    for (const issue of practiceQuestionIssues(question)) errors.push(`${label}: ${issue}`);

    const key = normalizePrompt(question.prompt);
    if (key) {
      const firstSeen = seenPrompts.get(key);
      if (firstSeen !== undefined) {
        warnings.push(`${label}: repeats Q${firstSeen}'s question text — remove one if it is a copy`);
      } else {
        seenPrompts.set(key, index + 1);
      }
    }
  });

  if (questions.length === 0 && errors.length === 0) errors.push(NOT_JSON);
  return { questions, errors, warnings, createReady: questions.length > 0 && errors.length === 0 };
};
