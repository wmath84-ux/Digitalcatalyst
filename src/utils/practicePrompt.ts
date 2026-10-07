// src/utils/practicePrompt.ts
//
// The "CMD" an admin copies into ANY AI tool (ChatGPT / Gemini / Claude …) to
// get a Brain practice set back in exactly the plain-text shape the importer in
// `src/components/admin/products/PracticeSetImportPanel.tsx` parses.
//
// This is the practice-set twin of `src/utils/experimentSpec.ts`: the prompt
// IS the contract. Every line below exists because of a real rule:
//
//   · the paste parser (`src/revision/engine/bulkParser.ts`) only reads
//     "1." numbered prompts, "A. " lettered options and one of its answer
//     markers — ✔/✓/√/*/[correct]/"Answer: B";
//   · the importer reads the explanation from an "Explanation:" line, and the
//     owner's rule is that an explanation is NEVER optional — a question
//     without its "why" is rejected at publish (utils/practiceSet.js);
//   · the topic and class lines are written as editable placeholders, so an
//     admin who just wants the standard CMD can copy it as-is, and one who
//     wants it for their own chapter replaces the two lines.
//
// Keep this in sync with `questionStyleLines()` / `systemPrompt()` in
// `src/revision/engine/aiGenerate.ts` when the question rules change there.

import { MAX_PRACTICE_QUESTIONS } from "../../utils/practiceSet.js";

/** How many questions the CMD asks for when the admin did not choose a number. */
export const PRACTICE_PROMPT_DEFAULT_COUNT = 10;

/** Common class / exam levels, offered as quick-fill buttons above the CMD. */
export const PRACTICE_PROMPT_LEVELS: string[] = [
  "Class 6–8",
  "Class 9–10",
  "Class 11–12",
  "JEE / NEET",
  "College / first year",
  "General",
];

/** The language the questions themselves are written in. */
export const PRACTICE_PROMPT_LANGUAGES: string[] = ["English", "Hinglish", "Hindi"];

/** The two editable slots the admin fills before copying. */
export const PRACTICE_PROMPT_TOPIC_PLACEHOLDER = '<your topic — edit this line, e.g. "Photosynthesis">';
export const PRACTICE_PROMPT_LEVEL_PLACEHOLDER = '<your class / level — edit this line, e.g. "Class 10 (CBSE)">';

/**
 * The worked example inside the CMD. It is also the parser's own test fixture:
 * whatever this example says, the importer must read back as ONE question with
 * four options, the second one marked and an explanation — see
 * `tests/adminBrainAiPromptContract.test.mjs`.
 */
export const PRACTICE_PROMPT_EXAMPLE = `1. What is 2 + 2?
A. 3
B. 4 ✓
C. 5
D. 6
Explanation: Adding 2 and 2 gives 4. A is one less than the sum and C, D are one and two more, so only B is correct.`;

/** The do/don't pills the panel shows next to the CMD. */
export const PRACTICE_PROMPT_RULES: string[] = [
  "Numbered questions: 1. 2. 3.",
  "Options on their own lines: A. B. C. D.",
  "✓ at the end of the correct option",
  "“Explanation:” line on EVERY question",
  "Plain text only — no tables, no markdown",
  "4 options per question, exactly one correct",
];

export interface PracticePromptOptions {
  /** The chapter / topic the questions must test, e.g. "Photosynthesis". */
  topic: string;
  /** Who it is for — class or exam, e.g. "Class 10 (CBSE)". */
  level?: string;
  /** How many questions to ask for (clamped to the set's own ceiling). */
  count?: number;
  /** Language of the questions: English | Hinglish | Hindi. */
  language?: string;
}

const clampCount = (value: unknown): number => {
  const count = Math.trunc(Number(value));
  if (!Number.isFinite(count) || count <= 0) return PRACTICE_PROMPT_DEFAULT_COUNT;
  return Math.min(count, MAX_PRACTICE_QUESTIONS);
};

/**
 * The prompt the admin copies into an AI tool. Reply for reply, the text the
 * model returns must paste straight into "Paste questions" and import: numbered
 * prompts, lettered options, a ✓ on the right answer and an explanation on
 * every question.
 */
export const buildPracticeAiPrompt = ({ topic, level, count, language }: PracticePromptOptions): string => {
  const subject = String(topic || "").trim() || PRACTICE_PROMPT_TOPIC_PLACEHOLDER;
  const klass = String(level || "").trim() || PRACTICE_PROMPT_LEVEL_PLACEHOLDER;
  const total = clampCount(count);
  const lang = String(language || "").trim() || "English";
  return `You are an expert exam setter for Indian school students. Write a multiple-choice (MCQ) practice set and reply in EXACTLY the format below, because my app copies your reply straight into its question importer.

CLASS / LEVEL: ${klass}
TOPIC: ${subject}
NUMBER OF QUESTIONS: ${total}
LANGUAGE OF THE QUESTIONS: ${lang}

WHAT TO WRITE
- Exactly ${total} questions on the topic above, at the level above. Mix easy, medium and hard; never ask the same fact twice.
- 4 options per question, lettered A. B. C. D. — exactly ONE correct, the other three believable but wrong. Never use "All of the above" or "None of the above".
- Keep options short (a word, number, formula or half-line), not paragraphs.
- Every question must have one unambiguous correct answer. Check the maths, units, symbols and spelling before answering — a wrong key is worse than one fewer question.

EXPLANATION — REQUIRED ON EVERY QUESTION (this is not optional)
- Every question must end with its own "Explanation:" line of 1–3 sentences: why the correct option is right, and (where it helps) why the most tempting wrong option is wrong.
- The app saves this line and shows it to the student after they answer. A question without it is rejected by the importer — so never skip it, not even for the easiest question.

REPLY FORMAT (strict)
- Plain text only: no tables, no markdown (no **bold**, no ## headings), no HTML, no code fences, no images.
- Number the questions 1. 2. 3. … and put each option on its own line, lettered exactly "A. ", "B. ", "C. ", "D. ".
- Mark the correct option by putting ✓ at the END of its line.
- Write the "Explanation:" line immediately after that question's four options.
- Nothing before question 1 and nothing after the last explanation. No greeting, no closing note, no "Answer:" lines — the ✓ already marks the answer.

EXAMPLE — copy this shape exactly
${PRACTICE_PROMPT_EXAMPLE}

Reply now with the ${total} questions and nothing else. Start directly with "1."`;
};
