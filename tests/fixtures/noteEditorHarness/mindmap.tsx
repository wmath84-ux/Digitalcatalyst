import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import MindMapPanel from "../../../src/course/MindMapPanel";
import { addChildNode, createMindMap } from "../../../utils/mindMapTree.js";

const seed = addChildNode(createMindMap("Saved idea"), "root", "Child idea").mind;
function Harness() {
  const [mind, setMind] = useState(seed);
  const [key, setKey] = useState("saved");
  const [master, setMaster] = useState(false);
  const [error, setError] = useState(false);
  Object.assign(window, { __mind: mind, __master: () => setMaster(true), __syncError: () => setError(true) });
  return <div className="course-player-shell fixed inset-0 flex flex-col" data-course-player>
    <MindMapPanel mind={mind} onMindChange={setMind} status={error ? "error" : "saved"} onRetryMaps={() => setError(false)} open
      maps={[{ mapKey: "saved", title: "Saved map", rootTopic: "Saved idea", nodeCount: 2, createdAt: 1, updatedAt: 1 }]}
      activeMapKey={key} moduleId="m1" courseTitle="Test course"
      onCreateMap={() => { setKey("new"); setMind(createMindMap("New idea")); }}
      onSelectMap={setKey}
      masterMap={master ? { key: "master", title: "Master map", mind: seed } : null}
      onCloseMasterMap={() => setMaster(false)}
    />
  </div>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
