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
// The key is a PUBLIC key (it ships in the client), so it is read from a global
// the deployment can set in `index.html`:
//
//     <script>window.__DC_YOUTUBE_API_KEY__ = "AIza…"</script>
//
// and, for Vite builds, the same global can be injected with
// `define: { __DC_YOUTUBE_API_KEY__: JSON.stringify(process.env.VITE_YOUTUBE_API_KEY) }`
// — deliberately NOT read through `import.meta.env` here, so this module loads
// in every harness (node --test) as plain JavaScript.

import { createMusicId, youTubeEmbedUrl, type MusicTrack } from "./musicLibrary";

declare const __DC_YOUTUBE_API_KEY__: string | undefined;

/** The configured key, or "" — never throws, never logs it. */
export function youTubeSearchKey(): string {
  try {
    if (typeof __DC_YOUTUBE_API_KEY__ === "string" && __DC_YOUTUBE_API_KEY__.trim()) {
      return __DC_YOUTUBE_API_KEY__.trim();
    }
  } catch {
    /* not defined in this build — fall through to the global */
  }
  const injected = (globalThis as Record<string, unknown>).__DC_YOUTUBE_API_KEY__;
  return typeof injected === "string" ? injected.trim() : "";
}

export const youTubeSearchAvailable = (): boolean => Boolean(youTubeSearchKey());

/** Where a query goes when there is no key: YouTube's own search page. */
export const youTubeSearchUrl = (query: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(String(query || "").trim())}`;

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
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
        const track: MusicTrack = {
          id: createMusicId(`youtube:${id}`),
          provider: "youtube",
          title,
          subtitle: channel || "YouTube",
          url: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: youTubeEmbedUrl(id),
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
