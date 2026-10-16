// src/utils/footerNavigationPlacement.ts
//
// WHERE THE FOOTER NAVIGATION SITS — the owner's placement picker
// (2026-10-16):
//
//   "Ek button add kar do — tablet ya desktop size detect ho to hi wo button
//    dikhe — jo footer navigation ko kahin bhi place kar sake: left, right,
//    bottom, header. Click karne par 4 options ka dropdown khule. Dropdown
//    us taraf khule jahan jagah bachi hai — agar navigation top mein hai to
//    neeche khule, bottom mein hai to upar, left mein to right, right mein to
//    left. Kabhi screen ke bahar na jaye."
//
// So this module owns two things and nothing else:
//
//   1. the stored PLACEMENT (left · right · bottom · header), shared by the
//      header button and the player that actually renders the navigation, and
//   2. the direction the dropdown must open for a given placement — read by
//      the button and pinned by the tests, so "kabhi screen ke bahar nahin"
//      is a rule and not a hope.
//
// The default is `header`: on a tablet/desktop the navigation is part of the
// header from the start, exactly as the brief asks. Mobile never reads this
// file beyond the default value — below 768px the footer stays where it has
// always been.

import { useEffect, useState, useSyncExternalStore } from "react";

export type FooterNavigationPlacement = "left" | "right" | "bottom" | "header";

export const FOOTER_NAVIGATION_PLACEMENTS: FooterNavigationPlacement[] = ["header", "left", "right", "bottom"];

export const FOOTER_NAVIGATION_PLACEMENT_LABEL: Record<FooterNavigationPlacement, string> = {
  header: "Header",
  left: "Left",
  right: "Right",
  bottom: "Bottom",
};

/** The one line under each option in the dropdown. */
export const FOOTER_NAVIGATION_PLACEMENT_HINT: Record<FooterNavigationPlacement, string> = {
  header: "In the top bar, beside the progress bar and Settings",
  left: "A rail down the left edge of the course area",
  right: "A rail down the right edge of the course area",
  bottom: "The familiar strip across the bottom",
};

/** The arrow side of the dropdown for each placement (never off-screen). */
export type FooterNavigationMenuSide = "down" | "up" | "right" | "left";

export function footerNavigationMenuSide(placement: FooterNavigationPlacement): FooterNavigationMenuSide {
  // Top → down, bottom → up, left → right, right → left.
  if (placement === "header") return "down";
  if (placement === "bottom") return "up";
  if (placement === "left") return "right";
  return "left";
}

/* ── The size rule: the owner's own "-6px" ────────────────────────────────
 *
 *   "Footer navigation ka size 6 px chhota kar do."
 *
 * In the course player the footer navigation is the Workspace pill, and the
 * strip's own numbers are real: `--work-nav-h: 44px` with 44px cells and 9px
 * vertical padding around a 26px icon (src/course/course-strip-nav.css). Six
 * pixels come off the box the navigation occupies — 44 → 38 — and the padding
 * follows (9 → 6) so the icon keeps its size. The rules themselves live in
 * src/course/course-quad-deck.css under `[data-quad-nav-shrunk]`, which the
 * player sets only from 768px up: a phone keeps today's footer untouched.
 */
export const FOOTER_NAVIGATION_SIZE_STEP_PX = 6;
/** The course strip's plate/cell height before the shrink. */
export const FOOTER_NAVIGATION_BASE_HEIGHT_PX = 44;

/** The plate/cell height after the shrink (38px from the strip's 44px). */
export const FOOTER_NAVIGATION_HEIGHT_PX = FOOTER_NAVIGATION_BASE_HEIGHT_PX - FOOTER_NAVIGATION_SIZE_STEP_PX;

/** The header variant's own plate height — the same shrunken rhythm. */
export const FOOTER_NAVIGATION_HEADER_HEIGHT_PX = FOOTER_NAVIGATION_HEIGHT_PX;

/** The variables the deck/header set so every nav instance is the same size. */
export function footerNavigationSizeVars(): Record<string, string> {
  return {
    "--work-nav-h": `${FOOTER_NAVIGATION_HEIGHT_PX}px`,
    "--work-nav-cell": `${FOOTER_NAVIGATION_HEIGHT_PX + 2}px`,
    "--dc-header-nav-h": `${FOOTER_NAVIGATION_HEADER_HEIGHT_PX}px`,
  };
}

const STORAGE_KEY = "dc-footer-navigation-placement";
const CHANGE_EVENT = "dc:footer-navigation-placement-change";
const DEFAULT_PLACEMENT: FooterNavigationPlacement = "header";

function normalizePlacement(value: string | null | undefined): FooterNavigationPlacement {
  if (value === "left" || value === "right" || value === "bottom" || value === "header") return value;
  return DEFAULT_PLACEMENT;
}

export function getFooterNavigationPlacement(): FooterNavigationPlacement {
  if (typeof window === "undefined") return DEFAULT_PLACEMENT;
  try {
    return normalizePlacement(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PLACEMENT;
  }
}

export function setFooterNavigationPlacement(placement: FooterNavigationPlacement): void {
  if (typeof window === "undefined") return;
  const next = normalizePlacement(placement);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage denied: the event below still moves every mounted navigation.
  }
  window.dispatchEvent(new window.Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFooterNavigationPlacement(): FooterNavigationPlacement {
  return useSyncExternalStore(subscribe, getFooterNavigationPlacement, () => DEFAULT_PLACEMENT);
}

/* ── The device gate ──────────────────────────────────────────────────────
 *
 *   "New header button — renders only when tablet/desktop size is detected."
 *
 * One media query, the owner's own 768px line, and both the button and the
 * placement system read it. `matchMedia` missing (jsdom, old browsers) leaves
 * the gate CLOSED, so nothing new ever shows up on a device that cannot
 * answer the question.
 */
export const FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY = "(min-width: 768px)";

export function isFooterNavigationPlacementEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY).matches === true;
  } catch {
    return false;
  }
}

/**
 * The live gate: true from 768px up, and it follows a window resize or a
 * tablet rotation without a reload. Kept beside the pure check so the button,
 * the header navigation and the plus deck can never disagree about what
 * "tablet/desktop" means.
 */
export function useFooterNavigationPlacementEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => isFooterNavigationPlacementEnabled());
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(FOOTER_NAVIGATION_PLACEMENT_MEDIA_QUERY);
    const read = () => setEnabled(query.matches === true);
    read();
    query.addEventListener?.("change", read);
    // Older Safari only has the deprecated pair.
    query.addListener?.(read);
    return () => {
      query.removeEventListener?.("change", read);
      query.removeListener?.(read);
    };
  }, []);
  return enabled;
}
