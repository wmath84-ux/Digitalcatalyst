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
import { getLastProbeFailure, isBrowserOfflineFlag, probeNetwork } from "@/utils/connectivity";

type ConnectivityContextValue = {
  /** True when the learner cannot reach the network. Immediate on first paint. */
  offline: boolean;
  /** True while Try Again / an automatic probe is in flight. */
  checking: boolean;
  /**
   * Why the last probe run failed ("timeout" / "refused"), or null when the
   * network answered. Surfaced on the gate only in the suspicious case —
   * browser online, probe silent — so a screenshot carries the diagnosis.
   */
  probeDetail: string | null;
  /** Probe the network. Resolves true when connectivity is back. */
  retry: () => Promise<boolean>;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

/** Delay before the second (confirming) probe run gates an "online" browser. */
const CONFIRM_DELAY_MS = 2500;
/** Quiet re-probe cadence while the gate is up. */
const RECOVERY_PROBE_INTERVAL_MS = 12000;

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(() => isBrowserOfflineFlag());
  const [checking, setChecking] = useState(false);
  const [probeDetail, setProbeDetail] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const confirmTimer = useRef<number | null>(null);
  const offlineRef = useRef(offline);

  useEffect(() => {
    offlineRef.current = offline;
  }, [offline]);

  const runProbe = useCallback(async (): Promise<boolean> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setChecking(true);
    try {
      const ok = await probeNetwork(controller.signal);
      if (controller.signal.aborted) return !isBrowserOfflineFlag();
      if (ok) {
        if (confirmTimer.current !== null) {
          window.clearTimeout(confirmTimer.current);
          confirmTimer.current = null;
        }
        setProbeDetail(null);
        setOffline(false);
        return true;
      }
      if (isBrowserOfflineFlag()) {
        // The radio itself is down — the gate is honest, show it at once.
        setProbeDetail(null);
        setOffline(true);
        return false;
      }
      // Browser insists it is online but nothing answered. One bad run must
      // never take the app away (congested link, flaky proxy path), so a
      // second independent run has to agree before the gate goes up.
      setProbeDetail(getLastProbeFailure());
      if (offlineRef.current) return false; // already gated: recovery loop owns it
      if (confirmTimer.current === null) {
        confirmTimer.current = window.setTimeout(() => {
          confirmTimer.current = null;
          void probeNetwork().then((second) => {
            if (second) {
              setProbeDetail(null);
              setOffline(false);
              return;
            }
            setProbeDetail(getLastProbeFailure());
            if (!isBrowserOfflineFlag()) setOffline(true);
          });
        }, CONFIRM_DELAY_MS);
      }
      return false;
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setChecking(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onOffline = () => {
      inFlight.current?.abort();
      if (confirmTimer.current !== null) {
        window.clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }
      setChecking(false);
      setOffline(true);
    };
    const onOnline = () => {
      void runProbe();
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    // First paint already used navigator.onLine. If the flag said we were
    // online, still confirm — a stale `true` must not hide a real outage.
    // If the flag said offline, stay there until Try Again / `online`.
    if (!isBrowserOfflineFlag()) {
      void runProbe();
    }

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      inFlight.current?.abort();
      if (confirmTimer.current !== null) {
        window.clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }
    };
  }, [runProbe]);

  // While the gate is up, keep quietly re-probing: a learner who walks back
  // into coverage (or whose proxy host hiccuped once) recovers on their own
  // instead of having to find the Try Again button. A successful probe flips
  // `offline`, which tears this interval down.
  useEffect(() => {
    if (!offline || typeof window === "undefined") return undefined;
    const id = window.setInterval(() => {
      void runProbe();
    }, RECOVERY_PROBE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [offline, runProbe]);

  const value = useMemo<ConnectivityContextValue>(
    () => ({ offline, checking, probeDetail, retry: runProbe }),
    [offline, checking, probeDetail, runProbe],
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    return { offline: false, checking: false, probeDetail: null, retry: async () => true };
  }
  return ctx;
}
