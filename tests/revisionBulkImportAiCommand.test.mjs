// tests/revisionBulkImportAiCommand.test.mjs
//
// The learner Bulk Import page's "Copy AI command". The command is built from the
// SAME shared practice prompt the admin uses (src/utils/practicePrompt.ts), and
// the reply is read by the SAME parser the page uses (bulkParser.ts). These tests
// pin that the two agree, so the command can never ask for a format the importer
// does not read.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PRACTICE_PROMPT_EXAMPLE,
  PRACTICE_PROMPT_LEVEL_PLACEHOLDER,
  PRACTICE_PROMPT_TOPIC_PLACEHOLDER,
  buildPracticeAiPrompt,
} from "../src/utils/practicePrompt.ts";
import { parseQuestionTextDetailed, stripCodeFenceLines } from "../src/revision/engine/bulkParser.ts";
import { MAX_PRACTICE_QUESTIONS } from "../utils/practiceSet.js";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const page = read("src/revision/pages/BulkImportPage.tsx");

test("the learner command carries the class, topic, count and language the learner typed", () => {
  const prompt = buildPracticeAiPrompt({
    level: "Class 10 (CBSE)",
    topic: "Photosynthesis",
    count: 7,
    language: "Hindi",
    explanation: "optional",
  });
  assert.match(prompt, /CLASS \/ LEVEL: Class 10 \(CBSE\)/);
  assert.match(prompt, /TOPIC: Photosynthesis/);
  assert.match(prompt, /NUMBER OF QUESTIONS: 7/);
  assert.match(prompt, /LANGUAGE OF THE QUESTIONS: Hindi/);
  assert.match(prompt, /Exactly 7 questions/);
});

test("nothing is hardcoded: empty fields fall back to editable placeholders, count to 10, language to English", () => {
  const prompt = buildPracticeAiPrompt({ explanation: "optional" });
  assert.ok(prompt.includes(PRACTICE_PROMPT_LEVEL_PLACEHOLDER));
  assert.ok(prompt.includes(PRACTICE_PROMPT_TOPIC_PLACEHOLDER));
  assert.match(prompt, /NUMBER OF QUESTIONS: 10/);
  assert.match(prompt, /LANGUAGE OF THE QUESTIONS: English/);
  assert.doesNotMatch(prompt, /CLASS \/ LEVEL: Class 10/);
});

test("the count is clamped to the set's own ceiling and a nonsense count falls back to the default", () => {
  assert.match(buildPracticeAiPrompt({ topic: "x", count: 100000 }), new RegExp(`NUMBER OF QUESTIONS: ${MAX_PRACTICE_QUESTIONS}\\b`));
  assert.match(buildPracticeAiPrompt({ topic: "x", count: Number.NaN }), /NUMBER OF QUESTIONS: 10/);
});

test("the learner command says explanations are recommended, not that the importer rejects their absence", () => {
  const learner = buildPracticeAiPrompt({ topic: "x", explanation: "optional" });
  assert.doesNotMatch(learner, /rejected by the importer/);
  assert.doesNotMatch(learner, /REQUIRED ON EVERY QUESTION/);
  assert.match(learner, /Explanation:/);
});

test("the admin command keeps its required-explanation wording (default)", () => {
  const admin = buildPracticeAiPrompt({ topic: "x" });
  assert.match(admin, /REQUIRED ON EVERY QUESTION/);
  assert.match(admin, /rejected by the importer/);
});

test("both commands demand the import-compatible shape: numbered, lettered, ✓, plain text, no fences", () => {
  for (const explanation of ["optional", "required"]) {
    const prompt = buildPracticeAiPrompt({ topic: "x", explanation });
    assert.match(prompt, /Number the questions 1\. 2\. 3/);
    assert.match(prompt, /lettered exactly "A\. ", "B\. ", "C\. ", "D\. "/);
    assert.match(prompt, /putting ✓ at the END of its line/);
    assert.match(prompt, /Plain text only/);
    assert.match(prompt, /no code fences/);
  }
});

test("the worked example in the command is read back by the page's parser as one question with ✓ and explanation", () => {
  const { questions, problems } = parseQuestionTextDetailed(PRACTICE_PROMPT_EXAMPLE);
  assert.equal(problems.length, 0);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].options.length, 4);
  assert.equal(questions[0].correctIndex, 1);
  assert.match(questions[0].explanation, /Adding 2 and 2 gives 4/);
});

test("a representative AI reply wrapped in code fences parses fully", () => {
  const reply = [
    "```text",
    "1. What is the powerhouse of the cell?",
    "A. Nucleus",
    "B. Mitochondria ✓",
    "C. Ribosome",
    "D. Golgi body",
    "Explanation: Mitochondria make ATP, the cell's energy currency.",
    "",
    "2. Which gas do plants absorb?",
    "a) Oxygen",
    "b) Carbon dioxide",
    "c) Nitrogen",
    "d) Hydrogen",
    "Answer: b",
    "```",
  ].join("\n");
  const { questions, problems } = parseQuestionTextDetailed(stripCodeFenceLines(reply));
  assert.equal(problems.length, 0, JSON.stringify(problems));
  assert.equal(questions.length, 2);
  assert.equal(questions[0].correctIndex, 1);
  assert.match(questions[0].explanation, /ATP/);
  assert.equal(questions[1].correctIndex, 1);
  assert.equal(questions[1].explanation, "", "the fence must not leak into the explanation");
});

test("a malformed block is reported with the line it starts on, and the other questions still parse", () => {
  const text = [
    "1. Good question?",
    "A. Yes",
    "B. No ✓",
    "",
    "2. Broken question with one option?",
    "A. Only option",
    "",
    "3. Another good one?",
    "A. One",
    "B. Two ✓",
  ].join("\n");
  const { questions, problems } = parseQuestionTextDetailed(text);
  assert.equal(questions.length, 2);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].line, 5);
  assert.match(problems[0].message, /1 option line/);
});

test("fence lines keep the line numbers of the pasted text", () => {
  const text = ["```", "1. Q?", "A. one", "B. two"].join("\n");
  const { problems } = parseQuestionTextDetailed(stripCodeFenceLines(text));
  // Block starts on line 2 of the pasted text (line 1 is the fence): it is a
  // valid question with a missing answer, so no problem, but numbering still holds.
  assert.equal(problems.length, 0);
  const broken = ["```", "1. Q?", "A. only"].join("\n");
  const second = parseQuestionTextDetailed(stripCodeFenceLines(broken));
  assert.equal(second.problems[0].line, 2);
});

test("the page wires the command to the shared prompt, the shared parser and a copy fallback", () => {
  assert.match(page, /buildPracticeAiPrompt\(/);
  assert.match(page, /explanation: "optional"/);
  assert.match(page, /parseQuestionTextDetailed\(stripCodeFenceLines\(text\)\)/);
  assert.match(page, /navigator\.clipboard\?\.writeText/);
  assert.match(page, /document\.execCommand\("copy"\)/);
  assert.match(page, /Copy AI command/);
  assert.match(page, /data-rev-import-paste/);
  assert.match(page, /data-rev-import-problems/);
  assert.match(page, /role=\{aiCopy\.tone === "err" \? "alert" : "status"\}/);
  // The manual flow's existing identifiers stay untouched.
  assert.match(page, /aria-label="Paste questions and answers"/);
  assert.match(page, /data-rev-import-chapter/);
});
