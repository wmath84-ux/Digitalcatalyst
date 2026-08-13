// src/course/AudioPlayer.tsx
//
// Custom audio player for the Course Player. Replaces the bare
// native <audio> element with a themed transport that matches the
// rest of the player (#090912 / violet-cyan accent):
//
//   - Play / pause with an animated equalizer while playing.
//   - Seek bar (click / drag) with elapsed + total time.
//   - Mute toggle + loop toggle.
//   - Restart from the beginning.
//
// The underlying element stays a native <audio> so all codecs and
// streaming behaviour are handled by the browser.

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, Repeat } from "lucide-react";

interface AudioPlayerProps {
  url: string;
  name: string;
}

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function AudioPlayer({ url, name }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);

  // Reset when the track changes.
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [url]);

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

  return (
    <div className="grid h-full place-items-center bg-gradient-to-br from-slate-950 via-violet-950/40 to-slate-950 p-6" data-course-viewer-audio>
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur" data-course-audio-player>
        {/* Artwork / equalizer */}
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/30">
          <div className="flex items-end gap-1">
            {[0, 1, 2, 3, 4].map((bar) => (
              <span
                key={bar}
                className={`w-1.5 rounded-full bg-white ${playing ? "animate-eq" : ""}`}
                style={{ height: playing ? undefined : `${8 + (bar % 3) * 4}px`, animationDelay: `${bar * 0.12}s` }}
              />
            ))}
          </div>
        </div>

        <p className="mt-5 truncate text-center text-sm font-black text-white" title={name}>{name}</p>
        <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-wider text-white/35">Now playing</p>

        {/* Seek bar */}
        <div className="mt-5">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-violet-400"
            aria-label="Seek"
            data-course-audio-seek
          />
          <div className="mt-2 flex items-center justify-between text-[10px] font-bold tabular-nums text-white/40">
            <span data-course-audio-current>{formatTime(currentTime)}</span>
            <span data-course-audio-duration>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Transport controls */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setLoop((value) => !value)}
            aria-label="Toggle loop"
            className={`grid h-10 w-10 place-items-center rounded-full transition ${loop ? "bg-violet-500 text-white" : "bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"}`}
            data-course-audio-loop
            data-active={loop ? "true" : "false"}
          >
            <Repeat size={16} />
          </button>
          <button
            type="button"
            onClick={restart}
            aria-label="Restart"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white"
            data-course-audio-restart
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-lg shadow-violet-500/40 transition active:scale-95"
            data-course-audio-play
            data-playing={playing ? "true" : "false"}
          >
            {playing ? <Pause size={26} /> : <Play size={26} className="ml-1" />}
          </button>
          <button
            type="button"
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.muted = !audio.muted;
              setMuted(audio.muted);
            }}
            aria-label="Toggle mute"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white"
            data-course-audio-mute
            data-muted={muted ? "true" : "false"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        data-course-audio-element
      />
    </div>
  );
}
