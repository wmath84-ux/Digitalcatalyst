// utils/courseNotes.js
//
// Course-player + Sanctuary NOTES: the stored shape, the caps the Firestore
// rules mirror, and the cloud ↔ device merge.
//
// Notes used to live ONLY in `localStorage` (`src/course/notesStore.ts`), which
// is why "Sanctuary ke notes save nahi ho rahe": a note written on the 3D board
// existed on that one device, in that one browser profile, and vanished the
// moment the learner cleared site data or opened the app anywhere else. The
// type comment in `src/types/course.ts` even promised Firestore storage
// ("Multi-device sync is automatic via the Firestore listener") that was never
// wired up.
//
// Storage now mirrors the mind-map design exactly:
//
//   users/{uid}/notes/{noteId}      one document per note, owner-only
//
// with `localStorage` kept as an offline mirror (instant paint + a queue of
// work that never reached the cloud). This module holds the PURE part — id /
// payload normalisation and the merge rule — so the Node test runner can drive
// it with no Firebase and no bundler, and so the client and the security rules
// can never disagree about a cap.

/** Bumped whenever the stored note shape changes, so readers can migrate. */
export const NOTES_SCHEMA_VERSION = 1;

/** Subcollection under `users/{uid}` that holds one document per note. */
export const NOTES_COLLECTION = "notes";

/**
 * Caps mirrored 1:1 by firestore.rules (`users/{uid}/notes/{noteId}`).
 * A note is rich-text HTML, so the document cap is generous but finite: 60 000
 * characters keeps even a table-heavy note far away from Firestore's 1 MB
 * document limit, and `MAX_NOTE_LINKS` bounds the wire graph a single note can
 * carry.
 */
export const MAX_NOTE_HTML_LENGTH = 60000;
export const MAX_NOTE_TEXT_LENGTH = 20000;
export const MAX_NOTE_LINKS = 50;
/** `productId` is `mine-<courseId>` for a learner-authored course, so it is a
 *  string of untrusted length — bounded here and in the rules. */
export const MAX_NOTE_PRODUCT_ID_LENGTH = 120;
/** How many notes one course may hold in the cloud. */
export const MAX_NOTES_PER_COURSE = 400;

/** Firestore document ids allow almost anything, but a predictable charset
 *  keeps the id readable in the console and safe inside a composite key. */
const ID_PATTERN = /[^A-Za-z0-9._-]/g;

export const sanitizeNoteId = (value) =>
  String(value == null ? "" : value)
    .trim()
    .replace(ID_PATTERN, "-")
    .slice(0, 80);

export const sanitizeProductId = (value) =>
  String(value == null ? "" : value).trim().slice(0, MAX_NOTE_PRODUCT_ID_LENGTH);

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const flatten = (value) => String(value == null ? "" : value);

/** A collision-free id for a brand-new note. Already id-safe by construction. */
export const newNoteId = () =>
  `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Normalise ANY note record (cloud document, localStorage row, in-memory
 * draft) into the exact shape that is written and compared.
 *
 * Ids and link targets go through `sanitizeNoteId` on BOTH sides of the merge,
 * so a legacy local note and its cloud copy always key on the same id.
 */
export const normalizeNote = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = sanitizeNoteId(source.id);
  const html = flatten(source.html).slice(0, MAX_NOTE_HTML_LENGTH);
  const text = flatten(source.text).slice(0, MAX_NOTE_TEXT_LENGTH);
  const createdAt = asNumber(source.createdAt, 0);
  const updatedAt = asNumber(source.updatedAt, 0);
  const links = Array.isArray(source.links)
    ? Array.from(
        new Set(
          source.links
            .map((link) => sanitizeNoteId(link))
            .filter((link) => link && link !== id),
        ),
      ).slice(0, MAX_NOTE_LINKS)
    : [];
  const aiKind = flatten(source.aiKind);
  const note = {
    id,
    // A note with no HTML at all is a legacy plain-text note — `text` is then
    // the only content, so both projections are always carried.
    html,
    text,
    createdAt: createdAt || updatedAt || Date.now(),
    updatedAt: updatedAt || 0,
    links,
    moduleId: flatten(source.moduleId),
    resourceId: flatten(source.resourceId),
    aiGenerated: source.aiGenerated === true,
    aiKind: [
      "answer", "summary", "explanation", "question", "flashcard", "plan",
    ].includes(aiKind) ? aiKind : "",
    personalModuleId: flatten(source.personalModuleId),
    personalResourceId: flatten(source.personalResourceId),
  };
  return note;
};

/** Which of two copies of the same note wins: the more recently edited one. */
const noteTimestamp = (note) => note.updatedAt || note.createdAt || 0;

/**
 * Merge the cloud list with the device list.
 *
 * Returns the notes to render (newest first) plus the ids that exist ONLY on
 * this device — those are pushed to Firestore on the next sync, which is what
 * rescues every note written while offline, before the rules were deployed, or
 * by an older build that had no cloud store at all.
 *
 * @param {Array} cloudNotes documents read from `users/{uid}/notes`
 * @param {Array} localNotes the localStorage mirror
 * @returns {{ notes: Array, pendingUploads: string[], pendingDeletes: string[] }}
 *   `pendingDeletes` lists ids the device has explicitly removed and the cloud
 *   still holds (a delete that never reached Firestore).
 */
export const mergeNoteSets = (cloudNotes, localNotes, deletedIds = []) => {
  const cloud = (Array.isArray(cloudNotes) ? cloudNotes : []).map(normalizeNote).filter((note) => note.id);
  const local = (Array.isArray(localNotes) ? localNotes : []).map(normalizeNote).filter((note) => note.id);
  const removed = new Set(
    (Array.isArray(deletedIds) ? deletedIds : []).map((id) => sanitizeNoteId(id)).filter(Boolean),
  );

  const byId = new Map();
  for (const note of cloud) byId.set(note.id, { note, origin: "cloud" });
  const pendingUploads = [];
  for (const note of local) {
    if (removed.has(note.id)) continue;
    const existing = byId.get(note.id);
    if (!existing) {
      byId.set(note.id, { note, origin: "local" });
      pendingUploads.push(note.id);
      continue;
    }
    if (existing.origin === "local") continue;
    // Both sides know the note: the newer edit wins, and a tie goes to the
    // cloud because that is the copy every other device already has.
    if (noteTimestamp(note) > noteTimestamp(existing.note)) {
      byId.set(note.id, { note, origin: "local" });
      pendingUploads.push(note.id);
    }
  }

  const pendingDeletes = cloud
    .filter((note) => removed.has(note.id))
    .map((note) => note.id);

  const notes = [...byId.values()]
    .filter((entry) => !removed.has(entry.note.id))
    .map((entry) => entry.note)
    .sort((a, b) => noteTimestamp(b) - noteTimestamp(a) || b.createdAt - a.createdAt);

  return { notes, pendingUploads, pendingDeletes };
};

/**
 * The document payload written to `users/{uid}/notes/{noteId}`.
 *
 * Every key is ALWAYS present (never `undefined`) so firestore.rules can
 * validate each one unconditionally, and the caps applied here are the same
 * numbers the rules enforce — a note that passes here can never be rejected
 * there.
 */
export const toFirestoreNote = (note, meta = {}) => {
  const safe = normalizeNote(note);
  const uid = flatten(meta.uid);
  const productId = sanitizeProductId(meta.productId);
  return {
    id: safe.id,
    uid,
    productId,
    html: safe.html,
    text: safe.text,
    links: safe.links,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt || safe.createdAt,
    moduleId: safe.moduleId,
    resourceId: safe.resourceId,
    aiGenerated: safe.aiGenerated,
    personalModuleId: safe.personalModuleId,
    personalResourceId: safe.personalResourceId,
    ...(safe.aiKind ? { aiKind: safe.aiKind } : {}),
    schemaVersion: NOTES_SCHEMA_VERSION,
  };
};

/** Turn a stored document back into a `CoursePlayerNote`. Never throws. */
export const parseCloudNote = (raw, fallback = {}) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const note = normalizeNote({
    ...source,
    id: source.id || fallback.id || "",
  });
  if (!note.id) return null;
  const optional = (value) => (typeof value === "string" && value ? value : undefined);
  return {
    id: note.id,
    text: note.text,
    html: note.html || undefined,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt || undefined,
    links: note.links,
    moduleId: optional(note.moduleId),
    resourceId: optional(note.resourceId),
    aiGenerated: note.aiGenerated || undefined,
    aiKind: note.aiKind || undefined,
    personalModuleId: optional(note.personalModuleId),
    personalResourceId: optional(note.personalResourceId),
  };
};

/** Notes the panel can render — newest first, exactly like the local store. */
export const sortNotes = (notes) =>
  [...(Array.isArray(notes) ? notes : [])].sort(
    (a, b) => noteTimestamp(b) - noteTimestamp(a) || b.createdAt - a.createdAt,
  );

/**
 * Apply a symmetric link edit to a note list, the same rule the player used
 * before notes went to the cloud: the source note carries the new list, every
 * newly linked target gains the source, and every dropped target loses it.
 * Returns `{ notes, changed }` where `changed` is the ids that must be written.
 */
export const applyNoteLinks = (notes, sourceId, nextLinks) => {
  const list = (Array.isArray(notes) ? notes : []).map(normalizeNote);
  const source = sanitizeNoteId(sourceId);
  const allowed = new Set(list.map((note) => note.id));
  allowed.delete(source);
  const cleanNext = Array.from(
    new Set((Array.isArray(nextLinks) ? nextLinks : []).map((id) => sanitizeNoteId(id)).filter((id) => allowed.has(id))),
  ).slice(0, MAX_NOTE_LINKS);

  const current = list.find((note) => note.id === source);
  const before = new Set(current ? current.links : []);
  const after = new Set(cleanNext);
  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  const changed = [];

  const next = list.map((note) => {
    if (note.id === source) {
      changed.push(note.id);
      return { ...note, links: cleanNext };
    }
    const links = new Set(note.links);
    let touched = false;
    if (added.includes(note.id) && !links.has(source)) { links.add(source); touched = true; }
    if (removed.includes(note.id) && links.has(source)) { links.delete(source); touched = true; }
    if (!touched) return note;
    changed.push(note.id);
    return { ...note, links: [...links].slice(0, MAX_NOTE_LINKS) };
  });

  return { notes: next, changed };
};

/**
 * Drop a note AND every wire pointing at it — the inbound side has to be
 * pruned or the panel draws a line to a card that no longer exists.
 * Returns `{ notes, changed }` (the ids whose `links` shrank and must be
 * written back).
 */
export const removeNoteFromSet = (notes, noteId) => {
  const id = sanitizeNoteId(noteId);
  const list = (Array.isArray(notes) ? notes : []).map(normalizeNote);
  const changed = [];
  const next = list
    .filter((note) => note.id !== id)
    .map((note) => {
      if (!note.links.includes(id)) return note;
      changed.push(note.id);
      return { ...note, links: note.links.filter((link) => link !== id) };
    });
  return { notes: next, changed };
};
