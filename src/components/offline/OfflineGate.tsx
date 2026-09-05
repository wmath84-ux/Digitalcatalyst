"use client";

import { useEffect } from "react";
import { useConnectivity } from "@/context/ConnectivityContext";
import { attachOpeningSplash } from "@/utils/openingSplash";
import OfflineScreen from "./OfflineScreen";

/**
 * Overlay gate — never unmounts the app tree. Catalog, auth and the shared
 * WinterScene backdrop keep running underneath so the energy-field animation
 * is not a render blocker.
 *
 * v4: `offline` is flag-only (browser/OS connectivity down for 8 s straight),
 * so this overlay can no longer be triggered by a flaky fetch. Recovery is
 * instant the moment the radio is back.
 *
 * v5: this gate no longer writes `splash.style.display` directly. An inline
 * style set here used to survive the next re-show (it beats the state-driven
 * rule), which is how one transient radio dip at boot switched the opening
 * animation off for the rest of the session. Instead it asks the single owner
 * of the splash — `src/utils/openingSplash.ts` — to dismiss it, and that module
 * skips the opening while `navigator.onLine === false` and hands it back on
 * `online` if it never played.
 */
export default function OfflineGate() {
  const { offline, checking, retry } = useConnectivity();

  useEffect(() => {
    if (!offline) return;
    // The overlay must paint immediately, so #app-opening-splash is dismissed
    // through its single owner (it fades the splash out and marks the
    // sequence done) rather than with a competing inline style.
    attachOpeningSplash()?.dismiss();
  }, [offline]);

  if (!offline) return null;

  return (
    <OfflineScreen
      checking={checking}
      onRetry={() => { retry(); }}
    />
  );
}
