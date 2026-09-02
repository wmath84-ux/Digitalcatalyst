// src/course/AudioPlayer.tsx
//
// Custom audio player for the Course Player. Replaces the bare
// native <audio> element with a themed transport that matches the
// rest of the player (#090912 / violet-cyan accent).
//
// The card scales with the viewer stage (phone, every tablet width,
// landscape rails, desktop) so controls never clip or hide.

import { GlassSlider } from "../components/ui/glass-slider";
import { GlassButton } from "../components/ui/glass-button";
import { GlassSurface } from "../components/ui/glass";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, Repeat } from "lucide-react";

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

export default function AudioPlayer({ url, name, active = true, resumeAt = 0, onProgress }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [compact, setCompact] = useState(false);

  // Compact = short stage (landscape phone / tablet landscape rails) OR
  // a narrow split sheet. Artwork shrinks and the transport goes inline.
  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return;
    const measure = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      setCompact(h < 420 || w < 420 || (w > h && h < 520));
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

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

  const artSize = compact ? "h-12 w-12 sm:h-14 sm:w-14" : "h-[clamp(4.5rem,18vmin,7.5rem)] w-[clamp(4.5rem,18vmin,7.5rem)]";
  // Pack GlassButton discs, resized through their inner `.size-12` surface.
  const playSize = compact ? "[&_.size-12]:size-11" : "[&_.size-12]:size-[clamp(2.75rem,10vmin,3.5rem)]";
  const sideSize = compact ? "[&_.size-12]:size-9" : "[&_.size-12]:size-10";

  const equalizer = (
    <div className="flex items-end gap-1">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={`w-1 rounded-full bg-white sm:w-1.5 ${playing ? "animate-eq" : ""}`}
          style={{ height: playing ? undefined : `${6 + (bar % 3) * 3}px`, animationDelay: `${bar * 0.12}s` }}
        />
      ))}
    </div>
  );

  const seekBar = (
    <>
      {/* Wave 5: the seek bar is the registry slider (`data-course-audio-seek`
          stays, so the player contract still finds it). `max` falls back to 1
          while metadata is loading because the pack normalises by range. */}
      <GlassSlider
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onValueChange={seek}
        ariaLabel="Seek"
        data-course-audio-seek
        className="dc-slider-on-dark dc-slider-violet w-full min-w-0"
      />
      <div className="mt-1 flex items-center justify-between text-[10px] font-bold tabular-nums text-[var(--course-muted)] sm:mt-2">
        <span data-course-audio-current>{formatTime(currentTime)}</span>
        <span data-course-audio-duration>{formatTime(duration)}</span>
      </div>
    </>
  );

  const transport = (
    <div className={`flex shrink-0 items-center justify-center ${compact ? "gap-1.5" : "gap-2 sm:gap-3"}`} data-course-audio-transport>
      <GlassButton
        onClick={() => setLoop((value) => !value)}
        aria-label="Toggle loop"
        aria-pressed={loop}
        className={`${sideSize} ${loop ? "[&_svg]:text-violet-300" : ""}`}
        data-course-audio-loop
        data-active={loop ? "true" : "false"}
      >
        <Repeat size={compact ? 14 : 16} />
      </GlassButton>
      <GlassButton
        onClick={restart}
        aria-label="Restart"
        className={sideSize}
        data-course-audio-restart
      >
        <RotateCcw size={compact ? 14 : 16} />
      </GlassButton>
      <GlassButton
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className={`${playSize} [&_svg]:text-violet-200`}
        data-course-audio-play
        data-playing={playing ? "true" : "false"}
      >
        {playing ? <Pause size={compact ? 18 : 22} /> : <Play size={compact ? 18 : 22} className="ml-0.5" />}
      </GlassButton>
      <GlassButton
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.muted = !audio.muted;
          setMuted(audio.muted);
        }}
        aria-label="Toggle mute"
        className={sideSize}
        data-course-audio-mute
        data-muted={muted ? "true" : "false"}
      >
        {muted ? <VolumeX size={compact ? 14 : 16} /> : <Volume2 size={compact ? 14 : 16} />}
      </GlassButton>
    </div>
  );

  return (
    <div
      ref={surfaceRef}
      className="grid h-full min-h-0 w-full min-w-0 place-items-center overflow-hidden p-2 sm:p-4 md:p-6"
      data-course-viewer-audio
      data-orientation={compact ? "landscape" : "portrait"}
      data-compact={compact ? "true" : "false"}
    >
      {compact ? (
        <GlassSurface
          radius={24}
          className="w-full max-w-3xl min-w-0 text-white"
          contentClassName="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3.5"
          data-course-audio-player
        >
          <div className={`grid ${artSize} shrink-0 place-items-center rounded-2xl bg-violet-500/25`}>
            {equalizer}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-xs font-black text-[var(--course-text)] sm:text-sm" title={name}>{name}</p>
            <div className="mt-1">{seekBar}</div>
          </div>
          {transport}
        </GlassSurface>
      ) : (
        <GlassSurface
          radius={24}
          className="w-full max-w-[min(28rem,100%)] min-w-0 text-white"
          contentClassName="p-[clamp(1rem,3.5vmin,1.75rem)]"
          data-course-audio-player
        >
          <div className={`mx-auto grid ${artSize} place-items-center rounded-3xl bg-violet-500/25`}>
            {equalizer}
          </div>

          <p className="mt-4 truncate text-center text-sm font-black text-[var(--course-text)] sm:mt-5" title={name}>{name}</p>
          <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--course-muted)]">Now playing</p>

          <div className="mt-4 sm:mt-5">{seekBar}</div>
          <div className="mt-3 sm:mt-4">{transport}</div>
        </GlassSurface>
      )}

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
