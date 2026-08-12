"use client";

import { useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  Field,
  KeyValue,
  LoadingState,
  Pill,
  PrimaryButton,
  SectionCard,
  StatCard,
  Tabs,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import { useConfirm, useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type AiSettingsData = {
  enabledModels: string[];
  defaultModel: string;
  communityAiAccess: boolean;
  courseAiAccess: boolean;
  userContextEnabled: boolean;
  courseContextEnabled: boolean;
  systemInstructions: string;
  contextTokenLimit: number;
  dailyRequestLimit: number;
  rateLimitPerMinute: number;
  promptTemplates: { name: string; template: string }[];
  safetyInstructions: string;
  clearHistoryPolicyDays: number;
  providerStatus: Record<string, string>;
};

const KNOWN_MODELS = [
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "gemini", contextLimit: 4000, dailyLimit: 50 },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "gemini", contextLimit: 8000, dailyLimit: 20 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", contextLimit: 4000, dailyLimit: 30 },
];

/* ------------------------------------------------------------------ */
/* AI Workspace page                                                   */
/* ------------------------------------------------------------------ */

const AI_TABS = [
  { key: "overview", label: "Overview" },
  { key: "models", label: "Models" },
  { key: "access", label: "Access" },
  { key: "prompts", label: "Prompt Rules" },
  { key: "limits", label: "Limits" },
  { key: "logs", label: "Logs" },
];

export default function AiWorkspacePage() {
  const [tab, setTab] = useState("overview");
  const confirm = useConfirm();
  const { notify } = useToast();
  const { setDirty } = useUnsavedGuard();

  return (
    <div className="space-y-3 pb-6">
      <Tabs tabs={AI_TABS} active={tab} onChange={setTab} />
      <div className="mt-3">
        {tab === "overview" && <AiOverviewTab />}
        {tab === "models" && <AiModelsTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "access" && <AiAccessTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "prompts" && <AiPromptsTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "limits" && <AiLimitsTab confirm={confirm} notify={notify} setDirty={setDirty} />}
        {tab === "logs" && <AiLogsTab />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Overview tab                                                        */
/* ------------------------------------------------------------------ */

function AiOverviewTab() {
  const [settings, setSettings] = useState<AiSettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ settings: AiSettingsData }>("/api/admin/ai-settings");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Loading AI workspace…" />;

  const providerStatusEntries = Object.entries(settings.providerStatus || {});

  return (
    <div className="space-y-3">
      <SectionCard title="AI service status">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Default model" value={settings.defaultModel} />
          <StatCard
            label="Course AI"
            value={settings.courseAiAccess ? "Enabled" : "Disabled"}
            tone={settings.courseAiAccess ? "ok" : "warn"}
          />
          <StatCard
            label="Community AI"
            value={settings.communityAiAccess ? "Enabled" : "Disabled"}
            tone={settings.communityAiAccess ? "ok" : "warn"}
          />
          <StatCard label="Daily limit" value={`${settings.dailyRequestLimit}/user`} />
        </div>
      </SectionCard>

      <SectionCard title="Provider configuration">
        {providerStatusEntries.length === 0 ? (
          <p className="text-sm text-slate-500">No providers configured.</p>
        ) : (
          <div className="space-y-1">
            {providerStatusEntries.map(([provider, status]) => (
              <KeyValue
                key={provider}
                label={provider}
                value={
                  <Pill
                    tone={
                      status === "configured"
                        ? "success"
                        : status === "invalid"
                          ? "danger"
                          : "warn"
                    }
                  >
                    {status === "configured"
                      ? "Configured"
                      : status === "invalid"
                        ? "Invalid"
                        : status === "provider_unavailable"
                          ? "Unavailable"
                          : "Not configured"}
                  </Pill>
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Enabled models">
        {settings.enabledModels.length === 0 ? (
          <p className="text-sm text-slate-500">No models enabled.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {settings.enabledModels.map((m) => (
              <Pill key={m} tone={m === settings.defaultModel ? "success" : "default"}>
                {m}
              </Pill>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Prompt configuration">
        <KeyValue
          label="System instructions"
          value={settings.systemInstructions ? "Configured" : "Not set"}
        />
        <KeyValue
          label="Safety instructions"
          value={settings.safetyInstructions ? "Configured" : "Not set"}
        />
        <KeyValue
          label="Prompt templates"
          value={`${settings.promptTemplates?.length ?? 0} template(s)`}
        />
        <KeyValue label="History retention" value={`${settings.clearHistoryPolicyDays} days`} />
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Models tab                                                          */
/* ------------------------------------------------------------------ */

function AiModelsTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState<AiSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await adminFetch<{ settings: AiSettingsData }>("/api/admin/ai-settings");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  function toggleModel(modelId: string) {
    if (!settings) return;
    const enabled = settings.enabledModels.includes(modelId);
    const next = enabled
      ? settings.enabledModels.filter((m) => m !== modelId)
      : [...settings.enabledModels, modelId];
    setSettings({ ...settings, enabledModels: next });
    setDirty(true);
  }

  function setDefault(modelId: string) {
    if (!settings) return;
    setSettings({ ...settings, defaultModel: modelId });
    setDirty(true);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await adminFetch("/api/admin/ai-settings", {
        method: "PATCH",
        body: JSON.stringify({
          enabledModels: settings.enabledModels,
          defaultModel: settings.defaultModel,
        }),
      });
      notify("success", "Model configuration saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Loading models…" />;

  return (
    <div className="space-y-3">
      {KNOWN_MODELS.map((model) => {
        const enabled = settings.enabledModels.includes(model.id);
        const isDefault = settings.defaultModel === model.id;
        const providerStatus = settings.providerStatus?.[model.provider];
        return (
          <SectionCard key={model.id} title={model.name}>
            <KeyValue label="Model ID" value={model.id} />
            <KeyValue label="Provider" value={model.provider} />
            <KeyValue label="Context limit" value={`${model.contextLimit} tokens`} />
            <KeyValue
              label="Provider status"
              value={
                <Pill
                  tone={
                    providerStatus === "configured"
                      ? "success"
                      : providerStatus === "invalid"
                        ? "danger"
                        : "warn"
                  }
                >
                  {providerStatus === "configured"
                    ? "Configured"
                    : providerStatus === "invalid"
                      ? "Invalid"
                      : "Not configured"}
                </Pill>
              }
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium active:bg-slate-50 ${
                  enabled ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"
                }`}
                onClick={() => toggleModel(model.id)}
              >
                {enabled ? "Enabled" : "Disabled"}
              </button>
              <button
                type="button"
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium ${
                  isDefault
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 text-slate-700 active:bg-slate-50"
                }`}
                onClick={() => {
                  if (!enabled) toggleModel(model.id);
                  setDefault(model.id);
                }}
              >
                {isDefault ? "Default" : "Set as default"}
              </button>
            </div>
          </SectionCard>
        );
      })}

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save model configuration
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Access tab                                                          */
/* ------------------------------------------------------------------ */

function AiAccessTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState<AiSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await adminFetch<{ settings: AiSettingsData }>("/api/admin/ai-settings");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  function patch(partial: Partial<AiSettingsData>) {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    setDirty(true);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await adminFetch("/api/admin/ai-settings", {
        method: "PATCH",
        body: JSON.stringify({
          communityAiAccess: settings.communityAiAccess,
          courseAiAccess: settings.courseAiAccess,
          courseContextEnabled: settings.courseContextEnabled,
          userContextEnabled: settings.userContextEnabled,
        }),
      });
      notify("success", "Access settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Loading access settings…" />;

  return (
    <div className="space-y-3">
      {[
        { key: "communityAiAccess" as const, label: "Community AI access" },
        { key: "courseAiAccess" as const, label: "Course AI Q&A access" },
        { key: "courseContextEnabled" as const, label: "Course/resource context in AI" },
        { key: "userContextEnabled" as const, label: "User profile AI context" },
      ].map(({ key, label }) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
        >
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <ToggleSwitch
            checked={!!settings[key]}
            onChange={(v) => patch({ [key]: v })}
          />
        </div>
      ))}

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save access settings
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt rules tab                                                    */
/* ------------------------------------------------------------------ */

function AiPromptsTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState<AiSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await adminFetch<{ settings: AiSettingsData }>("/api/admin/ai-settings");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  function patch(partial: Partial<AiSettingsData>) {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    setDirty(true);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await adminFetch("/api/admin/ai-settings", {
        method: "PATCH",
        body: JSON.stringify({
          systemInstructions: settings.systemInstructions,
          safetyInstructions: settings.safetyInstructions,
          promptTemplates: settings.promptTemplates,
        }),
      });
      notify("success", "Prompt rules saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Loading prompt rules…" />;

  return (
    <div className="space-y-3">
      <SectionCard title="Global system instruction">
        <Field label="System instruction for all AI interactions">
          <textarea
            className={textareaClass}
            value={settings.systemInstructions ?? ""}
            onChange={(e) => patch({ systemInstructions: e.target.value })}
            placeholder="You are a helpful learning assistant…"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Safety instructions">
        <Field label="Safety/refusal guardrails">
          <textarea
            className={textareaClass}
            value={settings.safetyInstructions ?? ""}
            onChange={(e) => patch({ safetyInstructions: e.target.value })}
            placeholder="Do not disclose personal information…"
          />
        </Field>
      </SectionCard>

      <SectionCard title="Prompt templates ({settings.promptTemplates?.length ?? 0})" description="Named reusable templates">
        {settings.promptTemplates?.map((tmpl, idx) => (
          <div key={idx} className="mb-3 rounded-lg border border-slate-200 p-3">
            <Field label="Template name">
              <input
                className={inputClass}
                value={tmpl.name}
                onChange={(e) => {
                  const next = [...(settings.promptTemplates ?? [])];
                  next[idx] = { ...next[idx], name: e.target.value };
                  patch({ promptTemplates: next });
                }}
              />
            </Field>
            <Field label="Template body">
              <textarea
                className={textareaClass}
                value={tmpl.template}
                onChange={(e) => {
                  const next = [...(settings.promptTemplates ?? [])];
                  next[idx] = { ...next[idx], template: e.target.value };
                  patch({ promptTemplates: next });
                }}
              />
            </Field>
            <button
              type="button"
              className="mt-1 text-xs text-red-600"
              onClick={() => {
                patch({
                  promptTemplates: (settings.promptTemplates ?? []).filter((_, i) => i !== idx),
                });
              }}
            >
              Remove template
            </button>
          </div>
        ))}
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-lg border border-dashed border-slate-300 px-3 text-xs font-medium text-slate-600 active:bg-slate-50"
          onClick={() =>
            patch({
              promptTemplates: [
                ...(settings.promptTemplates ?? []),
                { name: "New template", template: "" },
              ],
            })
          }
        >
          + Add template
        </button>
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save prompt rules
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Limits tab                                                          */
/* ------------------------------------------------------------------ */

function AiLimitsTab({
  confirm: _confirm,
  notify,
  setDirty,
}: {
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useToast>["notify"];
  setDirty: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState<AiSettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await adminFetch<{ settings: AiSettingsData }>("/api/admin/ai-settings");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  function patch(partial: Partial<AiSettingsData>) {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    setDirty(true);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await adminFetch("/api/admin/ai-settings", {
        method: "PATCH",
        body: JSON.stringify({
          dailyRequestLimit: settings.dailyRequestLimit,
          rateLimitPerMinute: settings.rateLimitPerMinute,
          contextTokenLimit: settings.contextTokenLimit,
          clearHistoryPolicyDays: settings.clearHistoryPolicyDays,
        }),
      });
      notify("success", "Limits saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Loading limits…" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Per-user daily requests">
          <input
            className={inputClass}
            type="number"
            value={settings.dailyRequestLimit}
            onChange={(e) => patch({ dailyRequestLimit: Number(e.target.value) })}
          />
        </Field>
        <Field label="Requests per minute">
          <input
            className={inputClass}
            type="number"
            value={settings.rateLimitPerMinute}
            onChange={(e) => patch({ rateLimitPerMinute: Number(e.target.value) })}
          />
        </Field>
        <Field label="Context token limit">
          <input
            className={inputClass}
            type="number"
            value={settings.contextTokenLimit}
            onChange={(e) => patch({ contextTokenLimit: Number(e.target.value) })}
          />
        </Field>
        <Field label="Chat retention (days)">
          <input
            className={inputClass}
            type="number"
            value={settings.clearHistoryPolicyDays}
            onChange={(e) =>
              patch({ clearHistoryPolicyDays: Number(e.target.value) })
            }
          />
        </Field>
      </div>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save limits
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Logs tab                                                            */
/* ------------------------------------------------------------------ */

function AiLogsTab() {
  const [_error, _setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <SectionCard title="AI request logs" description="Log data is sourced from provider dashboards and server-side instrumentation.">
        <EmptyState
          title="Logs from provider APIs"
          description="Detailed AI request logs (success/failure, latency, token usage) are available through your AI provider's monitoring dashboards. The admin panel surfaces configuration status only."
        />
      </SectionCard>

      <SectionCard title="Configuration audit">
        <p className="text-xs text-slate-500">
          All AI settings changes are recorded in the audit log. Use the audit log to track who modified AI configuration and when.
        </p>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle helper                                                       */
/* ------------------------------------------------------------------ */

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
        checked ? "bg-slate-900" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
