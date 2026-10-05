// tests/revisionChapterNameContract.test.mjs
//
// The owner's 2026-10-04 brief, in one file:
//
//   "Test Name wohi hona chahiye jo user test import karte waqt enter karta hai
//    ya AI test generate karte waqt naam deta hai. Subject wohi hona chahiye jo
//    user AI test generate karte waqt select karta hai. Chapter Name wohi hona
//    chahiye jo user test import karte waqt enter karega. Jab user Revision/Test
//    import kare to import form mein Chapter Name ka ek additional field add
//    karo. Existing Test Name field ke saath Chapter Name field add karo.
//    Example: Test Name: Physics Chapter Test, Chapter Name: Electrostatics.
//    Is Chapter Name ko save karo aur Revision Dashboard ke card par use karo.
//    Existing import functionality ko break mat karo."
//
// The first half drives the REAL revision engine (transpiled with the repo's
// own TypeScript, exactly like revisionPersistencePart1) through the import
// path the form uses, so the chapter name is proven to be SAVED and to come
// back out of the Test Bank with the plan it belongs to. The second half pins
// the surfaces: the importer's extra field, the generator's test name and the
// dashboard card's mapping.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const read = (file) => fs.readFileSync(file, "utf8");
const importPage = read("src/revision/pages/BulkImportPage.tsx");
const generatePage = read("src/revision/pages/AiGeneratePage.tsx");
const dashboard = read("src/revision/pages/DashboardPage.tsx");
const deck = read("src/revision/components/PlanSlideDeck.tsx");
const customTests = read("src/revision/engine/customTestService.ts");

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

async function loadTypescript() {
  try {
    const mod = await import("typescript");
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

async function revisionEngine(t) {
  const ts = await loadTypescript();
  if (!ts) {
    t?.skip("dependencies not installed — run pnpm install");
    return null;
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "revision-chapter-"));
  const files = [
    ["src/revision/data/seedData.ts", "data/seedData.mjs"],
    ["src/revision/engine/store.ts", "engine/store.mjs"],
    ["src/revision/engine/types.ts", "engine/types.mjs"],
    ["src/revision/engine/customTestService.ts", "engine/customTestService.mjs"],
  ];
  for (const [sourcePath, outputPath] of files) {
    const output = ts.transpileModule(read(sourcePath), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      fileName: sourcePath,
    }).outputText
      .replaceAll('"../data/seedData"', '"../data/seedData.mjs"')
      .replaceAll('"./store"', '"./store.mjs"')
      .replaceAll('"./types"', '"./types.mjs"')
      .replaceAll('"./aiGenerate"', '"./aiGenerate.mjs"');
    const destination = path.join(root, outputPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output);
  }
  globalThis.localStorage = new MemoryStorage();
  if (typeof globalThis.window === "undefined") globalThis.window = new EventTarget();
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(name, init = {}) { super(name); this.detail = init.detail; }
    };
  }
  const custom = await import(pathToFileURL(path.join(root, "engine/customTestService.mjs")));
  return { root, custom };
}

/** A question exactly as the bulk importer builds them today. */
const importedQuestion = (prompt, correctIndex = 0) => ({
  prompt,
  options: ["Correct", "Wrong", "Other"],
  correctIndex,
  explanation: `${prompt} explanation`,
  difficulty: "medium",
  subjectName: "My Imports",
  topicName: "Electrostatics",
});

/* --------------------------------------------------------------------------- */
/* 1. The chapter name is saved with the imported test and read back          */
/* --------------------------------------------------------------------------- */

test("an imported test keeps the learner's chapter name and test name", async (t) => {
  const engine = await revisionEngine(t);
  if (!engine) return;
  const { root, custom } = engine;
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = "learner-import-chapter";

  // EXACTLY what BulkImportPage.createTest now sends: the type-in title and the
  // new chapter type-in, carried on the plan itself.
  const created = custom.createCustomTest(uid, {
    title: "Physics Chapter Test",
    estimatedMinutes: 8,
    source: "bulk",
    questions: [importedQuestion("Q1"), importedQuestion("Q2"), importedQuestion("Q3")],
    planDetails: {
      classNames: [],
      subjectNames: ["My Imports"],
      chapterNames: ["Electrostatics"],
      topicNames: [],
      difficulty: "medium",
      questionMode: "mixed",
    },
  });

  // …it is on disk (the same localStorage snapshot the app rehydrates from)…
  const raw = localStorage.getItem(`revision_db_${uid}`);
  assert.ok(raw?.includes("Physics Chapter Test"), "the test name is saved");
  assert.ok(raw?.includes("Electrostatics"), "the chapter name is saved");

  // …and the dashboard-facing listing hands both back for the card.
  const [row] = custom.listCustomTests(uid);
  assert.equal(row.id, created.testId);
  assert.equal(row.title, "Physics Chapter Test", "the card's Test Name is the import type-in");
  assert.deepEqual(row.planDetails.chapterNames, ["Electrostatics"], "the card's Chapter Name is the import type-in");
  assert.deepEqual(row.planDetails.subjectNames, ["My Imports"], "the importer's own subject label");
  assert.equal(row.totalQuestions, 3, "the card's count is the test's own count");
  assert.equal(row.planDetails.questionMode, "mixed");
  assert.equal(row.source, "bulk");
});

test("an import with no chapter keeps the legacy derived label (old functionality intact)", async (t) => {
  const engine = await revisionEngine(t);
  if (!engine) return;
  const { root, custom } = engine;
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = "learner-legacy-import";

  // The pre-existing shape: no planDetails at all. Every older saved test looks
  // like this, and it must still list and still show honest labels.
  custom.createCustomTest(uid, {
    title: "Legacy Imported Test",
    estimatedMinutes: 5,
    source: "bulk",
    questions: [importedQuestion("Q1"), importedQuestion("Q2")],
  });

  const [row] = custom.listCustomTests(uid);
  assert.equal(row.title, "Legacy Imported Test");
  assert.deepEqual(row.planDetails.subjectNames, ["My Imports"], "labels are derived from the questions");
  assert.deepEqual(row.planDetails.chapterNames, ["Electrostatics"], "…topic by topic");
  assert.equal(row.planDetails.questionMode, "mixed", "the explicit Mixed default is applied on read");
  assert.equal(row.planDetails.difficulty, "mixed");
});

/* --------------------------------------------------------------------------- */
/* 2. The surfaces: import field, generator name, dashboard card              */
/* --------------------------------------------------------------------------- */

test("the import form gained a Chapter Name field beside the Test Name field", () => {
  // The title and chapter inputs use Recall's token-backed Input primitive
  // rather than the retired dark-only `.dc-field` recipe.
  assert.match(importPage, /data-rev-import-chapter/);
  assert.match(importPage, /Chapter name/);
  assert.match(importPage, /Test name/);
  assert.match(importPage, /placeholder="e\.g\. Electrostatics"/);
  assert.match(importPage, /<Input[\s\S]{0,180}?className="h-11 rounded-xl"/);
  assert.match(importPage, /from "..\/recall\/components\/ui\/input"/);
  // …and it is the value that reaches the saved plan.
  assert.match(importPage, /const \[chapterName, setChapterName\] = useState\(""\);/);
  assert.match(importPage, /const cleanChapter = chapterName\.trim\(\);/);
  assert.match(importPage, /chapterNames: cleanChapter \? \[cleanChapter\] : \[\],/);
  assert.match(importPage, /planDetails: \{/);
  // The existing Test Name field and its placeholder are untouched.
  assert.match(importPage, /placeholder="Test name \(optional\)"/);
  assert.match(importPage, /const \[title, setTitle\] = useState\(""\);/);
  assert.match(importPage, /const cleanTitle = title\.trim\(\) \|\| "My Imported Test";/);
  // The importer still builds questions the way it always did.
  assert.match(importPage, /source: "bulk"/);
  assert.match(importPage, /subjectName: IMPORT_SUBJECT_LABEL/);
});

test("the AI generator takes the learner's test name, falling back to its own title", () => {
  assert.match(generatePage, /data-rev-ai-test-name/);
  assert.match(generatePage, /Test name \(optional\)/);
  assert.match(generatePage, /const \[testName, setTestName\] = useState\(""\);/);
  assert.match(generatePage, /const title = testName\.trim\(\)/);
  assert.match(generatePage, /Revision · \$\{subjectNames\[0\]\}/, "the automatic title stays the fallback");
  // The subject + chapter the learner selected are still what the plan stores.
  assert.match(generatePage, /subjectNames: Array\.from\(new Set\(rows\.map\(\(row\) => row\.subjectName\)\)\)/);
  assert.match(generatePage, /chapterNames: Array\.from\(new Set\(rows\.map\(\(row\) => row\.chapterName\)\)\)/);
});

test("the dashboard's slide card maps subject, count, test name and chapter — nothing else", () => {
  // The card's four lines come straight off the saved plan.
  assert.match(dashboard, /const subject = displayList\(details\.subjectNames, "General"\);/);
  assert.match(dashboard, /const chapter = displayList\(details\.chapterNames, "Not labelled"\);/);
  assert.match(dashboard, /countLabel: String\(plan\.totalQuestions\),/);
  assert.match(dashboard, /countUnit: plan\.totalQuestions === 1 \? "Question" : "Questions",/);
  assert.match(dashboard, /title: plan\.title,/);
  // …and the deck prints them in the owner's order: subject (top), count
  // (main), test name (under the count), chapter (support).
  assert.match(deck, /data-slide-subject/);
  assert.match(deck, /data-slide-count/);
  assert.match(deck, /data-slide-title/);
  assert.match(deck, /data-slide-chapter/);
  // The chapter line is labelled, so "Electrostatics" can never read as a
  // second test name.
  assert.match(deck, />Chapter</);
});

test("nothing in the import → save → card path invents a chapter", () => {
  // The engine stores what it is given; the only derivation left is the honest
  // legacy fallback for tests saved before planDetails existed.
  assert.match(customTests, /chapterNames: \[\.\.\.input\.planDetails\.chapterNames\],/);
  assert.match(customTests, /Old saved tests did not have planDetails/);
  assert.doesNotMatch(importPage, /chapterNames: \["[^"]*(Chapter|General)[^"]*"\]/, "no invented chapter");
  assert.doesNotMatch(deck, /Chapter \d|electrostatics/i, "the deck hard-codes no chapter of its own");
});
