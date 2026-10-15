// src/course/BrainTypedPlayer.tsx
//
// The answering experience for every Brain question type that is NOT a
// standard MCQ — and for mixed sets that contain one. Each type gets the
// interaction it actually needs (typing, matching, placing labels, tapping
// an image), never the MCQ swipe deck: nothing here drags a card, so typing
// into an input or moving an item can never be read as a flick-to-skip.
//
// Flow per question: interact → Check answer → feedback (correct/incorrect,
// the right answer, the explanation) → Next. Skip moves on without recording
// anything, exactly like a flicked-away card. When the last question is
// done the player reports `onDone` and the panel continues into its usual
// review → submit → result pipeline. Responses are recorded through
// `onAnswer` in the shapes `evaluatePracticeAnswer` (utils/practiceSet.js)
// scores, so the panel's counting never learns a second rule.

import { useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { BRAIN, BrainPill, BrainSurface } from "./BrainCards";
import {
  ASSERTION_REASON_CHOICES,
  countPromptBlanks,
  evaluatePracticeAnswer,
  practiceAnswerSummary,
  type NormalizedPracticeQuestion,
} from "../../utils/practiceSet.js";
import { BRAIN_QUESTION_TYPE_LABELS, type BrainQuestionType } from "../types/myCourse";

export interface BrainTypedPlayerProps {
  questions: NormalizedPracticeQuestion[];
  /** Recorded responses by question index (the panel owns this state). */
  responses: Record<number, unknown>;
  onAnswer: (questionIndex: number, response: unknown) => void;
  /** The last question was finished — the panel moves to review. */
  onDone: () => void;
  /** Where to open (a review-grid jump lands here). */
  startIndex?: number;
}

type Draft = {
  choice: number | null;
  texts: string[];
  text: string;
  selectedLeft: string | null;
  pairs: Record<string, string>;
  selectedItem: string | null;
  placements: Record<string, string>;
  point: { x: number; y: number; id: string } | null;
};

const emptyDraft = (): Draft => ({
  choice: null,
  texts: [],
  text: "",
  selectedLeft: null,
  pairs: {},
  selectedItem: null,
  placements: {},
  point: null,
});

/** Small deterministic shuffle (stable per seed, so re-renders never reshuffle). */
const shuffled = (values: string[], seed: string): string[] => {
  const out = [...values];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  for (let i = out.length - 1; i > 0; i -= 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const j = hash % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export default function BrainTypedPlayer({
  questions,
  responses,
  onAnswer,
  onDone,
  startIndex = 0,
}: BrainTypedPlayerProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(questions.length - 1, 0)));
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [checked, setChecked] = useState(false);
  const question = questions[index];
  const type = (question?.questionType ?? "mcq") as BrainQuestionType;
  const isLast = index >= questions.length - 1;

  const matchRights = useMemo(
    () => (question ? shuffled((question.matchPairs ?? []).map((pair) => pair.right), `${question.id}:b`) : []),
    [question],
  );
  const labelPool = useMemo(
    () => (question ? shuffled(question.labelOptions ?? [], `${question.id}:labels`) : []),
    [question],
  );

  if (!question) return null;

  const goTo = (next: number) => {
    setIndex(next);
    setDraft(emptyDraft());
    setChecked(false);
  };

  const advance = () => {
    if (isLast) onDone();
    else goTo(index + 1);
  };

  /** The response the current draft represents (evaluator shapes). */
  const draftResponse = (): unknown => {
    switch (type) {
      case "mcq":
      case "assertion_reason":
        return draft.choice;
      case "fill_blank":
        return draft.texts;
      case "one_word":
        return draft.text;
      case "match":
        return draft.pairs;
      case "drag_drop":
      case "label_diagram":
        return draft.placements;
      case "hotspot":
        return draft.point?.id ?? null;
      default:
        return null;
    }
  };

  const draftComplete = ((): boolean => {
    switch (type) {
      case "mcq":
      case "assertion_reason":
        return draft.choice !== null;
      case "fill_blank":
        return draft.texts.length >= countPromptBlanks(question.prompt) && draft.texts.every((value) => value.trim());
      case "one_word":
        return Boolean(draft.text.trim());
      case "match":
        return (question.matchPairs ?? []).every((pair) => draft.pairs[pair.left]);
      case "drag_drop":
        return (question.dragTargets ?? []).every((target) => draft.placements[target.id]);
      case "label_diagram":
        return (question.labelTargets ?? []).every((target) => draft.placements[target.id]);
      case "hotspot":
        return draft.point !== null;
      default:
        return false;
    }
  })();

  const recorded = responses[index];
  const verdict = checked ? evaluatePracticeAnswer(question, recorded) : null;
  const summary = checked ? practiceAnswerSummary(question, recorded) : null;

  const check = () => {
    if (!draftComplete) return;
    onAnswer(index, draftResponse());
    setChecked(true);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-brain-typed-player="" data-brain-typed-type={type}>
      <div className="mx-auto w-full max-w-2xl space-y-3">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
            style={{ background: BRAIN.pill, color: BRAIN.pillInk }}
            data-brain-typed-progress=""
          >
            Question {index + 1} of {questions.length}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
            style={{ background: "rgba(17,17,17,0.10)", color: BRAIN.ink }}
          >
            {BRAIN_QUESTION_TYPE_LABELS[type] ?? type}
          </span>
        </div>

        <BrainSurface shadow="top" style={{ padding: 18 }}>
          {type === "assertion_reason" ? (
            <div className="space-y-3">
              <div className="rounded-xl p-3" style={{ background: "rgba(17,17,17,0.06)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: BRAIN.inkFaint }}>
                  Assertion (A)
                </p>
                <p className="mt-1 font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                  {question.assertion}
                </p>
              </div>
              <div className="rounded-xl p-3" style={{ background: "rgba(17,17,17,0.06)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: BRAIN.inkFaint }}>
                  Reason (R)
                </p>
                <p className="mt-1 font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                  {question.reason}
                </p>
              </div>
              {question.prompt ? (
                <p className="text-sm font-medium" style={{ color: BRAIN.inkSoft }}>
                  {question.prompt}
                </p>
              ) : null}
              <ChoiceList
                choices={ASSERTION_REASON_CHOICES}
                value={draft.choice}
                disabled={checked}
                onPick={(value) => setDraft((d) => ({ ...d, choice: value }))}
              />
            </div>
          ) : type === "mcq" ? (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }} data-brain-typed-prompt="">
                {question.prompt}
              </p>
              <ChoiceList
                choices={question.options}
                value={draft.choice}
                disabled={checked}
                onPick={(value) => setDraft((d) => ({ ...d, choice: value }))}
              />
            </div>
          ) : type === "fill_blank" ? (
            <div className="space-y-3">
              <FillBlankPrompt
                prompt={question.prompt}
                values={draft.texts}
                disabled={checked}
                onChange={(blank, value) =>
                  setDraft((d) => {
                    const texts = [...d.texts];
                    texts[blank] = value;
                    return { ...d, texts };
                  })
                }
              />
            </div>
          ) : type === "one_word" ? (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                {question.prompt}
              </p>
              <input
                value={draft.text}
                disabled={checked}
                onChange={(event) => {
                  // Read synchronously: a deferred state updater would run
                  // after React clears the event's currentTarget.
                  const value = event.currentTarget.value;
                  setDraft((d) => ({ ...d, text: value }));
                }}
                placeholder="Type your answer"
                aria-label="Your answer"
                className="h-11 w-full rounded-xl border px-3 text-sm font-semibold outline-none disabled:opacity-60"
                style={{ borderColor: BRAIN.line, background: BRAIN.plate, color: BRAIN.ink }}
                data-brain-typed-input=""
              />
            </div>
          ) : type === "match" ? (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                {question.prompt || "Match the following"}
              </p>
              <p className="text-xs font-medium" style={{ color: BRAIN.inkSoft }}>
                Tap an item in Column A, then its match in Column B.
              </p>
              <div className="grid grid-cols-2 gap-3" data-brain-typed-match="">
                <div className="space-y-2">
                  {(question.matchPairs ?? []).map((pair) => {
                    const selected = draft.selectedLeft === pair.left;
                    const paired = Boolean(draft.pairs[pair.left]);
                    return (
                      <button
                        key={pair.left}
                        type="button"
                        disabled={checked}
                        onClick={() => setDraft((d) => ({ ...d, selectedLeft: selected ? null : pair.left }))}
                        className="w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold disabled:opacity-70"
                        style={{
                          borderColor: selected ? BRAIN.pill : BRAIN.line,
                          background: selected ? BRAIN.pill : paired ? "rgba(31,122,84,0.14)" : BRAIN.plate,
                          color: selected ? BRAIN.pillInk : BRAIN.ink,
                        }}
                        data-brain-match-left={pair.left}
                        aria-pressed={selected}
                      >
                        {pair.left}
                        {paired ? <span className="block text-[11px] opacity-80">→ {draft.pairs[pair.left]}</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {matchRights.map((right) => {
                    const usedBy = Object.keys(draft.pairs).find((left) => draft.pairs[left] === right);
                    return (
                      <button
                        key={right}
                        type="button"
                        disabled={checked || !draft.selectedLeft}
                        onClick={() => {
                          if (!draft.selectedLeft) return;
                          setDraft((d) => {
                            const pairs = { ...d.pairs };
                            // One partner per right item: taking it frees its old pair.
                            for (const left of Object.keys(pairs)) if (pairs[left] === right) delete pairs[left];
                            pairs[d.selectedLeft as string] = right;
                            return { ...d, pairs, selectedLeft: null };
                          });
                        }}
                        className="w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold disabled:opacity-60"
                        style={{
                          borderColor: BRAIN.line,
                          background: usedBy ? "rgba(31,122,84,0.14)" : BRAIN.plate,
                          color: BRAIN.ink,
                        }}
                        data-brain-match-right={right}
                      >
                        {right}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : type === "drag_drop" ? (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                {question.prompt}
              </p>
              <p className="text-xs font-medium" style={{ color: BRAIN.inkSoft }}>
                Drag an item into its target — or tap an item, then tap its target.
              </p>
              <div className="flex flex-wrap gap-2" data-brain-typed-items="">
                {(question.dragItems ?? []).map((item) => {
                  const placed = Object.values(draft.placements).includes(item);
                  const selected = draft.selectedItem === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      disabled={checked}
                      draggable={!checked}
                      onDragStart={(event) => event.dataTransfer.setData("text/plain", item)}
                      onClick={() => setDraft((d) => ({ ...d, selectedItem: selected ? null : item }))}
                      className="rounded-full border px-3 py-1.5 text-sm font-bold disabled:opacity-60"
                      style={{
                        borderColor: selected ? BRAIN.pill : BRAIN.line,
                        background: selected ? BRAIN.pill : BRAIN.plate,
                        color: selected ? BRAIN.pillInk : BRAIN.ink,
                        opacity: placed && !selected ? 0.45 : 1,
                      }}
                      data-brain-drag-item={item}
                      aria-pressed={selected}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2" data-brain-typed-targets="">
                {(question.dragTargets ?? []).map((target) => {
                  const placed = draft.placements[target.id];
                  return (
                    <div
                      key={target.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (checked) return;
                        const item = event.dataTransfer.getData("text/plain");
                        if (item) setDraft((d) => ({ ...d, placements: { ...d.placements, [target.id]: item } }));
                      }}
                      onClick={() => {
                        if (checked || !draft.selectedItem) return;
                        const item = draft.selectedItem;
                        setDraft((d) => ({ ...d, placements: { ...d.placements, [target.id]: item }, selectedItem: null }));
                      }}
                      className="flex min-h-12 items-center gap-2 rounded-xl border border-dashed px-3 py-2"
                      style={{ borderColor: BRAIN.line, background: "rgba(17,17,17,0.04)" }}
                      data-brain-drop-target={target.id}
                    >
                      <span className="text-sm font-bold" style={{ color: BRAIN.ink }}>
                        {target.label}
                      </span>
                      {placed ? (
                        <span
                          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                          style={{ background: BRAIN.pill, color: BRAIN.pillInk }}
                        >
                          {placed}
                          {!checked ? (
                            <button
                              type="button"
                              aria-label={`Remove ${placed} from ${target.label}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDraft((d) => {
                                  const placements = { ...d.placements };
                                  delete placements[target.id];
                                  return { ...d, placements };
                                });
                              }}
                              className="grid h-4 w-4 place-items-center rounded-full bg-white/25 text-[10px]"
                            >
                              ×
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        <span className="ml-auto text-xs font-semibold" style={{ color: BRAIN.inkFaint }}>
                          Drop here
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {!checked && Object.keys(draft.placements).length ? (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, placements: {} }))}
                  className="inline-flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline"
                  style={{ color: BRAIN.inkSoft }}
                  data-brain-typed-reset=""
                >
                  <RotateCcw size={12} /> Reset placements
                </button>
              ) : null}
            </div>
          ) : type === "label_diagram" ? (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                {question.prompt}
              </p>
              {question.imageUrl ? (
                <>
                  <p className="text-xs font-medium" style={{ color: BRAIN.inkSoft }}>
                    Tap a label, then tap its numbered target on the diagram.
                  </p>
                  <div className="relative overflow-hidden rounded-xl" data-brain-typed-diagram="">
                    <img src={question.imageUrl} alt="Diagram to label" className="block w-full object-contain" draggable={false} />
                    {(question.labelTargets ?? []).map((target, targetIndex) => {
                      const placed = draft.placements[target.id];
                      return (
                        <button
                          key={target.id}
                          type="button"
                          disabled={checked}
                          onClick={() => {
                            if (!draft.selectedItem) return;
                            const label = draft.selectedItem;
                            setDraft((d) => {
                              const placements = { ...d.placements };
                              for (const key of Object.keys(placements)) if (placements[key] === label) delete placements[key];
                              placements[target.id] = label;
                              return { ...d, placements, selectedItem: null };
                            });
                          }}
                          className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-black ring-2 ring-white"
                          style={{
                            left: `${target.x}%`,
                            top: `${target.y}%`,
                            minWidth: 26,
                            height: 26,
                            padding: "0 6px",
                            background: placed ? "#1F7A54" : BRAIN.pill,
                            color: "#fff",
                          }}
                          data-brain-label-target={target.id}
                          aria-label={`Target ${targetIndex + 1}${placed ? `: ${placed}` : ""}`}
                        >
                          {placed ?? targetIndex + 1}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {labelPool.map((label) => {
                      const used = Object.values(draft.placements).includes(label);
                      const selected = draft.selectedItem === label;
                      return (
                        <button
                          key={label}
                          type="button"
                          disabled={checked}
                          onClick={() => setDraft((d) => ({ ...d, selectedItem: selected ? null : label }))}
                          className="rounded-full border px-3 py-1.5 text-sm font-bold disabled:opacity-60"
                          style={{
                            borderColor: selected ? BRAIN.pill : BRAIN.line,
                            background: selected ? BRAIN.pill : BRAIN.plate,
                            color: selected ? BRAIN.pillInk : BRAIN.ink,
                            opacity: used && !selected ? 0.45 : 1,
                          }}
                          data-brain-label-chip={label}
                          aria-pressed={selected}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <MissingImage />
              )}
            </div>
          ) : type === "hotspot" ? (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                {question.prompt}
              </p>
              {question.imageUrl ? (
                <>
                  <p className="text-xs font-medium" style={{ color: BRAIN.inkSoft }}>
                    Tap the correct place on the image.
                  </p>
                  <div
                    className="relative cursor-crosshair overflow-hidden rounded-xl"
                    data-brain-typed-hotspot=""
                    onClick={(event) => {
                      if (checked) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      if (!rect.width || !rect.height) return;
                      const x = ((event.clientX - rect.left) / rect.width) * 100;
                      const y = ((event.clientY - rect.top) / rect.height) * 100;
                      const hit = (question.hotspots ?? []).find(
                        (spot) => Math.hypot(spot.x - x, spot.y - y) <= spot.r,
                      );
                      setDraft((d) => ({ ...d, point: { x, y, id: hit?.id ?? "__miss__" } }));
                    }}
                  >
                    <img src={question.imageUrl} alt="Hotspot" className="block w-full object-contain" draggable={false} />
                    {draft.point ? (
                      <span
                        className="pointer-events-none absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white ring-2 ring-white"
                        style={{
                          left: `${draft.point.x}%`,
                          top: `${draft.point.y}%`,
                          background: checked ? (verdict === "correct" ? "#1F7A54" : "#B23A48") : BRAIN.pill,
                        }}
                      >
                        {checked ? (verdict === "correct" ? <CheckCircle2 size={14} /> : <XCircle size={14} />) : null}
                      </span>
                    ) : null}
                    {checked
                      ? (question.hotspots ?? [])
                          .filter((spot) => (question.correctHotspotIds ?? []).includes(spot.id))
                          .map((spot) => (
                            <span
                              key={spot.id}
                              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-500 bg-emerald-400/25"
                              style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.r * 2}%`, paddingTop: `${spot.r * 2}%` }}
                            />
                          ))
                      : null}
                  </div>
                </>
              ) : (
                <MissingImage />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-semibold leading-snug" style={{ color: BRAIN.ink }}>
                {question.prompt}
              </p>
              <p className="text-sm font-medium" style={{ color: BRAIN.inkSoft }}>
                This question type is not supported in this app version.
              </p>
            </div>
          )}
        </BrainSurface>

        {checked && summary ? (
          <div
            className="rounded-2xl p-4"
            style={{
              background: verdict === "correct" ? "rgba(31,122,84,0.14)" : "rgba(178,58,72,0.12)",
              border: `1px solid ${verdict === "correct" ? "rgba(31,122,84,0.45)" : "rgba(178,58,72,0.4)"}`,
            }}
            data-brain-typed-feedback={verdict ?? ""}
            role="status"
          >
            <p className="flex items-center gap-2 font-black" style={{ color: verdict === "correct" ? "#12543A" : "#7C2431" }}>
              {verdict === "correct" ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
              {verdict === "correct" ? "Correct!" : "Not quite"}
            </p>
            {verdict !== "correct" ? (
              <p className="mt-1.5 text-sm font-semibold" style={{ color: BRAIN.ink }}>
                Correct answer: {summary.correct}
              </p>
            ) : null}
            {question.explanation ? (
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: BRAIN.inkSoft }}>
                <span className="font-bold">Explanation: </span>
                {question.explanation}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex gap-2 pb-2">
          {!checked ? (
            <>
              <BrainPill tone="outline" onClick={advance} className="min-w-0" style={{ flex: 1, minHeight: 46 }}>
                Skip
              </BrainPill>
              <BrainPill
                onClick={check}
                disabled={!draftComplete}
                className="min-w-0"
                style={{ flex: 1.4, minHeight: 46, opacity: draftComplete ? 1 : 0.45 }}
                data-brain-typed-check=""
              >
                Check answer
              </BrainPill>
            </>
          ) : (
            <BrainPill onClick={advance} className="w-full" style={{ minHeight: 46 }} data-brain-typed-next="">
              {isLast ? "Finish — review answers" : "Next question"}
            </BrainPill>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingImage() {
  return (
    <p
      className="rounded-xl border border-dashed px-3 py-5 text-center text-sm font-semibold"
      style={{ borderColor: BRAIN.line, color: BRAIN.inkSoft }}
      data-brain-typed-missing-image=""
    >
      This question's image is missing, so it cannot be answered yet.
    </p>
  );
}

function ChoiceList({
  choices,
  value,
  disabled,
  onPick,
}: {
  choices: string[];
  value: number | null;
  disabled: boolean;
  onPick: (index: number) => void;
}) {
  return (
    <div className="space-y-2" data-brain-typed-choices="">
      {choices.map((choice, choiceIndex) => {
        const selected = value === choiceIndex;
        return (
          <button
            key={choiceIndex}
            type="button"
            disabled={disabled}
            onClick={() => onPick(choiceIndex)}
            aria-pressed={selected}
            className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-70"
            style={{
              borderColor: selected ? BRAIN.pill : BRAIN.line,
              background: selected ? BRAIN.pill : BRAIN.plate,
              color: selected ? BRAIN.pillInk : BRAIN.ink,
            }}
            data-brain-typed-choice={choiceIndex}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-black"
              style={{ borderColor: "currentColor" }}
            >
              {String.fromCharCode(65 + choiceIndex)}
            </span>
            <span className="min-w-0 flex-1">{choice}</span>
          </button>
        );
      })}
    </div>
  );
}

function FillBlankPrompt({
  prompt,
  values,
  disabled,
  onChange,
}: {
  prompt: string;
  values: string[];
  disabled: boolean;
  onChange: (blank: number, value: string) => void;
}) {
  const parts = prompt.split(/(_{3,})/g);
  let blank = -1;
  return (
    <p className="text-[15px] font-semibold leading-9" style={{ color: BRAIN.ink }} data-brain-typed-prompt="">
      {parts.map((part, partIndex) => {
        if (!/_{3,}/.test(part)) return <span key={partIndex}>{part}</span>;
        blank += 1;
        const at = blank;
        return (
          <input
            key={partIndex}
            value={values[at] ?? ""}
            disabled={disabled}
            onChange={(event) => onChange(at, event.currentTarget.value)}
            aria-label={`Blank ${at + 1}`}
            placeholder={`Blank ${at + 1}`}
            className="mx-1 inline-block h-9 w-36 rounded-lg border px-2 text-sm font-bold outline-none disabled:opacity-60"
            style={{ borderColor: BRAIN.pill, background: BRAIN.plate, color: BRAIN.ink }}
            data-brain-typed-blank={at}
          />
        );
      })}
    </p>
  );
}
