// src/course/courseViewSettings.ts
//
// THE COURSE VIEW PAGE'S TWO SETTINGS — the owner's own list
// (2026-10-16), behind the Settings gear:
//
//   "Settings ke andar jo Split view page hai usko Course view kar do. Uske
//    andar zoom ho — smaller/larger, jo scale/pan kare — aur char divider
//    visibility checkboxes ho, jisse har divider alag-alag show/hide ho sake.
//    Zoom har format mein carry kare. Ek setting se purana WALA 4-VERTICAL
//    layout wapas aa jaye (matlab charon divider on)."
//
// Two stored values, shared by the Settings page and the player:
//
//   · ZOOM — a percentage around 100. Smaller zooms the whole course area
//     out, larger zooms in; the deck scrolls (pans) at either end so the
//     learner can always reach every corner. `prefers-reduced-motion` is
//     respected: the scale simply JUMPS instead of easing, and nothing else
//     about the layout changes.
//
//   · DIVIDERS — the cross has four DIVIDER SEGMENTS (the two halves of the
//     vertical line, the two halves of the horizontal one). Each one has its
//     own switch: off hides that piece of the line (and its dot handle) but
//     never the drag — the boundary stays resizable, exactly as the brief
//     demands. "All four on" is the old four-divider look; "all four off" is
//     a clean four-block grid with no chrome, which is why every combination
//     is allowed.
//
// Storage follows the same tiny store pattern as the footer navigation
// (localStorage + a window event + useSyncExternalStore), so the Settings page
// and the running player never disagree.

import { useSyncExternalStore } from "react";

export type CourseDividerSegment = "vTop" | "vBottom" | "hLeft" | "hRight";

export const COURSE_DIVIDER_SEGMENTS: CourseDividerSegment[] = ["vTop", "vBottom", "hLeft", "hRight"];

export const COURSE_DIVIDER_SEGMENT_LABEL: Record<CourseDividerSegment, string> = {
  vTop: "Vertical divider — top half",
  vBottom: "Vertical divider — bottom half",
  hLeft: "Horizontal divider — left half",
  hRight: "Horizontal divider — right half",
};

export type CourseDividerVisibility = Record<CourseDividerSegment, boolean>;

export const COURSE_VIEW_DEFAULT_DIVIDERS: CourseDividerVisibility = {
  vTop: true,
  vBottom: true,
  hLeft: true,
  hRight: true,
};

/** 100 = the deck as it ships. 80% is the smallest, 140% the largest. */
export const COURSE_VIEW_ZOOM_MIN = 80;
export const COURSE_VIEW_ZOOM_MAX = 140;
export const COURSE_VIEW_ZOOM_STEP = 10;
export const COURSE_VIEW_ZOOM_DEFAULT = 100;

export interface CourseViewSettings {
  zoom: number;
  dividers: CourseDividerVisibility;
}

export const COURSE_VIEW_DEFAULT_SETTINGS: CourseViewSettings = {
  zoom: COURSE_VIEW_ZOOM_DEFAULT,
  dividers: COURSE_VIEW_DEFAULT_DIVIDERS,
};

export const clampCourseViewZoom = (value: number) =>
  Math.min(COURSE_VIEW_ZOOM_MAX, Math.max(COURSE_VIEW_ZOOM_MIN, Math.round(Number.isFinite(value) ? value : COURSE_VIEW_ZOOM_DEFAULT)));

/** The toggle the Course view checkboxes call. */
export function toggleCourseDivider(
  dividers: CourseDividerVisibility,
  segment: CourseDividerSegment,
): CourseDividerVisibility {
  return { ...dividers, [segment]: !dividers[segment] };
}

/** True while the learner has every segment on — the old four-divider look. */
export const courseDividersComplete = (dividers: CourseDividerVisibility): boolean =>
  COURSE_DIVIDER_SEGMENTS.every((segment) => dividers[segment]);

const STORAGE_KEY = "dc-course-view-settings";
const CHANGE_EVENT = "dc:course-view-settings-change";

function normalize(raw: unknown): CourseViewSettings {
  const value = (raw ?? {}) as Partial<CourseViewSettings>;
  const dividers = { ...COURSE_VIEW_DEFAULT_DIVIDERS };
  const stored = (value.dividers ?? {}) as Partial<CourseDividerVisibility>;
  for (const segment of COURSE_DIVIDER_SEGMENTS) {
    if (typeof stored[segment] === "boolean") dividers[segment] = stored[segment] === true;
  }
  return {
    zoom: clampCourseViewZoom(typeof value.zoom === "number" ? value.zoom : COURSE_VIEW_ZOOM_DEFAULT),
    dividers,
  };
}

/* ── Snapshot identity — the one rule this store MUST keep ────────────────
 *
 * This getter is handed straight to `useSyncExternalStore` (see the hook at
 * the bottom of this file), and React calls it on every render and again right
 * after — if the two answers are not the SAME object it decides the store
 * changed and re-renders, forever: "The result of getSnapshot should be cached
 * to avoid an infinite loop", then "Maximum update depth exceeded" (React
 * error #185), which the Course Player's error boundary shows as "Course
 * Player hit a snag" the moment a course is opened.
 *
 * `normalize()` builds a fresh object every call, so the RAW STRING is the
 * cache key: an unchanged stored value returns the very same object, and any
 * real change (a zoom, a divider switch, another tab) re-parses once. This is
 * the same rule `src/work/storage/workPrefs.ts` documents for its history
 * snapshot — the shared default object is the answer whenever nothing is
 * stored, storage is denied, or the stored JSON cannot be read.
 */
let cachedRaw: string | null = null;
let cachedSettings: CourseViewSettings = COURSE_VIEW_DEFAULT_SETTINGS;

export function getCourseViewSettings(): CourseViewSettings {
  if (typeof window === "undefined") return COURSE_VIEW_DEFAULT_SETTINGS;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return COURSE_VIEW_DEFAULT_SETTINGS;
  }
  // Nothing stored (or the value was cleared): the stable shared default.
  if (!raw) {
    cachedRaw = null;
    return COURSE_VIEW_DEFAULT_SETTINGS;
  }
  if (raw === cachedRaw) return cachedSettings;
  try {
    cachedSettings = normalize(JSON.parse(raw) as unknown);
  } catch {
    cachedSettings = COURSE_VIEW_DEFAULT_SETTINGS;
  }
  cachedRaw = raw;
  return cachedSettings;
}

function write(next: CourseViewSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage denied: the event below still updates every mounted deck.
  }
  window.dispatchEvent(new window.Event(CHANGE_EVENT));
}

export function setCourseViewZoom(zoom: number): void {
  const current = getCourseViewSettings();
  write({ ...current, zoom: clampCourseViewZoom(zoom) });
}

export function setCourseDividerVisible(segment: CourseDividerSegment, visible: boolean): void {
  const current = getCourseViewSettings();
  write({ ...current, dividers: { ...current.dividers, [segment]: visible === true } });
}

export function resetCourseViewSettings(): void {
  write(COURSE_VIEW_DEFAULT_SETTINGS);
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCourseViewSettings(): CourseViewSettings {
  return useSyncExternalStore(subscribe, getCourseViewSettings, () => COURSE_VIEW_DEFAULT_SETTINGS);
}
