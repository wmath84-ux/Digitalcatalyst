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
import { AlertTriangle, Download, ExternalLink, Eye, FileQuestion, FileStack, Maximize2, PencilLine, RefreshCw, X } from "lucide-react";
import { GlassButton } from "../components/ui/glass-button";
import { GlassSurface } from "../components/ui/glass";
import type { CourseFile } from "../types/course";
import ImageViewer from "./ImageViewer";
import AudioPlayer from "./AudioPlayer";
import { buildPersonalCopyUrl, editableGoogleKind, getCourseDownload, getCourseEmbed, getDriveSourceFileId, getGoogleEditorUrl, getYouTubeWatchUrl, hasNativeMobileRendering, isEditableGoogleFile, personalCopyKind, VIEWPORT_AWARE_KINDS, type CourseDownload, type DocsEditorChrome } from "../utils/courseEmbed";
import { useDocsEditorAccess } from "../hooks/useDocsEditorAccess";
import { usePersonalDriveCopy } from "../hooks/usePersonalDriveCopy";
import { useAuth } from "../context/AuthContext";
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
  /**
   * Hides the file's own header (download / open) so the content itself can
   * use the full stage. The viewer stretches into the freed space.
   */
  chromeHidden?: boolean;
  /**
   * Embedded documents render at desktop width by default. `false` requests
   * the host's mobile rendering, which is far easier to read on a phone.
   */
  desktopView?: boolean;
}

export default function ResourceViewer({ file, active = true, playback, onPlaybackChange, chromeHidden = false, desktopView = true }: ResourceViewerProps) {
  // No file selected — show the empty state.
  if (!file) {
    return (
      <div className="grid h-full min-h-[280px] place-items-center p-8 text-center text-[var(--course-text)]">
        <div data-course-viewer-empty>
          <FileQuestion className="mx-auto h-12 w-12 text-[var(--course-muted)]" />
          <p className="mt-4 font-black">Choose a lesson or resource</p>
          <p className="mt-1 text-sm text-[var(--course-muted)]">Your course content will open here without leaving the app.</p>
        </div>
      </div>
    );
  }

  return (
    <ResourceViewerBody
      key={file.id}
      file={file}
      active={active}
      playback={playback}
      onPlaybackChange={onPlaybackChange}
      chromeHidden={chromeHidden}
      desktopView={desktopView}
    />
  );
}

/**
 * Inner viewer, remounted per file (via `key={file.id}`) so per-file UI
 * state — like the Google Docs edit-mode toggle — never leaks between
 * documents.
 */
function ResourceViewerBody({ file, active = true, playback, onPlaybackChange, chromeHidden = false, desktopView = true }: ResourceViewerProps & { file: CourseFile }) {
  // ── Google in-frame editor (admin-controlled, PER FILE TYPE) ────────
  // The admin decides in Admin → Content → Course Player what learners
  // get — separately for Docs, Sheets and Slides:
  //   "off"     → preview only, no Edit toggle at all.
  //   "toolbar" → compact editor: full formatting toolbar, Google's outer
  //               header (title + menu bar + share) hidden.
  //   "full"    → the complete docs.google.com page: title, menu bar,
  //               toolbar, tabs/outline side panel, comments — everything.
  // Forms have no learner-facing editor (their /edit page is the owner's
  // form BUILDER; learners fill the embedded viewform) and PDFs / Drive
  // binaries have no editor endpoint, so no switch exists for them.
  // Editing still requires the learner to have edit permission on the
  // file (Google enforces that; no client code can bypass it).
  const { editorAccess: accessByType, personalCopy: personalCopySettings } = useDocsEditorAccess();
  const editableKind = editableGoogleKind(file);
  const editorAccess = editableKind ? accessByType[editableKind] : "off";
  const editorChrome: DocsEditorChrome = editorAccess === "full" ? "full" : "toolbar";
  const canEditInline = editorAccess !== "off" && isEditableGoogleFile(file);
  // Google Docs / Sheets / Slides open DIRECTLY in the editor (full toolbar
  // +, with "full" chrome, Google's header) whenever the admin hasn't
  // disabled the editor for that file type — learners who were granted
  // editor permission no longer have to hunt for a toggle to see it. The
  // header toggle still switches back to the read-only preview at any time.
  const [editMode, setEditMode] = useState(canEditInline);

  // ── Personal copy (admin-controlled, PER FILE TYPE) ─────────────────
  // When the admin enables "Personal copy" for this file's family AND an
  // OAuth Client ID is configured, the learner gets a "My copy" toggle:
  // the first tap runs Google's consent popup + Drive `files.copy`, so a
  // private copy lands in the STUDENT's own Drive (they own it → editing
  // always works, master stays untouched). The mapping is remembered in
  // `users/{uid}/driveCopies/{sourceFileId}`, so later taps are instant.
  const { user } = useAuth();
  const copyKind = personalCopyKind(file);
  const driveSourceId = getDriveSourceFileId(file);
  const personalCopyEnabled = Boolean(
    copyKind && driveSourceId && personalCopySettings.clientId && personalCopySettings.byType[copyKind],
  );
  const copyState = usePersonalDriveCopy({
    uid: personalCopyEnabled ? user?.id : null,
    sourceFileId: driveSourceId,
    copyName: `${file.name || "Course file"} — ${user?.name || "my"} copy`,
    clientId: personalCopySettings.clientId,
  });
  const [copyMode, setCopyMode] = useState(false);
  const personalCopyUrl = personalCopyEnabled && copyKind && copyState.copyFileId
    ? buildPersonalCopyUrl(copyKind, copyState.copyFileId, editorChrome)
    : "";
  const showPersonalCopy = personalCopyEnabled && copyMode && Boolean(personalCopyUrl);
  const copyBusy = copyState.status === "authorizing" || copyState.status === "copying";

  // ── Desktop/mobile switch while an editor is open ─────────────────────
  // The viewport choice only changes the PREVIEW rendering: the editor URL
  // is identical in both modes (Google has no mobile editor), so flipping
  // the header's desktop/mobile button while the editor — or a personal
  // copy — is on stage would appear to do nothing at all. Flipping it
  // therefore exits the editor straight into the preview of the newly
  // chosen viewport, which is exactly what the learner asked to see.
  const previousDesktopViewRef = useRef(desktopView);
  /** Bumped on every viewport flip so an in-flight copy can't re-enter edit. */
  const viewportFlipRef = useRef(0);
  useEffect(() => {
    if (previousDesktopViewRef.current === desktopView) return;
    previousDesktopViewRef.current = desktopView;
    viewportFlipRef.current += 1;
    setEditMode(false);
    setCopyMode(false);
  }, [desktopView]);

  const handleToggleCopyMode = () => {
    if (copyMode) { setCopyMode(false); return; }
    setEditMode(false);
    if (copyState.copyFileId) { setCopyMode(true); return; }
    const flip = viewportFlipRef.current;
    void copyState.createCopy().then(() => {
      // The learner may have flipped the viewport while Drive was still
      // copying; that flip exits editor modes, so don't drag them back in.
      if (viewportFlipRef.current === flip) setCopyMode(true);
    }).catch(() => undefined);
  };

  // A non-blocking note must never overstay: it fades out on its own and
  // can be dismissed immediately.
  useEffect(() => {
    if (!copyState.warningMessage) return undefined;
    const timer = setTimeout(() => copyState.dismissWarning(), 8000);
    return () => clearTimeout(timer);
  }, [copyState.warningMessage, copyState.dismissWarning]);

  // The desktop/mobile choice is resolved BEFORE the URL is built: a phone
  // rendering is a different endpoint on the host, not a narrower iframe.
  const baseEmbed = getCourseEmbed(file, { viewport: desktopView ? "desktop" : "mobile", mode: canEditInline && editMode && !showPersonalCopy ? "edit" : "preview", editorChrome });
  // The personal copy takes over the stage when active — same kind, own URL.
  const embed = showPersonalCopy ? { url: personalCopyUrl, kind: baseEmbed.kind } : baseEmbed;
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
  // Only documents care about the desktop/mobile switch.
  const documentKind = VIEWPORT_AWARE_KINDS.includes(embed.kind);
  // Hosts WITHOUT a mobile endpoint (Slides, Drive, PDFs, generic embeds) are
  // the only ones that still need the narrow-frame trick. Docs / Sheets /
  // Forms already loaded their own reflowing mobile page above, so scaling
  // them a second time would shrink the text we just made readable.
  // The full Google editor manages its own layout — never scale it.
  const isEditingInline = (canEditInline && editMode && !showPersonalCopy) || showPersonalCopy;
  const mobileDocument = documentKind && !desktopView && !hasNativeMobileRendering(embed.kind) && !isEditingInline;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-[var(--course-text)]" data-course-viewer data-file-id={file.id} data-embed-kind={embed.kind} data-active={active ? "true" : "false"} data-chrome-hidden={chromeHidden ? "true" : "false"} data-doc-mode={canEditInline || personalCopyEnabled ? (showPersonalCopy ? "personal-copy" : isEditingInline ? "edit" : "preview") : undefined} data-viewport-mode={documentKind ? (desktopView ? "desktop" : "mobile") : undefined}>
      {chromeHidden ? null : (
        <ViewerHeader
          file={file}
          embed={embed}
          externalUrl={embed.kind === "youtube" ? getYouTubeWatchUrl(file) : embed.url}
          download={download}
          canEditInline={canEditInline && !showPersonalCopy}
          editMode={canEditInline && editMode && !showPersonalCopy}
          onToggleEditMode={() => { setCopyMode(false); setEditMode((value) => !value); }}
          personalCopyEnabled={personalCopyEnabled}
          personalCopyActive={showPersonalCopy}
          personalCopyBusy={copyBusy}
          onTogglePersonalCopy={handleToggleCopyMode}
        />
      )}
      {personalCopyEnabled && copyState.status === "error" && copyState.errorMessage ? (
        <div className="border-b border-amber-300/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-200" role="alert" data-course-personal-copy-error>
          {copyState.errorMessage}
        </div>
      ) : null}
      {/*
        The copy EXISTS — only remembering it for next time failed. Shown as
        a quiet, dismissible note, never as the red "it didn't work" banner.
      */}
      {personalCopyEnabled && copyState.status !== "error" && copyState.warningMessage ? (
        <div className="flex items-center gap-2 border-b border-[var(--course-border)] bg-[var(--course-soft)] px-4 py-2 text-xs font-semibold text-[var(--course-muted)]" role="status" data-course-personal-copy-warning>
          <span className="min-w-0 flex-1">{copyState.warningMessage}</span>
          <GlassButton
            onClick={copyState.dismissWarning}
            className="shrink-0 [&_.size-12]:size-7"
            aria-label="Dismiss this message"
            title="Dismiss"
            data-course-personal-copy-warning-dismiss
          >
            <X size={13} />
          </GlassButton>
        </div>
      ) : null}
      {copyBusy ? (
        <div className="border-b border-[var(--course-border)] bg-[var(--course-soft)] px-4 py-2 text-xs font-semibold text-[var(--course-muted)]" data-course-personal-copy-busy>
          {copyState.status === "authorizing" ? "Waiting for Google authorization…" : "Creating your personal copy in Google Drive…"}
        </div>
      ) : null}
      <div className={`relative min-h-0 flex-1 overflow-hidden ${isCinematic ? "bg-black p-0" : ""}`}>
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
                watchUrl={getYouTubeWatchUrl(file)}
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
          <EmbedFrame url={embed.url} title={file.name} kind={embed.kind} supported={isSupported} mobileDocument={mobileDocument} editMode={isEditingInline} editorOriginalUrl={showPersonalCopy ? personalCopyUrl : isEditingInline ? getGoogleEditorUrl(file) : ""} />
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

function YouTubeFrame({ url, watchUrl, title, active, resumeAt, onProgress }: { url: string; watchUrl: string; title: string; active: boolean; resumeAt: number; onProgress: (position: number, duration: number) => void }) {
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
    let readyTimeout: ReturnType<typeof setTimeout> | null = null;
    const ready = { value: false };
    if (!videoId) return undefined;

    // A bot-check / sign-in response can load inside YouTube's iframe without
    // ever firing the IFrame API's `onReady`. Without a timeout the viewer
    // would sit behind a spinner forever, and the learner would be pushed into
    // clicking YouTube's sign-in link inside the iframe (which Chrome blocks
    // with ERR_BLOCKED_BY_RESPONSE). Fall back to the plain embed and keep a
    // top-level YouTube escape hatch visible instead.
    readyTimeout = setTimeout(() => {
      if (cancelled || ready.value) return;
      try { playerRef.current?.destroy(); } catch { /* player may not exist */ }
      playerRef.current = null;
      setApiFailed(true);
      setLoading(false);
    }, 12000);

    void loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      const host = hostRef.current;
      if (!YT?.Player || !host) {
        if (readyTimeout) clearTimeout(readyTimeout);
        setApiFailed(true);
        setLoading(false);
        return;
      }
      playerRef.current = new YT.Player(host, {
        videoId,
        // `start` resumes at the stored second even before the API is polled,
        // so the very first frame is already the right one.
        playerVars: {
          rel: 0, modestbranding: 1, playsinline: 1, controls: 1, fs: 1,
          enablejsapi: 1,
          start: Math.floor(resumeRef.current) || 0,
          origin: window.location.origin,
          widget_referrer: window.location.href,
        },
        host: "https://www.youtube-nocookie.com",
        events: {
          onReady: () => {
            ready.value = true;
            if (readyTimeout) clearTimeout(readyTimeout);
            if (!cancelled) setLoading(false);
          },
          onError: () => {
            ready.value = true;
            if (readyTimeout) clearTimeout(readyTimeout);
            if (!cancelled) { setApiFailed(true); setLoading(false); }
          },
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
      if (readyTimeout) clearTimeout(readyTimeout);
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
    // If the privacy-enhanced host is the one being filtered by a browser,
    // give the ordinary player one chance to use an existing YouTube session.
    // This is still only an iframe fallback; authentication is never attempted
    // inside it. The visible top-level watch link remains the reliable path.
    const standardFallbackUrl = fallbackUrl.replace("www.youtube-nocookie.com", "www.youtube.com");
    return <EmbedFrame url={standardFallbackUrl} originalUrl={watchUrl} title={title} kind="youtube" supported />;
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

function ViewerHeader({ file, embed, externalUrl = embed.url, download, canEditInline = false, editMode = false, onToggleEditMode, personalCopyEnabled = false, personalCopyActive = false, personalCopyBusy = false, onTogglePersonalCopy }: { file: CourseFile; embed: { url: string; kind: string }; externalUrl?: string; download: CourseDownload; canEditInline?: boolean; editMode?: boolean; onToggleEditMode?: () => void; personalCopyEnabled?: boolean; personalCopyActive?: boolean; personalCopyBusy?: boolean; onTogglePersonalCopy?: () => void }) {
  const kindLabel = embed.kind === "none" ? "No preview" : embed.kind === "direct" ? file.type : embed.kind;
  const isYouTube = embed.kind === "youtube";
  const isMedia = isYouTube || file.type === "video" || file.type === "audio";
  const toggleFullscreen = () => {
    const root = document.querySelector("[data-course-viewer][data-active=\"true\"]") || document.querySelector("[data-course-viewer]");
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void (root as HTMLElement).requestFullscreen?.();
  };
  return (
    <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-[var(--course-border)] bg-[var(--dc-chrome-glass)] px-3 py-2.5 text-[var(--course-text)] [backdrop-filter:var(--dc-chrome-glass-blur)] sm:gap-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black" title={file.name}>{file.name}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--course-muted)]" data-course-viewer-kind>{kindLabel} {personalCopyActive ? "my copy" : editMode ? "editor" : "preview"}</p>
      </div>
      {personalCopyEnabled ? (
        <GlassButton
          variant="capsule"
          onClick={onTogglePersonalCopy}
          disabled={personalCopyBusy}
          className={`text-xs font-bold disabled:cursor-wait disabled:opacity-60 [&>span>div]:h-9 [&>span>div]:px-3 ${
            personalCopyActive ? "[&>span>div]:text-emerald-300" : ""
          }`}
          aria-pressed={personalCopyActive}
          aria-label={personalCopyActive ? "Back to the course master file" : "Open your own personal copy of this file"}
          title={personalCopyActive ? "Back to the master file" : "Get your own editable copy in your Google Drive"}
          data-course-viewer-copy-toggle
          data-copy-active={personalCopyActive ? "true" : "false"}
        >
          <span className="flex items-center gap-1.5">
            {personalCopyBusy ? <RefreshCw size={14} className="animate-spin" /> : <FileStack size={14} />}
            <span className="hidden sm:inline">{personalCopyActive ? "Master" : "My copy"}</span>
          </span>
        </GlassButton>
      ) : null}
      {canEditInline ? (
        <GlassButton
          variant="capsule"
          onClick={onToggleEditMode}
          className={`text-xs font-bold [&>span>div]:h-9 [&>span>div]:px-3 ${editMode ? "[&>span>div]:text-violet-300" : ""}`}
          aria-pressed={editMode}
          aria-label={editMode ? "Switch back to preview" : "Open the full Google editor with the complete toolbar"}
          title={editMode ? "Back to preview" : "Edit in Google Docs (full toolbar)"}
          data-course-viewer-edit-toggle
          data-doc-mode={editMode ? "edit" : "preview"}
        >
          <span className="flex items-center gap-1.5">
            {editMode ? <Eye size={14} /> : <PencilLine size={14} />}
            <span className="hidden sm:inline">{editMode ? "Preview" : "Edit"}</span>
          </span>
        </GlassButton>
      ) : null}
      {isMedia ? (
        <GlassButton
          onClick={toggleFullscreen}
          className="shrink-0 [&_.size-12]:size-9"
          aria-label="Toggle fullscreen"
          title="Fullscreen"
          data-course-viewer-fullscreen
        >
          <Maximize2 size={15} />
        </GlassButton>
      ) : null}
      {download.url ? (
        <a
          href={download.url}
          target="_blank"
          rel="noopener noreferrer"
          download={download.downloadable ? download.fileName : undefined}
          className="block shrink-0 rounded-full text-xs font-bold outline-none focus-visible:brightness-110"
          data-course-viewer-download
        >
          <GlassSurface radius={999} className="h-9 text-white" contentClassName="flex h-full items-center gap-1.5 px-3">
            {download.downloadable ? <Download size={14} /> : <ExternalLink size={14} />}
            <span className="hidden sm:inline">{download.label}</span>
          </GlassSurface>
        </a>
      ) : null}
      {embed.url ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block shrink-0 rounded-full text-[11px] font-bold outline-none focus-visible:brightness-110 sm:text-xs"
          aria-label="Open preview in new tab"
          title={isYouTube ? "Open in YouTube (use this if embedded playback is blocked)" : "Open preview in new tab"}
          data-course-viewer-external
        >
          <GlassSurface radius={999} className="h-9 text-white" contentClassName="flex h-full items-center gap-1.5 px-2.5 sm:px-3">
            <ExternalLink size={15} />
            <span className={isYouTube ? "inline" : "hidden sm:inline"}>{isYouTube ? "YouTube" : "Open"}</span>
          </GlassSurface>
        </a>
      ) : null}
    </div>
  );
}

function MissingEmbedState({ file, download }: { file: CourseFile; download: CourseDownload }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center text-[var(--course-text)]" data-course-viewer-missing>
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
            className="mt-5 inline-block rounded-full text-xs font-bold outline-none focus-visible:brightness-110"
          >
            <GlassSurface radius={999} className="h-10 text-white" contentClassName="flex h-full items-center gap-1.5 px-4">
              {download.downloadable ? <Download size={14} /> : <ExternalLink size={14} />}
              {download.label}
            </GlassSurface>
          </a>
        ) : null}
        <p className="mt-4 text-[10px] uppercase tracking-wider text-[var(--course-muted)]">File type: {file.type}</p>
      </div>
    </div>
  );
}

interface EmbedFrameProps {
  url: string;
  /** Top-level source URL used when the host refuses to be framed. */
  originalUrl?: string;
  title: string;
  kind: string;
  supported: boolean;
  /**
   * Render the document the way a phone would see it. Remote hosts pick
   * their layout from the iframe's own width, so we give the frame a narrow
   * CSS viewport and scale it back up to fill the stage. Text ends up
   * phone-sized and readable instead of a shrunken desktop page.
   */
  mobileDocument?: boolean;
  /**
   * True when the frame is loading Google's FULL editor (`/edit`). Changes
   * the loading copy and the failure panel: an editor that refuses to load
   * almost always means the file isn't shared with edit permission or the
   * browser blocks Google sign-in cookies inside iframes.
   */
  editMode?: boolean;
  /** The plain editor URL to open in a new tab when in-frame editing is refused. */
  editorOriginalUrl?: string;
}

/** CSS pixels a phone browser reports — what the embedded host will see. */
const MOBILE_VIEWPORT_WIDTH = 420;

/**
 * ── Why the FULL Google editor needs its own width ──────────────────────
 * Google has no mobile web editor: `/edit` on a phone-sized frame still
 * ships the desktop application (its menu bar, toolbar, outline/comment
 * rails). Squeezed into a ~400px iframe that page does not reflow — it
 * simply overflows, which is the "everything is oversized, I have to drag
 * left and right" bug. Nothing in the URL fixes it (`overridemobile` and
 * friends are ignored) and the frame is cross-origin, so we cannot restyle
 * it from here.
 *
 * The one lever that works is the iframe's own box: give the editor the
 * desktop-class width it expects, then CSS-scale that box down so it fits
 * the stage exactly. Google lays out a complete, unbroken editor; the
 * learner sees all of it at once with no horizontal scrolling — the same
 * "it just fits" feel the mobile preview has.
 *
 * Each width is the NARROWEST that editor still lays out cleanly at, because
 * the narrower the frame, the less it has to be shrunk and the bigger the
 * text stays.
 */
const EDITOR_VIEWPORT_WIDTHS: Record<string, number> = {
  // Docs is the constrained one: its page canvas is a fixed 8.5in ≈ 816px at
  // 100% zoom and does NOT shrink with the window, so anything narrower than
  // the page plus its margins scrolls sideways inside the frame — exactly
  // the reported bug. 900 clears the page, the canvas gutter and the
  // scrollbar.
  doc: 900,
  // Sheets is fully fluid (the grid just shows fewer columns), so it can be
  // kept tight — which means less downscaling and larger cell text.
  sheet: 780,
  // Slides needs the 16:9 canvas plus the slide filmstrip beside it.
  slides: 860,
};

function EmbedFrame({ url, originalUrl = "", title, kind, supported, mobileDocument = false, editMode = false, editorOriginalUrl = "" }: EmbedFrameProps) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);
  /**
   * Extra magnification on top of "fit the width", for the full editor only.
   * 1 = the whole editor fits the stage (no horizontal scrolling at all),
   * higher values trade that for bigger text and let the stage pan.
   */
  const [editorZoom, setEditorZoom] = useState(1);

  // Google's full editor never reflows, so it is laid out at a desktop-class
  // width and scaled down to the stage (see EDITOR_VIEWPORT_WIDTHS). Only the
  // three real editors qualify: a personal copy of a Drive binary is still an
  // ordinary preview page and reflows on its own.
  const editorViewportWidth = EDITOR_VIEWPORT_WIDTHS[kind] ?? 0;
  const scalesEditor = editMode && !mobileDocument && kind in EDITOR_VIEWPORT_WIDTHS;
  // Both paths need the live stage width.
  const measuresStage = mobileDocument || scalesEditor;

  // Track the real stage width so the narrow frame can be scaled to fill it.
  useEffect(() => {
    if (!measuresStage) return undefined;
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      setStageWidth(stage.clientWidth);
      setStageHeight(stage.clientHeight);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measuresStage]);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    setEditorZoom(1);
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

  // Scale the narrow frame up so it still fills the stage edge-to-edge.
  const mobileScale = mobileDocument && stageWidth > 0 ? Math.max(stageWidth / MOBILE_VIEWPORT_WIDTH, 0.5) : 1;

  // ── Full editor: lay out wide, then shrink to fit ─────────────────────
  // The frame is given a desktop-class CSS viewport and scaled down until it
  // lands exactly on the stage, so the editor always fills the stage with no
  // outer scrolling in any direction.
  //
  // Zooming in narrows that CSS viewport instead of overflowing the stage
  // (900px at 1x, 600px at 1.5x…). The scaled box therefore still fits the
  // stage perfectly, everything gets proportionally bigger, and if Google
  // then needs to scroll sideways it does so INSIDE its own frame — where a
  // touch drag actually works. An outer scroll container would be unusable
  // on a phone, because the iframe swallows the drag.
  const editorFrameWidth = scalesEditor ? editorViewportWidth / editorZoom : 0;
  const editorScale = scalesEditor && stageWidth > 0 && editorFrameWidth > 0
    ? Math.min(stageWidth / editorFrameWidth, 1)
    : 1;
  const scalingEditor = scalesEditor && stageWidth > 0 && editorScale < 1;

  // Proxied GitHub embeds live under /api/embed-proxy?url=… — the failure
  // panel's "Open original" link and Source line must point at the REAL host,
  // not at the app's proxy path.
  const openOriginalHref = (() => {
    // YouTube's sign-in / bot-check page cannot be framed by design. The
    // caller supplies the normal watch URL so this action opens YouTube in a
    // real top-level tab rather than trying to navigate www.youtube.com from
    // inside the iframe (which Chromium reports as ERR_BLOCKED_BY_RESPONSE).
    if (originalUrl) return originalUrl;
    try {
      const parsed = new URL(url, "https://x");
      if (parsed.pathname === "/api/embed-proxy") {
        const inner = parsed.searchParams.get("url");
        if (inner) return inner;
      }
    } catch {
      /* keep the embed URL itself */
    }
    return url;
  })();
  const sourceHost = (() => {
    try {
      return new URL(openOriginalHref).hostname;
    } catch {
      return "";
    }
  })();

  const frameStyle = mobileDocument && stageWidth > 0
    ? {
        width: `${MOBILE_VIEWPORT_WIDTH}px`,
        height: `${100 / mobileScale}%`,
        transform: `scale(${mobileScale})`,
        transformOrigin: "top left" as const,
      }
    : scalingEditor
      ? {
          // The editor believes it is on a desktop-width screen…
          width: `${editorFrameWidth}px`,
          // …and exactly as tall as the stage once the scale is undone, so
          // the editor's own scrollbar is the only one on screen.
          height: `${Math.max(stageHeight, 1) / editorScale}px`,
          // …while the box it occupies is scaled to fit the stage.
          transform: `scale(${editorScale})`,
          transformOrigin: "top left" as const,
        }
      : undefined;

  return (
    <div
      ref={stageRef}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"
      data-course-viewer-embed
      data-embed-kind={kind}
      data-viewport-mode={mobileDocument ? "mobile" : "desktop"}
      data-editor-fit={scalingEditor ? editorScale.toFixed(2) : undefined}
    >
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[var(--course-loading)] text-[var(--course-text)]">
          <div className="flex flex-col items-center gap-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-violet-400" />
            <p className="text-xs font-semibold text-[var(--course-muted)]">{editMode ? "Loading Google editor…" : "Loading preview…"}</p>
          </div>
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[var(--course-loading)] p-8 text-center text-[var(--course-text)]">
          <div className="max-w-md">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <p className="mt-4 font-black">{editMode ? "Google editor didn’t load in-app" : "Preview didn’t load"}</p>
            <p className="mt-1 text-sm text-[var(--course-muted)]">
              {editMode
                ? "Editing inside the app needs two things: the document must be shared as “Anyone with the link → Editor” (or your Google account must have edit access), and your browser must allow Google sign-in cookies in embedded frames. You can always edit in a new tab below."
                : "The host may be blocking the embed. Open the source in a new tab to view it directly."}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <a
                href={editMode && editorOriginalUrl ? editorOriginalUrl : openOriginalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-500"
              >
                <ExternalLink size={14} /> {editMode ? "Edit in new tab" : "Open original"}
              </a>
              <GlassButton
                variant="capsule"
                onClick={() => {
                  setFailed(false);
                  setLoading(true);
                  setReloadKey((value) => value + 1);
                }}
                className="text-xs font-bold [&>span>div]:h-9 [&>span>div]:px-4"
                data-course-viewer-retry
              >
                <span className="flex items-center gap-1.5"><RefreshCw size={14} /> Retry</span>
              </GlassButton>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-wider text-[var(--course-muted)]">Source: {sourceHost}</p>
          </div>
        </div>
      ) : null}
      <iframe
        key={reloadKey}
        src={url}
        title={title}
        className={`block border-0 ${mobileDocument || scalingEditor ? "absolute left-0 top-0 bg-white" : "h-full max-h-full min-h-0 w-full max-w-full min-w-0"} ${kind === "youtube" ? "absolute inset-0 bg-black" : mobileDocument || scalingEditor ? "" : "bg-white"}`}
        style={frameStyle}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write"
        // The FULL Google editor (edit mode) must run unsandboxed: Google's
        // own /edit page needs sign-in cookies, share/comment popups that
        // escape the frame, print, and download flows that a sandbox list
        // silently breaks. docs.google.com is a trusted first-party host —
        // the sandbox stays on for every ordinary preview/embed.
        sandbox={editMode ? undefined : "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation"}
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
      {/*
        Fitting a desktop editor onto a phone makes it small. Each tap here
        narrows the frame's CSS viewport, so the editor re-lays-out bigger
        while still filling the stage exactly — the learner is never stuck
        with text they can't read.
      */}
      {scalingEditor && !failed ? (
        <GlassSurface
          radius={999}
          className="absolute bottom-3 right-3 z-10 text-white"
          contentClassName="flex items-center gap-1 p-1"
          data-course-editor-zoom
        >
          <GlassButton
            onClick={() => setEditorZoom((value) => Math.max(Number((value - 0.25).toFixed(2)), 1))}
            disabled={editorZoom <= 1}
            className="text-sm font-black disabled:opacity-40 [&_.size-12]:size-7"
            aria-label="Fit the editor to the screen"
            title="Zoom out"
            data-course-editor-zoom-out
          >
            −
          </GlassButton>
          <span className="min-w-[2.5rem] text-center text-[10px] font-black tabular-nums" data-course-editor-zoom-pct>
            {Math.round(editorZoom * 100)}%
          </span>
          <GlassButton
            // Capped at 2x: past that the CSS viewport is narrow enough that
            // Google would start serving its cramped layout again.
            onClick={() => setEditorZoom((value) => Math.min(Number((value + 0.25).toFixed(2)), 2))}
            disabled={editorZoom >= 2}
            className="text-sm font-black disabled:opacity-40 [&_.size-12]:size-7"
            aria-label="Magnify the editor"
            title="Zoom in"
            data-course-editor-zoom-in
          >
            +
          </GlassButton>
        </GlassSurface>
      ) : null}
      {!supported ? (
        <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[10px] font-bold text-white/70">
          {kind} embed
        </p>
      ) : null}
    </div>
  );
}
