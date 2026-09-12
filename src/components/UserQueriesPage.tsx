// src/components/UserQueriesPage.tsx
//
// "Explore user queries" — every note dropped on the home page's Sticker Wall
// lands here. The owner can reply to any query inline; the reply is emailed
// to the address the query came from (api/_lib/userQueries.ts) AND rendered
// under the question so the thread reads as a conversation.
//
// The card itself lives in ./QueryCard: an opaque feed card (avatar + author
// + question + timestamp, with the answer as a separated secondary block).
// It is deliberately NOT glass — no backdrop-filter, no translucent fill — so
// the copy stays sharp over the winter scene. Replied and unreplied queries
// are still visually distinct on purpose:
//   · unreplied → amber "Awaiting reply" pill, reply composer open,
//   · replied   → emerald rail + mark, dimmed question, answer in its own
//     inset panel below it.
//
// The status filter (All / Unreplied / Replied) floats just above the footer
// navigation, using the measured dock height (`--dc-footer-nav-h`) so it can
// never sit under the dock.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Check, MessageSquare, RotateCcw } from "lucide-react";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";
import QueryCard from "./QueryCard";
import Skeleton from "./ui/Skeleton";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { cn } from "../utils/cn";
import { listUserQueries, type UserQuery } from "../utils/userQueries";

type FilterKey = "all" | "open" | "replied";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Unreplied" },
  { key: "replied", label: "Replied" },
];

/**
 * The same opaque shell the real card wears, for the page's two non-card
 * surfaces (the failure panel and the loading placeholders) so the list never
 * changes shape between states. Shared with QueryCard's palette on purpose.
 */
const SHELL = "w-full rounded-[22px] border border-[#263149] bg-[#101A2C]";
const SHELL_PAD = "px-4 py-3.5 sm:px-5 sm:py-4";

/** Loading placeholder that mirrors QueryCard's geometry exactly. */
function QueryCardSkeleton() {
  return (
    <div aria-hidden="true" className={cn(SHELL, SHELL_PAD)}>
      <div className="flex items-start gap-3">
        <Skeleton width={40} height={40} radius={999} />
        <div className="min-w-0 flex-1">
          <Skeleton width="58%" height={15} radius={6} />
          <Skeleton width="82%" height={12} radius={6} className="mt-1.5" />
        </div>
        <Skeleton width={78} height={22} radius={999} />
      </div>
      <Skeleton width="100%" height={13} radius={6} className="mt-3" />
      <Skeleton width="94%" height={13} radius={6} className="mt-1.5" />
      <Skeleton width="62%" height={13} radius={6} className="mt-1.5" />
      <Skeleton width={118} height={11} radius={6} className="mt-3" />
    </div>
  );
}

export default function UserQueriesPage({
  cartCount = 0,
  notifCount = 0,
  purchasesBadge = 0,
  onNavigateFooter,
  onNavigateToCart,
  onNavigateToNotifications,
  onNavigateToSubscription,
}: {
  cartCount?: number;
  notifCount?: number;
  purchasesBadge?: number;
  onNavigateFooter: (tab: TabKey) => void;
  onNavigateToCart?: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToSubscription?: () => void;
}) {
  const [queries, setQueries] = useState<UserQuery[]>([]);
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listUserQueries();
      setQueries(result.queries);
      setOwner(result.owner);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load queries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      all: queries.length,
      open: queries.filter((q) => q.status !== "replied").length,
      replied: queries.filter((q) => q.status === "replied").length,
    }),
    [queries],
  );

  const visible = useMemo(() => {
    if (filter === "all") return queries;
    if (filter === "open") return queries.filter((q) => q.status !== "replied");
    return queries.filter((q) => q.status === "replied");
  }, [filter, queries]);

  const handleReplied = (next: UserQuery) =>
    setQueries((current) => current.map((item) => (item.id === next.id ? next : item)));

  return (
    <div className="min-h-screen sm:py-6">
      <div
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:supports-[height:100dvh]:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none"
      >
        <Header
          cartCount={cartCount}
          notifCount={notifCount}
          onNavigateToSubscription={onNavigateToSubscription ?? (() => undefined)}
          onNavigateToCart={onNavigateToCart ?? (() => undefined)}
          onNavigateToNotifications={onNavigateToNotifications ?? (() => undefined)}
          icon={MessageSquare}
          title="User queries"
          subtitle={
            loading
              ? "Loading…"
              : `${counts.open} awaiting reply · ${counts.replied} replied`
          }
        />

        <main data-user-queries-content data-footer-nav-space className="flex-1 overflow-y-auto px-4 pt-3 md:px-8">
          {/* Readable measure on wide screens: the card is a conversation, not
              a banner, so it never stretches to the full desktop width. */}
          <div className="mx-auto w-full min-w-0 max-w-2xl">
            {error ? (
              <div className={cn(SHELL, SHELL_PAD)} role="alert">
                <p className="text-sm font-semibold text-[#FDA4AF]">{error}</p>
                <button
                  type="button"
                  onClick={() => void load()}
                  className={cn(
                    "mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#263149] bg-[#0A1120] px-4 text-[13px] font-bold text-white",
                    "transition-colors duration-150 hover:border-[#3B4A6B]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7DD3FC] focus-visible:ring-offset-2 focus-visible:ring-offset-[#101A2C]",
                  )}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Try again
                </button>
              </div>
            ) : null}

            {loading ? (
              <div
                className="flex flex-col gap-3.5 pb-4 sm:gap-4"
                aria-busy="true"
                aria-label="Loading queries"
              >
                {/* The page's own dummy layout — query-card placeholders instead
                    of a bare spinner, so a switch to Queries shows structure
                    until the list loads. */}
                {[0, 1, 2].map((index) => (
                  <QueryCardSkeleton key={index} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 pb-4 sm:gap-4">
                <AnimatePresence mode="popLayout">
                  {visible.map((query) => (
                    <QueryCard key={query.id} query={query} canReply={owner} onReplied={handleReplied} />
                  ))}
                </AnimatePresence>

                {visible.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <Check size={26} className="text-white/20" aria-hidden="true" />
                    <p className="text-sm text-white/60">
                      {filter === "replied"
                        ? "No replied queries yet"
                        : filter === "open"
                          ? "Nothing waiting for a reply"
                          : "No queries yet"}
                    </p>
                    <p className="max-w-xs text-xs text-white/30">
                      Notes dropped on the home page's feedback wall show up here.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </main>

        {/* Status filter — floats just above the footer navigation. */}
        <div
          data-user-queries-filterbar
          className="pointer-events-none absolute inset-x-0 bottom-[var(--dc-footer-nav-h,0px)] z-20 flex justify-center px-3 pb-2 md:bottom-6"
        >
          <div className="pointer-events-auto flex max-w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <GlassToggleGroup
              className="dc-segment shrink-0"
              value={filter}
              onValueChange={(next) => setFilter(next as FilterKey)}
              aria-label="Filter queries"
            >
              {FILTERS.map(({ key, label }) => {
                const isActive = filter === key;
                return (
                  <GlassToggleItem key={key} value={key} className="whitespace-nowrap px-3.5 py-1.5 text-sm font-semibold">
                    {label}
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border px-1.5 text-[11px] font-bold ${
                        isActive ? "border-white/30 text-white" : "border-white/15 text-white/70"
                      }`}
                    >
                      {counts[key]}
                    </span>
                  </GlassToggleItem>
                );
              })}
            </GlassToggleGroup>
          </div>
        </div>

        <BottomNav active={null} onChange={onNavigateFooter} purchasesBadge={purchasesBadge} />
      </div>
    </div>
  );
}
