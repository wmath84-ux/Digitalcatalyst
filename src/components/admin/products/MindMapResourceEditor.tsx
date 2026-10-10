"use client";

// Admin · Product editor — Mind Map resource editor.
//
// Two ways to create the map, both producing the same canonical MindMap that
// the Course Player renders:
//   1. Paste JSON (AI-generated or hand-written). Validation uses the shared
//      validator in utils/mindMapImport.js — the same one the Course Player's
//      AI / JSON import uses — so both editors accept exactly the same input.
//   2. Build From Scratch — the same MindMapPanel the Course Player uses.

import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
import { Check, Copy, AlertCircle, Brain, Code2, Plus } from "lucide-react";
import { Field, SecondaryButton } from "@/components/admin/ui";
import {
  createMindMap,
  parseMindMap,
  isMindMap,
  type MindMap,
  MIND_MAP_VERSION,
  rootId,
} from "../../../../utils/mindMapTree";
import {
  MIND_MAP_AI_PROMPT,
  describeMindMapStats,
  formatMindMapIssue,
  validateMindMapJson,
  validateMindMapObject,
  type MindMapValidation,
} from "../../../../utils/mindMapImport.js";
import type { ProductResource } from "@/lib/admin/types";

// Lazy: the React Flow canvas is only bundled when the scratch builder opens.
const MindMapPanel = lazy(() => import("../../../course/MindMapPanel"));

const EMPTY_VALIDATION: MindMapValidation = { valid: false, errors: [], warnings: [], mindMap: null, stats: null };

interface MindMapResourceEditorProps {
  resource: ProductResource;
  onChange: (patch: Partial<ProductResource>) => void;
}

export default function MindMapResourceEditor({ resource, onChange }: MindMapResourceEditorProps) {
  const [mode, setMode] = useState<"code" | "scratch">("code");
  const [jsonText, setJsonText] = useState<string>("");
  // Validation is stored together with the text it was run against, so the
  // Save action can never use a result for text that has since changed.
  const [checked, setChecked] = useState<{ text: string; result: MindMapValidation } | null>(null);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [scratchMap, setScratchMap] = useState<MindMap | null>(null);

  // Load the saved map into the JSON box once (or when a different map is saved).
  useEffect(() => {
    if (resource.mindMapData) {
      const text = JSON.stringify(resource.mindMapData, null, 2);
      setJsonText(text);
      setChecked({ text, result: validateMindMapJson(text) });
    } else {
      setJsonText("");
      setChecked(null);
    }
  }, [resource.mindMapData]);

  // Scratch builder state: start from the saved map, or a fresh map titled after the resource.
  useEffect(() => {
    if (mode !== "scratch") return;
    if (resource.mindMapData) {
      try {
        setScratchMap(parseMindMap(resource.mindMapData));
        return;
      } catch {
        // fall through to a fresh map
      }
    }
    setScratchMap(createMindMap(resource.name || "Central Idea", resource.name || "Untitled Mind Map"));
  }, [mode, resource.mindMapData, resource.mindMapRootTopic, resource.name]);

  const current: MindMapValidation = useMemo(() => {
    if (!checked) return EMPTY_VALIDATION;
    return checked.text === jsonText ? checked.result : EMPTY_VALIDATION;
  }, [checked, jsonText]);

  const runValidation = useCallback((text: string) => {
    const result = validateMindMapJson(text);
    setChecked({ text, result });
    return result;
  }, []);

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text);
    setChecked(null);
  }, []);

  const handleStartEmpty = useCallback(() => {
    const text = JSON.stringify({ version: MIND_MAP_VERSION, title: "", rootTopic: "Central Idea", nodes: [] }, null, 2);
    setJsonText(text);
    setChecked({ text, result: validateMindMapJson(text) });
  }, []);

  const handleSaveFromJson = useCallback(() => {
    const result = runValidation(jsonText);
    if (!result.valid || !result.mindMap) return;
    onChange({
      mindMapData: result.mindMap as unknown as Record<string, unknown>,
      mindMapSourceMode: "code_import",
      mindMapRootTopic: result.mindMap.rootTopic,
      url: "",
      provider: "Mind Map",
    });
  }, [jsonText, onChange, runValidation]);

  const handleScratchChange = useCallback((updater: MindMap | ((current: MindMap) => MindMap)) => {
    setScratchMap((prev) => (typeof updater === "function" ? updater(prev || createMindMap()) : updater));
  }, []);

  const handleSaveFromScratch = useCallback(() => {
    if (!scratchMap || !scratchMap.rootTopic) return;
    // Same validator as the JSON path: the saved map must pass the shared schema.
    const check = validateMindMapObject(scratchMap);
    if (!check.valid || !check.mindMap) return;
    onChange({
      mindMapData: check.mindMap as unknown as Record<string, unknown>,
      mindMapSourceMode: "scratch_builder",
      mindMapRootTopic: check.mindMap.rootTopic,
      url: "",
      provider: "Mind Map",
    });
  }, [scratchMap, onChange]);

  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard?.writeText(MIND_MAP_AI_PROMPT).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
      () => undefined,
    );
  }, []);

  const jsonReady = mode === "code" && current.valid && Boolean(current.mindMap);
  const scratchReady = mode === "scratch" && Boolean(scratchMap && scratchMap.rootTopic);
  const savedReady = Boolean(resource.mindMapData) && validateMindMapObject(resource.mindMapData).valid;
  const isReady = mode === "code" ? jsonReady : scratchReady || savedReady;

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
      active ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-4" data-admin-mindmap-editor>
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3" data-admin-mindmap-mode-selector>
        <p className="mb-3 text-sm font-semibold text-indigo-950">Create Mind Map</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("code")} className={tabClass(mode === "code")} data-admin-mindmap-mode="code">
            <Code2 size={16} />
            Copy / Paste JSON
          </button>
          <button type="button" onClick={() => setMode("scratch")} className={tabClass(mode === "scratch")} data-admin-mindmap-mode="scratch">
            <Brain size={16} />
            Build From Scratch
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {mode === "code"
            ? "Paste AI-generated or hand-written mind map JSON below, then Validate. Save unlocks only when the JSON is valid."
            : "Use the same visual Mind Map editor the learners use. Save stores the map on this resource."}
        </p>
      </div>

      {mode === "code" && (
        <div className="space-y-3" data-admin-mindmap-code-mode>
          <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-violet-900">AI prompt</p>
              <SecondaryButton className="h-8 px-3 text-xs" onClick={() => setShowPrompt((v) => !v)}>
                {showPrompt ? "Hide prompt" : "Show AI prompt"}
              </SecondaryButton>
            </div>
            {showPrompt && (
              <div className="relative">
                <p className="mb-2 text-xs text-slate-600">Give this prompt to an AI assistant, then paste its JSON answer below.</p>
                <textarea
                  readOnly
                  rows={8}
                  value={MIND_MAP_AI_PROMPT}
                  className="w-full resize-y rounded-lg border border-violet-200 bg-white p-3 font-mono text-xs leading-5 text-slate-900"
                  style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
                />
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="absolute right-2 top-9 inline-flex h-7 items-center gap-1 rounded-full bg-violet-600 px-2 text-xs font-semibold text-white active:bg-violet-700"
                  title="Copy AI prompt"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <Field
            label="Mind map JSON"
            required
            hint="Paste the JSON here. It is separate from the resource name below."
          >
            <textarea
              value={jsonText}
              onChange={(event) => handleJsonChange(event.target.value)}
              spellCheck={false}
              aria-label="Mind map JSON"
              data-admin-mindmap-json
              placeholder={`{\n  "version": ${MIND_MAP_VERSION},\n  "title": "My Mind Map",\n  "rootTopic": "Central Idea",\n  "nodes": [\n    {"id": "n1", "topic": "Main Topic", "parentId": "${rootId()}"}\n  ]\n}`}
              className={`block w-full min-h-[320px] resize-y whitespace-pre overflow-auto rounded-lg border bg-white p-3 font-mono text-[13px] leading-5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                !jsonText.trim()
                  ? "border-slate-200"
                  : current.valid
                    ? "border-emerald-300 bg-emerald-50/20"
                    : checked && checked.text === jsonText && !checked.result.valid
                      ? "border-red-300 bg-red-50/20"
                      : "border-slate-300"
              }`}
              style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton className="h-9 px-4 text-sm" onClick={handleStartEmpty}>
              <Plus size={16} />
              Start empty
            </SecondaryButton>
            <SecondaryButton className="h-9 px-4 text-sm" disabled={!jsonText.trim()} onClick={() => runValidation(jsonText)}>
              <Check size={16} />
              Validate
            </SecondaryButton>
            <button
              type="button"
              className="h-9 rounded-lg border border-emerald-200 bg-emerald-600 px-4 text-sm font-semibold text-white active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!jsonReady}
              onClick={handleSaveFromJson}
            >
              <Check size={16} className="mr-1 inline" />
              Save mind map
            </button>
          </div>

          {checked && checked.text === jsonText && !current.valid && current.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3" role="alert" data-admin-mindmap-errors>
              <p className="mb-2 flex items-center gap-1 text-sm font-semibold text-red-800">
                <AlertCircle size={16} />
                {current.errors.length} problem{current.errors.length === 1 ? "" : "s"} — fix to continue
              </p>
              <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-red-800">
                {current.errors.map((error, index) => (
                  <li key={index}>{formatMindMapIssue(error)}</li>
                ))}
              </ul>
            </div>
          )}

          {current.valid && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900" data-admin-mindmap-valid>
              <p className="flex items-center gap-1 font-semibold">
                <Check size={16} />
                Valid mind map · {describeMindMapStats(current.stats)}
              </p>
            </div>
          )}

          {current.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900" data-admin-mindmap-warnings>
              <p className="mb-1 font-semibold">Warnings (saved as read)</p>
              <ul className="list-disc space-y-1 pl-5 font-mono">
                {current.warnings.map((warning, index) => (
                  <li key={index}>{formatMindMapIssue(warning)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mode === "scratch" && (
        <div className="space-y-3" data-admin-mindmap-scratch-mode>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <SecondaryButton className="h-8 px-3 text-xs" onClick={() => setMode("code")}>
                <Code2 size={14} />
                Switch to JSON
              </SecondaryButton>
            </div>
            <div className="min-h-[400px] rounded-lg border border-indigo-200 bg-white p-2">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <div>
                      <Brain size={32} className="mx-auto animate-pulse text-indigo-400" />
                      <p className="mt-2 text-sm text-slate-500">Loading Mind Map editor…</p>
                    </div>
                  </div>
                }
              >
                <MindMapPanel
                  mind={scratchMap ?? createMindMap()}
                  onMindChange={handleScratchChange}
                  status="ready"
                  errorMessage={null}
                  onFlush={handleSaveFromScratch}
                  landscape={false}
                  open={true}
                  maps={[]}
                  activeMapKey="main"
                  onSelectMap={() => {}}
                  onCreateMap={() => {}}
                  onRenameMap={() => {}}
                  onDeleteMap={() => {}}
                  mapsLoading={false}
                  atMapLimit={false}
                  courseTitle={resource.name || "Untitled Mind Map"}
                  modules={[]}
                  moduleId="admin-editor"
                  personalModules={[]}
                  onRetryMaps={() => {}}
                />
              </Suspense>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-9 rounded-lg border border-emerald-200 bg-emerald-600 px-4 text-sm font-semibold text-white active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!scratchReady || !isMindMap(scratchMap)}
                onClick={handleSaveFromScratch}
              >
                <Check size={16} className="mr-1 inline" />
                Save mind map
              </button>
            </div>
          </div>
        </div>
      )}

      <Field label="Resource name" required hint="The name that appears in the Course Player library">
        <input
          className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900"
          style={{ color: "#0f172a", backgroundColor: "#ffffff" }}
          value={resource.name || ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., Chapter 1: Algebra fundamentals"
        />
      </Field>

      <div className={`rounded-lg border p-3 text-sm ${isReady ? "border-emerald-200 bg-emerald-50/40 text-emerald-800" : "border-amber-200 bg-amber-50/40 text-amber-800"}`}>
        {isReady ? (
          <p className="flex items-center gap-2"><Check size={16} />Mind map is ready for publishing</p>
        ) : (
          <p className="flex items-center gap-2">
            <AlertCircle size={16} />
            {mode === "code"
              ? current.errors.length > 0
                ? `Fix ${current.errors.length} problem(s) to continue`
                : "Paste the JSON and press Validate"
              : "Create your map, then press Save mind map"}
          </p>
        )}
      </div>
    </div>
  );
}
