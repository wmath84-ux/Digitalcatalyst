import { Tabs, TabsList, TabsTrigger } from "./glass-tabs";
import { cn } from "../../utils/cn";

/**
 * PageTabs — the text-only page switcher for tablet + desktop.
 *
 * Why it exists: on a phone, My Day / Revision move between their pages with
 * the floating bottom pill (icon + label). That pill is deliberately hidden
 * from 768 px up (a bottom bar is the wrong shape for a laptop and for a
 * tablet held in two hands on a desk), which left those screens without an
 * obvious way to jump between Day / Tasks / Schedule / Reminders / Notes.
 * This row is the desktop-tablet answer: one quiet line of plain text
 * directly under the header, in the spot a desktop user expects the tabs.
 *
 * Rules the feature screens rely on (unchanged by the glass pass):
 *   • Text only — no icons (no lucide import), no gradients on the label. The
 *     active page is marked by colour plus the glass indicator, so the strip
 *     still reads as a tab bar rather than a button group.
 *   • It renders from `md` (768 px) up and is fully hidden on mobile, so the
 *     phone chrome is untouched and the two never stack.
 *   • It lives in the page body (not inside a scroll container), so the row
 *     stays put while each page's own list scrolls beneath it — the sticky
 *     offset is owned by `.dc-page-tabs` in src/index.css, and `data-page-tabs`
 *     still tags the feature for page CSS + contract tests.
 *   • `onHome` is an optional plain "Home" shortcut at the right end.
 *
 * Wave 1 change: the underline is replaced by the pack's spring-driven glass
 * indicator (`TabsList` in ./glass-tabs) — a droplet pill that stretches along
 * its travel and settles round, driven by the shared `Track`/`spring` core.
 * The tab strip sits on a light surface, so the trigger colours are overridden
 * (upstream ships white-on-dark); `cn`/tailwind-merge resolves that cleanly.
 */
export interface PageTabItem {
  /** Value handed back to `onSelect`; also what `activeId` is compared to. */
  id: string;
  /** The label shown in the row. */
  label: string;
  /** Optional tooltip (`title`) — useful on a mouse-driven desktop. */
  hint?: string;
  /** Optional route this tab opens, for pages that navigate instead of swapping a section. */
  href?: string;
}

interface PageTabsProps {
  items: PageTabItem[];
  /** The tab that is the current page. Pass `null` when none of them is. */
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Accessible name for the row, e.g. "My Day pages". */
  ariaLabel: string;
  /** Plain-text shortcut at the right end of the row (usually "Home"). */
  homeLabel?: string;
  onHome?: () => void;
  /**
   * Feature marker rendered as `data-page-tabs`, so a page's own CSS/tests can
   * target the row (`[data-page-tabs="myday"]`).
   */
  feature?: string;
  /** Extra classes for the feature's own gutter / width tweaks. */
  className?: string;
}

export default function PageTabs({
  items,
  activeId,
  onSelect,
  ariaLabel,
  homeLabel = "Home",
  onHome,
  feature = "true",
  className,
}: PageTabsProps) {
  return (
    <nav
      data-page-tabs={feature}
      aria-label={ariaLabel}
      className={cn(
        // `hidden md:block` — mobile keeps the floating bottom pill.
        // `shrink-0` — the row is never squeezed by a tall page body when the
        // feature renders it inside a flex column (Revision).
        // `.dc-page-tabs` — the sticky offset under the visible header is owned
        // by src/index.css, because which header is on screen depends on the
        // app's tablet / desktop bands (768 / 960 + tablet landscape), not on
        // a Tailwind breakpoint.
        "dc-page-tabs hidden w-full shrink-0 border-b border-white/10 md:block",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-x-2 gap-y-1 px-4 sm:px-6 md:px-8 lg:px-10">
        {/* `value` is driven from the route/section the page is on, so the
            indicator springs to the right place on navigation too. */}
        <Tabs value={activeId ?? ""} onValueChange={onSelect}>
          <TabsList
            role="tablist"
            aria-orientation="horizontal"
            className="dc-page-tabs-list py-0.5"
          >
            {items.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                title={item.hint}
                aria-current={item.id === activeId ? "page" : undefined}
                className={cn(
                  "dc-scene-ink px-3 py-1.5 text-sm font-semibold transition-colors duration-200",
                  item.id === activeId
                    ? "text-white"
                    : "text-white/55 hover:text-white",
                )}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            title={`Back to ${homeLabel}`}
            className="dc-scene-ink ml-auto shrink-0 rounded-xl px-2 py-3 text-sm font-semibold text-white/55 outline-none transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-indigo-300/70"
          >
            {homeLabel}
          </button>
        ) : null}
      </div>
    </nav>
  );
}
