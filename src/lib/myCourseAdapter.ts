// src/lib/myCourseAdapter.ts
//
// The bridge between a learner-authored course (src/types/myCourse.ts) and the
// Course Player.
//
// The player is unchanged: it still receives a `Product` whose `courseContent`
// is the module tree, so every surface the learner expects from a purchased
// course — the viewer stack, the Modules tab, the Brain practice tab, Notes,
// the Mind map, the AI chat and the Player settings — works on their own
// course with no second implementation.
//
// Two ids are namespaced on purpose:
//
//   · `product.id` is `mine-<courseId>` so notes, playback positions, mind
//     maps and progress land in their OWN storage and can never be mixed with
//     an official course's (or with another learner's).
//   · file / module ids are kept verbatim, so a learner's deep links and mind
//     maps survive an edit that only renamed something.

import type { Product } from "../data/products";
import type { CourseFile, CourseModule, CoursePracticeQuestion } from "../types/course";
import { myCourseStorageId, type MyCourse, type MyCourseModule, type MyCourseResource } from "../types/myCourse";

const isBrainResource = (resource: MyCourseResource): boolean =>
  resource.type === "brain" && (resource.practiceQuestions?.length ?? 0) > 0;

/** A resource the player can actually open (a link, an upload, or a Brain set). */
export const myResourceIsPlayable = (resource: MyCourseResource): boolean =>
  isBrainResource(resource) || Boolean(String(resource.url || "").trim());

const toPracticeQuestions = (resource: MyCourseResource): CoursePracticeQuestion[] | undefined => {
  if (resource.type !== "brain") return undefined;
  return (resource.practiceQuestions || []).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    difficulty: question.difficulty,
    topic: question.topic,
  }));
};

const toCourseFile = (resource: MyCourseResource): CourseFile => ({
  id: resource.id,
  name: resource.name || (resource.type === "brain" ? "Practice set" : "Resource"),
  type: resource.type,
  url: resource.url || undefined,
  description: resource.description || undefined,
  provider: resource.source === "upload" ? "upload" : "link",
  accessLevel: "included",
  // No `source: "personal"` on purpose — this is not an official course's
  // borrowed resource, it is the learner's own course. The player therefore
  // treats it exactly like a purchased course (progress, completion, notes),
  // while every store it writes to is namespaced by `mine-<courseId>`.
  practiceQuestions: toPracticeQuestions(resource),
  practiceTitle: resource.type === "brain" ? resource.practiceTitle || resource.name : undefined,
});

const toCourseModule = (module: MyCourseModule): CourseModule => ({
  id: module.id,
  title: module.title || "Untitled module",
  accessLevel: "included",
  files: module.resources.filter(myResourceIsPlayable).map(toCourseFile),
  modules: module.modules.map(toCourseModule),
});

/** Every module id in the tree — the player grants them all (it is their course). */
export const collectMyModuleIds = (modules: MyCourseModule[]): string[] => {
  const ids: string[] = [];
  const visit = (node: MyCourseModule) => {
    ids.push(node.id);
    node.modules.forEach(visit);
  };
  modules.forEach(visit);
  return ids;
};

/** The player-facing `Product` for one learner-authored course. */
export const myCourseToProduct = (course: MyCourse): Product => ({
  id: myCourseStorageId(course.id),
  title: course.title || "Untitled course",
  instructor: "My own course",
  image: course.coverImage || "",
  category: "Course",
  classLevel: "My Study Library",
  subject: "Self study",
  tags: ["my-study-library"],
  rating: 0,
  reviews: 0,
  originalPrice: 0,
  price: 0,
  isFree: true,
  description: course.description || "",
  courseContent: course.modules.map(toCourseModule),
});
