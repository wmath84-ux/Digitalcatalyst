// src/utils/appOrientation.ts
//
// HARD RULE - Mobile Portrait Lock:
// - Mobile phones (<768px) are LOCKED to portrait EVERYWHERE except Course Player.
// - Course Player is the ONLY screen where rotation is allowed.
// - This respects "auto-rotate OFF" behavior: outside course player, app never rotates
//   even if system auto-rotate is ON (hard lock). Inside course player, rotation is
//   allowed and uses FULL_SENSOR on native so it can rotate even if auto-rotate OFF
//   (like YouTube).
// - Tablet/desktop (>=768px) are NEVER locked - their layouts work in any orientation.
//
// Three layers for enforcement:
//   1. AndroidManifest.xml: android:screenOrientation="portrait" (native hard lock)
//   2. Web Manifest: orientation="portrait" (PWA hard lock)
//   3. JS: Screen Orientation API + Capacitor plugins (runtime lock/unlock)
//   4. PortraitOnlyGuard overlay: Visual fallback when API lock fails (browser tabs, iOS)

import { isMobileScreenSize } from "./responsive";

type RotationListener = () => void;

type OrientationLockable = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void> | void;
};

const rotationListeners = new Set<RotationListener>();

/** True while the Course Player is mounted — the only rotation-unlocked state. */
let coursePlayerActive = false;

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

/** Check if current viewport is mobile phone size that should be locked */
const shouldLockForCurrentViewport = (): boolean => {
  if (typeof window === "undefined") return false;
  // Tablet/desktop never locked
  if (window.innerWidth >= 768) return false;
  // Also check isMobileScreenSize for consistency
  if (!isMobileScreenSize()) return false;
  return true;
};

const setHtmlOrientationAttributes = (): void => {
  if (typeof document === "undefined") return;
  try {
    const html = document.documentElement;
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
    // Try official plugin first
    const mod = await import("@capacitor/screen-orientation").catch(() => null);
    if (mod?.ScreenOrientation?.lock) {
      await mod.ScreenOrientation.lock({ orientation: "portrait" }).catch(() => {});
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
    const mod = await import("@capacitor/screen-orientation").catch(() => null);
    if (mod?.ScreenOrientation?.unlock) {
      await mod.ScreenOrientation.unlock().catch(() => {});
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
 * Called everywhere except course player.
 * - Skips tablet/desktop (>=768px)
 * - Tries Capacitor plugin + Web API
 * - Overlay is fallback when API fails
 */
export const lockAppToPortrait = (): void => {
  if (typeof window === "undefined") return;
  if (!shouldLockForCurrentViewport()) {
    setHtmlOrientationAttributes();
    return;
  }
  // Don't lock if course player is active - it needs rotation
  if (coursePlayerActive) {
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

/**
 * Called by the Course Player on mount: unlock rotation and let the global
 * portrait guard know the overlay must stay away.
 */
export const enterCoursePlayerRotation = (): void => {
  coursePlayerActive = true;
  unlockAppRotation();
  notifyRotationChange();
  // Extra safety: try again after short delay for native
  setTimeout(() => {
    if (coursePlayerActive) unlockAppRotation();
  }, 300);
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

  // Initial lock if not in course player
  if (!coursePlayerActive && shouldLockForCurrentViewport()) {
    lockAppToPortrait();
    // Retry after delay for PWA install prompt etc
    setTimeout(() => {
      if (!coursePlayerActive) lockAppToPortrait();
    }, 1000);
  }

  // Re-lock on visibility change (app coming from background)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !coursePlayerActive) {
      lockAppToPortrait();
    }
  });

  // Re-lock on hash change (navigation) if not entering course player
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash || "";
    const isCourse = hash.startsWith("#/course/");
    if (!isCourse && !coursePlayerActive) {
      // Small delay to let route render
      setTimeout(() => lockAppToPortrait(), 100);
    } else {
      setHtmlOrientationAttributes();
    }
  });

  // Re-evaluate on resize (orientation change)
  window.addEventListener("resize", () => {
    setHtmlOrientationAttributes();
    if (!coursePlayerActive && shouldLockForCurrentViewport() && window.innerWidth > window.innerHeight) {
      // User rotated to landscape outside course player with auto-rotate ON
      // Lock will fail in browser tabs, but overlay will show
      lockAppToPortrait();
    }
  });
};
