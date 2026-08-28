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
//
// NEW REQUIREMENT (tablet landscape = desktop):
//   - If tablet user is in landscape, show desktop-like interface
//   - If width is 1.5x mobile width (640*1.5=960), show full desktop with side panel on tablet too
//   - All elements boxes text should scale according to tablet size

import { useEffect, useState } from "react";

/** Below 768 px — phones (and very narrow windows). */
export const MOBILE_BREAKPOINT = 768;
/** 768–1023 px — tablets (iPad, Android tablets, narrow laptop windows). */
export const TABLET_BREAKPOINT = 1024;
/** 1024+ px — desktop (laptops, monitors, large iPad landscape). */
export const DESKTOP_BREAKPOINT = 1024;

/** Base mobile width used for 1.5x calculation (Tailwind sm = 640). */
export const MOBILE_BASE_WIDTH = 640;
/** When width >= 960 (1.5x mobile), show full desktop with side panel even on tablet. */
export const DESKTOP_ON_TABLET_THRESHOLD = Math.round(MOBILE_BASE_WIDTH * 1.5); // 960
/** Minimum width where tablet landscape should show desktop. */
export const TABLET_LANDSCAPE_MIN_WIDTH = 640;

/** Check if viewport is in landscape orientation. */
export const isLandscapeOrientation = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    // Prefer visualViewport / screen orientation if available, fallback to width > height
    if (window.matchMedia) {
      if (window.matchMedia("(orientation: landscape)").matches) return true;
    }
    return window.innerWidth > window.innerHeight;
  } catch {
    return false;
  }
};

/** Check if device is likely a tablet (not a phone) using screen size heuristic. */
export const isTabletDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const w = window.screen?.width ?? 0;
    const h = window.screen?.height ?? 0;
    const minScreen = Math.min(w, h);
    // Phone's short side stays <600px, tablet >=600px (same as appOrientation.ts)
    if (minScreen > 0) {
      return minScreen >= 600;
    }
    // Fallback: width based
    return window.innerWidth >= MOBILE_BASE_WIDTH;
  } catch {
    return window.innerWidth >= MOBILE_BASE_WIDTH;
  }
};

/** True when tablet is in landscape mode - should show desktop interface. */
export const isTabletLandscape = (): boolean => {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const landscape = width > height;
  // Tablet landscape: width in tablet range or above mobile base, landscape, and not phone
  const isTabletWidth = width >= TABLET_LANDSCAPE_MIN_WIDTH && width < 1366; // include large tablets
  const tabletDevice = isTabletDevice();
  return landscape && isTabletWidth && tabletDevice;
};

/** True when width is >=1.5x mobile width (960px) - should show full desktop with side panel on tablet. */
export const isWideTablet = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= DESKTOP_ON_TABLET_THRESHOLD;
};

/** True when we should show desktop interface on tablet (landscape OR wide). */
export const shouldShowDesktopOnTablet = (): boolean => {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth;
  // Full desktop breakpoint
  if (width >= DESKTOP_BREAKPOINT) return true;
  // 1.5x mobile width rule
  if (width >= DESKTOP_ON_TABLET_THRESHOLD) return true;
  // Tablet landscape rule
  if (isTabletLandscape()) return true;
  return false;
};

/** True when the viewport is a phone-sized screen (< 768 px) AND not tablet landscape. */
export const isMobileScreenSize = (): boolean => {
  if (typeof window === "undefined") return true;
  // If tablet landscape should show desktop, it's not mobile
  if (shouldShowDesktopOnTablet()) return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

/**
 * True when the viewport is a tablet-sized screen (768–1023 px) in portrait.
 * Landscape tablets now show desktop, so they return false here.
 */
export const isTabletScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth;
  // If should show desktop, not considered tablet portrait
  if (shouldShowDesktopOnTablet()) return false;
  return width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT;
};

/**
 * True when the viewport is a desktop-sized screen OR tablet in landscape OR wide tablet.
 * The desktop layout is the first-class experience on a laptop / monitor AND tablet landscape.
 */
export const isDesktopScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  return shouldShowDesktopOnTablet();
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
 *
 * NEW LOGIC:
 * - Tablet landscape => desktop
 * - Width >=960 (1.5x mobile) => desktop with side panel
 */
export const useResponsiveCategory = (): "mobile" | "tablet" | "desktop" => {
  const getCategory = (): "mobile" | "tablet" | "desktop" => {
    if (typeof window === "undefined") return "desktop";
    const width = window.innerWidth;
    const height = window.innerHeight;
    const landscape = width > height;
    const tabletDevice = (() => {
      try {
        const w = window.screen?.width ?? 0;
        const h = window.screen?.height ?? 0;
        const minScreen = Math.min(w, h);
        if (minScreen > 0) return minScreen >= 600;
        return width >= MOBILE_BASE_WIDTH;
      } catch {
        return width >= MOBILE_BASE_WIDTH;
      }
    })();

    // Desktop: >=1024 OR >=960 (1.5x mobile) OR tablet landscape (640+ landscape tablet)
    if (width >= DESKTOP_BREAKPOINT) return "desktop";
    if (width >= DESKTOP_ON_TABLET_THRESHOLD) return "desktop";
    if (landscape && tabletDevice && width >= TABLET_LANDSCAPE_MIN_WIDTH) return "desktop";

    if (width < MOBILE_BREAKPOINT) return "mobile";
    if (width < TABLET_BREAKPOINT) return "tablet";
    return "desktop";
  };

  const [category, setCategory] = useState<"mobile" | "tablet" | "desktop">(getCategory);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => {
      setCategory(getCategory());
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // Listen for visualViewport changes (soft keyboard / browser zoom) too.
    window.visualViewport?.addEventListener?.("resize", update);
    // Listen for screen orientation change
    try {
      window.screen?.orientation?.addEventListener?.("change", update);
    } catch {}
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener?.("resize", update);
      try {
        window.screen?.orientation?.removeEventListener?.("change", update);
      } catch {}
    };
  }, []);
  return category;
};

/**
 * Hook to specifically detect tablet landscape for UI adjustments.
 */
export const useTabletLandscape = (): boolean => {
  const [isLandscapeTablet, setIsLandscapeTablet] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const landscape = width > height;
    const tabletDevice = (() => {
      try {
        const w = window.screen?.width ?? 0;
        const h = window.screen?.height ?? 0;
        return Math.min(w, h) >= 600;
      } catch {
        return width >= MOBILE_BASE_WIDTH;
      }
    })();
    return landscape && tabletDevice && width >= TABLET_LANDSCAPE_MIN_WIDTH && width < TABLET_BREAKPOINT + 400;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const landscape = width > height;
      const tabletDevice = (() => {
        try {
          const w = window.screen?.width ?? 0;
          const h = window.screen?.height ?? 0;
          return Math.min(w, h) >= 600;
        } catch {
          return width >= MOBILE_BASE_WIDTH;
        }
      })();
      setIsLandscapeTablet(landscape && tabletDevice && width >= TABLET_LANDSCAPE_MIN_WIDTH && width < TABLET_BREAKPOINT + 400);
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener?.("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener?.("resize", update);
    };
  }, []);
  return isLandscapeTablet;
};

/**
 * Tailwind-style responsive max-width for the app shell.
 *  - mobile  : 100vw (edge-to-edge inside the device)
 *  - tablet  : 720px  (iPad portrait/landscape — 768+ viewports leave a
 *                    comfortable 24px gutter on either side)
 *  - desktop : 1280px (a real laptop / monitor: a comfortable reading
 *                    column with a permanent side rail on the left; the
 *                    content never stretches beyond a 1280px max so a
 *                    27\" monitor doesn't turn the app into a thin
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
/** Query for tablet landscape showing desktop */
export const TABLET_LANDSCAPE_DESKTOP_QUERY = `(min-width: ${TABLET_LANDSCAPE_MIN_WIDTH}px) and (orientation: landscape)`;
/** Query for wide tablet (1.5x mobile) showing desktop with side panel */
export const WIDE_TABLET_DESKTOP_QUERY = `(min-width: ${DESKTOP_ON_TABLET_THRESHOLD}px)`;
