// Validation for a fully completed AI-generated Revision test.
//
// Providers are instructed to return four-option MCQs with one valid answer
// and a teaching explanation. Only questions that satisfy that complete
// contract are returned. The server compares the resulting count with the
// requested count before finalising a generation reservation, so malformed,
// duplicate or partial provider output never consumes an allowance.

import { normalizeModelTypeTag } from "./questionTypeGuard.js";

const asRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const cleanDifficulty = (value, requestedDifficulty) => {
  const raw = String(value || "");
  if (["easy", "medium", "hard"].includes(raw)) return raw;
  return ["easy", "medium", "hard"].includes(requestedDifficulty)
    ? requestedDifficulty
    : "medium";
};

export const normalizeCompleteAiQuestions = (raw, requestedDifficulty = "medium") => {
  const root = asRecord(raw);
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(root.questions)
      ? root.questions
      : [];
  const questions = [];
  const prompts = new Set();

  for (const value of source) {
    const row = asRecord(value);
    const prompt = String(row.prompt ?? "").trim().slice(0, 600);
    const promptKey = prompt.toLocaleLowerCase();
    const explanation = String(row.explanation ?? "").trim().slice(0, 600);
    const rawOptions = Array.isArray(row.options) ? row.options : [];
    const options = rawOptions.map((option) => String(option ?? "").trim().slice(0, 300));
    const optionKeys = options.map((option) => option.toLocaleLowerCase());
    const correctIndex = Number(row.correctIndex);

    // A complete Revision MCQ has exactly four distinct, non-empty choices,
    // an explicit in-range integer answer and an explanation. Do not repair a
    // malformed provider response by clamping/defaulting its answer: doing so
    // could turn the wrong option into the recorded correct answer and charge
    // the learner for an unusable test.
    if (!prompt || prompts.has(promptKey) || !explanation) continue;
    if (options.length !== 4 || options.some((option) => !option)) continue;
    if (new Set(optionKeys).size !== options.length) continue;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) continue;

    // The model's self-declared question style ("theory"/"application") is
    // carried through so the deterministic question-type guard can verify the
    // batch against the learner's selected question type. Absent tags stay
    // absent — the guard falls back to its own heuristic for those.
    const typeTag = normalizeModelTypeTag(row.type ?? row.kind);

    prompts.add(promptKey);
    questions.push({
      prompt,
      options,
      correctIndex,
      explanation,
      difficulty: cleanDifficulty(row.difficulty, requestedDifficulty),
      ...(typeTag ? { type: typeTag } : {}),
    });
  }

  return questions;
};
