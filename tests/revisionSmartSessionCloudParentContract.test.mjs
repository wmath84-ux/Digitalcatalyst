// tests/revisionSmartSessionCloudParentContract.test.mjs
//
// Contract for the Saved Tests + Smart Revision Bank:
//   · a stale/orphan revision row must never crash the Revision Bank;
//   · a Smart Revision session that spans multiple saved tests is stored in
//     the cloud as one root document (synthetic parent `0`) and never
//     duplicated under every parent;
//   · Firestore rules refuse to resurrect a mixed session when any of its
//     parent saved-test tombstones exists.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const read = (file) => fs.readFileSync(file, "utf8");
const cloudSource = read("src/revision/engine/cloudRevisionService.ts");
const rulesSource = read("firestore.rules");
const revisionSource = read("src/revision/engine/revisionService.ts");

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

async function revisionEngine() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "revision-smart-session-"));
  const files = [
    ["src/revision/data/seedData.ts", "data/seedData.mjs"],
    ["src/revision/engine/store.ts", "engine/store.mjs"],
    ["src/revision/engine/types.ts", "engine/types.mjs"],
    ["src/revision/engine/revisionService.ts", "engine/revisionService.mjs"],
  ];
  for (const [sourcePath, outputPath] of files) {
    const output = ts.transpileModule(read(sourcePath), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      fileName: sourcePath,
    }).outputText
      .replaceAll('"../data/seedData"', '"../data/seedData.mjs"')
      .replaceAll('"./store"', '"./store.mjs"')
      .replaceAll('"./types"', '"./types.mjs"');
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
  const store = await import(pathToFileURL(path.join(root, "engine/store.mjs")));
  const revision = await import(pathToFileURL(path.join(root, "engine/revisionService.mjs")));
  return { root, store, revision };
}

test("the Revision Bank skips orphan revision rows without crashing", async (t) => {
  const { root, store, revision } = await revisionEngine();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = "orphan-bank";
  const db = store.loadDb(uid);
  const questionId = 999_999;
  db.questions.push({
    id: questionId,
    topicId: 1,
    subjectId: 1,
    difficulty: "medium",
    prompt: "Orphan prompt",
    options: ["a", "b"],
    correctIndex: 0,
    explanation: "",
    isActive: true,
  });
  db.revisionItems.push({
    id: 1,
    questionId,
    subjectId: 12345,
    topicId: 67890,
    status: "learning",
    successStreak: 0,
    timesSeen: 1,
    timesCorrect: 0,
    timesWrong: 1,
    lastResult: "wrong",
    sourceAttemptId: null,
    addedAt: new Date().toISOString(),
    lastRevisedAt: null,
    masteredAt: null,
    updatedAt: new Date().toISOString(),
  });
  store.saveDb(uid, db);
  assert.doesNotThrow(() => revision.getRevisionBank(uid));
  assert.equal(revision.getRevisionBank(uid).length, 0);
});

test("mixed Smart Revision sessions are persisted once under the synthetic parent 0", () => {
  assert.match(cloudSource, /parentTestKeys/);
  assert.match(cloudSource, /Mixed Smart Revision sessions/);
  assert.match(cloudSource, /testKey: String\(onlyTestId\)/);
  assert.match(cloudSource, /const onlyTestId = parentTestIds\.length === 1 \? parentTestIds\[0\] : 0;/);
  assert.match(cloudSource, /synthetic parent `0`/);
  // The same session id has exactly one Firestore path in the payload loop.
  const payloadLoop = cloudSource.slice(
    cloudSource.indexOf("for (const session of local.revisionSessions)"),
    cloudSource.indexOf("await flushBatch(uid, writes);"),
  );
  const writesToSessions = payloadLoop.match(/path: \["users", uid, "revisionSessions", String\(session\.id\)\]/g);
  assert.ok(writesToSessions, "session persistence must write the root revisionSessions collection");
  assert.equal(writesToSessions.length, 1);
  assert.doesNotMatch(cloudSource, /revisionTests.*revisionSessions/);
});

test("Firestore rules require all mixed-session parent tombstones to be absent", () => {
  const block = rulesSource.slice(
    rulesSource.indexOf("match /revisionSessions/{sessionId}"),
    rulesSource.indexOf("match /aiUsage/{documentId}"),
  );
  assert.match(block, /parentTestKeys/);
  assert.match(block, /parentTestKeys\.all\(k =>/);
  assert.ok(block.includes("revisionDeletedTests/$(k)"));
});

test("Smart Revision player and result renderers skip orphan questions", () => {
  assert.match(revisionSource, /if \(!topic \|\| !subject\) return \[\];/);
});
