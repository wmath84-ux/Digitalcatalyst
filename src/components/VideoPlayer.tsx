import { useEffect, useRef, useState } from "react";
import type { Lesson } from "../types/course";
import { cn } from "../utils/cn";

interface VideoPlayerProps {
  lesson: Lesson;
  moduleTitle: string;
  onAutoComplete: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({ lesson, moduleTitle, onAutoComplete }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hasCompletedRef = useRef(false);

  // Reset player when lesson changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    hasCompletedRef.current = false;
  }, [lesson.id]);

  // Simulate playback progress
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + speed;
        if (next >= lesson.durationSec) {
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onAutoComplete();
          }
          setIsPlaying(false);
          return lesson.durationSec;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, speed, lesson.durationSec, onAutoComplete]);

  // Auto-hide controls while playing
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      return;
    }
    const timeout = setTimeout(() => setShowControls(false), 2800);
    return () => clearTimeout(timeout);
  }, [isPlaying, showControls, currentTime]);

  const progressPercent = lesson.durationSec ? (currentTime / lesson.durationSec) * 100 : 0;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setCurrentTime(ratio * lesson.durationSec);
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-black select-none",
        isFullscreen ? "fixed inset-0 z-50 flex items-center" : "aspect-video"
      )}
      onClick={() => setShowControls((s) => (isPlaying ? true : s))}
    >
      {/* Fake video backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br from-indigo-950 via-slate-900 to-fuchsia-950",
          isFullscreen && "flex items-center justify-center"
        )}
      >
        <div className="absolute inset-0 opacity-30 mix-blend-overlay bg-[radial-gradient(circle_at_30%_20%,#a855f7,transparent_55%),radial-gradient(circle_at_80%_80%,#22d3ee,transparent_50%)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/40">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M8 20h8M12 18v2" />
            </svg>
            <p className="text-[11px] tracking-wide uppercase font-medium">{lesson.type} preview</p>
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex items-start justify-between p-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="min-w-0 pr-2">
          <p className="truncate text-[11px] font-medium text-white/60">{moduleTitle}</p>
          <p className="truncate text-sm font-semibold text-white">{lesson.title}</p>
        </div>
        {isFullscreen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(false);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
            aria-label="Exit fullscreen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Center play/pause */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsPlaying((p) => !p);
          }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md ring-1 ring-white/30 active:scale-90 transition-transform"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 space-y-1.5 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div
          className="group relative h-3 w-full cursor-pointer touch-none"
          onClick={(e) => {
            e.stopPropagation();
            handleScrub(e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            handleScrub(e);
          }}
        >
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white shadow"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsPlaying((p) => !p);
              }}
              className="flex h-7 w-7 items-center justify-center"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <span className="text-[11px] font-medium tabular-nums text-white/85">
              {formatTime(currentTime)} / {formatTime(lesson.durationSec)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeedMenu((s) => !s);
                }}
                className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold backdrop-blur-sm"
              >
                {speed}x
              </button>
              {showSpeedMenu && (
                <div
                  className="absolute bottom-8 right-0 z-10 w-16 overflow-hidden rounded-lg bg-neutral-900/95 shadow-xl ring-1 ring-white/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  {SPEED_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        setSpeed(opt);
                        setShowSpeedMenu(false);
                      }}
                      className={cn(
                        "block w-full px-3 py-1.5 text-left text-[11px] font-medium hover:bg-white/10",
                        opt === speed ? "text-cyan-300" : "text-white/80"
                      )}
                    >
                      {opt}x
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen((f) => !f);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 backdrop-blur-sm"
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M3 15h4a2 2 0 0 1 2 2v4M15 21v-4a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
