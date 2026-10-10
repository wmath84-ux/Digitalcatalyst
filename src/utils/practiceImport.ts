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
  practiceQuestionIssues,
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
};
