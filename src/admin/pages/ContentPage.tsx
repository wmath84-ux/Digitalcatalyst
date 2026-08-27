"use client";

import { useEffect, useState } from "react";
import { Field, LoadingState, PrimaryButton, SectionCard, inputClass } from "@/components/admin/ui";
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
  /**
   * Personal-copy feature (Drive `files.copy`): every student gets their
   * OWN copy of the master file in their OWN Google Drive. Needs the
   * public OAuth Client ID; each Google family has its own enable switch.
   */
  drivePersonalCopy?: {
    clientId?: string;
    byType?: Partial<Record<"doc" | "sheet" | "slides" | "drive", boolean>>;
  };
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
          drivePersonalCopy: settings?.drivePersonalCopy ?? { clientId: "", byType: {} },
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

  /** Personal-copy feature — every copyable Google family gets a switch. */
  const personalCopyTypes: Array<{ key: "doc" | "sheet" | "slides" | "drive"; label: string; hint: string }> = [
    { key: "doc", label: "Google Docs", hint: "Student edits their own document copy" },
    { key: "sheet", label: "Google Sheets", hint: "Student edits their own spreadsheet copy" },
    { key: "slides", label: "Google Slides", hint: "Student edits their own presentation copy" },
    { key: "drive", label: "Drive files (PDF & others)", hint: "Student gets the file copied into their Drive" },
  ];

  const personalCopyOn = (key: "doc" | "sheet" | "slides" | "drive"): boolean =>
    settings?.drivePersonalCopy?.byType?.[key] === true;

  const setPersonalCopy = (key: "doc" | "sheet" | "slides" | "drive", value: boolean) =>
    patch({
      drivePersonalCopy: {
        ...(settings?.drivePersonalCopy ?? {}),
        byType: { ...(settings?.drivePersonalCopy?.byType ?? {}), [key]: value },
      },
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

      <SectionCard title="Personal copies (Google Drive)">
        <p className="text-xs text-slate-500">
          Give every student their <strong>own private copy</strong> of a Google file, cloned into the
          student&apos;s own Google Drive with one tap. The student owns the copy — they can always edit it,
          and the master file stays untouched. Works per file type below.
        </p>
        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <span className="font-bold text-slate-600">Setup:</span> paste your Google OAuth <strong>Client ID</strong> (Web application)
          below — from Google Cloud Console → APIs &amp; Services → Credentials. The Drive API must be enabled in the same
          project, and your site&apos;s domain added to the client&apos;s <em>Authorized JavaScript origins</em>. The client
          <em> secret</em> is <strong>not</strong> needed (browser token flow). Masters only need
          &ldquo;Anyone with the link → Viewer&rdquo; sharing. Google Forms are excluded — copying a form would hand the
          student your form <em>builder</em>, not a fillable form.
        </div>
        <Field label="Google OAuth Client ID" hint="Leave blank to use the VITE_GOOGLE_CLIENT_ID the app already uses for Google sign-in">
          <input
            className={inputClass}
            placeholder="1234567890-abc123.apps.googleusercontent.com"
            value={settings.drivePersonalCopy?.clientId ?? ""}
            data-admin-drive-client-id
            onChange={(e) =>
              patch({
                drivePersonalCopy: { ...(settings.drivePersonalCopy ?? {}), clientId: e.target.value },
              })
            }
          />
        </Field>
        <div className="mt-3 space-y-2" data-admin-personal-copy>
          {personalCopyTypes.map((type) => {
            const enabled = personalCopyOn(type.key);
            return (
              <button
                key={type.key}
                type="button"
                onClick={() => setPersonalCopy(type.key, !enabled)}
                data-personal-copy-type={type.key}
                aria-pressed={enabled}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                  enabled ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span>
                  <span className={`block text-sm font-bold ${enabled ? "text-emerald-900" : "text-slate-800"}`}>{type.label}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{type.hint}</span>
                </span>
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                  aria-hidden="true"
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <PrimaryButton className="w-full" loading={saving} onClick={save}>
        Save course player settings
      </PrimaryButton>
    </div>
  );
}
