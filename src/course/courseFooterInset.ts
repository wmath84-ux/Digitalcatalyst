// src/course/courseFooterInset.ts
//
// WHERE THE NOTE EDITOR'S TOOLBAR ENDS AND THE PLAYER'S FOOTER NAVIGATION
// BEGINS — the maths, with no React in it (the subscription lives in
// ./useCourseFooterInset.ts), so the rule can be tested directly and reused.
//
// Why this exists: the docked toolbar is laid out in normal flow at the bottom
// of the note page, which is exactly right while a soft keyboard is down there.
// It is NOT right on a desktop, or on a big tablet running the player in
// desktop view, or in a floating window — none of those ever opens a keyboard,
// so the toolbar has to know where the player's FOOTER NAVIGATION is and stop
// just above it instead of sliding underneath it.
//
// The footer navigation has two homes, and neither gives a constant:
//
//   · the bottom-centre PEEK dock (`[data-course-peek-dock]`) is
//     `position: fixed` at the bottom of the player, so it OVERLAYS the
//     writing surface. The toolbar must clear all of it: the 8px line, the
//     taller invisible hit strip above the line, and the dock panel itself
//     when the footer is open (that panel takes pointer events, so a toolbar
//     under it would be unreachable, not merely covered).
//
//   · the legacy ALWAYS-VISIBLE dock (`[data-course-dock]`) is the last child
//     of the study pane, i.e. in flow BELOW the notes panel — the toolbar
//     already ends exactly where it begins, so it needs no lift at all.
//
// And the footer is not always there: the player's ONE keyboard rule hides it
// completely while the soft keyboard is open (src/course/useCourseKeyboard.tsx),
// and notes can render outside the player shell without a footer. So the lift
// is measured, never assumed: how many px of the writing surface's bottom edge
// the footer covers.
//
//   footer overlays the bottom  →  lift by exactly the covered px
//   footer sits below (in flow) →  0
//   footer hidden or absent     →  0   (never a gap above nothing)

/** Both homes of the player's footer navigation, in one selector. */
export const COURSE_FOOTER_SELECTOR = "[data-course-peek-dock], [data-course-dock]";

/** The custom property the measured lift is published on (CSS keys off it). */
export const COURSE_FOOTER_INSET_PROPERTY = "--dc-note-footer-inset";

/** The attribute the same number is stamped on, for tests and for debugging. */
export const COURSE_FOOTER_INSET_ATTRIBUTE = "data-note-footer-inset";

/**
 * Sub-pixel seams are not a footer. The in-flow dock starts exactly where the
 * writing surface ends, and on a fractional device-pixel ratio that seam can
 * measure as a fraction of a px — lifting the toolbar by it would be a
 * hairline of nothing above the footer.
 */
export const COURSE_FOOTER_MIN_INSET = 1;

export interface FooterInsetRect {
  top: number;
  bottom: number;
  height: number;
}

const isRect = (value: unknown): value is FooterInsetRect =>
  typeof value === "object" && value !== null && ["top", "bottom", "height"].every((key) => Number.isFinite((value as Record<string, unknown>)[key] as number));

/** `getBoundingClientRect()` narrowed to the three numbers this rule reads. */
const rectOf = (element: Element): FooterInsetRect | null => {
  const rect = element.getBoundingClientRect();
  return isRect(rect) ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null;
};

/**
 * How many px of `surface`'s bottom edge `footer` covers — the lift the
 * toolbar needs to end exactly where the footer begins.
 *
 * A footer with no height is a footer that is not on screen: `display: none`
 * (the keyboard rule), `visibility` collapse, or a mid-unmount node. It
 * reports a zeroed rect, which would otherwise read as "covering everything
 * above y = 0" — so it is 0, and the toolbar drops back to the bottom edge.
 * That is the case the owner asked to be cared for: with the footer
 * navigation off, the toolbar sits at the very bottom, with no phantom gap.
 */
export const measureFooterInset = (
  surface: FooterInsetRect | null,
  footer: FooterInsetRect | null,
): number => {
  if (!surface || !footer) return 0;
  if (footer.height <= 0) return 0;
  // How much of the surface's bottom the footer reaches up over. A footer
  // that lives BELOW the surface (the in-flow dock) reaches up to 0.
  const covered = Math.min(surface.bottom, footer.bottom) - footer.top;
  if (covered < COURSE_FOOTER_MIN_INSET) return 0;
  // Never lift more than the surface is tall — a full-height footer must not
  // invert the page and leave the writing area with no room.
  return Math.min(Math.round(covered), Math.max(0, Math.round(surface.height)));
};

/**
 * The lift for ONE writing surface, measured against whichever footer
 * navigation is actually on screen right now.
 *
 * Every footer in the document is considered and the largest answer wins, so
 * the rule needs no help from the player's settings: whichever home the footer
 * lives in (and whichever the learner has switched to) is the one measured,
 * and a hidden one simply answers 0.
 */
export const readCourseFooterInset = (surface: Element | null): number => {
  if (!surface) return 0;
  const surfaceRect = rectOf(surface);
  if (!surfaceRect) return 0;
  let inset = 0;
  const footers = document.querySelectorAll(COURSE_FOOTER_SELECTOR);
  for (let index = 0; index < footers.length; index += 1) {
    inset = Math.max(inset, measureFooterInset(surfaceRect, rectOf(footers[index])));
  }
  return inset;
};
