"use client";

// Admin · App Branding.
//
// The previous design was a single 60-row vertical form with every
// setting under one big "App branding" card. On a phone that meant
// the admin had to scroll past the logo upload to reach the
// gradient pickers, then past those to reach the support contact.
//
// The redesign uses the same drill-down pattern as the Curriculum
// Builder / Modules editor: a horizontal pill rail at the top
// shows every setting section as a tab. Picking a section reveals
// only that section's settings; everything else collapses. The
// Save / Reset row is always at the bottom of the page (sticky
// on mobile) so the admin can save from any section without
// scrolling.
//
// The five sections:
//   • Identity    — app name + tagline
//   • Logo        — logo image (upload + URL)
//   • Gradient    — the home page header gradient (two colours)
//   • Behaviour   — opening animation + border lines
//   • Support     — support email + phone
//
// All the existing strings the rest of the app expects (and the
// contract tests grep for) are preserved: hideFrameBorders,
// openingAnimationEnabled, data-home-gradient-preview,
// data-branding-support-email, data-branding-support-phone, the
// DEFAULT_BRANDING shape, the Firestore doc path, the "Reset
// default" button, the "Save branding" button, the
// `persist({ hideFrameBorders: checked })` shortcut, and the
// Cloudinary upload with folder="branding".

import { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { CloudinaryImageUploadField } from "@/components/admin/products/CloudinaryImageUploadField";
import { PrimaryButton, SecondaryButton } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { useBranding } from "@/context/BrandingContext";
import {
  BRANDING_DOC_PATH,
  DEFAULT_BRANDING,
  writeCachedBranding,
} from "@/utils/branding";

type BrandDraft = {
  logoUrl: string;
  appName: string;
  tagline: string;
  openingAnimationEnabled: boolean;
  hideFrameBorders: boolean;
  homeGradientFrom: string;
  homeGradientTo: string;
  supportEmail: string;
  supportPhone: string;
};

type SectionKey =
  | "identity"
  | "logo"
  | "gradient"
  | "behaviour"
  | "support";

interface SectionDef {
  key: SectionKey;
  label: string;
  /** Short, one-line description shown when the section is focused. */
  description: string;
  icon: string;
  /** How many fields this section owns (shown as a chip on the pill). */
  fieldCount: number;
}

const SECTIONS: SectionDef[] = [
  { key: "identity", label: "Identity", description: "App name + tagline shown across the app, the landing page, and notifications.", icon: "🪪", fieldCount: 2 },
  { key: "logo", label: "Logo", description: "Square PNG / JPG that becomes the installed PWA icon, splash logo and notification avatar.", icon: "🖼️", fieldCount: 1 },
  { key: "gradient", label: "Home gradient", description: "Background gradient behind the home greeting and search bar.", icon: "🎨", fieldCount: 2 },
  { key: "behaviour", label: "App behaviour", description: "App opening animation and the thin top / bottom border lines.", icon: "✨", fieldCount: 2 },
  { key: "support", label: "Support", description: "Contact details shown in the subscription help overlay.", icon: "📞", fieldCount: 2 },
];

const pickHex = (value: unknown, fallback: string) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  // Expand shorthand #rgb so it also feeds the <input type="color">.
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }
  return fallback;
};

export default function BrandingPage() {
  const branding = useBranding();
  const { notify } = useToast();
  const [draft, setDraft] = useState<BrandDraft>({
    logoUrl: branding.logoUrl,
    appName: branding.appName,
    tagline: branding.tagline,
    openingAnimationEnabled: branding.openingAnimationEnabled,
    hideFrameBorders: branding.hideFrameBorders,
    homeGradientFrom: branding.homeGradientFrom,
    homeGradientTo: branding.homeGradientTo,
    supportEmail: branding.supportEmail,
    supportPhone: branding.supportPhone,
  });
  const [saving, setSaving] = useState(false);
  // Which section is currently in focus. null = no section (the
  // pill rail is the only thing on screen). Default to the first
  // section so the page never lands on a blank state.
  const [activeSection, setActiveSection] = useState<SectionKey | null>("identity");

  useEffect(() => {
    setDraft({
      logoUrl: branding.logoUrl,
      appName: branding.appName,
      tagline: branding.tagline,
      openingAnimationEnabled: branding.openingAnimationEnabled,
      hideFrameBorders: branding.hideFrameBorders,
      homeGradientFrom: branding.homeGradientFrom,
      homeGradientTo: branding.homeGradientTo,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
    });
  }, [
    branding.logoUrl,
    branding.appName,
    branding.tagline,
    branding.openingAnimationEnabled,
    branding.hideFrameBorders,
    branding.homeGradientFrom,
    branding.homeGradientTo,
    branding.supportEmail,
    branding.supportPhone,
  ]);

  const update = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // The colour preview works even while the admin is typing, but a half-typed
  // hex must never be persisted — `normalizeBranding` on the client falls
  // back to the icon colours, and here the same guard keeps the doc clean.
  const previewFrom = pickHex(draft.homeGradientFrom, DEFAULT_BRANDING.homeGradientFrom);
  const previewTo = pickHex(draft.homeGradientTo, DEFAULT_BRANDING.homeGradientTo);

  async function persist(next: Partial<BrandDraft>) {
    const merged: BrandDraft = { ...draft, ...next };
    const logoUrl = merged.logoUrl.trim() || DEFAULT_BRANDING.logoUrl;
    const appName = merged.appName.trim() || DEFAULT_BRANDING.appName;
    const tagline = merged.tagline.trim();
    const openingAnimationEnabled = merged.openingAnimationEnabled === true;
    const hideFrameBorders = merged.hideFrameBorders !== false;
    const homeGradientFrom = pickHex(merged.homeGradientFrom, DEFAULT_BRANDING.homeGradientFrom);
    const homeGradientTo = pickHex(merged.homeGradientTo, DEFAULT_BRANDING.homeGradientTo);
    const supportEmail = merged.supportEmail.trim() || DEFAULT_BRANDING.supportEmail;
    const supportPhone = merged.supportPhone.trim() || DEFAULT_BRANDING.supportPhone;
    setSaving(true);
    try {
      await setDoc(
        doc(db, BRANDING_DOC_PATH.collection, BRANDING_DOC_PATH.id),
        { logoUrl, appName, tagline, openingAnimationEnabled, hideFrameBorders, homeGradientFrom, homeGradientTo, supportEmail, supportPhone, updatedAt: serverTimestamp() },
        { merge: true },
      );
      writeCachedBranding({ logoUrl, appName, tagline: tagline || DEFAULT_BRANDING.tagline, openingAnimationEnabled, hideFrameBorders, homeGradientFrom, homeGradientTo, supportEmail, supportPhone });
      notify("success", "Branding updated. It now applies live across the app and PWA.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save branding.");
    } finally {
      setSaving(false);
    }
  }

  const activeSectionDef = useMemo(
    () => SECTIONS.find((section) => section.key === activeSection) ?? null,
    [activeSection],
  );

  return (
    <div className="space-y-3 pb-6 lg:space-y-4" data-branding-page>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">App branding</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Pick a section below — only that section's settings show. Branding applies live to the landing
          page, home, loading splash, course player, auth, browser tab, the in-app notification list,
          every system/push notification, and the installed PWA name &amp; icon, as soon as you save.
        </p>
      </div>

      {/* ── Section pill rail (mobile-first) ── */}
      <div
        data-branding-section-rail
        className="rounded-2xl border border-slate-200 bg-white px-2 py-2"
      >
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Sections
          </span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
            {SECTIONS.length} total
          </span>
        </div>
        <div
          className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1.5 pb-1 pt-0.5"
          data-branding-section-rail-scroll
        >
          {SECTIONS.map((section) => {
            const active = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(active ? null : section.key)}
                aria-pressed={active}
                data-branding-section-pill
                data-branding-section-key={section.key}
                data-branding-section-active={active ? "true" : "false"}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 active:bg-slate-100"
                }`}
              >
                <span aria-hidden>{section.icon}</span>
                <span>{section.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {section.fieldCount}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Focused section card ── */}
      {activeSectionDef ? (
        <div
          data-branding-section-card
          data-branding-section-card-key={activeSectionDef.key}
          className="space-y-3 rounded-xl border border-indigo-300 bg-white p-3 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-base text-white">
                {activeSectionDef.icon}
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">{activeSectionDef.label}</p>
                <p className="text-[11px] text-slate-500">{activeSectionDef.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveSection(null)}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 active:bg-slate-200"
              aria-label="Close section"
            >
              Close ✕
            </button>
          </div>

          {activeSectionDef.key === "identity" ? (
            <div className="mt-1 space-y-3">
              {/* Live preview — the brand block the rest of the app sees. */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                  {draft.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={draft.logoUrl} alt={draft.appName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-black">{draft.appName.charAt(0).toUpperCase() || "E"}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{draft.appName || DEFAULT_BRANDING.appName}</p>
                  <p className="truncate text-[11px] text-slate-500">{draft.tagline || DEFAULT_BRANDING.tagline}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-600">
                  App name
                  <input
                    value={draft.appName}
                    maxLength={40}
                    onChange={(e) => update("appName", e.target.value)}
                    placeholder={DEFAULT_BRANDING.appName}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                    data-branding-app-name
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Tagline
                  <input
                    value={draft.tagline}
                    maxLength={60}
                    onChange={(e) => update("tagline", e.target.value)}
                    placeholder={DEFAULT_BRANDING.tagline}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                    data-branding-tagline
                  />
                </label>
              </div>
            </div>
          ) : null}

          {activeSectionDef.key === "logo" ? (
            <div className="mt-1 space-y-3">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.logoUrl || DEFAULT_BRANDING.logoUrl}
                  alt={draft.appName || DEFAULT_BRANDING.appName}
                  className="h-20 w-20 rounded-2xl border border-slate-200 object-cover bg-white shadow-sm"
                />
                <div className="min-w-0 text-xs text-slate-500">
                  <p className="font-semibold text-slate-800">{draft.appName || DEFAULT_BRANDING.appName}</p>
                  <p className="mt-0.5 text-slate-400">{draft.tagline || DEFAULT_BRANDING.tagline}</p>
                  <p className="mt-1 break-all">{draft.logoUrl || DEFAULT_BRANDING.logoUrl}</p>
                </div>
              </div>

              <CloudinaryImageUploadField
                folder="branding"
                tags={["branding", "logo"]}
                label="Upload logo image"
                hint="PNG or JPG works best. Square 512×512 images look cleanest as the app/PWA icon."
                onUploaded={(url) => {
                  update("logoUrl", url);
                  void persist({ logoUrl: url });
                }}
              />
              <label className="block text-xs font-semibold text-slate-600">
                Or paste a logo URL
                <input
                  value={draft.logoUrl}
                  onChange={(e) => update("logoUrl", e.target.value)}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                />
              </label>
            </div>
          ) : null}

          {activeSectionDef.key === "gradient" ? (
            <div className="mt-1 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs font-bold text-slate-700">Home page header gradient</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  The gradient behind the home page greeting &amp; search bar. By default it uses the web
                  app icon's own colours — it changes immediately for every user after you save.
                </p>
                <div
                  className="mt-3 overflow-hidden rounded-xl px-4 py-3 text-white shadow-sm"
                  style={{ backgroundImage: `linear-gradient(to bottom right, ${previewFrom}, ${previewTo})` }}
                  data-home-gradient-preview
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">Good to see you 👋</p>
                  <p className="mt-0.5 truncate text-sm font-bold tracking-tight">Hello, Learner</p>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="text-xs font-semibold text-slate-600">
                    Gradient start colour
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={previewFrom}
                        onChange={(e) => update("homeGradientFrom", e.target.value)}
                        className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
                        aria-label="Pick gradient start colour"
                      />
                      <input
                        value={draft.homeGradientFrom}
                        maxLength={7}
                        onChange={(e) => update("homeGradientFrom", e.target.value)}
                        placeholder={DEFAULT_BRANDING.homeGradientFrom}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs font-normal uppercase text-slate-800"
                        aria-label="Gradient start colour hex code"
                      />
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    Gradient end colour
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={previewTo}
                        onChange={(e) => update("homeGradientTo", e.target.value)}
                        className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5"
                        aria-label="Pick gradient end colour"
                      />
                      <input
                        value={draft.homeGradientTo}
                        maxLength={7}
                        onChange={(e) => update("homeGradientTo", e.target.value)}
                        placeholder={DEFAULT_BRANDING.homeGradientTo}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs font-normal uppercase text-slate-800"
                        aria-label="Gradient end colour hex code"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeSectionDef.key === "behaviour" ? (
            <div className="mt-1 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.openingAnimationEnabled}
                    onChange={(e) => update("openingAnimationEnabled", e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-700">App opening animation page</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                      Show the branded animated splash screen while the app opens. This is off by default.
                    </span>
                  </span>
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.hideFrameBorders}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      update("hideFrameBorders", checked);
                      void persist({ hideFrameBorders: checked });
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-700">Hide top &amp; bottom border lines</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                      Hides the thin horizontal lines drawn between the status bar and the app at the top,
                      and between the app and the bottom navigation bar. This is hidden by default — turn
                      it off to show the lines again. This switch is applied and saved immediately.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          {activeSectionDef.key === "support" ? (
            <div className="mt-1 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs font-bold text-slate-700">Support contact</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  Shown in the subscription page's Help &amp; FAQ overlay ("Still need help?" section) so
                  learners reach the right email and phone instead of placeholder defaults.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    Support email
                    <input
                      value={draft.supportEmail}
                      maxLength={120}
                      onChange={(e) => update("supportEmail", e.target.value)}
                      placeholder={DEFAULT_BRANDING.supportEmail}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                      data-branding-support-email
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-600">
                    Support phone / hours
                    <input
                      value={draft.supportPhone}
                      maxLength={160}
                      onChange={(e) => update("supportPhone", e.target.value)}
                      placeholder={DEFAULT_BRANDING.supportPhone}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                      data-branding-support-phone
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Pick a section above to edit its settings.
        </p>
      )}

      {/* Save bar — always visible so the admin can save from any
          section without scrolling. */}
      <div className="sticky bottom-0 z-10 -mx-3 mt-3 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.18)] backdrop-blur">
        <PrimaryButton
          className="flex-1"
          loading={saving}
          onClick={() => void persist({})}
        >
          Save branding
        </PrimaryButton>
        <SecondaryButton
          className="!h-11"
          onClick={() => {
            setDraft({
              logoUrl: DEFAULT_BRANDING.logoUrl,
              appName: DEFAULT_BRANDING.appName,
              tagline: DEFAULT_BRANDING.tagline,
              openingAnimationEnabled: DEFAULT_BRANDING.openingAnimationEnabled,
              hideFrameBorders: DEFAULT_BRANDING.hideFrameBorders,
              homeGradientFrom: DEFAULT_BRANDING.homeGradientFrom,
              homeGradientTo: DEFAULT_BRANDING.homeGradientTo,
              supportEmail: DEFAULT_BRANDING.supportEmail,
              supportPhone: DEFAULT_BRANDING.supportPhone,
            });
            void persist(DEFAULT_BRANDING);
          }}
        >
          Reset default
        </SecondaryButton>
      </div>
    </div>
  );
}
