// src/course/musicLibrary.ts
//
// Course Player → MUSIC — the learner's listening library.
//
// The player already owns ONE music surface: the AI Canvas "Glass Music
// Player" in `src/course/AudioPlayer.tsx`, which every `type: "audio"`
// lesson renders. This module is the missing half — the LIBRARY behind it:
// which songs exist, where they come from, and how a pasted link becomes
// something the glass player (or an official embed) can actually play.
//
// ── What a song can be (owner brief, 2026-10-14) ───────────────────────────
//   · COURSE  — the `type: "audio"` resources the course itself ships. They
//     are already playable; the library just lists them in one place.
//   · UPLOAD  — a file the learner picks off their own device. Stored locally
//     (IndexedDB, `src/course/musicDb.ts`) exactly like a Read upload, so the
//     bytes never leave the device.
//   · LINK    — a pasted URL. Four kinds are recognised, and every one of
//     them plays through an OFFICIAL surface, never a scraped stream:
//       · a direct audio file (.mp3 / .m4a / …) → the glass player itself;
//       · YouTube   → the same youtube-nocookie embed the course lessons use
//                     (`getCourseEmbed`, one builder for the whole app);
//       · Spotify   → Spotify's own embed player;
//       · SoundCloud→ SoundCloud's own widget player.
//
// The honest line (owner asked "100% possible?"): ANY song from a DRM
// streaming service (Spotify Premium, JioSaavn, Gaana, Apple Music, YouTube
// Music) can NOT be extracted into our own player — those streams are
// encrypted and their terms forbid it. What IS 100%: our own files, the
// course's files, and the official embed of the platforms that offer one,
// which is what this library plays.
//
// Everything here is pure data/string work: no React, no network, no globals
// at import time, so the whole contract is unit-testable.

import { extractYouTubeId, getCourseEmbed } from "../utils/courseEmbed";
import type { CourseFile, CourseModule } from "../types/course";

export type MusicProvider = "audio" | "youtube" | "spotify" | "soundcloud";
/** Where a row came from — the library groups and badges by this. */
export type MusicSource = "course" | "upload" | "link";

export interface MusicTrack {
  id: string;
  provider: MusicProvider;
  title: string;
  /**
   * The second line: the module path for a course song, the provider name for
   * a link, the file size for an upload.
   */
  subtitle: string;
  /** What plays for a direct audio row. "" for an uploaded (local) song. */
  url: string;
  /** The official embed to frame. "" for direct audio and uploads. */
  embedUrl: string;
  source: MusicSource;
  addedAt: number;
  /** Set on an uploaded song: its row id inside the local music database. */
  localId?: string;
  /**
   * Artwork for online rows when the provider gives us one. YouTube search
   * keeps the Data API thumbnail; a pasted YouTube link derives the same
   * public video artwork from its id. Older saved rows may not carry it —
   * the pane can still derive YouTube artwork from `url` at render time.
   */
  thumbnailUrl?: string;
}

/** The learner's saved links. Per uid, so two accounts on one device never mix. */
export const MUSIC_LIBRARY_KEY = "dc.music.library.v1";
/** The last thing this learner played — reopening the tab resumes it. */
export const MUSIC_LAST_KEY = "dc.music.last.v1";
/** One saved library is a shelf, not a hoard. */
export const MUSIC_LIBRARY_MAX = 200;
/** 60 MB covers a full-length MP3 album track several times over. */
export const MUSIC_UPLOAD_MAX_BYTES = 60 * 1024 * 1024;

export const MUSIC_UPLOAD_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac",
  "audio/ogg", "audio/oga", "audio/opus", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/webm", "audio/flac", "audio/x-flac", "audio/3gpp",
];

/** The extensions a real audio file uses — the fallback when a browser omits the MIME. */
export const MUSIC_AUDIO_EXTENSIONS = /\.(mp3|mp2|m4a|m4b|aac|ogg|oga|opus|wav|wave|flac|weba|webm|3gp|mpga)(?:[?#]|$)/i;

/** Spotify's own embeddable object kinds. */
export const SPOTIFY_KINDS = ["track", "album", "playlist", "artist", "episode", "show"] as const;

/** https only — an installed PWA cannot load a mixed-content stream. */
export const sanitizeMusicUrl = (value: unknown): string => {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

export const sanitizeMusicName = (value: unknown): string => {
  const clean = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return clean || "Untitled song";
};

/** A stable, readable row id — the same song added twice keeps ONE row. */
export const createMusicId = (seed: string): string => {
  const slug = String(seed).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "track";
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${slug}-${(hash >>> 0).toString(36)}`;
};

export const musicLibraryKey = (uid?: string | null) => `${MUSIC_LIBRARY_KEY}:${uid || "guest"}`;
export const musicLastKey = (uid?: string | null) => `${MUSIC_LAST_KEY}:${uid || "guest"}`;

export const describeMusicProvider = (provider: MusicProvider): string =>
  provider === "audio" ? "Audio file"
    : provider === "youtube" ? "YouTube"
    : provider === "spotify" ? "Spotify"
    : "SoundCloud";

/** "Promises - Nero.mp3" → "Promises - Nero". */
export const musicTitleFromUrl = (value: string): string => {
  try {
    const url = new URL(value);
    const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    const stem = last.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ").trim();
    return sanitizeMusicName(stem || url.hostname.replace(/^www\./, ""));
  } catch {
    return "Untitled song";
  }
};

const hostOf = (value: string): string => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * A YouTube id from anything a learner can paste: a watch URL, youtu.be,
 * /shorts/, /embed/, a playlist-less `music.youtube.com` link, or the bare
 * 11-char id the admin resource editor accepts.
 */
export const youTubeIdFrom = (value: string): string => {
  const raw = String(value ?? "").trim();
  const host = hostOf(raw);
  if (host === "youtu.be" || host.endsWith(".youtu.be") || host.endsWith("youtube.com")) {
    const direct = host === "youtu.be" ? raw.split("?").filter(Boolean)[0].split("/").filter(Boolean).pop() || "" : "";
    return extractYouTubeId(raw) || (direct && /^[a-zA-Z0-9_-]{11}$/.test(direct) ? direct : "");
  }
  return /^[a-zA-Z0-9_-]{11}$/.test(raw) ? raw : "";
};

/**
 * The exact embed the course lessons use — one builder for the whole app, so a
 * YouTube song and a YouTube lesson can never drift apart (nocookie host,
 * `playsinline`, `fs=1` and the JS API that lets the pane pause it).
 */
/** YouTube's public artwork for one video — used by search and saved rows. */
export const youTubeThumbnailUrl = (id: string): string =>
  /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";

export const youTubeEmbedUrl = (id: string): string =>
  getCourseEmbed(
    {
      id: `music-${id}`,
      name: "YouTube",
      type: "youtube",
      youtubeVideoId: id,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    } satisfies CourseFile,
    {},
  ).url || "";

export const spotifyEmbedUrl = (kind: string, id: string): string =>
  `https://open.spotify.com/embed/${kind}/${encodeURIComponent(id)}?utm_source=generator&theme=0`;

/**
 * SoundCloud's own widget. `auto_play=false` because a song that starts by
 * itself the moment a tab opens is exactly the behaviour nobody wants, and
 * `show_teaser=false` keeps the waveform honest about its scrub range.
 */
export const soundCloudEmbedUrl = (value: string): string =>
  `https://w.soundcloud.com/player/?url=${encodeURIComponent(value)}&color=%234f46e5&auto_play=false&hide_related=true&show_comments=false&show_teaser=false&visual=true`;

/**
 * One pasted link → one playable library row, or null when we cannot play it
 * (an unsupported host, a non-https URL, an empty box).
 *
 * Deliberately forgiving about what people paste: a `youtube.com/watch?v=…`
 * with a 40-character timestamp, a `music.youtube.com` link, a Spotify link
 * with a `/intl-de/` locale in the middle, a SoundCloud set, an
 * `archive.org/download/…mp3`, or a plain `https://…/song.m4a`.
 */
export function parseMusicLink(raw: string): MusicTrack | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const url = /^[a-zA-Z0-9_-]{11}$/.test(value) ? youtubeWatchFrom(value) : sanitizeMusicUrl(value);
  if (!url) return null;
  const host = hostOf(url);
  const addedAt = Date.now();

  const youTubeId = youTubeIdFrom(value) || youTubeIdFrom(url);
  if (youTubeId) {
    const watch = `https://www.youtube.com/watch?v=${youTubeId}`;
    return {
      id: createMusicId(`youtube:${youTubeId}`),
      provider: "youtube",
      title: "YouTube video",
      subtitle: "YouTube",
      url: watch,
      embedUrl: youTubeEmbedUrl(youTubeId),
      thumbnailUrl: youTubeThumbnailUrl(youTubeId),
      source: "link",
      addedAt,
    };
  }

  if (host === "spotify.com" || host.endsWith(".spotify.com")) {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const kindIndex = segments.findIndex((segment) => (SPOTIFY_KINDS as readonly string[]).includes(segment));
    const kind = kindIndex >= 0 ? segments[kindIndex] : "";
    const id = kindIndex >= 0 ? segments[kindIndex + 1] || "" : "";
    if (kind && id) {
      return {
        id: createMusicId(`spotify:${kind}:${id}`),
        provider: "spotify",
        title: `Spotify ${kind}`,
        subtitle: "Spotify",
        url,
        embedUrl: spotifyEmbedUrl(kind, id),
        source: "link",
        addedAt,
      };
    }
    return null;
  }

  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com") || host === "snd.sc" || host === "on.soundcloud.com") {
    return {
      id: createMusicId(`soundcloud:${url}`),
      provider: "soundcloud",
      title: musicTitleFromUrl(url),
      subtitle: "SoundCloud",
      url,
      embedUrl: soundCloudEmbedUrl(url),
      source: "link",
      addedAt,
    };
  }

  const direct = new URL(url);
  if (MUSIC_AUDIO_EXTENSIONS.test(`${direct.pathname}${direct.search}`)) {
    return {
      id: createMusicId(`audio:${url}`),
      provider: "audio",
      title: musicTitleFromUrl(url),
      subtitle: host ? host.replace(/^www\./, "") : "Audio link",
      url,
      embedUrl: "",
      source: "link",
      addedAt,
    };
  }

  return null;
}

/** The watch URL for a bare 11-char YouTube id (kept separate for clarity). */
function youtubeWatchFrom(id: string): string {
  return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : "";
}

/**
 * Is this file something we can store and play? Returns the sentence to show
 * (or null when the file is fine), the same shape the Read uploads use.
 */
export function musicUploadIssue(file: File | null | undefined): string | null {
  if (!file) return "Choose an audio file first.";
  if (!file.size) return "That file is empty.";
  if (file.size > MUSIC_UPLOAD_MAX_BYTES) {
    return `Songs are capped at ${Math.round(MUSIC_UPLOAD_MAX_BYTES / (1024 * 1024))} MB — “${sanitizeMusicName(file.name)}” is bigger.`;
  }
  const type = String(file.type || "").toLowerCase();
  const looksAudio = MUSIC_UPLOAD_TYPES.includes(type) || MUSIC_AUDIO_EXTENSIONS.test(String(file.name || ""));
  if (!looksAudio) return "That file is not audio. Add an MP3, M4A, WAV, OGG, FLAC or AAC file.";
  return null;
}

/** The minimal shape of a track as it comes back off a storage payload. */
const isMusicProvider = (value: unknown): value is MusicProvider =>
  value === "audio" || value === "youtube" || value === "spotify" || value === "soundcloud";

const cleanTrack = (value: unknown): MusicTrack | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<MusicTrack>;
  if (!isMusicProvider(row.provider)) return null;
  const url = sanitizeMusicUrl(row.url);
  const embedUrl = row.provider === "audio" ? "" : sanitizeMusicUrl(row.embedUrl);
  const thumbnailUrl = sanitizeMusicUrl(row.thumbnailUrl);
  const localId = typeof row.localId === "string" && row.localId ? row.localId : undefined;
  // A row is playable when it frames an embed, points at a direct file, or is
  // a local upload whose bytes live in the music database.
  if (!embedUrl && !url && !localId) return null;
  return {
    id: sanitizeMusicName(row.id || createMusicId(`${row.provider}:${url || localId}`)),
    provider: row.provider,
    title: sanitizeMusicName(row.title),
    subtitle: sanitizeMusicName(row.subtitle || describeMusicProvider(row.provider)),
    url,
    embedUrl,
    source: row.source === "course" ? "course" : row.source === "upload" ? "upload" : "link",
    addedAt: Number(row.addedAt) || Date.now(),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(localId ? { localId } : {}),
  };
};

/** The learner's saved links, newest first. Storage that throws reads as empty. */
export function loadMusicLinks(uid?: string | null): MusicTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(musicLibraryKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { tracks?: unknown[] } | unknown[];
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tracks) ? parsed.tracks : [];
    return rows.map(cleanTrack).filter((track): track is MusicTrack => Boolean(track) && track!.source === "link");
  } catch {
    return [];
  }
}

export function saveMusicLinks(uid: string | null | undefined, tracks: MusicTrack[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    const rows = tracks.slice(0, MUSIC_LIBRARY_MAX).map(cleanTrack).filter(Boolean);
    window.localStorage.setItem(musicLibraryKey(uid), JSON.stringify({ version: 1, tracks: rows }));
    return true;
  } catch {
    // A full or refused quota must never break the pane — the caller reports it.
    return false;
  }
}

/**
 * Add one pasted link. Returns the row plus the whole shelf (so the caller can
 * render immediately), or null when the link is not something we can play.
 */
export function addMusicLink(
  uid: string | null | undefined,
  raw: string,
): { track: MusicTrack; tracks: MusicTrack[] } | null {
  const track = parseMusicLink(raw);
  if (!track) return null;
  const existing = loadMusicLinks(uid);
  if (existing.some((row) => row.url === track.url)) return { track, tracks: existing };
  const tracks = [track, ...existing].slice(0, MUSIC_LIBRARY_MAX);
  saveMusicLinks(uid, tracks);
  return { track, tracks };
}

/**
 * Save one ONLINE row exactly as the provider described it. A search result
 * already carries its REAL title, channel and artwork — re-parsing just the
 * URL would throw all of that away and leave a generic "YouTube video" row
 * with no name and no photo in the saved list (the owner's 2026-10-16 bug
 * report). A row that is already on the shelf is refreshed in place with the
 * richer metadata instead of being duplicated.
 */
export function addMusicTrack(
  uid: string | null | undefined,
  raw: MusicTrack,
): { track: MusicTrack; tracks: MusicTrack[] } | null {
  const clean = cleanTrack({ ...raw, source: "link", addedAt: Date.now() });
  if (!clean) return addMusicLink(uid, String(raw?.url || ""));
  const existing = loadMusicLinks(uid);
  const match = existing.find((row) => row.url === clean.url || row.id === clean.id);
  if (match) {
    const refreshed: MusicTrack = {
      ...match,
      title: clean.title,
      subtitle: clean.subtitle,
      ...(clean.thumbnailUrl ? { thumbnailUrl: clean.thumbnailUrl } : {}),
      ...(clean.embedUrl ? { embedUrl: clean.embedUrl } : {}),
    };
    const tracks = existing.map((row) => (row === match ? refreshed : row));
    saveMusicLinks(uid, tracks);
    return { track: refreshed, tracks };
  }
  const tracks = [clean, ...existing].slice(0, MUSIC_LIBRARY_MAX);
  saveMusicLinks(uid, tracks);
  return { track: clean, tracks };
}

export function removeMusicLink(uid: string | null | undefined, id: string): MusicTrack[] {
  const tracks = loadMusicLinks(uid).filter((track) => track.id !== id);
  saveMusicLinks(uid, tracks);
  return tracks;
}

export function loadLastMusic(uid?: string | null): MusicTrack | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(musicLastKey(uid));
    return raw ? cleanTrack(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLastMusic(uid: string | null | undefined, track: MusicTrack | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!track) window.localStorage.removeItem(musicLastKey(uid));
    else window.localStorage.setItem(musicLastKey(uid), JSON.stringify(cleanTrack(track)));
  } catch {
    /* nothing to do — the tab still plays whatever is selected */
  }
}

/**
 * Every `type: "audio"` resource in the course tree, in reading order, with its
 * module path as the subtitle. Hidden modules/files are skipped, exactly as
 * every other learner-facing list does.
 */
export function collectCourseAudio(modules: CourseModule[] = [], accessible?: Set<string>): MusicTrack[] {
  const out: MusicTrack[] = [];
  const visit = (nodes: CourseModule[], trail: string[]) => {
    for (const module of nodes) {
      if (module.accessLevel === "hidden") continue;
      // A locked module's audio never reaches the library — the same rule every
      // other learner-facing list follows.
      if (accessible && !accessible.has(String(module.id))) continue;
      const path = [...trail, String(module.title || "").trim()].filter(Boolean);
      for (const file of module.files || []) {
        if (file.type !== "audio" || file.accessLevel === "hidden") continue;
        const url = sanitizeMusicUrl(file.embedUrl || file.url);
        if (!url) continue;
        out.push({
          id: `course-${file.id}`,
          provider: "audio",
          title: sanitizeMusicName(file.name || musicTitleFromUrl(url)),
          subtitle: path.join(" · ") || "Course audio",
          url,
          embedUrl: "",
          source: "course",
          addedAt: Number(file.createdAt) || 0,
        });
      }
      visit(module.modules || [], path);
    }
  };
  visit(modules, []);
  return out;
}

/** Free-text filter for the library sheet (title + subtitle, case-folded). */
export const filterMusicTracks = (tracks: MusicTrack[], query: string): MusicTrack[] => {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return tracks;
  return tracks.filter((track) => `${track.title} ${track.subtitle}`.toLowerCase().includes(needle));
};

/** The label under a library row's title. */
export const musicRowBadge = (track: MusicTrack): string =>
  track.source === "course" ? "Course" : track.source === "upload" ? "My file" : describeMusicProvider(track.provider);
