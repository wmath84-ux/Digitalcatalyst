import { fmtTime, getAdapter } from "./adapters";
import type { ContentChunk, CurrentResourceContext, RetrievalResult, RetrievedChunk } from "./types";
import type { ExtractedContent } from "./contentService";

/* ─────────────────────────────────────────────────────────────
   CONTEXT RETRIEVAL SERVICE
   Never "send everything". Scores chunks by lexical overlap and
   boosts the student's *current location* hard, so the answer is
   grounded where they actually are. Every hit carries provenance.
   ───────────────────────────────────────────────────────────── */

const STOP = new Set([
  "the","a","an","is","are","was","were","of","to","in","on","at","for","and","or","but","this","that","these","those",
  "it","its","what","why","how","when","which","who","do","does","did","can","could","would","should","i","me","my",
  "you","your","he","she","they","we","us","about","just","now","please","explain","tell","said","say","sir","teacher",
]);

function terms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s'’-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function citationFor(chunk: ContentChunk, resourceName: string): string {
  const l = chunk.loc;
  if (l.timestampStart != null) return `${resourceName} · around ${fmtTime(l.timestampStart)}`;
  if (l.page != null) return `${resourceName} · page ${l.page}`;
  if (l.slide != null) return `${resourceName} · slide ${l.slide}`;
  if (l.sheet) return `${resourceName} · sheet “${l.sheet}”${l.range ? ` (${l.range})` : ""}`;
  if (l.chapter || l.section) return `${resourceName} · ${[l.chapter, l.section].filter(Boolean).join(" › ")}`;
  if (l.node) return `${resourceName} · concept-map node`;
  return resourceName;
}

/** Distance-decayed boost so "what did sir just say" lands on *now*. */
function proximityBoost(chunk: ContentChunk, ctx: CurrentResourceContext): number {
  const loc = getAdapter(ctx.sourceType).locate(ctx.playbackState, ctx.locationState);
  const c = chunk.loc;

  if (loc.timestampStart != null && c.timestampStart != null) {
    const end = c.timestampEnd ?? c.timestampStart;
    if (loc.timestampStart >= c.timestampStart && loc.timestampStart <= end) return 6; // inside the current window
    const gap = Math.min(Math.abs(loc.timestampStart - c.timestampStart), Math.abs(loc.timestampStart - end));
    if (gap < 60) return 4;
    if (gap < 180) return 2.2;
    if (gap < 420) return 1;
    return 0;
  }
  if (loc.page != null && c.page != null) {
    const gap = Math.abs(loc.page - c.page);
    return gap === 0 ? 6 : gap === 1 ? 3 : gap <= 3 ? 1.2 : 0;
  }
  if (loc.slide != null && c.slide != null) {
    const gap = Math.abs(loc.slide - c.slide);
    return gap === 0 ? 6 : gap === 1 ? 2.5 : 0;
  }
  if (loc.chapter && c.chapter === loc.chapter) return 2.5;
  if (loc.sheet && c.sheet === loc.sheet) return 2;
  return 0;
}

export interface RetrieveOptions {
  /** "here" = anchor to current position, "resource" = whole resource. */
  scope: "here" | "resource";
  limit?: number;
}

export function retrieve(
  query: string,
  ctx: CurrentResourceContext,
  content: ExtractedContent | undefined,
  opts: RetrieveOptions
): RetrievalResult {
  const availability = content?.availability ?? ctx.availability;
  const note = content?.note ?? ctx.availabilityNote;

  if (!content || content.chunks.length === 0) {
    return { chunks: [], availability, note, strategy: "no extractable content" };
  }

  const qt = terms(query);
  const limit = opts.limit ?? 3;

  const scored: RetrievedChunk[] = content.chunks.map((chunk) => {
    const hay = `${chunk.heading ?? ""} ${chunk.text}`.toLowerCase();
    let lexical = 0;
    for (const t of qt) if (hay.includes(t)) lexical += t.length > 6 ? 1.6 : 1;
    const prox = opts.scope === "here" ? proximityBoost(chunk, ctx) : proximityBoost(chunk, ctx) * 0.35;
    return { chunk, score: lexical + prox, citation: citationFor(chunk, ctx.resource.resourceName) };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, limit);

  // Positional questions with no lexical hit still deserve the current window.
  if (!top.length && opts.scope === "here") {
    const nearest = scored
      .map((s) => ({ ...s, score: proximityBoost(s.chunk, ctx) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    if (nearest.length) return { chunks: nearest, availability, note, strategy: "current-position window" };
  }

  return {
    chunks: top,
    availability,
    note,
    strategy: top.length ? (opts.scope === "here" ? "position-weighted retrieval" : "resource-wide retrieval") : "no relevant passage",
  };
}

/** Compact, model-ready context block — bounded, never the whole file. */
export function formatForModel(result: RetrievalResult): string {
  return result.chunks.map((c, i) => `[${i + 1}] (${c.citation})\n${c.chunk.text}`).join("\n\n");
}
