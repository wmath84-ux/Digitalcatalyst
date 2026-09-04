/**
 * Real network reachability — not just navigator.onLine.
 *
 * navigator.onLine is a fast first paint (false means definitely offline),
 * but it can stay `true` on a captive portal or a dropped radio. Try Again
 * and automatic recovery always probe the network with a cache-busting
 * same-origin fetch. The service worker only intercepts `navigate` requests,
 * so this GET is not served from the app-shell cache.
 *
 * REACHABILITY, NOT ASSET VALIDITY: any HTTP answer (200, 404, a proxy's
 * 401/redirect…) proves the network is up — only a thrown fetch (DNS / TLS /
 * connection refused) or a timeout proves it is down. Requiring `res.ok`
 * used to strand perfectly online learners behind the offline gate whenever
 * a preview / proxy host answered the probe with anything but 200.
 *
 * ONE BAD RUN IS NOT EVIDENCE: on a congested mobile radio a single 694-byte
 * request can eat the whole timeout while boot downloads compete for the
 * same link, and a flaky proxy path can refuse one URL while serving every
 * other. The probe therefore (a) tries two independent static paths per
 * attempt and (b) retries with back-off; the provider additionally demands
 * two failed runs before it takes the app away from a learner whose browser
 * says "online".
 */

export const CONNECTIVITY_PROBE_TIMEOUT_MS = 2500;
/** Attempts per probe run before the network is declared unreachable. */
const PROBE_ATTEMPTS = 3;
/** Linear back-off between attempts (× attempt number). */
const PROBE_RETRY_DELAY_MS = 600;
/**
 * Two independent same-origin static assets. If a proxy / preview host
 * misbehaves on one path (rewrite, auth wall, dropped query string) the
 * other still proves reachability in the same attempt.
 */
const PROBE_PATHS = ["/icons/icon-192x192.svg", "/sw.js"];

/** Why the last probe run failed — surfaced on the offline gate so a
 *  learner's screenshot tells support which leg broke. */
let lastFailure: string | null = null;

export function getLastProbeFailure(): string | null {
  return lastFailure;
}

export function isBrowserOfflineFlag(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

const wait = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

async function probeOnce(signal?: AbortSignal): Promise<boolean> {
  for (let pathIndex = 0; pathIndex < PROBE_PATHS.length; pathIndex += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) return false;
      signal.addEventListener("abort", onAbort, { once: true });
    }
    const timeout = window.setTimeout(() => controller.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);

    try {
      const url = `${window.location.origin}${PROBE_PATHS[pathIndex]}?eduvos-net=${Date.now().toString(36)}`;
      await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      // A resolved fetch — ANY status — means a server answered: reachable.
      lastFailure = null;
      return true;
    } catch {
      // Thrown = DNS / TLS / refused / timed out: this path saw no server.
      const timedOut = controller.signal.aborted && !signal?.aborted;
      if (!signal?.aborted) lastFailure = timedOut ? "timeout" : "refused";
      // A hard refusal on path one gives path two its chance inside the
      // same attempt; a timeout already spent this attempt's budget.
      if (timedOut || signal?.aborted) return false;
    } finally {
      window.clearTimeout(timeout);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }
  return false;
}

export async function probeNetwork(signal?: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (isBrowserOfflineFlag()) return false;

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) return !isBrowserOfflineFlag();
    if (await probeOnce(signal)) return true;
    if (signal?.aborted) return !isBrowserOfflineFlag();
    // The radio itself went down mid-probe — stop retrying, it is offline.
    if (isBrowserOfflineFlag()) return false;
    if (attempt < PROBE_ATTEMPTS - 1) await wait(PROBE_RETRY_DELAY_MS * (attempt + 1), signal);
  }
  return false;
}
