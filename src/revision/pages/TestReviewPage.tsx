/**
 * Answer review — every question of a completed attempt with the learner's
 * choice, the correct answer and the explanation. Recall surfaces only.
 */

import { useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { RecallBadge, RecallCard, RecallError, RecallPage, SectionTitle } from "../components/recall-ui";
import { getTestReview } from "../engine/testService";
import { ServiceError } from "../engine/store";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

type Filter = "all" | "wrong" | "skipped";

export default function TestReviewPage({ uid, attemptId }: { uid: string; attemptId: number | null }) {
  const { navigate } = useRevisionRoute();
  const [filter, setFilter] = useState<Filter>("all");

  const { questions, error } = useMemo(() => {
    if (!attemptId) return { questions: [], error: "This review link is missing its attempt id." };
    try {
      return { questions: getTestReview(uid, attemptId), error: null as string | null };
    } catch (err) {
      return { questions: [], error: err instanceof ServiceError ? err.message : "Could not load this review." };
    }
  }, [attemptId, uid]);

  const visible = questions.filter((question) => {
    if (filter === "wrong") return question.isCorrect === false;
    if (filter === "skipped") return question.isSkipped;
    return true;
  });

  if (error) {
    return (
      <RecallPage title="Review" onBack={() => navigate(REVISION_DEEP_LINKS.testBank)}>
        <RecallError
          title="Could not load this review"
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

  return (
    <RecallPage
      title="Review answers"
      subtitle={`${questions.length} questions`}
      onBack={() => navigate(REVISION_DEEP_LINKS.testBank)}
      actions={
        <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.testResult(attemptId ?? 0))}>
          Back to the result
        </Button>
      }
    >
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Filter answers">
        {(["all", "wrong", "skipped"] as Filter[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={filter === candidate}
            onClick={() => setFilter(candidate)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors",
              filter === candidate
                ? "bg-primary text-primary-foreground"
                : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
            )}
          >
            {candidate}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <RecallCard>
          <p className={cn(typeClass["body-md"], "text-on-surface-variant")}>
            Nothing matches this filter — nice work.
          </p>
        </RecallCard>
      ) : (
        <ul className="space-y-3">
          {visible.map((question, index) => (
            <li key={question.id}>
              <RecallCard className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <RecallBadge>#{index + 1}</RecallBadge>
                  <span className={cn(typeClass.caption, "text-on-surface-variant")}>
                    {question.subjectIcon} {question.subjectName} · {question.topicName}
                  </span>
                  {question.isSkipped ? (
                    <RecallBadge tone="warning">Skipped</RecallBadge>
                  ) : question.isCorrect ? (
                    <RecallBadge tone="success">Correct</RecallBadge>
                  ) : (
                    <RecallBadge tone="danger">Wrong</RecallBadge>
                  )}
                </div>

                <p className={cn(typeClass["body-lg"], "whitespace-pre-wrap")}>{question.prompt}</p>

                <ul className="space-y-1.5">
                  {question.options.map((option, optionIndex) => {
                    const isCorrect = optionIndex === question.correctIndex;
                    const isSelected = optionIndex === question.selectedIndex;
                    return (
                      <li
                        key={optionIndex}
                        className={cn(
                          "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
                          isCorrect
                            ? "border-tertiary bg-tertiary-container text-on-tertiary-container"
                            : isSelected
                              ? "border-error bg-error-container text-on-error-container"
                              : "border-outline-variant",
                        )}
                      >
                        <span className="font-bold">{OPTION_LETTERS[optionIndex] ?? optionIndex + 1}</span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{option}</span>
                        {isCorrect ? <span aria-label="Correct answer">✓</span> : null}
                        {isSelected && !isCorrect ? <span aria-label="Your answer">✗</span> : null}
                      </li>
                    );
                  })}
                </ul>

                {question.explanation ? (
                  <div className="rounded-xl bg-surface-container-low p-3">
                    <p className={cn(typeClass.caption, "mb-1 uppercase tracking-wide text-on-surface-variant")}>
                      Explanation
                    </p>
                    <p className={cn(typeClass["body-md"], "whitespace-pre-wrap")}>{question.explanation}</p>
                  </div>
                ) : null}
              </RecallCard>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-6">
        <SectionTitle>What next</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.weakTopics)}>
            Focus the weak topics
          </Button>
          <Button variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}>
            Back to the Test Bank
          </Button>
        </div>
      </section>
    </RecallPage>
  );
}
