// src/utils/lazyChunk.ts
//
// React.lazy with chunk-fetch recovery.
//
// The Course Player lazy-loads its heavy panels (MindMapPanel / @xyflow/react,
// SketchPanel / Excalidraw, the AI chat). Those imports fail in one specific,
// recoverable way the plain `lazy(() => import(...))` treats as fatal:
//
//   "Failed to fetch dynamically imported module:
//    https://…/assets/MindMapPanel-<hash>.js"
//
// That is the STALE-DEPLOY signature. A new build replaces every content-
// hashed chunk; a tab still running the previous build — or the service
// worker's cached index.html answering on a network blip — then requests a
// hashed file that no longer exists and gets a 404. A transient network drop
// produces the same error text. In both cases the cure is the same:
//
//   1. retry the import a couple of times (rides out a network blip), then
//   2. reload the page ONCE (the fresh index.html + fresh chunk names), with
//      a cooldown so a genuinely broken deploy can never reload-loop.
//
// The cooldown marker is shared with CoursePlayerErrorBoundary, which runs
// the same recovery for chunk errors raised outside these wrappers (any
// other route chunk) — at most one automatic reload per minute, whoever
// asks first.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors React.lazy's own `T extends ComponentType<any>` bound. */

/** Extra attempts after the first one, with growing pauses between them. */
const CHUNK_RETRY_DELAYS_MS = [400, 1000];

/** sessionStorage marker of the last automatic stale-build reload. */
export const CHUNK_RELOAD_AT_KEY = "dc.courseChunkReloadAt";

/** At most one automatic reload per this window — a broken deploy must not loop. */
export const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

/** The error texts browsers use when a `import()` target cannot be fetched. */
const MODULE_FETCH_ERROR = /dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to fetch|NetworkError/i;

/** True for the recoverable "the chunk could not be fetched" class of errors. */
export const isModuleFetchError = (error: unknown): boolean => {
  if (error instanceof Error) {
    if (MODULE_FETCH_ERROR.test(error.message)) return true;
    // Vite wraps the fetch failure; the cause carries the browser's own text.
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && MODULE_FETCH_ERROR.test(cause.message)) return true;
  }
  return false;
};

/**
 * One automatic page reload for a stale build. Returns true while the page is
 * going down (callers keep their Suspense fallback up); false when the
 * cooldown is still running — the caller then surfaces the error instead, so
 * a persistently broken deploy ends on the recovery screen, never a loop.
 */
export const recoverStaleBuildOnce = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_AT_KEY) || 0);
    if (Number.isFinite(last) && last > 0 && Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(Date.now()));
  } catch {
    // Storage denied (private mode): without a marker a reload could loop, so
    // surface the error instead and let the learner reload by hand.
    return false;
  }
  window.location.reload();
  return true;
};

/**
 * `React.lazy` that retries a failed chunk fetch and, when the failure is the
 * stale-deploy kind, reloads the page once to pick up the new build instead
 * of dropping the learner on the crash screen.
 */
export function lazyWithChunkRecovery<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= CHUNK_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await load();
      } catch (error) {
        lastError = error;
        const retryable = isModuleFetchError(error);
        if (!retryable || attempt === CHUNK_RETRY_DELAYS_MS.length) break;
        await new Promise((resolve) => window.setTimeout(resolve, CHUNK_RETRY_DELAYS_MS[attempt]));
      }
    }
    if (isModuleFetchError(lastError) && recoverStaleBuildOnce()) {
      // The page is reloading: never settle, so React keeps the Suspense
      // fallback up for the moment before the document goes away.
      return new Promise<{ default: T }>(() => undefined);
    }
    throw lastError;
  });
}
