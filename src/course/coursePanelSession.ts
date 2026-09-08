// src/course/coursePanelSession.ts
//
// Session-scoped UI state for the Course Player's Notes and Mind Map panels.
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

export type NotesPanelSessionView =
  | { view: "list" }
  | { view: "compose"; draft: string; title: string }
  | { view: "edit"; noteId: string; draft: string; title: string };

export type MindMapPanelSessionView = "library" | "canvas";

interface CoursePanelSessionState {
  notes: NotesPanelSessionView;
  mindMapView: MindMapPanelSessionView;
}

const defaultState = (): CoursePanelSessionState => ({
  notes: { view: "list" },
  mindMapView: "library",
});

let session: CoursePanelSessionState = defaultState();

export const getCoursePanelSession = (): CoursePanelSessionState => session;

export const setNotesSessionView = (view: NotesPanelSessionView) => {
  session.notes = view;
};

export const setMindMapSessionView = (view: MindMapPanelSessionView) => {
  session.mindMapView = view;
};

/**
 * Reset every panel to its default entry state: notes list, mind map
 * library, mind map follows the player theme. Called when the Course
 * Player unmounts so the next visit starts fresh.
 */
export const resetCoursePanelSession = () => {
  session = defaultState();
};
