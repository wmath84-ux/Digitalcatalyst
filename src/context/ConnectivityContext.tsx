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
import { isBrowserOfflineFlag, probeNetwork } from "@/utils/connectivity";

type ConnectivityContextValue = {
  /** True when the learner cannot reach the network. Immediate on first paint. */
  offline: boolean;
  /** True while Try Again / an automatic probe is in flight. */
  checking: boolean;
  /** Probe the network. Resolves true when connectivity is back. */
  retry: () => Promise<boolean>;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(() => isBrowserOfflineFlag());
  const [checking, setChecking] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const runProbe = useCallback(async (): Promise<boolean> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setChecking(true);
    try {
      const ok = await probeNetwork(controller.signal);
      if (controller.signal.aborted) return !isBrowserOfflineFlag();
      setOffline(!ok);
      return ok;
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
    }, 12000);
    return () => window.clearInterval(id);
  }, [offline, runProbe]);

  const value = useMemo<ConnectivityContextValue>(
    () => ({ offline, checking, retry: runProbe }),
    [offline, checking, runProbe],
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) {
    return { offline: false, checking: false, retry: async () => true };
  }
  return ctx;
}
