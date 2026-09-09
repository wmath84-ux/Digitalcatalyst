import type { Availability, ContentChunk, CurrentResourceContext, NormalizedTranscript } from "./types";
import { fetchResourceContent, type AccessClaims } from "./server/extractionApi";

/* ─────────────────────────────────────────────────────────────
   CONTENT EXTRACTION SERVICE (client side of the boundary)
   · caches by resourceId + contentHash — never reprocesses
   · de-duplicates concurrent requests for the same resource
   · aborts jobs whose resource is no longer active
   · keeps large payloads OUT of React state (module-level store)
   ───────────────────────────────────────────────────────────── */

export interface ExtractedContent {
  resourceId: string;
  availability: Availability;
  note?: string;
  chunks: ContentChunk[];
  transcript?: NormalizedTranscript;
  contentHash: string;
  fetchedAt: number;
}

const cache = new Map<string, ExtractedContent>();
const inflight = new Map<string, { promise: Promise<ExtractedContent>; controller: AbortController }>();
const listeners = new Set<() => void>();

export function subscribeContent(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((l) => l());

export function peekContent(resourceId: string): ExtractedContent | undefined {
  return cache.get(resourceId);
}

/** Current availability without triggering work. */
export function contentState(ctx: CurrentResourceContext): Availability {
  const cached = cache.get(ctx.resource.resourceId);
  if (cached) return cached.availability;
  if (inflight.has(ctx.resource.resourceId)) return "processing";
  return ctx.resource.availability;
}

/**
 * Ensure content for a resource. Idempotent, deduped, cached.
 * Resolves instantly from cache; otherwise joins the in-flight job.
 */
export function ensureContent(ctx: CurrentResourceContext, claims: AccessClaims): Promise<ExtractedContent> {
  const id = ctx.resource.resourceId;

  const cached = cache.get(id);
  if (cached) return Promise.resolve(cached);

  const running = inflight.get(id);
  if (running) return running.promise; // ← request de-duplication

  /* Access control is enforced before any request leaves. */
  if (ctx.resource.accessState !== "granted") {
    const denied: ExtractedContent = {
      resourceId: id,
      availability: "unavailable",
      note: "You don't have access to this resource.",
      chunks: [],
      contentHash: "none",
      fetchedAt: Date.now(),
    };
    cache.set(id, denied);
    return Promise.resolve(denied);
  }

  /* Types with no legitimate extraction path never hit the network. */
  if (ctx.resource.availability === "unsupported" || ctx.resource.availability === "permission_required") {
    const blocked: ExtractedContent = {
      resourceId: id,
      availability: ctx.resource.availability,
      note: ctx.resource.availabilityNote,
      chunks: [],
      contentHash: "none",
      fetchedAt: Date.now(),
    };
    cache.set(id, blocked);
    return Promise.resolve(blocked);
  }

  const controller = new AbortController();
  const promise = fetchResourceContent({
    courseId: ctx.course.courseId,
    moduleId: ctx.module.moduleId,
    resourceId: id,
    resourceType: ctx.sourceType,
    claims,
    signal: controller.signal,
  })
    .then((res) => {
      const out: ExtractedContent = {
        resourceId: id,
        availability: res.availability,
        note: res.note,
        chunks: res.chunks,
        transcript: res.transcript,
        contentHash: res.contentHash,
        fetchedAt: Date.now(),
      };
      cache.set(id, out); // versioned by contentHash; unchanged content is never re-fetched
      inflight.delete(id);
      emit();
      return out;
    })
    .catch((err: unknown) => {
      inflight.delete(id);
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const out: ExtractedContent = {
        resourceId: id,
        availability: aborted ? "available" : "unavailable",
        note: aborted ? undefined : "Couldn't load this resource's content. You can retry, or send a screenshot.",
        chunks: [],
        contentHash: "none",
        fetchedAt: Date.now(),
      };
      if (!aborted) cache.set(id, out); // aborts stay retryable
      emit();
      return out;
    });

  inflight.set(id, { promise, controller });
  emit();
  return promise;
}

/** Cancel extraction for resources the student has navigated away from. */
export function abortExcept(activeResourceId: string): void {
  for (const [id, job] of inflight) {
    if (id !== activeResourceId) {
      job.controller.abort();
      inflight.delete(id);
    }
  }
}

export function invalidate(resourceId: string): void {
  cache.delete(resourceId);
  emit();
}

export function cacheStats() {
  return { cached: cache.size, inflight: inflight.size };
}
