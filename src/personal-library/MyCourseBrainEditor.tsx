// src/personal-library/MyCourseBrainEditor.tsx
//
// The Brain (MCQ) builder for a learner-authored course — the SAME capability
// the admin has on the Product / Course-content page, restyled for the
// learner's dark Study Library.
//
// It writes the identical shape the Course Player's Brain tab reads
// (`practiceQuestions` — see utils/practiceSet.js), so a set typed here is a
// real practice set in the player: same answering UI, same scoring, same
// explanations.
//
// Two ways in, exactly like the admin panel:
//   1. paste a block of questions (the shared `parseQuestionText` parser —
//      ✓ / * / [correct] / "Answer: B" all mark the right option), or
//   2. add questions by hand, with difficulty + topic + explanation.

import { useState } from "react";
import {
  CheckCircle2, ClipboardPaste, Plus, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { parseQuestionText } from "@/revision/engine/bulkParser";
import { MAX_PRACTICE_OPTIONS, MAX_PRACTICE_QUESTIONS, MIN_PRACTICE_OPTIONS } from "../../utils/practiceSet.js";
import type { MyCourseQuestion } from "../types/myCourse";
import { createMyQuestion } from "../lib/myCourseClient";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
const DIFFICULTIES: Array<{ id: MyCourseQuestion["difficulty"]; label: string }> = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

const SAMPLE_TEXT = `1. What is the derivative of x²?
A. x
B. 2x ✓
C. x²
D. 2
Explanation: The power rule brings the exponent down.

2. Which gas do plants absorb during photosynthesis?
A. Oxygen
B. Nitrogen
C. Carbon dioxide *
D. Hydrogen
Explanation: Plants take in CO₂ and release O₂.`;

/** What is still missing on one question — mirrors the player's own rule. */
export const myQuestionIssues = (question: MyCourseQuestion): string[] => {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push("no question text");
  if (question.options.map((option) => option.trim()).filter(Boolean).length < MIN_PRACTICE_OPTIONS) {
    issues.push(`needs ${MIN_PRACTICE_OPTIONS} options`);
  }
  if (!(question.correctIndex >= 0 && question.correctIndex < question.options.length)) issues.push("no answer marked");
  return issues;
};

export const myQuestionsReadyCount = (questions: MyCourseQuestion[] = []): number =>
  questions.filter((question) => myQuestionIssues(question).length === 0).length;

interface MyCourseBrainEditorProps {
  questions: MyCourseQuestion[];
  title: string;
  onChange: (next: { questions: MyCourseQuestion[]; title: string }) => void;
}

export default function MyCourseBrainEditor({ questions, title, onChange }: MyCourseBrainEditorProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);

  const readyCount = myQuestionsReadyCount(questions);
  const total = questions.length;

  const patchQuestion = (id: string, patch: Partial<MyCourseQuestion>) => {
    onChange({
      title,
      questions: questions.map((question) => (question.id === id ? { ...question, ...patch } : question)),
    });
  };

  const moveQuestion = (index: number, delta: number) => {
    const destination = index + delta;
    if (destination < 0 || destination >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(index, 1);
    next.splice(destination, 0, moved);
    onChange({ title, questions: next });
  };

  const removeQuestion = (id: string) => {
    onChange({ title, questions: questions.filter((question) => question.id !== id) });
  };

  const addQuestion = () => {
    if (total >= MAX_PRACTICE_QUESTIONS) return;
    onChange({ title, questions: [...questions, createMyQuestion()] });
  };

  const importPasted = () => {
    const parsed = parseQuestionText(pasted);
    if (!parsed.length) {
      setImportNote("No questions were found in that text — check the format and try again.");
      return;
    }
    const imported: MyCourseQuestion[] = parsed.map((question) => ({
      id: createMyQuestion().id,
      prompt: question.prompt,
      options: question.options.length ? question.options.slice(0, MAX_PRACTICE_OPTIONS) : ["", ""],
      correctIndex: question.correctIndex,
      explanation: question.explanation || "",
      difficulty: "medium",
      topic: "",
    }));
    onChange({ title, questions: [...questions, ...imported].slice(0, MAX_PRACTICE_QUESTIONS) });
    setPasted("");
    setPasteOpen(false);
    setImportNote(`${imported.length} question${imported.length === 1 ? "" : "s"} imported. Mark any answer the parser missed.`);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3" data-my-brain-editor>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-200">
          <Sparkles size={13} /> Brain · practice set
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${readyCount === total && total > 0
            ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
            : "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30"}`}
          data-my-brain-status
        >
          {total === 0
            ? "Questions required"
            : readyCount === total
              ? `${total} question${total === 1 ? "" : "s"} ready`
              : `${readyCount} of ${total} ready`}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPasteOpen((open) => !open)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-white/70 ring-1 ring-white/15 transition hover:bg-white/10"
            data-my-brain-paste-toggle
          >
            <ClipboardPaste size={12} /> {pasteOpen ? "Close" : "Paste questions"}
          </button>
          <button
            type="button"
            onClick={addQuestion}
            disabled={total >= MAX_PRACTICE_QUESTIONS}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 text-[11px] font-black text-emerald-100 ring-1 ring-emerald-400/30 transition hover:bg-emerald-500/30 disabled:opacity-40"
            data-my-brain-add
          >
            <Plus size={12} /> Add question
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-white/50">Set name (optional)</span>
        <input
          value={title}
          onChange={(event) => onChange({ questions, title: event.target.value })}
          placeholder="e.g. Chapter 1 — quick check"
          className={inputClass}
          data-my-brain-title
        />
      </label>

      {pasteOpen ? (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3" data-my-brain-paste>
          <p className="text-[11px] leading-5 text-white/55">
            Paste your questions in one block. Mark the correct option with <strong>✓</strong>, <strong>*</strong> or{" "}
            <strong>[correct]</strong>, or add an <strong>Answer: B</strong> line. Explorations go on an{" "}
            <strong>Explanation:</strong> line.
          </p>
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={7}
            placeholder={SAMPLE_TEXT}
            className={`${inputClass} resize-y py-2 font-mono text-[11px] leading-5`}
            data-my-brain-paste-input
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={importPasted}
              disabled={!pasted.trim()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 text-[11px] font-black text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
              data-my-brain-import
            >
              <Wand2 size={12} /> Import {pasted.trim() ? "questions" : ""}
            </button>
            <button
              type="button"
              onClick={() => setPasted(SAMPLE_TEXT)}
              className="inline-flex min-h-9 items-center rounded-full px-3 text-[11px] font-black text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
            >
              Insert sample
            </button>
          </div>
        </div>
      ) : null}

      {importNote ? (
        <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-100" role="status">
          {importNote}
        </p>
      ) : null}

      <div className="space-y-2">
        {questions.map((question, index) => {
          const issues = myQuestionIssues(question);
          const complete = issues.length === 0;
          return (
            <article
              key={question.id}
              className={`space-y-2 rounded-2xl border p-3 ${complete ? "border-white/10 bg-black/25" : "border-amber-400/30 bg-amber-500/[0.07]"}`}
              data-my-brain-question={question.id}
              data-my-brain-question-complete={complete ? "true" : "false"}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-black">
                  {index + 1}
                </span>
                {complete ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-200">
                    <CheckCircle2 size={11} /> Ready
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-100">
                    {issues.join(" · ")}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-0.5">
                  <IconButton label="Move question up" onClick={() => moveQuestion(index, -1)} disabled={index === 0}>
                    <span className="text-[13px] leading-none">↑</span>
                  </IconButton>
                  <IconButton
                    label="Move question down"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === questions.length - 1}
                  >
                    <span className="text-[13px] leading-none">↓</span>
                  </IconButton>
                  <IconButton label="Delete question" onClick={() => removeQuestion(question.id)} tone="danger">
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>

              <textarea
                value={question.prompt}
                onChange={(event) => patchQuestion(question.id, { prompt: event.target.value })}
                rows={2}
                placeholder="Question text"
                className={`${inputClass} resize-y py-2`}
                data-my-brain-prompt
              />

              <div className="space-y-1.5">
                {question.options.map((option, optionIndex) => {
                  const marked = question.correctIndex === optionIndex;
                  return (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => patchQuestion(question.id, { correctIndex: optionIndex })}
                        aria-label={`Mark option ${OPTION_LETTERS[optionIndex] || optionIndex + 1} as the answer`}
                        aria-pressed={marked}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black ring-1 transition ${marked
                          ? "bg-emerald-500/25 text-emerald-100 ring-emerald-400/50"
                          : "bg-white/[0.06] text-white/55 ring-white/10 hover:bg-white/10"}`}
                        data-my-brain-option-mark={optionIndex}
                        data-marked={marked ? "true" : "false"}
                        title="Mark as the correct answer"
                      >
                        {OPTION_LETTERS[optionIndex] || optionIndex + 1}
                      </button>
                      <input
                        value={option}
                        onChange={(event) =>
                          patchQuestion(question.id, {
                            options: question.options.map((value, at) => (at === optionIndex ? event.target.value : value)),
                          })
                        }
                        placeholder={`Option ${OPTION_LETTERS[optionIndex] || optionIndex + 1}`}
                        className={inputClass}
                      />
                      <IconButton
                        label="Remove option"
                        onClick={() =>
                          patchQuestion(question.id, {
                            options: question.options.filter((_, at) => at !== optionIndex),
                            correctIndex:
                              question.correctIndex === optionIndex
                                ? -1
                                : question.correctIndex > optionIndex
                                  ? question.correctIndex - 1
                                  : question.correctIndex,
                          })
                        }
                        disabled={question.options.length <= MIN_PRACTICE_OPTIONS}
                        tone="danger"
                      >
                        <span className="text-[13px] leading-none">×</span>
                      </IconButton>
                    </div>
                  );
                })}
                {question.options.length < MAX_PRACTICE_OPTIONS ? (
                  <button
                    type="button"
                    onClick={() => patchQuestion(question.id, { options: [...question.options, ""] })}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200/90 hover:bg-white/5"
                  >
                    <Plus size={11} /> Add option
                  </button>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_140px]">
                <input
                  value={question.explanation}
                  onChange={(event) => patchQuestion(question.id, { explanation: event.target.value })}
                  placeholder="Explanation (shown after answering)"
                  className={inputClass}
                />
                <select
                  value={question.difficulty}
                  onChange={(event) =>
                    patchQuestion(question.id, { difficulty: event.target.value as MyCourseQuestion["difficulty"] })
                  }
                  className={`${inputClass} appearance-none`}
                  aria-label="Difficulty"
                >
                  {DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty.id} value={difficulty.id} className="bg-slate-900">
                      {difficulty.label}
                    </option>
                  ))}
                </select>
                <input
                  value={question.topic}
                  onChange={(event) => patchQuestion(question.id, { topic: event.target.value })}
                  placeholder="Topic (optional)"
                  className={inputClass}
                />
              </div>
            </article>
          );
        })}

        {total === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-6 text-center text-[11px] font-semibold text-white/45">
            No questions yet — paste a block or add them one by one.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── shared atoms (kept local so the editor page stays one file-friendly) ── */

export const inputClass =
  "min-h-10 w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[13px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60";

export const labelClass = "mb-1 block text-[10px] font-black uppercase tracking-wide text-white/50";

export function IconButton({
  label,
  onClick,
  disabled,
  tone = "normal",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "normal" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-25 ${tone === "danger" ? "text-rose-300" : "text-white/60"}`}
    >
      {children}
    </button>
  );
}

