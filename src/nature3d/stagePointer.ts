/** Undo the Sanctuary stage's CSS landscape rotation/scaling for a drag. */
export function stageLocalDelta<T extends { x: number; y: number }>(element: HTMLElement, dx: number, dy: number, out: T): T {
  out.x = dx; out.y = dy;
  const stage = element.closest("[data-sanctuary-root]");
  if (!stage || typeof DOMMatrixReadOnly === "undefined") return out;
  const transform = getComputedStyle(stage).transform;
  if (transform === "none") return out;
  const m = new DOMMatrixReadOnly(transform);
  const d = m.a * m.d - m.b * m.c;
  if (Math.abs(d) > 1e-5) {
    out.x = (m.d * dx - m.c * dy) / d;
    out.y = (-m.b * dx + m.a * dy) / d;
  }
  return out;
}
