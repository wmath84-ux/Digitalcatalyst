"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { CloudinaryImageUploadField } from "@/components/admin/products/CloudinaryImageUploadField";
import { PrimaryButton, SectionCard } from "@/components/admin/ui";
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
};

export default function BrandingPage() {
  const branding = useBranding();
  const { notify } = useToast();
  const [draft, setDraft] = useState<BrandDraft>({
    logoUrl: branding.logoUrl,
    appName: branding.appName,
    tagline: branding.tagline,
    openingAnimationEnabled: branding.openingAnimationEnabled,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      logoUrl: branding.logoUrl,
      appName: branding.appName,
      tagline: branding.tagline,
      openingAnimationEnabled: branding.openingAnimationEnabled,
    });
  }, [branding.logoUrl, branding.appName, branding.tagline, branding.openingAnimationEnabled]);

  const update = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  async function persist(next: Partial<BrandDraft>) {
    const merged: BrandDraft = { ...draft, ...next };
    const logoUrl = merged.logoUrl.trim() || DEFAULT_BRANDING.logoUrl;
    const appName = merged.appName.trim() || DEFAULT_BRANDING.appName;
    const tagline = merged.tagline.trim();
    const openingAnimationEnabled = merged.openingAnimationEnabled === true;
    setSaving(true);
    try {
      await setDoc(
        doc(db, BRANDING_DOC_PATH.collection, BRANDING_DOC_PATH.id),
        { logoUrl, appName, tagline, openingAnimationEnabled, updatedAt: serverTimestamp() },
        { merge: true },
      );
      writeCachedBranding({ logoUrl, appName, tagline: tagline || DEFAULT_BRANDING.tagline, openingAnimationEnabled });
      notify("success", "Branding updated. It now applies live across the app and PWA.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save branding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pb-6">
      <SectionCard title="App branding">
        <p className="text-xs leading-relaxed text-slate-500">
          Set your app name, tagline and logo. They replace the Eduvora/Digital Catalyst defaults
          everywhere — landing header, home, loading splash, course player, auth, browser tab, push
          notifications, and the installed PWA name &amp; icon — as soon as you save.
        </p>

        <div className="mt-4 flex items-center gap-4">
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

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            App name
            <input
              value={draft.appName}
              maxLength={40}
              onChange={(e) => update("appName", e.target.value)}
              placeholder={DEFAULT_BRANDING.appName}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
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
            />
          </label>
        </div>

        <div className="mt-4">
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
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          Or paste a logo URL
          <input
            value={draft.logoUrl}
            onChange={(e) => update("logoUrl", e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
          />
        </label>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
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
        <div className="mt-3 flex gap-2">
          <PrimaryButton
            className="flex-1"
            loading={saving}
            onClick={() => void persist({})}
          >
            Save branding
          </PrimaryButton>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDraft({
                logoUrl: DEFAULT_BRANDING.logoUrl,
                appName: DEFAULT_BRANDING.appName,
                tagline: DEFAULT_BRANDING.tagline,
                openingAnimationEnabled: DEFAULT_BRANDING.openingAnimationEnabled,
              });
              void persist(DEFAULT_BRANDING);
            }}
            className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600"
          >
            Reset default
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
