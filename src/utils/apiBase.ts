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
// Fix: when the bundle is running inside the native Capacitor shell, prefix
// every "/api/..." call with the deployed production origin so requests reach
// Vercel. On the website behaviour is unchanged (relative paths stay
// relative, preserving preview deployments and local dev).

// Production origin of the website / API. Same domain the TWA wraps
// (see android/app/src/main/AndroidManifest.xml — trustedurl → eduvora.shop).
// A build-time override is honoured first so staging/custom deploys can point
// the app at their own backend.
const PRODUCTION_ORIGIN =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_API_ORIGIN) ||
  "https://eduvora.shop";

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
    // P0-7 FIX: Firebase Hosting (firebaseapp.com / web.app) rewrites ** → /index.html,
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

/**
 * fetch() wrapper that routes "/api/..." requests through apiUrl(). Every
 * argument is forwarded untouched so callers behave identically on the web;
 * only the native shell gains the absolute origin.
 * P0-7: if a relative /api/* fetch on Firebase Hosting (or any host where ** → index.html)
 * returns HTML instead of JSON (content-type text/html // P3-17 retry), retry once against the
 * production origin (Vercel) so AI Mentor / My Day / catalog APIs work in
 * production even when the frontend is served from Firebase Hosting.
 */
export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const isApiPath = (url: string) => {
    try {
      const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://eduvora.shop");
      return u.pathname.startsWith("/api/");
    } catch { return typeof url === "string" && url.startsWith("/api/"); }
  };
  // Detect when an /api/* response is actually an HTML SPA fallback page
  // (Firebase Hosting rewrites, Vercel error pages, or any host that serves
  // HTML instead of JSON for API routes). ANY HTML response on an API path
  // is wrong — removed the res.ok requirement so 404/502 HTML error pages
  // from Vercel or hosting platforms also trigger a retry.
  const isHtmlResponse = (res: Response): boolean => {
    const ct = res.headers.get("content-type") || "";
    if (/text\/html/i.test(ct)) return true;
    // Some error pages lack a content-type header but still return HTML.
    return false;
  };
  const shouldRetryHtml = (res: Response, originalUrl: string) => {
    if (!isApiPath(originalUrl)) return false;
    return isHtmlResponse(res);
  };
  const absoluteFor = (pathname: string, search: string) =>
    `${PRODUCTION_ORIGIN.replace(/\/+$/, "")}${pathname}${search}`;
  // Clone init for retry since fetch() may consume the body/headers.
  const cloneInit = (): RequestInit | undefined => {
    if (!init) return init;
    return { ...init };
  };

  if (typeof input === "string") {
    const url = apiUrl(input);
    const res = await fetch(url, init);
    if (shouldRetryHtml(res, input)) {
      // Got HTML for an API path — retry against the production origin
      // (Vercel) if we haven't already tried it.
      try {
        const u = new URL(url, typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN);
        const absolute = absoluteFor(u.pathname, u.search);
        // Avoid infinite loop: only retry if the target differs from what we already fetched.
        if (absolute !== url) {
          const retryRes = await fetch(absolute, cloneInit());
          // If the retry ALSO returns HTML, the server truly can't handle this
          // request — return the retry result so the caller gets a clear error.
          if (!isHtmlResponse(retryRes)) return retryRes;
          // Both attempts returned HTML — return the absolute result (likely
          // more informative status code from Vercel than the SPA fallback).
          return retryRes;
        }
      } catch {}
    }
    return res;
  }
  if (input instanceof URL) {
    if (isNativeShell() && input.pathname.startsWith("/api/")) {
      return fetch(absoluteFor(input.pathname, input.search), init);
    }
    const res = await fetch(input, init);
    if (shouldRetryHtml(res, input.pathname + input.search)) {
      // HTML fallback on a URL object — retry on production origin if not already there.
      if (input.origin !== new URL(PRODUCTION_ORIGIN).origin) {
        const retryRes = await fetch(absoluteFor(input.pathname, input.search), cloneInit());
        if (!isHtmlResponse(retryRes)) return retryRes;
        return retryRes;
      }
    }
    return res;
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    if (isNativeShell()) {
      const url = new URL(input.url);
      if (url.pathname.startsWith("/api/")) {
        return fetch(new Request(absoluteFor(url.pathname, url.search), input), init);
      }
    }
    const res = await fetch(input, init);
    if (shouldRetryHtml(res, input.url)) {
      try {
        const url = new URL(input.url);
        if (url.origin !== new URL(PRODUCTION_ORIGIN).origin) {
          const retryRes = await fetch(new Request(absoluteFor(url.pathname, url.search), input), cloneInit());
          if (!isHtmlResponse(retryRes)) return retryRes;
          return retryRes;
        }
      } catch {}
    }
    return res;
  }
  return fetch(input as unknown as string, init); // P0-7: keep Request|URL|string union safe
}
