// src/components/AppShell.tsx
//
// Wraps every app page (Home, Store, MyDay, Profile, Revision, …) and
// decides which chrome to render:
//
//   - mobile  → the existing per-page chrome (phone header + bottom-nav pill)
//   - tablet portrait (640-959 portrait) → tablet chrome (wider grids, still mobile header)
//   - tablet landscape OR width >=960 (1.5x mobile) OR desktop (>=1024) → DesktopShell
//     with side panel (persistent left rail + sticky top bar)
//
// NEW REQUIREMENT:
//   - Tablet landscape = desktop interface
//   - Width 1.5x mobile (960px+) = full desktop with side panel on tablet
//   - Elements scale with tablet size via CSS clamp
//
// The wrapper is intentionally lightweight: it just picks one of two
// layouts based on the viewport category. Each app page passes its
// existing body to `<AppShell>{children}</AppShell>`; the wrapper
// preserves everything inside. The only change in the page body is
// that the mobile bottom nav + phone header are skipped on desktop
// because the shell renders its own rail + top bar.
//
// The hook `useResponsiveCategory()` re-evaluates the viewport on
// resize + orientation change, so flipping a tablet into landscape
// flips the chrome live to desktop.
//
// SCROLL OWNERSHIP (why a tablet page used to be frozen): the shell is
// pinned to the viewport and `[data-desktop-content]` is the single
// scroll container — see the "TABLET / DESKTOP SCROLL MODEL" block at the
// bottom of `src/index.css`, which also releases each page's phone framing
// (`sm:overflow-hidden` on `[data-app-frame]` + a `flex-1 overflow-y-auto`
// <main>) so the content flows into that one scroller. A mouse wheel chains
// out of a clipped box, a touch gesture does not, which is why the pages
// scrolled on a desktop but not on a tablet. Keep exactly one scroller per
// band: the shell's row here, and `[data-app-frame]` from 640 px up when the
// shell is not rendered (tablet portrait).

import { type ReactNode, useEffect, useState } from "react";
import DesktopShell, { type DesktopRailKey, resolveActiveFromHash } from "./DesktopShell";
import { useResponsiveCategory } from "../utils/responsive";
import { FeatureVisibilityProvider } from "../context/FeatureVisibilityContext";

interface AppShellProps {
  children: ReactNode;
  /**
   * Active rail key. When omitted, the shell derives the active
   * entry from the current hash (the same way `Root` decides which
   * page to render). Pages that need an explicit value (e.g. a
   * deep-linked sub-page) can pass it here.
   */
  active?: DesktopRailKey;
  /** Page title in the top bar (optional — falls back to the rail label). */
  pageTitle?: string;
  /** Page subtitle in the top bar (optional). */
  pageSubtitle?: string;
  /**
   * Page-specific quick actions rendered on the right side of the
   * top bar. Most pages leave this empty and the shell shows the
   * global actions only.
   */
  topBarRight?: ReactNode;
  /**
   * Search handler for the top-bar search input. Pass `null` (the
   * default) to hide the search on a page.
   */
  onSearch?: (query: string) => void;
  /** Initial search query (e.g. when the page already has one). */
  initialSearchQuery?: string;
  /**
   * Optional right-rail panel (e.g. My Day's streak + quick
   * actions). Stacks on tablet, side-by-side on desktop.
   * On tablet landscape/desktop this panel is visible as side panel.
   */
  sidePanel?: ReactNode;
}

export default function AppShell({
  children,
  active,
  pageTitle,
  pageSubtitle,
  topBarRight,
  onSearch,
  initialSearchQuery,
  sidePanel,
}: AppShellProps) {
  const category = useResponsiveCategory();
  const [isTabletLandscapeDesktop, setIsTabletLandscapeDesktop] = useState(false);

  // Extra check for tablet landscape that should show desktop
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const landscape = w > h;
      let isTablet = false;
      try {
        const sw = window.screen?.width ?? 0;
        const sh = window.screen?.height ?? 0;
        isTablet = Math.min(sw, sh) >= 600;
      } catch {
        isTablet = w >= 640;
      }
      const wide = w >= 960;
      const shouldDesktop = wide || (landscape && isTablet && w >= 640);
      setIsTabletLandscapeDesktop(shouldDesktop);
      
      // Set data attributes for CSS
      if (shouldDesktop) {
        document.documentElement.setAttribute("data-tablet-landscape-desktop", "true");
      } else {
        document.documentElement.removeAttribute("data-tablet-landscape-desktop");
      }
      if (landscape && isTablet) {
        document.documentElement.setAttribute("data-tablet-landscape", "true");
      } else {
        document.documentElement.removeAttribute("data-tablet-landscape");
      }
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  const resolvedActive = active ?? resolveActiveFromHash(typeof window !== "undefined" ? window.location.hash : "");

  // Show desktop shell for:
  // - desktop category (>=1024)
  // - tablet landscape (640+ landscape tablet)
  // - wide tablet >=960 (1.5x mobile)
  const showDesktopShell = category === "desktop" || isTabletLandscapeDesktop;

  // The FeatureVisibilityProvider is mounted in BOTH branches so a feature
  // page (My Day / Revision) can publish its visibility regardless of
  // whether the desktop shell owns the chrome. The desktop rail and the
  // mobile bottom nav both consume it via `useFeatureVisibilityMap`.
  if (showDesktopShell) {
    return (
      <FeatureVisibilityProvider>
        <DesktopShell
          active={resolvedActive}
          pageTitle={pageTitle}
          pageSubtitle={pageSubtitle}
          topBarRight={topBarRight}
          onSearch={onSearch}
          initialSearchQuery={initialSearchQuery}
          sidePanel={sidePanel}
        >
          {children}
        </DesktopShell>
      </FeatureVisibilityProvider>
    );
  }
  // Mobile + tablet portrait: the per-page chrome is in charge. The wrapper
  // is render-free for the page body, so the existing JSX structure
  // stays exactly as it was.
  return (
    <FeatureVisibilityProvider>
      {children}
    </FeatureVisibilityProvider>
  );
}

export type { DesktopRailKey };
