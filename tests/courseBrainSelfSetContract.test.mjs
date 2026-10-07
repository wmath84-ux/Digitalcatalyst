// tests/courseBrainSelfSetContract.test.mjs
//
// Contract for the Course Player Brain tab's SELF side: the learner's own
// practice sets, made from the “+” in the header.
//
// The contract pins:
//   1. what a created set IS — a `brain` resource inside ONE library course
//      (“My practice sets”), so it syncs on the Study Library shelf;
//   2. how the Brain page knows a set belongs to THIS course — the
//      `practiceSourceProductId` tag, filtered by `selfPracticeSetsFromCourses`;
//   3. the creation overlay mirroring the admin flow: the shared AI CMD, the
//      shared paste parser, and an explanation that is never optional;
//   4. the “+” existing ONLY while SELF is the open filter, wired end to end
//      (`selfSets`, `onCreateSelfSet` → `myLibrary.save`).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuestionText } from "../src/revision/engine/bulkParser.ts";
import { buildPracticeAiPrompt, PRACTICE_PROMPT_RULES } from "../src/utils/practicePrompt.ts";
import {
  SELF_PRACTICE_SETS_COURSE_DESCRIPTION,
  SELF_PRACTICE_SETS_COURSE_ID,
  SELF_PRACTICE_SETS_COURSE_TITLE,
  placeSelfPracticeSet,
  selfPracticeEmptyQuestion,
  selfPracticeQuestionsFromParsed,
  selfPracticeSetIssues,
  selfPracticeSetSummary,
  selfPracticeSetsFromCourses,
} from "../utils/selfPracticeSets.js";

const read = (path) => readFileSync(path, "utf8");

const panel = read("src/course/CourseBrainPanel.tsx");
const composer = read("src/course/SelfPracticeSetComposer.tsx");
const player = read("src/CoursePlayerApp.tsx");
const client = read("src/lib/myCourseClient.ts");
const types = read("src/types/myCourse.ts");

/** The library's own document builders, stubbed (the util never imports them). */
const factories = () => {
  let id = 0;
  return {
    createCourse: (uid, title) => ({
      id: SELF_PRACTICE_SETS_COURSE_ID,
      uid,
      title,
      description: "",
      coverImage: "",
      modules: [],
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: 1,
    }),
    createModule: (title) => ({ id: `m${++id}`, title, description: "", resources: [], modules: [], createdAt: 1, updatedAt: 1 }),
    createResource: (type) => ({ id: `r${++id}`, name: "", type, url: "", description: "", source: "link", createdAt: 1, updatedAt: 1 }),
  };
};

const parsedSet = () =>
  selfPracticeQuestionsFromParsed(
    parseQuestionText(`1. What is the derivative of x²?
A. x
B. 2x ✓
C. x²
D. 2
Explanation: The power rule brings the exponent down.`),
    { topic: "Calculus" },
  );

// ---------------------------------------------------------------------------
// 1. A created set is one resource on the Study Library shelf
// ---------------------------------------------------------------------------

test("self sets live in ONE owner-scoped library course, created on first use", () => {
  assert.equal(SELF_PRACTICE_SETS_COURSE_ID, "my-practice-sets");
  assert.equal(SELF_PRACTICE_SETS_COURSE_TITLE, "My practice sets");
  assert.match(SELF_PRACTICE_SETS_COURSE_DESCRIPTION, /Course Player's Brain tab/);
  // The hooks the shelf itself uses — the same listener the Study Library
  // renders, so a set made in the player is on the shelf immediately.
  assert.match(player, /import \{ useMyCourses \} from "\.\/hooks\/useMyCourses";/);
  assert.match(player, /const myLibrary = useMyCourses\(\);/);
  assert.match(player, /const result = await myLibrary\.save\(placed\.course\);/);
  // The document builders stay the library's own (myCourseClient), injected.
  assert.match(player, /createCourse: \(ownerUid, courseTitle\) => createMyCourse\(ownerUid, courseTitle\),/);
  assert.match(player, /createResource: \(type\) => createMyResource\(type\),/);
});

test("a set lands in a module for the source and carries the scope tag", () => {
  const first = placeSelfPracticeSet(
    {
      course: null,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "Light — Reflection",
      name: "Light — quick check",
      questions: parsedSet(),
    },
    factories(),
  );
  assert.deepEqual(first.issues, []);
  assert.equal(first.course.id, SELF_PRACTICE_SETS_COURSE_ID);
  assert.equal(first.course.title, SELF_PRACTICE_SETS_COURSE_TITLE);
  assert.equal(first.course.modules.length, 1);
  assert.equal(first.course.modules[0].title, "Light — Reflection");
  assert.equal(first.resource.type, "brain");
  assert.equal(first.resource.practiceTitle, "Light — quick check");
  assert.equal(first.resource.practiceSourceProductId, "p1");
  assert.equal(first.resource.practiceQuestions.length, 1);
  assert.equal(first.resource.practiceQuestions[0].correctIndex, 1);
  assert.match(first.resource.description, /Created from Brain · Class 10 Physics/);

  // A second set for the same module reuses the module (one module per source,
  // in shelf order) and appends — never a second “Light — Reflection”.
  const second = placeSelfPracticeSet(
    {
      course: first.course,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "light — reflection",
      name: "One more",
      questions: parsedSet(),
    },
    factories(),
  );
  assert.equal(second.course.modules.length, 1);
  assert.equal(second.course.modules[0].resources.length, 2);
  // The live snapshot was not mutated: placement works on a clone.
  assert.equal(first.course.modules[0].resources.length, 1);
});

test("an incomplete set can never reach the shelf", () => {
  // A question that IS a question (prompt + options) but has no explanation —
  // the one thing the owner made non-negotiable.
  const halfDone = {
    ...selfPracticeEmptyQuestion(0),
    prompt: "Which gas do plants absorb?",
    options: ["Oxygen", "Carbon dioxide", ""],
    correctIndex: 1,
  };
  const refused = placeSelfPracticeSet(
    {
      course: null,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "Light",
      name: "Half done",
      questions: [halfDone],
    },
    factories(),
  );
  assert.equal(refused.course, null);
  assert.equal(refused.resource, null);
  assert.deepEqual(refused.issues, ["Q1: no explanation"]);

  // A blank question that cannot become a question at all is refused too — and
  // Create says the honest thing instead of “saved”.
  const empty = placeSelfPracticeSet(
    {
      course: null,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "Light",
      name: "Nothing yet",
      questions: [selfPracticeEmptyQuestion(0)],
    },
    factories(),
  );
  assert.equal(empty.course, null);
  assert.deepEqual(empty.issues, ["add at least one question"]);
});

// ---------------------------------------------------------------------------
// 2. SELF lists only this course's own sets
// ---------------------------------------------------------------------------

test("SELF is the shelf's sets tagged for this course — and nothing else", () => {
  const shelf = {
    id: SELF_PRACTICE_SETS_COURSE_ID,
    title: SELF_PRACTICE_SETS_COURSE_TITLE,
    modules: [
      {
        id: "m1",
        title: "Light — Reflection",
        resources: [
          { id: "r1", type: "brain", name: "Mine", practiceTitle: "Reflection drill", practiceSourceProductId: "p1", practiceQuestions: parsedSet() },
          { id: "r2", type: "brain", name: "Other course", practiceSourceProductId: "p2", practiceQuestions: parsedSet() },
          { id: "r3", type: "brain", name: "Saved from a course", practiceQuestions: parsedSet() },
          { id: "r4", type: "youtube", name: "A video", practiceSourceProductId: "p1" },
        ],
      },
    ],
  };
  const sets = selfPracticeSetsFromCourses([shelf], "p1");
  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, "r1");
  assert.equal(sets[0].title, "Reflection drill");
  assert.equal(sets[0].moduleTitle, "Light — Reflection");
  assert.equal(sets[0].questions.length, 1);
  // Another course's Brain tab sees none of this learner's p1 sets.
  assert.deepEqual(selfPracticeSetsFromCourses([shelf], "p2").map((set) => set.id), ["r2"]);
  // No scope → no list (never “show everything”).
  assert.deepEqual(selfPracticeSetsFromCourses([shelf], ""), []);
});

test("the schema carries the tag through a Firestore round trip", () => {
  assert.match(types, /practiceSourceProductId\?: string;/);
  assert.match(client, /practiceSourceProductId: typeof source\.practiceSourceProductId === "string" \? source\.practiceSourceProductId : undefined,/);
});

// ---------------------------------------------------------------------------
// 3. The overlay mirrors the admin flow — CMD, paste, explanation required
// ---------------------------------------------------------------------------

test("the composer reuses the admin's CMD and the shared paste parser", () => {
  assert.match(composer, /import \{ buildPracticeAiPrompt, PRACTICE_PROMPT_RULES \} from "@\/utils\/practicePrompt";/);
  assert.match(composer, /import \{ parseQuestionText \} from "@\/revision\/engine\/bulkParser";/);
  assert.match(composer, /buildPracticeAiPrompt\(\{ topic: aiTopic, level: aiLevel, count: 10 \}\)/);
  assert.match(composer, /data-brain-self-topic/);
  assert.match(composer, /data-brain-self-level/);
  assert.match(composer, /data-brain-self-prompt-text/);
  assert.match(composer, /data-brain-self-copy/);
  assert.match(composer, /data-brain-self-paste-input/);
  assert.ok(PRACTICE_PROMPT_RULES.some((rule) => /Explanation/.test(rule)));

  // The CMD the learner copies is the same contract the parser reads back:
  // its topic/class lines are writable and the example parses to one complete
  // question with its explanation.
  const cmd = buildPracticeAiPrompt({ topic: "Optics", level: "Class 10" });
  assert.match(cmd, /TOPIC: Optics/);
  assert.match(cmd, /CLASS \/ LEVEL: Class 10/);
  assert.match(cmd, /EXPLANATION — REQUIRED ON EVERY QUESTION \(this is not optional\)/);
  const example = parseQuestionText(
    cmd.slice(cmd.indexOf("1. What is 2 + 2?")).split("\n\nReply now")[0],
  );
  assert.equal(example.length, 1);
  assert.equal(example[0].correctIndex, 1);
  assert.ok(example[0].explanation);
});

test("an explanation is never optional — Create waits for it", () => {
  const pasted = selfPracticeQuestionsFromParsed(
    parseQuestionText(`1. Which gas do plants absorb?
A. Oxygen
B. Carbon dioxide ✓
C. Nitrogen
D. Hydrogen`),
    { topic: "Photosynthesis" },
  );
  assert.equal(pasted.length, 1);
  assert.equal(pasted[0].explanation, "");
  const summary = selfPracticeSetSummary(pasted);
  assert.equal(summary.createReady, false);
  assert.deepEqual(summary.issues, ["Q1: no explanation"]);
  assert.deepEqual(selfPracticeSetIssues([]), ["add at least one question"]);

  const withExplanation = selfPracticeQuestionsFromParsed(
    parseQuestionText(`1. Which gas do plants absorb?
A. Oxygen
B. Carbon dioxide ✓
C. Nitrogen
D. Hydrogen
Explanation: Plants take in CO₂ and release O₂.`),
    { topic: "Photosynthesis" },
  );
  assert.equal(selfPracticeSetSummary(withExplanation).createReady, true);
  // The CMD's topic is written onto every question, so the result screen's
  // topic breakdown names the chapter instead of “Practice”.
  assert.equal(withExplanation[0].topic, "Photosynthesis");
  assert.equal(selfPracticeSetIssues(withExplanation).length, 0);
  // Create is disabled until the draft is complete.
  assert.match(composer, /const canCreate = Boolean\(title\.trim\(\)\) && summary\.createReady && !busy;/);
  assert.match(composer, /disabled=\{!canCreate\}/);
  assert.match(composer, /data-brain-self-create/);
});

test("submit creates immediately through the parent's writer", () => {
  assert.match(composer, /const result = await onCreate\(\{ title: title\.trim\(\), questions \}\);/);
  assert.match(panel, /onCreate=\{onCreateSelfSet\}/);
  // The player builds the document from the composer's questions and saves it.
  assert.match(player, /const placed = placeSelfPracticeSet\(/);
  assert.match(player, /trackFeatureEvent\("brain_self_set_created", \{ questions: questions\.length \}\);/);
});

// ---------------------------------------------------------------------------
// 4. The “+” exists only while SELF is the open filter, wired end to end
// ---------------------------------------------------------------------------

test("the header '+' renders only in SELF mode and opens the overlay", () => {
  assert.match(panel, /\{masterSelfCtl\.mode === "self" && onCreateSelfSet \? \(/);
  assert.match(panel, /data-brain-self-add=""/);
  assert.match(panel, /aria-label="Create your own practice set"/);
  assert.match(panel, /composerOpen && onCreateSelfSet \? \(/);
  assert.match(panel, /<SelfPracticeSetComposer/);
  assert.match(composer, /data-brain-self-composer=""/);
  // Leaving SELF closes a half-written set instead of floating it over MASTER.
  assert.match(panel, /if \(masterSelfCtl\.mode !== "self"\) setComposerOpen\(false\);/);
});

test("the player feeds the panel the SELF list, the writer and the CMD seeds", () => {
  assert.match(player, /const selfBrainSets = useMemo\(\s*\(\) => selfPracticeSetsFromCourses\(myLibrary\.courses, storageProductId\),/);
  assert.match(player, /selfSets=\{selfBrainSets\}/);
  assert.match(player, /onCreateSelfSet=\{createSelfBrainSet\}/);
  assert.match(player, /selfSetPrompt=\{\{/);
  assert.match(player, /uid=\{user\?\.id \?\? null\}/);
  // The panel understands both props (no silent dead code).
  assert.match(panel, /onCreateSelfSet\?: \(input: \{ title: string; questions: MyCourseQuestion\[\] \}\) => Promise<\{ ok: boolean; message\?: string \}>;/);
  assert.match(panel, /selfSetPrompt\?: \{ topic\?: string; level\?: string; defaultName\?: string \};/);
  // The empty SELF state now teaches the “+”, not a trip to the library.
  assert.match(panel, /Tap \+ in the header to create your own set/);
});
