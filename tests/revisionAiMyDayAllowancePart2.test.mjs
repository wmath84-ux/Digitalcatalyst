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
import { normalizeCompleteAiQuestions } from "../utils/aiGeneratedTest.js";

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

test("only complete four-option AI tests are eligible to consume an allowance", () => {
  const complete = {
    prompt: "Which value is prime?",
    options: ["4", "5", "6", "8"],
    correctIndex: 1,
    explanation: "Five has exactly two factors.",
    difficulty: "easy",
  };
  const normalized = normalizeCompleteAiQuestions({ questions: [
    complete,
    { ...complete, prompt: "Only two options", options: ["A", "B"] },
    { ...complete, prompt: "Duplicate options", options: ["A", "A", "B", "C"] },
    { ...complete, prompt: "No explanation", explanation: "" },
    { ...complete, prompt: "Invalid answer", correctIndex: 7 },
    { ...complete }, // duplicate prompt is not a distinct test question
  ] }, "medium");
  assert.deepEqual(normalized, [complete]);
});

test("school AI usage is transactional while own-key generation bypasses plan consumption", () => {
  const backend = read("api/_lib/revisionGenerate.ts");
  const browserUsage = read("src/revision/engine/aiUsage.ts");
  const rules = read("firestore.rules");
  assert.match(backend, /runTransaction/);
  assert.match(backend, /normalizedReservations/);
  assert.match(backend, /if \(source !== "own"\)/);
  assert.match(backend, /finalizeUsage/);
  assert.match(backend, /INCOMPLETE_AI_TEST/);
  assert.match(backend, /releaseUsage\(user\.uid, reservation\.id\)/);
  assert.match(backend, /Your API key does not use the school\/plan AI allowance/);
  assert.doesNotMatch(browserUsage, /setDoc\(usageDocRef/);
  assert.match(rules, /match \/aiUsage\/\{documentId\}[\s\S]*?allow create, update, delete: if false;/);
});

test("profile uses the authenticated status response and exposes live reset information", () => {
  const usage = read("src/revision/engine/aiUsage.ts");
  const card = read("src/components/AiQuotaCard.tsx");
  const backend = read("api/_lib/revisionGenerate.ts");
  assert.match(usage, /return parseAiUsageSnapshot\(payload\.usage\)/);
  assert.match(usage, /AiUsageSubscriptionState/);
  assert.match(backend, /dailyResetsAt: nextDayResetAt/);
  assert.match(card, /data-ai-quota-refresh/);
  assert.match(card, /dailyResetIn/);
  assert.match(card, /snap\.planName/);
  assert.match(card, /formatCycle\(snap\.cycle\)/);
  assert.match(card, /Provider failure, incomplete output and your own API key do not use this allowance/);
});

test("AI allowance card is imported, rendered and reachable from both profile routes", () => {
  const main = read("src/main.tsx");
  const profile = read("src/profile/App.tsx");
  const revisionApp = read("src/revision/RevisionApp.tsx");
  const revisionProfile = read("src/revision/pages/RevisionProfilePage.tsx");
  assert.match(main, /hash\.startsWith\(PROFILE_HASH\)[\s\S]*?<ProfileApp/);
  assert.match(profile, /import AiQuotaCard/);
  assert.match(profile, /membership\.subscriber \? <AiQuotaCard uid=\{user\.id\}/);
  assert.match(revisionApp, /path\.startsWith\("#\/revision\/profile"\)[\s\S]*?<RevisionProfilePage/);
  assert.match(revisionProfile, /import AiQuotaCard/);
  assert.match(revisionProfile, /<AiQuotaCard uid=\{uid\} \/>/);
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
  const card = read("src/components/MyDayAllowanceCard.tsx");
  const rules = read("firestore.rules");
  const admin = read("src/admin/pages/SubscriptionsPage.tsx");
  assert.match(backend, /freeItemsPerDay \?\? 1/);
  assert.match(backend, /addedCount/);
  assert.match(backend, /MYDAY_DAILY_FREE_USED/);
  assert.match(backend, /runTransaction/);
  assert.match(backend, /dayKeyInZone/);
  assert.match(admin, /Non-subscriber daily free creations/);
  assert.match(card, /My Day remains browse-only until reset/);
  assert.match(rules, /match \/myDayUsage\/\{documentId\}/);
  assert.match(rules, /allow create, update, delete: if isAdmin\(\)/);
});

test("the My Day free-allowance summary lives on Profile, never on the My Day dashboard", () => {
  const app = read("src/MyDayApp.tsx");
  const profile = read("src/profile/App.tsx");
  const card = read("src/components/MyDayAllowanceCard.tsx");

  // The old banner strip must not come back to the My Day page.
  assert.doesNotMatch(app, /data-myday-free-allowance/);
  assert.doesNotMatch(app, /free creation\$\{freeLimit === 1/);
  assert.doesNotMatch(app, /available today/);
  assert.doesNotMatch(app, /free creation allowance has been used/);

  // Profile renders the redesigned card and wires both CTAs.
  assert.match(profile, /import MyDayAllowanceCard from "\.\.\/components\/MyDayAllowanceCard"/);
  assert.match(profile, /<MyDayAllowanceCard[\s\S]*?onOpenMyDay=\{\(\) => \{ window\.location\.hash = "#\/my-day"; \}\}[\s\S]*?onSubscribe=\{openPlans\}/);

  // The card is server-authoritative: same hook, no local entitlement math.
  assert.match(card, /useMyDayAccess/);
  assert.match(card, /data-myday-allowance-card/);
  assert.match(card, /data-myday-allowance-state/);
  assert.match(card, /data-myday-allowance-refresh/);
  assert.match(card, /freeRemaining/);
  assert.match(card, /freeUsed/);
  assert.match(card, /resetAt/);
});
