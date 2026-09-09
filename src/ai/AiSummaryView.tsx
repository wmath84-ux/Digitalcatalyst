// src/ai/AiSummaryView.tsx
//
// "Generate Summary" (module level) + the lightweight per-resource "Summarize"
// action. Both go through the same grounded pipeline; the resource list shows
// each file's honest availability so a learner can see exactly which summaries
// are backed by real content and which are only backed by their own titles and
// descriptions.

import { useMemo, useState } from "react";
import { BookOpenText, BookmarkPlus, FileText, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import { cn } from "../utils/cn";
import {
  AiActionButton, AiAvailabilityRow, AiBusyRow, AiCoverageLine, AiEmptyState,
  AiFailureBanner, AiProse, AiPill, AiSectionCard, AiSourceChips,
} from "./components";
import { saveAiNote } from "./aiNotes";
import type { ModuleAiController } from "./useModuleAi";
import type { PersonalAiSummary } from "./types";

interface Props {
  ai: ModuleAiController;
  uid: string;
  productId?: string | null;
  moduleId: string;
  /** Set when the whole workspace is scoped to one resource. */
  resourceTitle?: string;
  onOpenUpgrade: () => void;
  onConfigureAi: () => void;
  onSavedNote?: () => void;
  /** Ask the AI about one specific resource from the module summary view. */
  onSummarizeResource?: (resourceId: string, resourceName: string) => void;
}

function SummaryBody({ summary, authoredOnly, coverageSentence }: { summary: PersonalAiSummary; authoredOnly: boolean; coverageSentence: string }) {
  return (
    <div className="space-y-4" data-module-ai-summary="">
      {summary.insufficient ? (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-3 text-[11px] font-bold leading-5 text-amber-100">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>The readable content here is too thin for a real summary. {coverageSentence}</span>
        </p>
      ) : null}
      {authoredOnly ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[11px] font-bold leading-4 text-white/60">
          Built from the titles, descriptions and notes you wrote — no file content could be read.
        </p>
      ) : null}
      {summary.overview ? (
        <div><h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Overview</h4><AiProse className="mt-1.5" text={summary.overview} /></div>
      ) : null}
      {summary.keyConcepts.length ? (
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Key concepts</h4>
          <ul className="mt-2 space-y-2">
            {summary.keyConcepts.map((concept, index) => (
              <li key={`${concept.title}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-black text-white/90">{concept.title}</p>
                {concept.detail ? <p className="mt-1 text-[12px] font-medium leading-5 text-white/65">{concept.detail}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.definitions.length ? (
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Important definitions</h4>
          <dl className="mt-2 space-y-1.5">
            {summary.definitions.map((definition, index) => (
              <div key={`${definition.term}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <dt className="text-xs font-black text-cyan-200">{definition.term}</dt>
                <dd className="mt-1 text-[12px] font-medium leading-5 text-white/65">{definition.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {summary.formulas.length ? (
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Formulas &amp; facts</h4>
          <ul className="mt-2 space-y-1.5">
            {summary.formulas.map((formula, index) => (
              <li key={`${formula.name}-${index}`} className="rounded-2xl border border-violet-400/15 bg-violet-500/[0.06] p-3">
                <p className="font-mono text-[13px] font-black text-violet-100">{formula.value || formula.name}</p>
                {formula.name && formula.value ? <p className="mt-0.5 text-[11px] font-bold text-white/50">{formula.name}</p> : null}
                {formula.when ? <p className="mt-1 text-[11px] font-medium leading-4 text-white/55">Use when: {formula.when}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.takeaways.length ? (
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Main takeaways</h4>
          <ul className="mt-2 space-y-1.5">{summary.takeaways.map((item, index) => (
            <li key={index} className="flex gap-2 text-[12px] font-medium leading-5 text-white/75">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" aria-hidden="true" /><span className="min-w-0 flex-1">{item}</span>
            </li>
          ))}</ul>
        </div>
      ) : null}
      {summary.remember.length ? (
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Things to remember</h4>
          <ul className="mt-2 space-y-1.5">{summary.remember.map((item, index) => (
            <li key={index} className="rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[12px] font-medium leading-5 text-amber-100/85">{item}</li>
          ))}</ul>
        </div>
      ) : null}
    </div>
  );
}

export default function AiSummaryView({
  ai, uid, productId, moduleId, resourceTitle, onOpenUpgrade, onConfigureAi, onSavedNote, onSummarizeResource,
}: Props) {
  const [resourceBusy, setResourceBusy] = useState<string | null>(null);
  const summary = ai.summary;
  const resources = ai.snapshot?.resources || [];
  const readableResources = useMemo(() => resources.filter((row) => row.readable || row.planKind !== "none"), [resources]);

  const generate = (force = false) => {
    void ai.generate<PersonalAiSummary>(ai.snapshot?.scope.resourceId ? "resource-summary" : "summary", { force });
  };

  const saveNote = () => {
    if (!summary) return;
    const body = [
      summary.payload.overview,
      summary.payload.keyConcepts.length ? `Key concepts:\n${summary.payload.keyConcepts.map((row) => `- ${row.title}${row.detail ? `: ${row.detail}` : ""}`).join("\n")}` : "",
      summary.payload.definitions.length ? `Definitions:\n${summary.payload.definitions.map((row) => `- ${row.term}: ${row.meaning}`).join("\n")}` : "",
      summary.payload.formulas.length ? `Formulas:\n${summary.payload.formulas.map((row) => `- ${row.value || row.name}${row.when ? ` (when: ${row.when})` : ""}`).join("\n")}` : "",
      summary.payload.takeaways.length ? `Takeaways:\n${summary.payload.takeaways.map((row) => `- ${row}`).join("\n")}` : "",
      summary.payload.remember.length ? `Remember:\n${summary.payload.remember.map((row) => `- ${row}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");
    const saved = saveAiNote({
      uid, productId, moduleId,
      resourceId: ai.snapshot?.scope.resourceId || null,
      title: `AI summary · ${resourceTitle || ai.snapshot?.scope.title || "module"}`,
      body,
      kind: "summary",
    });
    if (saved) { toast({ title: "Summary saved to your notes", description: "Your own notes were not changed.", variant: "success" }); onSavedNote?.(); }
  };

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <AiFailureBanner failure={ai.failure?.scope === "summary" || ai.failure?.scope === "resource-summary" ? ai.failure : null}
          onRetry={() => generate(true)} onUpgrade={onOpenUpgrade} onConfigure={onConfigureAi} />

        <AiSectionCard
          title={resourceTitle ? "Resource summary" : "Module summary"}
          hint={resourceTitle ? `A concise summary of “${resourceTitle}”, from the content the AI could actually read.` : "Key concepts, definitions, formulas, takeaways and things to remember — only from this module's readable content."}
          action={
            <div className="flex gap-1.5">
              <AiActionButton label={summary ? "Regenerate" : "Generate summary"} icon={BookOpenText} tone={summary ? "default" : "primary"}
                busy={ai.busy?.kind === "summary" || ai.busy?.kind === "resource-summary"} onClick={() => generate(Boolean(summary))}
                dataAttrs={{ "data-module-ai-generate-summary": "" }} />
              {summary ? <AiActionButton label="Save as note" icon={BookmarkPlus} tone="ghost" onClick={saveNote} /> : null}
            </div>
          }
        >
          {ai.snapshot?.coverage ? <AiCoverageLine coverage={ai.snapshot.coverage} className="mb-3" /> : null}
          {ai.busy?.kind === "summary" || ai.busy?.kind === "resource-summary" ? <AiBusyRow label={ai.busy.label} /> : null}
          {!summary && !(ai.busy?.kind === "summary" || ai.busy?.kind === "resource-summary") ? (
            <AiEmptyState
              icon={BookOpenText}
              title="No summary yet"
              message={ai.hasReadableContent
                ? "Generate a study summary of this module's readable material. Nothing is sent to the AI until you ask."
                : "This module has no readable content yet, so a summary would only repeat your own titles and descriptions."}
              action={<AiActionButton label="Generate summary" tone="primary" onClick={() => generate(false)} disabled={!ai.hasReadableContent} />}
            />
          ) : null}
          {summary ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {summary.reused ? <AiPill tone="emerald">Reused · saved your allowance</AiPill> : <AiPill tone="violet">Freshly generated</AiPill>}
                <AiPill>{new Date(summary.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</AiPill>
              </div>
              <SummaryBody summary={summary.payload} authoredOnly={summary.authoredOnly} coverageSentence={ai.coverageSentence} />
              <AiSourceChips className="border-t border-white/[0.07] pt-3" sources={summary.sources} title="Grounded in" />
            </div>
          ) : null}
        </AiSectionCard>

        {!resourceTitle && onSummarizeResource ? (
          <AiSectionCard
            title="Summarize one resource"
            hint="A quick per-file summary. Resources the AI can't read are listed honestly instead of being guessed at."
          >
            {readableResources.length ? (
              <div className="space-y-2">
                {readableResources.map((resource) => (
                  <div key={resource.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <FileText size={15} className="shrink-0 text-white/35" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black">{resource.name}</p>
                      <p className="truncate text-[10px] font-bold text-white/35">{resource.provenance}</p>
                    </div>
                    <AiActionButton
                      label="Summarize"
                      tone="default"
                      disabled={!resource.readable}
                      busy={resourceBusy === resource.id}
                      onClick={() => {
                        setResourceBusy(resource.id);
                        onSummarizeResource(resource.id, resource.name);
                        setResourceBusy(null);
                      }}
                      dataAttrs={{ "data-module-ai-summarize-resource": resource.id }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-medium leading-5 text-white/50">No resource in this module has a read path yet.</p>
            )}
          </AiSectionCard>
        ) : null}

        {!resourceTitle ? (
          <AiSectionCard title="What the AI could read" hint="Availability per resource — this is exactly what grounds every answer, summary, question and flashcard.">
            <div className="space-y-2">
              {resources.map((resource) => <AiAvailabilityRow key={resource.id} resource={resource} />)}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => void ai.reload({ refresh: true })} disabled={Boolean(ai.busy)}
                  className={cn("inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-xs font-black text-white/75 disabled:opacity-45")}>
                  {ai.busy?.kind === "context" ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Try reading again
                </button>
              </div>
            </div>
          </AiSectionCard>
        ) : null}
      </div>
    </div>
  );
}
