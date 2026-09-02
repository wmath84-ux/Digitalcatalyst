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

export function initFooterNavSpace(): () => void {
  if (typeof window === "undefined" || initialized) return () => undefined;
  initialized = true;

  let last = -1;
  let raf: number | null = null;

  const publish = () => {
    raf = null;
    const next = measure();
    if (next === last) return;
    last = next;
    document.documentElement.style.setProperty("--dc-footer-nav-h", `${next}px`);
  };

  const schedule = () => {
    if (raf !== null) return;
    raf = window.requestAnimationFrame(publish);
  };

  schedule();

  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-site-footer-nav"] });

  const ro = new ResizeObserver(schedule);
  ro.observe(document.documentElement);

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.addEventListener("hashchange", schedule);

  return () => {
    mo.disconnect();
    ro.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.removeEventListener("hashchange", schedule);
    if (raf !== null) cancelAnimationFrame(raf);
    initialized = false;
  };
}
