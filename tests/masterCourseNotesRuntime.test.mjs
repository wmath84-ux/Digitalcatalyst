import test from "node:test";
import assert from "node:assert/strict";
import { collectMasterCourseNotes } from "../utils/masterCourseNotes.js";

const note = (id, accessLevel = "included", overrides = {}) => ({
  id,
  name: `Master note ${id}`,
  type: "note",
  noteHtml: `<p>${id} body</p>`,
  noteSource: "master",
  accessLevel,
  sortOrder: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_010,
  createdBy: "admin-1",
  ...overrides,
});

const module = (id, files = [], modules = [], overrides = {}) => ({
  id,
  title: `Module ${id}`,
  files,
  modules,
  ...overrides,
});

const access = (overrides = {}) => ({
  courseId: "course-1",
  unlockedModuleIds: new Set(["root", "child"]),
  ownedUpdateIds: new Set(),
  accessibleResourceIds: new Set(),
  ...overrides,
});

test("collects only explicit master notes from the existing unlocked module tree", () => {
  const notes = collectMasterCourseNotes([
    module("root", [
      note("master-1"),
      { ...note("self-shaped"), source: "personal" },
      { ...note("unprovenanced"), noteSource: undefined },
      { ...note("ordinary-resource"), type: "pdf" },
    ], [module("child", [note("master-2")])]),
  ], access());

  assert.deepEqual(notes.map((item) => item.resourceId), ["master-1", "master-2"]);
  assert.equal(notes[1].moduleId, "child");
  assert.deepEqual(notes[1].modulePath, ["Module root", "Module child"]);
  assert.equal(notes[0].id, "master:course-1:master-1");
  assert.equal(notes[0].source, "master");
  assert.equal(notes[0].bodyHtml, "<p>master-1 body</p>");
  assert.equal(notes[0].createdBy, "admin-1");
});

test("module hierarchy, hidden state, paid updates, and resource purchases gate Master notes", () => {
  const tree = [
    module("root", [
      note("included"),
      note("hidden", "hidden"),
      note("resource-buy", "purchasable"),
      note("update-buy", "paidUpdate", { paidUpdateId: "update-1" }),
    ], [module("locked-child", [note("child-note")])]),
  ];

  const denied = collectMasterCourseNotes(tree, access({ unlockedModuleIds: new Set(["root"]) }));
  assert.deepEqual(denied.map((item) => item.resourceId), ["included"]);

  const entitled = collectMasterCourseNotes(tree, access({
    unlockedModuleIds: new Set(["root", "locked-child"]),
    accessibleResourceIds: new Set(["resource-buy"]),
    ownedUpdateIds: new Set(["update-1"]),
  }));
  assert.deepEqual(entitled.map((item) => item.resourceId), ["included", "resource-buy", "update-buy", "child-note"]);
});

test("resource order is stable, and personal-course trees can disable the Master collection", () => {
  const tree = [module("root", [
    note("later", "included", { sortOrder: 2 }),
    note("first", "included", { sortOrder: 0 }),
    note("middle", "included", { sortOrder: 1 }),
  ])];
  assert.deepEqual(collectMasterCourseNotes(tree, access()).map((item) => item.resourceId), ["first", "middle", "later"]);
  assert.deepEqual(collectMasterCourseNotes(tree, access({ enabled: false })), []);
});
