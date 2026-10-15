// tests/brainQuestionTypesModel.test.mjs
//
// The eight-type Brain question model, proven at the shared-rule level every
// surface reads (utils/practiceSet.js is the single rule the player, the
// composers, the library editor and the admin gate all share):
//
//   · legacy questions without a `questionType` load as MCQs, unchanged;
//   · a type the app does not know is NEVER silently rewritten into an MCQ —
//     it survives as a record and validation names it;
//   · every type has its own required fields, and an explanation is required
//     on ALL of them;
//   · every type scores its own response shape, with typed answers checked
//     case/whitespace-insensitively against accepted variants;
//   · the AI workflow matches: MCQs keep the plain-text CMD, structured types
//     get a strict-JSON CMD whose schema is exactly what the typed parser
//     reads back; the parser names per-question problems and drops nothing
//     silently;
//   · a typed set survives the Study Library shelf round trip (place → list)
//     with its types, mappings, image refs and coordinates intact.

import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSERTION_REASON_CHOICES,
  PRACTICE_QUESTION_TYPES,
  countPromptBlanks,
  evaluatePracticeAnswer,
  normalizePracticeQuestion,
  normalizePracticeQuestions,
  practiceAnswerSummary,
  practiceQuestionAnswerable,
  practiceQuestionIssues,
} from "../utils/practiceSet.js";
import {
  placeSelfPracticeSet,
  selfPracticeEmptyQuestion,
  selfPracticeEmptyQuestionOfType,
  selfPracticeSetsFromCourses,
} from "../utils/selfPracticeSets.js";
import { parsePracticeImport, parseTypedPracticeImport } from "../src/utils/practiceImport.ts";
import {
  PRACTICE_QUESTION_TYPE_OPTIONS,
  buildPracticeAiPrompt,
  practicePromptRulesFor,
} from "../src/utils/practicePrompt.ts";

const factories = () => {
  let n = 0;
  return {
    createCourse: (uid, title) => ({
      id: `course_${++n}`, uid, title, description: "", coverImage: "", modules: [],
      createdAt: 1, updatedAt: 1, schemaVersion: 1,
    }),
    createModule: (title) => ({ id: `mod_${++n}`, title, description: "", resources: [], modules: [], createdAt: 1, updatedAt: 1 }),
    createResource: (type) => ({ id: `res_${++n}`, name: "", type, url: "", description: "", source: "link", createdAt: 1, updatedAt: 1 }),
  };
};

/* ── the roster ──────────────────────────────────────────────────────────── */

test("the roster is the eight brief types, and the selector mirrors it", () => {
  assert.deepEqual(PRACTICE_QUESTION_TYPES, [
    "mcq", "fill_blank", "label_diagram", "assertion_reason",
    "one_word", "match", "drag_drop", "hotspot",
  ]);
  assert.deepEqual(
    PRACTICE_QUESTION_TYPE_OPTIONS.map((option) => option.value),
    PRACTICE_QUESTION_TYPES,
  );
  // The one Assertion-and-Reason convention, pinned verbatim (prompt, parser,
  // editor, data and player all read this array).
  assert.equal(ASSERTION_REASON_CHOICES.length, 4);
  assert.match(ASSERTION_REASON_CHOICES[0], /Both Assertion and Reason are true, and the Reason correctly explains/);
  assert.match(ASSERTION_REASON_CHOICES[3], /The Assertion is false, but the Reason is true/);
});

/* ── legacy migration ────────────────────────────────────────────────────── */

test("a legacy question without a type loads as an MCQ, fields untouched", () => {
  const legacy = {
    id: "old-1",
    prompt: "What is 2 + 2?",
    options: ["3", "4"],
    correctIndex: 1,
    explanation: "Adding gives 4.",
    difficulty: "easy",
    topic: "Arithmetic",
  };
  const normalized = normalizePracticeQuestion(legacy, 0);
  assert.equal(normalized.questionType, "mcq");
  assert.equal(normalized.prompt, legacy.prompt);
  assert.deepEqual(normalized.options, ["3", "4"]);
  assert.equal(normalized.correctIndex, 1);
  assert.equal(normalized.explanation, "Adding gives 4.");
  assert.deepEqual(practiceQuestionIssues(normalized), []);
  assert.equal(evaluatePracticeAnswer(normalized, 1), "correct");
  assert.equal(evaluatePracticeAnswer(normalized, 0), "wrong");
  assert.equal(evaluatePracticeAnswer(normalized, undefined), "unanswered");
});

test("an unknown type is preserved and named — never converted into an MCQ", () => {
  const alien = normalizePracticeQuestion(
    { id: "x1", questionType: "essay", prompt: "Discuss.", explanation: "Why." },
    0,
  );
  assert.equal(alien.questionType, "essay");
  assert.deepEqual(alien.options, []);
  assert.deepEqual(practiceQuestionIssues(alien), ["unsupported question type"]);
  assert.equal(practiceQuestionAnswerable(alien), false);
  assert.equal(evaluatePracticeAnswer(alien, 0), "unanswered");
});

/* ── per-type validation ─────────────────────────────────────────────────── */

test("the explanation is required on every one of the eight types", () => {
  const complete = [
    { questionType: "mcq", prompt: "Q?", options: ["a", "b"], correctIndex: 0 },
    { questionType: "fill_blank", prompt: "Water is ___ .", blankAnswers: [["wet"]] },
    { questionType: "label_diagram", prompt: "Label it", imageUrl: "https://x/y.png", labelTargets: [{ id: "t1", x: 10, y: 20, label: "Top" }] },
    { questionType: "assertion_reason", assertion: "A", reason: "R", correctIndex: 0 },
    { questionType: "one_word", prompt: "Unit of force?", acceptedAnswers: ["newton"] },
    { questionType: "match", prompt: "Match", matchPairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }] },
    { questionType: "drag_drop", prompt: "Drag", dragItems: ["x"], dragTargets: [{ id: "t1", label: "Box", answer: "x" }] },
    { questionType: "hotspot", prompt: "Tap it", imageUrl: "https://x/y.png", hotspots: [{ id: "s1", x: 5, y: 5, r: 8 }], correctHotspotIds: ["s1"] },
  ];
  for (const raw of complete) {
    const without = normalizePracticeQuestion({ ...raw, explanation: "" }, 0);
    assert.deepEqual(practiceQuestionIssues(without), ["no explanation"], `${raw.questionType} must refuse a missing explanation`);
    const withWhy = normalizePracticeQuestion({ ...raw, explanation: "Because." }, 0);
    assert.deepEqual(practiceQuestionIssues(withWhy), [], `${raw.questionType} is complete with its explanation`);
    assert.equal(practiceQuestionAnswerable(withWhy), true, `${raw.questionType} is playable`);
  }
});

test("each type names its own missing pieces", () => {
  assert.deepEqual(
    practiceQuestionIssues(normalizePracticeQuestion({ questionType: "fill_blank", prompt: "No blank here", blankAnswers: [], explanation: "e" }, 0)),
    ["no blank (___) in the question"],
  );
  assert.equal(countPromptBlanks("___ and ____ and __"), 2);
  assert.match(
    practiceQuestionIssues(normalizePracticeQuestion({ questionType: "fill_blank", prompt: "A ___ B ___", blankAnswers: [["x"]], explanation: "e" }, 0)).join(" "),
    /blank 2 has no answer/,
  );
  assert.match(
    practiceQuestionIssues(normalizePracticeQuestion({ questionType: "label_diagram", prompt: "L", labelTargets: [{ id: "t", x: 1, y: 1, label: "a" }], explanation: "e" }, 0)).join(" "),
    /diagram image missing/,
    "a diagram without its image is incomplete, never playable",
  );
  assert.match(
    practiceQuestionIssues(normalizePracticeQuestion({ questionType: "hotspot", prompt: "H", imageUrl: "u", hotspots: [{ id: "s", x: 1, y: 1, r: 5 }], correctHotspotIds: [], explanation: "e" }, 0)).join(" "),
    /mark the correct hotspot/,
  );
  assert.match(
    practiceQuestionIssues(normalizePracticeQuestion({ questionType: "drag_drop", prompt: "D", dragItems: ["a"], dragTargets: [{ id: "t", label: "Box", answer: "zzz" }], explanation: "e" }, 0)).join(" "),
    /not in the items/,
  );
  assert.match(
    practiceQuestionIssues(normalizePracticeQuestion({ questionType: "match", prompt: "M", matchPairs: [{ left: "a", right: "1" }], explanation: "e" }, 0)).join(" "),
    /at least 2 pairs/,
  );
});

/* ── scoring per type ────────────────────────────────────────────────────── */

test("typed answers score case/whitespace-insensitively against accepted variants", () => {
  const fill = normalizePracticeQuestion({
    questionType: "fill_blank",
    prompt: "Plants make food by ___ and release ___.",
    blankAnswers: [["photosynthesis"], ["oxygen", "O2"]],
    explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(fill, ["  PhotoSynthesis ", " o2"]), "correct");
  assert.equal(evaluatePracticeAnswer(fill, ["photosynthesis", "nitrogen"]), "wrong");
  assert.equal(evaluatePracticeAnswer(fill, []), "wrong", "an explicitly submitted empty attempt scores wrong");
  assert.equal(evaluatePracticeAnswer(fill, undefined), "unanswered");

  const word = normalizePracticeQuestion({
    questionType: "one_word", prompt: "SI unit of force?", acceptedAnswers: ["newton", "N"], explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(word, "  NEWTON "), "correct");
  assert.equal(evaluatePracticeAnswer(word, "joule"), "wrong");
  assert.equal(evaluatePracticeAnswer(word, "   "), "wrong");
});

test("pairing, placement and tapping score their own response shapes", () => {
  const match = normalizePracticeQuestion({
    questionType: "match", prompt: "Match",
    matchPairs: [{ left: "H2O", right: "Water" }, { left: "CO2", right: "Carbon dioxide" }],
    explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(match, { H2O: "water", CO2: "Carbon dioxide" }), "correct");
  assert.equal(evaluatePracticeAnswer(match, { H2O: "Carbon dioxide", CO2: "Water" }), "wrong");

  const drag = normalizePracticeQuestion({
    questionType: "drag_drop", prompt: "Sort",
    dragItems: ["Metal", "Wood"],
    dragTargets: [{ id: "t1", label: "Conducts", answer: "Metal" }, { id: "t2", label: "Insulates", answer: "Wood" }],
    explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(drag, { t1: "Metal", t2: "Wood" }), "correct");
  assert.equal(evaluatePracticeAnswer(drag, { t1: "Wood", t2: "Metal" }), "wrong");

  const label = normalizePracticeQuestion({
    questionType: "label_diagram", prompt: "Label", imageUrl: "https://x/y.png",
    labelTargets: [{ id: "a", x: 10, y: 10, label: "Root" }, { id: "b", x: 90, y: 90, label: "Leaf" }],
    labelOptions: ["Root", "Leaf"],
    explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(label, { a: "Root", b: "Leaf" }), "correct");
  assert.equal(evaluatePracticeAnswer(label, { a: "Leaf", b: "Root" }), "wrong");

  const spot = normalizePracticeQuestion({
    questionType: "hotspot", prompt: "Tap the heart", imageUrl: "https://x/y.png",
    hotspots: [{ id: "heart", x: 50, y: 40, r: 10 }, { id: "lung", x: 20, y: 40, r: 10 }],
    correctHotspotIds: ["heart"],
    explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(spot, "heart"), "correct");
  assert.equal(evaluatePracticeAnswer(spot, "lung"), "wrong");
  assert.equal(evaluatePracticeAnswer(spot, "__miss__"), "wrong");

  const ar = normalizePracticeQuestion({
    questionType: "assertion_reason", assertion: "Ice floats.", reason: "Ice is less dense.",
    correctIndex: 0, explanation: "e",
  }, 0);
  assert.equal(evaluatePracticeAnswer(ar, 0), "correct");
  assert.equal(evaluatePracticeAnswer(ar, 2), "wrong");
  const summary = practiceAnswerSummary(ar, 2);
  assert.equal(summary.correct, ASSERTION_REASON_CHOICES[0]);
  assert.equal(summary.yours, ASSERTION_REASON_CHOICES[2]);
});

/* ── empty drafts for the editors ────────────────────────────────────────── */

test("every type's empty draft carries only its own fields, and all start incomplete", () => {
  for (const type of PRACTICE_QUESTION_TYPES) {
    const draft = selfPracticeEmptyQuestionOfType(type, 0);
    assert.equal(draft.questionType, type);
    assert.ok(practiceQuestionIssues(draft).length > 0, `${type} must not start ready`);
    assert.ok(draft.id, `${type} draft has an id`);
  }
  const mcq = selfPracticeEmptyQuestion(0);
  assert.equal(mcq.questionType, "mcq");
  assert.deepEqual(mcq.options, ["", "", "", ""]);
  const fill = selfPracticeEmptyQuestionOfType("fill_blank", 0);
  assert.deepEqual(fill.blankAnswers, [[]], "one empty answer slot per blank to fill");
  const match = selfPracticeEmptyQuestionOfType("match", 0);
  assert.equal(match.matchPairs.length, 2);
  const spot = selfPracticeEmptyQuestionOfType("hotspot", 0);
  assert.deepEqual(spot.hotspots, []);
  assert.equal(spot.imageUrl, "");
});

/* ── AI prompts ──────────────────────────────────────────────────────────── */

test("the MCQ CMD keeps the plain-text contract the legacy parser reads", () => {
  const cmd = buildPracticeAiPrompt({ topic: "Optics", level: "Class 10", count: 5, language: "English" });
  assert.match(cmd, /TOPIC: Optics/);
  assert.match(cmd, /EXPLANATION/);
  // No strict-JSON detour for MCQs: the numbered plain-text shape stays.
  assert.match(cmd, /1\. What is 2 \+ 2\?/);
  assert.ok(!/Reply with ONE JSON object/.test(cmd));
  assert.deepEqual(practicePromptRulesFor("mcq"), practicePromptRulesFor(undefined));
});

test("structured types get a strict-JSON CMD whose fields the parser reads back", () => {
  for (const type of PRACTICE_QUESTION_TYPES.filter((entry) => entry !== "mcq")) {
    const cmd = buildPracticeAiPrompt({ topic: "Cells", level: "Class 9", count: 3, language: "Hindi", questionType: type });
    assert.match(cmd, /STRICT JSON/, `${type} CMD demands strict JSON`);
    assert.match(cmd, new RegExp(`"questionType": "${type}"`), `${type} CMD names its type`);
    assert.match(cmd, /"explanation"/, `${type} CMD carries the explanation field`);
    assert.ok(cmd.includes("NUMBER OF QUESTIONS: 3"), `${type} CMD carries the count`);
  }
  const diagram = buildPracticeAiPrompt({ topic: "Plant", questionType: "label_diagram" });
  assert.match(diagram, /"imagePrompt"/, "image types must ask the AI to describe the picture");
  const hotspot = buildPracticeAiPrompt({ topic: "Body", questionType: "hotspot" });
  assert.match(hotspot, /"imagePrompt"/);
  assert.match(hotspot, /"correctHotspotIds"/);
  const ar = buildPracticeAiPrompt({ topic: "Matter", questionType: "assertion_reason" });
  assert.match(ar, /"assertion"/);
  assert.match(ar, /"reason"/);
});

/* ── typed parsing ───────────────────────────────────────────────────────── */

test("a typed AI reply parses the whole batch, each question with its own type", () => {
  const reply = JSON.stringify({
    questions: [
      { questionType: "fill_blank", prompt: "Water is made of hydrogen and ___.", blankAnswers: [["oxygen"]], explanation: "H2O.", difficulty: "easy", topic: "Matter" },
      { questionType: "one_word", prompt: "SI unit of force?", acceptedAnswers: ["newton"], explanation: "Named for Newton.", difficulty: "easy", topic: "Force" },
      { questionType: "assertion_reason", assertion: "Ice floats on water.", reason: "Ice is less dense than water.", correctIndex: 0, explanation: "Both true; density explains it.", difficulty: "medium", topic: "Matter" },
      { questionType: "match", prompt: "Match the symbols", matchPairs: [{ left: "H", right: "Hydrogen" }, { left: "O", right: "Oxygen" }], explanation: "Chemical symbols.", difficulty: "easy", topic: "Matter" },
    ],
  });
  const result = parseTypedPracticeImport(reply, "mcq");
  assert.deepEqual(result.errors, []);
  assert.equal(result.questions.length, 4);
  assert.deepEqual(
    result.questions.map((question) => question.questionType),
    ["fill_blank", "one_word", "assertion_reason", "match"],
  );
  assert.equal(result.createReady, true);
  // Every parsed question is complete under the shared rule.
  for (const question of result.questions) assert.deepEqual(practiceQuestionIssues(question), []);
});

test("the typed parser refuses conversion and names problems per question", () => {
  const reply = JSON.stringify([
    { questionType: "essay", prompt: "Discuss the causes.", explanation: "e" },
    { questionType: "one_word", prompt: "Unit of force?", explanation: "no answer key" },
    { prompt: "No type declared — the learner's choice applies", acceptedAnswers: ["x"], explanation: "e" },
  ]);
  const result = parseTypedPracticeImport(reply, "one_word");
  assert.equal(result.createReady, false);
  assert.match(result.errors.join("\n"), /Q1: unsupported question type "essay" — it was not converted into an MCQ/);
  assert.match(result.errors.join("\n"), /Q2: no expected answer/);
  // The untyped question takes the learner-selected fallback, not a silent MCQ.
  assert.equal(result.questions[2].questionType, "one_word");
  // Nothing was silently dropped: all three entries are accounted for.
  assert.equal(result.questions.length, 3);
  assert.equal(result.questions[0].questionType, "essay");

  const empty = parseTypedPracticeImport("   ", "mcq");
  assert.equal(empty.createReady, false);
  assert.equal(empty.questions.length, 0);
  assert.ok(empty.errors.length > 0);

  const notJson = parseTypedPracticeImport("1. Plain text is not the typed format", "match");
  assert.equal(notJson.createReady, false);
  assert.match(notJson.errors.join(" "), /JSON/);
});

test("the legacy plain-text parser is untouched by the typed path", () => {
  const result = parsePracticeImport(`1. What is 2 + 2?
A. 3
B. 4 ✓
C. 5
D. 6
Explanation: Adding 2 and 2 gives 4.`);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].questionType, undefined);
  assert.equal(result.createReady, true);
  assert.deepEqual(result.errors, []);
});

/* ── shelf round trip ────────────────────────────────────────────────────── */

test("a typed set survives the Study Library shelf round trip intact", () => {
  const questions = [
    normalizePracticeQuestion({
      questionType: "hotspot", prompt: "Tap the heart", imageUrl: "https://cdn/heart.png",
      hotspots: [{ id: "h", x: 52, y: 38, r: 12 }], correctHotspotIds: ["h"],
      explanation: "Centre-left of the chest.", difficulty: "medium", topic: "Body",
    }, 0),
    normalizePracticeQuestion({
      questionType: "match", prompt: "Match", matchPairs: [{ left: "a", right: "1" }, { left: "b", right: "2" }],
      explanation: "Pairs.", difficulty: "easy", topic: "T",
    }, 1),
    { id: "legacy", prompt: "Old MCQ?", options: ["x", "y"], correctIndex: 1, explanation: "Old.", difficulty: "easy", topic: "T" },
  ];
  const placed = placeSelfPracticeSet(
    { course: null, uid: "u1", productId: "prod-1", courseTitle: "Course", moduleTitle: "Mod", name: "Mixed set", questions },
    factories(),
  );
  assert.equal(placed.issues.length, 0, placed.issues.join("; "));
  const sets = selfPracticeSetsFromCourses([placed.course], "prod-1");
  assert.equal(sets.length, 1);
  const [hotspotQ, matchQ, legacyQ] = sets[0].questions;
  assert.equal(hotspotQ.questionType, "hotspot");
  assert.equal(hotspotQ.imageUrl, "https://cdn/heart.png");
  assert.deepEqual(hotspotQ.hotspots, [{ id: "h", x: 52, y: 38, r: 12 }]);
  assert.deepEqual(hotspotQ.correctHotspotIds, ["h"]);
  assert.equal(matchQ.questionType, "match");
  assert.deepEqual(matchQ.matchPairs, [{ left: "a", right: "1" }, { left: "b", right: "2" }]);
  assert.equal(legacyQ.questionType, "mcq", "the legacy question reads back as the MCQ it always was");
  // And the shelf for another course stays empty.
  assert.equal(selfPracticeSetsFromCourses([placed.course], "prod-2").length, 0);
});
