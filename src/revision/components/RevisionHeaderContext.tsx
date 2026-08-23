import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Lets a top-level revision tab page (Revision dashboard, Test Bank, Weak
 * Topics, Progress, Profile) merge its own section header into the shared
 * website header rendered by RevisionApp, so the learner sees ONE header
 * instead of a website header stacked above a feature header.
 *
 * Pages only shift WHERE their existing title/subtitle render — every string
 * and the logic that builds it (user-name greeting, "x of y saved" capacity,
 * streak chip, …) stays exactly where it always was, inside the page.
 */

export type RevisionHeaderContent = {
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

type RevisionHeaderContextValue = RevisionHeaderContent & {
  setHeader: (content: RevisionHeaderContent) => void;
};

const EMPTY_HEADER: RevisionHeaderContent = {};

const RevisionHeaderContext = createContext<RevisionHeaderContextValue | null>(null);

export function RevisionHeaderProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<RevisionHeaderContent>(EMPTY_HEADER);
  // Shallow-compare guard so re-registrations with unchanged values don't
  // trigger a re-render loop.
  const setHeader = useCallback((next: RevisionHeaderContent) => {
    setContent((prev) =>
      prev.title === next.title && prev.subtitle === next.subtitle && prev.rightSlot === next.rightSlot
        ? prev
        : next,
    );
  }, []);
  const value = useMemo(() => ({ ...content, setHeader }), [content, setHeader]);
  return <RevisionHeaderContext.Provider value={value}>{children}</RevisionHeaderContext.Provider>;
}

/** Read the header content pushed by the active page (used by RevisionApp). */
export function useRevisionHeader(): RevisionHeaderContent {
  return useContext(RevisionHeaderContext) ?? EMPTY_HEADER;
}

/**
 * Register/unregister the active page's section header. While `active` is
 * true the shared website header shows these values; on unmount (or when
 * deactivated) the header falls back to the default store title/tagline.
 */
export function useRegisterRevisionHeader(
  active: boolean,
  title?: string,
  subtitle?: string,
  rightSlot?: ReactNode,
) {
  const ctx = useContext(RevisionHeaderContext);
  const setHeader = ctx?.setHeader;
  useEffect(() => {
    if (!setHeader || !active) return undefined;
    setHeader({ title, subtitle, rightSlot });
    return () => setHeader(EMPTY_HEADER);
  }, [setHeader, active, title, subtitle, rightSlot]);
}
