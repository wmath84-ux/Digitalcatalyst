import { useEffect, useLayoutEffect, useRef, useState } from "react";
import GlassDock, {
  COMPACT_ICON_SIZE,
  DENSE_ICON_SIZE,
  ICON_SIZE,
  type GlassDockFill,
  type GlassDockItem,
} from "./glass-dock/GlassDock";

/**
 * The ONE site footer navigation.
 *
 * Owner brief (2026-09-16): "Footer navigation ka jo design My Day per hai
 * exactly vahi design har jagah honi chahiye — home page aur sabhi jagah…
 * jahan-jahan footer navigation hai, jis screen per, tablet aur mobile check
 * karke fix karo, aur sabhi jagah footer navigation ka background blur aur
 * transparency exactly vahi apply karo jo product store mein hai."
 *
 * Before this component there were four near-identical copies of the same
 * `<nav>` wrapper (main / My Day / Revision / Cart) that had drifted apart:
 *
 *   • the main nav added `md:px-6` AND `data-primary-library-nav`, whose CSS
 *     turned the dock into a full-width bar with a permanent label under every
 *     tab and no magnification — a different footer from every other screen;
 *   • My Day and Revision hid the whole nav from 768 px up, so a tablet in
 *     portrait had NO footer at all on those two features while Home/Store/Cart
 *     kept theirs;
 *   • Cart matched My Day by luck, not by construction.
 *
 * Now every screen renders this wrapper, so the floating capsule (hugging its
 * icons, magnifying under the finger, label tooltip above the active tab), the
 * gutters, the safe-area padding, the z-index and the visibility bands are
 * literally the same code everywhere. The MATERIAL — the light-blue frost and
 * its transparency — is not set here at all: it comes from the single
 * `html[data-glass="on"] :where([data-glass-dock])` rule in src/glass.css
 * (`--dc-footer-nav-tint` rgba(173,216,255,0.18) + `--dc-footer-nav-blur` 16px),
 * which is the product store's footer material and therefore now every
 * footer's material.
 *
 * Visibility: rendered on phones and tablets; the hard rules in src/index.css
 * hide `[data-site-footer-nav]` from 960 px up, in tablet-landscape desktop
 * mode and inside `.dc-desktop-shell`, where the left rail is the nav.
 */

/**
 * Below this width a seven-tab dock cannot keep 44 px plates inside the
 * capsule, so GlassDock switches to its `compact` plates. Home optionally has
 * an eighth, dinosaur-backed Sanctuary destination: it switches to 38 px a
 * little earlier and to the 34 px dense plates on very narrow phones. Sizes
 * stay JS-driven, so the magnification spring is never frozen by CSS.
 */
export const COMPACT_FIT_QUERY = "(max-width: 349px)";
export const EIGHT_TAB_COMPACT_FIT_QUERY = "(max-width: 479px)";
export const EIGHT_TAB_DENSE_FIT_QUERY = "(max-width: 349px)";

/**
 * ── THE EIGHT-TAB (HOME) DOCK'S WIDTH FILL ────────────────────────────────
 *
 * Owner brief, 2026-09-28:
 *
 *   "Home screen per footer navigation ka size thoda bada karo — matlab side
 *    mein jitna area khali hai vah sab cover ho jaaye … ekadam pura hi na ho
 *    jaaye ki sat jaaye ekadam edge se, lekin aur bada ho jaaye icon vagaira
 *    jisse."
 *
 * Home is the only footer that carries an eighth destination (the Sanctuary
 * slot), and eight 44 px plates never fit a phone: the wrapper has always
 * stepped the dock down to the 38 px `compact` plates below 480 px (and to
 * 34 px below 350 px), so the Home footer was the one footer that was smaller
 * than the rest AND left 20–70 px of empty screen on either side of a capsule
 * that hugs its icons.
 *
 * So the Home dock now FILLS the width the nav leaves it — without touching
 * the edges. One size, computed per viewport, exactly as asked:
 *
 *   · the plates (and with them the glyphs, the tooltip, the magnification,
 *     the lift and the neighbour push — they all key off `plateSize`) grow
 *     first, until the capsule is as wide as the nav's content box minus
 *     `HOME_FILL_RESERVE` on each side, and never past `HOME_FILL_MAX_PLATE`;
 *   · once the plates are at the cap, the leftover goes to the GAPS, so the
 *     capsule still covers the empty space instead of floating in the middle;
 *   · the ends may breathe with the plate (the standard design's 16/44 ratio)
 *     but never by more than half a gap;
 *   · the plates never shrink below the size the old fit logic gave them, so
 *     a 320 px phone keeps exactly the dock it has today.
 *
 * The rhythm it grows from is not re-declared here: src/index.css publishes
 * the eight-tab dock's resting gap/padding as `--dc-home-dock-*` custom
 * properties (per fit band), and this module reads THEM — one source of truth
 * for both the CSS-only rendering and the measured fill.
 */
export const HOME_FILL_MIN_TABS = 8;
/** 60 px = 1.36× the standard 44 px plate: past that the dock is furniture. */
export const HOME_FILL_MAX_PLATE = 60;
/**
 * Kept clear on each side INSIDE the nav's own gutter, so the plate a finger
 * magnifies never lands on the screen edge (the wave grows the capsule by
 * roughly 0.3 × plate per side on top of its resting box).
 */
export const HOME_FILL_RESERVE = 4;
/** The standard design's ratios: ends 16/44, top+bottom 12/44. */
const HOME_FILL_PAD_RATIO = 0.36;
const HOME_FILL_BLOCK_RATIO = 0.27;

/** The plate each fit band rests at in GlassDock (single source: its exports). */
const FIT_PLATE: Record<FooterFit, number> = {
  default: ICON_SIZE,
  compact: COMPACT_ICON_SIZE,
  dense: DENSE_ICON_SIZE,
};

/**
 * The fallback rhythm, used only where the custom properties cannot be read
 * (a non-browser DOM, a stylesheet that never loaded). In the app the values
 * below are exactly what src/index.css declares for `[data-dock-count="8"]`.
 */
const FIT_RHYTHM: Record<FooterFit, { gap: number; padInline: number; padBlock: number }> = {
  default: { gap: 8, padInline: 16, padBlock: 12 },
  compact: { gap: 4, padInline: 8, padBlock: 10 },
  dense: { gap: 2, padInline: 4, padBlock: 8 },
};

/** Half-pixel resolution: the capsule can be centred to the half pixel. */
const halfPx = (value: number) => Math.floor(value * 2) / 2;

/**
 * Solve one dock's resting geometry for the width it is given. Pure, so the
 * contract test can re-derive it: the caller passes the CSP-free numbers it
 * measured, and gets back the four values the dock renders with.
 */
export function homeDockFillMetrics(input: {
  /** The width the capsule may occupy (nav content box minus the reserve). */
  available: number;
  tabs: number;
  /** Today's resting plate for this fit band — the floor, never shrunk. */
  plate: number;
  /** Today's resting rhythm, read from the cascade. */
  gap: number;
  padInline: number;
  padBlock: number;
  maxPlate?: number;
}): GlassDockFill {
  const { available, tabs, plate, gap, padInline, padBlock } = input;
  const maxPlate = input.maxPlate ?? HOME_FILL_MAX_PLATE;
  const n = Math.floor(tabs);
  if (n < 2) return { plateSize: plate, gap, padInline, padBlock };

  // 1. The plates grow first — they are the icons the owner asked to enlarge.
  const plateSize = Math.max(
    plate,
    Math.min(maxPlate, halfPx((available - (n - 1) * gap - 2 * padInline) / n)),
  );

  // 2. Whatever the plates did not take goes to the gaps…
  let endPad = padInline;
  let spread = Math.max(gap, (available - n * plateSize - 2 * endPad) / (n - 1));

  // 3. …and on a wide screen the ends may breathe with the plate, never more
  //    than half a gap (so the ends never out-space the row itself).
  endPad = Math.max(
    padInline,
    Math.min(Math.round(HOME_FILL_PAD_RATIO * plateSize), Math.floor(spread / 2)),
  );
  spread = Math.max(gap, (available - n * plateSize - 2 * endPad) / (n - 1));

  return {
    plateSize,
    gap: halfPx(spread),
    padInline: endPad,
    padBlock: Math.max(padBlock, Math.round(HOME_FILL_BLOCK_RATIO * plateSize)),
  };
}

/** A CSS custom property in px, or the fallback when it is not readable. */
const readCustomPx = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const value = parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const sameFill = (a: GlassDockFill | null, b: GlassDockFill) =>
  a !== null &&
  a.plateSize === b.plateSize &&
  a.gap === b.gap &&
  a.padInline === b.padInline &&
  a.padBlock === b.padBlock;

/**
 * Measures the width this dock may fill and solves its resting geometry.
 *
 * Runs in a layout effect, so the dock's FIRST paint already wears the filled
 * size (no visible step from the compact dock to the filled one), and again on
 * resize/orientationchange — coalesced to one pass per frame, and only when a
 * number actually changed, because every publish re-renders the dock.
 */
function useHomeDockFill(itemCount: number, fit: FooterFit) {
  const navRef = useRef<HTMLElement | null>(null);
  const [fill, setFill] = useState<GlassDockFill | null>(null);
  const enabled = itemCount >= HOME_FILL_MIN_TABS;

  useLayoutEffect(() => {
    if (!enabled) {
      setFill(null);
      return undefined;
    }
    const nav = navRef.current;
    if (!nav || typeof window === "undefined") return undefined;

    let frame: number | null = null;
    const compute = () => {
      const navStyle = window.getComputedStyle(nav);
      const gutter =
        (parseFloat(navStyle.paddingLeft) || 0) + (parseFloat(navStyle.paddingRight) || 0);
      const rhythm = FIT_RHYTHM[fit];
      const next = homeDockFillMetrics({
        // `clientWidth` includes the nav's own padding, which is the visible
        // gutter the capsule must never cross.
        available: nav.clientWidth - gutter - 2 * HOME_FILL_RESERVE,
        tabs: itemCount,
        plate: FIT_PLATE[fit],
        gap: readCustomPx(navStyle, "--dc-home-dock-gap", rhythm.gap),
        padInline: readCustomPx(navStyle, "--dc-home-dock-pad", rhythm.padInline),
        padBlock: readCustomPx(navStyle, "--dc-home-dock-pad-block", rhythm.padBlock),
      });
      setFill((previous) => (sameFill(previous, next) ? previous : next));
    };

    compute();
    const onResize = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        compute();
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [enabled, itemCount, fit]);

  return { navRef, fill };
}

type FooterFit = "default" | "compact" | "dense";

const readFooterFit = (itemCount: number): FooterFit => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "default";
  try {
    if (itemCount >= 8 && window.matchMedia(EIGHT_TAB_DENSE_FIT_QUERY).matches) return "dense";
    if (itemCount >= 8 && window.matchMedia(EIGHT_TAB_COMPACT_FIT_QUERY).matches) return "compact";
    if (window.matchMedia(COMPACT_FIT_QUERY).matches) return "compact";
  } catch {
    return "default";
  }
  return "default";
};

const useCompactFit = (itemCount: number): FooterFit => {
  const [fit, setFit] = useState<FooterFit>(() => readFooterFit(itemCount));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const queryStrings = itemCount >= 8
      ? [EIGHT_TAB_COMPACT_FIT_QUERY, EIGHT_TAB_DENSE_FIT_QUERY]
      : [COMPACT_FIT_QUERY];
    let queries: MediaQueryList[];
    try {
      queries = queryStrings.map((query) => window.matchMedia(query));
    } catch {
      return;
    }
    const onChange = () => setFit(readFooterFit(itemCount));
    onChange();
    // `addEventListener` everywhere this app runs (browserslist floor: Chrome
    // 96 / Safari 15); the legacy `addListener` path is deliberately absent.
    queries.forEach((query) => query.addEventListener("change", onChange));
    return () => queries.forEach((query) => query.removeEventListener("change", onChange));
  }, [itemCount]);

  return fit;
};

export type SiteFooterNavProps = {
  /** Accessible name for the landmark (`aria-label`). */
  label: string;
  items: GlassDockItem[];
  onSelect: (id: string) => void;
  /** Optional extra element rendered before the tabs (rarely used). */
  leading?: React.ReactNode;
  /**
   * Escape hatch for a screen whose dock is not inside a positioned app frame
   * (FlowPath pins its dock to the viewport). The design — gutters, safe-area
   * padding, capsule, material — stays identical either way.
   */
  position?: "absolute" | "fixed";
  /** Extra hooks for page CSS/tests; never used to restyle the capsule. */
  dataAttrs?: Record<string, string | undefined>;
};

export default function SiteFooterNav({
  label,
  items,
  onSelect,
  leading,
  position = "absolute",
  dataAttrs,
}: SiteFooterNavProps) {
  const fit = useCompactFit(items.length);
  const compact = fit !== "default";
  const dense = fit === "dense";
  // Home's eight-tab dock is the only one that fills the width (see the fill
  // block above); every other footer's `fill` stays null and is untouched.
  const { navRef, fill } = useHomeDockFill(items.length, fit);

  return (
    <nav
      ref={navRef}
      data-site-footer-nav
      // The tab count is the only thing that differs between footers, and only
      // the seven-tab primary nav needs the tighter rhythm at 360–429 px, so
      // the fit rules in index.css key off this instead of a per-page hook.
      data-dock-count={String(items.length)}
      {...dataAttrs}
      className={`pointer-events-none inset-x-0 bottom-0 z-30 w-full overflow-visible px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 ${
        position === "fixed" ? "fixed" : "absolute"
      }`}
      aria-label={label}
    >
      <div data-site-footer className="pointer-events-auto mx-auto w-max max-w-full">
        {/* `fill` is Home's width fill and is null on every other screen. */}
        <GlassDock siteFooter compact={compact} items={items} dense={dense} fill={fill} onSelect={onSelect} leading={leading} />
      </div>
    </nav>
  );
}
