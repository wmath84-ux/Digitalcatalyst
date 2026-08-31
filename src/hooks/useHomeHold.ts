import { useCallback, useRef, useState } from "react";

/** Default long-press duration for the Home button (ms). */
export const DEFAULT_HOME_HOLD_DURATION = 1000;

/**
 * Manages a long-press on a footer Home button.
 *
 * On completion it fires `onHold` (used to open the FlowPath / task-planning
 * dashboard) and marks the press as consumed, so the click the browser would
 * otherwise fire on pointer-release is swallowed — a long-press never also
 * triggers the normal "go to Home" navigation.
 *
 * The returned `handlers` are meant to be spread onto the Home <button>.
 * `consumeSuppressedClick()` should be called at the top of the button's
 * `onClick`; return early when it returns true.
 *
 * The `durationMs` parameter lets callers shorten the gesture (e.g. the main
 * app footer is 1 second per the latest product spec) without duplicating
 * the entire hold state machine.
 */
export function useHomeHold(onHold: () => void, durationMs: number = DEFAULT_HOME_HOLD_DURATION) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);
  const suppressRef = useRef(false);

  const start = useCallback(() => {
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      suppressRef.current = true;
      setHolding(false);
      onHold();
    }, durationMs);
  }, [durationMs, onHold]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }, []);

  /** Returns true exactly once for the release that follows a completed hold. */
  const consumeSuppressedClick = useCallback(() => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return true;
    }
    return false;
  }, []);

  // NOTE: we deliberately do NOT `preventDefault()` on pointerdown. Doing so
  // suppresses the synthetic `click` on touch devices, which would break a
  // normal tap on the Home button. Instead the long-press is short-circuited
  // entirely by `consumeSuppressedClick()` swallowing the click that follows a
  // completed hold. To keep the hold from selecting text or opening a context
  // menu we rely on `select-none` / `[touch-action:none]` and the
  // `onContextMenu` guard below.
  const handlers = {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { holding, handlers, consumeSuppressedClick, durationMs };
}
