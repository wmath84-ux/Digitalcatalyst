/**
 * Digitalcatalyst panels for the ported Recall dashboard.
 *
 * Recall's dashboard answers "what should I review next?" for a card library.
 * Digitalcatalyst Revision additionally has an exam-day loop — today's Daily
 * Test, the plan it was generated from, the entitlement state and the Weak
 * Topics report — and §5 requires those to stay one tap away from the home
 * screen.
 *
 * They render below the ported dashboard, using the ported design tokens, so
 * the screen keeps a single visual language (no glass, no second system).
 */

import { useEffect, useMemo, useState } from "react";

import { Button } from "../recall/components/ui/button";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { useExitGuard } from "./ExitGuardContext";
import { RecallBadge, RecallCard, RecallProgress, RecallRow, RecallStat, SectionTitle } from "./recall-ui";
import { getDashboardData, getWeakTopics } from "../engine/statsService";
import { getTodayTestState } from "../engine/testService";
import { listCustomTests } from "../engine/customTestService";
import { findActiveSession, getRevisionSummary } from "../engine/revisionService";

export function RevisionDashboardExtras({
  uid,
  hasAccess,
  onRequireAccess,
}: {
  uid: string;
  hasAccess: boolean;
  onRequireAccess: () => boolean;
}) {
  const { navigate } = useRevisionRoute();
  const { setGuard } = useExitGuard();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener("revision-db-changed", refresh);
    return () => window.removeEventListener("revision-db-changed", refresh);
  }, []);

  // A test in progress (or a smart-revision session) is the most important
  // thing on this screen: the learner must be able to resume it in one tap.
  const data = useMemo(() => {
    void reloadKey;
    try {
      return {
        today: getTodayTestState(uid),
        dashboard: getDashboardData(uid),
        weak: getWeakTopics(uid),
        customTests: listCustomTests(uid),
        activeSession: findActiveSession(uid),
        summary: getRevisionSummary(uid),
        error: null as string | null,
      };
    } catch (error) {
      return {
        today: null,
        dashboard: null,
        weak: null,
        customTests: [],
        activeSession: null,
        summary: null,
        error: error instanceof Error ? error.message : "Could not read your revision data.",
      };
    }
  }, [uid, reloadKey]);

  useEffect(() => {
    setGuard(null);
  }, [setGuard]);

  if (data.error) {
    return (
      <div className="mt-6 rounded-2xl border border-error/40 bg-error-container p-4 text-on-error-container">
        <p className={typeClass["label-lg"]}>Exam data unavailable</p>
        <p className={cn(typeClass.caption, "mt-1 opacity-90")}>{data.error}</p>
      </div>
    );
  }

  const today = data.today;
  const dashboard = data.dashboard;
  const weak = data.weak;
  const testsToday = today ? `${today.completedToday}/${today.testsTotal}` : "0/0";

  return (
    <div className="mt-8 space-y-6">
      {/* ── Today's Daily Test ─────────────────────────────────────────── */}
      <section>
        <SectionTitle
          hint={
            dashboard
              ? `${dashboard.testsToday.completed}/${dashboard.testsToday.total} done · ${dashboard.quickStats.streak}-day streak`
              : undefined
          }
        >
          Today&apos;s test
        </SectionTitle>
        <RecallCard className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={cn(typeClass["title-md"], "truncate")}>
                {today?.dailyTest?.title ?? "Daily Test"}
              </p>
              <p className={cn(typeClass.caption, "mt-0.5 text-on-surface-variant")}>
                {today?.dailyTest
                  ? `${today.dailyTest.totalQuestions} questions · ~${today.dailyTest.estimatedMinutes} min`
                  : "No plan generated yet"}
              </p>
            </div>
            <RecallBadge tone={today?.attempt?.status === "in_progress" ? "warning" : "brand"}>
              {today?.attempt?.status === "in_progress"
                ? "In progress"
                : today?.attempt?.status === "completed"
                  ? "Done today"
                  : "Ready"}
            </RecallBadge>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <RecallStat label="Tests today" value={testsToday} />
            <RecallStat label="Questions" value={today?.dailyTest?.totalQuestions ?? 0} />
            <RecallStat label="Last test" value={today?.lastCompletedDate ?? "—"} />
          </div>

          <div className="flex flex-wrap gap-2">
            {today?.attempt?.status === "in_progress" ? (
              <Button onClick={() => navigate(REVISION_DEEP_LINKS.testPlayAttempt(today.attempt!.id))}>
                Resume test
              </Button>
            ) : today?.attempt?.status === "completed" ? (
              <>
                <Button variant="secondary" onClick={() => navigate(REVISION_DEEP_LINKS.testResult(today.attempt!.id))}>
                  See result
                </Button>
                <Button variant="outline" onClick={() => navigate(REVISION_DEEP_LINKS.testReview(today.attempt!.id))}>
                  Review answers
                </Button>
              </>
            ) : (
              <Button onClick={() => navigate(REVISION_DEEP_LINKS.testPlay())}>Start Daily Test</Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                if (!onRequireAccess()) return;
                navigate(REVISION_DEEP_LINKS.aiGenerate);
              }}
            >
              {hasAccess ? "Generate new test" : "Generate test (Pro)"}
            </Button>
          </div>
        </RecallCard>
      </section>

      {/* ── Resume an in-flight session ────────────────────────────────── */}
      {data.activeSession ? (
        <section>
          <SectionTitle>Continue studying</SectionTitle>
          <RecallRow
            icon="↻"
            title="Smart Revision in progress"
            meta={`${data.activeSession.currentIndex} of ${data.activeSession.totalQuestions} answered`}
            trailing="Resume"
            onClick={() => navigate(REVISION_DEEP_LINKS.session(data.activeSession!.id))}
          />
        </section>
      ) : null}

      {/* ── Test Bank snapshot ─────────────────────────────────────────── */}
      <section>
        <SectionTitle hint={`${data.customTests.length} saved`}>Test Bank</SectionTitle>
        {data.customTests.length === 0 ? (
          <RecallRow
            icon="🗂"
            title="No saved tests yet"
            meta="Generate or import a test and it lands here"
            trailing="Open"
            onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}
          />
        ) : (
          <div className="space-y-2">
            {data.customTests.slice(0, 4).map((test) => (
              <RecallRow
                key={test.id}
                icon={test.status === "in_progress" ? "▶" : test.status === "completed" ? "✓" : "📝"}
                title={test.title}
                meta={`${test.totalQuestions} questions · ${test.status === "completed" ? `Score ${test.score ?? 0}%` : test.status === "in_progress" ? "In progress" : "Not started"}`}
                trailing={`${test.attemptCount} attempt${test.attemptCount === 1 ? "" : "s"}`}
                onClick={() =>
                  navigate(
                    test.status === "in_progress" && test.attemptId
                      ? REVISION_DEEP_LINKS.testPlayAttempt(test.attemptId)
                      : REVISION_DEEP_LINKS.testPlay(test.id),
                  )
                }
              />
            ))}
            <Button variant="ghost" className="w-full" onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}>
              Open the Test Bank
            </Button>
          </div>
        )}
      </section>

      {/* ── Weak topics summary ───────────────────────────────────────── */}
      <section>
        <SectionTitle hint={weak?.hasData ? `${weak.weakestTopics.length} tracked` : undefined}>
          Weak Topics
        </SectionTitle>
        {weak?.hasData ? (
          <div className="space-y-2">
            {weak.recommendedTopics.slice(0, 3).map((topic) => (
              <RecallCard key={topic.topicId} padded className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn(typeClass["label-lg"], "truncate")}>
                      {topic.subjectIcon} {topic.topicName}
                    </p>
                    <p className={cn(typeClass.caption, "text-on-surface-variant")}>
                      {topic.subjectName} · {topic.wrong} wrong of {topic.total}
                    </p>
                  </div>
                  <span className={cn(typeClass["title-md"], "text-error")}>{topic.accuracy}%</span>
                </div>
                <RecallProgress value={topic.accuracy} />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(REVISION_DEEP_LINKS.weakTopics)}
                >
                  Focus this topic
                </Button>
              </RecallCard>
            ))}
          </div>
        ) : (
          <RecallRow
            icon="🎯"
            title="No weakness data yet"
            meta="Finish a Daily Test or a revision session to unlock this report"
            trailing="Open"
            onClick={() => navigate(REVISION_DEEP_LINKS.weakTopics)}
          />
        )}
      </section>

      {/* ── Full report links ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>More</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          <RecallRow icon="📈" title="Progress report" meta="Scores, accuracy and streaks" onClick={() => navigate(REVISION_DEEP_LINKS.progress)} />
          <RecallRow icon="🧠" title="Plan & AI settings" meta="Subjects, difficulty, AI provider" onClick={() => navigate(REVISION_DEEP_LINKS.profile)} />
          <RecallRow icon="✨" title="Generate a test with AI" meta="School AI or your own key" onClick={() => { if (onRequireAccess()) navigate(REVISION_DEEP_LINKS.aiGenerate); }} />
          <RecallRow icon="📥" title="Bulk import" meta="Paste questions and save them as a test" onClick={() => { if (onRequireAccess()) navigate(REVISION_DEEP_LINKS.bulkImport); }} />
        </div>
      </section>
    </div>
  );
}
