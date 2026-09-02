import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import PageShell from "../components/PageShell";
import { useExitGuard } from "../components/ExitGuardContext";
import { Badge, ErrorState, FullScreenLoader, PrimaryButton, ProgressBar, SecondaryButton } from "../components/ui";
import { CheckIcon, ChevronRightIcon } from "../components/icons";
import {
  getRevisionSessionForPlayer,
  saveRevisionAnswer,
  submitRevisionSession,
  updateRevisionSessionIndex,
  ServiceError,
} from "../engine/revisionService";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

type PlayerData = ReturnType<typeof getRevisionSessionForPlayer>;

export default function RevisionSessionPage({ uid, route, sessionId }: { uid: string; route: string; sessionId: number }) {
  const { navigate, setGuard } = useExitGuard();

  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; code: string | null } | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    try {
      setPlayerData(getRevisionSessionForPlayer(uid, sessionId));
      setLoadError(null);
    } catch (err) {
      setLoadError({
        message: err instanceof ServiceError ? err.message : "We couldn't load this revision session.",
        code: err instanceof ServiceError ? err.code : null,
      });
    }
  }, [uid, sessionId, loadKey]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, number | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const initializedRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (playerData && !initializedRef.current) {
      initializedRef.current = true;
      setCurrentIndex(playerData.session.currentIndex ?? 0);
      const initSel: Record<number, number | null> = {};
      playerData.questions.forEach((q) => {
        initSel[q.id] = q.selectedIndex;
      });
      setSelections(initSel);
    }
  }, [playerData]);

  useEffect(() => {
    setGuard({
      message: "Your revision progress is saved. You can continue this session anytime from the Revision Bank.",
      confirmLabel: "Exit Session",
    });
    return () => setGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    const isInvalidState = loadError.code === "INVALID_STATE";
    return (
      <PageShell route={route} title="Revision Session" backHref="#/revision/bank" hideNav>
        {isInvalidState ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm text-white/75">This session has already finished.</p>
            <PrimaryButton className="w-auto px-6" onClick={() => navigate(`#/revision/session/${sessionId}/result`)}>
              View Results
            </PrimaryButton>
          </div>
        ) : (
          <ErrorState message={loadError.message} onRetry={() => setLoadKey((k) => k + 1)} />
        )}
      </PageShell>
    );
  }

  if (!playerData) {
    return (
      <PageShell route={route} title="Revision Session" backHref="#/revision/bank" hideNav>
        <FullScreenLoader label="Preparing your revision questions…" />
      </PageShell>
    );
  }

  const { questions } = playerData;
  const total = questions.length;
  const question = questions[currentIndex];
  const answeredCount = Object.values(selections).filter((v) => v !== null && v !== undefined).length;

  function persistIndex(idx: number) {
    setCurrentIndex(idx);
    try {
      updateRevisionSessionIndex(uid, sessionId, idx);
    } catch {
      // Best-effort — position persistence must never block navigation.
    }
  }
  function selectOption(optionIdx: number) {
    if (!question) return;
    setSelections((prev) => ({ ...prev, [question.id]: optionIdx }));
    try {
      saveRevisionAnswer(uid, sessionId, question.id, optionIdx);
      updateRevisionSessionIndex(uid, sessionId, currentIndex);
    } catch {
      // Answer stays in local UI state; submit treats any gap as skipped.
    }
  }
  function handleSubmit() {
    setSubmitting(true);
    try {
      submitRevisionSession(uid, sessionId);
      setGuard(null);
      navigate(`#/revision/session/${sessionId}/result`);
    } finally {
      setSubmitting(false);
    }
  }
  function goNext() {
    if (currentIndex < total - 1) persistIndex(currentIndex + 1);
    else handleSubmit();
  }
  function goPrev() {
    if (currentIndex > 0) persistIndex(currentIndex - 1);
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

  return (
    <PageShell route={route} title="Revision Session" subtitle={`Question ${currentIndex + 1} of ${total}`} backHref="#/revision/bank" hideNav>
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
          <PrimaryButton onClick={goNext} disabled={submitting} className="flex-[1.4]">
            {submitting ? (
              "Submitting…"
            ) : currentIndex === total - 1 ? (
              <>
                <CheckIcon className="h-4 w-4" /> Finish Session
              </>
            ) : (
              <>
                Next <ChevronRightIcon className="h-4 w-4" />
              </>
            )}
          </PrimaryButton>
        </div>
        <p className="pb-2 text-center text-[11px] font-medium text-white/55">{answeredCount} of {total} answered</p>
      </div>
    </PageShell>
  );
}
