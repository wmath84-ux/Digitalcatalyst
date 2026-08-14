// src/course/ResourceViewer.tsx
//
// Part 11 — Course Player resource viewer. Renders the
// currently selected CourseFile (lesson / resource) in the
// right pane. Supports every type in `CourseFileType`:
//
//   - YouTube           — no-cookie embed, autoplay-ready.
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
// The viewer shows a "Loading…" indicator while the iframe
// boots, a "Preview unavailable" panel when the embed URL
// is missing or unreachable, and a "Try original" link that
// opens the source in a new tab as a fallback.
//
// Per-file error boundaries isolate the crash so the rest of
// the Course Player keeps working.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileQuestion, Maximize2, RefreshCw } from "lucide-react";
import type { CourseFile } from "../types/course";
import ImageViewer from "./ImageViewer";
import AudioPlayer from "./AudioPlayer";
import { getCourseDownload, getCourseEmbed } from "../utils/courseEmbed";

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
}

export default function ResourceViewer({ file }: ResourceViewerProps) {
  // No file selected — show the empty state.
  if (!file) {
    return (
      <div className="grid h-full min-h-[280px] place-items-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-8 text-center text-white">
        <div data-course-viewer-empty>
          <FileQuestion className="mx-auto h-12 w-12 text-white/30" />
          <p className="mt-4 font-black">Choose a lesson or resource</p>
          <p className="mt-1 text-sm text-white/45">Your course content will open here without leaving the app.</p>
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
  // Video-shaped content is letterboxed at 16:9 and centred so it never
  // stretches; document-shaped content fills every available pixel.
  const isCinematic = isVideo || embed.kind === "youtube";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-950" data-course-viewer data-file-id={file.id} data-embed-kind={embed.kind}>
      <ViewerHeader file={file} embed={embed} download={download} />
      <div className={`min-h-0 flex-1 overflow-hidden ${isCinematic ? "grid place-items-center bg-black p-0" : ""}`}>
        {isImage ? (
          <ImageViewer url={embed.url} name={file.name} />
        ) : isVideo ? (
          <div className="h-full w-full overflow-hidden bg-black">
            <video
              src={embed.url}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload"
              className="h-full w-full bg-black object-contain"
              data-course-viewer-video
            />
          </div>
        ) : isAudio ? (
          <AudioPlayer url={embed.url} name={file.name} />
        ) : !embed.url ? (
          <MissingEmbedState file={file} download={download} />
        ) : isCinematic ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="aspect-video max-h-full w-full max-w-full">
              <EmbedFrame url={embed.url} title={file.name} kind={embed.kind} supported={isSupported} />
            </div>
          </div>
        ) : (
          <EmbedFrame url={embed.url} title={file.name} kind={embed.kind} supported={isSupported} />
        )}
      </div>
    </div>
  );
}

function ViewerHeader({ file, embed, download }: { file: CourseFile; embed: { url: string; kind: string }; download: { url: string; label: string; downloadable: boolean } }) {
  const kindLabel = embed.kind === "none" ? "No preview" : embed.kind === "direct" ? file.type : embed.kind;
  const isMedia = embed.kind === "youtube" || file.type === "video" || file.type === "audio";
  const toggleFullscreen = () => {
    const root = document.querySelector("[data-course-viewer]");
    if (!root) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.requestFullscreen?.();
  };
  return (
    <div className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2.5 text-white backdrop-blur sm:gap-3 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black" title={file.name}>{file.name}</p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40" data-course-viewer-kind>{kindLabel} preview</p>
      </div>
      {isMedia ? (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-white/80 hover:bg-white/15"
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
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/15"
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
          className="grid h-9 w-9 place-items-center rounded-lg bg-white/10"
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
    <div className="grid h-full place-items-center bg-slate-950 p-8 text-center text-white" data-course-viewer-missing>
      <div className="max-w-md">
        <FileQuestion className="mx-auto h-12 w-12 text-amber-400" />
        <p className="mt-4 font-black">Preview is unavailable</p>
        <p className="mt-1 text-sm text-white/50">
          Add a public HTTPS URL in product management. Google files must be shared as “Anyone with the link”.
        </p>
        {download.url ? (
          <a
            href={download.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold hover:bg-white/15"
          >
            {download.downloadable ? <Download size={14} /> : <ExternalLink size={14} />}
            {download.label}
          </a>
        ) : null}
        <p className="mt-4 text-[10px] uppercase tracking-wider text-white/30">File type: {file.type}</p>
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
    <div className="relative h-full w-full" data-course-viewer-embed data-embed-kind={kind}>
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-slate-950/60 text-white">
          <div className="flex flex-col items-center gap-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-violet-400" />
            <p className="text-xs font-semibold text-white/55">Loading preview…</p>
          </div>
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950 p-8 text-center text-white">
          <div className="max-w-md">
            <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
            <p className="mt-4 font-black">Preview didn’t load</p>
            <p className="mt-1 text-sm text-white/55">
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
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15"
                data-course-viewer-retry
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-wider text-white/30">Source: {new URL(url, "https://x").hostname}</p>
          </div>
        </div>
      ) : null}
      <iframe
        key={reloadKey}
        src={url}
        title={title}
        className="h-full w-full border-0 bg-white"
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
        <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-[10px] font-bold text-white/70">
          {kind} embed
        </p>
      ) : null}
    </div>
  );
}
