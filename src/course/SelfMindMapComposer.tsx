// src/course/SelfMindMapComposer.tsx
//
// The learner's own mind map, made from the Experiment page's “+” (SELF filter).
// The learner pastes the JSON an AI wrote from the copied prompt (the SAME prompt
// and validator the admin's Mind Map import uses, utils/mindMapImport.js), sees
// every problem by path before saving, and only then can Create be tapped.
//
// Saving is owned by the parent: `onCreate` resolves `{ ok: true }` only after the
// library write has committed, so this sheet never claims a map is saved before
// it is. A refusal keeps the sheet open with the reason shown.

import { useState } from "react";
import { Network, X } from "lucide-react";
import { MIND_MAP_AI_PROMPT, describeMindMapStats, formatMindMapIssue, validateMindMapJson } from "../../utils/mindMapImport.js";

export interface SelfMindMapComposerProps {
  defaultName: string;
  onClose: () => void;
  onCreate: (input: { name: string; mindMapData: Record<string, unknown> }) => Promise<{ ok: boolean; message?: string }>;
}

/** The JSON box's text as a plain object — the same fence cleanup the validator does. */
export const parseSelfMindMapText = (text: string): Record<string, unknown> | null => {
  let body = String(text || "").trim();
  if (body.startsWith("```")) body = body.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export default function SelfMindMapComposer({ defaultName, onClose, onCreate }: SelfMindMapComposerProps) {
  const [name, setName] = useState(defaultName);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState("");
  const [copyNote, setCopyNote] = useState("");

  const result = text.trim() ? validateMindMapJson(text) : null;
  const ready = Boolean(result?.valid) && Boolean(name.trim()) && !saving;

  const copyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(MIND_MAP_AI_PROMPT);
        setCopyNote("Copied. Paste it into your AI, then paste its JSON reply here.");
        return;
      }
    } catch {
      /* fall through */
    }
    setCopyNote("Clipboard is blocked here. Select the prompt in the box below and copy it by hand.");
  };

  const save = async () => {
    const mindMapData = parseSelfMindMapText(text);
    if (!ready || !mindMapData) return;
    setSaving(true);
    setRefusal("");
    try {
      const outcome = await onCreate({ name: name.trim(), mindMapData });
      if (outcome.ok) {
        onClose();
      } else {
        setRefusal(outcome.message || "The mind map could not be saved. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-black/60 sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Create your own mind map"
      data-self-mindmap-composer=""
    >
      <div className="flex max-h-[92dvh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-4 text-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(34,211,238,0.16)", color: "#67E8F9" }}>
            <Network size={18} />
          </span>
          <h2 className="min-w-0 flex-1 text-sm font-black">Create your own mind map</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="h-10 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            placeholder="e.g. Chapter 3 — Cell division"
            aria-label="Mind map name"
          />
        </label>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">1. Get the JSON from your AI</span>
            <button type="button" onClick={() => void copyPrompt()} className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-black hover:bg-white/15">
              Copy AI prompt
            </button>
          </div>
          {copyNote ? <p role="status" className="text-[11px] font-semibold text-slate-300">{copyNote}</p> : null}
          <details className="text-[11px] text-slate-400">
            <summary className="cursor-pointer font-semibold">Show the prompt</summary>
            <textarea
              readOnly
              rows={6}
              value={MIND_MAP_AI_PROMPT}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="AI prompt for a mind map"
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-slate-950 p-2 font-mono text-[10px] text-slate-200"
            />
          </details>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">2. Paste the JSON reply</span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setRefusal("");
            }}
            rows={8}
            spellCheck={false}
            aria-label="Mind map JSON"
            className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 p-2 font-mono text-[11px] text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            placeholder='{"rootTopic": "…", "nodes": [...]}'
          />
        </label>

        {result ? (
          result.valid ? (
            <p role="status" className="rounded-xl bg-emerald-500/15 px-3 py-2 text-[12px] font-semibold text-emerald-200">
              Valid · {describeMindMapStats(result.stats)}
            </p>
          ) : (
            <div role="alert" className="rounded-xl bg-rose-500/15 px-3 py-2 text-[12px] text-rose-100">
              <p className="font-semibold">Fix these before saving:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px]">
                {result.errors.slice(0, 8).map((error, index) => (
                  <li key={index}>{formatMindMapIssue(error)}</li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {refusal ? (
          <p role="alert" className="rounded-xl bg-rose-500/15 px-3 py-2 text-[12px] font-semibold text-rose-100">
            {refusal}
          </p>
        ) : null}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-10 flex-1 rounded-xl border border-white/10 text-sm font-black hover:bg-white/5">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!ready}
            data-self-mindmap-create=""
            className="h-10 flex-1 rounded-xl bg-cyan-400 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : "Create mind map"}
          </button>
        </div>
      </div>
    </div>
  );
}
