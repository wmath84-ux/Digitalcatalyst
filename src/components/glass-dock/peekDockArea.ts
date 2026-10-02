// src/components/glass-dock/peekDockArea.ts
//
// THE PEEK DOCK'S ONE REVEAL/HIDE RULE.
//
// Owner brief (2026-10-02): "Footer navigation tabhi hide ho jab user actual
// interaction area se bahar chala jaaye" — the line and the dock it reveals are
// ONE interaction area, and a pointer travelling from the line to the buttons
// must never count as leaving it.
//
// Why this is GEOMETRY and not just `pointerenter` / `pointerleave`:
//
//   · the line and the panel are two separate elements, so the browser (and so
//     React) reports a leave on the line and an enter on the panel for a single
//     gesture. Any hiccup in that hand-off — an event the browser coalesces
//     while the panel animates open, a sub-pixel seam between the two boxes on
//     a fractional device-pixel ratio, a touch/pen drag (no hover events at all
//     while the contact is down), or a pointer capture that suppresses
//     enter/leave on every other element — used to schedule a close that
//     nothing cancelled, and the dock vanished under the pointer;
//   · the area is therefore the UNION of the boxes the dock answers to (the
//     line, the panel) with a small slack, and the close is only committed
//     when the pointer's last known position is really outside it.
//
// Both peek docks (the desktop shell's and the course player's) call these
// helpers, so there is exactly one answer to "is the pointer still in the
// dock?" anywhere in the app.

/**
 * Pixels of slack around each box. It covers the seam between the line and the
 * panel when either one is mid-transition, and rounds away the fractional-pixel
 * gaps a non-integer device-pixel ratio can open between two adjacent boxes.
 * Big enough to bridge a hairline, far too small to swallow the page behind.
 */
export const PEEK_DOCK_AREA_SLACK = 10;

export type PeekDockAreaBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** The box a dock element occupies, or `null` when it has no box at all. */
export function peekDockAreaOf(element: Element | null | undefined): PeekDockAreaBox | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) return null;
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

/**
 * Is the point inside the dock's interaction area?
 *
 * Pure, so it is unit-testable without a browser: callers pass the boxes they
 * measured (see `peekDockAreaOf`) and the point they last saw.
 */
export function isInsidePeekDockArea(
  x: number,
  y: number,
  boxes: Array<PeekDockAreaBox | null | undefined>,
  slack: number = PEEK_DOCK_AREA_SLACK,
): boolean {
  for (const box of boxes) {
    if (!box) continue;
    if (x >= box.left - slack && x <= box.right + slack && y >= box.top - slack && y <= box.bottom + slack) {
      return true;
    }
  }
  return false;
}
