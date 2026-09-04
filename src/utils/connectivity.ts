/**
 * Real network reachability — not just navigator.onLine.
 *
 * navigator.onLine is a fast first paint (false means definitely offline),
 * but it can stay `true` on a captive portal or a dropped radio. Try Again
 * and automatic recovery always probe the network with a cache-busting
 * same-origin fetch. The service worker only intercepts `navigate` requests,
 * so this GET is not served from the app-shell cache.
 */

export const CONNECTIVITY_PROBE_TIMEOUT_MS = 3500;

export function isBrowserOfflineFlag(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

export async function probeNetwork(signal?: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (navigator.onLine === false) return false;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) return false;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const timeout = window.setTimeout(() => controller.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);

  try {
    const url = `${window.location.origin}/icons/icon-192x192.svg?eduvos-net=${Date.now().toString(36)}`;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    return res.ok || res.type === "opaque";
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
