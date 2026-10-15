// src/course/SelfPracticeSetComposer.tsx
//
// The Brain page's own-practice-set creator (SELF mode only) — a full
// nested PAGE inside the Course Player's study pane, not a modal: opening
// it replaces the Brain listing, and Back returns to the listing with its
// state intact. The learner makes their OWN practice set without leaving
// the player:
//
//   A. the set's name;
//   B. the question TYPE (always visible — it chooses the AI command, the
//      editor and how the questions will be answered): MCQ, Fill in the
//      Blank, Label the Diagram, Assertion and Reason, One-Word / One-Line,
//      Match the Following, Drag and Drop, Hotspot;
//   C. topic, class/level, count, language;
//   D. copy the AI-ready CMD (src/utils/practicePrompt.ts — the plain-text
//      CMD for MCQs, a strict-JSON CMD for the structured types);
//   E. paste the AI's reply;
//   F. Parse — the whole batch at once (src/utils/practiceImport.ts),
//      validated per type by the shared rule (utils/practiceSet.js);
//   G. review and EDIT every parsed question in its type-specific editor
//      (src/course/BrainQuestionEditor.tsx) — correct answers, mappings,
//      images — or write questions by hand in the same editors;
//   H. Create — enabled only when every question is complete (an
//      explanation is never optional), and only from a fresh Parse when
//      the pasted reply has not changed since.
//
// The save itself is the existing owner-scoped flow: the set lands as a
// `brain` resource in “My practice sets” on the Study Library shelf
// (utils/selfPracticeSets.js) through the parent's writer.

import "./study-light-surfaces.css";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  FileText,
  ListPlus,
  LoaderCircle,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  PRACTICE_PROMPT_LANGUAGES,
  PRACTICE_PROMPT_LEVELS,
  PRACTICE_QUESTION_TYPE_OPTIONS,
  buildPracticeAiPrompt,
  practicePromptRulesFor,
} from "@/utils/practicePrompt";
import {
  parsePracticeImport,
  parseTypedPracticeImport,
  type PracticeImportResult,
  type TypedPracticeImportResult,
} from "../utils/practiceImport.ts";
import { MAX_PRACTICE_QUESTIONS } from "../../utils/practiceSet.js";
import {
  selfPracticeEmptyQuestion,
  selfPracticeEmptyQuestionOfType,
  selfPracticeQuestionsFromParsed,
  selfPracticeSetSummary,
} from "../../utils/selfPracticeSets.js";
import BrainQuestionEditor from "./BrainQuestionEditor";
import {
  BRAIN_QUESTION_TYPE_LABELS,
  type BrainQuestionType,
  type MyCourseQuestion,
} from "../types/myCourse";

const PASTE_PLACEHOLDER = `1. What is 2 + 2?
A. 3
B. 4 ✓
C. 5
D. 6
Explanation: Adding 2 and 2 gives 4.`;

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70";

type ParseSnapshot = { source: string; result: PracticeImportResult | TypedPracticeImportResult };

export interface SelfPracticeSetComposerProps {
  /** What the CMD is about by default — the module being watched, else the course. */
  topic: string;
  /** Class / level seed for the CMD (may be empty → the CMD's own placeholder). */
  level: string;
  /** The set name the field starts with. */
  defaultName: string;
  onClose: () => void;
  /** Resolves once the library write finished; `{ ok: false }` keeps the page open. */
  onCreate: (input: { title: string; questions: MyCourseQuestion[] }) => Promise<{ ok: boolean; message?: string }>;
  /** Uploads a question image (diagram/hotspot) and resolves its stored URL. */
  onUploadImage?: (file: File) => Promise<string>;
}

export default function SelfPracticeSetComposer({
  topic,
  level,
  defaultName,
  onClose,
  onCreate,
  onUploadImage,
}: SelfPracticeSetComposerProps) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [title, setTitle] = useState(defaultName);
  /** The selected question type — drives the CMD, the parser and new questions. */
  const [questionType, setQuestionType] = useState<BrainQuestionType>("mcq");
  const [aiTopic, setAiTopic] = useState(topic);
  const [aiLevel, setAiLevel] = useState(level);
  const [aiCount, setAiCount] = useState("10");
  const [aiLanguage, setAiLanguage] = useState(PRACTICE_PROMPT_LANGUAGES[0]);
  const [promptEdit, setPromptEdit] = useState("");
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  /**
   * The last Parse press: the exact text it read and what it found. Editing
   * the paste afterwards makes it stale — Create refuses a stale batch.
   */
  const [parsed, setParsed] = useState<ParseSnapshot | null>(null);
  /** The parsed questions, reviewed and edited before Create. */
  const [review, setReview] = useState<MyCourseQuestion[]>([]);
  const [manual, setManual] = useState<MyCourseQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Back with unsaved work asks first — a stray tap must not lose a set. */
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Guards a double tap before React re-renders the disabled button.
  const submitting = useRef(false);

  const hasUnsavedWork =
    review.length > 0 ||
    manual.length > 0 ||
    paste.trim().length > 0 ||
    title.trim() !== defaultName.trim();

  const requestClose = () => {
    if (hasUnsavedWork && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const generatedPrompt = useMemo(
    () =>
      buildPracticeAiPrompt({
        topic: aiTopic,
        level: aiLevel,
        count: Number(aiCount),
        language: aiLanguage,
        questionType,
      }),
    [aiTopic, aiLevel, aiCount, aiLanguage, questionType],
  );
  // Editing the CMD wins; editing a field above rebuilds it — the admin panel's
  // exact behaviour, so the two surfaces feel like the same tool.
  const promptText = promptEdit || generatedPrompt;

  /** The Parse result only counts while the pasted text is still the text it read. */
  const parseFresh = parsed !== null && parsed.source === paste;
  const parseResult = parseFresh ? parsed.result : null;
  const questions = mode === "ai" ? review : manual;
  const summary = useMemo(() => selfPracticeSetSummary(questions), [questions]);
  const createReady = mode === "ai" ? parseFresh && summary.createReady : summary.createReady;
  const canCreate = Boolean(title.trim()) && createReady && !busy;

  const runParse = () => {
    setError(null);
    setCopyNote(null);
    const looksJson = /^\s*(```\s*)?[[{]/.test(paste);
    if (questionType === "mcq" && !looksJson) {
      const result = parsePracticeImport(paste);
      setParsed({ source: paste, result });
      setReview(selfPracticeQuestionsFromParsed(result.questions, { topic: aiTopic }));
      return;
    }
    const result = parseTypedPracticeImport(paste, questionType);
    setParsed({ source: paste, result });
    setReview(result.questions as MyCourseQuestion[]);
  };

  /** The one status line above Create — says exactly what Create will do. */
  const statusLine = (() => {
    if (mode === "manual") {
      return summary.total === 0
        ? "No questions yet — add one below."
        : summary.createReady
          ? `${summary.total} question${summary.total === 1 ? "" : "s"} ready — Create saves the set to My Study Library.`
          : `${summary.ready} of ${summary.total} ready — fix the rest, then Create.`;
    }
    if (!paste.trim()) return "Paste the AI’s reply, then press Parse to check it.";
    if (!parseFresh) return "The reply changed — press Parse again to check it.";
    if (!summary.createReady) {
      return review.length === 0
        ? "Nothing parsed yet — fix the reply and Parse again."
        : `${summary.ready} of ${summary.total} ready — fix the rest, then Create.`;
    }
    const total = review.length;
    return `${total} question${total === 1 ? "" : "s"} parsed and ready — Create saves the set to My Study Library.`;
  })();

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
        ? "CMD copied — paste it into any AI, then paste the reply below, press Parse and check the questions before Create."
        : "Clipboard blocked — select the CMD text and copy it manually.",
    );
  };

  const switchMode = (next: "ai" | "manual") => {
    setMode(next);
    setError(null);
    if (next === "manual" && manual.length === 0) setManual([selfPracticeEmptyQuestion(0)]);
  };

  const patchIn = (
    setter: React.Dispatch<React.SetStateAction<MyCourseQuestion[]>>,
  ) => ({
    patch: (index: number, patch: Partial<MyCourseQuestion>) =>
      setter((previous) => previous.map((question, at) => (at === index ? { ...question, ...patch } : question))),
    replace: (index: number, next: MyCourseQuestion) =>
      setter((previous) => previous.map((question, at) => (at === index ? next : question))),
    remove: (index: number) => setter((previous) => previous.filter((_, at) => at !== index)),
  });
  const reviewEdit = patchIn(setReview);
  const manualEdit = patchIn(setManual);

  const addTo = (
    setter: React.Dispatch<React.SetStateAction<MyCourseQuestion[]>>,
    current: MyCourseQuestion[],
  ) => {
    setError(null);
    if (current.length >= MAX_PRACTICE_QUESTIONS) {
      setError(`A set holds at most ${MAX_PRACTICE_QUESTIONS} questions.`);
      return;
    }
    setter((previous) => [...previous, selfPracticeEmptyQuestionOfType(questionType, previous.length)]);
  };

  const submit = async () => {
    if (submitting.current) return;
    setError(null);
    setCopyNote(null);
    if (!title.trim()) {
      setError("Give your practice set a name first.");
      return;
    }
    if (mode === "ai" && !parseFresh) {
      setError(paste.trim() ? "The reply changed since the last Parse — press Parse again first." : "Paste the AI’s reply, press Parse, then Create.");
      return;
    }
    if (!summary.createReady) {
      const issues = summary.issues;
      setError(`Finish these first — ${issues.slice(0, 3).join(" · ")}${issues.length > 3 ? ` · +${issues.length - 3} more` : ""}`);
      return;
    }
    submitting.current = true;
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
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-slate-900 text-white"
      data-brain-self-composer=""
      data-brain-composer-page=""
      data-brain-composer-surface=""
    >
      {/* The nested page's own header: Back returns to the Brain listing. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Back to Brain"
          title="Back to Brain"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
          data-brain-self-composer-close
        >
          <ArrowLeft size={17} />
        </button>
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
          <Sparkles size={15} className="shrink-0 text-emerald-300" aria-hidden="true" />
          <span className="truncate">Create your own practice set</span>
        </h3>
        <span className="ml-auto hidden shrink-0 text-[10px] font-semibold text-slate-400 sm:block">
          Saved to My Study Library
        </span>
      </div>

      {confirmDiscard ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2"
          data-brain-self-discard=""
          role="alert"
        >
          <p className="min-w-0 flex-1 text-[11px] font-semibold text-amber-100">
            Discard this unfinished set? It has not been saved.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDiscard(false)}
            className="rounded-lg px-2.5 py-1 text-[11px] font-black text-white ring-1 ring-white/25 hover:bg-white/10"
          >
            Keep writing
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-amber-400 px-2.5 py-1 text-[11px] font-black text-amber-950 hover:bg-amber-300"
            data-brain-self-discard-confirm=""
          >
            Discard
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {/* A · the set's name */}
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

        {/* B · the question type — always visible; the CMD, the parser and
            every new question follow it, in both modes. */}
        <div>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Question type
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Question type" data-brain-question-types="">
            {PRACTICE_QUESTION_TYPE_OPTIONS.map((option) => {
              const selected = questionType === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setQuestionType(option.value);
                    setPromptEdit("");
                    setError(null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                    selected
                      ? "bg-emerald-400 text-emerald-950"
                      : "bg-white/[0.07] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.13] hover:text-white"
                  }`}
                  data-brain-question-type={option.value}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-slate-400">
            New questions start as {BRAIN_QUESTION_TYPE_LABELS[questionType]} — each question can still switch
            its own type in its editor below.
          </p>
        </div>

        {mode === "ai" ? (
          <>
            {/* C+D · settings and the shared AI CMD for the selected type. */}
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
              <div className="flex flex-wrap gap-1" aria-label="Class or exam level">
                {PRACTICE_PROMPT_LEVELS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setAiLevel(item);
                      setPromptEdit("");
                    }}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100 hover:bg-white/20"
                    data-brain-self-level-chip={item}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">How many questions</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_PRACTICE_QUESTIONS}
                    value={aiCount}
                    onChange={(event) => {
                      setAiCount(event.currentTarget.value);
                      setPromptEdit("");
                    }}
                    className={`${fieldClass} h-10`}
                    data-brain-self-count
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Language of the questions</span>
                  <select
                    value={aiLanguage}
                    onChange={(event) => {
                      setAiLanguage(event.currentTarget.value);
                      setPromptEdit("");
                    }}
                    className={`${fieldClass} h-10 appearance-none`}
                    data-brain-self-language
                  >
                    {PRACTICE_PROMPT_LANGUAGES.map((item) => (
                      <option key={item} value={item} className="bg-slate-900">
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-1">
                {practicePromptRulesFor(questionType).map((rule) => (
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

            {/* E+F · paste the reply, Parse the whole batch at once. */}
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3" data-brain-self-paste>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">
                Step 2 · Paste the AI&apos;s reply, then press Parse
              </p>
              <textarea
                value={paste}
                onChange={(event) => {
                  setPaste(event.currentTarget.value);
                  setError(null);
                }}
                rows={6}
                placeholder={questionType === "mcq" ? PASTE_PLACEHOLDER : "Paste the AI's JSON reply here…"}
                aria-label="Paste the AI reply"
                className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 font-mono text-[12px] leading-5 text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/70"
                data-brain-self-paste-input
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={runParse}
                  disabled={!paste.trim() || busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-[11px] font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                  data-brain-self-parse
                >
                  <FileText size={13} /> Parse questions
                </button>
                {paste.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPaste("");
                      setParsed(null);
                      setReview([]);
                      setError(null);
                    }}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-[11px] font-black text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    Clear reply
                  </button>
                ) : null}
              </div>

              {!paste.trim() ? null : !parseFresh ? (
                <p className="rounded-lg bg-white/[0.05] px-2 py-1.5 text-[11px] font-semibold text-slate-300" data-brain-self-stale>
                  The reply changed since the last Parse — press Parse questions to check it again.
                </p>
              ) : null}

              {parseResult && review.length > 0 ? (
                <p className="rounded-lg bg-emerald-400/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-100" data-brain-self-preview>
                  Parsed {review.length} question{review.length === 1 ? "" : "s"} · {summary.ready} ready — review and
                  fix them below, then Create.
                </p>
              ) : null}

              {parseResult && parseResult.warnings.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-sky-400/30 bg-sky-400/[0.07] p-2 text-[11px] font-semibold text-sky-100" data-brain-self-parse-warnings>
                  {parseResult.warnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
              {parseResult && parseResult.errors.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] p-2 text-[11px] font-semibold text-amber-100" data-brain-self-parse-errors role="alert">
                  {parseResult.errors.map((message) => (
                    <li key={message} className="break-words">
                      {message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* G · review and edit every parsed question before Create. */}
            {parseFresh && review.length > 0 ? (
              <div className="space-y-2" data-brain-self-preview-list>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-300">
                  Step 3 · Review and fix the questions
                </p>
                {review.map((question, index) => (
                  <BrainQuestionEditor
                    key={question.id}
                    question={question}
                    index={index}
                    onPatch={(patch) => reviewEdit.patch(index, patch)}
                    onReplace={(next) => reviewEdit.replace(index, next)}
                    onRemove={() => reviewEdit.remove(index)}
                    onUploadImage={onUploadImage}
                    rootAttrs={{ "data-brain-self-preview-question": "" }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => addTo(setReview, review)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-[11px] font-black text-slate-200 hover:bg-white/10"
                  data-brain-self-add-question
                >
                  <Plus size={12} /> Add question
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2" data-brain-self-manual>
            <p className="text-[11px] leading-5 text-slate-400">
              Write each question in its own editor — pick its type at the top of its card. Every question needs
              its explanation — it is shown after the learner answers.
            </p>
            {manual.map((question, index) => (
              <BrainQuestionEditor
                key={question.id}
                question={question}
                index={index}
                onPatch={(patch) => manualEdit.patch(index, patch)}
                onReplace={(next) => manualEdit.replace(index, next)}
                onRemove={() => manualEdit.remove(index)}
                onUploadImage={onUploadImage}
                rootAttrs={{ "data-brain-self-question": "" }}
              />
            ))}
            <button
              type="button"
              onClick={() => addTo(setManual, manual)}
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

      {/* H · Create — the one save, through the existing library flow. */}
      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold text-slate-400" data-brain-self-status>
          {statusLine}
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
  );
}
