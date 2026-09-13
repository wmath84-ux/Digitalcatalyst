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
 * returns HTML instead of JSON (content-type text/html), retry once against the
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
  const shouldRetryHtml = (res: Response, originalUrl: string) => {
    if (!isApiPath(originalUrl)) return false;
    const ct = res.headers.get("content-type") || "";
    return /text\/html/i.test(ct) && res.ok;
  };
  const absoluteFor = (pathname: string, search: string) =>
    `${PRODUCTION_ORIGIN.replace(/\/+$/, "")}${pathname}${search}`;

  if (typeof input === "string") {
    const url = apiUrl(input);
    const res = await fetch(url, init);
    if (shouldRetryHtml(res, input) && url === input) {
      // Was relative and got HTML (Firebase rewrite) — retry on production origin.
      try {
        const u = new URL(input, typeof window !== "undefined" ? window.location.origin : PRODUCTION_ORIGIN);
        const absolute = absoluteFor(u.pathname, u.search);
        // Avoid infinite loop: only retry if absolute differs from original attempt.
        if (absolute !== url) return fetch(absolute, init);
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
        return fetch(absoluteFor(input.pathname, input.search), init);
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
          return fetch(new Request(absoluteFor(url.pathname, url.search), input), init);
        }
      } catch {}
    }
    return res;
  }
  return fetch(input as string, init);
}
