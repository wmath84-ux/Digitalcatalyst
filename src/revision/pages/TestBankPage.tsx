/**
 * Test Bank — Digitalcatalyst exam content, in the ported Recall design language.
 *
 * Replaces the retired glass `RevisionBankPage`. Everything the old screen did
 * is still here (migration brief §5C): saved tests with their attempt state,
 * open/retake/resume, delete, the question library with filters and sorting, and
 * the entitlement gate on creating new content. What changed is the language:
 * Recall's surfaces, type scale and switches (see `components/recall-ui.tsx`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { Input } from "../recall/components/ui/input";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { RecallBadge, RecallCard, RecallEmpty, RecallPage, RecallRow, RecallStat } from "../components/recall-ui";
import { useConfirmAction } from "../components/useConfirmAction";
import { getRevisionBank, getRevisionSummary, startRevisionSession } from "../engine/revisionService";
import { deleteCustomTestLocal, listCustomTestAttempts, listCustomTests, startCustomTestRetake } from "../engine/customTestService";
import { getTodayTestState } from "../engine/testService";
import { ServiceError } from "../engine/store";

type Tab = "tests" | "questions";

export default function TestBankPage({
  uid,
  hasAccess,
  onRequireAccess,
}: {
  uid: string;
  hasAccess: boolean;
  onRequireAccess: () => boolean;
}) {
  const { navigate } = useRevisionRoute();
  const { confirm, dialog } = useConfirmAction();
  const [tab, setTab] = useState<Tab>("tests");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "learning" | "improving" | "mastered">("all");
  const [sort, setSort] = useState<"recent" | "most_wrong" | "alphabetical" | "difficulty">("recent");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener("revision-db-changed", refresh);
    return () => window.removeEventListener("revision-db-changed", refresh);
  }, []);

  const data = useMemo(() => {
    void reloadKey;
    try {
      return {
        tests: listCustomTests(uid),
        summary: getRevisionSummary(uid),
        today: getTodayTestState(uid),
        questions: getRevisionBank(uid, { search, status: statusFilter, sort }),
        error: null as string | null,
      };
    } catch (err) {
      return {
        tests: [],
        summary: null,
        today: null,
        questions: [],
        error: err instanceof Error ? err.message : "Could not read the Test Bank.",
      };
    }
  }, [uid, reloadKey, search, statusFilter, sort]);

  const startSmartRevision = useCallback(() => {
    try {
      const session = startRevisionSession(uid, { limit: 10 });
      navigate(REVISION_DEEP_LINKS.session(session.id));
    } catch (err) {
      setError(err instanceof ServiceError ? err.message : "Could not start a revision session.");
    }
  }, [navigate, uid]);

  if (error && data.error) {
    return (
      <RecallPage title="Test Bank" onBack={() => navigate(REVISION_DEEP_LINKS.dashboard)}>
        <RecallCard>
          <p className={typeClass["title-md"]}>Could not load the Test Bank</p>
          <p className={cn(typeClass["body-md"], "mt-1 text-on-surface-variant")}>{data.error}</p>
        </RecallCard>
      </RecallPage>
    );
  }

  return (
    <RecallPage
      title="Test Bank"
      subtitle="Everything you have generated, imported or answered — plus the questions worth another look."
      onBack={() => navigate(REVISION_DEEP_LINKS.dashboard)}
      actions={
        <>
          <Button
            onClick={() => {
              if (!onRequireAccess()) return;
              navigate(REVISION_DEEP_LINKS.aiGenerate);
            }}
          >
            {hasAccess ? "New AI test" : "New AI test · Pro"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!onRequireAccess()) return;
              navigate(REVISION_DEEP_LINKS.bulkImport);
            }}
          >
            Import
          </Button>
        </>
      }
    >
      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RecallStat label="Tests today" value={data.today ? `${data.today.completedToday}/${data.today.testsTotal}` : "0/0"} />
        <RecallStat label="Saved tests" value={data.tests.length} />
        <RecallStat label="In revision" value={data.summary ? data.summary.learning + data.summary.improving : 0} />
        <RecallStat label="Mastered" value={data.summary?.mastered ?? 0} tone="success" />
      </div>

      {/* Tabs + filters */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Test Bank sections">
          {(["tests", "questions"] as Tab[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={tab === candidate}
              onClick={() => setTab(candidate)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                tab === candidate
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-container-high text-on-surface-variant hover:text-on-surface",
              )}
            >
              {candidate === "tests" ? "Saved tests" : "Questions"}
            </button>
          ))}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === "tests" ? "Search tests…" : "Search questions…"}
            className="max-w-[14rem]"
            aria-label="Search"
          />
          {tab === "questions" ? (
            <>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="h-9 rounded-xl border border-outline-variant bg-surface px-2 text-sm text-on-surface"
              >
                <option value="all">All statuses</option>
                <option value="learning">Learning</option>
                <option value="improving">Improving</option>
                <option value="mastered">Mastered</option>
              </select>
              <select
                aria-label="Sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="h-9 rounded-xl border border-outline-variant bg-surface px-2 text-sm text-on-surface"
              >
                <option value="recent">Newest</option>
                <option value="most_wrong">Most wrong</option>
                <option value="difficulty">Hardest</option>
                <option value="alphabetical">A–Z</option>
              </select>
            </>
          ) : null}
        </div>
      </div>

      {tab === "tests" ? (
        data.tests.length === 0 ? (
          <RecallEmpty
            icon="🗂"
            title="No saved tests yet"
            body="Generate a test with AI or import a question paper — it is saved here with every attempt and result."
            action={
              <Button
                onClick={() => {
                  if (!onRequireAccess()) return;
                  navigate(REVISION_DEEP_LINKS.aiGenerate);
                }}
              >
                Generate a test
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {data.tests
              .filter((test) => !search || test.title.toLowerCase().includes(search.toLowerCase()))
              .map((test) => {
                const attempts = listCustomTestAttempts(uid, test.id);
                return (
                  <li key={test.id}>
                    <RecallCard className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={cn(typeClass["title-md"], "truncate")}>{test.title}</p>
                          <p className={cn(typeClass.caption, "mt-0.5 text-on-surface-variant")}>
                            {test.testDate} · {test.totalQuestions} questions · ~{test.estimatedMinutes} min
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {test.status === "in_progress" ? <RecallBadge tone="warning">In progress</RecallBadge> : null}
                          {test.status === "completed" ? (
                            <RecallBadge tone="success">Score {test.score ?? 0}%</RecallBadge>
                          ) : null}
                          {test.status === "available" ? <RecallBadge>Not started</RecallBadge> : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {test.status === "in_progress" && test.attemptId ? (
                          <Button size="sm" onClick={() => navigate(REVISION_DEEP_LINKS.testPlayAttempt(test.attemptId!))}>
                            Resume
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => navigate(REVISION_DEEP_LINKS.testPlay(test.id))}>
                            {test.status === "completed" ? "Retake" : "Start"}
                          </Button>
                        )}
                        {test.attemptId ? (
                          <Button size="sm" variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.testResult(test.attemptId!))}>
                            Result
                          </Button>
                        ) : null}
                        {(test.status === "completed" || test.attemptCount > 0) && test.attemptId ? (
                          <Button size="sm" variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.testReview(test.attemptId!))}>
                            Review
                          </Button>
                        ) : null}
                        {test.status === "completed" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              try {
                                const attempt = startCustomTestRetake(uid, test.id);
                                navigate(REVISION_DEEP_LINKS.testPlayAttempt(attempt.id));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Could not start a retake.");
                              }
                            }}
                          >
                            Fresh retake
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-error"
                          onClick={() =>
                            confirm({
                              title: `Delete “${test.title}”?`,
                              body:
                                attempts.length > 0
                                  ? "Its attempts and results are deleted with it. This cannot be undone."
                                  : "This cannot be undone.",
                              confirmLabel: "Delete",
                              onConfirm: () => {
                                deleteCustomTestLocal(uid, test.id);
                                setReloadKey((key) => key + 1);
                              },
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>

                      {attempts.length > 0 ? (
                        <details className="text-sm">
                          <summary className={cn(typeClass.caption, "cursor-pointer text-on-surface-variant")}>
                            {attempts.length} attempt{attempts.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {attempts.map((attempt) => (
                              <li key={attempt.id} className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  className="truncate text-left text-sm text-primary underline-offset-2 hover:underline"
                                  onClick={() => navigate(REVISION_DEEP_LINKS.testResult(attempt.id))}
                                >
                                  {attempt.status === "completed" ? `Score ${attempt.score}%` : attempt.status}
                                  {attempt.completedAt ? ` · ${new Date(attempt.completedAt).toLocaleDateString()}` : ""}
                                </button>
                                <span className={cn(typeClass.caption, "text-on-surface-variant")}>
                                  {attempt.correctCount}/{attempt.questionCount}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </RecallCard>
                  </li>
                );
              })}
          </ul>
        )
      ) : data.questions.length === 0 ? (
        <RecallEmpty
          icon="🧠"
          title="Nothing in the revision bank yet"
          body="Questions enter the bank when a Daily Test, a saved test or a Smart Revision session shows you one."
        />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className={cn(typeClass.caption, "text-on-surface-variant")}>
              {data.questions.length} question{data.questions.length === 1 ? "" : "s"}
            </p>
            <Button size="sm" onClick={startSmartRevision}>
              Revise these
            </Button>
          </div>
          <ul className="space-y-2">
            {data.questions.slice(0, 200).map((row) => (
              <li key={row.id}>
                <RecallRow
                  title={row.prompt}
                  meta={`${row.subjectIcon} ${row.subjectName} · ${row.topicName} · seen ${row.timesSeen}×`}
                  trailing={
                    <span className="flex items-center gap-2">
                      <RecallBadge
                        tone={row.status === "mastered" ? "success" : row.status === "improving" ? "brand" : "warning"}
                      >
                        {row.status}
                      </RecallBadge>
                      <span className={cn(typeClass.caption, "tabular-nums")}>
                        {row.timesCorrect}/{row.timesSeen}
                      </span>
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {error ? (
        <p className={cn(typeClass.caption, "mt-4 text-error")} role="alert">
          {error}
        </p>
      ) : null}
      {dialog}
    </RecallPage>
  );
}
