// src/utils/footerGlow.ts
//
// Drives the footer's "magic glow" with the page's scroll energy.
//
// The glow itself is pure CSS (the .dc-footer-glow rule in src/index.css)
// and lives OUTSIDE the footer pill only. This module just measures how
// hard the page is moving and publishes that energy as a single custom
// property, `--dc-footer-glow` (0 = at rest, 1 = full speed), on <html>.
//
// While the user is scrolling, the halo swells OUT of the footer and the
// ripple ring flows away from it; when the scroll settles, the energy
// decays exponentially and the glow is pulled back IN, so the footer
// feels like it is breathing magic in and out with every scroll.
//
// The whole effect is decorative: it writes one CSS variable, never
// touches layout, and does nothing while the page is idle.

const STEP = 0.16; // energy added per scroll event (fast scroll = many events)
const DECAY = 0.88; // per-frame decay while the page is settling
const FLOOR = 0.004; // below this the glow is considered fully "inside"

let initialized = false;

export function initFooterGlow(): () => void {
  if (typeof window === "undefined" || initialized) return () => undefined;
  initialized = true;

  let power = 0;
  let raf: number | null = null;

  const publish = () => {
    document.documentElement.style.setProperty("--dc-footer-glow", power.toFixed(3));
  };

  // Called once per frame while there is still energy left: the glow
  // eases back into the footer until it is fully at rest.
  const settle = () => {
    raf = null;
    power *= DECAY;
    if (power <= FLOOR) power = 0;
    publish();
    if (power > 0) raf = requestAnimationFrame(settle);
  };

  // Capture phase so scrolls inside nested containers (course player,
  // panels, sheets) feed the glow too — not just the window scroll.
  const onScroll = () => {
    power = Math.min(1, power + STEP);
    publish();
    if (raf === null) raf = requestAnimationFrame(settle);
  };

  window.addEventListener("scroll", onScroll, { passive: true, capture: true });

  return () => {
    window.removeEventListener("scroll", onScroll, true);
    if (raf !== null) cancelAnimationFrame(raf);
  };
}
