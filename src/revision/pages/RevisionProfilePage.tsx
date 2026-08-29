// Revision profile — optimized for desktop/tablet, compact, no empty space
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
      <div data-revision-profile-layout className="animate-fade-in space-y-4 px-4 py-4 pb-8 lg:space-y-0 lg:grid lg:grid-cols-12 lg:gap-3 lg:px-0 lg:py-0 lg:pb-0 lg:max-w-[1200px] lg:mx-auto">
        {/* Branded hero - full width */}
        <section className="dc-glass-hero relative overflow-hidden rounded-[2rem] p-5 text-white lg:col-span-12 lg:rounded-2xl lg:p-4">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-cyan-300/20 blur-2xl" />
          <div className="relative lg:flex lg:items-center lg:justify-between lg:gap-4">
            <div className="lg:flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-100/80 lg:text-[10px]">Revision Studio</p>
              <h2 className="mt-1.5 text-2xl font-extrabold leading-tight lg:text-xl">Hi {userName}</h2>
              <p className="mt-1 text-xs leading-relaxed text-violet-50/90 lg:text-[11px] lg:mt-0.5">
                Build focused revision plans, connect AI and track how you are improving.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-generate")}
              className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-violet-700 shadow-lg shadow-violet-950/20 transition active:scale-[0.98] lg:mt-0 lg:min-h-[40px] lg:w-auto lg:px-5 lg:text-[13px] lg:rounded-xl"
            >
              <SparklesIcon className="h-5 w-5 lg:h-4 lg:w-4" /> Generate Questions with AI
            </button>
          </div>
        </section>

        {/* LEFT COL: Snapshot + Configure */}
        <div className="space-y-4 lg:col-span-4 lg:space-y-3" data-rev-col="left">
          <section>
            <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500 lg:text-[11px] lg:mb-1.5">Snapshot</h3>
            <div data-rev-widget-grid className="grid grid-cols-3 gap-2.5 lg:gap-2">
              <WidgetCard
                icon={<ChartIcon className="h-5 w-5 text-emerald-600 lg:h-4 lg:w-4" />}
                label="Accuracy"
                value={`${dashboard.quickStats.overallAccuracy}%`}
              />
              <WidgetCard
                icon={<TrophyIcon className="h-5 w-5 text-amber-600 lg:h-4 lg:w-4" />}
                label="Tests done"
                value={dashboard.quickStats.testsCompleted}
              />
              <WidgetCard
                icon={<FlameIcon className="h-5 w-5 text-orange-600 lg:h-4 lg:w-4" />}
                label="Streak"
                value={`${dashboard.quickStats.streak}d`}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500 lg:text-[11px] lg:mb-1.5">Configure AI</h3>
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-settings")}
              className="group relative w-full overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-4 text-left shadow-[0_20px_40px_-26px_rgba(79,70,229,0.55)] backdrop-blur-xl transition active:scale-[0.98] lg:rounded-2xl lg:p-3 lg:shadow-sm"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-violet-300/30 blur-xl" />
              <div className="relative flex items-center gap-4 lg:gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm lg:h-9 lg:w-9 lg:rounded-xl">
                  <GearIcon className="h-6 w-6 lg:h-5 lg:w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 lg:text-[13px]">AI Configuration</h3>
                  <p className="mt-0.5 text-[11px] text-slate-600 lg:text-[10px]">
                    Connect Gemini, ChatGPT, Claude, Groq & more
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-slate-400 transition group-active:translate-x-0.5 lg:h-4 lg:w-4" />
              </div>
            </button>
          </section>

          <section>
            <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500 lg:text-[11px] lg:mb-1.5">Import</h3>
            <button
              type="button"
              onClick={() => navigate("#/revision/bulk-import")}
              className="flex w-full items-center gap-3 rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 text-left shadow-[0_1px_3px_rgba(15,23,42,0.07),0_8px_20px_-10px_rgba(15,23,42,0.12)] transition active:scale-[0.98] lg:rounded-2xl lg:p-3 lg:shadow-sm"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm lg:h-9 lg:w-9 lg:rounded-xl">
                <BookOpenIcon className="h-6 w-6 lg:h-5 lg:w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900 lg:text-[13px]">Bulk Import Questions</span>
                <span className="block text-xs text-slate-600 lg:text-[11px]">
                  Paste questions as plain text — a new test is created directly
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 text-slate-400 lg:h-4 lg:w-4" />
            </button>
          </section>
        </div>

        {/* MIDDLE COL: AI allowance */}
        <div className="space-y-4 lg:col-span-5 lg:space-y-3" data-rev-col="middle">
          <AiQuotaCard uid={uid} />
          <PrimaryButton onClick={() => navigate("#/revision")} className="lg:min-h-[40px] lg:text-[13px] lg:rounded-xl">Go to Revision Dashboard</PrimaryButton>
        </div>

        {/* RIGHT COL: Quick actions / info - secondary info flows below primary
            on compact / split viewports and joins the desktop 12-col grid on wide
            content. */}
        <div className="flex lg:col-span-3 lg:flex-col lg:gap-3" data-rev-col="right">
          <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-slate-500">Quick Tips</h3>
            <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-600">
              <li className="flex gap-2"><span className="text-violet-600">•</span> Generate AI tests from exact topics for focused revision</li>
              <li className="flex gap-2"><span className="text-violet-600">•</span> Import past papers as plain text - auto-parsed</li>
              <li className="flex gap-2"><span className="text-violet-600">•</span> Track accuracy & streak in Progress</li>
            </ul>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function WidgetCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rev-card flex flex-col items-center gap-1 rounded-2xl py-3 text-center lg:rounded-xl lg:py-2.5 lg:gap-0.5 lg:shadow-sm">
      {icon}
      <span className="text-base font-bold text-slate-900 lg:text-sm">{value}</span>
      <span className="text-[10px] font-medium text-slate-500 lg:text-[9px]">{label}</span>
    </div>
  );
}
