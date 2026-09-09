import type { Attachment } from "../lib/types";
import type { CourseCtx } from "./types";

/* ─────────────────────────────────────────────────────────────
   IMAGE / SCREENSHOT UNDERSTANDING LAYER
   Classifies what an attached image plausibly contains from its
   provenance (upload vs. region capture), filename signals and
   the live course context. Honesty gate: when confidence is low,
   the tutor asks instead of hallucinating content.
   ───────────────────────────────────────────────────────────── */

export type ImageKind = "lesson-capture" | "question" | "solution-attempt" | "diagram" | "notes" | "mcq" | "unknown";

export interface ImageRead {
  kind: ImageKind;
  confidence: number;
  signal: string;
  name: string;
}

const SIGNALS: [RegExp, ImageKind, string][] = [
  [/slide|lecture|lesson|player|frame|video/i, "lesson-capture", "filename suggests a lesson capture"],
  [/question|problem|exercise|hw|homework|q\d/i, "question", "filename suggests a set question"],
  [/solution|attempt|my.?work|workings|answer|draft|hand/i, "solution-attempt", "filename suggests an attempted solution"],
  [/diagram|figure|graph|chart|plot|structure|map/i, "diagram", "filename suggests a figure or diagram"],
  [/notes?|summary|cheat/i, "notes", "filename suggests study notes"],
  [/mcq|multiple|choice|test/i, "mcq", "filename suggests a multiple-choice item"],
];

export function readAttachments(attachments: Attachment[], course: CourseCtx): ImageRead[] {
  return attachments.map((a) => {
    for (const [re, kind, signal] of SIGNALS) {
      if (re.test(a.name)) return { kind, confidence: 0.85, signal, name: a.name };
    }
    if (a.kind === "screenshot" && course.inPlayer) {
      return {
        kind: "lesson-capture",
        confidence: 0.7,
        signal: `captured while ${course.lesson} is playing (${course.chapter})`,
        name: a.name,
      };
    }
    if (a.kind === "screenshot") return { kind: "lesson-capture", confidence: 0.55, signal: "region capture while studying", name: a.name };
    // A generically-named upload carries too little evidence to describe honestly.
    return { kind: "unknown", confidence: 0.25, signal: "no reliable signals in the image", name: a.name };
  });
}

export function isAmbiguous(reads: ImageRead[]): boolean {
  return reads.some((r) => r.kind === "unknown");
}

export function describeForSpeech(reads: ImageRead[]): string {
  const r = reads[0];
  switch (r.kind) {
    case "lesson-capture":
      return "a capture of your course content";
    case "question":
      return "a study question";
    case "solution-attempt":
      return "your attempted solution";
    case "diagram":
      return "a diagram or figure";
    case "notes":
      return "study notes";
    case "mcq":
      return "a multiple-choice question";
    default:
      return "an image";
  }
}
