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
