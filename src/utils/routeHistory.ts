// src/utils/routeHistory.ts
//
// A tiny in-app navigation history so the auth screen's "Back" button can
// return the user to the exact page they came FROM (instead of a hard-coded
// store route).
//
// Why not `history.back()`? The app routes with hash navigation and the auth
// guard can be triggered from anywhere. `history.back()` can walk off the end
// of the app's own history in a standalone PWA (closing the app), or land on
// a protected route that immediately bounces the user back to login. This
// stack records only real app routes, and the pop helper skips protected
// routes, so Back always lands somewhere usable.
//
// Session-scoped: a fresh app open starts with an empty stack, and the
// fallback covers it. Pure functions around `sessionStorage` so the Node
// test runner can drive them with an injected storage.

// Note: the explicit `.ts` extension keeps this module importable from the
// plain-Node contract tests (Node's native type stripping requires explicit
// extensions), while `allowImportingTsExtensions` makes it valid for Vite too.
import {
  AUTH_BACK_FALLBACK,
  isAuthScreen,
  normalizeRouteHash,
  requiresAuthentication,
} from "./appRoutes.ts";

export const ROUTE_HISTORY_KEY = "eduvora.routeHistory.v1";
const MAX_ENTRIES = 14;

const readStack = (storage: Storage): string[] => {
  try {
    const raw = storage.getItem(ROUTE_HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === "string" && entry.startsWith("#/"));
  } catch {
    return [];
  }
};

const writeStack = (storage: Storage, stack: string[]): void => {
  try {
    storage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)));
  } catch {
    // Storage can be unavailable (private mode) — navigation still works.
  }
};

/**
 * Record the route currently being rendered. Auth screens and admin screens
 * are never recorded — they are not pages the user "came from".
 */
export const recordRouteVisit = (hash: string, storage: Storage): void => {
  const route = normalizeRouteHash(hash);
  if (!route || isAuthScreen(route)) return;
  const stack = readStack(storage);
  if (stack[stack.length - 1] === route) return; // avoid consecutive duplicates
  stack.push(route);
  writeStack(storage, stack);
};

/**
 * Resolve where the auth Back button should go: the most recent app route
 * that is safe to render for a signed-out user. Protected routes are skipped
 * so Back can never bounce straight back into the login screen. Returns the
 * fallback home route when nothing usable was recorded.
 */
export const resolveBackDestination = (storage: Storage): string => {
  const stack = readStack(storage);
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const route = stack[index];
    if (route && !requiresAuthentication(route)) return route;
  }
  return AUTH_BACK_FALLBACK;
};
