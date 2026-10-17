// src/course/youtubePlayerBus.ts
//
// The one wire between the Transcript page and the YouTube player.
//
// The player lives in the lesson pane's lossless viewer stack
// (src/course/ResourceViewer.tsx → YouTubeFrame); the transcript lives in the
// study pane. They are siblings with no shared React tree, so a tiny DOM
// event bus is the least invasive way to let a timestamp tap move the video:
//
//   Transcript line tap  ──requestYouTubeSeek({ videoId, seconds })──▶  YouTubeFrame
//   YouTubeFrame poll    ──reportYouTubeProgress({ videoId, position })──▶  Transcript page
//
// Both events are plain `CustomEvent`s on `window`. Only the player whose
// `videoId` matches reacts, and only while it is the ACTIVE file (the viewer
// stack keeps every opened file mounted; a hidden duplicate must never seek or
// autoplay).

export const YOUTUBE_SEEK_EVENT = "dc:youtube-seek";
export const YOUTUBE_PROGRESS_EVENT = "dc:youtube-progress";

export type YouTubeSeekDetail = {
  videoId: string;
  seconds: number;
};

export type YouTubeProgressDetail = {
  videoId: string;
  position: number;
  duration: number;
};

const canUseWindow = () => typeof window !== "undefined" && typeof window.dispatchEvent === "function";

/** Ask the active player for one video to jump to (and keep playing from) a second. */
export function requestYouTubeSeek(videoId: string, seconds: number) {
  const id = String(videoId || "").trim();
  if (!id || !canUseWindow()) return;
  const detail: YouTubeSeekDetail = { videoId: id, seconds: Math.max(0, Number(seconds) || 0) };
  window.dispatchEvent(new CustomEvent<YouTubeSeekDetail>(YOUTUBE_SEEK_EVENT, { detail }));
}

/** Subscribe to seek requests; returns the unsubscribe function. */
export function subscribeYouTubeSeek(listener: (detail: YouTubeSeekDetail) => void): () => void {
  if (!canUseWindow()) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<YouTubeSeekDetail>).detail;
    if (detail && typeof detail.videoId === "string") listener(detail);
  };
  window.addEventListener(YOUTUBE_SEEK_EVENT, handler);
  return () => window.removeEventListener(YOUTUBE_SEEK_EVENT, handler);
}

/** The player announcing where it is, about once a second while active. */
export function reportYouTubeProgress(detail: YouTubeProgressDetail) {
  if (!canUseWindow()) return;
  const id = String(detail.videoId || "").trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent<YouTubeProgressDetail>(YOUTUBE_PROGRESS_EVENT, {
    detail: {
      videoId: id,
      position: Math.max(0, Number(detail.position) || 0),
      duration: Math.max(0, Number(detail.duration) || 0),
    },
  }));
}

/** Subscribe to progress; returns the unsubscribe function. */
export function subscribeYouTubeProgress(listener: (detail: YouTubeProgressDetail) => void): () => void {
  if (!canUseWindow()) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<YouTubeProgressDetail>).detail;
    if (detail && typeof detail.videoId === "string") listener(detail);
  };
  window.addEventListener(YOUTUBE_PROGRESS_EVENT, handler);
  return () => window.removeEventListener(YOUTUBE_PROGRESS_EVENT, handler);
}

/* ── The caption probe ──────────────────────────────────────────────────────
   The Transcript page can ask the player a question no scraper can answer as
   reliably: "does THIS video have caption tracks?"

   The player is YouTube's own iframe, running in the learner's own session,
   already past every bot check — its `captions` module lists the tracks the
   video really offers. So when a transcript fetch comes back empty, the page
   can tell the difference between

     · "this video genuinely has no captions"            → say so plainly, and
     · "captions exist, our network could not fetch them" → say THAT, and offer
                                                            the retry that has a
                                                            real chance.

   The wire is the same shape as the seek/progress pair: a request event out,
   an answer event back, both on `window`, both matched by video id. A player
   that is not mounted (a PDF lesson, the library page) simply never answers,
   and the probe resolves `null` — which means "unknown", never "none". */

export const YOUTUBE_CAPTIONS_REQUEST_EVENT = "dc:youtube-captions-request";
export const YOUTUBE_CAPTIONS_EVENT = "dc:youtube-captions";

export type YouTubeCaptionTrack = {
  languageCode: string;
  /** The player's own words: "English (auto-generated)", "हिन्दी"… */
  displayName: string;
  /** "asr" for YouTube's auto-generated track. */
  kind: string;
};

export type YouTubeCaptionsDetail = {
  videoId: string;
  tracks: YouTubeCaptionTrack[];
};

/** How long the page waits for a player that may not be there at all. */
const CAPTIONS_PROBE_TIMEOUT_MS = 1_200;

/** Ask the active player which caption tracks its video offers. */
export function requestYouTubeCaptionTracks(videoId: string): Promise<YouTubeCaptionTrack[] | null> {
  const id = String(videoId || "").trim();
  if (!id || !canUseWindow()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (tracks: YouTubeCaptionTrack[] | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener(YOUTUBE_CAPTIONS_EVENT, onAnswer);
      resolve(tracks);
    };
    const onAnswer = (event: Event) => {
      const detail = (event as CustomEvent<YouTubeCaptionsDetail>).detail;
      if (!detail || detail.videoId !== id) return;
      finish(Array.isArray(detail.tracks) ? detail.tracks : []);
    };
    const timer = window.setTimeout(() => finish(null), CAPTIONS_PROBE_TIMEOUT_MS);
    window.addEventListener(YOUTUBE_CAPTIONS_EVENT, onAnswer);
    window.dispatchEvent(new CustomEvent<{ videoId: string }>(YOUTUBE_CAPTIONS_REQUEST_EVENT, { detail: { videoId: id } }));
  });
}

/** Subscribe to caption probes; returns the unsubscribe function. */
export function subscribeYouTubeCaptionsRequest(listener: (videoId: string) => void): () => void {
  if (!canUseWindow()) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ videoId?: string }>).detail;
    const id = String(detail?.videoId || "").trim();
    if (id) listener(id);
  };
  window.addEventListener(YOUTUBE_CAPTIONS_REQUEST_EVENT, handler);
  return () => window.removeEventListener(YOUTUBE_CAPTIONS_REQUEST_EVENT, handler);
}

/** The player answering a probe with what its own caption module lists. */
export function reportYouTubeCaptionTracks(detail: YouTubeCaptionsDetail): void {
  if (!canUseWindow()) return;
  const id = String(detail?.videoId || "").trim();
  if (!id) return;
  window.dispatchEvent(new CustomEvent<YouTubeCaptionsDetail>(YOUTUBE_CAPTIONS_EVENT, {
    detail: { videoId: id, tracks: Array.isArray(detail.tracks) ? detail.tracks : [] },
  }));
}
