// tests/revisionAiDailyTokenBudgetRuntime.test.mjs
//
// Runtime contract for the daily REAL-token allowance — the limit the school
// activates instead of "N successful tests per day":
//
//   · it is the DEFAULT kind (a catalog with no `allowancePolicy` enforces it);
//   · the number comes from the provider's own usage report, written by the
//     server into `users/{uid}/aiUsage/current`, never from the browser;
//   · it is per plan AND per billing cycle (basic 2M/day, premium 5M, pro 10M);
//   · it resets at the learner's local midnight by way of a day key, so no cron
//     job and no client-visible counter can keep them locked out;
//   · activating it stands the count/window/cost checks down, and switching back
//     to a legacy kind restores them — no migration in either direction.
//
// The REAL module is bundled with esbuild against an in-memory Firestore, so
// these assertions run the shipped transaction code paths rather than a copy.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
// Inside the repo (and inside node_modules, so it is never committed) because
// the bundle imports the Firestore stub as a sibling file.
const OUT_DIR = path.join(ROOT, "node_modules/.tmp-ai-token-budget-contract");
const STUB = path.join(OUT_DIR, "firebaseAdminStub.mjs");
const OUT = path.join(OUT_DIR, "revisionGenerate.mjs");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(STUB, `
const store = new Map();
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

class Doc {
  constructor(p) { this.path = p; }
  collection(name) { return new Col(\`\${this.path}/\${name}\`); }
  async get() {
    const data = store.get(this.path);
    return {
      exists: data !== undefined,
      id: this.path.split("/").pop(),
      ref: this,
      data: () => clone(data),
    };
  }
  async set(data, opts) {
    const prev = opts && opts.merge ? store.get(this.path) || {} : {};
    store.set(this.path, { ...clone(prev), ...clone(data) });
    return { writeTime: { seconds: Math.floor(Date.now() / 1000) } };
  }
  async update(data) {
    const prev = store.get(this.path) || {};
    store.set(this.path, { ...clone(prev), ...clone(data) });
    return {};
  }
  async delete() { store.delete(this.path); return {}; }
}

class Col {
  constructor(p) { this.path = p; }
  doc(id) { return new Doc(id ? \`\${this.path}/\${id}\` : \`\${this.path}/auto\`); }
}

export const db = {
  __store: store,
  collection(name) { return new Col(name); },
  // Transactions run immediately; the assertions here care about the resulting
  // ledger document, which is what a real commit would leave behind.
  async runTransaction(cb) {
    return cb({
      get: (ref) => ref.get(),
      set: (ref, data, opts) => ref.set(data, opts),
      update: (ref, data) => ref.update(data),
      delete: (ref) => ref.delete(),
    });
  },
};

export function adminDb() { return db; }
export function errorResponse(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}
export async function requireFirebaseUser(req) { return { uid: req.__uid || "learner-1" }; }
`);

let runtime = null;
let personalAi = null;
let store = null;
let loadError = null;
try {
  const esbuildPkg = path.join(ROOT, "node_modules/esbuild");
  if (!fs.existsSync(esbuildPkg)) throw new Error("esbuild is not installed");
  const { build } = await import(pathToFileURL(path.join(esbuildPkg, "lib/main.js")).href);
  await build({
    entryPoints: [path.join(ROOT, "api/_lib/revisionGenerate.ts")],
    outfile: OUT,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    logLevel: "silent",
    plugins: [{
      name: "in-memory-firestore",
      setup(build) {
        // The server module imports its Firebase helpers relatively, so the stub
        // is swapped in by path (esbuild keeps the specifier verbatim) and the
        // test file imports the very same module instance to seed and inspect it.
        build.onResolve({ filter: /firebaseAdmin\.js$/ }, () => ({
          path: "./firebaseAdminStub.mjs",
          external: true,
        }));
      },
    }],
  });
  await build({
    entryPoints: [path.join(ROOT, "api/_lib/personalAi.ts")],
    outfile: path.join(OUT_DIR, "personalAi.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    logLevel: "silent",
    plugins: [{
      name: "in-memory-firestore",
      setup(build) {
        build.onResolve({ filter: /firebaseAdmin\.js$/ }, () => ({
          path: "./firebaseAdminStub.mjs",
          external: true,
        }));
      },
    }],
  });
  const stub = await import(pathToFileURL(STUB).href);
  store = stub.db.__store;
  runtime = (await import(pathToFileURL(OUT).href)).revisionAiRuntime;
  personalAi = await import(pathToFileURL(path.join(OUT_DIR, "personalAi.mjs")).href);
} catch (error) {
  loadError = error;
}

after(() => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
});

const skipIfUnloaded = !runtime;
const TODAY = new Date().toISOString().slice(0, 10);

/** The single authoritative ledger, as the server wrote it. */
const ledger = (uid = "learner-1") => store.get(`users/${uid}/aiUsage/current`) || {};
const seed = (p, data) => store.set(p, data);
const clearLedger = () => store.set("users/learner-1/aiUsage/current", {
  dayKey: TODAY,
  dayCount: 0,
  stamps: [],
  tokensDayKey: TODAY,
  tokensUsedDay: 0,
  reservations: {},
});

const ACTIVE_BASIC = {
  status: "active",
  planId: "basic",
  planName: "Basic",
  cycle: "monthly",
  features: ["my-day", "revision", "ai-mentor"],
  expiresAt: Date.now() + 30 * 86_400_000,
  activatedAt: Date.now() - 86_400_000,
};

function seedBasicPlan({ monthlyTokens = 2_000_000, yearlyTokens = 3_000_000, snapshot } = {}) {
  seed("users/learner-1/subscription/current", { ...ACTIVE_BASIC, ...(snapshot || {}) });
  seed("subscriptionPlans/basic", {
    id: "basic",
    name: "Basic",
    aiAllowances: {
      monthly: { dailyGenerationLimit: 20, costBudgetMicros: -1, dailyTokenBudget: monthlyTokens },
      yearly: { dailyGenerationLimit: 40, costBudgetMicros: -1, dailyTokenBudget: yearlyTokens },
    },
  });
}

async function policyFor(settings, uid = "learner-1") {
  return runtime.resolveEffectiveAiPolicy(uid, settings);
}

async function grab(policy, estimatedIn, estimatedOut, uid = "learner-1", tz = 0) {
  return runtime.reserveUsage(uid, policy, null, estimatedIn, estimatedOut, tz);
}

async function settle(policy, reservation, usage, uid = "learner-1", tz = 0) {
  return runtime.finalizeUsage(
    uid,
    policy,
    reservation,
    usage,
    null,
    { provider: "openai", model: "gpt-4o-mini" },
    tz,
  );
}

const errorCode = (error) => `${error?.statusCode ?? ""}:${error?.code ?? ""}`;

test("a catalog that never chose a policy enforces the daily token budget", { skip: skipIfUnloaded ? `runtime unavailable: ${loadError?.message}` : false }, async () => {
  clearLedger();
  // Free learner: no subscription doc at all.
  const policy = await policyFor({ provider: "openai", model: "gpt-4o-mini" });
  assert.equal(policy.tokenBudgetEnabled, true, "token budget is the default kind");
  assert.equal(policy.dailyTokenBudget, 200_000, "free learners fall back to the catalog budget");
  // The deactivated model reports itself as unlimited, so the profile card and
  // the enforcement can never disagree about what the limit is.
  assert.equal(policy.dailyLimit, 0);
  assert.equal(policy.windowLimit, -1);
  assert.equal(policy.costEnabled, false);
});

test("the budget follows the plan and the billing cycle the learner bought", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seedBasicPlan();
  const monthly = await policyFor({});
  assert.equal(monthly.dailyTokenBudget, 2_000_000, "basic monthly is the operator's 2M/day");
  assert.equal(monthly.tokenBudgetEnabled, true);

  seed("users/learner-1/subscription/current", { ...ACTIVE_BASIC, cycle: "yearly" });
  const yearly = await policyFor({});
  assert.equal(yearly.dailyTokenBudget, 3_000_000, "yearly is configured independently");

  // A plan that configured nothing for this tier keeps the tier default rather
  // than silently becoming unlimited.
  seed("subscriptionPlans/basic", { id: "basic", name: "Basic" });
  const unset = await policyFor({});
  assert.equal(unset.dailyTokenBudget, 2_000_000);
});

test("the ledger counts the provider's real tokens, not the reservation's estimate", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seedBasicPlan();
  const policy = await policyFor({});
  const reservation = await grab(policy, 500_000, 200_000);
  assert.equal(reservation.estimatedTokens, 700_000, "the estimate is held while the call is in flight");

  // The provider reports far fewer tokens than the worst-case estimate.
  const snapshot = await settle(policy, reservation, {
    inputTokens: 9_100,
    outputTokens: 2_400,
    totalTokens: 11_500,
    source: "actual",
  });
  assert.equal(snapshot.tokensUsedDay, 11_500, "real usage is what gets charged");
  assert.equal(snapshot.tokensRemaining, 2_000_000 - 11_500);
  assert.equal(store.get("users/learner-1/aiUsage/current").tokensUsedDay, 11_500);
  assert.equal(store.get("users/learner-1/aiUsage/current").lastUsage.usageSource, "actual");
  assert.deepEqual(
    { in: store.get("users/learner-1/aiUsage/current").lastUsage.inputTokens, out: store.get("users/learner-1/aiUsage/current").lastUsage.outputTokens },
    { in: 9_100, out: 2_400 },
    "the operator sees the provider's own per-request numbers",
  );

  // Two more real requests accumulate on the same day.
  const second = await settle(policy, await grab(policy, 1_000, 1_000), {
    inputTokens: 800, outputTokens: 200, totalTokens: 1_000, source: "actual",
  });
  assert.equal(second.tokensUsedDay, 12_500);
});

test("a request bigger than the remaining budget is refused; a smaller one still fits", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seed("users/learner-1/aiUsage/current", {
    dayKey: TODAY,
    dayCount: 0,
    stamps: [],
    tokensDayKey: TODAY,
    tokensUsedDay: 1_995_000,
    reservations: {},
  });
  seedBasicPlan();
  const policy = await policyFor({});

  await assert.rejects(
    () => grab(policy, 300_000, 200_000),
    (error) => errorCode(error) === "429:AI_TOKEN_BUDGET_REACHED" && /only 5,000 are left/.test(error.message),
    "an over-budget request is rejected with the exact remaining amount",
  );
  assert.equal(store.get("users/learner-1/aiUsage/current").tokensUsedDay, 1_995_000, "a refusal spends nothing");

  const fits = await grab(policy, 3_000, 1_000);
  assert.equal(fits.estimatedTokens, 4_000);
  await runtime.releaseUsage("learner-1", fits.id);

  // The whole day spent is a different refusal: nothing can fit.
  seed("users/learner-1/aiUsage/current", {
    dayKey: TODAY, dayCount: 3, stamps: [], tokensDayKey: TODAY, tokensUsedDay: 2_000_000, reservations: {},
  });
  await assert.rejects(
    () => grab(policy, 1, 1),
    (error) => errorCode(error) === "429:AI_TOKEN_BUDGET_REACHED" && /token budget is used up/.test(error.message),
  );
});

test("the budget resets on the learner's day key instead of a cron job", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seedBasicPlan();
  const policy = await policyFor({});
  const reservation = await grab(policy, 900_000, 100_000);
  await settle(policy, reservation, { inputTokens: 990_000, outputTokens: 10_000, totalTokens: 1_000_000, source: "actual" });
  seed("users/learner-1/aiUsage/current", {
    ...store.get("users/learner-1/aiUsage/current"),
    tokensDayKey: "1999-01-01",
    dayKey: "1999-01-01",
  });
  const after = await runtime.getUsageStatus("learner-1", policy, 0);
  assert.equal(after.tokensUsedDay, 0, "yesterday's spend is gone");
  assert.equal(after.tokensRemaining, 2_000_000);
  assert.equal(after.allowed, true);
  assert.ok(after.tokensResetsAt > Date.now(), "the card gets a countdown it can show");
});

test("the deactivated counter cannot block a learner who still has tokens", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seedBasicPlan();
  const policy = await policyFor({});
  // The old model would have stopped this learner at 20 tests/day; the ledger
  // already carries 25 of them plus a rolling window full of stamps.
  seed("users/learner-1/aiUsage/current", {
    dayKey: TODAY,
    dayCount: 25,
    stamps: Array.from({ length: 30 }, (_, i) => Date.now() - i * 60_000),
    tokensDayKey: TODAY,
    tokensUsedDay: 1_000,
    reservations: {},
  });
  const status = await runtime.getUsageStatus("learner-1", policy, 0);
  assert.equal(status.allowed, true, "switching kinds really switches them off");
  assert.equal(status.dailyUsed, 25, "history is still visible to the operator");
  assert.equal(status.tokensEnabled, true);
  assert.equal(status.dailyLimit, 0, "and the card is told there is no count cap");

  const reservation = await grab(policy, 1_000, 1_000);
  assert.ok(reservation.id);
});

test("switching back to Generation-only restores the legacy counter exactly", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seedBasicPlan();
  // A subscriber's count cap comes from their plan (not the catalog fallback),
  // so the legacy restore is tested against the plan's own number.
  seed("subscriptionPlans/basic", {
    id: "basic",
    name: "Basic",
    aiAllowances: {
      monthly: { dailyGenerationLimit: 3, costBudgetMicros: -1, dailyTokenBudget: 2_000_000 },
      yearly: { dailyGenerationLimit: 3, costBudgetMicros: -1, dailyTokenBudget: 3_000_000 },
    },
  });
  const legacy = await policyFor({
    allowancePolicy: "generation-only",
    dailyLimit: 3,
    windowHours: 5,
    windowLimit: -1,
    dailyTokenBudget: 200_000,
  });
  assert.equal(legacy.tokenBudgetEnabled, false);
  assert.equal(legacy.dailyLimit, 3, "the old cap is live again");
  assert.equal(legacy.dailyTokenBudget, 2_000_000, "the stored budget survives, it is just not enforced");

  seed("users/learner-1/aiUsage/current", {
    dayKey: TODAY, dayCount: 3, stamps: [], tokensDayKey: TODAY, tokensUsedDay: 10, reservations: {},
  });
  await assert.rejects(
    () => grab(legacy, 10, 10),
    (error) => errorCode(error) === "429:AI_ALLOWANCE_REACHED" && /Daily school-AI allowance reached/.test(error.message),
  );
  // Tokens alone never block in this mode, even past the stored budget.
  seed("users/learner-1/aiUsage/current", {
    dayKey: TODAY, dayCount: 0, stamps: [], tokensDayKey: TODAY, tokensUsedDay: 9_999_999, reservations: {},
  });
  const ok = await grab(legacy, 10, 10);
  assert.ok(ok.id);
});

test("crossing midnight mid-generation cannot re-charge yesterday's tokens", { skip: skipIfUnloaded }, async () => {
  clearLedger();
  seedBasicPlan();
  const policy = await policyFor({});
  // Yesterday the learner spent nearly the whole budget. Today nothing is spent
  // yet, so a reservation is allowed — and it must NOT adopt the old total when
  // it stamps today's day key on the ledger.
  seed("users/learner-1/aiUsage/current", {
    dayKey: "1999-01-01",
    dayCount: 4,
    stamps: [],
    tokensDayKey: "1999-01-01",
    tokensUsedDay: 1_990_000,
    reservations: {},
  });
  const reservation = await grab(policy, 1_000, 1_000);
  const afterReserve = store.get("users/learner-1/aiUsage/current");
  assert.equal(afterReserve.tokensDayKey, TODAY);
  assert.equal(afterReserve.tokensUsedDay, 0, "the stale day's total is dropped, not adopted");
  // Only this request's hold is against today's budget.
  const status = await runtime.getUsageStatus("learner-1", policy, 0);
  assert.equal(status.tokensUsedDay, 0);
  assert.equal(status.tokensRemaining, 2_000_000 - 2_000);
  await settle(policy, reservation, { inputTokens: 700, outputTokens: 300, totalTokens: 1_000, source: "actual" });
  const final = store.get("users/learner-1/aiUsage/current");
  assert.equal(final.tokensUsedDay, 1_000, "yesterday's 1.99M never joined today's total");
});

test("the AI Mentor gate is enforced server-side in the one place every model call passes", () => {
  // The entitlement cannot live in the browser: `groundedCompletion` is the
  // single choke point both `personalAi.ask` and `personalAi.generate` funnel
  // through, so the check cannot be skipped by calling another action.
  const personalAi = fs.readFileSync(path.join(ROOT, "api/_lib/personalAi.ts"), "utf8");
  const gate = personalAi.slice(personalAi.indexOf("async function assertAiMentorEntitlement"));
  assert.ok(gate.length > 400, "the gate exists");
  assert.match(gate, /subscriptionFeatures"\)\.doc\(AI_MENTOR_FEATURE_ID\)/);
  assert.match(gate, /if \(!featureSnap\.exists \|\| featureSnap\.data\(\)\?\.active === false\) return;/,
    "an unconfigured or deactivated feature keeps today's open behaviour");
  assert.match(gate, /AI_MENTOR_FEATURE_ID\)/, "the plan's own feature list decides");
  assert.match(gate, /403,\s*\n\s*"AI_MENTOR_PLAN_REQUIRED"/);
  const grounded = personalAi.slice(personalAi.indexOf("async function groundedCompletion"));
  const callSite = grounded.slice(0, grounded.indexOf("const requestedSource"));
  assert.match(callSite, /await assertAiMentorEntitlement\(adminDb\(\), uid\);/, "checked before any provider call");
  assert.match(callSite, /if \(!policy\.hasAccess\)/, "after the allowance access check");

  // The client only ever receives a mapped failure, never a trust-me flag.
  const client = fs.readFileSync(path.join(ROOT, "utils/personalAi.js"), "utf8");
  assert.match(client, /case "AI_MENTOR_PLAN_REQUIRED":/);
  assert.match(client, /kind: "entitlement"/);
});

/* ------------------------------------------------------------------ */
/*  The AI Mentor subscription gate, driven through the real handler   */
/* ------------------------------------------------------------------ */

function fakeRes() {
  const out = { status: 0, body: null, headers: {} };
  const res = {
    setHeader(key, value) { out.headers[key] = value; },
    status(code) { out.status = code; return res; },
    json(body) { out.body = body; return res; },
    end() { return res; },
    send(body) { out.body = body; return res; },
  };
  return { res, out };
}

/** One AI Mentor question, asked the way the course player asks it. */
async function askMentor(uid = "learner-1") {
  const { res, out } = fakeRes();
  await personalAi.handlePersonalAi({
    method: "POST",
    headers: {},
    __uid: uid,
    body: {
      action: "personalAi.ask",
      question: "Summarise what this module expects from me.",
      courseContext: { productId: "product-1", courseTitle: "Physics" },
    },
  }, res);
  return out;
}

test("the mentor stays open while the school has not configured the feature", { skip: skipIfUnloaded }, async () => {
  store.delete("subscriptionFeatures/ai-mentor");
  store.delete("users/learner-1/subscription/current");
  const out = await askMentor();
  // The request gets as far as the missing provider configuration, which it
  // only reaches after the entitlement check — a fresh database keeps working
  // exactly as it does today.
  assert.notEqual(out.body?.code, "AI_MENTOR_PLAN_REQUIRED", JSON.stringify(out.body));
  assert.equal(out.body?.code, "AI_NOT_CONFIGURED");
});

test("activating the feature gates the mentor on the server, not the browser", { skip: skipIfUnloaded }, async () => {
  seed("subscriptionFeatures/ai-mentor", { id: "ai-mentor", name: "AI Mentor", active: true });
  store.delete("users/learner-1/subscription/current");

  const out = await askMentor();
  assert.equal(out.status, 403);
  assert.equal(out.body.code, "AI_MENTOR_PLAN_REQUIRED");
  assert.match(out.body.message, /AI Mentor isn't included/);
  // The client mapper ran on the server too, so the player gets an actionable
  // failure shape instead of a raw 403.
  assert.equal(out.body.upgrade, true, "the UI is told to offer an upgrade");
  assert.equal(out.body.retryable, false);
  assert.equal(out.body.kind, "entitlement");

  assert.equal(out.body.ok, false, "the failure is a plain mapped error, not a crash");
});

test("which plan unlocks the mentor is the plan's own feature list", { skip: skipIfUnloaded }, async () => {
  seed("subscriptionFeatures/ai-mentor", { id: "ai-mentor", name: "AI Mentor", active: true });

  // Revision Studio without the mentor feature: the entitlement is per plan, so
  // a plan that does not ship `ai-mentor` does not get the model call.
  seed("users/learner-1/subscription/current", {
    ...ACTIVE_BASIC,
    features: ["my-day", "revision"],
  });
  const blocked = await askMentor();
  assert.equal(blocked.body.code, "AI_MENTOR_PLAN_REQUIRED");
  assert.match(blocked.body.message, /Basic/, "the learner is told which plan they hold");

  // The same membership once its plan includes the feature.
  seed("users/learner-1/subscription/current", {
    ...ACTIVE_BASIC,
    features: ["my-day", "revision", "ai-mentor"],
  });
  const allowed = await askMentor();
  assert.notEqual(allowed.body.code, "AI_MENTOR_PLAN_REQUIRED", JSON.stringify(allowed.body));

  // A membership stored before feature ids were recorded keeps the entitlement
  // Revision and My Day already give it, instead of losing the tutor.
  seed("users/learner-1/subscription/current", { ...ACTIVE_BASIC, features: undefined });
  const legacy = await askMentor();
  assert.notEqual(legacy.body.code, "AI_MENTOR_PLAN_REQUIRED", JSON.stringify(legacy.body));

  // Lapsed memberships are re-checked: the feature list cannot outlive the term.
  seed("users/learner-1/subscription/current", {
    ...ACTIVE_BASIC,
    features: ["my-day", "revision", "ai-mentor"],
    status: "expired",
    expiresAt: Date.now() - 86_400_000,
  });
  const expired = await askMentor();
  assert.equal(expired.status, 403);
  assert.equal(expired.body.code, "AI_MENTOR_PLAN_REQUIRED");
});

test("the gate runs before any provider call, and only for model calls", { skip: skipIfUnloaded }, async () => {
  seed("subscriptionFeatures/ai-mentor", { id: "ai-mentor", name: "AI Mentor", active: true });
  store.delete("users/learner-1/subscription/current");
  // `personalAi.usage.status` must keep answering: the allowance card and the
  // paywall copy need to render for a learner who is not entitled.
  const { res, out } = fakeRes();
  await personalAi.handlePersonalAi({
    method: "POST", headers: {}, __uid: "learner-1",
    body: { action: "personalAi.usage.status", tzOffsetMinutes: 0 },
  }, res);
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.ok, true);
  assert.equal(out.body.data.usage.tokensEnabled, true, "the new kind is what the card reports");

  // Reading saved context is likewise untouched.
  const ctxRes = fakeRes();
  await personalAi.handlePersonalAi({
    method: "POST", headers: {}, __uid: "learner-1",
    body: { action: "personalAi.context", courseContext: { productId: "product-1" } },
  }, ctxRes.res);
  assert.notEqual(ctxRes.out.body?.code, "AI_MENTOR_PLAN_REQUIRED");
});
