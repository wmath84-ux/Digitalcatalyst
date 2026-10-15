"use client";

// Admin · Product editor — Brain Practice Set authoring.
//
// The admin picks resource type "Brain Practice Set" on the Product /
// Course-content page and this panel gives them the SAME authoring system
// the Course Player's Brain creator gives the learner — all eight question
// types, not just MCQs:
//
//   · Step 1 — pick the question TYPE, fill topic/class/count/language and
//     copy the AI-ready CMD (`buildPracticeAiPrompt` in
//     src/utils/practicePrompt.ts — the plain-text CMD for MCQs, a strict
//     JSON CMD for the structured types);
//   · Step 2 — paste the AI's reply and import it whole: the shared parsers
//     (`parsePracticeImport` for the MCQ text format,
//     `parseTypedPracticeImport` for the typed JSON) validate every question
//     per type and name anything that needs a fix — nothing is silently
//     dropped or reinterpreted as another type;
//   · the set itself is edited in the shared type-specific editors
//     (`BrainQuestionEditor` — the exact component the learner creator and
//     the Study Library editor use), so a question is written the way it
//     will be answered, and the learner preview below plays it through
//     `BrainTypedPlayer`, the player's own renderer.
//
// What is saved here is what the Course Player's Brain tab shows: the panel
// writes `practiceQuestions` + `practiceTitle` on the resource, the mapping
// layer (utils/productMapping.js → utils/practiceSet.js) carries them into
// the product document and the player reads them off the course tree. There
// is no second copy of the questions anywhere.
//
// DRAFTS ARE KEPT: a half-written question stays in the editor blob exactly
// as typed (the parent passes the resource's raw questions, never a
// normalised copy — normalising would drop a blank question before the
// admin could type into it). Only complete sets (every question complete
// for its type, explanation included) are publishable / reach the player —
// ProductEditor's validation says so out loud and the panel's pills name
// what is still missing.

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, Eye, FileText, ListPlus, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Field, Pill, SecondaryButton, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { parsePracticeImport, parseTypedPracticeImport } from "@/utils/practiceImport";
import {
  MAX_PRACTICE_QUESTIONS,
  MIN_PRACTICE_OPTIONS,
  normalizePracticeQuestions,
  practiceQuestionIssues,
  type NormalizedPracticeQuestion,
} from "../../../../utils/practiceSet.js";
import {
  PRACTICE_PROMPT_LANGUAGES,
  PRACTICE_PROMPT_LEVELS,
  PRACTICE_QUESTION_TYPE_OPTIONS,
  buildPracticeAiPrompt,
  practicePromptRulesFor,
} from "@/utils/practicePrompt";
import { selfPracticeEmptyQuestionOfType } from "../../../../utils/selfPracticeSets.js";
import BrainQuestionEditor from "@/course/BrainQuestionEditor";
import BrainTypedPlayer from "@/course/BrainTypedPlayer";
import type { ProductPracticeQuestion } from "@/lib/admin/types";
import type { BrainQuestionType } from "@/types/myCourse";

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

const SAMPLE_JSON = `{ "questions": [ { "questionType": "match", "prompt": "Match the organ to its function.", "matchPairs": [{ "left": "Heart", "right": "Pumps blood" }, { "left": "Lungs", "right": "Exchange gases" }], "explanation": "Each organ has one primary job in the list.", "difficulty": "medium", "topic": "Human body" } ] }`;

/**
 * Per-question readiness — the SAME rule the publish validation and the
 * resource card read (`practiceQuestionIssues`), so "Ready" here always means
 * "publishable". The explanation is part of it: it is never optional.
 */
const questionIssues = (question: ProductPracticeQuestion): string[] => practiceQuestionIssues(question);

/** Clipboard with an honest failure path (some WebViews refuse the API). */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the manual path below */
  }
  return false;
}

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

/**
 * A parser-normalised question becomes a panel question: every typed field
 * survives (the parser already validated the type), only the id is re-seated
 * into the set's sequence.
 */
const asPanelQuestion = (question: NormalizedPracticeQuestion, id: string): ProductPracticeQuestion => ({
  ...(question as ProductPracticeQuestion),
  id,
  questionType: (question.questionType || "mcq") as BrainQuestionType,
});

export interface PracticeSetImportPanelProps {
  /** Current questions on the resource (drafts included, exactly as typed). */
  questions: ProductPracticeQuestion[];
  /** Learner-facing set name; falls back to the resource name in the player. */
  title: string;
  /** Single writer for both fields — the parent owns the resource state. */
  onChange: (next: { questions: ProductPracticeQuestion[]; title: string }) => void;
  /** Used for friendly copy + placeholders. */
  resourceName?: string;
  /**
   * Uploads a diagram/hotspot image and resolves its stored URL (the admin
   * image pipeline). Absent → the editors offer the image-URL field only.
   */
  onUploadImage?: (file: File) => Promise<string>;
}

export default function PracticeSetImportPanel({
  questions,
  title,
  onChange,
  resourceName = "",
  onUploadImage,
}: PracticeSetImportPanelProps) {
  const [paste, setPaste] = useState("");
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Step 1 · the AI CMD (copy-paste prompt) ──────────────────────────────
  const [aiOpen, setAiOpen] = useState(questions.length === 0);
  /**
   * The question type being authored: it chooses the CMD (plain text for
   * MCQ, strict JSON for the structured types), the paste parser and the
   * shape of a hand-added question. Each question can still be switched to
   * another type on its own card.
   */
  const [questionType, setQuestionType] = useState<BrainQuestionType>("mcq");
  const [aiTopic, setAiTopic] = useState(resourceName);
  const [aiClass, setAiClass] = useState("");
  const [aiCount, setAiCount] = useState("10");
  const [aiLanguage, setAiLanguage] = useState(PRACTICE_PROMPT_LANGUAGES[0]);
  const [aiPromptEdit, setAiPromptEdit] = useState("");
  const [aiCopyNote, setAiCopyNote] = useState<string | null>(null);

  const generatedPrompt = useMemo(
    () =>
      buildPracticeAiPrompt({
        topic: aiTopic,
        level: aiClass,
        count: Number(aiCount),
        language: aiLanguage,
        questionType,
      }),
    [aiTopic, aiClass, aiCount, aiLanguage, questionType],
  );
  // The CMD is editable: typing in the box wins, editing a field above rebuilds it.
  const promptText = aiPromptEdit || generatedPrompt;
  const resetPromptEdit = () => setAiPromptEdit("");

  const copyPrompt = async () => {
    const ok = await copyToClipboard(promptText);
    setAiCopyNote(
      ok
        ? "CMD copied — paste it into ChatGPT / Gemini / Claude, then paste the reply into “Paste questions” below and press Import."
        : "Clipboard blocked — select the CMD text in the box and copy it manually.",
    );
  };

  const problems = questions.reduce((total, question) => total + questionIssues(question).length, 0);
  const ready = questions.length > 0 && problems === 0;

  /**
   * What the parser found in the textarea, previewed before it is committed —
   * the SAME parse-and-validate step the learner composer uses
   * (src/utils/practiceImport.ts): the plain-text parser for MCQ pastes, the
   * structured parser for the typed JSON. A JSON-shaped paste is always read
   * as JSON, even with MCQ selected, exactly like the composer's Parse.
   */
  const parsedPaste = useMemo(() => {
    if (!paste.trim()) return null;
    const looksJson = /^\s*(```\s*)?[[{]/.test(paste);
    if (questionType === "mcq" && !looksJson) {
      return { kind: "text" as const, result: parsePracticeImport(paste) };
    }
    return { kind: "typed" as const, result: parseTypedPracticeImport(paste, questionType) };
  }, [paste, questionType]);
  const preview = parsedPaste?.result.questions ?? [];
  const pasteErrors = parsedPaste?.result.errors ?? [];
  const pasteWarnings = parsedPaste?.result.warnings ?? [];
  const readyInPreview =
    parsedPaste?.kind === "typed"
      ? preview.filter((question) => practiceQuestionIssues(question).length === 0).length
      : 0;

  const commit = (next: ProductPracticeQuestion[], note: string | null) => {
    onChange({ questions: withIds(next), title });
    setImportNote(note);
  };

  /**
   * Bulk import — parse the pasted reply with the shared parser for the
   * selected type, then APPEND the detected questions to whatever is already
   * on the resource (an admin can import a chapter at a time). Typed
   * questions keep their own type and fields; they are never flattened into
   * MCQs.
   */
  const runImport = () => {
    setImportError(null);
    if (!paste.trim()) {
      setImportError("Paste some questions first — or use “Add question manually”.");
      return;
    }
    if (!parsedPaste || preview.length === 0) {
      setImportError(
        questionType === "mcq"
          ? "No questions detected. Each question needs a prompt line and option lines (A. / B. / …)."
          : "No questions detected. For this type the AI must reply with the JSON the CMD asks for — check the errors above.",
      );
      return;
    }
    const room = Math.max(0, MAX_PRACTICE_QUESTIONS - questions.length);
    const take = preview.slice(0, room);
    const overflowNote =
      preview.length > room ? ` · ${preview.length - room} beyond the ${MAX_PRACTICE_QUESTIONS}-question limit were not added` : "";
    if (parsedPaste.kind === "typed") {
      const imported = take.map((question, index) =>
        asPanelQuestion(question as NormalizedPracticeQuestion, `q${questions.length + index + 1}`),
      );
      const readyCount = imported.filter((question) => questionIssues(question).length === 0).length;
      commit(
        [...questions, ...imported],
        `Imported ${imported.length} question${imported.length === 1 ? "" : "s"} · ${readyCount} ready${overflowNote}`,
      );
    } else {
      const detected = preview.filter((question) => question.correctIndex >= 0).length;
      const imported: ProductPracticeQuestion[] = take.map((question, index) => ({
        id: `q${questions.length + index + 1}`,
        questionType: "mcq",
        prompt: question.prompt,
        options:
          question.options.length >= MIN_PRACTICE_OPTIONS
            ? question.options
            : [...question.options, ...Array(MIN_PRACTICE_OPTIONS - question.options.length).fill("")],
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        difficulty: "medium",
        topic: "",
      }));
      commit(
        [...questions, ...imported],
        `Imported ${imported.length} question${imported.length === 1 ? "" : "s"} · ${detected} with a detected answer${overflowNote}`,
      );
    }
    setPaste("");
  };

  const addQuestion = () => {
    setImportError(null);
    if (questions.length >= MAX_PRACTICE_QUESTIONS) {
      setImportError(`This set already holds the maximum of ${MAX_PRACTICE_QUESTIONS} questions.`);
      return;
    }
    commit(
      [...questions, selfPracticeEmptyQuestionOfType(questionType, questions.length) as ProductPracticeQuestion],
      "Added a blank question — fill it in below.",
    );
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[data-practice-new]")?.scrollIntoView({ block: "nearest" }));
  };

  const patchQuestion = (index: number, patch: Partial<ProductPracticeQuestion>) => {
    const next = questions.map((question, i) => (i === index ? { ...question, ...patch } : question));
    onChange({ questions: next, title });
  };

  const replaceQuestion = (index: number, next: ProductPracticeQuestion) => {
    onChange({ questions: questions.map((question, i) => (i === index ? next : question)), title });
  };

  const removeQuestion = (index: number) => {
    commit(
      questions.filter((_, i) => i !== index),
      `Removed question ${index + 1}.`,
    );
  };

  // ── Learner preview — the player's own renderer over the current draft ──
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRun, setPreviewRun] = useState(0);
  const [previewResponses, setPreviewResponses] = useState<Record<number, unknown>>({});
  const [previewDone, setPreviewDone] = useState(false);
  const previewQuestions = useMemo(() => normalizePracticeQuestions(questions), [questions]);
  const skippedInPreview = questions.length - previewQuestions.length;

  const openPreview = () => {
    setPreviewResponses({});
    setPreviewDone(false);
    setPreviewRun((run) => run + 1);
    setPreviewOpen(true);
  };

  const questionTypeLabel =
    PRACTICE_QUESTION_TYPE_OPTIONS.find((option) => option.value === questionType)?.label ?? questionType;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3" data-practice-set-panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" /> Brain Practice Set
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">
            These questions appear on the learner&apos;s <span className="font-semibold">Brain</span> tab for this module — all eight
            question types, edited the way they will be answered. No URL needed — the questions ARE the resource.
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

      {/* ── Step 1 · the AI CMD (copy-paste prompt) ─────────────────────── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3" data-practice-ai-prompt>
        <button
          type="button"
          onClick={() => setAiOpen((value) => !value)}
          className="flex w-full items-center gap-2 text-left"
          data-practice-ai-prompt-toggle
        >
          <Wand2 className="h-3.5 w-3.5 text-violet-600" />
          <span className="flex-1 text-xs font-bold uppercase tracking-wide text-violet-800">
            Step 1 · Let an AI write the questions (copy this CMD)
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-violet-400">{aiOpen ? "Hide" : "Open"}</span>
        </button>
        {aiOpen ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] leading-5 text-violet-900">
              Pick the question type, fill the topic and class, copy the CMD below and paste it into ChatGPT / Gemini / Claude. Paste
              the reply straight into “Paste questions” in Step 2 and press Import — nothing to reformat by hand.
            </p>
            <Field
              label="Question type"
              hint="The CMD, the paste format and a hand-added question all follow this type. Every question can still be switched on its own card below."
            >
              <select
                className={selectClass}
                value={questionType}
                onChange={(event) => {
                  setQuestionType(event.currentTarget.value as BrainQuestionType);
                  resetPromptEdit();
                }}
                data-practice-type
              >
                {PRACTICE_QUESTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Topic" hint="What the questions must test — this goes into the CMD.">
                <input
                  className={inputClass}
                  placeholder="e.g. Photosynthesis, Quadratic equations"
                  value={aiTopic}
                  onChange={(event) => {
                    setAiTopic(event.target.value);
                    resetPromptEdit();
                  }}
                  data-practice-ai-topic
                />
              </Field>
              <Field label="Class / level" hint="Who the questions are for — this goes into the CMD.">
                <input
                  className={inputClass}
                  placeholder="e.g. Class 10 (CBSE), JEE foundation"
                  value={aiClass}
                  onChange={(event) => {
                    setAiClass(event.target.value);
                    resetPromptEdit();
                  }}
                  data-practice-ai-class
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1">
              {PRACTICE_PROMPT_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    setAiClass(level);
                    resetPromptEdit();
                  }}
                  className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200 active:bg-violet-100"
                  data-practice-ai-level={level}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="How many questions">
                <input
                  type="number"
                  min={1}
                  max={MAX_PRACTICE_QUESTIONS}
                  className={inputClass}
                  value={aiCount}
                  onChange={(event) => {
                    setAiCount(event.target.value);
                    resetPromptEdit();
                  }}
                  data-practice-ai-count
                />
              </Field>
              <Field label="Language of the questions">
                <select
                  className={selectClass}
                  value={aiLanguage}
                  onChange={(event) => {
                    setAiLanguage(event.target.value);
                    resetPromptEdit();
                  }}
                  data-practice-ai-language
                >
                  {PRACTICE_PROMPT_LANGUAGES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {practicePromptRulesFor(questionType).map((rule) => (
                <span key={rule} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                  {rule}
                </span>
              ))}
            </div>
            <Field
              label="CMD — copy this into the AI"
              hint="Editable: the type, topic, class, count and language you picked above are already written in. The explanation line is part of the format — never delete it."
            >
              <textarea
                className={`${textareaClass} min-h-[220px] bg-white font-mono !text-[11px] leading-relaxed`}
                value={promptText}
                onChange={(event) => setAiPromptEdit(event.target.value)}
                aria-label="CMD for the AI"
                data-practice-ai-prompt-text
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white active:bg-violet-700"
                data-practice-ai-copy
              >
                <Copy className="h-3.5 w-3.5" /> Copy CMD for AI
              </button>
              {aiPromptEdit ? (
                <SecondaryButton className="h-9 px-3 text-xs" onClick={() => setAiPromptEdit("")}>
                  Reset to the standard CMD
                </SecondaryButton>
              ) : null}
            </div>
            {aiCopyNote ? (
              <p className="rounded-lg bg-violet-100 p-2 text-[11px] font-semibold text-violet-900" data-practice-ai-copy-note>
                {aiCopyNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Step 2 · bulk import (the shared practice parsers) ──────────── */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-slate-500" />
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Step 2 · Paste &amp; import</p>
        </div>
        <Field
          label="Paste questions"
          hint={
            questionType === "mcq"
              ? "Same plain-text format as the revision bulk importer: numbered prompts, A./B./C. options, an answer marker (✓ ✔ √ * ✅ (correct) **bold**) or an “Answer: B” line, and an “Explanation:” line — which is required on every question, not optional."
              : "The AI must reply with the JSON the CMD above asks for — one object per question, each with its own questionType. Import reads the whole batch at once and names every question that needs a fix; nothing is silently dropped or turned into an MCQ."
          }
        >
          <textarea
            className={`${textareaClass} min-h-[150px] font-mono text-[12px] leading-5`}
            placeholder={questionType === "mcq" ? SAMPLE_TEXT : SAMPLE_JSON}
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
          <SecondaryButton className="h-9 px-3 text-xs" onClick={() => setPaste(questionType === "mcq" ? SAMPLE_TEXT : SAMPLE_JSON)}>
            Use sample {questionType === "mcq" ? "text" : "JSON"}
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
        <p className="text-[11px] leading-5 text-slate-500">
          “Add question manually” starts a {questionTypeLabel} question — its type can be changed on the card itself, so a set may mix
          types.
        </p>
        {preview.length && parsedPaste?.kind === "text" ? (
          <p className="rounded-lg bg-emerald-100/70 p-2 text-[11px] font-medium text-emerald-900" data-practice-preview>
            Detected {preview.length} question{preview.length === 1 ? "" : "s"} ·{" "}
            {preview.filter((question) => question.correctIndex >= 0).length} with a marked answer ·{" "}
            {preview.filter((question) => question.explanation).length} with an explanation (required on every question). Importing
            appends them below.
          </p>
        ) : null}
        {preview.length && parsedPaste?.kind === "typed" ? (
          <p className="rounded-lg bg-emerald-100/70 p-2 text-[11px] font-medium text-emerald-900" data-practice-preview>
            Detected {preview.length} question{preview.length === 1 ? "" : "s"} · {readyInPreview} ready ·{" "}
            {preview.length - readyInPreview} still need work (they import as drafts and can be fixed on their cards). Importing appends
            them below.
          </p>
        ) : null}
        {pasteWarnings.length ? (
          <ul className="space-y-0.5 rounded-lg border border-sky-300 bg-sky-50 p-2 text-[11px] text-sky-900" data-practice-paste-warnings>
            {pasteWarnings.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        ) : null}
        {pasteErrors.length ? (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900"
            role="alert"
            data-practice-paste-errors
          >
            <p className="font-bold">
              {pasteErrors.length} thing{pasteErrors.length === 1 ? "" : "s"} to check in the pasted text
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              {pasteErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </div>
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

      {/* ── The set — the shared type-specific editors ──────────────────── */}
      <div className="space-y-2" ref={listRef}>
        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-[11px] text-slate-500">
            No questions yet. Paste a set above and hit Import, or add one by hand.
          </p>
        ) : null}

        {questions.map((question, index) => (
          <article
            key={question.id}
            data-practice-question
            data-practice-question-id={question.id}
            {...(!question.prompt.trim() ? { "data-practice-new": "" } : null)}
            className="rounded-xl bg-slate-950 p-2"
          >
            <BrainQuestionEditor
              question={question}
              index={index}
              onPatch={(patch) => patchQuestion(index, patch)}
              onReplace={(next) => replaceQuestion(index, next)}
              onRemove={() => removeQuestion(index)}
              onUploadImage={onUploadImage}
            />
          </article>
        ))}
      </div>

      {/* ── Learner preview — the player's own renderer ─────────────────── */}
      {questions.length > 0 ? (
        <div className="rounded-xl border border-slate-900 bg-slate-950 p-3" data-practice-learner-preview>
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex flex-1 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-200">
              <Eye className="h-3.5 w-3.5" /> Learner preview
            </p>
            <button
              type="button"
              onClick={() => (previewOpen ? setPreviewOpen(false) : openPreview())}
              className="inline-flex h-8 items-center rounded-lg bg-white/10 px-3 text-[11px] font-bold text-white active:bg-white/20"
              data-practice-preview-toggle
            >
              {previewOpen ? "Hide preview" : "Preview as learner"}
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            Plays this draft through the Course Player&apos;s own answering screens — the check, feedback and explanation a learner
            will see.
            {skippedInPreview > 0
              ? ` ${skippedInPreview} question${skippedInPreview === 1 ? " is" : "s are"} still too empty to preview and ${skippedInPreview === 1 ? "is" : "are"} skipped here.`
              : ""}
          </p>
          {previewOpen && previewQuestions.length > 0 ? (
            <div className="mt-2 flex h-[430px] flex-col overflow-hidden rounded-lg" data-practice-preview-stage>
              {previewDone ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-300" />
                  <p className="text-sm font-bold text-white">Preview finished</p>
                  <p className="text-[11px] leading-5 text-slate-400">
                    That is the whole set as a learner answers it. Your draft above is untouched.
                  </p>
                  <button
                    type="button"
                    onClick={openPreview}
                    className="mt-1 inline-flex h-8 items-center rounded-lg bg-white/10 px-3 text-[11px] font-bold text-white active:bg-white/20"
                  >
                    Play it again
                  </button>
                </div>
              ) : (
                <BrainTypedPlayer
                  key={previewRun}
                  questions={previewQuestions}
                  responses={previewResponses}
                  onAnswer={(questionIndex, response) =>
                    setPreviewResponses((previous) => ({ ...previous, [questionIndex]: response }))
                  }
                  onDone={() => setPreviewDone(true)}
                />
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] leading-5 text-slate-500">
        Saving the product publishes this set to the Course Player&apos;s Brain tab for the module you are editing. Every question must
        be complete for its type — its answer key filled in AND an explanation written — before the product can be published; drafts
        are kept in the editor meanwhile.
      </p>
    </div>
  );
}
