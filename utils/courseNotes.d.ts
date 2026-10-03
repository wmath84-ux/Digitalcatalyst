// Type declarations for `utils/courseNotes.js`. The runtime lives in the
// sibling `.js` file so the Node test runner can import it without a TS
// toolchain — the same split `utils/mindMapTree.js` / `.d.ts` uses.
//
// The React consumers are `src/course/useCourseNotes.ts` (the Course Player
// persistence hook) and `src/course/cloudNotes.ts` (the Firestore I/O layer).

export const NOTES_SCHEMA_VERSION: 1;
export const NOTES_COLLECTION: "notes";
export const MAX_NOTE_HTML_LENGTH: number;
export const MAX_NOTE_TEXT_LENGTH: number;
export const MAX_NOTE_LINKS: number;
export const MAX_NOTE_PRODUCT_ID_LENGTH: number;
export const MAX_NOTES_PER_COURSE: number;

/** The AI provenance badge a note may carry (see `CoursePlayerNote.aiKind`). */
export type NoteAiKind = "answer" | "summary" | "explanation" | "question" | "flashcard" | "plan";

/**
 * A note with EVERY field materialised — the shape that is written, compared
 * and merged. Optional fields become `""` / `false` / `0` so the payload is
 * always Firestore-safe and the security rules can validate unconditionally.
 */
export interface NormalizedNote {
  id: string;
  html: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  links: string[];
  moduleId: string;
  resourceId: string;
  aiGenerated: boolean;
  aiKind: NoteAiKind | "";
  personalModuleId: string;
  personalResourceId: string;
}

/** The document stored at `users/{uid}/notes/{noteId}`. */
export interface FirestoreNote extends NormalizedNote {
  uid: string;
  productId: string;
  schemaVersion: number;
}

/** A cloud document read back into the player's own note shape. Structurally
 *  assignable to `CoursePlayerNote` (src/types/course.ts). */
export interface ParsedCloudNote {
  id: string;
  text: string;
  html?: string;
  createdAt: number;
  updatedAt?: number;
  links: string[];
  moduleId?: string;
  resourceId?: string;
  aiGenerated?: boolean;
  aiKind?: NoteAiKind;
  personalModuleId?: string;
  personalResourceId?: string;
}

/**
 * Anything note-shaped: a Firestore document, a `localStorage` row, a
 * `CoursePlayerNote` from the panel or a half-built draft. Every entry point
 * normalises defensively (`normalizeNote`), so the declared input is
 * deliberately permissive — the OUTPUT is the contract.
 */
export type NoteInput = unknown;

export interface MergeResult {
  /** Notes to render, newest first, cloud and device already reconciled. */
  notes: NormalizedNote[];
  /** Ids that exist only on this device (or are newer here) — push them up. */
  pendingUploads: string[];
  /** Ids the device deleted that the cloud still holds — delete them again. */
  pendingDeletes: string[];
}

export interface LinkEditResult {
  notes: NormalizedNote[];
  /** Ids whose `links` changed and therefore have to be written back. */
  changed: string[];
}

export const sanitizeNoteId: (value: NoteInput) => string;
export const sanitizeProductId: (value: NoteInput) => string;
export const newNoteId: () => string;
export const normalizeNote: (raw: NoteInput) => NormalizedNote;
export const mergeNoteSets: (
  cloudNotes: NoteInput,
  localNotes: NoteInput,
  deletedIds?: string[],
) => MergeResult;
export const toFirestoreNote: (
  note: NoteInput,
  meta?: { uid?: string; productId?: string | number },
) => FirestoreNote;
export const parseCloudNote: (raw: NoteInput, fallback?: { id?: string }) => ParsedCloudNote | null;
export const sortNotes: (notes: NoteInput) => NormalizedNote[];
export const applyNoteLinks: (
  notes: NoteInput,
  sourceId: string,
  nextLinks: string[],
) => LinkEditResult;
export const removeNoteFromSet: (notes: NoteInput, noteId: string) => LinkEditResult;
