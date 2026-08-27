// tests/mindMapTree.test.mjs
//
// Contract for the mind-map tree model + tidy-tree layout in
// `utils/mindMapTree.js`. The Node test runner imports the .js directly —
// no React, no React Flow, no Firestore.
//
// What must hold, from the product requirements:
//   1. A `+` on ANY node (root included) adds a branch there.
//   2. Branches are unlimited in width AND depth.
//   3. The auto-layout never overlaps siblings and stays readable.
//   4. Collapsing a branch reclaims its screen space.
//   5. The map round-trips through the Firestore document shape without
//      losing nodes or emitting `undefined` (which makes setDoc throw).

import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MIND_MAP_NODES,
  MAX_TOPIC_LENGTH,
  addChildNode,
  addChildNodes,
  allNodes,
  childrenOf,
  collectSubtreeIds,
  countNodes,
  createMindMap,
  findNode,
  hasChildren,
  isMindMap,
  layoutMindMap,
  maxDepth,
  measureTopic,
  mindMapDocId,
  moveNode,
  nextNodeId,
  parseMindMap,
  removeNode,
  rootId,
  setNodePosition,
  setBranchSide,
  setCollapsed,
  setNodeTopic,
  toFirestoreMindMap,
  toggleCollapsed,
} from "../utils/mindMapTree.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Root with `count` first-level branches, all on the default (right) side. */
const withBranches = (count) => {
  let mind = createMindMap("Physics");
  for (let i = 1; i <= count; i += 1) {
    mind = addChildNode(mind, rootId(), `Branch ${i}`).mind;
  }
  return mind;
};

/** A four-level chain: root → a → b → c. */
const deepChain = () => {
  let mind = createMindMap("Root");
  const a = addChildNode(mind, rootId(), "A");
  const b = addChildNode(a.mind, a.nodeId, "B");
  const c = addChildNode(b.mind, b.nodeId, "C");
  return { mind: c.mind, a: a.nodeId, b: b.nodeId, c: c.nodeId };
};

// ---------------------------------------------------------------------------
// 1. Creation
// ---------------------------------------------------------------------------

test("createMindMap produces a root-only map that the model recognises", () => {
  const mind = createMindMap("Organic Chemistry", "Chapter 3");
  assert.equal(isMindMap(mind), true);
  assert.equal(mind.rootTopic, "Organic Chemistry");
  assert.equal(mind.title, "Chapter 3");
  assert.deepEqual(mind.nodes, []);
  assert.equal(countNodes(mind), 1, "the root itself counts as a node");
});

test("createMindMap falls back to a sensible root topic when given nothing", () => {
  assert.equal(createMindMap().rootTopic, "Central idea");
  assert.equal(createMindMap("   ").rootTopic, "Central idea");
});

test("nextNodeId is stable and never collides with an existing node", () => {
  const mind = withBranches(3);
  const ids = mind.nodes.map((node) => node.id);
  const next = nextNodeId(mind);
  assert.equal(ids.includes(next), false);
  assert.match(next, /^n\d+$/);
});

test("nextNodeId skips ids that were used and then deleted", () => {
  // Hand-built so the id sequence has a hole in it.
  const mind = {
    version: 1,
    title: "",
    rootTopic: "Root",
    nodes: [
      { id: "n1", topic: "A", parentId: "root", side: "right", collapsed: false },
      { id: "n3", topic: "B", parentId: "root", side: "left", collapsed: false },
    ],
  };
  assert.equal(nextNodeId(mind), "n2");
});

// ---------------------------------------------------------------------------
// 2. Unlimited branches from ANY node
// ---------------------------------------------------------------------------

test("a child can be added under the root", () => {
  const { mind, nodeId } = addChildNode(createMindMap("Root"), rootId(), "First branch");
  assert.ok(nodeId);
  assert.equal(findNode(mind, nodeId).parentId, rootId());
  assert.equal(countNodes(mind), 2);
});

test("a child can be added under any non-root node, at any depth", () => {
  const { mind, c } = deepChain();
  const added = addChildNode(mind, c, "D under C");
  assert.ok(added.nodeId, "the deepest node accepts a child");
  assert.equal(findNode(added.mind, added.nodeId).parentId, c);
  assert.equal(maxDepth(added.mind), 4);
});

test("branch width is unlimited — 120 siblings under one node", () => {
  let mind = createMindMap("Hub");
  for (let i = 0; i < 120; i += 1) {
    mind = addChildNode(mind, rootId(), `Sibling ${i}`).mind;
  }
  assert.equal(childrenOf(mind, rootId()).length, 120);
  assert.equal(countNodes(mind), 121);
});

test("branch depth is unlimited — a 40-level chain", () => {
  let mind = createMindMap("L0");
  let parentId = rootId();
  for (let depth = 1; depth <= 40; depth += 1) {
    const added = addChildNode(mind, parentId, `L${depth}`);
    assert.ok(added.nodeId, `depth ${depth} must accept a child`);
    mind = added.mind;
    parentId = added.nodeId;
  }
  assert.equal(maxDepth(mind), 40);
});

test("addChildNode returns a null id (and the same map) once the cap is hit", () => {
  let mind = createMindMap("Root");
  const topics = Array.from({ length: MAX_MIND_MAP_NODES + 5 }, (_, i) => `N${i}`);
  for (const topic of topics) {
    mind = addChildNode(mind, rootId(), topic).mind;
  }
  assert.equal(countNodes(mind), MAX_MIND_MAP_NODES, "the node cap is enforced");
  const overflow = addChildNode(mind, rootId(), "One too many");
  assert.equal(overflow.nodeId, null);
  assert.equal(overflow.mind, mind, "the map is returned unchanged, not mutated");
});

test("addChildNodes adds several siblings in one call and stops at the cap", () => {
  const { mind, nodeIds } = addChildNodes(createMindMap("Root"), rootId(), ["a", "b", "c"]);
  assert.deepEqual(nodeIds.length, 3);
  assert.equal(childrenOf(mind, rootId()).length, 3);
});

test("adding a child never mutates the map it was given", () => {
  const before = withBranches(2);
  const snapshot = JSON.stringify(before);
  addChildNode(before, rootId(), "New");
  assert.equal(JSON.stringify(before), snapshot, "mutations are copy-on-write");
});

// ---------------------------------------------------------------------------
// 3. Editing + deleting
// ---------------------------------------------------------------------------

test("setNodeTopic renames a node and the root", () => {
  const { mind, a } = deepChain();
  assert.equal(findNode(setNodeTopic(mind, a, "Renamed"), a).topic, "Renamed");
  assert.equal(setNodeTopic(mind, rootId(), "New root").rootTopic, "New root");
});

test("setNodeTopic refuses an empty rename so nodes never go blank", () => {
  const { mind, a } = deepChain();
  const before = findNode(mind, a).topic;
  assert.equal(findNode(setNodeTopic(mind, a, "   "), a).topic, before);
});

test("topic text is flattened to one line and clipped to the max length", () => {
  const { mind, a } = deepChain();
  const topic = `${"x".repeat(MAX_TOPIC_LENGTH + 50)}\nsecond line`;
  const cleaned = findNode(setNodeTopic(mind, a, topic), a).topic;
  assert.equal(cleaned.length, MAX_TOPIC_LENGTH);
  assert.equal(cleaned.includes("\n"), false);
});

test("removeNode deletes the node and its whole subtree", () => {
  const { mind, b, c } = deepChain();
  const after = removeNode(mind, b);
  assert.equal(findNode(after, b), null);
  assert.equal(findNode(after, c), null, "the subtree goes with its parent");
  assert.equal(countNodes(after), 2);
});

test("the root cannot be deleted", () => {
  const mind = withBranches(3);
  assert.equal(removeNode(mind, rootId()), mind);
  assert.equal(countNodes(removeNode(mind, rootId())), 4);
});

test("removeNode on an unknown id is a no-op", () => {
  const mind = withBranches(2);
  assert.equal(removeNode(mind, "does-not-exist"), mind);
});

test("collectSubtreeIds includes the node itself and every descendant", () => {
  const { mind, a, b, c } = deepChain();
  assert.deepEqual(collectSubtreeIds(mind, a).sort(), [a, b, c].sort());
  assert.deepEqual(collectSubtreeIds(mind, c), [c]);
});

// ---------------------------------------------------------------------------
// 4. Re-parenting without corrupting the tree
// ---------------------------------------------------------------------------

test("moveNode re-parents a branch", () => {
  // Mutations are copy-on-write, so each add has to chain off the previous
  // result — feeding the original map twice would add two nodes to two
  // separate snapshots instead of two siblings to one map.
  const a = addChildNode(createMindMap("Root"), rootId(), "A");
  const b = addChildNode(a.mind, rootId(), "B");
  assert.equal(findNode(b.mind, b.nodeId).parentId, rootId(), "B starts as a root branch");
  const moved = moveNode(b.mind, b.nodeId, a.nodeId);
  assert.equal(findNode(moved, b.nodeId).parentId, a.nodeId, "B now hangs off A");
  assert.equal(childrenOf(moved, a.nodeId).length, 1);
});

test("moveNode refuses to drop a node inside its own subtree", () => {
  const { mind, a, c } = deepChain();
  assert.equal(moveNode(mind, a, c), mind, "would create a cycle");
  assert.equal(findNode(moveNode(mind, a, c), a).parentId, rootId());
});

test("moveNode refuses to move the root", () => {
  const { mind, a } = deepChain();
  assert.equal(moveNode(mind, rootId(), a), mind);
});

// ---------------------------------------------------------------------------
// 5. Two-sided mind map + collapse
// ---------------------------------------------------------------------------

test("root-level branches are balanced across both sides", () => {
  const mind = withBranches(4);
  const sides = childrenOf(mind, rootId()).map((node) => node.side);
  assert.equal(sides.filter((side) => side === "right").length, 2);
  assert.equal(sides.filter((side) => side === "left").length, 2);
});

test("setBranchSide flips a root branch and only a root branch", () => {
  const { mind, a, b } = deepChain();
  // `a` is the root's first child, so the balancing rule already put it east.
  assert.equal(findNode(mind, a).side, "right");
  assert.equal(findNode(setBranchSide(mind, a, "left"), a).side, "left");
  // `b` is a grandchild, not a root child, so the flip must be ignored.
  assert.equal(findNode(setBranchSide(mind, b, "left"), b).side, null);
  // An unknown side is rejected outright, leaving the existing one intact.
  assert.equal(findNode(setBranchSide(mind, a, "sideways"), a).side, "right");
});

test("toggleCollapsed flips the flag, and never on the root", () => {
  const { mind, a } = deepChain();
  const collapsed = toggleCollapsed(mind, a);
  assert.equal(findNode(collapsed, a).collapsed, true);
  assert.equal(findNode(toggleCollapsed(collapsed, a), a).collapsed, false);
  assert.equal(toggleCollapsed(mind, rootId()), mind);
  assert.equal(findNode(setCollapsed(mind, a, true), a).collapsed, true);
});

// ---------------------------------------------------------------------------
// 5b. Manual (hand-dragged) positions
// ---------------------------------------------------------------------------

test("setNodePosition pins a node anywhere on the canvas, rounded to one decimal", () => {
  const { mind, a, b } = deepChain();
  const moved = setNodePosition(mind, a, 480.26, -120.04);
  assert.equal(findNode(moved, a).fx, 480.3);
  assert.equal(findNode(moved, a).fy, -120);
  // Only the dragged node records a position — everyone else keeps riding
  // the auto layout until they are dragged themselves.
  assert.equal(findNode(moved, b).fx, null);
  assert.equal(findNode(moved, b).fy, null);
  // Copy-on-write: the input map is untouched.
  assert.equal(findNode(mind, a).fx, null);
});

test("setNodePosition can move the root through the map-level rootX/rootY", () => {
  const { mind } = deepChain();
  const moved = setNodePosition(mind, rootId(), 100, 50);
  assert.equal(moved.rootX, 100);
  assert.equal(moved.rootY, 50);
  assert.equal(moved.nodes, mind.nodes, "no node record changes for a root move");
});

test("setNodePosition refuses garbage and clamps wild coordinates", () => {
  const { mind, a } = deepChain();
  assert.equal(setNodePosition(mind, a, "x", 5), mind, "a non-numeric x is refused");
  assert.equal(setNodePosition(mind, a, 10, Infinity), mind, "Infinity is refused");
  assert.equal(setNodePosition(mind, "ghost", 1, 1), mind, "an unknown id is refused");
  const clamped = setNodePosition(mind, a, 1e9, -1e9);
  assert.equal(findNode(clamped, a).fx, 100000, "a wild fling clamps instead of wedging the doc");
  assert.equal(findNode(clamped, a).fy, -100000);
});

test("the layout honours a manual position exactly", () => {
  const { mind, a } = deepChain();
  const auto = layoutMindMap(mind).nodes.find((node) => node.id === a);
  const moved = setNodePosition(mind, a, auto.x + 500, auto.y + 300);
  const placed = layoutMindMap(moved).nodes.find((node) => node.id === a);
  assert.equal(placed.x, auto.x + 500);
  assert.equal(placed.y, auto.y + 300);
  assert.equal(placed.manual, true);
  assert.equal(layoutMindMap(mind).nodes.find((node) => node.id === a).manual, false);
});

test("a manually placed node carries its whole subtree with it", () => {
  // Dragging a branch head must not tear the branch apart: the descendants
  // inherit the same offset, so the diagram stays readable mid-arrangement.
  const { mind, a, b, c } = deepChain();
  const auto = new Map(layoutMindMap(mind).nodes.map((node) => [node.id, node]));
  const moved = setNodePosition(mind, a, 1000, 800);
  const after = new Map(layoutMindMap(moved).nodes.map((node) => [node.id, node]));
  const dx = after.get(a).x - auto.get(a).x;
  const dy = after.get(a).y - auto.get(a).y;
  for (const id of [b, c]) {
    assert.equal(after.get(id).x - auto.get(id).x, dx, `${id} keeps its horizontal offset`);
    assert.equal(after.get(id).y - auto.get(id).y, dy, `${id} keeps its vertical offset`);
  }
});

test("a manually moved root keeps its children glued to it", () => {
  const { mind, a } = deepChain();
  const auto = new Map(layoutMindMap(mind).nodes.map((node) => [node.id, node]));
  const moved = setNodePosition(mind, rootId(), 700, 400);
  const after = new Map(layoutMindMap(moved).nodes.map((node) => [node.id, node]));
  const dx = after.get(rootId()).x - auto.get(rootId()).x;
  const dy = after.get(rootId()).y - auto.get(rootId()).y;
  assert.equal(after.get(a).x - auto.get(a).x, dx);
  assert.equal(after.get(a).y - auto.get(a).y, dy);
});

test("an unplaced node keeps following the automatic tidy tree", () => {
  // Moving one branch must not disturb the geometry of its untouched
  // siblings — the tidy tree still owns every node without a manual spot.
  let mind = createMindMap("Root");
  const first = addChildNode(mind, rootId(), "First");
  mind = addChildNode(first.mind, rootId(), "Second").mind;
  const before = new Map(layoutMindMap(mind).nodes.map((node) => [node.id, node]));
  const moved = setNodePosition(mind, first.nodeId, 900, -900);
  const after = new Map(layoutMindMap(moved).nodes.map((node) => [node.id, node]));
  const second = after.get("n2");
  assert.equal(second.x, before.get("n2").x);
  assert.equal(second.y, before.get("n2").y);
});

test("manual positions survive the Firestore round trip", () => {
  const { mind, a } = deepChain();
  const moved = setNodePosition(setNodePosition(mind, a, 123.4, -56.7), rootId(), 10, 20);
  const stored = toFirestoreMindMap(moved);
  assert.equal(stored.nodes.find((node) => node.id === a).fx, 123.4);
  assert.equal(stored.rootX, 10);
  const restored = parseMindMap(stored);
  assert.equal(findNode(restored, a).fx, 123.4);
  assert.equal(findNode(restored, a).fy, -56.7);
  assert.equal(restored.rootX, 10);
  assert.equal(restored.rootY, 20);
});

test("parseMindMap drops unreadable positions instead of guessing them", () => {
  const parsed = parseMindMap({
    rootTopic: "Root",
    nodes: [
      { id: "a", topic: "A", parentId: "root", fx: "x", fy: 10 },
      { id: "b", topic: "B", parentId: "root", fx: 5, fy: null },
    ],
  });
  assert.equal(findNode(parsed, "a").fx, null, "a non-numeric x is discarded");
  assert.equal(findNode(parsed, "b").fx, null, "a half-set pair is discarded");
});

// ---------------------------------------------------------------------------
// 6. Measurement
// ---------------------------------------------------------------------------

test("measureTopic wraps long topics into multiple lines and grows the box", () => {
  const short = measureTopic("Atom");
  const long = measureTopic("The quick brown fox jumps over the lazy dog again and again");
  assert.equal(short.lines, 1);
  assert.ok(long.lines > 1, "a long topic must wrap");
  assert.ok(long.height > short.height, "wrapping makes the box taller");
  assert.ok(short.width >= 56, "even a short label keeps the minimum width");
});

test("measureTopic treats an empty topic as a placeholder, never zero-size", () => {
  const box = measureTopic("");
  assert.ok(box.width > 0);
  assert.ok(box.height > 0);
  assert.equal(box.lines, 1);
});

// ---------------------------------------------------------------------------
// 7. Layout
// ---------------------------------------------------------------------------

test("layout emits one box per visible node plus a root", () => {
  const mind = withBranches(3);
  const { nodes, edges } = layoutMindMap(mind);
  assert.equal(nodes.length, countNodes(mind));
  assert.equal(edges.length, countNodes(mind) - 1, "one edge per child");
  assert.equal(nodes.filter((node) => node.isRoot).length, 1);
});

test("the root sits at horizontal centre zero", () => {
  const mind = withBranches(3);
  const root = layoutMindMap(mind).nodes.find((node) => node.isRoot);
  assert.equal(Math.round(root.x + root.width / 2), 0);
});

test("root branches are split to the left and the right of the centre", () => {
  const { nodes } = layoutMindMap(withBranches(4));
  const root = nodes.find((node) => node.isRoot);
  const centre = root.x + root.width / 2;
  const rights = nodes.filter((node) => node.side === "right");
  const lefts = nodes.filter((node) => node.side === "left");
  assert.ok(rights.length > 0 && lefts.length > 0);
  for (const node of rights) assert.ok(node.x >= centre, "right branch east of centre");
  for (const node of lefts) assert.ok(node.x + node.width <= centre, "left branch west of centre");
});

test("deeper levels move further from the centre than their parents", () => {
  const { mind, a, b } = deepChain();
  const byId = new Map(layoutMindMap(mind).nodes.map((node) => [node.id, node]));
  const root = byId.get(rootId());
  assert.ok(byId.get(a).x > root.x + root.width, "A is east of the root");
  assert.ok(byId.get(b).x > byId.get(a).x + byId.get(a).width, "B is east of A");
});

/** True when two boxes intersect at all. */
const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test("no two boxes overlap in a wide map", () => {
  let mind = createMindMap("Root");
  for (let i = 0; i < 12; i += 1) {
    const added = addChildNode(mind, rootId(), `Branch number ${i} with a long label`);
    mind = added.mind;
    for (let j = 0; j < 3; j += 1) {
      mind = addChildNode(mind, added.nodeId, `Child ${i}.${j}`).mind;
    }
  }
  const { nodes } = layoutMindMap(mind);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      assert.equal(overlaps(nodes[i], nodes[j]), false,
        `${nodes[i].id} overlaps ${nodes[j].id}`);
    }
  }
});

test("siblings are ordered top to bottom in the order they were added", () => {
  const mind = withBranches(3);
  const { nodes } = layoutMindMap(mind);
  const rights = nodes
    .filter((node) => node.side === "right")
    .sort((a, b) => a.y - b.y)
    .map((node) => node.id);
  const added = childrenOf(mind, rootId())
    .filter((node) => node.side === "right")
    .map((node) => node.id);
  assert.deepEqual(rights, added, "layout preserves creation order");
});

test("a collapsed branch is treated as a leaf and reclaims vertical space", () => {
  let mind = createMindMap("Root");
  const parent = addChildNode(mind, rootId(), "Parent");
  mind = parent.mind;
  for (let i = 0; i < 6; i += 1) {
    mind = addChildNode(mind, parent.nodeId, `Child ${i}`).mind;
  }

  const open = layoutMindMap(mind);
  const closed = layoutMindMap(setCollapsed(mind, parent.nodeId, true));

  const parentBox = open.nodes.find((node) => node.id === parent.nodeId);
  assert.equal(closed.nodes.length, 2, "only the root and the collapsed parent render");
  assert.equal(closed.nodes.find((node) => node.id === parent.nodeId).collapsed, true);
  assert.ok(closed.bounds.height < open.bounds.height, "collapsing shrinks the diagram");
  assert.ok(parentBox, "the parent is still present while open");
});

test("a collapsed parent hides its descendants from the node list", () => {
  const { mind, a } = deepChain();
  const hidden = layoutMindMap(setCollapsed(mind, a, true));
  assert.equal(hidden.nodes.some((node) => node.depth > 1), false);
});

test("bounds describe the full extent of the diagram", () => {
  const { nodes, bounds } = layoutMindMap(withBranches(6));
  for (const node of nodes) {
    assert.ok(node.x >= bounds.minX);
    assert.ok(node.y >= bounds.minY);
    assert.ok(node.x + node.width <= bounds.maxX + 0.01);
    assert.ok(node.y + node.height <= bounds.maxY + 0.01);
  }
  assert.equal(bounds.width, bounds.maxX - bounds.minX);
});

test("layout is deterministic — the same map lays out identically twice", () => {
  const mind = withBranches(5);
  assert.deepEqual(layoutMindMap(mind), layoutMindMap(mind));
});

test("layout returns an empty result for something that is not a mind map", () => {
  const { nodes, edges, bounds } = layoutMindMap(null);
  assert.deepEqual(nodes, []);
  assert.deepEqual(edges, []);
  assert.equal(bounds.width, 0);
});

test("edges always point from a parent to its own child", () => {
  const mind = withBranches(3);
  const { edges } = layoutMindMap(mind);
  for (const edge of edges) {
    const child = findNode(mind, edge.target);
    assert.equal(String(child.parentId), edge.source);
  }
});

// ---------------------------------------------------------------------------
// 8. Firestore document shape
// ---------------------------------------------------------------------------

test("mindMapDocId scopes one map to user + product + module", () => {
  const id = mindMapDocId("uid123", "42", "mod-7");
  assert.equal(id, "uid123__42__mod-7");
  assert.equal(id.includes("/"), false, "Firestore ids cannot contain a slash");
  assert.notEqual(mindMapDocId("uid123", "42", "mod-8"), id, "a different module is a different doc");
  assert.notEqual(mindMapDocId("uid999", "42", "mod-7"), id, "a different user is a different doc");
});

test("a map survives a save/load round trip unchanged", () => {
  const { mind } = deepChain();
  const stored = toFirestoreMindMap(mind, { uid: "u1", productId: "7", moduleId: "m2", updatedAt: 1700000000000 });
  const restored = parseMindMap(stored);
  assert.deepEqual(restored.nodes, mind.nodes);
  assert.equal(restored.rootTopic, mind.rootTopic);
  assert.equal(stored.updatedAt, 1700000000000);
  assert.equal(stored.uid, "u1");
  assert.equal(stored.productId, "7");
  assert.equal(stored.moduleId, "m2");
});

test("the stored document contains no undefined values", () => {
  // An `undefined` field makes the Firestore client SDK throw and the whole
  // save silently fails, so the serialiser must never emit one.
  const stored = toFirestoreMindMap(withBranches(2));
  const seen = JSON.stringify(stored, (key, value) => {
    assert.notEqual(value, undefined, `field ${key} is undefined`);
    return value;
  });
  assert.ok(seen.length > 0);
  assert.equal(seen.includes("undefined"), false);
});

test("parseMindMap tolerates a missing, null or malformed document", () => {
  for (const raw of [null, undefined, 42, "nope", {}, { nodes: "not-an-array" }]) {
    const mind = parseMindMap(raw);
    assert.equal(isMindMap(mind), true, `recovered from ${JSON.stringify(raw)}`);
    assert.equal(mind.rootTopic, "Central idea");
  }
});

test("parseMindMap prunes nodes whose parent is missing", () => {
  const parsed = parseMindMap({
    rootTopic: "Root",
    nodes: [
      { id: "a", topic: "A", parentId: "ghost", side: "right" },
      { id: "b", topic: "B", parentId: "a", side: "right" },
      { id: "c", topic: "C", parentId: "root", side: "left" },
    ],
  });
  // `a` is orphaned, and `b` hangs off `a`, so both must disappear; `c` stays.
  assert.deepEqual(parsed.nodes.map((node) => node.id), ["c"]);
});

test("parseMindMap drops a node that claims to be the root", () => {
  const parsed = parseMindMap({
    rootTopic: "Real root",
    nodes: [{ id: "root", topic: "Impostor", parentId: null, side: null }],
  });
  assert.deepEqual(parsed.nodes, []);
  assert.equal(parsed.rootTopic, "Real root");
});

test("parseMindMap normalises sides and coerces the collapsed flag", () => {
  const parsed = parseMindMap({
    rootTopic: "Root",
    nodes: [
      { id: "a", topic: "A", parentId: "root", side: "sideways", collapsed: "yes" },
      { id: "b", topic: "B", parentId: "root", side: "left", collapsed: 0 },
    ],
  });
  const a = parsed.nodes.find((node) => node.id === "a");
  const b = parsed.nodes.find((node) => node.id === "b");
  assert.equal(a.side, null, "an unknown side is dropped");
  assert.equal(a.collapsed, true, "a truthy flag coerces to true");
  assert.equal(b.side, "left");
  assert.equal(b.collapsed, false);
});

test("parseMindMap strips control characters out of stored topics", () => {
  const parsed = parseMindMap({ rootTopic: "Ro\u0000ot", nodes: [{ id: "a", topic: "A\u0007B", parentId: "root" }] });
  assert.equal(parsed.rootTopic, "Root");
  assert.equal(parsed.nodes[0].topic, "AB");
});

test("parseMindMap caps the node list at the storage limit", () => {
  const nodes = Array.from({ length: MAX_MIND_MAP_NODES + 100 }, (_, i) => ({
    id: `n${i}`,
    topic: `N${i}`,
    parentId: "root",
    side: "right",
  }));
  assert.equal(parseMindMap({ rootTopic: "Root", nodes }).nodes.length, MAX_MIND_MAP_NODES);
});

test("allNodes surfaces the root alongside the stored children", () => {
  const mind = withBranches(2);
  const nodes = allNodes(mind);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].id, rootId());
  assert.equal(nodes[0].parentId, null);
  assert.equal(hasChildren(mind, rootId()), true);
  assert.equal(hasChildren(mind, nodes[1].id), false);
});
