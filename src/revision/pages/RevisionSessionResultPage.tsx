import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { Badge, Card, ErrorState, PrimaryButton, SecondaryButton } from "../components/ui";
import { CheckIcon, MinusIcon, SparklesIcon, TrophyIcon, XIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getRevisionSessionResult, ServiceError } from "../engine/revisionService";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function RevisionSessionResultPage({ uid, route, sessionId }: { uid: string; route: string; sessionId: number }) {
  const { navigate } = useExitGuard();

  const { data, error } = useMemo(() => {
    try {
      return { data: getRevisionSessionResult(uid, sessionId), error: null as string | null };
    } catch (err) {
      return { data: null, error: err instanceof ServiceError ? err.message : "Could not load session results." };
    }
  }, [uid, sessionId]);

  return (
    <PageShell route={route} title="Revision Results" backHref="#/revision/bank">
      {error && <ErrorState message={error} />}
      {data && (
        <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
          <Card className="bg-gradient-to-br from-emerald-600 to-teal-600 text-center text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Revision Complete</p>
            <p className="mt-1 text-5xl font-extrabold">{data.accuracy}%</p>
            <p className="mt-1 text-sm text-emerald-100">
              {data.correctCount} of {data.totalQuestions} correct
            </p>
            {data.mastered > 0 && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold">
                <TrophyIcon className="h-4 w-4" /> {data.mastered} question{data.mastered === 1 ? "" : "s"} mastered!
              </div>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <ResultChip icon={<CheckIcon className="h-5 w-5 text-emerald-600" />} label="Correct" value={data.correctCount} tone="bg-emerald-50" />
            <ResultChip icon={<XIcon className="h-5 w-5 text-rose-600" />} label="Wrong" value={data.wrongCount} tone="bg-rose-50" />
            <ResultChip icon={<MinusIcon className="h-5 w-5 text-slate-500" />} label="Skipped" value={data.skippedCount} tone="bg-slate-50" />
          </div>

          <Card>
            <h2 className="mb-3 text-[15px] font-semibold text-slate-900">Question Progress</h2>
            <div className="space-y-3">
              {data.items.map((item) => {
                const status = item.isSkipped ? "skipped" : item.isCorrect ? "correct" : "wrong";
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-100 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={status}>{status}</Badge>
                      {item.statusBefore && item.statusAfter && item.statusBefore !== item.statusAfter && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold capitalize text-indigo-700">
                          <SparklesIcon className="h-3 w-3" /> {item.statusBefore} → {item.statusAfter}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] font-medium text-slate-400">
                        {item.subjectIcon} {item.topicName}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium text-slate-800">{item.prompt}</p>
                    {item.selectedIndex !== null && item.correctIndex !== item.selectedIndex && (
                      <p className="mt-1 text-xs text-slate-500">
                        Your answer: {OPTION_LETTERS[item.selectedIndex]} · Correct: {OPTION_LETTERS[item.correctIndex]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-3 pt-1">
            <PrimaryButton onClick={() => navigate("#/revision/bank")}>Back to Revision Bank</PrimaryButton>
            <SecondaryButton onClick={() => navigate("#/revision/progress")}>View Progress</SecondaryButton>
          </div>
        </div>
      )}
    </PageShell>
  );
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
