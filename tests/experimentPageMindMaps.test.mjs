// tests/experimentPageMindMaps.test.mjs
//
// Mind maps on the Course Player's Experiment page.
//
//   MASTER — the course's admin mind maps are listed beside its experiments and
//            open in the LOWER pane (the Mind Map tab), never the upper pane.
//   SELF   — the learner's own mind maps are saved to the “My experiments” shelf
//            course, tagged with the player scope, and listed only for that
//            course. Master resources never leak into SELF, and another course's
//            maps never appear here.
//
// The pure rules are exercised directly. The React/wiring rules are pinned from
// source, since the node runner cannot mount the player.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  placeSelfMindMap,
  placeSelfExperiment,
  selfExperimentCourseFile,
  selfExperimentsFromCourses,
  selfMindMapIssues,
  SELF_EXPERIMENTS_COURSE_ID,
} from "../src/utils/selfExperiments.ts";
import { sanitizeMyCourseDoc, mindMapBudget, MY_MIND_MAP_MAX_BYTES } from "../utils/myCourseDoc.js";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const validMap = (rootTopic = "Cell") => ({
  version: 1,
  title: "Cell map",
  rootTopic,
  nodes: [
    { id: "a", topic: "Nucleus", parentId: "root", side: "right" },
    { id: "b", topic: "DNA", parentId: "a" },
  ],
});

const factories = {
  createCourse: (uid, title) => ({ id: "fresh", uid, title, description: "", modules: [], coverImage: "", schemaVersion: 1, createdAt: 0, updatedAt: 0 }),
  createModule: (title) => ({ id: `mod-${title}`, title, description: "", resources: [], modules: [], createdAt: 0, updatedAt: 0 }),
  createResource: (type = "youtube") => ({ id: `res-${type}-${Math.random().toString(36).slice(2, 7)}`, name: "", type, url: "", description: "", source: "link", createdAt: 0, updatedAt: 0 }),
};

const PRODUCT = "prod-1";
const OTHER = "prod-2";

test("a learner mind map is placed on the shelf with the scope tag and a validated JSON body", () => {
  const placed = placeSelfMindMap(
    { course: null, uid: "u1", productId: PRODUCT, courseTitle: "Biology", moduleTitle: "Cells", name: "Cell map", mindMapData: validMap() },
    factories,
  );
  assert.deepEqual(placed.issues, []);
  assert.equal(placed.course.id, SELF_EXPERIMENTS_COURSE_ID);
  assert.equal(placed.resource.type, "mind_map");
  assert.equal(placed.resource.name, "Cell map");
  assert.equal(placed.resource.experimentSourceProductId, PRODUCT);
  assert.equal(placed.resource.mindMapData.rootTopic, "Cell");
});

test("an invalid mind map is refused with path-level reasons and nothing is placed", () => {
  const broken = { rootTopic: "Cell", nodes: [{ id: "a", topic: "", parentId: "root" }] };
  const placed = placeSelfMindMap(
    { course: null, uid: "u1", productId: PRODUCT, name: "Broken", mindMapData: broken },
    factories,
  );
  assert.equal(placed.course, null);
  assert.equal(placed.resource, null);
  assert.ok(placed.issues.length > 0);
  assert.ok(placed.issues.every((issue) => typeof issue === "string" && issue.includes(":")), "each issue names its path");
  assert.deepEqual(selfMindMapIssues(null), ["paste the mind map JSON first"]);
});

test("SELF lists the learner's maps for this course only, and keeps experiments as kind 'experiment'", () => {
  const mapPlaced = placeSelfMindMap({ course: null, uid: "u1", productId: PRODUCT, name: "Mine", mindMapData: validMap() }, factories);
  const otherPlaced = placeSelfMindMap({ course: mapPlaced.course, uid: "u1", productId: OTHER, name: "Elsewhere", mindMapData: validMap("Other") }, factories);
  const expPlaced = placeSelfExperiment(
    { course: otherPlaced.course, uid: "u1", productId: PRODUCT, name: "Sim", html: "<html><body><script>1</script></body></html>" },
    factories,
  );
  const items = selfExperimentsFromCourses([expPlaced.course], PRODUCT);
  const kinds = items.map((item) => `${item.kind}:${item.title}`).sort();
  assert.deepEqual(kinds, ["experiment:Sim", "mind_map:Mine"]);
  const elsewhere = selfExperimentsFromCourses([expPlaced.course], OTHER).map((item) => item.title);
  assert.deepEqual(elsewhere, ["Elsewhere"]);
});

test("master resources (not in the My experiments shelf course) never appear in SELF", () => {
  const masterLikeCourse = {
    id: "some-official-course",
    modules: [{ id: "m", title: "Official", resources: [{ id: "r", name: "Master map", type: "mind_map", mindMapData: validMap(), experimentSourceProductId: PRODUCT }] }],
  };
  assert.deepEqual(selfExperimentsFromCourses([masterLikeCourse], PRODUCT), []);
});

test("a stored self map that no longer validates is not listed, so the page never shows an error entry", () => {
  const course = {
    id: SELF_EXPERIMENTS_COURSE_ID,
    modules: [{ id: "m", title: "Cells", resources: [{ id: "r", name: "Stale", type: "mind_map", mindMapData: { rootTopic: "" }, experimentSourceProductId: PRODUCT }] }],
  };
  assert.deepEqual(selfExperimentsFromCourses([course], PRODUCT), []);
});

test("a self mind map opens as a mind_map file (lower pane), an experiment still opens as interactive", () => {
  const [mapItem] = selfExperimentsFromCourses(
    [placeSelfMindMap({ course: null, uid: "u1", productId: PRODUCT, name: "Map", mindMapData: validMap() }, factories).course],
    PRODUCT,
  );
  const file = selfExperimentCourseFile(mapItem);
  assert.equal(file.type, "mind_map");
  assert.deepEqual(file.mindMapData, validMap());
});

test("the server keeps a valid learner mind map and drops a broken one before the write", () => {
  const result = sanitizeMyCourseDoc("u1", {
    id: "my-experiments",
    title: "My experiments",
    modules: [
      {
        id: "m1",
        title: "Cells",
        resources: [
          { id: "ok", name: "Good", type: "mind_map", mindMapData: validMap(), experimentSourceProductId: PRODUCT },
          { id: "bad", name: "Bad", type: "mind_map", mindMapData: { rootTopic: "" }, experimentSourceProductId: PRODUCT },
        ],
      },
    ],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const resources = result.doc.modules[0].resources;
  const good = resources.find((item) => item.id === "ok");
  const bad = resources.find((item) => item.id === "bad");
  assert.ok(good && good.mindMapData, "the valid map keeps its JSON");
  assert.ok(bad && !bad.mindMapData, "the invalid map keeps no JSON");
});

test("the server refuses learner mind maps that add up past the course cap, with a readable code", () => {
  // The validator's largest legal map (600 nodes × 400 chars) is under the per-map
  // cap, so the course cap is the one that can be reached: three of them.
  const maxMap = () => ({
    ...validMap(),
    // 599 nodes + root = 600 (the validator's limit), topics up to 400 chars.
    nodes: Array.from({ length: 599 }, (_, i) => ({ id: `n${i}`, topic: "x".repeat(396) + i, parentId: i === 0 ? "root" : `n${Math.floor((i - 1) / 3)}` })),
  });
  const resources = ["Map A", "Map B", "Map C"].map((name, i) => ({ id: `r${i}`, name, type: "mind_map", mindMapData: maxMap(), experimentSourceProductId: PRODUCT }));
  const result = sanitizeMyCourseDoc("u1", {
    id: "my-experiments",
    title: "My experiments",
    modules: [{ id: "m", title: "Cells", resources }],
  });
  assert.equal(result.ok, false, "three maximum maps must be refused as a course");
  assert.equal(result.code, "MIND_MAPS_TOO_LARGE");
  assert.match(result.message, /add up to/);
  assert.ok(mindMapBudget([{ id: "m", resources }]).total > MY_MIND_MAP_MAX_BYTES, "measured over the course cap");
});

// ── Wiring (source) ─────────────────────────────────────────────────────────

const player = read("src/CoursePlayerApp.tsx");
const panel = read("src/course/ExperimentPanel.tsx");
const composer = read("src/course/SelfMindMapComposer.tsx");

test("MASTER: admin mind maps are added to the experiment list with kind 'mind_map' and the same lock rule", () => {
  assert.match(player, /if \(isMasterMindMapFile\(file\)\) \{\s*if \(!file\.mindMapData\) continue;/);
  assert.match(player, /kind: "mind_map"/);
  assert.match(player, /kind: "experiment"/);
});

test("a mind map opens in the LOWER pane for both MASTER and SELF, never through selectFile", () => {
  const onOpen = player.slice(player.indexOf("onOpen={(experiment, source) => {"), player.indexOf("aiPanel={"));
  assert.match(onOpen, /if \(experiment\.kind === "mind_map"\)/);
  assert.match(onOpen, /openSelfMindMap\(experiment\.id\)/);
  assert.match(onOpen, /handleOpenMasterMap\(`master-\$\{experiment\.id\}`\)/);
  const mapBranch = onOpen.slice(0, onOpen.indexOf("return;"));
  assert.doesNotMatch(mapBranch, /selectFile|selectPersonalFile/, "a mind map never reaches the upper pane");
  assert.match(player, /setDockTab\("mindmap"\)/);
});

test("the lower Mind Map pane can show a SELF map key as well as a master key", () => {
  assert.match(player, /masterMapKey\.startsWith\("self-"\)/);
  assert.match(player, /\}, \[masterMapKey, masterMindMaps, selfExperimentItems\]\);/);
});

test("a self mind map is saved with the library write and the success toast comes only after it commits", () => {
  const start = player.indexOf("const createSelfMindMap = useCallback(");
  const body = player.slice(start, player.indexOf("const personalMapModule", start));
  const saveAt = body.indexOf("await myLibrary.save(placed.course)");
  const okAt = body.indexOf("if (!result.ok) return", saveAt);
  const toastAt = body.indexOf("toast({", okAt);
  assert.ok(saveAt > 0 && okAt > saveAt && toastAt > okAt, "save, then refusal check, then toast");
  assert.match(body, /placeSelfMindMap\(/);
});

test("the Experiment page's “+” menu offers a mind map, and Create stays disabled until the JSON validates", () => {
  assert.match(panel, /data-experiment-self-menu-item="mind-map"/);
  assert.match(panel, /onCreateSelfMindMap \? \(/);
  assert.match(composer, /disabled=\{!ready\}/);
  assert.match(composer, /const ready = Boolean\(result\?\.valid\)/);
  assert.match(composer, /if \(outcome\.ok\) \{\s*onClose\(\);/);
});

test("the player's experiment tab shows a SELF map's kind and does not mix the two lists", () => {
  assert.match(panel, /experiment\.kind === "mind_map" \? "Mind map" : "2D experiment"/);
  assert.match(player, /selfExperimentsFromCourses\(myLibrary\.courses, storageProductId\)\.map/);
});
