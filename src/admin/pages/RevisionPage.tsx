"use client";

// Admin · Revision — AI Configuration only.
//
// Every other admin customization surface (settings, questions, subjects &
// topics, classes, customization limits, AI question generator, bulk import)
// has been removed on purpose: users now customize and generate their own
// tests directly from their profile (AI test generator + bulk import).
// The admin's single remaining job here is the AI configuration that is
// published as the default for every learner.

import { useEffect, useState } from "react";
import {
  Field,
  LoadingState,
  PrimaryButton,
  SectionCard,
  inputClass,
  selectClass,
} from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import { type RevisionCatalog } from "@/revision/engine/catalogService";
import AiConfigForm from "@/revision/components/AiConfigForm";
import RevisionCurriculumSection from "@/admin/pages/RevisionCurriculumSection";
import {
  defaultCatalogAiSettings,
  getProvider,
  loadAdminAiConfig,
  mergeModelLists,
  saveAdminAiConfig,
  type CatalogAiSettings,
  type ProviderModel,
  type UserAiConfig,
} from "@/revision/engine/aiConfig";

export default function RevisionPage() {
  const { notify } = useToast();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The admin's own AI connection — stored only in this browser.
  const [adminCfg, setAdminCfg] = useState<UserAiConfig>(() => loadAdminAiConfig());
  const [fetchedModels, setFetchedModels] = useState<ProviderModel[]>([]);

  // Published default that every user sees.
  const [publishModel, setPublishModel] = useState("");
  const [shareKey, setShareKey] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [windowHours, setWindowHours] = useState(5);
  const [windowLimit, setWindowLimit] = useState(10);
  const [publishing, setPublishing] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ catalog: RevisionCatalog; isDefault: boolean }>("/api/admin/revision");
      setCatalog(res.catalog);
      const published = res.catalog.aiSettings ?? defaultCatalogAiSettings();
      setPublishModel(published.model);
      setShareKey(Boolean(published.sharedApiKey));
      setDailyLimit(published.dailyLimit ?? 20);
      setWindowHours(published.windowHours ?? 5);
      setWindowLimit(published.windowLimit ?? 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revision AI configuration.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistAdminCfg = (cfg: UserAiConfig) => {
    setAdminCfg(cfg);
    saveAdminAiConfig(cfg);
  };

  if (error) {
    return (
      <SectionCard title="Revision · AI Configuration">
        <p className="text-sm text-red-500">{error}</p>
        <PrimaryButton className="mt-3" onClick={load}>Retry</PrimaryButton>
      </SectionCard>
    );
  }
  if (!catalog) return <LoadingState label="Loading AI configuration…" />;

  const published = catalog.aiSettings ?? defaultCatalogAiSettings();
  const publishProvider = adminCfg.config.provider;
  const publishModels = mergeModelLists(publishProvider, fetchedModels);
  const publishProviderMeta = getProvider(publishProvider);

  const publishDefault = async () => {
    if (!publishModel) {
      notify("error", "Pick a default model first.");
      return;
    }
    if (shareKey && !adminCfg.config.apiKey.trim()) {
      notify("error", "Enter your API key before sharing it with users.");
      return;
    }
    const nextSettings: CatalogAiSettings = {
      provider: publishProvider,
      model: publishModel,
      models: publishModels.slice(0, 300),
      sharedApiKey: shareKey ? adminCfg.config.apiKey.trim() : "",
      updatedAt: new Date().toISOString(),
      dailyLimit: Math.max(0, Math.round(Number(dailyLimit) || 0)),
      windowHours: Math.max(1, Math.min(24, Math.round(Number(windowHours) || 5))),
      windowLimit: Math.max(-1, Math.round(Number(windowLimit) || 0)),
    };
    setPublishing(true);
    try {
      const next = { ...catalog, aiSettings: nextSettings };
      const res = await adminFetch<{ catalog: RevisionCatalog }>("/api/admin/revision", {
        method: "POST",
        body: JSON.stringify(next),
      });
      setCatalog(res.catalog);
      notify(
        "success",
        shareKey
          ? "Published — users can now generate with your shared key."
          : "Published — users now see this provider & model as the default.",
      );
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to publish.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-3 pb-6">
      <SectionCard
        title="AI Configuration"
        description="Publish the default AI students can use, and keep the Class → Subject → Chapter → Concept lists on the latest exam year."
      >
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-700">
          ✨ Question generation, class/subject/chapter/topic selection and bulk import now live on the
          user&apos;s profile page.
        </p>
      </SectionCard>

      {/* Connect any provider */}
      <SectionCard
        title="Connect an AI provider"
        description="Works with Google Gemini, OpenAI, Anthropic Claude, OpenRouter, Groq or any custom OpenAI-compatible API. Your key is stored only in this browser and sent directly to the provider — never baked into the app bundle."
      >
        <AiConfigForm
          value={adminCfg.config}
          onChange={(config) => {
            if (config.provider !== adminCfg.config.provider) {
              setFetchedModels([]);
              if (config.provider === "custom") setPublishModel("");
            }
            persistAdminCfg({ ...adminCfg, source: "own", config });
          }}
          title="Your AI provider (admin)"
          description="Pick a provider, paste your API key — every available model will appear in the dropdown automatically."
          onModelsChange={(models) => setFetchedModels(models)}
        />
      </SectionCard>

      {/* Publish default for all users */}
      <SectionCard
        title="Default for all users"
        description="Choose the provider + model that is shown to every learner. Whatever you save here is visible to all users in their AI Configuration. Your API key stays private unless you explicitly share it below."
      >
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base font-black text-white shadow-sm ${publishProviderMeta.gradient}`}>
            {publishProviderMeta.mark}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{publishProviderMeta.name}</p>
            <p className="text-xs text-slate-500">
              {published.updatedAt ? (
                <>
                  Currently published: <span className="font-mono font-semibold">{published.model}</span>
                  {published.sharedApiKey ? " · shared key on" : " · no shared key"}
                </>
              ) : (
                "Nothing published yet — users fall back to the offline engine."
              )}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <Field
            label="Default model for users"
            hint="Open the dropdown — every model this provider exposes (plus known models) is listed. Pick the one you want to fix for all learners."
          >
            <select className={selectClass} value={publishModel} onChange={(e) => setPublishModel(e.target.value)}>
              {publishModels.length === 0 && <option value="">No models — connect a provider above</option>}
              {publishModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              {publishModel && !publishModels.some((m) => m.id === publishModel) && (
                <option value={publishModel}>{publishModel} (custom)</option>
              )}
            </select>
          </Field>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Share my API key with users</p>
            <p className="text-xs text-slate-500">Users can then generate questions without their own key.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={shareKey}
            onClick={() => setShareKey((s) => !s)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${shareKey ? "bg-amber-500" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${shareKey ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {shareKey && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
            ⚠️ Your key will be stored in the public revision catalog so every user can call the provider directly with it.
            Anyone with the catalog can read it — only enable this for keys with strict spending limits.
          </p>
        )}

        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="text-sm font-semibold text-slate-900">Usage limits for every user</p>
          <p className="mt-0.5 text-xs text-slate-500">
            These numbers appear on each learner&apos;s profile with a live progress bar. Set daily to 0 for unlimited.
            Window limit −1 = unlimited window.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Field label="Daily generations">
              <input className={inputClass} type="number" min={0} max={10000} value={dailyLimit}
                onChange={(e) => setDailyLimit(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Window hours">
              <input className={inputClass} type="number" min={1} max={24} value={windowHours}
                onChange={(e) => setWindowHours(Math.max(1, Math.min(24, Math.round(Number(e.target.value) || 5))))} />
            </Field>
            <Field label="Window limit">
              <input className={inputClass} type="number" min={-1} max={10000} value={windowLimit}
                onChange={(e) => setWindowLimit(Math.max(-1, Math.round(Number(e.target.value) || 0)))} />
            </Field>
          </div>
        </div>

        <PrimaryButton className="mt-3 w-full" loading={publishing} onClick={() => void publishDefault()}>
          📢 Publish default for all users
        </PrimaryButton>
      </SectionCard>

      <RevisionCurriculumSection
        catalog={catalog}
        adminConfig={adminCfg.config}
        onCatalog={setCatalog}
      />
    </div>
  );
}
