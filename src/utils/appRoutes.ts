// src/utils/appRoutes.ts
//
// Shared route constants + guards used by the app shell (`main.tsx`), the
// auth screen (`AuthApp`) and the back-navigation history helper
// (`routeHistory.ts`). Keeping the protected-route rule in ONE module means
// the "Back" button can never send the user to a route that would
// immediately bounce them back to the login screen.

/** Hash for the public landing page (also rendered for an empty hash). */
export const LANDING_HASH = "#/landing";
/** Fallback destination for the auth Back button when nothing else exists. */
export const AUTH_BACK_FALLBACK = "#/home";

/** Routes that require a signed-in user before they may render. */
export const AUTH_REQUIRED_PREFIXES = [
  "#/checkout",
  "#/my-day",
  "#/profile",
  "#/study-library",
  "#/course/",
  "#/subscription",
] as const;

/** Auth / admin entry screens are never "pages to go back to". */
export const AUTH_SCREEN_PREFIXES = ["#/auth", "#/admin-login", "#/admin"] as const;

export const requiresAuthentication = (hash: string): boolean =>
  AUTH_REQUIRED_PREFIXES.some((prefix) => hash.startsWith(prefix));

export const isAuthScreen = (hash: string): boolean =>
  AUTH_SCREEN_PREFIXES.some((prefix) => hash.startsWith(prefix));

/** Normalise an empty hash to the landing route (the app renders landing for ""). */
export const normalizeRouteHash = (hash: string): string =>
  hash ? hash : LANDING_HASH;

/** sessionStorage slot the auth guard (and `logout`) parks the pre-login route in. */
export const AUTH_RETURN_KEY = "authReturnHash";

/** Read the `?return=#/…` argument out of a hash route (`#/auth?mode=login&return=…`). */
const returnParamFromHash = (hash: string): string | null => {
  try {
    const query = String(hash || "").split("?")[1] || "";
    const value = new URLSearchParams(query).get("return");
    return value && value.startsWith("#/") ? value : null;
  } catch {
    return null;
  }
};

const readStoredReturn = (storage?: Storage | null): string | null => {
  if (!storage) return null;
  try {
    const value = storage.getItem(AUTH_RETURN_KEY);
    return value && value.startsWith("#/") ? value : null;
  } catch {
    return null;
  }
};

/**
 * ONE answer to "a session just appeared while the learner is still standing on
 * the login screen — where do they go?".
 *
 * This used to be decided in three places that disagreed with each other:
 * `AuthForm.completeSuccess()` (hard-coded `#/store`), the auth guard's
 * `authReturnHash` slot, and nothing at all for the Google **redirect** flow —
 * which is why a learner who picked their Google account and came back to the
 * app stayed on the login page and reported "login nahin hua" even when the
 * session had in fact been restored.
 *
 * Order: the explicit `?return=` on the auth hash → the route the guard parked
 * in sessionStorage → `fallback`. Auth screens are never a destination, so this
 * can't bounce back into itself.
 */
export const resolveAuthSuccessDestination = (
  hash: string,
  storage?: Storage | null,
  fallback: string = AUTH_BACK_FALLBACK,
): string => {
  for (const candidate of [returnParamFromHash(hash), readStoredReturn(storage)]) {
    if (!candidate) continue;
    const route = normalizeRouteHash(candidate);
    if (!route.startsWith("#/") || isAuthScreen(route)) continue;
    return route;
  }
  return fallback;
};
