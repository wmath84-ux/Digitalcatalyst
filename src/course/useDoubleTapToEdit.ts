import { useEffect, useRef, type PointerEvent, type MouseEvent, type KeyboardEvent } from "react";

/** Native double-click for a mouse; bounded, movement-aware double tap for touch/pen. */
export function useDoubleTapToEdit(enabled: boolean, onEdit: () => void) {
  const down = useRef<{ id: number; x: number; y: number; at: number } | null>(null);
  const previous = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => { down.current = null; previous.current = null; }, [enabled]);
  const activate = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    previous.current = null;
    down.current = null;
    event.preventDefault();
    event.stopPropagation();
    onEdit();
  };
  const interactive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(
    'a,button,input:not([readonly]),textarea:not([readonly]),select,[role="button"]:not(.react-flow__node),[data-no-edit-gesture]',
  ));
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType === "mouse" || interactive(event.target)) return;
      if (down.current || event.isPrimary === false) { down.current = null; previous.current = null; return; }
      down.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp };
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLElement>) => {
      const start = down.current;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
        down.current = null;
        previous.current = null;
      }
    },
    onPointerCancelCapture: () => { down.current = null; previous.current = null; },
    onPointerUpCapture: (event: PointerEvent<HTMLElement>) => {
      const start = down.current;
      down.current = null;
      if (!enabled || !start || start.id !== event.pointerId || interactive(event.target)) return;
      if (event.timeStamp - start.at > 400 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
        previous.current = null;
        return;
      }
      const last = previous.current;
      if (last && event.timeStamp - last.at < 320 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 24) activate(event);
      else previous.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    },
    onDoubleClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (enabled && !interactive(event.target)) activate(event);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (enabled && event.target === event.currentTarget && ["Enter", "F2"].includes(event.key)) activate(event);
    },
  };
}
