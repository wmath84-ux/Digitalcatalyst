/* ─────────────────────────────────────────────────────────────
   Performance configuration + micro-utilities.
   Every tunable lives here — nothing is hardcoded throughout
   the codebase. Adjust once, apply everywhere.
   ───────────────────────────────────────────────────────────── */

export const PERF = {
  /** Messages shown when a chat opens (initial page). */
  CHAT_INITIAL_PAGE: 5,
  /** Messages added per upward pagination step. */
  CHAT_PAGE_SIZE: 10,
  /** How far above the list top the prefetch sentinel arms itself. */
  CHAT_PREFETCH_MARGIN: 420,
  /** Simulated fetch latency for a page of history (ms). */
  PAGE_LATENCY_MS: 240,
  /** Stream UI commits — batch tokens so React renders ≤ ~20×/s. */
  STREAM_COMMIT_MS: 55,
  /** Words revealed per streamed commit (alternated ±1 for a natural pace). */
  STREAM_WORDS: 4,
  /** Min interval between programmatic scrolls while streaming (ms). */
  STREAM_SCROLL_MS: 150,
  /** Debounce for persisting composer drafts (ms). */
  DRAFT_SYNC_MS: 250,
  /** ResizeObserver width quantization (px) — kills subpixel churn. */
  RESIZE_EPSILON: 1,
  /** Screenshot raster scale cap and JPEG quality. */
  SHOT_SCALE_MAX: 1.5,
  SHOT_JPEG_QUALITY: 0.85,
  /** Max exported screenshot edge (px) — bounds memory + upload size. */
  SHOT_MAX_EDGE: 2200,
} as const;

/** Throttle: run at most once per `ms`, always with the latest args. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let timer = 0;
  let lastArgs: A | null = null;
  const invoke = () => {
    last = performance.now();
    timer = 0;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };
  return (...args: A) => {
    lastArgs = args;
    const now = performance.now();
    if (now - last >= ms) {
      window.clearTimeout(timer);
      invoke();
    } else if (!timer) {
      timer = window.setTimeout(invoke, ms - (now - last));
    }
  };
}

/** rAF-coalesced runner — collapses bursts into one call per frame. */
export function rafCoalesce<A extends unknown[]>(fn: (...args: A) => void) {
  let frame = 0;
  return (...args: A) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn(...args);
    });
  };
}

/* ── lightweight instrumentation (negligible cost, dev-only reads) ── */

const counters: Record<string, number> = {
  streamCommits: 0,
  messageRenders: 0,
  paginationLoads: 0,
  markdownParses: 0,
  handlerCalls: 0,
};

export const perf = {
  bump(key: keyof typeof counters, by = 1) {
    counters[key] += by;
  },
  snapshot() {
    return { ...counters };
  },
  reset() {
    Object.keys(counters).forEach((k) => (counters[k] = 0));
  },
};

/**
 * Split streaming text into a stable prefix (whole paragraphs, safe to
 * markdown-render once per paragraph) and a volatile tail (rendered as
 * cheap plain text while streaming). Keeps code fences intact.
 */
export function splitStable(text: string): { stable: string; tail: string } {
  const fenceHits = text.match(/```/g)?.length ?? 0;
  if (fenceHits % 2 === 1) {
    // Inside an open code fence — keep the whole fence in the tail.
    const start = text.lastIndexOf("```");
    return { stable: text.slice(0, start).trimEnd(), tail: text.slice(start) };
  }
  const idx = text.lastIndexOf("\n\n");
  if (idx <= 0) return { stable: "", tail: text };
  return { stable: text.slice(0, idx).trimEnd(), tail: text.slice(idx + 2) };
}
