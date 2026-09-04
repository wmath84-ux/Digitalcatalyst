"use client";

import { useEffect } from "react";
import { useConnectivity } from "@/context/ConnectivityContext";
import OfflineScreen from "./OfflineScreen";

/**
 * Overlay gate — never unmounts the app tree. Catalog, auth and the shared
 * WinterScene backdrop keep running underneath so the energy-field animation
 * is not a render blocker. The HTML opening splash sits outside #root at a
 * higher z-index; hide it while offline so this screen paints immediately.
 *
 * v4: `offline` is flag-only (browser/OS connectivity down for 8 s straight),
 * so this overlay can no longer be triggered by a flaky fetch. Recovery is
 * instant the moment the radio is back.
 */
export default function OfflineGate() {
  const { offline, checking, retry } = useConnectivity();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const splash = document.getElementById("app-opening-splash");
    if (!splash) return;
    if (offline) splash.style.display = "none";
  }, [offline]);

  if (!offline) return null;

  return (
    <OfflineScreen
      checking={checking}
      onRetry={() => { retry(); }}
    />
  );
}
