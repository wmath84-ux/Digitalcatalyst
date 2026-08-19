// Student-facing AI settings.
//
// Lets every learner connect their own AI provider (Gemini, OpenAI,
// Anthropic, OpenRouter, Groq or any OpenAI-compatible endpoint), see every
// model their key unlocks, test the connection, and choose between their own
// key / the app-provided default published by the admin / offline mode.

import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import AiConfigForm from "../components/AiConfigForm";
import { Card, PrimaryButton, SecondaryButton } from "../components/ui";
import { GearIcon, SparklesIcon, CheckIcon, ChevronRightIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { fetchRemoteCatalog, type RevisionCatalog } from "../engine/catalogService";
import {
  getProvider,
  hasStoredUserAiConfig,
  loadUserAiConfig,
  resolveEffectiveAi,
  saveUserAiConfig,
  type AiConfig,
  type AiSource,
  type CatalogAiSettings,
  type UserAiConfig,
} from "../engine/aiConfig";

type Props = { uid: string; route: string };

function SourceOption({
  value,
  selected,
  title,
  description,
  disabled,
  onSelect,
}: {
  value: AiSource;
  selected: boolean;
  title: string;
  description: string;
  disabled?: boolean;
  onSelect: (v: AiSource) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function AdminDefaultCard({
  settings,
  published,
  onUseRecommendation,
}: {
  settings: CatalogAiSettings;
  published: boolean;
  onUseRecommendation: () => void;
}) {
  const provider = getProvider(settings.provider);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-black text-white shadow-sm ${provider.gradient}`}>
          {provider.mark}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-bold text-slate-900">School default AI</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${published ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
              {published ? "Set by your school" : "Not published yet"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {provider.name} · <span className="font-mono font-semibold text-slate-700">{settings.model}</span>
          </p>
        </div>
      </div>
      {settings.sharedApiKey ? (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          ✓ Your school shared a working API key — you can use AI questions right away.
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
          Your school recommends {provider.name} with <span className="font-semibold">{settings.model}</span>. Connect your own key to use it —{" "}
          <button type="button" onClick={onUseRecommendation} className="font-bold text-indigo-600 underline underline-offset-2">
            use this model
          </button>
          .
        </div>
      )}
    </Card>
  );
}

export default function AiSettingsPage({ uid, route }: Props) {
  const { navigate } = useExitGuard();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [userCfg, setUserCfg] = useState<UserAiConfig>(() => loadUserAiConfig(uid));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    void fetchRemoteCatalog().then((c) => setCatalog(c));
  }, []);

  const adminSettings = catalog?.aiSettings ?? null;
  const adminPublished = Boolean(adminSettings?.updatedAt);

  // When the school shared a key and the student never picked a preference,
  // turn the school-provided AI on automatically — AI questions just work.
  useEffect(() => {
    if (!adminSettings?.sharedApiKey) return;
    if (hasStoredUserAiConfig(uid)) return;
    setUserCfg((prev) => (prev.source === "offline" ? { ...prev, source: "default" } : prev));
  }, [adminSettings?.sharedApiKey, uid]);

  // Prefill the user's provider form with the school's recommendation the
  // first time they open their own-key panel after a publish.
  useEffect(() => {
    if (!adminSettings?.model || userCfg.config.model) return;
    setUserCfg((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        provider: adminSettings.provider,
        model: adminSettings.model,
      },
    }));
  }, [adminSettings?.model, adminSettings?.provider, userCfg.config.model]);

  const updateConfig = (next: UserAiConfig) => {
    setUserCfg(next);
    saveUserAiConfig(uid, next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  const effective = useMemo(() => resolveEffectiveAi(userCfg, adminSettings), [userCfg, adminSettings]);
  const effProvider = effective.config ? getProvider(effective.config.provider) : null;

  return (
    <PageShell route={route} title="AI Settings" subtitle="Power questions with your own AI">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-10">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-200">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <GearIcon className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-base font-bold">AI Question Engine</h2>
              <p className="mt-1 text-xs leading-relaxed text-indigo-100">
                Generate unlimited practice questions with your own AI provider — Gemini, ChatGPT, Claude, Groq,
                OpenRouter or any custom API. Your key stays in your browser.
              </p>
            </div>
          </div>
          <div className="relative mt-4 flex gap-2">
            <PrimaryButton
              className="flex-1 !bg-white !text-indigo-700"
              onClick={() => navigate("#/revision/ai-generate")}
            >
              <SparklesIcon className="h-4 w-4" /> Generate questions
            </PrimaryButton>
            <SecondaryButton className="flex-1 !border-white/40 !bg-white/10 !text-white" onClick={() => navigate("#/revision/bank")}>
              View my bank
            </SecondaryButton>
          </div>
        </div>

        {/* School default */}
        {adminSettings && (
          <AdminDefaultCard
            settings={adminSettings}
            published={adminPublished}
            onUseRecommendation={() =>
              updateConfig({
                ...userCfg,
                source: "own",
                config: { ...userCfg.config, provider: adminSettings.provider, model: adminSettings.model },
              })
            }
          />
        )}

        {/* Source picker */}
        <Card>
          <h3 className="text-sm font-bold text-slate-900">How should AI questions work?</h3>
          <div className="mt-3 space-y-2">
            <SourceOption
              value="own"
              selected={userCfg.source === "own"}
              title="Use my own API key"
              description="Connect any provider below. Best if you have (or want) your own key."
              onSelect={(v) => updateConfig({ ...userCfg, source: v })}
            />
            <SourceOption
              value="default"
              selected={userCfg.source === "default"}
              title="Use the school-provided AI"
              description={
                adminSettings?.sharedApiKey
                  ? `Uses the key your school shared — ${getProvider(adminSettings.provider).name} ${adminSettings.model}.`
                  : "Your school hasn't shared a key yet — connect your own to use AI."
              }
              disabled={!adminSettings?.sharedApiKey}
              onSelect={(v) => updateConfig({ ...userCfg, source: v })}
            />
            <SourceOption
              value="offline"
              selected={userCfg.source === "offline"}
              title="Offline question bank"
              description="Use the built-in question bank only — no AI."
              onSelect={(v) => updateConfig({ ...userCfg, source: v })}
            />
          </div>
        </Card>

        {/* Own API configuration */}
        {userCfg.source === "own" && (
          <AiConfigForm
            value={userCfg.config}
            onChange={(config: AiConfig) => updateConfig({ ...userCfg, source: "own", config })}
            title="My AI provider"
            description="Pick a provider, paste your API key and every available model will appear below automatically."
          />
        )}

        {/* Status summary */}
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Current setup</h3>
            {savedFlash && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                <CheckIcon className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white ${
                  effProvider?.gradient ?? "from-slate-400 to-slate-600"
                }`}
              >
                {effProvider?.mark ?? "▦"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-slate-900">
                  {effective.config ? `${effProvider?.name} · ${effective.config.model}` : "Offline question bank"}
                </p>
                <p className="text-xs text-slate-500">{effective.label}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  effective.config ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                }`}
              >
                {effective.config ? "Active" : "No AI"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("#/revision/ai-generate")}
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition active:bg-slate-50"
          >
            <span className="text-[13px] font-bold text-slate-800">Start generating questions</span>
            <ChevronRightIcon className="h-4 w-4 text-slate-400" />
          </button>
        </Card>
      </div>
    </PageShell>
  );
}
