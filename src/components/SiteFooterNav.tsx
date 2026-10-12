import { useEffect, useState, type ReactNode } from "react";
import GlassDock, { type GlassDockItem } from "./glass-dock/GlassDock";
import SitePeekFooter from "./SitePeekFooter";
import UiverseFooterNav from "./UiverseFooterNav";
import { useFooterNavigationStyle } from "../utils/footerNavigationStyle";

/**
 * The ONE site footer navigation. The saved display preference chooses
 * between the four-tab Uiverse pill and the preserved magnifying GlassDock.
 * Both share the real footer measurement hook, safe-area clearance and route
 * behavior. Peek-mode remains available whenever the classic dock is selected.
 */

/** Narrow phones use 38px plates so the seven-tab dock fits without clipping. */
export const COMPACT_FIT_QUERY = "(max-width: 349px)";

const readCompactFit = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(COMPACT_FIT_QUERY).matches;
  } catch {
    return false;
  }
};

const useCompactFit = (): boolean => {
  const [compact, setCompact] = useState(() => readCompactFit());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(COMPACT_FIT_QUERY);
    } catch {
      return undefined;
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
  leading?: ReactNode;
  /**
   * Escape hatch for a screen whose dock is not inside a positioned app frame
   * (FlowPath pins its dock to the viewport). The design — gutters, safe-area
   * padding, capsule, material — stays identical either way.
   */
  position?: "absolute" | "fixed";
  /** Extra hooks for page CSS/tests; never used to restyle the capsule. */
  dataAttrs?: Record<string, string | undefined>;
  /**
   * Course-player peek interaction: a thin line at the bottom reveals the
   * same GlassDock, hold+drag drives the magnification wave, and a tap
   * pins it on touch. Icons stay the caller's. Home and My Day use this
   * so the footer is as smooth as the course player's.
   */
  peek?: boolean;
  /**
   * With `peek`: the dock is visible by default and never collapses; the line
   * stays only as the optional drag strip (Home).
   */
  peekAlwaysOpen?: boolean;
};

export default function SiteFooterNav({
  label,
  items,
  onSelect,
  leading,
  position = "absolute",
  dataAttrs,
  peek = false,
  peekAlwaysOpen = false,
}: SiteFooterNavProps) {
  const compact = useCompactFit();
  const navigationStyle = useFooterNavigationStyle();

  if (navigationStyle === "uiverse") {
    const purchasesBadge = items.find((item) => item.id === "purchases")?.badge ?? 0;
    return (
      <UiverseFooterNav
        label="Primary navigation"
        purchasesBadge={purchasesBadge}
        position={position}
        dataAttrs={dataAttrs}
      />
    );
  }

  if (peek) {
    return (
      <SitePeekFooter
        label={label}
        items={items}
        onSelect={onSelect}
        compact={compact}
        alwaysOpen={peekAlwaysOpen}
        dataAttrs={dataAttrs}
      />
    );
  }

  return (
    <nav
      data-site-footer-nav
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
