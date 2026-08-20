// src/utils/courseStatusBar.ts
//
// Hides the phone's status bar while the Course Player runs in landscape
// (or the quarter-turned immersive) mode on a mobile device.
//
// ── WHY THE BAR WON'T HIDE WITHOUT A TAP (the honest truth) ─────────────
// The ONLY web API that can truly hide the phone's status bar is the
// Fullscreen API, and on Android Chrome / installed PWAs it is only honoured
// when the request rides a REAL user gesture (a tap). A physical rotation is
// NOT a gesture, so a gesture-less `requestFullscreen()` is rejected by the
// browser and the bar stays — that is a browser security rule, not a bug in
// this code. iOS Safari / PWA never hides the bar at all (OS restriction).
//
// So we hide it in layers:
//
//   1. Fullscreen API — called from (a) a dedicated "hide status bar" button
//      in the landscape rail and (b) the first touch on the landscape player.
//      Both are real gestures, so Android reliably hides the bar (and, with
//      `navigationUI: "hide"`, the gesture navigation bar too).
//   2. theme-color — paints the bar the player's own background colour so it
//      blends edge-to-edge even before (or without) fullscreen.
//   3. black-translucent iOS meta — lets the player draw underneath a
//      translucent status bar (iOS PWA / Safari home-screen mode).
//
// The bar is restored the moment the player leaves landscape/immersive or
// unmounts.

import { setThemeColor } from "./themeColor";

const STATUS_BAR_STYLE_SELECTOR = 'meta[name="apple-mobile-web-app-status-bar-style"]';

/** Snapshot of the document chrome before the player hid it. */
let originalThemeColor: string | null = null;
let originalStatusBarStyle: string | null = null;
/** True while landscape/immersive learning is in charge of the bar. */
let landscapeChromeActive = false;
/** True when the player itself entered fullscreen (not a viewer toggle). */
let fullscreenEnteredByPlayer = false;
/** Guards against double fullscreen requests from tap + effect. */
let fullscreenRequestPending = false;
/** Listeners for the fullscreen state (the rail button mirrors the icon). */
const fullscreenListeners = new Set<() => void>();

/** Touch-first devices only — a desktop browser never loses its chrome. */
export const isMobileDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(pointer: coarse)").matches
      || navigator.maxTouchPoints > 0
      || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")
    );
  } catch {
    return false;
  }
};

/** iOS can never hide its status bar from a web page — fullscreen is Android-only. */
export const isIOSDevice = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
};

const applyCourseStatusBarMeta = (playerBackground: string): void => {
  if (typeof document === "undefined") return;
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta && originalThemeColor === null) originalThemeColor = themeMeta.content;
  const styleMeta = document.querySelector<HTMLMetaElement>(STATUS_BAR_STYLE_SELECTOR);
  if (styleMeta && originalStatusBarStyle === null) originalStatusBarStyle = styleMeta.content;
  setThemeColor(playerBackground || "#090912");
  if (styleMeta) styleMeta.content = "black-translucent";
};

const notifyFullscreenChange = (): void => {
  for (const listener of fullscreenListeners) listener();
};

// `navigationUI: "hide"` makes Android's fullscreen "immersive" — the gesture
// navigation bar is hidden too, leaving only the player edge-to-edge.
const FULLSCREEN_OPTIONS: FullscreenOptions = { navigationUI: "hide" };

const requestPlayerFullscreen = (): void => {
  if (typeof document === "undefined") return;
  // iOS has no usable document-level fullscreen — never attempt it there.
  if (isIOSDevice()) return;
  if (document.fullscreenElement || fullscreenRequestPending) return;
  const root = document.documentElement;
  const requestFs = root.requestFullscreen?.bind(root);
  if (typeof requestFs !== "function") return;
  fullscreenRequestPending = true;
  try {
    const request = requestFs(FULLSCREEN_OPTIONS);
    if (request && typeof request.then === "function") {
      request
        .then(() => {
          fullscreenEnteredByPlayer = true;
        })
        .catch(() => {
          // Blocked (no user gesture) — the theme-colour layers still hide
          // the bar visually. Never throw from a browser policy decision.
          fullscreenEnteredByPlayer = false;
        })
        .finally(() => {
          fullscreenRequestPending = false;
          notifyFullscreenChange();
        });
    } else {
      fullscreenEnteredByPlayer = true;
      fullscreenRequestPending = false;
      notifyFullscreenChange();
    }
  } catch {
    fullscreenEnteredByPlayer = false;
    fullscreenRequestPending = false;
    notifyFullscreenChange();
  }
};

// Keep the module's notion of "who entered fullscreen" honest whenever the
// browser leaves fullscreen on its own (Android swipe-down / Escape).
if (typeof document !== "undefined") {
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) fullscreenEnteredByPlayer = false;
    notifyFullscreenChange();
  });
}

/**
 * Hide the status bar for landscape learning. Idempotent: calling it from
 * both a button handler (user gesture → real fullscreen) and a layout effect
 * (rotation → colour fallback) is safe.
 */
export const enterCourseLandscapeChrome = (playerBackground: string): void => {
  if (typeof document === "undefined" || !isMobileDevice()) return;
  landscapeChromeActive = true;
  applyCourseStatusBarMeta(playerBackground);
  requestPlayerFullscreen();
};

/** Gesture-driven fullscreen for the landscape "hide status bar" button. */
export const enterCoursePlayerFullscreen = (): void => {
  if (typeof document === "undefined" || !isMobileDevice()) return;
  landscapeChromeActive = true;
  requestPlayerFullscreen();
};

/** Leave fullscreen but stay in the landscape player (the bar blends again). */
export const exitCoursePlayerFullscreen = (): void => {
  if (typeof document === "undefined") return;
  fullscreenEnteredByPlayer = false;
  if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
    void document.exitFullscreen();
  }
};

/** Whether the document is currently fullscreen (any element). */
export const isCoursePlayerFullscreen = (): boolean =>
  typeof document !== "undefined" && Boolean(document.fullscreenElement);

/** Subscribe to fullscreen state changes (the rail button mirrors the icon). */
export const onCourseFullscreenChange = (listener: () => void): (() => void) => {
  fullscreenListeners.add(listener);
  return () => {
    fullscreenListeners.delete(listener);
  };
};

/**
 * Refresh only the blended bar colour (e.g. when the learner flips the
 * light/dark theme while already in landscape) without re-requesting
 * fullscreen — that request would be gesture-less and get blocked.
 */
export const syncCourseLandscapeChromeColor = (playerBackground: string): void => {
  if (!landscapeChromeActive || typeof document === "undefined") return;
  setThemeColor(playerBackground || "#090912");
};

/**
 * Bring the status bar back. Called when the player leaves landscape /
 * immersive and when the player unmounts. Only exits fullscreen if the
 * player itself entered it — a viewer-level fullscreen toggle is left
 * untouched.
 */
export const restoreStatusBarFromCoursePlayer = (): void => {
  landscapeChromeActive = false;
  fullscreenRequestPending = false;
  if (typeof document !== "undefined") {
    if (fullscreenEnteredByPlayer && document.fullscreenElement && typeof document.exitFullscreen === "function") {
      fullscreenEnteredByPlayer = false;
      void document.exitFullscreen();
    }
    if (originalThemeColor !== null) setThemeColor(originalThemeColor);
    const styleMeta = document.querySelector<HTMLMetaElement>(STATUS_BAR_STYLE_SELECTOR);
    if (styleMeta && originalStatusBarStyle !== null) styleMeta.content = originalStatusBarStyle;
  }
  fullscreenEnteredByPlayer = false;
  originalThemeColor = null;
  originalStatusBarStyle = null;
  notifyFullscreenChange();
};
