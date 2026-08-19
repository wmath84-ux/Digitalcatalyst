// src/utils/appOrientation.ts
//
// The installed PWA is locked to portrait EXCEPT while the Course Player is
// open. The player is the only screen where rotating the phone makes sense
// (landscape lessons), so it is the only screen that unlocks rotation —
// and it re-locks the moment it unmounts.
//
// A regular browser tab is never locked. Visitors must be able to browse
// the site and tap Install PWA from any orientation; the Screen Orientation
// API also rejects lock() outside standalone / fullscreen anyway.
//
// Two layers, because no single browser API is universal:
//
//   1. Screen Orientation API — `lock("portrait")` genuinely prevents
//      rotation. It is honoured in installed PWAs (display: standalone)
//      and inside fullscreen. A plain mobile browser tab is skipped.
//   2. PortraitOnlyGuard overlay — a full-screen "rotate your phone" panel
//      shown only in the installed PWA whenever the viewport is landscape
//      and the Course Player is closed.

import { isPwaInstalled } from "./pwaInstall";

type RotationListener = () => void;

/**
 * TS 5.9's DOM lib no longer ships `ScreenOrientation.lock` (the spec
 * deprecated it), but Android Chrome and installed PWAs still honour it.
 * Access it through a structural type so the call compiles everywhere.
 */
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
  for (const listener of rotationListeners) listener();
};

/**
 * Lock the screen to portrait. Installed PWA only — a regular browser
 * tab must stay free so the landing / install flow remains usable.
 * Best-effort: browsers that refuse (no fullscreen, desktop, iOS) reject
 * or throw, and the portrait overlay covers those cases in the PWA.
 */
export const lockAppToPortrait = (): void => {
  if (typeof screen === "undefined") return;
  if (!isPwaInstalled()) return;
  const orientation = screen.orientation as OrientationLockable | undefined;
  if (!orientation || typeof orientation.lock !== "function") return;
  try {
    const result = orientation.lock("portrait");
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        /* rejected without fullscreen — the guard overlay is the fallback */
      });
    }
  } catch {
    /* desktop / unsupported — nothing to lock */
  }
};

/** Let the device rotate freely again (Course Player only). */
export const unlockAppRotation = (): void => {
  if (typeof screen === "undefined" || !screen.orientation || typeof screen.orientation.unlock !== "function") return;
  try {
    screen.orientation.unlock();
  } catch {
    /* already unlocked / unsupported */
  }
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
};

/**
 * Called by the Course Player on unmount: lock straight back to portrait
 * and re-arm the overlay, so no other screen can ever appear in landscape.
 */
export const exitCoursePlayerRotation = (): void => {
  coursePlayerActive = false;
  lockAppToPortrait();
  notifyRotationChange();
};
