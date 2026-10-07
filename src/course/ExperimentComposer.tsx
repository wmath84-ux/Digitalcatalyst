// src/course/ExperimentComposer.tsx
//
// The Course Player's “create your own 2D experiment” sheet — what the
// Experiment page's “+” opens (behind its dropdown), in the same clean sheet
// language as the Read page's compose overlay and the Brain page's “+”.
//
// It is deliberately NOT a second builder: the body is the VERY SAME editor My
// Study Library uses (src/personal-library/MyCourseExperimentEditor.tsx), so
// the player and the library can never drift apart. That gives the learner,
// unchanged:
//
//   1. Step 1 — the AI prompt, written for them (topic, level, labels
//      language, extra wishes, the rule pills) with Copy CMD;
//   2. Step 2 — paste the HTML the AI replied with, upload the .html file, or
//      start from a working template;
//   3. Step 3 — the SAME sandboxed stage the lesson plays in, as a live
//      preview, plus the honest checks (external script, storage, alert,
//      over-size …) the learner can hand straight back to the AI.
//
// What this file adds is only what the player surface needs: an experiment
// NAME, the optional hosted link, a Create button that is refused until the
// draft is runnable (`selfExperimentIssues`), and the promise that a created
// experiment is already saved when the sheet closes.

import { useEffect, useMemo, useState } from "react";
import { FlaskConical, LoaderCircle, Sparkles, X } from "lucide-react";
import MyCourseExperimentEditor from "../personal-library/MyCourseExperimentEditor";
import { createMyResource } from "../lib/myCourseClient";
import { selfExperimentIssues } from "../utils/selfExperiments";
import type { MyCourseResource } from "../types/myCourse";

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-[13px] font-semibold text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/70";

export interface ExperimentComposerProps {
  /** The name the sheet starts with — the module being watched, else the course. */
  defaultName: string;
  /** A template's HTML when the learner picked one in the “+” menu. */
  initialHtml?: string;
  onClose: () => void;
  /** Resolves once the library write finished; `{ ok: false }` keeps the sheet open. */
  onCreate: (input: { name: string; html: string; url?: string }) => Promise<{ ok: boolean; message?: string }>;
}

export default function ExperimentComposer({
  defaultName,
  initialHtml = "",
  onClose,
  onCreate,
}: ExperimentComposerProps) {
  const [draft, setDraft] = useState<MyCourseResource>(() => ({
    ...createMyResource("interactive"),
    name: defaultName,
    interactiveHtml: initialHtml,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const html = draft.interactiveHtml || "";
  const url = draft.url || "";
  const issues = useMemo(() => selfExperimentIssues(html, url), [html, url]);
  const canCreate = Boolean(draft.name.trim()) && issues.length === 0 && !busy;

  // A sheet is dismissed with Escape, exactly like the Read compose overlay.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const status = !html.trim() && !url.trim()
    ? "No experiment yet — copy the CMD above, or start from a template."
    : issues.length
      ? `${issues.length} problem${issues.length === 1 ? "" : "s"} must be fixed before Create.`
      : "Runnable — Create saves it to My Study Library and plays it right here.";

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onCreate({ name: draft.name.trim(), html, url });
      if (!result?.ok) {
        setError(result?.message || "Could not save the experiment. Please try again.");
        return;
      }
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the experiment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      data-experiment-self-composer=""
      role="dialog"
      aria-modal="true"
      aria-label="Create your own experiment"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            <FlaskConical size={15} className="text-[#FF6BF5]" aria-hidden="true" /> Create your own experiment
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            data-experiment-self-composer-close
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Experiment name
            </span>
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))}
              placeholder="e.g. Projectile motion"
              className={`${fieldClass} h-10`}
              data-experiment-self-name
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Or a hosted link (only for a file too big to store)
            </span>
            <input
              value={url}
              onChange={(event) => setDraft((current) => ({ ...current, url: event.currentTarget.value }))}
              placeholder="https://… — used only when the code box below is empty"
              className={`${fieldClass} h-10`}
              data-experiment-self-url
            />
          </label>

          {/* The Study Library's own builder — the prompt, the paste/upload/
              template row, the live preview and the checks. One editor. */}
          <MyCourseExperimentEditor
            resource={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          />

          {error ? (
            <p
              className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-2 py-1.5 text-[11px] font-semibold text-rose-100"
              data-experiment-self-error
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold text-slate-400" data-experiment-self-status>
            {status}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canCreate}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-black text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            data-experiment-self-create
          >
            {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy ? "Creating…" : "Create experiment"}
          </button>
        </div>
      </div>
    </div>
  );
}
