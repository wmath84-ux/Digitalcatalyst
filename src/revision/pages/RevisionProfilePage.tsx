// Revision profile — redesigned.
//
// Exactly two customization options, both user-facing:
//   1. AI Configuration    — only AI provider/model/key settings, nothing else.
//   2. AI Test Generator   — class/subject/chapter/topic → generate an exam.
// Plus the bulk importer (moved here from the admin panel) so users can turn
// pasted questions into a new test directly.

import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { PrimaryButton } from "../components/ui";
import {
  BookOpenIcon,
  ChartIcon,
  ChevronRightIcon,
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
        {/* The two customization options */}
        <div>
          <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">
            Customization
          </h3>
          <div className="space-y-3">
            {/* Option 1 — AI Configuration (only AI config, nothing else).
                Uses the website brand gradient (indigo → violet) with a soft
                glassmorphism wash and a deep branded shadow. */}
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-settings")}
              className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-left shadow-[0_24px_50px_-20px_rgba(79,70,229,0.65)] ring-1 ring-white/30 backdrop-blur transition-all active:scale-[0.98]"
            >
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-white/5" />
              <div className="relative flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                  <GearIcon className="h-7 w-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white">AI Configuration</h3>
                  <p className="mt-0.5 text-xs text-purple-100">
                    Connect your own AI — Gemini, ChatGPT, Claude, Groq & more
                  </p>
                </div>
                <ChevronRightIcon className="h-6 w-6 text-white/70" />
              </div>
            </button>

            {/* Option 2 — AI Test Generator. Matches the website brand
                (indigo → violet) with glassmorphism + a deep branded shadow. */}
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-generate")}
              className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 p-5 text-left shadow-[0_24px_50px_-20px_rgba(124,58,237,0.6)] ring-1 ring-white/30 backdrop-blur transition-all active:scale-[0.98]"
            >
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-white/5" />
              <div className="relative flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                  <SparklesIcon className="h-7 w-7 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white">Generate Questions with AI</h3>
                  <p className="mt-0.5 text-xs text-indigo-100">
                    Pick class, subject, chapter & topic — get a ready exam
                  </p>
                </div>
                <ChevronRightIcon className="h-6 w-6 text-white/70" />
              </div>
              <div className="relative mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Class</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Subject</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Chapter</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Topic</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Difficulty</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Question type</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Questions & time</span>
              </div>
            </button>
          </div>
        </div>

        <AiQuotaCard uid={uid} />

        {/* Bulk import — moved from the admin panel */}
        <div>
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
        </div>

        {/* Quick snapshot */}
        <div>
          <h3 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">Snapshot</h3>
          <div className="grid grid-cols-3 gap-3">
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
        </div>

        <PrimaryButton onClick={() => navigate("#/revision")}>Go to Dashboard</PrimaryButton>
      </div>
    </PageShell>
  );
}

function WidgetCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    // Stable opaque surface (no backdrop-filter) so the snapshot cards below
    // the Import section never show a white-flash glitch while scrolling.
    <div className="rev-card flex flex-col items-center gap-1 rounded-2xl py-3 text-center">
      {icon}
      <span className="text-base font-bold text-slate-900">{value}</span>
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  );
}
