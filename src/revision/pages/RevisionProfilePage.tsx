// Revision profile — redesigned.
//
// Exactly two customization options, both user-facing:
//   1. AI Configuration    — only AI provider/model/key settings, nothing else.
//   2. AI Test Generator   — class/subject/chapter/topic → generate an exam.
// Plus the bulk importer (moved here from the admin panel) so users can turn
// pasted questions into a new test directly.

import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton } from "../components/ui";
import {
  BookOpenIcon,
  ChartIcon,
  ChevronRightIcon,
  FlameIcon,
  GearIcon,
  SparklesIcon,
  TrophyIcon,
  UserIcon,
} from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getRevisionOverview } from "../engine/statsService";
import AiQuotaCard from "../../components/AiQuotaCard";

export default function RevisionProfilePage({ uid, route, userName }: { uid: string; route: string; userName: string }) {
  const { navigate } = useExitGuard();
  const dashboard = useMemo(() => getRevisionOverview(uid), [uid]);

  return (
    <PageShell route={route} title="Profile">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        {/* Identity */}
        <Card className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <UserIcon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold text-slate-900">{userName}</h2>
            <p className="text-sm text-slate-500">Daily learner</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-orange-600">
              <FlameIcon className="h-3.5 w-3.5" /> {dashboard.quickStats.streak}-day streak
            </div>
          </div>
        </Card>

        {/* The two customization options */}
        <div>
          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
            Customization
          </h3>
          <div className="space-y-3">
            {/* Option 1 — AI Configuration (only AI config, nothing else) */}
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-settings")}
              className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-5 text-left shadow-lg shadow-purple-200 transition-all active:scale-[0.98]"
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

            {/* Option 2 — AI Test Generator */}
            <button
              type="button"
              onClick={() => navigate("#/revision/ai-generate")}
              className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-blue-600 p-5 text-left shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
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
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white">Questions & time</span>
              </div>
            </button>
          </div>
        </div>

        <AiQuotaCard uid={uid} />

        {/* Bulk import — moved from the admin panel */}
        <div>
          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Import</h3>
          <button
            type="button"
            onClick={() => navigate("#/revision/bulk-import")}
            className="flex w-full items-center gap-3 rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50 p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <BookOpenIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">Bulk Import Questions</span>
              <span className="block text-xs text-slate-500">
                Paste questions as plain text — a new test is created directly
              </span>
            </span>
            <ChevronRightIcon className="h-5 w-5 text-slate-300" />
          </button>
        </div>

        {/* Quick snapshot */}
        <div>
          <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400">Snapshot</h3>
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
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-slate-100 bg-white py-3 text-center shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      {icon}
      <span className="text-base font-bold text-slate-900">{value}</span>
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  );
}
