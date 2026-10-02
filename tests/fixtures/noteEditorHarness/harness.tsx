// Test fixture for tests/noteEditorBrowser.test.mjs — see harness.html.
//
// It mounts exactly what the Course Player mounts around the notes: the player's
// keyboard provider on a `.course-player-shell`, the SplitDeck, and the real
// NotesPanel. The window hooks below are the only test-only surface.

import { Profiler, StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NotebookPen } from "lucide-react";
import "../../../src/index.css";
import NotesPanel from "../../../src/course/NotesPanel";
import { SplitDeck } from "../../../src/course/studyPanels";
import { CourseKeyboardProvider, useCourseKeyboard } from "../../../src/course/useCourseKeyboard";
import { getCoursePanelSession } from "../../../src/course/coursePanelSession";
import type { CoursePlayerNote } from "../../../src/types/course";

const now = Date.now();
const seed: CoursePlayerNote[] = [
  { id: "n1", text: "Photosynthesis", createdAt: now - 5000, html: "<h1>Photosynthesis</h1><hr><p>Plants turn <b>light</b> into sugar.</p><ul><li>Chlorophyll</li><li>Stomata<ul><li>gas exchange</li></ul></li></ul><ol><li>Light reactions</li><li>Calvin cycle</li></ol>" },
  { id: "n2", text: "Legacy lines", createdAt: now - 4000, html: "<div>First legacy line</div><div><br></div><div>Second line with <i>italic</i> and <u>underline</u></div>" },
  { id: "n3", text: "Table note", createdAt: now - 3000, html: "<h1>Table note</h1><hr><p>Before</p><table><tbody><tr><th>Term</th><th>Meaning</th></tr><tr><td>ATP</td><td>Energy</td></tr></tbody></table><p>After</p>" },
  { id: "n4", text: "Tasks", createdAt: now - 2000, html: "<h1>Tasks</h1><hr><ul><li data-checked=\"true\">Read chapter</li><li data-checked=\"false\">Do exercises</li></ul><blockquote>Quote me</blockquote><pre><code>let x = 1;\nlet y = 2;</code></pre>" },
  { id: "n5", text: "Plain only", createdAt: now - 1000 },
  { id: "n6", text: "Stress", createdAt: now - 500, html: "<h1>A very long note title that should wrap onto several lines on a narrow phone without any horizontal scrolling at all</h1><hr><p>https://example.com/a/very/long/unbreakable/url/that/keeps/going/and/going/and/going/and/going/and/going/forever.html</p><table><tbody><tr><th>Column one heading</th><th>Column two heading</th><th>Column three heading</th><th>Column four heading</th></tr><tr><td>alpha alpha alpha alpha alpha</td><td>beta beta beta beta beta</td><td>gamma gamma gamma gamma</td><td>delta delta delta delta</td></tr></tbody></table><pre><code>const reallyLongLine = 'x'.repeat(400) + 'this code line is far wider than any phone screen will ever be';</code></pre><h2>Second level</h2><h3>Third level</h3><ul><li>one<ul><li>two<ul><li>three<ul><li>four</li></ul></li></ul></li></ul></li></ul><p><a href=\"https://example.com\">a link</a> and <code>inline code</code> and <b><i><u>bold italic underline</u></i></b></p>" },
];

declare global {
  interface Window {
    __notes: CoursePlayerNote[];
    __log: string[];
    __kb: { visible: boolean; inset: number };
    __notesRenders: number;
    __exitSession: string;
    __harness: { togglePanel: () => void; exit: () => void };
  }
}
window.__log = [];
window.__notesRenders = 0;

function KeyboardProbe() {
  const keyboard = useCourseKeyboard();
  window.__kb = { visible: keyboard.keyboardVisible, inset: keyboard.keyboardInset };
  return null;
}

// The player's footer navigation, opt-in (`?footer=peek` or `?footer=pane`), so
// the note toolbar's "ends just above the footer" rule can be driven in a real
// browser. Both homes are reproduced with the geometry src/index.css gives the
// real ones: the peek dock's 30px hit strip + 8px line + 10px of padding, and
// the always-visible dock as the study pane's last child. Without the param the
// harness DOM is exactly what it always was — no footer at all.
const footerMode = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("footer");

const PeekFooter = () => (
  <div
    data-course-peek-dock=""
    className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center"
    style={{ paddingBottom: 10 }}
  >
    <div
      data-course-peek-line-hit=""
      style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", width: "min(26rem, 92%)", padding: "30px 24px 0" }}
    >
      <div data-course-peek-line="" style={{ width: "min(22rem, 68%)", height: 8, borderRadius: 9999, background: "rgba(255,255,255,0.55)" }} />
    </div>
  </div>
);

function Harness() {
  const [notes, setNotes] = useState<CoursePlayerNote[]>(seed);
  const [panel, setPanel] = useState(true);
  const shell = useRef<HTMLDivElement | null>(null);
  window.__notes = notes;
  window.__harness = { togglePanel: () => setPanel((open) => !open), exit: () => root.unmount() };
  // Mirrors CoursePlayerApp's exit effect: a PASSIVE cleanup on a PARENT that
  // reads the panel session while the editor below it is unmounting.
  useEffect(() => () => { window.__exitSession = JSON.stringify(getCoursePanelSession().notes); }, []);
  const handlers = useMemo(() => ({
    onAdd: (html: string) => { window.__log.push("add"); setNotes((list) => [{ id: `new-${list.length}`, text: html.replace(/<[^>]*>/g, " "), html, createdAt: Date.now() }, ...list]); },
    onEdit: (id: string, html: string) => { window.__log.push(`edit:${id}`); setNotes((list) => list.map((note) => (note.id === id ? { ...note, html, text: html.replace(/<[^>]*>/g, " ") } : note))); },
    onDelete: (id: string) => { window.__log.push(`delete:${id}`); setNotes((list) => list.filter((note) => note.id !== id)); },
  }), []);
  return (
    <CourseKeyboardProvider scopeRef={shell}>
      <KeyboardProbe />
      <div ref={shell} className="course-player-shell fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden text-[var(--course-text)]" data-course-player style={{ colorScheme: "dark", background: "#0a0c12" }}>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <SplitDeck
            axis="column"
            orientation="portrait"
            courseId="note-editor-harness"
            accent="#3A86FF"
            studyIcon={NotebookPen}
            lesson={<div style={{ background: "#12203a", color: "#9fb4d9", display: "grid", placeItems: "center", height: "100%" }}>LESSON PANE</div>}
            study={
              panel ? (
                footerMode === "pane" ? (
                  // The "Always-visible footer dock" home: the dock is the
                  // study pane's LAST CHILD, in flow below the notes panel.
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col">
                      <Profiler id="notes" onRender={() => { window.__notesRenders += 1; }}>
                        <NotesPanel notes={notes} syncState={{ status: "saved", synced: true }} {...handlers} />
                      </Profiler>
                    </div>
                    <div data-course-dock="" className="shrink-0" style={{ height: 64, background: "#101a2e" }} />
                  </div>
                ) : (
                  <Profiler id="notes" onRender={() => { window.__notesRenders += 1; }}>
                    <NotesPanel notes={notes} syncState={{ status: "saved", synced: true }} {...handlers} />
                  </Profiler>
                )
              ) : null
            }
            keyboardExpandEnabled
            solid
          />
        </div>
        {footerMode === "peek" ? <PeekFooter /> : null}
      </div>
    </CourseKeyboardProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<StrictMode><Harness /></StrictMode>);
