// src/utils/responsive.ts
//
// Tablet / desktop detection helpers used across the app shell.
//
// The platform is currently designed mobile-first (max-w-md / phone frame),
// so these helpers let a component or stylesheet ASK "am I on a tablet?"
// or "am I on a desktop?" before applying the right layout.
//
// The breakpoints below match the marketing team's design grid:
//   mobile  : 0    – 767 px   (single column, bottom nav, phone frame)
//   tablet  : 768  – 1023 px  (two- / three-column, side rail opt-in)
//   desktop : 1024 +         (full width, persistent side rail nav,
//                             multi-column content, hover affordances)

import { useEffect, useState } from "react";

/** Below 768 px — phones (and very narrow windows). */
export const MOBILE_BREAKPOINT = 768;
/** 768–1023 px — tablets (iPad, Android tablets, narrow laptop windows). */
export const TABLET_BREAKPOINT = 1024;
/** 1024+ px — desktop (laptops, monitors, large iPad landscape). */
export const DESKTOP_BREAKPOINT = 1024;

/** True when the viewport is a phone-sized screen (< 768 px). */
export const isMobileScreenSize = (): boolean => {
  if (typeof window === "undefined") return true;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

/**
 * True when the viewport is a tablet-sized screen (768–1023 px). The PWA
 * is in this range on a portrait iPad / Android tablet and on narrow
 * laptop windows.
 */
export const isTabletScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT;
};

/**
 * True when the viewport is a desktop-sized screen (>= 1024 px). The
 * desktop layout is the first-class experience on a laptop / monitor:
 * persistent left rail, multi-column content, top bar, hover affordances.
 */
export const isDesktopScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= DESKTOP_BREAKPOINT;
};

/** True for any wide viewport (tablet OR desktop). */
export const isWideScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= MOBILE_BREAKPOINT;
};

/**
 * Reactive React hook that re-evaluates the current viewport category on
 * resize. Components that need to change DOM structure (not just CSS)
 * between mobile / tablet / desktop should use this instead of the
 * static `isMobileScreenSize()` etc. helpers. CSS media queries cover
 * everything else.
 */
export const useResponsiveCategory = (): "mobile" | "tablet" | "desktop" => {
  const [category, setCategory] = useState<"mobile" | "tablet" | "desktop">(() => {
    if (typeof window === "undefined") return "desktop";
    if (window.innerWidth < MOBILE_BREAKPOINT) return "mobile";
    if (window.innerWidth < TABLET_BREAKPOINT) return "tablet";
    return "desktop";
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => {
      if (window.innerWidth < MOBILE_BREAKPOINT) setCategory("mobile");
      else if (window.innerWidth < TABLET_BREAKPOINT) setCategory("tablet");
      else setCategory("desktop");
    };
    window.addEventListener("resize", update);
    // Listen for visualViewport changes (soft keyboard / browser zoom) too.
    window.visualViewport?.addEventListener?.("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener?.("resize", update);
    };
  }, []);
  return category;
};

/**
 * Tailwind-style responsive max-width for the app shell.
 *  - mobile  : 100vw (edge-to-edge inside the device)
 *  - tablet  : 720px  (iPad portrait/landscape — 768+ viewports leave a
 *                    comfortable 24px gutter on either side)
 *  - desktop : 1280px (a real laptop / monitor: a comfortable reading
 *                    column with a permanent side rail on the left; the
 *                    content never stretches beyond a 1280px max so a
 *                    27" monitor doesn't turn the app into a thin
 *                    ribbon of content surrounded by empty wallpaper)
 */
export const APP_FRAME_MAX_WIDTHS = {
  mobile: "100vw",
  tablet: "720px",
  desktop: "1280px",
} as const;

/** Pure-CSS breakpoint query that fires only on tablet-sized viewports. */
export const TABLET_MEDIA_QUERY = `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`;
/** Pure-CSS breakpoint query that fires only on desktop-sized viewports. */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_BREAKPOINT}px)`;
