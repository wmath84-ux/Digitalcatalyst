// utils/selfPracticeSets.js
//
// SELF side of the Course Player's Brain tab — the learner's OWN practice
// sets, created from the Brain page (the “+” in the header) and stored in
// their Study Library.
//
// ── Where they live, and why ───────────────────────────────────────────────
// A learner-made set is a `brain` resource — the same shape the admin's sets
// use (`practiceQuestions`, see utils/practiceSet.js) — inside ONE dedicated
// library course, `users/{uid}/myCourses/my-practice-sets` (“My practice
// sets”). Consequences, all deliberate:
//
//   · it syncs to every device and survives a reinstall (myCourses is the
//     Study Library's own cloud shelf, already writable by its owner);
//   · it opens in the Study Library like any other course and is editable
//     there with the existing Brain editor (src/personal-library/
//     MyCourseBrainEditor.tsx), so nothing about the library changes;
//   · the Brain tab does NOT have to guess which sets are “for this course”:
//     every created resource carries `practiceSourceProductId` — the
//     `storageProductId` of the player it was created from — and only sets
//     tagged for the open course are listed in SELF.
//
// The library document itself is built by `src/lib/myCourseClient.ts`
// (`createMyCourse` / `createMyModule` / `createMyResource`), so the stored
// schema stays defined in ONE place; `placeSelfPracticeSet` only decides
// WHICH module a set lands in and what the resource carries. That is also why
// the document builders arrive as `factories` — this file stays pure JS, so
// the node test runner can exercise every rule with stub factories.

import {
  MAX_PRACTICE_OPTIONS,
  MAX_PRACTICE_QUESTIONS,
  MIN_PRACTICE_OPTIONS,
  normalizePracticeQuestions,
  practiceQuestionIssues,
} from "./practiceSet.js";

/** The stable id of the learner's “My practice sets” library course. */
export const SELF_PRACTICE_SETS_COURSE_ID = "my-practice-sets";
/** The title that course carries on the Study Library shelf. */
export const SELF_PRACTICE_SETS_COURSE_TITLE = "My practice sets";
/** One line of shelf copy: says where the sets came from and where to edit them. */
export const SELF_PRACTICE_SETS_COURSE_DESCRIPTION =
  "Practice sets you created from the Course Player's Brain tab. Open one here to edit its questions.";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const toText = (value) => (value === null || value === undefined ? "" : String(value)).replace(/\s+/g, " ").trim();

/** Deep-clone a course so a draft never mutates the live shelf snapshot. */
const cloneCourse = (course) =>
  typeof structuredClone === "function" ? structuredClone(course) : JSON.parse(JSON.stringify(course));

/**
 * A blank question for the composer's “write it yourself” path — the same
 * shape (and same 4 empty options / unmarked answer) the admin panel starts a
 * hand-written question with, so the Study Library editor shows it identically.
 */
export const selfPracticeEmptyQuestion = (index = 0) => ({
  id: `q${index + 1}`,
  prompt: "",
  options: ["", "", "", ""],
  correctIndex: -1,
  explanation: "",
  difficulty: "medium",
  topic: "",
});

/**
 * The bulk parser's output (`parseQuestionText`, src/revision/engine/
 * bulkParser.ts) → the stored question records: stable ids, options clamped to
 * the shared 2–6 window (short rows padded so the editor's letters never
 * shift), the marked answer kept only when it points at a real option, and the
 * CMD's topic written onto every question that has none of its own.
 *
 * The explanation is carried over as-is — a pasted question that has none is
 * reported by `selfPracticeSetIssues` (it is never optional), not silently
 * invented here.
 */
export const selfPracticeQuestionsFromParsed = (parsed, options = {}) => {
  const list = Array.isArray(parsed) ? parsed : [];
  const startIndex = Number.isFinite(Number(options.startIndex)) ? Math.max(0, Math.trunc(Number(options.startIndex))) : 0;
  const fallbackTopic = toText(options.topic);
  const out = [];
  for (const raw of list) {
    if (!isObject(raw)) continue;
    const prompt = toText(raw.prompt);
    if (!prompt) continue;
    const optionsList = (Array.isArray(raw.options) ? raw.options : [])
      .map((option) => toText(option))
      .slice(0, MAX_PRACTICE_OPTIONS);
    while (optionsList.length < MIN_PRACTICE_OPTIONS) optionsList.push("");
    const index = Number(raw.correctIndex);
    out.push({
      id: `q${startIndex + out.length + 1}`,
      prompt,
      options: optionsList,
      correctIndex: Number.isFinite(index) && index >= 0 && index < optionsList.length ? Math.trunc(index) : -1,
      explanation: toText(raw.explanation),
      difficulty: "medium",
      topic: toText(raw.topic) || fallbackTopic,
    });
    if (out.length >= MAX_PRACTICE_QUESTIONS) break;
  }
  return out;
};

/**
 * Every reason a draft set cannot be created yet, phrased per question —
 * “Q3: no answer marked”. It reads the SAME per-question rule the admin's
 * importer and publish gate use (`practiceQuestionIssues`), so an explanation
 * that is missing here is missing everywhere: it is never optional.
 */
export const selfPracticeSetIssues = (questions) => {
  const list = Array.isArray(questions) ? questions : [];
  if (list.length === 0) return ["add at least one question"];
  const issues = [];
  list.forEach((question, index) => {
    for (const issue of practiceQuestionIssues(question)) issues.push(`Q${index + 1}: ${issue}`);
  });
  return issues;
};

/** `{ total, ready, issues }` — what the composer's status line and Create button read. */
export const selfPracticeSetSummary = (questions) => {
  const list = Array.isArray(questions) ? questions : [];
  const ready = list.filter((question) => practiceQuestionIssues(question).length === 0).length;
  const issues = selfPracticeSetIssues(list);
  return { total: list.length, ready, issues, createReady: list.length > 0 && issues.length === 0 };
};

const visitSelfCourse = (modules, scope, sets) => {
  for (const module of Array.isArray(modules) ? modules : []) {
    if (!isObject(module)) continue;
    for (const resource of Array.isArray(module.resources) ? module.resources : []) {
      if (!isObject(resource) || resource.type !== "brain") continue;
      if (toText(resource.practiceSourceProductId) !== scope) continue;
      const questions = normalizePracticeQuestions(resource.practiceQuestions);
      if (questions.length === 0) continue;
      sets.push({
        id: String(resource.id || ""),
        moduleId: String(module.id || ""),
        moduleTitle: toText(module.title) || SELF_PRACTICE_SETS_COURSE_TITLE,
        title: toText(resource.practiceTitle) || toText(resource.name) || "Practice set",
        questions,
      });
    }
    visitSelfCourse(module.modules, scope, sets);
  }
};

/**
 * The SELF list for one player scope: every brain resource in “My practice
 * sets” tagged with this course, in shelf order. Same object shape as
 * `collectBrainPracticeSets` (utils/practiceSet.js), so the panel renders both
 * kinds of set with the answering UI, scoring and cards it already has.
 */
export const selfPracticeSetsFromCourses = (courses, productId) => {
  const scope = toText(productId);
  if (!scope) return [];
  const sets = [];
  for (const course of Array.isArray(courses) ? courses : []) {
    if (!isObject(course) || String(course.id) !== SELF_PRACTICE_SETS_COURSE_ID) continue;
    visitSelfCourse(course.modules, scope, sets);
  }
  return sets.filter((set) => Boolean(set.id));
};

/**
 * Put a finished set into the library: the “My practice sets” course (created
 * on first use through `factories.createCourse`), one root module per source
 * — the module the learner was watching, else the course title — and one
 * `brain` resource inside it carrying the questions and the scope tag.
 *
 * Returns the course document to save (`myLibrary.save`) plus the resource
 * that was added; returns `{ issues }` instead when the draft is not complete,
 * so an incomplete set can never reach the shelf.
 */
export const placeSelfPracticeSet = (input, factories) => {
  const source = isObject(input) ? input : {};
  const makeCourse = factories && typeof factories.createCourse === "function" ? factories.createCourse : null;
  const makeModule = factories && typeof factories.createModule === "function" ? factories.createModule : null;
  const makeResource = factories && typeof factories.createResource === "function" ? factories.createResource : null;
  if (!makeCourse || !makeModule || !makeResource) {
    return { course: null, resource: null, issues: ["this build cannot save practice sets"] };
  }

  const questions = normalizePracticeQuestions(source.questions);
  const issues = selfPracticeSetIssues(questions);
  if (issues.length) return { course: null, resource: null, issues };

  const uid = toText(source.uid);
  const courseTitle = toText(source.courseTitle);
  const title = toText(source.name) || "Practice set";
  const moduleTitle = toText(source.moduleTitle) || courseTitle || SELF_PRACTICE_SETS_COURSE_TITLE;
  const scope = toText(source.productId);
  const now = Date.now();

  let working;
  if (isObject(source.course) && String(source.course.id) === SELF_PRACTICE_SETS_COURSE_ID) {
    working = cloneCourse(source.course);
  } else {
    if (!uid) return { course: null, resource: null, issues: ["sign in to save practice sets"] };
    working = makeCourse(uid, SELF_PRACTICE_SETS_COURSE_TITLE);
    working.description = SELF_PRACTICE_SETS_COURSE_DESCRIPTION;
    working.modules = [];
  }
  if (!Array.isArray(working.modules)) working.modules = [];

  const wanted = moduleTitle.toLowerCase();
  let module = working.modules.find(
    (entry) => isObject(entry) && String(entry.title || "").trim().toLowerCase() === wanted,
  );
  if (!module) {
    module = makeModule(moduleTitle);
    module.resources = [];
    working.modules = [...working.modules, module];
  }
  if (!Array.isArray(module.resources)) module.resources = [];

  const resource = {
    ...makeResource("brain"),
    name: title,
    description: courseTitle ? `Created from Brain · ${courseTitle}` : "Created from Brain",
    practiceTitle: title,
    practiceQuestions: questions,
    practiceSourceProductId: scope,
  };
  module.resources = [...module.resources, resource];
  module.updatedAt = now;
  working.updatedAt = now;

  return { course: working, resource, issues: [] };
};
