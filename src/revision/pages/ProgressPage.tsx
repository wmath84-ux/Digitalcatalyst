/**
 * Progress — the score/accuracy report over time.
 *
 * `statsService.getProgressData` is unchanged: totals, daily/weekly/monthly
 * buckets, the accuracy trend across the last 15 completed tests and the
 * activity history. Rendered in the ported Recall language (stat surfaces,
 * progress bars, list rows) and linked to the ported Stats screen, which covers
 * the memory side (retention, heatmap, workload forecast) that this report does
 * not.
 */

import { useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { RecallBadge, RecallCard, RecallEmpty, RecallPage, RecallProgress, RecallRow, RecallStat, SectionTitle } from "../components/recall-ui";
import { getProgressData } from "../engine/statsService";

type Range = "daily" | "weekly" | "monthly";

export default function ProgressPage({ uid }: { uid: string }) {
  const { navigate } = useRevisionRoute();
  const [range, setRange] = useState<Range>("daily");

  const { data, error } = useMemo(() => {
    try {
      return { data: getProgressData(uid), error: null as string | null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : "Could not compute your progress.",
      };
    }
  }, [uid]);

  if (!data) {
    return (
      <RecallPage title="Progress" onBack={() => navigate(REVISION_DEEP_LINKS.dashboard)}>
        <RecallCard>
          <p className={cn(typeClass["body-md"], "text-on-surface-variant")}>
            {error ?? "Could not compute your progress yet."}
          </p>
        </RecallCard>
      </RecallPage>
    );
  }

  const buckets = range === "daily" ? data.daily : range === "weekly" ? data.weekly : data.monthly;
  const maxAttempted = Math.max(1, ...buckets.map((bucket) => bucket.attempted));

  return (
    <RecallPage
      title="Progress"
      subtitle="Scores and accuracy across your daily tests and revision sessions."
      onBack={() => navigate(REVISION_DEEP_LINKS.dashboard)}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.stats)}>
            Recall stats
          </Button>
          <Button variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.weakTopics)}>
            Weak Topics
          </Button>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RecallStat label="Overall accuracy" value={`${data.totals.overallAccuracy}%`} tone="brand" />
        <RecallStat label="Tests completed" value={data.totals.testsCompleted} />
        <RecallStat label="Questions answered" value={data.totals.questionsAttempted} />
        <RecallStat label="Day streak" value={data.totals.currentStreak} tone="motivation" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RecallStat label="Correct" value={data.totals.questionsCorrect} tone="success" />
        <RecallStat label="Incorrect" value={data.totals.questionsIncorrect} />
        <RecallStat label="Sessions" value={data.totals.revisionSessionsCompleted} />
        <RecallStat label="Mastered questions" value={data.totals.masteredCount} tone="success" />
      </div>

      {data.totals.questionsAttempted === 0 ? (
        <RecallEmpty
          icon="📈"
          title="Nothing to chart yet"
          body="Your first Daily Test is enough to start this report."
          action={<Button onClick={() => navigate(REVISION_DEEP_LINKS.testPlay())}>Start today's test</Button>}
        />
      ) : (
        <>
          <section>
            <SectionTitle
              hint={
                <span className="flex gap-1">
                  {(["daily", "weekly", "monthly"] as Range[]).map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => setRange(candidate)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                        range === candidate
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-container-high text-on-surface-variant",
                      )}
                    >
                      {candidate}
                    </button>
                  ))}
                </span>
              }
            >
              Activity
            </SectionTitle>
            <RecallCard className="space-y-3">
              {buckets.map((bucket) => (
                <div key={bucket.date} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn(typeClass.caption, "text-on-surface-variant")}>{bucket.label}</span>
                    <span className={cn(typeClass.caption, "tabular-nums")}>
                      {bucket.correct}/{bucket.attempted} · {bucket.accuracy}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(bucket.attempted / maxAttempted) * 100}%` }}
                    />
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-tertiary"
                      style={{ width: `${bucket.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </RecallCard>
          </section>

          <section className="mt-6">
            <SectionTitle hint="last 15 completed tests">Accuracy trend</SectionTitle>
            <RecallCard className="space-y-2">
              {data.accuracyTrend.length === 0 ? (
                <p className={cn(typeClass["body-md"], "text-on-surface-variant")}>No completed tests yet.</p>
              ) : (
                data.accuracyTrend.map((point, index) => (
                  <div key={`${point.date}-${index}`} className="flex items-center gap-3">
                    <span className={cn(typeClass.caption, "w-14 shrink-0 text-on-surface-variant")}>{point.date}</span>
                    <span className="flex-1">
                      <RecallProgress value={point.score} />
                    </span>
                    <span className={cn(typeClass.caption, "w-10 shrink-0 text-right tabular-nums")}>{point.score}%</span>
                  </div>
                ))
              )}
            </RecallCard>
          </section>

          <section className="mt-6">
            <SectionTitle hint={`${data.activityHistory.length} entries`}>Recent activity</SectionTitle>
            <ul className="space-y-2">
              {data.activityHistory.map((entry) => (
                <li key={`${entry.type}-${entry.refId}`}>
                  <RecallRow
                    icon={entry.type === "test" ? "📝" : "🔁"}
                    title={entry.title}
                    meta={`${new Date(entry.date).toLocaleDateString()} · ${entry.detail}`}
                    onClick={() =>
                      navigate(
                        entry.type === "test"
                          ? REVISION_DEEP_LINKS.testResult(entry.refId)
                          : REVISION_DEEP_LINKS.sessionResult(entry.refId),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className="mt-6">
        <RecallBadge>Data stays on your device and syncs to your account</RecallBadge>
      </div>
    </RecallPage>
  );
}
