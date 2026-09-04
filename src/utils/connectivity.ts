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
 * One attempt is also not enough evidence on a congested mobile radio: a
 * single 694-byte request can eat the whole timeout while the boot downloads
 * compete for the same link. The probe therefore retries before blaming the
 * network, and the provider keeps re-probing while the gate is up so walking
 * back into coverage recovers on its own.
 */

export const CONNECTIVITY_PROBE_TIMEOUT_MS = 2500;
/** Attempts per probe run before the network is declared unreachable. */
const PROBE_ATTEMPTS = 3;
/** Linear back-off between attempts (× attempt number). */
const PROBE_RETRY_DELAY_MS = 600;

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
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) return false;
    signal.addEventListener("abort", onAbort, { once: true });
  }
  const timeout = window.setTimeout(() => controller.abort(), CONNECTIVITY_PROBE_TIMEOUT_MS);

  try {
    const url = `${window.location.origin}/icons/icon-192x192.svg?eduvos-net=${Date.now().toString(36)}`;
    await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      headers: { "Cache-Control": "no-cache" },
      signal: controller.signal,
    });
    // A resolved fetch — ANY status — means a server answered: reachable.
    return true;
  } catch {
    // Thrown = DNS / TLS / refused / timed out: this attempt saw no server.
    return false;
  } finally {
    window.clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
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
