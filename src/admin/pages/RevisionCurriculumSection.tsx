"use client";

import { useMemo, useState } from "react";
import { Field, PrimaryButton, SecondaryButton, SectionCard, inputClass, textareaClass } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import type { RevisionCatalog } from "@/revision/engine/catalogService";
import type { AiConfig } from "@/revision/engine/aiConfig";
import { generatePlanningCurriculumClass } from "@/revision/engine/aiConfig";
import type { CurriculumClass } from "@/revision/data/curriculum";
import {
  PLANNING_CLASSES,
  curriculumStats,
  currentAcademicYear,
  defaultCurriculumPrompt,
  fillCurriculumPrompt,
  type PlanningCurriculum,
} from "@/revision/engine/curriculumCatalog";

type Props = {
  catalog: RevisionCatalog;
  adminConfig: AiConfig;
  onCatalog: (catalog: RevisionCatalog) => void;
};

export default function RevisionCurriculumSection({ catalog, adminConfig, onCatalog }: Props) {
  const { notify } = useToast();
  const published = catalog.planningCurriculum;
  const [board, setBoard] = useState(published?.board || "CBSE");
  const [yearLabel, setYearLabel] = useState(published?.yearLabel || currentAcademicYear());
  const [prompt, setPrompt] = useState(published?.prompt || defaultCurriculumPrompt());
  const [draft, setDraft] = useState<CurriculumClass[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const liveStats = useMemo(() => (published?.classes ? curriculumStats(published.classes) : null), [published]);
  const draftStats = useMemo(() => (draft ? curriculumStats(draft) : null), [draft]);

  const connected = Boolean(adminConfig.apiKey.trim() && adminConfig.model.trim());

  const generateAll = async () => {
    if (!connected) {
      notify("error", "Connect an AI provider and pick a model above first.");
      return;
    }
    setGenerating(true);
    setError(null);
    setDraft(null);
    const next: CurriculumClass[] = [];
    try {
      for (let i = 0; i < PLANNING_CLASSES.length; i++) {
        const cls = PLANNING_CLASSES[i];
        setProgress(`Generating ${cls.name} (${i + 1}/${PLANNING_CLASSES.length})…`);
        const filled = fillCurriculumPrompt(prompt, { board: board.trim() || "CBSE", year: yearLabel.trim() || currentAcademicYear(), className: cls.name });
        const generated = await generatePlanningCurriculumClass({
          config: adminConfig,
          prompt: filled,
          className: cls.name,
        });
        next.push({ ...generated, name: cls.name, icon: generated.icon || cls.icon, key: cls.key });
        setDraft([...next]);
      }
      setProgress("");
      notify("success", "Latest-year syllabus generated. Review the tree, then replace the live lists.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Curriculum generation failed.");
      notify("error", err instanceof Error ? err.message : "Curriculum generation failed.");
    } finally {
      setGenerating(false);
      setProgress("");
    }
  };

  const replaceLive = async () => {
    if (!draft?.length) {
      notify("error", "Generate a syllabus first.");
      return;
    }
    const ok = window.confirm(
      "Replace the Class → Subject → Chapter → Concept lists students see on the revision planning page? Existing student tests are not deleted.",
    );
    if (!ok) return;
    const payload: PlanningCurriculum = {
      yearLabel: yearLabel.trim() || currentAcademicYear(),
      board: board.trim() || "CBSE",
      prompt,
      updatedAt: new Date().toISOString(),
      classes: draft,
    };
    setReplacing(true);
    try {
      const next = { ...catalog, planningCurriculum: payload };
      const res = await adminFetch<{ catalog: RevisionCatalog }>("/api/admin/revision", {
        method: "POST",
        body: JSON.stringify(next),
      });
      onCatalog(res.catalog);
      setDraft(null);
      notify("success", "Live planning lists replaced. Students now see this latest-year syllabus.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to replace curriculum.");
    } finally {
      setReplacing(false);
    }
  };

  return (
    <SectionCard
      title="Latest-year curriculum"
      description="Generate the current academic year's included subjects, chapters and concepts with AI, then one-click replace what students pick on the planning page."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Board" hint="Used in the prompt as {{board}}.">
          <input className={inputClass} value={board} onChange={(e) => setBoard(e.target.value)} placeholder="CBSE" />
        </Field>
        <Field label="Academic year" hint="Used in the prompt as {{year}}.">
          <input className={inputClass} value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} placeholder={currentAcademicYear()} />
        </Field>
      </div>

      <div className="mt-3">
        <Field
          label="AI prompt (editable)"
          hint="Placeholders: {{board}}, {{year}}, {{className}}. One click generates Class 6–12 using this prompt."
        >
          <textarea
            className={`${textareaClass} min-h-[180px] font-mono text-xs leading-relaxed`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="mt-1 text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
          onClick={() => setPrompt(defaultCurriculumPrompt())}
        >
          Reset prompt to default
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton loading={generating} disabled={!connected || replacing} onClick={() => void generateAll()}>
          ✨ Generate latest-year syllabus
        </PrimaryButton>
        <SecondaryButton disabled={!draft?.length || generating || replacing} onClick={() => void replaceLive()}>
          {replacing ? "Replacing…" : "Replace live student lists"}
        </SecondaryButton>
      </div>
      {!connected && (
        <p className="mt-2 text-xs text-amber-700">Connect a provider and pick a model in AI Configuration first.</p>
      )}
      {progress && <p className="mt-2 text-xs font-medium text-indigo-600">{progress}</p>}
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Live (students see this)</p>
          {published?.classes?.length ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {published.board} · {published.yearLabel}
              </p>
              <p className="text-xs text-slate-500">
                {liveStats?.classes} classes · {liveStats?.subjects} subjects · {liveStats?.chapters} chapters · {liveStats?.topics} concepts
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Not published yet — students see the built-in fallback syllabus.</p>
          )}
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-400">Generated draft</p>
          {draftStats ? (
            <p className="mt-1 text-xs text-indigo-800">
              {draftStats.classes} classes · {draftStats.subjects} subjects · {draftStats.chapters} chapters · {draftStats.topics} concepts
            </p>
          ) : (
            <p className="mt-1 text-xs text-indigo-700">Generate to preview before replacing.</p>
          )}
        </div>
      </div>

      {draft && draft.length > 0 && (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs">
          {draft.map((cls) => (
            <details key={cls.key} className="mb-2">
              <summary className="cursor-pointer font-semibold text-slate-800">
                {cls.icon} {cls.name} · {cls.subjects.length} subjects
              </summary>
              <ul className="mt-1 space-y-1 pl-4 text-slate-600">
                {cls.subjects.map((s) => (
                  <li key={s.key}>
                    {s.icon} {s.name} — {s.chapters.length} chapters,{" "}
                    {s.chapters.reduce((n, ch) => n + ch.topics.length, 0)} concepts
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
