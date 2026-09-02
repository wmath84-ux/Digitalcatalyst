// Revision profile — optimized for desktop/tablet, compact, no empty space
import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { PrimaryButton, SecondaryButton } from "../components/ui";
import { GlassSurface } from "../../components/ui/glass";
import { GlassCard } from "../../components/ui/glass-card";
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
        {/* Phase A4: the hero is the pack GlassSurface at defaults; `dc-glass-hero`
            stays as a hook only (it paints nothing under the pack surface). */}
        <GlassSurface className="dc-glass-hero relative overflow-hidden text-white lg:col-span-12" contentClassName="p-5 lg:p-4">
          <div className="relative lg:flex lg:items-center lg:justify-between lg:gap-4">
            <div className="lg:flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-100/80 lg:text-[10px]">Revision Studio</p>
              <h2 className="mt-1.5 text-2xl font-extrabold leading-tight lg:text-xl">Hi {userName}</h2>
              <p className="mt-1 text-xs leading-relaxed text-violet-50/90 lg:text-[11px] lg:mt-0.5">
                Build focused revision plans, connect AI and track how you are improving.
              </p>
            </div>
            <SecondaryButton onClick={() => navigate("#/revision/ai-generate")} className="mt-4 lg:mt-0 lg:w-auto">
              <SparklesIcon className="h-5 w-5 lg:h-4 lg:w-4" /> Generate Questions with AI
            </SecondaryButton>
          </div>
        </GlassSurface>

        {/* LEFT COL: Snapshot + Configure */}
        <div className="space-y-4 lg:col-span-4 lg:space-y-3" data-rev-col="left">
          <section>
            <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-white/55 lg:text-[11px] lg:mb-1.5">Snapshot</h3>
            <div data-rev-widget-grid className="grid grid-cols-3 gap-2.5 lg:gap-2">
              <WidgetCard
                icon={<ChartIcon className="h-5 w-5 text-emerald-300 lg:h-4 lg:w-4" />}
                label="Accuracy"
                value={`${dashboard.quickStats.overallAccuracy}%`}
              />
              <WidgetCard
                icon={<TrophyIcon className="h-5 w-5 text-amber-300 lg:h-4 lg:w-4" />}
                label="Tests done"
                value={dashboard.quickStats.testsCompleted}
              />
              <WidgetCard
                icon={<FlameIcon className="h-5 w-5 text-orange-300 lg:h-4 lg:w-4" />}
                label="Streak"
                value={`${dashboard.quickStats.streak}d`}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-white/55 lg:text-[11px] lg:mb-1.5">Configure AI</h3>
            <GlassCard
              role="button"
              tabIndex={0}
              onClick={() => navigate("#/revision/ai-settings")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("#/revision/ai-settings"); }}
              className="group relative w-full cursor-pointer overflow-hidden text-left transition active:scale-[0.98] [&>div:last-child]:p-4 lg:[&>div:last-child]:p-3"
            >
              <div className="relative flex items-center gap-4 lg:gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white lg:h-9 lg:w-9 lg:rounded-xl">
                  <GearIcon className="h-6 w-6 lg:h-5 lg:w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-white lg:text-[13px]">AI Configuration</h3>
                  <p className="mt-0.5 text-[11px] text-white/75 lg:text-[10px]">
                    Connect Gemini, ChatGPT, Claude, Groq & more
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-white/55 transition group-active:translate-x-0.5 lg:h-4 lg:w-4" />
              </div>
            </GlassCard>
          </section>

          <section>
            <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-white/55 lg:text-[11px] lg:mb-1.5">Import</h3>
            <GlassCard
              role="button"
              tabIndex={0}
              onClick={() => navigate("#/revision/bulk-import")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("#/revision/bulk-import"); }}
              className="w-full cursor-pointer text-left transition active:scale-[0.98] [&>div:last-child]:flex [&>div:last-child]:items-center [&>div:last-child]:gap-3 [&>div:last-child]:p-4 lg:[&>div:last-child]:p-3"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white lg:h-9 lg:w-9 lg:rounded-xl">
                <BookOpenIcon className="h-6 w-6 lg:h-5 lg:w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white lg:text-[13px]">Bulk Import Questions</span>
                <span className="block text-xs text-white/75 lg:text-[11px]">
                  Paste questions as plain text — a new test is created directly
                </span>
              </span>
              <ChevronRightIcon className="h-5 w-5 text-white/55 lg:h-4 lg:w-4" />
            </GlassCard>
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
          <GlassCard className="w-full [&>div:last-child]:p-4">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-white/55">Quick Tips</h3>
            <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-white/75">
              <li className="flex gap-2"><span className="text-violet-300">•</span> Generate AI tests from exact topics for focused revision</li>
              <li className="flex gap-2"><span className="text-violet-300">•</span> Import past papers as plain text - auto-parsed</li>
              <li className="flex gap-2"><span className="text-violet-300">•</span> Track accuracy & streak in Progress</li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}

function WidgetCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <GlassSurface tint={0.4} radius={20} className="rev-card text-white" contentClassName="flex flex-col items-center gap-1 rounded-2xl py-3 text-center lg:rounded-xl lg:py-2.5 lg:gap-0.5">
      {icon}
      <span className="text-base font-bold text-white lg:text-sm">{value}</span>
      <span className="text-[10px] font-medium text-white/55 lg:text-[9px]">{label}</span>
    </GlassSurface>
  );
}
