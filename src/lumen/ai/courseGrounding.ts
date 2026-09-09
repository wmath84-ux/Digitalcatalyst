import { fmtTime, getAdapter } from "../course/adapters";
import { ensureContent, peekContent } from "../course/contentService";
import { formatForModel, retrieve } from "../course/retrieval";
import type { CurrentResourceContext, RetrievalResult } from "../course/types";
import type { Attachment } from "../lib/types";
import { routeQuery, type RouteDecision } from "./queryRouter";

/* ─────────────────────────────────────────────────────────────
   COURSE GROUNDING
   Bridges router → retrieval → tutor prose. Owns the rules that
   keep answers honest: course material wins over generic
   knowledge for lesson questions, and unreadable sources are
   declared, never imagined.
   ───────────────────────────────────────────────────────────── */

const CLAIMS = { userId: "student-aria", courseIds: ["crs-phys-201"] };

export interface Grounding {
  route: RouteDecision;
  ctx: CurrentResourceContext;
  result: RetrievalResult | null;
  /** Position phrasing, e.g. "at 18:42" / "on page 17". */
  positionLabel: string;
  /** Steps to surface in the thinking trace. */
  steps: { label: string; detail?: string }[];
  /** Prose block appended to the answer, with citations. */
  block: string;
  /** True when the tutor must state a limitation instead of answering. */
  blocked: boolean;
}

/** Warm the cache for the active resource (called on resource change). */
export function prefetchActive(ctx: CurrentResourceContext): void {
  if (!ctx.capabilities.searchableChunks) return;
  if (ctx.availability !== "ready" && ctx.availability !== "partial") return;
  void ensureContent(ctx, CLAIMS);
}

function apply(route: RouteDecision, ctx: CurrentResourceContext): CurrentResourceContext {
  // Explicit references override live player position for this query only.
  if (route.explicitTime == null && route.explicitPage == null && route.explicitSlide == null) return ctx;
  return {
    ...ctx,
    playbackState: route.explicitTime != null ? { ...ctx.playbackState, currentTime: route.explicitTime } : ctx.playbackState,
    locationState: {
      ...ctx.locationState,
      ...(route.explicitPage != null ? { currentPage: route.explicitPage } : {}),
      ...(route.explicitSlide != null ? { currentSlide: route.explicitSlide } : {}),
    },
  };
}

export function ground(text: string, attachments: Attachment[], ctx: CurrentResourceContext): Grounding {
  const route = routeQuery(text, attachments, ctx);
  const adapter = getAdapter(ctx.sourceType);
  const steps: { label: string; detail?: string }[] = [];

  const effective = apply(route, ctx);
  const positionLabel = adapter.describePosition(effective.playbackState, effective.locationState, ctx.resource);

  // The router's whole job: skip retrieval when it wouldn't help.
  if (!route.needsContent) {
    if (route.scope === "general") steps.push({ label: "Routing the question", detail: route.reason });
    return { route, ctx: effective, result: null, positionLabel, steps, block: "", blocked: false };
  }

  steps.push({ label: "Reading the open resource", detail: `${adapter.label} · ${positionLabel}` });

  const content = peekContent(ctx.resource.resourceId);
  if (!content) {
    // Not cached yet — kick off extraction for the next turn and be honest now.
    void ensureContent(ctx, CLAIMS);
    if (ctx.availability === "ready" || ctx.availability === "partial") {
      steps.push({ label: "Fetching lesson content", detail: "first read — caching for next time" });
      return {
        route,
        ctx: effective,
        result: null,
        positionLabel,
        steps,
        block: `\n\n---\n\nI'm still pulling in the content for **${ctx.resource.resourceName}** — ask once more in a moment and I'll answer straight from it.`,
        blocked: true,
      };
    }
  }

  const result = retrieve(text, effective, content, {
    scope: route.scope === "current-position" || route.scope === "visual" ? "here" : "resource",
    limit: route.scope === "course-wide" ? 4 : 3,
  });

  const availability = result.availability;

  /* ── honesty gate: no content, no pretending ── */
  if (availability === "permission_required" || availability === "unsupported" || availability === "unavailable") {
    steps.push({ label: "Source can't be read", detail: availability.replace("_", " ") });
    return {
      route,
      ctx: effective,
      result,
      positionLabel,
      steps,
      blocked: true,
      block: `\n\n---\n\n**About this resource:** ${result.note ?? adapter.fallbackMessage(ctx.resource)}`,
    };
  }

  if (!result.chunks.length) {
    steps.push({ label: "No matching passage", detail: "answering from general knowledge" });
    return {
      route,
      ctx: effective,
      result,
      positionLabel,
      steps,
      blocked: false,
      block: `\n\n---\n\n*I couldn't find this specific point in ${ctx.resource.resourceName}, so the above is general — tell me where to look and I'll ground it.*`,
    };
  }

  steps.push({ label: "Retrieving relevant passages", detail: `${result.chunks.length} of ${content?.chunks.length ?? 0} chunks · ${result.strategy}` });

  const primary = result.chunks[0];
  const quoted = result.chunks
    .slice(0, route.scope === "current-position" ? 2 : 3)
    .map((c) => `> ${c.chunk.text}\n>\n> — *${c.citation}*`)
    .join("\n\n");

  const lead =
    route.scope === "current-position"
      ? `Here's what the lesson covers ${positionLabel}:`
      : `From **${ctx.resource.resourceName}**:`;

  return {
    route,
    ctx: effective,
    result,
    positionLabel,
    steps,
    blocked: false,
    block: `${lead}\n\n${quoted}`,
    // primary retained for callers wanting the top citation
    ...(primary ? {} : {}),
  };
}

/** Model-facing context payload (bounded) — what a real LLM call would receive. */
export function contextPayload(g: Grounding): string {
  if (!g.result || !g.result.chunks.length) return "";
  return [
    `ACTIVE_LEARNING_CONTEXT: ${g.ctx.course.courseTitle} › ${g.ctx.module.moduleTitle} › ${g.ctx.resource.resourceName} (${g.ctx.sourceType}), ${g.positionLabel}.`,
    `RETRIEVED (${g.result.strategy}):`,
    formatForModel(g.result),
  ].join("\n");
}

export function positionOf(ctx: CurrentResourceContext): string {
  return getAdapter(ctx.sourceType).describePosition(ctx.playbackState, ctx.locationState, ctx.resource);
}

export { fmtTime };
