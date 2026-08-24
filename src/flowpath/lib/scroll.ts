export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smoothly animates window scroll to targetY over duration ms.
 * shouldCancel is polled every frame — return true to abort early
 * (e.g. because the user started scrolling manually).
 */
export function animateScrollTo(targetY: number, duration: number, shouldCancel: () => boolean) {
  const startY = window.scrollY;
  const delta = targetY - startY;
  const startTime = performance.now();

  function step(now: number) {
    if (shouldCancel()) return;
    const elapsed = now - startTime;
    const t = Math.min(1, duration <= 0 ? 1 : elapsed / duration);
    window.scrollTo(0, startY + delta * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}
