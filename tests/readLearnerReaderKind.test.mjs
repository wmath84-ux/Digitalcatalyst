// Regression: the Read reader must open a learner's own PDF after upload.
// `withKind("learner", id)` used to write `learner:<id>` while `kindOf` only
// recognised `mine:<id>`, so the reader had no document (blank screen).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/course/ReadLibraryPanel.tsx", import.meta.url), "utf8");

test("withKind writes the prefix that kindOf reads back for learner PDFs", () => {
  assert.match(source, /const withKind = \(kind: ActiveKind, id: string\) => `\$\{kind === "learner" \? "mine" : kind\}:\$\{id\}`;/);
  assert.match(source, /activeId\?\.startsWith\("mine:"\) \? "learner"/);
});

test("the open button and the active-id writer use the same prefix", () => {
  assert.match(source, /data-course-read-open=\{`mine:\$\{row\.id\}`\}/);
  assert.match(source, /withKind\("learner", row\.id\)/);
});
