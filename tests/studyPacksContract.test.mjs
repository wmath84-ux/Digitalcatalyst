import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeStudyPackMeta,
  isValidStudyPackId,
  defaultStudyPacksForPlan,
  normalizePlanStudyPacks,
  studyPacksCycle,
  countResourceTypes,
} from "../utils/studyPacks.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("study pack ids are opaque and do not look like uids", () => {
  assert.equal(isValidStudyPackId("spkabcdefghijklmnopqrstuv"), true);
  assert.equal(isValidStudyPackId("users/abc"), false);
  assert.equal(isValidStudyPackId("pm_123"), false);
});

test("visibility defaults to unlisted, never public", () => {
  const result = sanitizeStudyPackMeta({ title: "Physics Revision" });
  assert.equal(result.ok, true);
  assert.equal(result.value.visibility, "unlisted");
});

test("free plans default to limited pack creation", () => {
  const config = defaultStudyPacksForPlan("free", 0, 0);
  assert.equal(config.monthly.creationEnabled, false);
  assert.equal(config.monthly.maxImportsPerMonth > 0, true);
  const paid = defaultStudyPacksForPlan("pro", 49900, 499000);
  assert.equal(paid.monthly.creationEnabled, true);
});

test("monthly and yearly pack limits stay independent", () => {
  const normalized = normalizePlanStudyPacks({
    monthlyPrice: 10,
    yearlyPrice: 100,
    studyPacks: {
      monthly: { creationEnabled: false, maxPublishedPacks: 1, maxImportsPerMonth: 3, studyStackEnabled: true, maxStudyStacks: 2 },
      yearly: { creationEnabled: true, maxPublishedPacks: 40, maxImportsPerMonth: 80, studyStackEnabled: true, maxStudyStacks: 30 },
    },
  }, "pro");
  assert.equal(studyPacksCycle(normalized, "monthly").creationEnabled, false);
  assert.equal(studyPacksCycle(normalized, "yearly").maxPublishedPacks, 40);
});

test("resource type counts help pack previews", () => {
  const counts = countResourceTypes([{ type: "pdf" }, { type: "pdf" }, { type: "youtube" }]);
  assert.equal(counts.pdf, 2);
  assert.equal(counts.youtube, 1);
});

test("share route is public and uses the existing hash router", () => {
  const main = readFileSync(join(root, "src/main.tsx"), "utf8");
  assert.match(main, /STUDY_PACK_HASH = "#\/pack\/"/);
  assert.match(main, /StudyPackPage/);
  const routes = readFileSync(join(root, "src/utils/appRoutes.ts"), "utf8");
  assert.equal(routes.includes("#/pack/"), false);
});

test("firestore denies client writes to shared packs", () => {
  const rules = readFileSync(join(root, "firestore.rules"), "utf8");
  assert.match(rules, /match \/studyPacks\/\{packId\}/);
  assert.match(rules, /allow create, update, delete: if false;/);
});

test("API multiplexer dispatches studyPack actions", () => {
  const mux = readFileSync(join(root, "api/referral-leaderboard.ts"), "utf8");
  assert.match(mux, /studyPack\./);
  assert.match(mux, /handleStudyPacks/);
});
