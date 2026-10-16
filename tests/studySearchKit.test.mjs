// tests/studySearchKit.test.mjs
//
// The two halves of the shared study-search that carry NO React: the device's
// recent-search list (src/course/searchHistory.ts) and the library matcher
// (src/course/resourceSearch.ts). Both are pure, so they are tested directly —
// bundled with esbuild and run with a fake device storage.
//
// Owner brief (2026-10-16): one box serves the whole library AND YouTube; the
// search page shows previous searches exactly as YouTube's own search page
// does, and the library half must find a resource by its own words, its
// module's name, and the presenter's own metadata.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const CACHE = path.join(ROOT, "node_modules", ".cache", "study-search-kit");

function build(entryName, source) {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, `${entryName}.ts`);
  const out = path.join(CACHE, `${entryName}.cjs`);
  fs.writeFileSync(entry, source);
  execFileSync(
    path.join(ROOT, "node_modules", "esbuild", "bin", "esbuild"),
    [entry, "--bundle", "--format=cjs", "--platform=node", "--target=node20", `--outfile=${out}`, "--log-level=error"],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

/* ── the fake device: a storage that can be full, and can be private mode ── */

class FakeStorage {
  constructor() { this.map = new Map(); this.mode = "ok"; }
  getItem(key) {
    if (this.mode === "throw") throw new Error("private mode");
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    if (this.mode === "throw") throw new Error("quota");
    this.map.set(key, String(value));
  }
  removeItem(key) {
    if (this.mode === "throw") throw new Error("private mode");
    this.map.delete(key);
  }
}

const storage = new FakeStorage();
globalThis.window = { localStorage: storage };

const history = require(build("history", `export * from ${JSON.stringify(path.join(ROOT, "src/course/searchHistory.ts"))};`));
const search = require(build("search", `export * from ${JSON.stringify(path.join(ROOT, "src/course/resourceSearch.ts"))};`));

/* ── 1 · the recent searches ─────────────────────────────────────────────── */

const NS = "course-library";

test("the history lives under one per-namespace key on this device", () => {
  assert.equal(history.searchHistoryKey(NS), "dc.searchHistory.v1.course-library");
  assert.equal(history.searchHistoryKey("course-music"), "dc.searchHistory.v1.course-music");
  assert.equal(history.SEARCH_HISTORY_LIMIT, 12);
});

test("a query is stored as the person typed it: trimmed, single-spaced", () => {
  assert.equal(history.normaliseSearchQuery("  algebra   basics  "), "algebra basics");
  assert.equal(history.normaliseSearchQuery(""), "");
  assert.equal(history.normaliseSearchQuery(null), "");
});

test("every run search is remembered once, newest first", () => {
  storage.mode = "ok";
  storage.map.clear();
  assert.deepEqual(history.readSearchHistory(NS), []);

  assert.deepEqual(history.recordSearch(NS, "algebra"), ["algebra"]);
  assert.deepEqual(history.recordSearch(NS, "trigonometry"), ["trigonometry", "algebra"]);
  // The same query again moves UP instead of appearing twice — YouTube's own
  // habit, and the reason the list stays readable.
  assert.deepEqual(history.recordSearch(NS, "  ALGEBRA  "), ["ALGEBRA", "trigonometry"]);
  // A blank query is never a history entry.
  assert.deepEqual(history.recordSearch(NS, "   "), ["ALGEBRA", "trigonometry"]);
  // …and the on-device copy agrees, so a reload shows the same list.
  assert.deepEqual(history.readSearchHistory(NS), ["ALGEBRA", "trigonometry"]);
});

test("the list is bounded, one entry is forgettable, and Clear all empties it", () => {
  storage.map.clear();
  for (let index = 0; index < 20; index += 1) history.recordSearch(NS, `query ${index}`);
  const rows = history.readSearchHistory(NS);
  assert.equal(rows.length, history.SEARCH_HISTORY_LIMIT);
  assert.equal(rows[0], "query 19", "the newest stays first");
  assert.equal(rows.includes("query 7"), false, "the oldest fell off the end");

  assert.equal(history.forgetSearch(NS, "QUERY 19").includes("query 19"), false, "forget is case-insensitive");
  assert.equal(history.readSearchHistory(NS).length, history.SEARCH_HISTORY_LIMIT - 1);

  history.clearSearchHistory(NS);
  assert.deepEqual(history.readSearchHistory(NS), []);
  assert.equal(window.localStorage.getItem(history.searchHistoryKey(NS)), null, "and nothing is left behind");
});

test("two namespaces never see each other's searches", () => {
  storage.map.clear();
  history.recordSearch("course-library", "algebra");
  history.recordSearch("course-music", "arijit singh");
  assert.deepEqual(history.readSearchHistory("course-library"), ["algebra"]);
  assert.deepEqual(history.readSearchHistory("course-music"), ["arijit singh"]);
});

test("a broken, hostile or missing storage is a reason for no history — never a crash", () => {
  storage.map.clear();
  // Storage that throws (private mode / full quota).
  storage.mode = "throw";
  assert.deepEqual(history.readSearchHistory(NS), []);
  assert.deepEqual(history.recordSearch(NS, "algebra"), ["algebra"]);
  assert.deepEqual(history.forgetSearch(NS, "algebra"), []);
  history.clearSearchHistory(NS);
  // Junk in the key.
  storage.mode = "ok";
  for (const junk of ["not json", "{}", "null", '["ok", 42, "", "ok", "  "]']) {
    window.localStorage.setItem(history.searchHistoryKey(NS), junk);
    const rows = history.readSearchHistory(NS);
    assert.ok(Array.isArray(rows), `junk ${junk} reads as a list`);
    assert.equal(rows.every((row) => typeof row === "string" && row.trim() === row && row !== ""), true);
  }
});

/* ── 2 · the library matcher ─────────────────────────────────────────────── */

const ROWS = [
  { id: "f1", title: "Intro to Algebra", subtitle: "Lesson · YouTube", kind: "lesson", modulePath: ["Foundations"], keywords: ["youtube"] },
  { id: "f2", title: "Algebra worksheet", subtitle: "Lesson · PDF", kind: "lesson", modulePath: ["Foundations"] },
  { id: "f3", title: "Trigonometry basics", subtitle: "Lesson · Video", kind: "lesson", modulePath: ["Foundations", "Algebra foundations"] },
  { id: "n1", title: "Quadratic equations", subtitle: "Course note", kind: "note", metadata: ["184 words"], modulePath: ["Foundations"] },
  { id: "b1", title: "Practice: quadratic", subtitle: "Practice", kind: "brain", metadata: ["12 practice cards"], modulePath: ["Advanced"] },
];

test("a term earns its weight by WHERE it is found", () => {
  const row = { id: "x", title: "Algebra basics", subtitle: "Course note", kind: "note", metadata: ["184 words"], modulePath: ["Foundations"], keywords: ["master"] };
  assert.equal(search.termWeight(row, "algebra basics"), 9, "the exact title wins outright");
  assert.equal(search.termWeight(row, "algebra"), 6, "a title that STARTS with the term");
  assert.equal(search.termWeight(row, "basics"), 3, "a term inside the title");
  assert.equal(search.termWeight(row, "note"), 2, "the kind/subtitle is worth less than the title");
  assert.equal(search.termWeight(row, "184 words"), 1, "the row's own metadata");
  assert.equal(search.termWeight(row, "foundations"), 1, "the module path");
  assert.equal(search.termWeight(row, "master"), 1, "the extra keywords a row asked to be found by");
  assert.equal(search.termWeight(row, "photosynthesis"), 0, "nothing means no match");
});

test("every term in the query must land somewhere", () => {
  assert.ok(search.scoreResource(ROWS[0], "intro algebra") > 0, "both terms are there");
  assert.equal(search.scoreResource(ROWS[0], "intro botany"), 0, "one missing term kills the row");
  assert.equal(search.scoreResource(ROWS[0], "   "), 0, "an empty query matches nothing");
  // The ranking rule the page depends on: a title hit beats a path hit, so
  // searching "algebra" lists the algebra lessons above the trigonometry
  // lecture that merely LIVES in an algebra module.
  assert.ok(
    search.scoreResource(ROWS[0], "algebra") > search.scoreResource(ROWS[2], "algebra"),
    "the title's own algebra outranks the module's",
  );
});

test("the matching rows come back best first, capped, and never crash on junk", () => {
  const hits = search.matchResources(ROWS, "algebra");
  // "Algebra worksheet" STARTS with the term, so it leads; "Intro to Algebra"
  // merely contains it; the trigonometry lecture only lives in an algebra
  // module. Best first, exactly as the page lists them.
  assert.deepEqual(hits.map((hit) => hit.resource.id), ["f2", "f1", "f3"]);
  assert.deepEqual(search.matchResources(ROWS, "quadratic").map((hit) => hit.resource.id), ["n1", "b1"]);
  assert.deepEqual(search.matchResources(ROWS, "nothing here").map((hit) => hit.resource.id), []);
  assert.deepEqual(search.matchResources(ROWS, ""), []);
  assert.equal(search.matchResources(ROWS, "e", 2).length, 2, "the cap is the caller's");
  assert.equal(search.matchResources([], "algebra").length, 0);
});

test("case, punctuation and Devanagari are all just letters", () => {
  const rows = [
    { id: "h1", title: "बीजगणित की मूल बातें" },
    { id: "h2", title: "Algebra: the basics!", modulePath: ["Neev"] },
  ];
  assert.deepEqual(search.matchResources(rows, "ALGEBRA").map((hit) => hit.resource.id), ["h2"]);
  assert.deepEqual(search.matchResources(rows, "algebra:").map((hit) => hit.resource.id), ["h2"]);
  assert.deepEqual(search.matchResources(rows, "बीजगणित").map((hit) => hit.resource.id), ["h1"]);
  assert.deepEqual(search.matchResources(rows, "neev").map((hit) => hit.resource.id), ["h2"]);
});
