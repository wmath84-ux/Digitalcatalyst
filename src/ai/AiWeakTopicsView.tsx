// src/ai/AiWeakTopicsView.tsx
//
// Evidence-based weak topics for ONE personal module. A topic only appears when
// the learner actually produced evidence (a wrong answer on a generated
// question, a repeated question, "I don't understand", a missed flashcard), so
// the panel can never label someone weak on a guess — and with no evidence it
// says exactly that.

import { useMemo } from "react";
import { Lightbulb, MessageCircleQuestion, Target, TrendingDown } from "lucide-react";
import { cn } from "../utils/cn";
import { AiActionButton, AiEmptyState, AiPill, AiSectionCard } from "./components";
import type { ModuleAiController } from "./useModuleAi";
import { PERSONAL_AI_EVIDENCE_KINDS } from "../../utils/personalAi";

const EVIDENCE_LABELS: Record<string, string> = {
  question_incorrect: "wrong answers",
  question_repeated: "asked to explain again",
  dont_understand: "marked “I don't understand”",
  flashcard_missed: "missed flashcards",
  low_session_score: "low session score",
};

const LEVEL_TONE = {
  high: { ring: "border-rose-400/30 bg-rose-500/[0.08]", pill: "amber" as const, label: "Needs work" },
  medium: { ring: "border-amber-400/25 bg-amber-500/[0.07]", pill: "amber" as const, label: "Shaky" },
  low: { ring: "border-white/10 bg-white/[0.03]", pill: "default" as const, label: "Watch" },
};

interface Props {
  ai: ModuleAiController;
  onPractice: () => void;
  onAsk: (topic: string) => void;
  onStudyMode?: () => void;
}

export default function AiWeakTopicsView({ ai, onPractice, onAsk, onStudyMode }: Props) {
  const { topics, state, message, totalEvents } = ai.weakTopics;
  const evidenceRows = ai.snapshot?.evidence || [];
  const recent = useMemo(() => [...evidenceRows].sort((a, b) => b.at - a.at).slice(0, 8), [evidenceRows]);

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AiSectionCard
          title="Weak topics"
          hint="Built only from your own answers in this module — wrong answers, repeated questions and cards you missed."
          action={<AiPill tone={state === "ready" ? "amber" : "default"}>{state === "ready" ? `${topics.length} topic${topics.length === 1 ? "" : "s"}` : "No evidence yet"}</AiPill>}
        >
          {state === "insufficient" ? (
            <AiEmptyState
              icon={Target}
              title={message || "Keep practicing to discover your weak topics"}
              message={totalEvents
                ? "You have some evidence, but not enough yet to call a topic weak. Answer a few more generated questions and this fills in on its own."
                : "Answer generated questions, use “Explain again”, or mark “I don't understand” — this module's weak topics appear here as soon as there is real evidence."}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <AiActionButton label="Generate questions" icon={MessageCircleQuestion} tone="primary" onClick={onPractice} />
                  {onStudyMode ? <AiActionButton label="Start Study Mode" icon={Lightbulb} onClick={onStudyMode} /> : null}
                </div>
              }
            />
          ) : (
            <ul className="space-y-2" data-module-ai-weak-topics="">
              {topics.map((topic) => {
                const tone = LEVEL_TONE[topic.level] || LEVEL_TONE.low;
                const breakdown = PERSONAL_AI_EVIDENCE_KINDS
                  .filter((kind) => (topic.evidence[kind] || 0) > 0)
                  .map((kind) => `${topic.evidence[kind]} ${EVIDENCE_LABELS[kind] || kind}`);
                return (
                  <li key={topic.key} className={cn("rounded-3xl border p-3.5", tone.ring)} data-weak-topic={topic.key}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{topic.topic}</p>
                        <p className="mt-1 text-[11px] font-bold leading-4 text-white/50">
                          {topic.hits} signal{topic.hits === 1 ? "" : "s"}{breakdown.length ? ` · ${breakdown.join(" · ")}` : ""}
                        </p>
                      </div>
                      <AiPill tone={tone.pill}>{tone.label}</AiPill>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-400" style={{ width: `${Math.min(100, Math.round((topic.score / 10) * 100))}%` }} />
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <AiActionButton label="Ask the AI about this" icon={MessageCircleQuestion} tone="ghost" onClick={() => onAsk(topic.topic)} />
                      <AiActionButton label="Practice this" icon={Target} tone="ghost" onClick={onPractice} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AiSectionCard>

        {recent.length ? (
          <AiSectionCard title="Recent evidence" hint="The exact signals behind the list above — nothing here is inferred.">
            <ul className="space-y-1.5">
              {recent.map((row) => (
                <li key={row.id} className="flex items-start gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                  <TrendingDown size={13} className="mt-0.5 shrink-0 text-white/30" />
                  <span className="min-w-0 flex-1 text-[11px] font-bold leading-4 text-white/60">
                    <span className="font-black text-white/80">{row.topic}</span> · {EVIDENCE_LABELS[row.kind] || row.kind}
                    <span className="ml-1 text-white/30">{new Date(row.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          </AiSectionCard>
        ) : null}
      </div>
    </div>
  );
}
