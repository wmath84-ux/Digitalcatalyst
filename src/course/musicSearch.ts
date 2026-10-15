// src/course/musicSearch.ts
//
// "Koi bhi song dhoondo" — the optional half of the Music library.
//
// Pasting a link ALWAYS works (`parseMusicLink`), so the library is useful with
// zero configuration. SEARCH inside the player needs one thing: a YouTube Data
// API v3 key. There is no legal, key-free way to search YouTube from a page —
// the old `listType=search` embed parameter was retired in 2020, and scraping
// youtube.com/results from the client is both blocked by CORS and against
// YouTube's terms.
//
// So this module is deliberately key-gated:
//
//   · key present  → real results, played in the SAME youtube-nocookie embed
//                    the course lessons use;
//   · key absent   → `youTubeSearchUrl()` hands the query to YouTube itself
//                    (a new tab / the platform browser), and the learner pastes
//                    the link back — which the library already plays.
//
// The key is a PUBLIC key (it ships in the client), so it is read from three
// places, in this order — deliberately NOT through `import.meta.env`, so this
// module still loads in every harness (node --test) as plain JavaScript:
//
//   1. the BUILD — `VITE_YOUTUBE_API_KEY` in `.env` (or the host's env
//      settings). vite.config.ts injects it as the `__DC_YOUTUBE_API_KEY__`
//      constant, which is what the first branch below reads;
//   2. a deployment that would rather inject it at serve time:
//      `<script>window.__DC_YOUTUBE_API_KEY__ = "AIza…"</script>`
//   3. the OWNER's own browser, for verifying a key without a rebuild:
//      `localStorage.setItem("dc.music.youtubeKey", "AIza…")`
//
// Restrict the key to the site's HTTP referrers in Google Cloud (APIs &
// Services → Credentials) — the Data API is billed per quota unit, and an
// unrestricted key can be lifted out of any client bundle.

import { createMusicId, youTubeEmbedUrl, youTubeThumbnailUrl, type MusicTrack } from "./musicLibrary";

declare const __DC_YOUTUBE_API_KEY__: string | undefined;

/** The owner's own override slot — see the header. */
export const MUSIC_YOUTUBE_KEY_STORAGE = "dc.music.youtubeKey";
/** Fired after the override is written, so a live pane re-reads it at once. */
export const MUSIC_YOUTUBE_KEY_EVENT = "dc:music-youtube-key";

/**
 * A value is only a key when it is a non-empty string that is not the
 * un-substituted `%VITE_YOUTUBE_API_KEY%` placeholder index.html ships (a
 * build with no `.env` value leaves it verbatim, and `%…%` is not a key).
 */
const cleanKey = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const key = value.trim();
  return key && !/^%.*%$/.test(key) ? key : "";
};

/** The build-time constant, if this build has one (vite.config.ts). */
const buildKey = (): string => {
  try {
    return typeof __DC_YOUTUBE_API_KEY__ === "string" ? cleanKey(__DC_YOUTUBE_API_KEY__) : "";
  } catch {
    return "";
  }
};

/** The configured key, or "" — never throws, never logs it. */
export function youTubeSearchKey(): string {
  const injected = buildKey() || cleanKey((globalThis as Record<string, unknown>).__DC_YOUTUBE_API_KEY__);
  if (injected) return injected;
  try {
    return cleanKey(globalThis.window?.localStorage.getItem(MUSIC_YOUTUBE_KEY_STORAGE));
  } catch {
    return "";
  }
}

export const youTubeSearchAvailable = (): boolean => Boolean(youTubeSearchKey());

/**
 * Watch for the key appearing (or being cleared) without a reload: the
 * `storage` event covers another tab, the custom event covers this one.
 */
export function subscribeYouTubeKey(listener: () => void): () => void {
  const target = globalThis.window;
  if (!target?.addEventListener) return () => undefined;
  target.addEventListener("storage", listener);
  target.addEventListener(MUSIC_YOUTUBE_KEY_EVENT, listener);
  return () => {
    target.removeEventListener("storage", listener);
    target.removeEventListener(MUSIC_YOUTUBE_KEY_EVENT, listener);
  };
}

/** Where a query goes when there is no key: YouTube's own search page. */
export const youTubeSearchUrl = (query: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || "").trim())}`;

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
}

/**
 * Search YouTube through the official Data API. Returns [] on any failure
 * (quota, offline, wrong key) — the pane then shows the paste hint instead of
 * an error the learner can do nothing about.
 */
export async function searchYouTube(query: string, signal?: AbortSignal): Promise<MusicTrack[]> {
  const key = youTubeSearchKey();
  const text = String(query || "").trim();
  if (!key || !text) return [];
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("type", "video");
  endpoint.searchParams.set("maxResults", "12");
  endpoint.searchParams.set("q", text);
  endpoint.searchParams.set("key", key);
  try {
    const response = await fetch(endpoint.toString(), { signal });
    if (!response.ok) return [];
    const payload = (await response.json()) as { items?: YouTubeSearchItem[] };
    return (payload.items || [])
      .map((item) => {
        const id = String(item?.id?.videoId || "");
        if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) return null;
        const title = String(item?.snippet?.title || "").trim() || "YouTube video";
        const channel = String(item?.snippet?.channelTitle || "").trim();
        const thumbnails = item?.snippet?.thumbnails || {};
        const apiThumbnail = [thumbnails.high, thumbnails.medium, thumbnails.default]
          .map((candidate) => String(candidate?.url || "").trim())
          .find((candidate) => candidate.startsWith("https://")) || "";
        const track: MusicTrack = {
          id: createMusicId(`youtube:${id}`),
          provider: "youtube",
          title,
          subtitle: channel || "YouTube",
          url: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: youTubeEmbedUrl(id),
          thumbnailUrl: apiThumbnail || youTubeThumbnailUrl(id),
          source: "link",
          addedAt: Date.now(),
        };
        return track;
      })
      .filter((track): track is MusicTrack => Boolean(track));
  } catch {
    return [];
  }
}

/**
 * Best-effort title for a pasted link, through the platform's OWN public
 * oEmbed endpoint (no key, no scraping). Never blocks the add: the row lands
 * with its fallback title and is renamed in place if the lookup answers.
 */
export function musicOEmbedUrl(track: MusicTrack): string {
  if (track.provider === "youtube") return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(track.url)}`;
  if (track.provider === "soundcloud") return `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(track.url)}`;
  if (track.provider === "spotify") return `https://open.spotify.com/oembed?url=${encodeURIComponent(track.url)}`;
  return "";
}

export async function resolveMusicTitle(track: MusicTrack, signal?: AbortSignal): Promise<string> {
  const endpoint = musicOEmbedUrl(track);
  if (!endpoint) return "";
  try {
    const response = await fetch(endpoint, { signal });
    if (!response.ok) return "";
    const payload = (await response.json()) as { title?: string; author_name?: string };
    return String(payload?.title || "").trim();
  } catch {
    return "";
  }
}
