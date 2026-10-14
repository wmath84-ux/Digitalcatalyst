"use client";

// src/components/ad/OpeningAdControl.tsx
//
// The `ad` control — the EduOS opening animation on tap — and the player it opens.
//
// Why it exists: the EduOS opening animation used to play on EVERY cold boot —
// a ten-second video in front of the app, every launch, for every learner.
// The owner asked for it to stop being automatic, to live behind a small `ad`
// control that plays it on tap, and for the "show it to everyone while the app
// opens" behaviour to become an admin switch
// (Branding → App behaviour → "Play the animation while the app opens").
//
// Where the control lives (2026-10-14): the faded `ad` label used to sit in
// every header strip. The owner then asked for it to leave the headers and
// become an OPTION IN THE SIDE PANEL instead — on every band:
//   · phone        → the header's quick-actions drawer (MobileHeaderMenu),
//   · tablet       → the compact Glass Sidebar rail (DesktopShell),
//   · desktop      → the wide left rail (DesktopShell).
// Those panels are data-driven item lists, so the player is exposed as a hook
// (`useOpeningAdPlayer`): a panel appends `OPENING_AD_ITEM` to its list while
// `available` is true, calls `openPlayer()` when it is picked, and renders
// `player` once. Only the landing page — which has no side panel — still shows
// the faded label, through the default `<OpeningAdControl />` export.
//
// The rules this module implements:
//   · nothing is fetched until the learner taps — the <video> is mounted, and
//     pointed at a URL, only while the player is open (the clip is ~5 MB);
//   · while the launch playback is ON the option hides itself, because the
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
// The player is rendered through a portal into <body>: the app headers and
// rails are `sticky` and `backdrop-blur`red, and a backdrop-filter makes such a
// strip a containing block for `position: fixed` children — an inline overlay
// would be trapped inside the strip instead of covering the screen.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Clapperboard } from "lucide-react";
import { useBranding } from "@/context/BrandingContext";
import { OPENING_CLIP_DURATION_MS, openingClipForWidth, openingClipSrcFor } from "@/utils/openingSplash";

/** The id every side panel switches on when its `Ad` row is picked. */
export const OPENING_AD_ITEM_ID = "opening-ad";

/**
 * The side-panel row, described once so the phone drawer, the tablet glass
 * rail and the desktop rail all paint the same option: the owner's own word
 * (`ad`) as the label, what it does as the description / accessible name.
 */
export const OPENING_AD_ITEM = {
  id: OPENING_AD_ITEM_ID,
  label: "Ad",
  description: "Watch the opening animation",
  ariaLabel: "Ad: watch the opening animation",
  /** Tinted-tile accent, distinct from every other quick action. */
  color: "#E879F9",
  Icon: Clapperboard,
} as const;

type PlayerStatus = "idle" | "loading" | "playing" | "ended" | "error";

/**
 * The opening-animation player as a hook.
 *
 * `available` — false when the admin turned the animation off or it already
 *               plays at launch; callers hide their row/label then.
 * `openPlayer` — resolve the clip for the current band and open the dialog.
 * `player`     — the portalled dialog (null while closed); render it once.
 */
export function useOpeningAdPlayer(): {
  available: boolean;
  openPlayer: () => void;
  player: ReactNode;
} {
  const branding = useBranding();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // The hidden cases: the admin turned the animation off, or it already plays
  // by itself while the app opens (so a tap control would be redundant).
  const available = !(branding.openingAnimationEnabled === false || branding.openingPlayOnLaunch);
  const isOpen = open && available;

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
    if (!available) return;
    if (typeof window !== "undefined") {
      setSrc(openingClipSrcFor(sources, openingClipForWidth(window.innerWidth)));
    }
    setStatus("loading");
    setOpen(true);
  }, [available, sources]);

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
    if (!isOpen) return undefined;
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
  }, [isOpen, closePlayer]);

  const player =
    isOpen && typeof document !== "undefined"
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
      : null;

  return { available, openPlayer, player };
}

/**
 * The faded `ad` label. The app shells no longer render it (their side panels
 * carry `OPENING_AD_ITEM` instead); the landing page keeps it because it has
 * no side panel to move the option into.
 */
export default function OpeningAdControl({ className = "" }: { className?: string }) {
  const { appName } = useBranding();
  const { available, openPlayer, player } = useOpeningAdPlayer();

  if (!available) return null;

  return (
    <>
      <button
        type="button"
        onClick={openPlayer}
        data-opening-ad
        aria-label={`Play the ${appName} opening animation`}
        title="Watch the opening animation"
        className={`shrink-0 select-none rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-current opacity-40 transition-opacity duration-200 hover:opacity-80 focus-visible:opacity-100 focus-visible:outline-none active:opacity-95 ${className}`}
      >
        ad
      </button>
      {player}
    </>
  );
}
