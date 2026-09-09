import type { Attachment } from "../lib/types";
import type { CurrentResourceContext } from "../course/types";

/* ─────────────────────────────────────────────────────────────
   AI QUERY ROUTER
   Classifies the question BEFORE any retrieval runs, so we fetch
   the minimum necessary context. "What is Newton's third law?"
   must never pull a 24-page PDF.
   ───────────────────────────────────────────────────────────── */

export type QueryScope =
  | "general"           // model knowledge is enough
  | "current-position"  // "what did sir just say", "explain this slide"
  | "current-resource"  // about this resource, not a specific spot
  | "visual"            // about an attached image / screenshot
  | "course-wide"       // spans the module
  | "conversation"      // about our chat, not the course
  | "practice";         // generate questions

export interface RouteDecision {
  scope: QueryScope;
  needsContent: boolean;
  needsVisual: boolean;
  /** Human-readable reason, surfaced in the thinking trace. */
  reason: string;
  /** Explicit position reference found in the text, e.g. 21 → 21:00. */
  explicitTime?: number;
  explicitPage?: number;
  explicitSlide?: number;
}

const DEICTIC =
  /\b(this|that|here|current(ly)?|on screen|on-screen|the screen|right now|shown|above|below|just (now|said|say|saying|explain(ed)?|cover(ed)?|show(ed)?|mention(ed)?|did)|(sir|ma'?am|teacher|prof(essor)?|he|she) (just |now )?(said|say|explain|explained|cover|covered|mean|meant)|what.{0,12}(just|right now))\b/;
const POSITIONAL = /\b(slide|page|timestamp|minute|min|at \d|section|chapter|sheet|cell|row|column|branch|node|figure|diagram|graph|table)\b/;
const GENERAL_DEF = /\b(what is|define|definition of|who (was|is)|formula for|state the)\b/;
const COURSE_WIDE = /\b(this (course|module|chapter|unit)|whole (course|chapter)|overall|syllabus|everything we|so far)\b/;
const CONVO = /\b(you (said|told)|earlier you|our (chat|conversation)|before you|previous answer)\b/;
const PRACTICE = /\b(practice|quiz|test me|drill|check-?up|mcq|questions? (on|about))\b/;

function parseTimeRef(t: string): number | undefined {
  const clock = /\b(\d{1,2}):(\d{2})\b/.exec(t);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const mins = /\b(?:at|around|near)?\s*(\d{1,3})\s*(?:min(?:ute)?s?|m)\b/.exec(t);
  if (mins) return Number(mins[1]) * 60;
  return undefined;
}

export function routeQuery(text: string, attachments: Attachment[], ctx: CurrentResourceContext): RouteDecision {
  const t = text.toLowerCase().trim();
  const caps = ctx.capabilities;
  const hasContent = caps.searchableChunks && (ctx.availability === "ready" || ctx.availability === "partial");

  // 1. A fresh attachment is the single strongest signal of intent.
  if (attachments.length) {
    const shot = attachments.some((a) => a.kind === "screenshot");
    return {
      scope: "visual",
      needsContent: hasContent, // still ground the image in the lesson
      needsVisual: true,
      reason: shot ? "screenshot of the current screen" : "attached image",
    };
  }

  if (PRACTICE.test(t)) {
    return { scope: "practice", needsContent: hasContent, needsVisual: false, reason: "practice generation from the active lesson" };
  }

  if (CONVO.test(t)) {
    return { scope: "conversation", needsContent: false, needsVisual: false, reason: "refers to our conversation, not the resource" };
  }

  const explicitTime = parseTimeRef(t);
  const explicitPage = /\bpage\s*(\d{1,3})\b/.exec(t)?.[1];
  const explicitSlide = /\bslide\s*(\d{1,3})\b/.exec(t)?.[1];

  // 2. Explicit or deictic pointers → anchor to the student's position.
  if (explicitTime != null || explicitPage || explicitSlide || (DEICTIC.test(t) && ctx.activeState.active) || (POSITIONAL.test(t) && DEICTIC.test(t))) {
    return {
      scope: "current-position",
      needsContent: hasContent,
      needsVisual: !hasContent && caps.visual,
      reason: explicitTime != null ? "explicit timestamp reference" : explicitPage ? "explicit page reference" : explicitSlide ? "explicit slide reference" : "refers to what's on screen",
      explicitTime,
      explicitPage: explicitPage ? Number(explicitPage) : undefined,
      explicitSlide: explicitSlide ? Number(explicitSlide) : undefined,
    };
  }

  if (COURSE_WIDE.test(t)) {
    return { scope: "course-wide", needsContent: hasContent, needsVisual: false, reason: "spans the whole module" };
  }

  // 3. Textbook definition with no pointer → model knowledge is cheaper
  //    and better. Deliberately skips retrieval entirely.
  if (GENERAL_DEF.test(t) && !POSITIONAL.test(t)) {
    return { scope: "general", needsContent: false, needsVisual: false, reason: "general question — no lesson retrieval needed" };
  }

  // 4. Otherwise: topical question while a resource is open → check it.
  if (ctx.activeState.active && hasContent) {
    return { scope: "current-resource", needsContent: true, needsVisual: false, reason: "checking the open resource first" };
  }

  return { scope: "general", needsContent: false, needsVisual: false, reason: "general question" };
}
