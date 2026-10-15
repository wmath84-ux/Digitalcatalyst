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

/**
 * Every question type the Brain page can author, parse and play. A question
 * records its type EXPLICITLY (`questionType`); a record without one is a
 * legacy MCQ and keeps playing as one — it is never “upgraded” by guessing,
 * and an unrecognised type is never silently converted into an MCQ either
 * (validation reports it as unsupported instead).
 */
export const PRACTICE_QUESTION_TYPES = [
  "mcq",
  "fill_blank",
  "label_diagram",
  "assertion_reason",
  "one_word",
  "match",
  "drag_drop",
  "hotspot",
];

/**
 * The ONE answer-choice convention for Assertion-and-Reason questions,
 * shared by the AI prompt, the parser, the editors, the stored data and the
 * player: four fixed statements, and the question stores only which index
 * is correct.
 */
export const ASSERTION_REASON_CHOICES = [
  "Both Assertion and Reason are true, and the Reason correctly explains the Assertion",
  "Both Assertion and Reason are true, but the Reason does not explain the Assertion",
  "The Assertion is true, but the Reason is false",
  "The Assertion is false, but the Reason is true",
];

/** A fill-in-the-blank blank is three or more underscores in the prompt. */
export const countPromptBlanks = (prompt) => (String(prompt || "").match(/_{3,}/g) || []).length;

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

/* ── typed questions ───────────────────────────────────────────────────────
 * Every type keeps the shared core (id, prompt, explanation, difficulty,
 * topic) and carries ONLY its own fields — a matching question's pairs never
 * hide inside the MCQ `options` array. Legacy records (no `questionType`)
 * are MCQs; an unrecognised type is preserved as-is so validation can name
 * it instead of the data being silently rewritten.
 */
const questionTypeOf = (raw) => {
  const type = isObject(raw) ? toText(raw.questionType).toLowerCase() : "";
  return type || "mcq";
};

const toTextList = (value) =>
  (Array.isArray(value) ? value : []).map((entry) => toText(isObject(entry) ? entry.text ?? entry.label ?? entry.value : entry));

const clampCoord = (value, fallback = 50) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number * 10) / 10));
};

/** Fold a typed answer for comparison: case and spacing never matter. */
export const normalizeAnswerText = (value) =>
  String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const acceptedList = (value) => {
  const list = (Array.isArray(value) ? value : [value]).map((entry) => toText(entry)).filter(Boolean);
  return [...new Set(list)];
};

/**
 * Normalise ONE question. Returns null when it cannot be a question at all
 * (no prompt, or — for an MCQ — fewer than two options) — the same rule the
 * bulk importer enforces for a pasted block. Typed questions are normalised
 * by their own fields; a type the app does not support is carried through
 * untouched (never converted into an MCQ) so validation can name it.
 */
export const normalizePracticeQuestion = (raw, index = 0) => {
  if (!isObject(raw)) return null;
  const type = questionTypeOf(raw);
  const core = {
    id: toText(raw.id) || `q${index + 1}`,
    explanation: toText(raw.explanation),
    difficulty: normalizeDifficulty(raw.difficulty),
    topic: toText(raw.topic),
  };
  const prompt = toText(raw.prompt ?? raw.question ?? raw.title);

  if (type === "mcq") {
    if (!prompt) return null;
    const options = (Array.isArray(raw.options) ? raw.options : [])
      .map((option) => (isObject(option) ? toText(option.text ?? option.label) : toText(option)))
      .slice(0, MAX_PRACTICE_OPTIONS);
    // Trailing blank options are dropped; interior blanks are kept (they are the
    // admin's own edit-in-progress and re-normalising must not shuffle letters).
    while (options.length > MIN_PRACTICE_OPTIONS && options[options.length - 1] === "") options.pop();
    if (options.length < MIN_PRACTICE_OPTIONS) return null;
    return {
      ...core,
      questionType: "mcq",
      prompt,
      options,
      correctIndex: clampCorrectIndex(raw.correctIndex, options.length),
    };
  }

  if (!PRACTICE_QUESTION_TYPES.includes(type)) {
    // Unsupported types survive as records (validation names them); they are
    // never silently rewritten into MCQs.
    if (!prompt) return null;
    return { ...core, questionType: type, prompt, options: [], correctIndex: -1 };
  }

  switch (type) {
    case "fill_blank": {
      if (!prompt) return null;
      const blanks = countPromptBlanks(prompt);
      const blankAnswers = (Array.isArray(raw.blankAnswers) ? raw.blankAnswers : []).map((entry) =>
        acceptedList(entry),
      );
      while (blankAnswers.length < blanks) blankAnswers.push([]);
      return {
        ...core,
        questionType: type,
        prompt,
        options: [],
        correctIndex: -1,
        blankAnswers: blanks > 0 ? blankAnswers.slice(0, blanks) : blankAnswers,
      };
    }
    case "one_word": {
      if (!prompt) return null;
      return {
        ...core,
        questionType: type,
        prompt,
        options: [],
        correctIndex: -1,
        acceptedAnswers: acceptedList(raw.acceptedAnswers ?? raw.answer ?? raw.correctAnswer),
      };
    }
    case "assertion_reason": {
      const assertion = toText(raw.assertion);
      const reason = toText(raw.reason);
      if (!assertion && !reason) return null;
      return {
        ...core,
        questionType: type,
        prompt,
        options: [],
        assertion,
        reason,
        correctIndex: clampCorrectIndex(raw.correctIndex, ASSERTION_REASON_CHOICES.length),
      };
    }
    case "match": {
      const matchPairs = (Array.isArray(raw.matchPairs ?? raw.pairs) ? raw.matchPairs ?? raw.pairs : [])
        .map((pair) => ({
          left: toText(isObject(pair) ? pair.left ?? pair.a : pair),
          right: toText(isObject(pair) ? pair.right ?? pair.b : ""),
        }))
        .filter((pair) => pair.left || pair.right);
      if (!prompt && matchPairs.length === 0) return null;
      return { ...core, questionType: type, prompt, options: [], correctIndex: -1, matchPairs };
    }
    case "drag_drop": {
      const dragItems = toTextList(raw.dragItems ?? raw.items);
      const dragTargets = (Array.isArray(raw.dragTargets ?? raw.targets) ? raw.dragTargets ?? raw.targets : []).map(
        (target, targetIndex) => ({
          id: toText(isObject(target) ? target.id : "") || `t${targetIndex + 1}`,
          label: toText(isObject(target) ? target.label ?? target.name : target),
          answer: toText(isObject(target) ? target.answer ?? target.item : ""),
        }),
      );
      if (!prompt && dragTargets.length === 0) return null;
      return { ...core, questionType: type, prompt, options: [], correctIndex: -1, dragItems, dragTargets };
    }
    case "label_diagram": {
      const imageUrl = toText(raw.imageUrl ?? raw.image);
      const labelTargets = (Array.isArray(raw.labelTargets ?? raw.targets) ? raw.labelTargets ?? raw.targets : []).map(
        (target, targetIndex) => ({
          id: toText(isObject(target) ? target.id : "") || `t${targetIndex + 1}`,
          x: clampCoord(isObject(target) ? target.x : undefined),
          y: clampCoord(isObject(target) ? target.y : undefined),
          label: toText(isObject(target) ? target.label : target),
        }),
      );
      if (!prompt && !imageUrl) return null;
      const labelOptions = toTextList(raw.labelOptions ?? raw.labels);
      return {
        ...core,
        questionType: type,
        prompt,
        options: [],
        correctIndex: -1,
        imageUrl,
        labelTargets,
        labelOptions: labelOptions.length ? labelOptions : labelTargets.map((target) => target.label).filter(Boolean),
      };
    }
    case "hotspot": {
      const imageUrl = toText(raw.imageUrl ?? raw.image);
      const hotspots = (Array.isArray(raw.hotspots) ? raw.hotspots : []).map((spot, spotIndex) => ({
        id: toText(isObject(spot) ? spot.id : "") || `s${spotIndex + 1}`,
        x: clampCoord(isObject(spot) ? spot.x : undefined),
        y: clampCoord(isObject(spot) ? spot.y : undefined),
        r: clampCoord(isObject(spot) ? spot.r ?? spot.radius : undefined, 10) || 10,
      }));
      if (!prompt && !imageUrl) return null;
      const correctHotspotIds = acceptedList(raw.correctHotspotIds ?? raw.correctHotspotId);
      return {
        ...core,
        questionType: type,
        prompt,
        options: [],
        correctIndex: -1,
        imageUrl,
        hotspots,
        correctHotspotIds,
      };
    }
    default:
      return null;
  }
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
  const type = questionTypeOf(question);
  if (type !== "mcq" && !PRACTICE_QUESTION_TYPES.includes(type)) return ["unsupported question type"];
  const issues = [];
  if (type === "assertion_reason") {
    if (!toText(question.assertion)) issues.push("no assertion");
    if (!toText(question.reason)) issues.push("no reason");
    const index = Number(question.correctIndex);
    if (!(Number.isFinite(index) && Math.trunc(index) >= 0 && Math.trunc(index) < ASSERTION_REASON_CHOICES.length)) {
      issues.push("no answer marked");
    }
  } else if (type === "fill_blank") {
    if (!toText(question.prompt)) issues.push("no question text");
    const blanks = countPromptBlanks(question.prompt);
    if (blanks === 0) issues.push("no blank (___) in the question");
    const answers = Array.isArray(question.blankAnswers) ? question.blankAnswers : [];
    for (let blank = 0; blank < blanks; blank += 1) {
      if (!acceptedList(answers[blank]).length) issues.push(`blank ${blank + 1} has no answer`);
    }
  } else if (type === "one_word") {
    if (!toText(question.prompt)) issues.push("no question text");
    if (!acceptedList(question.acceptedAnswers).length) issues.push("no expected answer");
  } else if (type === "match") {
    if (!toText(question.prompt)) issues.push("no question text");
    const pairs = Array.isArray(question.matchPairs) ? question.matchPairs : [];
    if (pairs.length < 2) issues.push("needs at least 2 pairs");
    if (pairs.some((pair) => !toText(pair?.left) || !toText(pair?.right))) issues.push("a pair is incomplete");
  } else if (type === "drag_drop") {
    if (!toText(question.prompt)) issues.push("no question text");
    const targets = Array.isArray(question.dragTargets) ? question.dragTargets : [];
    const items = toTextList(question.dragItems);
    if (targets.length === 0) issues.push("needs a drop target");
    if (targets.some((target) => !toText(target?.label))) issues.push("a target has no label");
    if (targets.some((target) => !toText(target?.answer))) issues.push("a target has no correct item");
    if (targets.some((target) => toText(target?.answer) && !items.includes(toText(target.answer)))) {
      issues.push("a target's correct item is not in the items");
    }
  } else if (type === "label_diagram") {
    if (!toText(question.prompt)) issues.push("no question text");
    if (!toText(question.imageUrl)) issues.push("diagram image missing");
    const targets = Array.isArray(question.labelTargets) ? question.labelTargets : [];
    if (targets.length === 0) issues.push("needs a label target");
    if (targets.some((target) => !toText(target?.label))) issues.push("a label target has no label");
  } else if (type === "hotspot") {
    if (!toText(question.prompt)) issues.push("no question text");
    if (!toText(question.imageUrl)) issues.push("image missing");
    const spots = Array.isArray(question.hotspots) ? question.hotspots : [];
    if (spots.length === 0) issues.push("needs a hotspot");
    const correct = acceptedList(question.correctHotspotIds);
    if (correct.length === 0) issues.push("mark the correct hotspot");
    if (correct.some((id) => !spots.some((spot) => spot.id === id))) issues.push("the correct hotspot is not on the image");
  } else {
    if (!toText(question.prompt)) issues.push("no question text");
    const options = Array.isArray(question.options) ? question.options : [];
    const filled = options.filter((option) => toText(isObject(option) ? option.text ?? option.label : option));
    if (filled.length < MIN_PRACTICE_OPTIONS) issues.push(`needs ${MIN_PRACTICE_OPTIONS} options`);
    const index = Number(question.correctIndex);
    if (!(Number.isFinite(index) && index >= 0 && Math.trunc(index) < options.length)) issues.push("no answer marked");
  }
  if (!toText(question.explanation)) issues.push("no explanation");
  return issues;
};

/**
 * The answer-key half of the rule (no explanation): could the player score
 * this question right now? `practiceQuestionsReady` reads this per type, so
 * an old MCQ set and a new matching set are judged by the same idea — a
 * complete key — through their own fields.
 */
export const practiceQuestionAnswerable = (question) => {
  if (!isObject(question)) return false;
  const type = questionTypeOf(question);
  switch (type) {
    case "mcq": {
      const index = Number(question.correctIndex);
      const options = Array.isArray(question.options) ? question.options : [];
      return Number.isFinite(index) && Math.trunc(index) >= 0 && Math.trunc(index) < options.length;
    }
    case "assertion_reason": {
      const index = Number(question.correctIndex);
      return (
        Boolean(toText(question.assertion)) &&
        Boolean(toText(question.reason)) &&
        Number.isFinite(index) &&
        Math.trunc(index) >= 0 &&
        Math.trunc(index) < ASSERTION_REASON_CHOICES.length
      );
    }
    case "fill_blank": {
      const blanks = countPromptBlanks(question.prompt);
      if (blanks === 0) return false;
      const answers = Array.isArray(question.blankAnswers) ? question.blankAnswers : [];
      return answers.slice(0, blanks).every((entry) => acceptedList(entry).length > 0) && answers.length >= blanks;
    }
    case "one_word":
      return acceptedList(question.acceptedAnswers).length > 0;
    case "match": {
      const pairs = Array.isArray(question.matchPairs) ? question.matchPairs : [];
      return pairs.length >= 2 && pairs.every((pair) => toText(pair?.left) && toText(pair?.right));
    }
    case "drag_drop": {
      const targets = Array.isArray(question.dragTargets) ? question.dragTargets : [];
      const items = toTextList(question.dragItems);
      return (
        targets.length > 0 &&
        targets.every((target) => toText(target?.label) && toText(target?.answer) && items.includes(toText(target.answer)))
      );
    }
    case "label_diagram": {
      const targets = Array.isArray(question.labelTargets) ? question.labelTargets : [];
      return Boolean(toText(question.imageUrl)) && targets.length > 0 && targets.every((target) => toText(target?.label));
    }
    case "hotspot": {
      const spots = Array.isArray(question.hotspots) ? question.hotspots : [];
      const correct = acceptedList(question.correctHotspotIds);
      return (
        Boolean(toText(question.imageUrl)) &&
        spots.length > 0 &&
        correct.length > 0 &&
        correct.every((id) => spots.some((spot) => spot.id === id))
      );
    }
    default:
      return false;
  }
};

/**
 * Score ONE learner response against a question's key, for every type.
 * Response shapes (the player's `selections` values):
 *   mcq / assertion_reason → the chosen index (number)
 *   fill_blank             → one typed string per blank (string[])
 *   one_word               → the typed string
 *   match / drag_drop / label_diagram → { id: chosen value } maps
 *   hotspot                → the tapped hotspot's id (string)
 */
export const evaluatePracticeAnswer = (question, response) => {
  if (response === undefined || response === null || response === "") return "unanswered";
  if (!isObject(question)) return "unanswered";
  const type = questionTypeOf(question);
  switch (type) {
    case "mcq":
    case "assertion_reason":
      return Number(response) === Number(question.correctIndex) && Number(question.correctIndex) >= 0
        ? "correct"
        : "wrong";
    case "fill_blank": {
      const values = Array.isArray(response) ? response : [];
      const answers = Array.isArray(question.blankAnswers) ? question.blankAnswers : [];
      if (!answers.length) return "wrong";
      const ok = answers.every((accepted, blank) =>
        acceptedList(accepted).some((entry) => normalizeAnswerText(entry) === normalizeAnswerText(values[blank])),
      );
      return ok ? "correct" : "wrong";
    }
    case "one_word":
      return acceptedList(question.acceptedAnswers).some(
        (entry) => normalizeAnswerText(entry) === normalizeAnswerText(response),
      )
        ? "correct"
        : "wrong";
    case "match": {
      const pairs = Array.isArray(question.matchPairs) ? question.matchPairs : [];
      const map = isObject(response) ? response : {};
      return pairs.length > 0 && pairs.every((pair) => normalizeAnswerText(map[pair.left]) === normalizeAnswerText(pair.right))
        ? "correct"
        : "wrong";
    }
    case "drag_drop": {
      const targets = Array.isArray(question.dragTargets) ? question.dragTargets : [];
      const map = isObject(response) ? response : {};
      return targets.length > 0 && targets.every((target) => normalizeAnswerText(map[target.id]) === normalizeAnswerText(target.answer))
        ? "correct"
        : "wrong";
    }
    case "label_diagram": {
      const targets = Array.isArray(question.labelTargets) ? question.labelTargets : [];
      const map = isObject(response) ? response : {};
      return targets.length > 0 && targets.every((target) => normalizeAnswerText(map[target.id]) === normalizeAnswerText(target.label))
        ? "correct"
        : "wrong";
    }
    case "hotspot":
      return acceptedList(question.correctHotspotIds).includes(String(response)) ? "correct" : "wrong";
    default:
      return "unanswered";
  }
};

/** “Yours / Correct” lines for the review and answers screens, per type. */
export const practiceAnswerSummary = (question, response) => {
  if (!isObject(question)) return { yours: "—", correct: "—" };
  const type = questionTypeOf(question);
  const unanswered = response === undefined || response === null || response === "";
  switch (type) {
    case "mcq": {
      const options = Array.isArray(question.options) ? question.options : [];
      return {
        yours: unanswered ? "Not answered" : options[Number(response)] ?? "—",
        correct: options[Number(question.correctIndex)] ?? "—",
      };
    }
    case "assertion_reason":
      return {
        yours: unanswered ? "Not answered" : ASSERTION_REASON_CHOICES[Number(response)] ?? "—",
        correct: ASSERTION_REASON_CHOICES[Number(question.correctIndex)] ?? "—",
      };
    case "fill_blank": {
      const values = Array.isArray(response) ? response : [];
      const answers = Array.isArray(question.blankAnswers) ? question.blankAnswers : [];
      return {
        yours: unanswered ? "Not answered" : values.map((value) => toText(value) || "—").join(" · ") || "Not answered",
        correct: answers.map((accepted) => acceptedList(accepted)[0] ?? "—").join(" · "),
      };
    }
    case "one_word":
      return {
        yours: unanswered ? "Not answered" : String(response),
        correct: acceptedList(question.acceptedAnswers).join(" / ") || "—",
      };
    case "match": {
      const pairs = Array.isArray(question.matchPairs) ? question.matchPairs : [];
      const map = isObject(response) ? response : {};
      return {
        yours: unanswered ? "Not answered" : pairs.map((pair) => `${pair.left} → ${toText(map[pair.left]) || "—"}`).join("; "),
        correct: pairs.map((pair) => `${pair.left} → ${pair.right}`).join("; "),
      };
    }
    case "drag_drop": {
      const targets = Array.isArray(question.dragTargets) ? question.dragTargets : [];
      const map = isObject(response) ? response : {};
      return {
        yours: unanswered ? "Not answered" : targets.map((target) => `${target.label}: ${toText(map[target.id]) || "—"}`).join("; "),
        correct: targets.map((target) => `${target.label}: ${target.answer}`).join("; "),
      };
    }
    case "label_diagram": {
      const targets = Array.isArray(question.labelTargets) ? question.labelTargets : [];
      const map = isObject(response) ? response : {};
      return {
        yours: unanswered ? "Not answered" : targets.map((target) => toText(map[target.id]) || "—").join("; "),
        correct: targets.map((target) => target.label).join("; "),
      };
    }
    case "hotspot": {
      const spots = Array.isArray(question.hotspots) ? question.hotspots : [];
      const correct = acceptedList(question.correctHotspotIds)
        .map((id) => spots.find((spot) => spot.id === id))
        .filter(Boolean)
        .map((spot) => `(${spot.x}%, ${spot.y}%)`)
        .join("; ");
      return { yours: unanswered ? "Not answered" : "Tapped on the image", correct: correct || "—" };
    }
    default:
      return { yours: "—", correct: "—" };
  }
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
  return questions.length > 0 && questions.every((question) => practiceQuestionAnswerable(question));
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
            (question) =>
              question.questionType !== "mcq" ||
              (question.prompt && question.options.length >= MIN_PRACTICE_OPTIONS),
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
  (Array.isArray(value) ? value : []).filter((raw) => {
    const question = normalizePracticeQuestion(raw, 0);
    return !question || !practiceQuestionAnswerable(question);
  }).length;
