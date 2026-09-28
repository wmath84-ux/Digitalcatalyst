// src/course/notesStore.ts
//
// Course-player notes DEVICE MIRROR + note-html helpers, shared by the player
// (state owner) and the NotesPanel.
//
// Firestore is the source of truth now (`users/{uid}/notes/{noteId}` — see
// `src/course/cloudNotes.ts` and `src/course/useCourseNotes.ts`), and this file
// is the offline half of that pair: it paints the board instantly on a cold
// open, keeps every note when the network is down or a write is refused, and
// holds the tombstones that stop a cloud snapshot resurrecting a note the
// learner already deleted. Notes are keyed per user + product so they never
// collide with Firestore course progress — or with another learner's notes.

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
 * Tombstones: ids this device has DELETED but whose cloud delete may not have
 * committed yet (offline, rules not deployed, a tab closed mid-write).
 *
 * Without them a later cloud snapshot — or a cold read on another device that
 * still holds the document — puts the deleted note straight back on the board,
 * which reads to the learner as "delete kaam nahi karta". The list is pruned
 * the moment Firestore confirms the delete.
 */
export const notesDeletedKey = (uid: string, productId: string) => `dc.courseNotesDeleted.v1.${uid}.${productId}`;

export const loadDeletedNoteIds = (uid: string, productId: string): string[] => {
  try {
    const raw = localStorage.getItem(notesDeletedKey(uid, productId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id: unknown) => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export const persistDeletedNoteIds = (uid: string, productId: string, ids: string[]) => {
  try {
    localStorage.setItem(notesDeletedKey(uid, productId), JSON.stringify(Array.from(new Set(ids)).slice(-200)));
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
