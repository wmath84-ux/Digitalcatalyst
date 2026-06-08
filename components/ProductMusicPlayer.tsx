import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CourseModule, ProductFile, ProductWithRating } from '../App';

type PlayerVariant = 'compact' | 'full';

export type AudioTrack = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  cover: string;
};

interface ProductMusicPlayerProps {
  product?: ProductWithRating;
  tracks?: AudioTrack[];
  title?: string;
  variant?: PlayerVariant;
  className?: string;
  initialTrackId?: string;
  onError?: () => void;
}

const isPlayableAudioFile = (file: ProductFile): boolean => file.type === 'audio' && Boolean(file.url);

const collectAudioFiles = (modules: CourseModule[] = [], moduleTrail: string[] = []): AudioTrack[] => {
  return modules.flatMap(module => {
    const currentTrail = [...moduleTrail, module.title].filter(Boolean);
    const moduleFiles = (module.files || [])
      .filter(isPlayableAudioFile)
      .map(file => ({
        id: file.id,
        title: file.name || 'Untitled audio',
        subtitle: currentTrail.join(' • ') || 'Music / podcast',
        url: file.url,
        cover: '',
      }));

    return [...moduleFiles, ...collectAudioFiles(module.modules || [], currentTrail)];
  });
};

export const getProductAudioTracks = (product: ProductWithRating): AudioTrack[] => {
  const covers = (product.images || []).filter(Boolean);
  return collectAudioFiles(product.courseContent || []).map((track, index) => ({
    ...track,
    cover: covers[index % Math.max(covers.length, 1)] || `https://picsum.photos/seed/${product.imageSeed || product.id}-${index}/600/600`,
  }));
};

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const ProductMusicPlayer: React.FC<ProductMusicPlayerProps> = ({ product, tracks: providedTracks, title, variant = 'compact', className = '', initialTrackId, onError }) => {
  const fallbackTitle = title || product?.title || 'Course audio';
  const fallbackCoverSeed = product?.imageSeed || product?.id || 'course-audio';
  const tracks = useMemo(() => {
    if (providedTracks) {
      return providedTracks.map((track, index) => ({
        ...track,
        cover: track.cover || `https://picsum.photos/seed/${fallbackCoverSeed}-${index}/600/600`,
      }));
    }

    return product ? getProductAudioTracks(product) : [];
  }, [fallbackCoverSeed, product, providedTracks]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const progressId = useId();

  const activeTrack = tracks[activeIndex];
  const isFull = variant === 'full';
  const hasMultipleTracks = tracks.length > 1;

  useEffect(() => {
    const requestedIndex = initialTrackId ? tracks.findIndex(track => track.id === initialTrackId) : -1;
    setActiveIndex(requestedIndex >= 0 ? requestedIndex : 0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [fallbackTitle, initialTrackId, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [isMuted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [activeIndex, isPlaying]);

  if (tracks.length === 0 || !activeTrack) return null;

  const goToTrack = (index: number) => {
    const nextIndex = (index + tracks.length) % tracks.length;
    setActiveIndex(nextIndex);
    setCurrentTime(0);
  };

  const goToNext = () => {
    if (isShuffling && tracks.length > 1) {
      const nextIndex = (activeIndex + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length;
      goToTrack(nextIndex);
      return;
    }
    goToTrack(activeIndex + 1);
  };

  const handleScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current) audioRef.current.currentTime = nextTime;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    swipeStartXRef.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (swipeStartXRef.current === null) return;
    const deltaX = event.clientX - swipeStartXRef.current;
    swipeStartXRef.current = null;
    if (Math.abs(deltaX) < 48 || tracks.length < 2) return;
    if (deltaX < 0) goToNext();
    else goToTrack(activeIndex - 1);
  };

  const controlButtonClass = 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20';
  const cardSizeClass = isFull ? 'h-44 w-44 sm:h-52 sm:w-52 lg:h-56 lg:w-56 xl:h-64 xl:w-64' : 'h-28 w-28';
  const shellClass = isFull
    ? 'flex min-h-[32rem] flex-col justify-between rounded-[2rem] p-5 sm:p-7 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-center lg:gap-8 xl:p-10'
    : 'rounded-3xl p-4';

  return (
    <section className={`relative overflow-hidden border border-white/40 bg-slate-950 text-white shadow-[0_24px_70px_rgba(15,23,42,0.20)] ${shellClass} ${className}`} aria-label={`${fallbackTitle} music player`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.36),transparent_32%),radial-gradient(circle_at_88%_24%,rgba(217,70,239,0.36),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.2),rgba(8,47,73,0.62))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-cyan-950/80 via-slate-900/10 to-transparent" />

      <audio
        ref={audioRef}
        src={activeTrack.url}
        loop={isLooping}
        preload="metadata"
        onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => (isLooping ? undefined : goToNext())}
        onError={onError}
      />

      <div className="relative z-10 min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-100/80">Aura Player</p>
            <h3 className={`${isFull ? 'text-2xl sm:text-3xl' : 'text-lg'} font-light tracking-tight`}><span className="font-black">AURA</span> PLAYER</h3>
          </div>
          <div className="flex items-center gap-2 text-white/85">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]">{tracks.length} track{tracks.length > 1 ? 's' : ''}</span>
            <span className="text-2xl leading-none">•••</span>
          </div>
        </div>

        <div className={`${isFull ? 'flex flex-1 items-center justify-center gap-4 py-6 sm:gap-6 lg:min-h-[18rem] xl:min-h-[22rem]' : 'flex items-center justify-center gap-3 py-1'} overflow-hidden`} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} title="Swipe left or right to switch audio">
          {tracks.map((track, index) => {
            const distance = Math.abs(index - activeIndex);
            const circularDistance = Math.min(distance, tracks.length - distance);
            const isActive = index === activeIndex;
            const isNeighbor = circularDistance === 1;
            if (!isActive && !isNeighbor && tracks.length > 3) return null;

            return (
              <button
                key={track.id}
                type="button"
                onClick={() => goToTrack(index)}
                className={`${isActive ? `${cardSizeClass} opacity-100` : 'h-24 w-24 opacity-55 blur-[0.5px]'} relative shrink-0 overflow-hidden rounded-[1.6rem] border transition-all duration-300 ${isActive ? 'border-white/80 shadow-[0_0_32px_rgba(125,211,252,0.65),0_0_46px_rgba(217,70,239,0.35)]' : 'border-white/30'} bg-white/10`}
                aria-label={`Play ${track.title}`}
              >
                <img src={track.cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/10 to-transparent" />
                <span className="absolute bottom-3 left-3 right-3 text-left">
                  <span className="block truncate text-sm font-black uppercase tracking-wide">{track.title}</span>
                  {isActive && <span className="block truncate text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-100">{track.subtitle}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {hasMultipleTracks && (
          <div className="mt-2 flex justify-center gap-2" aria-hidden="true">
            {tracks.map((track, index) => <span key={`${track.id}-dot`} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-5 bg-white' : 'w-2 bg-white/35'}`} />)}
          </div>
        )}
      </div>

      <div className="relative z-10 mt-5 min-w-0 lg:mt-0">
        <div className="overflow-hidden rounded-[1.75rem] border border-white/20 bg-white/12 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-2xl sm:p-6">
          <div className="mb-3 min-w-0">
            <p className="truncate text-lg font-black uppercase tracking-wide">{activeTrack.title}</p>
            <p className="truncate text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100/80">{activeTrack.subtitle}</p>
          </div>

          <label className="sr-only" htmlFor={progressId}>Audio progress</label>
          <input
            id={progressId}
            type="range"
            min="0"
            max={duration || 0}
            step="1"
            value={clamp(currentTime, 0, duration || 0)}
            onChange={handleScrub}
            className="h-1 w-full accent-white"
          />
          <div className="mt-1 flex justify-between text-xs font-bold text-white/75">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setIsLooping(value => !value)} className={`${controlButtonClass} ${isLooping ? 'bg-white text-slate-950 hover:bg-white' : ''}`} aria-label="Toggle repeat">↻</button>
            {hasMultipleTracks && (
              <>
                <button type="button" onClick={() => setIsShuffling(value => !value)} className={`${controlButtonClass} ${isShuffling ? 'bg-white text-slate-950 hover:bg-white' : ''}`} aria-label="Toggle shuffle">⌘</button>
                <button type="button" onClick={() => goToTrack(activeIndex - 1)} className={controlButtonClass} aria-label="Previous track">◀</button>
              </>
            )}
            <button type="button" onClick={() => setIsPlaying(value => !value)} className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white text-2xl font-black text-slate-950 shadow-[0_0_30px_rgba(255,255,255,0.55)] transition hover:scale-105" aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>{isPlaying ? 'Ⅱ' : '▶'}</button>
            {hasMultipleTracks && <button type="button" onClick={goToNext} className={controlButtonClass} aria-label="Next track">▶</button>}
            <button type="button" onClick={() => setIsMuted(value => !value)} className={controlButtonClass} aria-label="Toggle mute">{isMuted ? '🔇' : '🔊'}</button>
            <label className={`${isFull ? 'flex basis-full justify-center pt-1' : 'hidden sm:flex'} items-center gap-2 text-xs font-bold text-white/75`}>
              <span>Vol</span>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} className={`${isFull ? 'w-36' : 'w-16'} accent-white`} aria-label="Volume" />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductMusicPlayer;
