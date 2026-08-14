// src/course/useRotatedScroll.ts
//
// Course Player — scrolling inside the rotated ("immersive") mobile view.
//
// The immersive layout quarter-turns the whole player with
// `transform: rotate(90deg)` so a portrait-locked phone can use the
// landscape UI. The browser, however, resolves touch scrolling in SCREEN
// space while the scroll container's own axes have been rotated with it.
// The result is inverted//swapped scrolling: swiping left-right moved the
// list that should have responded to the other axis.
//
// The fix is to stop the browser from guessing (`touch-action: none` on the
// rotated subtree) and drive the scroll ourselves, mapping the finger's
// screen delta back into the element's rotated coordinate space.
//
// For CSS `rotate(90deg)` (clockwise on screen):
//
//   element (1,0) → screen (0, 1)
//   element (0,1) → screen (-1, 0)
//
// so a screen delta (dsx, dsy) is, in element space, (dsy, -dsx).
// Content must follow the finger, and scrolling moves opposite to content:
//
//   scrollTop  += dsx
//   scrollLeft -= dsy
//
// A horizontal swipe therefore scrolls the rotated content along the axis
// the user actually sees as vertical, which is the natural gesture.

import { useEffect, type RefObject } from "react";

const canScrollVertically = (element: HTMLElement) => element.scrollHeight - element.clientHeight > 1;
const canScrollHorizontally = (element: HTMLElement) => element.scrollWidth - element.clientWidth > 1;

/** Nearest ancestor (inclusive) that can actually scroll on either axis. */
const scrollableAncestor = (start: Element | null, root: HTMLElement): HTMLElement | null => {
  let node: Element | null = start;
  while (node && node !== root.parentElement) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;
      const scrollsY = (overflowY === "auto" || overflowY === "scroll") && canScrollVertically(node);
      const scrollsX = (overflowX === "auto" || overflowX === "scroll") && canScrollHorizontally(node);
      if (scrollsY || scrollsX) return node;
    }
    node = node.parentElement;
  }
  return null;
};

/**
 * Drive scrolling manually while `enabled`, translating screen-space touch
 * deltas into the rotated element space so every scrollable region in the
 * immersive view scrolls along the axis the user actually sees.
 */
export function useRotatedScroll(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return undefined;

    let target: HTMLElement | null = null;
    let lastX = 0;
    let lastY = 0;
    let pointerId: number | null = null;
    // Text selection / buttons must still work, so we only claim the gesture
    // once the finger has clearly travelled.
    let claimed = false;
    const SLOP = 4;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      target = scrollableAncestor(event.target as Element, root);
      if (!target) return;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      claimed = false;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId || !target) return;
      const dsx = event.clientX - lastX;
      const dsy = event.clientY - lastY;
      if (!claimed) {
        if (Math.hypot(dsx, dsy) < SLOP) return;
        claimed = true;
      }
      lastX = event.clientX;
      lastY = event.clientY;
      // Screen → rotated element space (see the header comment).
      if (canScrollVertically(target)) target.scrollTop += dsx;
      if (canScrollHorizontally(target)) target.scrollLeft -= dsy;
      if (event.cancelable) event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      target = null;
      claimed = false;
    };

    root.addEventListener("pointerdown", onPointerDown, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: false });
    root.addEventListener("pointerup", onPointerUp, { passive: true });
    root.addEventListener("pointercancel", onPointerUp, { passive: true });
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, rootRef]);
}
