// src/classroom3d/WallActivity.tsx
//
// Only the wall being looked at should do expensive work (Part 13).
//
// Every wall wraps its DOM in this gate, fed by the room's `focus` state.
// An inactive wall keeps its SAME mounted instance — no unmount, so video
// positions, note drafts, mind-map state and Firestore listeners are all
// preserved — but:
//
//   · rendering is skipped (`content-visibility: hidden` keeps the laid-out
//     box, so re-activation never reflows; paint, layout and style of the
//     whole subtree are skipped, including iframes), and pointer input is
//     cut, so hover/focus work can't fire off-screen either;
//   · <video>/<audio> elements are paused imperatively and resumed on return.
//     pause() never seeks, so playback resumes at the exact frame — the same
//     "inactive never keeps playing" contract ResourceViewer's own `active`
//     prop already enforces between files in flat mode. (There is NO
//     keep-playing-while-looking-away feature to preserve: the flat player
//     pauses video AND audio on file switch, and the room matches it on
//     focus switch. Audio is deliberately paused too — see AUDIO below.)
//   · YouTube embeds are paused via postMessage (`pauseVideo`). This works
//     because ResourceViewer creates its players with `enablejsapi: 1`; any
//     other iframe ignores the message, and a detached frame throws into
//     the void — every call is guarded, so the gate can never crash the room.
//
// ── AUDIO ─────────────────────────────────────────────────────────────────
// Pausing audio on look-away is a deliberate product choice, matching flat
// mode: switching files pauses the outgoing lesson's audio there, and
// switching walls pauses it here. If the owner ever wants background audio
// while writing notes, gate ONLY the visual work: delete the audio branch
// below (keep `video`), and the lesson will keep playing sound-only behind
// the notes wall.

import { useEffect, useRef, type ReactNode } from "react";

const YOUTUBE_HOSTS = ["www.youtube-nocookie.com", "www.youtube.com"];

const youTubeCommand = (frame: HTMLIFrameElement, func: "pauseVideo" | "playVideo"): void => {
  try {
    const src = frame.getAttribute("src") || "";
    if (!YOUTUBE_HOSTS.some((host) => src.includes(host))) return;
    frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: "" }), "*");
  } catch {
    /* cross-origin quirks / detached frame — the message is best-effort */
  }
};

export default function WallActivity({
  active,
  wall,
  children,
}: {
  /** True while the learner faces this wall (board counts fullscreen as active). */
  active: boolean;
  /** Which wall this gate guards — also the DOM hook for visibility gating. */
  wall: "board" | "notes" | "mind" | "desk";
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Elements that were playing when the wall went inactive — the only ones
  // ever resumed, so a video the learner paused themselves stays paused.
  const pausedMedia = useRef<Array<HTMLVideoElement | HTMLAudioElement>>([]);
  const pausedFrames = useRef<HTMLIFrameElement[]>([]);

  // Runs ONLY on active edges (focus changes), never per frame.
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    if (!active) {
      pausedMedia.current = [];
      container.querySelectorAll("video, audio").forEach((element) => {
        const media = element as HTMLVideoElement | HTMLAudioElement;
        if (media.paused || media.ended) return;
        pausedMedia.current.push(media);
        try {
          media.pause();
        } catch {
          /* element already gone */
        }
      });
      pausedFrames.current = [];
      container.querySelectorAll("iframe").forEach((frame) => {
        const src = frame.getAttribute("src") || "";
        if (!YOUTUBE_HOSTS.some((host) => src.includes(host))) return;
        pausedFrames.current.push(frame);
        youTubeCommand(frame, "pauseVideo");
      });
      return;
    }
    for (const media of pausedMedia.current) {
      if (!media.isConnected) continue;
      try {
        void media.play()?.catch?.(() => undefined);
      } catch {
        /* autoplay policy / detached — the learner taps play instead */
      }
    }
    pausedMedia.current = [];
    for (const frame of pausedFrames.current) {
      if (frame.isConnected) youTubeCommand(frame, "playVideo");
    }
    pausedFrames.current = [];
  }, [active]);

  return (
    <div
      ref={root}
      data-classroom-wall={wall}
      data-wall-active={active ? "true" : "false"}
      className="h-full w-full min-h-0 min-w-0"
      style={{
        contentVisibility: active ? "visible" : "hidden",
        pointerEvents: active ? "auto" : "none",
      }}
    >
      {children}
    </div>
  );
}
