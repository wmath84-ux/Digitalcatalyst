// src/components/UserQueriesPage.tsx
//
// "Explore user queries" — every note dropped on the home page's Sticker Wall
// lands here. The owner can reply to any query inline; the reply is emailed
// to the address the query came from (api/_lib/userQueries.ts) AND rendered
// under the question so the thread reads as a conversation.
//
// Replied and unreplied queries are visually distinct on purpose:
//   · unreplied → amber rail, "Awaiting reply" chip, reply composer open,
//   · replied   → emerald rail, "Replied" chip, dimmed question and the
//     reply shown in its own tinted answer card below it.
//
// The status filter (All / Unreplied / Replied) floats just above the footer
// navigation, using the measured dock height (`--dc-footer-nav-h`) so it can
// never sit under the dock.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Mail, MessageSquare, Send } from "lucide-react";
import Header from "./Header";
import BottomNav, { type TabKey } from "./BottomNav";
import { GlassCard } from "./ui/GlassCard";
import { GlassToggleGroup, GlassToggleItem } from "./ui/glass-toggle-group";
import { listUserQueries, replyToUserQuery, type UserQuery } from "../utils/userQueries";

type FilterKey = "all" | "open" | "replied";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Unreplied" },
  { key: "replied", label: "Replied" },
];

const formatWhen = (value: number) => {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

function QueryCard({
  query,
  canReply,
  onReplied,
}: {
  query: UserQuery;
  canReply: boolean;
  onReplied: (next: UserQuery) => void;
}) {
  const replied = query.status === "replied";
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await replyToUserQuery(query.id, text);
      onReplied(result.query);
      setDraft("");
      setNotice(result.emailed ? `Emailed to ${query.email}` : result.emailStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      data-user-query
      data-status={query.status}
    >
      <GlassCard
        className="overflow-hidden"
        contentClassName="p-0"
      >
        {/* Status rail — the instant visual difference between the two kinds. */}
        <div className="flex">
          <span
            aria-hidden
            className="w-1 shrink-0"
            style={{ background: replied ? "#06D6A0" : "#FFBE0B" }}
          />
          <div className="min-w-0 flex-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{query.name}</p>
                <p className="truncate text-[11px] font-semibold text-white/45">
                  {query.email || "no email"} · {formatWhen(query.createdAt)}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
                style={
                  replied
                    ? { background: "#06D6A018", borderColor: "#06D6A044", color: "#6EE7C0" }
                    : { background: "#FFBE0B18", borderColor: "#FFBE0B44", color: "#FFD666" }
                }
              >
                {replied ? "Replied" : "Awaiting reply"}
              </span>
            </div>

            <p className={`mt-3 whitespace-pre-wrap text-sm font-medium ${replied ? "text-white/60" : "text-white/90"}`}>
              {query.message}
            </p>

            {/* The owner's reply, shown UNDER the query as its own answer card. */}
            {replied && query.reply ? (
              <div
                className="mt-3 rounded-2xl border p-3"
                style={{ background: "#06D6A00f", borderColor: "#06D6A033" }}
              >
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: "#6EE7C0" }}>
                  <Mail size={12} /> Your reply · {formatWhen(query.repliedAt || 0)}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm font-medium text-white/85">{query.reply}</p>
                {query.replyEmailStatus ? (
                  <p className="mt-2 text-[10px] font-semibold text-white/35">{query.replyEmailStatus}</p>
                ) : null}
              </div>
            ) : null}

            {/* Composer — only the owner sees it, and only until it is answered. */}
            {canReply && !replied ? (
              <div className="mt-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
                  }}
                  rows={3}
                  placeholder={`Reply to ${query.name}…`}
                  className="w-full resize-y rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-medium text-white outline-none placeholder:text-white/35 focus:border-white/30"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[10px] font-semibold text-white/35">
                    Sends to {query.email || "— no email on this query"}
                  </p>
                  <motion.button
                    type="button"
                    onClick={() => void submit()}
                    disabled={sending || !draft.trim()}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.94 }}
                    transition={{ type: "spring", stiffness: 320, damping: 20 }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9)" }}
                  >
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {sending ? "Sending…" : "Send reply"}
                  </motion.button>
                </div>
                {error ? <p className="mt-2 text-[11px] font-semibold text-rose-300">{error}</p> : null}
                {notice ? <p className="mt-2 text-[11px] font-semibold text-emerald-300">{notice}</p> : null}
              </div>
            ) : null}
          </div>
        </div>
      </GlassCard>
    </motion.div>
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
          {error ? (
            <GlassCard contentClassName="p-4">
              <p className="text-sm font-semibold text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white"
              >
                Try again
              </button>
            </GlassCard>
          ) : null}

          {loading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-4">
              <AnimatePresence mode="popLayout">
                {visible.map((query) => (
                  <QueryCard key={query.id} query={query} canReply={owner} onReplied={handleReplied} />
                ))}
              </AnimatePresence>

              {visible.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <Check size={26} className="text-white/20" />
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
