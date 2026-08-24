// Revision profile — redesigned to match the app's glass / aurora language.
//
// The page is a launchpad, not a settings dump:
//   1. A branded hero greeting + quick snapshot of the learner's progress.
//   2. "Create" — Generate Questions with AI (the primary action) + Bulk Import.
//   3. "Configure" — AI configuration (provider / model / key).
//   4. The live school-AI allowance card.
// Everything keeps the opaque/stable card surface so nothing flashes while
// the allowance or snapshot data refreshes in place.

import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { PrimaryButton } from "../components/ui";
import {
  BookOpenIcon,
  ChevronRightIcon,
  ChartIcon,
  FlameIcon,
  GearIcon,
  SparklesIcon,
  TrophyIcon,
} from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getRevisionOverview } from "../engine/statsService";
import AiQuotaCard from "../../components/AiQuotaCard";

export default function RevisionProfilePage({ uid, route, userName }: { uid: string; route: string; userName: string }) {
  const { navigate } = useExitGuard();
  const dashboard = useMemo(() => getRevisionOverview(uid), [uid]);

  return (
    <PageShell route={route} title="Profile" mergeIntoMainHeader>
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        {/* Branded hero */}
        <section className="dc-glass-hero relative overflow-hidden rounded-[2rem] p-5 text-white">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-cyan-300/20 blur-2xl" />
          <div className="relative">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-100/80">Revision Studio</p>
            <h2 className="mt-1.5 text-2xl font-extrabold leading-tight">Hi {userName}</h2>
            <p className="mt-1 text-xs leading-relaxed text-violet-50/90">
              Build focused revision plans, connect AI and track how you are improving.
            </p>
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-generate")}
              className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-violet-700 shadow-lg shadow-violet-950/20 transition active:scale-[0.98]"
            >
              <SparklesIcon className="h-5 w-5" /> Generate Questions with AI
            </button>
          </div>
        </section>

        {/* Quick snapshot */}
        <section>
          <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Snapshot</h3>
          <div className="grid grid-cols-3 gap-2.5">
            <WidgetCard
              icon={<ChartIcon className="h-5 w-5 text-emerald-600" />}
              label="Accuracy"
              value={`${dashboard.quickStats.overallAccuracy}%`}
            />
            <WidgetCard
              icon={<TrophyIcon className="h-5 w-5 text-amber-600" />}
              label="Tests done"
              value={dashboard.quickStats.testsCompleted}
            />
            <WidgetCard
              icon={<FlameIcon className="h-5 w-5 text-orange-600" />}
              label="Streak"
              value={`${dashboard.quickStats.streak}d`}
            />
          </div>
        </section>

        {/* Configure AI */}
        <section>
          <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Configure AI</h3>
          <button
            type="button"
            onClick={() => navigate("#/revision/ai-settings")}
            className="group relative w-full overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-4 text-left shadow-[0_20px_40px_-26px_rgba(79,70,229,0.55)] backdrop-blur-xl transition active:scale-[0.98]"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-violet-300/30 blur-xl" />
            <div className="relative flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                <GearIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">AI Configuration</h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Connect Gemini, ChatGPT, Claude, Groq & more
                </p>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-slate-400 transition group-active:translate-x-0.5" />
            </div>
          </button>
        </section>

        {/* AI allowance */}
        <AiQuotaCard uid={uid} />

        {/* Bulk import */}
        <section>
          <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Import</h3>
          <button
            type="button"
            onClick={() => navigate("#/revision/bulk-import")}
            className="flex w-full items-center gap-3 rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 text-left shadow-[0_1px_3px_rgba(15,23,42,0.07),0_8px_20px_-10px_rgba(15,23,42,0.12)] transition active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <BookOpenIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">Bulk Import Questions</span>
              <span className="block text-xs text-slate-600">
                Paste questions as plain text — a new test is created directly
              </span>
            </span>
            <ChevronRightIcon className="h-5 w-5 text-slate-400" />
          </button>
        </section>

        <PrimaryButton onClick={() => navigate("#/revision")}>Go to Revision Dashboard</PrimaryButton>
      </div>
    </PageShell>
  );
}

function WidgetCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    // Stable opaque surface (no backdrop-filter) so the snapshot cards never
    // show a white-flash glitch while scrolling or when the allowance card
    // refreshes alongside them.
    <div className="rev-card flex flex-col items-center gap-1 rounded-2xl py-3 text-center">
      {icon}
      <span className="text-base font-bold text-slate-900">{value}</span>
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  );
}
