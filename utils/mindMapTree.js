// utils/mindMapTree.js
//
// Mind Map feature — pure tree model + tidy-tree layout.
//
// NO Firestore, NO React, NO fetch. The Node test runner imports this file
// directly (`tests/mindMapTree.test.mjs`); the React editor imports the
// runtime through `utils/mindMapTree.d.ts`.
//
// ── Why this file exists ──────────────────────────────────────────────────
// The editor renders with React Flow (`@xyflow/react`), which is a free-form
// canvas: it moves nodes but never arranges them. A mind map needs the
// opposite contract — the learner taps a `+` on ANY node and a child appears,
// and the whole diagram re-flows so it stays readable. That arrangement is a
// tree layout, and keeping it here (pure + unit tested) means the layout is
// deterministic, testable in Node, and identical on every device.
//
// ── Model ─────────────────────────────────────────────────────────────────
// A mind map is a FLAT node list, not a nested object:
//
//   { version: 1, title, rootTopic, rootX, rootY, nodes: [{ id, topic, parentId, side, collapsed, fx, fy }] }
//
// Flat wins for Firestore: no nesting depth to trip the 20-level / 1 MB doc
// limits, and a single-node edit is a one-element array change rather than a
// deep clone of the whole tree. `parentId === null` marks the root.
//
// `side` is only meaningful on the root's direct children ("left" | "right").
// Deeper nodes inherit their branch's side, which is what keeps a classic
// two-sided mind map from tangling.
//
// `fx`/`fy` (and `rootX`/`rootY` for the centre) are MANUAL positions. When a
// node carries them the learner has dragged it there by hand and the tidy
// tree gives way: the node renders exactly at its stored spot and its
// descendants inherit the same offset so the branch stays glued together.
// Nodes without them keep riding the automatic layout.

/** Bumped when the stored shape changes so old docs can be migrated. */
export const MIND_MAP_VERSION = 1;

/** Hard stop so a runaway loop can never wedge Firestore with a huge doc. */
export const MAX_MIND_MAP_NODES = 600;

/** Topic text is capped so a doc stays far below Firestore's 1 MB limit. */
export const MAX_TOPIC_LENGTH = 400;

const ROOT_ID = "root";

// ── Construction ──────────────────────────────────────────────────────────

/** A brand-new mind map: just a root topic, no children yet. */
export const createMindMap = (rootTopic = "Central idea", title = "") => ({
  version: MIND_MAP_VERSION,
  title: sanitizeTitle(title),
  rootTopic: sanitizeTopic(rootTopic) || "Central idea",
  nodes: [],
});

/** True for anything shaped like a mind map (not necessarily valid). */
export const isMindMap = (value) =>
  Boolean(value) && typeof value === "object" && Array.isArray(value.nodes) && typeof value.rootTopic === "string";

/** Deterministic id: `n1`, `n2`, … always unused by the current node list. */
export const nextNodeId = (mind) => {
  const taken = new Set((mind?.nodes || []).map((node) => String(node.id)));
  let n = 1;
  while (taken.has(`n${n}`)) n += 1;
  return `n${n}`;
};

// ── Text sanitation ───────────────────────────────────────────────────────
// Node text is written straight into Firestore and rendered back into a DOM
// node, so it is clipped to a safe length and flattened to one line. This is
// the single choke point every mutation funnels through.

/** Strip control characters and collapse newlines into spaces. */
const flatten = (value) =>
  String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const sanitizeTopic = (value) => flatten(value).slice(0, MAX_TOPIC_LENGTH);

export const sanitizeTitle = (value) => flatten(value).slice(0, 120);

// ── Manual positions ──────────────────────────────────────────────────────
// The learner can drag any node anywhere. Those coordinates are written into
// Firestore, so they are coerced to a finite number, rounded to one decimal
// (keeps the doc small after hundreds of drops) and clamped — a wild fling
// must never wedge the document with Infinity / NaN, which the Firestore
// client rejects outright.

/** Furthest a node may sit from the origin, in flow coordinates. */
export const MAX_NODE_POSITION = 100000;

const sanitizePosition = (value) => {
  // `Number(null)` is 0, so an absent position must be caught before the
  // coercion — otherwise "never placed" would read as "pinned at origin".
  if (value == null) return null;
  const n = Math.round((Number(value) + Number.EPSILON) * 10) / 10;
  if (!Number.isFinite(n)) return null;
  return Math.max(-MAX_NODE_POSITION, Math.min(MAX_NODE_POSITION, n));
};

// ── Queries ───────────────────────────────────────────────────────────────

/** Every node record, root included, in a stable order. */
export const allNodes = (mind) => {
  const list = (mind?.nodes || []).filter((node) => node && node.id != null);
  return [{ id: ROOT_ID, topic: mind?.rootTopic || "", parentId: null, side: null, collapsed: false }, ...list];
};

export const findNode = (mind, id) => allNodes(mind).find((node) => String(node.id) === String(id)) || null;

export const rootId = () => ROOT_ID;

/** Direct children in creation order (the order the learner added them). */
export const childrenOf = (mind, id) =>
  (mind?.nodes || []).filter((node) => String(node.parentId) === String(id));

export const countNodes = (mind) => 1 + (mind?.nodes || []).length;

export const hasChildren = (mind, id) => childrenOf(mind, id).length > 0;

/** Deepest level reached — 0 for a root-only map. Drives the "levels" readout. */
export const maxDepth = (mind) => {
  let deepest = 0;
  const walk = (id, depth) => {
    for (const child of childrenOf(mind, id)) {
      deepest = Math.max(deepest, depth + 1);
      walk(child.id, depth + 1);
    }
  };
  walk(ROOT_ID, 0);
  return deepest;
};

/**
 * Every id in the subtree rooted at `id`, including `id` itself. Used to
 * delete a branch in one pass and to guard against re-parenting a node into
 * its own descendant (which would silently orphan the whole subtree).
 */
export const collectSubtreeIds = (mind, id) => {
  const out = [String(id)];
  const stack = [String(id)];
  while (stack.length) {
    const current = stack.pop();
    for (const child of childrenOf(mind, current)) {
      const childId = String(child.id);
      if (!out.includes(childId)) {
        out.push(childId);
        stack.push(childId);
      }
    }
  }
  return out;
};

// ── Mutations (all return a NEW mind map; the input is never mutated) ─────

/**
 * Add a child to ANY node — root included — which is exactly the "tap `+`,
 * a branch appears" interaction. Returns `{ mind, nodeId }` so the caller can
 * select the fresh node; `nodeId` is null when the map is already at capacity.
 */
export const addChildNode = (mind, parentId, topic = "New idea", options = {}) => {
  if (!isMindMap(mind)) return { mind, nodeId: null };
  if (countNodes(mind) >= MAX_MIND_MAP_NODES) return { mind, nodeId: null };
  const parent = findNode(mind, parentId);
  if (!parent) return { mind, nodeId: null };

  const clean = sanitizeTopic(topic) || "New idea";
  const nodeId = options.id ? String(options.id) : nextNodeId(mind);
  if (findNode(mind, nodeId)) return { mind, nodeId: null };

  // A root-level child takes an explicit side when given, otherwise the two
  // sides are balanced: the shorter side wins, ties go right. Balancing beats
  // plain alternation because deleting one branch would otherwise leave the
  // whole map lopsided.
  let side = null;
  if (String(parentId) === ROOT_ID) {
    const allowed = options.side === "left" || options.side === "right" ? options.side : null;
    if (allowed) side = allowed;
    else {
      const rights = childrenOf(mind, ROOT_ID).filter((node) => node.side !== "left").length;
      const lefts = childrenOf(mind, ROOT_ID).length - rights;
      side = lefts < rights ? "left" : "right";
    }
  }

  return {
    mind: {
      ...mind,
      nodes: [...mind.nodes, { id: nodeId, topic: clean, parentId: String(parentId), side, collapsed: false, fx: null, fy: null }],
    },
    nodeId,
  };
};

/** Add several siblings at once (used when pasting a list of ideas). */
export const addChildNodes = (mind, parentId, topics = []) => {
  let current = mind;
  const ids = [];
  for (const topic of topics) {
    const result = addChildNode(current, parentId, topic);
    if (!result.nodeId) break;
    current = result.mind;
    ids.push(result.nodeId);
  }
  return { mind: current, nodeIds: ids };
};

/** Rename a node. An empty string is rejected so nodes never render blank. */
export const setNodeTopic = (mind, id, topic) => {
  const clean = sanitizeTopic(topic);
  if (!clean) return mind;
  if (String(id) === ROOT_ID) return { ...mind, rootTopic: clean };
  return {
    ...mind,
    nodes: mind.nodes.map((node) =>
      String(node.id) === String(id) ? { ...node, topic: clean } : node,
    ),
  };
};

/** Rename the MAP itself (the name shown in the module's map list). */
export const setMindMapTitle = (mind, title) => {
  if (!isMindMap(mind)) return mind;
  const clean = sanitizeTitle(title);
  if (clean === sanitizeTitle(mind.title)) return mind;
  return { ...mind, title: clean };
};

/**
 * Delete a node AND its whole subtree. The root cannot be deleted — a mind map
 * without a centre is not a mind map, and every layout assumption starts there.
 */
export const removeNode = (mind, id) => {
  if (String(id) === ROOT_ID) return mind;
  if (!findNode(mind, id)) return mind;
  const doomed = new Set(collectSubtreeIds(mind, id));
  const nodes = mind.nodes.filter((node) => !doomed.has(String(node.id)));
  if (nodes.length === mind.nodes.length) return mind;
  return { ...mind, nodes };
};

/** Collapse hides a branch without deleting it — keeps wide maps readable. */
export const toggleCollapsed = (mind, id) => {
  if (String(id) === ROOT_ID) return mind;
  return {
    ...mind,
    nodes: mind.nodes.map((node) =>
      String(node.id) === String(id) ? { ...node, collapsed: !node.collapsed } : node,
    ),
  };
};

export const setCollapsed = (mind, id, collapsed) => {
  if (String(id) === ROOT_ID) return mind;
  return {
    ...mind,
    nodes: mind.nodes.map((node) =>
      String(node.id) === String(id) ? { ...node, collapsed: Boolean(collapsed) } : node,
    ),
  };
};

/** Force a root-level branch to one side (drag-to-flip in the editor). */
export const setBranchSide = (mind, id, side) => {
  if (side !== "left" && side !== "right") return mind;
  const node = findNode(mind, id);
  if (!node || String(node.parentId) !== ROOT_ID) return mind;
  return {
    ...mind,
    nodes: mind.nodes.map((item) =>
      String(item.id) === String(id) ? { ...item, side } : item,
    ),
  };
};

/**
 * Pin a node to a manual position — the drop point of a drag, in React
 * Flow's top-left coordinates. The root is pinned through `rootX`/`rootY`
 * on the map itself because it is not part of the node list. Non-finite
 * coordinates are refused outright; finite ones are rounded and clamped.
 *
 * Only the DRAGGED node records a position. Its descendants follow it in the
 * layout (they inherit the same offset), which keeps the stored doc small and
 * means deleting one stale pin can never desync a whole subtree.
 */
export const setNodePosition = (mind, id, x, y) => {
  if (!isMindMap(mind)) return mind;
  const nx = sanitizePosition(x);
  const ny = sanitizePosition(y);
  if (nx == null || ny == null) return mind;
  if (String(id) === ROOT_ID) {
    if (mind.rootX === nx && mind.rootY === ny) return mind;
    return { ...mind, rootX: nx, rootY: ny };
  }
  if (!findNode(mind, id)) return mind;
  return {
    ...mind,
    nodes: mind.nodes.map((node) =>
      String(node.id) === String(id) ? { ...node, fx: nx, fy: ny } : node,
    ),
  };
};

/**
 * Commit a finished drag as ONE RIGID GROUP.
 *
 * A drag is visually a group motion: the picked node and every connected
 * node beneath it slide together. The drop must keep that promise. This
 * function pins the picked node at the drop point AND translates every
 * descendant that already carries its own hand-dragged pin by the exact
 * same delta — otherwise a previously hand-arranged branch snaps back to
 * its old spot the moment the head (or the map's primary node) is
 * re-placed, which reads as "the connected nodes did not move together".
 *
 * `fromX/fromY` is where the picked node STARTED (its rendered layout spot
 * at pointer-down). It has to be passed in because an unpinned node has no
 * stored position to read the delta back from.
 *
 * Descendants WITHOUT a pin need no storage at all: `layoutMindMap`
 * already inherits their ancestor's shift, so they keep riding the tree
 * relative to the moved head.
 *
 * A sub-pixel / zero-movement event (a plain tap) is refused outright, so
 * tapping a node can never silently freeze it at its current spot.
 */
export const moveNodeSubtree = (mind, id, x, y, fromX, fromY) => {
  if (!isMindMap(mind)) return mind;
  const nx = sanitizePosition(x);
  const ny = sanitizePosition(y);
  const sx = Number(fromX);
  const sy = Number(fromY);
  if (nx == null || ny == null || !Number.isFinite(sx) || !Number.isFinite(sy)) return mind;
  if (!findNode(mind, id)) return mind;
  const dx = nx - sx;
  const dy = ny - sy;
  if (dx === 0 && dy === 0) return mind;

  const subtree = new Set(collectSubtreeIds(mind, id));
  const translatePin = (value, delta) =>
    value == null ? value : sanitizePosition(Number(value) + delta);

  const nodes = mind.nodes.map((node) => {
    const nodeId = String(node.id);
    // The picked node itself stores the exact drop point.
    if (String(id) !== ROOT_ID && nodeId === String(id)) {
      return { ...node, fx: nx, fy: ny };
    }
    if (!subtree.has(nodeId)) return node;
    // A pinned descendant moves with its head: shift its stored pin by the
    // same delta so the hand-arranged shape travels intact.
    if (node.fx == null || node.fy == null) return node;
    return { ...node, fx: translatePin(node.fx, dx), fy: translatePin(node.fy, dy) };
  });

  if (String(id) === ROOT_ID) {
    return { ...mind, rootX: nx, rootY: ny, nodes };
  }
  return { ...mind, nodes };
};

/**
 * Re-parent a branch under a new parent. Refuses moves that would create a
 * cycle (dropping a node inside its own subtree) and refuses to exceed the
 * node cap — both would otherwise corrupt the stored map.
 */
export const moveNode = (mind, id, newParentId) => {
  const source = findNode(mind, id);
  const target = findNode(mind, newParentId);
  if (!source || !target) return mind;
  if (String(id) === ROOT_ID) return mind;
  if (String(source.parentId) === String(newParentId)) return mind;
  if (collectSubtreeIds(mind, id).includes(String(newParentId))) return mind;

  const side = String(newParentId) === ROOT_ID ? source.side || "right" : null;
  return {
    ...mind,
    nodes: mind.nodes.map((node) =>
      String(node.id) === String(id) ? { ...node, parentId: String(newParentId), side } : node,
    ),
  };
};

// ── Measurement ───────────────────────────────────────────────────────────
// Node boxes must be sized BEFORE they are rendered, because the layout needs
// their width to place siblings. A DOM measurement would need a second render
// pass and would differ per device, so text width is estimated from the font
// metrics. The constant below is tuned for the 13px/600-weight label the
// editor draws; it is intentionally an estimate, not a substitute for a real
// text engine.

export const DEFAULT_MEASURE = Object.freeze({
  fontSize: 13,
  /** Average advance width of a character, as a fraction of the font size. */
  charWidthRatio: 0.55,
  paddingX: 20,
  paddingY: 14,
  lineHeight: 17,
  minWidth: 56,
  maxWidth: 190,
});

/**
 * Width/height/line count for one topic string. Wrapping is greedy by word,
 * which matches how the browser will lay the same text out closely enough for
 * layout purposes.
 */
export const measureTopic = (topic, measure = {}) => {
  const m = { ...DEFAULT_MEASURE, ...measure };
  const text = flatten(topic) || "Idea";
  const charWidth = m.fontSize * m.charWidthRatio;
  const innerMax = Math.max(m.minWidth, m.maxWidth) - m.paddingX * 2;

  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length * charWidth <= innerMax || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  const longest = lines.reduce((widest, value) => Math.max(widest, value.length), 0);
  const width = Math.max(m.minWidth, Math.ceil(longest * charWidth) + m.paddingX * 2);
  const height = m.paddingY * 2 + lines.length * m.lineHeight;
  return { width, height, lines: lines.length };
};

// ── Tidy-tree layout ──────────────────────────────────────────────────────

export const DEFAULT_LAYOUT = Object.freeze({
  /** Horizontal gap between a parent's edge and its child's edge. */
  hGap: 44,
  /** Vertical gap between two sibling subtrees. */
  vGap: 14,
  /** Minimum height for every box, so short labels still look like nodes. */
  minNodeHeight: 38,
});

/**
 * Arrange a mind map as a classic two-sided tidy tree.
 *
 * Returns React Flow-ready records: `x`/`y` are the box's TOP-LEFT corner
 * (React Flow's own convention), `width`/`height` are the measured box, and
 * `edges` carries the parent→child links. The root sits at x-centre 0 with
 * its right branches to the east and left branches to the west.
 *
 * Collapsed branches are treated as leaves: their hidden descendants are
 * omitted from both the node list and the vertical extent, which is what makes
 * collapsing actually reclaim screen space.
 *
 * MANUAL positions override the tidy tree: a node the learner dragged by hand
 * renders exactly at its stored spot (marked `manual: true`), and every
 * descendant inherits the same offset so a branch never tears itself apart
 * when its head is re-placed. Nodes without a manual position keep riding the
 * automatic layout relative to their (possibly moved) ancestors.
 */
export const layoutMindMap = (mind, options = {}) => {
  const layout = { ...DEFAULT_LAYOUT, ...options };
  const measure = options.measure || {};
  if (!isMindMap(mind)) return { nodes: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 } };

  const boxes = new Map();
  const sizeOf = (node) => {
    if (!boxes.has(node.id)) {
      const box = measureTopic(node.topic, measure);
      boxes.set(node.id, { width: box.width, height: Math.max(layout.minNodeHeight, box.height) });
    }
    return boxes.get(node.id);
  };

  const visibleChildren = (id) => childrenOf(mind, id);
  const isCollapsed = (id) => String(id) !== ROOT_ID && Boolean(findNode(mind, id)?.collapsed);

  // The manual spot for one node, or null when it still rides the auto tree.
  // The root's position lives on the map itself (rootX/rootY), everyone
  // else's on their own record (fx/fy). `Number(null)` is 0, so null has to
  // be excluded explicitly — otherwise every freshly added node would be
  // "pinned" at the origin.
  const manualOf = (node, depth) => {
    if (depth === 0) {
      if (mind.rootX == null || mind.rootY == null) return null;
      const rx = Number(mind.rootX);
      const ry = Number(mind.rootY);
      return Number.isFinite(rx) && Number.isFinite(ry) ? { x: rx, y: ry } : null;
    }
    if (node.fx == null || node.fy == null) return null;
    const fx = Number(node.fx);
    const fy = Number(node.fy);
    return Number.isFinite(fx) && Number.isFinite(fy) ? { x: fx, y: fy } : null;
  };

  const spanOf = (node) => {
    if (isCollapsed(node.id)) return sizeOf(node).height;
    const kids = visibleChildren(node.id);
    if (!kids.length) return sizeOf(node).height;
    const total = kids.reduce((sum, kid) => sum + spanOf(kid), 0) + layout.vGap * (kids.length - 1);
    return Math.max(sizeOf(node).height, total);
  };

  const nodes = [];
  const edges = [];

  // `shiftX/shiftY` is the accumulated manual offset inherited from ancestors;
  // children of a hand-placed node are placed relative to its PURE auto spot
  // plus that shift, so the branch moves as one rigid group.
  const place = (node, side, top, depth, parentX, parentWidth, shiftX, shiftY) => {
    const span = spanOf(node);
    const { width, height } = sizeOf(node);
    const centerY = top + span / 2;

    const autoY = centerY - height / 2;
    let autoX;
    let branchSide = side;
    if (depth === 0) {
      autoX = -width / 2;
      branchSide = null;
    } else if (side === "left") {
      autoX = parentX - layout.hGap - width;
    } else {
      autoX = parentX + parentWidth + layout.hGap;
    }

    const manual = manualOf(node, depth);
    const x = manual ? manual.x : autoX + shiftX;
    const y = manual ? manual.y : autoY + shiftY;
    const nextShiftX = x - autoX;
    const nextShiftY = y - autoY;

    nodes.push({
      id: String(node.id),
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      width,
      height,
      depth,
      side: branchSide,
      collapsed: isCollapsed(node.id),
      childCount: visibleChildren(node.id).length,
      isRoot: depth === 0,
      manual: Boolean(manual),
    });

    const kids = isCollapsed(node.id) ? [] : visibleChildren(node.id);
    if (!kids.length) return;

    const totalKids = kids.reduce((sum, kid) => sum + spanOf(kid), 0) + layout.vGap * (kids.length - 1);
    let cursor = centerY - totalKids / 2;
    for (const kid of kids) {
      edges.push({ id: `e-${node.id}-${kid.id}`, source: String(node.id), target: String(kid.id), side });
      const kidSide = depth === 0 ? (kid.side === "left" ? "left" : "right") : side;
      place(kid, kidSide, cursor, depth + 1, autoX, width, nextShiftX, nextShiftY);
      cursor += spanOf(kid) + layout.vGap;
    }
  };

  const rootNode = { id: ROOT_ID, topic: mind.rootTopic || "" };
  const rootSpan = spanOf(rootNode);
  place(rootNode, "right", -rootSpan / 2, 0, 0, 0, 0, 0);

  const bounds = nodes.reduce(
    (box, node) => ({
      minX: Math.min(box.minX, node.x),
      minY: Math.min(box.minY, node.y),
      maxX: Math.max(box.maxX, node.x + node.width),
      maxY: Math.max(box.maxY, node.y + node.height),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  if (!nodes.length) return { nodes: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 } };

  return {
    nodes,
    edges,
    bounds: {
      ...bounds,
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    },
  };
};

// ── One-click auto arrange ────────────────────────────────────────────────
//
// Hand dragging is what makes a map messy: every dropped node stores an
// `fx`/`fy` (and the centre stores `rootX`/`rootY`) that OVERRIDES the tidy
// tree, so a map dragged around for ten minutes ends up with overlapping
// boxes and crossing ropes. Clearing every manual pin hands the whole diagram
// back to the deterministic tidy-tree layout in `layoutMindMap` — that is the
// entire "ek click me sab organise" behaviour, and it is pure so it can be
// unit tested without a canvas.
//
// While we are re-organising we also REBALANCE the root's branches: a map
// where every branch drifted to one side reads badly even after the pins are
// gone. Branch weight (how many nodes hang off it) is distributed greedily
// between left and right so both wings end up roughly equal, and creation
// order inside each wing is preserved so nothing appears to jump about.

/** Nodes in the subtree rooted at `id`, `id` itself included. */
const subtreeWeight = (mind, id) => collectSubtreeIds(mind, id).length;

/**
 * Re-balance the root's direct children between the two sides. Deeper nodes
 * carry `side: null` and inherit their branch's side, so only the first ring
 * is ever touched.
 */
export const rebalanceBranchSides = (mind) => {
  if (!isMindMap(mind)) return mind;
  const roots = childrenOf(mind, ROOT_ID);
  if (roots.length === 0) return mind;

  const sideById = new Map();
  let leftLoad = 0;
  let rightLoad = 0;
  for (const child of roots) {
    const weight = subtreeWeight(mind, child.id);
    // Ties go right, which matches how `addChildNode` seeds a brand-new map.
    const side = leftLoad < rightLoad ? "left" : "right";
    if (side === "left") leftLoad += weight;
    else rightLoad += weight;
    sideById.set(String(child.id), side);
  }

  // A map whose wings are already balanced comes back byte-identical, so
  // "arrange" on a tidy map is a genuine no-op and never triggers a save.
  let changed = false;
  const nodes = mind.nodes.map((node) => {
    const side = sideById.get(String(node.id));
    if (!side || node.side === side) return node;
    changed = true;
    return { ...node, side };
  });
  return changed ? { ...mind, nodes } : mind;
};

/**
 * ONE-CLICK CLEAN-UP. Drops every hand-placed position (nodes + centre) and
 * re-balances the two wings, so however badly a map was dragged around it
 * snaps back to a readable tidy tree. Returns a NEW map; the input is never
 * mutated, and a map that was already tidy comes back untouched.
 */
export const autoArrangeMindMap = (mind) => {
  if (!isMindMap(mind)) return mind;
  // An already-tidy map is returned untouched (same reference), so the
  // button cannot spend a Firestore write on a map with nothing to fix.
  const cleared = hasManualPositions(mind)
    ? {
        ...mind,
        rootX: null,
        rootY: null,
        nodes: mind.nodes.map((node) =>
          node.fx == null && node.fy == null ? node : { ...node, fx: null, fy: null },
        ),
      }
    : mind;
  return rebalanceBranchSides(cleared);
};

/** True when at least one node (or the centre) still carries a manual pin. */
export const hasManualPositions = (mind) => {
  if (!isMindMap(mind)) return false;
  if (mind.rootX != null && mind.rootY != null) return true;
  return (mind.nodes || []).some((node) => node.fx != null || node.fy != null);
};

// ── Multiple maps per module ──────────────────────────────────────────────
//
// Notes are a LIST — the learner writes as many as they like — and the mind
// map now works the same way: one module can hold several separate diagrams
// ("Chapter summary", "Formula sheet", …). Each diagram is its own Firestore
// document, keyed by a short map key that is appended to the existing
// composite id.
//
// The first map keeps the LEGACY id (`{uid}__{productId}__{moduleId}`) so
// every map drawn before this feature shipped stays exactly where it is —
// that map's key is `main`.

/** Key of the first / legacy map in a module. */
export const MIND_MAP_DEFAULT_KEY = "main";

/** Safety cap so one module cannot spawn an unbounded pile of documents. */
export const MAX_MAPS_PER_MODULE = 30;

/**
 * Map keys land inside a Firestore document id, so they are restricted to
 * lowercase alphanumerics and dashes. Anything else is stripped rather than
 * rejected, because the key is generated, never typed by the learner.
 */
export const sanitizeMapKey = (value) => {
  const clean = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
  return clean || MIND_MAP_DEFAULT_KEY;
};

/**
 * A fresh key that no existing map in this module uses. Time-based so the
 * natural sort matches creation order, with a random tail so two devices
 * creating a map in the same millisecond cannot collide.
 */
export const createMapKey = (takenKeys = []) => {
  const taken = new Set((takenKeys || []).map((key) => sanitizeMapKey(key)));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const key = sanitizeMapKey(
      `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${attempt ? attempt : ""}`,
    );
    if (key !== MIND_MAP_DEFAULT_KEY && !taken.has(key)) return key;
  }
  return sanitizeMapKey(`m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
};

/** The name shown in the map list — the given title, else the centre topic. */
export const mindMapDisplayTitle = (mind, fallback = "Untitled map") =>
  sanitizeTitle(mind?.title) || sanitizeTopic(mind?.rootTopic) || fallback;

// ── Firestore persistence ─────────────────────────────────────────────────

/**
 * Document id for ONE of a learner's maps inside one course module. Scoping
 * by uid + product + module means two students never share a doc and each
 * module keeps its own diagrams; the optional 4th segment is the map key, so
 * a module can hold several maps side by side.
 *
 * The default key (`main`) deliberately produces the ORIGINAL three-part id,
 * so every map saved before multi-map support keeps its document.
 * Firestore ids may not contain `/`, so separators are fixed.
 */
export const mindMapDocId = (uid, productId, moduleId, mapKey = MIND_MAP_DEFAULT_KEY) => {
  const base = `${String(uid).trim()}__${String(productId).trim()}__${String(moduleId).trim()}`;
  const key = sanitizeMapKey(mapKey);
  return key === MIND_MAP_DEFAULT_KEY ? base : `${base}__${key}`;
};

/**
 * Parse whatever Firestore returned into a valid mind map, tolerating the
 * shapes an older or hand-edited doc might have. Never throws — a corrupt doc
 * falls back to an empty map rather than blanking the editor.
 */
export const parseMindMap = (raw) => {
  if (!raw || typeof raw !== "object") return createMindMap();
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes
        .filter((node) => node && node.id != null && String(node.id) !== ROOT_ID)
        .slice(0, MAX_MIND_MAP_NODES)
        .map((node) => {
          // A hand-placed node keeps its spot; anything unreadable is dropped
          // and the node quietly returns to the automatic layout. A position
          // only counts when BOTH halves exist — a lone half is junk the
          // layout would ignore anyway, so the pair is cleared entirely.
          const fx = sanitizePosition(node.fx);
          const fy = sanitizePosition(node.fy);
          const paired = fx != null && fy != null;
          return {
            id: String(node.id),
            topic: sanitizeTopic(node.topic) || "Idea",
            parentId: node.parentId == null ? ROOT_ID : String(node.parentId),
            side: node.side === "left" ? "left" : node.side === "right" ? "right" : null,
            collapsed: Boolean(node.collapsed),
            fx: paired ? fx : null,
            fy: paired ? fy : null,
          };
        })
    : [];

  // Drop nodes whose parent vanished, walking outward from the root so a whole
  // orphaned branch disappears instead of floating unattached.
  const reachable = new Set([ROOT_ID]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (!reachable.has(node.id) && reachable.has(node.parentId)) {
        reachable.add(node.id);
        grew = true;
      }
    }
  }

  // Pair the root position the same way as node positions — a lone half is
  // dropped so the centre quietly returns to x-centre zero.
  const rootX = sanitizePosition(raw.rootX);
  const rootY = sanitizePosition(raw.rootY);
  const rootPlaced = rootX != null && rootY != null;

  return {
    version: MIND_MAP_VERSION,
    title: sanitizeTitle(raw.title),
    rootTopic: sanitizeTopic(raw.rootTopic) || "Central idea",
    rootX: rootPlaced ? rootX : null,
    rootY: rootPlaced ? rootY : null,
    nodes: nodes.filter((node) => reachable.has(node.id)),
  };
};

/**
 * The exact object handed to `setDoc`. Returns only Firestore-safe primitives
 * (no `undefined`, no functions, no Date), because an `undefined` field makes
 * the client SDK throw and silently lose the whole save.
 */
export const toFirestoreMindMap = (mind, meta = {}) => {
  const safe = parseMindMap(mind);
  return {
    version: MIND_MAP_VERSION,
    title: safe.title,
    rootTopic: safe.rootTopic,
    // Manual positions ride along so a hand-arranged map looks the same on
    // every device. `null` (auto-placed) is a Firestore-safe value.
    rootX: safe.rootX,
    rootY: safe.rootY,
    nodes: safe.nodes.map((node) => ({
      id: node.id,
      topic: node.topic,
      parentId: node.parentId,
      side: node.side,
      collapsed: node.collapsed,
      fx: node.fx,
      fy: node.fy,
    })),
    nodeCount: safe.nodes.length + 1,
    updatedAt: typeof meta.updatedAt === "number" ? meta.updatedAt : Date.now(),
    uid: meta.uid == null ? null : String(meta.uid),
    productId: meta.productId == null ? null : String(meta.productId),
    moduleId: meta.moduleId == null ? null : String(meta.moduleId),
    // Which of the module's maps this document is. Always written (never
    // undefined) so the security rules can tie the document id to the key —
    // a legacy three-part id is the `main` map.
    mapKey: sanitizeMapKey(meta.mapKey),
  };
};
