// src/course/ResourceViewer.tsx
//
// Part 11 — Course Player resource viewer. Renders the
// currently selected CourseFile (lesson / resource) in the
// right pane. Supports every type in `CourseFileType`:
//
//   - YouTube           — no-cookie IFrame API embed, resumable.
//   - Direct video      — native <video> with controls.
//   - Direct audio      — native <audio> with controls.
//   - Drive             — drive.google.com preview.
//   - PDF               — drive preview or direct iframe.
//   - Google Doc        — /document/d/<id>/preview (exportable).
//   - Google Sheet      — /spreadsheets/d/<id>/preview.
//   - Google Slides     — /presentation/d/<id>/embed.
//   - Google Form       — /forms/.../viewform?embedded=true.
//   - Image             — ImageViewer (pinch + wheel + drag).
//   - Mind map (Whimsical) — whimsical.com/embed/<id>.
//   - Generic HTTPS embed — sandboxed iframe.
//
// ── Continue where you left off (EVERY file type) ───────────────────────
// The Course Player keeps each opened file mounted and marks exactly one as
// `active`. When a file stops being active (the learner switched module):
//
//   · YouTube  → the IFrame API `pauseVideo()` stops it instantly and the
//                current time is stored; coming back seeks to that second.
//   · Video    → the <video> is paused and `currentTime` stored/restored.
//   · Audio    → the AudioPlayer pauses and stores/restores its position.
//   · Image    → zoom + pan are stored and restored.
//   · Docs / PDF / Sheets / Slides / Forms / mind maps / embeds → the same
//     live iframe is simply hidden, so the remote document keeps its own
//     page, scroll and zoom without any reload.
//
// The viewer shows a "Loading…" indicator while the iframe
// boots, a "Preview unavailable" panel when the embed URL
// is missing or unreachable, and a "Try original" link that
// opens the source in a new tab as a fallback.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileQuestion, Maximize2, RefreshCw } from "lucide-react";
import type { CourseFile } from "../types/course";
import ImageViewer from "./ImageViewer";
import AudioPlayer from "./AudioPlayer";
import { getCourseDownload, getCourseEmbed } from "../utils/courseEmbed";
import { resumePosition, type CoursePlaybackPatch, type CoursePlaybackStore } from "./playbackState";

const SUPPORTED_KINDS = new Set([
  "youtube",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "form",
  "drive",
  "mindmap",
  "embed",
  "direct",
  "none",
]);

interface ResourceViewerProps {
  file: CourseFile | null;
  /**
   * False while the file is mounted but hidden behind another module. An
   * inactive viewer must never keep playing — it pauses and remembers where
   * it stopped.
   */
  active?: boolean;
  /** Saved resume state for every file in this course. */
  playback?: CoursePlaybackStore;
  /** Report a new position / zoom / scroll for this file. */
  onPlaybackChange?: (fileId: string, patch: CoursePlaybackPatch) => void;
}

export default function ResourceViewer({ file, active = true, playback, onPlaybackChange }: ResourceViewerProps) {
  // No file selected — show the empty state.
  if (!file) {
    return (
      <div className="grid h-full min-h-[280px] place-items-center course-viewer-empty-surface bg-[var(--course-bg)] p-8 text-center text-[var(--course-text)]">
        <div data-course-viewer-empty>
          <FileQuestion className="mx-auto h-12 w-12 text-[var(--course-muted)]" />
          <p className="mt-4 font-black">Choose a lesson or resource</p>
          <p className="mt-1 text-sm text-[var(--course-muted)]">Your course content will open here without leaving the app.</p>
        </div>
      </div>
    );
  }

  const embed = getCourseEmbed(file);
  const download = getCourseDownload(file);
  const isSupported = SUPPORTED_KINDS.has(embed.kind);
  const isImage = file.type === "image" && embed.kind === "direct";
  const isVideo = file.type === "video" && embed.kind === "direct";
  const isAudio = file.type === "audio" && embed.kind === "direct";
  // YouTube's iframe fills the available stage. YouTube still letterboxes the
  // video itself, while its settings / quality menus get enough vertical room
  // to render every option and can be dismissed by tapping the player surface.
  const isCinematic = isVideo || embed.kind === "youtube";
  const entry = playback?.[file.id];
  const report = (patch: CoursePlaybackPatch) => onPlaybackChange?.(file.id, patch);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--course-bg)] text-[var(--course-text)]" data-course-viewer data-file-id={file.id} data-embed-kind={embed.kind} data-active={active ? "true" : "false"}>
      <ViewerHeader file={file} embed={embed} download={download} />
      <div className={`relative min-h-0 flex-1 overflow-hidden ${isCinematic ? "bg-black p-0" : "bg-[var(--course-bg)]"}`}>
        {isImage ? (
          <ImageViewer
            url={embed.url}
            name={file.name}
            initialScale={entry?.scale}
            initialOffset={typeof entry?.offsetX === "number" ? { x: entry.offsetX, y: Number(entry.offsetY || 0) } : undefined}
            onViewChange={(scale, offset) => report({ scale, offsetX: offset.x, offsetY: offset.y })}
          />
        ) : isVideo ? (
          <div className="h-full w-full overflow-hidden bg-black">
            <DirectVideo
              url={embed.url}
              active={active}
              resumeAt={resumePosition(entry)}
              onProgress={(position, duration) => report({ position, duration })}
            />
          </div>
        ) : isAudio ? (
          <AudioPlayer
            url={embed.url}
            name={file.name}
            active={active}
            resumeAt={resumePosition(entry)}
            onProgress={(position, duration) => report({ position, duration })}
          />
        ) : !embed.url ? (
          <MissingEmbedState file={file} download={download} />
        ) : isCinematic ? (
          <div className="course-youtube-stage relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-black" data-course-youtube-stage={embed.kind === "youtube" ? "contained" : undefined}>
            {embed.kind === "youtube" ? (
              <YouTubeFrame
                url={embed.url}
                title={file.name}
                active={active}
                resumeAt={resumePosition(entry)}
                onProgress={(position, duration) => report({ position, duration })}
              />
            ) : (
              <EmbedFrame url={embed.url} title={file.name} kind={embed.kind} supported={isSupported} />
            )}
          </div>
        ) : (
          <EmbedFrame url={embed.url} title={file.name} kind={embed.kind} supported={isSupported} />
        )}
      </div>
    </div>
  );
}

// ─── Direct <video> — pauses on module switch, resumes on return ───────────
function DirectVideo({ url, active, resumeAt, onProgress }: { url: string; active: boolean; resumeAt: number; onProgress: (position: number, duration: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeRef = useRef(resumeAt);
  const applied = useRef(false);

  const seekToResume = () => {
    const video = videoRef.current;
    if (!video || applied.current) return;
    if (resumeRef.current > 0 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(resumeRef.current, Math.max(0, video.duration - 1));
    }
    applied.current = true;
  };

  // Leaving the module stops playback immediately and banks the position.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || active) return;
    onProgress(video.currentTime || 0, video.duration || 0);
    video.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <video
      ref={videoRef}
      src={url}
      controls
      playsInline
      preload="metadata"
      controlsList="nodownload"
      className="h-full w-full bg-black object-contain"
      data-course-viewer-video
      onLoadedMetadata={seekToResume}
      onTimeUpdate={(event) => onProgress(event.currentTarget.currentTime, event.currentTarget.duration || 0)}
      onPause={(event) => onProgress(event.currentTarget.currentTime, event.currentTarget.duration || 0)}
    />
  );
}

// ─── YouTube — IFrame API so we can pause + seek programmatically ──────────
interface YouTubePlayer {
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

type YouTubeApiWindow = Window & {
  YT?: { Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer; loaded?: number };
  onYouTubeIframeAPIReady?: () => void;
};

/** Load https://www.youtube.com/iframe_api once and share the promise. */
let youtubeApiPromise: Promise<YouTubeApiWindow["YT"]> | null = null;
const loadYouTubeApi = (): Promise<YouTubeApiWindow["YT"]> => {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  const scope = window as YouTubeApiWindow;
  if (scope.YT?.Player) return Promise.resolve(scope.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const previous = scope.onYouTubeIframeAPIReady;
    scope.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(scope.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => resolve(undefined);
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
};

function YouTubeFrame({ url, title, active, resumeAt, onProgress }: { url: string; title: string; active: boolean; resumeAt: number; onProgress: (position: number, duration: number) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiFailed, setApiFailed] = useState(false);
  const resumeRef = useRef(resumeAt);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const videoId = (() => {
    const match = url.match(/\/embed\/([^?/#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  })();

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    if (!videoId) return undefined;

    void loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const host = hostRef.current;
      if (!YT?.Player || !host) { setApiFailed(true); setLoading(false); return; }
      playerRef.current = new YT.Player(host, {
        videoId,
        // `start` resumes at the stored second even before the API is polled,
        // so the very first frame is already the right one.
        playerVars: {
          rel: 0, modestbranding: 1, playsinline: 1, controls: 1, fs: 1,
          start: Math.floor(resumeRef.current) || 0,
          origin: window.location.origin,
        },
        host: "https://www.youtube-nocookie.com",
        events: {
          onReady: () => { if (!cancelled) setLoading(false); },
          onError: () => { if (!cancelled) { setApiFailed(true); setLoading(false); } },
        },
      });
      // Bank the position every second so an abrupt exit loses at most 1s.
      poll = setInterval(() => {
        const player = playerRef.current;
        if (!player?.getCurrentTime) return;
        try {
          progressRef.current(player.getCurrentTime() || 0, player.getDuration() || 0);
        } catch { /* player not ready yet */ }
      }, 1000);
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      try { playerRef.current?.destroy(); } catch { /* already gone */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Switching module pauses the video where it is — it must never keep
  // playing behind another lesson.
  useEffect(() => {
    if (active) return;
    const player = playerRef.current;
    if (!player) return;
    try {
      progressRef.current(player.getCurrentTime() || 0, player.getDuration() || 0);
      player.pauseVideo();
    } catch { /* player torn down */ }
  }, [active]);

  // No IFrame API available (offline / blocked) — fall back to the plain
  // embed, still resuming via the `start` parameter.
  if (apiFailed || !videoId) {
    const separator = url.includes("?") ? "&" : "?";
    const fallbackUrl = resumeRef.current > 0 ? `${url}${separator}start=${Math.floor(resumeRef.current)}` : url;
    return <EmbedFrame url={fallbackUrl} title={title} kind="youtube" supported />;
  }

  return (
    <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden" data-course-viewer-embed data-embed-kind="youtube" data-course-youtube-player>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[var(--course-loading)] text-[var(--course-text)]">
          <div className="flex flex-col items-center gap-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-violet-400" />
            <p className="text-xs font-semibold text-[var(--course-muted)]">Loading preview…</p>
          </div>
        </div>
      ) : null}
      <div ref={hostRef} className="absolute inset-0 h-full w-full bg-black" data-course-viewer-iframe title={title} />
    </div>
  );
}

function ViewerHeader({ file, embed, download }: { file: CourseFile; embed: { url: string; kind: string }; download: { url: string; label: string; downloadable: boolean } }) {
  const kindLabel = embed.kind === "none" ? "No preview" : embed.kind === "direct" ? file.type : embed.kind;
  const isMedia = embed.kind === "youtube" || file.type === "video" || file.type === "audio";
  const toggleFullscreen = () => {
    const root = document.querySelector("[data-course-viewer][data-active=\"true\"]") || document.querySelector("[data-course-viewer]");
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (root as HTMLElement).requestFullscreen?.();
  };
  return (
    <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-[var(--course-border)] bg-[var(--course-surface)] px-3 py-2.5 text-[var(--course-text)] backdrop-blur sm:gap-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black" title={file.name}>{file.name}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--course-muted)]" data-course-viewer-kind>{kindLabel} preview</p>
      </div>
      {isMedia ? (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--course-soft)] text-[var(--course-muted)] hover:bg-[var(--course-soft-hover)] hover:text-[var(--course-text)]"
          aria-label="Toggle fullscreen"
          title="Fullscreen"
          data-course-viewer-fullscreen
        >
          <Maximize2 size={15} />
        </button>
      ) : null}
      {download.url ? (
        <a
          href={download.url}
          target="_blank"
          rel="noopener noreferrer"
          download={download.downloadable ? file.name : undefined}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--course-soft)] px-3 py-2 text-xs font-bold hover:bg-[var(--course-soft-hover)]"
          data-course-viewer-download
        >
          {download.downloadable ? <Download size={14} /> : <ExternalLink size={14} />}
          <span className="hidden sm:inline">{download.label}</span>
        </a>
      ) : null}
      {embed.url ? (
        <a
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--course-soft)] hover:bg-[var(--course-soft-hover)]"
          aria-label="Open preview in new tab"
          data-course-viewer-external
        >
          <Maximize2 size={15} />
        </a>
      ) : null}
    </div>
  );
}

function MissingEmbedState({ file, download }: { file: CourseFile; download: { url: string; label: string; downloadable: boolean } }) {
  return (
    <div className="grid h-full place-items-center bg-[var(--course-bg)] p-8 text-center text-[var(--course-text)]" data-course-viewer-missing>
      <div className="max-w-md">
        <FileQuestion className="mx-auto h-12 w-12 text-amber-400" />
        <p className="mt-4 font-black">Preview is unavailable</p>
        <p className="mt-1 text-sm text-[var(--course-muted)]">
          Add a public HTTPS URL in product management. Google files must be shared as “Anyone with the link”.
        </p>
        {download.url ? (
          <a
            href={download.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[var(--course-soft)] px-4 py-2 text-xs font-bold hover:bg-[var(--course-soft-hover)]"
          >
            {download.downloadable ? <Download size={14} /> : <ExternalLink size={14} />}
            {download.label}
          </a>
        ) : null}
        <p className="mt-4 text-[10px] uppercase tracking-wider text-[var(--course-muted)]">File type: {file.type}</p>
      </div>
    </div>
  );
}

interface EmbedFrameProps {
  url: string;
  title: string;
  kind: string;
  supported: boolean;
}

function EmbedFrame({ url, title, kind, supported }: EmbedFrameProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // 12s safety net: if the embed never fires `onLoad`
    // (e.g. a sandboxed docs.google.com page that blocks
    // cross-origin load events), surface the timeout panel.
    timeoutRef.current = setTimeout(() => {
      setLoading((current) => {
        if (current) setFailed(true);
        return false;
      });
    }, 12000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [url, reloadKey]);

  return (
    <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden" data-course-viewer-embed data-embed-kind={kind}>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[var(--course-loading)] text-[var(--course-text)]">
          <div className="flex flex-col items-center gap-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-violet-400" />
            <p className="text-xs font-semibold text-[var(--course-muted)]">Loading preview…</p>
          </div>
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--course-bg)] p-8 text-center text-[var(--course-text)]">
          <div className="max-w-md">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <p className="mt-4 font-black">Preview didn’t load</p>
            <p className="mt-1 text-sm text-[var(--course-muted)]">
              The host may be blocking the embed. Open the source in a new tab to view it directly.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white"
              >
                <ExternalLink size={14} /> Open original
              </a>
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setLoading(true);
                  setReloadKey((value) => value + 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--course-soft)] px-4 py-2 text-xs font-bold text-[var(--course-text)] hover:bg-[var(--course-soft-hover)]"
                data-course-viewer-retry
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-wider text-[var(--course-muted)]">Source: {new URL(url, "https://x").hostname}</p>
          </div>
        </div>
      ) : null}
      <iframe
        key={reloadKey}
        src={url}
        title={title}
        className={`block h-full max-h-full min-h-0 w-full max-w-full min-w-0 border-0 ${kind === "youtube" ? "absolute inset-0 bg-black" : "bg-white"}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        data-course-viewer-iframe
        onLoad={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoading(false);
          setFailed(false);
        }}
        onError={() => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoading(false);
          setFailed(true);
        }}
      />
      {!supported ? (
        <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-[10px] font-bold text-[var(--course-muted)]">
          {kind} embed
        </p>
      ) : null}
    </div>
  );
}
