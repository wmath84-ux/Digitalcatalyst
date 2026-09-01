import type { ReactNode } from "react";

/**
 * Landing-style opening animation for the listed app pages.
 *
 * Motion matches the landing Hero (opacity 0 → 1, y 30 → 0, 0.8s, delay
 * 0.15s) and Header (y -40 → 0, opacity 0 → 1, 0.7s ease-out). CSS, not
 * AnimatePresence: the next page starts immediately, no exit wait.
 *
 * Keyed by **app**, not sub-route, so Revision and My Day keep their
 * paywall / loading / local state when the learner moves between inner
 * pages. Product and course keys follow the id and ignore `?module=`.
 * Inner pages animate via `[data-page-enter-panel]` in those apps.
 *
 * The wrapper is `display: contents` so it never becomes a `transform`
 * containing block for overlay headers (that would break sticky/fixed
 * chrome). Mobile uses two layers: `[data-site-header]` from above,
 * body from below. Desktop animates the page column only — the shell
 * topbar stays put.
 */
export function pageEnterAppKey(hash: string): string | null {
  const path = (hash || "").split("?")[0];
  if (path.startsWith("#/home")) return "#/home";
  if (path.startsWith("#/store")) return "#/store";
  if (path.startsWith("#/product/")) return path;
  if (path.startsWith("#/subscription")) return "#/subscription";
  if (path.startsWith("#/profile/subscriber-experience")) return null;
  if (path.startsWith("#/profile")) return "#/profile";
  if (path.startsWith("#/cart")) return "#/cart";
  if (path.startsWith("#/course/")) return path;
  if (path.startsWith("#/my-day")) return "#/my-day";
  if (path.startsWith("#/revision")) return "#/revision";
  return null;
}

export default function PageEnter({
  pageKey,
  children,
}: {
  pageKey: string | null;
  children: ReactNode;
}) {
  if (!pageKey) return <>{children}</>;
  return (
    <div key={pageKey} data-page-enter="" data-page-key={pageKey} className="contents">
      {children}
    </div>
  );
}
