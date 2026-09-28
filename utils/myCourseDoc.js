// utils/myCourseDoc.js
//
// The shared shape of ONE "My Study Library" course document:
//
//   users/{uid}/myCourses/{courseId}
//
// Both writers must agree on it, and they run in different places:
//
//   • the browser  — `src/lib/myCourseClient.ts` writes the document straight
//     from the client (offline queue included), guarded by firestore.rules;
//   • the server   — `api/_lib/myCourses.ts` writes the SAME document with the
//     Admin SDK when the client is refused. The Admin SDK bypasses security
//     rules, so this module is the only thing enforcing the caps on that path.
//
// Keeping the caps and the sanitiser in one pure module means the two can never
// drift, and `tests/myStudyLibraryAllAccountsContract.test.mjs` pins them to the
// numbers in `src/types/myCourse.ts` and to the numbers in firestore.rules.

/** Keep in sync with `src/types/myCourse.ts` (pinned by a contract test). */
export const MY_COURSE_SCHEMA_VERSION = 1;
export const MY_COURSE_TITLE_MAX = 120;
export const MY_COURSE_DESC_MAX = 600;
export const MY_MODULE_TITLE_MAX = 120;
export const MY_MODULE_DESC_MAX = 400;
export const MY_RESOURCE_NAME_MAX = 120;
export const MY_RESOURCE_DESC_MAX = 400;
export const MY_COURSE_MAX_MODULES = 200;
export const MY_COURSE_MAX_RESOURCES = 400;
export const MY_COURSE_MAX_DEPTH = 4;
/** A cover may be an in-document data URL; Firestore's document limit is 1 MB. */
export const MY_COURSE_MAX_COVER_CHARS = 440000;
/** Firestore's hard document limit, with room for the module tree. */
export const MY_COURSE_MAX_URL_LENGTH = 2000;
/** Subcollection name under `users/{uid}`. */
export const MY_COURSES_COLLECTION = "myCourses";

const clamp = (value, max) => String(value == null ? "" : value).slice(0, max);
const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const now = () => Date.now();

const DIFFICULTIES = ["easy", "medium", "hard"];

/** One MCQ of a Brain practice set. */
export const sanitizeMyCourseQuestion = (raw, index) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const options = Array.isArray(source.options)
    ? source.options.map((option) => String(option == null ? "" : option)).slice(0, 6)
    : [];
  const prompt = clamp(source.prompt, 2000);
  const correct = Number(source.correctIndex);
  const difficulty = String(source.difficulty || "").toLowerCase();
  return {
    id: clamp(source.id || `q${index + 1}`, 80),
    prompt,
    options: options.length ? options : ["", ""],
    correctIndex: Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : -1,
    explanation: clamp(source.explanation, 2000),
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : "medium",
    topic: clamp(source.topic, 200),
  };
};

/** One resource (link, upload or Brain practice set). */
export const sanitizeMyCourseResource = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = clamp(source.id, 80);
  if (!id) return null;
  const type = clamp(source.type || "embed", 40);
  const questions = Array.isArray(source.practiceQuestions)
    ? source.practiceQuestions.map(sanitizeMyCourseQuestion).filter((question) => question && question.id)
    : [];
  const resource = {
    id,
    name: clamp(source.name, MY_RESOURCE_NAME_MAX),
    type,
    url: clamp(source.url, MY_COURSE_MAX_URL_LENGTH),
    description: clamp(source.description, MY_RESOURCE_DESC_MAX),
    source: source.source === "upload" ? "upload" : "link",
    createdAt: asNumber(source.createdAt, now()),
    updatedAt: now(),
  };
  if (typeof source.fileName === "string" && source.fileName) resource.fileName = clamp(source.fileName, 200);
  const size = asNumber(source.size, NaN);
  if (Number.isFinite(size) && size > 0) resource.size = size;
  if (type === "brain") {
    resource.practiceTitle = clamp(source.practiceTitle, MY_RESOURCE_NAME_MAX);
    resource.practiceQuestions = questions;
  }
  return resource;
};

/** Whole-tree caps. firestore.rules bounds the TOP-LEVEL module list (200);
 *  the server also bounds the total so a deeply nested tree cannot approach the
 *  1 MB document limit. */
export const MY_COURSE_TOTAL_MODULE_MAX = 400;

/** One module / folder, recursively (depth- and budget-capped). */
export const sanitizeMyCourseModule = (raw, depth = 0, budget = { modules: 0, resources: 0 }) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = clamp(source.id, 80);
  if (!id) return null;
  if (depth >= MY_COURSE_MAX_DEPTH) return null;
  if (budget.modules >= MY_COURSE_TOTAL_MODULE_MAX) return null;
  budget.modules += 1;

  // Resources are taken only up to what is left of the whole-tree budget, so a
  // course can never exceed `MY_COURSE_MAX_RESOURCES` no matter how it is nested.
  const remaining = Math.max(0, MY_COURSE_MAX_RESOURCES - budget.resources);
  const resources = (Array.isArray(source.resources) ? source.resources : [])
    .map(sanitizeMyCourseResource)
    .filter((resource) => resource && resource.id)
    .slice(0, remaining);
  budget.resources += resources.length;

  return {
    id,
    title: clamp(source.title, MY_MODULE_TITLE_MAX),
    description: clamp(source.description, MY_MODULE_DESC_MAX),
    resources,
    modules: (Array.isArray(source.modules) ? source.modules : [])
      .map((child) => sanitizeMyCourseModule(child, depth + 1, budget))
      .filter((child) => child && child.id),
    createdAt: asNumber(source.createdAt, now()),
    updatedAt: now(),
  };
};

/**
 * Build the exact document that is written to `users/{uid}/myCourses/{id}`.
 *
 * `uid` always comes from the VERIFIED ID token on the server (never from the
 * request body), which is what makes the Admin SDK path safe: a browser can
 * only ever write inside its own namespace.
 *
 * @returns {{ ok: true, doc: object } | { ok: false, code: string, message: string }}
 */
export const sanitizeMyCourseDoc = (uid, raw) => {
  const owner = String(uid == null ? "" : uid).trim();
  if (!owner) return { ok: false, code: "AUTH_REQUIRED", message: "Please sign in to save your course." };

  const source = raw && typeof raw === "object" ? raw : {};
  const id = clamp(source.id, 80);
  if (!id) return { ok: false, code: "MISSING_COURSE_ID", message: "That course has no id, so it cannot be saved." };
  // Firestore reserves ids that start and end with "__".
  if (id.startsWith("__")) {
    return { ok: false, code: "INVALID_COURSE_ID", message: "That course id is reserved by Firestore." };
  }

  const title = clamp(source.title, MY_COURSE_TITLE_MAX).trim();
  const budget = { modules: 0, resources: 0 };
  const modules = (Array.isArray(source.modules) ? source.modules : [])
    .map((module) => sanitizeMyCourseModule(module, 0, budget))
    .filter((module) => module && module.id)
    .slice(0, MY_COURSE_MAX_MODULES);

  const coverImage = clamp(source.coverImage, MY_COURSE_MAX_COVER_CHARS);
  if (coverImage.length >= MY_COURSE_MAX_COVER_CHARS) {
    return {
      ok: false,
      code: "COVER_TOO_LARGE",
      message: "That cover image is too large to store inside the course document. Please use a smaller image.",
    };
  }

  return {
    ok: true,
    doc: {
      id,
      uid: owner,
      title,
      description: clamp(source.description, MY_COURSE_DESC_MAX),
      coverImage,
      modules,
      createdAt: asNumber(source.createdAt, now()),
      updatedAt: now(),
      schemaVersion: MY_COURSE_SCHEMA_VERSION,
    },
  };
};

/** Count modules / resources the way the library cards do (for the response). */
export const countMyCourseModules = (modules) =>
  (Array.isArray(modules) ? modules : []).reduce(
    (total, module) => total + 1 + countMyCourseModules(module && module.modules),
    0,
  );

export const countMyCourseResources = (modules) =>
  (Array.isArray(modules) ? modules : []).reduce(
    (total, module) =>
      total
      + ((module && Array.isArray(module.resources)) ? module.resources.length : 0)
      + countMyCourseResources(module && module.modules),
    0,
  );
