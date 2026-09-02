import { GlassSurface } from "../../components/ui/glass";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import PageShell from "../components/PageShell";
import { useExitGuard } from "../components/ExitGuardContext";
import { ErrorState, FullScreenLoader, PrimaryButton, ProgressBar, SecondaryButton, Badge } from "../components/ui";
import { CheckIcon, ChevronRightIcon, XIcon } from "../components/icons";
import { lockBodyScroll, unlockBodyScroll, useOverlayBox, type OverlayBoundsRef } from "../../components/ui/overlayBounds";
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

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

type PlayerData = ReturnType<typeof getAttemptForPlayer>;

export default function TestPlayerPage({
  uid,
  route,
  testId = null,
  attemptId: requestedAttemptId = null,
}: {
  uid: string;
  route: string;
  testId?: number | null;
  attemptId?: number | null;
}) {
  const { navigate, setGuard } = useExitGuard();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [redirectAttemptId, setRedirectAttemptId] = useState<number | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    try {
      if (requestedAttemptId) {
        setPlayerData(getAttemptForPlayer(uid, requestedAttemptId));
        setLoadError(null);
        return;
      }
      if (testId) {
        // Custom (user-generated) test: play this exact test.
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
    } catch (err) {
      setLoadError(err instanceof ServiceError ? err.message : "We couldn't load the test. Please try again.");
    }
  }, [uid, loadKey, requestedAttemptId, testId]);

  useEffect(() => {
    if (redirectAttemptId) {
      navigate(`#/revision/test/result/${redirectAttemptId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectAttemptId]);

  const attemptId = playerData?.attempt.id;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, number | null>>({});
  const [mode, setMode] = useState<"question" | "review">("question");
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initializedAttemptRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (playerData && initializedAttemptRef.current !== playerData.attempt.id) {
      initializedAttemptRef.current = playerData.attempt.id;
      setCurrentIndex(playerData.attempt.currentIndex ?? 0);
      const initSel: Record<number, number | null> = {};
      playerData.questions.forEach((q) => {
        initSel[q.id] = q.selectedIndex;
      });
      setSelections(initSel);
    }
  }, [playerData]);

  useEffect(() => {
    setGuard({
      message: "Your progress is saved automatically. You can continue this test anytime from the dashboard.",
      confirmLabel: "Exit Test",
    });
    return () => setGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const questions = useMemo(() => playerData?.questions ?? [], [playerData]);
  const total = questions.length;
  const question = questions[currentIndex];
  const answeredCount = Object.values(selections).filter((v) => v !== null && v !== undefined).length;
  const unansweredCount = total - answeredCount;

  if (redirectAttemptId) {
    return (
      <PageShell route={route} title="Daily Test" backHref="#/revision" hideNav>
        <FullScreenLoader label="Loading your results…" />
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell route={route} title="Daily Test" backHref="#/revision" hideNav>
        <ErrorState message={loadError} onRetry={() => setLoadKey((k) => k + 1)} />
      </PageShell>
    );
  }

  if (!playerData) {
    return (
      <PageShell route={route} title="Daily Test" backHref="#/revision" hideNav>
        <FullScreenLoader label="Preparing today's test…" />
      </PageShell>
    );
  }

  const { dailyTest } = playerData;

  function persistIndex(idx: number) {
    setCurrentIndex(idx);
    if (attemptId) {
      try {
        updateAttemptIndex(uid, attemptId, idx);
      } catch {
        // Best-effort — position persistence must never block navigation.
      }
    }
  }

  function selectOption(optionIdx: number) {
    if (!question || !attemptId) return;
    setSelections((prev) => ({ ...prev, [question.id]: optionIdx }));
    try {
      saveTestAnswer(uid, attemptId, question.id, optionIdx);
      updateAttemptIndex(uid, attemptId, currentIndex);
    } catch {
      // Answer stays in local UI state; submit fills any gap as skipped.
    }
  }

  function goNext() {
    if (currentIndex < total - 1) {
      persistIndex(currentIndex + 1);
    } else {
      setMode("review");
    }
  }

  function goPrev() {
    if (currentIndex > 0) persistIndex(currentIndex - 1);
  }

  function handleSubmit() {
    if (!attemptId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      submitTestAttempt(uid, attemptId);
      setGuard(null);
      navigate(`#/revision/test/result/${attemptId}`);
    } catch {
      setSubmitError("Could not submit your test. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onTouchStart(e: ReactTouchEvent) {
    touchStartXRef.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: ReactTouchEvent) {
    if (touchStartXRef.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) < 60) return;
    if (delta > 0) goPrev();
    else goNext();
  }

  if (mode === "review") {
    return (
      <PageShell route={route} title="Review & Submit" subtitle={`${answeredCount} of ${total} answered`} backHref="#/revision" hideNav>
        <ReviewBeforeSubmit
          questions={questions}
          selections={selections}
          onJump={(idx) => {
            setCurrentIndex(idx);
            setMode("question");
          }}
          onBack={() => setMode("question")}
          onSubmit={() => setShowSubmitConfirm(true)}
        />
        {showSubmitConfirm && (
          <SubmitConfirmModal
            unansweredCount={unansweredCount}
            submitting={submitting}
            errorMessage={submitError}
            onCancel={() => setShowSubmitConfirm(false)}
            onConfirm={handleSubmit}
          />
        )}
      </PageShell>
    );
  }

  return (
    <PageShell route={route} title={dailyTest.title} subtitle={`Question ${currentIndex + 1} of ${total}`} backHref="#/revision" hideNav>
      <div className="flex h-full flex-col">
        <div className="px-4 pt-3">
          <ProgressBar value={((currentIndex + 1) / total) * 100} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {question && (
            <div key={question.id} className="animate-fade-in">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone={question.difficulty}>{question.difficulty}</Badge>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white/85">
                  {question.subjectIcon} {question.subjectName} · {question.topicName}
                </span>
              </div>
              <h2 className="text-[19px] font-semibold leading-snug text-white">{question.prompt}</h2>

              <div className="mt-5 space-y-3">
                {question.options.map((opt, idx) => {
                  const selected = selections[question.id] === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectOption(idx)}
                      className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-medium transition active:scale-[0.99] ${
                        selected
                          ? "border-indigo-600 bg-indigo-500/15 text-indigo-200"
                          : "border-white/10 bg-white/[0.06] text-white/85 active:bg-white/[0.1]"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          selected ? "bg-indigo-600 text-white" : "bg-white/[0.12] text-white/75"
                        }`}
                      >
                        {OPTION_LETTERS[idx]}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={goNext}
                className="mt-4 flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-white/55 active:text-white/75"
              >
                Skip this question
              </button>
            </div>
          )}
        </div>

        <div className="dc-glass-toolbar flex gap-3 border-t border-white/10 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <SecondaryButton onClick={goPrev} disabled={currentIndex === 0} className="flex-[1]">
            Previous
          </SecondaryButton>
          <PrimaryButton onClick={goNext} className="flex-[1.4]">
            {currentIndex === total - 1 ? "Review & Submit" : "Next"}
            <ChevronRightIcon className="h-4 w-4" />
          </PrimaryButton>
        </div>
      </div>
    </PageShell>
  );
}

function ReviewBeforeSubmit({
  questions,
  selections,
  onJump,
  onBack,
  onSubmit,
}: {
  questions: PlayerData["questions"];
  selections: Record<number, number | null>;
  onJump: (idx: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-sm text-white/75">
          Tap any question to jump back and change your answer before you submit.
        </p>
        <div className="grid grid-cols-5 gap-2.5">
          {questions.map((q, idx) => {
            const answered = selections[q.id] !== null && selections[q.id] !== undefined;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onJump(idx)}
                className={`flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-bold transition active:scale-95 ${
                  answered
                    ? "border-indigo-400/30 bg-indigo-500/15 text-indigo-200"
                    : "border-amber-400/30 bg-amber-500/15 text-amber-200"
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-4 text-xs font-medium text-white/75">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Answered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Unanswered
          </span>
        </div>
      </div>
      <div className="dc-glass-toolbar flex gap-3 border-t border-white/10 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <SecondaryButton onClick={onBack} className="flex-1">
          Back
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} className="flex-1">
          Submit Test
        </PrimaryButton>
      </div>
    </div>
  );
}

function SubmitConfirmModal({
  unansweredCount,
  submitting,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  unansweredCount: number;
  submitting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const boundsRef = useRef<HTMLElement | null>(null);
  const [boundsReady, setBoundsReady] = useState(false);

  // Resolve the column the overlay must stay inside (the page's own
  // scroller, falling back to the revision content column). Re-queried on
  // every mount — and retried one frame later when the page shell has not
  // committed its <main> yet — so a missing element can never silently
  // downgrade the overlay to the full-window fallback on tablet/desktop.
  useLayoutEffect(() => {
    const resolve = () => {
      boundsRef.current =
        document.querySelector<HTMLElement>("[data-revision-page-main]") ??
        document.querySelector<HTMLElement>("[data-revision-content]") ??
        null;
      return boundsRef.current !== null;
    };
    if (!resolve()) {
      const raf = requestAnimationFrame(() => {
        resolve();
        setBoundsReady(true);
      });
      return () => cancelAnimationFrame(raf);
    }
    setBoundsReady(true);
  }, []);

  const { scoped, box } = useOverlayBox(boundsReady, boundsRef as OverlayBoundsRef);
  const isScoped = scoped && box !== null;

  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // Defensive clamp: even if a measurement is stale or degenerate, the
  // overlay must never extend below the visible viewport — the dialog
  // stays fully on screen without any scrolling on every tablet and
  // desktop size.
  const overlayHeight =
    isScoped && box
      ? Math.max(0, Math.min(box.height, window.innerHeight - box.top))
      : undefined;

  return (
    <div
      data-rev-submit-overlay
      className={
        isScoped && box
          ? "fixed z-[90] flex items-center justify-center p-3 sm:p-4"
          : "fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      }
      style={
        isScoped && box
          ? { top: box.top, left: box.left, width: box.width, height: overlayHeight }
          : undefined
      }
    >
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] ${isScoped ? "rounded-[1.5rem]" : ""}`}
        onClick={submitting ? undefined : onCancel}
        aria-hidden="true"
      />
      <GlassSurface
        role="dialog"
        aria-modal="true"
        aria-labelledby="rev-submit-title"
        data-rev-submit-dialog
        tint={0.5}
        radius={24}
        className="custom-scrollbar relative w-full max-w-[min(100%,26rem)] overflow-hidden text-white"
        contentClassName="flex flex-col p-5 sm:p-6"
        style={{
          maxHeight: isScoped && box ? "100%" : undefined,
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/[0.12] sm:hidden" />
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-300">
          <CheckIcon className="h-7 w-7" />
        </div>
        <h3 id="rev-submit-title" className="text-center text-base font-semibold text-white sm:text-lg">Submit your test?</h3>
        {unansweredCount > 0 ? (
          <p className="mt-2 text-center text-sm leading-relaxed text-white/75">
            You have <span className="font-semibold text-amber-300">{unansweredCount} unanswered question{unansweredCount === 1 ? "" : "s"}</span>{" "}
            that will be marked as skipped. This can&apos;t be undone.
          </p>
        ) : (
          <p className="mt-2 text-center text-sm leading-relaxed text-white/75">
            All questions are answered. Once submitted, you can&apos;t change your answers.
          </p>
        )}
        {errorMessage && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-rose-300">
            <XIcon className="h-3.5 w-3.5" /> {errorMessage}
          </p>
        )}
        <div className="mt-5 flex min-w-0 gap-3">
          <SecondaryButton onClick={onCancel} disabled={submitting} className="min-w-0 flex-1">
            Keep Reviewing
          </SecondaryButton>
          <PrimaryButton onClick={onConfirm} disabled={submitting} className="min-w-0 flex-1">
            {submitting ? "Submitting…" : "Submit"}
          </PrimaryButton>
        </div>
      </GlassSurface>
    </div>
  );
}
