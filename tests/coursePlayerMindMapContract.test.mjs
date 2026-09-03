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
const studyPanels = readSource("src/course/studyPanels.tsx");
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

test("Mind map is a dock tab declared immediately after Note (Player closes the list)", () => {
  assert.match(overlay, /export type DockTab = "modules" \| "resources" \| "notes" \| "mindmap" \| "paid" \| "player";/);
  const order = [...overlay.matchAll(/\{ key: "(modules|resources|notes|mindmap|paid|player)"/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 5), ["modules", "resources", "notes", "mindmap", "paid"], "Mind map must sit right after Note");
  assert.equal(order[5], "player", "the Player settings tab closes the dock");
});

test("the overlay renders the mind map panel for its tab and degrades without one", () => {
  assert.match(overlay, /tab === "mindmap"/);
  assert.match(overlay, /props\.mindMapPanel \?\?/, "a missing panel must fall back, not render a blank sheet");
});

// ---------------------------------------------------------------------------
// Study pane — the footprint every tab (mind map included) renders inside
// ---------------------------------------------------------------------------

test("every tab (mind map included) renders in the Split Deck's study pane", () => {
  // The owner's direction changed: there is no sheet variant at all — the
  // same study pane (permanent, beside the lesson) hosts ALL tabs.
  assert.match(coursePlayer, /study=\{studyOverlay\}/);
  assert.match(overlay, /data-course-study-chrome="pane"/);
  assert.match(overlay, /data-course-overlay-tab=\{tab\}/);
  assert.doesNotMatch(overlay, /DEFAULT_MINDMAP_SPLIT|DEFAULT_NOTES_SPLIT/, "per-tab split widths are gone");
  assert.doesNotMatch(overlay, /data-course-split-handle/, "the split drag handle is gone");
  assert.doesNotMatch(overlay, /glass-sheet/, "no right-side sheet variant");
});

test("the pane's chrome row (title + notes +) also serves the mind map tab", () => {
  // One chrome row for every tab; it is hidden ONLY while the notes writing
  // box is open (the editor needs every pixel of the pane).
  assert.match(overlay, /\{notesWriting \? null : chromeRow\}/);
  assert.match(overlay, /data-course-overlay-title/);
  assert.doesNotMatch(overlay, /data-course-overlay-close/);
});

test("the study pane is bounded by the divider, not by header/dock strips", () => {
  // The old sheet measured itself against header + dock pixels. The pane is
  // simply the Split Deck's second pane — the divider is the boundary.
  assert.doesNotMatch(overlay, /SheetBounds/);
  assert.doesNotMatch(overlay, /sheetBounds/);
  assert.match(studyPanels, /data-course-study-pane=""/);
});

test("leaving the mind map tab flushes its pending save", () => {
  // There is no sheet to close — the flush hooks are: switching away to any
  // other dock tab, the map panel's own close (peek-collapse), and leaving
  // the player. A 700ms-debounced write must never be lost on any of them.
  assert.match(coursePlayer, /if \(dockTab === "mindmap"\) mindMap\.flush\(\);/);
  assert.match(coursePlayer, /const previousDockTab = useRef<DockTab>\(dockTab\);/);
  assert.match(coursePlayer, /const previous = previousDockTab\.current;/);
});

test("the old landscape split machinery is gone — the lesson keeps full width", () => {
  // Owner's direction: no 60/40 lesson+panel split, no live-resizable edge
  // handle, no dock-pinning spacers. The sheet overlays the content between
  // the header and the footer dock in BOTH orientations.
  assert.doesNotMatch(overlay, /onSplitModeChange/);
  assert.doesNotMatch(overlay, /onMindMapSplitChange/);
  assert.doesNotMatch(overlay, /onSplitRatioChange/);
  assert.doesNotMatch(coursePlayer, /notesSplitMode/);
  assert.doesNotMatch(coursePlayer, /mindMapSplitMode/);
  assert.doesNotMatch(coursePlayer, /splitPanelPercent/);
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

test("ropes are drawn from node boxes so they load even when handle bounds are 0", () => {
  // Reported: the violet ANCHOR DOTS on nodes always painted, but the WIRES
  // between them sometimes did not — especially on a slow radio. Cause:
  // React Flow routes edges from handle DOM bounds, which are 0×0 while the
  // overlay is still animating / the map is still arriving. Wires must
  // therefore be drawn from the node's own width/height (already known)
  // instead of those handle bounds. The visible 7px anchor dots stay as they
  // were; the invisible 1px connection handles stay 1px.
  assert.match(panel, /export const boxFaceAnchor/);
  assert.match(panel, /useStore\(\(state\) => state\.nodeLookup\?\.get\(source\)\)/);
  assert.match(panel, /useStore\(\(state\) => state\.nodeLookup\?\.get\(target\)\)/);
  assert.match(panel, /const fromBox = boxFaceAnchor\(sourceNode, sourcePosition\)/);
  assert.match(panel, /width: placed\.width/);
  assert.match(panel, /height: placed\.height/);
  assert.match(panel, /width: 1,/);
  assert.match(styles, /width: 1px !important/);
  assert.match(styles, /fill: none !important/);
  assert.match(styles, /\[data-course-mindmap\] svg/);
  assert.match(styles, /max-width: none !important/);
  const main = readSource("src/main.tsx");
  assert.match(main, /import "@xyflow\/react\/dist\/style\.css"/);
});

test("nodes are hand-positionable — drag and drop anywhere, persisted per node", () => {
  // The learner can drag any node (root included) and the drop is committed
  // as that node's manual position; the tidy tree still owns every node that
  // was never dragged.
  assert.match(panel, /nodesDraggable\b/);
  assert.doesNotMatch(panel, /nodesDraggable=\{false\}/);
  assert.match(panel, /draggable: true/);
  assert.match(panel, /nodesConnectable=\{false\}/);
  // The layout runs in the arrangement + text rule the toolbar picked.
  assert.match(
    panel,
    /const layout = useMemo\(\s*\(\) => layoutMindMap\(mind, \{ arrange: arrangement, measure: \{ maxLines: textFit === "clip" \? 1 : 0 \} \}\),/,
  );
  assert.match(panel, /\[mind, arrangement, textFit\],/);
  assert.match(panel, /onNodeDragStop=/);
  assert.match(panel, /onNodesChange=\{onNodesChange\}/);
  assert.match(panel, /applyNodeChanges\(changes, current\)/);
  assert.match(panel, /onNodeDragStart=/);
  assert.match(panel, /collectSubtreeIds\(mind, node\.id\)/);
  // The drop is committed as ONE RIGID GROUP through the model: the picked
  // node is pinned at the drop point AND every already-pinned descendant of it
  // travels by the same delta, so re-placing a branch head can never tear the
  // hand-arranged shape beneath it apart.
  assert.match(
    panel,
    /moveNodeSubtree\(current, node\.id, node\.position\.x, node\.position\.y, session\.origin\.x, session\.origin\.y\)/,
  );
  // Buttons inside a node must never start a drag.
  assert.match(panel, /nodrag absolute top-1\/2/);
  assert.doesNotMatch(panel, /data-mind-node-collapse=/);
});

test("the dragged node tracks the pointer LIVE — the primary node included", () => {
  // Regression contract for the learner-reported bug: dragging the PRIMARY
  // (root) node updated its location only on drop, while every other node was
  // seen moving live. The drag loop therefore writes ONE state update per
  // frame — the picked node's live position plus its whole branch at the same
  // offset — because two competing setNodes calls can win a stale frame and
  // leave the centre behind.
  // 1. The session is read on every change, and React Flow's own position
  //    change for the picked node is the source of truth for that frame.
  assert.match(panel, /onNodeDrag=\{\(_event, node\) => \{/);
  assert.match(panel, /const session = dragSessionRef\.current;/);
  assert.match(panel, /changes\.find\(\(change\) => change\.type === "position" && change\.id === session\.id\)/);
  assert.match(panel, /const next = applyNodeChanges\(changes, current\);/);
  // 2. The frame's delta is measured against where the box stood at
  //    pointer-down — not against its last committed layout spot.
  assert.match(panel, /const dx = moved\.position\.x - session\.origin\.x;/);
  assert.match(panel, /const dy = moved\.position\.y - session\.origin\.y;/);
  // 3. Its branch rides along at the same rigid offset every frame, in the SAME
  //    update, so head and descendants can never fall out of lock-step.
  assert.match(panel, /if \(item\.id === session\.id \|\| !session\.moving\.has\(item\.id\)\) return item;/);
  assert.match(panel, /return start \? \{ \.\.\.item, position: \{ x: start\.x \+ dx, y: start\.y \+ dy \} \} : item;/);
  // 4. Mid-drag, a layout pass must not snap nodes back to the tidy tree:
  //    live positions win while `draggingRef` is armed, and the flag is
  //    armed from drag START (before the first move can land).
  assert.match(panel, /onNodeDragStart=\{\(_event, node\) => \{\s*draggingRef\.current = true;/);
  assert.match(panel, /if \(!draggingRef\.current\) return layoutNodes;/);
  assert.match(panel, /const live = new Map\(prev\.map\(\(node\) => \[node\.id, node\.position\]\)\);/);
  // 5. The drop (the centre's map-level rootX/rootY pin included) is committed
  //    through the model, so the live position survives save + reload.
  assert.match(
    panel,
    /moveNodeSubtree\(current, node\.id, node\.position\.x, node\.position\.y, session\.origin\.x, session\.origin\.y\)/,
  );
});

test("zoom is done with the fingers — the toolbar no longer carries +/− buttons", () => {
  // The +/− pair was the widest thing on the bar and the learner always had
  // pinch-zoom under their fingers anyway, so it is gone: pinch to zoom,
  // drag to pan, and one Fit tap to re-frame the whole map.
  assert.match(panel, /zoomOnPinch/);
  assert.match(panel, /panOnDrag/);
  assert.match(panel, /data-course-mindmap-fit/);
  assert.doesNotMatch(panel, /data-course-mindmap-zoom-in/, "the zoom-in button must be gone");
  assert.doesNotMatch(panel, /data-course-mindmap-zoom-out/, "the zoom-out button must be gone");
  assert.doesNotMatch(panel, /\bzoomIn\b/, "the bar must not even hold a zoomIn handle");
  assert.doesNotMatch(panel, /\bzoomOut\b/, "the bar must not even hold a zoomOut handle");
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
  // The toolbar button next to Fit flips ONLY this window; the pick is kept
  // in the player's PANEL SESSION, so it survives tab switches but resets
  // when the player is left — the next entry follows the player's theme
  // again instead of resurrecting an old per-device override.
  assert.match(panel, /data-course-mindmap-theme/);
  assert.match(panel, /setThemeOverride\(mindTheme === "dark" \? "light" : "dark"\)/);
  assert.match(panel, /getCoursePanelSession\(\)\.mindMapThemeOverride/);
  assert.match(panel, /setMindMapSessionTheme\(themeOverride\)/);
  // The parent hands the player's live theme down.
  assert.match(coursePlayer, /playerTheme=\{theme\}/);
  // The palette itself lives in the stylesheet as scoped variables.
  assert.match(styles, /\.course-mindmap-shell\[data-mindmap-theme="light"\]/);
});

test("the mind map toolbar has a close button that peek-collapses the pane", () => {
  assert.match(panel, /data-course-mindmap-close/);
  assert.match(panel, /onClose\(\);/);
  assert.match(coursePlayer, /onClose=\{\(\) => \{/);
  assert.match(coursePlayer, /mindMap\.flush\(\);/);
  assert.match(coursePlayer, /splitDeckRef\.current\?\.collapse\("study"\)/);
});

test("the toolbar slot is replaced by a slim status strip in both orientations", () => {
  // The old landscape-only "hide the toolbar" rule is gone — the
  // branch / stats / zoom controls are now a single status strip that is
  // always mounted, and the diagram fills the rest of the sheet.
  assert.match(panel, /data-course-mindmap-status/);
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

// ---------------------------------------------------------------------------
// The toolbar: one icon per control, no +/− zoom, a small align drop-down
//
// Reported by the learner: the bottom bar kept "khisak" (sliding) to the left
// when the sheet opened, the +/− zoom buttons ate most of its width, and the
// long "Cloud par saved" text was the first thing to be squeezed out. The bar
// is now icon-only, pinch does the zooming, the save state is a cloud icon
// with a blinking beacon, and the node boxes get their own align menu.
// ---------------------------------------------------------------------------

const toolbar = panel.slice(
  panel.indexOf("Status strip — the mind map's toolbar"),
  panel.indexOf("{errorMessage ? ("),
);
// Everything on the bar lives between those two markers; the map library
// screen above it still carries words.
const toolCluster = panel.slice(panel.indexOf("Right cluster: the tools"), panel.indexOf("data-course-mindmap-close"));

test("the toolbar is icon-only: every control is a single glyph tile, no captions", () => {
  // One tile class per control, and not one of them renders a word.
  assert.match(toolbar, /className="mm-tool/, "the bar's controls share the icon tile");
  assert.match(toolbar, /data-course-mindmap-save/);
  assert.match(toolbar, /data-course-mindmap-align/);
  assert.match(toolbar, /data-course-mindmap-fit/);
  assert.match(toolbar, /data-course-mindmap-theme/);
  assert.match(toolbar, /data-course-mindmap-delete/);
  assert.match(toolbar, /data-course-mindmap-dbl-delete/);
  assert.match(toolbar, /data-course-mindmap-close/);
  assert.match(toolbar, /data-course-mindmap-auto-arrange/);
  for (const button of toolCluster.matchAll(/<button[\s\S]*?>/g)) {
    const tag = button[0];
    assert.doesNotMatch(tag, /size=\{\d+\}>\s*[A-Za-z]/, "a tool must not carry a text caption");
  }
  // The old captions are gone from the bar for good.
  assert.doesNotMatch(toolCluster, /<span className="hidden sm:inline">Arrange<\/span>/);
  assert.doesNotMatch(toolCluster, /<span className="hidden sm:inline">Fit<\/span>/);
  // …but every tool still says what it is to a screen reader and a tooltip.
  assert.match(toolCluster, /aria-label="Poora map fit karein"/);
  assert.match(toolCluster, /title="Fit to screen/);
});

test("the status strip never scrolls sideways (the 'toolbar slid left' fix)", () => {
  // A scrollable strip KEEPS the offset the browser hands it while scrolling
  // a focused tile into view (soft keyboard, rotation, reopen) and never
  // gives it back — the bar then paints from the middle with its left edge
  // cut off, which is exactly the "toolbar khisak gaya" report. It is clipped
  // now, sizes itself, and resets any leftover offset when the sheet opens.
  assert.match(toolbar, /overflow-hidden/);
  assert.doesNotMatch(toolbar, /overflow-x-auto/, "the strip must not be a scroll container");
  assert.doesNotMatch(toolbar, /overflow-x-scroll/);
  // Only the map-name pill may shrink, so no tool can be pushed off the bar.
  assert.match(toolbar, /flex min-w-0 flex-1 items-center/);
  assert.match(toolbar, /<span className="min-w-0 truncate normal-case" data-mm-map-name>/);
  // …and any offset a browser still managed to set is cleared on open.
  assert.match(panel, /if \(strip && strip\.scrollLeft !== 0\) strip\.scrollLeft = 0;/);
  assert.match(panel, /const statusRef = useRef<HTMLDivElement>\(null\);/);
});

test("the toolbar measures itself and sizes its tiles for phone, tablet and desktop", () => {
  // A landscape split panel is narrower than the screen it sits on, so the
  // strip watches its OWN width (not the viewport) and drops to the compact
  // tile — that is what keeps every tool on the bar everywhere.
  assert.match(panel, /const \[toolbarCompact, setToolbarCompact\] = useState\(false\);/);
  assert.match(panel, /const MIN_FULL_TOOLBAR_WIDTH_PX = 360;/);
  assert.match(panel, /setToolbarCompact\(width < MIN_FULL_TOOLBAR_WIDTH_PX\);/);
  assert.match(panel, /data-compact=\{toolbarCompact \? "true" : "false"\}/);
  // The tile size is one custom property that steps up with the screen…
  assert.match(styles, /\[data-course-mindmap-status\] \{\s*--mm-tool-size: 30px;/);
  assert.match(styles, /@media \(min-width: 640px\) \{\s*\[data-course-mindmap-status\] \{\s*--mm-tool-size: 34px;/);
  assert.match(styles, /@media \(min-width: 1024px\) \{\s*\[data-course-mindmap-status\] \{\s*--mm-tool-size: 38px;/);
  // …and drops (with the map name) when the sheet itself is narrow.
  assert.match(styles, /\[data-course-mindmap-status\]\[data-compact="true"\] \{\s*--mm-tool-size: 28px;/);
  assert.match(styles, /\[data-course-mindmap-status\]\[data-compact="true"\] \[data-mm-map-name\] \{\s*display: none;/);
  // The glyph is sized from the tile, so it stays proportional at every step.
  assert.match(styles, /\.mm-tool > svg \{\s*width: 58%;/);
});

test("cloud save is an icon with a blinking beacon, and the words moved to its menu", () => {
  // The "Cloud par saved" text was the widest thing on the bar; it is a cloud
  // icon now, tinted by the state, with a blinking dot while there is a
  // message — and tapping it still shows the message (plus a save-now action).
  assert.match(toolbar, /data-course-mindmap-save/);
  assert.match(toolbar, /data-save-status=\{status\}/);
  assert.match(toolbar, /data-blink=\{saveBlink \? "true" : "false"\}/);
  assert.match(toolbar, /status === "saving" \? <CloudUpload \/> : status === "saved" \? <CloudCheck \/> : status === "error" \? <CloudAlert \/> : <Cloud \/>/);
  assert.match(toolbar, /\{saveBlink \? <span className="mm-blink" data-course-mindmap-save-blink aria-hidden="true" \/> : null\}/);
  assert.match(toolbar, /<ToolbarMenu[\s\S]*?label="Cloud save"[\s\S]*?data-course-mindmap-save-label/);
  assert.match(toolbar, /data-course-mindmap-save-now/);
  // The beacon blinks (and only while a message is live): a finished save
  // blinks for a beat, an in-flight or failed one keeps blinking.
  assert.match(panel, /const SAVED_BLINK_MS = 2400;/);
  assert.match(panel, /if \(status === "saving" \|\| status === "error"\) \{\s*setSaveBlink\(true\);/);
  assert.match(styles, /@keyframes mm-blink \{/);
  assert.match(styles, /\.mm-blink \{[\s\S]*?animation: mm-blink 1\.05s ease-in-out infinite;/);
  // It rides the tile's top-right corner and inherits the status colour.
  assert.match(styles, /\.mm-blink \{[\s\S]*?position: absolute;\s*top: -1px;\s*right: -1px;/);
  assert.match(styles, /\.mm-blink \{[\s\S]*?background: currentColor;/);
});

test("one align icon opens a small drop-down with the box alignment + text fit", () => {
  // "jo nodes boxes hain unka alignment — wrapping ya clip — ek icon, click
  // karne par chhota sa drop down".
  assert.match(toolbar, /data-course-mindmap-align/);
  assert.match(toolbar, /aria-haspopup="menu"/);
  assert.match(toolbar, /<ToolbarMenu[\s\S]*?label="Boxes ka alignment"/);
  // The two groups the learner asked for: where the boxes sit, and what a
  // long label does inside one.
  assert.match(panel, /const ARRANGEMENT_OPTIONS/);
  assert.match(panel, /const TEXT_FIT_OPTIONS/);
  assert.match(panel, /\{ value: "tree", label: "Tree", hint: "Classic mind map — dono taraf branches", Icon: Network \}/);
  assert.match(panel, /\{ value: "line", label: "Ek line", hint: "Saare boxes ek hi line mein", Icon: Rows3 \}/);
  assert.match(panel, /\{ value: "stack", label: "Ek column", hint: "Saare boxes ek ke neeche ek", Icon: Columns3 \}/);
  assert.match(panel, /\{ value: "wrap", label: "Wrap", hint: "Lamba text agli line mein ghoom jayega", Icon: WrapText \}/);
  assert.match(panel, /\{ value: "clip", label: "Ek line · clip", hint: "Har box ek line ka, aage “…”", Icon: Type \}/);
  // It is a radio list: the picked option is marked, and picking closes it.
  assert.match(panel, /role="menuitemradio"/);
  assert.match(panel, /aria-checked=\{arrangement === option\.value\}/);
  assert.match(panel, /setAlignMenuOpen\(false\);/);
  // Small and clamped inside the viewport, and portalled so the clipped strip
  // cannot slice it in half.
  assert.match(panel, /const MENU_WIDTH_PX = 224;/);
  assert.match(panel, /createPortal\(/);
  assert.match(panel, /window\.addEventListener\("scroll", measure, true\)/);
  assert.match(panel, /if \(event\.key === "Escape"\) onClose\(\);/);
  assert.match(styles, /\.mm-menu \{[\s\S]*?max-width: min\(17rem, calc\(100vw - 16px\)\);/);
});

test("the align choices are views, not data: remembered per device, never saved to the map", () => {
  // Flipping to "one line" must not cost a Firestore write or show up as an
  // edit, so both live in localStorage next to the theme + double-tap picks.
  assert.match(panel, /const arrangementStorageKey = "dc\.mindMapArrangement";/);
  assert.match(panel, /const textFitStorageKey = "dc\.mindMapTextFit";/);
  assert.match(panel, /localStorage\.setItem\(arrangementStorageKey, arrangement\)/);
  assert.match(panel, /localStorage\.setItem\(textFitStorageKey, textFit\)/);
  assert.match(panel, /normalizeArrangement\(/);
  // The map document itself is untouched by either choice.
  const doc = readSource("src/course/useCourseMindMap.ts");
  assert.doesNotMatch(doc, /arrangement/, "the stored map carries no arrangement");
  // …and flipping it re-frames the canvas, or the new line sits off-screen.
  assert.match(panel, /void fitView\(\{ duration: 320, padding: 0\.2 \}\), 60/);
});

test("the clip text fit is honoured by BOTH the layout measurement and the box", () => {
  // A one-line box must be MEASURED as one line, or the row reserves space
  // for text that is never painted.
  assert.match(panel, /measure: \{ maxLines: textFit === "clip" \? 1 : 0 \}/);
  assert.match(panel, /textFit === "clip" \? \(/);
  assert.match(panel, /data-mind-node-text-fit="clip"/);
  assert.match(panel, /data-mind-node-text-fit="wrap"/);
  assert.match(panel, /textFit,/);
});
