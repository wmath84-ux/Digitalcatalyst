// src/course/coursePanelSession.ts
//
// Session-scoped UI state for the Course Player's panels.
//
// While the learner stays INSIDE the course player, the panels keep their
// place across every switch: open the notes editor, jump to the Module tab,
// come back — the editor is still open. Same for the mind map: library stays
// library, canvas stays canvas.
//
// The moment the learner LEAVES the player (the player unmounts) everything
// resets to the entry defaults — notes list and mind map library.
// CoursePlayerApp calls
// `resetCoursePanelSession()` in its unmount cleanup to guarantee that, so a
// fresh entry always starts from the default library state.
//
// Module scope is the right lifetime for this: it survives the NotesPanel /
// MindMapPanel unmounting on every tab switch, but dies with the page, and
// the player's unmount cleanup resets it between visits.
//
// The same store carries the panels' sub-pages (notes editor, mind map canvas,
// brain answer deck, experiment viewer, read reader, the Music tab's open
// player, both search surfaces) so the footer navigation can hide on the pages
// the owner EXCLUDED and come back the moment the learner returns to a library
// page. Panels publish their sub-page through the setters below; the two footer
// render sites (the Split Deck's in-flow dock and the parent-rendered Workspace
// pill) read it through `useFooterHiddenPage`, which subscribes reactively.
//
// ── The owner's ONE rule (2026-10-16) ─────────────────────────────────────
//
//   "Yah tab nahin dikhega jab editor mode on hoga, bas; baaki hamesha dikhe."
//
// So the three EDITOR tabs (notes / mind map / sketch) hide the footer on their
// WRITE mode only — the notes READ view, the mind-map READ canvas and the
// sketch READ mode all keep it — and every other hidden page is one the owner
// named himself: the brain answer deck, the live experiment viewer, an open PDF
// in the Read Library, the Music tab's real player (audio player or YouTube
// player), and the two SEARCH pages (the Resource Library's nested search page,
// the Music library's search page). A search RESULTS page is NOT hidden: the
// footer is there and steps away only while the learner scrolls down, coming
// straight back at the top (see `SearchSurfaceView` below).

import { useSyncExternalStore } from "react";

export type NotesPanelSessionView =
  | { view: "list" }
  | { view: "compose"; draft: string; title: string }
  | { view: "edit"; noteId: string; draft: string; title: string };

export type MindMapPanelSessionView = "library" | "canvas";

/** Read tab: the shelf ("library") or an open PDF ("reader" — the course /
 * annotations PDF viewers and the Google Drive viewer alike). */
export type ReadPanelSessionView = "library" | "reader";

/** Brain tab: the practice-set shelf ("home") or the answering deck. */
export type BrainPanelSessionView = "home" | "answer";

/** Experiment tab: the experiment shelf ("library") or the live viewer. */
export type ExperimentPanelSessionView = "library" | "viewer";

/**
 * Music tab: the LIBRARY page (the search bar + the white filter tray — where
 * the footer navigation belongs) or an open PLAYER (the full-area audio player
 * / the YouTube player with its draggable divider — where the owner asked for
 * the footer to hide: "jab user audio player par ho ya YouTube video player par
 * ho to footer navigation nahin dikhna chahiye … aur jaise hi user library page
 * par aaye footer navigation wapas se dekhne lage").
 */
export type MusicPanelSessionView = "library" | "player";

/**
 * ONE search surface (the Resource Library's nested search page, or the Music
 * library's search page — the owner asked for the same behaviour in both):
 *
 *   · "closed"  — the surface is not up at all.
 *   · "page"    — the learner is ON the search page: the ready-to-write box,
 *                 the previous searches, and the flash scan while it runs.
 *                 The footer navigation does NOT show here (the owner: "search
 *                 page → footer nahin").
 *   · "results" — results are on screen. The footer shows — and steps away on
 *                 its own while the learner scrolls down through them,
 *                 returning the moment they are back at the top (the owner:
 *                 "search result page → dikhe, scroll down kare to hide ho
 *                 jaye, wapas top par aate hi dikh jaye").
 */
export type SearchSurfaceView = "closed" | "page" | "results";

interface CoursePanelSessionState {
  notes: NotesPanelSessionView;
  /**
   * The notes page is in WRITE mode (the editor or the composer). A MASTER
   * note open in the READ view is deliberately NOT this: read modes keep the
   * footer — the owner's rule is "hide while editor mode is on, bas".
   */
  notesEditMode: boolean;
  mindMapView: MindMapPanelSessionView;
  /** The mind map canvas is in EDIT mode (a read-only MASTER map is not). */
  mindMapEditMode: boolean;
  readView: ReadPanelSessionView;
  brainView: BrainPanelSessionView;
  experimentView: ExperimentPanelSessionView;
  musicView: MusicPanelSessionView;
  /**
   * The sketch page is in EDIT mode. The Sketch tab has no library page, so
   * this is the whole of its footer rule: reading a sketch keeps the footer,
   * drawing takes it away.
   */
  sketchEditMode: boolean;
  /** The Resource Library's nested search page (Modules tab). */
  librarySearch: SearchSurfaceView;
  /** That page is scrolled away from the top, with results on screen. */
  librarySearchScrolledAway: boolean;
  /** The Music library's search page (same behaviour, same surface). */
  musicSearch: SearchSurfaceView;
  /** That page is scrolled away from the top, with results on screen. */
  musicSearchScrolledAway: boolean;
}

const defaultState = (): CoursePanelSessionState => ({
  notes: { view: "list" },
  notesEditMode: false,
  mindMapView: "library",
  mindMapEditMode: false,
  readView: "library",
  brainView: "home",
  experimentView: "library",
  musicView: "library",
  sketchEditMode: false,
  librarySearch: "closed",
  librarySearchScrolledAway: false,
  musicSearch: "closed",
  musicSearchScrolledAway: false,
});

let session: CoursePanelSessionState = defaultState();

// ── Reactive read side ──────────────────────────────────────────────────────
// Footer components re-render only when the footer-relevant projection of
// the session changes (the notes draft text, for instance, is republished
// on every keystroke and must not churn the dock).
let snapshot: CoursePanelSessionState = session;
const listeners = new Set<() => void>();

const projectionOf = (state: CoursePanelSessionState): string =>
  [
    state.notes.view,
    state.notesEditMode,
    state.mindMapView,
    state.mindMapEditMode,
    state.readView,
    state.brainView,
    state.experimentView,
    state.musicView,
    state.sketchEditMode,
    state.librarySearch,
    state.librarySearchScrolledAway,
    state.musicSearch,
    state.musicSearchScrolledAway,
  ].join("|");

const emitIfProjectionChanged = (before: string) => {
  if (projectionOf(session) === before) return;
  snapshot = { ...session };
  listeners.forEach((listener) => listener());
};

const subscribeCoursePanelSession = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The live panel session, re-rendering the caller when a panel's
 * immersive sub-page changes. */
export const useCoursePanelSession = (): CoursePanelSessionState =>
  useSyncExternalStore(subscribeCoursePanelSession, () => snapshot, () => snapshot);

export const getCoursePanelSession = (): CoursePanelSessionState => session;

export const setNotesSessionView = (view: NotesPanelSessionView) => {
  const before = projectionOf(session);
  session.notes = view;
  emitIfProjectionChanged(before);
};

/** The notes page entered or left its WRITE mode (see `notesEditMode`). */
export const setNotesEditMode = (writing: boolean) => {
  const before = projectionOf(session);
  session.notesEditMode = writing;
  emitIfProjectionChanged(before);
};

export const setMindMapSessionView = (view: MindMapPanelSessionView) => {
  const before = projectionOf(session);
  session.mindMapView = view;
  emitIfProjectionChanged(before);
};

export const setMindMapEditMode = (editing: boolean) => {
  const before = projectionOf(session);
  session.mindMapEditMode = editing;
  emitIfProjectionChanged(before);
};

export const setSketchEditMode = (editing: boolean) => {
  const before = projectionOf(session);
  session.sketchEditMode = editing;
  emitIfProjectionChanged(before);
};

/** Which search surface a publish belongs to. */
export type SearchSurface = "library" | "music";

export const setSearchSurface = (surface: SearchSurface, view: SearchSurfaceView) => {
  const before = projectionOf(session);
  if (surface === "library") session.librarySearch = view;
  else session.musicSearch = view;
  // A surface that is no longer on results can never stay "scrolled away":
  // its next appearance starts clean at the top of the page.
  if (view !== "results") {
    if (surface === "library") session.librarySearchScrolledAway = false;
    else session.musicSearchScrolledAway = false;
  }
  emitIfProjectionChanged(before);
};

export const setSearchScrolledAway = (surface: SearchSurface, away: boolean) => {
  const before = projectionOf(session);
  if (surface === "library") session.librarySearchScrolledAway = away;
  else session.musicSearchScrolledAway = away;
  emitIfProjectionChanged(before);
};

export const setReadSessionView = (view: ReadPanelSessionView) => {
  const before = projectionOf(session);
  session.readView = view;
  emitIfProjectionChanged(before);
};

export const setBrainSessionView = (view: BrainPanelSessionView) => {
  const before = projectionOf(session);
  session.brainView = view;
  emitIfProjectionChanged(before);
};

export const setExperimentSessionView = (view: ExperimentPanelSessionView) => {
  const before = projectionOf(session);
  session.experimentView = view;
  emitIfProjectionChanged(before);
};

export const setMusicSessionView = (view: MusicPanelSessionView) => {
  const before = projectionOf(session);
  session.musicView = view;
  emitIfProjectionChanged(before);
};

/**
 * The Course Player's ONE footer rule (the owner, 2026-10-16):
 *
 *   "Yah tab nahin dikhega jab editor mode on hoga, bas; baaki hamesha dikhe."
 *
 * In full, the footer navigation is NOT shown:
 *
 *   · while an EDITOR is in edit mode — the notes page writing (its READ view
 *     keeps the footer), the mind map drawing (its READ canvas keeps it) and
 *     the sketch page drawing (its READ mode keeps it — the Sketch tab has no
 *     library page, so read mode is where the footer lives);
 *   · on the Brain Card / Brain Practice answer deck;
 *   · in the Live Experiment Viewer (the experiment LIBRARY keeps the footer);
 *   · in the Read Library's PDF viewer and annotations viewer (its shelf
 *     keeps the footer);
 *   · while the Music tab's real PLAYER is up — the full-area audio player or
 *     the YouTube player with its divider — and on the Music library's SEARCH
 *     page (the ready-to-write box and its flash scan); the music LIBRARY
 *     page keeps it;
 *   · on the Resource Library's SEARCH page (the same surface, the same rule);
 *   · on either search RESULTS page it is shown, and steps away by itself only
 *     while the learner scrolls down — it is back the moment they return to
 *     the top (the scroll half is published separately, see
 *     `setSearchScrolledAway`).
 *
 * Every other page — every library / shelf / listing page — shows it.
 *
 * `tab` is the dock tab key (CourseOverlay's DockTab); it is typed as a
 * plain string here so this module never has to import the overlay.
 */
export const isFooterHiddenPage = (tab: string, state: CoursePanelSessionState): boolean => {
  switch (tab) {
    case "notes":
      // WRITE mode only: a MASTER note opened for reading keeps the footer.
      return state.notesEditMode;
    case "mindmap":
      // EDIT mode only: the read canvas (a MASTER map included) keeps it.
      return state.mindMapEditMode;
    case "sketch":
      // EDIT mode only: reading a sketch keeps the footer.
      return state.sketchEditMode;
    case "brain":
      return state.brainView === "answer";
    case "experiment":
      return state.experimentView === "viewer";
    case "read":
      return state.readView === "reader";
    case "music":
      // The library page keeps it; the real player and the search page take it.
      return (
        state.musicView === "player" ||
        state.musicSearch === "page" ||
        (state.musicSearch === "results" && state.musicSearchScrolledAway)
      );
    case "modules":
      // The Resource Library page keeps it; its nested search page takes it,
      // and a results page only while it is scrolled away.
      return (
        state.librarySearch === "page" ||
        (state.librarySearch === "results" && state.librarySearchScrolledAway)
      );
    default:
      // paid / player / ai — libraries, always with the footer.
      return false;
  }
};

/** Reactive form of `isFooterHiddenPage` for the footer render sites. */
export const useFooterHiddenPage = (tab: string): boolean =>
  isFooterHiddenPage(tab, useCoursePanelSession());

/**
 * Reset every panel to its default entry state: notes list, mind map
 * library, read library, brain home, experiment library. Called when the
 * Course Player unmounts so the next visit starts fresh.
 */
export const resetCoursePanelSession = () => {
  const before = projectionOf(session);
  session = defaultState();
  emitIfProjectionChanged(before);
};
