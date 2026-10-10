// tests/brainPracticeImportContract.test.mjs
//
// Contract for the Brain page's “Create your own practice set” flow:
//
//   1. Parse — the shared parser reads an AI reply into every question, and the
//      shared validator names each problem (missing options, bad answer
//      reference, missing ✓, missing explanation, empty, duplicate, partial).
//   2. Create — enabled only from a fresh, valid Parse; a real library write;
//      the success message only after that write resolves.
//   3. Persistence — the set is written into ONE fixed “My practice sets”
//      shelf course, a save→reload round trip still lists it, and an unreadable
//      library refuses the write instead of replacing the shelf with a guess.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuestionText, parseQuestionTextDetailed } from "../src/revision/engine/bulkParser.ts";
import { parsePracticeImport } from "../src/utils/practiceImport.ts";
import {
  SELF_PRACTICE_SETS_COURSE_ID,
  SELF_PRACTICE_SETS_COURSE_TITLE,
  findSelfPracticeCourse,
  isSelfPracticeCourse,
  placeSelfPracticeSet,
  selfPracticeQuestionsFromParsed,
  selfPracticeSetsFromCourses,
} from "../utils/selfPracticeSets.js";

const read = (path) => readFileSync(path, "utf8");
const composer = read("src/course/SelfPracticeSetComposer.tsx");
const player = read("src/CoursePlayerApp.tsx");

const VALID = `1. What is 2 + 2?
A. 3
B. 4 ✓
C. 5
D. 6
Explanation: Adding 2 and 2 gives 4.

2. Which gas do plants absorb during photosynthesis?
A. Oxygen
B. Nitrogen
C. Carbon dioxide *
D. Hydrogen
Explanation: Plants take in CO₂ and release O₂.`;

/** Library factories stand in for myCourseClient (which generates `course_…` ids). */
const factories = (idPrefix = "course_gen") => {
  let n = 0;
  return {
    createCourse: (uid, title) => ({
      id: `${idPrefix}_${++n}`,
      uid,
      title,
      description: "",
      coverImage: "",
      modules: [],
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: 1,
    }),
    createModule: (title) => ({ id: `mod_${++n}`, title, description: "", resources: [], modules: [], createdAt: 1, updatedAt: 1 }),
    createResource: (type) => ({ id: `res_${++n}`, name: "", type, url: "", description: "", source: "link", createdAt: 1, updatedAt: 1 }),
  };
};

// ---------------------------------------------------------------------------
// 1. Parse — every question, option, answer and explanation is read back
// ---------------------------------------------------------------------------

test("a valid AI reply parses into every question with its options, answer and explanation", () => {
  const result = parsePracticeImport(VALID);
  assert.deepEqual(result.errors, []);
  assert.equal(result.createReady, true);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions[0].options, ["3", "4", "5", "6"]);
  assert.equal(result.questions[0].correctIndex, 1);
  assert.equal(result.questions[0].explanation, "Adding 2 and 2 gives 4.");
  assert.equal(result.questions[1].prompt, "Which gas do plants absorb during photosynthesis?");
  assert.deepEqual(result.questions[1].options, ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"]);
  assert.equal(result.questions[1].correctIndex, 2);
  assert.equal(result.questions[1].explanation, "Plants take in CO₂ and release O₂.");
});

test("a question whose prompt wraps onto several lines keeps the whole prompt", () => {
  const { questions } = parseQuestionTextDetailed(`1. An object is placed beyond the focus of a
convex lens. Where is the image formed?
A. Between F and 2F
B. At 2F ✓
C. At infinity
D. Virtual, behind the lens
Explanation: Beyond 2F a convex lens forms a real, inverted image between F and 2F.`);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].prompt, "An object is placed beyond the focus of a convex lens. Where is the image formed?");
  assert.equal(questions[0].correctIndex, 1);
  assert.match(questions[0].explanation, /Beyond 2F/);
});

test("the answer can be marked by an Answer line, CRLF line endings and Hindi text are read", () => {
  const answerLine = parsePracticeImport(`1. Capital of France?
A. Paris
B. Rome
Answer: A
Explanation: Paris is the capital.`);
  assert.equal(answerLine.createReady, true);
  assert.equal(answerLine.questions[0].correctIndex, 0);

  const crlf = parseQuestionText("1. What is 2+2?\r\nA. 3\r\nB. 4 ✓\r\nExplanation: four.\r\n");
  assert.equal(crlf[0].correctIndex, 1);

  const hindi = parsePracticeImport(`1. भारत की राजधानी क्या है?
A. मुंबई
B. नई दिल्ली ✓
C. कोलकाता
D. चेन्नई
Explanation: नई दिल्ली भारत की राजधानी है।`);
  assert.equal(hindi.createReady, true);
  assert.equal(hindi.questions[0].options[1], "नई दिल्ली");
});

test("questions with no blank line between them, and a preamble line, split correctly", () => {
  const { questions, problems } = parseQuestionTextDetailed(`Here are your questions:
1. What is 2+2?
A. 3
B. 4 ✓
Explanation: four.
2. What is 3+3?
A. 5
B. 6 ✓
Explanation: six.`);
  assert.deepEqual(problems, []);
  assert.equal(questions.length, 2);
  assert.equal(questions[0].prompt, "What is 2+2?");
  assert.equal(questions[1].correctIndex, 1);
});

// ---------------------------------------------------------------------------
// 2. Validation — each problem is named, and Create stays off
// ---------------------------------------------------------------------------

test("empty and whitespace-only input is refused with a clear message", () => {
  for (const text of ["", "   \n\n  "]) {
    const result = parsePracticeImport(text);
    assert.equal(result.createReady, false);
    assert.equal(result.questions.length, 0);
    assert.match(result.errors[0], /Paste the AI’s reply first/);
  }
});

test("text with no numbered questions is reported, not silently empty", () => {
  const result = parsePracticeImport("Sorry, I cannot help with that request.");
  assert.equal(result.createReady, false);
  assert.match(result.errors[0], /No questions found/);
});

test("a question with only one option is named by its line", () => {
  const result = parsePracticeImport(`1. Lonely question?
A. only one
Explanation: x`);
  assert.equal(result.createReady, false);
  assert.match(result.errors[0], /^Line 1: “Lonely question\?” has 1 option line — at least 2 \(A\. B\. …\) are needed\.$/);
});

test("a question with no marked answer is named", () => {
  const result = parsePracticeImport(`1. What is 2+2?
A. 3
B. 4
C. 5
D. 6
Explanation: four.`);
  assert.equal(result.createReady, false);
  assert.deepEqual(result.errors, ["Q1: no answer marked — put ✓ at the end of the correct option"]);
});

test("an Answer line that matches no option is reported with the value it held", () => {
  const result = parsePracticeImport(`1. What is 2+2?
A. 3
B. 4
Answer: Z
Explanation: four.`);
  assert.equal(result.createReady, false);
  assert.equal(result.questions[0].correctIndex, -1);
  assert.match(result.errors[0], /^Q1: “Answer: Z” does not match an option/);
});

test("a question with no explanation is named — the explanation is never optional", () => {
  const result = parsePracticeImport(`1. What is 2+2?
A. 3
B. 4 ✓
C. 5
D. 6`);
  assert.equal(result.createReady, false);
  assert.deepEqual(result.errors, ["Q1: no explanation — add an “Explanation:” line"]);
});

test("an empty option is reported by letter", () => {
  const result = parsePracticeImport(`1. What is 2+2?
A. 3
B. ✓
C. 5
Explanation: four.`);
  assert.equal(result.createReady, false);
  assert.ok(result.errors.some((message) => message === "Q1: option B is empty"), result.errors.join(" | "));
});

test("a partial reply shows every parsed question but keeps Create off until all are valid", () => {
  const result = parsePracticeImport(`${VALID}

3. Which is a prime number?
A. 4
B. 6
C. 7 ✓
D. 8`);
  assert.equal(result.questions.length, 3, "all parsed questions are previewed");
  assert.equal(result.createReady, false);
  assert.deepEqual(result.errors, ["Q3: no explanation — add an “Explanation:” line"]);
});

test("a duplicate question is a warning against its first copy, and does not block Create", () => {
  const result = parsePracticeImport(`${VALID}

1. what is   2 + 2?
A. 3
B. 4 ✓
Explanation: again.`);
  assert.equal(result.createReady, true, result.errors.join(" | "));
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.startsWith("Q3: repeats Q1’s question text")), result.warnings.join(" | "));
});

test("more than the 100-question ceiling is refused", () => {
  const many = Array.from({ length: 101 }, (_, index) => `${index + 1}. Question ${index + 1}?
A. one
B. two ✓
Explanation: because.`).join("\n\n");
  const result = parsePracticeImport(many);
  assert.equal(result.createReady, false);
  assert.match(result.errors.join(" | "), /at most 100 questions — remove 1 to continue/);
});

test("the explanation travels into the stored question and the answer keeps its index", () => {
  const { questions } = parsePracticeImport(VALID);
  const stored = selfPracticeQuestionsFromParsed(questions, { topic: "Photosynthesis" });
  assert.equal(stored.length, 2);
  assert.equal(stored[1].correctIndex, 2);
  assert.equal(stored[1].explanation, "Plants take in CO₂ and release O₂.");
  assert.equal(stored[0].topic, "Photosynthesis");
});

// ---------------------------------------------------------------------------
// 3. Persistence — one shelf course, found again, never replaced by a guess
// ---------------------------------------------------------------------------

test("a new set lands in the fixed shelf course even when the factory generates a random id", () => {
  const { questions } = parsePracticeImport(VALID);
  const placed = placeSelfPracticeSet(
    {
      course: null,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "Light",
      name: "Quick check",
      questions: selfPracticeQuestionsFromParsed(questions, { topic: "Light" }),
    },
    factories(),
  );
  assert.deepEqual(placed.issues, []);
  assert.equal(placed.course.id, SELF_PRACTICE_SETS_COURSE_ID);
  assert.equal(placed.course.title, SELF_PRACTICE_SETS_COURSE_TITLE);
  assert.equal(placed.resource.practiceQuestions.length, 2);
});

test("a save followed by a fresh read lists the set for its own course only", () => {
  const { questions } = parsePracticeImport(VALID);
  const placed = placeSelfPracticeSet(
    {
      course: null,
      uid: "u1",
      productId: "p1",
      courseTitle: "Class 10 Physics",
      moduleTitle: "Light",
      name: "Quick check",
      questions: selfPracticeQuestionsFromParsed(questions, { topic: "Light" }),
    },
    factories(),
  );
  // What Firestore stores and a reload reads back: a JSON round trip of the document.
  const reloaded = JSON.parse(JSON.stringify([placed.course]));
  const sets = selfPracticeSetsFromCourses(reloaded, "p1");
  assert.equal(sets.length, 1);
  assert.equal(sets[0].title, "Quick check");
  assert.equal(sets[0].questions.length, 2);
  assert.equal(sets[0].questions[0].correctIndex, 1);
  assert.equal(sets[0].questions[0].explanation, "Adding 2 and 2 gives 4.");
  assert.deepEqual(selfPracticeSetsFromCourses(reloaded, "p2"), []);
});

test("a second set joins the same shelf course instead of creating another one", () => {
  const { questions } = parsePracticeImport(VALID);
  const input = (course, name) => ({
    course,
    uid: "u1",
    productId: "p1",
    courseTitle: "Class 10 Physics",
    moduleTitle: "Light",
    name,
    questions: selfPracticeQuestionsFromParsed(questions, { topic: "Light" }),
  });
  const first = placeSelfPracticeSet(input(null, "One"), factories());
  const found = findSelfPracticeCourse([first.course]);
  const second = placeSelfPracticeSet(input(found, "Two"), factories());
  assert.equal(second.course.id, first.course.id);
  assert.equal(second.course.modules[0].resources.length, 2);
});

test("sets saved by earlier builds (random course id, same title) are still listed and reused", () => {
  const legacy = {
    id: "course_legacy123",
    title: SELF_PRACTICE_SETS_COURSE_TITLE,
    modules: [
      {
        id: "m1",
        title: "Light",
        resources: [
          {
            id: "r1",
            type: "brain",
            name: "Old set",
            practiceTitle: "Old set",
            practiceSourceProductId: "p1",
            practiceQuestions: selfPracticeQuestionsFromParsed(parsePracticeImport(VALID).questions, { topic: "" }),
          },
        ],
        modules: [],
      },
    ],
  };
  assert.equal(isSelfPracticeCourse(legacy), true);
  assert.equal(isSelfPracticeCourse({ id: "course_other", title: "Biology" }), false);
  assert.deepEqual(selfPracticeSetsFromCourses([legacy], "p1").map((set) => set.id), ["r1"]);
  // A new set goes into the existing shelf rather than orphaning the old one.
  assert.equal(findSelfPracticeCourse([legacy]).id, "course_legacy123");
});

test("the canonical shelf course is preferred over a legacy one", () => {
  const legacy = { id: "course_old", title: SELF_PRACTICE_SETS_COURSE_TITLE, modules: [] };
  const canonical = { id: SELF_PRACTICE_SETS_COURSE_ID, title: SELF_PRACTICE_SETS_COURSE_TITLE, modules: [] };
  assert.equal(findSelfPracticeCourse([legacy, canonical]).id, SELF_PRACTICE_SETS_COURSE_ID);
  assert.equal(findSelfPracticeCourse([{ id: "course_x", title: "Notes" }]), null);
});

// ---------------------------------------------------------------------------
// 4. Source wiring — the guards and the message order that the behaviour depends on
// ---------------------------------------------------------------------------

test("Parse is an explicit button; nothing is parsed while the learner is still typing", () => {
  assert.match(composer, /data-brain-self-parse/);
  assert.match(composer, /onClick=\{runParse\}/);
  assert.match(composer, /const runParse = \(\) => \{/);
  assert.doesNotMatch(composer, /parseQuestionText\(/, "the composer uses the shared validator, not a live parse");
  // The preview is driven by the snapshot the Parse press took, and a changed reply is stale.
  assert.match(composer, /const parseFresh = parsed !== null && parsed\.source === paste;/);
  assert.match(composer, /data-brain-self-stale/);
});

test("the preview lists every question's options, correct answer and explanation", () => {
  assert.match(composer, /data-brain-self-preview-list/);
  assert.match(composer, /data-brain-self-preview-question/);
  assert.match(composer, /data-correct=\{correct \? "true" : "false"\}/);
  assert.match(composer, /<span className="font-bold text-slate-200">Explanation: <\/span>/);
  assert.match(composer, /data-brain-self-parse-errors/);
});

test("Create is enabled only from a fresh, valid Parse and cannot double-submit", () => {
  assert.match(composer, /const createReady = mode === "ai" \? Boolean\(parseResult\?\.createReady\) && pasteQuestions\.length > 0 : summary\.createReady;/);
  assert.match(composer, /disabled=\{!canCreate\}/);
  assert.match(composer, /if \(submitting\.current\) return;/);
  assert.match(composer, /submitting\.current = true;/);
  assert.match(composer, /submitting\.current = false;/);
});

test("the CMD asks for the chosen count and language, like the admin panel", () => {
  assert.match(composer, /data-brain-self-count/);
  assert.match(composer, /data-brain-self-language/);
  assert.match(composer, /count: Number\(aiCount\), language: aiLanguage/);
});

test("the library refuses the write when it cannot be read, instead of saving over it", () => {
  const start = player.indexOf("const createSelfBrainSet = useCallback(");
  assert.ok(start > 0, "createSelfBrainSet exists");
  const block = player.slice(start, player.indexOf("const createSelfExperiment", start) > 0 ? player.indexOf("const createSelfExperiment", start) : start + 4000);
  assert.doesNotMatch(block, /\.catch\(\(\) => myLibrary\.courses\)/, "no guessed-empty fallback");
  assert.match(block, /if \(myLibrary\.state === "error"\)/);
  assert.match(block, /Could not reach your Study Library to save this set/);
  assert.match(block, /findSelfPracticeCourse\(coursesNow\)/);
});

test("the success toast only follows a confirmed save", () => {
  const start = player.indexOf("const createSelfBrainSet = useCallback(");
  const block = player.slice(start, start + 3000);
  const saved = block.indexOf("const result = await myLibrary.save(placed.course);");
  const refused = block.indexOf("if (!result.ok) return { ok: false, message: result.message };");
  const toast = block.indexOf("toast({");
  assert.ok(saved > 0 && refused > saved, "the save result is checked");
  assert.ok(toast > refused, "the toast comes after the failure check");
});
