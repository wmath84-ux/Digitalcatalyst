// src/utils/responsive.ts
//
// Tablet / desktop detection helpers used across the app shell.
//
// The platform is currently designed mobile-first (max-w-md / phone frame),
// so these helpers let a component or stylesheet ASK "am I on a tablet?"
// before applying tablet-specific spacing, multi-column grids, or the
// side-rail navigation.
//
// The breakpoints below match the marketing team's design grid:
//   mobile  : 0    – 767 px   (single column, bottom nav, phone frame)
//   tablet  : 768  – 1023 px  (two- / three-column, side rail opt-in)
//   desktop : 1024 +         (full width, persistent side rail — coming next)

/** Below 768 px — phones (and very narrow windows). */
export const MOBILE_BREAKPOINT = 768;
/** 768–1023 px — tablets (iPad, Android tablets, narrow laptop windows). */
export const TABLET_BREAKPOINT = 1024;

/** True when the viewport is a phone-sized screen (< 768 px). */
export const isMobileScreenSize = (): boolean => {
  if (typeof window === "undefined") return true;
  return window.innerWidth < MOBILE_BREAKPOINT;
};

/**
 * True when the viewport is a tablet-sized screen (768–1023 px). The PWA
 * is in this range on a portrait iPad / Android tablet and on narrow
 * laptop windows.
 *
 * 1024 px and above returns false so the upcoming desktop layout opt-out
 * stays clean — `!isMobileScreenSize() && !isTabletScreenSize()` is
 * exactly the desktop range.
 */
export const isTabletScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT;
};

/** True for any wide viewport (tablet OR desktop). Used to opt out of
 *  the phone-shaped frame, the bottom-nav-only mode, etc. */
export const isWideScreenSize = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= MOBILE_BREAKPOINT;
};

/**
 * Tailwind-style responsive max-width for the app shell.
 *  - mobile  : 100vw (edge-to-edge inside the device)
 *  - tablet  : 720px  (iPad portrait/landscape — 768+ viewports leave a
 *                    comfortable 24px gutter on either side, keeping the
 *                    content readable without going full-bleed)
 *  - desktop : 1024px (sits below the standard 1280 max-w so the content
 *                    never has to compete with a 27" monitor's full
 *                    width — desktop polish ships in a follow-up)
 *
 * The values are used both as Tailwind `max-w-[…]` (in className) and
 * in inline `style` (for the document viewport mode), so the literal
 * numbers are exported too.
 */
export const APP_FRAME_MAX_WIDTHS = {
  mobile: "100vw",
  tablet: "720px",
  desktop: "1024px",
} as const;

/** Pure-CSS breakpoint query that fires only on tablet-sized viewports. */
export const TABLET_MEDIA_QUERY = `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`;
