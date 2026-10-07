// src/types/myCourse.ts
//
// "My Study Library → self-authored course" — the learner's OWN course.
//
// The Study Library used to be a flat list of saved links. It is now a
// CREATION surface: the learner builds a real course (cover image, title,
// nested modules/folders, resources, and Brain MCQ practice sets) and that
// course opens in the SAME Course Player the official catalogue uses.
//
// One document per course keeps the whole tree (modules → nested modules →
// resources → questions) in a single read, which is what the player needs to
// open instantly and what makes reordering a single write:
//
//   users/{uid}/myCourses/{courseId}
//
// Ownership is re-derived from the PATH by firestore.rules (never from a
// payload field), so a browser can never touch another learner's course.
//
// Every field is Firestore-safe: plain JSON, no `undefined`, no functions.

import type { CourseContentFileType } from "./course";

/** One MCQ of a Brain practice set — byte-identical to the admin's shape. */
export interface MyCourseQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** -1 = no answer marked yet (the editor names it as "answer missing"). */
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}

/**
 * The resource types a learner may author. Same vocabulary as the official
 * Course Player (`CourseFileType`) so the viewer stack, the Brain tab and the
 * AI panel all behave exactly as they do for a purchased course — plus
 * `interactive`, the learner-authored 2D experiment (see
 * `src/utils/experimentSpec.ts`).
 */
export type MyCourseResourceType = CourseContentFileType | "read";

export interface MyCourseResource {
  id: string;
  name: string;
  type: MyCourseResourceType;
  /** Link (`https://…`) or the download URL of an uploaded file. */
  url?: string;
  description?: string;
  /** Original file name when the resource came from an upload. */
  fileName?: string;
  /** Bytes — stored for uploads only. */
  size?: number;
  /** How the file got here: a pasted link or an upload. */
  source?: "link" | "upload";
  /** Brain practice-set title (type "brain" only). */
  practiceTitle?: string;
  /** Brain practice-set questions (type "brain" only). */
  practiceQuestions?: MyCourseQuestion[];
  /**
   * Brain practice set created from the Course Player's Brain tab (type
   * "brain" only): the player scope it belongs to — `String(product.id)` for a
   * purchased course, `mine-<courseId>` for the learner's own. The Brain page
   * lists a set in SELF only when this equals the course being opened
   * (`selfPracticeSetsFromCourses`, utils/selfPracticeSets.js). Resources
   * saved from a course carry no tag, so “saved” and “created here” never
   * blur together.
   */
  practiceSourceProductId?: string;
  /**
   * Read resource origin (type "read" only). A learner's own annotatable PDF:
   * `upload` when it lives in their `userReadUploads/{uid}/…` tree, or one of
   * the public source kinds. Read by
   * `getReadResourcePresentation` (utils/readResources.js), which is what puts
   * the resource in the player's Read library with the annotated PDF.js viewer
   * — the same viewer the official Read PDFs use.
   */
  readSourceKind?: "upload" | "gdrive" | "pdf_url" | "embed_url";
  /** Owned Storage object path (type "read" + sourceKind "upload" only). */
  readStoragePath?: string;
  /** Original PDF filename and size — the Read library's row copy. */
  readFileName?: string;
  readFileSize?: number;
  /**
   * Interactive 2D experiment source (type "interactive" only): ONE
   * self-contained HTML document authored by the learner — usually generated
   * by an AI from the builder's prompt, then pasted or uploaded. Stored inside
   * the course document, so it plays offline in a sandboxed iframe.
   */
  interactiveHtml?: string;
  /**
   * Interactive 2D experiment created from the Course Player's Experiment page
   * (type "interactive" only): the player scope it belongs to — the
   * `storageProductId` of the course it was made in. The Experiment page lists
   * an experiment in SELF only when this equals the course being opened
   * (`selfExperimentsFromCourses`, src/utils/selfExperiments.ts). Resources
   * made in the Study Library carry no tag, so “made here” and “kept in the
   * library” never blur together.
   */
  experimentSourceProductId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MyCourseModule {
  id: string;
  title: string;
  description?: string;
  resources: MyCourseResource[];
  /** Nested folders — a module may hold modules, exactly like the official tree. */
  modules: MyCourseModule[];
  createdAt: number;
  updatedAt: number;
}

export interface MyCourse {
  id: string;
  uid: string;
  title: string;
  description?: string;
  /** Cover image: a hosted URL, or a compact data URL when no host is configured. */
  coverImage?: string;
  modules: MyCourseModule[];
  createdAt: number;
  updatedAt: number;
  /** Bumped whenever the stored shape changes so readers can migrate safely. */
  schemaVersion: number;
}

/** Storage ids are namespaced so a learner's course can never collide with a
 *  catalogue product id (notes, playback, mind maps, progress all key on it). */
export const myCourseStorageId = (courseId: string): string => `mine-${courseId}`;

export const MY_COURSE_TITLE_MAX = 120;
export const MY_COURSE_DESC_MAX = 600;
export const MY_MODULE_TITLE_MAX = 120;
export const MY_MODULE_DESC_MAX = 400;
export const MY_RESOURCE_NAME_MAX = 120;
export const MY_RESOURCE_DESC_MAX = 400;
/** Firestore's 1 MB document limit minus room for the tree itself. */
export const MY_COURSE_MAX_COVER_BYTES = 320 * 1024;
/**
 * Interactive experiments live INSIDE the course document (that is what makes
 * them offline and instant), so they share Firestore's 1 MB document budget.
 * Keep in sync with `utils/myCourseDoc.js` — a contract test pins the pair.
 */
export const MY_EXPERIMENT_MAX_BYTES = 200 * 1024;
export const MY_COURSE_MAX_EXPERIMENT_BYTES = 640 * 1024;
/** Guard rails so one course can never approach the 1 MB document limit. */
export const MY_COURSE_MAX_MODULES = 200;
export const MY_COURSE_MAX_RESOURCES = 400;
export const MY_COURSE_MAX_DEPTH = 4;
