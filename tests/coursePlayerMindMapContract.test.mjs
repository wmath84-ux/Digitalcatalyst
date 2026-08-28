// tests/coursePlayerMindMapContract.test.mjs
//
// Contract for the Course Player MIND MAP feature.
//
// The learner taps a "Mind map" tab in the player dock — sitting immediately
// after "Note" — and gets a mind map editor scoped to the module they are
// currently viewing. Tapping `+` on ANY node appends a branch there, at any
// depth; the tree re-lays out automatically, and the map is saved to that
// learner's own Firestore document.
//
// This file asserts the WIRING (dock tab, sheet sizing, module scoping,
// Firestore path + rules). The tree model and layout maths themselves are
// unit tested in tests/mindMapTree.test.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_MIND_MAP_NODES, mindMapDocId } from "../utils/mindMapTree.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const overlay = readSource("src/course/CourseOverlay.tsx");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const panel = readSource("src/course/MindMapPanel.tsx");
const hook = readSource("src/course/useCourseMindMap.ts");
const rules = readSource("firestore.rules");
const styles = readSource("src/index.css");
const deps = JSON.parse(readSource("package.json"));

// ---------------------------------------------------------------------------
// Library choice
// ---------------------------------------------------------------------------

test("the editor is built on React Flow, which is the only candidate with touch support", () => {
  // jsMind's published core has no touch handling at all, which rules it out
  // for a mobile-first PWA. React Flow brings pinch-zoom and drag-pan.
  assert.ok(deps.dependencies["@xyflow/react"], "@xyflow/react must be a real dependency");
  assert.equal(deps.dependencies.jsmind, undefined, "jsMind must not be reintroduced");
  assert.equal(deps.dependencies.cytoscape, undefined, "cytoscape must not be reintroduced");
  assert.match(panel, /from "@xyflow\/react"/);
  assert.match(panel, /import "@xyflow\/react\/dist\/style\.css"/);
});

// ---------------------------------------------------------------------------
// Dock integration — the tab sits next to Note
// ---------------------------------------------------------------------------

test("Mind map is a dock tab declared immediately after Note", () => {
  assert.match(overlay, /export type DockTab = "modules" \| "resources" \| "notes" \| "mindmap" \| "paid";/);
  const order = [...overlay.matchAll(/\{ key: "(modules|resources|notes|mindmap|paid)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["modules", "resources", "notes", "mindmap", "paid"], "Mind map must sit right after Note");
});

test("the dock indicator and grab handle size themselves for five tabs", () => {
  // Both were hardcoded to a quarter when there were four tabs; with five they
  // must be a fifth, or the accent pill lands between two buttons.
  assert.doesNotMatch(overlay, /h-1\/4|w-1\/4/, "a stale four-tab slot size would misalign the pill");
  assert.match(overlay, /h-\[20%\]/);
  assert.match(overlay, /w-\[20%\]/);
  // The drag maths derives its slot from the tab count at runtime.
  assert.match(overlay, /\/ TABS\.length/);
});

test("the overlay renders the mind map panel for its tab and degrades without one", () => {
  assert.match(overlay, /tab === "mindmap"/);
  assert.match(overlay, /props\.mindMapPanel \?\?/, "a missing panel must fall back, not render a blank sheet");
});

// ---------------------------------------------------------------------------
// Sheet sizing — the mind map claims half the screen
// ---------------------------------------------------------------------------

test("in landscape the mind map sheet claims 50% and always splits", () => {
  assert.match(overlay, /const DEFAULT_MINDMAP_SPLIT = 50;/);
  assert.match(overlay, /const mindMapSplit = landscape && mindMapActive;/);
  assert.match(overlay, /mindMapSplit \? mindMapSplitWidth : splitMode \? splitEditorWidth : sheetHeight/);
});

test("in portrait the mind map sheet takes the bottom half", () => {
  assert.match(overlay, /const mindMapHeight = "50dvh"/);
  assert.match(overlay, /const sheetHeight = mindMapActive\s*\?\s*mindMapHeight/);
});

test("the notes split keeps its own 40% so the two sheets never fight", () => {
  // The notes editor and the mind map take DIFFERENT default widths, so the
  // parent has to be told which one is open. Both are now live-resizable.
  assert.match(overlay, /const DEFAULT_NOTES_SPLIT = 40;/);
  assert.match(overlay, /onSplitModeChange\?\.\(splitMode\)/);
  assert.match(overlay, /onMindMapSplitChange\?\.\(mindMapSplit\)/);
});

test("the lesson shrinks to the complement of whichever sheet is open", () => {
  assert.match(coursePlayer, /100 - \(splitPanelPercent \?\? \(mindMapSplitMode \? 50 : 40\)\)/);
  assert.match(overlay, /data-course-split-handle/);
  assert.match(overlay, /onSplitRatioChange/);
  assert.match(coursePlayer, /onSplitRatioChange=\{handleSplitRatioChange\}/);
});

test("each split sheet keeps the dock pinned to the far-right edge", () => {
  assert.match(coursePlayer, /data-course-dock-spacer/, "the notes spacer must remain");
  assert.match(coursePlayer, /data-course-mindmap-dock-spacer/, "the mind map needs its own spacer");
});

// ---------------------------------------------------------------------------
// Per-module scoping
// ---------------------------------------------------------------------------

test("the mind map follows the ACTIVE module, not just the selected file", () => {
  assert.match(coursePlayer, /const collectModuleIdByFileId = \(modules: CourseModule\[\]\): Record<string, string> =>/);
  assert.match(coursePlayer, /const activeMindMapModuleId = selectedFile \? moduleIdByFileId\[String\(selectedFile\.id\)\] : undefined;/);
  assert.match(coursePlayer, /moduleId: activeMindMapModuleId,/);
});

test("leaving the mind map tab flushes the pending save exactly once", () => {
  // Guarded by the previous tab: flushing on mount would write an empty map
  // for every course the learner ever opens.
  assert.match(coursePlayer, /const previousDockTab = useRef<DockTab>\(dockTab\);/);
  assert.match(coursePlayer, /if \(previous === "mindmap" && dockTab !== "mindmap"\) mindMap\.flush\(\);/);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test("maps are stored per learner + course + module under users/{uid}", () => {
  assert.equal(mindMapDocId("u1", "7", "m2"), "u1__7__m2");
  assert.match(hook, /doc\(db, "users", String\(uid\), "mindMaps", docKey\)/);
  assert.match(hook, /doc\(db, "users", signedInUid, "mindMaps", key\)/);
});

test("a refused or failed cloud write never strands the learner's map", () => {
  // localStorage mirrors every save, and a load failure falls back to it.
  assert.match(hook, /writeLocalMindMap\(/);
  assert.match(hook, /readLocalMindMap\(/);
  assert.match(hook, /const local = readLocalMindMap\(/);
  assert.match(hook, /\.catch\(\(\) => \{/);
});

test("saves are debounced so a burst of taps is one write", () => {
  assert.match(hook, /const DEFAULT_DEBOUNCE_MS = 700;/);
  assert.match(hook, /timerRef\.current = setTimeout\(/);
});

test("an in-flight save cannot clobber a newer edit", () => {
  assert.match(hook, /if \(revisionRef\.current !== revision\) return;/);
});

test("the doc id cannot be forged into another learner's namespace", () => {
  // The rules re-derive the composite id from the authenticated uid and the
  // document's own productId/moduleId, so a chosen id cannot point elsewhere.
  assert.match(rules, /match \/mindMaps\/\{mapId\}/);
  assert.match(rules, /mapId == uid \+ '__' \+ request\.resource\.data\.productId \+ '__' \+ request\.resource\.data\.moduleId/);
  assert.match(rules, /request\.resource\.data\.uid == uid/);
});

test("mind map rules are owner-scoped like the rest of the user subcollections", () => {
  const block = rules.slice(rules.indexOf("match /mindMaps/{mapId}"), rules.indexOf("match /webPushSubscriptions/"));
  assert.match(block, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(block, /allow create, update: if isOwner\(uid\)/);
  assert.match(block, /allow delete: if isOwner\(uid\) \|\| isAdmin\(\);/);
});

test("the rules cap the stored node list at the same limit the client enforces", () => {
  const block = rules.slice(rules.indexOf("match /mindMaps/{mapId}"), rules.indexOf("match /webPushSubscriptions/"));
  assert.equal(MAX_MIND_MAP_NODES, 600);
  assert.match(block, /request\.resource\.data\.nodes\.size\(\) <= 600/);
  assert.match(block, /request\.resource\.data\.nodes is list/);
});

test("the rules reject privilege-escalation fields on a mind map doc", () => {
  const block = rules.slice(rules.indexOf("match /mindMaps/{mapId}"), rules.indexOf("match /webPushSubscriptions/"));
  assert.match(block, /hasAny\(\['role', 'status', 'purchasedProductIds'/);
});

// ---------------------------------------------------------------------------
// Editor interaction contract
// ---------------------------------------------------------------------------

test("every node exposes a + button, and the per-node delete button is gone", () => {
  assert.match(panel, /data-mind-node-add=\{id\}/);
  // Delete moved OUT of the node into the toolbar: the old in-node trash sat
  // millimetres from the rename input and a mis-tap cost a whole branch.
  assert.doesNotMatch(panel, /data-mind-node-delete=/, "the trash must not render inside a node");
  assert.doesNotMatch(panel, /\{!isRoot \? \(/, "no in-node root guard remains");
});

test("the toolbar carries the delete: trash acts on the selected branch, never the root", () => {
  assert.match(panel, /data-course-mindmap-delete/);
  assert.match(panel, /const canDeleteSelected = selectedId != null && selectedId !== rootId\(\);/);
  assert.match(panel, /disabled=\{!canDeleteSelected\}/);
  // The model still refuses to delete the centre of the map.
  const tree = readSource("utils/mindMapTree.js");
  assert.match(tree, /if \(String\(id\) === ROOT_ID\) return mind;/);
});

test("double-tap delete is an explicit, toggleable mode (off by default)", () => {
  // The toggle lives in the toolbar, exposes its armed state, and persists.
  assert.match(panel, /data-course-mindmap-dbl-delete/);
  assert.match(panel, /aria-pressed=\{doubleTapDelete\}/);
  assert.match(panel, /const dblTapDeleteStorageKey = "dc.mindMapDblTapDelete";/);
  // The armed mode is opt-in: a learner who never touched the toggle can
  // never lose a branch to a stray second tap.
  assert.match(panel, /localStorage.getItem\(dblTapDeleteStorageKey\) === "on"/);
  // Double-tap detection runs on pointer events (d3-drag preventDefaults
  // touchstart, which swallows synthetic click/dblclick on many phones) and
  // the root is exempt.
  assert.match(panel, /const DOUBLE_TAP_MS = 350;/);
  assert.match(panel, /if \(deleteOnDoubleTap && !isRoot\) \{/);
});

test("tapping + puts the new node straight into rename mode", () => {
  assert.match(panel, /setEditingId\(createdId\)/);
  assert.match(panel, /const result = addChildNode\(current, parentId, "New idea"\)/);
});

test("the rename editor wraps long text instead of overflowing sideways", () => {
  // The editor must be a soft-wrapping textarea, not a single-line input:
  // the old input scrolled its text horizontally inside the fixed node box.
  assert.match(panel, /<textarea[\s\S]*?ref=\{inputRef\}/);
  assert.doesNotMatch(panel, /<input\s+ref=\{inputRef\}/, "the single-line rename input must be gone");
  assert.match(panel, /rows=\{1\}/);
  assert.match(panel, /wrap="soft"/);
  assert.match(panel, /resize-none/);
  assert.match(panel, /whitespace-pre-wrap break-words/, "long words must fold, not spill out of the box");
  // The editor grows with the wrapped draft (capped, then it scrolls), and
  // the node's box is allowed to grow with it while editing — a fixed box
  // would clip the extra lines behind overflow-hidden.
  assert.match(panel, /el\.style\.height = "auto"/);
  assert.match(panel, /const height = Math\.max\(EDITOR_MIN_HEIGHT_PX, Math\.min\(el\.scrollHeight, EDITOR_MAX_HEIGHT_PX\)\);/);
  assert.match(panel, /minHeight: placed\.height, height: "auto"/);
});

test("wires between nodes are n8n-style cubic-bezier ropes, not rigid smoothstep", () => {
  // smoothstep draws right-angle corridors; the learner asked for cables that
  // leave each handle along its facing and sag like a rope (n8n / Figma).
  assert.match(panel, /type: "rope"/);
  assert.match(panel, /const EDGE_TYPES = \{ rope: RopeEdge \}/);
  assert.match(panel, /export const buildRopePath/);
  assert.match(panel, /C \$\{c1\.x\},\$\{c1\.y\} \$\{c2\.x\},\$\{c2\.y\}/);
  assert.doesNotMatch(panel, /type: "smoothstep"/);
  assert.match(panel, /edgeTypes=\{EDGE_TYPES\}/);
  assert.match(panel, /defaultEdgeOptions=\{\{ type: "rope" \}\}/);
});

test("nodes are hand-positionable — drag and drop anywhere, persisted per node", () => {
  // The learner can drag any node (root included) and the drop is committed
  // as that node's manual position; the tidy tree still owns every node that
  // was never dragged.
  assert.match(panel, /nodesDraggable\b/);
  assert.doesNotMatch(panel, /nodesDraggable=\{false\}/);
  assert.match(panel, /draggable: true/);
  assert.match(panel, /nodesConnectable=\{false\}/);
  assert.match(panel, /const layout = useMemo\(\(\) => layoutMindMap\(mind\), \[mind\]\)/);
  assert.match(panel, /onNodeDragStop=/);
  assert.match(panel, /onNodesChange=\{onNodesChange\}/);
  assert.match(panel, /applyNodeChanges\(changes, current\)/);
  assert.match(panel, /onNodeDragStart=/);
  assert.match(panel, /collectSubtreeIds\(mind, node\.id\)/);
  assert.match(panel, /position: \{ x: node\.position\.x, y: node\.position\.y \}/);
  assert.match(panel, /setNodePosition\(current, node\.id, node\.position\.x, node\.position\.y\)/);
  // Buttons inside a node must never start a drag.
  assert.match(panel, /nodrag absolute top-1\/2/);
  assert.doesNotMatch(panel, /data-mind-node-collapse=/);
});

test("the dragged node tracks the pointer LIVE — the primary node included", () => {
  // Regression contract for the learner-reported bug: dragging the PRIMARY
  // (root) node updated its location only on drop, while every other node
  // was seen moving live. The drag loop must therefore write the dragged
  // node's OWN live position on EVERY frame — never rely on React Flow's
  // onNodesChange alone for the box under the finger (a parent drag's
  // setNodes can win a stale frame and leave the centre behind).
  // 1. The live-drag handler exists and runs against the drag session.
  assert.match(panel, /onNodeDrag=\{\(_event, node\) => \{/);
  assert.match(panel, /const session = dragSessionRef\.current;/);
  // 2. The dragged node itself is written from `node.position` (live), not
  //    left on its last committed layout spot until pointer-up.
  assert.match(
    panel,
    /if \(item\.id === node\.id\) \{\s*return \{ \.\.\.item, position: \{ x: node\.position\.x, y: node\.position\.y \} \};\s*\}/,
  );
  // 3. Its branch rides along at the same rigid offset every frame.
  assert.match(
    panel,
    /const start = session\.starts\.get\(item\.id\);\s*if \(!start\) return item;\s*return \{ \.\.\.item, position: \{ x: start\.x \+ dx, y: start\.y \+ dy \} \};/,
  );
  // 4. Mid-drag, a layout pass must not snap nodes back to the tidy tree:
  //    live positions win while `draggingRef` is armed, and the flag is
  //    armed from drag START (before the first move can land).
  assert.match(panel, /onNodeDragStart=\{\(_event, node\) => \{\s*draggingRef\.current = true;/);
  assert.match(panel, /if \(!draggingRef\.current\) return layoutNodes;/);
  assert.match(panel, /const live = new Map\(prev\.map\(\(node\) => \[node\.id, node\.position\]\)\);/);
  // 5. The root's drop is committed through the map-level rootX/rootY pin
  //    (utils/mindMapTree.js), so the live position survives save + reload.
  assert.match(panel, /setNodePosition\(current, node\.id, node\.position\.x, node\.position\.y\)/);
});

test("zoom is available on touch as well as by button", () => {
  assert.match(panel, /zoomOnPinch/);
  assert.match(panel, /data-course-mindmap-zoom-in/);
  assert.match(panel, /data-course-mindmap-zoom-out/);
  assert.match(panel, /data-course-mindmap-fit/);
  // Without this the browser claims the pinch for page zoom and React Flow
  // never receives it.
  assert.match(panel, /touchAction: "none"/);
});

test("the newly created node is scrolled into view", () => {
  assert.match(panel, /void setCenter\(placed\.x \+ placed\.width \/ 2/);
});

test("the panel flushes its pending write when it unmounts", () => {
  assert.match(panel, /useEffect\(\(\) => \(\) => \{ onFlush\?\.\(\); \}, \[onFlush\]\)/);
});

test("every node opens the inline editor on a single tap (no separate pencil)", () => {
  // The redesign collapsed "tap to rename" and "tap to select" into one
  // interaction: the only rename trigger is a single tap on the node body,
  // and the input is in the same DOM tree as the rendered text so the soft
  // keyboard lands in the right place. Taps are measured with pointerup +
  // a small slop because React Flow's d3-drag preventDefaults touchstart,
  // which suppresses the synthetic click on many phones once nodes are
  // draggable.
  assert.match(panel, /onNodeClick=\{[\s\S]*setSelectedId\(node\.id\)[\s\S]*setEditingId\(node\.id\)/);
  assert.match(panel, /const TAP_SLOP_PX = 4;/);
  assert.match(panel, /onPointerUp=\{handlePointerUp\}/);
  assert.match(panel, /onOpenEditor\(id\);/);
  // The click that trails a real drag must not pop the editor open.
  assert.match(panel, /if \(dragMovedRef\.current\) return;/);
});

test("the mind map follows the Course Player theme and can be flipped for the map window alone", () => {
  // White mode: the panel ships a dark AND a light palette; it starts in
  // whatever theme the player is in and the shell exposes the active one.
  assert.match(panel, /playerTheme = "dark"/);
  assert.match(panel, /const mindTheme: MindMapTheme = themeOverride \?\? \(playerTheme === "light" \? "light" : "dark"\);/);
  assert.match(panel, /data-mindmap-theme=\{mindTheme\}/);
  assert.match(panel, /course-mindmap-shell/);
  // The toolbar button next to Fit flips ONLY this window and remembers the
  // choice per device; the player keeps its own theme.
  assert.match(panel, /data-course-mindmap-theme/);
  assert.match(panel, /setThemeOverride\(mindTheme === "dark" \? "light" : "dark"\)/);
  assert.match(panel, /const mindMapThemeStorageKey = "dc.mindMapThemeOverride";/);
  // The parent hands the player's live theme down.
  assert.match(coursePlayer, /playerTheme=\{theme\}/);
  // The palette itself lives in the stylesheet as scoped variables.
  assert.match(styles, /\.course-mindmap-shell\[data-mindmap-theme="light"\]/);
});

test("the mind map toolbar has a close button that shuts the sheet", () => {
  assert.match(panel, /data-course-mindmap-close/);
  assert.match(panel, /onClose\(\);/);
  assert.match(coursePlayer, /onClose=\{\(\) => \{/);
  assert.match(coursePlayer, /mindMap\.flush\(\);/);
  assert.match(coursePlayer, /setDockOpen\(false\);/);
});

test("the toolbar slot is replaced by a slim status strip in both orientations", () => {
  // The old landscape-only "hide the toolbar" rule is gone — the
  // branch / stats / zoom controls are now a single status strip that is
  // always mounted, and the diagram fills the rest of the sheet.
  assert.match(panel, /data-course-mindmap-status/);
  assert.match(panel, /data-course-mindmap-zoom-in/);
  assert.match(panel, /data-course-mindmap-zoom-out/);
  assert.match(panel, /data-course-mindmap-fit/);
  // The parent still hands the same landscape flag it uses for the
  // overlay rails, so the status strip / canvas can adapt later if
  // needed.
  assert.match(coursePlayer, /landscape=\{useLandscapeRails\}/);
});


// ---------------------------------------------------------------------------
// Facing — the dot, the `+` and the rope all follow the REAL geometry
//
// Reported by the learner: a branch created on the LEFT of the centre faces
// its parent on its right edge (dot right, `+` left). Drag that same node to
// the RIGHT of the centre and the anchors stayed put, so every wire looked
// like it had been tied to the wrong face and the whole map read as one knot.
// The editor must therefore key the anchors off the resolved `facing`, never
// off the wing the branch was created on.
// ---------------------------------------------------------------------------

test("the node box derives its anchors from `facing`, not from the stored wing", () => {
  assert.match(panel, /facing: "left" \| "right" \| null;/, "the node data carries a facing");
  assert.match(panel, /const facesLeft = facing === "left";/);
  assert.doesNotMatch(panel, /const facesLeft = side === "left";/, "the structural wing must not drive the anchors");
  // Both faces are exposed for debugging / test hooks.
  assert.match(panel, /data-mind-node-side=\{side \?\? "center"\}/);
  assert.match(panel, /data-mind-node-facing=\{facing \?\? "center"\}/);
});

test("the anchor dot sits on the face that points at the parent, opposite the `+`", () => {
  assert.match(panel, /data-mind-node-anchor=\{id\}/);
  // The dot is on the parent-facing edge…
  assert.match(panel, /data-anchor-side=\{facesLeft \? "right" : "left"\}/);
  assert.match(panel, /facesLeft \? "-right-\[3\.5px\]" : "-left-\[3\.5px\]"/);
  // …and the `+` on the opposite (child-growing) edge.
  assert.match(panel, /facesLeft \? "-left-3\.5" : "-right-3\.5"/);
  // The centre has no parent to face, so it renders no dot.
  assert.match(panel, /\{isRoot \? null : \(/);
  // It must never eat a tap meant for the node, nor start a drag.
  const dot = panel.slice(panel.indexOf("data-mind-node-anchor"), panel.indexOf("data-mind-node-add"));
  assert.match(dot, /pointer-events-none/);
  // Its paint is themed in the stylesheet (the bead straddles the box border,
  // so it carries a halo in the canvas colour) — never an inline one-off.
  assert.match(styles, /\[data-course-mindmap\] \[data-mind-node-anchor\]\s*\{[^}]*background: #8b5cf6/);
  // The light-theme override has to hang off the SHELL (the themed element is
  // the same node that carries `data-course-mindmap`, not an ancestor).
  assert.match(styles, /\.course-mindmap-shell\[data-mindmap-theme="light"\] \[data-mind-node-anchor\]/);
  assert.doesNotMatch(dot, /style=\{\{/, "the bead is themed by CSS, not inline");
});

test("ropes attach to the facing handles, and the tint follows them", () => {
  const edgeBlock = panel.slice(panel.indexOf("const edges: Edge[] = useMemo"), panel.indexOf("const save = SAVE_COPY"));
  assert.match(edgeBlock, /const goesLeft = \(facingOverride\[edge\.target\] \?\? edge\.facing \?\? "right"\) === "left";/);
  assert.match(edgeBlock, /sourceHandle: goesLeft \? "src-left" : "src-right"/);
  assert.match(edgeBlock, /targetHandle: goesLeft \? "right" : "left"/);
  assert.doesNotMatch(edgeBlock, /edge\.side === "left"/, "the wing must not pick the handles any more");
});

test("a dragged node re-faces itself LIVE, and hands back on drop", () => {
  // The layout is frozen mid-drag (React Flow owns the positions), so the
  // facing of the box under the finger is recomputed from the pointer spot.
  assert.match(panel, /const syncDragFacing = useCallback/);
  assert.match(panel, /facingBetweenBoxes\(/);
  const drag = panel.slice(panel.indexOf("onNodeDrag={(_event, node)"), panel.indexOf("onNodeDragStop="));
  assert.match(drag, /dragMovedRef\.current = true;/);
  assert.match(drag, /syncDragFacing\(node\.id, node\.position\.x\);/, "re-derived on every pointer move");
  // Only the picked box can change facing mid-drag: the branch below it
  // travels as one rigid group, so nothing inside it moves relative to
  // anything else.
  assert.match(panel, /const clearDragFacing = useCallback/);
  const stop = panel.slice(panel.indexOf("onNodeDragStop="), panel.indexOf("<Background"));
  assert.match(stop, /clearDragFacing\(\);/, "the committed layout takes over the moment the finger lifts");
  // The override is fed into both the nodes and the edges.
  assert.match(panel, /facing: placed\.isRoot \? null : \(facingOverride\[placed\.id\] \?\? placed\.facing\)/);
  assert.match(panel, /const next = \{ \.\.\.current, \[nodeId\]: facing \};/);
});
