import { useEffect, useState } from "react";
import GlassDock, { type GlassDockItem } from "./glass-dock/GlassDock";

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
 * capsule, so GlassDock switches to its `compact` plates (38 px — still above
 * the 32 px minimum, and the magnification wave keeps working because the size
 * is driven in JS, not frozen by CSS). The gap/padding rhythm that goes with it
 * lives in src/index.css under the same breakpoint.
 */
export const COMPACT_FIT_QUERY = "(max-width: 349px)";

const useCompactFit = (): boolean => {
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try {
      return window.matchMedia(COMPACT_FIT_QUERY).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(COMPACT_FIT_QUERY);
    } catch {
      return;
    }
    const onChange = () => setCompact(query.matches);
    onChange();
    // `addEventListener` everywhere this app runs (browserslist floor: Chrome
    // 96 / Safari 15); the legacy `addListener` path is deliberately absent.
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return compact;
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
  const compact = useCompactFit();

  return (
    <nav
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
        <GlassDock siteFooter compact={compact} items={items} onSelect={onSelect} leading={leading} />
      </div>
    </nav>
  );
}
