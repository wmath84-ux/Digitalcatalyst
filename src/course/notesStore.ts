// src/course/notesStore.ts
//
// Course-player notes persistence + note-html helpers, shared by the player
// (state owner) and the NotesPanel. Notes are kept in the user's
// localStorage (per user + product) so they stay on the device and never
// collide with Firestore course progress.

import type { CoursePlayerNote } from "../types/course";
import { escapeHtml, richTextToPlain } from "../utils/richText";

export const notesStorageKey = (uid: string, productId: string) => `dc.courseNotes.${uid}.${productId}`;

export const loadLocalNotes = (uid: string, productId: string): CoursePlayerNote[] => {
  try {
    const raw = localStorage.getItem(notesStorageKey(uid, productId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Migrate older notes that pre-date the `links` field. We materialise
    // an empty array on read so the rest of the code can rely on
    // `note.links` always being an array.
    return parsed.map((note: any) => ({
      ...note,
      links: Array.isArray(note?.links) ? note.links.filter((id: unknown) => typeof id === "string") : [],
    }));
  } catch {
    return [];
  }
};

export const persistLocalNotes = (uid: string, productId: string, notes: CoursePlayerNote[]) => {
  try {
    localStorage.setItem(notesStorageKey(uid, productId), JSON.stringify(notes));
  } catch {
    /* storage full / private mode — ignore */
  }
};

/**
 * The heading lives at the top of the stored note as its first block,
 * separated from the body by a horizontal rule — the same layout the editor
 * shows, and exactly what the saved card previews. No heading → the note is
 * stored exactly as the body alone, so legacy notes round-trip untouched.
 */
export const combineHtml = (titleHtml: string, bodyHtml: string) => {
  const title = richTextToPlain(titleHtml).trim();
  if (!title) return bodyHtml;
  const body = String(bodyHtml || "").trim();
  return body ? `<h1>${escapeHtml(title)}</h1><hr>${body}` : `<h1>${escapeHtml(title)}</h1>`;
};
