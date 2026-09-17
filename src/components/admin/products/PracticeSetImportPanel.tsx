"use client";

// Admin · Product editor — Brain practice-set importer.
//
// Part 12 of the Brain update. The admin picks resource type
// "Brain · practice set" on the Product / Course-content page and this panel
// gives them the SAME bulk-import flow the learner-facing revision profile
// page hosts (`src/revision/pages/BulkImportPage.tsx`):
//
//   paste the plain-text questions → the shared parser (`parseQuestionText`)
//   detects prompts, options, the correct answer and explanations → preview →
//   edit anything → save.
//
// On top of the pasted import the admin can CREATE and ADD questions by hand
// ("Add question manually"), edit any prompt / option / answer / explanation,
// set the difficulty + topic label, and remove questions or options — i.e.
// everything the revision importer does, plus the hand-written path, for the
// specific module they are editing.
//
// What is saved here is what the Course Player's Brain tab shows: the panel
// writes `practiceQuestions` + `practiceTitle` on the resource, the mapping
// layer (utils/productMapping.js → utils/practiceSet.js) carries them into the
// product document and the player reads them off the course tree. There is no
// second copy of the questions anywhere.
//
// DRAFTS ARE KEPT: a half-written question stays in the editor blob exactly as
// typed, so nothing the admin wrote is ever silently dropped. Only complete
// sets (every question with a prompt, ≥2 options and a marked answer) are
// publishable / reach the player — ProductEditor's validation says so out loud
// and the panel's pills name what is still missing.

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, ListPlus, Sparkles, Trash2, Upload } from "lucide-react";
import { Field, Pill, SecondaryButton, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { parseQuestionText } from "@/revision/engine/bulkParser";
import { MAX_PRACTICE_OPTIONS, MAX_PRACTICE_QUESTIONS, MIN_PRACTICE_OPTIONS } from "../../../../utils/practiceSet.js";
import type { ProductPracticeQuestion } from "@/lib/admin/types";

const DIFFICULTIES: ProductPracticeQuestion["difficulty"][] = ["easy", "medium", "hard"];
const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const SAMPLE_TEXT = `1. What is the derivative of x²?
A. x
B. 2x ✓
C. x²
D. 2
Explanation: The power rule brings the exponent down: d/dx x² = 2x.

2. Which gas do plants absorb during photosynthesis?
A. Oxygen
B. Nitrogen
C. Carbon dioxide *
D. Hydrogen
Explanation: Plants take in CO₂ and release O₂.`;

const blankQuestion = (index: number): ProductPracticeQuestion => ({
  id: `q${index + 1}`,
  prompt: "",
  options: ["", "", "", ""],
  correctIndex: -1,
  explanation: "",
  difficulty: "medium",
  topic: "",
});

/** Per-question readiness — mirrors what the ProductEditor validation blocks on. */
const questionIssues = (question: ProductPracticeQuestion): string[] => {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push("no question text");
  if (question.options.map((option) => option.trim()).filter(Boolean).length < MIN_PRACTICE_OPTIONS) issues.push("needs 2 options");
  if (!(question.correctIndex >= 0 && question.correctIndex < question.options.length)) issues.push("no answer marked");
  return issues;
};

/** Assign stable, unique ids without ever dropping a draft question. */
const withIds = (list: ProductPracticeQuestion[]): ProductPracticeQuestion[] => {
  const seen = new Set<string>();
  return list.map((question, index) => {
    let id = String(question.id || "").trim() || `q${index + 1}`;
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return { ...question, id };
  });
};

/** Drop empty options from the END of a question (interior blanks stay editable). */
const trimTrailingBlanks = (options: string[]): string[] => {
  const next = [...options];
  while (next.length > MIN_PRACTICE_OPTIONS && !next[next.length - 1].trim()) next.pop();
  return next;
};

export interface PracticeSetImportPanelProps {
  /** Current questions on the resource (drafts included, exactly as typed). */
  questions: ProductPracticeQuestion[];
  /** Learner-facing set name; falls back to the resource name in the player. */
  title: string;
  /** Single writer for both fields — the parent owns the resource state. */
  onChange: (next: { questions: ProductPracticeQuestion[]; title: string }) => void;
  /** Used for friendly copy + placeholders. */
  resourceName?: string;
}

export default function PracticeSetImportPanel({
  questions,
  title,
  onChange,
  resourceName = "",
}: PracticeSetImportPanelProps) {
  const [paste, setPaste] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const problems = questions.reduce((total, question) => total + questionIssues(question).length, 0);
  const ready = questions.length > 0 && problems === 0;

  /** What the parser found in the textarea, previewed before it is committed. */
  const preview = useMemo(() => (paste.trim() ? parseQuestionText(paste) : []), [paste]);

  const commit = (next: ProductPracticeQuestion[], note: string | null) => {
    onChange({ questions: withIds(next), title });
    setImportNote(note);
  };

  /**
   * Bulk import — the revision profile page's own flow: parse the pasted text
   * with the shared parser, then APPEND the detected questions to whatever is
   * already on the resource (an admin can import a chapter at a time).
   */
  const runImport = () => {
    setImportError(null);
    if (!paste.trim()) {
      setImportError("Paste some questions first — or use “Add question manually”.");
      return;
    }
    if (preview.length === 0) {
      setImportError("No questions detected. Each question needs a prompt line and option lines (A. / B. / …).");
      return;
    }
    const detected = preview.filter((question) => question.correctIndex >= 0).length;
    const room = Math.max(0, MAX_PRACTICE_QUESTIONS - questions.length);
    const take = preview.slice(0, room);
    const imported: ProductPracticeQuestion[] = take.map((question, index) => ({
      id: `q${questions.length + index + 1}`,
      prompt: question.prompt,
      options: question.options.length >= MIN_PRACTICE_OPTIONS ? question.options : [...question.options, ...Array(MIN_PRACTICE_OPTIONS - question.options.length).fill("")],
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      difficulty: "medium",
      topic: "",
    }));
    commit(
      [...questions, ...imported],
      `Imported ${imported.length} question${imported.length === 1 ? "" : "s"} · ${detected} with a detected answer` +
        (preview.length > room ? ` · ${preview.length - room} beyond the ${MAX_PRACTICE_QUESTIONS}-question limit were not added` : ""),
    );
    setPaste("");
  };

  const addQuestion = () => {
    setImportError(null);
    if (questions.length >= MAX_PRACTICE_QUESTIONS) {
      setImportError(`This set already holds the maximum of ${MAX_PRACTICE_QUESTIONS} questions.`);
      return;
    }
    commit([...questions, blankQuestion(questions.length)], "Added a blank question — fill it in below.");
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[data-practice-new]")?.scrollIntoView({ block: "nearest" }));
  };

  const patchQuestion = (index: number, patch: Partial<ProductPracticeQuestion>) => {
    const next = questions.map((question, i) => (i === index ? { ...question, ...patch } : question));
    onChange({ questions: next, title });
  };

  const removeQuestion = (index: number) => {
    commit(
      questions.filter((_, i) => i !== index),
      `Removed question ${index + 1}.`,
    );
  };

  const patchOption = (questionIndex: number, optionIndex: number, value: string) => {
    const question = questions[questionIndex];
    patchQuestion(questionIndex, { options: question.options.map((option, i) => (i === optionIndex ? value : option)) });
  };

  const addOption = (questionIndex: number) => {
    const question = questions[questionIndex];
    if (question.options.length >= MAX_PRACTICE_OPTIONS) return;
    patchQuestion(questionIndex, { options: [...question.options, ""] });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    if (question.options.length <= MIN_PRACTICE_OPTIONS) return;
    const options = question.options.filter((_, i) => i !== optionIndex);
    // Keep the marked answer on the same OPTION when an earlier one is removed;
    // removing the marked option itself clears the mark instead of shifting it.
    const correctIndex =
      question.correctIndex === optionIndex ? -1 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex;
    patchQuestion(questionIndex, { options, correctIndex });
  };

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3" data-practice-set-panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" /> Brain practice set
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            These questions appear on the learner&apos;s <span className="font-semibold">Brain</span> tab for this module. No URL needed — the
            questions ARE the resource.
          </p>
        </div>
        <Pill tone={ready ? "success" : questions.length ? "warn" : "danger"}>
          {questions.length === 0
            ? "No questions yet"
            : ready
              ? `${questions.length} question${questions.length === 1 ? "" : "s"} ready`
              : `${problems} thing${problems === 1 ? "" : "s"} left to fix`}
        </Pill>
      </div>

      <Field label="Set name (shown on the Brain tab)" hint="Leave blank to use the resource name.">
        <input
          className={inputClass}
          placeholder={resourceName ? `e.g. ${resourceName}` : "e.g. Chapter 1 — practice"}
          value={title}
          onChange={(event) => onChange({ questions, title: event.target.value })}
          data-practice-title
        />
      </Field>

      {/* ── Bulk import (the revision profile page's importer) ───────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-slate-500" />
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Bulk import</p>
        </div>
        <Field
          label="Paste questions"
          hint="Same plain-text format as the revision bulk importer: numbered prompts, A./B./C. options, an answer marker (✓ ✔ √ * ✅ (correct) **bold**) or an “Answer: B” line, plus an optional “Explanation:” line."
        >
          <textarea
            className={`${textareaClass} min-h-[150px] font-mono text-[12px] leading-5`}
            placeholder={SAMPLE_TEXT}
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
              setImportError(null);
              setImportNote(null);
            }}
            data-practice-paste
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runImport}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white active:bg-emerald-700"
            data-practice-import
          >
            <Upload className="h-3.5 w-3.5" />
            Import {preview.length ? `${preview.length} question${preview.length === 1 ? "" : "s"}` : "questions"}
          </button>
          <SecondaryButton className="h-9 px-3 text-xs" onClick={() => setPaste(SAMPLE_TEXT)}>
            Use sample text
          </SecondaryButton>
          <SecondaryButton className="h-9 px-3 text-xs" onClick={addQuestion}>
            <ListPlus className="h-3.5 w-3.5" /> Add question manually
          </SecondaryButton>
          {questions.length > 0 ? (
            <button
              type="button"
              className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 active:bg-red-50"
              onClick={() => commit([], "Cleared every question in this set.")}
            >
              <Trash2 className="inline h-3.5 w-3.5" /> Clear set
            </button>
          ) : null}
        </div>
        {preview.length ? (
          <p className="rounded-lg bg-emerald-100/70 p-2 text-[11px] font-medium text-emerald-900" data-practice-preview>
            Detected {preview.length} question{preview.length === 1 ? "" : "s"} ·{" "}
            {preview.filter((question) => question.correctIndex >= 0).length} with a marked answer ·{" "}
            {preview.filter((question) => question.explanation).length} with an explanation. Importing appends them below.
          </p>
        ) : null}
        {importError ? (
          <p className="rounded-lg bg-red-100 p-2 text-[11px] font-semibold text-red-700" data-practice-error>
            {importError}
          </p>
        ) : null}
        {importNote ? (
          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-100 p-2 text-[11px] font-semibold text-emerald-800" data-practice-note>
            <CheckCircle2 className="h-3.5 w-3.5" /> {importNote}
          </p>
        ) : null}
      </div>

      {/* ── The set ─────────────────────────────────────────────────────── */}
      <div className="space-y-2" ref={listRef}>
        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-[11px] text-slate-500">
            No questions yet. Paste a set above and hit Import, or add one by hand.
          </p>
        ) : null}

        {questions.map((question, index) => {
          const issues = questionIssues(question);
          return (
            <article
              key={question.id}
              data-practice-question
              data-practice-question-id={question.id}
              {...(!question.prompt.trim() ? { "data-practice-new": "" } : null)}
              className={`space-y-2.5 rounded-xl border bg-white p-3 ${issues.length ? "border-amber-300" : "border-slate-200"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Question {index + 1} of {questions.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <Pill tone={issues.length ? "warn" : "success"}>{issues.length ? issues.join(" · ") : "Ready"}</Pill>
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-red-200 px-2 text-[11px] font-semibold text-red-600 active:bg-red-50"
                    onClick={() => removeQuestion(index)}
                    data-practice-remove
                  >
                    <Trash2 className="inline h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>

              <Field label="Question" required>
                <textarea
                  className={`${textareaClass} min-h-[64px]`}
                  placeholder="Type the question exactly as the learner should read it."
                  value={question.prompt}
                  onChange={(event) => patchQuestion(index, { prompt: event.target.value })}
                />
              </Field>

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Options — tap the circle to mark the correct answer
                </p>
                {question.options.map((option, optionIndex) => {
                  const correct = question.correctIndex === optionIndex;
                  return (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => patchQuestion(index, { correctIndex: optionIndex })}
                        aria-pressed={correct}
                        data-practice-correct={correct ? "true" : "false"}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          correct ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-500"
                        }`}
                      >
                        {OPTION_LETTERS[optionIndex]}
                      </button>
                      <input
                        className={inputClass}
                        placeholder={`Option ${OPTION_LETTERS[optionIndex]}`}
                        value={option}
                        onChange={(event) => patchOption(index, optionIndex, event.target.value)}
                        onBlur={() =>
                          patchQuestion(index, {
                            options: trimTrailingBlanks(question.options),
                            correctIndex: question.correctIndex >= trimTrailingBlanks(question.options).length ? -1 : question.correctIndex,
                          })
                        }
                      />
                      {question.options.length > MIN_PRACTICE_OPTIONS ? (
                        <button
                          type="button"
                          className="h-8 shrink-0 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-500 active:bg-slate-50"
                          onClick={() => removeOption(index, optionIndex)}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {question.options.length < MAX_PRACTICE_OPTIONS ? (
                  <SecondaryButton className="h-8 px-3 text-[11px]" onClick={() => addOption(index)}>
                    + Add option
                  </SecondaryButton>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Difficulty">
                  <select
                    className={selectClass}
                    value={question.difficulty}
                    onChange={(event) => patchQuestion(index, { difficulty: event.target.value as ProductPracticeQuestion["difficulty"] })}
                  >
                    {DIFFICULTIES.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Topic label" hint="Optional — shown on the question chip.">
                  <input
                    className={inputClass}
                    placeholder="e.g. Differentiation"
                    value={question.topic}
                    onChange={(event) => patchQuestion(index, { topic: event.target.value })}
                  />
                </Field>
                <Field label="Shown to the learner as">
                  <p className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
                    Question {index + 1}
                  </p>
                </Field>
              </div>

              <Field label="Explanation" hint="Shown on the review screen after submitting.">
                <textarea
                  className={`${textareaClass} min-h-[56px]`}
                  placeholder="Why the marked option is right."
                  value={question.explanation}
                  onChange={(event) => patchQuestion(index, { explanation: event.target.value })}
                />
              </Field>
            </article>
          );
        })}
      </div>

      <p className="text-[11px] leading-5 text-slate-500">
        Saving the product publishes this set to the Course Player&apos;s Brain tab for the module you are editing. Every question needs text,
        two options and a marked answer before the product can be published — drafts are kept in the editor meanwhile.
      </p>
    </div>
  );
}
