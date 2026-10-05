// Test fixture for tests/coursePanelsBrowser.test.mjs — the REAL Course Player
// Sketch panel (SketchPanel + useCourseSketch + Excalidraw) and the REAL Read
// library (ReadLibraryPanel + useReadUploads). Only Firebase is stubbed
// (./stubs, wired by Vite aliases in the test).
//
//   ?panel=sketch — the Sketch tab, wired exactly like CoursePlayerApp, with
//                   module buttons (navigate away/back) and a hide toggle
//                   (unmount = leaving the tab);
//   ?panel=read   — the Read library.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass.css";
import SketchPanel from "../../../src/course/SketchPanel";
import useCourseSketch from "../../../src/course/useCourseSketch";
import ReadLibraryPanel from "../../../src/course/ReadLibraryPanel";
// The hook lazy-loads the Storage SDK; load the stub up front so the test can
// configure `window.__storage` before the first upload.
import "firebase/storage";

const params = new URLSearchParams(window.location.search);
const panel = params.get("panel") || "sketch";

function SketchTab({ moduleId }: { moduleId: string }) {
  const sketch = useCourseSketch({ uid: "u1", productId: "p1", moduleId, debounceMs: 300 });
  (window as unknown as { __sketch: unknown }).__sketch = sketch;
  return (
    <SketchPanel
      getScene={sketch.getScene}
      sceneKey={sketch.sceneKey}
      loading={sketch.loading}
      status={sketch.status}
      errorMessage={sketch.errorMessage}
      pendingSync={sketch.pendingSync}
      scoped={sketch.scoped}
      onChange={sketch.updateScene}
      canvasColor={sketch.canvasColor}
      onCanvasColorChange={sketch.setCanvasColor}
      boardName={`Module ${moduleId}`}
      uid="u1"
      deviceSaved={sketch.deviceSaved}
      onRetry={sketch.retry}
      boards={sketch.boards}
      activeBoardKey={sketch.activeBoardKey}
      activeBoardTitle={sketch.activeBoardTitle}
      onSelectBoard={sketch.selectBoard}
      onCreateBoard={sketch.createBoard}
      canCreateBoard={sketch.canCreateBoard}
    />
  );
}

function SketchHarness() {
  const [moduleId, setModuleId] = useState(params.get("module") || "m1");
  const [shown, setShown] = useState(true);
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, padding: 4, background: "#111827" }}>
        {["m1", "m2"].map((id) => (
          <button key={id} type="button" data-harness-module={id} onClick={() => setModuleId(id)} style={{ color: "#fff" }}>
            {id}
          </button>
        ))}
        <button type="button" data-harness-toggle onClick={() => setShown((value) => !value)} style={{ color: "#fff" }}>
          toggle
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }} data-harness-stage>
        {shown ? <SketchTab moduleId={moduleId} /> : <p style={{ color: "#fff" }}>Another tab</p>}
      </div>
    </div>
  );
}

function ReadHarness() {
  return (
    <div style={{ height: "100vh" }}>
      <ReadLibraryPanel entries={[]} productId="p1" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(panel === "read" ? <ReadHarness /> : <SketchHarness />);
