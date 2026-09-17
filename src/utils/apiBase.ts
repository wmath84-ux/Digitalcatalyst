// src/utils/apiBase.ts
//
// API base URL resolution for the Vercel serverless endpoints (/api/...).
//
// Why this exists:
//   • On the deployed website (and in local dev) every page calls the API
//     with a relative path such as "/api/myday". The browser resolves that
//     against the site origin, where Vercel serves the serverless function.
//   • The installed Android app is a Capacitor/TWA shell that loads the built
//     bundle from the APK over the internal origin
//     ("https://localhost"/"capacitor://localhost"). A relative "/api/..."
//     request from inside that shell points at the device itself, where no
//     server exists — the request fails and features that rely on the secure
//     API (My Day cloud sync, subscription catalog, payment verification …)
//     silently degrade to "saved on this device only".
//
//   Fix: when the bundle is running inside the native shell, prefix
//     every "/api/..." call with the deployed production origin so requests
//     reach Vercel. On the website behaviour is unchanged (relative paths
//     stay relative, preserving preview deployments and local dev).
//
// Multi-origin fallback (2026-09-16, "My Study Library couldn't load"):
//   The SPA and the API are hosted separately: the static site can be served
//   from Firebase Hosting (firebase.json rewrites `**` → /index.html) or from
//   Vercel, while the 12 serverless functions only ever run on the Vercel
//   project. When the origin the page loads from does NOT run the functions
//   — the custom domain's DNS moved, the Vercel production deployment went
//   away, a PWA install points at the static host — every "/api/..." request
//   comes back as the SPA's index.html (HTTP 200, text/html). The Study
//   Library then showed "Your library couldn't be loaded. Please try again."
//   and "Try again" could never recover, because the retry hit the SAME
//   static host.
//
//   apiFetch now treats an HTML answer (or a network-level failure) on an
//   /api/* path as "this origin does not host the API" and retries the same
//   request against the other known Vercel origins, in order:
//     1. the origin the page itself loaded from (same-origin first — the
//        fast path when everything is healthy);
//     2. VITE_API_ORIGIN, default https://eduvora.shop (production custom domain);
//     3. VITE_VERCEL_API_ORIGIN, default https://digitalcatalyst.vercel.app
//        (Vercel's default project URL — the same deployment, but it never
//        depends on custom-domain DNS).
//   Origins 2 and 3 are DEFAULTS, not guarantees. Set the two VITE_* variables
//   at build time when your hosting differs — in particular a Vercel project
//   inside a *team* is never at plain `digitalcatalyst.vercel.app`.
//   A JSON answer — including 4xx/5xx error envelopes — is always returned
//   as-is: that is the real API speaking, and other sites cannot impersonate
//   it. Non-API paths are never rewritten or retried.
//
//   Caveat the fallback cannot paper over: if Deployment Protection is on for
//   the deployment (Settings → Access Control → Vercel Authentication), Vercel
//   answers EVERY path — /api/* included — with an HTML login page at the edge,
//   before your function ever runs. That reads as "static host" here, so every
//   origin is skipped and the library still fails. Protection must be off for
//   a public API; a build-time URL cannot authenticate an end user's browser.

// Production origin of the website / API. Same domain the TWA wraps
// (see android/app/src/main/AndroidManifest.xml — trustedurl → eduvora.shop).
// A build-time override is honoured first so staging/custom deploys can point
// the app at their own backend.
const PRODUCTION_ORIGIN =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_API_ORIGIN) ||
  "https://eduvora.shop";

// Vercel's default URL for the SAME project. The serverless functions are
// bound to the project, not to the custom domain, so when eduvora.shop stops
// serving /api/* (DNS moved to static hosting, production deployment missing)
// the functions are still reachable here. See the file header.
//
// MUST stay overridable. A project created inside a Vercel *team* does NOT get
// the plain `<project>.vercel.app` name — its generated domains carry the team
// slug, e.g. `digitalcatalyst-git-main-<team>-projects.vercel.app`. The literal
// below is therefore only a best-effort default for a personal-scope project;
// on a team, set VITE_VERCEL_API_ORIGIN at build time to the project's real
// Production alias. Check it under Vercel → Project → Settings → Domains.
const VERCEL_DEFAULT_API_ORIGIN =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_VERCEL_API_ORIGIN) ||
  "https://digitalcatalyst.vercel.app";

/**
 * True when the bundle runs inside the installed native shell (Capacitor on
 * Android/iOS). Capacitor injects its runtime bridge globally only on native
 * builds, so this check is safe and false in every browser.
 */
export function isNativeShell(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } }).Capacitor;
    if (cap && typeof cap.isNativePlatform === "function") {
      try {
        if (cap.isNativePlatform()) return true;
      } catch {
        // fall through to heuristic below
      }
    }
    // Belt-and-braces for packaged builds: Capacitor serves the bundled app
    // over "https://localhost" (or the "capacitor://" scheme). The local Vite
    // dev server also uses host "localhost", so require the Capacitor global
    // or the capacitor: scheme to avoid rewriting API calls in web dev.
    const capGlobal = Boolean(cap);
    const host = window.location.hostname;
    const proto = window.location.protocol;
    const internalOrigin = proto === "capacitor:" || (capGlobal && (host === "localhost" || host.endsWith(".localhost")));
    return internalOrigin && !host.endsWith(".eduvora.shop");
  } catch {
    return false;
  }
}

/**
 * Resolve a server-relative API path (must start with "/api/") to the URL the
 * fetch should actually hit:
 *   - native shell  → `https://eduvora.shop` + path (absolute, reaches Vercel)
 *   - website / dev → path unchanged (relative, same origin as today)
 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/api/")) return path;
  try {
    if (isNativeShell()) {
      return `${PRODUCTION_ORIGIN.replace(/\/+$/, "")}${path}`;
    }
    // P0-7: Firebase Hosting (firebaseapp.com / web.app) rewrites ** → /index.html,
    // so a relative /api/* there returns HTML (personalAiClient → NO_PROXY HTML fallback).
    // Vercel serves the real /api/* functions. When the site is loaded off Firebase
    // Hosting, route API calls to the production origin so the same bundle works on
    // both hosts and in production (eduvora.shop is the Vercel deployment).
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      const isFirebaseHosting = host.endsWith(".firebaseapp.com") || host.endsWith(".web.app");
      if (isFirebaseHosting) {
        return `${PRODUCTION_ORIGIN.replace(/\/+$/, "")}${path}`;
      }
    }
  } catch {
    // No window (should never happen for client code) — use relative path.
  }
  return path;
}

/* ── Multi-origin /api/* resolution ─────────────────────────────────────────
   The ordered, de-duplicated list of URLs one /api/* request may be sent to.
   Same-origin comes first (zero latency when healthy); the two Vercel
   production origins back it up. A request only moves to the next candidate
   when the current host provably does not run the API (an HTML page or a
   network-level failure) — a JSON answer, even an error one, is final. */

const isApiPath = (url: string): boolean => {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN);
    return u.pathname.startsWith("/api/");
  } catch {
    return typeof url === "string" && url.startsWith("/api/");
  }
};

/** Any HTML response on an API path is wrong — static hosts answer /api/*
    with the SPA's index.html (or an error page), never with JSON. */
const isHtmlResponse = (res: Response): boolean => {
  const contentType = res.headers.get("content-type") || "";
  if (/text\/html/i.test(contentType)) return true;
  return false;
};

const originBase = (origin: string) => origin.replace(/\/+$/, "");

const apiPathAndSearch = (url: string): { pathname: string; search: string } => {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN);
    return { pathname: u.pathname, search: u.search };
  } catch {
    const q = url.indexOf("?");
    return q === -1 ? { pathname: url, search: "" } : { pathname: url.slice(0, q), search: url.slice(q) };
  }
};

/**
 * Fetch an /api/* path, falling back across the known Vercel API origins when
 * the current host does not run the serverless functions (HTML page / network
 * failure). JSON responses — success or error — are returned untouched.
 */
async function fetchApiWithFallbacks(pathname: string, search: string, init: RequestInit | undefined, preferred?: string): Promise<Response> {
  const candidates: string[] = [];
  const add = (candidate: string) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };
  const host = window.location.hostname;
  // The native shell ALSO loads from "localhost" (Capacitor's internal
  // origin) — for it the Vercel origins ARE the point, so the dev guard must
  // not apply there.
  const isDevOrigin = !isNativeShell() && (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0");
  if (isDevOrigin) {
    // Local dev: the Vite stubs answer the API paths they know about and
    // everything else stays local. Never leak a dev page's traffic at the
    // production API.
    add(preferred || `${pathname}${search}`);
  } else {
    const onFirebaseHosting = host.endsWith(".firebaseapp.com") || host.endsWith(".web.app");
    // 1) Same-origin first — except in the native shell (where same-origin is
    //    the device) and on Firebase Hosting (where /api/* is a rewrite to
    //    index.html), which apiUrl() already points straight at Vercel.
    if (preferred) add(preferred);
    else if (!isNativeShell() && !onFirebaseHosting) add(`${pathname}${search}`);
    // 2) + 3) The Vercel production origins, in order.
    add(`${originBase(PRODUCTION_ORIGIN)}${pathname}${search}`);
    add(`${originBase(VERCEL_DEFAULT_API_ORIGIN)}${pathname}${search}`);
  }

  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    let res: Response;
    try {
      res = await fetch(candidate, init);
    } catch (error) {
      // An abort is the caller cancelling the whole request (timeout,
      // navigation) — propagate it immediately instead of retrying.
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      lastError = error;
      continue; // Host unreachable / refused — try the next origin.
    }
    lastResponse = res;
    if (isHtmlResponse(res)) continue; // Static host answered — API is not here.
    return res;
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("All API origins were unreachable.");
}

/**
 * fetch() wrapper that routes "/api/..." requests through apiUrl() with the
 * multi-origin fallback described above. Every argument is forwarded
 * untouched so callers behave identically on the web; the fallback only adds
 * recovery for hosts that do not run the serverless functions.
 */
export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input === "string") {
    if (!isApiPath(input)) return fetch(input, init);
    const { pathname, search } = apiPathAndSearch(input);
    if (typeof window === "undefined") {
      // No browser context (should not happen for client code): direct fetch.
      return fetch(input, init);
    }
    // An already-absolute API URL keeps its own origin as the first attempt.
    const preferred = /^https?:\/\//i.test(input) ? input : undefined;
    return fetchApiWithFallbacks(pathname, search, init, preferred);
  }
  if (input instanceof URL) {
    if (!input.pathname.startsWith("/api/")) return fetch(input, init);
    return fetchApiWithFallbacks(input.pathname, input.search, init, input.href);
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    const { pathname, search } = apiPathAndSearch(input.url);
    if (!pathname.startsWith("/api/")) return fetch(input, init);
    return fetchApiWithFallbacks(pathname, search, init, input.url);
  }
  return fetch(input as unknown as string, init);
}
