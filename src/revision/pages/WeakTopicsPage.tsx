/**
 * Weak Topics — the "where should I focus?" report.
 *
 * The intelligence is unchanged (`statsService.getWeakTopics`): weakest topics,
 * weakest subjects, most-missed and most-skipped questions, ranked from the
 * learner's real answers with a recent-vs-prior trend. What the port changes is
 * the presentation — Recall's surfaces and type scale — and the action: each row
 * can start a Smart Revision session scoped to that topic, which is now the
 * ported study flow rather than a second revision screen (§18).
 */

import { useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { RecallBadge, RecallCard, RecallEmpty, RecallPage, RecallProgress, RecallStat, SectionTitle } from "../components/recall-ui";
import { getWeakTopics } from "../engine/statsService";
import { startRevisionSession } from "../engine/revisionService";
import { ServiceError } from "../engine/store";

export default function WeakTopicsPage({ uid }: { uid: string }) {
  const { navigate } = useRevisionRoute();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loadError } = useMemo(() => {
    try {
      return { data: getWeakTopics(uid), loadError: null as string | null };
    } catch (err) {
      return {
        data: null,
        loadError: err instanceof Error ? err.message : "Could not compute your weak topics.",
      };
    }
  }, [uid]);
  const error = actionError ?? loadError;

  const revise = (topicId?: number) => {
    setActionError(null);
    try {
      const session = startRevisionSession(uid, topicId ? { topicId, limit: 10 } : { limit: 10 });
      navigate(REVISION_DEEP_LINKS.session(session.id));
    } catch (err) {
      setActionError(err instanceof ServiceError ? err.message : "Could not start a revision session.");
    }
  };

  const trendTone = (trend: string) =>
    trend === "declining" ? "danger" : trend === "improving" ? "success" : "neutral";

  return (
    <RecallPage
      title="Weak Topics"
      subtitle="Built from your answers in Daily Tests, Smart Revision and saved tests."
      onBack={() => navigate(REVISION_DEEP_LINKS.dashboard)}
      actions={
        <Button onClick={() => revise()} disabled={!data?.hasData}>
          Revise the weakest
        </Button>
      }
    >
      {!data?.hasData ? (
        <RecallEmpty
          icon="🎯"
          title="No answers to analyse yet"
          body="Finish a Daily Test or a Smart Revision session and this report fills itself in."
          action={
            <Button onClick={() => navigate(REVISION_DEEP_LINKS.testPlay())}>Start today's test</Button>
          }
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RecallStat label="Tracked topics" value={data.weakestTopics.length} />
            <RecallStat label="Weakest accuracy" value={`${data.weakestTopics[0]?.accuracy ?? 0}%`} tone="brand" />
            <RecallStat label="Subjects" value={data.weakestSubjects.length} />
            <RecallStat label="Most missed" value={data.mostMissedTopics[0]?.topicName ?? "—"} />
          </div>

          <section>
            <SectionTitle hint="lowest accuracy first">Weakest topics</SectionTitle>
            <ul className="space-y-2">
              {data.weakestTopics.map((topic) => (
                <li key={topic.topicId}>
                  <RecallCard className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn(typeClass["label-lg"], "truncate")}>
                          {topic.subjectIcon} {topic.topicName}
                        </p>
                        <p className={cn(typeClass.caption, "text-on-surface-variant")}>
                          {topic.subjectName} · {topic.correct}/{topic.total} correct
                          {topic.skipped > 0 ? ` · ${topic.skipped} skipped` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <RecallBadge tone={trendTone(topic.trend)}>{topic.trend}</RecallBadge>
                        <span className={cn(typeClass["title-md"], "text-error")}>{topic.accuracy}%</span>
                      </div>
                    </div>
                    <RecallProgress value={topic.accuracy} />
                    <Button size="sm" variant="secondary" onClick={() => revise(topic.topicId)}>
                      Revise this topic
                    </Button>
                  </RecallCard>
                </li>
              ))}
            </ul>
          </section>

          {data.weakestSubjects.length > 0 ? (
            <section className="mt-6">
              <SectionTitle hint="by average accuracy">Weakest subjects</SectionTitle>
              <ul className="space-y-2">
                {data.weakestSubjects.map((subject) => (
                  <li key={subject.subjectId}>
                    <RecallCard className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn(typeClass["label-lg"], "min-w-0 truncate")}>
                          {subject.icon} {subject.name}
                        </span>
                        <span className={cn(typeClass["label-lg"])}>{subject.accuracy}%</span>
                      </div>
                      <RecallProgress value={subject.accuracy} />
                    </RecallCard>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <section>
              <SectionTitle>Most missed</SectionTitle>
              <ul className="space-y-2">
                {data.mostMissedTopics.map((topic) => (
                  <li key={topic.topicId}>
                    <RecallCard className="flex items-center justify-between gap-3" padded>
                      <span className={cn(typeClass["body-md"], "min-w-0 truncate")}>
                        {topic.subjectIcon} {topic.topicName}
                      </span>
                      <RecallBadge tone="danger">{topic.wrong} wrong</RecallBadge>
                    </RecallCard>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <SectionTitle>Frequently skipped</SectionTitle>
              <ul className="space-y-2">
                {data.frequentlySkippedTopics.map((topic) => (
                  <li key={topic.topicId}>
                    <RecallCard className="flex items-center justify-between gap-3" padded>
                      <span className={cn(typeClass["body-md"], "min-w-0 truncate")}>
                        {topic.subjectIcon} {topic.topicName}
                      </span>
                      <RecallBadge tone="warning">{topic.skipped} skipped</RecallBadge>
                    </RecallCard>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {error ? (
        <p className={cn(typeClass.caption, "mt-4 text-error")} role="alert">
          {error}
        </p>
      ) : null}
    </RecallPage>
  );
}
