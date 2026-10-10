// src/course/fileVisibility.ts
//
// The one visibility rule for official lesson files, shared by the Modules
// library and the study overlay. A lesson shows when it has a URL (a Brain set
// is the one URL-less official type and counts when it holds questions), or
// when it is a learner-built interactive experiment with content of its own.
// Notes and mind maps are not lessons and are governed by their own libraries.

import type { CourseFile } from "../types/course";

export const isVisibleFile = (file: CourseFile) =>
  file.accessLevel !== "hidden" && (hasUrlContent(file) || isExperimentFile(file));

/**
 * A `brain` resource is the ONE official file type with no URL — its content is
 * the practice set the admin imported (`practiceQuestions`). It is visible
 * exactly when it holds at least one question.
 */
export const isBrainFile = (file: CourseFile) => file.type === "brain" && (file.practiceQuestions?.length ?? 0) > 0;

/**
 * The OFFICIAL catalogue's visibility rule: a lesson shows when it has a URL —
 * with a Brain set as the one URL-less official type (it counts when it holds
 * questions). `tests/courseBrainPracticeContract.test.mjs` pins this exact
 * expression, because it is what keeps a Brain set out of the viewer stack.
 */
export const hasUrlContent = (file: CourseFile) =>
  (isBrainFile(file) || Boolean(file.url || file.embedUrl || file.youtubeUrl || file.youtubeVideoId));

/**
 * …and an `interactive` 2D experiment is the LEARNER-authored URL-less type:
 * its content is its own HTML (`interactiveHtml`, stored in the course
 * document) or a hosted page. The Modules tab must show both, or a lesson the
 * learner built never appears in their own course.
 */
export const isExperimentFile = (file: CourseFile) =>
  file.type === "interactive"
  && (Boolean(String(file.interactiveHtml || "").trim()) || /^https:\/\//i.test(String(file.url || "").trim()));

