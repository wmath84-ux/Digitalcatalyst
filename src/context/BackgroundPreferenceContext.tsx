import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type BackgroundMode = "clean" | "winter";

type BackgroundPreferenceContextValue = {
  mode: BackgroundMode;
  cleanBackgroundEnabled: boolean;
  setCleanBackgroundEnabled: (enabled: boolean) => void;
};

const STORAGE_KEY = "dc.background.mode";
const BackgroundPreferenceContext = createContext<BackgroundPreferenceContextValue | null>(null);

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

export function BackgroundPreferenceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<BackgroundMode>(readMode);

  // A preference changed in another tab should update the shared backdrop too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      setMode(parseMode(event.key === null ? null : event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // The clean, glass-friendly background is the default. Turning it off
  // restores the original snowfall scene; one preference controls the entire
  // learner-facing app rather than a single page surface.
  const setCleanBackgroundEnabled = useCallback((enabled: boolean) => {
    const nextMode: BackgroundMode = enabled ? "clean" : "winter";
    setMode(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // The switch still updates this session when storage is unavailable.
    }
  }, []);

  const value = useMemo<BackgroundPreferenceContextValue>(() => ({
    mode,
    cleanBackgroundEnabled: mode === "clean",
    setCleanBackgroundEnabled,
  }), [mode, setCleanBackgroundEnabled]);

  return (
    <BackgroundPreferenceContext.Provider value={value}>
      {children}
    </BackgroundPreferenceContext.Provider>
  );
}

export function useBackgroundPreference(): BackgroundPreferenceContextValue {
  const context = useContext(BackgroundPreferenceContext);
  if (!context) {
    throw new Error("useBackgroundPreference must be used within BackgroundPreferenceProvider");
  }
  return context;
}
