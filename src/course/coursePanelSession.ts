// src/course/coursePanelSession.ts
//
// Session-scoped UI state for the Course Player's Notes and Mind Map panels.
//
// While the learner stays INSIDE the course player, the panels keep their
// place across every switch: open the notes editor, jump to the Module tab,
// come back — the editor is still open. Same for the mind map: library stays
// library, canvas stays canvas, and the map's own light/dark pick stays
// picked.
//
// The moment the learner LEAVES the player (the player unmounts) everything
// resets to the entry defaults — notes list, mind map library, and the mind
// map follows the player's theme again. CoursePlayerApp calls
// `resetCoursePanelSession()` in its unmount cleanup to guarantee that, so a
// fresh entry always starts from the default library state.
//
// Module scope is the right lifetime for this: it survives the NotesPanel /
// MindMapPanel unmounting on every tab switch, but dies with the page, and
// the player's unmount cleanup resets it between visits.

export type NotesPanelSessionView =
  | { view: "list" }
  | { view: "compose"; draft: string; title: string }
  | { view: "edit"; noteId: string; draft: string; title: string };

export type MindMapPanelSessionView = "library" | "canvas";

/** null → no manual pick: the mind map follows the Course Player's theme. */
export type MindMapThemeChoice = "dark" | "light" | null;

interface CoursePanelSessionState {
  notes: NotesPanelSessionView;
  mindMapView: MindMapPanelSessionView;
  mindMapThemeOverride: MindMapThemeChoice;
}

const defaultState = (): CoursePanelSessionState => ({
  notes: { view: "list" },
  mindMapView: "library",
  mindMapThemeOverride: null,
});

let session: CoursePanelSessionState = defaultState();

export const getCoursePanelSession = (): CoursePanelSessionState => session;

export const setNotesSessionView = (view: NotesPanelSessionView) => {
  session.notes = view;
};

export const setMindMapSessionView = (view: MindMapPanelSessionView) => {
  session.mindMapView = view;
};

export const setMindMapSessionTheme = (choice: MindMapThemeChoice) => {
  session.mindMapThemeOverride = choice;
};

/**
 * Reset every panel to its default entry state: notes list, mind map
 * library, mind map follows the player theme. Called when the Course
 * Player unmounts so the next visit starts fresh.
 */
export const resetCoursePanelSession = () => {
  session = defaultState();
};
