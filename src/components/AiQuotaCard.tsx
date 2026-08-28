import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Clock3, Coins, RefreshCw, Sparkles } from "lucide-react";
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

function formatCycle(cycle: AiUsageSnapshot["cycle"]): string {
  return cycle === "yearly" ? "Yearly" : "Monthly";
}

function Bar({ used, limit, unlimited, tone }: { used: number; limit: number; unlimited: boolean; tone: string }) {
  const pct = unlimited || limit <= 0 ? 8 : Math.max(4, Math.min(100, Math.round(((limit - used) / limit) * 100)));
  const usedPct = unlimited ? 8 : Math.max(0, Math.min(100, Math.round((used / Math.max(1, limit)) * 100)));
  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70">
      <div
        data-ai-quota-bar
        className={`h-full rounded-full transition-all duration-500 ${tone}`}
        style={{ width: `${unlimited ? usedPct || 8 : pct}%` }}
      />
    </div>
  );
}

export default function AiQuotaCard({ uid }: { uid: string }) {
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
      // A later completion transaction supersedes the one-off API snapshot.
      // Normal Firestore delivery then keeps the card live without polling.
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

  const dailyLeftLabel = snap.dailyUnlimited ? "Unlimited" : `${snap.dailyRemaining} left`;
  const windowLeftLabel = snap.windowUnlimited ? "Unlimited" : `${snap.windowRemaining} left`;
  const windowResetIn = snap.windowResetsAt > now ? formatCountdown(snap.windowResetsAt - now) : "now";
  const dailyResetIn = snap.dailyResetsAt > now ? formatCountdown(snap.dailyResetsAt - now) : "now";
  const badgeLabel = !hasAuthoritativeSnapshot
    ? syncing ? "Syncing" : "Unavailable"
    : snap.allowed ? "Available" : "Paused";
  const badgeTone = !hasAuthoritativeSnapshot
    ? "bg-amber-100 text-amber-700"
    : snap.allowed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700";

  return (
    <section data-ai-quota-card aria-live="polite" className="relative rounded-3xl border border-slate-100 bg-white p-5 shadow-[0_14px_40px_-24px_rgba(49,46,129,0.35)] lg:rounded-2xl lg:p-3.5 lg:shadow-sm">
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 lg:h-9 lg:w-9 lg:rounded-xl">
              <Sparkles className="h-6 w-6 lg:h-4 lg:w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">School AI allowance</p>
              <h3 className="mt-1 truncate text-lg font-black text-slate-950">
                {hasAuthoritativeSnapshot
                  ? `${snap.planName} · ${snap.planId === "free" ? "No billing cycle" : `${formatCycle(snap.cycle)} billing`}`
                  : "Checking your effective plan…"}
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-ai-quota-refresh
              aria-label="Refresh AI allowance"
              disabled={syncing}
              onClick={() => void refresh()}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-violet-600 shadow-sm transition hover:bg-violet-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            </button>
            <span data-ai-quota-sync={badgeLabel.toLowerCase()} className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${badgeTone}`}>
              {badgeLabel}
            </span>
          </div>
        </div>

        {!hasAuthoritativeSnapshot ? (
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4" role="status">
            {syncing ? (
              <div className="space-y-3">
                <div className="h-3 w-3/4 animate-pulse rounded-full bg-violet-100" />
                <div className="h-2.5 animate-pulse rounded-full bg-slate-200" />
                <p className="text-xs font-semibold text-slate-500">Loading used, remaining and reset information from the server…</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-amber-800">
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
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Today · {snap.dailyUnlimited ? "no daily cap" : `${snap.dailyUsed} / ${snap.dailyLimit} used`}</span>
                <span className="text-violet-700">{dailyLeftLabel}</span>
              </div>
              <Bar used={snap.dailyUsed} limit={snap.dailyLimit} unlimited={snap.dailyUnlimited} tone="bg-violet-500" />
              {!snap.dailyUnlimited && (
                <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                  Resets in {dailyResetIn} · {new Date(snap.dailyResetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {snap.windowHours}-hour safety window · {snap.windowUnlimited ? "no cap" : `${snap.windowUsed} / ${snap.windowLimit} used`}
                </span>
                <span className="text-indigo-700">{windowLeftLabel}</span>
              </div>
              <Bar used={snap.windowUsed} limit={snap.windowLimit} unlimited={snap.windowUnlimited} tone="bg-indigo-500" />
              {!snap.windowUnlimited && snap.windowUsed > 0 && (
                <p className="mt-1.5 text-[11px] font-semibold text-slate-400">Oldest use in this window frees in {windowResetIn}.</p>
              )}
            </div>

            {snap.costEnabled && (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Coins className="h-3.5 w-3.5 text-amber-600" />
                    Model cost this term · {snap.costUnlimited ? "no cap" : `$${(snap.costUsedMicros / 1_000_000).toFixed(4)} / $${(snap.costBudgetMicros / 1_000_000).toFixed(2)}`}
                  </span>
                  <span className="text-amber-700">{snap.costUnlimited ? "Unlimited" : `$${(snap.costRemainingMicros / 1_000_000).toFixed(4)} left`}</span>
                </div>
                <Bar used={snap.costUsedMicros} limit={snap.costBudgetMicros} unlimited={snap.costUnlimited} tone="bg-amber-500" />
                {snap.termEndsAt > now && <p className="mt-1.5 text-[11px] font-semibold text-slate-400">Budget term ends {new Date(snap.termEndsAt).toLocaleDateString()}.</p>}
                {record.lastUsage && (
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                    Last test: {record.lastUsage.totalTokens.toLocaleString()} tokens ({record.lastUsage.usageSource}) · {record.lastUsage.model} · ${(record.lastUsage.actualCostMicros / 1_000_000).toFixed(4)}
                  </p>
                )}
              </div>
            )}

            {snap.blockedReason ? (
              <p className="mt-4 rounded-2xl bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">{snap.blockedReason}</p>
            ) : (
              <p className="mt-4 text-xs leading-5 text-slate-600">
                One complete school-AI test uses one generation. Provider failure, incomplete output and your own API key do not use this allowance.
              </p>
            )}
          </>
        )}

        {syncError && hasAuthoritativeSnapshot && (
          <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-5 text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Last verified data is shown. {syncError}
          </p>
        )}
      </div>
    </section>
  );
}
