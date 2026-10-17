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
// ── THE KEY, AND WHO PAYS FOR IT ──────────────────────────────────────────
// A YouTube Data API key is a PUBLIC key (it ships in the client), and every
// search costs QUOTA UNITS out of a daily budget. So the question "whose key
// is it?" is also "whose quota burns?".
//
// The app therefore reads the key in this order — and the order is the whole
// point of this module:
//
//   1. THE LEARNER'S OWN KEY, in THEIR OWN browser:
//        · their account slot  `dc.music.youtubeKey.u.<uid>`  (the BYOK slot)
//        · this browser's slot  `dc.music.youtubeKey`         (the fallback,
//          and the owner's own quick-check override)
//   2. THE OWNER'S KEY, baked into the build:
//        · `VITE_YOUTUBE_API_KEY` → `__DC_YOUTUBE_API_KEY__` (vite.config.ts)
//        · or injected at serve time: `<script>window.__DC_YOUTUBE_API_KEY__ = "AIza…"</script>`
//
// The learner's own key ALWAYS wins. That is what lets the app run YouTube
// search with the owner's billing account switched OFF: every learner brings
// their own key (and their own quota), and the owner's key is only the
// fallback for anyone who has not connected one. Leave `VITE_YOUTUBE_API_KEY`
// empty and the owner is never billed for a single search.
//
// The learner's key never leaves their browser: it is stored in this device's
// localStorage and sent straight from the browser to Google (the Data API is
// called from the client, exactly as before).
//
// Restrict any key to the site's HTTP referrers in Google Cloud (APIs &
// Services → Credentials) — and the Data API to "YouTube Data API v3" alone.

import { createMusicId, youTubeEmbedUrl, youTubeThumbnailUrl, type MusicTrack } from "./musicLibrary";

declare const __DC_YOUTUBE_API_KEY__: string | undefined;

/** This browser's slot — "the key on this device". */
export const MUSIC_YOUTUBE_KEY_STORAGE = "dc.music.youtubeKey";
/** The per-account slot — "this learner's own key". */
export const MUSIC_YOUTUBE_USER_KEY_PREFIX = "dc.music.youtubeKey.u.";
/** Fired after the override is written, so a live pane re-reads it at once. */
export const MUSIC_YOUTUBE_KEY_EVENT = "dc:music-youtube-key";

/** The per-account slot's name — stable, and owned by exactly one account. */
export const musicYouTubeUserKeyStorage = (uid: string): string =>
  `${MUSIC_YOUTUBE_USER_KEY_PREFIX}${uid}`;

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

/** Read one storage slot — a browser that refuses reads simply has no key. */
const readSlot = (slot: string): string => {
  try {
    return cleanKey(globalThis.window?.localStorage.getItem(slot));
  } catch {
    return "";
  }
};

/** Write one storage slot. Returns false when the browser refused to store. */
const writeSlot = (slot: string, key: string): boolean => {
  try {
    const store = globalThis.window?.localStorage;
    if (!store) return false;
    if (key) store.setItem(slot, key);
    else store.removeItem(slot);
    return true;
  } catch {
    return false;
  }
};

/** Tell every open pane that the key changed. */
function announceYouTubeKey(): void {
  const win = globalThis.window as (Window & typeof globalThis) | undefined;
  if (!win?.dispatchEvent) return;
  try {
    const EventCtor = win.Event;
    if (!EventCtor) return;
    win.dispatchEvent(new EventCtor(MUSIC_YOUTUBE_KEY_EVENT));
  } catch {
    // A host without events simply does not need them.
  }
}

/**
 * The key THIS LEARNER brought — their account slot, else this browser's
 * slot. Never the owner's build-time key: the key manager must show the
 * learner their own key, and removing it must leave the owner's fallback
 * untouched.
 */
export function ownYouTubeKey(uid?: string | null): string {
  const user = typeof uid === "string" ? uid.trim() : "";
  if (user) {
    const own = readSlot(musicYouTubeUserKeyStorage(user));
    if (own) return own;
  }
  return readSlot(MUSIC_YOUTUBE_KEY_STORAGE);
}

/**
 * The slot the effective own key came from. The card shows it (so a learner
 * knows whether the key is THEIR account's or this device's), and "remove"
 * clears exactly this one.
 */
export function ownYouTubeKeySlot(uid?: string | null): string {
  const user = typeof uid === "string" ? uid.trim() : "";
  if (user) {
    const slot = musicYouTubeUserKeyStorage(user);
    if (readSlot(slot)) return slot;
  }
  return MUSIC_YOUTUBE_KEY_STORAGE;
}

/**
 * The key the search actually uses — see the header for the order.
 *
 *   1. the learner's own key (account slot, then this browser's slot);
 *   2. the owner's key (the build constant, then the serve-time global).
 */
export function youTubeSearchKey(uid?: string | null): string {
  const own = ownYouTubeKey(uid);
  if (own) return own;
  return buildKey() || cleanKey((globalThis as Record<string, unknown>).__DC_YOUTUBE_API_KEY__);
}

export const youTubeSearchAvailable = (uid?: string | null): boolean => Boolean(youTubeSearchKey(uid));

/**
 * Store a key for THIS LEARNER (their account slot) — or for this browser
 * when there is no account. The owner's build-time key is never touched: it
 * stays the fallback, so a learner who removes their own key simply falls
 * back to the owner's instead of breaking the search.
 */
export function saveYouTubeKey(key: string, uid?: string | null): boolean {
  const clean = cleanKey(key);
  if (!clean) return false;
  const user = typeof uid === "string" ? uid.trim() : "";
  const slot = user ? musicYouTubeUserKeyStorage(user) : MUSIC_YOUTUBE_KEY_STORAGE;
  if (!writeSlot(slot, clean)) return false;
  announceYouTubeKey();
  return true;
}

/** Remove the key that is actually in effect — this account's, else this browser's. */
export function clearYouTubeKey(uid?: string | null): void {
  writeSlot(ownYouTubeKeySlot(uid), "");
  announceYouTubeKey();
}

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

/* ------------------------------------------------------------------ */
/* Why a search failed — the learner can act on every one of these     */
/* ------------------------------------------------------------------ */

export type YouTubeKeyErrorCode =
  | "no-key"
  | "invalid-key"
  | "api-disabled"
  | "quota"
  | "referrer"
  | "network"
  | "unknown";

/** The one sentence each failure deserves — a learner can act on all of them. */
export const YOUTUBE_KEY_ERROR_MESSAGES: Record<YouTubeKeyErrorCode, string> = {
  "no-key":
    "YouTube search ke liye ek API key chahiye — apni key jodo, ya YouTube par khud search karke link yahan paste kar do.",
  "invalid-key":
    "Ye API key Google ne accept nahi ki. Key dobara copy karke check karo.",
  "api-disabled":
    "Is key ke Google Cloud project mein YouTube Data API v3 enable nahi hai — console mein API ON karna hoga.",
  quota:
    "Is key ki daily quota khatam ho gayi hai. Kal try karo, ya doosri key use karo.",
  referrer:
    "Google ne request rok di — is key ki “Website” restriction mein app ki site ka address add karna hoga.",
  network: "Network error — apna internet check karke dobara try karo.",
  unknown: "YouTube se connect nahi ho paya. Dobara try karo.",
};

/**
 * Read Google's own error body and say what actually went wrong.
 *
 * The Data API answers a refused request with
 * `{ error: { code, message, errors: [{ domain, reason }] } }`, and the reason
 * is the only honest answer:
 *   · `keyInvalid`            → the key itself is wrong;
 *   · `accessNotConfigured`   → the API is not enabled in that project;
 *   · `quotaExceeded`         → the daily budget is gone;
 *   · `forbidden`             → the referrer restriction did not match.
 */
export function classifyYouTubeError(status: number, body: unknown): YouTubeKeyErrorCode {
  const error = (body as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null)?.error;
  const reason = String(error?.errors?.[0]?.reason || "").trim();
  const message = String(error?.message || "").trim();
  if (reason === "keyInvalid" || reason === "keyNotFound" || reason === "badRequest") return "invalid-key";
  if (
    reason === "accessNotConfigured" ||
    reason === "youtubeApiNotEnabled" ||
    reason === "SERVICE_DISABLED" ||
    /has not been used in project|is not enabled|SERVICE_DISABLED/i.test(message)
  ) {
    return "api-disabled";
  }
  if (
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "rateLimitExceeded" ||
    /quota exceeded|daily limit exceeded/i.test(message) ||
    status === 429
  ) {
    return "quota";
  }
  if (reason === "refererNotAllowed" || reason === "forbidden" || /disallowed referrer/i.test(message) || status === 403) {
    return "referrer";
  }
  if (status >= 500) return "network";
  return "unknown";
}

/** What a search answered: the rows, and — when it failed — WHY. */
export type YouTubeSearchOutcome = {
  rows: MusicTrack[];
  error: YouTubeKeyErrorCode | null;
  message: string;
};

/**
 * Search YouTube through the official Data API, and say what happened.
 *
 * Never throws: a refused key, an exhausted quota, a dead network and a plain
 * "nothing matched" are all answers the pane can render. The rows are the same
 * shape the library has always used.
 */
export async function searchYouTubeOutcome(
  query: string,
  signal?: AbortSignal,
  uid?: string | null,
): Promise<YouTubeSearchOutcome> {
  const key = youTubeSearchKey(uid);
  const text = String(query || "").trim();
  if (!key) {
    return { rows: [], error: "no-key", message: YOUTUBE_KEY_ERROR_MESSAGES["no-key"] };
  }
  if (!text) return { rows: [], error: null, message: "" };
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("type", "video");
  endpoint.searchParams.set("maxResults", "12");
  endpoint.searchParams.set("q", text);
  endpoint.searchParams.set("key", key);
  try {
    const response = await fetch(endpoint.toString(), { signal });
    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const code = classifyYouTubeError(response.status, body);
      return { rows: [], error: code, message: YOUTUBE_KEY_ERROR_MESSAGES[code] };
    }
    const payload = (await response.json()) as { items?: YouTubeSearchItem[] };
    const rows = (payload.items || [])
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
    return { rows, error: null, message: "" };
  } catch {
    return { rows: [], error: "network", message: YOUTUBE_KEY_ERROR_MESSAGES.network };
  }
}

/**
 * The rows alone — the shape every caller has always used. A failure is an
 * empty list, exactly as before; use `searchYouTubeOutcome` when the REASON
 * matters (the key manager does).
 */
export async function searchYouTube(
  query: string,
  signal?: AbortSignal,
  uid?: string | null,
): Promise<MusicTrack[]> {
  const outcome = await searchYouTubeOutcome(query, signal, uid);
  return outcome.rows;
}

/* ------------------------------------------------------------------ */
/* Checking a key BEFORE it is saved                                    */
/* ------------------------------------------------------------------ */

export type YouTubeKeyTest = {
  ok: boolean;
  code: YouTubeKeyErrorCode | null;
  message: string;
};

/**
 * Check a key with the CHEAPEST call the Data API offers: `videos.list` for
 * one known id costs a single quota unit, where a `search` costs a hundred.
 * A learner can therefore press "Test" as often as they like, and the answer
 * names the real problem (wrong key · API not enabled · quota gone ·
 * referrer restriction) instead of a bare "failed".
 */
export async function testYouTubeKey(key: string, signal?: AbortSignal): Promise<YouTubeKeyTest> {
  const clean = cleanKey(key);
  if (!clean) {
    return { ok: false, code: "no-key", message: YOUTUBE_KEY_ERROR_MESSAGES["no-key"] };
  }
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "id");
  endpoint.searchParams.set("id", "dQw4w9WgXcQ");
  endpoint.searchParams.set("maxResults", "1");
  endpoint.searchParams.set("key", clean);
  try {
    const response = await fetch(endpoint.toString(), { signal });
    if (response.ok) {
      return { ok: true, code: null, message: "Key sahi hai — YouTube search chalu hai." };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const code = classifyYouTubeError(response.status, body);
    return { ok: false, code, message: YOUTUBE_KEY_ERROR_MESSAGES[code] };
  } catch {
    return { ok: false, code: "network", message: YOUTUBE_KEY_ERROR_MESSAGES.network };
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
