// src/utils/footerNavSpace.ts
//
// Publishes the REAL height of the floating footer navigation (the glass
// dock pill plus its safe-area inset) as `--dc-footer-nav-h` on <html>.
//
// Why: pages used to guess the clearance with hand-written padding hacks
// (`pb-2`, `padding-bottom: 4.5rem`, `bottom-[56px]` …). Those guesses were
// smaller than the dock — which magnifies to 1.55× and lifts 12 px — so the
// dock ended up ON TOP of page content and swallowed taps.
//
// Instead of padding hacks, every scroller now grows its own content area by
// exactly this measured amount (see the `[data-footer-nav-space]` rules in
// src/index.css). When the footer is hidden (desktop, tablet-landscape shell,
// course player) the variable is 0px and nothing is added.
//
// ── WHAT IT WATCHES, AND WHY THAT MATTERS (owner brief 2026-09-28) ─────────
// This used to observe `document.body`'s whole subtree for `class` and
// `style` mutations, on the theory that "something changed, so re-measure the
// footer". The footer dock animates by writing inline styles — so dragging a
// finger across the dock woke this module once per frame, and each wake ran
// `getComputedStyle` + `getBoundingClientRect` on every footer (a forced
// layout of the whole document, taken right after that frame's style writes)
// and then, because the capsule's height changes while the wave runs, wrote a
// NEW value of `--dc-footer-nav-h` on <html>. A custom property on the root
// invalidates style document-wide, and every page scroller consumes the value
// as its `::after` clearance — so one drag re-styled and re-laid out the
// entire page, once per frame.
//
// The bill for that is proportional to the size of the document, which is
// exactly the difference the owner reported: Home — hero carousel, product
// grid, reviews rail, matter.js sticker wall, social card — stuttered, while
// My Day (a handful of cards) and the course player (whose peek dock is not a
// `[data-site-footer-nav]` at all, so it was never measured here) did not.
//
// So now:
//   • the FOOTERS are watched (ResizeObserver), plus the viewport, plus a
//     childList-only observer that notices a footer mounting/unmounting on a
//     route change. Nobody's animation frames wake this module any more.
//   • while a dock gesture is live — `data-dc-dock-gesture` on <html>,
//     published by src/components/glass-dock/GlassDock.tsx — nothing is
//     published at all: mid-spring the capsule is taller than it will settle
//     at, so publishing then would both thrash the root and stretch every
//     scroller's clearance under the user's finger. The settled value goes
//     out on the frame the gesture ends (the attribute observer below
//     schedules it), which is the value the pages actually need.

let initialized = false;

function measure(): number {
  const navs = Array.from(
    document.querySelectorAll<HTMLElement>("[data-site-footer-nav]"),
  ).filter((nav) => {
    const style = window.getComputedStyle(nav);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return nav.getBoundingClientRect().height > 0;
  });
  if (navs.length === 0) return 0;
  // The pill can lift/magnify; use the nav wrapper (padding + pill) height,
  // which already contains the safe-area inset, and add the 12 px lift so a
  // magnified icon never crosses into content either.
  return Math.round(
    Math.max(...navs.map((nav) => nav.getBoundingClientRect().height)) + 12,
  );
}

/** True while a finger/pointer is driving the dock's magnification wave. */
function gestureActive(): boolean {
  return document.documentElement.dataset.dcDockGesture === "true";
}

export function initFooterNavSpace(): () => void {
  if (typeof window === "undefined" || initialized) return () => undefined;
  initialized = true;

  let last = -1;
  let raf: number | null = null;
  const observed = new Set<HTMLElement>();

  const ro = new ResizeObserver(schedule);
  const publish = () => {
    raf = null;
    // Mid-gesture the capsule is mid-spring: skip, and let the gesture-end
    // attribute observer schedule the settled measurement.
    if (gestureActive()) return;
    const next = measure();
    if (next === last) return;
    last = next;
    document.documentElement.style.setProperty("--dc-footer-nav-h", `${next}px`);
  };

  function schedule() {
    if (raf !== null) return;
    raf = window.requestAnimationFrame(publish);
  }

  /** Keep the ResizeObservers on the footers that exist right now. */
  const sync = () => {
    const navs = Array.from(
      document.querySelectorAll<HTMLElement>("[data-site-footer-nav]"),
    );
    for (const nav of navs) {
      if (observed.has(nav)) continue;
      observed.add(nav);
      ro.observe(nav);
    }
    for (const nav of Array.from(observed)) {
      if (navs.includes(nav)) continue;
      observed.delete(nav);
      ro.unobserve(nav);
    }
    schedule();
  };

  sync();

  // A footer appearing/disappearing (route change, desktop shell taking over)
  // is a DOM event, not a style event: childList only, and never per frame.
  const mo = new MutationObserver(sync);
  mo.observe(document.body, { childList: true, subtree: true });

  // The gesture flag flipping off is the cue to publish the settled height.
  const gestureMo = new MutationObserver(schedule);
  gestureMo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-dc-dock-gesture"],
  });

  // The viewport itself (rotate, split-screen, desktop shell resize).
  ro.observe(document.documentElement);

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.addEventListener("hashchange", sync);

  return () => {
    mo.disconnect();
    gestureMo.disconnect();
    ro.disconnect();
    observed.clear();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.removeEventListener("hashchange", sync);
    if (raf !== null) cancelAnimationFrame(raf);
    initialized = false;
  };
}
