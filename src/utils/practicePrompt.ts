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
import type { BrainQuestionType } from "../types/myCourse";

/**
 * The eight types the Brain creation page offers, in selector order. (Labels
 * mirror `BRAIN_QUESTION_TYPE_LABELS` in src/types/myCourse.ts — this module
 * is imported straight by Node's strip-types test runs, so it cannot import
 * that TS file at runtime.)
 */
export const PRACTICE_QUESTION_TYPE_OPTIONS: Array<{ value: BrainQuestionType; label: string }> = [
  { value: "mcq", label: "MCQ" },
  { value: "fill_blank", label: "Fill in the Blank" },
  { value: "label_diagram", label: "Label the Diagram" },
  { value: "assertion_reason", label: "Assertion and Reason" },
  { value: "one_word", label: "One-Word / One-Line Answer" },
  { value: "match", label: "Match the Following" },
  { value: "drag_drop", label: "Drag and Drop" },
  { value: "hotspot", label: "Hotspot Questions" },
];

/** The do/don't pills shown next to the CMD for the structured (JSON) types. */
export const PRACTICE_PROMPT_JSON_RULES: string[] = [
  "Reply with strict JSON only — no prose, no markdown fences",
  "One object per question, with its \"questionType\"",
  "“explanation” on EVERY question",
  "Exactly the fields shown — coordinates are % of the image (0–100)",
];

/** The rule pills for the selected type (plain-text rules for MCQ). */
export const practicePromptRulesFor = (questionType?: string): string[] =>
  !questionType || questionType === "mcq" ? PRACTICE_PROMPT_RULES : PRACTICE_PROMPT_JSON_RULES;

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

const EXPLANATION_REQUIRED = `EXPLANATION — REQUIRED ON EVERY QUESTION (this is not optional)
- Every question must end with its own "Explanation:" line of 1–3 sentences: why the correct option is right, and (where it helps) why the most tempting wrong option is wrong.
- The app saves this line and shows it to the student after they answer. A question without it is rejected by the importer — so never skip it, not even for the easiest question.`;

const EXPLANATION_OPTIONAL = `EXPLANATION — ADD ON EVERY QUESTION (recommended)
- Add an "Explanation:" line of 1–3 sentences after each question's options: why the correct option is right, and (where it helps) why the most tempting wrong option is wrong.
- The app shows this line to the student after they answer. It is strongly recommended, but a question without it is still imported.`;

export interface PracticePromptOptions {
  /** The chapter / topic the questions must test, e.g. "Photosynthesis". */
  topic: string;
  /** Who it is for — class or exam, e.g. "Class 10 (CBSE)". */
  level?: string;
  /** How many questions to ask for (clamped to the set's own ceiling). */
  count?: number;
  /** Language of the questions: English | Hinglish | Hindi. */
  language?: string;
  /**
   * Which question type to ask for. "mcq" (or omitted) keeps the established
   * plain-text CMD byte-for-byte; every other type gets a strict-JSON CMD
   * whose schema is exactly what `parseTypedPracticeImport` reads back.
   */
  questionType?: BrainQuestionType | string;
  /**
   * Whether the explanation line is demanded. The admin set requires it (the
   * publish rule refuses a set without one), so the default is "required". The
   * learner Bulk Import accepts questions without one, so it asks for it as a
   * recommendation and the prompt says so.
   */
  explanation?: "required" | "optional";
}

const clampCount = (value: unknown): number => {
  const count = Math.trunc(Number(value));
  if (!Number.isFinite(count) || count <= 0) return PRACTICE_PROMPT_DEFAULT_COUNT;
  return Math.min(count, MAX_PRACTICE_QUESTIONS);
};

/** The per-type JSON schema + example the structured CMDs prescribe. */
const TYPED_SCHEMAS: Record<string, { shape: string; example: string; rules: string }> = {
  fill_blank: {
    shape: `{ "questionType": "fill_blank", "prompt": "The process by which plants make food is called ___.", "blankAnswers": [["photosynthesis"]], "explanation": "…", "difficulty": "easy", "topic": "…" }`,
    example: `{ "questionType": "fill_blank", "prompt": "Water is made of hydrogen and ___.", "blankAnswers": [["oxygen", "O2"]], "explanation": "A water molecule is H2O — two hydrogen atoms and one oxygen atom.", "difficulty": "easy", "topic": "Matter" }`,
    rules: `- Put each blank in the prompt as ___ (three underscores) and give one "blankAnswers" list per blank, in order.\n- The first answer in each list is the main answer; add accepted spellings/variants after it.`,
  },
  one_word: {
    shape: `{ "questionType": "one_word", "prompt": "…", "acceptedAnswers": ["…"], "explanation": "…", "difficulty": "easy", "topic": "…" }`,
    example: `{ "questionType": "one_word", "prompt": "What is the SI unit of force?", "acceptedAnswers": ["newton", "N"], "explanation": "Force is measured in newtons, named after Isaac Newton.", "difficulty": "easy", "topic": "Force" }`,
    rules: `- The answer must be one word or one short line. The first accepted answer is the main one; add real variants (abbreviations, spellings) after it.`,
  },
  assertion_reason: {
    shape: `{ "questionType": "assertion_reason", "assertion": "…", "reason": "…", "correctIndex": 0, "explanation": "…", "difficulty": "medium", "topic": "…" }`,
    example: `{ "questionType": "assertion_reason", "assertion": "Ice floats on water.", "reason": "Ice is less dense than liquid water.", "correctIndex": 0, "explanation": "Both are true, and the lower density of ice is exactly why it floats.", "difficulty": "medium", "topic": "Matter" }`,
    rules: `- "correctIndex" uses this fixed convention: 0 = both true and the Reason correctly explains the Assertion; 1 = both true but the Reason does not explain the Assertion; 2 = Assertion true, Reason false; 3 = Assertion false, Reason true.`,
  },
  match: {
    shape: `{ "questionType": "match", "prompt": "Match the following.", "matchPairs": [{ "left": "…", "right": "…" }], "explanation": "…", "difficulty": "medium", "topic": "…" }`,
    example: `{ "questionType": "match", "prompt": "Match the organ to its function.", "matchPairs": [{ "left": "Heart", "right": "Pumps blood" }, { "left": "Lungs", "right": "Exchange gases" }, { "left": "Liver", "right": "Produces bile" }], "explanation": "Each organ has one primary job in the list.", "difficulty": "medium", "topic": "Human body" }`,
    rules: `- Give 3–6 pairs. Every left item must have exactly one right partner, and no two pairs may share a left item.`,
  },
  drag_drop: {
    shape: `{ "questionType": "drag_drop", "prompt": "…", "dragItems": ["…"], "dragTargets": [{ "label": "…", "answer": "…" }], "explanation": "…", "difficulty": "medium", "topic": "…" }`,
    example: `{ "questionType": "drag_drop", "prompt": "Drop each gas into the jar where it collects.", "dragItems": ["Oxygen", "Carbon dioxide", "Hydrogen"], "dragTargets": [{ "label": "Jar A (from photosynthesis)", "answer": "Oxygen" }, { "label": "Jar B (from respiration)", "answer": "Carbon dioxide" }], "explanation": "Photosynthesis releases oxygen; respiration releases carbon dioxide.", "difficulty": "medium", "topic": "Gases" }`,
    rules: `- Every target's "answer" must appear word-for-word in "dragItems". You may add 1–2 extra distractor items that belong nowhere.`,
  },
  label_diagram: {
    shape: `{ "questionType": "label_diagram", "prompt": "Label the parts of …", "labelTargets": [{ "x": 50, "y": 40, "label": "…" }], "explanation": "…", "difficulty": "medium", "topic": "…" }`,
    example: `{ "questionType": "label_diagram", "prompt": "Label the parts of a plant cell.", "labelTargets": [{ "x": 50, "y": 30, "label": "Nucleus" }, { "x": 25, "y": 65, "label": "Cell wall" }], "explanation": "The nucleus controls the cell; the wall gives it shape.", "difficulty": "medium", "topic": "Cells" }`,
    rules: `- Coordinates are percentages of the diagram's width (x) and height (y), 0–100. Also add one "imagePrompt" field per question describing the diagram to draw, so the learner can attach a matching image — the app never invents the image itself.`,
  },
  hotspot: {
    shape: `{ "questionType": "hotspot", "prompt": "…", "hotspots": [{ "id": "s1", "x": 50, "y": 40, "r": 10 }], "correctHotspotIds": ["s1"], "explanation": "…", "difficulty": "medium", "topic": "…" }`,
    example: `{ "questionType": "hotspot", "prompt": "Tap the heart in the diagram.", "hotspots": [{ "id": "s1", "x": 52, "y": 38, "r": 12 }, { "id": "s2", "x": 30, "y": 60, "r": 10 }], "correctHotspotIds": ["s1"], "explanation": "The heart sits slightly left of the centre of the chest.", "difficulty": "medium", "topic": "Human body" }`,
    rules: `- Coordinates are percentages of the image's width (x) and height (y), 0–100; "r" is the tap radius in %. Give each hotspot a short id and list the correct one(s) in "correctHotspotIds". Also add one "imagePrompt" field describing the picture, so the learner can attach a matching image.`,
  },
};

const buildTypedPracticeAiPrompt = (
  questionType: string,
  { topic, level, count, language, explanation = "required" }: PracticePromptOptions,
): string => {
  const subject = String(topic || "").trim() || PRACTICE_PROMPT_TOPIC_PLACEHOLDER;
  const klass = String(level || "").trim() || PRACTICE_PROMPT_LEVEL_PLACEHOLDER;
  const total = clampCount(count);
  const lang = String(language || "").trim() || "English";
  const label =
    PRACTICE_QUESTION_TYPE_OPTIONS.find((option) => option.value === questionType)?.label || questionType;
  const schema = TYPED_SCHEMAS[questionType];
  return `You are an expert exam setter for Indian school students. Write a ${label} practice set and reply with STRICT JSON in exactly the shape below, because my app reads your reply with a machine parser.

CLASS / LEVEL: ${klass}
TOPIC: ${subject}
NUMBER OF QUESTIONS: ${total}
LANGUAGE OF THE QUESTIONS: ${lang}

WHAT TO WRITE
- Exactly ${total} questions of type "${questionType}" on the topic above, at the level above. Mix easy, medium and hard; never ask the same fact twice.
- Every question must have one unambiguous correct answer. Check the facts, maths, units and spelling before answering — a wrong key is worse than one fewer question.
${schema ? schema.rules : ""}

${explanation === "optional" ? EXPLANATION_OPTIONAL : EXPLANATION_REQUIRED}

REPLY FORMAT (strict)
- Reply with ONE JSON object and nothing else: no prose, no markdown, no code fences.
- Shape: { "questions": [ <one object per question> ] }
- Every question object has exactly these fields: ${schema ? schema.shape : ""}
- "difficulty" is one of "easy", "medium", "hard". "topic" repeats the topic above (or a sub-topic).

EXAMPLE — copy this shape exactly
${schema ? schema.example : ""}

Reply now with the JSON for ${total} questions and nothing else.`;
};

/**
 * The prompt the admin copies into an AI tool. Reply for reply, the text the
 * model returns must paste straight into "Paste questions" and import: numbered
 * prompts, lettered options, a ✓ on the right answer and an explanation on
 * every question.
 */
export const buildPracticeAiPrompt = (options: PracticePromptOptions): string => {
  const { topic, level, count, language, explanation = "required", questionType } = options;
  if (questionType && questionType !== "mcq" && TYPED_SCHEMAS[questionType]) {
    return buildTypedPracticeAiPrompt(questionType, options);
  }
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

${explanation === "optional" ? EXPLANATION_OPTIONAL : EXPLANATION_REQUIRED}

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
