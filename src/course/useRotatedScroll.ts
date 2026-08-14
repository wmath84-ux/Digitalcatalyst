// src/course/useRotatedScroll.ts
//
// Course Player — natural scrolling inside the CSS-rotated ("immersive")
// mobile landscape view.
//
// The complete landscape player is rendered inside a `rotate(90deg)` surface.
// Browsers normally transform a touch gesture back to the element's local
// axes. That made a vertically scrollable module/notes list respond to a
// LEFT/RIGHT screen swipe, which is the opposite of what a learner expects.
//
// We disable the browser's transformed-axis panning on that subtree and drive
// its scroll containers ourselves in SCREEN space:
//
//   swipe up/down    -> scrollTop
//   swipe left/right -> scrollLeft (only for a genuinely horizontal scroller)
//
// In other words, the visible direction of the finger — not the CSS transform
// matrix — chooses the scroll axis.

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
 * Drive scrolling manually while `enabled`. Direction locking prevents a
 * diagonal gesture from moving both axes, and the small slop keeps ordinary
 * taps on module rows and buttons intact.
 */
export function useRotatedScroll(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return undefined;

    let target: HTMLElement | null = null;
    let lastX = 0;
    let lastY = 0;
    let pointerId: number | null = null;
    let claimed = false;
    let axis: "x" | "y" | null = null;
    const SLOP = 4;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      target = scrollableAncestor(event.target as Element, root);
      if (!target) return;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      claimed = false;
      axis = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId || !target) return;
      const dsx = event.clientX - lastX;
      const dsy = event.clientY - lastY;
      if (!claimed) {
        if (Math.hypot(dsx, dsy) < SLOP) return;
        // Prefer the visible gesture direction, but fall back to the only axis
        // that the target can actually scroll.
        const wantsY = Math.abs(dsy) >= Math.abs(dsx);
        axis = wantsY && canScrollVertically(target)
          ? "y"
          : !wantsY && canScrollHorizontally(target)
            ? "x"
            : canScrollVertically(target)
              ? "y"
              : canScrollHorizontally(target)
                ? "x"
                : null;
        if (!axis) return;
        claimed = true;
      }
      lastX = event.clientX;
      lastY = event.clientY;

      // Match native touch panning: content follows the finger, therefore the
      // scroll offset moves in the opposite direction.
      if (axis === "y") target.scrollTop -= dsy;
      if (axis === "x") target.scrollLeft -= dsx;
      if (event.cancelable) event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      target = null;
      claimed = false;
      axis = null;
    };

    // Trackpads/mice should follow the same visible vertical axis too.
    const onWheel = (event: WheelEvent) => {
      const wheelTarget = scrollableAncestor(event.target as Element, root);
      if (!wheelTarget) return;
      if (canScrollVertically(wheelTarget) && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        wheelTarget.scrollTop += event.deltaY;
        if (event.cancelable) event.preventDefault();
      } else if (canScrollHorizontally(wheelTarget)) {
        wheelTarget.scrollLeft += Math.abs(event.deltaX) > 0 ? event.deltaX : event.deltaY;
        if (event.cancelable) event.preventDefault();
      }
    };

    root.addEventListener("pointerdown", onPointerDown, { passive: true });
    root.addEventListener("pointermove", onPointerMove, { passive: false });
    root.addEventListener("pointerup", onPointerUp, { passive: true });
    root.addEventListener("pointercancel", onPointerUp, { passive: true });
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      root.removeEventListener("wheel", onWheel);
    };
  }, [enabled, rootRef]);
}
