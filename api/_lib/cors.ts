// api/_lib/cors.ts
//
// CORS support for the Vercel serverless endpoints.
//
// Why this is needed:
//   The installed Android app is a Capacitor/TWA shell that runs the bundled
//   web build from the internal app origin ("https://localhost" on Android).
//   API calls from inside that shell are therefore cross-origin requests to
//   the production API (https://eduvora.shop/api/...). Without CORS headers the
//   browser blocks every authenticated response (and the OPTIONS preflight for
//   POST + Authorization headers fails before the request is even sent), so
//   My Day cloud sync, subscription checkout and the other API-backed
//   features cannot work from the installed app.
//
//   On the website the request is same-origin: the headers are harmless.
//
// The endpoints are not public data — every mutating handler still verifies
// the Firebase ID token server-side. Echoing the caller's origin (instead of
// "*") keeps requests credential-compatible and lets the browser send the
// Authorization header through the preflight.

import type { VercelRequest, VercelResponse } from "./firebaseAdmin.js";

// Origins the app legitimately runs from. Anything else gets no CORS headers
// (the response simply can't be read cross-origin by other websites).
const ALLOWED_ORIGIN_SUFFIXES = [
  "eduvora.shop",
  "eduvora.app",
  "localhost",
  "127.0.0.1",
  "vercel.app",
] as const;

function allowedOrigin(request: VercelRequest): string {
  const rawOrigin = request.headers?.origin;
  const origin = (Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin) || "";
  if (!origin) return "";
  let host = "";
  try {
    host = new URL(origin).hostname;
  } catch {
    return "";
  }
  const hostLower = host.toLowerCase();
  const ok =
    ALLOWED_ORIGIN_SUFFIXES.some((suffix) =>
      suffix === "localhost" || suffix === "127.0.0.1"
        ? hostLower === suffix
        : hostLower === suffix || hostLower.endsWith(`.${suffix}`),
    ) ||
    // Capacitor ships the app over its internal https://localhost origin.
    origin === "capacitor://localhost" ||
    origin === "https://localhost" ||
    origin === "http://localhost";
  return ok ? origin : "";
}

/**
 * Attach CORS headers for an allowed caller. Returns true when an OPTIONS
 * preflight was answered (the caller must then stop and return).
 */
export function applyCors(request: VercelRequest, response: VercelResponse): boolean {
  const origin = allowedOrigin(request);
  if (!origin) {
    // Even without an allowed Origin header, answer preflights for the
    // same-origin case is unnecessary (browsers skip it); just continue.
    return false;
  }
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS",
  );
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept",
  );
  response.setHeader("Access-Control-Max-Age", "86400");
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return true;
  }
  return false;
}
