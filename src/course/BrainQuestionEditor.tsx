// src/course/BrainQuestionEditor.tsx
//
// The type-specific question editor shared by the Course Player's Brain
// creator and the Study Library's Brain editor: ONE editor per question
// type, so a question is written the way it will be answered.
//
//   · mcq             options with a tap-to-mark answer (the original form)
//   · fill_blank      the prompt carries ___ blanks; each blank gets its
//                     answer + accepted variants
//   · one_word        the expected answer + accepted variants
//   · assertion_reason the two statements + the shared 4-choice key
//   · match           Column A / Column B pair rows
//   · drag_drop       the item pool + targets with their correct item
//   · label_diagram   an attached diagram + label targets placed on it
//   · hotspot         an attached image + tap regions, the correct ones marked
//
// Switching the type REBUILDS the question from that type's empty shape —
// incompatible fields are never silently carried across (the shared core:
// prompt, explanation, difficulty, topic, survives). Image questions are
// never presented as ready without their image: the attach control shows a
// clear missing-image state and validation (`practiceQuestionIssues`) keeps
// Create off until it is attached. Coordinates are stored as percentages of
// the image's own box, so they stay aligned at any display size.

import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import {
  ASSERTION_REASON_CHOICES,
  MAX_PRACTICE_OPTIONS,
  MIN_PRACTICE_OPTIONS,
  countPromptBlanks,
  practiceQuestionIssues,
} from "../../utils/practiceSet.js";
import {
  selfPracticeEmptyQuestionOfType,
} from "../../utils/selfPracticeSets.js";
import {
  BRAIN_QUESTION_TYPE_LABELS,
  type BrainQuestionType,
  type MyCourseQuestion,
} from "../types/myCourse";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];
export const BRAIN_QUESTION_TYPES = Object.keys(BRAIN_QUESTION_TYPE_LABELS) as BrainQuestionType[];

export const editorFieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70";

const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400";

export interface BrainQuestionEditorProps {
  question: MyCourseQuestion;
  index: number;
  /** Patch fields of this question (same-type edits). */
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
  /** Replace the question wholesale (a type switch rebuilds its fields). */
  onReplace: (next: MyCourseQuestion) => void;
  onRemove: () => void;
  /** Uploads an image file and resolves its stored URL. Absent → URL field only. */
  onUploadImage?: (file: File) => Promise<string>;
  /** Extra data attributes for the card root (each surface keeps its markers). */
  rootAttrs?: Record<string, string | undefined>;
}

export default function BrainQuestionEditor({
  question,
  index,
  onPatch,
  onReplace,
  onRemove,
  onUploadImage,
  rootAttrs,
}: BrainQuestionEditorProps) {
  const type = (question.questionType ?? "mcq") as BrainQuestionType;
  const issues = practiceQuestionIssues(question);
  const complete = issues.length === 0;

  const changeType = (next: BrainQuestionType) => {
    if (next === type) return;
    const rebuilt = selfPracticeEmptyQuestionOfType(next, index);
    onReplace({
      ...rebuilt,
      id: question.id,
      questionType: next,
      prompt: question.prompt,
      explanation: question.explanation,
      difficulty: question.difficulty,
      topic: question.topic,
    });
  };

  return (
    <div
      className={`space-y-2 rounded-xl border p-3 ${complete ? "border-white/10 bg-white/[0.03]" : "border-amber-400/30 bg-amber-400/[0.06]"}`}
      data-brain-question-editor=""
      data-brain-question-type={type}
      {...rootAttrs}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-black text-white">
          {index + 1}
        </span>
        <select
          value={type}
          onChange={(event) => changeType(event.currentTarget.value as BrainQuestionType)}
          aria-label={`Question ${index + 1} type`}
          className="h-8 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-[11px] font-black text-white outline-none focus:border-emerald-400/70"
          data-brain-question-type-select=""
        >
          {BRAIN_QUESTION_TYPES.map((value) => (
            <option key={value} value={value} className="bg-slate-900">
              {BRAIN_QUESTION_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
        {complete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black text-emerald-100">
            <CheckCircle2 size={11} /> Ready
          </span>
        ) : (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black text-amber-100" data-brain-question-issues="">
            {issues.join(" · ")}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove question ${index + 1}`}
          className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {type === "assertion_reason" ? (
        <>
          <label className="block">
            <span className={labelClass}>Assertion (A)</span>
            <textarea
              value={question.assertion ?? ""}
              onChange={(event) => onPatch({ assertion: event.currentTarget.value })}
              rows={2}
              placeholder="The assertion statement"
              className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
              data-brain-editor-assertion=""
            />
          </label>
          <label className="block">
            <span className={labelClass}>Reason (R)</span>
            <textarea
              value={question.reason ?? ""}
              onChange={(event) => onPatch({ reason: event.currentTarget.value })}
              rows={2}
              placeholder="The reason statement"
              className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
              data-brain-editor-reason=""
            />
          </label>
          <fieldset>
            <legend className={labelClass}>Correct answer</legend>
            <div className="space-y-1.5">
              {ASSERTION_REASON_CHOICES.map((choice, choiceIndex) => (
                <label
                  key={choiceIndex}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                    question.correctIndex === choiceIndex
                      ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-50"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`ar-${question.id}`}
                    checked={question.correctIndex === choiceIndex}
                    onChange={() => onPatch({ correctIndex: choiceIndex })}
                    className="mt-0.5 shrink-0 accent-emerald-400"
                    data-brain-editor-ar-choice={choiceIndex}
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className={labelClass}>Instruction line (optional)</span>
            <input
              value={question.prompt}
              onChange={(event) => onPatch({ prompt: event.currentTarget.value })}
              placeholder="e.g. Choose the correct option for Assertion (A) and Reason (R)"
              className={`${editorFieldClass} h-9`}
            />
          </label>
        </>
      ) : (
        <label className="block">
          <span className={labelClass}>
            {type === "fill_blank" ? "Question — write ___ for each blank" : "Question"}
          </span>
          <textarea
            value={question.prompt}
            onChange={(event) => onPatch({ prompt: event.currentTarget.value })}
            rows={2}
            placeholder={type === "fill_blank" ? "The capital of France is ___." : "Question text"}
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[12px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70"
            data-brain-editor-prompt=""
          />
        </label>
      )}

      {type === "mcq" ? <McqFields question={question} onPatch={onPatch} /> : null}
      {type === "fill_blank" ? <FillBlankFields question={question} onPatch={onPatch} /> : null}
      {type === "one_word" ? <OneWordFields question={question} onPatch={onPatch} /> : null}
      {type === "match" ? <MatchFields question={question} onPatch={onPatch} /> : null}
      {type === "drag_drop" ? <DragDropFields question={question} onPatch={onPatch} /> : null}
      {type === "label_diagram" ? (
        <LabelDiagramFields question={question} onPatch={onPatch} onUploadImage={onUploadImage} />
      ) : null}
      {type === "hotspot" ? <HotspotFields question={question} onPatch={onPatch} onUploadImage={onUploadImage} /> : null}

      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
        <label className="block">
          <span className={labelClass}>Explanation *</span>
          <input
            value={question.explanation}
            onChange={(event) => onPatch({ explanation: event.currentTarget.value })}
            placeholder="Explanation (required)"
            className={`${editorFieldClass} h-10 ${question.explanation.trim() ? "" : "border-amber-400/40"}`}
            data-brain-editor-explanation=""
          />
        </label>
        <select
          value={question.difficulty}
          onChange={(event) => onPatch({ difficulty: event.currentTarget.value as MyCourseQuestion["difficulty"] })}
          aria-label="Difficulty"
          className={`${editorFieldClass} h-10 appearance-none`}
        >
          <option value="easy" className="bg-slate-900">Easy</option>
          <option value="medium" className="bg-slate-900">Medium</option>
          <option value="hard" className="bg-slate-900">Hard</option>
        </select>
      </div>
      <input
        value={question.topic}
        onChange={(event) => onPatch({ topic: event.currentTarget.value })}
        placeholder="Topic (optional)"
        className={`${editorFieldClass} h-9`}
        aria-label="Topic"
      />
    </div>
  );
}

/* ── MCQ ─────────────────────────────────────────────────────────────────── */

function McqFields({
  question,
  onPatch,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
}) {
  const options = question.options.length ? question.options : ["", ""];
  return (
    <div className="space-y-1.5" data-brain-editor-mcq="">
      {options.map((option, optionIndex) => {
        const marked = question.correctIndex === optionIndex;
        return (
          <div key={optionIndex} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPatch({ correctIndex: optionIndex })}
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
                onPatch({ options: options.map((value, at) => (at === optionIndex ? event.currentTarget.value : value)) })
              }
              placeholder={`Option ${OPTION_LETTERS[optionIndex] || optionIndex + 1}`}
              className={`${editorFieldClass} h-9`}
            />
            {options.length > MIN_PRACTICE_OPTIONS ? (
              <button
                type="button"
                onClick={() =>
                  onPatch({
                    options: options.filter((_, at) => at !== optionIndex),
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
      {options.length < MAX_PRACTICE_OPTIONS ? (
        <button
          type="button"
          onClick={() => onPatch({ options: [...options, ""] })}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
        >
          <Plus size={11} /> Add option
        </button>
      ) : null}
    </div>
  );
}

/* ── Fill in the blank / one word ────────────────────────────────────────── */

function splitVariants(text: string): string[] {
  return text.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function FillBlankFields({
  question,
  onPatch,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
}) {
  const blanks = Math.max(countPromptBlanks(question.prompt), question.blankAnswers?.length ?? 0);
  const answers = question.blankAnswers ?? [];
  const setBlank = (blank: number, entry: string[]) => {
    const next = Array.from({ length: Math.max(blanks, blank + 1) }, (_, at) => answers[at] ?? []);
    next[blank] = entry;
    onPatch({ blankAnswers: next });
  };
  return (
    <div className="space-y-2" data-brain-editor-fill-blank="">
      {blanks === 0 ? (
        <p className="rounded-lg bg-amber-400/10 px-2 py-1.5 text-[11px] font-semibold text-amber-100">
          Add a blank to the question first — type ___ where the learner must fill in.
        </p>
      ) : (
        Array.from({ length: blanks }, (_, blank) => {
          const accepted = answers[blank] ?? [];
          return (
            <div key={blank} className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Blank {blank + 1} — answer</span>
                <input
                  value={accepted[0] ?? ""}
                  onChange={(event) => setBlank(blank, [event.currentTarget.value, ...accepted.slice(1)])}
                  placeholder="Correct answer"
                  className={`${editorFieldClass} h-9`}
                  data-brain-editor-blank-answer={blank}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Also accept (comma separated)</span>
                <input
                  value={accepted.slice(1).join(", ")}
                  onChange={(event) => setBlank(blank, [accepted[0] ?? "", ...splitVariants(event.currentTarget.value)])}
                  placeholder="e.g. O2, oxygen gas"
                  className={`${editorFieldClass} h-9`}
                />
              </label>
            </div>
          );
        })
      )}
    </div>
  );
}

function OneWordFields({
  question,
  onPatch,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
}) {
  const accepted = question.acceptedAnswers ?? [];
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-brain-editor-one-word="">
      <label className="block">
        <span className={labelClass}>Expected answer</span>
        <input
          value={accepted[0] ?? ""}
          onChange={(event) => onPatch({ acceptedAnswers: [event.currentTarget.value, ...accepted.slice(1)] })}
          placeholder="e.g. Newton"
          className={`${editorFieldClass} h-9`}
          data-brain-editor-expected-answer=""
        />
      </label>
      <label className="block">
        <span className={labelClass}>Also accept (comma separated)</span>
        <input
          value={accepted.slice(1).join(", ")}
          onChange={(event) => onPatch({ acceptedAnswers: [accepted[0] ?? "", ...splitVariants(event.currentTarget.value)] })}
          placeholder="e.g. N, newtons"
          className={`${editorFieldClass} h-9`}
        />
      </label>
    </div>
  );
}

/* ── Match the following ─────────────────────────────────────────────────── */

function MatchFields({
  question,
  onPatch,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
}) {
  const pairs = question.matchPairs ?? [];
  const setPairs = (next: Array<{ left: string; right: string }>) => onPatch({ matchPairs: next });
  return (
    <div className="space-y-1.5" data-brain-editor-match="">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        <span>Column A</span>
        <span>Column B (its match)</span>
        <span />
      </div>
      {pairs.map((pair, pairIndex) => (
        <div key={pairIndex} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
          <input
            value={pair.left}
            onChange={(event) => setPairs(pairs.map((p, at) => (at === pairIndex ? { ...p, left: event.currentTarget.value } : p)))}
            placeholder={`A${pairIndex + 1}`}
            className={`${editorFieldClass} h-9`}
            data-brain-editor-match-left={pairIndex}
          />
          <input
            value={pair.right}
            onChange={(event) => setPairs(pairs.map((p, at) => (at === pairIndex ? { ...p, right: event.currentTarget.value } : p)))}
            placeholder="Its match"
            className={`${editorFieldClass} h-9`}
            data-brain-editor-match-right={pairIndex}
          />
          <button
            type="button"
            onClick={() => setPairs(pairs.filter((_, at) => at !== pairIndex))}
            aria-label={`Remove pair ${pairIndex + 1}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setPairs([...pairs, { left: "", right: "" }])}
        className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
        data-brain-editor-add-pair=""
      >
        <Plus size={11} /> Add pair
      </button>
    </div>
  );
}

/* ── Drag and drop ───────────────────────────────────────────────────────── */

function DragDropFields({
  question,
  onPatch,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
}) {
  const items = question.dragItems ?? [];
  const targets = question.dragTargets ?? [];
  return (
    <div className="space-y-3" data-brain-editor-drag-drop="">
      <div className="space-y-1.5">
        <span className={labelClass}>Draggable items</span>
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="flex items-center gap-2">
            <input
              value={item}
              onChange={(event) =>
                onPatch({ dragItems: items.map((value, at) => (at === itemIndex ? event.currentTarget.value : value)) })
              }
              placeholder={`Item ${itemIndex + 1}`}
              className={`${editorFieldClass} h-9`}
              data-brain-editor-drag-item={itemIndex}
            />
            <button
              type="button"
              onClick={() => onPatch({ dragItems: items.filter((_, at) => at !== itemIndex) })}
              aria-label={`Remove item ${itemIndex + 1}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onPatch({ dragItems: [...items, ""] })}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
          data-brain-editor-add-item=""
        >
          <Plus size={11} /> Add item
        </button>
      </div>
      <div className="space-y-1.5">
        <span className={labelClass}>Drop targets — and the item that belongs in each</span>
        {targets.map((target, targetIndex) => (
          <div key={target.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2">
            <input
              value={target.label}
              onChange={(event) =>
                onPatch({
                  dragTargets: targets.map((t, at) => (at === targetIndex ? { ...t, label: event.currentTarget.value } : t)),
                })
              }
              placeholder={`Target ${targetIndex + 1}`}
              className={`${editorFieldClass} h-9`}
              data-brain-editor-drag-target={targetIndex}
            />
            <select
              value={target.answer}
              onChange={(event) =>
                onPatch({
                  dragTargets: targets.map((t, at) => (at === targetIndex ? { ...t, answer: event.currentTarget.value } : t)),
                })
              }
              aria-label={`Correct item for target ${targetIndex + 1}`}
              className={`${editorFieldClass} h-9 appearance-none`}
              data-brain-editor-drag-answer={targetIndex}
            >
              <option value="" className="bg-slate-900">Choose the correct item…</option>
              {items.filter(Boolean).map((item) => (
                <option key={item} value={item} className="bg-slate-900">
                  {item}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onPatch({ dragTargets: targets.filter((_, at) => at !== targetIndex) })}
              aria-label={`Remove target ${targetIndex + 1}`}
              className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onPatch({ dragTargets: [...targets, { id: `t${Date.now().toString(36)}`, label: "", answer: "" }] })
          }
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
          data-brain-editor-add-target=""
        >
          <Plus size={11} /> Add target
        </button>
      </div>
    </div>
  );
}

/* ── Image attach (diagram + hotspot) ────────────────────────────────────── */

function ImageAttach({
  imageUrl,
  onPatch,
  onUploadImage,
  children,
  onImageClick,
}: {
  imageUrl: string;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
  onUploadImage?: (file: File) => Promise<string>;
  children?: React.ReactNode;
  onImageClick?: (x: number, y: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file || !onUploadImage) return;
    setUploading(true);
    setUploadError(null);
    try {
      onPatch({ imageUrl: await onUploadImage(file) });
    } catch (failure) {
      setUploadError(failure instanceof Error ? failure.message : "That image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const place = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onImageClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onImageClick(
      Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={imageUrl}
          onChange={(event) => onPatch({ imageUrl: event.currentTarget.value })}
          placeholder="Image URL (https://…)"
          className={`${editorFieldClass} h-9 min-w-0 flex-1`}
          aria-label="Image URL"
          data-brain-editor-image-url=""
        />
        {onUploadImage ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void upload(event.currentTarget.files?.[0])}
              data-brain-editor-image-file=""
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[11px] font-black text-white hover:bg-white/15 disabled:opacity-50"
              data-brain-editor-image-upload=""
            >
              {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {uploading ? "Uploading…" : "Upload image"}
            </button>
          </>
        ) : null}
      </div>
      {uploadError ? (
        <p className="rounded-lg bg-rose-400/10 px-2 py-1.5 text-[11px] font-semibold text-rose-100">{uploadError}</p>
      ) : null}
      {imageUrl ? (
        <div
          className="relative w-full overflow-hidden rounded-xl border border-white/15 bg-black/30"
          onClick={place}
          data-brain-editor-image-stage=""
        >
          <img src={imageUrl} alt="Question diagram" className="block max-h-64 w-full object-contain" draggable={false} />
          {children}
        </div>
      ) : (
        <p
          className="rounded-xl border border-dashed border-amber-300/40 bg-amber-400/[0.07] px-3 py-4 text-center text-[11px] font-semibold text-amber-100"
          data-brain-editor-image-missing=""
        >
          No image attached yet — this question cannot be played until its image is added.
        </p>
      )}
    </div>
  );
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/* ── Label the diagram ───────────────────────────────────────────────────── */

function LabelDiagramFields({
  question,
  onPatch,
  onUploadImage,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const targets = question.labelTargets ?? [];
  const [selected, setSelected] = useState(0);
  const setTargets = (next: NonNullable<MyCourseQuestion["labelTargets"]>) => onPatch({ labelTargets: next });
  return (
    <div className="space-y-2" data-brain-editor-label-diagram="">
      <ImageAttach
        imageUrl={question.imageUrl ?? ""}
        onPatch={onPatch}
        onUploadImage={onUploadImage}
        onImageClick={(x, y) => {
          if (!targets.length) return;
          const at = Math.min(selected, targets.length - 1);
          setTargets(targets.map((t, i) => (i === at ? { ...t, x: round1(x), y: round1(y) } : t)));
        }}
      >
        {targets.map((target, targetIndex) => (
          <span
            key={target.id}
            className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-emerald-500 text-[10px] font-black text-white ring-2 ring-white/80"
            style={{ left: `${target.x}%`, top: `${target.y}%` }}
          >
            {targetIndex + 1}
          </span>
        ))}
      </ImageAttach>
      <p className="text-[10px] font-semibold text-slate-400">
        Tap the image to place the selected target. Coordinates are % of the image, so they stay put at any size.
      </p>
      {targets.map((target, targetIndex) => (
        <div key={target.id} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2rem] items-center gap-2">
          <input
            value={target.label}
            onFocus={() => setSelected(targetIndex)}
            onChange={(event) =>
              setTargets(targets.map((t, at) => (at === targetIndex ? { ...t, label: event.currentTarget.value } : t)))
            }
            placeholder={`Label ${targetIndex + 1}`}
            className={`${editorFieldClass} h-9 ${selected === targetIndex ? "border-emerald-300/60" : ""}`}
            data-brain-editor-label-target={targetIndex}
          />
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={target.x}
            onChange={(event) =>
              setTargets(targets.map((t, at) => (at === targetIndex ? { ...t, x: Number(event.currentTarget.value) } : t)))
            }
            aria-label={`Target ${targetIndex + 1} X %`}
            className={`${editorFieldClass} h-9`}
          />
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={target.y}
            onChange={(event) =>
              setTargets(targets.map((t, at) => (at === targetIndex ? { ...t, y: Number(event.currentTarget.value) } : t)))
            }
            aria-label={`Target ${targetIndex + 1} Y %`}
            className={`${editorFieldClass} h-9`}
          />
          <button
            type="button"
            onClick={() => setTargets(targets.filter((_, at) => at !== targetIndex))}
            aria-label={`Remove target ${targetIndex + 1}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setTargets([...targets, { id: `t${Date.now().toString(36)}`, x: 50, y: 50, label: "" }]);
          setSelected(targets.length);
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
        data-brain-editor-add-label-target=""
      >
        <Plus size={11} /> Add label target
      </button>
      <label className="block">
        <span className={labelClass}>Extra label choices (comma separated, optional distractors)</span>
        <input
          value={(question.labelOptions ?? []).join(", ")}
          onChange={(event) => onPatch({ labelOptions: splitVariants(event.currentTarget.value) })}
          placeholder="Leave empty to offer exactly the target labels"
          className={`${editorFieldClass} h-9`}
        />
      </label>
    </div>
  );
}

/* ── Hotspot ─────────────────────────────────────────────────────────────── */

function HotspotFields({
  question,
  onPatch,
  onUploadImage,
}: {
  question: MyCourseQuestion;
  onPatch: (patch: Partial<MyCourseQuestion>) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const spots = question.hotspots ?? [];
  const correct = question.correctHotspotIds ?? [];
  const [selected, setSelected] = useState(0);
  const setSpots = (next: NonNullable<MyCourseQuestion["hotspots"]>) => onPatch({ hotspots: next });
  return (
    <div className="space-y-2" data-brain-editor-hotspot="">
      <ImageAttach
        imageUrl={question.imageUrl ?? ""}
        onPatch={onPatch}
        onUploadImage={onUploadImage}
        onImageClick={(x, y) => {
          if (!spots.length) {
            setSpots([{ id: `s${Date.now().toString(36)}`, x: round1(x), y: round1(y), r: 10 }]);
            return;
          }
          const at = Math.min(selected, spots.length - 1);
          setSpots(spots.map((s, i) => (i === at ? { ...s, x: round1(x), y: round1(y) } : s)));
        }}
      >
        {spots.map((spot, spotIndex) => (
          <span
            key={spot.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
              correct.includes(spot.id) ? "border-emerald-300 bg-emerald-400/30" : "border-white/70 bg-white/20"
            }`}
            style={{
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              width: `${spot.r * 2}%`,
              paddingTop: `${spot.r * 2}%`,
            }}
          >
            <span className="absolute inset-0 grid place-items-center text-[10px] font-black text-white drop-shadow">
              {spotIndex + 1}
            </span>
          </span>
        ))}
      </ImageAttach>
      <p className="text-[10px] font-semibold text-slate-400">
        Tap the image to place the selected region. Tick “Correct” on the region(s) the learner must tap.
      </p>
      {spots.map((spot, spotIndex) => (
        <div key={spot.id} className="grid grid-cols-[4.5rem_4.5rem_4.5rem_auto_2rem] items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={spot.x}
            onFocus={() => setSelected(spotIndex)}
            onChange={(event) => setSpots(spots.map((s, at) => (at === spotIndex ? { ...s, x: Number(event.currentTarget.value) } : s)))}
            aria-label={`Hotspot ${spotIndex + 1} X %`}
            className={`${editorFieldClass} h-9`}
          />
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={spot.y}
            onChange={(event) => setSpots(spots.map((s, at) => (at === spotIndex ? { ...s, y: Number(event.currentTarget.value) } : s)))}
            aria-label={`Hotspot ${spotIndex + 1} Y %`}
            className={`${editorFieldClass} h-9`}
          />
          <input
            type="number"
            min={2}
            max={50}
            step={1}
            value={spot.r}
            onChange={(event) => setSpots(spots.map((s, at) => (at === spotIndex ? { ...s, r: Number(event.currentTarget.value) } : s)))}
            aria-label={`Hotspot ${spotIndex + 1} radius %`}
            className={`${editorFieldClass} h-9`}
          />
          <label className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-200">
            <input
              type="checkbox"
              checked={correct.includes(spot.id)}
              onChange={(event) =>
                onPatch({
                  correctHotspotIds: event.currentTarget.checked
                    ? [...correct, spot.id]
                    : correct.filter((id) => id !== spot.id),
                })
              }
              className="h-4 w-4 accent-emerald-400"
              data-brain-editor-hotspot-correct={spotIndex}
            />
            Correct
          </label>
          <button
            type="button"
            onClick={() => {
              setSpots(spots.filter((_, at) => at !== spotIndex));
              onPatch({ correctHotspotIds: correct.filter((id) => id !== spot.id) });
            }}
            aria-label={`Remove hotspot ${spotIndex + 1}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-rose-300 hover:bg-white/10"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setSpots([...spots, { id: `s${Date.now().toString(36)}`, x: 50, y: 50, r: 10 }]);
          setSelected(spots.length);
        }}
        className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-emerald-200 hover:bg-white/5"
        data-brain-editor-add-hotspot=""
      >
        <Plus size={11} /> Add hotspot region
      </button>
    </div>
  );
}
