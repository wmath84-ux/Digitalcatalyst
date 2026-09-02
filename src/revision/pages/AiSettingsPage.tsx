// Student-facing AI Configuration.
//
// Configuration only — no generate CTA. Three sources, each wired correctly:
//   • School-provided AI  — the admin panel's published catalog (provider,
//     model, shared key). Never leaked onto the own-key form.
//   • My own API key      — blank API box + empty model list until the
//     student pastes their own key.
//   • No AI (offline)     — jumps straight to bulk import so they can paste
//     a full revision plan (questions + answers) in one go.

import { useEffect, useMemo, useState } from "react";
import PageShell from "../components/PageShell";
import AiConfigForm from "../components/AiConfigForm";
import { Card } from "../components/ui";
import { CheckIcon } from "../components/icons";
import { useExitGuard } from "../components/ExitGuardContext";
import { fetchRemoteCatalog, type RevisionCatalog } from "../engine/catalogService";
import {
  blankOwnAiConfig,
  getProvider,
  hasStoredUserAiConfig,
  isSchoolAiAvailable,
  isSchoolAiPublished,
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
      data-ai-source={value}
      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
        selected
          ? "border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-200"
          : "border-slate-300 bg-white hover:border-slate-400"
      } ${disabled ? "opacity-50" : "active:scale-[0.99]"}`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-indigo-600 bg-indigo-600" : "border-white/10 bg-white"
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-white">{title}</span>
          {badge && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{badge}</span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-white/75">{description}</span>
      </span>
    </button>
  );
}

export default function AiSettingsPage({ uid, route }: Props) {
  const { navigate } = useExitGuard();
  const [catalog, setCatalog] = useState<RevisionCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [userCfg, setUserCfg] = useState<UserAiConfig>(() => loadUserAiConfig(uid));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchRemoteCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const adminSettings = catalog?.aiSettings ?? null;
  const schoolReady = isSchoolAiAvailable(adminSettings);
  const schoolPublished = isSchoolAiPublished(adminSettings);

  // First visit + school AI is live → turn it on. Never copy school values
  // into the own-key form, and never override an explicit student choice.
  useEffect(() => {
    if (!schoolReady) return;
    if (hasStoredUserAiConfig(uid)) return;
    setUserCfg((prev) => {
      if (prev.source !== "offline") return prev;
      const next: UserAiConfig = { ...prev, source: "default" };
      saveUserAiConfig(uid, next);
      return next;
    });
  }, [schoolReady, uid]);

  const updateConfig = (next: UserAiConfig) => {
    setUserCfg(next);
    saveUserAiConfig(uid, next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const selectSource = (source: AiSource) => {
    if (source === "offline") {
      updateConfig({ ...userCfg, source: "offline" });
      navigate("#/revision/bulk-import");
      return;
    }
    if (source === "own") {
      const keepOwn = userCfg.config.apiKey.trim().length > 0;
      updateConfig({ source: "own", config: keepOwn ? userCfg.config : blankOwnAiConfig() });
      return;
    }
    updateConfig({ ...userCfg, source: "default" });
  };

  const effective = useMemo(() => resolveEffectiveAi(userCfg, adminSettings), [userCfg, adminSettings]);
  const effProvider = effective.config ? getProvider(effective.config.provider) : null;
  const schoolProvider = adminSettings ? getProvider(adminSettings.provider) : null;

  const ownFormValue: AiConfig = userCfg.config.apiKey.trim() ? userCfg.config : blankOwnAiConfig();

  const schoolDescription = catalogLoading
    ? "Loading your school's published AI…"
    : schoolReady
      ? `Works instantly with the shared key · ${schoolProvider?.name} · ${adminSettings?.model}`
      : schoolPublished && adminSettings
        ? `Your school published ${schoolProvider?.name} · ${adminSettings.model}, but hasn't shared a key yet.`
        : "Not available yet — your school hasn't published an AI.";

  const currentTitle = catalogLoading
    ? "Loading school AI…"
    : userCfg.source === "own" && !userCfg.config.apiKey.trim()
      ? "Add your API key below"
      : userCfg.source === "default" && !schoolReady
        ? schoolPublished
          ? "School AI published — waiting for a shared key"
          : "School AI not published yet"
        : effective.config
          ? `${effProvider?.name} · ${effective.config.model}`
          : "Offline question bank";

  const currentLabel =
    userCfg.source === "own"
      ? userCfg.config.apiKey.trim()
        ? "Your own API key"
        : "My own API key — not connected yet"
      : userCfg.source === "default"
        ? "School-provided AI"
        : "No AI (offline)";

  return (
    <PageShell route={route} title="AI Configuration" subtitle="Set up in under a minute" backHref="#/revision/profile">
      <div data-rev-layout="aisettings" className="animate-fade-in space-y-4 px-4 py-4 pb-10 lg:space-y-3 lg:px-0 lg:py-0 lg:pb-6 lg:max-w-[900px] lg:mx-auto">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">Current setup</h3>
            {savedFlash && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                <CheckIcon className="h-3.5 w-3.5" /> Saved automatically
              </span>
            )}
          </div>
          <div className="mt-2.5 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white ${
                userCfg.source === "default" && schoolProvider
                  ? schoolProvider.gradient
                  : (effProvider?.gradient ?? "from-slate-400 to-slate-600")
              }`}
            >
              {userCfg.source === "default" && schoolProvider ? schoolProvider.mark : (effProvider?.mark ?? "▦")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-white">{currentTitle}</p>
              <p className="text-xs text-white/75">{currentLabel}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                effective.config ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {effective.config ? "AI on" : "No AI"}
            </span>
          </div>
        </Card>

        <Card>
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">1 · Where should AI come from?</h3>
          <div className="mt-3 space-y-2">
            <SourceOption
              value="default"
              selected={userCfg.source === "default"}
              title="School-provided AI"
              badge={schoolReady ? "Ready — no key needed" : catalogLoading ? "Loading" : undefined}
              description={schoolDescription}
              disabled={!catalogLoading && !schoolReady}
              onSelect={selectSource}
            />
            <SourceOption
              value="own"
              selected={userCfg.source === "own"}
              title="My own API key"
              description="Blank form — paste your own key. School settings never appear here."
              onSelect={selectSource}
            />
            <SourceOption
              value="offline"
              selected={userCfg.source === "offline"}
              title="No AI (offline)"
              description="Opens bulk import so you can paste a full revision plan with questions and answers."
              onSelect={selectSource}
            />
          </div>
        </Card>

        {userCfg.source === "default" && schoolReady && adminSettings && schoolProvider && (
          <Card data-school-ai-preview>
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">2 · School AI</h3>
            <p className="mt-1 text-xs text-white/75">
              This is the configuration published from the admin panel. You don't need an API key.
            </p>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black text-white ${schoolProvider.gradient}`}
              >
                {schoolProvider.mark}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-white">{schoolProvider.name}</p>
                <p className="truncate font-mono text-xs text-white/75">{adminSettings.model}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                Shared key
              </span>
            </div>
          </Card>
        )}

        {userCfg.source === "own" && (
          <Card>
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-white/55">2 · Connect your provider</h3>
            <p className="mt-1 text-xs text-white/75">
              Pick a provider → paste your API key → models appear after the key loads. The API box starts empty.
            </p>
            <div className="mt-3">
              <AiConfigForm
                card={false}
                liveModelsOnly
                value={ownFormValue}
                onChange={(config: AiConfig) => updateConfig({ ...userCfg, source: "own", config })}
                title=""
                description=""
              />
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
