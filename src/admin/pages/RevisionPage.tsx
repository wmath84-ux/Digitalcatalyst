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
import { useConfirm, useToast } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import { type RevisionCatalog } from "@/revision/engine/catalogService";
import AiConfigForm from "@/revision/components/AiConfigForm";
import RevisionCurriculumSection from "@/admin/pages/RevisionCurriculumSection";
import {
  defaultCatalogAiSettings,
  getProvider,
  isSchoolAiAvailable,
  isSchoolAiPublished,
  loadAdminAiConfig,
  mergeModelLists,
  saveAdminAiConfig,
  type CatalogAiSettings,
  type ProviderModel,
  type UserAiConfig,
} from "@/revision/engine/aiConfig";

export default function RevisionPage() {
  const { notify } = useToast();
  const confirm = useConfirm();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The admin's own AI connection — stored only in this browser.
  const [adminCfg, setAdminCfg] = useState<UserAiConfig>(() => loadAdminAiConfig());
  const [fetchedModels, setFetchedModels] = useState<ProviderModel[]>([]);

  // Published default that every user sees.
  const [publishModel, setPublishModel] = useState("");
  // True once the admin manually picks the default model in the "Default for
  // all users" picker — from then on we stop auto-following the model chosen
  // in the "Connect an AI provider" form.
  const [publishModelOverridden, setPublishModelOverridden] = useState(false);
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
      // The published default model must belong to the provider the admin is
      // currently connected to. Otherwise the picker starts with a model from
      // a different provider and publishing it would silently break every
      // student's "School-provided AI" generation.
      setPublishModel(
        published.provider === adminCfg.config.provider && published.model
          ? published.model
          : (mergeModelLists(adminCfg.config.provider, [])[0]?.id ?? ""),
      );
      setPublishModelOverridden(false);
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

  // What students see RIGHT NOW on their AI Configuration page. Same
  // predicates the student page uses, so this status can never drift from
  // the real "School-provided AI" button state.
  const studentSchoolReady = isSchoolAiAvailable(published);
  const studentSchoolPublished = isSchoolAiPublished(published);

  const publishDefault = async () => {
    if (!publishModel) {
      notify("error", "Pick a default model first.");
      return;
    }
    if (shareKey && !adminCfg.config.apiKey.trim()) {
      notify("error", "Enter your API key before sharing it with users.");
      return;
    }
    if (!shareKey) {
      // Publishing without a shared key leaves every student's
      // "School-provided AI" option DISABLED — the old success toast hid
      // that, so make the admin confirm the exact consequence first.
      const { confirmed } = await confirm({
        title: "Publish without a shared key?",
        description: studentSchoolReady
          ? "Students are currently USING your shared key. This publish will REMOVE it from the catalog, so \"School-provided AI\" becomes disabled for every learner until you share a key again."
          : "Students will see your provider & model, but \"School-provided AI\" stays DISABLED for them — every learner will need their own API key.",
        confirmLabel: "Publish anyway",
      });
      if (!confirmed) return;
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
      if (shareKey) {
        notify("success", "Published — users can now generate with your shared key.");
      } else {
        // No key shared → the publish succeeded, but the student option is
        // NOT usable. Never show a plain success toast in that case.
        notify(
          "warning",
          "Published — but School-provided AI is NOT ready for students (no shared key). Turn on “Share my API key” and publish again to enable it.",
        );
      }
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
              // Keep the published default in lockstep with the connected
              // provider so "School-provided AI" is never published with a
              // model that belongs to a different provider.
              if (config.provider === "custom") {
                setPublishModel("");
              } else {
                setPublishModel(mergeModelLists(config.provider, [])[0]?.id ?? "");
              }
              setPublishModelOverridden(false);
            } else if (
              config.model &&
              config.model !== adminCfg.config.model &&
              !publishModelOverridden
            ) {
              // The admin just picked a model — mirror it into the published
              // default so the school AI matches what they actually connected.
              setPublishModel(config.model);
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

        {/* Live student view — exactly what the student AI Configuration
            page shows for the "School-provided AI" option right now. */}
        <div
          data-student-ai-status
          className={`mt-3 flex items-start gap-2.5 rounded-xl border p-3 ${
            studentSchoolReady
              ? "border-emerald-200 bg-emerald-50"
              : studentSchoolPublished
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-slate-50"
          }`}
        >
          <span className="mt-0.5 text-base leading-none" aria-hidden>
            {studentSchoolReady ? "✅" : studentSchoolPublished ? "❌" : "⏳"}
          </span>
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <p
              className={`font-bold ${
                studentSchoolReady
                  ? "text-emerald-800"
                  : studentSchoolPublished
                    ? "text-amber-800"
                    : "text-slate-600"
              }`}
            >
              Students currently see “School-provided AI” as:{" "}
              {studentSchoolReady
                ? "ready — no key needed"
                : studentSchoolPublished
                  ? "disabled (no shared key)"
                  : "not published yet"}
            </p>
            <p
              className={`mt-0.5 ${
                studentSchoolReady
                  ? "text-emerald-700"
                  : studentSchoolPublished
                    ? "text-amber-700"
                    : "text-slate-500"
              }`}
            >
              {studentSchoolReady
                ? "Any learner can switch it on and generate questions instantly with your shared key."
                : studentSchoolPublished
                  ? `You published ${getProvider(published.provider).name} · ${published.model}, but no key reached the students. Turn on “Share my API key with users” below and publish again to enable it.`
                  : "Nothing has reached students yet — pick a default model, choose whether to share your key, then press Publish."}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <Field
            label="Default model for users"
            hint="Open the dropdown — every model this provider exposes (plus known models) is listed. Pick the one you want to fix for all learners."
          >
            <select
              className={selectClass}
              value={publishModel}
              onChange={(e) => {
                setPublishModel(e.target.value);
                setPublishModelOverridden(true);
              }}
            >
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
            <p className="text-xs text-slate-500">
              Makes “School-provided AI” ready to use — students generate questions without their own key.
            </p>
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

        {/* Preview of what the NEXT publish will do — removes the "Published ✓"
            surprise where students' School-provided AI stayed disabled. */}
        <p
          data-publish-preview
          className={`mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
            shareKey ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {shareKey ? (
            <>
              ✅ If you publish now, your key is included — students&apos; “School-provided AI”
              becomes <span className="font-semibold">ready instantly</span>, no key needed on their side.
            </>
          ) : (
            <>
              ❌ If you publish now, <span className="font-semibold">no key goes out</span> — students&apos;
              “School-provided AI” stays <span className="font-semibold">disabled</span> and every learner
              must use their own key.
              {studentSchoolReady && (
                <> ⚠️ It will also <span className="font-semibold">remove</span> the shared key students are currently using.</>
              )}
            </>
          )}
        </p>

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
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          Students see this in their AI Configuration as{" "}
          <span className="font-semibold text-slate-500">“School-provided AI”</span>. It is instantly usable
          (no key needed) once you turn on <span className="font-semibold text-slate-500">Share my API key</span> above.
        </p>
      </SectionCard>

      <RevisionCurriculumSection
        catalog={catalog}
        adminConfig={adminCfg.config}
        onCatalog={setCatalog}
      />
    </div>
  );
}
