// src/types/personalCourse.ts
//
// Personal Course Modules ("My Modules") — the student-created content model
// for the Course Player. This is a PAID, user-owned supplement to the
// official course: the learner builds their own modules/resources inside a
// course they can already access. It is deliberately a SEPARATE model from
// the instructor's `CourseModule` / `CourseFile` tree:
//
//   · official course documents are never mutated by this feature;
//   · ownership is always derived from the authenticated uid (server-side),
//     never from a client-supplied `ownerUid`;
//   · entitlement + per-plan/per-cycle limits are enforced by the
//     authoritative API layer (`/api/personal-course`) and by
//     firestore.rules, never only by the UI.
//
// Firestore layout (all under the user's own namespace, owner-read only):
//
//   users/{uid}/personalCourseModules/{moduleId}
//     ├─ … resources live in the subcollection:
//     users/{uid}/personalCourseModules/{moduleId}/resources/{resourceId}
//   users/{uid}/personalCourseUsage/{productId}     (server-maintained counts)
//
// Types are intentionally structurally compatible with `CourseFileType`
// (`src/types/course.ts` stays the source of truth for the type union), so a
// personal resource opens through the exact same ResourceViewer / embed path
// as the official file with the same type.

import type { CourseFileType } from "./course";

/** Firestore doc: `users/{uid}/personalCourseModules/{moduleId}`. */
export interface PersonalCourseModule {
  /** Server-generated doc id. */
  id: string;
  /** Always the authenticated user's uid; set by the server, never the client. */
  ownerUid: string;
  /** The course/product this module belongs to (`siteProducts/{productId}`). */
  productId: string;
  title: string;
  description: string;
  /** 0-based order inside the learner's module list for this product. */
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Firestore doc:
 * `users/{uid}/personalCourseModules/{moduleId}/resources/{resourceId}`.
 *
 * The URL/embed fields mirror the official `CourseFile` vocabulary exactly
 * (`url` / `embedUrl` / `youtubeUrl` / `youtubeVideoId` / `provider` /
 * `contentType`) so the existing resource adapter + ResourceViewer consume a
 * personal resource unchanged.
 */
export interface PersonalCourseResource {
  /** Server-generated doc id. */
  id: string;
  ownerUid: string;
  productId: string;
  /** Owning personal module doc id. */
  personalModuleId: string;
  name: string;
  type: CourseFileType;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  provider?: string;
  contentType?: string;
  /** 0-based order inside the module's resource list. */
  sortOrder: number;
  /** Original user-pasted URL (canonical forms live in `url` etc.). */
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
}

/** Server-maintained usage counters for one user + product. */
export interface PersonalCourseUsage {
  ownerUid: string;
  productId: string;
  moduleCount: number;
  resourceCount: number;
  updatedAt: number;
}

/** A resource with its owning module's display info (list view). */
export type PersonalCourseResourceRow = PersonalCourseResource;

/** A module with its resources hydrated (panel view model). */
export interface PersonalCourseModuleTree {
  module: PersonalCourseModule;
  resources: PersonalCourseResource[];
}
