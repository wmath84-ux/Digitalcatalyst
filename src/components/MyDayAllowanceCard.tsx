import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMyDayAccess } from "../hooks/useMyDayAccess";
import { ProfileCard as GlassSurface } from "../profile/ProfileCard";
import { GlassButton } from "./ui/glass-button";
import UsageMetric from "../usage/UsageMetric";

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

type Props = {
  minimal?: boolean;
  /** Opens the My Day dashboard. */
  onOpenMyDay: () => void;
  /** Opens the subscription plans page. */
  onSubscribe: () => void;
};

export default function MyDayAllowanceCard({ onOpenMyDay, onSubscribe, minimal = false }: Props) {
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
    ? { label: loading ? "Syncing" : "Unavailable", tone: loading ? "border border-white/15 text-white/55" : "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" }
    : unlimited
      ? { label: "Unlimited", tone: "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30" }
      : browseOnlyPlan
        ? { label: "Browse only", tone: "border border-white/15 text-white/85" }
        : exhausted
          ? { label: "Used up", tone: "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" }
          : { label: "Available", tone: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30" };

  const headline = unlimited
    ? "Unlimited My Day creation"
    : browseOnlyPlan
      ? "Browse-only My Day access"
      : exhausted
        ? "Today’s free allowance is used"
        : `${freeRemaining} of ${freeLimit} free creation${freeLimit === 1 ? "" : "s"} left today`;

  const description = unlimited
    ? ""
    : browseOnlyPlan
      ? "Reading stays open — subscribe to create tasks, notes and reminders again."
      : exhausted
        ? "Saved pages stay readable. The allowance refills at the next reset."
        : "One creation per task, note or reminder. After that, My Day remains browse-only until reset.";

  const resetIn = resetAt > now ? formatCountdown(resetAt - now) : "now";

  if (minimal) return (
    <section data-myday-allowance-card data-myday-allowance-state={!resolved ? loading ? "loading" : "unavailable" : unlimited ? "unlimited" : browseOnlyPlan ? "browse-only" : exhausted ? "exhausted" : "available"} className="dc-usage-section" aria-live="polite">
      <header className="dc-usage-section-header"><div><h2>My Day</h2><p data-myday-allowance-headline className="dc-account-note">Tasks, notes and reminders</p></div><button type="button" data-myday-allowance-refresh aria-label="Refresh My Day allowance" disabled={loading || !uid} onClick={() => void refresh()} className="dc-account-text-action">{loading ? "Syncing…" : "Refresh"}</button></header>
      <p className="dc-usage-state">{badge.label}</p>
      {!resolved ? <p role={loading ? "status" : "alert"} className={loading ? "dc-account-note" : "dc-account-error"}>{loading ? "Checking your allowance…" : error || "Allowance could not be verified. Retry to load current limits."}</p> : <>
        <UsageMetric label="Daily creations" used={freeUsed} limit={freeLimit} remaining={freeRemaining} unlimited={unlimited} resetAt={!browseOnlyPlan && !unlimited ? resetAt : undefined} now={now} barHook="myday" />
        <p className="dc-account-note">{browseOnlyPlan ? "Creation needs an eligible plan. Saved items stay readable." : exhausted ? "Creation allowance is used up. Saved items stay readable until it resets." : "One task, note or reminder uses one creation. Reading saved items stays open."}</p>
        {error ? <p role="alert" className="dc-account-error">Last verified allowance shown. {error}</p> : null}
      </>}
      <button type="button" data-myday-allowance-open onClick={onOpenMyDay} className="dc-account-text-action">Open My Day</button>
    </section>
  );
  return (
    <section
      data-myday-allowance-card
      data-myday-allowance-state={!resolved ? "loading" : unlimited ? "unlimited" : browseOnlyPlan ? "browse-only" : exhausted ? "exhausted" : "available"}
      aria-live="polite"
      className="relative h-full"
    >
      <GlassSurface className="h-full" contentClassName="flex h-full flex-col justify-between p-4 sm:p-5 lg:p-6">
        <div>
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/35">
                {unlimited ? <Zap className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="dc-profile-card-accent uppercase tracking-wider">My Day allowance</p>
                <h3 data-myday-allowance-headline className="dc-profile-card-title mt-0.5 text-base font-bold text-white">
                  {resolved ? headline : "Checking today’s allowance…"}
                </h3>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <GlassButton
                type="button"
                data-myday-allowance-refresh
                aria-label="Refresh My Day allowance"
                disabled={loading || !uid}
                onClick={() => void refresh()}
                className="shrink-0 disabled:opacity-50 [&_.size-12]:size-8"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </GlassButton>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badge.tone}`}>
                {badge.label}
              </span>
            </div>
          </div>

          {/* Primary Telemetry Subpanel */}
          {!resolved ? (
            <div className="dc-profile-subpanel mt-4 p-4" role="status">
              {loading ? (
                <div className="space-y-3">
                  <div className="h-3 w-3/4 animate-pulse rounded-full bg-indigo-500/20" />
                  <div className="h-2.5 animate-pulse rounded-full bg-indigo-500/10" />
                  <p className="text-xs font-semibold text-white/55">Loading used, remaining and reset information from the server…</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Allowance could not be verified</p>
                    <p className="mt-1 text-[11px] leading-5">{error || "Please retry. No client-side estimate is shown as real usage."}</p>
                  </div>
                </div>
              )}
            </div>
          ) : unlimited ? (
            <div className="dc-profile-subpanel mt-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="dc-profile-card-title inline-flex items-center gap-2 text-violet-200">
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-300" />
                  <span>Full Subscriber Capacity</span>
                </span>
                <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-200">
                  Uncapped
                </span>
              </div>
              <p className="dc-profile-card-meta mt-2">
                No daily cap on tasks, schedule, reminders or notes.
              </p>
            </div>
          ) : (
            <div className="dc-profile-subpanel mt-4 p-4">
              <div className="dc-profile-card-meta flex items-center justify-between gap-2">
                <span className="font-semibold text-white/85">
                  Today · {freeLimit > 0 ? `${freeUsed} / ${freeLimit} used` : "no free creations"}
                </span>
                <span className={`font-bold ${exhausted || browseOnlyPlan ? "text-amber-200" : "text-indigo-200"}`}>
                  {browseOnlyPlan ? "Subscribers only" : `${freeRemaining} left`}
                </span>
              </div>
              <div className="dc-profile-bar mt-2.5">
                <div
                  data-myday-allowance-bar
                  className={`h-full rounded-full transition-all duration-500 ${browseOnlyPlan ? "bg-white/40" : exhausted ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${Math.max(6, usedPercent)}%` }}
                />
              </div>
              {browseOnlyPlan ? null : (
                <p className="dc-profile-card-meta mt-2.5 flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                  <span>Resets in {resetIn}{resetAt ? ` · ${formatResetClock(resetAt)}` : ""}</span>
                </p>
              )}
            </div>
          )}

          {/* 2-Column Scope Breakdown */}
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <div className="dc-profile-subpanel flex items-start gap-2.5 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
              <div className="min-w-0">
                <span className="dc-profile-card-title block truncate text-xs">Creation Scope</span>
                <span className="dc-profile-card-meta mt-0.5 block">Tasks, notes &amp; reminders</span>
              </div>
            </div>
            <div className="dc-profile-subpanel flex items-start gap-2.5 p-3">
              <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <div className="min-w-0">
                <span className="dc-profile-card-title block truncate text-xs">Reading Access</span>
                <span className="dc-profile-card-meta mt-0.5 block">Saved items stay open</span>
              </div>
            </div>
          </div>

          {resolved && description ? <p className="dc-profile-card-meta mt-3">{description}</p> : null}

          {error && resolved ? (
            <p className="mt-2.5 flex items-start gap-1.5 text-[11px] font-semibold leading-5 text-amber-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Last verified allowance is shown. {error}
            </p>
          ) : null}
        </div>

        {/* Footer Action Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-white/[0.08] pt-3.5 sm:flex-nowrap">
          <button
            type="button"
            data-myday-allowance-open
            onClick={onOpenMyDay}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.99]"
          >
            <span>Open My Day</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {resolved && !unlimited && (
            <GlassButton
              variant="capsule"
              type="button"
              data-myday-allowance-subscribe
              onClick={onSubscribe}
              className="shrink-0 [&>span>div]:h-10 [&>span>div]:px-4 [&_span]:text-xs [&_span]:font-semibold"
            >
              Go unlimited
            </GlassButton>
          )}
        </div>
      </GlassSurface>
    </section>
  );
}
