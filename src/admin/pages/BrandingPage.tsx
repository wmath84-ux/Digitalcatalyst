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

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { db } from "../../../firebase";
import { CloudinaryImageUploadField } from "@/components/admin/products/CloudinaryImageUploadField";
import { PrimaryButton, SecondaryButton } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { useBranding } from "@/context/BrandingContext";
import { attachOpeningSplash } from "@/utils/openingSplash";
import { SocialPlatformIcon } from "@/components/ui/SocialPlatformIcon";
import SocialProfileCard from "@/home/components/SocialProfileCard";
import {
  MAX_SOCIAL_LINKS,
  POPULAR_SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LIST,
  createSocialLink,
  detectSocialPlatform,
  normalizeSocialLinks,
  resolveSocialLinks,
  sanitizeSocialUrl,
  socialUrlHost,
  type SocialLink,
} from "@/utils/socialPlatform";
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
  /** Every linked social account, in the order the card shows them. */
  socialLinks: SocialLink[];
};

type SectionKey =
  | "identity"
  | "social"
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
  { key: "social", label: "Social profile", description: "The profile card at the bottom of the Home page: link every social account you want — each URL adds its own brand icon, tooltip and link to the card.", icon: "🔗", fieldCount: 0 },
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
    socialLinks: branding.socialLinks,
  });
  const [saving, setSaving] = useState(false);
  // Which section is currently in focus. null = no section (the
  // pill rail is the only thing on screen). Default to the first
  // section so the page never lands on a blank state.
  const [activeSection, setActiveSection] = useState<SectionKey | null>("identity");
  // Content signature of the saved social list — the re-seed effect below
  // watches this instead of the array identity.
  const socialSignature = useMemo(() => JSON.stringify(branding.socialLinks), [branding.socialLinks]);

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
      socialLinks: branding.socialLinks,
    });
    // The social list is compared by CONTENT (a Firestore snapshot always
    // carries a fresh array identity — re-seeding on identity would throw
    // away whatever the admin is typing in a row).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    socialSignature,
  ]);

  const update = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /* ---------------------------------------------------------------- */
  /* Social accounts (Branding → Social profile)                        */
  /* ---------------------------------------------------------------- */

  /** Row URL inputs, so a freshly added row is focused immediately. */
  const socialUrlInputs = useRef(new Map<string, HTMLInputElement | null>());
  const focusSocialUrl = (id: string) => {
    requestAnimationFrame(() => socialUrlInputs.current.get(id)?.focus());
  };

  /** What the Home page card will actually render for the current draft. */
  const resolvedSocialLinks = useMemo(
    () => resolveSocialLinks(draft.socialLinks),
    [draft.socialLinks],
  );
  const resolvedByUrl = useMemo(
    () => new Map(resolvedSocialLinks.map((link) => [link.url, link])),
    [resolvedSocialLinks],
  );
  /** URLs typed more than once — the card only ever shows the first. */
  const duplicateUrls = useMemo(() => {
    const seen = new Map<string, number>();
    for (const link of draft.socialLinks) {
      const clean = sanitizeSocialUrl(link.url);
      if (!clean) continue;
      const key = clean.toLowerCase().replace(/\/+$/, "");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(seen.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [draft.socialLinks]);

  const addSocialLink = (platformId = "") => {
    if (draft.socialLinks.length >= MAX_SOCIAL_LINKS) {
      notify("error", `The card carries up to ${MAX_SOCIAL_LINKS} accounts — remove one first.`);
      return;
    }
    const link = createSocialLink({ platform: platformId });
    setDraft((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, link] }));
    setActiveSection("social");
    focusSocialUrl(link.id);
  };

  const updateSocialLink = (id: string, patch: Partial<SocialLink>) =>
    setDraft((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    }));

  const removeSocialLink = (id: string) =>
    setDraft((prev) => ({ ...prev, socialLinks: prev.socialLinks.filter((link) => link.id !== id) }));

  const moveSocialLink = (id: string, direction: -1 | 1) =>
    setDraft((prev) => {
      const list = [...prev.socialLinks];
      const from = list.findIndex((link) => link.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= list.length) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...prev, socialLinks: list };
    });

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
    // Fail open: only an explicit unchecked box turns the opening off. The old
    // `=== true` coercion wrote `false` for any save where the draft value was
    // still undefined (a branding save from another section, a stale cache),
    // which silenced the opening on desktop AND mobile with nothing in the UI
    // to explain it.
    const openingAnimationEnabled = merged.openingAnimationEnabled !== false;
    const hideFrameBorders = merged.hideFrameBorders !== false;
    const homeGradientFrom = pickHex(merged.homeGradientFrom, DEFAULT_BRANDING.homeGradientFrom);
    const homeGradientTo = pickHex(merged.homeGradientTo, DEFAULT_BRANDING.homeGradientTo);
    const supportEmail = merged.supportEmail.trim() || DEFAULT_BRANDING.supportEmail;
    const supportPhone = merged.supportPhone.trim() || DEFAULT_BRANDING.supportPhone;
    // Every linked account is stored verbatim (no domain guessing); rows
    // whose URL is empty or unusable drop out here so the Home page card can
    // never render a dead icon. `socialUrl` stays in the doc as a mirror of
    // the first account for older readers.
    const socialLinks = normalizeSocialLinks(merged.socialLinks);
    const socialUrl = socialLinks[0]?.url ?? "";
    const skippedLinks = merged.socialLinks.filter((link) => link.url.trim() !== "").length - socialLinks.length;
    setSaving(true);
    try {
      await setDoc(
        doc(db, BRANDING_DOC_PATH.collection, BRANDING_DOC_PATH.id),
        { logoUrl, appName, tagline, openingAnimationEnabled, hideFrameBorders, homeGradientFrom, homeGradientTo, socialLinks, socialUrl, supportEmail, supportPhone, updatedAt: serverTimestamp() },
        { merge: true },
      );
      writeCachedBranding({ logoUrl, appName, tagline: tagline || DEFAULT_BRANDING.tagline, openingAnimationEnabled, hideFrameBorders, homeGradientFrom, homeGradientTo, supportEmail, supportPhone, socialLinks, socialUrl });
      // Show the admin exactly what was stored (dropped rows disappear).
      setDraft((prev) => ({ ...prev, socialLinks }));
      if (skippedLinks > 0) {
        notify(
          "error",
          `Saved, but ${skippedLinks} social row${skippedLinks === 1 ? "" : "s"} were skipped — use a full address such as https://instagram.com/yourbrand, and no duplicates.`,
        );
      } else {
        notify("success", "Branding updated. It now applies live across the app and PWA.");
      }
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
                  {/* The social pill counts the icons the card will show. */}
                  {section.key === "social" ? resolvedSocialLinks.length : section.fieldCount}
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

          {activeSectionDef.key === "social" ? (
            <div className="mt-1 space-y-3" data-branding-social-card>
              {/* ── Live preview — the exact Home page card, fed by this
                  page's draft values (logo/name/bio from Identity & Logo,
                  one icon per linked account from below). ── */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700">Home page social card preview</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      The card at the very bottom of the Home page — a 1:1 port of the Uiverse
                      “grumpy-ape-40” profile card (teal card, circular logo, name + bio, divider,
                      brand icons with tooltips). Logo, name and bio come from Identity &amp; Logo;
                      every account linked below becomes one icon in the row under the divider.
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white"
                    data-branding-social-link-count
                  >
                    {resolvedSocialLinks.length} icon{resolvedSocialLinks.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div
                  className="mt-3 flex justify-center rounded-xl bg-slate-100/90 p-4 pb-7"
                  data-branding-social-card-preview
                >
                  <SocialProfileCard
                    logoUrl={draft.logoUrl || DEFAULT_BRANDING.logoUrl}
                    name={draft.appName || DEFAULT_BRANDING.appName}
                    bio={draft.tagline}
                    socialLinks={draft.socialLinks}
                    preview
                  />
                </div>
                <p className="mt-1 text-center text-[10px] text-slate-400">
                  Hover an icon to see its tooltip, exactly like a learner does on the Home page.
                </p>
              </div>

              {/* ── Linked accounts — one row per social media account ── */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3" data-branding-social-links>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-700">Linked social media accounts</p>
                  <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {draft.socialLinks.length}/{MAX_SOCIAL_LINKS}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                  One row per account. The icon is picked from the URL's domain automatically (you can
                  also pin one), every icon links straight to that URL, and its name shows in the
                  card's tooltip. The order here is the order on the card.
                </p>

                {draft.socialLinks.length === 0 ? (
                  <div
                    className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center"
                    data-branding-social-empty
                  >
                    <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-teal-50 text-lg text-[#12897a]">
                      🔗
                    </span>
                    <p className="mt-2 text-xs font-bold text-slate-700">No social account linked yet</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      The card shows only the logo, name and tagline. Add your first account below —
                      its brand icon appears in the preview above at once, and on the Home page as
                      soon as you save.
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 space-y-2.5">
                  {draft.socialLinks.map((link, index) => {
                    const clean = sanitizeSocialUrl(link.url);
                    const resolved = clean ? resolvedByUrl.get(clean) : undefined;
                    const pinned = SOCIAL_PLATFORM_LIST.find((platform) => platform.id === link.platform) ?? null;
                    const detected = detectSocialPlatform(link.url);
                    const shown = resolved?.platform ?? pinned ?? detected;
                    const invalid = link.url.trim() !== "" && !clean;
                    const duplicate = clean ? duplicateUrls.has(clean.toLowerCase().replace(/\/+$/, "")) : false;
                    return (
                      <div
                        key={link.id}
                        data-branding-social-link-row
                        data-branding-social-link-id={link.id}
                        data-branding-social-link-platform-id={shown.id}
                        className={`rounded-2xl border bg-white p-3 ${
                          invalid ? "border-rose-300" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#2cb5a0] text-white"
                            data-branding-social-link-icon
                          >
                            <SocialPlatformIcon platform={shown} size={15} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-black text-slate-800">
                              {index === 0 ? "Account 1 · primary" : `Account ${index + 1}`}
                            </p>
                            <p className="truncate text-[10px] leading-tight text-slate-500">
                              {clean
                                ? `${shown.label}${socialUrlHost(clean) ? ` · ${socialUrlHost(clean)}` : ""}`
                                : "Waiting for a URL"}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveSocialLink(link.id, -1)}
                              disabled={index === 0}
                              aria-label={`Move ${shown.label || "account"} up`}
                              data-branding-social-link-up
                              className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 active:bg-slate-100"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSocialLink(link.id, 1)}
                              disabled={index === draft.socialLinks.length - 1}
                              aria-label={`Move ${shown.label || "account"} down`}
                              data-branding-social-link-down
                              className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-30 active:bg-slate-100"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSocialLink(link.id)}
                              aria-label={`Remove ${shown.label || "account"} link`}
                              data-branding-social-link-remove
                              className="grid h-7 w-7 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 active:bg-rose-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <label className="mt-2.5 block text-[11px] font-semibold text-slate-600">
                          Profile URL
                          <input
                            ref={(el) => {
                              if (el) socialUrlInputs.current.set(link.id, el);
                              else socialUrlInputs.current.delete(link.id);
                            }}
                            value={link.url}
                            onChange={(e) => updateSocialLink(link.id, { url: e.target.value })}
                            placeholder={(pinned ?? detected).template}
                            inputMode="url"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
                            data-branding-social-link-url
                            {...(index === 0 ? { "data-branding-social-url": "" } : {})}
                          />
                        </label>

                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Icon / platform
                            <select
                              value={link.platform}
                              onChange={(e) => updateSocialLink(link.id, { platform: e.target.value })}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal text-slate-800"
                              data-branding-social-link-platform
                            >
                              <option value="">Auto-detect from the URL</option>
                              {SOCIAL_PLATFORM_LIST.map((platform) => (
                                <option key={platform.id} value={platform.id}>
                                  {platform.id === "generic" ? "Website (plain globe)" : platform.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Tooltip text (optional)
                            <input
                              value={link.label}
                              maxLength={40}
                              onChange={(e) => updateSocialLink(link.id, { label: e.target.value })}
                              placeholder={shown.label}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-800"
                              data-branding-social-link-label
                            />
                          </label>
                        </div>

                        {invalid ? (
                          <p
                            className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-semibold leading-relaxed text-rose-600"
                            data-branding-social-link-error
                          >
                            This row will be skipped — use a full address such as{" "}
                            <span className="font-mono">https://instagram.com/yourbrand</span> (a bare
                            domain like <span className="font-mono">instagram.com/yourbrand</span> is
                            fine too), or <span className="font-mono">mailto:</span> /{" "}
                            <span className="font-mono">tel:</span>.
                          </p>
                        ) : null}

                        {!invalid && duplicate ? (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold leading-relaxed text-amber-700">
                            This URL is already linked in another row — the card shows it only once.
                          </p>
                        ) : null}

                        {!invalid && clean ? (
                          <div
                            className="mt-2 flex flex-wrap items-center gap-2"
                            data-branding-social-platform-preview
                          >
                            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                              Card shows the{" "}
                              <span className="font-bold text-slate-700">{shown.label}</span> icon
                              {link.label ? (
                                <>
                                  {" "}
                                  tooltip “<span className="font-bold text-slate-700">{link.label}</span>”
                                </>
                              ) : null}{" "}
                              → opens this account
                            </span>
                            <a
                              href={clean}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 active:bg-slate-100"
                              data-branding-social-link-open
                            >
                              Test link <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* ── Add another account: quick-add rail + custom row ── */}
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Add an account
                  </p>
                  <div
                    className="scrollbar-hide -mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1"
                    data-branding-social-quick-add
                  >
                    {POPULAR_SOCIAL_PLATFORMS.map((platform) => (
                      <button
                        key={platform.id}
                        type="button"
                        onClick={() => addSocialLink(platform.id)}
                        disabled={draft.socialLinks.length >= MAX_SOCIAL_LINKS}
                        data-branding-social-quick-add-pill
                        data-social-platform={platform.id}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-40 active:bg-slate-100"
                      >
                        <SocialPlatformIcon platform={platform} size={12} />
                        <span>{platform.label}</span>
                        <Plus className="h-3 w-3 text-slate-400" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSocialLink()}
                      disabled={draft.socialLinks.length >= MAX_SOCIAL_LINKS}
                      data-branding-social-link-add
                      className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-indigo-300 bg-indigo-50/60 px-3 py-1.5 text-[11px] font-bold text-indigo-700 disabled:opacity-40 active:bg-indigo-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Any other URL</span>
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                    Any profile URL works — Instagram, YouTube, WhatsApp, Facebook, X, Telegram,
                    LinkedIn, TikTok, Discord, Snapchat, Reddit, Threads, Pinterest, GitHub, Bluesky,
                    Mastodon, Medium, Twitch, Spotify, Linktree, the App Store, Google Play and more.
                    An unrecognised domain still gets an icon (a globe with the domain as its tooltip)
                    and still links correctly; a <span className="font-mono">mailto:</span> address or{" "}
                    <span className="font-mono">tel:</span> number gets the email / phone icon. Up to{" "}
                    {MAX_SOCIAL_LINKS} accounts.
                  </p>
                </div>
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
                      Play the EduOS opening animation while the app opens. Phones use the mobile clip; tablet and
                      desktop use the landscape clip. This is on by default. A device whose OS asks for reduced motion
                      gets the static brand card instead of the clip (it is never skipped entirely).
                    </span>
                  </span>
                </label>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      // Replay the real overlay, from this page, without a
                      // reload — the opening is otherwise only visible on a
                      // cold boot, which made every report unverifiable.
                      attachOpeningSplash()?.replay();
                    }}
                    className="rounded-xl bg-[#0B63FF] px-3 py-2 text-[11px] font-bold text-white"
                  >
                    ▶ Preview the opening now
                  </button>
                  <a
                    href="#/dev/opening"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700"
                  >
                    Diagnostics (clips + decision)
                  </a>
                  <span className="text-[11px] text-slate-500">
                    Save first — the preview plays what this browser currently has cached. Append{" "}
                    <code>?opening=debug</code> to see the reason in the corner.
                  </span>
                </div>
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
              // Reset unlinks every social account — the Home page card goes
              // back to its clean non-clickable state.
              socialLinks: DEFAULT_BRANDING.socialLinks,
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
