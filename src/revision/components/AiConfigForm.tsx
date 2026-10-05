import { GlassTile } from "../../components/ui/glass-tile";
import { GlassSelect, GlassSelectContent, GlassSelectItem, GlassSelectTrigger } from "../../components/ui/glass-select";
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
import { Spinner, SecondaryButton } from "./ui";
import { GlassButton } from "../../components/ui/glass-button";
import AiConfigButton from "../../components/ui/AiConfigButton";
import { Button as RecallButton } from "../recall/components/ui/button";
import { Input as RecallInput } from "../recall/components/ui/input";
import {
  Select as RecallSelect,
  SelectContent as RecallSelectContent,
  SelectItem as RecallSelectItem,
  SelectTrigger as RecallSelectTrigger,
  SelectValue as RecallSelectValue,
} from "../recall/components/ui/select";
import { cn } from "../recall/lib/utils";

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
  /**
   * Visual treatment of the two configuration actions (load models / test
   * connection). `uiverse` = the branded tile actions, `capsule` = the legacy
   * glass buttons, and `recall` = high-contrast Recall buttons. UI only — all
   * styles use the same model-loading and connection-test handlers.
   */
  actionStyle?: "capsule" | "uiverse" | "recall";
  /** The student page uses Recall surfaces; other hosts keep legacy glass. */
  visualStyle?: "glass" | "recall";
};

function ProviderTile({
  meta,
  selected,
  onSelect,
  visualStyle = "glass",
}: {
  meta: (typeof AI_PROVIDERS)[number];
  selected: boolean;
  onSelect: () => void;
  visualStyle?: "glass" | "recall";
}) {
  if (visualStyle === "recall") {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-ai-provider={meta.id}
        className={cn(
          "relative flex min-h-[104px] w-full flex-col items-start justify-between gap-3 rounded-2xl border p-3 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "border-primary bg-primary-soft"
            : "border-outline-variant bg-surface hover:bg-surface-container-low",
        )}
      >
        {selected ? (
          <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            ✓
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-white ${meta.gradient}`}
        >
          {meta.mark}
        </span>
        <span className="w-full min-w-0 pr-4">
          <span className={cn("block truncate text-sm font-bold", selected ? "text-on-primary-container" : "text-on-surface")}>
            {meta.name}
          </span>
          <span className="mt-1 block text-xs leading-snug text-on-surface-variant">{meta.tagline}</span>
        </span>
      </button>
    );
  }

  return (
    <GlassTile
      type="button"
      onClick={onSelect}
      selected={selected}
      data-ai-provider={meta.id}
      className={`dc-tile group relative flex aspect-auto min-h-[92px] flex-col items-start justify-start gap-2 rounded-2xl p-3 text-left ${
        selected ? meta.ring : ""
      }`}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow">
          ✓
        </span>
      )}
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-white  ${meta.gradient}`}
      >
        {meta.mark}
      </span>
      <span className="w-full">
        <span className="block truncate text-[13px] font-bold text-white">{meta.name}</span>
        <span className="mt-0.5 block text-[10px] leading-tight text-white/55">{meta.tagline}</span>
      </span>
    </GlassTile>
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
  actionStyle = "capsule",
  visualStyle = "glass",
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
  const isRecall = visualStyle === "recall";
  const hasKey = value.apiKey.trim().length > 0;
  const hasCustomEndpoint = value.provider !== "custom" || value.baseUrl.trim().length > 0;

  /** Admin form keeps known-model fallbacks; own-key stays empty until fetch. */
  const liveOnly = liveModelsOnly || value.provider === "custom";
  const allModels = useMemo(
    () => (liveOnly ? models.filter((m) => m.id) : mergeModelLists(value.provider, models)),
    [liveOnly, models, value.provider],
  );
  const modelKnown = allModels.some((m) => m.id === value.model);
  const modelPlaceholder = allModels.length > 0
    ? "Select a model"
    : hasKey
      ? loadingModels
        ? "Loading models…"
        : "No models — load available models"
      : "Add an API key to see models";

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

  const visibilityIcon = showKey ? (
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
  );

  return (
    <div
      data-ai-config-form={visualStyle}
      className={cn(
        "space-y-4",
        card && (isRecall ? "rounded-2xl border border-outline-variant bg-surface p-4" : "rounded-2xl border border-white/10 p-4"),
      )}
    >
      {/* Provider picker */}
      <div>
        {title && <p className={cn("text-[13px] font-bold", isRecall ? "text-on-surface" : "text-white")}>{title}</p>}
        {description && (
          <p className={cn("mt-0.5 text-xs leading-relaxed", isRecall ? "text-on-surface-variant" : "text-white/55")}>
            {description}
          </p>
        )}
        <div data-ai-provider-grid className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AI_PROVIDERS.map((p) => (
            <ProviderTile
              key={p.id}
              meta={p}
              selected={value.provider === p.id}
              visualStyle={visualStyle}
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
          <label className={cn("text-sm font-semibold", isRecall ? "text-on-surface" : "text-white/85")}>API key</label>
          {provider.keyUrl ? (
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "text-xs font-semibold underline-offset-2 hover:underline",
                isRecall ? "text-primary" : provider.accentText,
              )}
            >
              {provider.keyHint} ↗
            </a>
          ) : (
            <span className={cn("text-xs", isRecall ? "text-on-surface-variant" : "text-white/55")}>{provider.keyHint}</span>
          )}
        </div>
        <div className="relative mt-1.5">
          {isRecall ? (
            <RecallInput
              type={showKey ? "text" : "password"}
              className="h-11 rounded-xl pr-11"
              placeholder={provider.keyPlaceholder}
              value={value.apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            />
          ) : (
            <input
              type={showKey ? "text" : "password"}
              className="dc-field w-full rounded-full border px-3 py-2.5 pr-11 text-sm outline-none transition"
              placeholder={provider.keyPlaceholder}
              value={value.apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
            />
          )}
          {isRecall ? (
            <RecallButton
              type="button"
              variant="ghost"
              size="icon"
              tabIndex={-1}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
            >
              {visibilityIcon}
            </RecallButton>
          ) : (
            <GlassButton
              type="button"
              tabIndex={-1}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 [&_.size-12]:size-8 [&_svg]:text-white/70"
            >
              {visibilityIcon}
            </GlassButton>
          )}
        </div>
        <p className={cn("mt-1.5 text-xs leading-relaxed", isRecall ? "text-on-surface-variant" : "text-white/55")}>
          🔒 Stored only in this browser — sent directly to {provider.name}. Never uploaded to the app&apos;s servers.
        </p>
      </div>

      {/* Advanced: base URL — always visible (and empty) for Custom API */}
      {provider.id !== "custom" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className={cn(
              "text-xs font-semibold underline-offset-2 hover:underline",
              isRecall ? "text-primary" : provider.accentText,
            )}
          >
            {showAdvanced ? "Hide" : "Show"} API base URL (advanced)
          </button>
        </div>
      )}
      {(showAdvanced || provider.id === "custom") && (
        <div>
          <label className={cn("text-sm font-semibold", isRecall ? "text-on-surface" : "text-white/85")}>Base URL</label>
          {isRecall ? (
            <RecallInput
              className="mt-1.5 h-11 rounded-xl font-mono text-xs"
              placeholder={provider.id === "custom" ? "https://your-endpoint.example.com/v1" : provider.baseUrl || "https://…"}
              value={value.baseUrl}
              spellCheck={false}
              onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            />
          ) : (
            <input
              className="dc-field mt-1.5 w-full rounded-full border px-3 py-2.5 font-mono text-xs outline-none transition"
              placeholder={provider.id === "custom" ? "https://your-endpoint.example.com/v1" : provider.baseUrl || "https://…"}
              value={value.baseUrl}
              spellCheck={false}
              onChange={(e) => onChange({ ...value, baseUrl: e.target.value })}
            />
          )}
          <p className={cn("mt-1.5 text-xs leading-relaxed", isRecall ? "text-on-surface-variant" : "text-white/55")}>
            {provider.id === "custom"
              ? "Required for a custom OpenAI-compatible endpoint. Starts empty."
              : `Leave empty to use ${provider.name}'s default endpoint.`}
          </p>
        </div>
      )}

      {/* Actions */}
      {actionStyle === "recall" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <RecallButton
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => void refreshModels(false)}
            disabled={!hasKey || !hasCustomEndpoint || loadingModels}
            data-ai-config-action="load-models"
          >
            {loadingModels ? <Spinner className="h-4 w-4" /> : <span aria-hidden="true">↻</span>}
            {loadingModels ? "Loading models…" : "Load available models"}
          </RecallButton>
          <RecallButton
            type="button"
            className="h-11 w-full"
            onClick={() => void runTest()}
            disabled={!hasKey || !hasCustomEndpoint || testing}
            data-ai-config-action="test-connection"
          >
            {testing ? <Spinner className="h-4 w-4" /> : <span aria-hidden="true">✓</span>}
            {testing ? "Testing…" : "Test connection"}
          </RecallButton>
        </div>
      ) : actionStyle === "uiverse" ? (
        /* The student "AI Configuration" page wears the brutalist provider
           button (Uiverse quiet-dog-6 port) for the same two configuration
           actions: one reusable component whose logo + both text lines follow
           the live provider/model state, and whose click sequence (reference
           press animation → existing handler → reference spin while the call
           runs) replaces nothing else. The status line below still carries
           the success / error copy, and the model dropdown, key box and save
           path are untouched. */
        <div className="uza-container -mx-1">
          <AiConfigButton
            provider={provider.id}
            icon={provider.mark}
            caption={provider.name}
            label={loadingModels ? "Loading models" : "Load models"}
            loading={loadingModels}
            disabled={!hasKey || !hasCustomEndpoint}
            onClick={() => void refreshModels(false)}
            aria-label={`Load ${provider.name}'s available models`}
            data-ai-config-action="load-models"
          />
          <AiConfigButton
            provider={provider.id}
            icon={provider.mark}
            caption={value.model || provider.tagline}
            label={testing ? "Testing…" : "Test connection"}
            loading={testing}
            disabled={!hasKey || !hasCustomEndpoint}
            onClick={() => void runTest()}
            aria-label={`Test the ${provider.name} connection`}
            data-ai-config-action="test-connection"
          />
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Wave 13: pack Glass Button capsule; the provider accent stays on
              the ink only once a key is present (meaning colour). */}
          <SecondaryButton
            size="sm"
            className={`flex-1 [&>span>div]:h-10 [&>span>div]:rounded-xl text-[13px] ${hasKey ? provider.accentText : "text-white/55"}`}
            onClick={() => void refreshModels(false)}
            disabled={!hasKey || !hasCustomEndpoint || loadingModels}
          >
            {loadingModels ? <Spinner className="h-4 w-4" /> : "⟳"}
            {loadingModels ? "Loading models…" : "Load available models"}
          </SecondaryButton>
          <SecondaryButton size="sm" className="flex-1 [&>span>div]:h-10 [&>span>div]:rounded-xl text-[13px]" onClick={() => void runTest()} disabled={!hasKey || !hasCustomEndpoint || testing}>
            {testing ? <Spinner className="h-4 w-4" /> : "✓"}
            {testing ? "Testing…" : "Test connection"}
          </SecondaryButton>
        </div>
      )}

      {/* Model dropdown — every available model appears here */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={cn("text-sm font-semibold", isRecall ? "text-on-surface" : "text-white/85")}>Model</label>
          {didAutoFetch && !loadingModels ? (
            <span
              className={cn(
                "text-xs font-medium",
                allModels.length > 0
                  ? isRecall ? "text-on-tertiary-container" : "text-emerald-300"
                  : isRecall ? "text-on-surface-variant" : "text-white/55",
              )}
            >
              {allModels.length} available
            </span>
          ) : null}
        </div>
        {isRecall ? (
          <RecallSelect value={value.model} onValueChange={(model) => onChange({ ...value, model })}>
            <RecallSelectTrigger aria-label="Model" disabled={allModels.length === 0} className="mt-1.5 h-11 rounded-xl">
              <RecallSelectValue placeholder={modelPlaceholder} />
            </RecallSelectTrigger>
            <RecallSelectContent className="max-h-64" aria-label="Model options">
              {allModels.map((model) => (
                <RecallSelectItem key={model.id} value={model.id}>
                  {model.name}
                </RecallSelectItem>
              ))}
              {hasKey && value.model && !modelKnown ? (
                <RecallSelectItem value={value.model}>{value.model} (custom)</RecallSelectItem>
              ) : null}
            </RecallSelectContent>
          </RecallSelect>
        ) : (
          <GlassSelect value={value.model} onValueChange={(model) => onChange({ ...value, model })}>
            <GlassSelectTrigger
              aria-label="Model"
              disabled={allModels.length === 0}
              placeholder={modelPlaceholder}
              className="dc-glass-select mt-1.5 h-11 w-full text-sm font-medium"
            />
            <GlassSelectContent className="dc-glass-select-pop" aria-label="Model options">
              {allModels.map((model) => (
                <GlassSelectItem key={model.id} value={model.id}>
                  {model.name}
                </GlassSelectItem>
              ))}
              {hasKey && value.model && !modelKnown ? (
                <GlassSelectItem value={value.model}>{value.model} (custom)</GlassSelectItem>
              ) : null}
            </GlassSelectContent>
          </GlassSelect>
        )}
        <p className={cn("mt-1.5 text-xs leading-relaxed", isRecall ? "text-on-surface-variant" : "text-white/55")}>
          {value.model ? `Using ${value.model} — questions are generated with this model.` : "Pick the model used for question generation."}
        </p>
      </div>

      {/* Status line */}
      {status ? (
        <div
          role={status.tone === "err" ? "alert" : "status"}
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-medium leading-relaxed",
            status.tone === "ok"
              ? isRecall ? "bg-tertiary-container text-on-tertiary-container" : "bg-emerald-500/15 text-emerald-200"
              : status.tone === "err"
                ? isRecall ? "bg-error-container text-on-error-container" : "bg-rose-500/15 text-rose-200"
                : isRecall
                  ? "border border-outline-variant bg-surface-container-low text-on-surface-variant"
                  : "border border-white/10 text-white/75",
          )}
        >
          {status.text}
        </div>
      ) : null}
    </div>
  );
}
