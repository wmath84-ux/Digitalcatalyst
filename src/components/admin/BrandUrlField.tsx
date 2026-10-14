"use client";

// src/components/admin/BrandUrlField.tsx
//
// A URL field for the admin Branding page that PROVES the link works before it
// is saved. The owner's requirement was "main direct admin panel se branding
// page se git release URL add karo aur vahi dikhe" — and the single most common
// mistake with a GitHub release is pasting the release PAGE
// (`…/releases/tag/<tag>`) instead of the asset (`…
// /releases/download/<tag>/<file>`). That URL looks perfectly fine in a text
// box and then plays nothing, so the field tests it the way the app will use
// it:
//
//   · image — an <img> probe, reporting the real pixel size (so a 1600×900
//     photo logo is visibly "not square" before it becomes an app icon);
//   · video — a <video preload="metadata"> probe. Deliberately no network
//     pre-flight: GitHub release assets do not send CORS headers, and playback
//     does not need them, so a fetch-based probe would reject a URL that plays
//     perfectly.
//
// The probe is advisory. It never blocks saving, because a slow network must
// not stop the admin from saving a URL they know is right.

import { useEffect, useRef, useState } from "react";
import { classifyReleaseUrl } from "@/utils/releaseUrl";

type ProbeStatus = "idle" | "checking" | "ok" | "error" | "warn";

export type BrandUrlProbe = { status: ProbeStatus; detail: string };

export default function BrandUrlField({
  label,
  value,
  onChange,
  kind,
  placeholder,
  hint,
  dataAttr,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  kind: "image" | "video" | "any";
  placeholder?: string;
  hint?: string;
  dataAttr?: string;
}) {
  const [probe, setProbe] = useState<BrandUrlProbe>({ status: "idle", detail: "" });
  const [nonce, setNonce] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    const text = value.trim();
    if (!text) {
      setProbe({ status: "idle", detail: "" });
      return undefined;
    }
    if (!/^https:\/\//i.test(text)) {
      setProbe({ status: "error", detail: "Not an https:// link" });
      return undefined;
    }
    setProbe({ status: "checking", detail: "Checking…" });
    let done = false;
    // Debounced so the probe does not fire while the URL is still being typed.
    const timer = window.setTimeout(() => {
      if (kind === "video") {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        const ok = () => {
          if (done) return;
          done = true;
          setProbe({
            status: "ok",
            detail: `Plays${video.duration ? ` · ${video.duration.toFixed(1)}s` : ""}${video.videoWidth ? ` · ${video.videoWidth}×${video.videoHeight}` : ""}`,
          });
        };
        const fail = () => {
          if (done) return;
          done = true;
          setProbe({ status: "error", detail: "This URL did not load as a video (HTML page or blocked file?)" });
        };
        video.addEventListener("loadedmetadata", ok);
        video.addEventListener("error", fail);
        video.src = text;
        cleanupRef.current = () => {
          done = true;
          video.removeAttribute("src");
          video.load();
        };
        return;
      }
      const image = new Image();
      image.onload = () => {
        if (done) return;
        done = true;
        const square = Math.abs(image.naturalWidth - image.naturalHeight) <= Math.max(2, image.naturalWidth * 0.02);
        setProbe({
          status: image.naturalWidth < 192 ? "warn" : "ok",
          detail:
            `${image.naturalWidth}×${image.naturalHeight}px · ${square ? "square ✓" : "not square — it is centred on a square canvas"}` +
            (image.naturalWidth < 192 ? " · smaller than 192px, the icon will look soft" : ""),
        });
      };
      image.onerror = () => {
        if (done) return;
        done = true;
        setProbe({ status: "error", detail: "This URL did not load as an image" });
      };
      image.src = text;
      cleanupRef.current = () => {
        done = true;
        image.src = "";
      };
    }, 600);
    return () => {
      window.clearTimeout(timer);
    };
    // `nonce` re-runs the probe when the admin taps "Test again".
  }, [value, kind, nonce]);

  const release = classifyReleaseUrl(value, kind);
  const tone =
    release.warning || probe.status === "error"
      ? "text-amber-600"
      : probe.status === "warn"
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <label className="block text-xs font-semibold text-slate-600" data-brand-url-field={dataAttr}>
      {label}
      <div className="mt-1 flex items-start gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-[11px] font-normal text-slate-800"
          data-brand-url-input={dataAttr}
        />
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          disabled={!value.trim()}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-700 active:bg-slate-100 disabled:opacity-40"
        >
          Test
        </button>
      </div>
      {hint ? <span className="mt-1 block text-[11px] font-normal leading-relaxed text-slate-500">{hint}</span> : null}
      {release.warning ? (
        <span className="mt-1 block text-[11px] font-bold leading-relaxed text-amber-600" data-brand-url-warning={dataAttr}>
          ⚠ {release.warning}
        </span>
      ) : value.trim() && probe.detail ? (
        <span className={`mt-1 block text-[11px] font-bold ${tone}`} data-brand-url-probe={dataAttr}>
          {probe.status === "checking" ? "⏳ " : probe.status === "error" ? "✕ " : "✓ "}
          {probe.detail}
        </span>
      ) : null}
    </label>
  );
}
