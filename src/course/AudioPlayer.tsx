// src/course/AudioPlayer.tsx
//
// Course Player audio — rebuilt on the aicanvas.me "Upload Progress" widget
// (https://aicanvas.me/components/upload-progress). The old glass transport
// card is gone; the track now plays inside the reference's collapsible light
// card: title + status subtitle on the left, circular actions top-right, and
// a 6px shimmer progress bar flush along the card's bottom edge — indigo with
// a continuous shimmer sweep while playing, amber (shimmer frozen) while
// paused. The bottom bar doubles as the seek control (tap / drag anywhere on
// it). Expanding the card reveals the track row with its own 3px bar plus the
// loop and mute toggles.
//
// All playback behaviour is unchanged: resume position, progress reporting,
// pause-when-hidden (`active` prop) and the `data-course-audio-*` contract
// attributes all carry over.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronsDownUp, ChevronsUpDown, Pause, Play, Repeat, RotateCcw, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerProps {
  url: string;
  name: string;
  /**
   * False while the track is mounted but hidden behind another module. An
   * inactive player pauses immediately and banks its position so returning
   * to the lesson continues from the same second.
   */
  active?: boolean;
  /** Seconds to resume from when the track mounts. */
  resumeAt?: number;
  /** Reports the live position so the Course Player can persist it. */
  onProgress?: (position: number, duration: number) => void;
}

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const FILL_PLAYING = "#6366f1"; // indigo while playing
const FILL_PAUSED = "#f59e0b"; // amber on pause
const CARD_SHADOW = "0px 16px 56px rgba(0,0,0,0.25)";
const heightSpring = { type: "spring", stiffness: 380, damping: 38 } as const;

/** 36px circle action — bg #ededea, icon #6c6c6c, spring hover/tap. */
function CircleButton({
  label,
  onClick,
  children,
  activeTint = false,
  dataAttrs,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  activeTint?: boolean;
  dataAttrs?: Record<string, string | undefined>;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        activeTint ? "bg-indigo-100 text-indigo-600" : "bg-[#ededea] text-[#6c6c6c]"
      }`}
      {...(dataAttrs ?? {})}
    >
      {children}
    </motion.button>
  );
}

export default function AudioPlayer({ url, name, active = true, resumeAt = 0, onProgress }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const resumeRef = useRef(resumeAt);
  const resumeApplied = useRef(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    resumeApplied.current = false;
  }, [url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || active) return;
    progressRef.current?.(audio.currentTime || 0, audio.duration || 0);
    audio.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else void audio.play();
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    if (!playing) void audio.play();
  };

  // ── Seek by pointer on the bottom bar (tap or drag) ─────────────────────
  const seekZoneRef = useRef<HTMLDivElement>(null);
  const seekDragRef = useRef<number | null>(null);
  const seekFromPointer = (clientX: number) => {
    const zone = seekZoneRef.current;
    if (!zone || !duration) return;
    const rect = zone.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };
  const onSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    seekDragRef.current = event.pointerId;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* fine without capture */ }
    seekFromPointer(event.clientX);
  };
  const onSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (seekDragRef.current !== event.pointerId) return;
    seekFromPointer(event.clientX);
  };
  const onSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (seekDragRef.current !== event.pointerId) return;
    seekDragRef.current = null;
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
  };

  const percent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const remaining = Math.max(0, duration - currentTime);
  const fillColor = playing ? FILL_PLAYING : FILL_PAUSED;
  const status = playing ? "Playing" : "Paused";

  return (
    <div
      className="grid h-full min-h-0 w-full min-w-0 place-items-center overflow-hidden p-3 sm:p-5"
      data-course-viewer-audio
      data-compact="false"
    >
      <div
        className="relative w-full max-w-[480px] overflow-hidden bg-[#f1f1f0] text-[#1a1a19]"
        style={{ borderRadius: 28, boxShadow: CARD_SHADOW }}
        data-course-audio-player
        data-playing={playing ? "true" : "false"}
      >
        {/* ── Header row: title + subtitle left, circular actions right ── */}
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-bold leading-snug" title={name}>{name}</h3>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={status}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="mt-0.5 whitespace-nowrap text-sm font-medium text-[#6c6c6c]"
              >
                <span data-course-audio-current>{formatTime(currentTime)}</span>
                {" / "}
                <span data-course-audio-duration>{formatTime(duration)}</span>
                {" · "}
                {status}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CircleButton
              label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              dataAttrs={{ "data-course-audio-play": "", "data-playing": playing ? "true" : "false" }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={playing ? "pause" : "play"}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.14 }}
                  className="grid place-items-center"
                >
                  {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </motion.span>
              </AnimatePresence>
            </CircleButton>
            <CircleButton label="Restart" onClick={restart} dataAttrs={{ "data-course-audio-restart": "" }}>
              <RotateCcw size={15} />
            </CircleButton>
            <CircleButton
              label={expanded ? "Collapse" : "Expand"}
              onClick={() => setExpanded((value) => !value)}
              dataAttrs={{ "data-course-audio-expand": "", "data-expanded": expanded ? "true" : "false" }}
            >
              {expanded ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
            </CircleButton>
          </div>
        </div>

        {/* ── Expanded: track row + loop / mute toggles ── */}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: heightSpring, opacity: { duration: 0.16 } }}
            >
              <div className="mx-6 h-px bg-black/[0.07]" aria-hidden="true" />
              <div className="px-5 py-4 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-bold" title={name}>{name}</p>
                  <p className="shrink-0 whitespace-nowrap text-xs font-medium text-[#6c6c6c]">
                    {Math.round(percent)}% · {formatTime(remaining)} left
                  </p>
                </div>
                <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[#e4e4dc]">
                  <motion.div
                    className="h-full rounded-full"
                    initial={false}
                    animate={{ width: `${percent}%`, backgroundColor: fillColor }}
                    transition={{ width: { duration: 0.2, ease: "linear" }, backgroundColor: { duration: 0.35 } }}
                  />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <CircleButton
                    label="Toggle loop"
                    onClick={() => setLoop((value) => !value)}
                    activeTint={loop}
                    dataAttrs={{ "data-course-audio-loop": "", "data-active": loop ? "true" : "false" }}
                  >
                    <Repeat size={15} />
                  </CircleButton>
                  <CircleButton
                    label="Toggle mute"
                    onClick={() => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      audio.muted = !audio.muted;
                      setMuted(audio.muted);
                    }}
                    activeTint={muted}
                    dataAttrs={{ "data-course-audio-mute": "", "data-muted": muted ? "true" : "false" }}
                  >
                    {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </CircleButton>
                  <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-[#9a9a94]">
                    {loop ? "Loop on" : "Loop off"} · {muted ? "Muted" : "Sound on"}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Bottom shimmer bar — the seek control ──
            6px, full width, flush at the card bottom. Indigo + shimmer while
            playing, amber with a frozen shimmer when paused. The invisible
            zone above it widens the touch target for scrubbing. */}
        <div
          ref={seekZoneRef}
          className="relative mt-1 h-6 w-full cursor-pointer touch-none select-none"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 1}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") seek(Math.min(duration, currentTime + 5));
            if (event.key === "ArrowLeft") seek(Math.max(0, currentTime - 5));
          }}
          onPointerDown={onSeekPointerDown}
          onPointerMove={onSeekPointerMove}
          onPointerUp={onSeekPointerUp}
          onPointerCancel={onSeekPointerUp}
          data-course-audio-seek
        >
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[#e4e4dc]">
            <motion.div
              className="relative h-full overflow-hidden"
              initial={false}
              animate={{ width: `${percent}%`, backgroundColor: fillColor }}
              transition={{ width: { duration: 0.18, ease: "linear" }, backgroundColor: { duration: 0.35 } }}
              data-course-audio-seek-fill
            >
              <motion.span
                aria-hidden="true"
                className="absolute inset-0"
                style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.35), transparent)" }}
                animate={playing ? { x: ["-100%", "100%"] } : { x: "-100%" }}
                transition={playing
                  ? { duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }
                  : { duration: 0.2 }}
              />
            </motion.div>
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={(event) => {
          setPlaying(false);
          progressRef.current?.(event.currentTarget.currentTime, event.currentTarget.duration || 0);
        }}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const audio = event.currentTarget;
          setDuration(audio.duration || 0);
          if (!resumeApplied.current && resumeRef.current > 0) {
            audio.currentTime = Math.min(resumeRef.current, Math.max(0, (audio.duration || 0) - 1));
            setCurrentTime(audio.currentTime);
          }
          resumeApplied.current = true;
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          progressRef.current?.(event.currentTarget.currentTime, event.currentTarget.duration || 0);
        }}
        data-course-audio-element
      />
    </div>
  );
}
