// Type declarations for `utils/selfPracticeSets.js`. The runtime lives in the
// sibling `.js` file so the Node test runner can exercise every rule without a
// TS toolchain; the Course Player imports the same runtime through Vite.

import type {
  MyCourse,
  MyCourseModule,
  MyCourseQuestion,
  MyCourseResource,
  MyCourseResourceType,
} from "../src/types/myCourse";
import type { NormalizedPracticeQuestion } from "./practiceSet";

/** The stable id of the learner's “My practice sets” library course. */
export declare const SELF_PRACTICE_SETS_COURSE_ID: string;
export declare const SELF_PRACTICE_SETS_COURSE_TITLE: string;
export declare const SELF_PRACTICE_SETS_COURSE_DESCRIPTION: string;

/** A blank hand-written question (4 empty options, no answer marked yet). */
export declare const selfPracticeEmptyQuestion: (index?: number) => MyCourseQuestion;

/** Bulk-parser output → stored question records (ids, clamps, topic fill). */
export declare const selfPracticeQuestionsFromParsed: (
  parsed: unknown,
  options?: { startIndex?: number; topic?: string },
) => MyCourseQuestion[];

/** Every reason the draft cannot be created yet, phrased per question. */
export declare const selfPracticeSetIssues: (questions: unknown) => string[];

export interface SelfPracticeSetSummary {
  total: number;
  ready: number;
  issues: string[];
  /** True when Create may go ahead: one complete question at least. */
  createReady: boolean;
}

export declare const selfPracticeSetSummary: (questions: unknown) => SelfPracticeSetSummary;

/** The SELF list for one player scope — same shape as `BrainPracticeSet`. */
export declare const selfPracticeSetsFromCourses: (
  courses: unknown,
  productId: string | null | undefined,
) => Array<{
  id: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  questions: NormalizedPracticeQuestion[];
}>;

/** The library document builders, injected so the schema lives in one place. */
export interface SelfPracticeSetFactories {
  createCourse: (uid: string, title?: string) => MyCourse;
  createModule: (title?: string) => MyCourseModule;
  createResource: (type?: MyCourseResourceType) => MyCourseResource;
}

export interface PlaceSelfPracticeSetInput {
  /** The shelf course when it already exists, else null. */
  course?: MyCourse | null;
  /** Signed-in learner — required only when the shelf course must be created. */
  uid?: string;
  /** Player scope the set belongs to (`storageProductId`). */
  productId: string;
  /** Course title, shown in the Study Library and used as the module fallback. */
  courseTitle?: string;
  /** Module the learner was watching — the shelf module the set is filed under. */
  moduleTitle?: string;
  /** Set name (Brain card title). */
  name: string;
  questions: MyCourseQuestion[];
}

export declare const placeSelfPracticeSet: (
  input: PlaceSelfPracticeSetInput,
  factories: SelfPracticeSetFactories,
) => {
  /** The document to `myLibrary.save`, or null when the draft is incomplete. */
  course: MyCourse | null;
  resource: MyCourseResource | null;
  /** `[]` when the set was placed; otherwise why it was not. */
  issues: string[];
};
