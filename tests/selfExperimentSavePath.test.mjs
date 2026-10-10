// Experiment page · SELF filter: a learner-created experiment must survive the
// save API, appear in its own SELF list at once, and never leak into another
// course's list. The save API (`/api/my-courses`) is used whenever Firestore
// refuses the direct write, so its sanitizer is part of the same data path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeMyCourseDoc } from "../utils/myCourseDoc.js";
import { placeSelfExperiment, selfExperimentsFromCourses } from "../src/utils/selfExperiments.ts";

const html = "<!doctype html><html><body><canvas></canvas><script>let x = 1;</script></body></html>";
const factories = {
  createCourse: (uid, title) => ({ id: "gen-1", uid, title, description: "", coverImage: "", modules: [], createdAt: 1, updatedAt: 1 }),
  createModule: (title) => ({ id: `m-${title}`, title, description: "", resources: [], modules: [], createdAt: 1, updatedAt: 1 }),
  createResource: (type) => ({ id: `r-${Math.random().toString(36).slice(2, 8)}`, name: "", type, url: "", description: "", source: "link", createdAt: 1, updatedAt: 1 }),
};

const place = (scope, extra = {}) => placeSelfExperiment(
  { course: null, uid: "u1", productId: scope, courseTitle: "Course A", moduleTitle: "Module 1", name: "Orbit", html, ...extra },
  factories,
);

// Simulates the server save: the sanitized document is what gets stored and read back.
const throughSaveApi = (course) => {
  const result = sanitizeMyCourseDoc("u1", JSON.parse(JSON.stringify(course)));
  assert.equal(result.ok, true, `save API accepted the course${result.ok ? "" : `: ${result.message}`}`);
  return result.doc;
};

test("a created experiment is listed in its own SELF scope", () => {
  const placed = place("prod-A");
  assert.deepEqual(placed.issues, []);
  const list = selfExperimentsFromCourses([placed.course], "prod-A");
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "Orbit");
});

test("the save API keeps the scope tag, so the experiment is still listed after the server read", () => {
  const placed = place("prod-A");
  const stored = throughSaveApi(placed.course);
  assert.equal(stored.modules[0].resources[0].experimentSourceProductId, "prod-A");
  const list = selfExperimentsFromCourses([stored], "prod-A");
  assert.equal(list.length, 1, "the SELF filter must still show it after the API round trip");
});

test("another course's SELF list does not show the experiment (no leak)", () => {
  const stored = throughSaveApi(place("prod-A").course);
  assert.deepEqual(selfExperimentsFromCourses([stored], "prod-B"), []);
});

test("a master (course-authored) resource is never a SELF experiment", () => {
  const master = { id: "my-experiments", title: "Mine", modules: [{ id: "m", title: "M", resources: [{ id: "x", name: "Admin lab", type: "interactive", interactiveHtml: html }], modules: [] }] };
  assert.deepEqual(selfExperimentsFromCourses([master], "prod-A"), [], "untagged resources do not leak into SELF");
});

test("an experiment over the size cap is refused with a reason, so no success is reported", () => {
  const huge = `<html>${"x".repeat(260 * 1024)}</html>`;
  const placed = place("prod-A", { html: huge });
  assert.equal(placed.course, null);
  assert.ok(placed.issues.length > 0);
});

test("the Brain practice-set scope tag also survives the save API", () => {
  const course = {
    id: "my-practice-sets", uid: "u1", title: "My practice sets", description: "", coverImage: "",
    modules: [{ id: "m1", title: "Set", resources: [{ id: "b1", name: "Set", type: "brain", url: "", practiceSourceProductId: "prod-A", practiceQuestions: [] }], modules: [] }],
    createdAt: 1, updatedAt: 1,
  };
  const stored = throughSaveApi(course);
  assert.equal(stored.modules[0].resources[0].practiceSourceProductId, "prod-A");
});

test("the save API keeps the sanitizer output (not the raw body) as the stored document", () => {
  const src = readFileSync("api/_lib/myCourses.ts", "utf8");
  assert.match(src, /const result = sanitizeMyCourseDoc\(uid, body\.course\);/);
  assert.match(src, /courses\.doc\(result\.doc\.id\)\.set\(\s*\{ \.\.\.result\.doc,/);
});

test("the success toast is only raised after the library write resolves ok", () => {
  const src = readFileSync("src/CoursePlayerApp.tsx", "utf8");
  const start = src.indexOf("const createSelfExperiment = useCallback(");
  const body = src.slice(start, src.indexOf("const personalMapModule", start));
  const saveAt = body.indexOf("await myLibrary.save(placed.course)");
  const toastAt = body.indexOf("toast({");
  assert.ok(saveAt > 0 && toastAt > saveAt, "toast comes after the awaited save");
  assert.match(body.slice(saveAt, toastAt), /if \(!result\.ok\) return \{ ok: false, message: result\.message \};/);
});
