// tests/mindMapNodeStyle.test.mjs
//
// Contract for per-node colour overrides in `utils/mindMapTree.js`:
//   • only explicitly chosen colours are stored (box `bg`, `text`, branch `edge`)
//   • a reset removes the keys, so the node falls back to the theme default
//   • old maps (no `style`) load and save exactly as before
//   • a colour change touches ONE node or ONE wire, never its descendants
//   • the ink chosen for a box reads on that box's real fill

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BRANCH_PALETTE,
  addChildNode,
  branchIndexMap,
  createMindMap,
  parseMindMap,
  readableInkOn,
  sanitizeColor,
  sanitizeNodeStyle,
  setNodeStyle,
  toFirestoreMindMap,
} from "../utils/mindMapTree.js";

const buildMap = () => {
  let mind = createMindMap("Centre", "Demo");
  const a = addChildNode(mind, "root", "Alpha", { side: "right" });
  mind = a.mind;
  const b = addChildNode(mind, a.nodeId, "Beta");
  mind = b.mind;
  const c = addChildNode(mind, "root", "Gamma", { side: "left" });
  mind = c.mind;
  return { mind, alpha: a.nodeId, beta: b.nodeId, gamma: c.nodeId };
};

test("colours are normalised to lower-case #rrggbb and anything else is dropped", () => {
  assert.equal(sanitizeColor("#FFAA00"), "#ffaa00");
  assert.equal(sanitizeColor(" #abcdef "), "#abcdef");
  assert.equal(sanitizeColor("red"), null);
  assert.equal(sanitizeColor("#fff"), null);
  assert.equal(sanitizeColor("rgba(0,0,0,.5)"), null);
  assert.equal(sanitizeColor(42), null);
});

test("sanitizeNodeStyle keeps valid keys only and returns null when nothing survives", () => {
  assert.deepEqual(sanitizeNodeStyle({ bg: "#000000", text: "bad", edge: "#112233", extra: "#ffffff" }), {
    bg: "#000000",
    edge: "#112233",
  });
  assert.equal(sanitizeNodeStyle({ bg: "nope" }), null);
  assert.equal(sanitizeNodeStyle(null), null);
  assert.equal(sanitizeNodeStyle("#000000"), null);
});

test("an old map with no style loads without any style keys and saves unchanged", () => {
  const legacy = {
    version: 1,
    title: "Old",
    rootTopic: "Centre",
    nodes: [{ id: "n1", topic: "One", parentId: "root", side: "right", collapsed: false, fx: null, fy: null }],
  };
  const parsed = parseMindMap(legacy);
  assert.equal("rootStyle" in parsed, false);
  assert.equal("style" in parsed.nodes[0], false);

  const stored = toFirestoreMindMap(parsed, { uid: "u", productId: "p", moduleId: "m", mapKey: "main" });
  assert.equal("rootStyle" in stored, false);
  assert.equal("style" in stored.nodes[0], false);
  assert.equal(stored.nodes[0].topic, "One");
});

test("setNodeStyle changes only the targeted node's keys", () => {
  const { mind, alpha, beta } = buildMap();
  const next = setNodeStyle(mind, alpha, { bg: "#FFF3B0", edge: "#2563eb" });
  const alphaNode = next.nodes.find((n) => n.id === alpha);
  const betaBefore = mind.nodes.find((n) => n.id === beta);
  const betaAfter = next.nodes.find((n) => n.id === beta);
  assert.deepEqual(alphaNode.style, { bg: "#fff3b0", edge: "#2563eb" });
  // The child keeps its own (default) look — no cascade from the parent's wire.
  assert.equal("style" in betaAfter, false);
  assert.deepEqual(betaAfter, betaBefore);
  // Topic, parent and hierarchy are untouched.
  assert.equal(alphaNode.topic, "Alpha");
  assert.equal(alphaNode.parentId, "root");
  assert.equal(next.nodes.length, mind.nodes.length);
});

test("a reset removes the colour keys and drops the style object entirely", () => {
  const { mind, alpha } = buildMap();
  const styled = setNodeStyle(mind, alpha, { bg: "#000000", text: "#ffffff", edge: "#ff0000" });
  const reset = setNodeStyle(styled, alpha, { bg: null, text: null, edge: null });
  const node = reset.nodes.find((n) => n.id === alpha);
  assert.equal("style" in node, false);
  assert.deepEqual(node, mind.nodes.find((n) => n.id === alpha));
});

test("setNodeStyle returns the same object when nothing actually changes", () => {
  const { mind, alpha } = buildMap();
  assert.equal(setNodeStyle(mind, alpha, { bg: null }), mind);
  const once = setNodeStyle(mind, alpha, { text: "#0f172a" });
  assert.equal(setNodeStyle(once, alpha, { text: "#0f172a" }), once);
});

test("the centre takes box and text colours but never a branch colour", () => {
  const { mind } = buildMap();
  const next = setNodeStyle(mind, "root", { bg: "#1e293b", text: "#ffffff", edge: "#ff0000" });
  assert.deepEqual(next.rootStyle, { bg: "#1e293b", text: "#ffffff" });
  assert.deepEqual(parseMindMap(next).rootStyle, { bg: "#1e293b", text: "#ffffff" });
  const cleared = setNodeStyle(next, "root", { bg: null, text: null });
  assert.equal("rootStyle" in cleared, false);
});

test("styles survive the Firestore round trip and invalid stored colours are dropped", () => {
  const { mind, alpha, gamma } = buildMap();
  let styled = setNodeStyle(mind, alpha, { bg: "#dbeafe", edge: "#0ea5e9" });
  styled = setNodeStyle(styled, gamma, { text: "#be123c" });
  styled = setNodeStyle(styled, "root", { bg: "#0f172a" });
  const stored = toFirestoreMindMap(styled, { uid: "u", productId: "p", moduleId: "m", mapKey: "main" });
  const reloaded = parseMindMap(JSON.parse(JSON.stringify(stored)));
  assert.deepEqual(reloaded.rootStyle, { bg: "#0f172a" });
  assert.deepEqual(reloaded.nodes.find((n) => n.id === alpha).style, { bg: "#dbeafe", edge: "#0ea5e9" });
  assert.deepEqual(reloaded.nodes.find((n) => n.id === gamma).style, { text: "#be123c" });

  const corrupt = parseMindMap({
    nodes: [{ id: "x", topic: "X", parentId: null, style: { bg: "blue", edge: "#00ff00" } }],
  });
  assert.deepEqual(corrupt.nodes[0].style, { edge: "#00ff00" });
});

test("branchIndexMap groups every node under its top-level branch", () => {
  const { mind, alpha, beta, gamma } = buildMap();
  const index = branchIndexMap(mind);
  assert.equal(index.get(alpha), 0);
  assert.equal(index.get(beta), 0);
  assert.equal(index.get(gamma), 1);
  assert.equal(index.has("root"), false);
});

test("the branch palette has distinct colours", () => {
  assert.equal(new Set(BRANCH_PALETTE).size, BRANCH_PALETTE.length);
  for (const colour of BRANCH_PALETTE) assert.equal(sanitizeColor(colour), colour);
});

test("readableInkOn picks dark ink on light fills and light ink on dark fills", () => {
  assert.equal(readableInkOn("#ffffff"), "#0f172a");
  assert.equal(readableInkOn("#fef3c7"), "#0f172a");
  assert.equal(readableInkOn("#0b1220"), "#ffffff");
  assert.equal(readableInkOn("#4f46e5"), "#ffffff");
  assert.equal(readableInkOn("#1e293b"), "#ffffff");
  // Not a solid colour → the dark ink is the safe default on the light canvas.
  assert.equal(readableInkOn("rgba(15,23,42,0.05)"), "#0f172a");
});
