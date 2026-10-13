"use client";

// src/components/ad/OpeningAdControl.tsx
//
// The faded `ad` control in the app header, and the player it opens.
//
// Why it exists: the EduOS opening animation used to play on EVERY cold boot —
// a ten-second video in front of the app, every launch, for every learner.
// The owner asked for it to stop being automatic, to live behind a small faded
// `ad` label in the header that plays it on tap, and for the "show it to
// everyone while the app opens" behaviour to become an admin switch
// (Branding → App behaviour → "Play the animation while the app opens").
//
// The rules this component implements:
//   · nothing is fetched until the learner taps — the <video> is mounted, and
//     pointed at a URL, only while the player is open (the clip is ~5 MB);
//   · while the launch playback is ON the control hides itself, because the
//     animation already plays by itself (the reported requirement);
//   · turning the animation off entirely (Branding → App behaviour → first
//     switch) hides it too;
//   · the clip is whatever Branding points at — a GitHub release asset URL or
//     the bundled EduOS MP4 — resolved for this viewport band by the same
//     helper the launch animation uses (src/utils/openingSplash.ts), so the
//     control and the splash can never disagree;
//   · a clip that will not decode says so, with the URL, instead of showing a
//     silently black box (that is what a release PAGE link looks like).
//
// The player is rendered through a portal into <body>: the app headers are
// `sticky` and `backdrop-blur`red, and a backdrop-filter makes the header a
// containing block for `position: fixed` children — an inline overlay would be
// trapped inside the header strip instead of covering the screen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBranding } from "@/context/BrandingContext";
import { OPENING_CLIP_DURATION_MS, openingClipForWidth, openingClipSrcFor } from "@/utils/openingSplash";

export default function OpeningAdControl({ className = "" }: { className?: string }) {
  const branding = useBranding();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "ended" | "error">("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const sources = useMemo(
    () => ({
      any: branding.openingAnimationUrl,
      mobile: branding.openingAnimationUrlMobile,
      desktop: branding.openingAnimationUrlDesktop,
    }),
    [branding.openingAnimationUrl, branding.openingAnimationUrlMobile, branding.openingAnimationUrlDesktop],
  );

  const [src, setSrc] = useState(() =>
    typeof window === "undefined" ? "" : openingClipSrcFor(sources, openingClipForWidth(window.innerWidth)),
  );

  // Re-resolve the clip for the current band each time the player opens, so a
  // phone that was rotated (or a tablet in landscape) gets its own file.
  const openPlayer = useCallback(() => {
    if (typeof window !== "undefined") {
      setSrc(openingClipSrcFor(sources, openingClipForWidth(window.innerWidth)));
    }
    setStatus("loading");
    setOpen(true);
  }, [sources]);

  const closePlayer = useCallback(() => {
    setOpen(false);
    setStatus("idle");
    // Release the buffer: the element is unmounted below, and clearing `src`
    // here also stops the download on browsers that keep the request alive.
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
        video.removeAttribute("src");
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePlayer();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closePlayer]);

  // The hidden cases: the admin turned the animation off, or it already plays
  // by itself while the app opens (so a tap control would be redundant).
  if (branding.openingAnimationEnabled === false || branding.openingPlayOnLaunch) return null;

  return (
    <>
      <button
        type="button"
        onClick={openPlayer}
        data-opening-ad
        aria-label={`Play the ${branding.appName} opening animation`}
        title="Watch the opening animation"
        className={`shrink-0 select-none rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-current opacity-40 transition-opacity duration-200 hover:opacity-80 focus-visible:opacity-100 focus-visible:outline-none active:opacity-95 ${className}`}
      >
        ad
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              data-opening-ad-player
              role="dialog"
              aria-modal="true"
              aria-label={`${branding.appName} opening animation`}
              className="fixed inset-0 z-[2147482000] flex flex-col items-center justify-center gap-3 bg-black/80 p-4 backdrop-blur-md"
              onClick={(event) => {
                if (event.target === event.currentTarget) closePlayer();
              }}
            >
              <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl">
                <video
                  ref={videoRef}
                  // Only mounted while open: no request, no decode, no cache
                  // entry until the learner actually taps `ad`.
                  src={src}
                  className="block max-h-[70dvh] w-full bg-black object-contain"
                  controls
                  autoPlay
                  playsInline
                  preload="auto"
                  onPlaying={() => setStatus("playing")}
                  onEnded={() => setStatus("ended")}
                  onError={() => setStatus("error")}
                />
              </div>

              <div className="flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 text-white">
                <p className="text-xs font-semibold opacity-80">
                  {branding.appName} · opening animation
                  <span className="ml-2 font-normal opacity-60">
                    {status === "error"
                      ? "this clip could not be played"
                      : `~${Math.round(OPENING_CLIP_DURATION_MS / 1000)}s`}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const video = videoRef.current;
                      if (!video) return;
                      video.currentTime = 0;
                      void video.play().catch(() => setStatus("error"));
                    }}
                    className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold text-white active:bg-white/20"
                  >
                    ↻ Replay
                  </button>
                  <button
                    type="button"
                    onClick={closePlayer}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-900 active:bg-slate-200"
                  >
                    Close ✕
                  </button>
                </div>
              </div>

              {status === "error" ? (
                <p className="w-full max-w-3xl break-all rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-100">
                  The animation URL could not be played on this device:
                  <br />
                  <code className="opacity-90">{src}</code>
                  <br />
                  Use the DIRECT asset link of a release (<code>…/releases/download/&lt;tag&gt;/&lt;file&gt;.mp4</code>) —
                  a release page URL (<code>…/releases/tag/…</code>) returns HTML, not a video.
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
