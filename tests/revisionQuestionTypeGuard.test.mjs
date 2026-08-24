// Deterministic question-TYPE enforcement for the test-planning generator.
//
// Learners reported that selecting "Theory only" (or even Mixed) still
// delivered solve-type/numerical questions: the generation server trusted the
// model's prose-following and never verified the type of what came back.
// These tests pin the behavioural contract of the deterministic guard
// (utils/questionTypeGuard.js) and its wiring into the server repair loop.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  classifyQuestionKind,
  mixedModeSplit,
  normalizeModelTypeTag,
  planModeEnforcement,
  resolveQuestionKind,
} from "../utils/questionTypeGuard.js";
import { normalizeCompleteAiQuestions } from "../utils/aiGeneratedTest.js";

const read = (path) => fs.readFileSync(path, "utf8");

const mcq = (prompt, options, extra = {}) => ({
  prompt,
  options,
  correctIndex: 0,
  explanation: "Test explanation.",
  difficulty: "medium",
  ...extra,
});

/* ------------------------------ fixtures ------------------------------ */

const NUMERICAL_FORCE = mcq(
  "Calculate the force acting on a 2 kg object that accelerates at 3 m/s².",
  ["2 N", "4 N", "6 N", "8 N"],
);

const WORD_PROBLEM_SPEED = mcq(
  "A car covers 100 km in 2 hours. What is its average speed?",
  ["40 km/h", "50 km/h", "60 km/h", "70 km/h"],
);

const RECALL_UNIT = mcq("What is the SI unit of force?", ["Joule", "Newton", "Pascal", "Watt"]);

const RECALL_LAW = mcq("State Newton's second law of motion.", [
  "F = ma",
  "Every action has an equal and opposite reaction",
  "Objects at rest stay at rest",
  "Energy can neither be created nor destroyed",
]);

const RECALL_STATEMENT = mcq("Which of the following statements about photosynthesis is correct?", [
  "It releases oxygen",
  "It absorbs oxygen",
  "It occurs only at night",
  "It requires no sunlight",
]);

const RECALL_COUNT_WORDS = mcq("The number of chambers in the human heart is:", ["Two", "Three", "Four", "Five"]);

const FACT_NUMERIC_OPTIONS = mcq("How many chambers does the human heart have?", ["2", "3", "4", "6"]);

const MEMORY_FACT_NO_TAG = mcq("The atomic number of carbon is:", ["4", "6", "12", "14"]);

/* --------------------------- heuristic reads --------------------------- */

test("heuristic flags solve-type questions as application even with no model tag", () => {
  assert.equal(resolveQuestionKind(NUMERICAL_FORCE), "application");
  assert.equal(resolveQuestionKind(WORD_PROBLEM_SPEED), "application");
  assert.equal(classifyQuestionKind({ prompt: "Find the value of x if x + 5 = 12.", options: ["5", "6", "7", "8"] }), "application");
});

test("heuristic keeps recall-style questions as theory", () => {
  assert.equal(resolveQuestionKind(RECALL_UNIT), "theory");
  assert.equal(resolveQuestionKind(RECALL_LAW), "theory");
  assert.equal(resolveQuestionKind(RECALL_STATEMENT), "theory");
  assert.equal(resolveQuestionKind(RECALL_COUNT_WORDS), "theory");
});

test("ambiguous questions fall back to the model's own type tag", () => {
  // Numeric answer options alone are not proof of computation ("how many
  // chambers" is memory); the mandatory model tag settles the ambiguity.
  assert.equal(classifyQuestionKind(FACT_NUMERIC_OPTIONS), "unknown");
  assert.equal(resolveQuestionKind({ ...FACT_NUMERIC_OPTIONS, type: "theory" }), "theory");
  assert.equal(resolveQuestionKind({ ...FACT_NUMERIC_OPTIONS, type: "application" }), "application");
  assert.equal(resolveQuestionKind(MEMORY_FACT_NO_TAG), "unknown");
});

test("a confident heuristic read beats a wrong model tag", () => {
  // A model that lazily tags a numerical problem as "theory" is overruled.
  assert.equal(resolveQuestionKind({ ...NUMERICAL_FORCE, type: "theory" }), "application");
});

test("model type tags normalise tolerant spellings", () => {
  assert.equal(normalizeModelTypeTag("theory"), "theory");
  assert.equal(normalizeModelTypeTag("Theoretical"), "theory");
  assert.equal(normalizeModelTypeTag("concept-based"), "theory");
  assert.equal(normalizeModelTypeTag("Application"), "application");
  assert.equal(normalizeModelTypeTag("numerical"), "application");
  assert.equal(normalizeModelTypeTag("problem-based"), "application");
  assert.equal(normalizeModelTypeTag("practical"), "application");
  assert.equal(normalizeModelTypeTag(""), "");
  assert.equal(normalizeModelTypeTag(null), "");
  assert.equal(normalizeModelTypeTag("mcq"), "");
});

/* ----------------------------- mixed quotas ----------------------------- */

test("mixed mode demands an exact theory/application split", () => {
  assert.deepEqual(mixedModeSplit(10), { theory: 5, application: 5 });
  assert.deepEqual(mixedModeSplit(7), { theory: 4, application: 3 });
  assert.deepEqual(mixedModeSplit(2), { theory: 1, application: 1 });
  assert.deepEqual(mixedModeSplit(1), { theory: 1, application: 0 });
});

/* --------------------------- mode enforcement --------------------------- */

test("theory mode rejects numerical sneak-ins and asks for exact replacements", () => {
  const theoryBatch = [RECALL_UNIT, RECALL_LAW, RECALL_STATEMENT, RECALL_COUNT_WORDS];
  const batch = [...theoryBatch, NUMERICAL_FORCE, WORD_PROBLEM_SPEED];
  const plan = planModeEnforcement(batch, "theory", 6);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.keep, theoryBatch);
  assert.deepEqual(plan.needs, [{ kind: "theory", count: 2 }]);
  assert.deepEqual(plan.rejects, [NUMERICAL_FORCE, WORD_PROBLEM_SPEED]);
  assert.equal(plan.summary.application, 2);
  assert.equal(plan.summary.targetTheory, 6);
});

test("theory mode passes a compliant batch untouched", () => {
  const batch = [RECALL_UNIT, RECALL_LAW, RECALL_STATEMENT, RECALL_COUNT_WORDS];
  const plan = planModeEnforcement(batch, "theory", 4);
  assert.equal(plan.ok, true);
  assert.equal(plan.keep.length, 4);
  assert.deepEqual(plan.needs, []);
});

test("application mode rejects direct-recall questions symmetrically", () => {
  const appBatch = [NUMERICAL_FORCE, WORD_PROBLEM_SPEED];
  const batch = [RECALL_UNIT, ...appBatch, RECALL_LAW];
  const plan = planModeEnforcement(batch, "application", 4);
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.keep, appBatch);
  assert.deepEqual(plan.needs, [{ kind: "application", count: 2 }]);
  assert.deepEqual(plan.rejects, [RECALL_UNIT, RECALL_LAW]);
});

test("mixed mode repairs an application-dominated batch to the exact quota", () => {
  // The original complaint: even Mixed drifted to all-application output.
  const batch = [
    RECALL_UNIT,
    ...Array.from({ length: 9 }, (_, index) =>
      mcq(`A ${10 + index} kg block moves at ${index + 1} m/s. Calculate its momentum.`, ["10", "20", "30", "40"]),
    ),
  ];
  const plan = planModeEnforcement(batch, "mixed", 10);
  assert.equal(plan.ok, false);
  assert.equal(plan.summary.application, 9);
  assert.equal(plan.summary.theory, 1);
  assert.deepEqual(plan.needs, [{ kind: "theory", count: 4 }]);
  assert.equal(plan.rejects.length, 4);
  assert.equal(plan.keep.length, 6); // 1 theory + 5 application

  // Feed the plan's keep + 4 repaired theory questions back in: complete.
  const repaired = Array.from({ length: 4 }, (_, index) =>
    mcq(`Theory replacement ${index + 1}: which of the following quantities is a vector?`, [
      "Speed",
      "Velocity",
      "Distance",
      "Time",
    ]),
  );
  const complete = planModeEnforcement([...plan.keep, ...repaired], "mixed", 10);
  assert.equal(complete.ok, true);
  assert.equal(complete.keep.length, 10);
  assert.deepEqual(complete.needs, []);
});

test("mixed mode passes an over-supplied balanced batch and interleaves styles", () => {
  const theories = Array.from({ length: 6 }, (_, index) =>
    mcq(`Recall ${index + 1}: what is the SI unit of quantity ${index + 1}?`, ["A", "B", "C", "D"]),
  );
  const applications = Array.from({ length: 6 }, (_, index) =>
    mcq(`Compute ${index + 1}: calculate ${index + 2} × ${index + 3}.`, ["4", "5", "6", "7"]),
  );
  const plan = planModeEnforcement([...theories, ...applications], "mixed", 10);
  assert.equal(plan.ok, true);
  assert.equal(plan.keep.length, 10);
  assert.deepEqual(plan.needs, []);
  // Interleaved: every odd-position question is the alternate style.
  const kinds = plan.keep.map((q) => resolveQuestionKind(q));
  assert.deepEqual(kinds.slice(0, 4), ["theory", "application", "theory", "application"]);
});

test("unknowns are flexible in mixed mode and tolerated in strict modes", () => {
  // A tag-less memory question with numeric options is unclassifiable — it
  // must not trigger a repair storm, but a detected violation still must.
  const plan = planModeEnforcement([FACT_NUMERIC_OPTIONS, RECALL_UNIT, RECALL_LAW], "theory", 3);
  assert.equal(plan.ok, true);
  assert.equal(plan.keep.length, 3);

  const mixed = planModeEnforcement([FACT_NUMERIC_OPTIONS, RECALL_UNIT, NUMERICAL_FORCE, WORD_PROBLEM_SPEED], "mixed", 4);
  assert.equal(mixed.ok, true); // quota 2/2: unknown fills the second theory slot
  assert.equal(mixed.keep.length, 4);
});

/* -------------------------- normalization tag --------------------------- */

test("normalisation preserves the model's type tag for the guard", () => {
  const [tagged, untagged] = normalizeCompleteAiQuestions(
    {
      questions: [
        { ...RECALL_UNIT, type: "theory" },
        { ...NUMERICAL_FORCE, prompt: "A 5 kg mass hangs at rest. Find the tension in the string (g = 10 m/s²)." },
      ],
    },
    "medium",
  );
  assert.equal(tagged.type, "theory");
  assert.equal("type" in untagged, false);
  assert.equal(resolveQuestionKind(untagged), "application");
});

/* --------------------------- server wiring ------------------------------ */

test("the generation server verifies every batch and repairs wrong-type output", () => {
  const server = read("api/_lib/revisionGenerate.ts");
  assert.match(server, /import \{ mixedModeSplit, planModeEnforcement, type ModeNeed \} from "\.\.\/\.\.\/utils\/questionTypeGuard\.js"/);
  assert.match(server, /planModeEnforcement<GeneratedQuestion>\(first\.questions, mode, syllabus\.count\)/);
  assert.match(server, /MAX_TYPE_REPAIR_ROUNDS = 2/);
  assert.match(server, /buildTypeRepairPrompt\(syllabus, plan\.needs, plan\.rejects, round\)/);
  assert.match(server, /CORRECTION REQUIRED \(round /);
  assert.match(server, /WRONG-TYPE QUESTION/);
  assert.match(server, /mergeProviderUsage\(usageParts\)/);
  // Wrong-type output is dropped, so a shortfall still fails honestly.
  assert.match(server, /plan\.keep\.slice\(0, syllabus\.count\)/);
  assert.match(server, /INCOMPLETE_AI_TEST/);
  // Usage aggregation keeps hybrid cost accounting accurate across repairs.
  assert.match(server, /usageParts\.push\(repaired\.usage\)/);
});

test("both prompt builders require the truthful per-question type tag and exact mixed quota", () => {
  const server = read("api/_lib/revisionGenerate.ts");
  const client = read("src/revision/engine/aiGenerate.ts");
  for (const source of [server, client]) {
    assert.match(source, /,"type":"theory"\}\]\}/); // output schema carries the tag
    assert.match(source, /Tag every question truthfully/);
    assert.match(source, /EXACT SPLIT REQUIRED/);
    assert.match(source, /not acceptable — the split is exact/);
    assert.match(source, /Mark each question object with "type":"theory"/);
    assert.match(source, /Mark each question object with "type":"application"/);
  }
  assert.match(client, /import \{ mixedModeSplit \} from "\.\.\/\.\.\/\.\.\/utils\/questionTypeGuard\.js"/);
  assert.match(client, /questionStyleLines\(input\.questionMode, input\.count\)/);
  assert.match(server, /questionStyleLines\(syllabus\.questionMode, syllabus\.count\)/);
});
