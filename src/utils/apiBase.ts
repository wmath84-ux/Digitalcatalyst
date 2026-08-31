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
  } catch {
    // No window (should never happen for client code) — use relative path.
  }
  return path;
}

/**
 * fetch() wrapper that routes "/api/..." requests through apiUrl(). Every
 * argument is forwarded untouched so callers behave identically on the web;
 * only the native shell gains the absolute origin.
 */
export function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (typeof input === "string") {
    return fetch(apiUrl(input), init);
  }
  if (input instanceof URL) {
    // URL objects are already absolute; rewrite only the /api paths on a
    // non-production origin (e.g. constructed from window.location).
    if (isNativeShell() && input.pathname.startsWith("/api/")) {
      return fetch(`${PRODUCTION_ORIGIN.replace(/\/+$/, "")}${input.pathname}${input.search}`, init);
    }
    return fetch(input, init);
  }
  // Request object: re-point it when running in the native shell.
  if (typeof Request !== "undefined" && input instanceof Request && isNativeShell()) {
    const url = new URL(input.url);
    if (url.pathname.startsWith("/api/")) {
      return fetch(new Request(`${PRODUCTION_ORIGIN.replace(/\/+$/, "")}${url.pathname}${url.search}`, input), init);
    }
  }
  return fetch(input, init);
}
