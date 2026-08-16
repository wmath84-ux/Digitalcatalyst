import { useState } from "react";
import PageShell from "../components/PageShell";
import { Card, PrimaryButton, ProgressBar } from "../components/ui";
import {
  BankIcon,
  ChartIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  SparklesIcon,
  TargetIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getDashboardData, type DashboardData } from "../engine/statsService";
import { startOrResumeAttempt } from "../engine/testService";

function trendIcon(trend: string) {
  if (trend === "improving") return <TrendUpIcon className="h-4 w-4 text-emerald-600" />;
  if (trend === "declining") return <TrendDownIcon className="h-4 w-4 text-rose-600" />;
  return null;
}

export default function DashboardPage({ uid, route, userName }: { uid: string; route: string; userName: string }) {
  const { navigate } = useExitGuard();
  const [starting, setStarting] = useState(false);
  const data = getDashboardData(uid);

  const handleStart = () => {
    setStarting(true);
    try {
      startOrResumeAttempt(uid);
      navigate("#/revision/test/play");
    } catch {
      // Already completed elsewhere — dashboard data will refresh on render.
    } finally {
      setStarting(false);
    }
  };

  return (
    <PageShell
      route={route}
      title="Daily 5"
      subtitle={`Hi ${userName}, ready to learn?`}
      rightSlot={
        data.quickStats.streak > 0 ? (
          <div className="flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1.5 text-orange-600">
            <FlameIcon className="h-4 w-4" />
            <span className="text-xs font-bold">{data.quickStats.streak}</span>
          </div>
        ) : undefined
      }
    >
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
        <TodayTestCard data={data} onStart={handleStart} starting={starting} />

        <div className="grid grid-cols-3 gap-3">
          <StatChip icon={<ChartIcon className="h-5 w-5 text-indigo-600" />} label="Tests Done" value={String(data.quickStats.testsCompleted)} />
          <StatChip icon={<TargetIcon className="h-5 w-5 text-emerald-600" />} label="Accuracy" value={`${data.quickStats.overallAccuracy}%`} />
          <StatChip icon={<FlameIcon className="h-5 w-5 text-orange-600" />} label="Streak" value={`${data.quickStats.streak}d`} />
        </div>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">Weak Topics</h2>
            <button
              type="button"
              onClick={() => navigate("#/revision/weak-topics")}
              className="text-xs font-semibold text-indigo-600"
            >
              View all
            </button>
          </div>
          {data.weakTopicSummary.length === 0 ? (
            <p className="text-sm text-slate-500">No weak topics yet — keep testing to build your profile.</p>
          ) : (
            <div className="space-y-3">
              {data.weakTopicSummary.map((t) => (
                <div key={t.topicId} className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg">
                    {t.subjectIcon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium text-slate-800">{t.topicName}</p>
                      <span className="ml-2 flex items-center gap-1 text-xs font-semibold text-slate-600">
                        {trendIcon(t.trend)}
                        {t.accuracy}%
                      </span>
                    </div>
                    <ProgressBar value={t.accuracy} className="mt-1.5" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-slate-900">Revision Bank</h2>
            <button
              type="button"
              onClick={() => navigate("#/revision/bank")}
              className="text-xs font-semibold text-indigo-600"
            >
              Open
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-amber-50 py-2.5">
              <p className="text-lg font-bold text-amber-700">{data.revisionBankSummary.learning}</p>
              <p className="text-[11px] font-medium text-amber-700">Learning</p>
            </div>
            <div className="rounded-2xl bg-sky-50 py-2.5">
              <p className="text-lg font-bold text-sky-700">{data.revisionBankSummary.improving}</p>
              <p className="text-[11px] font-medium text-sky-700">Improving</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 py-2.5">
              <p className="text-lg font-bold text-emerald-700">{data.revisionBankSummary.mastered}</p>
              <p className="text-[11px] font-medium text-emerald-700">Mastered</p>
            </div>
          </div>
          {data.revisionBankSummary.due > 0 ? (
            <PrimaryButton className="mt-3" onClick={() => navigate("#/revision/bank")}>
              <SparklesIcon className="h-4 w-4" /> Revise {data.revisionBankSummary.due} due question{data.revisionBankSummary.due === 1 ? "" : "s"}
            </PrimaryButton>
          ) : (
            <p className="mt-3 text-center text-xs text-slate-400">
              {data.revisionBankSummary.total === 0
                ? "Your revision bank is empty. Take a test to get started!"
                : "You're all caught up on revisions 🎉"}
            </p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-slate-100 bg-white py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      {icon}
      <span className="text-base font-bold text-slate-900">{value}</span>
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  );
}

function TodayTestCard({
  data,
  onStart,
  starting,
}: {
  data: DashboardData;
  onStart: () => void;
  starting: boolean;
}) {
  const { navigate } = useExitGuard();
  const { today } = data;

  if (today.totalQuestions === 0) {
    return (
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 text-white">
        <p className="text-sm font-semibold">No test available</p>
        <p className="mt-1 text-sm text-slate-300">
          We couldn&apos;t find any questions to build today&apos;s test. Please check back soon.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">Today&apos;s Test</p>
          <h2 className="mt-1 text-lg font-bold">{today.title}</h2>
        </div>
        {today.status === "completed" && (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <CheckIcon className="h-5 w-5" />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 text-sm text-indigo-100">
        <span className="flex items-center gap-1.5">
          <BankIcon className="h-4 w-4" /> {today.totalQuestions} Questions
        </span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="h-4 w-4" /> ~{today.estimatedMinutes} min
        </span>
      </div>

      {today.status === "in_progress" && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-indigo-100">
            <span>Question {Math.min(today.currentIndex + 1, today.totalQuestions)} of {today.totalQuestions}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${(today.currentIndex / today.totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      )}

      {today.status === "completed" && today.score !== null && (
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">Score {today.score}%</span>
          {data.lastCompletedDate && <span className="text-xs text-indigo-100">Completed today</span>}
        </div>
      )}

      <div className="mt-4">
        {today.status === "available" && (
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-bold text-indigo-700 shadow-sm transition active:scale-[0.98] disabled:opacity-70"
          >
            {starting ? "Starting…" : "Start Test"}
          </button>
        )}
        {today.status === "in_progress" && (
          <button
            type="button"
            onClick={onStart}
            disabled={starting}
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-bold text-indigo-700 shadow-sm transition active:scale-[0.98] disabled:opacity-70"
          >
            {starting ? "Loading…" : "Continue Test"}
          </button>
        )}
        {today.status === "completed" && today.attemptId && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`#/revision/test/result/${today.attemptId}`)}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-white text-sm font-bold text-indigo-700 active:scale-[0.98]"
            >
              View Results
            </button>
            <button
              type="button"
              onClick={() => navigate(`#/revision/test/review/${today.attemptId}`)}
              className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-white/40 bg-white/10 text-sm font-bold text-white active:scale-[0.98]"
            >
              Review Answers
            </button>
          </div>
        )}
        {today.status === "expired" && (
          <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-indigo-50">
            Today&apos;s test window has expired. A fresh test will be ready tomorrow.
          </p>
        )}
      </div>
    </Card>
  );
}
