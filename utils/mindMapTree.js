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
//   { version: 1, title, rootTopic, nodes: [{ id, topic, parentId, side, collapsed }] }
//
// Flat wins for Firestore: no nesting depth to trip the 20-level / 1 MB doc
// limits, and a single-node edit is a one-element array change rather than a
// deep clone of the whole tree. `parentId === null` marks the root.
//
// `side` is only meaningful on the root's direct children ("left" | "right").
// Deeper nodes inherit their branch's side, which is what keeps a classic
// two-sided mind map from tangling.

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
      nodes: [...mind.nodes, { id: nodeId, topic: clean, parentId: String(parentId), side, collapsed: false }],
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

  const spanOf = (node) => {
    if (isCollapsed(node.id)) return sizeOf(node).height;
    const kids = visibleChildren(node.id);
    if (!kids.length) return sizeOf(node).height;
    const total = kids.reduce((sum, kid) => sum + spanOf(kid), 0) + layout.vGap * (kids.length - 1);
    return Math.max(sizeOf(node).height, total);
  };

  const nodes = [];
  const edges = [];

  const place = (node, side, top, depth, parentX, parentWidth) => {
    const span = spanOf(node);
    const { width, height } = sizeOf(node);
    const centerY = top + span / 2;
    const y = centerY - height / 2;

    let x;
    let branchSide = side;
    if (depth === 0) {
      x = -width / 2;
      branchSide = null;
    } else if (side === "left") {
      x = parentX - layout.hGap - width;
    } else {
      x = parentX + parentWidth + layout.hGap;
    }

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
    });

    const kids = isCollapsed(node.id) ? [] : visibleChildren(node.id);
    if (!kids.length) return;

    const totalKids = kids.reduce((sum, kid) => sum + spanOf(kid), 0) + layout.vGap * (kids.length - 1);
    let cursor = centerY - totalKids / 2;
    for (const kid of kids) {
      edges.push({ id: `e-${node.id}-${kid.id}`, source: String(node.id), target: String(kid.id), side });
      const kidSide = depth === 0 ? (kid.side === "left" ? "left" : "right") : side;
      place(kid, kidSide, cursor, depth + 1, x, width);
      cursor += spanOf(kid) + layout.vGap;
    }
  };

  const rootNode = { id: ROOT_ID, topic: mind.rootTopic || "" };
  const rootSpan = spanOf(rootNode);
  place(rootNode, "right", -rootSpan / 2, 0, 0, 0);

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

// ── Firestore persistence ─────────────────────────────────────────────────

/**
 * Document id for one learner's map inside one course module. Scoping by all
 * three means two students never share a doc, and the same student gets a
 * separate map per module — which is what "kisi bhi active module ke saath"
 * needs. Firestore ids may not contain `/`, so separators are fixed.
 */
export const mindMapDocId = (uid, productId, moduleId) =>
  `${String(uid).trim()}__${String(productId).trim()}__${String(moduleId).trim()}`;

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
        .map((node) => ({
          id: String(node.id),
          topic: sanitizeTopic(node.topic) || "Idea",
          parentId: node.parentId == null ? ROOT_ID : String(node.parentId),
          side: node.side === "left" ? "left" : node.side === "right" ? "right" : null,
          collapsed: Boolean(node.collapsed),
        }))
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

  return {
    version: MIND_MAP_VERSION,
    title: sanitizeTitle(raw.title),
    rootTopic: sanitizeTopic(raw.rootTopic) || "Central idea",
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
    nodes: safe.nodes.map((node) => ({
      id: node.id,
      topic: node.topic,
      parentId: node.parentId,
      side: node.side,
      collapsed: node.collapsed,
    })),
    nodeCount: safe.nodes.length + 1,
    updatedAt: typeof meta.updatedAt === "number" ? meta.updatedAt : Date.now(),
    uid: meta.uid == null ? null : String(meta.uid),
    productId: meta.productId == null ? null : String(meta.productId),
    moduleId: meta.moduleId == null ? null : String(meta.moduleId),
  };
};
