// utils/mindMapImport.js
//
// ONE source of truth for AI-generated mind map JSON. Used by:
//   • Admin Product Builder → Mind Map resource (Copy/Paste + Validate + Save)
//   • Course Player → Mind Map Editor → "AI / JSON" import
//   • Product save/mapping (stored `mindMapData` is re-checked on load)
//
// It validates the RAW input against the same schema the importer already
// reads (`parseMindMap` in mindMapTree.js) and only then produces the
// canonical MindMap via that parser. It never invents a second schema.
//
// Pure JS: no React, no Firestore, no fetch. Node tests import it directly.

import {
  MIND_MAP_VERSION,
  MAX_MIND_MAP_NODES,
  MAX_TOPIC_LENGTH,
  maxDepth,
  parseMindMap,
  rootId,
} from "./mindMapTree.js";

export const MIND_MAP_TITLE_MAX = 120;

const KNOWN_TOP_LEVEL_KEYS = new Set(["version", "title", "rootTopic", "rootX", "rootY", "rootStyle", "nodes"]);
const KNOWN_NODE_KEYS = new Set(["id", "topic", "parentId", "side", "collapsed", "fx", "fy", "style"]);

const issue = (path, message) => ({ path, message });

/**
 * The generation prompt shown to admins and learners. Kept as the single
 * export so both editors show the exact same command.
 */
export const buildMindMapAiPrompt = () => {
  const ROOT = rootId();
  return `Generate a valid mind map data structure for a Digitalcatalyst course.

REQUIREMENTS:
- Output ONLY a valid JSON object, no explanations, no markdown, no extra text
- The JSON must match this exact schema:

{
  "version": ${MIND_MAP_VERSION},
  "title": "string (optional, max ${MIND_MAP_TITLE_MAX} chars)",
  "rootTopic": "string (required, max ${MAX_TOPIC_LENGTH} chars) - the central idea",
  "nodes": [
    {
      "id": "string (required, unique, cannot be '${ROOT}')",
      "topic": "string (required, max ${MAX_TOPIC_LENGTH} chars)",
      "parentId": "string or null (required, use '${ROOT}' for root children, null for root)",
      "side": "left" | "right" | null (optional, only for direct root children)",
      "collapsed": boolean (optional, default false),
      "fx": number | null (optional, manual x position),
      "fy": number | null (optional, manual y position)
    }
  ]
}

CONSTRAINTS:
- Maximum ${MAX_MIND_MAP_NODES} total nodes (including root)
- Maximum ${MAX_TOPIC_LENGTH} characters per topic
- All node IDs must be unique strings
- parentId must reference an existing node or '${ROOT}' for root children
- No circular references allowed
- Root node is implied by rootTopic, don't include it in nodes array
- Use meaningful, educational topics for a course mind map

EXAMPLE OUTPUT:
{
  "version": ${MIND_MAP_VERSION},
  "title": "Mathematics Fundamentals",
  "rootTopic": "Mathematics",
  "nodes": [
    {"id": "n1", "topic": "Algebra", "parentId": "${ROOT}", "side": "right"},
    {"id": "n2", "topic": "Geometry", "parentId": "${ROOT}", "side": "left"},
    {"id": "n3", "topic": "Equations", "parentId": "n1"},
    {"id": "n4", "topic": "Shapes", "parentId": "n2"}
  ]
}`;
};

export const MIND_MAP_AI_PROMPT = buildMindMapAiPrompt();

const fail = (errors, warnings = []) => ({ valid: false, errors, warnings, mindMap: null, stats: null });

/**
 * Validate an already-parsed object against the mind map schema.
 * Every problem is reported with a JSON-style path (e.g. `nodes[3].parentId`)
 * so the author can find it. On success `mindMap` is the canonical value.
 */
export const validateMindMapObject = (raw) => {
  const ROOT = rootId();
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail([issue("$", "The top level must be a JSON object: { \"rootTopic\": …, \"nodes\": [ … ] }.")]);
  }

  if (raw.version !== undefined && raw.version !== MIND_MAP_VERSION) {
    warnings.push(issue("version", `Version ${JSON.stringify(raw.version)} is read as version ${MIND_MAP_VERSION}.`));
  }

  if (raw.title !== undefined && raw.title !== null) {
    if (typeof raw.title !== "string") errors.push(issue("title", "Must be a text string."));
    else if (raw.title.length > MIND_MAP_TITLE_MAX) {
      warnings.push(issue("title", `Longer than ${MIND_MAP_TITLE_MAX} characters — it will be shortened.`));
    }
  }

  if (typeof raw.rootTopic !== "string") {
    errors.push(issue("rootTopic", "Required: the central idea as a text string."));
  } else if (!raw.rootTopic.trim()) {
    errors.push(issue("rootTopic", "Must not be empty."));
  } else if (raw.rootTopic.length > MAX_TOPIC_LENGTH) {
    errors.push(issue("rootTopic", `Must be at most ${MAX_TOPIC_LENGTH} characters (found ${raw.rootTopic.length}).`));
  }

  if (!Array.isArray(raw.nodes)) {
    errors.push(issue("nodes", "Required: an array of node objects (use [] for a map with only a root)."));
  } else if (raw.nodes.length + 1 > MAX_MIND_MAP_NODES) {
    errors.push(issue("nodes", `Too many nodes: ${raw.nodes.length + 1} including the root; the maximum is ${MAX_MIND_MAP_NODES}.`));
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) warnings.push(issue(key, "Unknown field — it will be ignored."));
  }

  if (!Array.isArray(raw.nodes) || raw.nodes.length + 1 > MAX_MIND_MAP_NODES) return fail(errors, warnings);

  // ── Per-node checks ────────────────────────────────────────────────────
  const idIndex = new Map();
  raw.nodes.forEach((node, index) => {
    const at = `nodes[${index}]`;
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      errors.push(issue(at, "Each node must be an object like { \"id\": \"n1\", \"topic\": \"…\", \"parentId\": \"root\" }."));
      return;
    }

    if (typeof node.id !== "string" || !node.id.trim()) {
      errors.push(issue(`${at}.id`, "Required: a unique, non-empty text id."));
    } else if (node.id === ROOT) {
      errors.push(issue(`${at}.id`, `"${ROOT}" is reserved for the root — choose another id.`));
    } else if (idIndex.has(node.id)) {
      errors.push(issue(`${at}.id`, `Duplicate id "${node.id}" (already used by nodes[${idIndex.get(node.id)}]).`));
    } else {
      idIndex.set(node.id, index);
    }

    if (typeof node.topic !== "string" || !node.topic.trim()) {
      errors.push(issue(`${at}.topic`, "Required: the node text as a non-empty string."));
    } else if (node.topic.length > MAX_TOPIC_LENGTH) {
      errors.push(issue(`${at}.topic`, `Must be at most ${MAX_TOPIC_LENGTH} characters (found ${node.topic.length}).`));
    }

    if (node.parentId !== undefined && node.parentId !== null && typeof node.parentId !== "string") {
      errors.push(issue(`${at}.parentId`, "Must be the id of another node, \"" + ROOT + "\", or null."));
    }

    if (node.side !== undefined && node.side !== null && node.side !== "left" && node.side !== "right") {
      errors.push(issue(`${at}.side`, "Must be \"left\", \"right\" or null."));
    }

    if (node.collapsed !== undefined && typeof node.collapsed !== "boolean") {
      errors.push(issue(`${at}.collapsed`, "Must be true or false."));
    }

    for (const axis of ["fx", "fy"]) {
      const value = node[axis];
      if (value !== undefined && value !== null && !(typeof value === "number" && Number.isFinite(value))) {
        errors.push(issue(`${at}.${axis}`, "Must be a number or null."));
      }
    }
    const hasFx = node.fx !== undefined && node.fx !== null;
    const hasFy = node.fy !== undefined && node.fy !== null;
    if (hasFx !== hasFy) warnings.push(issue(at, "Only one of fx / fy is set — the position is ignored and the node uses automatic layout."));

    for (const key of Object.keys(node)) {
      if (!KNOWN_NODE_KEYS.has(key)) warnings.push(issue(`${at}.${key}`, "Unknown field — it will be ignored."));
    }
  });

  if (errors.length > 0) return fail(errors, warnings);

  // ── Parent references, then reachability (cycles / orphans) ───────────
  const parentOf = (node) => (node.parentId === undefined || node.parentId === null ? ROOT : node.parentId);
  raw.nodes.forEach((node, index) => {
    const parent = parentOf(node);
    if (parent !== ROOT && !idIndex.has(parent)) {
      errors.push(issue(`nodes[${index}].parentId`, `Parent "${parent}" does not match any node id.`));
    }
  });
  if (errors.length > 0) return fail(errors, warnings);

  const childrenByParent = new Map();
  raw.nodes.forEach((node) => {
    const parent = parentOf(node);
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(node.id);
  });
  const reached = new Set();
  const queue = [ROOT];
  while (queue.length) {
    const current = queue.shift();
    for (const child of childrenByParent.get(current) || []) {
      if (reached.has(child)) continue;
      reached.add(child);
      queue.push(child);
    }
  }
  raw.nodes.forEach((node, index) => {
    if (!reached.has(node.id)) {
      errors.push(issue(`nodes[${index}]`, `"${node.topic}" is not connected to the root — its parentId chain loops or never reaches "${ROOT}".`));
    }
  });
  if (errors.length > 0) return fail(errors, warnings);

  // ── Canonical value via the existing importer ─────────────────────────
  const mindMap = parseMindMap(raw);
  return {
    valid: true,
    errors: [],
    warnings,
    mindMap,
    stats: {
      nodes: mindMap.nodes.length + 1,
      topLevel: (childrenByParent.get(ROOT) || []).length,
      depth: maxDepth(mindMap),
    },
  };
};

/**
 * Validate pasted text (AI output or a saved file). Strips a ``` code fence
 * if the model added one, then JSON-parses and validates.
 */
export const validateMindMapJson = (text) => {
  if (typeof text !== "string" || !text.trim()) {
    return fail([issue("$", "The JSON box is empty — paste the mind map JSON first.")]);
  }

  let body = text.trim();
  const warnings = [];
  if (body.startsWith("```")) {
    body = body.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "").trim();
    warnings.push(issue("$", "A markdown code fence (```) was removed before reading the JSON."));
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "syntax error";
    const hint = /[“”‘’]/.test(body)
      ? " Smart quotes (“ ” ‘ ’) were found — replace them with straight quotes (\")."
      : "";
    return fail([issue("$", `Not valid JSON: ${reason}.${hint}`)], warnings);
  }

  const result = validateMindMapObject(parsed);
  return { ...result, warnings: [...warnings, ...result.warnings] };
};

/** Short human summary, e.g. "12 nodes · 3 top-level branches · depth 3". */
export const describeMindMapStats = (stats) => {
  if (!stats) return "";
  const nodes = `${stats.nodes} node${stats.nodes === 1 ? "" : "s"}`;
  const branches = `${stats.topLevel} top-level branch${stats.topLevel === 1 ? "" : "es"}`;
  return `${nodes} · ${branches} · depth ${stats.depth}`;
};

/** Format one issue for display: "nodes[2].topic: Required …". */
export const formatMindMapIssue = (entry) => `${entry.path}: ${entry.message}`;
