/**
 * Daily Test / saved-test player — exam mode in the ported Recall language.
 *
 * The business flow is the same one the retired glass player implemented
 * (migration brief §5A), because it is the flow the backend expects:
 *
 *   resume      `#/revision/test/play-attempt/<attemptId>`  → the exact attempt
 *   saved test  `#/revision/test/play/<testId>`             → start or resume
 *   daily test  `#/revision/test/play`                      → today's next slot
 *   completed   → redirects to the result screen
 *
 * Answers are persisted per question (`saveTestAnswer`) exactly like before, so
 * a refresh, a crash or a killed WebView never loses progress; `ExitGuard`
 * interrupts navigation with the Recall-styled dialog. The learner-facing
 * presentation is Recall's (its card surfaces, tokens and typography) with the
 * focused, chrome-free layout the brief asks for on test screens.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";

import { Button } from "../recall/components/ui/button";
import { Progress } from "../recall/components/ui/progress";
import { cn } from "../recall/lib/utils";
import { typeClass } from "../recall/lib/surface";
import { cardSurface } from "../recall/lib/surface";
import { useTranslation } from "../recall/shims/i18n";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { useExitGuard } from "../components/ExitGuardContext";
import { RecallBadge, RecallCard, RecallError, RecallLoading } from "../components/recall-ui";
import { useConfirmAction } from "../components/useConfirmAction";
import {
  getAttemptForPlayer,
  getTodayTestState,
  saveTestAnswer,
  startOrResumeAttempt,
  submitTestAttempt,
  updateAttemptIndex,
} from "../engine/testService";
import { getCustomTestAttempt, startCustomTestAttempt } from "../engine/customTestService";
import { ServiceError } from "../engine/store";
import { refreshRevisionStoreFromLegacy } from "../integrations/storeBridge";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

type PlayerData = ReturnType<typeof getAttemptForPlayer>;

export default function TestPlayerPage({
  uid,
  testId = null,
  attemptId: requestedAttemptId = null,
}: {
  uid: string;
  testId?: number | null;
  attemptId?: number | null;
}) {
  const { t } = useTranslation();
  const { navigate } = useRevisionRoute();
  const { setGuard } = useExitGuard();
  const { confirm, dialog } = useConfirmAction();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [redirectAttemptId, setRedirectAttemptId] = useState<number | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, number | null>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initializedAttemptRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  /* ── Load: resolve the attempt exactly like the legacy player ─────────── */
  useEffect(() => {
    try {
      if (requestedAttemptId) {
        setPlayerData(getAttemptForPlayer(uid, requestedAttemptId));
        setLoadError(null);
        return;
      }
      if (testId) {
        const existing = getCustomTestAttempt(uid, testId);
        if (existing?.status === "completed") {
          setRedirectAttemptId(existing.id);
          return;
        }
        const attempt = startCustomTestAttempt(uid, testId);
        setPlayerData(getAttemptForPlayer(uid, attempt.id));
        setLoadError(null);
        return;
      }
      const today = getTodayTestState(uid);
      if (today.attempt?.status === "completed") {
        setRedirectAttemptId(today.attempt.id);
        return;
      }
      const attempt = startOrResumeAttempt(uid);
      setPlayerData(getAttemptForPlayer(uid, attempt.id));
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof ServiceError ? error.message : "We couldn't load the test. Please try again.",
      );
    }
  }, [uid, loadKey, requestedAttemptId, testId]);

  useEffect(() => {
    if (redirectAttemptId) navigate(REVISION_DEEP_LINKS.testResult(redirectAttemptId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectAttemptId]);

  useEffect(() => {
    if (!playerData) return;
    if (initializedAttemptRef.current === playerData.attempt.id) return;
    initializedAttemptRef.current = playerData.attempt.id;
    setCurrentIndex(playerData.attempt.currentIndex ?? 0);
    const initial: Record<number, number | null> = {};
    playerData.questions.forEach((question) => {
      initial[question.id] = question.selectedIndex;
    });
    setSelections(initial);
  }, [playerData]);

  /* ── The business safeguard, rendered in Recall style ─────────────────── */
  useEffect(() => {
    setGuard({
      message: "Your progress is saved automatically. You can continue this test anytime from the Test Bank.",
      confirmLabel: "Exit test",
    });
    return () => setGuard(null);
  }, [setGuard]);

  const questions = playerData?.questions ?? [];
  const total = questions.length;
  const question = questions[currentIndex];
  const answeredCount = Object.values(selections).filter((value) => value !== null && value !== undefined).length;

  const persistSelection = useCallback(
    (questionId: number, selectedIndex: number | null) => {
      if (!playerData) return;
      try {
        saveTestAnswer(uid, playerData.attempt.id, questionId, selectedIndex);
      } catch (error) {
        console.warn("[revision] could not save answer", error);
      }
    },
    [playerData, uid],
  );

  const goTo = useCallback(
    (index: number) => {
      if (!playerData) return;
      const clamped = Math.max(0, Math.min(total - 1, index));
      setCurrentIndex(clamped);
      try {
        updateAttemptIndex(uid, playerData.attempt.id, clamped);
      } catch (error) {
        console.warn("[revision] could not save index", error);
      }
    },
    [playerData, total, uid],
  );

  const submit = useCallback(async () => {
    if (!playerData) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      submitTestAttempt(uid, playerData.attempt.id);
      // A finished test feeds the revision bank + Weak Topics; refresh the
      // ported store so the change is visible without a reload.
      void refreshRevisionStoreFromLegacy(uid);
      navigate(REVISION_DEEP_LINKS.testResult(playerData.attempt.id));
    } catch (error) {
      setSubmitError(error instanceof ServiceError ? error.message : "Could not submit the test.");
    } finally {
      setSubmitting(false);
    }
  }, [navigate, playerData, uid]);

  const onTouchStart = (event: ReactTouchEvent) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: ReactTouchEvent) => {
    const start = touchStartXRef.current;
    touchStartXRef.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) < 60) return;
    if (delta < 0) goTo(currentIndex + 1);
    else goTo(currentIndex - 1);
  };

  const unanswered = useMemo(
    () => questions.filter((item) => selections[item.id] === null || selections[item.id] === undefined).length,
    [questions, selections],
  );

  if (redirectAttemptId) {
    return (
      <div className="py-16">
        <RecallLoading label="Opening your result…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <RecallError
          title="This test can't be opened"
          body={loadError}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}>
                Back to the Test Bank
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!playerData || !question) {
    return (
      <div className="py-16">
        <RecallLoading label="Preparing your test…" />
      </div>
    );
  }

  const progressPercent = total === 0 ? 0 : ((currentIndex + 1) / total) * 100;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Focused test header: no app chrome while a test is open (§22). */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}
          className={cn(typeClass.caption, "rounded-full px-3 py-1.5 text-on-surface-variant hover:bg-surface-container-low")}
        >
          ← Test Bank
        </button>
        <div className="flex items-center gap-2">
          <RecallBadge tone="brand">
            {currentIndex + 1} / {total}
          </RecallBadge>
          <RecallBadge>{answeredCount} answered</RecallBadge>
        </div>
      </header>

      <Progress value={progressPercent} className="mb-4" />

      <RecallCard className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {question.subjectIcon ? <span aria-hidden>{question.subjectIcon}</span> : null}
          <span className={cn(typeClass.caption, "text-on-surface-variant")}>
            {question.subjectName} · {question.topicName}
          </span>
          <RecallBadge
            tone={question.difficulty === "hard" ? "danger" : question.difficulty === "medium" ? "warning" : "success"}
          >
            {question.difficulty}
          </RecallBadge>
        </div>

        <p className={cn(typeClass["title-md"], "whitespace-pre-wrap")}>{question.prompt}</p>

        <ul className="space-y-2">
          {question.options.map((option, index) => {
            const selected = selections[question.id] === index;
            return (
              <li key={index}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    const next = selected ? null : index;
                    setSelections((previous) => ({ ...previous, [question.id]: next }));
                    persistSelection(question.id, next);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary-soft text-on-primary-container"
                      : "border-outline-variant bg-surface hover:bg-surface-container-low",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-outline-variant",
                    )}
                  >
                    {OPTION_LETTERS[index] ?? index + 1}
                  </span>
                  <span className={cn(typeClass["body-md"], "min-w-0 flex-1 whitespace-pre-wrap")}>{option}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" disabled={currentIndex === 0} onClick={() => goTo(currentIndex - 1)}>
            Previous
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSelections((previous) => ({ ...previous, [question.id]: null }));
                persistSelection(question.id, null);
              }}
            >
              Skip
            </Button>
            {currentIndex < total - 1 ? (
              <Button onClick={() => goTo(currentIndex + 1)}>Next</Button>
            ) : (
              <Button
                onClick={() =>
                  confirm({
                    title: "Submit this test?",
                    body:
                      unanswered > 0
                        ? `${unanswered} question${unanswered === 1 ? "" : "s"} unanswered will be marked skipped.`
                        : "Every question is answered.",
                    confirmLabel: "Submit",
                    onConfirm: submit,
                  })
                }
              >
                Submit
              </Button>
            )}
          </div>
        </div>
      </RecallCard>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className={cn(typeClass.caption, "text-on-surface-variant")}>
          {t("study.swipeHint", "Swipe left or right to move between questions.")}
        </p>
        <Button
          variant="ghost"
          className="text-error"
          disabled={submitting}
          onClick={() =>
            confirm({
              title: "Submit early?",
              body: unanswered > 0 ? `${unanswered} unanswered question(s) will be marked skipped.` : undefined,
              confirmLabel: "Submit",
              tone: "destructive",
              onConfirm: submit,
            })
          }
        >
          {submitting ? "Submitting…" : "Submit test"}
        </Button>
      </div>

      {submitError ? (
        <p className={cn(typeClass.caption, "mt-3 text-error")} role="alert">
          {submitError}
        </p>
      ) : null}

      {/* Question jump grid — the old player's index strip, in Recall chips. */}
      <details className="mt-5">
        <summary className={cn(typeClass.caption, "cursor-pointer text-on-surface-variant")}>
          Jump to a question
        </summary>
        <div className={cn(cardSurface("mt-2 flex flex-wrap gap-2 p-3"))}>
          {questions.map((item, index) => {
            const answered = selections[item.id] !== null && selections[item.id] !== undefined;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`Question ${index + 1}`}
                onClick={() => goTo(index)}
                className={cn(
                  "h-8 w-8 rounded-lg border text-xs font-semibold",
                  index === currentIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : answered
                      ? "border-tertiary bg-tertiary-container text-on-tertiary-container"
                      : "border-outline-variant text-on-surface-variant",
                )}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </details>

      {dialog}
    </div>
  );
}
