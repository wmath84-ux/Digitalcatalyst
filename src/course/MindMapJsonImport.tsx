"use client";

// Course Player · Mind Map editor — "AI / JSON" import dialog.
//
// Same prompt, same validator (utils/mindMapImport.js) and same parser as the
// admin Mind Map resource editor, so both editors accept exactly the same JSON.
// Invalid JSON never touches the open map: the parent only receives a map after
// Validate passed AND the learner confirmed the replacement (when the current
// map already has nodes).

import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Copy, FileJson, X } from "lucide-react";
import type { MindMap } from "../../utils/mindMapTree";
import {
  MIND_MAP_AI_PROMPT,
  describeMindMapStats,
  formatMindMapIssue,
  validateMindMapJson,
  type MindMapValidation,
} from "../../utils/mindMapImport.js";

export interface MindMapJsonImportDialogProps {
  open: boolean;
  /** The map currently on the canvas. A non-empty map asks for confirmation first. */
  currentMind: MindMap;
  onClose: () => void;
  /** Called with the validated, canonical map. The parent takes an undo snapshot. */
  onGenerate: (mind: MindMap) => void;
}

const SHOW_PROMPT_LABEL = "Show AI prompt";

export default function MindMapJsonImportDialog({ open, currentMind, onClose, onGenerate }: MindMapJsonImportDialogProps) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<{ text: string; result: MindMapValidation } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const current = useMemo<MindMapValidation | null>(
    () => (checked && checked.text === text ? checked.result : null),
    [checked, text],
  );

  const hasEditedMap = currentMind.nodes.length > 0;

  const runValidation = useCallback(() => {
    setChecked({ text, result: validateMindMapJson(text) });
    setConfirming(false);
  }, [text]);

  const generate = useCallback(() => {
    if (!current || !current.valid || !current.mindMap) return;
    if (hasEditedMap && !confirming) {
      setConfirming(true);
      return;
    }
    onGenerate(current.mindMap);
    setText("");
    setChecked(null);
    setConfirming(false);
    onClose();
  }, [current, hasEditedMap, confirming, onGenerate, onClose]);

  const copyPrompt = useCallback(() => {
    navigator.clipboard?.writeText(MIND_MAP_AI_PROMPT).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => undefined,
    );
  }, []);

  if (!open || typeof document === "undefined") return null;

  const canGenerate = Boolean(current?.valid && current.mindMap);

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/40 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mm-json-import-title"
      data-mindmap-json-import
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id="mm-json-import-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FileJson size={18} className="text-violet-600" />
            AI / JSON import
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI JSON import"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-violet-900">1. Generate the JSON with AI</p>
              <button
                type="button"
                onClick={() => setShowPrompt((v) => !v)}
                className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50"
              >
                {showPrompt ? "Hide prompt" : SHOW_PROMPT_LABEL}
              </button>
            </div>
            {showPrompt && (
              <div className="relative mt-2">
                <textarea
                  readOnly
                  rows={8}
                  value={MIND_MAP_AI_PROMPT}
                  aria-label="AI generation prompt"
                  className="w-full resize-y rounded-lg border border-violet-200 bg-white p-3 font-mono text-xs leading-5 text-slate-900"
                  style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
                />
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-full bg-violet-600 px-2 text-xs font-semibold text-white"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="mm-json-import-text" className="mb-1 block text-sm font-semibold text-slate-900">
              2. Paste the JSON here
            </label>
            <textarea
              id="mm-json-import-text"
              value={text}
              onChange={(event) => { setText(event.target.value); setChecked(null); setConfirming(false); }}
              spellCheck={false}
              data-mindmap-json-text
              placeholder={'{\n  "rootTopic": "Central idea",\n  "nodes": [\n    {"id": "n1", "topic": "Branch", "parentId": "root"}\n  ]\n}'}
              className={`block w-full min-h-[260px] resize-y whitespace-pre overflow-auto rounded-lg border bg-white p-3 font-mono text-[13px] leading-5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 ${
                current?.valid ? "border-emerald-300" : current && !current.valid ? "border-red-300" : "border-slate-300"
              }`}
              style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
            />
          </div>

          {current && !current.valid && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3" role="alert" data-mindmap-json-errors>
              <p className="mb-1 text-sm font-semibold text-red-800">
                {current.errors.length} problem{current.errors.length === 1 ? "" : "s"} — the current map is unchanged
              </p>
              <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-red-800">
                {current.errors.map((error, index) => (
                  <li key={index}>{formatMindMapIssue(error)}</li>
                ))}
              </ul>
            </div>
          )}

          {current?.valid && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" data-mindmap-json-valid>
              <p className="flex items-center gap-1 font-semibold">
                <Check size={16} />
                Valid · {describeMindMapStats(current.stats)}
              </p>
            </div>
          )}

          {current && current.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="mb-1 font-semibold">Warnings</p>
              <ul className="list-disc space-y-1 pl-5 font-mono">
                {current.warnings.map((warning, index) => (
                  <li key={index}>{formatMindMapIssue(warning)}</li>
                ))}
              </ul>
            </div>
          )}

          {confirming && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alertdialog" data-mindmap-json-confirm>
              <p className="flex items-center gap-1 font-semibold">
                <AlertTriangle size={16} />
                Replace the map on the canvas?
              </p>
              <p className="mt-1 text-xs">
                The current map has {currentMind.nodes.length + 1} nodes. You can undo the replacement right after it is applied.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={runValidation}
            disabled={!text.trim()}
            className="h-9 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Validate
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? "Yes, replace map" : "Generate map"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
