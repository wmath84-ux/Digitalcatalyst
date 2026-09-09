// src/ai/AiStudyModeView.tsx
//
// "Study Mode" for one personal module — an intentionally small, linear flow:
//
//   1. pick the readable material to study
//   2. AI gives a short orientation
//   3. study the material (with honest availability per file)
//   4. generate + check questions
//   5. finish with a short progress summary (mistakes → weak topics → explain)
//
// No gamification, no streaks, no leaderboards, no spaced repetition — those
// belong to later work.

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, Flag, Lightbulb, ListChecks, TriangleAlert,
} from "lucide-react";
import { cn } from "../utils/cn";
import {
  AiActionButton, AiAvailabilityRow, AiBusyRow, AiCoverageLine, AiFailureBanner,
  AiProse, AiPill, AiSectionCard, AiSourceChips,
} from "./components";
import AiQuestionsView from "./AiQuestionsView";
import { GlassCheckbox } from "../components/ui/glass-checkbox";
import { trackAiEvent } from "../utils/featureAnalytics";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiOrientation } from "./types";

type Step = "material" | "orientation" | "study" | "practice" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "material", label: "Material" },
  { id: "orientation", label: "Orientation" },
  { id: "study", label: "Study" },
  { id: "practice", label: "Practice" },
  { id: "review", label: "Wrap up" },
];

interface Props {
  ai: ModuleAiController;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
  onAsk: (question: string) => void;
  onWeakTopics: () => void;
}

export default function AiStudyModeView({ ai, onOpenUpgrade, onConfigureAi, onAsk, onWeakTopics }: Props) {
  const [step, setStep] = useState<Step>("material");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const resources = ai.snapshot?.resources || [];
  const readable = useMemo(() => resources.filter((row) => row.readable), [resources]);
  const chosen = useMemo(() => readable.filter((row) => selected[row.id] !== false), [readable, selected]);
  const orientation = ai.orientation?.payload;
  const questions = ai.questions?.payload.questions || [];
  const weak = ai.weakTopics;

  const startSession = () => {
    setStarted(true);
    trackAiEvent("study_mode_started", { readable: readable.length, selected: chosen.length });
    if (!ai.orientation) void ai.generate<PersonalAiOrientation>("orientation");
    setStep("orientation");
  };

  const stepIndex = STEPS.findIndex((row) => row.id === step);
  const go = (delta: number) => {
    const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, stepIndex + delta))];
    if (next) setStep(next.id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-module-ai-study-mode="">
      <div className="shrink-0 border-b border-white/10 px-3 py-2.5 sm:px-5">
        <ol className="flex items-center gap-1 overflow-x-auto" data-module-ai-study-steps="">
          {STEPS.map((row, index) => (
            <li key={row.id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setStep(row.id)}
                disabled={index > 0 && !started}
                aria-current={row.id === step ? "step" : undefined}
                className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[10px] font-black uppercase tracking-wide transition disabled:opacity-35",
                  row.id === step ? "bg-violet-600 text-white" : index < stepIndex ? "bg-emerald-500/15 text-emerald-200" : "bg-white/[0.05] text-white/45")}
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-black/20 text-[9px]">{index + 1}</span>
                {row.label}
              </button>
              {index < STEPS.length - 1 ? <ArrowRight size={12} className="text-white/15" /> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <AiFailureBanner failure={ai.failure} onRetry={() => void ai.reload()} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

          {step === "material" ? (
            <AiSectionCard
              title="What should we study?"
              hint="Only readable material can ground a session. Files the AI can't read are shown honestly and left out."
              action={<AiPill tone="violet">{chosen.length} of {resources.length} selected</AiPill>}
            >
              {ai.snapshot?.coverage ? <AiCoverageLine coverage={ai.snapshot.coverage} className="mb-3" /> : null}
              {resources.length ? (
                <div className="space-y-2">
                  {resources.map((resource) => {
                    const on = resource.readable && selected[resource.id] !== false;
                    return (
                      // The row itself is the control (same pattern as the AI
                      // test generator); the pack checkbox inside is presentational.
                      <button
                        key={resource.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={!resource.readable}
                        onClick={() => setSelected((current) => ({ ...current, [resource.id]: !on }))}
                        className={cn("flex w-full items-start gap-2.5 rounded-2xl border p-3 text-left transition disabled:opacity-60",
                          on ? "border-violet-400/35 bg-violet-500/[0.08]" : "border-white/10 bg-white/[0.02]")}
                        data-module-ai-study-material={resource.id}
                      >
                        <span className="mt-0.5 shrink-0" aria-hidden>
                          <GlassCheckbox checked={on} tabIndex={-1} className="pointer-events-none border-violet-400/70 bg-violet-500/80" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-black">{resource.name}</span>
                          <span className="mt-0.5 block text-[10px] font-bold text-white/35">{resource.provenance}</span>
                          {!resource.readable ? <span className="mt-1 block text-[11px] font-medium leading-4 text-white/50">{resource.reason}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-medium leading-5 text-white/50">This module has no resources yet.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <AiActionButton label="Start study session" icon={ArrowRight} tone="primary" disabled={chosen.length === 0}
                  busy={ai.busy?.kind === "orientation"} onClick={startSession} dataAttrs={{ "data-module-ai-study-start": "" }} />
                {readable.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200"><TriangleAlert size={13} /> Nothing readable yet — add a description, a note, or a PDF / shared Google Doc.</p>
                ) : null}
              </div>
            </AiSectionCard>
          ) : null}

          {step === "orientation" ? (
            <AiSectionCard title="Orientation" hint="A short, honest read of what this material is and what matters most.">
              {ai.busy?.kind === "orientation" ? <AiBusyRow label={ai.busy.label} /> : null}
              {orientation ? (
                <div className="space-y-3">
                  <AiProse text={orientation.orientation} />
                  {orientation.focus.length ? (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Cover in this session</p>
                      <ul className="mt-1.5 space-y-1">
                        {orientation.focus.map((item) => (
                          <li key={item} className="flex gap-2 text-[12px] font-medium leading-5 text-white/75">
                            <CheckCircle2 size={13} className="mt-1 shrink-0 text-emerald-300" /><span className="min-w-0 flex-1">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {orientation.watchOut.length ? (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Watch out for</p>
                      <ul className="mt-1.5 space-y-1">
                        {orientation.watchOut.map((item) => (
                          <li key={item} className="flex gap-2 text-[12px] font-medium leading-5 text-amber-100/85">
                            <TriangleAlert size={13} className="mt-1 shrink-0" /><span className="min-w-0 flex-1">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {orientation.firstStep ? (
                    <p className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.07] px-3.5 py-2.5 text-[12px] font-bold leading-5 text-violet-100">
                      Start with: {orientation.firstStep}
                    </p>
                  ) : null}
                  {orientation.insufficient ? (
                    <p className="text-[11px] font-bold leading-4 text-amber-200">There wasn't much readable material to orient you — the session will be short and honest.</p>
                  ) : null}
                  {ai.orientation ? <AiSourceChips sources={ai.orientation.sources} title="Grounded in" /> : null}
                </div>
              ) : ai.busy?.kind !== "orientation" ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium leading-5 text-white/55">No orientation yet.</p>
                  <AiActionButton label="Get orientation" icon={Lightbulb} tone="primary" onClick={() => void ai.generate<PersonalAiOrientation>("orientation")} />
                </div>
              ) : null}
            </AiSectionCard>
          ) : null}

          {step === "study" ? (
            <AiSectionCard title="Study the material" hint="Work through the selected files. The AI can answer questions about any of them while you read.">
              <div className="space-y-2">
                {chosen.length ? chosen.map((resource) => <AiAvailabilityRow key={resource.id} resource={resource} />) : (
                  <p className="text-xs font-medium leading-5 text-white/50">No material selected.</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <AiActionButton label="Ask about this material" icon={Lightbulb} tone="primary" onClick={() => onAsk("Explain the most important ideas in the material I selected for this session")} />
                <AiActionButton label="Go to practice" icon={ListChecks} onClick={() => setStep("practice")} />
              </div>
            </AiSectionCard>
          ) : null}

          {step === "practice" ? (
            <>
              <AiSectionCard title="Check yourself" hint="Answer these grounded questions — misses are recorded as weak-topic evidence automatically.">
                <div className="flex flex-wrap gap-2">
                  <AiActionButton label={questions.length ? "New question set" : "Generate questions"} icon={ListChecks} tone="primary"
                    busy={ai.busy?.kind === "questions"} onClick={() => void ai.generate("questions", { count: Math.min(10, Math.max(5, chosen.length * 2)) })} />
                  {questions.length ? <AiActionButton label="Finish and review" icon={Flag} onClick={() => setStep("review")} /> : null}
                </div>
              </AiSectionCard>
              {questions.length ? <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]"><AiQuestionsView ai={ai} onOpenUpgrade={onOpenUpgrade} onConfigureAi={onConfigureAi} onOpenWeakTopics={() => setStep("review")} /></div> : null}
            </>
          ) : null}

          {step === "review" ? (
            <AiSectionCard title="Session wrap-up" hint="A short, honest summary of this session — no scores invented, no streaks.">
              <ul className="space-y-2">
                <li className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <BookOpenCheck size={15} className="mt-0.5 shrink-0 text-violet-300" />
                  <span className="min-w-0 flex-1 text-[12px] font-medium leading-5 text-white/70">
                    Studied <span className="font-black text-white">{chosen.length}</span> readable resource{chosen.length === 1 ? "" : "s"} of {resources.length} in this module.
                    {resources.length > chosen.length ? ` ${resources.length - chosen.length} could not be read and were left out.` : ""}
                  </span>
                </li>
                <li className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <ListChecks size={15} className="mt-0.5 shrink-0 text-cyan-300" />
                  <span className="min-w-0 flex-1 text-[12px] font-medium leading-5 text-white/70">
                    {questions.length ? `${questions.length} practice question${questions.length === 1 ? "" : "s"} generated from your material.` : "No practice questions generated in this session yet."}
                  </span>
                </li>
                <li className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-300" />
                  <span className="min-w-0 flex-1 text-[12px] font-medium leading-5 text-white/70">
                    {weak.state === "ready"
                      ? `Weak topics with real evidence: ${weak.topics.slice(0, 4).map((topic) => topic.topic).join(", ")}.`
                      : weak.message || "Keep practicing to discover your weak topics"}
                  </span>
                </li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                {weak.topics[0] ? <AiActionButton label={`Explain “${weak.topics[0].topic}”`} icon={Lightbulb} tone="primary" onClick={() => onAsk(`Explain ${weak.topics[0].topic} again, simply, using only this module's content`)} /> : null}
                <AiActionButton label="Open weak topics" icon={TriangleAlert} onClick={onWeakTopics} />
                <AiActionButton label="Back to material" icon={ArrowLeft} onClick={() => setStep("material")} />
              </div>
            </AiSectionCard>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-5">
        <AiActionButton label="Back" icon={ArrowLeft} tone="ghost" disabled={stepIndex <= 0} onClick={() => go(-1)} />
        <p className="min-w-0 flex-1 truncate text-center text-[10px] font-bold text-white/30">{STEPS[stepIndex]?.label}</p>
        <AiActionButton label="Next" icon={ArrowRight} tone="ghost" disabled={stepIndex >= STEPS.length - 1 || (stepIndex > 0 && !started)} onClick={() => go(1)} />
      </div>
    </div>
  );
}
