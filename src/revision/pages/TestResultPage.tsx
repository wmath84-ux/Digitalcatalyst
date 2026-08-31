import { useMemo, useState } from "react";
import { ListRestart, RotateCcw } from "lucide-react";
import PageShell from "../components/PageShell";
import { Card, ErrorState, PrimaryButton, ProgressBar, SecondaryButton } from "../components/ui";
import { CheckIcon, ClockIcon, SparklesIcon, XIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getTestResult } from "../engine/testService";
import { startCustomTestRetake, startSkippedQuestionsRetake } from "../engine/customTestService";
import { questionModeLabel } from "../engine/questionMode";
import { ServiceError } from "../engine/store";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function scoreMessage(score: number) {
  if (score >= 90) return "Outstanding work! 🎉";
  if (score >= 70) return "Great job today! 👏";
  if (score >= 50) return "Good effort, keep going! 💪";
  return "Every test makes you sharper. Let's revise! 📘";
}

export default function TestResultPage({ uid, route, attemptId }: { uid: string; route: string; attemptId: number }) {
  const { navigate } = useExitGuard();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error } = useMemo(() => {
    try {
      return { data: getTestResult(uid, attemptId), error: null as string | null };
    } catch (err) {
      return { data: null, error: err instanceof ServiceError ? err.message : "Could not load your result." };
    }
  }, [uid, attemptId]);

  const startRetake = (skippedOnly: boolean) => {
    if (!data?.isCustom) return;
    setActionError(null);
    try {
      const attempt = skippedOnly
        ? startSkippedQuestionsRetake(uid, data.testId)
        : startCustomTestRetake(uid, data.testId);
      navigate(`#/revision/test/play-attempt/${attempt.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not start another attempt.");
    }
  };

  return (
    <PageShell route={route} title="Test Result" backHref="#/revision">
      {error && <ErrorState message={error} />}
      {data && (
        <div data-rev-layout="testresult" className="animate-fade-in space-y-4 px-4 py-4 pb-8 lg:space-y-3 lg:px-0 lg:py-0 lg:pb-6 lg:max-w-[900px] lg:mx-auto">
          <Card data-rev-score-card className="bg-gradient-to-br from-indigo-600 to-violet-600 text-center text-white">
            <p className="line-clamp-1 text-xs font-semibold text-indigo-100">{data.testTitle}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-200">{data.attemptKind === "skipped" ? "Skipped-question attempt" : "Full attempt"}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-indigo-100">Your Score</p>
            <p className="mt-1 text-5xl font-extrabold">{data.score}%</p>
            <p className="mt-1 text-sm text-indigo-100">{scoreMessage(data.score)}</p>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-indigo-100">
              <ClockIcon className="h-4 w-4" /> Completed in {formatDuration(data.timeSpentSeconds)}
            </div>
          </Card>

          <div data-rev-result-grid className="grid grid-cols-3 gap-3">
            <ResultChip icon={<CheckIcon className="h-5 w-5 text-emerald-600" />} label="Correct" value={data.correctCount} tone="bg-emerald-100" />
            <ResultChip icon={<XIcon className="h-5 w-5 text-rose-600" />} label="Wrong" value={data.wrongCount} tone="bg-rose-100" />
            <ResultChip icon={<SparklesIcon className="h-5 w-5 text-slate-500" />} label="Skipped" value={data.skippedCount} tone="bg-slate-100" />
          </div>

          {data.planDetails && (
            <Card>
              <h2 className="mb-3 text-[15px] font-bold text-slate-900">Saved Test Plan</h2>
              <div className="space-y-1.5 rounded-2xl bg-slate-100/70 p-3 text-xs text-slate-700">
                {data.planDetails.classNames.length > 0 && <PlanDetail label="Class" value={displayList(data.planDetails.classNames, "")} />}
                <PlanDetail label="Subject" value={displayList(data.planDetails.subjectNames, "Subject not labelled")} />
                <PlanDetail label="Chapter" value={displayList(data.planDetails.chapterNames, "Chapter not labelled")} />
                <PlanDetail label="Topics" value={displayList(data.planDetails.topicNames, "All selected chapter topics")} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700">{questionModeLabel(data.planDetails.questionMode)}</span>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-700">{data.planDetails.difficulty} difficulty</span>
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-slate-900">Accuracy</h2>
              <span className="text-sm font-bold text-indigo-600">{data.accuracy}%</span>
            </div>
            <ProgressBar value={data.accuracy} className="mt-2" />
            <p className="mt-2 text-xs font-medium text-slate-500">
              {data.correctCount} correct out of {data.totalQuestions} questions
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-[15px] font-bold text-slate-900">Topic Breakdown</h2>
            <div className="space-y-3">
              {data.topicBreakdown
                .sort((a, b) => a.accuracy - b.accuracy)
                .map((t) => (
                  <div key={t.topicId} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                      {t.subjectIcon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="truncate text-sm font-medium text-slate-800">{t.topicName}</p>
                        <span className="ml-2 text-xs font-semibold text-slate-600">
                          {t.correct}/{t.total} · {t.accuracy}%
                        </span>
                      </div>
                      <ProgressBar value={t.accuracy} className="mt-1.5" />
                    </div>
                  </div>
                ))}
            </div>
          </Card>

          <div className="space-y-3 pt-1">
            <PrimaryButton onClick={() => navigate(`#/revision/test/review/${attemptId}`)}>Review Answers</PrimaryButton>
            {data.isCustom && (
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => startRetake(false)}><RotateCcw className="h-4 w-4" /> Revise Again</SecondaryButton>
                <SecondaryButton disabled={data.skippedCount === 0} onClick={() => startRetake(true)}><ListRestart className="h-4 w-4" /> Revise Skipped</SecondaryButton>
              </div>
            )}
            {actionError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">{actionError}</p>}
            <SecondaryButton onClick={() => navigate("#/revision/bank")}>Open Test Bank & History</SecondaryButton>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function displayList(items: string[], fallback: string) {
  if (items.length === 0) return fallback;
  if (items.length <= 2) return items.join(" · ");
  return `${items.slice(0, 2).join(" · ")} +${items.length - 2}`;
}

function PlanDetail({ label, value }: { label: string; value: string }) {
  return <p className="line-clamp-1"><span className="font-bold text-slate-600">{label}:</span> <span>{value}</span></p>;
}

function ResultChip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={`flex flex-col items-center gap-1 rounded-2xl py-3 ${tone}`}>
      {icon}
      <span className="text-lg font-bold text-slate-900">{value}</span>
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  );
}
