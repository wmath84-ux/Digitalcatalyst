// Test fixture for tests/peekDockRevealBrowser.test.mjs — see harness.html.
//
// Mounts the two peek docks on the layout their real host gives them:
//   · ?mode=desktop — the desktop shell's page column (`[data-desktop-main]`
//     beside a rail) with the REAL DesktopPeekDock;
//   · ?mode=course  — a `.course-player-shell` inside the player's keyboard
//     provider with the REAL CoursePeekDock.
// The window hook below is the only test-only surface.

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass.css";
import DesktopPeekDock from "../../../src/components/glass-dock/DesktopPeekDock";
import CoursePeekDock from "../../../src/course/CoursePeekDock";
import { CourseKeyboardProvider } from "../../../src/course/useCourseKeyboard";
import type { DockTab } from "../../../src/course/CourseOverlay";

declare global {
  interface Window {
    /** Tabs the course peek dock actually selected, in order. */
    __selected: string[];
  }
}
window.__selected = [];

const mode = new URLSearchParams(window.location.search).get("mode") || "desktop";

function CourseHarness() {
  const [tab, setTab] = useState<DockTab>("modules");
  const shellRef = useRef<HTMLDivElement>(null);
  return (
    <CourseKeyboardProvider scopeRef={shellRef}>
      <div ref={shellRef} className="course-player-shell" style={{ minHeight: "100vh", background: "#0a0e1c" }}>
        <p style={{ color: "#fff", padding: 24, margin: 0 }}>Course player body</p>
        <CoursePeekDock
          tab={tab}
          onTabChange={(next) => {
            window.__selected.push(next);
            setTab(next);
          }}
        />
      </div>
    </CourseKeyboardProvider>
  );
}

function DesktopHarness() {
  return (
    <div className="dc-desktop-shell" style={{ minHeight: "100vh", background: "#0b1020" }}>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside data-desktop-rail style={{ width: 260, background: "#101a33", flex: "0 0 auto" }} />
        <div data-desktop-main style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <main style={{ color: "#e5e7eb", padding: 24 }}>
            <h1 data-harness-page style={{ margin: 0 }}>Desktop page</h1>
          </main>
        </div>
      </div>
      <DesktopPeekDock active="home" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  mode === "course" ? <CourseHarness /> : <DesktopHarness />,
);
