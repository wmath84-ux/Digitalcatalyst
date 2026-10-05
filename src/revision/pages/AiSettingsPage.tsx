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
import { Check, Settings2 } from "lucide-react";
import AiConfigForm from "../components/AiConfigForm";
import { RecallCard, RecallPage, RecallTile } from "../components/recall-ui";
import { useExitGuard } from "../components/ExitGuardContext";
import { Button } from "../recall/components/ui/button";
import { cn } from "../recall/lib/utils";
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
      onClick={() => onSelect(value)}
      disabled={disabled}
      aria-pressed={selected}
      data-ai-source={value}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary-soft"
          : "border-outline-variant bg-surface text-on-surface hover:bg-surface-container-low",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary bg-primary" : "border-outline",
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm font-bold", selected ? "text-on-primary-container" : "text-on-surface")}>
            {title}
          </span>
          {badge ? (
            <span className="rounded-full bg-tertiary-container px-2 py-0.5 text-[11px] font-semibold text-on-tertiary-container">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-on-surface-variant">{description}</span>
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
    <RecallPage
      title="AI Configuration"
      subtitle="Choose a provider, manage your API key, and control how Revision creates questions."
      onBack={() => navigate("#/revision/profile")}
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate("#/revision/settings")}
          data-ai-settings-link
        >
          <Settings2 aria-hidden className="h-4 w-4" />
          Settings
        </Button>
      }
    >
      <div
        data-rev-layout="ai-settings"
        data-revision-route={route}
        className="mx-auto w-full max-w-4xl animate-fade-in space-y-4 pb-6"
      >
        <RecallCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-on-surface">Current setup</h2>
            {savedFlash ? (
              <span role="status" className="flex items-center gap-1.5 text-sm font-semibold text-on-tertiary-container">
                <Check aria-hidden className="h-4 w-4" /> Saved automatically
              </span>
            ) : null}
          </div>
          <RecallTile className="mt-3 flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${
                userCfg.source === "default" && schoolProvider
                  ? schoolProvider.gradient
                  : (effProvider?.gradient ?? "bg-slate-600")
              }`}
            >
              {userCfg.source === "default" && schoolProvider ? schoolProvider.mark : (effProvider?.mark ?? "▦")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-on-surface">{currentTitle}</p>
              <p className="mt-0.5 text-sm text-on-surface-variant">{currentLabel}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                effective.config
                  ? "bg-tertiary-container text-on-tertiary-container"
                  : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {effective.config ? "AI on" : "No AI"}
            </span>
          </RecallTile>
        </RecallCard>

        <RecallCard>
          <h2 className="text-base font-semibold text-on-surface">Choose an AI source</h2>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
            Pick the option that should power your Revision questions.
          </p>
          <div className="mt-4 grid gap-2.5">
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
              description="Use your own provider account. Your key is kept separate from school settings."
              onSelect={selectSource}
            />
            <SourceOption
              value="offline"
              selected={userCfg.source === "offline"}
              title="No AI (offline)"
              description="Continue without an AI provider and add questions through Bulk Import."
              onSelect={selectSource}
            />
          </div>
        </RecallCard>

        {userCfg.source === "default" && schoolReady && adminSettings && schoolProvider ? (
          <section data-school-ai-preview>
            <RecallCard>
              <h2 className="text-base font-semibold text-on-surface">School AI</h2>
              <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
                Your school has published this provider. You don't need to add an API key.
              </p>
              <RecallTile className="mt-3 flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${schoolProvider.gradient}`}
                >
                  {schoolProvider.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-on-surface">{schoolProvider.name}</p>
                  <p className="mt-1 truncate font-mono text-sm text-on-surface-variant">{adminSettings.model}</p>
                </div>
                <span className="shrink-0 rounded-full bg-tertiary-container px-2.5 py-1 text-xs font-semibold text-on-tertiary-container">
                  Shared key
                </span>
              </RecallTile>
            </RecallCard>
          </section>
        ) : null}

        {userCfg.source === "own" ? (
          <RecallCard>
            <h2 className="text-base font-semibold text-on-surface">Connect your provider</h2>
            <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
              Choose a provider and paste your API key. The model list loads after your key is validated.
              The API key field starts empty.
            </p>
            <div className="mt-4">
              <AiConfigForm
                card={false}
                liveModelsOnly
                visualStyle="recall"
                actionStyle="recall"
                value={ownFormValue}
                onChange={(config: AiConfig) => updateConfig({ ...userCfg, source: "own", config })}
                title=""
                description=""
              />
            </div>
          </RecallCard>
        ) : null}
      </div>
    </RecallPage>
  );
}
