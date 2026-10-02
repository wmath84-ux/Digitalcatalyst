// Test fixture for tests/noteEditorBrowser.test.mjs — see handle.html.
//
// The NoteEditor mounted directly (no panel), so the programmatic handle that
// NotesPanel is built on can be driven by the test: load / read / isEmpty /
// focusTitle / focusBody / reset / setReadOnly / undo / redo, plus every callback.

import { StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import NoteEditor, { type NoteDraft, type NoteEditorHandle } from "../../../src/course/NoteEditor";
import { CourseKeyboardProvider } from "../../../src/course/useCourseKeyboard";

declare global {
  interface Window {
    __handle: () => NoteEditorHandle | null;
    __events: { drafts: NoteDraft[]; empty: boolean[]; dirty: boolean[]; saves: number };
  }
}
window.__events = { drafts: [], empty: [], dirty: [], saves: 0 };

function Harness() {
  const shell = useRef<HTMLDivElement | null>(null);
  const handle = useRef<NoteEditorHandle | null>(null);
  window.__handle = () => handle.current;
  return (
    <CourseKeyboardProvider scopeRef={shell}>
      <div ref={shell} className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden" data-course-player style={{ colorScheme: "dark", background: "#0a0c12" }}>
        <NoteEditor
          ref={handle}
          initialTitle="Hello"
          initialBodyHtml="<p>World</p>"
          ariaLabel="Handle harness note"
          onDraftChange={(draft) => window.__events.drafts.push(draft)}
          onEmptyChange={(empty) => window.__events.empty.push(empty)}
          onDirtyChange={(dirty) => window.__events.dirty.push(dirty)}
          onSaveShortcut={() => { window.__events.saves += 1; }}
        />
      </div>
    </CourseKeyboardProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
