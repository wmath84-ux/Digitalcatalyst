// src/components/TopBarTabsContext.tsx
//
// Lets a page publish its OWN page-switcher into the desktop shell's top bar.
//
// Why it exists: on a phone, features such as Revision move between their
// pages with the floating bottom pill. On tablet + desktop that pill is hidden
// and the feature renders a horizontal strip of text tabs in its page body
// (`src/components/ui/PageTabs.tsx`). The desktop shell already owns the
// header there (`[data-desktop-topbar]`), so the strip was a second, separate
// bar floating under it. This context lets the feature hand the very same
// destinations to the header instead, as a second row inside the top bar.
//
// The contract:
//   • A page registers while it is MOUNTED and unregisters on unmount, so the
//     row only exists on the page that published it — the Revision tabs are
//     visible on Revision screens and nowhere else.
//   • The row renders exactly what the page gives it: text labels, the active
//     id, and the page's own click handler (so Revision keeps routing through
//     its exit guard).
//   • When no desktop shell is mounted (phone, tablet portrait) the context is
//     absent. `useTopBarTabsHost()` then returns `null` and the page keeps
//     rendering its in-body strip, so no screen ever loses its navigation.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface TopBarTabItem {
  /** Value handed back to `onSelect`; also compared against `activeId`. */
  id: string;
  /** The label shown in the row. */
  label: string;
  /** Optional tooltip (`title`) — useful on a mouse-driven desktop. */
  hint?: string;
}

export interface TopBarTabsConfig {
  /** Marker rendered as `data-topbar-tabs`, e.g. `"revision"`. */
  feature: string;
  /** Accessible name for the row, e.g. `"Revision pages"`. */
  ariaLabel: string;
  /** The destinations, in the order they should appear. */
  items: TopBarTabItem[];
  /** The tab that is the current page (`null` when none of them is). */
  activeId: string | null;
  /** The page's own navigation handler. */
  onSelect: (id: string) => void;
  /** Plain-text shortcut at the right end of the row (usually "Home"). */
  homeLabel?: string;
  onHome?: () => void;
}

interface TopBarTabsHost {
  /** Publish (or, with `null`, clear) the header tab row. */
  setTabs: (config: TopBarTabsConfig | null) => void;
}

const TopBarTabsContext = createContext<TopBarTabsHost | null>(null);

/**
 * Mounted by the desktop shell only. It carries the shell's state setter down
 * to the page; the shell keeps the config in its own state and renders the row
 * inside `[data-desktop-topbar]`.
 */
export function TopBarTabsProvider({
  setTabs,
  children,
}: {
  setTabs: (config: TopBarTabsConfig | null) => void;
  children: ReactNode;
}) {
  const value = useMemo<TopBarTabsHost>(() => ({ setTabs }), [setTabs]);
  return <TopBarTabsContext.Provider value={value}>{children}</TopBarTabsContext.Provider>;
}

/**
 * `null` unless the desktop shell owns the chrome. A page uses this to skip
 * its in-body tab strip while the header shows the same destinations.
 */
export function useTopBarTabsHost(): TopBarTabsHost | null {
  return useContext(TopBarTabsContext);
}

/**
 * Register the page's tabs in the desktop header for as long as the caller is
 * mounted (or until it passes `null`). Unmounting clears the row, which is
 * what keeps the Revision tabs off every other page.
 */
export function useRegisterTopBarTabs(config: TopBarTabsConfig | null): void {
  const host = useContext(TopBarTabsContext);

  // The published config is rebuilt from the caller's values on every render,
  // so the click handlers are read through a ref: the object handed to the
  // shell keeps a STABLE identity (which is what stops a re-render loop) while
  // the handler it calls is always the newest one.
  const latest = useRef<TopBarTabsConfig | null>(config);
  useEffect(() => {
    latest.current = config;
  });

  const feature = config?.feature ?? null;
  const ariaLabel = config?.ariaLabel ?? null;
  const items = config?.items ?? null;
  const activeId = config?.activeId ?? null;
  const homeLabel = config?.homeLabel ?? null;

  const published = useMemo<TopBarTabsConfig | null>(() => {
    if (!feature || !items) return null;
    return {
      feature,
      ariaLabel: ariaLabel ?? feature,
      items,
      activeId,
      homeLabel: homeLabel ?? undefined,
      onSelect: (id: string) => {
        latest.current?.onSelect(id);
      },
      onHome: () => {
        latest.current?.onHome?.();
      },
    };
  }, [feature, ariaLabel, items, activeId, homeLabel]);

  useEffect(() => {
    if (!host) return undefined;
    host.setTabs(published);
    return () => host.setTabs(null);
  }, [host, published]);
}
