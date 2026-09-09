import type { Course, CourseResource, ResourceNote } from "./types";

/* ─────────────────────────────────────────────────────────────
   COURSE LIBRARY (fixture of the platform's course tree)
   Availability values here mirror what a real deployment would
   resolve: some sources are authorized and extractable, others
   genuinely are not. Nothing claims access it does not have.
   ───────────────────────────────────────────────────────────── */

const R = (r: CourseResource) => r;

export const PHYSICS_MODULE_RESOURCES: CourseResource[] = [
  R({
    resourceId: "res-yt-emi",
    resourceName: "Electromagnetic Induction — full lesson",
    resourceType: "youtube",
    resourceUrl: "https://www.youtube.com/watch?v=EMI-lecture-04",
    provider: "youtube",
    duration: 2280,
    availability: "ready", // course-owner supplied transcript
    availabilityNote: "Transcript provided by the course owner.",
    accessState: "granted",
    completion: 0.62,
  }),
  R({
    resourceId: "res-mp4-lenz",
    resourceName: "Lenz's Law — lab demonstration.mp4",
    resourceType: "video",
    resourceUrl: "/course/physics/lenz-demo.mp4",
    provider: "self-hosted",
    duration: 415,
    availability: "ready", // WebVTT sidecar
    availabilityNote: "Captions from the bundled WebVTT track.",
    accessState: "granted",
    completion: 0.2,
  }),
  R({
    resourceId: "res-audio-recap",
    resourceName: "Chapter 4 audio recap",
    resourceType: "audio",
    resourceUrl: "/course/physics/ch4-recap.m4a",
    provider: "self-hosted",
    duration: 348,
    availability: "ready",
    availabilityNote: "Course-generated transcript.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-pdf-ch4",
    resourceName: "Chapter 4 — Electromagnetic Induction.pdf",
    resourceType: "pdf",
    resourceUrl: "/course/physics/ch4.pdf",
    provider: "self-hosted",
    pageCount: 24,
    availability: "ready", // server-side ingestion
    availabilityNote: "Text extracted server-side during ingestion.",
    accessState: "granted",
    completion: 0.35,
  }),
  R({
    resourceId: "res-doc-notes",
    resourceName: "Faraday's Law — teaching notes",
    resourceType: "doc",
    resourceUrl: "https://docs.google.com/document/d/EMI-notes-4/preview",
    provider: "google",
    availability: "ready", // course owner authorized Docs API
    availabilityNote: "Imported via the course owner's Google Docs authorization.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-sheet-data",
    resourceName: "Induction experiment — readings",
    resourceType: "sheet",
    resourceUrl: "https://docs.google.com/spreadsheets/d/EMI-data-4/preview",
    provider: "google",
    availability: "ready",
    availabilityNote: "Imported via the course owner's Google Sheets authorization.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-slides-deck",
    resourceName: "EMI revision deck",
    resourceType: "slides",
    resourceUrl: "https://docs.google.com/presentation/d/EMI-deck-4/embed",
    provider: "google",
    slideCount: 6,
    availability: "ready",
    availabilityNote: "Slide text imported; speaker notes included where shared.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-ebook-phys",
    resourceName: "Foundations of Physics (EPUB) — Ch. 4",
    resourceType: "ebook",
    resourceUrl: "/course/physics/foundations.epub",
    provider: "self-hosted",
    availability: "ready",
    availabilityNote: "EPUB parsed into chapter/section chunks.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-img-setup",
    resourceName: "Induction coil setup — figure 4.7",
    resourceType: "image",
    resourceUrl: "/images/binary-search-slide.png",
    provider: "self-hosted",
    availability: "available", // analyzed on demand, then cached
    availabilityNote: "Visual analysis runs on first question, then caches.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-form-quiz",
    resourceName: "Chapter 4 self-check form",
    resourceType: "google_form",
    resourceUrl: "https://docs.google.com/forms/d/EMI-check-4/viewform",
    provider: "google",
    availability: "permission_required",
    availabilityNote: "This course has no Google Forms API authorization, so form questions can't be read.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-embed-sim",
    resourceName: "Faraday coil simulator (CodePen)",
    resourceType: "embed",
    resourceUrl: "https://codepen.io/embed/faraday-coil-sim",
    provider: "codepen",
    availability: "unsupported",
    availabilityNote: "Third-party sandboxed embed — its internal content cannot be read.",
    accessState: "granted",
  }),
  R({
    resourceId: "res-map-emi",
    resourceName: "EMI concept map",
    resourceType: "mindmap",
    resourceUrl: "https://whimsical.com/emi-concept-map",
    provider: "whimsical",
    availability: "partial",
    availabilityNote: "Course owner exported the node tree; visual styling isn't included.",
    accessState: "granted",
  }),
];

export const PHYSICS_COURSE: Course = {
  courseId: "crs-phys-201",
  courseTitle: "PHYS 201 · Electricity & Magnetism",
  subject: "Physics",
  modules: [
    {
      moduleId: "mod-ch4",
      moduleTitle: "Chapter 4 · Electromagnetic Induction",
      lessonId: "les-4-2",
      lessonTitle: "Faraday's & Lenz's Laws",
      resources: PHYSICS_MODULE_RESOURCES,
    },
  ],
};

export const RESOURCE_NOTES: ResourceNote[] = [
  {
    noteId: "n1",
    resourceId: "res-yt-emi",
    text: "Sir said the minus sign in Faraday's law is the whole of Lenz's law — don't treat them as two separate formulas.",
    loc: { timestampStart: 1105 },
    createdAt: Date.now() - 1000 * 60 * 90,
  },
  {
    noteId: "n2",
    resourceId: "res-pdf-ch4",
    text: "Worked example 4.3 (page 17) is the one closest to the exam pattern.",
    loc: { page: 17 },
    createdAt: Date.now() - 1000 * 60 * 200,
  },
  {
    noteId: "n3",
    resourceId: "res-slides-deck",
    text: "Slide 4 diagram = the one I keep getting wrong on direction of induced current.",
    loc: { slide: 4 },
    createdAt: Date.now() - 1000 * 60 * 30,
  },
];

export function findResource(resourceId: string): CourseResource | undefined {
  return PHYSICS_MODULE_RESOURCES.find((r) => r.resourceId === resourceId);
}
