// src/ai/AiStudyPlanView.tsx
//
// "Create Study Plan" — a practical day-by-day plan generated from the module's
// available content only. The plan always states that, and it never invents a
// school calendar, exam dates or other subjects.

import { useState } from "react";
import { BookmarkPlus, CalendarDays, Info } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import { cn } from "../utils/cn";
import {
  AiActionButton, AiBusyRow, AiCoverageLine, AiEmptyState, AiFailureBanner,
  AiPill, AiSectionCard, AiSourceChips,
} from "./components";
import { saveAiNote } from "./aiNotes";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiPlan } from "./types";

const DAY_COUNTS = [3, 5, 7, 10];
const MINUTES = [20, 30, 45, 60, 90];

interface Props {
  ai: ModuleAiController;
  uid: string;
  productId?: string | null;
  moduleId: string;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
  onSavedNote?: () => void;
}

export default function AiStudyPlanView({ ai, uid, productId, moduleId, onOpenUpgrade, onConfigureAi, onSavedNote }: Props) {
  const [days, setDays] = useState(5);
  const [minutesPerDay, setMinutesPerDay] = useState(45);
  const generated = ai.plan;
  const plan = generated?.payload;
  const weakTopics = ai.weakTopics.topics.map((topic) => topic.topic);

  const generate = (force = false) => {
    void ai.generate<PersonalAiPlan>("plan", { days, minutesPerDay, force });
  };

  const saveNote = () => {
    if (!plan) return;
    const body = [
      plan.note,
      ...plan.days.map((day) => `Day ${day.day}: ${day.focus}${day.questions ? ` · ${day.questions} questions` : ""}\n${day.tasks.map((task) => `- ${task}`).join("\n")}`),
    ].filter(Boolean).join("\n\n");
    const saved = saveAiNote({ uid, productId, moduleId, resourceId: null, title: `AI study plan · ${ai.snapshot?.scope.title || "module"}`, body, kind: "plan" });
    if (saved) { toast({ title: "Plan saved to your notes", variant: "success" }); onSavedNote?.(); }
  };

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AiFailureBanner failure={ai.failure?.scope === "plan" ? ai.failure : null} onRetry={() => generate(true)} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

        <AiSectionCard
          title="Study plan"
          hint="A practical plan for this module's readable material, with weak-topic revision built in when you have evidence."
          action={
            <div className="flex gap-1.5">
              <AiActionButton label={plan ? "Rebuild plan" : "Create study plan"} icon={CalendarDays} tone={plan ? "default" : "primary"}
                busy={ai.busy?.kind === "plan"} onClick={() => generate(Boolean(plan))} dataAttrs={{ "data-module-ai-generate-plan": "" }} />
              {plan ? <AiActionButton label="Save as note" icon={BookmarkPlus} tone="ghost" onClick={saveNote} /> : null}
            </div>
          }
        >
          {ai.snapshot?.coverage ? <AiCoverageLine coverage={ai.snapshot.coverage} className="mb-3" /> : null}
          <div className="space-y-2.5">
            <div>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Plan length</p>
              <div className="flex flex-wrap gap-1">
                {DAY_COUNTS.map((option) => (
                  <button key={option} type="button" onClick={() => setDays(option)} disabled={Boolean(ai.busy)}
                    className={cn("min-h-10 rounded-full px-3.5 text-[11px] font-black ring-1 transition disabled:opacity-40",
                      days === option ? "bg-violet-600 text-white ring-violet-400/40" : "bg-white/[0.05] text-white/65 ring-white/10")}>
                    {option} days
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Time per day</p>
              <div className="flex flex-wrap gap-1">
                {MINUTES.map((option) => (
                  <button key={option} type="button" onClick={() => setMinutesPerDay(option)} disabled={Boolean(ai.busy)}
                    className={cn("min-h-10 rounded-full px-3.5 text-[11px] font-black ring-1 transition disabled:opacity-40",
                      minutesPerDay === option ? "bg-cyan-500/20 text-cyan-100 ring-cyan-400/30" : "bg-white/[0.04] text-white/55 ring-white/10")}>
                    {option} min
                  </button>
                ))}
              </div>
            </div>
            {weakTopics.length ? (
              <p className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] px-3 py-2 text-[11px] font-bold leading-4 text-amber-100/90">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>Your weak topics ({weakTopics.slice(0, 4).join(", ")}) will get dedicated revision time in the plan.</span>
              </p>
            ) : null}
          </div>

          {ai.busy?.kind === "plan" ? <AiBusyRow className="mt-3" label={ai.busy.label} /> : null}
          {!plan && ai.busy?.kind !== "plan" ? (
            <AiEmptyState className="mt-3" icon={CalendarDays} title="No plan yet"
              message={ai.hasReadableContent
                ? "The plan is generated from what the AI can actually read in this module — not from a guessed syllabus."
                : "This module has no readable content yet, so a plan would be guesswork."}
              action={<AiActionButton label={`Create ${days}-day plan`} tone="primary" onClick={() => generate(false)} disabled={!ai.hasReadableContent} />} />
          ) : null}
        </AiSectionCard>

        {plan ? (
          <AiSectionCard title="Your plan" action={<AiPill tone={generated?.reused ? "emerald" : "violet"}>{generated?.reused ? "Reused" : "New plan"}</AiPill>}>
            {plan.insufficient ? (
              <p className="mb-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[11px] font-bold leading-4 text-amber-100">
                There isn't enough readable material for a full plan, so this one is intentionally short and honest.
              </p>
            ) : null}
            <ol className="space-y-2" data-module-ai-plan="">
              {plan.days.map((day) => (
                <li key={day.day} className="rounded-3xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-300">Day {day.day}</p>
                      <p className="mt-1 break-words text-[13px] font-black leading-5 text-white/90">{day.focus}</p>
                    </div>
                    {day.questions > 0 ? <AiPill tone="cyan">{day.questions} questions</AiPill> : <AiPill>Revision</AiPill>}
                  </div>
                  {day.tasks.length ? (
                    <ul className="mt-2.5 space-y-1.5">
                      {day.tasks.map((task, index) => (
                        <li key={index} className="flex gap-2 text-[12px] font-medium leading-5 text-white/70">
                          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/70" aria-hidden="true" />
                          <span className="min-w-0 flex-1 break-words">{task}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[11px] font-bold leading-4 text-white/60">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>{plan.note || "This plan was generated from the content available in this module only."}</span>
            </p>
            {generated ? <AiSourceChips className="mt-3 border-t border-white/[0.07] pt-3" sources={generated.sources} title="Grounded in" /> : null}
          </AiSectionCard>
        ) : null}
      </div>
    </div>
  );
}
