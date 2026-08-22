"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { CloudinaryImageUploadField } from "@/components/admin/products/CloudinaryImageUploadField";
import { PrimaryButton, SectionCard } from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
import { useBranding } from "@/context/BrandingContext";
import { BRANDING_DOC_PATH, DEFAULT_LOGO_URL, writeCachedLogoUrl } from "@/utils/branding";

export default function BrandingPage() {
  const { logoUrl } = useBranding();
  const { notify } = useToast();
  const [draft, setDraft] = useState(logoUrl);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(logoUrl);
  }, [logoUrl]);

  async function persist(nextUrl: string) {
    setSaving(true);
    try {
      await setDoc(
        doc(db, BRANDING_DOC_PATH.collection, BRANDING_DOC_PATH.id),
        { logoUrl: nextUrl, updatedAt: serverTimestamp() },
        { merge: true },
      );
      writeCachedLogoUrl(nextUrl === DEFAULT_LOGO_URL ? null : nextUrl);
      notify("success", "Brand logo updated. It now applies live across the app.");
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
          Upload one image. It replaces the logo everywhere it appears — landing header, home, loading splash,
          course player, auth, PWA/browser icon, and other brand marks — as soon as you save.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <img
            src={draft || DEFAULT_LOGO_URL}
            alt="Current brand logo"
            className="h-20 w-20 rounded-2xl border border-slate-200 object-cover bg-white shadow-sm"
          />
          <div className="min-w-0 text-xs text-slate-500">
            <p className="font-semibold text-slate-800">Live preview</p>
            <p className="mt-1 break-all">{draft || DEFAULT_LOGO_URL}</p>
          </div>
        </div>
        <div className="mt-4">
          <CloudinaryImageUploadField
            folder="branding"
            tags={["branding", "logo"]}
            label="Upload logo image"
            hint="PNG or JPG works best. Square images look cleanest as the app icon."
            onUploaded={(url) => {
              setDraft(url);
              void persist(url);
            }}
          />
        </div>
        <label className="mt-3 block text-xs font-semibold text-slate-600">
          Or paste an image URL
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800"
          />
        </label>
        <div className="mt-3 flex gap-2">
          <PrimaryButton className="flex-1" loading={saving} onClick={() => void persist(draft.trim() || DEFAULT_LOGO_URL)}>
            Save branding
          </PrimaryButton>
          <button
            type="button"
            disabled={saving}
            onClick={() => void persist(DEFAULT_LOGO_URL)}
            className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600"
          >
            Reset default
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
