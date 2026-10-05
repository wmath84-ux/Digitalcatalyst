/**
 * Revision route context.
 * ======================
 *
 * The ported Recall tree navigates through the store's in-component `view`
 * (upstream had no router), while Digitalcatalyst navigates by hash. This
 * context is the single bridge: the shell publishes the current route and a
 * `navigate()` that goes through the feature's ExitGuard, and both the ported
 * chrome (an override of `app-shell.tsx`) and the new Digitalcatalyst surfaces
 * read it.
 *
 * Keeping the bridge in one place is what lets a re-port keep upstream's
 * components untouched: they never learn about hashes.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { parseRevisionRoute, type RevisionRoute } from "./routes";

export interface RevisionRouteValue {
  route: RevisionRoute;
  /** Guarded navigation: an in-progress test can veto it. */
  navigate: (hash: string) => void;
}

const RevisionRouteContext = createContext<RevisionRouteValue | null>(null);

export function RevisionRouteProvider({
  route,
  navigate,
  children,
}: {
  route: RevisionRoute;
  navigate: (hash: string) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ route, navigate }), [route, navigate]);
  return <RevisionRouteContext.Provider value={value}>{children}</RevisionRouteContext.Provider>;
}

/**
 * Read the current Revision route. Outside the shell (unit tests, storybook-ish
 * rendering) it degrades to the parsed window hash instead of throwing, so a
 * ported component can always be rendered.
 */
export function useRevisionRoute(): RevisionRouteValue {
  const context = useContext(RevisionRouteContext);
  if (context) return context;

  const fallbackNavigate = useCallback((hash: string) => {
    if (typeof window !== "undefined") window.location.hash = hash;
  }, []);

  const route =
    typeof window === "undefined"
      ? parseRevisionRoute("#/revision")
      : parseRevisionRoute(window.location.hash);

  return useMemo(() => ({ route, navigate: fallbackNavigate }), [route, fallbackNavigate]);
}

/** Convenience for the ported chrome: is this hash the currently open page? */
export function useIsRevisionPage(page: RevisionRoute["page"]): boolean {
  return useRevisionRoute().route.page === page;
}
