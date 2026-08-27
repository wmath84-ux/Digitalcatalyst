// src/components/AppShell.tsx
//
// Wraps every app page (Home, Store, MyDay, Profile, Revision, …) and
// decides which chrome to render:
//
//   - mobile  / tablet  → the existing per-page chrome (phone
//                           header + bottom-nav pill)
//   - desktop (>= 1024 px) → the new DesktopShell (persistent left
//                             rail + sticky top bar)
//
// The wrapper is intentionally lightweight: it just picks one of two
// layouts based on the viewport category. Each app page passes its
// existing body to `<AppShell>{children}</AppShell>`; the wrapper
// preserves everything inside. The only change in the page body is
// that the mobile bottom nav + phone header are skipped on desktop
// because the shell renders its own rail + top bar.
//
// The hook `useResponsiveCategory()` re-evaluates the viewport on
// resize, so flipping a phone into landscape (and back) flips the
// chrome live. The rail is only ever mounted on desktop, so its
// state is naturally consistent across navigation.

import { type ReactNode } from "react";
import DesktopShell, { type DesktopRailKey, resolveActiveFromHash } from "./DesktopShell";
import { useResponsiveCategory } from "../utils/responsive";

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
  const resolvedActive = active ?? resolveActiveFromHash(typeof window !== "undefined" ? window.location.hash : "");

  if (category === "desktop") {
    return (
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
    );
  }
  // Mobile + tablet: the per-page chrome is in charge. The wrapper
  // is render-free for the page body, so the existing JSX structure
  // stays exactly as it was.
  return <>{children}</>;
}

export type { DesktopRailKey };
