// src/components/MyDayAllowanceCard.tsx
//
// My Day free-creation allowance, presented as a premium Profile card.
//
// The allowance used to be a plain strip pinned to the top of the My Day
// dashboard, which pushed the actual day planning below the fold and shouted
// "you are limited" on every visit. It now lives in Profile next to the other
// account/allowance cards (membership, renewal, AI allowance) where usage
// information belongs, using the same server-authoritative snapshot.

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Clock3,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMyDayAccess } from "../hooks/useMyDayAccess";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatResetClock(resetAt: number): string {
  if (!resetAt) return "midnight";
  return new Date(resetAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl p-3 text-center ring-1 backdrop-blur-md ${tone}`}>
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}

type Props = {
  /** Opens the My Day dashboard. */
  onOpenMyDay: () => void;
  /** Opens the subscription plans page. */
  onSubscribe: () => void;
};

export default function MyDayAllowanceCard({ onOpenMyDay, onSubscribe }: Props) {
  const {
    unlimited,
    canCreate,
    freeLimit,
    freeUsed,
    freeRemaining,
    resetAt,
    loading,
    error,
    uid,
    access,
    refresh,
  } = useMyDayAccess();
  const [now, setNow] = useState(() => Date.now());

  // The hook starts from an optimistic placeholder. `dayKey` is only filled in
  // once the server has answered, so it is the honest "we have real numbers"
  // signal — never show placeholder counts as if they were the user's usage.
  const resolved = Boolean(access.dayKey);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const usedPercent = useMemo(() => {
    if (unlimited || freeLimit <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((freeUsed / freeLimit) * 100)));
  }, [freeLimit, freeUsed, unlimited]);

  const browseOnlyPlan = !unlimited && freeLimit <= 0;
  const exhausted = !unlimited && !canCreate && freeLimit > 0;

  const badge = !resolved
    ? { label: loading ? "Syncing" : "Unavailable", tone: loading ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700" }
    : unlimited
      ? { label: "Unlimited", tone: "bg-violet-100 text-violet-700" }
      : browseOnlyPlan
        ? { label: "Browse only", tone: "bg-slate-100 text-slate-600" }
        : exhausted
          ? { label: "Used up", tone: "bg-amber-100 text-amber-700" }
          : { label: "Available", tone: "bg-emerald-100 text-emerald-700" };

  const headline = unlimited
    ? "Unlimited My Day creation"
    : browseOnlyPlan
      ? "Browse-only My Day access"
      : exhausted
        ? "Today’s free allowance is used"
        : `${freeRemaining} of ${freeLimit} free creation${freeLimit === 1 ? "" : "s"} left today`;

  const description = unlimited
    ? "Your plan includes unlimited tasks, schedule blocks, reminders and quick notes — create as much as your day needs."
    : browseOnlyPlan
      ? "Your pages stay open to read and plan with. Subscribe to start creating tasks, schedule blocks, reminders and notes again."
      : exhausted
        ? "Your saved pages stay fully browseable. The allowance refills automatically at the daily reset, or subscribe for unlimited creation."
        : "Spend it on a task, schedule item, note or reminder. After the daily allowance is used, My Day remains browse-only until reset.";

  const resetIn = resetAt > now ? formatCountdown(resetAt - now) : "now";

  return (
    <section
      data-myday-allowance-card
      data-myday-allowance-state={!resolved ? "loading" : unlimited ? "unlimited" : browseOnlyPlan ? "browse-only" : exhausted ? "exhausted" : "available"}
      aria-live="polite"
      className="dc-glass relative overflow-hidden rounded-[2rem] p-5"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-indigo-400/30 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-14 -left-10 h-28 w-28 rounded-full bg-violet-400/25 blur-2xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-[0_12px_24px_-10px_rgba(79,70,229,0.8)]">
              {unlimited ? <Zap className="h-6 w-6" /> : <CalendarClock className="h-6 w-6" />}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-400">My Day allowance</p>
              <h3 data-myday-allowance-headline className="mt-1 text-lg font-black leading-tight text-slate-950">
                {resolved ? headline : "Checking today’s allowance…"}
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-myday-allowance-refresh
              aria-label="Refresh My Day allowance"
              disabled={loading || !uid}
              onClick={() => void refresh()}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/60 text-indigo-600 shadow-sm ring-1 ring-white/70 backdrop-blur-md transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badge.tone}`}>{badge.label}</span>
          </div>
        </div>

        {!resolved ? (
          <div className="mt-5 rounded-2xl bg-white/45 p-4 ring-1 ring-white/70 backdrop-blur-md" role="status">
            {loading ? (
              <div className="space-y-3">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-indigo-100" />
                <div className="h-2.5 animate-pulse rounded-full bg-slate-200" />
                <p className="text-xs font-semibold text-slate-500">Loading used, remaining and reset information from the server…</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-xs font-bold">Allowance could not be verified</p>
                  <p className="mt-1 text-[11px] leading-5">{error || "Please retry. No client-side estimate is shown as real usage."}</p>
                </div>
              </div>
            )}
          </div>
        ) : unlimited ? (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-white/45 p-4 ring-1 ring-violet-200/60 backdrop-blur-md">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
            <p className="text-xs font-bold leading-5 text-slate-700">
              Tasks, schedule, reminders and notes all save to your account without a daily cap.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Today · {freeLimit > 0 ? `${freeUsed} / ${freeLimit} used` : "no free creations"}</span>
                <span className={exhausted || browseOnlyPlan ? "text-amber-700" : "text-indigo-700"}>
                  {browseOnlyPlan ? "Subscribers only" : `${freeRemaining} left`}
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/50 ring-1 ring-white/70">
                <div
                  data-myday-allowance-bar
                  className={`h-full rounded-full transition-all duration-500 ${browseOnlyPlan ? "bg-slate-300" : exhausted ? "bg-amber-500" : "bg-gradient-to-r from-indigo-500 to-violet-500"}`}
                  style={{ width: `${Math.max(6, usedPercent)}%` }}
                />
              </div>
            </div>

            {/* A browse-only plan has nothing to count or reset, so the
                per-day numbers are replaced by the single fact that matters. */}
            {browseOnlyPlan ? null : (
              <>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label="Used" value={`${freeUsed}`} tone="bg-white/45 ring-white/70" />
                  <Stat label="Left" value={`${freeRemaining}`} tone="bg-white/45 ring-white/70" />
                  <Stat label="Resets" value={resetAt ? formatResetClock(resetAt) : "Daily"} tone="bg-white/45 ring-white/70" />
                </div>

                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" /> Fresh allowance in {resetIn} · counted in your own time zone.
                </p>
              </>
            )}
          </>
        )}

        {resolved ? <p className="mt-4 text-xs leading-5 text-slate-600">{description}</p> : null}

        {error && resolved ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Last verified allowance is shown. {error}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            data-myday-allowance-open
            onClick={onOpenMyDay}
            className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 active:scale-[0.99]"
          >
            Open My Day <ArrowRight className="h-4 w-4" />
          </button>
          {resolved && !unlimited && (
            <button
              type="button"
              data-myday-allowance-subscribe
              onClick={onSubscribe}
              className="flex items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-white py-3 text-sm font-black text-indigo-700 transition hover:bg-indigo-50 active:scale-[0.99]"
            >
              <CircleCheck className="h-4 w-4" /> Get unlimited creation
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
