import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  aiAllowanceForCycle,
  normalizePlanAiAllowances,
  usdToMicros,
} from "../utils/aiAllowances.js";
import {
  calculateAiCostMicros,
  findAiModelPrice,
  normalizeAiModelPricing,
} from "../utils/aiPolicy.js";

const read = (path) => fs.readFileSync(path, "utf8");

test("plan AI allowances normalize monthly and yearly values independently", () => {
  const normalized = normalizePlanAiAllowances({
    monthly: { dailyGenerationLimit: 12, costBudgetMicros: 1_250_000 },
    yearly: { dailyGenerationLimit: 45, costBudgetMicros: 9_500_000 },
  });
  assert.deepEqual(normalized.monthly, { dailyGenerationLimit: 12, costBudgetMicros: 1_250_000 });
  assert.deepEqual(normalized.yearly, { dailyGenerationLimit: 45, costBudgetMicros: 9_500_000 });
  assert.equal(aiAllowanceForCycle({ aiAllowances: normalized }, "yearly").dailyGenerationLimit, 45);
  assert.equal(usdToMicros("2.75"), 2_750_000);
});

test("legacy plan defaults preserve the 20-successful-test generation allowance", () => {
  const normalized = normalizePlanAiAllowances(null);
  assert.equal(normalized.monthly.dailyGenerationLimit, 20);
  assert.equal(normalized.yearly.dailyGenerationLimit, 20);
  assert.equal(normalized.monthly.costBudgetMicros, -1);
  assert.equal(normalizePlanAiAllowances({ monthly: { dailyGenerationLimit: 0 } }).monthly.dailyGenerationLimit, 0);
});

test("dynamic model pricing calculates deterministic input and output token cost", () => {
  const pricing = normalizeAiModelPricing([
    { provider: "openai", model: "model-live", inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
    // Duplicate provider/model rows are deliberately ignored.
    { provider: "openai", model: "model-live", inputUsdPerMillion: 999, outputUsdPerMillion: 999 },
  ]);
  assert.equal(pricing.length, 1);
  const price = findAiModelPrice(pricing, "openai", "model-live");
  // USD/1M-token × token count equals micro-USD.
  assert.equal(calculateAiCostMicros(price, 1_000, 500), 7_500);
  assert.equal(findAiModelPrice(pricing, "openai", "new-model"), null);
});

test("school AI usage is transactional while own-key generation bypasses plan consumption", () => {
  const backend = read("api/_lib/revisionGenerate.ts");
  assert.match(backend, /runTransaction/);
  assert.match(backend, /normalizedReservations/);
  assert.match(backend, /if \(source !== "own"\)/);
  assert.match(backend, /finalizeUsage/);
  assert.match(backend, /INCOMPLETE_AI_TEST/);
  assert.match(backend, /Your API key does not use the school\/plan AI allowance/);
  assert.doesNotMatch(read("src/revision/engine/aiUsage.ts"), /setDoc\(usageDocRef/);
});

test("provider metadata supports actual usage with an estimate fallback", () => {
  const backend = read("api/_lib/revisionGenerate.ts");
  assert.match(backend, /usageMetadata/);
  assert.match(backend, /promptTokenCount/);
  assert.match(backend, /input_tokens/);
  assert.match(backend, /completion_tokens/);
  assert.match(backend, /source: actual \? "actual" : "estimated"/);
});

test("My Day free creation is Admin-configurable, daily-reset and server-authoritative", () => {
  const backend = read("api/_lib/myDay.ts");
  const app = read("src/MyDayApp.tsx");
  const rules = read("firestore.rules");
  const admin = read("src/admin/pages/SubscriptionsPage.tsx");
  assert.match(backend, /freeItemsPerDay \?\? 1/);
  assert.match(backend, /addedCount/);
  assert.match(backend, /MYDAY_DAILY_FREE_USED/);
  assert.match(backend, /runTransaction/);
  assert.match(backend, /dayKeyInZone/);
  assert.match(admin, /Non-subscriber daily free creations/);
  assert.match(app, /My Day remains browse-only until reset/);
  assert.match(rules, /match \/myDayUsage\/\{documentId\}/);
  assert.match(rules, /allow create, update, delete: if isAdmin\(\)/);
});
