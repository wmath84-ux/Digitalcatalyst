// tests/coursePlayerMindMapMultiAutoArrangeContract.test.mjs
//
// Contract for the two mind map upgrades the learner asked for:
//
//   1. MULTIPLE MAPS PER MODULE — "jaise note alag-alag banaye jaate hain,
//      waise mind map bhi": one module can hold as many separate diagrams as
//      the learner wants, each in its own Firestore document, created /
//      opened / renamed / deleted from a Notes-style card list.
//   2. ONE-CLICK AUTO ARRANGE — "mind map kitna bhi ganda ho, ek click me
//      sab nodes organise ho jayein": every hand-dragged pin is dropped and
//      the tidy tree re-organises the whole diagram.
//
// The maths lives in utils/mindMapTree.js (pure, testable in Node); this file
// asserts both the maths and the wiring (hook, panel, player, rules).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_MAPS_PER_MODULE,
  MIND_MAP_DEFAULT_KEY,
  addChildNode,
  autoArrangeMindMap,
  createMapKey,
  createMindMap,
  hasManualPositions,
  layoutMindMap,
  mindMapDisplayTitle,
  mindMapDocId,
  parseMindMap,
  sanitizeMapKey,
  setMindMapTitle,
  setNodePosition,
  toFirestoreMindMap,
} from "../utils/mindMapTree.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const panel = readSource("src/course/MindMapPanel.tsx");
const notesPanel = readSource("src/course/NotesPanel.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");
const styles = readSource("src/index.css");
const hook = readSource("src/course/useCourseMindMap.ts");
const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const rules = readSource("firestore.rules");

/** A deliberately messy map: three branches, all dragged somewhere silly. */
const messyMap = () => {
  let mind = createMindMap("Photosynthesis");
  const ids = [];
  for (const topic of ["Light reaction", "Dark reaction", "Chlorophyll"]) {
    const result = addChildNode(mind, "root", topic);
    mind = result.mind;
    ids.push(result.nodeId);
  }
  const deeper = addChildNode(mind, ids[0], "ATP");
  mind = deeper.mind;
  mind = setNodePosition(mind, ids[0], 900, -1200);
  mind = setNodePosition(mind, ids[1], -40, 3000);
  mind = setNodePosition(mind, deeper.nodeId, 77, 77);
  mind = setNodePosition(mind, "root", 640, 480);
  return { mind, ids, deeperId: deeper.nodeId };
};

// ---------------------------------------------------------------------------
// 1. One-click auto arrange — the maths
// ---------------------------------------------------------------------------

test("auto arrange drops every hand-dragged pin, centre included", () => {
  const { mind } = messyMap();
  assert.equal(hasManualPositions(mind), true, "the fixture must actually be messy");

  const tidy = autoArrangeMindMap(mind);
  assert.equal(hasManualPositions(tidy), false, "no manual pin may survive the clean-up");
  assert.equal(tidy.rootX, null);
  assert.equal(tidy.rootY, null);
  for (const node of tidy.nodes) {
    assert.equal(node.fx, null, `${node.topic} kept a manual x`);
    assert.equal(node.fy, null, `${node.topic} kept a manual y`);
  }
});

test("auto arrange never mutates the map it was given", () => {
  const { mind } = messyMap();
  const before = JSON.stringify(mind);
  autoArrangeMindMap(mind);
  assert.equal(JSON.stringify(mind), before, "the input map must be left untouched");
});

test("after auto arrange every node rides the tidy tree again", () => {
  const { mind } = messyMap();
  const messyLayout = layoutMindMap(mind);
  assert.ok(messyLayout.nodes.some((node) => node.manual), "the messy layout must contain pinned boxes");

  const tidyLayout = layoutMindMap(autoArrangeMindMap(mind));
  assert.equal(tidyLayout.nodes.every((node) => !node.manual), true, "every box must be auto-placed");
  // The tidy tree is compact: the messy version was flung thousands of px away.
  assert.ok(tidyLayout.bounds.height < messyLayout.bounds.height, "the tidied map must be tighter");
  assert.ok(tidyLayout.bounds.width < messyLayout.bounds.width, "the tidied map must be narrower");
});

test("auto arrange leaves no two boxes overlapping", () => {
  const { mind } = messyMap();
  const laid = layoutMindMap(autoArrangeMindMap(mind));
  const overlaps = (a, b) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (let i = 0; i < laid.nodes.length; i += 1) {
    for (let j = i + 1; j < laid.nodes.length; j += 1) {
      assert.equal(overlaps(laid.nodes[i], laid.nodes[j]), false, "tidied nodes must not overlap");
    }
  }
});

test("auto arrange re-balances the root's branches across both wings", () => {
  // Every branch forced to the right is a lopsided map even once the pins are
  // gone, so the clean-up spreads them.
  let mind = createMindMap("Centre");
  for (const topic of ["A", "B", "C", "D"]) {
    const result = addChildNode(mind, "root", topic, { side: "right" });
    mind = result.mind;
  }
  assert.equal(mind.nodes.every((node) => node.side === "right"), true);

  const tidy = autoArrangeMindMap(mind);
  const left = tidy.nodes.filter((node) => node.side === "left").length;
  const right = tidy.nodes.filter((node) => node.side === "right").length;
  assert.equal(left + right, 4);
  assert.ok(Math.abs(left - right) <= 1, "both wings must end up within one branch of each other");
});

test("auto arrange is a no-op for a map that was never dragged", () => {
  const clean = addChildNode(createMindMap("Clean"), "root", "Only child").mind;
  assert.equal(hasManualPositions(clean), false);
  assert.deepEqual(autoArrangeMindMap(clean), clean);
});

// ---------------------------------------------------------------------------
// 1b. One-click auto arrange — the button
// ---------------------------------------------------------------------------

test("the toolbar carries a single auto-arrange button that re-fits the view", () => {
  assert.match(panel, /data-course-mindmap-auto-arrange/);
  assert.match(panel, /onMindChange\(\(current\) => autoArrangeMindMap\(current\)\)/);
  assert.match(panel, /onClick=\{handleAutoArrange\}/);
  // The freshly tidied diagram is framed for the learner, otherwise the map
  // re-organises off-screen and looks like nothing happened.
  assert.match(panel, /void fitView\(\{ duration: 320, padding: 0\.2 \}\)/);
  // The button advertises whether there is any mess left to clean.
  assert.match(panel, /const messy = hasManualPositions\(mind\);/);
  assert.match(panel, /data-messy=\{messy \? "true" : "false"\}/);
});

// ---------------------------------------------------------------------------
// 2. Many maps per module — keys and document ids
// ---------------------------------------------------------------------------

test("the first map keeps the legacy document id so old maps still open", () => {
  assert.equal(MIND_MAP_DEFAULT_KEY, "main");
  assert.equal(mindMapDocId("u1", "7", "m2"), "u1__7__m2");
  assert.equal(mindMapDocId("u1", "7", "m2", "main"), "u1__7__m2");
});

test("every extra map gets its own document id under the same module", () => {
  assert.equal(mindMapDocId("u1", "7", "m2", "m9abc"), "u1__7__m2__m9abc");
  assert.notEqual(mindMapDocId("u1", "7", "m2", "a"), mindMapDocId("u1", "7", "m2", "b"));
});

test("map keys are sanitised to what a Firestore id can hold", () => {
  assert.equal(sanitizeMapKey("Chapter 1/../x"), "chapter1x");
  assert.equal(sanitizeMapKey(""), "main");
  assert.equal(sanitizeMapKey(null), "main");
  assert.ok(sanitizeMapKey("x".repeat(200)).length <= 40);
  assert.match(sanitizeMapKey("MiXeD-42"), /^[a-z0-9-]+$/);
});

test("a new map key never collides with an existing one, nor with main", () => {
  const taken = [];
  for (let i = 0; i < 25; i += 1) {
    const key = createMapKey(taken);
    assert.equal(taken.includes(key), false, "createMapKey handed out a duplicate");
    assert.notEqual(key, MIND_MAP_DEFAULT_KEY);
    assert.match(key, /^[a-z0-9-]+$/);
    taken.push(key);
  }
  assert.ok(MAX_MAPS_PER_MODULE >= 10, "a learner must be able to keep several maps per module");
});

test("each map carries its own name, stored and restored", () => {
  const named = setMindMapTitle(createMindMap("Cell biology"), "Revision map");
  assert.equal(named.title, "Revision map");
  assert.equal(mindMapDisplayTitle(named), "Revision map");
  // Untitled maps fall back to the central idea rather than rendering blank.
  assert.equal(mindMapDisplayTitle(createMindMap("Cell biology")), "Cell biology");
  const round = parseMindMap(toFirestoreMindMap(named, { uid: "u", productId: "p", moduleId: "m", mapKey: "m1" }));
  assert.equal(round.title, "Revision map");
});

test("the stored document names the map it belongs to", () => {
  const stored = toFirestoreMindMap(createMindMap("Idea"), {
    uid: "u1",
    productId: "7",
    moduleId: "m2",
    mapKey: "m9abc",
  });
  assert.equal(stored.mapKey, "m9abc");
  // Never undefined — an undefined field makes the client SDK throw and the
  // whole save is silently lost.
  const fallback = toFirestoreMindMap(createMindMap("Idea"), { uid: "u1", productId: "7", moduleId: "m2" });
  assert.equal(fallback.mapKey, MIND_MAP_DEFAULT_KEY);
});

// ---------------------------------------------------------------------------
// 2b. Many maps per module — the hook
// ---------------------------------------------------------------------------

test("the hook lists a module's maps from Firestore and mirrors them on the device", () => {
  assert.match(hook, /collection\(db, "users", uidText, "mindMaps"\)/);
  assert.match(hook, /where\("productId", "==", productText\)/);
  assert.match(hook, /where\("moduleId", "==", moduleText\)/);
  assert.match(hook, /const indexKey = /, "the list must survive offline");
  assert.match(hook, /writeLocalIndex\(/);
  assert.match(hook, /readLocalIndex\(/);
});

test("the hook exposes the full notes-style set of map actions", () => {
  for (const action of ["selectMap", "createMap", "renameMap", "deleteMap"]) {
    assert.match(hook, new RegExp(`${action}[,:]`), `${action} must be part of the hook's API`);
  }
  assert.match(hook, /maps: MindMapSummary\[\]/);
  assert.match(hook, /activeMapKey: string;/);
});

test("switching or creating a map flushes the edit that belongs to the old one", () => {
  // Without this the debounced write lands in whichever document is open
  // when the timer fires — i.e. in the wrong map.
  const select = hook.slice(hook.indexOf("const selectMap ="), hook.indexOf("const createMap ="));
  assert.match(select, /flush\(\);/);
  assert.match(select, /setActiveMapKey\(key\);/);
  const create = hook.slice(hook.indexOf("const createMap ="), hook.indexOf("const renameMap ="));
  assert.match(create, /createMapKey\(rows\.map\(\(row\) => row\.mapKey\)\)/);
  assert.match(create, /flush\(\);/);
});

test("deleting a map removes its document and never leaves an empty list", () => {
  const remove = hook.slice(hook.indexOf("const deleteMap ="), hook.indexOf("// Clear any pending timer"));
  assert.match(remove, /deleteDoc\(/);
  assert.match(remove, /mindMapDocId\(String\(u\), String\(p\), String\(m\), key\)/);
  // A pending debounce for the deleted map must not resurrect it.
  assert.match(remove, /clearTimeout\(timerRef\.current\)/);
  assert.match(remove, /seedSummary\(/);
});

test("each map is scoped separately in Firestore AND in the device mirror", () => {
  assert.match(hook, /mindMapDocId\(String\(uid\), String\(productId\), String\(moduleId\), activeMapKey\)/);
  assert.match(hook, /const localKey = \(uid: string, productId: string, moduleId: string, mapKey: string\)/);
  assert.match(hook, /mapKey: currentMapKey,/, "the write must name the map it belongs to");
});

test("the learner returns to the map they had open in that module", () => {
  assert.match(hook, /const activeKeyStorageKey = /);
  assert.match(hook, /localStorage\.setItem\(activeKeyStorageKey\(/);
});

// ---------------------------------------------------------------------------
// 2c. Many maps per module — the panel and the player
// ---------------------------------------------------------------------------

test("the panel ships a notes-style card list of the module's maps", () => {
  assert.match(panel, /data-course-mindmap-maps/, "a switcher must open the library");
  assert.match(panel, /data-course-mindmap-library/);
  assert.match(panel, /data-course-mindmap-map-card/);
  assert.match(panel, /data-course-mindmap-new/);
  assert.match(panel, /data-course-mindmap-rename/);
  assert.match(panel, /data-course-mindmap-delete-map/);
  // The library slides over the canvas so the diagram surface stays clean
  // when it is closed — the mind map tab has no header of its own.
  //
  // It is also the panel's HOME screen on a FRESH player visit. Within one
  // visit the learner's last view is restored from the panel session instead
  // (library stays library, canvas stays canvas), so tab switches never yank
  // them back to the picker — leaving the player is what resets it.
  assert.match(panel, /useState\(\s*\(\) => getCoursePanelSession\(\)\.mindMapView !== "canvas",?\s*\)/);
  assert.match(panel, /setMindMapSessionView\(libraryOpen \? "library" : "canvas"\)/);
  assert.match(panel, /if \(open && !prevOpenRef\.current\) \{/);
  assert.match(panel, /const resumeCanvas = getCoursePanelSession\(\)\.mindMapView === "canvas";/);
  assert.match(panel, /setLibraryOpen\(!resumeCanvas\);/);
});

test("the map library's delete acts on a MAP, the toolbar trash on a BRANCH", () => {
  // Two different destructive actions must never share a control.
  assert.match(panel, /data-course-mindmap-delete\b/);
  assert.match(panel, /onDeleteMap\?\.\(entry\.mapKey\)/);
  assert.match(panel, /if \(selectedId\) handleDelete\(selectedId\);/);
});

test("the player hands the whole map list down to the panel", () => {
  for (const prop of [
    "maps=\\{mindMap\\.maps\\}",
    "activeMapKey=\\{mindMap\\.activeMapKey\\}",
    "onSelectMap=\\{mindMap\\.selectMap\\}",
    "onCreateMap=\\{mindMap\\.createMap\\}",
    "onRenameMap=\\{mindMap\\.renameMap\\}",
    "onDeleteMap=\\{mindMap\\.deleteMap\\}",
  ]) {
    assert.match(coursePlayer, new RegExp(prop), `${prop} must be wired`);
  }
});

// ---------------------------------------------------------------------------
// 2d. Many maps per module — the security rules
// ---------------------------------------------------------------------------

test("the rules tie every map document id to its own map key", () => {
  const block = rules.slice(rules.indexOf("match /mindMaps/{mapId}"), rules.indexOf("match /webPushSubscriptions/"));
  // The legacy three-part id is still valid, but only for the `main` map.
  assert.match(block, /request\.resource\.data\.mapKey == 'main'/);
  assert.match(
    block,
    /mapId == uid \+ '__' \+ request\.resource\.data\.productId \+ '__' \+ request\.resource\.data\.moduleId \+ '__' \+ request\.resource\.data\.mapKey/,
  );
  // A forged key cannot smuggle a slash or a foreign uid into the id.
  assert.match(block, /request\.resource\.data\.mapKey\.matches\('\^\[a-z0-9-\]\+\$'\)/);
  assert.match(block, /request\.resource\.data\.mapKey\.size\(\) <= 40/);
  assert.match(block, /allow delete: if isOwner\(uid\) \|\| isAdmin\(\);/, "the learner must be able to delete a map");
});

// ---------------------------------------------------------------------------
// 2e. The library grid sizes itself by the space it GOT (notes parity)
//
// Reported by the learner: in the landscape split the map cards collapsed
// into tiny grey slivers while the notes list, in the very same narrow sheet,
// stayed comfortable. Cause: the grid's `grid-cols-2 sm:grid-cols-3` classes
// count the VIEWPORT, and the sheet is only a slice of it. The notes panel
// escaped this because `src/index.css` re-tiles ITS grid on the container
// width (`repeat(auto-fill, minmax(…))`); the library had no such rule.
// ---------------------------------------------------------------------------

test("the map library re-uses the notes grid's own tiling function", () => {
  // The library opts into the shared rule with the same kind of hook the notes
  // list uses (`data-course-notes-grid`), on BOTH its states — cards and
  // skeleton — so a loading grid never tiles differently than the real one.
  assert.match(notesPanel, /data-course-notes-grid="true"/);
  const grids = [...panel.matchAll(/data-course-mindmap-map-grid="true"/g)];
  assert.equal(grids.length, 2, "the card list AND its skeleton placeholder must both tile by width");

  // Same function, same floor: auto-fill over 160 px, i.e. the grid is measured
  // by the space it got and never by a fixed column count.
  const notesRule = styles.match(/\[data-course-notes-grid\][^{]*\{[^}]*\}/);
  const libraryRule = styles.match(/^\[data-course-mindmap-map-grid\] \{[^}]*\}/m);
  assert.ok(notesRule && libraryRule, "both grids need a tiling rule in the stylesheet");
  for (const rule of [notesRule[0], libraryRule[0]]) {
    assert.match(rule, /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/, "tile by the width the grid got");
    assert.match(rule, /160px/, "a card never shrinks below a readable 160 px");
    assert.doesNotMatch(rule, /grid-template-columns:\s*repeat\((2|3)/, "no fixed column count");
  }
  // The library rule starts its own line with a BARE selector on purpose: the
  // notes grid only needs rescuing inside the landscape split, while the map
  // library is the panel's home screen and owns the whole sheet — so the same
  // measurement has to hold for the portrait sheet too instead of a second,
  // viewport-based rule taking over there.
  assert.doesNotMatch(libraryRule[0], /data-split-kind/, "no orientation/split mode may be excluded");
  // …and a sheet dragged to its 10% minimum is narrower than one 160 px card.
  // The grid must NOT shrink to the container there: cards keep their 160 px
  // floor and clip at the sheet edge — the exact dismissal behaviour of the
  // Note Library — instead of shrinking to a sliver as the drag closes.
  assert.match(libraryRule[0], /minmax\(160px, 1fr\)/);
  assert.doesNotMatch(libraryRule[0], /minmax\(min\(160px/, "cards never shrink below 160 px during a drag-close");
});

test("the library is still mounted inside the sheet the split rule targets", () => {
  // Parity depends on the panel living under the element that reports which
  // sheet is open — the same ancestor the notes grid hangs its rule off.
  assert.match(overlay, /data-course-overlay\b/);
  assert.match(overlay, /data-split-kind=\{mindMapSplit \? "mindmap" : splitMode \? "notes" : "none"\}/);
  assert.match(panel, /data-course-mindmap-library/);
});

test("a map card keeps a floor of height and a real surface, never a flat grey tile", () => {
  // A square card in a squeezed column used to collapse into a grey blob: no
  // minimum height, and the background was a 6% white wash. The height floor
  // keeps the two action buttons inside the card, and the surface — including
  // the "this map is open right now" violet state — is painted in CSS so both
  // themes get a lifted card.
  assert.match(panel, /data-course-mindmap-map-card/);
  assert.match(panel, /aspect-square min-h-\[104px\]/);
  assert.match(styles, /\[data-course-mindmap-map-card\]\s*\{[^}]*background:/);
  assert.match(styles, /\[data-course-mindmap-map-card\]\s*\{[^}]*box-shadow:/);
  assert.match(styles, /\[data-course-mindmap-map-card\]\[data-active="true"\]/);
  assert.match(styles, /\[data-mindmap-theme="light"\] \[data-course-mindmap-map-card\]/);
});
