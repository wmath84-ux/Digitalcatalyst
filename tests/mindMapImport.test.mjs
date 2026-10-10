// Shared AI / JSON mind map validator (admin + Course Player) and the
// resource save → reload round trip for `mind_map` resources.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MIND_MAP_AI_PROMPT,
  validateMindMapJson,
  validateMindMapObject,
  formatMindMapIssue,
} from "../utils/mindMapImport.js";
import { addChildNode, createMindMap } from "../utils/mindMapTree.js";
import {
  editorToFirestoreBody,
  firestoreToEditorForm,
  canonicalResourceToLegacyFile,
} from "../utils/productMapping.js";

const paths = (result) => result.errors.map((e) => e.path);

test("valid JSON produces the canonical map and stats", () => {
  const r = validateMindMapJson(JSON.stringify({
    rootTopic: "Physics",
    nodes: [
      { id: "a", topic: "Force", parentId: "root", side: "left" },
      { id: "b", topic: "Newton", parentId: "a" },
    ],
  }));
  assert.equal(r.valid, true);
  assert.equal(r.mindMap.rootTopic, "Physics");
  assert.equal(r.stats.nodes, 3);
  assert.equal(r.stats.depth, 2);
});

test("errors name the exact field path and reason", () => {
  const r = validateMindMapObject({
    rootTopic: "",
    nodes: [
      { id: "root", topic: "x", parentId: "root" },
      { id: "a", topic: "A", parentId: "missing" },
      { id: "a", topic: "dup" },
      { id: "c", topic: "", parentId: "root" },
    ],
  });
  assert.equal(r.valid, false);
  const p = paths(r);
  assert.ok(p.includes("rootTopic"));
  assert.ok(p.includes("nodes[0].id"));
  assert.ok(p.includes("nodes[1].parentId") || p.includes("nodes[2].id"));
  assert.ok(p.includes("nodes[3].topic"));
  assert.match(formatMindMapIssue(r.errors.find((e) => e.path === "nodes[2].id") || r.errors[0]), /nodes\[2\]\.id: /);
});

test("cycles and orphans are rejected as not connected to root", () => {
  const r = validateMindMapObject({
    rootTopic: "R",
    nodes: [
      { id: "a", topic: "A", parentId: "b" },
      { id: "b", topic: "B", parentId: "a" },
    ],
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /not connected to the root/.test(e.message)));
});

test("invalid JSON reports a syntax reason and an empty box is refused", () => {
  const bad = validateMindMapJson("{rootTopic: 'x'");
  assert.equal(bad.valid, false);
  assert.equal(bad.errors[0].path, "$");
  assert.match(bad.errors[0].message, /Not valid JSON/);
  assert.equal(validateMindMapJson("   ").valid, false);
});

test("a markdown code fence around AI output is accepted with a warning", () => {
  const r = validateMindMapJson("```json\n" + JSON.stringify({ rootTopic: "X", nodes: [] }) + "\n```");
  assert.equal(r.valid, true);
  assert.ok(r.warnings.length >= 1);
});

test("the AI prompt documents the same schema the validator enforces", () => {
  assert.match(MIND_MAP_AI_PROMPT, /"rootTopic"/);
  assert.match(MIND_MAP_AI_PROMPT, /"parentId"/);
  assert.match(MIND_MAP_AI_PROMPT, /Output ONLY a valid JSON object/);
});

test("admin and Course Player both import the one shared validator (no duplicate)", () => {
  const admin = readFileSync("src/components/admin/products/MindMapResourceEditor.tsx", "utf8");
  const player = readFileSync("src/course/MindMapJsonImport.tsx", "utf8");
  assert.doesNotMatch(admin, /const validateMindMapCode\b/);
  assert.match(admin, /utils\/mindMapImport/);
  assert.match(player, /utils\/mindMapImport/);
});

test("a mind_map resource survives save → reload with its map intact", () => {
  let map = createMindMap("Physics", "Physics");
  map = addChildNode(map, "root", "Force").mind;
  const form = {
    id: "p1",
    title: "Course",
    modules: [{
      id: "m1",
      title: "Module",
      resources: [{
        id: "r1", name: "Physics map", type: "mind_map", url: "", mindMapData: map,
        mindMapSourceMode: "scratch_builder", mindMapRootTopic: "Physics",
        visibility: "visible", accessLevel: "included", sortOrder: 0,
      }],
    }],
    paidUpdates: [],
  };
  const out = editorToFirestoreBody(form);
  const files = out.courseContent[0].files;
  assert.equal(files.length, 1, "mind map must reach the learner tree");
  assert.equal(files[0].type, "mind_map");
  const legacy = canonicalResourceToLegacyFile(files[0]);
  assert.equal(legacy.type, "mind_map");
  assert.equal(legacy.mindMapData.rootTopic, "Physics");

  const back = firestoreToEditorForm(out, "p1");
  const r = back.modules[0].resources[0];
  assert.equal(r.type, "mind_map");
  assert.equal(r.name, "Physics map");
  assert.equal(r.mindMapData.nodes.length, 1);
  assert.equal(r.mindMapData.nodes[0].topic, "Force");
});

test("a mind_map with an invalid stored map is not written as a learner resource", () => {
  const form = {
    id: "p2",
    title: "Course",
    modules: [{ id: "m1", title: "M", resources: [{
      id: "r2", name: "Broken", type: "mind_map", url: "", mindMapData: { rootTopic: "", nodes: [] },
      visibility: "visible", accessLevel: "included", sortOrder: 0,
    }] }],
    paidUpdates: [],
  };
  const out = editorToFirestoreBody(form);
  assert.deepEqual(out.courseContent[0].files, []);
});
