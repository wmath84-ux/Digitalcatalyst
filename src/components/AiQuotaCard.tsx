import { useEffect, useMemo, useState } from "react";
import { Clock3, Sparkles } from "lucide-react";
import { defaultCatalogAiSettings, type CatalogAiSettings } from "../revision/engine/aiConfig";
import { fetchRemoteCatalog } from "../revision/engine/catalogService";
import {
  computeUsageSnapshot,
  emptyUsage,
  subscribeAiUsage,
  type AiUsageSnapshot,
} from "../revision/engine/aiUsage";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Bar({ used, limit, unlimited, tone }: { used: number; limit: number; unlimited: boolean; tone: string }) {
  const pct = unlimited || limit <= 0 ? 8 : Math.max(4, Math.min(100, Math.round(((limit - used) / limit) * 100)));
  const usedPct = unlimited ? 8 : Math.max(0, Math.min(100, Math.round((used / Math.max(1, limit)) * 100)));
  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void fetchRemoteCatalog().then((c) => {
      if (c?.aiSettings) setSettings(c.aiSettings);
    });
  }, []);

  useEffect(() => {
    const unsub = subscribeAiUsage(uid, setRecord);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [uid]);

  const snap: AiUsageSnapshot = useMemo(() => computeUsageSnapshot(record, settings, now), [record, settings, now]);
  const dailyLeftLabel = snap.dailyUnlimited ? "Unlimited" : `${snap.dailyRemaining} left`;
  const windowLeftLabel = snap.windowUnlimited ? "Unlimited" : `${snap.windowRemaining} left`;
  const resetIn = snap.windowResetsAt > now ? formatCountdown(snap.windowResetsAt - now) : "now";

  return (
    <section data-ai-quota-card className="relative overflow-hidden rounded-[2rem] border border-violet-100 bg-gradient-to-br from-white via-violet-50 to-indigo-50 p-5 shadow-sm">
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-violet-200/40" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-100 text-violet-700">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">School AI allowance</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">AI usage limits</h3>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${snap.allowed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {snap.allowed ? "Available" : "Paused"}
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>Today · {snap.dailyUnlimited ? "no daily cap" : `${snap.dailyUsed} / ${snap.dailyLimit} used`}</span>
            <span className="text-violet-700">{dailyLeftLabel}</span>
          </div>
          <Bar used={snap.dailyUsed} limit={snap.dailyLimit} unlimited={snap.dailyUnlimited} tone="bg-violet-500" />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {snap.windowHours}-hour window · {snap.windowUnlimited ? "no cap" : `${snap.windowUsed} / ${snap.windowLimit} used`}
            </span>
            <span className="text-indigo-700">{windowLeftLabel}</span>
          </div>
          <Bar used={snap.windowUsed} limit={snap.windowLimit} unlimited={snap.windowUnlimited} tone="bg-indigo-500" />
          {!snap.windowUnlimited && snap.windowUsed > 0 && (
            <p className="mt-1.5 text-[11px] font-semibold text-slate-400">Oldest use in this window frees in {resetIn}.</p>
          )}
        </div>

        {snap.blockedReason ? (
          <p className="mt-4 rounded-2xl bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-5 text-rose-700">{snap.blockedReason}</p>
        ) : (
          <p className="mt-4 text-xs leading-5 text-slate-600">
            Limits are set by your school for everyone. Progress updates live as you generate questions.
          </p>
        )}
      </div>
    </section>
  );
}
