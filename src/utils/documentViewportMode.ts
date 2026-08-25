// src/utils/documentViewportMode.ts
//
// The Course Player's document button is the in-app equivalent of the
// browser's own "Desktop site" switch, applied to the app and to whatever it
// embeds.
//
// ── Why this exists ─────────────────────────────────────────────────────
// When a learner has "Desktop site" turned ON in their phone's browser, the
// browser reports a ~980px layout viewport to the page. Everything the app
// embeds inherits that: Google Docs then serves its full desktop rendering,
// which the phone squeezes into a 5-inch screen, so the text ends up far too
// small to read comfortably.
//
// Flipping this switch to "mobile" does the two things the browser setting
// would have done:
//
//   1. Rewrites the document's own viewport meta to `width=device-width`, so
//      the layout viewport goes back to real CSS pixels.
//   2. Lets the caller load the host's mobile endpoint for the embed itself
//      (see `getCourseEmbed`), which is what actually reflows the text.
//
// Flipping it back to "desktop" restores the exact meta the page shipped
// with (with the app's zoom-lock tokens re-applied), so nothing about the
// app's normal layout is permanently altered.

import { viewportContentLockedToZoom } from "./appZoom";

export type DocumentViewportMode = "desktop" | "mobile";

/** Layout width the browser's own "Desktop site" mode reports. */
export const DESKTOP_SITE_WIDTH = 1024;

const VIEWPORT_SELECTOR = 'meta[name="viewport"]';
/** The content the page shipped with, captured before the first override. */
let originalViewportContent: string | null = null;

const getViewportMeta = (): HTMLMetaElement | null => {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLMetaElement>(VIEWPORT_SELECTOR);
};

/**
 * Point the document at the requested rendering.
 *
 * `mobile` forces real device-width layout even when the browser is in
 * desktop-site mode; `desktop` puts back whatever the page originally had.
 * Safe to call repeatedly and safe to call during SSR (it no-ops).
 */
export const applyDocumentViewportMode = (mode: DocumentViewportMode): void => {
  const meta = getViewportMeta();
  if (!meta) return;
  if (originalViewportContent === null) originalViewportContent = meta.content;

  if (mode === "mobile") {
    // This switch is about WIDTH, not zoom. The app's zoom policy is applied
    // on top: user scaling stays locked at the admin-configured default.
    meta.content = viewportContentLockedToZoom("width=device-width, initial-scale=1.0, viewport-fit=cover");
    return;
  }
  meta.content = viewportContentLockedToZoom(originalViewportContent);
};

/** Drop the override entirely — used when the Course Player unmounts. */
export const resetDocumentViewportMode = (): void => {
  const meta = getViewportMeta();
  if (!meta || originalViewportContent === null) return;
  meta.content = viewportContentLockedToZoom(originalViewportContent);
};

/**
 * Best-effort read of whether the browser is currently in "Desktop site"
 * mode: it reports a layout viewport far wider than the physical screen.
 * Used only to pick a sensible DEFAULT for a first-time visitor.
 */
export const isBrowserDesktopSiteMode = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const screenWidth = window.screen?.width || 0;
    if (!screenWidth) return false;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    // A touch device laying out at well over its own screen width is a phone
    // that has been switched into desktop-site mode.
    return coarsePointer && window.innerWidth > screenWidth * 1.5;
  } catch {
    return false;
  }
};
