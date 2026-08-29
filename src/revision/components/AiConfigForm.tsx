// Shared "Connect your AI provider" form.
//
// Used by the student AI Settings page and the admin panel's AI Generate
// tab so both sides get the same polished, provider-branded experience:
// pick a provider card → paste an API key → all available models appear in
// the dropdown → test the connection → save.
//
// The API key never leaves the visitor's browser; it is sent directly to the
// chosen provider (or their own custom endpoint).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AI_PROVIDERS,
  fetchProviderModels,
  mergeModelLists,
  testAiConfig,
  type AiConfig,
  type AIProviderId,
  type ProviderModel,
} from "../engine/aiConfig";
import { Spinner } from "./ui";

export type AiConfigFormProps = {
  value: AiConfig;
  onChange: (cfg: AiConfig) => void;
  /** Renders inside a card shell when true (default). */
  card?: boolean;
  title?: string;
  description?: string;
  /** Called with the freshly fetched model list so parents can reuse it. */
  onModelsChange?: (models: ProviderModel[]) => void;
  /**
   * Student "My own API key" mode: keep the model dropdown empty until the
   * key actually loads live models. No school/admin known-model fallback.
   */
  liveModelsOnly?: boolean;
};

function ProviderTile({
  meta,
  selected,
  onSelect,
}: {
  meta: (typeof AI_PROVIDERS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
        selected
          ? `border-transparent bg-white shadow-md ring-2 ${meta.ring}`
          : "border-slate-300 bg-white hover:border-slate-400 hover:shadow-sm"
      }`}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow">
          ✓
        </span>
      )}
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-black text-white shadow-sm ${meta.gradient}`}
      >
        {meta.mark}
      </span>
      <span className="w-full">
        <span className="block truncate text-[13px] font-bold text-slate-900">{meta.name}</span>
        <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">{meta.tagline}</span>
      </span>
    </button>
  );
}

export default function AiConfigForm({
  value,
  onChange,
  card = true,
  title = "Connect your AI provider",
  description = "Choose a provider, paste your API key and all its available models will appear below. Your key is stored only in this browser and sent directly to the provider.",
  onModelsChange,
  liveModelsOnly = false,
}: AiConfigFormProps) {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [didAutoFetch, setDidAutoFetch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const provider = useMemo(() => AI_PROVIDERS.find((p) => p.id === value.provider) ?? AI_PROVIDERS[0], [value.provider]);
  const hasKey = value.apiKey.trim().length > 0;
  const hasCustomEndpoint = value.provider !== "custom" || value.baseUrl.trim().length > 0;

  /** Admin form keeps known-model fallbacks; own-key stays empty until fetch. */
  const liveOnly = liveModelsOnly || value.provider === "custom";
  const allModels = useMemo(
    () => (liveOnly ? models.filter((m) => m.id) : mergeModelLists(value.provider, models)),
    [liveOnly, models, value.provider],
  );
  const modelKnown = allModels.some((m) => m.id === value.model);

  const refreshModels = async (silent = false) => {
    if (!hasKey) {
      setModels([]);
      setStatus(
        silent
          ? null
          : { tone: "info", text: "Enter an API key first — then all available models will show up here." },
      );
      return;
    }
    const seq = ++requestSeq.current;
    setLoadingModels(true);
    if (!silent) setStatus(null);
    try {
      const list = await fetchProviderModels(value);
      if (requestSeq.current !== seq) return;
      setModels(list);
      onModelsChange?.(list);
      if (liveOnly && list.length > 0 && !value.model.trim()) {
        onChange({ ...value, model: list[0].id });
      }
      setStatus({
        tone: "ok",
        text: `${list.length} model${list.length === 1 ? "" : "s"} found${list.length > 0 ? " — pick one below" : ""}.`,
      });
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setModels([]);
      onModelsChange?.([]);
      setStatus({
        tone: "err",
        text: err instanceof Error ? err.message : "Could not load models. Check the key and try again.",
      });
    } finally {
      if (requestSeq.current === seq) setLoadingModels(false);
    }
  };

  // Auto-load models shortly after the key / endpoint changes — the
  // "connect an API and every available model appears" experience.
  useEffect(() => {
    if (!hasKey || !hasCustomEndpoint) {
      setDidAutoFetch(false);
      setModels([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDidAutoFetch(true);
      void refreshModels(true);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.provider, value.apiKey, value.baseUrl, hasKey, hasCustomEndpoint]);

  const runTest = async () => {
    if (!hasKey) {
      setStatus({ tone: "info", text: "Paste your API key first, then test the connection." });
      return;
    }
    setTesting(true);
    const result = await testAiConfig(value);
    setTesting(false);
    setStatus(result.ok ? { tone: "ok", text: result.message } : { tone: "err", text: result.message });
    if (result.ok && models.length === 0 && result.modelCount > 0) void refreshModels(true);
  };

  return (
    <div className={`space-y-4 ${card ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" : ""}`}>
      {/* Provider picker */}
      <div>
        {title && <p className="text-[13px] font-bold text-slate-900">{title}</p>}
        {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
        <div data-ai-provider-grid className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AI_PROVIDERS.map((p) => (
            <ProviderTile
              key={p.id}
              meta={p}
              selected={value.provider === p.id}
              onSelect={() => {
                if (p.id === value.provider) return;
                if (p.id === "custom") {
                  setModels([]);
                  setStatus(null);
                  setShowAdvanced(true);
                  onModelsChange?.([]);
                  onChange({ provider: "custom", apiKey: "", baseUrl: "", model: "" });
                  return;
                }
                onChange({
                  ...value,
                  provider: p.id as AIProviderId,
                  model: liveModelsOnly ? "" : (mergeModelLists(p.id as AIProviderId, [])[0]?.id ?? ""),
                  ...(value.provider === "custom" ? { baseUrl: "" } : {}),
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* API key */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-700">API key</label>
          {provider.keyUrl && (
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className={`text-[11px] font-semibold underline-offset-2 hover:underline ${provider.accentText}`}
            >
              {provider.keyHint} ↗
            </a>
          )}
          {!provider.keyUrl && <span className="text-[11px] text-slate-500">{provider.keyHint}</span>}
        </div>
        <div className="relative mt-1.5">
          <input
            type={showKey ? "text" : "password"}
            className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:ring-2 ${provider.accentText.replace("text-", "focus:ring-")}`}
            placeholder={provider.keyPlaceholder}
            value={value.apiKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            onClick={() => setShowKey((s) => !s)}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700"
          >
            {showKey ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          🔒 Stored only in this browser — sent directly to {provider.name}. Never uploaded to the app's servers.
        </p>
      </div>

      {/* Advanced: base URL — always visible (and empty) for Custom API */}
      {provider.id !== "custom" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className={`text-[11px] font-semibold underline-offset-2 hover:underline ${provider.accentText}`}
          >
            {showAdvanced ? "Hide" : "Show"} API base URL (advanced)
          </button>
        </div>
      )}
      {(showAdvanced || provider.id === "custom") && (
        <div>
          <label className="text-xs font-semibold text-slate-700">Base URL</label>
          <input
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder={provider.id === "custom" ? "https://your-endpoint.example.com/v1" : provider.baseUrl || "https://…"}
            value={value.baseUrl}
            spellCheck={false}
            onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
          />
          {provider.id === "custom" ? (
            <p className="mt-1 text-[11px] text-slate-500">Required for a custom OpenAI-compatible endpoint. Starts empty.</p>
          ) : (
            <p className="mt-1 text-[11px] text-slate-500">Leave empty to use {provider.name}&apos;s default endpoint.</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void refreshModels(false)}
          disabled={!hasKey || !hasCustomEndpoint || loadingModels}
          className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-bold transition active:scale-[0.98] disabled:opacity-50 ${
            hasKey
              ? `${provider.accentBg} ${provider.accentText} border-transparent`
              : "border-slate-300 bg-slate-50 text-slate-500"
          }`}
        >
          {loadingModels ? <Spinner className="h-4 w-4" /> : "⟳"}
          {loadingModels ? "Loading models…" : "Load available models"}
        </button>
        <button
          type="button"
          onClick={() => void runTest()}
          disabled={!hasKey || !hasCustomEndpoint || testing}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white text-[13px] font-bold text-slate-800 transition active:scale-[0.98] disabled:opacity-50"
        >
          {testing ? <Spinner className="h-4 w-4" /> : "✓"}
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      {/* Model dropdown — every available model appears here */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700">Model</label>
          {didAutoFetch && !loadingModels && (
            <span className={`text-[11px] font-medium ${allModels.length > 0 ? "text-emerald-600" : "text-slate-500"}`}>
              {allModels.length} available
            </span>
          )}
        </div>
        <select
          className="mt-1.5 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          value={value.model}
          disabled={allModels.length === 0}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        >
          {allModels.length === 0 && (
            <option value="">
              {hasKey ? (loadingModels ? "Loading models…" : "No models — load available models") : "Add an API key to see models"}
            </option>
          )}
          {allModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          {hasKey && value.model && !modelKnown && <option value={value.model}>{value.model} (custom)</option>}
        </select>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {value.model ? `Using ${value.model} — questions are generated with this model.` : "Pick the model used for question generation."}
        </p>
      </div>

      {/* Status line */}
      {status && (
        <div
          className={`rounded-xl px-3 py-2 text-xs font-medium leading-relaxed ${
            status.tone === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : status.tone === "err"
                ? "bg-rose-50 text-rose-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
