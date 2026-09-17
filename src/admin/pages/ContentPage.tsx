"use client";

import { useEffect, useState } from "react";
import { LoadingState, PrimaryButton, SectionCard } from "@/components/admin/ui";
import { useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ContentSettings = {
  /**
   * Google editor access inside the Course Player:
   *   "off"     — learners only see the read-only preview.
   *   "toolbar" — Edit opens the compact Google editor (full formatting
   *               toolbar, Google header hidden). Default.
   *   "full"    — Edit opens the complete docs.google.com page (title,
   *               menu bar, toolbar, side tabs, comments — everything).
   * Legacy single switch — kept as the inherited default for any type
   * without its own entry in `docsEditorAccessByType`.
   */
  docsEditorAccess?: "off" | "toolbar" | "full";
  /**
   * Per-type overrides: Docs, Sheets and Slides each get their own
   * off/toolbar/full switch. Forms and PDFs have no learner-facing
   * editor endpoint, so no switch exists for them.
   */
  docsEditorAccessByType?: Partial<Record<"doc" | "sheet" | "slides", "off" | "toolbar" | "full">>;
  /** Personal access is handled by the email-only server gate, not learner OAuth. */
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AppContentPage() {
  const { notify } = useToast();
  const { setDirty } = useUnsavedGuard();

  const [settings, setSettings] = useState<ContentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await adminFetch<{ settings: ContentSettings }>("/api/admin/content");
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content settings.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  function patch(partial: Partial<ContentSettings>) {
    if (!settings) return;
    setSettings({ ...settings, ...partial });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/content", {
        method: "PATCH",
        body: JSON.stringify({
          docsEditorAccess: settings?.docsEditorAccess ?? "full",
          docsEditorAccessByType: settings?.docsEditorAccessByType ?? {},
        }),
      });
      notify("success", "Course player settings saved.");
      setDirty(false);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const docsEditorOptions: Array<{ value: "off" | "toolbar" | "full"; label: string; hint: string }> = [
    { value: "off", label: "Preview only", hint: "Learners never see the Edit button — files of this type stay read-only." },
    { value: "toolbar", label: "Toolbar editor", hint: "Edit opens Google's compact editor: the complete formatting toolbar, but the Google header (title, File/Edit/View menus, Share) stays hidden." },
    { value: "full", label: "Full Google page", hint: "Edit opens the complete Google page — title, whole menu bar, toolbar, side panels, comments, Share. Everything." },
  ];

  /** The Google families that actually have a learner-facing editor. */
  const editorTypes: Array<{ key: "doc" | "sheet" | "slides"; label: string; hint: string }> = [
    { key: "doc", label: "Google Docs", hint: "Documents — full editor available" },
    { key: "sheet", label: "Google Sheets", hint: "Spreadsheets — full editor available" },
    { key: "slides", label: "Google Slides", hint: "Presentations — full editor available" },
  ];

  const accessForType = (key: "doc" | "sheet" | "slides"): "off" | "toolbar" | "full" =>
    settings?.docsEditorAccessByType?.[key] ?? settings?.docsEditorAccess ?? "full";

  const setAccessForType = (key: "doc" | "sheet" | "slides", value: "off" | "toolbar" | "full") =>
    patch({
      docsEditorAccessByType: { ...(settings?.docsEditorAccessByType ?? {}), [key]: value },
    });

  const setAccessForAll = (value: "off" | "toolbar" | "full") =>
    patch({
      docsEditorAccess: value,
      docsEditorAccessByType: { doc: value, sheet: value, slides: value },
    });

  if (error) return <SectionCard title="Course Player"><p className="text-sm text-red-500">{error}</p></SectionCard>;
  if (!settings) return <LoadingState label="Loading content settings…" />;

  return (
    <div className="space-y-3 pb-6 lg:space-y-4">
      <SectionCard title="Google file editing">
        <p className="text-xs text-slate-500">
          Choose what learners get when they open each kind of Google file inside the Course Player — every type has its own switch.
          Editing always requires the file to be shared with edit permission (e.g. “Anyone with the link → Editor”).
        </p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <span className="font-bold text-slate-600">No switch for other types:</span> Google Forms have no learner editor
          (their /edit page is your form <em>builder</em>; learners fill the embedded form, which already works), and
          PDFs / Drive files have no editor at all — they always show the preview with download.
        </div>

        {/* Quick apply-to-all row */}
        <div className="mt-3 flex flex-wrap items-center gap-2" data-admin-docs-editor-all>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Set all:</span>
          {docsEditorOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccessForAll(option.value)}
              data-docs-editor-all-option={option.value}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-violet-300 hover:text-violet-700"
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Per-type switches */}
        <div className="mt-3 space-y-3" data-admin-docs-editor-access>
          {editorTypes.map((type) => {
            const current = accessForType(type.key);
            return (
              <div key={type.key} className="rounded-xl border border-slate-200 bg-white p-3" data-docs-editor-type={type.key}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-800">{type.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">{type.hint}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {docsEditorOptions.map((option) => {
                    const selected = current === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAccessForType(type.key, option.value)}
                        data-docs-editor-option={`${type.key}:${option.value}`}
                        aria-pressed={selected}
                        title={option.hint}
                        className={`rounded-lg border px-2 py-2 text-center text-[11px] font-bold transition ${
                          selected
                            ? "border-violet-400 bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {docsEditorOptions.find((option) => option.value === current)?.hint}
                </p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Personal access — email gate">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-900">
          <span className="font-black">Learner OAuth is disabled.</span> The Course Player uses <strong>Gate personal access</strong>: the learner enters an email, confirms the request, and the authenticated server/owner-controlled Apps Script prepares and shares the course file. No Google Drive permission, OAuth client ID or learner access token is requested.
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Configure the automation outside this page with <code>GATE_APPS_SCRIPT_URL</code> (recommended) or the server-side gate settings. Keep the Apps Script/Drive authorization separate from the main learner OAuth client. See the public <a className="font-bold text-violet-700 underline" href="/privacy-policy.html#google-data" target="_blank" rel="noreferrer">Google user data policy</a> for the data flow.
        </p>
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save course player settings
      </PrimaryButton>
    </div>
  );
}
