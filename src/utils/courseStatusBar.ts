// src/utils/courseStatusBar.ts
//
// Hides the phone's status bar while the Course Player runs in landscape
// (or the quarter-turned immersive) mode on a mobile device. This is fully
// automatic and default-on — there is deliberately NO user-facing toggle:
// while learning in landscape the bar is simply always off, and it comes
// back the moment the player leaves landscape or unmounts.
//
// Three best-effort layers, because no single web API is universal:
//
//   1. Fullscreen API — the only way to truly hide the bar. It is granted
//      when the request rides a real user gesture (the "Rotate to
//      fullscreen" tap on Android Chrome / installed PWA); browsers that
//      block a gesture-less request (a physical rotation) reject it and we
//      carry on with the two visual layers below.
//   2. theme-color — paints the bar the player's own background colour so
//      it blends into the edge-to-edge player surface instead of rendering
//      as a bright strip above the content.
//   3. black-translucent iOS meta — lets the player draw underneath a
//      translucent status bar (iOS PWA / Safari home-screen mode).

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

const applyCourseStatusBarMeta = (playerBackground: string): void => {
  if (typeof document === "undefined") return;
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta && originalThemeColor === null) originalThemeColor = themeMeta.content;
  const styleMeta = document.querySelector<HTMLMetaElement>(STATUS_BAR_STYLE_SELECTOR);
  if (styleMeta && originalStatusBarStyle === null) originalStatusBarStyle = styleMeta.content;
  setThemeColor(playerBackground || "#090912");
  if (styleMeta) styleMeta.content = "black-translucent";
};

const requestPlayerFullscreen = (): void => {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement || fullscreenRequestPending) return;
  if (typeof document.documentElement.requestFullscreen !== "function") return;
  fullscreenRequestPending = true;
  try {
    const request = document.documentElement.requestFullscreen() as unknown as Promise<void> | undefined;
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
        });
    } else {
      fullscreenEnteredByPlayer = true;
      fullscreenRequestPending = false;
    }
  } catch {
    fullscreenEnteredByPlayer = false;
    fullscreenRequestPending = false;
  }
};

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
};
