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
//   2. NATIVE immersive (Capacitor APK) — the shared controller in
//      src/utils/fullscreen.ts drives the `AppFullscreen` Android plugin,
//      which hides the status AND navigation bars through
//      WindowInsetsControllerCompat. This is the layer that makes the switch
//      actually work inside the APK: an Android WebView can never honour
//      `requestFullscreen()` unless the host Activity hosts the
//      WebChromeClient custom view (Capacitor's stock client refuses it).
//   3. theme-color — paints the bar the player's own background colour so it
//      blends edge-to-edge even before (or without) fullscreen.
//   4. black-translucent iOS meta — lets the player draw underneath a
//      translucent status bar (iOS PWA / Safari home-screen mode).
//
// The bar is restored the moment the player leaves landscape/immersive or
// unmounts.

import { setThemeColor, syncSystemThemeColor } from "./themeColor";
import {
  enterFullscreen,
  exitFullscreen,
  getFullscreenSnapshot,
  isFullscreenActive,
  subscribeFullscreen,
} from "./fullscreen";

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

/**
 * Ask for the real thing through the shared controller: the native immersive
 * bridge inside the APK (the only layer that can hide an Android WebView's
 * system bars), the Fullscreen API in a browser. `allowAppFallback: false`
 * keeps the switch honest — where neither layer works, the blended
 * theme-colour of layer 3 is still there and the toggle simply stays off.
 */
const requestPlayerFullscreen = (): void => {
  if (typeof document === "undefined") return;
  // iOS has no usable document-level fullscreen — never attempt it there.
  if (isIOSDevice()) return;
  if (document.fullscreenElement || fullscreenRequestPending) return;
  fullscreenRequestPending = true;
  try {
    void enterFullscreen({ allowAppFallback: false })
      .then((snapshot) => {
        fullscreenEnteredByPlayer = snapshot.active;
      })
      .catch(() => {
        // Blocked (no user gesture) — the theme-colour layer still paints the
        // bar. Never throw from a browser policy decision.
        fullscreenEnteredByPlayer = false;
      })
      .finally(() => {
        fullscreenRequestPending = false;
        notifyFullscreenChange();
      });
  } catch {
    fullscreenEnteredByPlayer = false;
    fullscreenRequestPending = false;
    notifyFullscreenChange();
  }
};

// Keep the module's notion of "who entered fullscreen" honest whenever the
// browser leaves fullscreen on its own (Android swipe-down / Escape)…
if (typeof document !== "undefined") {
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) fullscreenEnteredByPlayer = false;
    notifyFullscreenChange();
  });
  // …and mirror EVERY change the shared controller reports. The native
  // immersive layer (the APK) fires no browser event at all, so without this
  // the Player-tab switch would keep showing the old state after a media
  // viewer — or the platform itself — changed the layer.
  subscribeFullscreen(notifyFullscreenChange);
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
  // One call releases whichever layer took the request — the browser's own
  // fullscreen and/or the APK's native immersive bars. The native layer fires
  // no browser event, so the Player-tab switch is told explicitly.
  void exitFullscreen().finally(() => notifyFullscreenChange());
};

/**
 * Whether the player currently owns a fullscreen surface — the browser's own
 * fullscreen (any element) OR the APK's native immersive bars. Both are real
 * fullscreen for the learner, so both light the "Hide status bar" row.
 */
export const isCoursePlayerFullscreen = (): boolean =>
  typeof document !== "undefined" && isFullscreenActive();

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
    // Only the fullscreen the PLAYER itself entered is released — a media
    // viewer's element fullscreen is left exactly as the learner set it.
    const playerOwnsWebFullscreen = fullscreenEnteredByPlayer && document.fullscreenElement;
    if (playerOwnsWebFullscreen && typeof document.exitFullscreen === "function") {
      fullscreenEnteredByPlayer = false;
      void document.exitFullscreen();
    }
    if (fullscreenEnteredByPlayer || getFullscreenSnapshot().mode === "native") {
      // …and the native immersive bars, whichever layer owns them.
      fullscreenEnteredByPlayer = false;
      void exitFullscreen().finally(() => notifyFullscreenChange());
    }
    if (originalThemeColor !== null) setThemeColor(originalThemeColor);
    else syncSystemThemeColor();
    const styleMeta = document.querySelector<HTMLMetaElement>(STATUS_BAR_STYLE_SELECTOR);
    if (styleMeta && originalStatusBarStyle !== null) styleMeta.content = originalStatusBarStyle;
  }
  fullscreenEnteredByPlayer = false;
  originalThemeColor = null;
  originalStatusBarStyle = null;
  notifyFullscreenChange();
};
