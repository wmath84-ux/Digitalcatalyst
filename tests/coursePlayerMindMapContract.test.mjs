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
  assert.match(overlay, /const mindMapSplitWidth = "min\(50%, 760px\)"/);
  assert.match(overlay, /const mindMapSplit = landscape && mindMapActive;/);
  assert.match(overlay, /mindMapSplit \? mindMapSplitWidth : splitMode \? splitEditorWidth : sheetHeight/);
});

test("in portrait the mind map sheet takes the bottom half", () => {
  assert.match(overlay, /const mindMapHeight = "50dvh"/);
  assert.match(overlay, /const sheetHeight = mindMapActive\s*\?\s*mindMapHeight/);
});

test("the notes split keeps its own 40% so the two sheets never fight", () => {
  // The notes editor and the mind map take DIFFERENT widths, so the parent has
  // to be told which one is open.
  assert.match(overlay, /const splitEditorWidth = "min\(40%, 520px\)"/);
  assert.match(overlay, /onSplitModeChange\?\.\(splitMode\)/);
  assert.match(overlay, /onMindMapSplitChange\?\.\(mindMapSplit\)/);
});

test("the lesson shrinks to the complement of whichever sheet is open", () => {
  assert.match(coursePlayer, /basis-\[calc\(60%-4rem\)\]/, "notes split: lesson keeps 60%");
  assert.match(coursePlayer, /basis-\[calc\(50%-4rem\)\]/, "mind map split: lesson keeps 50%");
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
  assert.match(hook, /doc\(db, "users", String\(currentUid\), "mindMaps", key\)/);
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
  assert.match(panel, /setNodePosition\(current, node\.id, node\.position\.x, node\.position\.y\)/);
  // Buttons inside a node must never start a drag.
  assert.match(panel, /nodrag absolute top-1\/2/);
  assert.match(panel, /nodrag grid h-5 w-5/);
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

