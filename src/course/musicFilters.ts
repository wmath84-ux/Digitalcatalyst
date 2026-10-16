// src/course/musicFilters.ts
//
// The Music page's FILTER MODEL — pure data and pure functions, no React.
//
// Owner brief (2026-10-15):
//
//   "music page open hote hi header ki jagah per search bar hoga YouTube wala
//    aur use search bar ke niche horizontal tray hoga jiska color pura white
//    hoga aur use tray per sabhi button honge jo abhi already hain filter
//    button aur usmein ek aur button add karna hai URL ka, aur ine button per
//    click karne ke according list badlegi."
//
// So the tray's five buttons are ONE list (below), the FIRST of them is the
// All button, and each filter owns:
//
//   · a label + icon key for the tray,
//   · the shelf/shelves whose rows it shows
//     (course → the course's own audio lessons, device → the learner's own
//     files, online → the saved + searched internet songs, url → the pasted
//     links AND the URL input above the tray),
//   · the text the ONE search box wears in that mode (search vs URL paste),
//   · its own empty page ("search to view library", "there is no audio from
//     course", …) so a filter with nothing in it never shows a bare sheet,
//   · whether the bottom-right ADD (＋) button belongs to it — the device
//     filter, which is where a learner adds their own music.
//
// Everything is a string or a number here, so the whole contract is unit
// testable and the pane never invents copy inline.

import type { MusicSource, MusicTrack } from "./musicLibrary";

/** The tray's five buttons, All FIRST — the owner's explicit order. */
export type MusicFilter = "all" | "course" | "device" | "online" | "url";

export const MUSIC_FILTERS: readonly MusicFilter[] = ["all", "course", "device", "online", "url"] as const;

export const MUSIC_FILTER_LABEL: Record<MusicFilter, string> = {
  all: "All",
  course: "Course",
  device: "Device",
  online: "Online",
  url: "URL",
};

/** The one-line explanation under a filter's empty state's title. */
export const MUSIC_FILTER_HINT: Record<MusicFilter, string> = {
  all: "Course audio, device ke songs aur online links — sab yahin",
  course: "Is course ke audio lessons",
  device: "Aapke device ki apni songs",
  online: "Internet se search ki hui aur save ki hui songs",
  url: "Koi bhi YouTube / Spotify / SoundCloud / .mp3 link",
};

/** The empty page's title — the owner's own wording. */
export const MUSIC_EMPTY_TITLE: Record<MusicFilter, string> = {
  all: "Search to view library",
  course: "There is no audio from this course.",
  device: "There is no music from this device yet.",
  online: "There is no online music yet.",
  url: "There is no saved link yet.",
};

export const MUSIC_EMPTY_HINT: Record<MusicFilter, string> = {
  all: "Upar wale search box se dhoondo — ya neeche se apna hissa chuno.",
  course: "Is course mein abhi koi audio lesson nahin hai.",
  device: "Neeche wale ＋ button se apne device se music add karo.",
  online: "Upar search karo, ya link paste karke add karo.",
  url: "Upar link paste karke arrow (ya Enter) dabao.",
};

/** Nothing matched the typed query — one sentence, whatever the filter. */
export const MUSIC_NO_MATCH = "Kuch nahin mila.";

/**
 * The search box's placeholder per filter. The SAME box changes its behaviour:
 * a normal search for every filter, and a URL input for the URL filter (the
 * owner: "URL filter me page per filter bar ke upar jo already search box hai
 * vahi convert ho jaaye input box mein URL input box mein").
 */
export const MUSIC_SEARCH_PLACEHOLDER: Record<MusicFilter, string> = {
  all: "Songs, videos, course — dhoondo…",
  course: "Course ke audio mein dhoondo…",
  device: "Device ke songs mein dhoondo…",
  online: "Online songs dhoondo…",
  url: "Link paste karo — YouTube, Spotify, SoundCloud ya .mp3",
};

/** True for the one filter whose search box is a URL input. */
export const isUrlFilter = (filter: MusicFilter): boolean => filter === "url";

/**
 * True for the one filter that owns the bottom-right ＋ button. The owner:
 * "device filter per click karte hi user ko bottom right mein Plus ka icon
 * dikhna chahiye jis per click karke user add kar sake direct koi bhi apne
 * device se music."
 */
export const musicAddFabVisible = (filter: MusicFilter): boolean => filter === "device";

/** Which shelves a filter lists. All = every shelf; URL = the pasted links. */
export const musicShelvesForFilter = (filter: MusicFilter): MusicSource[] => {
  if (filter === "all") return ["course", "upload", "link"];
  if (filter === "course") return ["course"];
  if (filter === "device") return ["upload"];
  return ["link"];
};

export interface MusicLibraryCounts {
  /** Every song the learner can reach: course + device + online. */
  total: number;
  course: number;
  device: number;
  online: number;
  /** The saved-link shelf the URL filter lists (a subset of `online`). */
  url: number;
}

export const musicFilterCount = (filter: MusicFilter, counts: MusicLibraryCounts): number =>
  filter === "all" ? counts.total
    : filter === "course" ? counts.course
    : filter === "device" ? counts.device
    : filter === "online" ? counts.online
    : counts.url;

/**
 * One row of the All filter's opening column. The owner: "all filter per user
 * ko direct page ke center mein vertical column row ki tarah user ko sabhi
 * options dikhenge jaise search online, device, course audio, URL button …
 * jab tak koi bhi music na ho. Agar koi music exist karta hai … to all mein
 * vahan dikhega hi, to ye option nahin dikhna chahiye us case mein."
 */
export interface MusicStartOption {
  id: "search-online" | "device" | "course" | "url";
  /** Which filter the row opens. */
  filter: MusicFilter;
  title: string;
  hint: string;
}

export const MUSIC_START_OPTIONS: readonly MusicStartOption[] = [
  { id: "search-online", filter: "online", title: "Search online", hint: "YouTube, Spotify, SoundCloud — internet ki songs" },
  { id: "device", filter: "device", title: "Device", hint: "Apne phone ya laptop se songs add karo" },
  { id: "course", filter: "course", title: "Course audio", hint: "Is course ke audio lessons" },
  { id: "url", filter: "url", title: "URL", hint: "Koi bhi audio / video ka link paste karo" },
] as const;

/**
 * The All filter's opening column is shown only while the library is EMPTY —
 * the moment anything is in it (course, device or online) All lists the
 * songs instead, and the column disappears.
 */
export const musicStartOptionsVisible = (filter: MusicFilter, counts: MusicLibraryCounts): boolean =>
  filter === "all" && counts.total === 0;

/** Free-text filter for the CURRENT view's rows (title + subtitle, case-folded). */
export const musicQueryFilter = (tracks: MusicTrack[], query: string): MusicTrack[] => {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return tracks;
  return tracks.filter((track) => `${track.title} ${track.subtitle}`.toLowerCase().includes(needle));
};

/** The heading a shelf gets in the All view ("Course · 3"). */
export const MUSIC_SHELF_TITLE: Record<MusicSource, string> = {
  course: "Course",
  upload: "Device",
  link: "Online",
};

export const MUSIC_SHELF_EMPTY: Record<MusicSource, string> = {
  course: "This course has no audio lesson yet.",
  upload: "No songs from your device yet.",
  link: "No online songs saved yet.",
};
