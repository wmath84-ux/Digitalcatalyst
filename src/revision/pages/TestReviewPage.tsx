import { useMemo } from "react";
import PageShell from "../components/PageShell";
import { Badge, Card, EmptyState, ErrorState } from "../components/ui";
import { CheckIcon, XIcon, MinusIcon } from "../components/icons";
import { getTestReview } from "../engine/testService";
import { ServiceError } from "../engine/store";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function TestReviewPage({ uid, route, attemptId }: { uid: string; route: string; attemptId: number }) {
  const { data, error } = useMemo(() => {
    try {
      return { data: getTestReview(uid, attemptId), error: null as string | null };
    } catch (err) {
      return { data: null, error: err instanceof ServiceError ? err.message : "Could not load the review." };
    }
  }, [uid, attemptId]);

  return (
    <PageShell route={route} title="Answer Review" backHref={`#/revision/test/result/${attemptId}`}>
      {error && <ErrorState message={error} />}
      {data && data.length === 0 && (
        <EmptyState title="Nothing to review" description="This test doesn't have any questions yet." />
      )}
      {data && data.length > 0 && (
        <div className="animate-fade-in space-y-4 px-4 py-4 pb-8">
          {data.map((q, idx) => {
            const status = q.isSkipped ? "skipped" : q.isCorrect ? "correct" : "wrong";
            const statusStyles =
              status === "correct"
                ? "border-emerald-200 bg-emerald-50/60"
                : status === "wrong"
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-slate-200 bg-slate-50";
            return (
              <Card key={q.id} className={`border-2 ${statusStyles}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Q{idx + 1}</span>
                  <Badge tone={q.difficulty}>{q.difficulty}</Badge>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {q.subjectIcon} {q.subjectName} · {q.topicName}
                  </span>
                  <StatusPill status={status} />
                </div>
                <p className="text-[15px] font-semibold leading-snug text-slate-900">{q.prompt}</p>

                <div className="mt-3 space-y-2">
                  {q.options.map((opt, optIdx) => {
                    const isCorrectOpt = optIdx === q.correctIndex;
                    const isUserOpt = optIdx === q.selectedIndex;
                    let cls = "border-slate-200 bg-white text-slate-600";
                    if (isCorrectOpt) cls = "border-emerald-300 bg-emerald-100 text-emerald-800";
                    else if (isUserOpt && !isCorrectOpt) cls = "border-rose-300 bg-rose-100 text-rose-800";
                    return (
                      <div key={optIdx} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium ${cls}`}>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-[11px] font-bold">
                          {OPTION_LETTERS[optIdx]}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {isCorrectOpt && <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />}
                        {isUserOpt && !isCorrectOpt && <XIcon className="h-4 w-4 shrink-0 text-rose-600" />}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 rounded-xl bg-white/80 p-3">
                  <p className="text-xs font-semibold text-slate-500">Explanation</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{q.explanation}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function StatusPill({ status }: { status: "correct" | "wrong" | "skipped" }) {
  if (status === "correct") {
    return (
      <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
        <CheckIcon className="h-3 w-3" /> Correct
      </span>
    );
  }
  if (status === "wrong") {
    return (
      <span className="ml-auto flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">
        <XIcon className="h-3 w-3" /> Incorrect
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-400 px-2.5 py-1 text-[11px] font-bold text-white">
      <MinusIcon className="h-3 w-3" /> Skipped
    </span>
  );
}
