// src/lib/myCourseCovers.ts
//
// Fallback cover art for learner-authored courses (My Study Library).
//
// Owner brief (2026-09-29): "agar koi image nahin set karta user to randomly
// koi bhi image set kar di jaaye" — a course that is saved without a cover
// gets one automatically, so every card in the shelf, the builder preview and
// the player identity always shows an image.
//
// Two flavours, both drawing from the SAME bundled pool (the store's own
// course artwork already in public/images — no new binaries):
//
//   · randomCoverImage()      — a true random pick, used when the course is
//                               SAVED (persisted into `coverImage`).
//   · fallbackCoverImage(id)  — a deterministic pick hashed from the course
//                               id, used for DISPLAY before / without a save
//                               (existing courses, previews) so the same
//                               course never flickers between images.
//
// This module is dependency-free on purpose: the client, the adapter, the
// card and the builder can all import it without dragging Firebase along.

/** Bundled course artwork used as automatic covers. All live in public/images. */
export const FALLBACK_COVERS: string[] = [
  "/images/course-webdev.jpg",
  "/images/course-datascience.jpg",
  "/images/course-design.jpg",
  "/images/course-finance.jpg",
  "/images/course-marketing.jpg",
  "/images/course-photography.jpg",
  "/images/course-speaking.jpg",
  "/images/course-uiux.jpg",
  "/images/chemical-reactions.jpg",
  "/images/english-grammar.jpg",
  "/images/mechanics.jpg",
  "/images/real-numbers.jpg",
  "/images/trigonometry.jpg",
  "/images/continue-learning.jpg",
];

/** A true random cover from the pool — persisted when a course saves without one. */
export const randomCoverImage = (): string =>
  FALLBACK_COVERS[Math.floor(Math.random() * FALLBACK_COVERS.length)] || FALLBACK_COVERS[0];

/**
 * A stable pseudo-random cover for a given seed (the course id): same seed,
 * same image — so display-only fallbacks never jump between renders.
 */
export const fallbackCoverImage = (seed = ""): string => {
  if (FALLBACK_COVERS.length === 0) return "";
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_COVERS[hash % FALLBACK_COVERS.length];
};
