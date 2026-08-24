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

test("every node exposes a + button, and the root cannot be deleted", () => {
  assert.match(panel, /data-mind-node-add=\{id\}/);
  assert.match(panel, /\{!isRoot \? \(/);
  assert.match(panel, /data-mind-node-delete=\{id\}/);
});

test("tapping + puts the new node straight into rename mode", () => {
  assert.match(panel, /setEditingId\(createdId\)/);
  assert.match(panel, /const result = addChildNode\(current, parentId, "New idea"\)/);
});

test("nodes are not hand-positioned — the layout owns placement", () => {
  assert.match(panel, /nodesDraggable=\{false\}/);
  assert.match(panel, /nodesConnectable=\{false\}/);
  assert.match(panel, /const layout = useMemo\(\(\) => layoutMindMap\(mind\), \[mind\]\)/);
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

test("every node exposes an explicit pencil edit button", () => {
  // A phone double-tap is unreliable, so each node carries a pencil that opens
  // the same inline editor — existing boxes' text stays editable.
  assert.match(panel, /data-mind-node-edit=\{id\}/);
  assert.match(panel, /onOpenEditor\(id\)/);
  assert.match(panel, /Pencil size=\{10\}/);
  // The edit button is always reachable on touch, not hidden until hover.
  assert.match(panel, /max-md:opacity-100/);
});

test("the toolbar is hidden in landscape so the diagram fills the sheet", () => {
  // The Branch / stats / zoom toolbar disappears in landscape, giving the map
  // the whole sheet; the + buttons and pinch-zoom keep editing possible.
  assert.match(panel, /landscape \? null : \(/);
  assert.match(panel, /data-course-mindmap-toolbar/);
  // The parent passes the same landscape flag it uses for the overlay rails.
  assert.match(coursePlayer, /landscape=\{useLandscapeRails\}/);
});

