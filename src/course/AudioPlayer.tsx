// src/course/AudioPlayer.tsx
//
// Course Player audio — the AI Canvas "Glass Music Player"
// (https://aicanvas.me/components/glass-music-player), colour / look /
// animation exact:
//   · card: w-320 rounded-[32px], background rgba(12,10,14,0.55), hairline
//     border, `0 24px 64px rgba(0,0,0,0.55)` + inset top-light, a SEPARATE
//     z-[-1] blur layer (blur 48 / saturate 1.6) and the left-12/right-12
//     top highlight line,
//   · entrance {y:24, scale:0.95} → {y:0, scale:1}, spring 200/22,
//   · spinning vinyl: ambient colour glow (blur 28, opacity .18, scale 1.15),
//     176 px disc with the radial-gradient face, four rings at
//     [1, .78, .58, .38] and the glowing centre hole; the inner disc rotates
//     360° on a 4 s linear infinite loop only while playing,
//   · track info swaps with the blur-fade spring, progress bar is a 3 px
//     track with a `${color}70 → ${color}dd` gradient fill,
//   · controls row: shuffle · skip-back · 52 px radial play/pause with the
//     colour-matched glow · skip-forward · queue, with the exact hover/tap
//     springs and the AnimatePresence play/pause icon swap.
//
// The colour accent is derived per track so each lesson gets its own hue,
// exactly like the reference's per-track colour.
//
// All playback behaviour is unchanged: resume position, progress reporting,
// pause-when-hidden (`active` prop), loop / mute, and every
// `data-course-audio-*` contract attribute carries over. Skip-back/forward
// are wired to −15 s / +15 s seeks (there is one track in a lesson), and the
// pagination dots became a 3-segment position indicator for the same reason.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { ArrowLeft, Heart, Pause, Play, Repeat, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

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

/** The reference's track palette — one hue per track, picked from the name. */
const TRACK_COLORS = ["#FF6BF5", "#06D6A0", "#FF7B54"] as const;
const colorForTrack = (key: string) => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TRACK_COLORS[hash % TRACK_COLORS.length];
};

const SKIP_SECONDS = 15;

export default function AudioPlayer({ url, name, active = true, resumeAt = 0, onProgress }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [liked, setLiked] = useState(false);

  const color = useMemo(() => colorForTrack(url || name), [url, name]);

  const resumeRef = useRef(resumeAt);
  const resumeApplied = useRef(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  // Progress is a motion value so the bar's fill animates on its own
  // timeline (same as the reference) instead of re-rendering per frame.
  const progressMV = useMotionValue(0);
  const barWidth = useTransform(progressMV, (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`);
  useEffect(() => {
    progressMV.set(duration > 0 ? currentTime / duration : 0);
  }, [currentTime, duration, progressMV]);

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
    const next = Math.max(0, Math.min(duration || audio.duration || 0, value));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const skipTo = (dir: -1 | 1) => seek(currentTime + dir * SKIP_SECONDS);

  // ── Seek by pointer on the progress bar (tap or drag) ───────────────────
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

  const ratio = duration > 0 ? currentTime / duration : 0;
  // The reference's pagination dots become a 3-segment position indicator:
  // a lesson has one track, so the dots show which third is playing.
  const segment = Math.min(2, Math.floor(ratio * 3));

  return (
    <div
      className="grid h-full min-h-0 w-full min-w-0 place-items-center overflow-auto p-3 sm:p-5"
      data-course-viewer-audio
      data-compact="false"
    >
      <motion.div
        initial={{ y: 24, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
        className="relative isolate w-[320px] max-w-full overflow-hidden rounded-[32px]"
        style={{
          background: "rgba(12,10,14,0.55)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
        }}
        data-course-audio-player
        data-playing={playing ? "true" : "false"}
      >
        {/* Separate blur layer — never re-blurs while the disc spins. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[-1]"
          style={{ backdropFilter: "blur(48px) saturate(1.6)", WebkitBackdropFilter: "blur(48px) saturate(1.6)" }}
        />
        {/* Top highlight line. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-12 right-12 top-0 h-[1px]"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }}
        />

        <div className="flex flex-col items-center px-7 pb-7 pt-6">
          {/* 1) Top bar */}
          <div className="mb-6 flex w-full items-center justify-between">
            <motion.button
              type="button"
              aria-label="Rewind 15 seconds"
              onClick={() => skipTo(-1)}
              whileHover={{ scale: 1.15, color: "rgba(255,255,255,0.8)" }}
              whileTap={{ scale: 0.85 }}
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              <ArrowLeft size={20} />
            </motion.button>
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Now Playing
            </span>
            <motion.button
              type="button"
              aria-label="Like"
              aria-pressed={liked}
              onClick={() => setLiked((value) => !value)}
              animate={{ color: liked ? color : "rgba(255,255,255,0.35)" }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.85 }}
            >
              <Heart size={20} fill={liked ? color : "transparent"} />
            </motion.button>
          </div>

          {/* 2) Album disc */}
          <AnimatePresence mode="wait">
            <motion.div
              key={url}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="relative mb-7"
            >
              <div
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ background: color, opacity: 0.18, filter: "blur(28px)", transform: "scale(1.15)" }}
              />
              <div
                className="relative flex h-44 w-44 items-center justify-center rounded-full"
                style={{
                  background: `radial-gradient(circle at 38% 35%, ${color}28, ${color}08 60%, transparent)`,
                  border: `1.5px solid ${color}25`,
                  boxShadow: `0 0 0 8px rgba(255,255,255,0.03), 0 12px 40px rgba(0,0,0,0.5)`,
                }}
                data-course-audio-disc
              >
                <motion.div
                  animate={{ rotate: playing ? 360 : 0 }}
                  transition={playing ? { duration: 4, repeat: Infinity, ease: "linear" } : { duration: 0.3 }}
                  className="relative h-28 w-28"
                >
                  {[1, 0.78, 0.58, 0.38].map((scale, index) => (
                    <div
                      key={scale}
                      aria-hidden
                      className="absolute inset-0 rounded-full"
                      style={{
                        transform: `scale(${scale})`,
                        border: `1px solid ${color}${index === 0 ? "30" : index === 1 ? "1e" : "14"}`,
                      }}
                    />
                  ))}
                  <div
                    aria-hidden
                    className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      background: `radial-gradient(circle, ${color}cc, ${color}66)`,
                      boxShadow: `0 0 10px ${color}55`,
                    }}
                  />
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* 3) Track info */}
          <AnimatePresence mode="wait">
            <motion.div
              key={url}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ type: "spring", duration: 0.4, bounce: 0 }}
              className="mb-4 flex w-full flex-col items-center gap-1"
            >
              <h3 className="max-w-full truncate text-lg font-bold tracking-tight text-white/95" title={name}>
                {name}
              </h3>
              <p className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.38)" }}>
                {playing ? "Playing" : "Paused"}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* 4) Position dots */}
          <div className="mb-5 flex items-center gap-[7px]">
            {[0, 1, 2].map((index) => (
              <motion.button
                key={index}
                type="button"
                aria-label={`Jump to part ${index + 1}`}
                onClick={() => seek(((index + 0.001) / 3) * duration)}
                animate={{
                  width: index === segment ? 20 : 5,
                  opacity: index === segment ? 0.5 : 0.22,
                  backgroundColor: index === segment ? color : "#ffffff",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                className="h-[5px] cursor-pointer rounded-full"
                style={{ minWidth: 5 }}
              />
            ))}
          </div>

          {/* 5) Progress bar — also the seek control */}
          <div className="mb-5 w-full">
            <div
              ref={seekZoneRef}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration) || 1}
              aria-valuenow={Math.round(currentTime)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") seek(currentTime + 5);
                if (event.key === "ArrowLeft") seek(currentTime - 5);
              }}
              onPointerDown={onSeekPointerDown}
              onPointerMove={onSeekPointerMove}
              onPointerUp={onSeekPointerUp}
              onPointerCancel={onSeekPointerUp}
              className="relative h-[3px] w-full cursor-pointer touch-none select-none overflow-hidden rounded-full"
              style={{ background: "rgba(255,255,255,0.07)" }}
              data-course-audio-seek
            >
              <motion.div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ width: barWidth, background: `linear-gradient(90deg, ${color}70, ${color}dd)` }}
                data-course-audio-seek-fill
              />
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-[10px] font-medium tabular-nums" style={{ color: "rgba(255,255,255,0.28)" }} data-course-audio-current>
                {formatTime(currentTime)}
              </span>
              <span className="text-[10px] font-medium tabular-nums" style={{ color: "rgba(255,255,255,0.28)" }} data-course-audio-duration>
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* 6) Controls */}
          <div className="flex w-full items-center justify-between">
            <motion.button
              type="button"
              aria-label="Toggle loop"
              aria-pressed={loop}
              onClick={() => setLoop((value) => !value)}
              animate={{ color: loop ? color : "rgba(255,255,255,0.35)" }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.15, color: loop ? color : "rgba(255,255,255,0.75)" }}
              whileTap={{ scale: 0.85 }}
              data-course-audio-loop
              data-active={loop ? "true" : "false"}
            >
              <Repeat size={19} />
            </motion.button>

            <motion.button
              type="button"
              aria-label="Back 15 seconds"
              onClick={() => skipTo(-1)}
              style={{ color: "rgba(255,255,255,0.65)" }}
              whileHover={{ scale: 1.12, color: "rgba(255,255,255,0.95)" }}
              whileTap={{ scale: 0.9 }}
              data-course-audio-restart
            >
              <SkipBack size={26} fill="currentColor" />
            </motion.button>

            <motion.button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              animate={{
                background: `radial-gradient(circle at 38% 35%, ${color}ee, ${color}99)`,
                boxShadow: `0 4px 20px ${color}55, 0 0 0 1px ${color}33`,
              }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.07 }}
              whileTap={{ scale: 0.92 }}
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full"
              data-course-audio-play
              data-playing={playing ? "true" : "false"}
            >
              <AnimatePresence mode="wait">
                <motion.span
                  key={playing ? "pause" : "play"}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="grid place-items-center text-white"
                >
                  {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
                </motion.span>
              </AnimatePresence>
            </motion.button>

            <motion.button
              type="button"
              aria-label="Forward 15 seconds"
              onClick={() => skipTo(1)}
              style={{ color: "rgba(255,255,255,0.65)" }}
              whileHover={{ scale: 1.12, color: "rgba(255,255,255,0.95)" }}
              whileTap={{ scale: 0.9 }}
            >
              <SkipForward size={26} fill="currentColor" />
            </motion.button>

            <motion.button
              type="button"
              aria-label="Toggle mute"
              aria-pressed={muted}
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.muted = !audio.muted;
                setMuted(audio.muted);
              }}
              animate={{ color: muted ? color : "rgba(255,255,255,0.35)" }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.15, color: muted ? color : "rgba(255,255,255,0.75)" }}
              whileTap={{ scale: 0.85 }}
              data-course-audio-mute
              data-muted={muted ? "true" : "false"}
            >
              {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </motion.button>
          </div>
        </div>
      </motion.div>

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
