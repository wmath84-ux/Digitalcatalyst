// src/course/musicDb.ts
//
// The learner's own uploaded songs — bytes and metadata in ONE local record.
//
// Same reasoning as `localReadDb.ts` (the Read library's uploads): a song the
// learner picked off their phone or laptop is THEIR file. It stays on the
// device, in IndexedDB, and never touches Storage or Firestore. The row holds
// the blob and the metadata together, so a quota failure saves neither — there
// is no half-added song that plays nothing.
//
// Everything degrades honestly: a browser without IndexedDB (or a private
// window that refuses the write) reports it, and the pane keeps working for
// course audio and links.

import Dexie, { type Table } from "dexie";
import {
  createMusicId,
  describeMusicProvider,
  musicUploadIssue,
  sanitizeMusicName,
  type MusicTrack,
} from "./musicLibrary";

export interface StoredSong {
  id: string;
  uid: string;
  name: string;
  mime: string;
  sizeBytes: number;
  addedAt: number;
  blob: Blob;
}

class MusicDb extends Dexie {
  songs!: Table<StoredSong, [string, string]>;
  constructor() {
    super("eduvora-music-tracks");
    this.version(1).stores({ songs: "[uid+id], uid" });
  }
}

export const musicDb = new MusicDb();
export const musicDbAvailable = () => typeof indexedDB !== "undefined";

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A stored row as a library track — `url` stays empty; the pane resolves a blob URL. */
const toTrack = (row: StoredSong): MusicTrack => ({
  id: row.id,
  provider: "audio",
  title: row.name,
  subtitle: `${describeMusicProvider("audio")} · ${formatSize(row.sizeBytes)}`,
  url: "",
  embedUrl: "",
  source: "upload",
  addedAt: row.addedAt,
  localId: row.id,
});

export async function listLocalSongs(uid: string): Promise<MusicTrack[]> {
  if (!musicDbAvailable()) return [];
  try {
    const rows = await musicDb.songs.where("uid").equals(uid).toArray();
    return rows.map(toTrack).sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function storeLocalSong(uid: string, file: File): Promise<MusicTrack> {
  const issue = musicUploadIssue(file);
  if (issue) throw new Error(issue);
  const id = createMusicId(`local-${uid}-${file.name}-${file.size}`);
  const row: StoredSong = {
    id,
    uid,
    name: sanitizeMusicName(file.name),
    mime: String(file.type || "audio/mpeg"),
    sizeBytes: file.size,
    addedAt: Date.now(),
    blob: file.slice(0, file.size, String(file.type || "audio/mpeg")),
  };
  await musicDb.songs.put(row);
  return toTrack(row);
}

export async function removeLocalSong(uid: string, id: string): Promise<void> {
  if (!musicDbAvailable()) return;
  await musicDb.songs.delete([uid, id]);
}

/** The playable URL for a stored song, or null when the row is gone. */
export async function songObjectUrl(uid: string, id: string): Promise<string | null> {
  if (!musicDbAvailable()) return null;
  try {
    const row = await musicDb.songs.get([uid, id]);
    if (!row) return null;
    return URL.createObjectURL(row.blob);
  } catch {
    return null;
  }
}
