// Phase 4 runtime proof: Work Revision uses a separate device-local KV
// namespace, persists FSRS reviews in Dexie, and imports common study files
// without entering the Revision cloud repository.
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "fake-indexeddb/auto";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules/.cache/work-mode-revision-runtime");
fs.mkdirSync(DIR, { recursive: true });
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/#/work/revision" });
const { window } = dom;
for (const key of ["window", "document", "localStorage", "CustomEvent", "Event", "navigator"]) {
  Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
}

await build({
  stdin: {
    resolveDir: ROOT,
    loader: "ts",
    contents: `
export * from "./src/work/storage/workRevisionDb";
export * from "./src/work/storage/workRevisionImport";
export * from "./src/work/storage/workRevisionBackup";
export * from "./src/course/brainScoreStorage";
export { revisionDb, readKv } from "./src/revision/engine/localDb";
`,
  },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "silent",
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")));
const clearWorld = async () => {
  window.localStorage.clear();
  const db = fixture.revisionDb();
  await db.kv.clear();
  await db.media.clear();
  await db.syncQueue.clear();
};

beforeEach(clearWorld);
after(async () => {
  const db = fixture.revisionDb();
  db.close();
  dom.window.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  for (const handle of process._getActiveHandles?.() || []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
});

test("Work Revision starts blank, writes only its work:device snapshot, and never queues cloud sync", async () => {
  const empty = await fixture.loadWorkRevisionSnapshot();
  assert.equal(empty.decks.length, 0, "Work does not hydrate or seed master-course decks");
  assert.equal(empty.cards.length, 0);

  const database = fixture.revisionDb();
  const ordinaryRevisionSnapshot = { sentinel: "main revision data stays untouched" };
  await database.kv.put({ key: "unified-snapshot", value: ordinaryRevisionSnapshot, updatedAt: new Date().toISOString() });

  const created = await fixture.createWorkRevisionDeck({
    name: "Cell biology",
    description: "Private set",
    source: "user",
    cards: [
      { front: "What is a cell?", back: "The basic unit of life.", hint: "Smallest living unit" },
      { front: "Which organelle makes ATP?", back: "Mitochondrion", options: ["Ribosome", "Mitochondrion", "Golgi apparatus"], correctIndex: 1, explanation: "The inner membrane hosts oxidative phosphorylation.", cardType: "mcq" },
    ],
  });
  const saved = await fixture.loadWorkRevisionSnapshot();
  assert.equal(saved.decks.length, 1);
  assert.equal(saved.decks[0].name, "Cell biology");
  assert.equal(saved.cards.length, 2);
  assert.equal(saved.cards.every((card) => card.deckId === created.id && card.id.startsWith("usrc:")), true);
  assert.equal(saved.cards[0].scheduling.state, "new");
  assert.equal(saved.cards[1].correctIndex, 1);
  assert.deepEqual(await fixture.readKv("unified-snapshot"), ordinaryRevisionSnapshot, "regular Revision snapshot remains separate and unchanged");
  assert.ok(await database.kv.get(fixture.WORK_REVISION_SNAPSHOT_KEY), "Work snapshot is stored under its separate Dexie KV key");
  assert.deepEqual(await database.kv.get("unified-snapshot").then((row) => row.value), ordinaryRevisionSnapshot);
  assert.deepEqual(await database.syncQueue.toArray(), [], "device-only Work writes never enqueue cloud persistence");

  await fixture.renameWorkRevisionDeck(created.id, "Cell biology · renamed");
  assert.equal((await fixture.loadWorkRevisionSnapshot()).decks[0].name, "Cell biology · renamed");

  const latest = await fixture.loadWorkRevisionSnapshot();
  await fixture.deleteWorkRevisionDeck(created.id);
  const afterDelete = await fixture.loadWorkRevisionSnapshot();
  assert.equal(afterDelete.decks.length, 0);
  assert.equal(afterDelete.cards.length, 0);
  assert.equal(latest.cards.length, 2, "a previously loaded snapshot remains an immutable value");
  assert.deepEqual(await database.syncQueue.toArray(), []);
});

test("Convertible review uses the shared FSRS scheduler and keeps review/session history local", async () => {
  const deck = await fixture.createWorkRevisionDeck({
    name: "Physics",
    cards: [{ front: "What is velocity?", back: "Displacement per unit time." }],
  });
  const snapshot = await fixture.loadWorkRevisionSnapshot();
  const card = snapshot.cards[0];
  const session = await fixture.createWorkRevisionSession(deck.id, [card.id]);
  await fixture.recordWorkRevisionRating(session.id, card.id, "good", 2300);

  const reviewed = await fixture.loadWorkRevisionSnapshot();
  assert.equal(reviewed.cards[0].scheduling.reps, 1);
  assert.ok(["learning", "review"].includes(reviewed.cards[0].scheduling.state), "first FSRS grade advances the card into a scheduled learning/review state");
  assert.equal(reviewed.reviewLogs.length, 1);
  assert.equal(reviewed.reviewLogs[0].rating, "good");
  assert.equal(reviewed.reviewLogs[0].source, "custom-study");
  assert.equal(reviewed.reviewLogs[0].sessionId, session.id);
  assert.equal(reviewed.reviewLogs[0].responseTime, 2300);
  assert.equal(reviewed.sessions[0].completed, true);
  assert.equal(reviewed.sessions[0].ratings.good, 1);
  assert.deepEqual(await fixture.revisionDb().syncQueue.toArray(), [], "FSRS review writes stay local");
});

test("direct importer handles CSV, Brain MCQ, Anki TSV, Markdown, and JSON locally", () => {
  const csv = fixture.parseWorkRevisionImport('Front,Back,Hint,Tags\n"Name, one",Answer,Remember,"biology,cell"', "cards.csv");
  assert.equal(csv.format, "csv");
  assert.equal(csv.kind, "flashcards");
  assert.equal(csv.cards[0].front, "Name, one");
  assert.equal(csv.cards[0].back, "Answer");

  const mcq = fixture.parseWorkRevisionImport("question,options,correct,explanation\nWhich is a planet?,Earth | Moon | Sun,Earth,Earth orbits the Sun.", "practice.csv");
  assert.equal(mcq.kind, "brain");
  assert.equal(mcq.cards[0].cardType, "mcq");
  assert.equal(mcq.cards[0].correctIndex, 0);
  assert.equal(mcq.cards[0].explanation, "Earth orbits the Sun.");

  const anki = fixture.parseWorkRevisionImport("Term\tDefinition\nmitosis\tCell division", "anki-export.txt");
  assert.equal(anki.format, "tsv");
  assert.equal(anki.cards[0].front, "Term", "the first row without a recognised header is kept as an Anki card");
  assert.equal(anki.cards.length, 2);

  const markdown = fixture.parseWorkRevisionImport("Q: What is osmosis?\nA: Water moving across a selectively permeable membrane.", "notes.md");
  assert.equal(markdown.cards.length, 1);
  assert.match(markdown.cards[0].back, /selectively permeable/);

  const json = fixture.parseWorkRevisionImport(JSON.stringify({ cards: [{ front: "Prompt", back: "Answer" }] }), "set.json");
  assert.equal(json.cards.length, 1);
  assert.equal(json.cards[0].source, "bulk-import");
});

test("Work Revision backup validates the device namespace and restores cards and review history locally", async () => {
  const deck = await fixture.createWorkRevisionDeck({
    name: "Backup set",
    cards: [{ front: "Prompt", back: "Answer" }],
  });
  const original = await fixture.loadWorkRevisionSnapshot();
  const text = fixture.createWorkRevisionBackup(original, "2026-10-15T12:00:00.000Z");
  const backup = fixture.parseWorkRevisionBackup(text);
  assert.equal(backup.format, "digitalcatalyst-work-revision-backup");
  assert.equal(backup.namespace, "work:device");
  assert.deepEqual(backup.snapshot, original);

  const wrongNamespace = JSON.parse(text);
  wrongNamespace.namespace = "course";
  assert.throws(() => fixture.parseWorkRevisionBackup(JSON.stringify(wrongNamespace)), /device-only Work Revision library/);
  assert.throws(() => fixture.parseWorkRevisionBackup("not json"), /not valid JSON/);

  await fixture.deleteWorkRevisionDeck(deck.id);
  assert.equal((await fixture.loadWorkRevisionSnapshot()).decks.length, 0);
  await fixture.saveWorkRevisionSnapshot(backup.snapshot);
  assert.deepEqual(await fixture.loadWorkRevisionSnapshot(), original, "full backup restores FSRS card state and review collections");
  assert.deepEqual(await fixture.revisionDb().syncQueue.toArray(), [], "backup restore stays on-device without queuing cloud sync");
});

test("Brain practice scores round-trip under the isolated Work Revision namespace", () => {
  const scores = { "set:private": { attempts: 2, best: 100, last: 80, at: 123456 } };
  const workKey = fixture.brainScoreStorageKey("deck:private", true);
  fixture.saveBrainScores("deck:private", scores, true);

  assert.equal(workKey, "work:device:revision-brain-scores:v1:deck:private");
  assert.deepEqual(fixture.loadBrainScores("deck:private", true), scores);
  assert.equal(window.localStorage.getItem("dc:courseBrain:deck:private"), null, "Work scores never use the Course score key");

  const courseScores = { "set:course": { attempts: 1, best: 90, last: 90, at: 654321 } };
  fixture.saveBrainScores("product:course", courseScores);
  assert.deepEqual(fixture.loadBrainScores("product:course"), courseScores, "existing Course score storage remains unchanged");
  assert.equal(window.localStorage.getItem("work:device:revision-brain-scores:v1:product:course"), null);
});

test("localStorage fallback stays under the Work namespace when IndexedDB is unavailable", async () => {
  const indexedDB = globalThis.indexedDB;
  try {
    delete globalThis.indexedDB;
    await fixture.saveWorkRevisionSnapshot({
      ...await fixture.loadWorkRevisionSnapshot(),
      decks: [{ id: "deck:offline", name: "Offline", description: "", color: "green", kind: "user", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    });
    const stored = window.localStorage.getItem("dc.work.revision.snapshot.v1");
    assert.ok(stored);
    assert.equal(JSON.parse(stored).decks[0].id, "deck:offline");
    assert.equal(window.localStorage.getItem("revision_db_work-device"), null, "Work fallback does not touch the legacy Revision DB");
  } finally {
    globalThis.indexedDB = indexedDB;
  }
});

test("Work Revision UI is wired to local notes and does not use the cloud Revision bootstrap", () => {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
  const storage = read("src/work/storage/workRevisionDb.ts");
  const app = read("src/work/WorkRevisionApp.tsx");
  const surface = read("src/work/pages/WorkPageSurface.tsx");
  const brainPanel = read("src/course/CourseBrainPanel.tsx");
  assert.match(storage, /WORK_REVISION_NAMESPACE\s*=\s*"work:device"/);
  assert.match(storage, /WORK_REVISION_SNAPSHOT_KEY\s*=\s*`\$\{WORK_REVISION_NAMESPACE\}:revision-snapshot:v1`/);
  assert.doesNotMatch(storage, /from\s*["'][^"']*(?:firebase|firestore|dcxRepository|revisionCloudSync|cloudRevisionService)/i);
  assert.doesNotMatch(app, /bootstrapRevisionFeature|hydrateRevisionFromCloud|queueRevisionCloudPersistence|persistCustomTestToBank|reserveRevisionTestSlotOrOffline/);
  assert.match(app, /generateQuestionsWithAi/);
  assert.match(app, /saveUserAiConfig\(WORK_DEVICE_UID/);
  assert.match(app, /parseWorkRevisionImport/);
  assert.match(app, /createWorkRevisionBackup/);
  assert.match(app, /parseWorkRevisionBackup/);
  assert.match(app, /data-work-revision-backup-actions/);
  assert.match(app, /Replace with backup/);
  assert.match(app, /saveWorkRevisionSnapshot/);
  assert.match(app, /CourseBrainPanel/);
  assert.match(app, /workMode/);
  assert.match(brainPanel, /workMode\s*\?\s*\[\]\s*:/);
  assert.match(brainPanel, /!workMode\s*&&\s*personalLibrary/);
  assert.match(brainPanel, /loadBrainScores\(productId, workMode\)/);
  assert.match(brainPanel, /saveBrainScores\(productId, next, workMode\)/);
  assert.match(app, /recordWorkRevisionRating/);
  assert.match(app, /Click your favourite deck styling/);
  assert.match(app, /WorkRevisionStylePreview/);
  assert.match(surface, /<WorkRevisionApp notes=\{notes\.notes\} \/>/);
  assert.doesNotMatch(surface, /WorkPhasePlaceholder|Revision library · Phase 4/);
});
