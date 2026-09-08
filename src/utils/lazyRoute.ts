// src/utils/lazyRoute.ts
//
// One tiny helper behind the app's route-level code splitting.
//
// `React.lazy()` alone gives you the split, but it only starts the network
// request when React first tries to RENDER the component — which on a hash
// router means: parse the shell → mount → suspend → fetch the route chunk →
// paint. That extra round trip is exactly the waterfall the perf brief says
// not to create.
//
// `lazyRoute()` returns the same LazyExoticComponent plus a `preload()` that
// kicks off the dynamic import whenever we want, so `src/main.tsx` can:
//
//   • start the CURRENT route's chunk the moment the shell script runs
//     (before React has even rendered — no waterfall), and
//   • warm likely-next routes during idle time / on desktop hover, without
//     ever downloading routes nobody asked for.
//
// The factory is memoised, so preload + render share one request and one
// module instance — calling `preload()` a hundred times costs one fetch.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  /** Start (or join) the dynamic import for this route. Safe to call repeatedly. */
  preload: () => Promise<{ default: T }>;
};

export function lazyRoute<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): PreloadableComponent<T> {
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    // A failed chunk fetch (flaky mobile network, a deploy mid-session) must
    // not be cached as a permanently rejected promise — otherwise the route
    // is dead for the rest of the session. Clear it so the next attempt, or
    // React's own retry on re-render, can try the network again.
    if (!pending) {
      pending = factory().catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
  const Component = lazy(load) as PreloadableComponent<T>;
  Component.preload = load;
  return Component;
}

/**
 * Run `task` when the browser is idle, falling back to a short timeout on
 * engines without requestIdleCallback (older Safari / some Android WebViews).
 * Returns a cancel function so callers can clean up on unmount.
 */
export function onIdle(task: () => void, timeout = 2_000): () => void {
  if (typeof window === "undefined") return () => undefined;
  const idle = (window as unknown as {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  });
  if (typeof idle.requestIdleCallback === "function") {
    const handle = idle.requestIdleCallback(task, { timeout });
    return () => idle.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(task, Math.min(timeout, 1_200));
  return () => window.clearTimeout(handle);
}

/**
 * True when the device/user has told us to be frugal: Save-Data is on, or the
 * effective connection type is 2g/slow-2g. Used to skip *speculative* work
 * (prefetching a route the learner has not asked for yet). Never used to skip
 * something the user actually requested.
 */
export function prefersReducedData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return false;
  if (connection.saveData === true) return true;
  const type = String(connection.effectiveType || "");
  return type === "slow-2g" || type === "2g";
}

// ── Route preloading, without an import cycle ───────────────────────────────
// `src/main.tsx` owns the hash → chunk map (it is where the lazy routes are
// declared) but it also imports the shell components, so a component cannot
// import it back. It registers its resolver here instead, and any component
// — the desktop rail, a nav item, a card — can ask for a route to be warmed
// through this neutral module.

let routePreloader: ((hash: string) => void) | null = null;

/** Called once by main.tsx with its hash → lazy-chunk resolver. */
export function setRoutePreloader(fn: (hash: string) => void): void {
  routePreloader = fn;
}

/**
 * Warm the chunk for `hash` because the user is *likely* to go there next
 * (pointer over a rail item, keyboard focus on a nav entry). Speculative by
 * definition, so it is skipped entirely on Save-Data / 2G connections.
 */
export function prefetchRoute(hash: string): void {
  if (!routePreloader || !hash) return;
  if (prefersReducedData()) return;
  routePreloader(hash);
}

