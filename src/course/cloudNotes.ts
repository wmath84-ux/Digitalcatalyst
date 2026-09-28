// src/course/cloudNotes.ts
//
// The Firestore half of course-player / Sanctuary NOTES.
//
//   users/{uid}/notes/{noteId}     one document per note, owner-only
//
// Notes used to be device-only (`localStorage`), which is exactly why "notes
// save nahi ho rahe": nothing was ever written to Firebase, so a note taken on
// the 3D board or in the player existed on that one device and disappeared on
// every other one. This module is the single place that talks to Firestore for
// notes — `src/course/useCourseNotes.ts` owns the state, the debounce and the
// offline mirror, and calls the functions below.
//
// Reads use a LIVE listener (so a note saved on the phone appears on the
// laptop without a refresh) with a one-shot `getDocs` fallback; writes are
// batched, capped and validated by the same numbers `utils/courseNotes.js`
// applies, so firestore.rules can never reject a payload this file produced.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  writeBatch,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  MAX_NOTES_PER_COURSE,
  NOTES_COLLECTION,
  newNoteId,
  parseCloudNote,
  sanitizeNoteId,
  toFirestoreNote,
} from "../../utils/courseNotes";
import { loadLocalNotes, persistLocalNotes } from "./notesStore";
import { richTextToPlain } from "../utils/richText";
import type { CoursePlayerNote } from "../types/course";

/** Firestore batches cap at 500 operations; stay well inside that. */
const WRITE_CHUNK = 400;

const chunk = <T,>(rows: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size));
  return out;
};

/**
 * The uid a cloud write may use: Firestore rules derive ownership from the
 * PATH, so a write is only ever attempted for the signed-in learner's own
 * namespace. Anything else stays on the device mirror and retries later.
 */
export const cloudNotesUid = (uid: string | null | undefined): string | null => {
  const wanted = String(uid || "").trim();
  if (!wanted) return null;
  const signedIn = typeof auth?.currentUser?.uid === "string" ? auth.currentUser.uid : "";
  return signedIn && signedIn === wanted ? signedIn : null;
};

const notesQuery = (uid: string, productId: string) =>
  query(
    collection(db, "users", uid, NOTES_COLLECTION),
    // Equality-only filter: Firestore needs no composite index for this.
    where("productId", "==", String(productId)),
  );

/** `ParsedCloudNote` is structurally a `CoursePlayerNote`, so no cast: the
 *  document id is authoritative for the note id (the rules tie them together). */
const docToNote = (id: string, data: unknown): CoursePlayerNote | null => parseCloudNote(data, { id });

/** One-shot read of a course's cloud notes (used by the fallback + tests). */
export async function fetchCloudNotes(uid: string, productId: string): Promise<CoursePlayerNote[]> {
  const owner = cloudNotesUid(uid);
  if (!owner || !productId) return [];
  const snapshot = await getDocs(notesQuery(owner, String(productId)));
  return snapshot.docs
    .map((entry) => docToNote(entry.id, entry.data()))
    .filter((note): note is CoursePlayerNote => Boolean(note))
    .slice(0, MAX_NOTES_PER_COURSE);
}

/** Live list of a course's cloud notes. Returns the unsubscribe function. */
export function subscribeCloudNotes(
  uid: string,
  productId: string,
  onData: (notes: CoursePlayerNote[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const owner = cloudNotesUid(uid);
  if (!owner || !productId) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    notesQuery(owner, String(productId)),
    (snapshot) => {
      onData(
        snapshot.docs
          .map((entry) => docToNote(entry.id, entry.data()))
          .filter((note): note is CoursePlayerNote => Boolean(note)),
      );
    },
    (error) => {
      // A refused listener must never strand the notes board: fall back to a
      // single read (which the offline cache can still answer) and report the
      // failure so the UI can name it instead of showing an empty board.
      void fetchCloudNotes(owner, String(productId))
        .then((notes) => {
          if (notes.length) onData(notes);
          onError?.(error instanceof Error ? error : new Error(String(error)));
        })
        .catch(() => onError?.(error instanceof Error ? error : new Error(String(error))));
    },
  );
}

/** Create / overwrite notes. Resolves once every batch has committed. */
export async function uploadCloudNotes(
  uid: string,
  productId: string,
  notes: CoursePlayerNote[],
): Promise<void> {
  const owner = cloudNotesUid(uid);
  const product = String(productId || "");
  if (!owner || !product || !notes.length) return;
  const rows = notes.slice(0, MAX_NOTES_PER_COURSE);
  for (const group of chunk(rows, WRITE_CHUNK)) {
    const batch = writeBatch(db);
    for (const note of group) {
      const payload = toFirestoreNote(note, { uid: owner, productId: product });
      if (!payload.id) continue;
      batch.set(doc(db, "users", owner, NOTES_COLLECTION, payload.id), payload, { merge: true });
    }
    await batch.commit();
  }
}

/** Delete notes by id. Missing documents are a no-op, so this is retry-safe. */
export async function deleteCloudNotes(uid: string, noteIds: string[]): Promise<void> {
  const owner = cloudNotesUid(uid);
  const ids = Array.from(new Set((noteIds || []).map((id) => sanitizeNoteId(id)).filter(Boolean)));
  if (!owner || !ids.length) return;
  for (const group of chunk(ids, WRITE_CHUNK)) {
    const batch = writeBatch(db);
    for (const id of group) batch.delete(doc(db, "users", owner, NOTES_COLLECTION, id));
    await batch.commit();
  }
}

/** Single delete — used the moment a note is removed, before any batching. */
export async function deleteCloudNote(uid: string, noteId: string): Promise<void> {
  const owner = cloudNotesUid(uid);
  const id = sanitizeNoteId(noteId);
  if (!owner || !id) return;
  await deleteDoc(doc(db, "users", owner, NOTES_COLLECTION, id));
}

/**
 * Append a note from OUTSIDE a mounted `useCourseNotes` — the player's
 * unmount draft-rescue and the AI's "Save as note" both run when no hook
 * instance can adopt the write (the hook's own cleanup has already flushed).
 *
 * The device mirror is updated synchronously, so the note can never be lost,
 * and the cloud write is attempted straight away. If that write fails, the next
 * mount's merge finds a note that exists only on this device and uploads it —
 * the same path that migrates every pre-cloud note.
 */
export function appendCloudNote(
  uid: string,
  productId: string,
  note: CoursePlayerNote,
): CoursePlayerNote | null {
  const owner = String(uid || "");
  const product = String(productId || "");
  if (!owner || !product || !note) return null;
  const id = sanitizeNoteId(note.id) || newNoteId();
  const record: CoursePlayerNote = {
    ...note,
    id,
    links: Array.isArray(note.links) ? note.links : [],
  };
  const existing = loadLocalNotes(owner, product).filter((row) => row.id !== id);
  persistLocalNotes(owner, product, [record, ...existing]);
  void uploadCloudNotes(owner, product, [record]).catch(() => {
    /* offline / rules — the mirror holds it and the next mount syncs */
  });
  return record;
}

/**
 * Edit one note from outside a mounted hook (the same draft-rescue path).
 * Writes the mirror first, then the cloud document.
 */
export function patchCloudNote(uid: string, productId: string, noteId: string, html: string): void {
  const owner = String(uid || "");
  const product = String(productId || "");
  const id = sanitizeNoteId(noteId);
  if (!owner || !product || !id) return;
  const next = loadLocalNotes(owner, product).map((note) =>
    note.id === id
      ? { ...note, html, text: richTextToPlain(html) || note.text, updatedAt: Date.now() }
      : note,
  );
  const target = next.find((note) => note.id === id);
  if (!target) return;
  persistLocalNotes(owner, product, next);
  void uploadCloudNotes(owner, product, [target]).catch(() => {
    /* offline / rules — the mirror holds it and the next mount syncs */
  });
}

/** `permission-denied` and friends — the codes that mean "rules said no". */
export const isNotesPermissionError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || "");
  return code === "permission-denied" || code === "unauthenticated";
};

/**
 * A message the learner can act on. Firestore's own text ("Missing or
 * insufficient permissions") says nothing about WHAT failed, which is how a
 * rules gap turns into "notes save nahi ho rahe" with no clue anywhere.
 */
export const describeNotesError = (error: unknown): string => {
  const code = String((error as { code?: string } | null)?.code || "");
  if (code === "permission-denied") {
    return "Firebase ne is account ko notes likhne se roka (permission-denied). Note is device par safe hai — cloud rules deploy hote hi apne aap sync ho jayega.";
  }
  if (code === "unauthenticated") return "Sign-in session expire ho gaya — dobara login karte hi notes sync ho jayenge.";
  if (code === "unavailable") return "Network/Firestore abhi unavailable hai. Note device par save hai aur thodi der me dobara try hoga.";
  if (code === "resource-exhausted") return "Firestore quota khatam ho gaya hai — note device par safe hai.";
  const message = String((error as { message?: string } | null)?.message || "");
  return message ? `Cloud save fail hua: ${message.slice(0, 160)}` : "Cloud save fail hua — note is device par safe hai.";
};
