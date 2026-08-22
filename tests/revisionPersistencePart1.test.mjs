import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  DEFAULT_REVISION_TEST_BANK_LIMITS,
  normalizeRevisionTestBankLimits,
  revisionBankLimitForCycle,
} from "../utils/revisionLimits.js";

const read = (file) => fs.readFileSync(file, "utf8");
const apiSource = read("api/_lib/revisionData.ts");
const cloudSource = read("src/revision/engine/cloudRevisionService.ts");
const appSource = read("src/revision/RevisionApp.tsx");
const rulesSource = read("firestore.rules");
const bankSource = read("src/revision/pages/RevisionBankPage.tsx");
const generateSource = read("src/revision/pages/AiGeneratePage.tsx");
const importSource = read("src/revision/pages/BulkImportPage.tsx");
const dashboardSource = read("src/revision/pages/DashboardPage.tsx");
const storeSource = read("src/revision/engine/store.ts");

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
}

async function revisionEngine() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "revision-part1-"));
  const files = [
    ["src/revision/data/seedData.ts", "data/seedData.mjs"],
    ["src/revision/engine/store.ts", "engine/store.mjs"],
    ["src/revision/engine/types.ts", "engine/types.mjs"],
    ["src/revision/engine/customTestService.ts", "engine/customTestService.mjs"],
    ["src/revision/engine/testService.ts", "engine/testService.mjs"],
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
  const service = await import(pathToFileURL(path.join(root, "engine/testService.mjs")));
  return { root, custom, service };
}

const question = (prompt, correctIndex = 0) => ({
  prompt,
  options: ["Correct", "Wrong", "Other"],
  correctIndex,
  explanation: `${prompt} explanation`,
  difficulty: "medium",
  subjectName: "Mathematics",
  topicName: "Algebra",
});

test("AI-generated and imported tests persist in the same local Test Bank", async (t) => {
  const { root, custom } = await revisionEngine();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = "learner-bank";
  const ai = custom.createCustomTest(uid, {
    title: "AI Algebra Paper",
    estimatedMinutes: 8,
    source: "ai",
    questions: [question("AI prompt one"), question("AI prompt two")],
  });
  const imported = custom.createCustomTest(uid, {
    title: "Imported Chemistry Paper",
    estimatedMinutes: 6,
    source: "bulk",
    questions: [question("Import prompt one"), question("Import prompt two")],
  });
  const raw = localStorage.getItem(`revision_db_${uid}`);
  assert.ok(raw?.includes("AI Algebra Paper"));
  assert.ok(raw?.includes("Imported Chemistry Paper"));
  const listed = custom.listCustomTests(uid);
  assert.equal(listed.length, 2);
  assert.equal(listed.find((row) => row.id === ai.testId)?.source, "ai");
  assert.equal(listed.find((row) => row.id === imported.testId)?.source, "bulk");
  assert.deepEqual(new Set(listed.map((row) => row.id)).size, 2);
});

test("saved tests recover from storage and keep immutable full/skipped attempt history", async (t) => {
  const { root, custom, service } = await revisionEngine();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const uid = "learner-history";
  const created = custom.createCustomTest(uid, {
    title: "Immutable Algebra Test",
    estimatedMinutes: 5,
    source: "ai",
    questions: [question("Question one"), question("Question two"), question("Question three")],
  });

  // The local compatibility snapshot survives a simulated close/reopen.
  const persisted = localStorage.getItem(`revision_db_${uid}`);
  assert.ok(persisted?.includes("Immutable Algebra Test"));
  assert.equal(custom.listCustomTests(uid)[0].id, created.testId);

  const first = custom.startCustomTestAttempt(uid, created.testId);
  const firstPlayer = service.getAttemptForPlayer(uid, first.id);
  const [q1, q2, q3] = firstPlayer.questions.map((item) => item.id);
  service.saveTestAnswer(uid, first.id, q1, 0);
  service.saveTestAnswer(uid, first.id, q2, 1);
  service.saveTestAnswer(uid, first.id, q3, null);
  service.submitTestAttempt(uid, first.id);
  assert.deepEqual(
    { total: service.getTestResult(uid, first.id).totalQuestions, review: service.getTestReview(uid, first.id).length },
    { total: 3, review: 3 },
  );

  const skipped = custom.startSkippedQuestionsRetake(uid, created.testId);
  const skippedPlayer = service.getAttemptForPlayer(uid, skipped.id);
  assert.equal(skippedPlayer.questions.length, 1);
  assert.equal(skippedPlayer.questions[0].id, q3);
  assert.throws(() => service.saveTestAnswer(uid, skipped.id, q1, 0), /does not belong to this attempt/i);
  service.saveTestAnswer(uid, skipped.id, q3, 0);
  service.submitTestAttempt(uid, skipped.id);
  const skippedResult = service.getTestResult(uid, skipped.id);
  assert.equal(skippedResult.totalQuestions, 1);
  assert.equal(skippedResult.score, 100);
  assert.equal(service.getTestReview(uid, skipped.id).length, 1);

  const fullRetake = custom.startCustomTestRetake(uid, created.testId);
  assert.equal(service.getAttemptForPlayer(uid, fullRetake.id).questions.length, 3);
  const history = custom.listCustomTestAttempts(uid, created.testId);
  assert.equal(history.length, 3);
  assert.equal(history[1].attemptKind, "skipped");
  assert.equal(history[2].questionCount, 3);
  assert.notEqual(history[0].id, history[2].id);

  custom.deleteCustomTestLocal(uid, created.testId);
  assert.equal(custom.listCustomTests(uid).length, 0);
  assert.doesNotMatch(localStorage.getItem(`revision_db_${uid}`) ?? "", /Immutable Algebra Test/);
});

test("plan/cycle bank limits are configurable with 20/50/100 defaults", () => {
  assert.deepEqual(DEFAULT_REVISION_TEST_BANK_LIMITS.basic, { monthly: 20, yearly: 20 });
  assert.deepEqual(DEFAULT_REVISION_TEST_BANK_LIMITS.premium, { monthly: 50, yearly: 50 });
  assert.deepEqual(DEFAULT_REVISION_TEST_BANK_LIMITS.pro, { monthly: 100, yearly: 100 });
  const limits = normalizeRevisionTestBankLimits({ monthly: 27, yearly: 73 }, "basic");
  assert.equal(revisionBankLimitForCycle({ revisionTestBankLimits: limits }, "monthly"), 27);
  assert.equal(revisionBankLimitForCycle({ revisionTestBankLimits: limits }, "yearly"), 73);
  assert.equal(revisionBankLimitForCycle({ id: "pro", revisionTestBankLimits: { monthly: -1, yearly: 0 } }, "monthly"), -1);
  assert.equal(revisionBankLimitForCycle({ id: "pro", revisionTestBankLimits: { monthly: -1, yearly: 0 } }, "yearly"), 0);
});

test("server capacity is transactional and expiry only blocks creation actions", () => {
  assert.match(apiSource, /runTransaction\(async \(tx\)/);
  assert.match(apiSource, /used \+ Object\.keys\(reservations\)\.length >= access\.limit/);
  assert.match(apiSource, /creationActions = new Set\(\["revision\.data\.reserve", "revision\.data\.create", "revision\.data\.migrate"\]\)/);
  assert.match(apiSource, /creationActions\.has\(action\) && !access\.hasAccess/);
  assert.doesNotMatch(apiSource, /if \(!access\.hasAccess\)[\s\S]{0,180}revision\.data\.status/);
  assert.match(apiSource, /revision\.data\.delete/);
});

test("migration, deletion tombstones, recovery, and central progress mirroring are wired", () => {
  assert.match(appSource, /hydrateRevisionFromCloud\(uid\)/);
  assert.match(appSource, /revision-db-changed/);
  assert.match(appSource, /queueRevisionCloudPersistence\(uid\)/);
  assert.match(cloudSource, /migrateMissingLocalTests/);
  assert.match(cloudSource, /migrateOneLocalTest/);
  assert.match(cloudSource, /TEST_DELETED/);
  assert.match(cloudSource, /deleteCustomTestLocal\(uid, testId\)/);
  assert.match(cloudSource, /Never abort hydration/);
  assert.match(cloudSource, /persistRevisionProgressNow\(uid\)/);
  assert.match(cloudSource, /item\.questionId/);
  assert.match(cloudSource, /SYNC_TIMEOUT/);
  assert.match(apiSource, /revisionDeletedTests/);
  assert.match(apiSource, /tx\.set\(deletedRef/);
  assert.match(apiSource, /if \(testSnap\.exists\)/);
  assert.match(apiSource, /return \{ duplicate: true/);
  assert.match(apiSource, /revisionAttempts/);
  assert.match(apiSource, /revisionSessions/);
  assert.match(apiSource, /revisionItems/);
  assert.match(rulesSource, /match \/revisionDeletedTests\/\{testId\}/);
  assert.match(rulesSource, /revisionDeletedTests\/\$\(request\.resource\.data\.testKey\)/);
});

test("AI and imported tests save to the cloud Test Bank with an offline local fallback", () => {
  assert.match(generateSource, /persistCustomTestToBank/);
  assert.match(generateSource, /reserveRevisionTestSlotOrOffline/);
  assert.match(generateSource, /saved to your Test Bank/);
  assert.match(importSource, /persistCustomTestToBank/);
  assert.match(importSource, /reserveRevisionTestSlotOrOffline/);
  assert.match(importSource, /saved to your Test Bank/);
  assert.match(cloudSource, /export async function persistCustomTestToBank/);
  assert.match(cloudSource, /export async function reserveRevisionTestSlotOrOffline/);
  assert.match(cloudSource, /isTransientRevisionCloudError/);
  assert.match(cloudSource, /testContentFingerprint/);
  assert.match(cloudSource, /status: "local"/);
  assert.match(dashboardSource, /revision-db-changed/);
  assert.match(dashboardSource, /listCustomTests\(uid\)/);
  assert.match(storeSource, /revision_db_\$\{uid\}/);
  assert.match(storeSource, /test\.source === "ai" \|\| test\.source === "bulk"/);
  assert.match(bankSource, /pending cloud sync/);
});

test("expiry blocks only creation while saved tests and Smart Revision remain routable", () => {
  assert.match(appSource, /Existing saved tests and in-progress attempts remain usable/);
  assert.match(appSource, /Smart Revision sessions operate on existing learner-owned data/);
  const sessionBranch = appSource.slice(appSource.indexOf("} else if (sessionMatch)"), appSource.indexOf("} else if (path.startsWith(\"#/revision/bank\"))"));
  assert.doesNotMatch(sessionBranch, /hasRevisionAccess|requireAccess|PremiumGate/);
});

test("Test Bank UI exposes history, full/skipped retakes, durable delete, and Smart Revision", () => {
  assert.match(bankSource, /Saved Tests/);
  assert.match(bankSource, /Smart Revision/);
  assert.match(bankSource, /Revise Again/);
  assert.match(bankSource, /Revise Skipped/);
  assert.match(bankSource, /Attempt history/);
  assert.match(bankSource, /deleteCustomTestFromCloud/);
  assert.match(bankSource, /Delete Permanently/);
  assert.match(bankSource, /pending cloud sync/);
});
