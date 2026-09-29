"use client";

// Admin · Product editor — the builder panel for ONE "interactive 2D experiment"
// resource.
//
// This is the admin twin of the Study Library's `MyCourseExperimentEditor`:
// the SAME design flow (ask the AI → paste/upload/start-from-a-template → live
// preview → honest checks), the SAME prompt, the SAME starter files and the
// SAME sandboxed stage the Course Player runs — only the skin is the admin
// panel's light theme instead of the learner's dark glass. An experiment the
// admin designs here behaves byte-for-byte like one a learner builds in My
// Study Library, because both panels save the same `interactiveHtml` string
// that `src/course/ExperimentStage.tsx` renders.
//
// Nothing here talks to a server: the source travels inside the product
// document (`interactiveHtml`), which is what makes the experiment instant
// and offline-capable in the player.

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { Field, inputClass, selectClass, textareaClass } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import ExperimentStage from "../../../course/ExperimentStage";
import {
  EXPERIMENT_MAX_BYTES,
  EXPERIMENT_PROMPT_RULES,
  buildExperimentAiPrompt,
  experimentByteLength,
  experimentIssues,
} from "../../../utils/experimentSpec";
import { EXPERIMENT_TEMPLATES, templateBytes } from "../../../personal-library/experimentTemplates";
import type { ProductResource } from "@/lib/admin/types";

interface AdminExperimentEditorProps {
  resource: Pick<ProductResource, "name" | "url" | "interactiveHtml">;
  /** Patch the owning resource (the panel never keeps its own copy of the HTML). */
  onChange: (patch: Partial<ProductResource>) => void;
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

export default function AdminExperimentEditor({ resource, onChange }: AdminExperimentEditorProps) {
  const { notify } = useToast();
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
    (next: string, extra: Partial<ProductResource> = {}) => {
      onChange({ interactiveHtml: next, ...extra });
      setPreviewKey((value) => value + 1);
    },
    [onChange],
  );

  const copyPrompt = useCallback(async () => {
    const ok = await copyToClipboard(prompt);
    if (ok) {
      notify("success", "Prompt copied — paste it into ChatGPT / Claude / Gemini, then paste or upload the HTML below.");
    } else {
      notify("error", "Clipboard blocked — select the prompt text in the box and copy it manually.");
      setPromptOpen(true);
    }
  }, [prompt, notify]);

  const copyTemplate = useCallback(
    async (id: string) => {
      const template = EXPERIMENT_TEMPLATES.find((item) => item.id === id);
      if (!template) return;
      const ok = await copyToClipboard(template.html);
      notify(ok ? "success" : "error", ok ? `${template.label} code copied.` : "Could not copy the template code.");
    },
    [notify],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        if (!text.trim()) throw new Error("That file is empty.");
        const name = resource.name.trim() || file.name.replace(/\.[^.]+$/, "");
        applyHtml(text, { name });
        notify("success", `Experiment loaded — ${file.name} · ${kilobytes(experimentByteLength(text))}.`);
      } catch (error) {
        notify("error", error instanceof Error ? `That file could not be read — ${error.message}` : "That file could not be read.");
      }
    },
    [applyHtml, resource.name, notify],
  );

  const useTemplate = useCallback(
    (id: string) => {
      const template = EXPERIMENT_TEMPLATES.find((item) => item.id === id);
      if (!template) return;
      applyHtml(template.html, { name: resource.name.trim() || template.label });
      setShowSource(true);
      notify("success", `${template.label} added — preview it below, then save the product.`);
    },
    [applyHtml, resource.name, notify],
  );

  const ready = errors.length === 0 && (Boolean(html.trim()) || hosted);
  const statusLine = !html.trim() && !hosted
    ? "No experiment yet — copy the prompt, use a template, or upload a .html file."
    : errors.length
      ? `${errors.length} problem${errors.length === 1 ? "" : "s"} must be fixed before publishing.`
      : warnings.length
        ? `Runnable — ${warnings.length} thing${warnings.length === 1 ? "" : "s"} worth fixing.`
        : "Runnable — learners will play exactly this preview.";

  return (
    <div className="space-y-3" data-admin-experiment-editor>
      {/* ── 1. Ask the AI ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3" data-admin-experiment-prompt>
        <button
          type="button"
          onClick={() => setPromptOpen((value) => !value)}
          className="flex w-full items-center gap-2 text-left"
          data-admin-experiment-prompt-toggle
        >
          <span aria-hidden>✨</span>
          <span className="flex-1 text-xs font-bold text-violet-950">Step 1 · Ask the AI for the experiment</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-violet-400">{promptOpen ? "Hide" : "Open"}</span>
        </button>
        {promptOpen ? (
          <div className="mt-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Topic">
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. Projectile motion, Photosynthesis, Sorting"
                  className={inputClass}
                  data-admin-experiment-topic
                />
              </Field>
              <Field label="Level">
                <select value={level} onChange={(event) => setLevel(event.target.value)} className={selectClass} data-admin-experiment-level>
                  {LEVELS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Labels language">
                <select value={language} onChange={(event) => setLanguage(event.target.value)} className={selectClass} data-admin-experiment-language>
                  {LANGUAGES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Extra wishes (optional)">
                <input
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder="e.g. show the formula, add a slow-motion button"
                  className={inputClass}
                  data-admin-experiment-details
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXPERIMENT_PROMPT_RULES.map((rule) => (
                <span key={rule} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{rule}</span>
              ))}
            </div>
            <textarea
              value={prompt}
              readOnly
              rows={5}
              className={`${textareaClass} resize-y font-mono !text-[11px] leading-relaxed`}
              aria-label="Prompt for the AI"
              data-admin-experiment-prompt-text
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-bold text-white active:bg-violet-700"
                data-admin-experiment-copy-prompt
              >
                📋 Copy prompt for AI
              </button>
              <span className="text-[11px] text-slate-500">
                Paste it into ChatGPT / Claude / Gemini, and ask for the single HTML file only.
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 2. Get it in ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-3" data-admin-experiment-source>
        <p className="text-xs font-bold text-slate-900">
          🧪 Step 2 · Paste the HTML, upload it, or start from a template
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {EXPERIMENT_TEMPLATES.map((template) => (
            <span key={template.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => useTemplate(template.id)}
                className="rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700 transition active:bg-slate-200"
                title={template.summary}
                data-admin-experiment-template={template.id}
              >
                {template.label} · {kilobytes(templateBytes(template))}
              </button>
              <button
                type="button"
                onClick={() => void copyTemplate(template.id)}
                className="rounded-full px-1.5 py-1 text-[11px] font-bold text-slate-400 transition hover:text-slate-700"
                title="Copy this template's code (hand it to the AI as an example)"
                data-admin-experiment-template-copy={template.id}
              >
                📋
              </button>
            </span>
          ))}
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-600 transition hover:border-violet-400">
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadFile(file);
              }}
              data-admin-experiment-file
            />
            ⬆ Upload .html from AI
          </label>
          {html ? (
            <>
              <button
                type="button"
                onClick={() => setShowSource((value) => !value)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-900"
                data-admin-experiment-source-toggle
              >
                {showSource ? "Hide code" : "Edit code"}
              </button>
              <button
                type="button"
                onClick={() => applyHtml("")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-red-600 ring-1 ring-red-200 transition active:bg-red-50"
                data-admin-experiment-clear
              >
                Clear
              </button>
            </>
          ) : null}
        </div>

        {showSource || !html ? (
          <Field
            label={`Experiment HTML${html ? ` · ${kilobytes(bytes)} (limit ${kilobytes(EXPERIMENT_MAX_BYTES)})` : ""}`}
          >
            <textarea
              value={html}
              onChange={(event) => applyHtml(event.target.value)}
              rows={8}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="<!doctype html> … paste everything the AI gave you, or upload the .html file"
              className={`${textareaClass} resize-y font-mono !text-[11px] leading-relaxed`}
              aria-label="Experiment HTML"
              data-admin-experiment-html
            />
          </Field>
        ) : null}

        {/* ── 3. See it: the SAME sandboxed stage the Course Player runs ── */}
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white" data-admin-experiment-preview>
          <div className="flex items-center gap-2 border-b border-slate-100 px-2 py-1.5">
            <span className="flex-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Step 3 · Live preview (exactly as the player runs it)
            </span>
            <button
              type="button"
              onClick={() => setPreviewKey((value) => value + 1)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:text-slate-900"
              data-admin-experiment-preview-restart
            >
              ⟳ Restart
            </button>
          </div>
          {/* The stage reads the player's dark palette off CSS variables, so the
              preview box sets them explicitly — the admin page itself is light. */}
          <div
            className="h-[260px] w-full bg-slate-950"
            style={
              {
                "--course-text": "#ffffff",
                "--course-muted": "rgba(255,255,255,0.6)",
                "--course-bg": "#0b1020",
                "--course-loading": "#0b1020",
              } as CSSProperties
            }
            key={previewKey}
          >
            <ExperimentStage html={html} url={resource.url || ""} title={resource.name || "Experiment"} compact />
          </div>
        </div>

        {/* Hosted fallback, for files too big to store in the document. */}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          Too big? Host the .html file (Drive / GitHub Pages / your site), paste the https link in the
          <span className="font-semibold text-slate-700"> Hosted experiment link </span>
          field above, and leave this box empty — the player frames the hosted page instead.
          {hosted ? <span className="font-semibold text-indigo-600"> (A hosted link is set; it is used only when the box above is empty.)</span> : null}
        </p>
      </div>

      {/* ── Checks — the honest answer about whether it will run ──────── */}
      <div
        className={`rounded-xl border p-3 text-xs font-medium ${
          errors.length
            ? "border-red-300 bg-red-50 text-red-800"
            : warnings.length
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
        }`}
        data-admin-experiment-status={ready ? "ready" : "blocked"}
      >
        <p className="font-bold">{statusLine}</p>
        {issues.length ? (
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            {issues.map((issue, index) => (
              <li key={`${issue.level}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        ) : null}
        {warnings.length ? (
          <p className="mt-1.5 text-[11px] font-semibold">
            Tip: copy a line above and send it back to the AI — “fix this in the same single HTML file”.
          </p>
        ) : null}
      </div>
    </div>
  );
}
