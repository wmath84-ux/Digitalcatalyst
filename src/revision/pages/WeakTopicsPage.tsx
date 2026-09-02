import { useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import { Card, EmptyState, PrimaryButton, ProgressBar } from "../components/ui";
import {
  AlertIcon,
  MinusIcon,
  SparklesIcon,
  TargetIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { getWeakTopics } from "../engine/statsService";
import { startRevisionSession, ServiceError } from "../engine/revisionService";

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "improving")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
        <TrendUpIcon className="h-3 w-3" /> Improving
      </span>
    );
  if (trend === "declining")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200">
        <TrendDownIcon className="h-3 w-3" /> Declining
      </span>
    );
  if (trend === "stable")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.12] px-2 py-0.5 text-[10px] font-bold text-white/85">
        <MinusIcon className="h-3 w-3" /> Stable
      </span>
    );
  return <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-200">New</span>;
}

type Props = {
  uid: string;
  route: string;
};

export default function WeakTopicsPage({ uid, route }: Props) {
  const { navigate } = useExitGuard();
  const [revisingTopicId, setRevisingTopicId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const data = useMemo(() => getWeakTopics(uid), [uid]);

  const handleRevise = (topicId: number) => {
    // This revises already-owned weak-question data, so it remains available
    // after subscription expiry/downgrade just like saved-test retakes.
    setErrorMsg(null);
    setRevisingTopicId(topicId);
    try {
      const session = startRevisionSession(uid, { topicId });
      navigate(`#/revision/session/${session.id}`);
    } catch (err) {
      setErrorMsg(
        err instanceof ServiceError && err.code === "NO_ITEMS"
          ? "No revision questions saved for this topic yet."
          : "Could not start a revision session. Please try again.",
      );
    } finally {
      setRevisingTopicId(null);
    }
  };

  return (
    <PageShell route={route} title="Weak Topics" subtitle="Where to focus your revision" mergeIntoMainHeader>
      {!data.hasData && (
        <EmptyState
          icon={<TargetIcon className="h-8 w-8" />}
          title="No performance data yet"
          description="Complete a few Daily Tests and we'll automatically surface the topics that need the most attention."
          action={
            <PrimaryButton className="mt-2 w-auto px-6" onClick={() => navigate("#/revision")}>
              Take Today&apos;s Test
            </PrimaryButton>
          }
        />
      )}
      {data.hasData && (
        /* Two-zone layout. Phones (and tablet portrait, via index.css) keep
           the original single-column story — `display: contents` on the zone
           wrappers lets each section sit directly in the phone column and the
           `order-*` classes preserve the original section order exactly.
           Tablet landscape + desktop (>= 960 px, same threshold the shell
           uses) re-flow the zones into a 12-col grid: topic focus on the
           left (7 cols), supporting breakdowns on the right (5 cols). */
        <div
          data-rev-layout="weak"
          className="animate-fade-in flex flex-col gap-5 px-4 py-4 pb-8 lg:grid lg:grid-cols-12 lg:gap-3 lg:px-0 lg:py-0 lg:pb-0 lg:max-w-[1200px] lg:mx-auto"
        >
          {errorMsg && (
            <div
              data-rev-banner
              className="order-first flex items-center gap-2 rounded-2xl bg-rose-500/20 px-4 py-3 text-sm font-medium text-rose-200 lg:col-span-12"
            >
              <AlertIcon className="h-4 w-4 shrink-0" /> {errorMsg}
            </div>
          )}

          <div data-rev-col="weak-primary" className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-3">
            {data.recommendedTopics.length > 0 && (
              <section className="order-1">
                <h2 className="mb-2 text-[15px] font-bold text-white lg:text-[14px]">Recommended for you</h2>
                <div className="grid gap-3 min-[960px]:grid-cols-2">
                  {data.recommendedTopics.map((t) => (
                    <Card key={t.topicId} className="border-indigo-400/30 bg-indigo-500/15">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{t.subjectIcon}</span>
                          <div>
                            <p className="text-sm font-semibold text-white">{t.topicName}</p>
                            <p className="text-xs text-white/75">{t.subjectName}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-rose-300">{t.accuracy}%</span>
                      </div>
                      <ProgressBar value={t.accuracy} className="mt-2" />
                      <button
                        type="button"
                        onClick={() => handleRevise(t.topicId)}
                        disabled={revisingTopicId === t.topicId}
                        className="mt-3 flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-md transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
                      >
                        <SparklesIcon className="h-4 w-4" />
                        {revisingTopicId === t.topicId ? "Starting…" : "Revise Now"}
                      </button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section className="order-3">
              <h2 className="mb-2 text-[15px] font-bold text-white lg:text-[14px]">All Weak Topics</h2>
              <Card>
                <div className="flex flex-col gap-4 lg:gap-2.5">
                  {data.weakestTopics.map((t) => (
                    <div key={t.topicId}>
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <span>{t.subjectIcon}</span>
                          <p className="truncate text-sm font-medium text-white/85">{t.topicName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendBadge trend={t.trend} />
                          <span className="text-xs font-bold text-white/75">{t.accuracy}%</span>
                        </div>
                      </div>
                      <ProgressBar value={t.accuracy} className="mt-1.5" />
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          </div>

          <div data-rev-col="weak-secondary" className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-3">
            {data.weakestSubjects.length > 0 && (
              <section className="order-2">
                <h2 className="mb-2 text-[15px] font-bold text-white lg:text-[14px]">Weakest Subjects</h2>
                <div className="grid grid-cols-2 gap-3">
                  {data.weakestSubjects.map((s) => (
                    <Card key={s.subjectId} className="text-center">
                      <p className="text-2xl">{s.icon}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-white/85">{s.name}</p>
                      <p className="mt-0.5 text-lg font-bold text-white">{s.accuracy}%</p>
                      <ProgressBar value={s.accuracy} className="mt-1.5" />
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {data.mostMissedTopics.length > 0 && (
              <section className="order-4">
                <h2 className="mb-2 text-[15px] font-bold text-white lg:text-[14px]">Most Missed Topics</h2>
                <Card>
                  <div className="divide-y divide-white/10">
                    {data.mostMissedTopics.map((t) => (
                      <div key={t.topicId} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                        <span className="flex items-center gap-2 text-sm text-white/85">
                          {t.subjectIcon} {t.topicName}
                        </span>
                        <span className="text-xs font-bold text-rose-300">{t.wrong} missed</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}

            {data.frequentlySkippedTopics.length > 0 && (
              <section className="order-5">
                <h2 className="mb-2 text-[15px] font-bold text-white lg:text-[14px]">Frequently Skipped</h2>
                <Card>
                  <div className="divide-y divide-white/10">
                    {data.frequentlySkippedTopics.map((t) => (
                      <div key={t.topicId} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                        <span className="flex items-center gap-2 text-sm text-white/85">
                          {t.subjectIcon} {t.topicName}
                        </span>
                        <span className="text-xs font-bold text-white/75">{t.skipped} skipped</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
