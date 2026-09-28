// src/course/useCourseNotes.ts
//
// Per-course NOTES persistence — the hook behind the Course Player's Notes tab
// AND the Sanctuary's note board.
//
// ── Why this exists ───────────────────────────────────────────────────────
// Notes were device-only: `notesStore.ts` wrote the list to `localStorage` and
// nothing else. The type comment in `src/types/course.ts` even claimed
// "Multi-device sync is automatic via the Firestore listener", but no listener
// existed — so a note taken inside the 3D Sanctuary (or on a phone) was never
// in Firebase, never rendered on another device, and was gone the moment site
// data was cleared. That is the reported "Sanctuary ke notes aur mind map save
// nahi ho rahe".
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

export default function useCourseNotes(input: UseCourseNotesInput): UseCourseNotesResult {
  const { uid, productId, debounceMs = DEFAULT_DEBOUNCE_MS } = input;

  // An empty product id is NOT a scope: writing to `users/{uid}/notes` with
  // `productId: ""` would pool every unpicked course's notes together.
  const scoped = Boolean(uid) && productId != null && String(productId).length > 0;
  const uidText = String(uid || "");
  const productText = String(productId ?? "");

  const [notes, setNotes] = useState<CoursePlayerNote[]>([]);
  const [status, setStatus] = useState<NotesSaveStatus>(scoped ? "loading" : "idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(scoped);
  const [reloadToken, setReloadToken] = useState(0);

  /** Latest list, readable from a timer without re-subscribing. */
  const notesRef = useRef(notes);
  notesRef.current = notes;
  /** Ids whose document has to be written. */
  const dirtyRef = useRef<Set<string>>(new Set());
  /** Ids deleted here whose cloud delete has not been confirmed. */
  const deletedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const scopeRef = useRef({ uid: uidText, productId: productText, scoped });
  scopeRef.current = { uid: uidText, productId: productText, scoped };
  const flushRef = useRef<() => void>(() => undefined);

  /** Indirection so `applyLocal` can queue a save without depending on it. */
  const scheduleRef = useRef<(() => void) | null>(null);
  /** Set once the hook is torn down: no retry may outlive it. */
  const disposedRef = useRef(false);

  /**
   * One place that schedules a retry, so a retry can never outlive the hook.
   *
   * This matters for the FINAL flush: leaving the board pushes whatever is
   * pending, and if that push fails the hook is already gone — arming another
   * attempt there would keep a dead controller waking itself up (and, in a
   * test runner, pin the event loop open) long after the learner moved on. The
   * work is not lost: the device mirror still holds it and the next mount's
   * merge pushes it up again.
   */
  const scheduleRetry = useCallback((delayMs: number, run: () => void) => {
    if (disposedRef.current) return;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      if (disposedRef.current) return;
      run();
    }, delayMs);
  }, []);

  /** State + device mirror in one step, so the two can never disagree. */
  const applyLocal = useCallback((next: CoursePlayerNote[], dirtyIds: string[] = []) => {
    const scope = scopeRef.current;
    const sorted = byRecency(next).slice(0, MAX_NOTES_PER_COURSE);
    setNotes(sorted);
    notesRef.current = sorted;
    if (!scope.scoped) return;
    persistLocalNotes(scope.uid, scope.productId, sorted);
    for (const id of dirtyIds) if (id) dirtyRef.current.add(id);
    if (dirtyIds.length) scheduleRef.current?.();
  }, []);

  // ── Commit pending work to Firestore ─────────────────────────────────────
  const flushNow = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope.scoped) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const uploads = Array.from(dirtyRef.current)
      .map((id) => notesRef.current.find((note) => note.id === id))
      .filter((note): note is CoursePlayerNote => Boolean(note));
    const deletes = Array.from(deletedRef.current);
    // Nothing waiting for the cloud: leave the status exactly where it was so a
    // reported error is never painted over by a no-op flush.
    if (!uploads.length && !deletes.length) return;

    const owner = cloudNotesUid(scope.uid);
    if (!owner) {
      // Signed out (or a stale scope): everything stays on the device mirror
      // and is retried — never dropped.
      setStatus("error");
      setErrorMessage("Sign-in session confirm nahi hua — notes is device par safe hain aur login ke baad sync ho jayenge.");
      if (attemptRef.current < MAX_SYNC_ATTEMPTS) {
        attemptRef.current += 1;
        scheduleRetry(Math.min(15000, 900 * attemptRef.current), () => flushRef.current());
      }
      return;
    }

    dirtyRef.current = new Set();
    deletedRef.current = new Set();
    setStatus("saving");

    void (async () => {
      try {
        if (uploads.length) await uploadCloudNotes(owner, scope.productId, uploads);
        if (deletes.length) await deleteCloudNotes(owner, deletes);
        attemptRef.current = 0;
        setStatus("saved");
        setErrorMessage(null);
        setLastSavedAt(Date.now());
        // The cloud confirmed the deletes: the tombstones can go.
        if (deletes.length) {
          const remaining = loadDeletedNoteIds(scope.uid, scope.productId).filter(
            (id) => !deletes.includes(id),
          );
          persistDeletedNoteIds(scope.uid, scope.productId, remaining);
        }
      } catch (error) {
        // Put the work back so the retry (or the next mount) still carries it.
        for (const note of uploads) dirtyRef.current.add(note.id);
        for (const id of deletes) deletedRef.current.add(id);
        setStatus("error");
        setErrorMessage(describeNotesError(error));
        if (attemptRef.current >= MAX_SYNC_ATTEMPTS) return;
        attemptRef.current += 1;
        const delay = Math.min(20000, 700 * 2 ** Math.min(attemptRef.current, 5));
        scheduleRetry(delay, () => flushRef.current());
      }
    })();
  }, []);

  flushRef.current = flushNow;

  /** Queue a debounced commit. */
  const scheduleFlush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushRef.current();
    }, debounceMs);
  }, [debounceMs]);

  scheduleRef.current = scoped ? scheduleFlush : null;

  // ── Load: device mirror first, then the live cloud copy ──────────────────
  useEffect(() => {
    if (!scoped) {
      setNotes([]);
      setStatus("idle");
      setLoading(false);
      setErrorMessage(null);
      dirtyRef.current = new Set();
      deletedRef.current = new Set();
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setStatus("loading");
    dirtyRef.current = new Set();
    deletedRef.current = new Set(loadDeletedNoteIds(uidText, productText));

    // 1. The device copy paints the board immediately — offline included.
    const mirrored = loadLocalNotes(uidText, productText);
    if (mirrored.length) {
      setNotes(byRecency(mirrored));
      setStatus("ready");
    }

    // 2. Firestore is authoritative and stays live: a note written on another
    //    device lands here without a refresh.
    const unsubscribe = subscribeCloudNotes(
      uidText,
      productText,
      (cloud) => {
        if (cancelled) return;
        const merged = mergeNoteSets(
          cloud,
          loadLocalNotes(uidText, productText),
          Array.from(deletedRef.current),
        );
        const next = toPlayerNotes(merged.notes);
        setNotes(next);
        notesRef.current = next;
        persistLocalNotes(uidText, productText, next);

        // A delete this device never managed to commit, and any note that only
        // exists here (written offline, or by a build with no cloud store) go
        // straight back up — this is what migrates every existing note.
        for (const id of merged.pendingDeletes) deletedRef.current.add(id);
        if (merged.pendingDeletes.length) {
          persistDeletedNoteIds(uidText, productText, Array.from(deletedRef.current));
        }
        for (const id of merged.pendingUploads) dirtyRef.current.add(id);
        if (merged.pendingUploads.length || merged.pendingDeletes.length) scheduleRef.current?.();

        setLoading(false);
        setStatus((current) => (current === "saving" ? current : "ready"));
      },
      (error) => {
        if (cancelled) return;
        setLoading(false);
        setStatus("error");
        setErrorMessage(describeNotesError(error));
        // The board still shows the device copy; retry the cloud sync.
        if (attemptRef.current < MAX_SYNC_ATTEMPTS) {
          attemptRef.current += 1;
          scheduleRetry(Math.min(20000, 1200 * attemptRef.current), () => {
            setReloadToken((token) => token + 1);
          });
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [scoped, uidText, productText, reloadToken]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const add = useCallback(
    (html: string, extra?: Partial<CoursePlayerNote>) => {
      const now = Date.now();
      const safeHtml = String(html || "");
      const text = String(extra?.text ?? richTextToPlain(safeHtml));
      if (!safeHtml.trim() && !text.trim()) return null;
      const note = toPlayerNote(
        normalizeNote({
          ...extra,
          id: extra?.id || newNoteId(),
          html: safeHtml,
          text,
          createdAt: now,
          updatedAt: 0,
          links: Array.isArray(extra?.links) ? extra.links : [],
        }),
      );
      applyLocal([note, ...notesRef.current], [note.id]);
      return note;
    },
    [applyLocal],
  );

  const edit = useCallback(
    (id: string, html: string) => {
      const safeHtml = String(html || "");
      const next = notesRef.current.map((note) =>
        note.id === id
          ? { ...note, html: safeHtml, text: richTextToPlain(safeHtml) || note.text, updatedAt: Date.now() }
          : note,
      );
      applyLocal(next, [id]);
    },
    [applyLocal],
  );

  const remove = useCallback(
    (id: string) => {
      const noteId = sanitizeNoteId(id);
      const scope = scopeRef.current;
      const result = removeNoteFromSet(notesRef.current, noteId);
      // The tombstone is written BEFORE the cloud delete is attempted, so a
      // refresh (or another snapshot) can never resurrect the note while the
      // delete is still in flight or queued for retry.
      dirtyRef.current.delete(noteId);
      deletedRef.current.add(noteId);
      if (scope.scoped) {
        persistDeletedNoteIds(scope.uid, scope.productId, Array.from(deletedRef.current));
      }
      applyLocal(toPlayerNotes(result.notes), result.changed);
      // A delete goes out immediately: leaving it in the debounce window is how
      // a note used to come back after a refresh.
      if (scope.scoped) flushRef.current();
    },
    [applyLocal],
  );

  const link = useCallback(
    (sourceId: string, nextLinks: string[]) => {
      const result = applyNoteLinks(notesRef.current, sourceId, nextLinks);
      applyLocal(toPlayerNotes(result.notes), result.changed);
    },
    [applyLocal],
  );

  /**
   * Replace the whole list. Used by the player's unmount draft rescue and by
   * the AI's "Save as note": both hand over a finished list, and every note
   * that is new or changed here is written to the cloud.
   */
  const commit = useCallback(
    (next: CoursePlayerNote[]) => {
      const known = new Map(notesRef.current.map((note) => [note.id, note]));
      const normalized = (next || []).map((note) => normalizeNote(note));
      const dirty = normalized
        .filter((note) => {
          const before = known.get(note.id);
          return (
            !before
            || String(before.html || "") !== note.html
            || String(before.text || "") !== note.text
            || (before.updatedAt || 0) !== note.updatedAt
            || (before.links || []).join("|") !== note.links.join("|")
          );
        })
        .map((note) => note.id);
      const removedIds = Array.from(known.keys()).filter(
        (id) => !normalized.some((note) => note.id === id),
      );
      for (const id of removedIds) deletedRef.current.add(id);
      if (removedIds.length && scopeRef.current.scoped) {
        persistDeletedNoteIds(scopeRef.current.uid, scopeRef.current.productId, Array.from(deletedRef.current));
      }
      applyLocal(toPlayerNotes(normalized), dirty);
      if (removedIds.length && scopeRef.current.scoped) flushRef.current();
    },
    [applyLocal],
  );

  const reload = useCallback(() => {
    attemptRef.current = 0;
    setErrorMessage(null);
    setReloadToken((token) => token + 1);
  }, []);

  // Nothing pending may be left behind when the learner leaves: flush on
  // unmount, when the tab is hidden and when the page is being closed.
  useEffect(() => {
    // Cleared on every (re)setup: React's StrictMode mounts, unmounts and
    // mounts the SAME instance, and a stale `true` would silently disable
    // every retry for that board.
    disposedRef.current = false;
    const onLeave = () => flushRef.current();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onLeave);
      window.addEventListener("pagehide", onLeave);
    }
    return () => {
      // Marked BEFORE the final flush: if that flush fails there is no hook
      // left to retry for, and the device mirror carries the work to the next
      // mount instead.
      disposedRef.current = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onLeave);
        window.removeEventListener("pagehide", onLeave);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
      flushRef.current();
    };
  }, []);

  const synced = useMemo(
    () => dirtyRef.current.size === 0 && deletedRef.current.size === 0 && status !== "saving",
    // `status` is the only reactive part; the refs are read at render time.
    [status, notes],
  );

  // Memoised so consumers (the player, the 3D boards) get a STABLE controller
  // identity: the boards are composited in 3D and rebuild their panels on
  // every prop change, and every callback below is already `useCallback`-stable.
  return useMemo(
    () => ({
      notes,
      status,
      errorMessage,
      lastSavedAt,
      loading,
      synced,
      flush: flushNow,
      reload,
      add,
      edit,
      remove,
      link,
      commit,
    }),
    [notes, status, errorMessage, lastSavedAt, loading, synced, flushNow, reload, add, edit, remove, link, commit],
  );
}
