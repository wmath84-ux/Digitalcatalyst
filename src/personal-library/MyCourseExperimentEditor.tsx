// src/personal-library/MyCourseExperimentEditor.tsx
//
// The builder panel for ONE "interactive 2D experiment" resource.
//
// This is where the whole method lives, in the order a learner actually works:
//
//   1. ASK THE AI — the panel writes the prompt for them (topic, level,
//      language, extra wishes) with every constraint already baked in: one
//      self-contained HTML file, canvas 2D, no CDN, no fetch, no
//      localStorage, phone-friendly, not over the size cap. Copy → paste into
//      ChatGPT / Claude / Gemini → the AI returns a single .html file.
//   2. GET IT IN — paste the code, or upload the .html file the AI produced
//      (read as TEXT, so no hosting, no CORS, no storage bill) or start from a
//      working template in one tap.
//   3. SEE IT — the panel previews the experiment in the SAME sandboxed stage
//      the Course Player uses, and lists anything that would break it
//      (external script, browser storage, alert(), over-size …) so the learner
//      can hand that line straight back to the AI.
//
// Nothing here talks to a server: the source travels inside the course
// document, which is what makes the experiment work offline in the APK.

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Code2, FlaskConical, Hammer, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "../components/ui/glass-toast";
import ExperimentStage from "../course/ExperimentStage";
import {
  EXPERIMENT_MAX_BYTES,
  EXPERIMENT_PROMPT_RULES,
  buildExperimentAiPrompt,
  experimentByteLength,
  experimentIssues,
} from "../utils/experimentSpec";
import { EXPERIMENT_TEMPLATES, templateBytes } from "./experimentTemplates";
import { inputClass, labelClass } from "./MyCourseBrainEditor";
import type { MyCourseResource } from "../types/myCourse";

interface ExperimentEditorProps {
  resource: MyCourseResource;
  /** Patch the owning resource (the panel never keeps its own copy of the HTML). */
  onChange: (patch: Partial<MyCourseResource>) => void;
}

const LEVELS = ["Class 6–8", "Class 9–10", "Class 11–12", "JEE / NEET", "College / first year", "General"];
const LANGUAGES = ["English", "Hinglish", "Hindi"];

const kilobytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

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

export default function MyCourseExperimentEditor({ resource, onChange }: ExperimentEditorProps) {
  const html = resource.interactiveHtml || "";
  const hosted = /^https:\/\//i.test(String(resource.url || "").trim());
  const bytes = experimentByteLength(html);
  const issues = useMemo(() => experimentIssues(html), [html]);
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warn");

  const [topic, setTopic] = useState(resource.name || "");
  const [details, setDetails] = useState("");
  const [level, setLevel] = useState(LEVELS[2]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [showSource, setShowSource] = useState(Boolean(html));
  const [promptOpen, setPromptOpen] = useState(!html);
  const [previewKey, setPreviewKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const prompt = useMemo(
    () => buildExperimentAiPrompt({ topic: topic || resource.name || "the topic", details, level, language }),
    [topic, resource.name, details, level, language],
  );

  const applyHtml = useCallback(
    (next: string, extra: Partial<MyCourseResource> = {}) => {
      onChange({ interactiveHtml: next, size: experimentByteLength(next), ...extra });
      setPreviewKey((value) => value + 1);
    },
    [onChange],
  );

  const copyPrompt = useCallback(async () => {
    const ok = await copyToClipboard(prompt);
    toast({
      title: ok ? "Prompt copied — paste it into your AI" : "Select the prompt text and copy it",
      description: ok ? "Ask for the single HTML file, then paste or upload it below." : "Your browser blocked the clipboard; the prompt is in the box below.",
      variant: ok ? "success" : "error",
    });
    if (!ok) setPromptOpen(true);
  }, [prompt]);

  const copyTemplate = useCallback(async (id: string) => {
    const template = EXPERIMENT_TEMPLATES.find((item) => item.id === id);
    if (!template) return;
    const ok = await copyToClipboard(template.html);
    toast({ title: ok ? `${template.label} copied` : "Could not copy", variant: ok ? "success" : "error" });
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        if (!text.trim()) throw new Error("That file is empty.");
        const name = resource.name.trim() || file.name.replace(/\.[^.]+$/, "");
        applyHtml(text, { fileName: file.name, source: "upload", name });
        toast({ title: "Experiment loaded", description: `${file.name} · ${kilobytes(experimentByteLength(text))}`, variant: "success" });
      } catch (error) {
        toast({
          title: "That file could not be read",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
        });
      }
    },
    [applyHtml, resource.name],
  );

  const useTemplate = useCallback(
    (id: string) => {
      const template = EXPERIMENT_TEMPLATES.find((item) => item.id === id);
      if (!template) return;
      applyHtml(template.html, {
        name: resource.name.trim() || template.label,
        description: resource.description?.trim() || template.summary,
      });
      setShowSource(true);
      toast({ title: `${template.label} added`, description: "Preview it below, then save the course.", variant: "success" });
    },
    [applyHtml, resource.description, resource.name],
  );

  const ready = errors.length === 0 && (Boolean(html.trim()) || hosted);
  const statusLine = !html.trim() && !hosted
    ? "No experiment yet — copy the prompt, use a template, or upload a .html file."
    : errors.length
      ? `${errors.length} problem${errors.length === 1 ? "" : "s"} must be fixed before saving.`
      : warnings.length
        ? `Runnable — ${warnings.length} thing${warnings.length === 1 ? "" : "s"} worth fixing.`
        : "Runnable — this will play exactly like the preview.";

  return (
    <div className="space-y-3" data-my-experiment-editor>
      {/* ── 1. Ask the AI ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-3" data-my-experiment-prompt>
        <button
          type="button"
          onClick={() => setPromptOpen((value) => !value)}
          className="flex w-full items-center gap-2 text-left"
          data-my-experiment-prompt-toggle
        >
          <Sparkles size={14} className="shrink-0 text-violet-300" />
          <span className="flex-1 text-[12px] font-black text-white">Step 1 · Ask your AI for the experiment</span>
          <span className="text-[10px] font-black uppercase tracking-wide text-white/45">{promptOpen ? "Hide" : "Open"}</span>
        </button>
        {promptOpen ? (
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Topic</span>
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. Projectile motion, Photosynthesis, Sorting"
                  className={inputClass}
                  data-my-experiment-topic
                />
              </label>
              <label className="block">
                <span className={labelClass}>Level</span>
                <select value={level} onChange={(event) => setLevel(event.target.value)} className={`${inputClass} appearance-none`} data-my-experiment-level>
                  {LEVELS.map((item) => (
                    <option key={item} value={item} className="bg-slate-900">{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Labels language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)} className={`${inputClass} appearance-none`} data-my-experiment-language>
                  {LANGUAGES.map((item) => (
                    <option key={item} value={item} className="bg-slate-900">{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Extra wishes (optional)</span>
                <input
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="e.g. show the formula, add a slow-motion button"
                  className={inputClass}
                  data-my-experiment-details
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXPERIMENT_PROMPT_RULES.map((rule) => (
                <span key={rule} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/60">{rule}</span>
              ))}
            </div>
            <textarea
              value={prompt}
              readOnly
              rows={5}
              className={`${inputClass} resize-y py-2 font-mono text-[10px] leading-relaxed`}
              aria-label="Prompt for your AI"
              data-my-experiment-prompt-text
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-violet-500 px-3 text-[11px] font-black text-white transition hover:bg-violet-400"
                data-my-experiment-copy-prompt
              >
                <ClipboardCopy size={12} /> Copy prompt for AI
              </button>
              <span className="text-[10px] font-semibold text-white/45">
                Paste it into ChatGPT / Claude / Gemini, and ask for the single HTML file only.
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 2. Get it in ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-black/25 p-3" data-my-experiment-source>
        <p className="flex items-center gap-2 text-[12px] font-black text-white">
          <FlaskConical size={14} className="text-cyan-300" /> Step 2 · Paste the HTML, upload it, or start from a template
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {EXPERIMENT_TEMPLATES.map((template) => (
            <span key={template.id} className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] p-0.5 ring-1 ring-white/10">
              <button
                type="button"
                onClick={() => useTemplate(template.id)}
                className="rounded-full px-2.5 py-1 text-[10px] font-black text-cyan-100 transition hover:bg-cyan-500/15"
                title={template.summary}
                data-my-experiment-template={template.id}
              >
                <Hammer size={11} className="mr-1 inline" /> {template.label} · {kilobytes(templateBytes(template))}
              </button>
              <button
                type="button"
                onClick={() => void copyTemplate(template.id)}
                className="rounded-full px-1.5 py-1 text-[10px] font-black text-white/45 transition hover:text-white"
                title="Copy this template's code (hand it to your AI as an example)"
                data-my-experiment-template-copy={template.id}
              >
                <ClipboardCopy size={11} />
              </button>
            </span>
          ))}
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-white/20 bg-white/[0.03] px-3 text-[11px] font-black text-white/70 transition hover:border-violet-400/50">
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadFile(file);
              }}
              data-my-experiment-file
            />
            <Upload size={12} /> Upload .html from AI
          </label>
          {html ? (
            <>
              <button
                type="button"
                onClick={() => setShowSource((value) => !value)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-white/60 ring-1 ring-white/10 transition hover:text-white"
                data-my-experiment-source-toggle
              >
                <Code2 size={12} /> {showSource ? "Hide code" : "Edit code"}
              </button>
              <button
                type="button"
                onClick={() => applyHtml("")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-black text-rose-200 ring-1 ring-rose-400/25 transition hover:bg-rose-500/10"
                data-my-experiment-clear
              >
                <Trash2 size={12} /> Clear
              </button>
            </>
          ) : null}
        </div>

        {showSource || !html ? (
          <label className="mt-3 block">
            <span className={labelClass}>
              Experiment HTML {html ? `· ${kilobytes(bytes)} (limit ${kilobytes(EXPERIMENT_MAX_BYTES)})` : ""}
            </span>
            <textarea
              value={html}
              onChange={(event) => applyHtml(event.target.value)}
              rows={8}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="<!doctype html> … paste everything your AI gave you, or upload the .html file"
              className={`${inputClass} resize-y py-2 font-mono text-[10px] leading-relaxed`}
              aria-label="Experiment HTML"
              data-my-experiment-html
            />
          </label>
        ) : null}

        {/* ── 3. See it: the SAME sandboxed stage the Course Player runs ── */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/40" data-my-experiment-preview>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="flex-1 text-[10px] font-black uppercase tracking-wide text-white/45">
              Step 3 · Live preview (exactly as the player runs it)
            </span>
            <button
              type="button"
              onClick={() => setPreviewKey((value) => value + 1)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black text-white/60 transition hover:text-white"
              data-my-experiment-preview-restart
            >
              <RefreshCw size={11} /> Restart
            </button>
          </div>
          <div className="h-[260px] w-full" key={previewKey}>
            <ExperimentStage html={html} url={resource.url || ""} title={resource.name || "Experiment"} compact />
          </div>
        </div>

        {/* Hosted fallback, for files too big to store in the document. */}
        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-white/45">
          Too big? Host the .html file (Drive / GitHub Pages / your site), paste the https link in the
          <span className="text-white/70"> Link </span>
          field above, and leave this box empty — the player frames the hosted page instead.
          {hosted ? <span className="text-cyan-200"> (A hosted link is set; it is used only when the box above is empty.)</span> : null}
        </p>
      </div>

      {/* ── Checks — the honest answer about whether it will run ──────── */}
      <div
        className={`rounded-2xl border p-3 text-[11px] font-semibold ${
          errors.length
            ? "border-rose-400/30 bg-rose-500/[0.08] text-rose-100"
            : warnings.length
              ? "border-amber-400/25 bg-amber-500/[0.07] text-amber-100"
              : "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100"
        }`}
        data-my-experiment-status={ready ? "ready" : "blocked"}
      >
        <p className="flex items-center gap-1.5 font-black">
          {errors.length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />} {statusLine}
        </p>
        {issues.length ? (
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            {issues.map((issue, index) => (
              <li key={`${issue.level}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
        {warnings.length ? (
          <p className="mt-1.5 text-[10px] font-bold text-white/55">
            Tip: copy a line above and send it back to your AI — “fix this in the same single HTML file”.
          </p>
        ) : null}
      </div>
    </div>
  );
}
