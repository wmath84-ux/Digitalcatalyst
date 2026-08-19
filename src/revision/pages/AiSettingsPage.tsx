// Student-facing AI Configuration.
//
// Deliberately simple, top-to-bottom flow (logic unchanged):
//   • Current setup   — what AI is active right now, at a glance.
//   • Choose source   — my own key / school-provided / offline.
//   • 3-step connect  — provider → API key → model (only when "own key").
//
// Storage, provider calls, model fetching and the effective-AI resolution
// all reuse the exact same engine functions as before.

import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import AiConfigForm from "../components/AiConfigForm";
import { Card, PrimaryButton } from "../components/ui";
import { CheckIcon, SparklesIcon } from "../components/icons";
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
  type UserAiConfig,
} from "../engine/aiConfig";

type Props = { uid: string; route: string };

function SourceOption({
  value,
  selected,
  title,
  description,
  badge,
  disabled,
  onSelect,
}: {
  value: AiSource;
  selected: boolean;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  onSelect: (v: AiSource) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(value)}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
        selected
          ? "border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      } ${disabled ? "opacity-50" : "active:scale-[0.99]"}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-slate-900">{title}</span>
          {badge && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{badge}</span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
    </button>
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
  const schoolProvider = adminSettings ? getProvider(adminSettings.provider) : null;

  return (
    <PageShell route={route} title="AI Configuration" subtitle="Set up in under a minute" backHref="#/revision/profile">
      <div className="animate-fade-in space-y-4 px-4 py-4 pb-10">
        {/* Current setup — always visible at the top */}
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-400">Current setup</h3>
            {savedFlash && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                <CheckIcon className="h-3.5 w-3.5" /> Saved automatically
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white ${
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
              {effective.config ? "AI on" : "No AI"}
            </span>
          </div>
        </Card>

        {/* Step 1 — pick the source */}
        <Card>
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-400">1 · Where should AI come from?</h3>
          <div className="mt-3 space-y-2">
            <SourceOption
              value="default"
              selected={userCfg.source === "default"}
              title="School-provided AI"
              badge={adminSettings?.sharedApiKey ? "Ready — no key needed" : undefined}
              description={
                adminSettings?.sharedApiKey
                  ? `Works instantly with the shared key · ${schoolProvider?.name} ${adminSettings.model}`
                  : adminPublished && adminSettings
                    ? `Your school recommends ${schoolProvider?.name} · ${adminSettings.model}, but hasn't shared a key — use your own key below.`
                    : "Not available yet — your school hasn't published an AI."
              }
              disabled={!adminSettings?.sharedApiKey}
              onSelect={(v) => updateConfig({ ...userCfg, source: v })}
            />
            <SourceOption
              value="own"
              selected={userCfg.source === "own"}
              title="My own API key"
              description="Connect Gemini, ChatGPT, Claude, Groq, OpenRouter or any custom API. Your key stays in this browser."
              onSelect={(v) => updateConfig({ ...userCfg, source: v })}
            />
            <SourceOption
              value="offline"
              selected={userCfg.source === "offline"}
              title="No AI (offline)"
              description="Use only the built-in question bank."
              onSelect={(v) => updateConfig({ ...userCfg, source: v })}
            />
          </div>
        </Card>

        {/* Step 2 — connect own provider (only when needed) */}
        {userCfg.source === "own" && (
          <Card>
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-400">2 · Connect your provider</h3>
            <p className="mt-1 text-xs text-slate-500">
              Pick a provider → paste your API key → choose a model. Everything saves automatically.
            </p>
            <div className="mt-3">
              <AiConfigForm
                card={false}
                value={userCfg.config}
                onChange={(config: AiConfig) => updateConfig({ ...userCfg, source: "own", config })}
                title=""
                description=""
              />
            </div>
          </Card>
        )}

        {/* Done — go generate */}
        <PrimaryButton onClick={() => navigate("#/revision/ai-generate")}>
          <SparklesIcon className="h-4 w-4" /> Generate questions with this AI
        </PrimaryButton>
      </div>
    </PageShell>
  );
}
