// src/course/playerPreferences.tsx
//
// The Course Player's SHARED, PERSISTED preference layer — the one place the
// MASTER/SELF filter and the light/dark theme live so every surface (Notes,
// Mind Map, Brain, Read, AI, Sketch) reads and writes the SAME contract.
//
// ── Why a single module ─────────────────────────────────────────────────
// The brief requires three independent, remembered MASTER/SELF filters and a
// per-feature remembered theme. Doing each in its own ephemeral `useState`
// (or worse one global value) is exactly the bug to avoid: a choice must
// survive closing and re-opening the player, must not leak between features,
// and must not leak between learners on the same device. So:
//
//   · every preference is persisted to `localStorage` (the project's existing
//     user-preference convention, see `dc.mindMapArrangement`, `dc.courseNotes.*`),
//   · every key is namespaced by FEATURE (`notes` / `mindMap` / `brain` / …)
//     so Notes=SELF, MindMap=MASTER, Brain=SELF are all independently possible,
//   · every key is namespaced by the signed-in UID when one is available so a
//     second learner on the same device never inherits the first's choices.
//
// Nothing here stores a note, a map or a card — those keep their own
// Firestore/device persistence. This is UI preference state only.

import { useCallback, useEffect, useState } from "react";

export type CoursePlayerTheme = "dark" | "light";
export type MasterSelfMode = "master" | "self";
export type ModuleListingStyle = "classic" | "modern";

/** The features that carry a MASTER/SELF filter. */
export type MasterSelfFeature = "notes" | "mindMap" | "brain" | "experiment";
/** The features that carry a remembered light/dark choice. */
export type ThemedFeature = "player" | "mindMap" | "read" | "ai" | "sketch" | "notes";

const safeGet = (key: string): string | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string) => {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* private mode / quota — the in-memory state still works for this visit */
  }
};

/** One storage key, namespaced by kind + feature + (optionally) user. */
const prefKey = (kind: string, feature: string, uid?: string | null) =>
  uid ? `dc.${kind}.${feature}.${uid}` : `dc.${kind}.${feature}`;

// ── Theme ───────────────────────────────────────────────────────────────

export const loadCourseTheme = (
  feature: ThemedFeature,
  uid?: string | null,
  fallback: CoursePlayerTheme = "dark",
): CoursePlayerTheme => {
  const stored = safeGet(prefKey("courseTheme", feature, uid));
  return stored === "light" || stored === "dark" ? stored : fallback;
};

export const persistCourseTheme = (
  feature: ThemedFeature,
  theme: CoursePlayerTheme,
  uid?: string | null,
) => {
  safeSet(prefKey("courseTheme", feature, uid), theme);
};

/** Live, persisted light/dark choice for one Course Player feature. */
export function useCourseTheme(
  feature: ThemedFeature,
  uid?: string | null,
  fallback: CoursePlayerTheme = "dark",
) {
  const [theme, setTheme] = useState<CoursePlayerTheme>(() =>
    loadCourseTheme(feature, uid, fallback),
  );
  // If the signed-in user resolves after mount, re-read their stored choice.
  useEffect(() => {
    setTheme(loadCourseTheme(feature, uid, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, feature]);

  const set = useCallback(
    (next: CoursePlayerTheme) => {
      setTheme(next);
      persistCourseTheme(feature, next, uid);
    },
    [feature, uid],
  );
  const toggle = useCallback(() => {
    set(theme === "dark" ? "light" : "dark");
  }, [set, theme]);

  return { theme, setTheme: set, toggleTheme: toggle };
}

// ── Persisted booleans (e.g. Sketch "Clean / Optimised Look") ───────────

/** Live, persisted boolean preference, namespaced by kind + user. */
export function usePersistedBooleanPreference(
  kind: string,
  uid?: string | null,
  fallback = false,
) {
  const read = useCallback((): boolean => {
    const stored = safeGet(prefKey("pref", kind, uid));
    return stored === "1" ? true : stored === "0" ? false : fallback;
  }, [kind, uid, fallback]);
  const [value, setValue] = useState<boolean>(read);
  useEffect(() => {
    setValue(read());
  }, [read]);
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      safeSet(prefKey("pref", kind, uid), next ? "1" : "0");
    },
    [kind, uid],
  );
  return { value, setValue: set };
}

// ── MASTER / SELF ───────────────────────────────────────────────────────

export const loadMasterSelfMode = (
  feature: MasterSelfFeature,
  uid?: string | null,
  fallback: MasterSelfMode = "master",
): MasterSelfMode => {
  const stored = safeGet(prefKey("masterSelf", feature, uid));
  return stored === "master" || stored === "self" ? stored : fallback;
};

export const persistMasterSelfMode = (
  feature: MasterSelfFeature,
  mode: MasterSelfMode,
  uid?: string | null,
) => {
  safeSet(prefKey("masterSelf", feature, uid), mode);
};

/** Live, persisted MASTER/SELF filter for one Course Player feature. */
export function useMasterSelfPreference(
  feature: MasterSelfFeature,
  uid?: string | null,
  fallback: MasterSelfMode = "master",
) {
  const [mode, setModeState] = useState<MasterSelfMode>(() =>
    loadMasterSelfMode(feature, uid, fallback),
  );
  useEffect(() => {
    setModeState(loadMasterSelfMode(feature, uid, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, feature]);

  const setMode = useCallback(
    (next: MasterSelfMode) => {
      setModeState(next);
      persistMasterSelfMode(feature, next, uid);
    },
    [feature, uid],
  );

  return { mode, setMode };
}

// ── Module Listing Style (classic vs modern) ───────────────────────────

export const loadModuleListingStyle = (
  uid?: string | null,
  fallback: ModuleListingStyle = "classic",
): ModuleListingStyle => {
  const stored = safeGet(prefKey("moduleStyle", "listing", uid));
  return stored === "classic" || stored === "modern" ? stored : fallback;
};

export const persistModuleListingStyle = (
  style: ModuleListingStyle,
  uid?: string | null,
) => {
  safeSet(prefKey("moduleStyle", "listing", uid), style);
};

/** Live, persisted module listing style preference (classic = simple list, modern = magnifying icons). */
export function useModuleListingStyle(
  uid?: string | null,
  fallback: ModuleListingStyle = "classic",
) {
  const [style, setStyleState] = useState<ModuleListingStyle>(() =>
    loadModuleListingStyle(uid, fallback),
  );
  useEffect(() => {
    setStyleState(loadModuleListingStyle(uid, fallback));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const setStyle = useCallback(
    (next: ModuleListingStyle) => {
      setStyleState(next);
      persistModuleListingStyle(next, uid);
    },
    [uid],
  );

  return { style, setStyle };
}
