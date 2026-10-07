// utils/practiceSet.js
//
// The Course Player's Brain practice sets — ONE normaliser for the questions,
// shared by every layer that touches them:
//
//   Admin editor (ModulesResourcesEditor → PracticeSetImportPanel)
//        ↓  ProductResource.practiceQuestions
//   utils/productMapping.js  (editor → Firestore → canonical → player file)
//        ↓  CourseFile.practiceQuestions
//   Course Player Brain tab (src/course/CourseBrainPanel.tsx)
//
// Having the rule in one place is what keeps the admin preview, the stored
// document and what the learner answers in agreement — a question the admin
// could save is exactly a question the player can show, never a silently
// dropped or malformed one.
//
// Shape (plain, Firestore-safe — no undefined, no functions):
//
//   {
//     id: "q1",                        // stable within its set
//     prompt: "What is 2 + 2?",
//     // NOTE: `explanation` is REQUIRED to publish (owner rule, 2026-10-07) —
//     // `practiceQuestionsReady` stays the lenient runtime rule so a set that
//     // was already published keeps playing; the admin's publish gate is
//     // `practiceQuestionsExplained` + `practiceQuestionIssues` below.
//     options: ["3", "4", "5", "6"],   // 2–6 options
//     correctIndex: 1,                 // -1 = not marked yet (admin must fix)
//     explanation: "2 + 2 = 4",
//     difficulty: "easy" | "medium" | "hard",
//     topic: "Arithmetic"              // optional label shown on the chip
//   }

/** The Test Bank's own cap — one saved practice set holds at most this many. */
export const MAX_PRACTICE_QUESTIONS = 100;
/** An answer tile needs a choice: fewer than two options is not a question. */
export const MIN_PRACTICE_OPTIONS = 2;
/** The player letters options A–F, so six is the ceiling (same as revision). */
export const MAX_PRACTICE_OPTIONS = 6;

const DIFFICULTIES = ["easy", "medium", "hard"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const toText = (value) => (value === null || value === undefined ? "" : String(value)).replace(/\s+/g, " ").trim();

const normalizeDifficulty = (value, fallback = "medium") => {
  const text = String(value || "").trim().toLowerCase();
  return DIFFICULTIES.includes(text) ? text : fallback;
};

const clampCorrectIndex = (value, optionCount) => {
  const index = Number(value);
  if (!Number.isFinite(index)) return -1;
  const rounded = Math.trunc(index);
  return rounded >= 0 && rounded < optionCount ? rounded : -1;
};

/**
 * Normalise ONE question. Returns null when it cannot be a question at all
 * (no prompt, or fewer than two options) — the same rule the bulk importer
 * enforces for a pasted block.
 */
export const normalizePracticeQuestion = (raw, index = 0) => {
  if (!isObject(raw)) return null;
  const prompt = toText(raw.prompt ?? raw.question ?? raw.title);
  if (!prompt) return null;
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map((option) => (isObject(option) ? toText(option.text ?? option.label) : toText(option)))
    .slice(0, MAX_PRACTICE_OPTIONS);
  // Trailing blank options are dropped; interior blanks are kept (they are the
  // admin's own edit-in-progress and re-normalising must not shuffle letters).
  while (options.length > MIN_PRACTICE_OPTIONS && options[options.length - 1] === "") options.pop();
  if (options.length < MIN_PRACTICE_OPTIONS) return null;
  return {
    id: toText(raw.id) || `q${index + 1}`,
    prompt,
    options,
    correctIndex: clampCorrectIndex(raw.correctIndex, options.length),
    explanation: toText(raw.explanation),
    difficulty: normalizeDifficulty(raw.difficulty),
    topic: toText(raw.topic),
  };
};

/**
 * Normalise a whole set: every entry passes through the single-question rule,
 * ids are made unique (a duplicate id would make two tiles select together),
 * and the result is capped at the Test Bank's 100-question ceiling.
 */
export const normalizePracticeQuestions = (value) => {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    const question = normalizePracticeQuestion(entry, out.length);
    if (!question) continue;
    let id = question.id;
    while (seen.has(id)) id = `${id}-${out.length + 1}`;
    seen.add(id);
    out.push({ ...question, id });
    if (out.length >= MAX_PRACTICE_QUESTIONS) break;
  }
  return out;
};

/**
 * Every rule ONE question must satisfy, as a list of human-readable reasons.
 *
 * ONE definition for all three admin surfaces — the per-question pill, the
 * resource card's "readiness" and the publish validation — so they can never
 * disagree about what is missing.
 *
 * `explanation` is part of the rule (owner rule, 2026-10-07): a question
 * without its "why" teaches nothing on the review screen, so it is never
 * optional — not in the importer, not in the hand-written form, not at publish.
 */
export const practiceQuestionIssues = (question) => {
  if (!isObject(question)) return ["not a question"];
  const issues = [];
  if (!toText(question.prompt)) issues.push("no question text");
  const options = Array.isArray(question.options) ? question.options : [];
  const filled = options.filter((option) => toText(isObject(option) ? option.text ?? option.label : option));
  if (filled.length < MIN_PRACTICE_OPTIONS) issues.push(`needs ${MIN_PRACTICE_OPTIONS} options`);
  const index = Number(question.correctIndex);
  if (!(Number.isFinite(index) && index >= 0 && Math.trunc(index) < options.length)) issues.push("no answer marked");
  if (!toText(question.explanation)) issues.push("no explanation");
  return issues;
};

/**
 * The RUNTIME rule — what the Course Player needs to run a set: at least one
 * question and every question with a prompt, options and a marked answer.
 *
 * Deliberately looser than the admin's publish rule below. `isUsableResource`
 * (utils/productMapping.js) reads THIS, so a set that went live before
 * explanations became mandatory keeps playing for the learners who own it; the
 * next admin save is what moves it onto the stricter rule.
 */
export const practiceQuestionsReady = (value) => {
  const questions = normalizePracticeQuestions(value);
  return questions.length > 0 && questions.every((question) => question.correctIndex >= 0);
};

/**
 * The PUBLISH rule on top of the runtime one — every question also carries its
 * explanation. Read by the admin panel and ProductEditor's publish validation,
 * never by the mapping layer (see above).
 */
export const practiceQuestionsExplained = (value) => {
  const questions = normalizePracticeQuestions(value);
  return questions.length > 0 && questions.every((question) => Boolean(toText(question.explanation)));
};

/**
 * How many questions still need work before publishing — the publish
 * validation's own counter (a draft that cannot even become a question counts
 * too, so the number never under-reports).
 */
export const countIncompletePracticeQuestions = (value) =>
  (Array.isArray(value) ? value : []).filter((raw) => {
    const question = normalizePracticeQuestion(raw, 0);
    return !question || practiceQuestionIssues(question).length > 0;
  }).length;

/**
 * Every practice set a learner may open, in curriculum order — the course
 * tree's `brain` resources, filtered by the access set the Modules tab itself
 * uses (`unlockedModuleIds` in src/course/CourseOverlay.tsx). A set in a
 * locked module, a hidden module, or a paid module the learner does not own is
 * therefore never even built: the Brain tab cannot leak paid content any more
 * than the curriculum list can.
 *
 * Lives here (not in the panel) so the same runtime code the Course Player
 * uses is the code the contract tests exercise.
 */
export const collectBrainPracticeSets = (modules, unlockedModuleIds) => {
  const sets = [];
  const visit = (nodes) => {
    for (const module of Array.isArray(nodes) ? nodes : []) {
      if (!isObject(module)) continue;
      const unlocked = unlockedModuleIds instanceof Set
        ? unlockedModuleIds.has(String(module.id))
        : Array.isArray(unlockedModuleIds) && unlockedModuleIds.map(String).includes(String(module.id));
      if (module.accessLevel !== "hidden" && unlocked) {
        for (const file of Array.isArray(module.files) ? module.files : []) {
          if (!isObject(file) || file.type !== "brain" || file.accessLevel === "hidden") continue;
          const questions = normalizePracticeQuestions(file.practiceQuestions).filter(
            (question) => question.prompt && question.options.length >= MIN_PRACTICE_OPTIONS,
          );
          if (questions.length === 0) continue;
          sets.push({
            id: String(file.id || ""),
            moduleId: String(module.id || ""),
            moduleTitle: toText(module.title) || "Module",
            title: toText(file.practiceTitle) || toText(file.name) || "Practice set",
            questions,
          });
        }
      }
      visit(module.modules);
    }
  };
  visit(modules);
  return sets.filter((set) => Boolean(set.id));
};

/**
 * How many questions a set is missing answers for — the admin panel's own
 * "mark them below before saving" counter, phrased for the practice UI.
 */
export const countUnmarkedPracticeQuestions = (value) =>
  (Array.isArray(value) ? value : []).filter((question) => {
    if (!isObject(question)) return false;
    const options = Array.isArray(question.options) ? question.options : [];
    const index = Number(question.correctIndex);
    return !(Number.isFinite(index) && index >= 0 && index < options.length);
  }).length;
