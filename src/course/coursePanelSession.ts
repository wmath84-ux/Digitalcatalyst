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
// The same store carries the panels' immersive sub-pages (notes editor,
// mind map canvas, brain answer deck, experiment viewer, read reader) so
// the footer navigation can hide while the learner is inside one of them
// and come back the moment they return to a library page. Panels publish
// their sub-page through the setters below; the two footer render sites
// (the Split Deck's in-flow dock and the parent-rendered Workspace pill)
// read it through `useFooterHiddenPage`, which subscribes reactively.

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

interface CoursePanelSessionState {
  notes: NotesPanelSessionView;
  /** A note is open full-panel (composing, editing, or reading a MASTER
   * note) — the Note Editor page for the footer rule. Kept apart from
   * `notes` itself, whose value also drives session restore. */
  notesEditorOpen: boolean;
  mindMapView: MindMapPanelSessionView;
  readView: ReadPanelSessionView;
  brainView: BrainPanelSessionView;
  experimentView: ExperimentPanelSessionView;
}

const defaultState = (): CoursePanelSessionState => ({
  notes: { view: "list" },
  notesEditorOpen: false,
  mindMapView: "library",
  readView: "library",
  brainView: "home",
  experimentView: "library",
});

let session: CoursePanelSessionState = defaultState();

// ── Reactive read side ──────────────────────────────────────────────────────
// Footer components re-render only when the footer-relevant projection of
// the session changes (the notes draft text, for instance, is republished
// on every keystroke and must not churn the dock).
let snapshot: CoursePanelSessionState = session;
const listeners = new Set<() => void>();

const projectionOf = (state: CoursePanelSessionState): string =>
  [state.notes.view, state.notesEditorOpen, state.mindMapView, state.readView, state.brainView, state.experimentView].join("|");

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

export const setNotesEditorOpen = (open: boolean) => {
  const before = projectionOf(session);
  session.notesEditorOpen = open;
  emitIfProjectionChanged(before);
};

export const setMindMapSessionView = (view: MindMapPanelSessionView) => {
  const before = projectionOf(session);
  session.mindMapView = view;
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

/**
 * The Course Player pages its footer navigation must NOT cover: the Note
 * Editor, the Mind Map Editor, the Brain Card / Brain Practice answer
 * page, the Live Experiment Viewer, the Sketch Editor, the Read Library's
 * PDF viewer and the Annotations viewer (an opened learner PDF). Every
 * other page — every library/shelf page above all — keeps the footer, and
 * the Music Player keeps the footer behaviour it has always had.
 *
 * `tab` is the dock tab key (CourseOverlay's DockTab); it is typed as a
 * plain string here so this module never has to import the overlay.
 */
export const isFooterHiddenPage = (tab: string, state: CoursePanelSessionState): boolean => {
  switch (tab) {
    case "notes":
      return state.notesEditorOpen;
    case "mindmap":
      return state.mindMapView === "canvas";
    case "brain":
      return state.brainView === "answer";
    case "experiment":
      return state.experimentView === "viewer";
    case "sketch":
      // The Sketch tab IS the editor — there is no sketch library page.
      return true;
    case "read":
      return state.readView === "reader";
    default:
      // modules / paid / player / ai — and "music", whose footer behaviour
      // is explicitly preserved.
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
