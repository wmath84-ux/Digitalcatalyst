// src/utils/appOrientation.ts
//
// Phones are locked to portrait across the app, except while the Course Player
// is open. The Course Player uses FULL_SENSOR so lessons can rotate even when
// system auto-rotate is off. Tablets and desktops are never locked.
//
// Enforcement layers:
//   1. AndroidManifest.xml lets the native activity rotate; JS applies the
//      portrait lock outside the Course Player.
//   2. The PWA manifest defaults to portrait.
//   3. The Screen Orientation API and Capacitor plugin enforce the runtime lock.
//   4. PortraitOnlyGuard is the visual fallback when an API lock is rejected.

import { isMobileDevice } from "./courseStatusBar";

type RotationListener = () => void;

type OrientationLockable = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void> | void;
};

const rotationListeners = new Set<RotationListener>();

/** True while the Course Player is mounted — rotation unlocked. */
let coursePlayerActive = false;
/** Portrait lock / rotate-overlay stay off while the Course Player is open. */
const rotationUnlocked = (): boolean => coursePlayerActive;

/**
 * Is this a phone-sized device, independent of the current orientation?
 * The old logic used `window.innerWidth < 768`, but `innerWidth` grows past 768
 * the instant a phone is rotated to landscape, which made the app believe it was
 * on a tablet/desktop and silently skipped BOTH the portrait lock and the
 * "rotate your phone" overlay. A phone is a phone no matter which way it is held,
 * so we detect it from the device's *smaller* physical CSS dimension: a phone's
 * short side stays well under 600px in every orientation, while tablets/desktops
 * are always >= 600px.
 */
export const isPhoneDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  if (!isMobileDevice()) return false;
  try {
    const w = window.screen?.width ?? 0;
    const h = window.screen?.height ?? 0;
    return Math.min(w, h) < 600;
  } catch {
    return true;
  }
};

export const onCoursePlayerRotationChange = (listener: RotationListener): (() => void) => {
  rotationListeners.add(listener);
  return () => {
    rotationListeners.delete(listener);
  };
};

const notifyRotationChange = (): void => {
  setHtmlOrientationAttributes();
  for (const listener of rotationListeners) listener();
};

/**
 * Should this device be locked to portrait? True only for phones (never for
 * tablet/desktop), REGARDLESS of which way the phone is currently held. This is
 * what makes the rule "hard": a phone in landscape still gets locked.
 */
const shouldLockForCurrentViewport = (): boolean => {
  if (typeof window === "undefined") return false;
  // Tablet/desktop never locked
  return isPhoneDevice();
};

const setHtmlOrientationAttributes = (): void => {
  if (typeof document === "undefined") return;
  try {
    const html = document.documentElement;
    // Publish the device decision as an explicit, always-correct signal that is
    // independent of any lock state. CSS re-gates the landscape phone freeze
    // (`touch-action: none`) and the "rotate your phone" overlay on this, so a
    // TABLET window in a narrow landscape band is never touch-frozen and never
    // shown the rotate overlay. `isPhoneDevice()` reads the device's smaller
    // physical CSS dimension, so it stays true in Android split-screen — where
    // `screen.*` still reports the whole device display — and false on a real
    // tablet regardless of how the window is sized.
    if (isPhoneDevice()) {
      html.setAttribute("data-phone-device", "true");
    } else {
      html.removeAttribute("data-phone-device");
    }
    if (coursePlayerActive) {
      html.setAttribute("data-course-player-active", "true");
      html.removeAttribute("data-orientation-locked");
    } else {
      html.removeAttribute("data-course-player-active");
      if (shouldLockForCurrentViewport()) {
        html.setAttribute("data-orientation-locked", "portrait");
      } else {
        html.removeAttribute("data-orientation-locked");
      }
    }
  } catch {}
};

/** Try Capacitor Screen Orientation plugin lock */
const tryCapacitorLockPortrait = async (): Promise<void> => {
  try {
    // Use official @capacitor/screen-orientation plugin (installed as ^7.0.4)
    const mod = await import("@capacitor/screen-orientation").catch(() => null);
    if (mod?.ScreenOrientation?.lock) {
      await mod.ScreenOrientation.lock({ orientation: "portrait-primary" }).catch(() => {});
      return;
    }
  } catch {}
  try {
    // Try custom AppOrientation plugin (FULL_SENSOR support)
    // @ts-ignore - custom plugin may not have types
    const { Capacitor } = await import("@capacitor/core").catch(() => ({ Capacitor: null } as any));
    if (Capacitor?.isNativePlatform?.()) {
      const plugins: any = (Capacitor as any).Plugins || {};
      // Try custom plugin
      if (plugins.AppOrientation?.lockPortrait) {
        await plugins.AppOrientation.lockPortrait().catch(() => {});
        return;
      }
      // Fallback to dynamic import of custom plugin
      const custom = await import("@capacitor/core").then(() => {
        try {
          // @ts-ignore
          return (window as any).Capacitor?.Plugins?.AppOrientation;
        } catch { return null; }
      });
      if (custom?.lockPortrait) {
        await custom.lockPortrait().catch(() => {});
      }
    }
  } catch {}
};

/** Try Capacitor unlock for course player */
const tryCapacitorUnlock = async (): Promise<void> => {
  try {
    // Use official @capacitor/screen-orientation plugin (installed as ^7.0.4)
    const mod = await import("@capacitor/screen-orientation").catch(() => null);
    if (mod?.ScreenOrientation?.unlock) {
      await mod.ScreenOrientation.unlock().catch(() => {});
      return;
    }
  } catch {}
  try {
    // @ts-ignore
    const { Capacitor } = await import("@capacitor/core").catch(() => ({ Capacitor: null } as any));
    if (Capacitor?.isNativePlatform?.()) {
      const plugins: any = (Capacitor as any).Plugins || {};
      if (plugins.AppOrientation?.unlock) {
        await plugins.AppOrientation.unlock().catch(() => {});
        return;
      }
      // Try via window.Capacitor
      const custom = (window as any).Capacitor?.Plugins?.AppOrientation;
      if (custom?.unlock) {
        await custom.unlock().catch(() => {});
      }
    }
  } catch {}
};

/**
 * HARD RULE: Lock the app to portrait on mobile phones.
 * Called everywhere except the Course Player.
 * - Skips tablets/desktops (short side >=600px)
 * - Tries Capacitor plugin + Web API
 * - Overlay is fallback when API fails
 */
export const lockAppToPortrait = (): void => {
  if (typeof window === "undefined") return;
  if (!shouldLockForCurrentViewport()) {
    setHtmlOrientationAttributes();
    return;
  }
  // Don't lock while the Course Player is open — it needs rotation.
  if (rotationUnlocked()) {
    setHtmlOrientationAttributes();
    return;
  }

  setHtmlOrientationAttributes();

  // Web API lock (works in PWA standalone and fullscreen)
  try {
    const orientation = screen.orientation as OrientationLockable | undefined;
    if (orientation?.lock) {
      const result = orientation.lock("portrait");
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {
          /* rejected - overlay will handle */
        });
      }
    }
  } catch {
    /* unsupported */
  }

  // Capacitor native lock (fire and forget)
  void tryCapacitorLockPortrait();
};

/** Let the device rotate freely again (Course Player only) */
export const unlockAppRotation = (): void => {
  setHtmlOrientationAttributes();
  // Web API unlock
  try {
    if (typeof screen !== "undefined" && screen.orientation?.unlock) {
      screen.orientation.unlock();
    }
  } catch {
    /* already unlocked */
  }
  // Capacitor unlock to FULL_SENSOR
  void tryCapacitorUnlock();
};

export const isCoursePlayerRotationActive = (): boolean => coursePlayerActive;

/** True while the Course Player is open and rotation is unlocked. */
export const isRotationUnlockedActive = (): boolean => rotationUnlocked();

/**
 * Called by the Course Player on mount: unlock rotation and let the global
 * portrait guard know the overlay must stay away.
 */
export const enterCoursePlayerRotation = (): void => {
  coursePlayerActive = true;
  unlockAppRotation();
  notifyRotationChange();
  // Extra safety: retry unlock after delays for native platforms.
  // The Capacitor Screen Orientation plugin may need time to bind after
  // the native activity switches from portrait-locked to fullSensor.
  setTimeout(() => {
    if (coursePlayerActive) unlockAppRotation();
  }, 300);
  setTimeout(() => {
    if (coursePlayerActive) unlockAppRotation();
  }, 800);
};

/**
 * Called by the Course Player on unmount: lock straight back to portrait
 * and re-arm the overlay, so no other screen can ever appear in landscape.
 */
export const exitCoursePlayerRotation = (): void => {
  coursePlayerActive = false;
  lockAppToPortrait();
  notifyRotationChange();
  // Extra safety: ensure portrait lock sticks
  setTimeout(() => {
    if (!coursePlayerActive) lockAppToPortrait();
  }, 300);
};

/**
 * Initialize orientation lock on app startup.
 * Call this once when app loads to enforce portrait on mobile.
 */
export const initOrientationLock = (): void => {
  if (typeof window === "undefined") return;

  setHtmlOrientationAttributes();

  // Initial lock outside the Course Player.
  if (!coursePlayerActive && shouldLockForCurrentViewport()) {
    lockAppToPortrait();
    // Retry after delay for PWA install prompt etc
    setTimeout(() => {
      if (!coursePlayerActive) lockAppToPortrait();
    }, 1000);
  }

  // Re-lock on visibility change (app coming from background)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!rotationUnlocked()) lockAppToPortrait();
  });

  // Re-lock on hash change if navigation leaves the Course Player.
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash || "";
    const isCourse = hash.startsWith("#/course/");
    if (!isCourse && !rotationUnlocked()) {
      // Small delay to let route render
      setTimeout(() => lockAppToPortrait(), 100);
    } else {
      setHtmlOrientationAttributes();
    }
  });

  // Re-evaluate on resize (orientation change)
  window.addEventListener("resize", () => {
    setHtmlOrientationAttributes();
    if (!rotationUnlocked() && shouldLockForCurrentViewport() && window.innerWidth > window.innerHeight) {
      // User rotated to landscape outside the Course Player. Lock may fail
      // in browser tabs, but the overlay will
      // show.
      lockAppToPortrait();
    }
  });
};
