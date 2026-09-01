export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Nearest scrollable ancestor of `el`. Returns `null` when the page
 * itself (window) is the scroller — the standalone mobile/tablet
 * FlowPath page scrolls the document, while inside the desktop shell
 * the page column scrolls `[data-desktop-content]` instead.
 */
export function getScrollParent(el: Element | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Smoothly animates the scroller (window by default, or the given
 * scrollable ancestor) to targetY over duration ms. shouldCancel is
 * polled every frame — return true to abort early (e.g. because the
 * user started scrolling manually).
 */
export function animateScrollTo(
  targetY: number,
  duration: number,
  shouldCancel: () => boolean,
  scroller?: HTMLElement | null,
) {
  const startY = scroller ? scroller.scrollTop : window.scrollY;
  const delta = targetY - startY;
  const startTime = performance.now();

  function step(now: number) {
    if (shouldCancel()) return;
    const elapsed = now - startTime;
    const t = Math.min(1, duration <= 0 ? 1 : elapsed / duration);
    const y = startY + delta * easeInOutCubic(t);
    if (scroller) scroller.scrollTo(0, y);
    else window.scrollTo(0, y);
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}
