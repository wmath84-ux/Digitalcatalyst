// src/course/MusicTrackList.tsx
//
// The Music page's LIST — one row / one card per song, and the artwork rules
// that go with it.
//
// Owner brief (2026-10-15):
//
//   "filter ke according actual mein sabhi pages per jo bhi audio ya video
//    hongi accordingly list ya thumbnail format mein proper dekhe, image agar
//    nahin hai koi audio hai to bhi simple audio kamre mein dekhen and title
//    properly vaise hi ho."
//
//   "abhi kya ek problem hai ki jab main koi chij search karta hun to jo bhi
//    result aata hai uska image to dekhta hai lekin uske upar pura white white
//    sa overlay jesa kuch dikhta hai, matlab clearly dikh nahin pata image."
//
// So there are exactly TWO presentations, chosen by how much room the row has
// (never by provider):
//
//   · LIST  — a compact row: 12×12 artwork tile + title + subtitle + badge.
//   · CARD  — a 16:9 thumbnail card + title underneath (the YouTube grid).
//
// …and ONE rule for artwork:
//
//   · a song WITH artwork paints the picture EDGE TO EDGE — `object-cover`,
//     no translucent wash, no white scrim, no colour layer over it. Only a
//     hairline inner ring and a small dark play chip sit on top, so the
//     picture is always legible (the reported white-overlay bug);
//   · a song WITHOUT artwork (every direct audio file: course lessons, a
//     .mp3 link, a device upload) gets a proper AUDIO TILE — a dark gradient
//     plate with the provider's glyph — never an empty white box, and its
//     title is always spelled out in full beside it.

import { AudioLines, Disc3, Music, Music2, Pause, Play, Trash2 } from "lucide-react";
import { musicRowBadge, youTubeIdFrom, youTubeThumbnailUrl, type MusicTrack } from "./musicLibrary";

/** Artwork travels with the row; older/pasted YouTube rows derive it by id. */
export const thumbnailForTrack = (track: MusicTrack): string =>
  track.thumbnailUrl || (track.provider === "youtube" ? youTubeThumbnailUrl(youTubeIdFrom(track.url)) : "");

const ProviderGlyph = ({ track, size }: { track: MusicTrack; size: number }) =>
  track.provider === "youtube" ? <Play size={size} fill="currentColor" />
    : track.provider === "soundcloud" ? <Music2 size={size} />
    : track.provider === "spotify" ? <Disc3 size={size} />
    : <AudioLines size={size} />;

export type ArtworkVariant = "tile" | "wide" | "card";

export function TrackArtwork({
  track,
  variant = "tile",
  playing = false,
}: {
  track: MusicTrack;
  variant?: ArtworkVariant;
  playing?: boolean;
}) {
  const thumbnail = thumbnailForTrack(track);
  const chip = variant === "card" ? "h-11 w-11" : variant === "wide" ? "h-7 w-7" : "h-5 w-5";
  const chipIcon = variant === "card" ? 17 : variant === "wide" ? 12 : 9;
  return (
    <span
      data-music-artwork={variant}
      className={
        variant === "card"
          ? "relative block aspect-video w-full overflow-hidden bg-slate-900"
          : variant === "wide"
            ? "relative block aspect-video w-[86px] shrink-0 overflow-hidden rounded-xl bg-slate-900"
            : "relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-slate-900"
      }
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          data-music-track-thumbnail
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // No artwork → a proper audio plate, not an empty box.
        <span
          aria-hidden
          data-music-audio-tile
          className="absolute inset-0 grid place-items-center text-white"
          style={{ background: "linear-gradient(140deg, #1f2937 0%, #0b1220 52%, #4c1d95 100%)" }}
        >
          <ProviderGlyph track={track} size={variant === "card" ? 30 : 20} />
        </span>
      )}
      {/* A hairline ring, and NOTHING else: no white wash, no colour layer —
          the picture stays exactly as clear as the platform served it. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
      {variant !== "tile" ? (
        <span
          aria-hidden
          className={`absolute bottom-1.5 right-1.5 grid ${chip} place-items-center rounded-full bg-slate-950/80 text-white shadow-lg backdrop-blur-sm`}
        >
          {playing ? <Pause size={chipIcon} fill="currentColor" /> : <Play size={chipIcon} fill="currentColor" className="ml-0.5" />}
        </span>
      ) : null}
    </span>
  );
}

export interface MusicTrackListProps {
  tracks: MusicTrack[];
  /** How much room the list has: a compact column of rows, or thumbnail cards. */
  variant: "list" | "grid";
  currentId?: string | null;
  playing?: boolean;
  onPlay: (track: MusicTrack) => void;
  /** Omitted for a course song: the course's own audio is not the learner's to bin. */
  onRemove?: (track: MusicTrack) => void;
  /** Online search results carry their own hook for the contract tests. */
  asResult?: boolean;
}

export function MusicTrackList({ tracks, variant, currentId, playing = false, onPlay, onRemove, asResult = false }: MusicTrackListProps) {
  if (variant === "grid") {
    return (
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(215px, 100%), 1fr))" }}
        data-music-list="grid"
      >
        {tracks.map((track) => {
          const isPlaying = currentId === track.id && playing;
          return (
            <li key={track.id}>
              <div
                data-music-track={asResult ? undefined : track.id}
                data-music-result={asResult ? track.id : undefined}
                data-music-track-source={track.source}
                data-music-playing={isPlaying ? "true" : "false"}
                className={`group flex h-full flex-col overflow-hidden rounded-[22px] border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                  currentId === track.id ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onPlay(track)}
                  aria-label={`Play ${track.title}`}
                  data-music-result-thumbnail={asResult ? "" : undefined}
                  className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                >
                  <TrackArtwork track={track} variant="card" playing={isPlaying} />
                </button>
                <div className="flex min-w-0 flex-1 items-start gap-2 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 text-[13px] font-black leading-5 text-slate-950" title={track.title}>
                      {track.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{track.subtitle}</span>
                    <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                      {musicRowBadge(track)}
                    </span>
                  </span>
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(track)}
                      aria-label={`Remove ${track.title}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="grid gap-1.5" data-music-list="list">
      {tracks.map((track) => {
        const isPlaying = currentId === track.id && playing;
        const artwork = track.source === "course" || track.provider === "audio" || !thumbnailForTrack(track) ? "tile" : "wide";
        return (
          <li key={track.id}>
            <div
              data-music-track={asResult ? undefined : track.id}
              data-music-result={asResult ? track.id : undefined}
              data-music-track-source={track.source}
              data-music-playing={isPlaying ? "true" : "false"}
              className={`group flex items-center gap-3 rounded-2xl border p-2 shadow-sm transition ${
                currentId === track.id
                  ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <button
                type="button"
                onClick={() => onPlay(track)}
                aria-label={`Play ${track.title}`}
                data-music-result-thumbnail={asResult ? "" : undefined}
                className="shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              >
                <TrackArtwork track={track} variant={artwork} playing={isPlaying} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-900" title={track.title}>
                  {track.title}
                </span>
                <span className="block truncate text-[11px] font-semibold text-slate-500">{track.subtitle}</span>
              </span>
              <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500 min-[430px]:inline-flex">
                {musicRowBadge(track)}
              </span>
              {onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(track)}
                  aria-label={`Remove ${track.title}`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The one empty page shape: a title, the honest line under it, an optional glyph. */
export function MusicEmptyPage({
  title,
  hint,
  glyph = "music",
}: {
  title: string;
  hint: string;
  glyph?: "music" | "video" | "link";
}) {
  return (
    <div className="grid place-items-center px-4 py-10 text-center" data-music-empty-page>
      <span className="grid h-14 w-14 place-items-center rounded-[20px] border border-slate-200 bg-slate-50 text-slate-400">
        {glyph === "video" ? <ProviderGlyph track={{ provider: "youtube" } as MusicTrack} size={22} />
          : glyph === "link" ? <Music size={22} />
          : <AudioLines size={22} />}
      </span>
      <p className="mt-3 text-[15px] font-black tracking-tight text-slate-900">{title}</p>
      <p className="mt-1 max-w-[34ch] text-[11.5px] font-medium leading-5 text-slate-500">{hint}</p>
    </div>
  );
}
