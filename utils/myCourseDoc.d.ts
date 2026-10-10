// Type declarations for `utils/myCourseDoc.js` — the shared shape of ONE
// "My Study Library" course document (`users/{uid}/myCourses/{courseId}`).
//
// Consumers: `api/_lib/myCourses.ts` (the Admin-SDK writer that runs when the
// client is refused by Firestore rules) and the contract tests that pin these
// caps to `src/types/myCourse.ts` and to firestore.rules.

export const MY_COURSE_SCHEMA_VERSION: number;
export const MY_COURSE_TITLE_MAX: number;
export const MY_COURSE_DESC_MAX: number;
export const MY_MODULE_TITLE_MAX: number;
export const MY_MODULE_DESC_MAX: number;
export const MY_RESOURCE_NAME_MAX: number;
export const MY_RESOURCE_DESC_MAX: number;
export const MY_COURSE_MAX_MODULES: number;
export const MY_COURSE_MAX_RESOURCES: number;
export const MY_COURSE_TOTAL_MODULE_MAX: number;
export const MY_COURSE_MAX_DEPTH: number;
export const MY_COURSE_MAX_COVER_CHARS: number;
export const MY_COURSE_MAX_URL_LENGTH: number;
export const MY_COURSES_COLLECTION: "myCourses";

export interface MyCourseQuestionDoc {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}

export interface MyCourseResourceDoc {
  id: string;
  name: string;
  type: string;
  url: string;
  description: string;
  source: "link" | "upload";
  fileName?: string;
  size?: number;
  practiceTitle?: string;
  practiceQuestions?: MyCourseQuestionDoc[];
  createdAt: number;
  updatedAt: number;
}

export interface MyCourseModuleDoc {
  id: string;
  title: string;
  description: string;
  resources: MyCourseResourceDoc[];
  modules: MyCourseModuleDoc[];
  createdAt: number;
  updatedAt: number;
}

/** The exact document written to Firestore. */
export interface MyCourseDoc {
  id: string;
  uid: string;
  title: string;
  description: string;
  coverImage: string;
  modules: MyCourseModuleDoc[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export type SanitizeResult =
  | { ok: true; doc: MyCourseDoc }
  | { ok: false; code: string; message: string };

export interface SanitizeBudget {
  modules: number;
  resources: number;
}

export const sanitizeMyCourseQuestion: (raw: unknown, index: number) => MyCourseQuestionDoc;
export const sanitizeMyCourseResource: (raw: unknown) => MyCourseResourceDoc | null;
export const sanitizeMyCourseModule: (
  raw: unknown,
  depth?: number,
  budget?: SanitizeBudget,
) => MyCourseModuleDoc | null;
export const sanitizeMyCourseDoc: (uid: string, raw: unknown) => SanitizeResult;
export const countMyCourseModules: (modules: unknown) => number;
export const countMyCourseResources: (modules: unknown) => number;

/** Per-map and whole-course caps for learner mind maps (stored once in the course document). */
export declare const MY_MIND_MAP_MAX_BYTES: number;
export declare const MY_COURSE_MAX_MIND_MAP_BYTES: number;
/** UTF-8 size of every learner mind map in the tree, and the first over-size map. */
export declare const mindMapBudget: (modules: unknown) => {
  total: number;
  over: { id: string; name: string; bytes: number } | null;
};
