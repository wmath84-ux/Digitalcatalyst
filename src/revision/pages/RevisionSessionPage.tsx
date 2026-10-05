/**
 * Smart Revision session — the legacy `#/revision/session/<id>` deep link,
 * rendered with the ported Recall study surfaces.
 *
 * Smart Revision remains a first-class Digitalcatalyst capability (§5B): it is
 * built from the learner's own revision bank, filtered by subject/topic/
 * difficulty, resumable, and it updates the mastery state machine
 * (learning → improving → mastered) exactly as before. The screen itself now
 * looks and behaves like Recall: one card at a time, big tap targets, swipe on
 * touch, keyboard 1–9 to answer, ←/→ to move, and the same progress header.
 */

import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";

import { Button } from "../recall/components/ui/button";
import { Progress } from "../recall/components/ui/progress";
import { cn } from "../recall/lib/utils";
import { cardSurface, typeClass } from "../recall/lib/surface";
import { useTranslation } from "../recall/shims/i18n";
import { useRevisionRoute } from "../integrations/route-context";
import { REVISION_DEEP_LINKS } from "../integrations/routes";
import { useExitGuard } from "../components/ExitGuardContext";
import { RecallBadge, RecallCard, RecallError, RecallLoading } from "../components/recall-ui";
import { useConfirmAction } from "../components/useConfirmAction";
import {
  getRevisionSessionForPlayer,
  saveRevisionAnswer,
  submitRevisionSession,
  updateRevisionSessionIndex,
} from "../engine/revisionService";
import { ServiceError } from "../engine/revisionService";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

type PlayerData = ReturnType<typeof getRevisionSessionForPlayer>;

export default function RevisionSessionPage({ uid, sessionId }: { uid: string; sessionId: number | null }) {
  const { t } = useTranslation();
  const { navigate } = useRevisionRoute();
  const { setGuard } = useExitGuard();
  const { confirm, dialog } = useConfirmAction();

  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; code: string | null } | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Record<number, number | null>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initializedRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoadError({ message: "This session link is missing its id.", code: "NOT_FOUND" });
      return;
    }
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

  useEffect(() => {
    if (playerData && !initializedRef.current) {
      initializedRef.current = true;
      setCurrentIndex(playerData.session.currentIndex ?? 0);
      const initial: Record<number, number | null> = {};
      playerData.questions.forEach((question) => {
        initial[question.id] = question.selectedIndex;
      });
      setSelections(initial);
    }
  }, [playerData]);

  useEffect(() => {
    setGuard({
      message: "Your revision progress is saved. You can continue this session anytime from the Test Bank.",
      confirmLabel: "Exit session",
    });
    return () => setGuard(null);
  }, [setGuard]);

  const questions = playerData?.questions ?? [];
  const total = questions.length;
  const question = questions[currentIndex];

  const persistIndex = useCallback(
    (index: number) => {
      if (!sessionId) return;
      setCurrentIndex(index);
      try {
        updateRevisionSessionIndex(uid, sessionId, index);
      } catch {
        /* position persistence is best-effort */
      }
    },
    [sessionId, uid],
  );

  const selectOption = useCallback(
    (optionIndex: number) => {
      if (!question || !sessionId) return;
      setSelections((previous) => ({ ...previous, [question.id]: optionIndex }));
      try {
        saveRevisionAnswer(uid, sessionId, question.id, optionIndex);
      } catch {
        /* the answer stays in local state; submit treats gaps as skipped */
      }
    },
    [question, sessionId, uid],
  );

  const submit = useCallback(async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      submitRevisionSession(uid, sessionId);
      setGuard(null);
      navigate(REVISION_DEEP_LINKS.sessionResult(sessionId));
    } catch (err) {
      setNotice(err instanceof ServiceError ? err.message : "Could not submit this session.");
    } finally {
      setSubmitting(false);
    }
  }, [navigate, sessionId, setGuard, uid]);

  /* Keyboard: 1–9 answers, ←/→ navigates — the Recall study contract. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!question) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowRight" && currentIndex < total - 1) {
        persistIndex(currentIndex + 1);
        return;
      }
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        persistIndex(currentIndex - 1);
        return;
      }
      const numeric = Number(event.key);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= question.options.length) {
        event.preventDefault();
        selectOption(numeric - 1);
        if (currentIndex < total - 1) window.setTimeout(() => persistIndex(currentIndex + 1), 150);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, persistIndex, question, selectOption, total]);

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
    if (delta < 0 && currentIndex < total - 1) persistIndex(currentIndex + 1);
    else if (delta > 0 && currentIndex > 0) persistIndex(currentIndex - 1);
  };

  if (loadError) {
    const finished = loadError.code === "INVALID_STATE";
    return (
      <div className="mx-auto max-w-xl py-10">
        <RecallError
          title={finished ? "This session has already finished" : "This session can't be opened"}
          body={finished ? "Open its result to see how you did." : loadError.message}
          action={
            finished && sessionId ? (
              <Button onClick={() => navigate(REVISION_DEEP_LINKS.sessionResult(sessionId))}>View results</Button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={() => setLoadKey((key) => key + 1)}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={() => navigate(REVISION_DEEP_LINKS.testBank)}>
                  Back to the Test Bank
                </Button>
              </div>
            )
          }
        />
      </div>
    );
  }

  if (!playerData || !question) {
    return (
      <div className="py-16">
        <RecallLoading label="Preparing your revision questions…" />
      </div>
    );
  }

  const answeredCount = Object.values(selections).filter((value) => value !== null && value !== undefined).length;
  const isLast = currentIndex === total - 1;

  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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

      <Progress value={total === 0 ? 0 : ((currentIndex + 1) / total) * 100} className="mb-4" />

      <RecallCard className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden>{question.subjectIcon}</span>
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
                  onClick={() => selectOption(index)}
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
          <Button variant="outline" disabled={currentIndex === 0} onClick={() => persistIndex(currentIndex - 1)}>
            Previous
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setSelections((previous) => ({ ...previous, [question.id]: null }));
                try {
                  if (sessionId) saveRevisionAnswer(uid, sessionId, question.id, null);
                } catch {
                  /* ignore */
                }
                if (!isLast) persistIndex(currentIndex + 1);
              }}
            >
              Skip
            </Button>
            {!isLast ? (
              <Button onClick={() => persistIndex(currentIndex + 1)}>Next</Button>
            ) : (
              <Button
                disabled={submitting}
                onClick={() =>
                  confirm({
                    title: "Finish this session?",
                    body:
                      answeredCount < total
                        ? `${total - answeredCount} question${total - answeredCount === 1 ? "" : "s"} unanswered will count as skipped.`
                        : "Every question is answered.",
                    confirmLabel: "Finish",
                    onConfirm: submit,
                  })
                }
              >
                Finish
              </Button>
            )}
          </div>
        </div>
      </RecallCard>

      <p className={cn(typeClass.caption, "mt-4 text-on-surface-variant")}>
        {t("study.keyboardHint", "Press 1–4 to answer, arrow keys to move, swipe on touch screens.")}
      </p>

      {answeredCount < total ? (
        <div className={cn(cardSurface("mt-4 flex flex-wrap gap-2 p-3"))}>
          {questions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Question ${index + 1}`}
              onClick={() => persistIndex(index)}
              className={cn(
                "h-8 w-8 rounded-lg border text-xs font-semibold",
                index === currentIndex
                  ? "border-primary bg-primary text-primary-foreground"
                  : selections[item.id] !== null && selections[item.id] !== undefined
                    ? "border-tertiary bg-tertiary-container text-on-tertiary-container"
                    : "border-outline-variant text-on-surface-variant",
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p className={cn(typeClass.caption, "mt-3 text-error")} role="alert">
          {notice}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" className="text-error" disabled={submitting} onClick={() => confirm({
          title: "Finish this session?",
          body: answeredCount < total ? `${total - answeredCount} unanswered question(s) will count as skipped.` : undefined,
          confirmLabel: "Finish",
          tone: "destructive",
          onConfirm: submit,
        })}>
          {submitting ? "Finishing…" : "Finish session"}
        </Button>
      </div>

      {dialog}
    </div>
  );
}
