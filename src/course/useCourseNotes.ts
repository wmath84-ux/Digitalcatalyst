// src/course/useCourseNotes.ts
//
// Per-course NOTES persistence — the hook behind the Course Player's Notes tab.
//
// ── Why this exists ───────────────────────────────────────────────────────
// Notes were device-only: `notesStore.ts` wrote the list to `localStorage` and
// nothing else. The type comment in `src/types/course.ts` even claimed
// "Multi-device sync is automatic via the Firestore listener", but no listener
// existed — so a note taken on one device was never in Firebase, never
// rendered on another device, and was gone the moment site data was cleared.
//
// ── Two layers, exactly like `useCourseMindMap` ───────────────────────────
//   1. Firestore is the source of truth: one document per note at
//      `users/{uid}/notes/{noteId}` (`src/course/cloudNotes.ts`), read through
//      a LIVE listener so a note saved on the phone appears on the laptop
//      without a refresh. Ownership is re-derived from the path by
//      firestore.rules, so one learner can never read or write another's notes.
//   2. localStorage mirrors every change (the pre-existing
//      `dc.courseNotes.{uid}.{productId}` key) plus a tombstone list of deleted
//      ids. A refused or failed write — offline, rules not deployed yet, a tab
//      closed mid-save — can therefore never strand or resurrect a note, and
//      the next mount pushes the device copy up.
//
// Writes are debounced and batched: a burst of edits becomes ONE commit, and
// `flush()` (unmount, tab hide, page hide) forces whatever is pending out
// immediately. Failures retry with backoff and surface a message that names
// the actual Firestore code instead of a generic "save nahi hua".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cloudNotesUid,
  deleteCloudNotes,
  describeNotesError,
  subscribeCloudNotes,
  uploadCloudNotes,
} from "./cloudNotes";
import {
  loadDeletedNoteIds,
  loadLocalNotes,
  persistDeletedNoteIds,
  persistLocalNotes,
} from "./notesStore";
import {
  MAX_NOTES_PER_COURSE,
  applyNoteLinks,
  mergeNoteSets,
  newNoteId,
  normalizeNote,
  removeNoteFromSet,
  sanitizeNoteId,
  type NormalizedNote,
} from "../../utils/courseNotes";
import { richTextToPlain } from "../utils/richText";
import type { CoursePlayerNote } from "../types/course";

export type NotesSaveStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";

export interface UseCourseNotesInput {
  uid?: string | null;
  /** Course scope — `String(product.id)`, or `mine-<courseId>` for a learner's
   *  own course. Notes never mix between scopes. */
  productId?: string | number | null;
  /** Milliseconds of quiet before pending edits are committed. */
  debounceMs?: number;
}

export interface UseCourseNotesResult {
  notes: CoursePlayerNote[];
  status: NotesSaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  /** True until the first cloud read settles (the device mirror paints first). */
  loading: boolean;
  /** True when nothing is waiting to reach Firestore. */
  synced: boolean;
  /** Write every pending change now (unmount / tab hide / "Save" affordance). */
  flush: () => void;
  /** Re-read the cloud copy (the UI's "Try again"). */
  reload: () => void;
  /** Append a note. Returns the stored note, or null when there was nothing. */
  add: (html: string, extra?: Partial<CoursePlayerNote>) => CoursePlayerNote | null;
  edit: (id: string, html: string) => void;
  remove: (id: string) => void;
  /** Symmetric wire edit — the same rule the player always applied. */
  link: (sourceId: string, nextLinks: string[]) => void;
  /** Replace the whole list (the unmount draft rescue, AI "Save as note"). */
  commit: (next: CoursePlayerNote[]) => void;
}

/** Short enough to feel instant, long enough to coalesce a burst of edits. */
const DEFAULT_DEBOUNCE_MS = 600;
const MAX_SYNC_ATTEMPTS = 8;

/** Newest first — the order the notes grid has always shown. */
const byRecency = (notes: CoursePlayerNote[]): CoursePlayerNote[] =>
  [...notes].sort(
    (a, b) =>
      (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
      || (b.createdAt || 0) - (a.createdAt || 0),
  );

/** Normalised record → the player's own note type (empty optionals dropped). */
const toPlayerNote = (note: NormalizedNote): CoursePlayerNote => ({
  id: note.id,
  text: note.text,
  html: note.html || undefined,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt || undefined,
  links: note.links,
  moduleId: note.moduleId || undefined,
  resourceId: note.resourceId || undefined,
  aiGenerated: note.aiGenerated || undefined,
  aiKind: note.aiKind || undefined,
  personalModuleId: note.personalModuleId || undefined,
  personalResourceId: note.personalResourceId || undefined,
});

const toPlayerNotes = (notes: NormalizedNote[]): CoursePlayerNote[] => notes.map(toPlayerNote);

/** A save queue belongs to a scope, NOT to whichever scope rendered last. */
interface NotesSession {
  uid: string;
  productId: string;
  scoped: boolean;
  notes: CoursePlayerNote[];
  dirty: Set<string>;
  deleted: Set<string>;
  writing: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
  inFlight: boolean;
  flushWanted: boolean;
  disposed: boolean;
  listenerFailed: boolean;
}

interface NotesView {
  session: NotesSession;
  notes: CoursePlayerNote[];
  status: NotesSaveStatus;
  errorMessage: string | null;
  lastSavedAt: number | null;
  loading: boolean;
}

const noteTime = (note: CoursePlayerNote) => note.updatedAt || note.createdAt || 0;
const nextNoteTime = (note: CoursePlayerNote) => Math.max(Date.now(), noteTime(note) + 1);
const initialView = (session: NotesSession): NotesView => ({
  session, notes: session.notes, status: session.scoped ? "loading" : "idle",
  errorMessage: null, lastSavedAt: null, loading: session.scoped,
});

export default function useCourseNotes(input: UseCourseNotesInput): UseCourseNotesResult {
  const { uid, productId, debounceMs = DEFAULT_DEBOUNCE_MS } = input;
  const scoped = Boolean(uid) && productId != null && String(productId).length > 0;
  const uidText = String(uid || "");
  const productText = String(productId ?? "");
  const session = useMemo<NotesSession>(() => ({
    uid: uidText, productId: productText, scoped,
    notes: scoped ? byRecency(loadLocalNotes(uidText, productText)) : [],
    dirty: new Set(), deleted: new Set(scoped ? loadDeletedNoteIds(uidText, productText) : []),
    writing: new Set(), timer: null, retry: null, attempts: 0, inFlight: false,
    flushWanted: false, disposed: false, listenerFailed: false,
  }), [uidText, productText, scoped]);
  const scopeRef = useRef(session);
  scopeRef.current = session;
  const [state, setState] = useState<NotesView>(() => initialView(session));
  const view = state.session === session ? state : initialView(session);
  const [reloadToken, setReloadToken] = useState(0);
  const flushRef = useRef<(scope: NotesSession) => void>(() => undefined);

  // Async results for an outgoing course/account must never change the new
  // board, its queue, or its "saved" indicator.
  const publish = useCallback((scope: NotesSession, patch: Partial<NotesView>) => {
    if (scopeRef.current !== scope || scope.disposed) return;
    setState((current) => ({ ...(current.session === scope ? current : initialView(scope)), ...patch }));
  }, []);

  const scheduleRetry = useCallback((scope: NotesSession, delayMs: number, run: () => void) => {
    if (scope.disposed) return;
    if (scope.retry) clearTimeout(scope.retry);
    scope.retry = setTimeout(() => {
      scope.retry = null;
      if (!scope.disposed) run();
    }, delayMs);
  }, []);

  const scheduleFlush = useCallback((scope: NotesSession) => {
    if (!scope.scoped || scope.disposed) return;
    if (scope.timer) clearTimeout(scope.timer);
    scope.timer = setTimeout(() => {
      scope.timer = null;
      flushRef.current(scope);
    }, debounceMs);
  }, [debounceMs]);

  const applyLocal = useCallback((next: CoursePlayerNote[], dirtyIds: string[] = []) => {
    const scope = session;
    if (!scope.scoped) return;
    const sorted = byRecency(next).slice(0, MAX_NOTES_PER_COURSE);
    scope.notes = sorted;
    persistLocalNotes(scope.uid, scope.productId, sorted);
    for (const id of dirtyIds) if (id && !scope.deleted.has(id)) scope.dirty.add(id);
    scope.attempts = 0;
    if (scope.retry) { clearTimeout(scope.retry); scope.retry = null; }
    publish(scope, { notes: sorted, status: dirtyIds.length ? "saving" : "ready", errorMessage: null });
    if (dirtyIds.length) {
      // A child editor can commit during passive teardown AFTER this hook's
      // cleanup. Save that captured outgoing bucket, never the new board.
      if (scope.disposed) flushRef.current(scope);
      else scheduleFlush(scope);
    }
  }, [session, publish, scheduleFlush]);

  const flushNow = useCallback((scope: NotesSession) => {
    if (!scope.scoped) return;
    if (scope.timer) { clearTimeout(scope.timer); scope.timer = null; }
    if (scope.inFlight) { scope.flushWanted = true; return; }
    const uploads = Array.from(scope.dirty)
      .map((id) => scope.notes.find((note) => note.id === id && !scope.deleted.has(id)))
      .filter((note): note is CoursePlayerNote => Boolean(note));
    const deletes = Array.from(scope.deleted);
    if (!uploads.length && !deletes.length) return;

    const owner = cloudNotesUid(scope.uid);
    if (!owner) {
      publish(scope, { status: "error", errorMessage: "Sign-in session confirm nahi hua — notes is device par safe hain aur login ke baad sync ho jayenge." });
      if (scope.attempts < MAX_SYNC_ATTEMPTS) {
        scope.attempts += 1;
        scheduleRetry(scope, Math.min(15000, 900 * scope.attempts), () => flushRef.current(scope));
      }
      return;
    }
    for (const note of uploads) scope.dirty.delete(note.id);
    // Keep delete tombstones until acknowledgement, including during snapshots.
    scope.writing = new Set(uploads.map((note) => note.id));
    scope.inFlight = true;
    scope.flushWanted = false;
    publish(scope, { status: "saving", errorMessage: null });
    void (async () => {
      let succeeded = false;
      try {
        if (uploads.length) await uploadCloudNotes(owner, scope.productId, uploads);
        if (deletes.length) await deleteCloudNotes(owner, deletes);
        succeeded = true;
        scope.attempts = 0;
        for (const id of deletes) scope.deleted.delete(id);
        if (deletes.length) {
          const remaining = loadDeletedNoteIds(scope.uid, scope.productId).filter((id) => !deletes.includes(id));
          persistDeletedNoteIds(scope.uid, scope.productId, remaining);
        }
        publish(scope, {
          status: scope.dirty.size || scope.deleted.size ? "saving" : "saved",
          errorMessage: null, lastSavedAt: Date.now(),
        });
      } catch (error) {
        // Retry the LATEST version, not the captured pre-edit upload. A note
        // removed while this write was running must never be uploaded again.
        for (const note of uploads) {
          if (!scope.deleted.has(note.id) && scope.notes.some((row) => row.id === note.id)) scope.dirty.add(note.id);
        }
        publish(scope, { status: "error", errorMessage: describeNotesError(error) });
        if (scope.attempts < MAX_SYNC_ATTEMPTS) {
          scope.attempts += 1;
          scheduleRetry(scope, Math.min(20000, 700 * 2 ** Math.min(scope.attempts, 5)), () => flushRef.current(scope));
        }
      } finally {
        scope.inFlight = false;
        scope.writing.clear();
        // Serialise commits. Edits/deletes made during a write are sent AFTER
        // it, so a slow old upload cannot overwrite an edit or resurrect a delete.
        if (succeeded && (scope.dirty.size || scope.deleted.size)) {
          if (scope.disposed || scope.flushWanted) flushRef.current(scope);
          else scheduleFlush(scope);
        }
      }
    })();
  }, [publish, scheduleRetry, scheduleFlush]);
  flushRef.current = flushNow;

  // Load local-first, then merge the live copy. The queue survives listener
  // retries; only a new course/account creates a new independent session.
  useEffect(() => {
    if (!session.scoped) { setState(initialView(session)); return undefined; }
    let cancelled = false;
    session.listenerFailed = false;
    publish(session, { notes: session.notes, loading: true, status: "loading", errorMessage: null });
    const unsubscribe = subscribeCloudNotes(uidText, productText, (cloud) => {
      if (cancelled || scopeRef.current !== session) return;
      const localById = new Map(loadLocalNotes(uidText, productText).map((note) => [note.id, note]));
      for (const note of session.notes) {
        const mirrored = localById.get(note.id);
        if (!mirrored || noteTime(note) >= noteTime(mirrored) || session.dirty.has(note.id) || session.writing.has(note.id)) {
          localById.set(note.id, note);
        }
      }
      // An old server snapshot must not replace an unacknowledged edit, even
      // if the device clock ties the cloud timestamp.
      const protectedIds = new Set([...session.dirty, ...session.writing]);
      const merged = mergeNoteSets(cloud.filter((note) => !protectedIds.has(note.id)), Array.from(localById.values()), Array.from(session.deleted));
      const next = toPlayerNotes(merged.notes);
      session.notes = next;
      persistLocalNotes(uidText, productText, next);
      for (const id of merged.pendingUploads) if (!session.writing.has(id)) session.dirty.add(id);
      for (const id of merged.pendingDeletes) session.deleted.add(id);
      if (session.dirty.size || session.deleted.size) scheduleFlush(session);
      publish(session, { notes: next, loading: false, errorMessage: null });
      // Preserve the acknowledgement instead of downgrading "saved" on every
      // server echo; don't claim cloud success just because the mirror painted.
      setState((current) => current.session !== session ? current : {
        ...current, status: session.inFlight || session.dirty.size || session.deleted.size ? "saving" :
          current.status === "saved" ? "saved" : "ready",
      });
    }, (error) => {
      if (cancelled || scopeRef.current !== session) return;
      session.listenerFailed = true;
      publish(session, { loading: false, status: "error", errorMessage: describeNotesError(error) });
      if (session.attempts < MAX_SYNC_ATTEMPTS) {
        session.attempts += 1;
        scheduleRetry(session, Math.min(20000, 1200 * session.attempts), () => {
          if (scopeRef.current === session) setReloadToken((token) => token + 1);
        });
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [session, uidText, productText, reloadToken, publish, scheduleFlush, scheduleRetry]);

  const add = useCallback((html: string, extra?: Partial<CoursePlayerNote>) => {
    const scope = session;
    if (!scope.scoped || scope.notes.length >= MAX_NOTES_PER_COURSE) return null;
    const safeHtml = String(html || "");
    const text = String(extra?.text ?? richTextToPlain(safeHtml));
    if (!safeHtml.trim() && !text.trim()) return null;
    const note = toPlayerNote(normalizeNote({
      ...extra, id: extra?.id || newNoteId(), html: safeHtml, text,
      createdAt: Date.now(), updatedAt: 0, links: Array.isArray(extra?.links) ? extra.links : [],
    }));
    scope.deleted.delete(note.id);
    applyLocal([note, ...scope.notes.filter((row) => row.id !== note.id)], [note.id]);
    return note;
  }, [session, applyLocal]);

  const edit = useCallback((id: string, html: string) => {
    const scope = session;
    if (!scope.notes.some((note) => note.id === id)) return;
    const safeHtml = String(html || "");
    applyLocal(scope.notes.map((note) => note.id === id ? {
      ...note, html: safeHtml, text: richTextToPlain(safeHtml), updatedAt: nextNoteTime(note),
    } : note), [id]);
  }, [session, applyLocal]);

  const remove = useCallback((id: string) => {
    const scope = session;
    const noteId = sanitizeNoteId(id);
    if (!scope.scoped || !noteId) return;
    const result = removeNoteFromSet(scope.notes, noteId);
    scope.dirty.delete(noteId);
    scope.deleted.add(noteId);
    persistDeletedNoteIds(scope.uid, scope.productId, Array.from(scope.deleted));
    const next = toPlayerNotes(result.notes).map((note) => result.changed.includes(note.id) ? {
      ...note, updatedAt: nextNoteTime(note),
    } : note);
    applyLocal(next, result.changed);
    flushRef.current(scope);
  }, [session, applyLocal]);

  const link = useCallback((sourceId: string, nextLinks: string[]) => {
    const scope = session;
    const result = applyNoteLinks(scope.notes, sourceId, nextLinks);
    // Links need an edit timestamp too, otherwise merge ties favour the old
    // cloud document and silently undo the wires on the next snapshot.
    applyLocal(toPlayerNotes(result.notes).map((note) => result.changed.includes(note.id) ? {
      ...note, updatedAt: nextNoteTime(note),
    } : note), result.changed);
  }, [session, applyLocal]);

  const commit = useCallback((next: CoursePlayerNote[]) => {
    const scope = session;
    if (!scope.scoped) return;
    const known = new Map(scope.notes.map((note) => [note.id, note]));
    const normalized = (next || []).map((note) => normalizeNote(note));
    const dirty = normalized.filter((note) => {
      const before = known.get(note.id);
      return !before || String(before.html || "") !== note.html || before.text !== note.text ||
        (before.updatedAt || 0) !== note.updatedAt || (before.links || []).join("|") !== note.links.join("|");
    }).map((note) => note.id);
    const removedIds = Array.from(known.keys()).filter((id) => !normalized.some((note) => note.id === id));
    for (const id of removedIds) { scope.deleted.add(id); scope.dirty.delete(id); }
    if (removedIds.length) persistDeletedNoteIds(scope.uid, scope.productId, Array.from(scope.deleted));
    applyLocal(toPlayerNotes(normalized).map((note) => dirty.includes(note.id) && known.has(note.id) ? {
      ...note, updatedAt: Math.max(note.updatedAt || 0, nextNoteTime(known.get(note.id)!)),
    } : note), dirty);
    if (removedIds.length) flushRef.current(scope);
  }, [session, applyLocal]);

  const flush = useCallback(() => flushRef.current(session), [session]);
  const reload = useCallback(() => {
    const scope = session;
    scope.attempts = 0;
    if (scope.retry) { clearTimeout(scope.retry); scope.retry = null; }
    if (scopeRef.current === scope && !scope.disposed) setReloadToken((token) => token + 1);
  }, [session]);

  useEffect(() => {
    session.disposed = false;
    const onLeave = () => flushRef.current(session);
    const onOnline = () => {
      if (session.listenerFailed) reload();
      flushRef.current(session);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && session.listenerFailed) reload();
      onLeave();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("online", onOnline);
    return () => {
      session.disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onOnline);
      if (session.timer) { clearTimeout(session.timer); session.timer = null; }
      if (session.retry) { clearTimeout(session.retry); session.retry = null; }
      // Flush the OUTGOING scope, including edits made during an earlier
      // commit. No retry timer or UI update can outlive this session.
      flushRef.current(session);
    };
  }, [session, reload]);

  const { notes, status, errorMessage, lastSavedAt, loading } = view;
  const synced = session.dirty.size === 0 && session.deleted.size === 0 && !session.inFlight && status !== "error";
  return useMemo(() => ({
    notes, status, errorMessage, lastSavedAt, loading, synced, flush, reload, add, edit, remove, link, commit,
  }), [notes, status, errorMessage, lastSavedAt, loading, synced, flush, reload, add, edit, remove, link, commit]);
}
