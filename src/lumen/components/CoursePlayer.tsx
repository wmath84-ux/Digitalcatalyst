import { memo, useEffect, useRef, useState } from "react";
import {
  AudioLines, ChevronRight, FileSpreadsheet, FileText, FileType2, Film, Image as ImageIcon,
  ListChecks, Network, Pause, Play, Presentation, Sparkles, SquareCode, MonitorPlay, type LucideIcon,
} from "lucide-react";
import { courseBridge, useActiveLearningContext } from "../course/bridge";
import { fmtTime } from "../course/adapters";
import type { ResourceType } from "../course/types";
import { cn } from "../utils/cn";

/* ─────────────────────────────────────────────────────────────
   COURSE PLAYER (authoritative for player state)
   Publishes every meaningful change to the CourseContextBridge.
   Media time is published WITHOUT notifying React, so a playing
   video never re-renders the AI chat.
   ───────────────────────────────────────────────────────────── */

const ICONS: Record<ResourceType, LucideIcon> = {
  youtube: MonitorPlay, video: Film, audio: AudioLines, pdf: FileText, doc: FileType2,
  sheet: FileSpreadsheet, slides: Presentation, ebook: FileText, image: ImageIcon,
  google_form: ListChecks, embed: SquareCode, mindmap: Network,
};

const AVAIL_STYLE: Record<string, { label: string; cls: string }> = {
  ready: { label: "AI-readable", cls: "border-[#bfe3d2] bg-[--ok-bg] text-[--ok]" },
  partial: { label: "Partial", cls: "border-[--border-2] bg-[--warn-bg] text-[--warn]" },
  available: { label: "On demand", cls: "border-[--border] bg-[--hover] text-[--ink-3]" },
  processing: { label: "Processing", cls: "border-[--border] bg-[--hover] text-[--ink-3]" },
  permission_required: { label: "No API access", cls: "border-[--border-2] bg-[--warn-bg] text-[--warn]" },
  unsupported: { label: "Screenshot only", cls: "border-[--border-2] bg-[--hover] text-[--ink-3]" },
  unavailable: { label: "Unavailable", cls: "border-[--err-border] bg-[--err-bg] text-[--err]" },
};

/** Media clock — owns the ticking so the rest of the tree stays still. */
const MediaScrubber = memo(function MediaScrubber({
  resourceId, duration, initial,
}: {
  resourceId: string;
  duration: number;
  initial: number;
}) {
  const [t, setT] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    setT(initial);
    setPlaying(false);
  }, [resourceId, initial]);

  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      const next = Math.min(duration, tRef.current + 1);
      setT(next);
      // High-frequency publish: bridge cell only, zero React notifications.
      courseBridge.setPlaybackTime(next, true);
      if (next >= duration) setPlaying(false);
    }, 1000);
    return () => window.clearInterval(iv);
  }, [playing, duration]);

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => {
          const next = !playing;
          setPlaying(next);
          courseBridge.setPlaying(next);
        }}
        aria-label={playing ? "Pause" : "Play"}
        className="focus-ring flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[--ink] text-white transition-colors hover:bg-[#000]"
      >
        {playing ? <Pause size={12} fill="currentColor" aria-hidden="true" /> : <Play size={12} fill="currentColor" className="ml-0.5" aria-hidden="true" />}
      </button>
      <input
        type="range"
        min={0}
        max={duration}
        value={t}
        aria-label="Seek"
        onChange={(e) => {
          const v = Number(e.target.value);
          setT(v);
          courseBridge.setPlaybackTime(v, playing);
        }}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[--border-2] accent-[--accent]"
      />
      <span className="mono flex-none text-[11px] tabular-nums text-[--ink-3]">
        {fmtTime(t)} / {fmtTime(duration)}
      </span>
    </div>
  );
});

function ResourceStage({ type, name }: { type: ResourceType; name: string }) {
  const Icon = ICONS[type];
  const dark = type === "youtube" || type === "video" || type === "image";
  return (
    <div
      className={cn(
        "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[14px] border",
        dark ? "border-transparent bg-[#16150f]" : "border-[--border] bg-[--hover]"
      )}
    >
      <div className={cn("flex flex-col items-center gap-2", dark ? "text-[rgba(255,255,255,0.72)]" : "text-[--ink-3]")}>
        <Icon size={30} aria-hidden="true" />
        <span className="max-w-[80%] truncate px-4 text-center text-[11.5px] font-medium">{name}</span>
      </div>
      <span
        className={cn(
          "absolute left-3 top-3 rounded-[6px] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em]",
          dark ? "bg-[rgba(0,0,0,0.45)] text-[rgba(255,255,255,0.85)]" : "bg-[--surface] text-[--ink-3]"
        )}
      >
        {type.replace("_", " ")}
      </span>
    </div>
  );
}

export default function CoursePlayer() {
  const ctx = useActiveLearningContext();
  const resources = courseBridge.getResources();
  const mod = courseBridge.getModule();
  const r = ctx.resource;

  const isMedia = r.resourceType === "youtube" || r.resourceType === "video" || r.resourceType === "audio";
  const avail = AVAIL_STYLE[ctx.availability] ?? AVAIL_STYLE.available;

  return (
    <div className="scroll-area flex min-w-0 flex-1 flex-col overflow-y-auto border-r border-[--border] bg-[--surface]">
      <div className="mx-auto w-full max-w-[840px] px-5 py-5 lg:px-7">
        {/* breadcrumb */}
        <div className="mb-3.5 flex items-center gap-1.5 text-[12px] text-[--ink-3]">
          <span className="truncate">{ctx.course.courseTitle}</span>
          <ChevronRight size={12} aria-hidden="true" className="flex-none" />
          <span className="flex-none font-medium text-[--ink-2]">{mod.lessonTitle}</span>
        </div>

        <ResourceStage type={r.resourceType} name={r.resourceName} />

        {/* live player controls — publish position to the bridge */}
        <div className="mt-3 rounded-[12px] border border-[--border] bg-[--bg] p-3">
          {isMedia && r.duration ? (
            <MediaScrubber resourceId={r.resourceId} duration={r.duration} initial={ctx.playbackState.currentTime ?? 0} />
          ) : r.resourceType === "pdf" || r.resourceType === "ebook" ? (
            <div className="flex items-center gap-2">
              <span className="flex-none text-[11.5px] font-medium text-[--ink-3]">Page</span>
              <input
                type="range"
                min={14}
                max={r.pageCount ?? 24}
                value={ctx.locationState.currentPage ?? 14}
                aria-label="Page"
                onChange={(e) => courseBridge.setLocation({ currentPage: Number(e.target.value) }, `moved to page ${e.target.value}`)}
                className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[--border-2] accent-[--accent]"
              />
              <span className="mono flex-none text-[11px] tabular-nums text-[--ink-3]">
                {ctx.locationState.currentPage} / {r.pageCount ?? 24}
              </span>
            </div>
          ) : r.resourceType === "slides" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 flex-none text-[11.5px] font-medium text-[--ink-3]">Slide</span>
              {Array.from({ length: r.slideCount ?? 6 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => courseBridge.setLocation({ currentSlide: n }, `moved to slide ${n}`)}
                  aria-current={ctx.locationState.currentSlide === n}
                  className={cn(
                    "focus-ring mono h-[26px] w-[26px] flex-none rounded-[7px] border text-[11px] font-semibold transition-colors",
                    ctx.locationState.currentSlide === n
                      ? "border-transparent bg-[--accent] text-white"
                      : "border-[--border] bg-[--surface] text-[--ink-3] hover:bg-[--hover]"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11.5px] text-[--ink-3]">
              <span className={cn("flex-none rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold", avail.cls)}>{avail.label}</span>
              <span className="min-w-0 flex-1 truncate">{ctx.availabilityNote ?? "No position tracking for this resource type."}</span>
            </div>
          )}
        </div>

        <h2 className="mt-4 text-[16.5px] font-semibold tracking-[-0.01em] text-[--ink]">{r.resourceName}</h2>
        <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-[--ink-3]">
          <span className={cn("flex-none rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold", avail.cls)}>{avail.label}</span>
          <span className="min-w-0 truncate">{ctx.availabilityNote ?? `Provided by ${r.provider}`}</span>
        </p>

        {/* resource rail — switching publishes a structural context change */}
        <div className="mt-5 overflow-hidden rounded-[12px] border border-[--border]">
          <div className="border-b border-[--border] bg-[--hover] px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[--ink-3]">
            Module resources · {resources.length} types
          </div>
          {resources.map((res) => {
            const Icon = ICONS[res.resourceType];
            const active = res.resourceId === r.resourceId;
            const a = AVAIL_STYLE[res.availability] ?? AVAIL_STYLE.available;
            return (
              <button
                key={res.resourceId}
                type="button"
                onClick={() => courseBridge.setResource(res.resourceId)}
                className={cn(
                  "focus-ring flex w-full items-center gap-2.5 border-b border-[--border] px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[--hover]",
                  active && "bg-[--accent-soft] hover:bg-[--accent-soft]"
                )}
              >
                <Icon size={14} className={cn("flex-none", active ? "text-[--accent-ink]" : "text-[--ink-4]")} aria-hidden="true" />
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", active ? "font-medium text-[--accent-ink]" : "text-[--ink-2]")}>
                  {res.resourceName}
                </span>
                <span className={cn("flex-none rounded-[5px] border px-1.5 py-px text-[9.5px] font-semibold", a.cls)}>{a.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[12px] border border-[--border] bg-[--bg] p-3.5">
          <Sparkles size={15} className="mt-px flex-none text-[--accent-ink]" aria-hidden="true" />
          <p className="text-[12.5px] leading-relaxed text-[--ink-2]">
            <span className="font-medium text-[--ink]">Lumen is watching this panel.</span> Move the timeline, change the page or slide,
            then ask “what did sir just explain?” — it answers from this exact position. Where a source can't be read, it says so instead of guessing.
          </p>
        </div>
      </div>
    </div>
  );
}
