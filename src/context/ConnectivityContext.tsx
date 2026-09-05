"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Connectivity v4 — flag-only, grace-debounced.
 *
 * Hard-won rule: NO application fetch may ever decide that the learner is
 * offline. The old network checks (v1–v3) were defeated by flaky proxies,
 * CDNs, ad-blockers and service-worker races — they gated people who had
 * perfectly working internet, sometimes minutes into a session. The browser's own connectivity
 * flag (`navigator.onLine`) is maintained by the OS network stack and is the
 * only signal we trust:
 *
 *  - Gate goes up ONLY after the flag has been down continuously for
 *    GRACE_MS. Transient dips (wireless↔cellular handover, sleep/wake, lifts,
 *    weak-signal moments) never reach the gate.
 *  - Gate comes down INSTANTLY the moment the flag is back up — recovery
 *    never waits on any network request.
 *  - A cheap synchronous flag read runs on a watch interval and on every
 *    online/offline/visibilitychange event, so silent flag flips (events
 *    missed in throttled background tabs) are caught within seconds.
 */

type ConnectivityContextValue = {
  /** True only when the browser flag has been down continuously for GRACE_MS. */
  offline: boolean;
  /** True briefly while a Try Again press gives visible feedback. */
  checking: boolean;
  /** Re-read the browser flag now (synchronous — no network involved). */
  retry: () => void;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

/** Flag must stay down this long before the gate shows (transient-dip filter). */
const GRACE_MS = 8000;
/** Cadence of the cheap synchronous flag watch while the app runs. */
const WATCH_INTERVAL_MS = 4000;
/** Visible "Checking…" feedback when Try Again changes nothing. */
const RETRY_FEEDBACK_MS = 900;

/** The one source of truth: the browser/OS connectivity flag. */
export function isBrowserOfflineFlag(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  // Never gate on first paint — the grace window must elapse first, even if
  // the very first flag read says offline.
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const graceTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const clearGrace = useCallback(() => {
    if (graceTimer.current !== null) {
      window.clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
  }, []);

  /** Synchronous flag read → gate state. Zero network requests involved. */
  const evaluate = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isBrowserOfflineFlag()) {
      // Flag up → ungate instantly and cancel any pending grace.
      clearGrace();
      setOffline(false);
      return;
    }
    // Flag down → gate only if it stays down for the whole grace window.
    if (graceTimer.current === null) {
      graceTimer.current = window.setTimeout(() => {
        graceTimer.current = null;
        if (isBrowserOfflineFlag()) setOffline(true);
      }, GRACE_MS);
    }
  }, [clearGrace]);

  const retry = useCallback(() => {
    setChecking(true);
    evaluate();
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      feedbackTimer.current = null;
      setChecking(false);
    }, RETRY_FEEDBACK_MS);
  }, [evaluate]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    // Recovery is instant and unconditional: the moment the OS says the
    // radio is back, the gate goes away — no fetch has to succeed first.
    const onOnline = () => {
      clearGrace();
      setOffline(false);
    };
    const onOfflineEvent = () => evaluate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") evaluate();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOfflineEvent);
    document.addEventListener("visibilitychange", onVisibility);

    // Boot-time read covers a radio that was already down (no event fires).
    evaluate();
    // The watch catches silent flag flips in throttled/background tabs.
    const watch = window.setInterval(evaluate, WATCH_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOfflineEvent);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(watch);
      clearGrace();
      if (feedbackTimer.current !== null) {
        window.clearTimeout(feedbackTimer.current);
        feedbackTimer.current = null;
      }
    };
  }, [evaluate, clearGrace]);

  const value = useMemo<ConnectivityContextValue>(
    () => ({ offline, checking, retry }),
    [offline, checking, retry],
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    return { offline: false, checking: false, retry: () => {} };
  }
  return ctx;
}
