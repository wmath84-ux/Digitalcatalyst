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
