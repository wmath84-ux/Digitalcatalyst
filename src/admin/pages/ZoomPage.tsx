"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { LoadingState, PrimaryButton, SectionCard } from "@/components/admin/ui";
import { useToast, useUnsavedGuard } from "@/components/admin/AdminProviders";
import { useAppZoom } from "@/context/AppZoomContext";
import {
  APP_ZOOM_DOC_PATH,
  DEFAULT_APP_ZOOM,
  MAX_APP_ZOOM,
  MIN_APP_ZOOM,
  normalizeAppZoom,
  writeCachedAppZoom,
} from "@/utils/appZoom";

export default function ZoomPage() {
  const appZoom = useAppZoom();
  const { notify } = useToast();
  const { setDirty } = useUnsavedGuard();
  const [draft, setDraft] = useState<number>(appZoom.zoom);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(appZoom.zoom);
  }, [appZoom.zoom]);

  const normalized = normalizeAppZoom(draft);

  function update(value: number) {
    setDraft(value);
    setDirty(true);
  }

  async function persist(value: number) {
    const zoom = normalizeAppZoom(value);
    setSaving(true);
    try {
      await setDoc(
        doc(db, APP_ZOOM_DOC_PATH.collection, APP_ZOOM_DOC_PATH.id),
        { zoom, updatedAt: serverTimestamp() },
        { merge: true },
      );
      writeCachedAppZoom({ zoom });
      setDraft(zoom);
      setDirty(false);
      notify("success", `Default zoom saved at ${zoom}%. Users are locked to this zoom.`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not save zoom setting.");
    } finally {
      setSaving(false);
    }
  }

  if (appZoom.loading) {
    return <LoadingState label="Loading zoom setting…" />;
  }

  return (
    <div className="space-y-3 pb-6">
      <SectionCard title="Default app zoom">
        <p className="text-xs leading-relaxed text-slate-500">
          Set the zoom level every learner sees when they open the app. The default is{" "}
          <strong className="text-slate-700">110%</strong>. Users cannot zoom in or out by any
          means — pinch, trackpad, keyboard shortcuts and the viewport are all locked to this exact
          value. Only an admin change here moves the zoom.
        </p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-center" data-default-zoom-preview>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">App zoom</p>
          <p className="mt-1 text-4xl font-black tabular-nums text-slate-900" data-default-zoom-value>
            {normalized}%
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {normalized === DEFAULT_APP_ZOOM
              ? "Default (110%) — recommended."
              : `Custom ${normalized}% — applied the moment you save.`}
          </p>
        </div>

        <div className="mt-4" data-default-zoom-slider>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>{MIN_APP_ZOOM}%</span>
            <span className="text-slate-400">Zoom lock range</span>
            <span>{MAX_APP_ZOOM}%</span>
          </div>
          <input
            type="range"
            min={MIN_APP_ZOOM}
            max={MAX_APP_ZOOM}
            step={1}
            value={normalized}
            onChange={(e) => update(Number(e.target.value))}
            aria-label="Default app zoom percentage"
            className="mt-2 w-full accent-violet-600"
          />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="block text-xs font-semibold text-slate-600">
            Zoom percentage
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={MIN_APP_ZOOM}
                max={MAX_APP_ZOOM}
                value={draft}
                onChange={(e) => update(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800"
                aria-label="Default app zoom percentage"
                data-default-zoom-input
              />
              <span className="text-sm font-bold text-slate-500">%</span>
            </div>
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => update(DEFAULT_APP_ZOOM)}
            className="self-end rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 active:bg-slate-100"
            data-default-zoom-reset-input
          >
            Default
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          <strong>Locked everywhere:</strong> the app blocks pinch zoom, Ctrl/Cmd +/−, Ctrl/Cmd + 0,
          double-tap zoom and browser viewport scaling. Embedded Course Player documents keep the same
          lock. Use this page to customize the default instead.
        </div>

        <div className="mt-4 flex gap-2">
          <PrimaryButton
            className="flex-1"
            loading={saving}
            disabled={normalized === appZoom.zoom}
            onClick={() => void persist(normalized)}
          >
            Save zoom
          </PrimaryButton>
          <button
            type="button"
            disabled={saving || normalized === DEFAULT_APP_ZOOM}
            onClick={() => {
              setDraft(DEFAULT_APP_ZOOM);
              void persist(DEFAULT_APP_ZOOM);
            }}
            className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 disabled:opacity-40"
          >
            Reset default
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
