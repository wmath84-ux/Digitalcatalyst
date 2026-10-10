// Master mind maps (admin `mind_map` resources) in the Course Player:
// they render in the LOWER study pane (Mind Map tab), read-only, and never
// move the upper lesson pane's content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMasterMindMapFile, masterMindMapView } from "../utils/courseMindMaps.js";
import { addChildNode, createMindMap } from "../utils/mindMapTree.js";

const cpa = readFileSync("src/CoursePlayerApp.tsx", "utf8");
const panel = readFileSync("src/course/MindMapPanel.tsx", "utf8");

const sampleMap = addChildNode(createMindMap("Physics", "Physics"), "root", "Force").mind;

test("only admin mind_map resources are master mind maps", () => {
  assert.equal(isMasterMindMapFile({ type: "mind_map" }), true);
  assert.equal(isMasterMindMapFile({ type: "mindmap" }), false, "legacy whimsical embed keeps the viewer path");
  assert.equal(isMasterMindMapFile({ type: "video_url" }), false);
  assert.equal(isMasterMindMapFile(null), false);
});

test("a valid stored map becomes a read-only view with its node count", () => {
  const view = masterMindMapView({ type: "mind_map", mindMapData: sampleMap });
  assert.equal(view.error, null);
  assert.equal(view.mind.rootTopic, "Physics");
  assert.equal(view.nodeCount, 2);
});

test("an invalid stored map names the field path instead of drawing blank", () => {
  const view = masterMindMapView({ type: "mind_map", mindMapData: { rootTopic: "", nodes: [] } });
  assert.equal(view.mind, null);
  assert.match(view.error, /rootTopic: Must not be empty/);
});

test("a master map with no data yet says so", () => {
  const view = masterMindMapView({ type: "mind_map" });
  assert.equal(view.mind, null);
  assert.match(view.error, /no stored data yet/);
});

test("opening an admin mind map routes to the Mind Map tab, not the lesson pane", () => {
  const start = cpa.indexOf("const handleOpenMasterMap = useCallback(");
  const end = cpa.indexOf("const masterMapView = useMemo(", start);
  assert.ok(start > 0 && end > start, "handleOpenMasterMap is present");
  const body = cpa.slice(start, end);
  const mindBranch = body.slice(body.indexOf("isMasterMindMapFile(entry.file)"), body.indexOf("} else if (entry.file)"));
  assert.match(mindBranch, /setMasterMapKey\(entry\.mapKey\)/);
  assert.doesNotMatch(mindBranch, /selectFile\(|setSelectedFile\(/, "the upper lesson pane must not change");
  assert.match(body, /setDockTab\("mindmap"\)/);
});

test("the course library's mind map row opens the same read-only view", () => {
  assert.match(cpa, /setMasterMapKey\(isMasterMindMapFile\(file\) \? `master-\$\{file\.id\}` : null\)/);
});

test("a lesson selection clears any open master map", () => {
  const start = cpa.indexOf("const selectFile = (file: CourseFile) => {");
  assert.ok(start > 0);
  assert.match(cpa.slice(start, start + 200), /setMasterMapKey\(null\)/);
});

test("the Mind Map panel renders a master map read-only with a way back", () => {
  assert.match(panel, /MindReadOnlyContext\.Provider value=\{readOnlyMaster\}/);
  assert.match(panel, /nodesDraggable=\{!readOnlyMaster\}/);
  assert.match(panel, /const showPlus = \(selected \|\| editing\) && !dragging && !readOnly;/);
  assert.match(panel, /data-course-mindmap-master-banner/);
  assert.match(panel, /data-course-mindmap-master-close/);
  assert.match(panel, /const onMindChange = readOnlyMaster \? NOOP_MIND_CHANGE : onSelfMindChange;/);
});

test("a self map or a new map leaves the master view", () => {
  assert.match(panel, /const openMap = useCallback\([\s\S]*?onCloseMasterMap\?\.\(\);/);
  assert.match(panel, /onCloseMasterMap\?\.\(\);\s*onCreateMap\?\.\(\);/);
});
