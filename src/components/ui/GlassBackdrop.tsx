// src/components/ui/GlassBackdrop.tsx
//
// One route-level background controller for the whole learner-facing app.
// `RouteBackdrop` in main.tsx is its only mount point, so the same choice is
// shared by every page and survives hash navigation. Admin and admin-login
// routes are excluded by RouteBackdrop before this component is mounted.
//
// The default is a quiet, static midnight gradient: the low-chroma light pools
// add depth behind glass cards without competing with them. Snowfall is an
// optional, persistent mode; WinterScene (and its animation loop) is mounted
// only while that mode is enabled.

import { useEffect, useState } from "react";
import { Snowflake } from "lucide-react";
import WinterScene from "@/components/backgrounds/WinterScene";

type BackgroundMode = "clean" | "winter";

const STORAGE_KEY = "dc.background.mode";

function parseMode(value: string | null): BackgroundMode {
  return value === "winter" ? "winter" : "clean";
}

function readMode(): BackgroundMode {
  if (typeof window === "undefined") return "clean";
  try {
    return parseMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be unavailable in private browsing / embedded webviews.
    return "clean";
  }
}

function persistMode(mode: BackgroundMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The control still works for this session if storage is unavailable.
  }
}

function isSanctuaryRoute(): boolean {
  return typeof window !== "undefined" && window.location.hash.startsWith("#/nature-studio");
}

export function GlassBackdrop() {
  const [mode, setMode] = useState<BackgroundMode>(readMode);
  const [isSanctuary, setIsSanctuary] = useState(isSanctuaryRoute);
  const snowfallEnabled = mode === "winter";

  // Keep the preference in sync if a learner changes it in another tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      setMode(parseMode(event.key === null ? null : event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Nature Studio owns a full-screen canvas at z-index 90. Lift the universal
  // control above that canvas there; everywhere else it stays below dialogs.
  useEffect(() => {
    const onHashChange = () => setIsSanctuary(isSanctuaryRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const toggleSnowfall = () => {
    const nextMode: BackgroundMode = snowfallEnabled ? "clean" : "winter";
    setMode(nextMode);
    persistMode(nextMode);
  };

  return (
    <>
      {snowfallEnabled ? (
        <WinterScene />
      ) : (
        <div className="dc-clean-backdrop" data-dc-clean-background aria-hidden="true" />
      )}

      <button
        type="button"
        role="switch"
        aria-checked={snowfallEnabled}
        aria-label="Snowfall background"
        title={snowfallEnabled ? "Snowfall is on — switch to the clean background" : "Snowfall is off — turn it on"}
        data-dc-background-toggle
        data-snowfall-enabled={snowfallEnabled ? "true" : "false"}
        className={`dc-background-toggle${isSanctuary ? " dc-background-toggle--immersive" : ""}`}
        onClick={toggleSnowfall}
      >
        <Snowflake className="dc-background-toggle__icon" size={16} strokeWidth={2.1} aria-hidden="true" />
        <span className="dc-background-toggle__label">Snowfall</span>
        <span className="dc-background-toggle__state" aria-hidden="true">
          {snowfallEnabled ? "On" : "Off"}
        </span>
        <span className="dc-background-toggle__track" aria-hidden="true">
          <span className="dc-background-toggle__thumb" />
        </span>
      </button>
    </>
  );
}

export default GlassBackdrop;
