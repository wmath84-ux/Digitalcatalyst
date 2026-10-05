/**
 * Test result — the exam-mode scorecard, in the ported Recall design language.
 *
 * Preserves every number the retired glass result page showed (§5A): score,
 * accuracy, correct / wrong / skipped, time spent, the per-topic breakdown and
 * the attempt's plan (class, subjects, chapters, topics, difficulty, question
 * mode). Adds what Recall already gives its learners — a clear next action —
 * through the same surfaces the ported session summary uses.
 */

import { useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { RecallBadge, RecallCard, RecallError, RecallLoading, RecallPage, RecallProgress, RecallStat, SectionTitle } from "../components/recall-ui";
import { getTestResult } from "../engine/testService";
import { startCustomTestRetake, startSkippedQuestionsRetake } from "../engine/customTestService";
import { ServiceError } from "../engine/store";
import { questionModeLabel } from "../engine/questionMode";

export default function TestResultPage({ uid, attemptId }: { uid: string; attemptId: number | null }) {
  const { navigate } = useRevisionRoute();
  const [actionError, setActionError] = useState<{ attemptId: number | null; message: string } | null>(null);

  // Loading a result is a pure render calculation. In particular, an invalid
  // deep link must produce an error value rather than scheduling state while
  // React is rendering this page.
  const { result, loadError } = useMemo(() => {
    if (!attemptId) {
      return { result: null, loadError: "This result link is missing its attempt id." };
    }
    try {
      return { result: getTestResult(uid, attemptId), loadError: null as string | null };
    } catch (err) {
      return {
        result: null,
        loadError: err instanceof ServiceError ? err.message : "Could not load this result.",
      };
    }
  }, [attemptId, uid]);
  const error = actionError?.attemptId === attemptId ? actionError.message : loadError;

  if (error && !result) {
    return (
      <RecallPage title="Result" onBack={() => navigate(REVISION_DEEP_LINKS.testBank)}>
        <RecallError
          title="Could not load this result"
          body={error}
          action={
            <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}>
              Back to the Test Bank
            </Button>
          }
        />
      </RecallPage>
    );
  }

  if (!result) {
    return (
      <div className="py-16">
        <RecallLoading />
      </div>
    );
  }

  const minutes = Math.max(1, Math.round(result.timeSpentSeconds / 60));

  return (
    <RecallPage
      title={result.testTitle}
      subtitle={`${result.testDate} · ${result.totalQuestions} questions · ${minutes} min`}
      onBack={() => navigate(REVISION_DEEP_LINKS.testBank)}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.testReview(result.attemptId))}>
            Review answers
          </Button>
          <Button
            onClick={() => {
              try {
                const attempt = startCustomTestRetake(uid, result.testId);
                navigate(REVISION_DEEP_LINKS.testPlayAttempt(attempt.id));
              } catch (err) {
                setActionError({ attemptId, message: err instanceof Error ? err.message : "Could not start a retake." });
              }
            }}
          >
            Retake
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RecallStat label="Score" value={`${result.score}%`} tone="brand" />
        <RecallStat label="Correct" value={result.correctCount} tone="success" />
        <RecallStat label="Wrong" value={result.wrongCount} />
        <RecallStat label="Skipped" value={result.skippedCount} />
      </div>

      <RecallCard className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className={cn(typeClass["label-lg"])}>Accuracy</span>
          <span className={cn(typeClass["title-md"])}>{result.accuracy}%</span>
        </div>
        <RecallProgress value={result.accuracy} />
        <div className="flex flex-wrap items-center gap-2">
          <RecallBadge>{result.isCustom ? "Saved test" : "Daily Test"}</RecallBadge>
          {result.attemptKind === "skipped" ? <RecallBadge tone="warning">Skipped questions only</RecallBadge> : null}
          <RecallBadge>
            {result.startedAt ? new Date(result.startedAt).toLocaleString() : ""}
          </RecallBadge>
        </div>
        {result.skippedCount > 0 && result.attemptKind !== "skipped" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              try {
                const attempt = startSkippedQuestionsRetake(uid, result.testId);
                navigate(REVISION_DEEP_LINKS.testPlayAttempt(attempt.id));
              } catch (err) {
                setActionError({ attemptId, message: err instanceof Error ? err.message : "Could not start the skipped-questions retake." });
              }
            }}
          >
            Retake the {result.skippedCount} skipped question{result.skippedCount === 1 ? "" : "s"}
          </Button>
        ) : null}
      </RecallCard>

      <section className="mt-6">
        <SectionTitle hint={`${result.topicBreakdown.length} topics`}>Topic breakdown</SectionTitle>
        {result.topicBreakdown.length === 0 ? (
          <RecallCard>
            <p className={cn(typeClass["body-md"], "text-on-surface-variant")}>
              No topic data for this attempt.
            </p>
          </RecallCard>
        ) : (
          <ul className="space-y-2">
            {result.topicBreakdown
              .slice()
              .sort((a, b) => a.accuracy - b.accuracy)
              .map((topic) => (
                <li key={topic.topicId}>
                  <RecallCard className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn(typeClass["label-lg"], "min-w-0 truncate")}>
                        {topic.subjectIcon} {topic.topicName}
                      </span>
                      <span
                        className={cn(
                          typeClass["label-lg"],
                          topic.accuracy >= 70 ? "text-tertiary" : topic.accuracy >= 40 ? "text-secondary" : "text-error",
                        )}
                      >
                        {topic.accuracy}%
                      </span>
                    </div>
                    <RecallProgress value={topic.accuracy} />
                    <p className={cn(typeClass.caption, "text-on-surface-variant")}>
                      {topic.subjectName} · {topic.correct}/{topic.total} correct
                    </p>
                  </RecallCard>
                </li>
              ))}
          </ul>
        )}
      </section>

      {result.planDetails ? (
        <section className="mt-6">
          <SectionTitle>Generated from</SectionTitle>
          <RecallCard className="space-y-2">
            <p className={cn(typeClass["body-md"])}>
              {[
                result.planDetails.classNames.join(", "),
                result.planDetails.subjectNames.join(", "),
                result.planDetails.chapterNames.join(", "),
                result.planDetails.topicNames.join(", "),
              ]
                .filter(Boolean)
                .join(" › ") || "Your saved plan"}
            </p>
            <div className="flex flex-wrap gap-2">
              <RecallBadge tone="brand">{result.planDetails.difficulty}</RecallBadge>
                  <RecallBadge>{questionModeLabel(result.planDetails.questionMode)}</RecallBadge>
            </div>
          </RecallCard>
        </section>
      ) : null}

      {error ? (
        <p className={cn(typeClass.caption, "mt-4 text-error")} role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.weakTopics)}>
          Open Weak Topics
        </Button>
        <Button variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.dashboard)}>
          Back to the dashboard
        </Button>
      </div>
    </RecallPage>
  );
}
