// src/course/SelfPracticeSetComposer.tsx
//
// The overlay behind the Brain page's “+” (SELF mode only): the learner makes
// their OWN practice set without leaving the Course Player.
//
// It is the learner-facing twin of the admin's Brain panel
// (src/components/admin/products/PracticeSetImportPanel.tsx), with the same
// two ways in and the same rules:
//
//   1. “Let an AI write it” — copy the shared CMD (src/utils/practicePrompt.ts,
//      the exact text the admin copies), paste the AI's reply below and press
//      Create. The topic and class lines are editable in the CMD itself, and
//      the CMD is a normal textarea, so a learner who wants a different count
//      or wording can edit the prompt before copying it.
//   2. “Write it yourself” — one question at a time, with the answer marked by
//      tapping its letter and an explanation field that is REQUIRED.
//
// An explanation is never optional (owner rule): Create stays off until every
// question has one, and the reasons are listed (“Q2: no explanation”) instead
// of a vague failure. The panel then writes the set into the learner's Study
// Library (see utils/selfPracticeSets.js) — the same shelf every device reads.
//
// The look is the Read page's compose overlay (src/course/ReadLibraryPanel.tsx
// `data-course-read-compose`): a solid slate-900 sheet over a dimmed pane, one
// column, no nested cards. It scrolls inside itself because the Brain page
// lives in the Split Deck's study pane, which can be any height.

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ListPlus,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { parseQuestionText } from "@/revision/engine/bulkParser";
import { buildPracticeAiPrompt, PRACTICE_PROMPT_RULES } from "@/utils/practicePrompt";
import {
  MAX_PRACTICE_OPTIONS,
  MAX_PRACTICE_QUESTIONS,
  MIN_PRACTICE_OPTIONS,
  practiceQuestionIssues,
} from "../../utils/practiceSet.js";
import {
  selfPracticeEmptyQuestion,
  selfPracticeQuestionsFromParsed,
  selfPracticeSetSummary,
} from "../../utils/selfPracticeSets.js";
import type { MyCourseQuestion } from "../types/myCourse";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70";

export interface SelfPracticeSetComposerProps {
  /** What the CMD is about by default — the module being watched, else the course. */
  topic: string;
  /** Class / level seed for the CMD (may be empty → the CMD's own placeholder). */
  level: string;
  /** The set name the field starts with. */
  defaultName: string;
  onClose: () => void;
  /** Resolves once the library write finished; `{ ok: false }` keeps the sheet open. */
  onCreate: (input: { title: string; questions: MyCourseQuestion[] }) => Promise<{ ok: boolean; message?: string }>;
}

export default function SelfPracticeSetComposer({
  topic,
  level,
  defaultName,
  onClose,
  onCreate,
}: SelfPracticeSetComposerProps) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [title, setTitle] = useState(defaultName);
  const [aiTopic, setAiTopic] = useState(topic);
  const [aiLevel, setAiLevel] = useState(level);
  const [promptEdit, setPromptEdit] = useState("");
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [manual, setManual] = useState<MyCourseQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatedPrompt = useMemo(
    () => buildPracticeAiPrompt({ topic: aiTopic, level: aiLevel, count: 10 }),
    [aiTopic, aiLevel],
  );
  // Editing the CMD wins; editing a field above rebuilds it — the admin panel's
  // exact behaviour, so the two surfaces feel like the same tool.
  const promptText = promptEdit || generatedPrompt;

  /** What the pasted text parses to, previewed before Create is pressed. */
  const parsed = useMemo(() => (paste.trim() ? parseQuestionText(paste) : []), [paste]);
  const pasteQuestions = useMemo(
    () => selfPracticeQuestionsFromParsed(parsed, { topic: aiTopic }),
    [parsed, aiTopic],
  );
  const questions = mode === "ai" ? pasteQuestions : manual;
  const summary = useMemo(() => selfPracticeSetSummary(questions), [questions]);
  const canCreate = Boolean(title.trim()) && summary.createReady && !busy;

  const copyPrompt = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(promptText);
        ok = true;
      }
    } catch {
      /* the manual path below */
    }
    setCopyNote(
      ok
        ? "CMD copied — paste it into any AI, then paste the reply below and press Create."
        : "Clipboard blocked — select the CMD text and copy it manually.",
    );
  };

  const switchMode = (next: "ai" | "manual") => {
    setMode(next);
    setError(null);
    if (next === "manual" && manual.length === 0) setManual([selfPracticeEmptyQuestion(0)]);
  };

  const patchQuestion = (index: number, patch: Partial<MyCourseQuestion>) => {
    setManual((previous) => previous.map((question, at) => (at === index ? { ...question, ...patch } : question)));
  };

  const addQuestion = () => {
    setError(null);
    if (manual.length >= MAX_PRACTICE_QUESTIONS) {
      setError(`A set holds at most ${MAX_PRACTICE_QUESTIONS} questions.`);
      return;
    }
    setManual((previous) => [...previous, selfPracticeEmptyQuestion(previous.length)]);
  };

  const submit = async () => {
    setError(null);
    setCopyNote(null);
    if (!title.trim()) {
      setError("Give your practice set a name first.");
      return;
    }
    if (summary.issues.length) {
      setError(`Finish these first — ${summary.issues.slice(0, 3).join(" · ")}${summary.issues.length > 3 ? ` · +${summary.issues.length - 3} more` : ""}`);
      return;
    }
    setBusy(true);
    try {
      const result = await onCreate({ title: title.trim(), questions });
      if (!result?.ok) {
        setError(result?.message || "Could not save the set. Please try again.");
        return;
      }
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the set. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      data-brain-self-composer=""
      role="dialog"
      aria-modal="true"
      aria-label="Create your own practice set"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles size={15} className="text-emerald-300" aria-hidden="true" /> Create your own practice set
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            data-brain-self-composer-close
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Set name
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="e.g. Light — quick check"
              className={`${fieldClass} h-10`}
              data-brain-self-title
            />
          </label>

          {/* Two ways in — the admin panel's own two paths, as one toggle. */}
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="How to write the questions">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "ai"}
              onClick={() => switchMode("ai")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black ${mode === "ai" ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
              data-brain-self-mode="ai"
            >
              <Wand2 size={12} /> Let an AI write it
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "manual"}
              onClick={() => switchMode("manual")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black ${mode === "manual" ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
              data-brain-self-mode="manual"
            >
              <ListPlus size={12} /> Write it yourself
            </button>
          </div>

          {mode === "ai" ? (
            <>
              {/* Step 1 — the shared AI CMD (editable topic + class). */}
              <div className="space-y-2 rounded-xl border border-violet-400/25 bg-violet-400/[0.07] p-3" data-brain-self-ai>
                <p className="text-[11px] font-bold uppercase tracking-wide text-violet-200">
                  Step 1 · Copy this CMD into any AI
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Topic</span>
                    <input
                      value={aiTopic}
                      onChange={(event) => {
                        setAiTopic(event.currentTarget.value);
                        setPromptEdit("");
                      }}
                      placeholder="e.g. Photosynthesis"
                      className={`${fieldClass} h-10`}
                      data-brain-self-topic
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Class / level</span>
                    <input
                      value={aiLevel}
                      onChange={(event) => {
                        setAiLevel(event.currentTarget.value);
                        setPromptEdit("");
                      }}
                      placeholder="e.g. Class 10 (CBSE)"
                      className={`${fieldClass} h-10`}
                      data-brain-self-level
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1">
                  {PRACTICE_PROMPT_RULES.map((rule) => (
                    <span key={rule} className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold text-violet-100" data-brain-self-rule>
                      {rule}
                    </span>
                  ))}
                </div>
                <textarea
                  value={promptText}
                  onChange={(event) => setPromptEdit(event.currentTarget.value)}
                  aria-label="CMD for the AI"
                  className="min-h-[150px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 font-mono text-[11px] leading-relaxed text-white outline-none focus:border-violet-300/60"
                  data-brain-self-prompt-text
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyPrompt()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-500 px-3 text-[11px] font-black text-white hover:bg-violet-400"
                    data-brain-self-copy
                  >
                    <Copy size={13} /> Copy CMD
                  </button>
                  {promptEdit ? (
                    <button
                      type="button"
                      onClick={() => setPromptEdit("")}
                      className="inline-flex h-9 items-center rounded-lg px-3 text-[11px] font-black text-slate-300 underline-offset-2 hover:bg-white/10 hover:text-white"
                    >
                      Reset CMD
                    </button>
                  ) : null}
                </div>
                {copyNote ? (
                  <p className="rounded-lg bg-violet-400/15 px-2 py-1.5 text-[11px] font-semibold text-violet-100" data-brain-self-copy-note>
                    {copyNote}
                  </p>
                ) : null}
              </div>

              {/* Step 2 — paste the reply and create. */}
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-brain-self-paste>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">
                  Step 2 · Paste the AI&apos;s reply
                </p>
                <textarea
                  value={paste}
                  onChange={(event) => {
                    setPaste(event.currentTarget.value);
                    setError(null);
                  }}
                  rows={6}
                  placeholder={"1. What is 2 + 2?\nA. 3\nB. 4 ✓\nC. 5\nD. 6\nExplanation: Adding 2 and 2 gives 4."}
                  className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 font-mono text-[11px] leading-5 text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/70"
                  data-brain-self-paste-input
                />
                {parsed.length ? (
                  <p className="rounded-lg bg-emerald-400/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-100" data-brain-self-preview>
                    Detected {parsed.length} question{parsed.length === 1 ? "" : "s"} ·{" "}
                    {parsed.filter((question) => question.correctIndex >= 0).length} with a marked answer ·{" "}
                    {parsed.filter((question) => question.explanation).length} with an explanation (required on every question).
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="space-y-2" data-brain-self-manual>
              <p className="text-[11px] leading-5 text-slate-400">
                Tap a letter to mark the correct option. Every question needs its explanation — it is shown after the learner answers.
              </p>
              {manual.map((question, index) => {
                const issues = practiceQuestionIssues(question);
                const complete = issues.length === 0;
                return (
                  <div
                    key={question.id}
                    className={`space-y-2 rounded-xl border p-3 ${complete ? "border-white/10 bg-white/[0.03]" : "border-amber-400/30 bg-amber-400/[0.06]"}`}
                    data-brain-self-question
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-black text-white">
                        {index + 1}
                      </span>
                      {complete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-100">
                          <CheckCircle2 size={11} /> Ready
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-100" data-brain-self-question-issues>
                          {issues.join(" · ")}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setManual((previous) => previous.filter((_, at) => at !== index))}
                        aria-label="Remove question"
                        className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <textarea
                      value={question.prompt}
                      onChange={(event) => patchQuestion(index, { prompt: event.currentTarget.value })}
                      rows={2}
                      placeholder="Question text"
                      className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
                    />
                    <div className="space-y-1.5">
                      {question.options.map((option, optionIndex) => {
                        const marked = question.correctIndex === optionIndex;
                        return (
                          <div key={optionIndex} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => patchQuestion(index, { correctIndex: optionIndex })}
                              aria-pressed={marked}
                              aria-label={`Mark option ${OPTION_LETTERS[optionIndex] || optionIndex + 1} as the answer`}
                              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black ring-1 ${marked ? "bg-emerald-400/25 text-emerald-50 ring-emerald-300/50" : "bg-white/[0.06] text-slate-300 ring-white/10 hover:bg-white/10"}`}
                              data-brain-self-mark={optionIndex}
                              data-marked={marked ? "true" : "false"}
                            >
                              {OPTION_LETTERS[optionIndex] || optionIndex + 1}
                            </button>
                            <input
                              value={option}
                              onChange={(event) =>
                                patchQuestion(index, {
                                  options: question.options.map((value, at) => (at === optionIndex ? event.currentTarget.value : value)),
                                })
                              }
                              placeholder={`Option ${OPTION_LETTERS[optionIndex] || optionIndex + 1}`}
                              className={`${fieldClass} h-9`}
                            />
                            {question.options.length > MIN_PRACTICE_OPTIONS ? (
                              <button
                                type="button"
                                onClick={() =>
                                  patchQuestion(index, {
                                    options: question.options.filter((_, at) => at !== optionIndex),
                                    correctIndex:
                                      question.correctIndex === optionIndex
                                        ? -1
                                        : question.correctIndex > optionIndex
                                          ? question.correctIndex - 1
                                          : question.correctIndex,
                                  })
                                }
                                aria-label="Remove option"
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
                              >
                                <X size={13} />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {question.options.length < MAX_PRACTICE_OPTIONS ? (
                        <button
                          type="button"
                          onClick={() => patchQuestion(index, { options: [...question.options, ""] })}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
                        >
                          <Plus size={11} /> Add option
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
                      <input
                        value={question.explanation}
                        onChange={(event) => patchQuestion(index, { explanation: event.currentTarget.value })}
                        placeholder="Explanation (required)"
                        className={`${fieldClass} h-10 ${question.explanation.trim() ? "" : "border-amber-400/40"}`}
                      />
                      <select
                        value={question.difficulty}
                        onChange={(event) => patchQuestion(index, { difficulty: event.currentTarget.value as MyCourseQuestion["difficulty"] })}
                        aria-label="Difficulty"
                        className={`${fieldClass} h-10 appearance-none`}
                      >
                        <option value="easy" className="bg-slate-900">Easy</option>
                        <option value="medium" className="bg-slate-900">Medium</option>
                        <option value="hard" className="bg-slate-900">Hard</option>
                      </select>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[11px] font-black text-slate-200 hover:bg-white/10"
                data-brain-self-add-question
              >
                <Plus size={12} /> Add question
              </button>
            </div>
          )}

          {error ? (
            <p className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-2 py-1.5 text-[11px] font-semibold text-rose-100" data-brain-self-error>
              {error}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold text-slate-400" data-brain-self-status>
            {summary.total === 0
              ? "No questions yet — copy the CMD above, or write one yourself."
              : summary.createReady
                ? `${summary.total} question${summary.total === 1 ? "" : "s"} ready — Create saves the set to My Study Library.`
                : `${summary.ready} of ${summary.total} ready — fix the rest, then Create.`}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canCreate}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            data-brain-self-create
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy ? "Creating…" : "Create practice set"}
          </button>
        </div>
      </div>
    </div>
  );
}
