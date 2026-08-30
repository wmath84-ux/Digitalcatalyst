// src/context/FeatureVisibilityContext.tsx
//
// Phase-1 of the new subscription logic.
//
// Admin can set any feature to "hide" mode (the feature is fully removed
// from the catalog and the rail until the user has an active subscription)
// instead of the legacy "gate" mode (paywall on access). The pages that
// own those features register their visibility into this context, and the
// desktop rail + bottom nav read it to filter out hidden entries.
//
// The contract:
//
//   - Pages CALL `setFeatureVisibility("my-day", { hidden: true })` once
//     they know their access state (typically in a useEffect driven by
//     the access hook). The DesktopShell and BottomNav consumers read the
//     current visibility and remove the entry from the rail / nav.
//
//   - The context is read-only on the consumer side: only pages can
//     publish, only chrome can read. This keeps the contract simple —
//     no feedback loops, no "is this page visible" questions on the
//     page itself.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type FeatureVisibility = {
  /** True when the feature is in admin "hide" mode AND the user is not a subscriber. */
  hidden: boolean;
};

type VisibilityMap = Record<string, FeatureVisibility>;

const noop = () => undefined;
const defaultValue: {
  visibility: VisibilityMap;
  setFeatureVisibility: (key: string, value: FeatureVisibility) => void;
  clearFeatureVisibility: (key: string) => void;
} = {
  visibility: {},
  setFeatureVisibility: noop,
  clearFeatureVisibility: noop,
};

const FeatureVisibilityContext = createContext<typeof defaultValue>(defaultValue);

/** Provider that owns the visibility map. */
export function FeatureVisibilityProvider({ children }: { children: ReactNode }) {
  const [visibility, setVisibility] = useState<VisibilityMap>({});

  const setFeatureVisibility = useCallback((key: string, value: FeatureVisibility) => {
    setVisibility((current) => {
      const next = { ...current };
      if (value.hidden) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);

  const clearFeatureVisibility = useCallback((key: string) => {
    setVisibility((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ visibility, setFeatureVisibility, clearFeatureVisibility }),
    [visibility, setFeatureVisibility, clearFeatureVisibility],
  );

  return <FeatureVisibilityContext.Provider value={value}>{children}</FeatureVisibilityContext.Provider>;
}

/** Read the full visibility map. */
export function useFeatureVisibilityMap() {
  return useContext(FeatureVisibilityContext).visibility;
}

/** Read the visibility for a single feature. */
export function useFeatureVisibility(key: string): FeatureVisibility {
  const map = useContext(FeatureVisibilityContext).visibility;
  return map[key] ?? { hidden: false };
}

/**
 * Publish + auto-cleanup helper. Use in feature pages to register their
 * own visibility on mount, clear on unmount.
 */
export function usePublishFeatureVisibility(key: string, value: FeatureVisibility) {
  const { setFeatureVisibility, clearFeatureVisibility } = useContext(FeatureVisibilityContext);
  useEffect(() => {
    setFeatureVisibility(key, value);
    return () => clearFeatureVisibility(key);
  }, [key, value.hidden, setFeatureVisibility, clearFeatureVisibility]);
}
