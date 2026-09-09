import { Check, CircleCheck, Send, X } from "lucide-react";
import type { InteractiveQuiz } from "../lib/types";
import { cn } from "../utils/cn";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/**
 * Interactive practice set. The user picks one option per question directly in
 * the chat, then submits — the completed answer sheet is sent back to Lumen,
 * which grades it and explains every question step by step.
 */
export default function QuizCard({
  quiz,
  onAnswer,
  onSubmit,
}: {
  quiz: InteractiveQuiz;
  onAnswer: (qIdx: number, optIdx: number) => void;
  onSubmit: () => void;
}) {
  const total = quiz.questions.length;
  const answered = quiz.answers.filter((a) => a != null).length;
  const allAnswered = answered === total;

  return (
    <div className="anim-fade-up mt-3 max-w-[580px] overflow-hidden rounded-[14px] border border-[--border] bg-[--surface] shadow-[var(--sh-xs)]">
      {/* header */}
      <div className="border-b border-[--border] px-3.5 pb-3 pt-3 sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex-none rounded-[6px] bg-[--accent-soft] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-[--accent-ink]">
            Practice
          </span>
          {quiz.level && (
            <span
              className="mono flex-none rounded-[6px] border border-[--border] bg-[--hover] px-1.5 py-0.5 text-[10px] font-semibold text-[--ink-3]"
              title={`Calibrated to your current level on this topic (L${quiz.level} of 3)`}
            >
              L{quiz.level}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-[--ink]">{quiz.topic}</span>
          <span className="mono flex-none text-[11px] tabular-nums text-[--ink-3]" aria-live="polite">
            {answered}/{total}
          </span>
        </div>
        {/* progress track */}
        <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-[--hover]" aria-hidden="true">
          <div
            className="h-full rounded-full bg-[--accent] transition-[width] duration-300 ease-out"
            style={{ width: `${(answered / total) * 100}%` }}
          />
        </div>
      </div>

      {/* questions */}
      <div className="flex flex-col">
        {quiz.questions.map((q, qi) => {
          const picked = quiz.answers[qi];
          return (
            <div key={qi} className={cn("px-3.5 py-3.5 sm:px-4", qi > 0 && "border-t border-[--border]")}>
              <div className="flex items-start gap-2.5">
                <span className="mono mt-px flex-none text-[11px] tabular-nums text-[--ink-4]">{String(qi + 1).padStart(2, "0")}</span>
                <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-[--ink]">{q.q}</p>
                {quiz.submitted && (
                  <span
                    aria-label={picked === q.correct ? "Correct" : "Incorrect"}
                    className={cn(
                      "mt-[-1px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full",
                      picked === q.correct ? "bg-[--ok-bg] text-[--ok]" : "bg-[--err-bg] text-[--err]"
                    )}
                  >
                    {picked === q.correct ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : <X size={11} strokeWidth={3} aria-hidden="true" />}
                  </span>
                )}
              </div>

              <div role="radiogroup" aria-label={`Question ${qi + 1}`} className="mt-2.5 flex flex-col gap-1.5">
                {q.options.map((opt, oi) => {
                  const isPicked = picked === oi;
                  const isCorrect = oi === q.correct;
                  const showCorrect = quiz.submitted && isCorrect;
                  const showWrongPick = quiz.submitted && isPicked && !isCorrect;
                  return (
                    <button
                      key={oi}
                      type="button"
                      role="radio"
                      aria-checked={isPicked}
                      disabled={quiz.submitted}
                      onClick={() => onAnswer(qi, oi)}
                      className={cn(
                        "focus-ring flex w-full items-center gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-all",
                        quiz.submitted ? "cursor-default" : "cursor-pointer",
                        showCorrect && "border-[#bfe3d2] bg-[--ok-bg]",
                        showWrongPick && "border-[--err-border] bg-[--err-bg]",
                        !quiz.submitted && isPicked && "border-[--ring-strong] bg-[--accent-soft] shadow-[0_0_0_3px_var(--ring)]",
                        !quiz.submitted && !isPicked && "border-[--border] bg-[--surface] hover:border-[--border-2] hover:bg-[--hover]",
                        quiz.submitted && !showCorrect && !showWrongPick && "border-[--border] bg-[--surface] opacity-60"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mono flex h-[20px] w-[20px] flex-none items-center justify-center rounded-[6px] border text-[10.5px] font-semibold",
                          showCorrect && "border-transparent bg-[--ok] text-white",
                          showWrongPick && "border-transparent bg-[--err] text-white",
                          !quiz.submitted && isPicked && "border-transparent bg-[--accent] text-white",
                          !quiz.submitted && !isPicked && "border-[--border-2] bg-[--hover] text-[--ink-3]",
                          quiz.submitted && !showCorrect && !showWrongPick && "border-[--border] bg-[--hover] text-[--ink-4]"
                        )}
                      >
                        {LETTERS[oi]}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-[13px] leading-snug",
                          showCorrect ? "font-medium text-[--ink]" : showWrongPick ? "text-[--ink-2]" : isPicked ? "font-medium text-[--ink]" : "text-[--ink-2]"
                        )}
                      >
                        {opt}
                      </span>
                      {showCorrect && <Check size={14} strokeWidth={2.5} className="flex-none text-[--ok]" aria-hidden="true" />}
                      {showWrongPick && <X size={14} strokeWidth={2.5} className="flex-none text-[--err]" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center gap-3 border-t border-[--border] bg-[--hover] px-3.5 py-2.5 sm:px-4">
        {quiz.submitted ? (
          <div className="flex items-center gap-2 text-[12px] font-medium text-[--ink-2]" role="status">
            <CircleCheck size={14.5} className="flex-none text-[--ok]" aria-hidden="true" />
            Answers sent — Lumen's step-by-step feedback is below.
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 truncate text-[12px] text-[--ink-3]">
              {allAnswered ? "All answered — ready when you are." : `Answer all ${total} to get graded feedback.`}
            </div>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!allAnswered}
              className={cn(
                "focus-ring flex h-[32px] flex-none items-center gap-1.5 rounded-[9px] px-3.5 text-[12.5px] font-semibold text-white transition-colors",
                allAnswered ? "bg-[--accent] hover:bg-[--accent-hover] active:bg-[--accent-press]" : "cursor-not-allowed bg-[--active] text-[--ink-4]"
              )}
            >
              <Send size={13} aria-hidden="true" />
              Check my answers
            </button>
          </>
        )}
      </div>
    </div>
  );
}
