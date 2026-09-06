import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/**
 * Mouse drag-to-scroll for the app's horizontal rails.
 *
 * The rails (Home's category strip and reviews carousel, the Store's filter
 * chips, the search page's chips) are `overflow-x-auto` scrollers with the
 * scrollbar hidden. That is perfect for a thumb and useless for a mouse: there
 * is nothing to grab, no scrollbar to drag, and a vertical wheel cannot move a
 * horizontal scroller — a desktop pointer could only reach the end of a rail
 * with Shift+wheel, which nobody discovers.
 *
 * Owner (post Wave 14): "pointer interaction is not working when we use our
 * mouse then it is not interacting as thumb left right scroll interaction."
 * So the rails now take a pointer the way they take a thumb: press, drag
 * left/right, release with a fling.
 *
 * Deliberate behaviour:
 * - **Mouse and pen only.** Touch keeps the browser's own scrolling, momentum
 *   and snap — re-implementing that would feel worse and would double-handle
 *   every gesture.
 * - **Only when there is something to scroll.** A rail that fits its content
 *   stays inert, so nothing changes at widths where a row wraps.
 * - **A drag is not a tap.** Once the pointer has travelled past `threshold`
 *   the click that ends the gesture is swallowed in the capture phase, so
 *   dragging the reviews rail never opens a product and dragging the chip row
 *   never fires a filter.
 * - **A fling is motion**, so `prefers-reduced-motion` stops the rail dead
 *   instead of letting it glide.
 * - Scroll-snap is suspended while dragging (the rail follows the pointer 1:1)
 *   and re-engaged on release, so it settles onto the nearest card the way a
 *   native swipe does.
 *
 * Usage — spread it onto the scroller:
 *
 *     const rail = useDragScroll<HTMLDivElement>();
 *     <div ref={rail.ref} onPointerDown={rail.onPointerDown} className="overflow-x-auto">
 */
export type DragScroll<T extends HTMLElement = HTMLElement> = {
  ref: RefObject<T | null>;
  onPointerDown: (event: ReactPointerEvent<T>) => void;
};

type DragScrollOptions = {
  /**
   * A drag that starts inside this selector is ignored — use it for a nested
   * control that owns its own pointer gesture (a slider, an inner scroller).
   */
  skip?: string;
  /** Travel in px before a press counts as a drag and eats its click. */
  threshold?: number;
};

const FRICTION = 0.94;
const MIN_FLING_SPEED = 0.4;

/** The rail's reachable scroll range, clamped (LTR-only app: 0 … overflow). */
const clamp = (node: HTMLElement, left: number) =>
  Math.min(Math.max(left, 0), Math.max(node.scrollWidth - node.clientWidth, 0));

export function useDragScroll<T extends HTMLElement>({
  skip,
  threshold = 6,
}: DragScrollOptions = {}): DragScroll<T> {
  const ref = useRef<T | null>(null);
  const drag = useRef<{
    startX: number;
    startLeft: number;
    lastX: number;
    lastTime: number;
    /** px per frame, exponentially averaged over the last few moves. */
    speed: number;
    moved: boolean;
  } | null>(null);
  const fling = useRef<number | null>(null);
  /** Armed by a drag; the rail's next click is swallowed once. */
  const suppressClick = useRef(false);

  const stopFling = useCallback(() => {
    if (fling.current !== null) {
      cancelAnimationFrame(fling.current);
      fling.current = null;
    }
  }, []);

  const onMove = useCallback(
    (event: PointerEvent) => {
      const node = ref.current;
      const state = drag.current;
      if (!node || !state) return;
      const delta = event.clientX - state.startX;
      if (!state.moved && Math.abs(delta) < threshold) return;
      state.moved = true;
      const dt = event.timeStamp - state.lastTime;
      if (dt > 0) {
        const instant = ((event.clientX - state.lastX) / dt) * 16;
        state.speed = state.speed * 0.7 + instant * 0.3;
      }
      state.lastX = event.clientX;
      state.lastTime = event.timeStamp;
      stopFling();
      // Clamped explicitly: the app is LTR-only (no `dir="rtl"` anywhere), so the
      // reachable range is [0, scrollWidth - clientWidth]. Browsers clamp this
      // themselves, but doing it here keeps the rail's edge behaviour identical
      // everywhere — and observable without a layout engine.
      node.scrollLeft = clamp(node, state.startLeft - delta);
    },
    [stopFling, threshold],
  );

  const endDrag = useCallback(() => {
    const node = ref.current;
    const state = drag.current;
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    if (!node || !state) return;
    node.removeAttribute("data-drag-scrolling");
    // A drag must not also be a tap: swallow the click this gesture ends with.
    // Disarmed on the next pointerdown, so a release outside the rail (where no
    // click follows) can never eat a later one.
    suppressClick.current = state.moved;
    if (!state.moved) return;

    // Let the rail glide the way a thumb-flick does. CSS scroll-snap takes over
    // again the moment the attribute above is removed, so the rail settles onto
    // the nearest card on its own.
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let speed = reduced ? 0 : state.speed;
    if (Math.abs(speed) < MIN_FLING_SPEED) return;
    stopFling();
    const step = () => {
      const el = ref.current;
      if (!el || Math.abs(speed) < MIN_FLING_SPEED) {
        fling.current = null;
        return;
      }
      const next = clamp(el, el.scrollLeft - speed);
      el.scrollLeft = next;
      speed *= FRICTION;
      // An edge ends the glide: CSS scroll-snap takes over from here.
      if (next <= 0 || next >= el.scrollWidth - el.clientWidth) {
        fling.current = null;
        return;
      }
      fling.current = requestAnimationFrame(step);
    };
    fling.current = requestAnimationFrame(step);
  }, [onMove, stopFling]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if (event.button !== 0) return;
      const node = ref.current;
      if (!node) return;
      // Nothing to drag → stay completely out of the way.
      if (node.scrollWidth <= node.clientWidth + 1) return;
      if (skip && event.target instanceof Element && event.target.closest(skip)) return;
      suppressClick.current = false;
      stopFling();
      drag.current = {
        startX: event.clientX,
        startLeft: node.scrollLeft,
        lastX: event.clientX,
        lastTime: event.timeStamp,
        speed: 0,
        moved: false,
      };
      // Paints the grabbing cursor and suspends text selection + scroll-snap
      // (see `[data-drag-scrolling]` in src/index.css).
      node.setAttribute("data-drag-scrolling", "true");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
    },
    [endDrag, onMove, skip, stopFling],
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // Artwork and links inside a rail must not start a native HTML5 drag.
    const onNativeDragStart = (event: DragEvent) => {
      if (drag.current) event.preventDefault();
    };
    node.addEventListener("click", onClickCapture, true);
    node.addEventListener("dragstart", onNativeDragStart);
    return () => {
      node.removeEventListener("click", onClickCapture, true);
      node.removeEventListener("dragstart", onNativeDragStart);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      stopFling();
    };
  }, [endDrag, onMove, stopFling]);

  return { ref, onPointerDown };
}

export default useDragScroll;
