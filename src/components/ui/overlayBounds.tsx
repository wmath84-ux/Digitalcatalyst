import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

/**
 * Overlay bounds — keeps My Day's create/edit overlays (Modal, ConfirmDialog)
 * inside the working column that sits NEXT TO the side navigation on tablet
 * and desktop screens, instead of covering the whole browser window.
 *
 * The value is a ref pointing at the element whose on-screen rectangle the
 * overlay must fit into (My Day passes a ref to its <main> column). The
 * default `null` keeps the classic full-window behaviour, so any future page
 * that reuses these components without a provider is completely unaffected.
 */
export type OverlayBoundsRef = React.RefObject<HTMLElement | null>;

export interface OverlayBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const OverlayBoundsContext = createContext<OverlayBoundsRef | null>(null);

export const OverlayBoundsProvider = OverlayBoundsContext.Provider;

export function useOverlayBounds(): OverlayBoundsRef | null {
  return useContext(OverlayBoundsContext);
}

/**
 * Match the Tailwind `md:` breakpoint: tablets and up show the sticky side
 * navigation, so that is also where overlays become scoped to the content
 * column. Below it (phones) overlays stay full-window bottom sheets.
 */
const OVERLAY_SCOPED_MIN_WIDTH = 768;

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia(`(min-width: ${OVERLAY_SCOPED_MIN_WIDTH}px)`);
}

/**
 * Measures the viewport rectangle of the bounds element while `open` and
 * intersects it with the visual viewport, so the overlay also respects
 * browser chrome / on-screen keyboards and orientation changes.
 *
 * Returns `box: null` whenever scoping does not apply (phone widths, missing
 * ref, degenerate rect) so callers can fall back to full-window positioning.
 */
export function useOverlayBox(
  open: boolean,
  boundsRef: OverlayBoundsRef | null,
): { scoped: boolean; box: OverlayBox | null } {
  const [wide, setWide] = useState(() => mediaQuery()?.matches ?? false);
  const [box, setBox] = useState<OverlayBox | null>(null);

  useEffect(() => {
    const mql = mediaQuery();
    if (!mql) return;
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches);
    setWide(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (!open || !wide) {
      setBox(null);
      return;
    }

    const measure = () => {
      const area = boundsRef?.current?.getBoundingClientRect();
      if (!area || area.width <= 0 || area.height <= 0) {
        setBox(null);
        return;
      }
      // Clip the column rectangle to the visually visible viewport so a
      // keyboard or collapsed browser chrome never hides the dialog.
      let top = area.top;
      let bottom = area.bottom;
      const vv = window.visualViewport;
      if (vv) {
        top = Math.max(top, vv.offsetTop);
        bottom = Math.min(bottom, vv.offsetTop + vv.height);
      }
      // Degenerate slice (column almost entirely off-screen): fall back to
      // full-window positioning rather than crushing the dialog to nothing.
      if (bottom - top < 200) {
        setBox(null);
        return;
      }
      setBox({ top, left: area.left, width: area.width, height: bottom - top });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [boundsRef, open, wide]);

  return { scoped: Boolean(open && wide && box), box };
}

/*
 * Body scroll locking with reference counting. Several overlays can stack
 * (e.g. Modal + ConfirmDialog); the lock must only be released when the last
 * one closes, otherwise the page behind a still-open overlay starts scrolling.
 */
let bodyScrollLocks = 0;

export function lockBodyScroll(): void {
  bodyScrollLocks += 1;
  document.body.style.overflow = "hidden";
}

export function unlockBodyScroll(): void {
  bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
  if (bodyScrollLocks === 0) document.body.style.overflow = "";
}
