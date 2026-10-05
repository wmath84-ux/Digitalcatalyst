/**
 * The Digitalcatalyst destinations, in Recall's own tab language.
 *
 * The ported Recall nav covers studying (`Dashboard`, `Decks`, `Review`,
 * `Browser`, `Tags`, `Stats`, `Import`, `Settings`). Digitalcatalyst Revision
 * additionally owns exam mode (Daily Test / Test Bank), the Weak Topics report,
 * the score Progress report, the study plan and the AI generator/importers.
 *
 * Rather than inject foreign nav items into the vendored `AppShell` (which a
 * future re-vendor would fight), this row renders INSIDE the shell content with
 * Recall's tokens — the same Material-3 secondary-tab treatment Recall itself
 * uses — so the feature still has exactly one chrome and every route stays one
 * tap away on phone, tablet and desktop.
 */

import { useTranslation } from "../recall/shims/i18n";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS, type RevisionPageId } from "../integrations/routes";

interface TabDefinition {
  id: string;
  label: { key: string; fallback: string };
  href: string;
  /** Route pages that keep this tab highlighted. */
  pages: RevisionPageId[];
}

const TABS: TabDefinition[] = [
  { id: "dashboard", label: { key: "nav.dashboard", fallback: "Dashboard" }, href: REVISION_DEEP_LINKS.dashboard, pages: ["dashboard", "study"] },
  { id: "bank", label: { key: "revision.tabs.bank", fallback: "Test Bank" }, href: REVISION_DEEP_LINKS.testBank, pages: ["bank", "test-play", "test-play-attempt", "test-result", "test-review", "session", "session-result"] },
  { id: "decks", label: { key: "nav.decks", fallback: "Decks" }, href: "#/revision/decks", pages: ["decks"] },
  { id: "browser", label: { key: "nav.browser", fallback: "Cards" }, href: "#/revision/browser", pages: ["browser"] },
  { id: "weak", label: { key: "revision.tabs.weak", fallback: "Weak Topics" }, href: REVISION_DEEP_LINKS.weakTopics, pages: ["weak-topics"] },
  { id: "progress", label: { key: "revision.tabs.progress", fallback: "Progress" }, href: REVISION_DEEP_LINKS.progress, pages: ["progress", "stats"] },
  { id: "plan", label: { key: "revision.tabs.plan", fallback: "Plan & AI" }, href: REVISION_DEEP_LINKS.profile, pages: ["profile", "settings"] },
  { id: "import", label: { key: "revision.tabs.import", fallback: "Import" }, href: REVISION_DEEP_LINKS.bulkImport, pages: ["bulk-import", "import-hub"] },
];

export function RevisionTabs({ route }: { route: { page: RevisionPageId } }) {
  const { t } = useTranslation();
  const { navigate } = useRevisionRoute();

  return (
    <nav
      aria-label={t("revision.tabs.label", "Revision pages")}
      className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-outline-variant px-4 pb-0 sm:mx-0 sm:px-0"
    >
      {TABS.map((tab) => {
        const active = tab.pages.includes(route.page);
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => navigate(tab.href)}
            className={cn(
              "relative shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "text-primary" : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className={typeClass["label-lg"]}>{t(tab.label.key, tab.label.fallback)}</span>
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-1 bottom-0 h-0.5 rounded-full transition-opacity",
                active ? "bg-primary opacity-100" : "opacity-0",
              )}
            />
          </button>
        );
      })}
    </nav>
  );
}
