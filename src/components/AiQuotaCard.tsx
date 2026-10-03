import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  Coins,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { GlassSurface } from "./ui/glass";
import { GlassButton } from "./ui/glass-button";
import { defaultCatalogAiSettings, type CatalogAiSettings } from "../revision/engine/aiConfig";
import { fetchRemoteCatalog } from "../revision/engine/catalogService";
import {
  computeUsageSnapshot,
  emptyUsage,
  refreshAiUsageStatus,
  subscribeAiUsage,
  type AiUsageSnapshot,
} from "../revision/engine/aiUsage";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/** Compact token count: 2000000 -> "2M". Full precision stays in the title attr. */
function tokensFmt(value: number): string {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

function formatCycle(cycle: AiUsageSnapshot["cycle"]): string {
  return cycle === "yearly" ? "Yearly" : "Monthly";
}

function Bar({ used, limit, unlimited, tone }: { used: number; limit: number; unlimited: boolean; tone: string }) {
  const pct = unlimited || limit <= 0 ? 8 : Math.max(4, Math.min(100, Math.round(((limit - used) / limit) * 100)));
  const usedPct = unlimited ? 8 : Math.max(0, Math.min(100, Math.round((used / Math.max(1, limit)) * 100)));
  return (
    <div className="dc-profile-bar mt-2.5">
      <div
        data-ai-quota-bar
        className={`h-full rounded-full transition-all duration-500 ${tone}`}
        style={{ width: `${unlimited ? usedPct || 8 : pct}%` }}
      />
    </div>
  );
}

export default function AiQuotaCard({
  uid,
  material = "store",
  compact = false,
}: {
  uid: string;
  /** `store` = the Revision Profile page's card (unchanged default);
   *  `cart` = the Cart empty-state card's bare surface (radius 32);
   *  `home` = the navy Home/account contrast plate at the pinned docs
   *  sensitivity, used by the Usage Limits page. */
  material?: "store" | "cart" | "home";
  /** Compact summary mode: drops the long explanation paragraph and the
   *  last-request detail lines so the card is the numbers, not the essay. */
  compact?: boolean;
}) {
  const cartGlass = material === "cart";
  const homeGlass = material === "home";
  const [settings, setSettings] = useState<CatalogAiSettings>(defaultCatalogAiSettings);
  const [record, setRecord] = useState(() => emptyUsage(uid));
  const [recordAvailable, setRecordAvailable] = useState(false);
  const [serverSnapshot, setServerSnapshot] = useState<AiUsageSnapshot | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const serverSnapshotAt = useRef(0);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const snapshot = await refreshAiUsageStatus();
      serverSnapshotAt.current = Date.now();
      setServerSnapshot(snapshot);
      setSyncError(null);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not refresh AI allowance.");
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void fetchRemoteCatalog().then((catalog) => {
      if (catalog?.aiSettings) setSettings(catalog.aiSettings);
    });
  }, []);

  useEffect(() => {
    setRecord(emptyUsage(uid));
    setRecordAvailable(false);
    setServerSnapshot(null);
    setSyncError(null);
    serverSnapshotAt.current = 0;

    const unsub = subscribeAiUsage(uid, (next, state) => {
      setRecord(next);
      setRecordAvailable(state.exists);
      if (state.error) setSyncError((current) => current || "Live allowance updates are temporarily unavailable.");
      if (state.exists && next.updatedAt > serverSnapshotAt.current) setServerSnapshot(null);
    });
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    void refresh();
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [refresh, uid]);

  const localSnapshot = useMemo(
    () => computeUsageSnapshot(record, settings, now),
    [record, settings, now],
  );
  const snap = serverSnapshot ?? localSnapshot;
  const hasAuthoritativeSnapshot = serverSnapshot !== null || recordAvailable;

  useEffect(() => {
    if (!hasAuthoritativeSnapshot) return undefined;
    const candidates = [
      !snap.dailyUnlimited ? snap.dailyResetsAt : 0,
      !snap.windowUnlimited && snap.windowUsed > 0 ? snap.windowResetsAt : 0,
      snap.termEndsAt,
    ].filter((value) => value > Date.now());
    if (!candidates.length) return undefined;
    const nextReset = Math.min(...candidates);
    const delay = Math.min(2_147_000_000, Math.max(1_000, nextReset - Date.now() + 1_000));
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      void refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hasAuthoritativeSnapshot, refresh, snap.dailyResetsAt, snap.dailyUnlimited, snap.termEndsAt, snap.windowResetsAt, snap.windowUnlimited, snap.windowUsed]);

  const tokensLeftLabel = snap.tokensUnlimited
    ? "Unlimited"
    : `${tokensFmt(Math.max(0, snap.dailyTokenBudget - snap.tokensUsedDay))} left`;
  const tokensResetIn = snap.tokensResetsAt > now ? formatCountdown(snap.tokensResetsAt - now) : "now";
  const dailyLeftLabel = snap.dailyUnlimited ? "Unlimited" : `${snap.dailyRemaining} left`;
  const windowLeftLabel = snap.windowUnlimited ? "Unlimited" : `${snap.windowRemaining} left`;
  const windowResetIn = snap.windowResetsAt > now ? formatCountdown(snap.windowResetsAt - now) : "now";
  const dailyResetIn = snap.dailyResetsAt > now ? formatCountdown(snap.dailyResetsAt - now) : "now";
  const badgeLabel = !hasAuthoritativeSnapshot
    ? syncing ? "Syncing" : "Unavailable"
    : snap.allowed ? "Available" : "Paused";
  const badgeTone = !hasAuthoritativeSnapshot
    ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/30"
    : snap.allowed ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30" : "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30";

  return (
    <GlassSurface
      data-ai-quota-card
      aria-live="polite"
      radius={cartGlass ? 32 : 24}
      tint={homeGlass ? 0.25 : cartGlass ? 0.5 : 0.62}
      tintColor={homeGlass || cartGlass ? undefined : "173,216,255"}
      blur={homeGlass ? 0 : cartGlass ? 14 : 0}
      className={
        cartGlass
          ? "text-white"
          : homeGlass
            ? "dc-scene-plate dc-profile-card relative text-white"
            : "dc-glass-card dc-store-glass dc-scene-ink relative text-white"
      }
      contentClassName={compact ? "p-4" : homeGlass ? "flex h-full flex-col justify-between p-4 sm:p-5 lg:p-6" : "p-5 lg:p-3.5"}
    >
      <div className="relative">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={homeGlass ? "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/35" : "grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-400/30 lg:h-9 lg:w-9 lg:rounded-xl"}>
              <Sparkles className={homeGlass ? "h-5 w-5" : "h-6 w-6 lg:h-4 lg:w-4"} />
            </div>
            <div className="min-w-0">
              <p className={homeGlass ? "dc-profile-card-accent uppercase tracking-wider" : "text-[10px] font-black uppercase tracking-[0.16em] text-indigo-300"}>School AI allowance</p>
              <h3 className={homeGlass ? "dc-profile-card-title mt-0.5 truncate text-base font-bold text-white" : cartGlass ? "mt-1 truncate text-lg font-bold text-white" : "mt-1 truncate text-lg font-black text-white"}>
                {hasAuthoritativeSnapshot
                  ? `${snap.planName} · ${snap.planId === "free" ? "No billing cycle" : `${formatCycle(snap.cycle)} billing`}`
                  : "Checking your effective plan…"}
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <GlassButton
              data-ai-quota-refresh
              aria-label="Refresh AI allowance"
              disabled={syncing}
              onClick={() => void refresh()}
              className="disabled:opacity-50 [&_.size-12]:size-8 [&_svg]:text-violet-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            </GlassButton>
            <span data-ai-quota-sync={badgeLabel.toLowerCase()} className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badgeTone}`}>
              {badgeLabel}
            </span>
          </div>
        </div>

        {/* Telemetry Body */}
        {!hasAuthoritativeSnapshot ? (
          <div className="dc-profile-subpanel mt-4 p-4" role="status">
            {syncing ? (
              <div className="space-y-3">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-violet-500/25" />
                <div className="h-2.5 animate-pulse rounded-full bg-indigo-500/20" />
                <p className="text-xs font-semibold text-white/55">Loading used, remaining and reset information from the server…</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-xs font-bold">Allowance could not be verified</p>
                  <p className="mt-1 text-[11px] leading-5">{syncError || "Please retry. No client-side fallback will be shown as real usage."}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {snap.tokensEnabled && (
              <div className="dc-profile-subpanel mt-4 p-4">
                <div className="dc-profile-card-meta flex items-center justify-between gap-2">
                  <span
                    className="font-semibold text-white/85"
                    title={`${snap.tokensUsedDay} of ${snap.dailyTokenBudget} tokens`}
                  >
                    AI tokens today · {snap.tokensUnlimited ? "no daily cap" : `${tokensFmt(snap.tokensUsedDay)} / ${tokensFmt(snap.dailyTokenBudget)} used`}
                  </span>
                  <span className="font-bold text-violet-200">{tokensLeftLabel}</span>
                </div>
                <Bar used={snap.tokensUsedDay} limit={snap.dailyTokenBudget} unlimited={snap.tokensUnlimited} tone="bg-violet-500" />
                {!snap.tokensUnlimited && (
                  <p className="dc-profile-card-meta mt-2.5 flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                    <span>Resets in {tokensResetIn} · {new Date(snap.tokensResetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</span>
                  </p>
                )}
                {record.lastUsage && !compact && (
                  <p className="dc-profile-card-meta mt-1.5 border-t border-white/[0.06] pt-2" data-ai-quota-last-usage>
                    Last request: {record.lastUsage.totalTokens.toLocaleString()} tokens ({record.lastUsage.usageSource}) · {record.lastUsage.model}
                  </p>
                )}
              </div>
            )}

            {!snap.tokensEnabled && (
              <div className="dc-profile-subpanel mt-4 p-4">
                <div className="dc-profile-card-meta flex items-center justify-between gap-2">
                  <span className="font-semibold text-white/85">
                    Today · {snap.dailyUnlimited ? "no daily cap" : `${snap.dailyUsed} / ${snap.dailyLimit} used`}
                  </span>
                  <span className="font-bold text-violet-200">{dailyLeftLabel}</span>
                </div>
                <Bar used={snap.dailyUsed} limit={snap.dailyLimit} unlimited={snap.dailyUnlimited} tone="bg-violet-500" />
                {!snap.dailyUnlimited && (
                  <p className="dc-profile-card-meta mt-2.5 flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 shrink-0 text-violet-300" />
                    <span>Resets in {dailyResetIn} · {new Date(snap.dailyResetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</span>
                  </p>
                )}
              </div>
            )}

            {!snap.tokensEnabled && (
              <div className="dc-profile-subpanel mt-3 p-3.5">
                <div className="dc-profile-card-meta flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white/85">
                    <Clock3 className="h-3.5 w-3.5 text-indigo-300" />
                    {snap.windowHours}-hour safety window · {snap.windowUnlimited ? "no cap" : `${snap.windowUsed} / ${snap.windowLimit} used`}
                  </span>
                  <span className="font-bold text-indigo-200">{windowLeftLabel}</span>
                </div>
                <Bar used={snap.windowUsed} limit={snap.windowLimit} unlimited={snap.windowUnlimited} tone="bg-indigo-500" />
                {!snap.windowUnlimited && snap.windowUsed > 0 && (
                  <p className="dc-profile-card-meta mt-2">Oldest use in this window frees in {windowResetIn}.</p>
                )}
              </div>
            )}

            {snap.costEnabled && (
              <div className="mt-3.5 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5">
                <div className="dc-profile-card-meta flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white/85">
                    <Coins className="h-3.5 w-3.5 text-amber-300" />
                    Model cost this term · {snap.costUnlimited ? "no cap" : `$${(snap.costUsedMicros / 1_000_000).toFixed(4)} / $${(snap.costBudgetMicros / 1_000_000).toFixed(2)}`}
                  </span>
                  <span className="font-bold text-amber-200">{snap.costUnlimited ? "Unlimited" : `$${(snap.costRemainingMicros / 1_000_000).toFixed(4)} left`}</span>
                </div>
                <Bar used={snap.costUsedMicros} limit={snap.costBudgetMicros} unlimited={snap.costUnlimited} tone="bg-amber-500" />
                {snap.termEndsAt > now && <p className="dc-profile-card-meta mt-2">Budget term ends {new Date(snap.termEndsAt).toLocaleDateString()}.</p>}
                {record.lastUsage && !compact && (
                  <p className="dc-profile-card-meta mt-1.5">
                    Last test: {record.lastUsage.totalTokens.toLocaleString()} tokens ({record.lastUsage.usageSource}) · {record.lastUsage.model} · ${(record.lastUsage.actualCostMicros / 1_000_000).toFixed(4)}
                  </p>
                )}
              </div>
            )}

            {/* 2-Column AI Scope Breakdown */}
            {!compact && (
              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <div className="dc-profile-subpanel flex items-start gap-2.5 p-3">
                  <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <div className="min-w-0">
                    <span className="dc-profile-card-title block truncate text-xs">Covered Tools</span>
                    <span className="dc-profile-card-meta mt-0.5 block">Revision &amp; Roman AI</span>
                  </div>
                </div>
                <div className="dc-profile-subpanel flex items-start gap-2.5 p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <div className="min-w-0">
                    <span className="dc-profile-card-title block truncate text-xs">Fair-Use Meter</span>
                    <span className="dc-profile-card-meta mt-0.5 block">Failed calls aren’t billed</span>
                  </div>
                </div>
              </div>
            )}

            {snap.blockedReason ? (
              <p className="mt-3.5 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-3.5 py-2.5 text-xs font-semibold leading-5 text-rose-200">{snap.blockedReason}</p>
            ) : compact ? null : (
              <p className="dc-profile-card-meta mt-3">
                {snap.tokensEnabled
                  ? "Tokens are counted from the provider's own usage report for every school-AI request you make — Revision tests and Roman AI Pro alike. Failed or incomplete requests are not charged, and the budget resets at midnight your local time."
                  : "One complete school-AI test uses one generation. Provider failure, incomplete output and your own API key do not use this allowance."}
              </p>
            )}
          </>
        )}

        {syncError && hasAuthoritativeSnapshot && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Last verified data is shown. {syncError}
          </p>
        )}
      </div>

      {/* Footer Quick Actions when rendered on Usage Limits */}
      {homeGlass && !compact ? (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-white/[0.08] pt-3.5 sm:flex-nowrap">
          <button
            type="button"
            onClick={() => { window.location.hash = "#/revision"; }}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 active:scale-[0.99]"
          >
            <span>Open Revision Hub</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <GlassButton
            variant="capsule"
            type="button"
            onClick={() => { window.location.hash = "#/revision/ai-settings"; }}
            className="shrink-0 [&>span>div]:h-10 [&>span>div]:px-4 [&_span]:text-xs [&_span]:font-semibold"
          >
            AI settings
          </GlassButton>
        </div>
      ) : null}
    </GlassSurface>
  );
}
