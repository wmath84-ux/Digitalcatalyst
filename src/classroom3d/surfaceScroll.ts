// src/classroom3d/surfaceScroll.ts
//
// SCROLLING A SURFACE THAT LIVES IN 3D.
//
// The room is one big `touch-action: none` surface — it has to be, or every
// head-turn drag would also scroll/zoom the page under it. But `touch-action`
// is intersected down the ancestor chain, so that single rule ALSO kills
// native touch scrolling inside every wall panel: a finger on the lecture
// board, the notes wall, the mind wall or the desk tablet moved nothing at
// all. On top of that, the panels are 3D-transformed DOM inside drei's Html
// portal, where native touch panning is unreliable even without the rule.
//
// So the room scrolls its own panels, with pointer events, in two ways:
//
//   1. DRAG SCROLL (`attachDragScroll`) — press anywhere on a panel and drag.
//      The nearest scrollable ancestor of whatever was pressed follows the
//      finger 1:1 and keeps gliding on release (friction fling), exactly like
//      a native scroller. Mouse, pen and touch all work.
//
//   2. HOLD SCROLL (`startHoldScroll`) — press and HOLD a scroll key and the
//      content moves continuously on requestAnimationFrame, ramping from a
//      crawl to a fast glide, until the pointer is released or leaves. This
//      replaces "one click = one fixed jump", which is useless on a board you
//      are reading from across a room.
//
// Deliberate behaviour:
//   · Nothing starts unless there is something to scroll — a gesture on a
//     non-scrolling panel is left alone, so the mind map's own pan/pinch, the
//     zoom sliders and every button keep their gestures.
//   · Text entry is never hijacked: inputs, textareas and contenteditable
//     (the rich-text note editor) keep their caret and selection.
//   · A drag is not a tap: once the pointer travels past `THRESHOLD` px the
//     click that ends the gesture is swallowed in the capture phase, so
//     scrolling a list never opens the row that happened to be under the
//     thumb.
//   · Opt out of a subtree with `data-no-surface-scroll` (used by anything
//     that owns its own pointer gesture).
//   · `prefers-reduced-motion` stops the fling dead instead of gliding.

/** Travel in px before a press counts as a drag (and eats its click). */
const THRESHOLD = 6;
/** Fling decay per frame, and the speed below which it stops. */
const FRICTION = 0.94;
const MIN_FLING_SPEED = 0.35;
/** Hold-scroll ramp: px per frame at press → px per frame at full speed. */
const HOLD_START_SPEED = 4;
const HOLD_MAX_SPEED = 26;
const HOLD_RAMP_MS = 550;

const reducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True when this element can actually move in the given axis. */
const canScroll = (element: HTMLElement, axis: "y" | "x"): boolean => {
  const style = getComputedStyle(element);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  if (!/(auto|scroll|overlay)/.test(overflow)) return false;
  const extent =
    axis === "y"
      ? element.scrollHeight - element.clientHeight
      : element.scrollWidth - element.clientWidth;
  return extent > 1;
};

/**
 * The nearest ancestor of `node` (inclusive) that can scroll, searching no
 * further up than `root`. Vertical wins over horizontal because every panel
 * in this room is a vertical reading surface.
 */
export const findScrollable = (
  node: EventTarget | null,
  root: HTMLElement | null,
): { element: HTMLElement; axis: "y" | "x" } | null => {
  let element = node instanceof HTMLElement ? node : null;
  while (element) {
    if (canScroll(element, "y")) return { element, axis: "y" };
    if (canScroll(element, "x")) return { element, axis: "x" };
    if (element === root) return null;
    element = element.parentElement;
  }
  return null;
};

/** The first scrollable element inside `root` — what a scroll KEY drives. */
export const findScrollableWithin = (root: HTMLElement | null): HTMLElement | null => {
  if (!root) return null;
  if (canScroll(root, "y")) return root;
  const queue: HTMLElement[] = Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  while (queue.length) {
    const element = queue.shift() as HTMLElement;
    if (canScroll(element, "y")) return element;
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) queue.push(child);
    }
  }
  return null;
};

/** A gesture that must be left to the element that owns it. */
const ownsItsGesture = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-no-surface-scroll]")) return true;
  if (target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) return true;
  // Range/scrub controls and anything that captures its own pointer stream.
  if (target.closest("[type='range']")) return true;
  return false;
};

/**
 * Give a panel finger/mouse drag scrolling. Returns the detach function.
 *
 * Attach it to the panel ROOT (not to each scroller): the scrollable element
 * is resolved per gesture from the press target, so lists nested inside the
 * panel all work without any extra wiring.
 */
export function attachDragScroll(root: HTMLElement): () => void {
  let pointerId: number | null = null;
  let axis: "y" | "x" = "y";
  let scroller: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let startScroll = 0;
  let lastPosition = 0;
  let speed = 0;
  let moved = false;
  let fling: number | null = null;
  let suppressClick = false;

  const stopFling = () => {
    if (fling !== null) cancelAnimationFrame(fling);
    fling = null;
  };

  const position = (event: PointerEvent) => (axis === "y" ? event.clientY : event.clientX);
  const scrollOf = (element: HTMLElement) => (axis === "y" ? element.scrollTop : element.scrollLeft);
  const setScroll = (element: HTMLElement, value: number) => {
    const max =
      axis === "y"
        ? element.scrollHeight - element.clientHeight
        : element.scrollWidth - element.clientWidth;
    const clamped = Math.min(Math.max(value, 0), Math.max(max, 0));
    if (axis === "y") element.scrollTop = clamped;
    else element.scrollLeft = clamped;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (pointerId !== null) return;
    if (ownsItsGesture(event.target)) return;
    const found = findScrollable(event.target, root);
    if (!found) return;
    // A new gesture disarms any suppression the previous one left behind: a
    // trailing click always fires BEFORE the next pointerdown, so a flag that
    // is still set here belongs to a drag whose click never came — and must
    // not eat this gesture's tap. (Same rule as src/hooks/useDragScroll.ts.)
    suppressClick = false;
    stopFling();
    pointerId = event.pointerId;
    scroller = found.element;
    axis = found.axis;
    startX = event.clientX;
    startY = event.clientY;
    startScroll = scrollOf(found.element);
    lastPosition = position(event);
    speed = 0;
    moved = false;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId || !scroller) return;
    const travelled = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (!moved) {
      if (travelled < THRESHOLD) return;
      moved = true;
      // Only now do we own the gesture — a tap is still a tap.
      root.setPointerCapture?.(event.pointerId);
      root.classList.add("dc-surface-dragging");
    }
    const current = position(event);
    speed = current - lastPosition;
    lastPosition = current;
    const delta = axis === "y" ? event.clientY - startY : event.clientX - startX;
    setScroll(scroller, startScroll - delta);
    // A drag inside a panel must never also turn the head or select text.
    event.preventDefault();
  };

  const glide = () => {
    if (!scroller) return;
    speed *= FRICTION;
    if (Math.abs(speed) < MIN_FLING_SPEED) {
      stopFling();
      return;
    }
    setScroll(scroller, scrollOf(scroller) - speed);
    fling = requestAnimationFrame(glide);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (moved) {
      suppressClick = true;
      root.classList.remove("dc-surface-dragging");
      root.releasePointerCapture?.(event.pointerId);
      if (!reducedMotion() && Math.abs(speed) > MIN_FLING_SPEED) fling = requestAnimationFrame(glide);
    }
    pointerId = null;
    scroller = null;
    moved = false;
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.stopPropagation();
    event.preventDefault();
  };

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerUp);
  root.addEventListener("click", onClickCapture, true);

  return () => {
    stopFling();
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", onPointerUp);
    root.removeEventListener("click", onClickCapture, true);
  };
}

/**
 * Press-and-hold progressive scrolling for a scroll KEY.
 *
 * `direction` is -1 (up) or 1 (down). The returned function stops the loop —
 * call it from pointerup / pointerleave / pointercancel. The speed ramps from
 * a crawl to a glide over `HOLD_RAMP_MS`, so a tap nudges and a hold travels.
 */
export function startHoldScroll(
  getTarget: () => HTMLElement | null,
  direction: 1 | -1,
): () => void {
  let frame: number | null = null;
  const started = performance.now();

  const step = () => {
    const target = getTarget();
    if (!target) {
      frame = null;
      return;
    }
    const ramp = Math.min(1, (performance.now() - started) / HOLD_RAMP_MS);
    // Ease-in ramp: gentle for a tap-and-hold, quick once committed.
    const speed = HOLD_START_SPEED + (HOLD_MAX_SPEED - HOLD_START_SPEED) * ramp * ramp;
    const max = target.scrollHeight - target.clientHeight;
    const next = Math.min(Math.max(target.scrollTop + speed * direction, 0), Math.max(max, 0));
    target.scrollTop = next;
    frame = requestAnimationFrame(step);
  };

  frame = requestAnimationFrame(step);
  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
}
