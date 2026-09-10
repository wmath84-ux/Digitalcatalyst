import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  aiAllowanceForCycle,
  aiTokenUsagePercent,
  formatAiDailyTokens,
  normalizeAiAllowancePolicy,
  normalizeAiTokenBudgetValue,
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
  // Each cycle also carries the daily real-token budget; with no plan id it
  // inherits the `basic` tier default (2M tokens/day).
  assert.deepEqual(normalized.monthly, { dailyGenerationLimit: 12, costBudgetMicros: 1_250_000, dailyTokenBudget: 2_000_000 });
  assert.deepEqual(normalized.yearly, { dailyGenerationLimit: 45, costBudgetMicros: 9_500_000, dailyTokenBudget: 2_000_000 });
  assert.equal(aiAllowanceForCycle({ aiAllowances: normalized }, "yearly").dailyGenerationLimit, 45);
  assert.equal(usdToMicros("2.75"), 2_750_000);
});

test("the daily token budget is per plan, per cycle and survives a round trip", () => {
  // Plan-level budgets are what the operator edits under Plans; they are stored
  // inside the plan doc so checkout can snapshot them.
  const normalized = normalizePlanAiAllowances({
    monthly: { dailyTokenBudget: 2_000_000 },
    yearly: { dailyTokenBudget: 4_000_000 },
  }, "basic");
  assert.equal(normalized.monthly.dailyTokenBudget, 2_000_000);
  assert.equal(normalized.yearly.dailyTokenBudget, 4_000_000);
  // Cycle-level values win over the tier default, per cycle.
  const forCycle = aiAllowanceForCycle({ aiAllowances: normalized }, "yearly", "basic");
  assert.equal(forCycle.dailyTokenBudget, 4_000_000);
  // An unset cycle falls back to that tier's default, never to a global number.
  const unset = normalizePlanAiAllowances({}, "premium");
  assert.equal(unset.monthly.dailyTokenBudget, 5_000_000);
  assert.equal(unset.yearly.dailyTokenBudget, 5_000_000);
  assert.equal(normalizePlanAiAllowances({}, "free").monthly.dailyTokenBudget, 200_000);
  assert.equal(normalizePlanAiAllowances({}, "pro").monthly.dailyTokenBudget, 10_000_000);
  // 0 and negative both mean "no cap" so one field can switch a single plan off.
  assert.equal(normalizePlanAiAllowances({ monthly: { dailyTokenBudget: 0 } }, "pro").monthly.dailyTokenBudget, -1);
  assert.equal(normalizePlanAiAllowances({ monthly: { dailyTokenBudget: -1 } }, "pro").monthly.dailyTokenBudget, -1);
  // Absurd zero counts are clamped instead of silently going unlimited.
  assert.equal(normalizePlanAiAllowances({ monthly: { dailyTokenBudget: 9e12 } }, "basic").monthly.dailyTokenBudget, 1_000_000_000);
  // The shared standalone clamp agrees with the cycle normaliser.
  assert.equal(normalizeAiTokenBudgetValue("", 2_000_000), 2_000_000);
  assert.equal(normalizeAiTokenBudgetValue("250000"), 250_000);
  assert.equal(normalizeAiTokenBudgetValue(0), -1);
  assert.equal(normalizeAiTokenBudgetValue("abc", 200_000), 200_000);
  assert.equal(formatAiDailyTokens(2_000_000), "2M");
  assert.equal(formatAiDailyTokens(-1), "Unlimited");
  assert.equal(aiTokenUsagePercent(1_000_000, 2_000_000), 50);
  assert.equal(aiTokenUsagePercent(9, -1), 0);
});

test("the token budget is the default allowance kind for every layer", () => {
  // Absent/unknown values resolve to `token-budget` on the server policy AND on
  // the client config type, so no deployment can fall back to the count model
  // by accident and the admin UI never shows a different mode than the API.
  assert.equal(normalizeAiAllowancePolicy(undefined), "token-budget");
  assert.equal(normalizeAiAllowancePolicy(""), "token-budget");
  assert.equal(normalizeAiAllowancePolicy("legacy-count"), "token-budget");
  assert.equal(normalizeAiAllowancePolicy("hybrid"), "hybrid");
  assert.equal(normalizeAiAllowancePolicy("generation-only"), "generation-only");
  const adminSource = read(new URL("../src/admin/pages/RevisionPage.tsx", import.meta.url).pathname);
  const configSource = read(new URL("../src/revision/engine/aiConfig.ts", import.meta.url).pathname);
  assert.match(configSource, /allowancePolicy: "token-budget"/);
  assert.match(adminSource, /<option value="token-budget">/);
  assert.match(adminSource, /allowancePolicy,\s*\n\s*dailyTokenBudget: normalizeAiTokenBudgetValue/);
  // Token mode must not inherit the hybrid-only pricing requirement.
  assert.match(adminSource, /if \(allowancePolicy === "hybrid" && !modelPricing/);
});

test("every layer that states the limit states the same one", () => {
  const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  // Admin plan editor: one field per billing cycle.
  const plans = read("../src/admin/pages/SubscriptionsPage.tsx");
  assert.match(plans, /dailyTokenBudget: number/);
  assert.match(plans, /data-admin-plan-ai-daily-tokens/);
  assert.match(plans, /normalizePlanAiAllowances|normalizeAiTokenBudgetValue\(e\.target\.value, planTokenDefault\)/);
  // The offline fallback catalog must not promise different numbers than the
  // server will enforce for those same plans.
  const fallback = read("../src/subscription/data/fallbackCatalog.ts");
  assert.match(fallback, /dailyTokenBudget: 2_000_000/);
  assert.match(fallback, /dailyTokenBudget: 5_000_000/);
  assert.match(fallback, /dailyTokenBudget: 10_000_000/);
  // The learner-facing plan overview leads with the active allowance.
  const overview = read("../src/subscription/components/PlanOverview.tsx");
  assert.match(overview, /\/day, counted from real model usage and reset at your midnight/);
  // The profile card follows the enforced kind instead of assuming the count.
  const card = read("../src/components/AiQuotaCard.tsx");
  assert.match(card, /snap\.tokensEnabled/);
  assert.match(card, /AI tokens today/);
  // The admin's stored plan doc carries the field through checkout.
  const checkout = read("../api/_lib/subscriptions.ts");
  assert.match(checkout, /aiDailyTokenBudget/);
  const ledger = read("../api/_lib/revisionGenerate.ts");
  assert.match(ledger, /tokensUsedDay: tokensBeforeToday \+ tokensChargedToday/);
});

test("the operator can read the same numbers the server enforces", () => {
  const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
  // Admin SDK is the only writer; the customer panel reads the one ledger.
  const rules = read("../firestore.rules");
  const aiUsageRules = rules.slice(rules.indexOf("match /aiUsage/{documentId}"));
  assert.match(aiUsageRules.slice(0, 700), /allow read: if documentId == 'current' && \(isOwner\(uid\) \|\| isAdmin\(\)\);/);
  assert.match(aiUsageRules.slice(0, 700), /allow create, update, delete: if false;/);
  const adminClient = read("../src/lib/admin/client.ts");
  assert.match(adminClient, /getDoc\(doc\(db,"users",uid,"aiUsage","current"\)\)/);
  assert.match(adminClient, /const mapAiUsage=/);
  const detail = read("../src/admin/pages/CustomerDetailPage.tsx");
  assert.match(detail, /data-admin-ai-today/);
  assert.match(detail, /aiUsage\.tokensUsedDay\.toLocaleString\("en-US"\)/);
  // A stale day's total must never be adopted by a new day's key.
  const server = read("../api/_lib/revisionGenerate.ts");
  const reserve = server.slice(server.indexOf("async function reserveUsage"));
  assert.match(reserve.slice(0, 4000), /tokensUsedDay: String\(data\.tokensDayKey \|\| ""\) === currentDay/);
  assert.match(server, /tokensUsedDay: tokensBeforeToday \+ tokensChargedToday/);
  assert.match(server, /usage\.totalTokens/);
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
