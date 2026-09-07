// src/classroom3d/useSurfaceScroll.ts
//
// React bindings for the room's pointer scrolling (see surfaceScroll.ts for
// why the room cannot rely on native scrolling at all).
//
//   useDragScroll()  → a ref you put on any panel root; everything scrollable
//                      inside it becomes finger/mouse draggable.
//   useHoldScroll()  → props for a scroll KEY: press and hold to travel.

import { useCallback, useEffect, useRef } from "react";
import { attachDragScroll, findScrollableWithin, startHoldScroll } from "./surfaceScroll";

/**
 * Drag-to-scroll for a whole panel. Put the returned ref on the panel root:
 *
 *     const panel = useDragScroll<HTMLDivElement>();
 *     <div ref={panel}>…</div>
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return attachDragScroll(node);
  }, []);
  return ref;
}

/**
 * Press-and-hold progressive scrolling for the board's scroll keys.
 *
 * `getTarget` resolves the element to scroll at press time (the board's
 * content is swapped on every lesson, so it can't be captured once).
 *
 *     const hold = useHoldScroll(() => bodyRef.current);
 *     <button {...hold(-1)} />   // scroll up while held
 */
export function useHoldScroll(getScope: () => HTMLElement | null) {
  const stop = useRef<null | (() => void)>(null);

  const cancel = useCallback(() => {
    stop.current?.();
    stop.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return useCallback(
    (direction: 1 | -1) => ({
      // Pointer events only — deliberately no click handler. A click is one
      // fixed jump, and the whole point of these keys is that HOLDING them
      // keeps the board moving until the finger comes off.
      onPointerDown: (event: { currentTarget: HTMLElement; pointerId: number }) => {
        cancel();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        stop.current = startHoldScroll(() => findScrollableWithin(getScope()), direction);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      // Keyboard parity: Space/Enter on a focused key still nudges.
      onKeyDown: (event: { key: string; repeat: boolean }) => {
        if (event.key !== " " && event.key !== "Enter") return;
        if (event.repeat) return;
        cancel();
        stop.current = startHoldScroll(() => findScrollableWithin(getScope()), direction);
      },
      onKeyUp: cancel,
      onBlur: cancel,
    }),
    [cancel, getScope],
  );
}
