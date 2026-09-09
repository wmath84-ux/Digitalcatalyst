// src/ai/AiSourcesView.tsx
//
// "What the AI can read" — the transparency panel behind every grounded answer.
//
// It lists each resource in the module with its honest availability state and
// the real reason it could not be read, plus the coverage line and the stored
// AI artifacts for this module (so a learner can see — and delete — what the
// engine kept). Nothing here calls the model.

import { Database, FileWarning, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import {
  AiActionButton, AiAvailabilityRow, AiBusyRow, AiCoverageLine, AiEmptyState,
  AiFailureBanner, AiPill, AiSectionCard,
} from "./components";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiResourceAvailability } from "./types";

const ARTIFACT_LABELS: Record<string, string> = {
  "module-summary": "Module summary",
  "resource-summary": "Resource summary",
  questions: "Generated questions",
  flashcards: "Flashcard deck",
  "study-plan": "Study plan",
  orientation: "Study-mode orientation",
  explanation: "Explanation",
  answer: "Answer",
};

interface Props {
  ai: ModuleAiController;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
  onOpenResource?: (resourceId: string) => void;
}

export default function AiSourcesView({ ai, onOpenUpgrade, onConfigureAi, onOpenResource }: Props) {
  const resources = ai.snapshot?.resources || [];
  const artifacts = ai.snapshot?.artifacts || [];
  const coverage = ai.snapshot?.coverage;

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AiFailureBanner failure={ai.failure?.scope === "context" ? ai.failure : null} onRetry={() => void ai.reload({ refresh: true })} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

        <AiSectionCard
          title="What the AI can read"
          hint="The AI only ever answers from what it actually read here. Nothing is guessed, and nothing unreadable is silently skipped."
          action={
            <AiActionButton label="Read again" icon={RefreshCw} tone="primary" busy={ai.busy?.kind === "context"}
              onClick={() => void ai.reload({ refresh: true })} dataAttrs={{ "data-module-ai-refresh-content": "" }} />
          }
        >
          {coverage ? <AiCoverageLine coverage={coverage} className="mb-3" /> : null}
          {ai.phase === "loading" ? <AiBusyRow label="Reading your module" /> : null}
          {ai.phase === "ready" ? <AiAvailabilityListPlaceholder resources={resources} onOpenResource={onOpenResource} /> : null}
          {ai.phase === "error" ? (
            <AiEmptyState icon={FileWarning} title="Couldn't read this module" message={ai.failure?.message || "Please try again."}
              action={<AiActionButton label="Try again" tone="primary" onClick={() => void ai.reload({ refresh: true })} />} />
          ) : null}
        </AiSectionCard>

        <AiSectionCard title="Stored AI results" hint="Cached on your account for this module only. Reused while the content is unchanged, so you don't spend allowance twice.">
          {artifacts.length ? (
            <ul className="space-y-2">
              {artifacts.map((artifact) => (
                <li key={artifact.id} className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <Database size={14} className="mt-0.5 shrink-0 text-white/30" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black">{ARTIFACT_LABELS[artifact.type] || artifact.type}</p>
                    <p className="mt-0.5 truncate text-[10px] font-bold text-white/35">
                      {new Date(artifact.updatedAt || artifact.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {artifact.summary ? ` · ${artifact.summary}` : ""}
                    </p>
                  </div>
                  <button type="button" aria-label={`Delete stored ${ARTIFACT_LABELS[artifact.type] || artifact.type}`}
                    onClick={async () => { await ai.deleteArtifact(artifact.id); toast({ title: "Stored AI result removed", variant: "success" }); }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-rose-300/70 transition hover:bg-rose-500/10">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs font-medium leading-5 text-white/50">Nothing stored yet. Summaries, question sets, flashcards and study plans appear here once generated.</p>
          )}
        </AiSectionCard>

        {ai.snapshot ? (
          <AiSectionCard title="How this stays private" hint="Ownership is enforced on the server, not in the browser.">
            <ul className="space-y-1.5 text-[11px] font-medium leading-4 text-white/55">
              <li className="flex gap-2"><AiPill tone="violet">Owner</AiPill><span className="min-w-0 flex-1">Only your account can read this module's AI data — the server derives the owner from your sign-in token.</span></li>
              <li className="flex gap-2"><AiPill tone="cyan">Scope</AiPill><span className="min-w-0 flex-1">Context contains this module only: {ai.snapshot.unitCount} grounding unit(s) from {ai.snapshot.coverage.total} resource(s). No official course content is mixed in.</span></li>
              <li className="flex gap-2"><AiPill tone="emerald">Allowance</AiPill><span className="min-w-0 flex-1">{ai.snapshot.ai.planName} · {ai.snapshot.ai.hasAccess ? "AI active" : "AI not active"} — the same plan allowance the rest of the app uses.</span></li>
            </ul>
          </AiSectionCard>
        ) : null}
      </div>
    </div>
  );
}

function AiAvailabilityListPlaceholder({ resources, onOpenResource }: {
  resources: PersonalAiResourceAvailability[];
  onOpenResource?: (resourceId: string) => void;
}) {
  if (!resources.length) {
    return <AiEmptyState icon={FileWarning} title="Nothing in this module yet" message="Add a resource and the AI will tell you honestly what it can read from it." />;
  }
  return (
    <div className="space-y-2">
      {resources.map((resource) => (
        <div key={resource.id} className="space-y-1.5">
          <AiAvailabilityRow resource={resource} />
          {onOpenResource ? (
            <button type="button" onClick={() => onOpenResource(resource.id)} className="ml-1 min-h-9 text-[11px] font-black text-violet-300">
              Open {resource.name}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
