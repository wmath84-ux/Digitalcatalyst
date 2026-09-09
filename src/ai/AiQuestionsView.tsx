// src/ai/AiQuestionsView.tsx
//
// "Generate Questions" grounded in the module's readable content, with the
// connected practice flow: answer → see the explanation → "Explain Again" when
// it didn't land → the miss is recorded as weak-topic evidence.
//
// Question types follow what the shared pure layer normalises (mcq / short /
// boolean), so a model that returns a malformed item is dropped instead of
// rendered half-broken.

import { useMemo, useState } from "react";
import {
  CheckCircle2, ClipboardList, HelpCircle, Lightbulb, ListChecks, RotateCcw, XCircle,
} from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import { cn } from "../utils/cn";
import {
  AiActionButton, AiBusyRow, AiCoverageLine, AiEmptyState, AiFailureBanner,
  AiProse, AiPill, AiSectionCard, AiSourceChips,
} from "./components";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiExplanation, PersonalAiQuestion, PersonalAiQuestions } from "./types";

const COUNTS = [5, 10, 15, 20];
const TYPE_OPTIONS: { id: "mcq" | "short" | "boolean"; label: string }[] = [
  { id: "mcq", label: "MCQ" },
  { id: "short", label: "Short answer" },
  { id: "boolean", label: "True / False" },
];
const EXPLAIN_MODES: { id: "simple" | "steps" | "example" | "exam"; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "steps", label: "Step by step" },
  { id: "example", label: "Example" },
  { id: "exam", label: "Exam-style" },
];

interface Props {
  ai: ModuleAiController;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
  /** Jump to Weak Topics after a miss. */
  onOpenWeakTopics?: () => void;
}

interface AnswerState {
  value: string;
  optionIndex: number | null;
  checked: boolean;
  correct: boolean;
  revealed: boolean;
}

const emptyAnswers = (questions: PersonalAiQuestion[]): Record<string, AnswerState> =>
  Object.fromEntries(questions.map((question) => [question.id, { value: "", optionIndex: null, checked: false, correct: false, revealed: false }]));

export default function AiQuestionsView({ ai, onOpenUpgrade, onConfigureAi, onOpenWeakTopics }: Props) {
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<("mcq" | "short" | "boolean")[]>(["mcq", "short", "boolean"]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, PersonalAiExplanation>>({});
  const generated = ai.questions;
  const questions = generated?.payload.questions || [];

  const scored = useMemo(() => {
    const checked = questions.filter((question) => answers[question.id]?.checked);
    return {
      attempted: checked.length,
      correct: checked.filter((question) => answers[question.id]?.correct).length,
      total: questions.length,
    };
  }, [answers, questions]);

  const generate = (force = false) => {
    setAnswers({});
    setExplanations({});
    setExplaining(null);
    void ai.generate<PersonalAiQuestions>("questions", { count, types: types.length ? types : undefined, force })
      .then((result) => { if (result) setAnswers(emptyAnswers(result.questions)); });
  };

  const toggleType = (id: "mcq" | "short" | "boolean") => {
    setTypes((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  };

  const check = async (question: PersonalAiQuestion) => {
    const state = answers[question.id];
    if (!state || state.checked) return;
    const correct = question.type === "mcq"
      ? state.optionIndex === question.correctIndex
      : question.type === "boolean"
        ? state.value.trim().toLowerCase() === (question.answer || "").trim().toLowerCase()
        : state.value.trim().length > 1;
    setAnswers((current) => ({ ...current, [question.id]: { ...state, checked: true, correct, revealed: true } }));
    if (!correct && question.topic) {
      // Real evidence only: an actual miss on an actual generated question.
      await ai.recordEvidence("question_incorrect", question.topic, ai.snapshot?.scope.resourceId || null);
      toast({ title: "Recorded as a weak topic", description: `“${question.topic}” now counts toward your weak topics.`, variant: "info" });
    } else if (correct) {
      toast({ title: "Correct", variant: "success" });
    }
  };

  const reveal = (question: PersonalAiQuestion) => {
    setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], revealed: true, checked: true, correct: false } }));
  };

  const explainAgain = async (question: PersonalAiQuestion, mode: "simple" | "steps" | "example" | "exam") => {
    const state = answers[question.id];
    const result = await ai.explainAgain({
      question: question.prompt,
      answer: question.answer,
      explanation: question.explanation,
      learnerAnswer: question.type === "mcq" && state?.optionIndex != null ? question.options[state.optionIndex] : state?.value || "",
      mode,
    });
    if (result) {
      setExplanations((current) => ({ ...current, [question.id]: result }));
      if (question.topic) await ai.recordEvidence("question_repeated", question.topic, ai.snapshot?.scope.resourceId || null);
    }
  };

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AiFailureBanner failure={ai.failure?.scope === "questions" || ai.failure?.scope === "explain" ? ai.failure : null}
          onRetry={() => generate(true)} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

        <AiSectionCard
          title="Practice questions"
          hint="Every question is grounded in this module's readable content — never in facts that aren't in your material."
          action={
            <AiActionButton label={questions.length ? "Generate again" : "Generate questions"} icon={ClipboardList} tone={questions.length ? "default" : "primary"}
              busy={ai.busy?.kind === "questions"} onClick={() => generate(Boolean(questions.length))} dataAttrs={{ "data-module-ai-generate-questions": "" }} />
          }
        >
          {ai.snapshot?.coverage ? <AiCoverageLine coverage={ai.snapshot.coverage} className="mb-3" /> : null}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {COUNTS.map((option) => (
                <button key={option} type="button" onClick={() => setCount(option)} disabled={Boolean(ai.busy)}
                  className={cn("min-h-10 rounded-full px-3.5 text-[11px] font-black ring-1 transition disabled:opacity-40",
                    count === option ? "bg-violet-600 text-white ring-violet-400/40" : "bg-white/[0.05] text-white/65 ring-white/10")}>
                  {option} questions
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPE_OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => toggleType(option.id)} disabled={Boolean(ai.busy)}
                  aria-pressed={types.includes(option.id)}
                  className={cn("min-h-10 rounded-full px-3.5 text-[11px] font-black ring-1 transition disabled:opacity-40",
                    types.includes(option.id) ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/30" : "bg-white/[0.04] text-white/45 ring-white/10 line-through")}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {ai.busy?.kind === "questions" ? <AiBusyRow className="mt-3" label={ai.busy.label} /> : null}
          {!questions.length && ai.busy?.kind !== "questions" ? (
            <AiEmptyState className="mt-3" icon={ListChecks} title="No questions yet"
              message={ai.hasReadableContent
                ? "Generate a quick set from your material and answer them right here."
                : "This module has no readable content yet, so any question would be invented rather than grounded."}
              action={<AiActionButton label={`Generate ${count} questions`} tone="primary" onClick={() => generate(false)} disabled={!ai.hasReadableContent} />} />
          ) : null}
        </AiSectionCard>

        {questions.length ? (
          <AiSectionCard
            title="Your answers"
            hint={scored.attempted ? `${scored.correct} of ${scored.attempted} checked answers correct · ${scored.total - scored.attempted} left` : "Answer, then check — a miss becomes weak-topic evidence."}
            action={generated ? <AiPill tone={generated.reused ? "emerald" : "violet"}>{generated.reused ? "Reused" : "New set"}</AiPill> : null}
          >
            {generated?.authoredOnly ? (
              <p className="mb-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[11px] font-bold leading-4 text-amber-100">
                These questions are based on the titles, descriptions and notes you wrote — no file content could be read.
              </p>
            ) : null}
            {generated?.payload.insufficient ? (
              <p className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[11px] font-bold leading-4 text-white/60">
                The readable content only supported {questions.length} real question{questions.length === 1 ? "" : "s"} — the AI returned fewer rather than inventing more.
              </p>
            ) : null}
            <ol className="space-y-3">
              {questions.map((question, index) => {
                const state = answers[question.id] || { value: "", optionIndex: null, checked: false, correct: false, revealed: false };
                const explanation = explanations[question.id];
                return (
                  <li key={question.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-3.5" data-ai-question={question.id}>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[0.07] text-[10px] font-black text-white/60">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold leading-5 text-white/90">{question.prompt}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <AiPill>{question.type === "mcq" ? "MCQ" : question.type === "boolean" ? "True / False" : "Short answer"}</AiPill>
                          {question.topic ? <AiPill tone="cyan">{question.topic}</AiPill> : null}
                          {state.checked ? (
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1",
                              state.correct ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25" : "bg-rose-500/15 text-rose-200 ring-rose-400/25")}>
                              {state.correct ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {state.correct ? "Correct" : "Not yet"}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {question.type === "mcq" ? (
                      <div className="mt-3 space-y-1.5">
                        {question.options.map((option, optionIndex) => {
                          const selected = state.optionIndex === optionIndex;
                          const isAnswer = question.correctIndex === optionIndex;
                          const showResult = state.revealed;
                          return (
                            <button key={optionIndex} type="button" disabled={state.checked}
                              onClick={() => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], optionIndex } }))}
                              className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-left text-[12px] font-bold transition disabled:cursor-default",
                                showResult && isAnswer ? "border-emerald-400/40 bg-emerald-500/12 text-emerald-100"
                                  : showResult && selected ? "border-rose-400/40 bg-rose-500/12 text-rose-100"
                                    : selected ? "border-violet-400/45 bg-violet-500/15 text-white"
                                      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]")}>
                              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/10 text-[9px] font-black">{String.fromCharCode(65 + optionIndex)}</span>
                              <span className="min-w-0 flex-1 break-words">{option}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : question.type === "boolean" ? (
                      <div className="mt-3 flex gap-2">
                        {["True", "False"].map((option) => (
                          <button key={option} type="button" disabled={state.checked} onClick={() => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], value: option } }))}
                            className={cn("min-h-11 flex-1 rounded-2xl border px-3 text-[12px] font-black transition disabled:cursor-default",
                              state.value === option ? "border-violet-400/45 bg-violet-500/15 text-white" : "border-white/10 bg-white/[0.03] text-white/65")}>
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        value={state.value}
                        rows={2}
                        disabled={state.checked}
                        onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], value: event.target.value } }))}
                        placeholder="Type your answer…"
                        aria-label={`Answer to question ${index + 1}`}
                        className="mt-3 min-h-16 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-3.5 py-2.5 text-[13px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/60 disabled:opacity-60"
                      />
                    )}

                    {!state.checked ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <AiActionButton label="Check answer" tone="primary"
                          disabled={question.type === "mcq" ? state.optionIndex == null : !state.value.trim()}
                          onClick={() => void check(question)} />
                        {question.type === "short" ? <AiActionButton label="Reveal answer" icon={HelpCircle} tone="ghost" onClick={() => reveal(question)} /> : null}
                      </div>
                    ) : null}

                    {state.revealed ? (
                      <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Answer</p>
                        <p className="text-[13px] font-black text-emerald-200">{question.answer}</p>
                        {question.explanation ? <AiProse className="text-[12px] text-white/70" text={question.explanation} /> : null}
                        {!state.correct && question.type !== "short" ? (
                          <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.07] pt-2.5">
                            <span className="mr-1 text-[10px] font-black uppercase tracking-wide text-white/35">Explain again</span>
                            {EXPLAIN_MODES.map((mode) => (
                              <AiActionButton key={mode.id} label={mode.label} icon={Lightbulb} tone="ghost"
                                busy={ai.busy?.kind === "explain" && explaining === question.id}
                                onClick={() => { setExplaining(question.id); void explainAgain(question, mode.id); }}
                                dataAttrs={{ "data-ai-explain-again-question": question.id }} />
                            ))}
                            {question.topic && onOpenWeakTopics ? (
                              <AiActionButton label="See weak topics" tone="ghost" onClick={onOpenWeakTopics} />
                            ) : null}
                          </div>
                        ) : null}
                        {explanation ? (
                          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-3" data-ai-question-explanation={question.id}>
                            <p className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan-200">Explained again</p>
                            <AiProse className="text-[12px] text-white/80" text={explanation.explanation} />
                            {explanation.keyPoint ? <p className="mt-2 text-[11px] font-black text-white/70">Remember: {explanation.keyPoint}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {scored.attempted > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <RotateCcw size={14} className="text-white/35" />
                <p className="min-w-0 flex-1 text-[11px] font-bold text-white/60">
                  {scored.correct} / {scored.attempted} correct so far{scored.attempted < scored.total ? ` · ${scored.total - scored.attempted} question${scored.total - scored.attempted === 1 ? "" : "s"} left` : " · set complete"}
                </p>
                <AiActionButton label="Reset answers" tone="ghost" onClick={() => setAnswers(emptyAnswers(questions))} />
              </div>
            ) : null}
            {generated ? <AiSourceChips className="mt-3 border-t border-white/[0.07] pt-3" sources={generated.sources} title="Grounded in" /> : null}
          </AiSectionCard>
        ) : null}
      </div>
    </div>
  );
}
