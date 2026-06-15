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
  density?: 'comfortable' | 'compact';
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

const ProductMusicPlayer: React.FC<ProductMusicPlayerProps> = ({ product, tracks: providedTracks, title, variant = 'compact', className = '', initialTrackId, onError, density = 'comfortable' }) => {
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
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const swipeStartXRef = useRef<number | null>(null);
  const progressId = useId();

  const trackListKey = useMemo(() => tracks.map(track => `${track.id}:${track.url}`).join('|'), [tracks]);
  const activeTrack = tracks[activeIndex];
  const isFull = variant === 'full';
  const isCompactDensity = density === 'compact';
  const hasMultipleTracks = tracks.length > 1;

  useEffect(() => {
    if (tracks.length === 0) return;

    const requestedIndex = initialTrackId ? tracks.findIndex(track => track.id === initialTrackId) : -1;
    const nextIndex = requestedIndex >= 0 ? requestedIndex : 0;

    setActiveIndex(currentIndex => {
      const currentTrack = tracks[currentIndex];
      if (currentTrack && currentIndex === nextIndex) return currentIndex;
      return nextIndex;
    });
  }, [initialTrackId, trackListKey]);

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
    } else if (!audio.paused) {
      audio.pause();
    }
  }, [activeTrack?.url, isPlaying]);

  useEffect(() => {
    setIsDownloadMenuOpen(false);
  }, [activeIndex]);

  useEffect(() => {
    if (!isDownloadMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (downloadMenuRef.current?.contains(event.target as Node)) return;
      setIsDownloadMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isDownloadMenuOpen]);

  useEffect(() => {
    if (!isPlaying) return;
    let frameId = 0;

    const syncProgress = () => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
        if (Number.isFinite(audio.duration)) setDuration(audio.duration);
      }
      frameId = window.requestAnimationFrame(syncProgress);
    };

    frameId = window.requestAnimationFrame(syncProgress);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTrack?.url, isPlaying]);

  if (tracks.length === 0 || !activeTrack) return null;

  const goToTrack = (index: number) => {
    const nextIndex = (index + tracks.length) % tracks.length;
    if (nextIndex === activeIndex) return;
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

  const createDownloadFileName = (track: AudioTrack) => {
    const extensionFromUrl = track.url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
    const hasExtension = /\.[a-z0-9]{2,5}$/i.test(track.title);
    const safeTitle = (track.title || 'course-audio').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'course-audio';
    return hasExtension || !extensionFromUrl ? safeTitle : `${safeTitle}.${extensionFromUrl}`;
  };

  const startTrackDownload = async () => {
    if (typeof document === 'undefined') return;
    setIsDownloadMenuOpen(false);
    const fileName = createDownloadFileName(activeTrack);
    const link = document.createElement('a');
    link.download = fileName;
    link.rel = 'noopener noreferrer';

    let objectUrl = '';
    try {
      if (activeTrack.url.startsWith('data:') || activeTrack.url.startsWith('blob:')) {
        link.href = activeTrack.url;
      } else {
        const response = await fetch(activeTrack.url);
        if (!response.ok) throw new Error('Audio download failed');
        objectUrl = URL.createObjectURL(await response.blob());
        link.href = objectUrl;
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      link.href = activeTrack.url;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  };

  const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const beatLevel = isPlaying ? 0.45 + Math.abs(Math.sin(currentTime * 5.2)) * 0.38 + Math.abs(Math.sin(currentTime * 12.8)) * 0.36 : 0;
  const waveformBars = Array.from({ length: isFull ? 52 : 32 }, (_, index) => {
    const seed = activeTrack.id.charCodeAt(index % activeTrack.id.length) || 7;
    const base = 34 + Math.abs(Math.sin(index * 0.82 + seed)) * 42;
    const pulse = isPlaying ? Math.sin(currentTime * 8 + index * 0.62) * 24 * beatLevel : 0;
    return clamp(base + pulse, 18, 96);
  });

  const controlButtonClass = `${isCompactDensity ? 'h-9 w-9 text-sm' : 'h-11 w-11'} grid shrink-0 place-items-center rounded-full bg-[#071a32] text-[#d7fbff] shadow-[0_12px_30px_rgba(0,229,255,0.08)] transition hover:bg-[#0b2548]`;
  const cardSizeClass = isFull
    ? isCompactDensity
      ? 'h-24 w-24 sm:h-28 sm:w-28'
      : 'h-40 w-40 sm:h-52 sm:w-52 lg:h-56 lg:w-56 xl:h-64 xl:w-64'
    : 'h-32 w-32';
  const shellClass = isFull
    ? `${isCompactDensity ? 'flex flex-col justify-between gap-2 rounded-[1.5rem] p-3' : 'flex flex-col justify-between overflow-y-auto rounded-[2rem] p-5 sm:p-7 lg:p-8 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] xl:items-center xl:gap-8 custom-scrollbar'} h-full min-h-0`
    : 'rounded-3xl p-4';

  return (
    <section className={`relative overflow-hidden border border-[#142a4f] bg-[#030713] text-white shadow-[0_24px_70px_rgba(0,11,30,0.34)] ${shellClass} ${className}`} aria-label={`${fallbackTitle} music player`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_30%,rgba(0,174,255,0.56),transparent_30%),radial-gradient(circle_at_86%_34%,rgba(103,35,232,0.58),transparent_34%),radial-gradient(circle_at_52%_65%,rgba(15,23,42,0.22),transparent_34%),linear-gradient(180deg,rgba(4,8,20,0.08),rgba(2,6,18,0.92))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#020611] via-[#050814]/70 to-transparent" />

      <audio
        ref={audioRef}
        src={activeTrack.url}
        loop={isLooping}
        preload="metadata"
        onLoadedMetadata={event => {
          setDuration(event.currentTarget.duration || 0);
          setCurrentTime(event.currentTarget.currentTime || 0);
        }}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => (isLooping ? undefined : goToNext())}
        onError={onError}
      />

      <div className="relative z-10 min-w-0">
        <div className={`${isCompactDensity ? 'mb-1' : 'mb-4'} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-100/80">Aura Player</p>
            <h3 className={`${isCompactDensity ? 'hidden' : isFull ? 'text-2xl sm:text-3xl' : 'text-lg'} font-light tracking-tight`}><span className="font-black">AURA</span> PLAYER</h3>
          </div>
          <div className="flex items-center gap-2 text-white/85">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]">{tracks.length} track{tracks.length > 1 ? 's' : ''}</span>
            <div ref={downloadMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsDownloadMenuOpen(value => !value)}
                className="grid h-9 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-xl leading-none text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
                aria-haspopup="menu"
                aria-expanded={isDownloadMenuOpen}
                aria-label={`Open download menu for ${activeTrack.title}`}
              >
                •••
              </button>
              {isDownloadMenuOpen && (
                <div className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-2xl border border-cyan-100/30 bg-[#061329]/95 p-1.5 text-white shadow-[0_18px_45px_rgba(0,0,0,0.42)] backdrop-blur-xl" role="menu">
                  <button
                    type="button"
                    onClick={startTrackDownload}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-black uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/15"
                    role="menuitem"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-cyan-100 text-slate-950">↓</span>
                    Download music
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`${isFull ? isCompactDensity ? 'flex min-h-0 items-center justify-center gap-3 py-1' : 'flex flex-1 items-center justify-center gap-4 py-5 sm:gap-6 lg:min-h-[14rem] xl:min-h-[18rem]' : 'flex items-center justify-center gap-3 py-1'} overflow-hidden`} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} title="Swipe left or right to switch audio">
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
                className={`${isActive ? `${cardSizeClass} opacity-100` : 'h-28 w-28 opacity-55 blur-[0.5px]'} relative shrink-0 overflow-hidden rounded-[1.8rem] border transition-all duration-300 ${isActive ? 'border-cyan-50/90 shadow-[0_0_46px_rgba(56,189,248,0.82),0_0_64px_rgba(109,40,217,0.48)]' : 'border-white/30'} bg-white/10`}
                style={isActive && isPlaying ? { transform: `scale(${1 + beatLevel * 0.065})`, boxShadow: `0 0 ${48 + beatLevel * 42}px rgba(56,189,248,0.86), 0 0 ${62 + beatLevel * 48}px rgba(109,40,217,0.55)` } : undefined}
                aria-label={`Play ${track.title}`}
              >
                <img src={track.cover} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                {isActive && isPlaying && (
                  <>
                    <span className="absolute inset-0 bg-cyan-300/10 mix-blend-screen" style={{ opacity: beatLevel * 0.45 }} />
                    <span className="absolute inset-3 rounded-[1.35rem] border border-white/50" style={{ transform: `scale(${1 + beatLevel * 0.14})`, opacity: 0.28 + beatLevel * 0.42 }} />
                  </>
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/10 to-transparent" />
                <span className="absolute bottom-3 left-3 right-3 text-left">
                  <span className="block truncate text-sm font-black uppercase tracking-wide">{track.title}</span>
                  {isActive && <span className="block truncate text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-100">{track.subtitle}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {hasMultipleTracks && !isCompactDensity && (
          <div className="mt-2 flex justify-center gap-2" aria-hidden="true">
            {tracks.map((track, index) => <span key={`${track.id}-dot`} className={`h-2 rounded-full transition-all ${index === activeIndex ? 'w-5 bg-white' : 'w-2 bg-white/35'}`} />)}
          </div>
        )}
      </div>

      <div className={`relative z-10 min-w-0 ${isCompactDensity ? 'mt-0' : 'mt-5 lg:mt-0'}`}>
        <div className={`overflow-hidden border border-[#163052] bg-[#020713]/72 shadow-[inset_0_1px_0_rgba(215,251,255,0.16)] backdrop-blur-2xl ${isCompactDensity ? 'rounded-[1.25rem] p-3' : 'rounded-[1.75rem] p-5 sm:p-6'}`}>
          <div className={`${isCompactDensity ? 'mb-2' : 'mb-3'} min-w-0`}>
            <p className={`${isCompactDensity ? 'text-sm' : 'text-lg'} truncate font-black uppercase tracking-wide`}>{activeTrack.title}</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100/80 sm:text-xs">{activeTrack.subtitle}</p>
          </div>

          <label className="sr-only" htmlFor={progressId}>Audio progress</label>
          <div className="relative overflow-hidden rounded-2xl border border-[#081a31] bg-[#050710]/85 px-3 py-3 shadow-[inset_0_1px_10px_rgba(0,229,255,0.08)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_var(--wave-progress)_50%,rgba(0,197,255,0.38),transparent_26%),linear-gradient(90deg,rgba(0,123,255,0.20),rgba(79,20,159,0.16),rgba(2,6,18,0.12))]" style={{ ['--wave-progress' as string]: `${progress * 100}%` }} />
            <div className={`relative flex items-center gap-1 ${isCompactDensity ? 'h-10' : 'h-16 sm:h-20'}`} aria-hidden="true">
              {waveformBars.map((height, index) => {
                const barProgress = waveformBars.length <= 1 ? 1 : index / (waveformBars.length - 1);
                const isFilled = barProgress <= progress;
                return (
                  <span
                    key={`${activeTrack.id}-wave-${index}`}
                    className={`flex-1 rounded-full transition-all duration-150 ${isFilled ? 'bg-gradient-to-t from-[#aafaff] via-[#58c7ff] to-[#1f6bff] shadow-[0_0_12px_rgba(0,229,255,0.55)]' : 'bg-[#10233f]/55'}`}
                    style={{ height: `${isFilled ? height : Math.max(14, height * 0.42)}%`, opacity: isFilled ? 0.96 : 0.42 }}
                  />
                );
              })}
            </div>
            <input
              id={progressId}
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={clamp(currentTime, 0, duration || 0)}
              onChange={handleScrub}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-bold text-white/75">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className={`${isCompactDensity ? 'mt-2' : 'mt-4'} flex flex-wrap items-center justify-center gap-2`}>
            <button type="button" onClick={() => setIsLooping(value => !value)} className={`${controlButtonClass} ${isLooping ? 'bg-white text-slate-950 hover:bg-white' : ''}`} aria-label="Toggle repeat">↻</button>
            {hasMultipleTracks && (
              <>
                <button type="button" onClick={() => setIsShuffling(value => !value)} className={`${controlButtonClass} ${isShuffling ? 'bg-white text-slate-950 hover:bg-white' : ''}`} aria-label="Toggle shuffle">⌘</button>
                <button type="button" onClick={() => goToTrack(activeIndex - 1)} className={controlButtonClass} aria-label="Previous track">◀</button>
              </>
            )}
            <button type="button" onClick={() => setIsPlaying(value => !value)} className={`${isCompactDensity ? 'h-12 w-12 text-xl' : 'h-16 w-16 text-2xl'} grid shrink-0 place-items-center rounded-full bg-[#d7fbff] font-black text-[#020611] shadow-[0_0_34px_rgba(215,251,255,0.68)] transition hover:scale-105`} aria-label={isPlaying ? 'Pause audio' : 'Play audio'}>{isPlaying ? 'Ⅱ' : '▶'}</button>
            {hasMultipleTracks && <button type="button" onClick={goToNext} className={controlButtonClass} aria-label="Next track">▶</button>}
            <button type="button" onClick={() => setIsMuted(value => !value)} className={controlButtonClass} aria-label="Toggle mute">{isMuted ? '🔇' : '🔊'}</button>
            <label className={`${isFull ? 'flex basis-full justify-center pt-1' : 'hidden sm:flex'} items-center gap-2 text-xs font-bold text-white/75`}>
              <span>Vol</span>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} className={`${isFull ? 'w-36' : 'w-16'} accent-[#d7fbff]`} aria-label="Volume" />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProductMusicPlayer;
