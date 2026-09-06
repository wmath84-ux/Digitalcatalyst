// tests/subscriptionGateLogicContract.test.mjs
//
// Contract for Phase-2 of the new subscription logic: the admin's
// kill switch + per-feature / per-duration / per-tier matrix +
// subscriber-only price + usage-limit wiring. Pins the entire
// `settings/subscriptionGate` shape and the rules that combine it
// with the per-feature access snapshot, the plan picker, the
// subscription page chrome and the profile widget.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const admin = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const adminPage = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const gateServer = fs.readFileSync("api/_lib/subscriptionGate.ts", "utf8");
const gateServerHandler = fs.readFileSync("api/_lib/subscriptionGateServer.ts", "utf8");
const leaderboard = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
const myDayServer = fs.readFileSync("api/_lib/myDay.ts", "utf8");
const pricing = fs.readFileSync("utils/subscriptionPricing.js", "utf8");
const pricingTypes = fs.readFileSync("utils/subscriptionPricing.d.ts", "utf8");
const subscriptionPage = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const planOverview = fs.readFileSync("src/subscription/components/PlanOverview.tsx", "utf8");
const subscriberBadge = fs.readFileSync("src/components/subscription/SubscriberActiveBadge.tsx", "utf8");
const subscriberPriceBadge = fs.readFileSync("src/components/subscription/SubscriberOnlyPriceBadge.tsx", "utf8");
const hiddenHint = fs.readFileSync("src/components/subscription/HiddenFeatureHint.tsx", "utf8");
const gateHook = fs.readFileSync("src/hooks/useSubscriptionGateLogic.ts", "utf8");
const featureVisibility = fs.readFileSync("src/hooks/useFeatureVisibility.ts", "utf8");
const usageHook = fs.readFileSync("src/hooks/useUsageThisMonth.ts", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

// ---------------------------------------------------------------------------
// 1. Server model — the canonical shape + the resolvers
// ---------------------------------------------------------------------------

test("server model defines the SUBSCRIPTION_GATE_DEFAULTS with safe fallbacks", () => {
  // The defaults intentionally preserve the legacy "paywall on access"
  // behaviour and turn off the new hide-until-purchased model, so a
  // fresh database behaves like before.
  assert.match(gateServer, /SUBSCRIPTION_GATE_DEFAULTS[\s\S]*?oldGateEnabled:\s*true/);
  assert.match(gateServer, /SUBSCRIPTION_GATE_DEFAULTS[\s\S]*?hideUntilPurchasedEnabled:\s*false/);
  assert.match(gateServer, /SUBSCRIPTION_GATE_DEFAULTS[\s\S]*?features:\s*\{\}/);
  assert.match(gateServer, /SUBSCRIPTION_GATE_DEFAULTS[\s\S]*?subscriberPricing:\s*\{\}/);
  assert.match(gateServer, /SUBSCRIPTION_GATE_DEFAULTS[\s\S]*?aiQuestionsPerDay:\s*\{\}/);
});

test("server model normalises every section of the document", () => {
  // The reader strips unknown keys, coerces booleans / numbers, and
  // returns a fully-typed object even when fields are missing.
  assert.match(gateServer, /function\s+normaliseFeatureRow\(/);
  assert.match(gateServer, /function\s+normalisePlanRow\(/);
  assert.match(gateServer, /function\s+normalisePricingOverride\(/);
  assert.match(gateServer, /function\s+normaliseUsageLimits\(/);
  assert.match(gateServer, /function\s+getSubscriptionGateSettings\(/);
});

test("subscriptionGate reader uses the shared Admin Firestore accessor", () => {
  // `getFirestore` is NOT exported by firebaseAdmin (only `adminDb` is).
  // Importing it was a build/runtime break in the `api/referral-leaderboard`
  // bundle — which also serves `/api/myday` — so every My Day create failed.
  // The reader must import `adminDb` and call it.
  assert.match(gateServer, /import\s*\{\s*adminDb\s*\}\s*from\s*"\.\/firebaseAdmin\.js"/);
  assert.doesNotMatch(gateServer, /import\s*\{\s*getFirestore\s*\}\s*from\s*"\.\/firebaseAdmin\.js"/);
  assert.match(gateServer, /const\s+db\s*=\s*adminDb\(\);/);
  // Admin Firestore uses reference methods and a boolean `exists` property,
  // not the client SDK's standalone doc/getDoc functions or exists() method.
  assert.match(gateServer, /db\.doc\("settings\/subscriptionGate"\)\.get\(\)/);
  assert.doesNotMatch(gateServer, /firebase-admin\/firestore/);
  assert.doesNotMatch(gateServer, /snap\.exists\(\)/);
});

test("server model honours the subscriber-only price rule", () => {
  // The resolver returns the public price when the caller is NOT a
  // subscriber, even if an override exists. The override only takes
  // effect for an active subscriber.
  assert.match(
    gateServer,
    /function\s+resolveSubscriberOnlyPrice\(/,
    "resolveSubscriberOnlyPrice is exported from the server",
  );
  assert.match(
    gateServer,
    /if\s*\(!isSubscriber\)\s*return\s+basePrice/,
    "non-subscribers always get the public price",
  );
  assert.match(
    gateServer,
    /if\s*\(Number\(candidate\)\s*<=\s*0\)\s*return\s+basePrice/,
    "a zero / negative override falls back to the public price",
  );
});

test("server model resolves the per-plan AI-questions-per-day cap", () => {
  assert.match(
    gateServer,
    /function\s+resolveAiQuestionsPerDay\(/,
    "resolveAiQuestionsPerDay is exported",
  );
  assert.match(
    gateServer,
    /const\s+planCap\s*=\s*settings\.usageLimits\?\.aiQuestionsPerDay\?\.\[planId\]/,
    "the per-plan cap is read from the settings doc",
  );
  assert.match(
    gateServer,
    /if\s*\(Number\(featureCap\)\s*<=\s*0\)\s*return\s+null/,
    "a zero / negative feature cap resolves to 'unlimited'",
  );
});

// ---------------------------------------------------------------------------
// 2. Public read endpoint — `/api/subscription-gate`
// ---------------------------------------------------------------------------

test("the public read endpoint is wired through the leaderboard dispatcher", () => {
  // The endpoint is a rewrite to `/api/referral-leaderboard` so the
  // project stays within the 12-function Hobby cap.
  const rewrite = vercel.rewrites.find((r) => r.source === "/api/subscription-gate");
  assert.ok(rewrite, "vercel.json rewrites /api/subscription-gate");
  assert.equal(rewrite.destination, "/api/referral-leaderboard", "rewrite points to the leaderboard dispatcher");
  // The leaderboard dispatches by path.
  assert.match(
    leaderboard,
    /path\s*===\s*"\/api\/subscription-gate"/,
    "leaderboard recognises the new path",
  );
  assert.match(
    leaderboard,
    /return\s+handleSubscriptionGate\(req,\s*res\)/,
    "leaderboard dispatches the path to handleSubscriptionGate",
  );
  assert.match(leaderboard, /import\s*\{\s*handleSubscriptionGate\s*\}\s*from\s*"\.\/_lib\/subscriptionGateServer\.js"/);
});

test("the public read handler is GET-only and returns the settings doc", () => {
  assert.match(gateServerHandler, /if\s*\(req\.method\s*!==\s*"GET"\)/);
  assert.match(gateServerHandler, /getSubscriptionGateSettings\(\)/);
  assert.match(gateServerHandler, /res\.status\(200\)\.json\(\{\s*ok:\s*true,\s*settings\s*\}/);
});

// ---------------------------------------------------------------------------
// 3. Admin client — the writer
// ---------------------------------------------------------------------------

test("admin client routes the new endpoint and normalises the shape on save", () => {
  // The router recognises the new path.
  assert.match(
    admin,
    /\/api\/admin\/subscriptions\/gate"\)\s*result\s*=\s*await\s+subscriptionGateRequest\(init\)/,
    "admin client routes the new path to subscriptionGateRequest",
  );
  // The writer merges on top of the existing doc so the admin can
  // update a single section without resending the whole shape.
  assert.match(
    admin,
    /setDoc\(ref,\s*stripUndefinedDeep\(\{\.\.\.b,\s*updatedAt:\s*serverTimestamp\(\)\}\),\s*\{\s*merge:\s*true\s*\}\)/,
    "the writer merges the body on top of the existing doc",
  );
});

test("plan visibility matrix includes visibleToSubscribers for existing members", () => {
  assert.match(gateServer, /visibleToSubscribers/);
  assert.match(gateServer, /export function isPlanVisibleForAudience/);
  assert.match(gateHook, /visibleToSubscribers/);
  assert.match(adminPage, /data-admin-gate-plan-visible-subscribers/);
  assert.match(adminPage, /Visible to existing subscribers/);
  const pricing = fs.readFileSync("utils/subscriptionPricing.js", "utf8");
  assert.match(pricing, /export function isPlanVisibleForAudience/);
  const catalog = fs.readFileSync("api/subscription-catalog.ts", "utf8");
  assert.match(catalog, /isPlanVisibleForAudience/);
  const page = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
  assert.match(page, /isPlanVisibleForAudience/);
});

test("admin form exposes the 'Subscription Logic' tab", () => {
  assert.match(
    adminPage,
    /key:\s*"logic",\s*label:\s*"Subscription Logic"/,
    "the new tab is registered in the Tabs component",
  );
  // The tab content renders a kill switch + a per-feature matrix + a
  // plan visibility / subscriber-pricing section.
  assert.match(adminPage, /tab === "logic"/);
  assert.match(adminPage, /data-admin-gate-old-gate/);
  assert.match(adminPage, /data-admin-gate-hide-mode/);
  assert.match(adminPage, /data-admin-gate-feature-gated/);
  assert.match(adminPage, /data-admin-gate-feature-hide/);
  assert.match(adminPage, /data-admin-gate-feature-ai-cap/);
  assert.match(adminPage, /data-admin-gate-plan-visible/);
  assert.match(adminPage, /data-admin-gate-plan-override-monthly/);
  assert.match(adminPage, /data-admin-gate-plan-override-yearly/);
  assert.match(adminPage, /data-admin-gate-plan-override-lifetime/);
});

// ---------------------------------------------------------------------------
// 4. Server enforcement — the access snapshot honours the kill switch
// ---------------------------------------------------------------------------

test("api myday access snapshot reads the gate settings + stacks per-doc and global modes", () => {
  assert.match(myDayServer, /import\s*\{\s*getSubscriptionGateSettings\s*\}\s*from\s*"\.\/subscriptionGate\.js"/);
  assert.match(myDayServer, /getSubscriptionGateSettings\(\)/);
  assert.match(
    myDayServer,
    /globalHideOn\s*=\s*gateSettings\s*\?\s*gateSettings\.hideUntilPurchasedEnabled\s*\|\|\s*Boolean\(gateSettings\.features\?\.\\?\[\\?"myday\\?"]\?\.gated\)\s*:\s*false/,
    "the global kill switch + per-feature override stack into the effective mode",
  );
  assert.match(
    myDayServer,
    /visibilityMode\s*=\s*perDocMode\s*===\s*"hide"\s*\|\|\s*globalHideOn\s*\?\s*"hide"\s*:\s*"gate"/,
    "the effective visibilityMode is 'hide' when per-doc OR global says so",
  );
});

// ---------------------------------------------------------------------------
// 5. Client hooks — the readers
// ---------------------------------------------------------------------------

test("useSubscriptionGateLogic reads the live settings doc with safe defaults", () => {
  assert.match(gateHook, /export function useSubscriptionGateLogic/);
  assert.match(gateHook, /SUBSCRIPTION_GATE_DEFAULTS/);
  assert.match(gateHook, /onSnapshot\(\s*ref/);
  assert.match(gateHook, /refetch/);
});

test("useFeatureVisibility resolves visible / gate / hidden from access + gate", () => {
  assert.match(featureVisibility, /export function useFeatureVisibility/);
  assert.match(featureVisibility, /useSubscriptionGateLogic/);
  assert.match(featureVisibility, /useMyDayAccess/);
  assert.match(featureVisibility, /useRevisionAccess/);
  assert.match(featureVisibility, /"visible"\s*\|\s*"gate"\s*\|\s*"hidden"/);
  assert.match(featureVisibility, /globalOn\s*=\s*settings\.hideUntilPurchasedEnabled\s*\|\|\s*perFeature/);
});

test("useUsageThisMonth reads the per-month usage document + the admin cap", () => {
  assert.match(usageHook, /export function useUsageThisMonth/);
  assert.match(usageHook, /users["'],\s*uid,\s*"usage"/);
  assert.match(usageHook, /resolveAiQuestionsPerDay/);
  assert.match(usageHook, /capPerDay/);
  assert.match(usageHook, /remainingThisMonth/);
});

// ---------------------------------------------------------------------------
// 6. Subscription page chrome — the subscriber gets a clear "you are a member" visual
// ---------------------------------------------------------------------------

test("SubscriberActiveBadge renders a clear 'already a member' visual at the top", () => {
  assert.match(subscriberBadge, /data-subscriber-active-badge/);
  assert.match(subscriberBadge, /Member exclusive/);
  assert.match(subscriberBadge, /You are a member/);
});

test("SubscriberOnlyPriceBadge renders the discounted price with the public price as a strikethrough", () => {
  assert.match(subscriberPriceBadge, /data-subscriber-only-price-badge/);
  assert.match(subscriberPriceBadge, /Your subscriber price/);
  assert.match(subscriberPriceBadge, /line-through/);
});

test("HiddenFeatureHint renders the 'Unlock' card with a clear CTA to the subscription page", () => {
  assert.match(hiddenHint, /data-hidden-feature-hint/);
  assert.match(hiddenHint, /View subscription plans/);
  assert.match(hiddenHint, /Premium feature/);
});

test("SubscriptionPage wires all three new components + the bottom upgrade button", () => {
  assert.match(subscriptionPage, /SubscriberActiveBadge/);
  assert.match(subscriptionPage, /SubscriberOnlyPriceBadge/);
  assert.match(subscriptionPage, /useSubscriptionGateLogic/);
  assert.match(subscriptionPage, /resolveSubscriberOnlyPrice/);
  assert.match(subscriptionPage, /data-subscription-upgrade-button/);
  assert.match(
    subscriptionPage,
    /subscriberPriceRupees/,
    "SubscriptionPage computes the subscriber-only price for the current plan + cycle",
  );
  assert.match(
    planOverview,
    /subscriberPriceRupees/,
    "PlanOverview accepts the subscriber-only price and renders the badge",
  );
});

// ---------------------------------------------------------------------------
// 7. Pure helpers — shared by client + server
// ---------------------------------------------------------------------------

test("the pure subscriber pricing helper is exported from BOTH the JS and TS sides", () => {
  assert.match(pricing, /export function resolveSubscriberOnlyPrice/);
  assert.match(pricing, /export function resolveAiQuestionsPerDay/);
  assert.match(pricingTypes, /export function resolveSubscriberOnlyPrice/);
  assert.match(pricingTypes, /export function resolveAiQuestionsPerDay/);
  // The non-subscriber short-circuit is in the same place on both
  // sides (the JS file is what Vercel bundles).
  assert.match(pricing, /if\s*\(!isSubscriber\)\s*return\s+basePrice/);
});

// ---------------------------------------------------------------------------
// 8. AI usage tracking — the profile widget can show "X of Y"
// ---------------------------------------------------------------------------

test("the AI generation handler writes the per-month usage document", () => {
  const handler = fs.readFileSync("api/_lib/revisionGenerate.ts", "utf8");
  assert.match(handler, /aiQuestionsGenerated/);
  assert.match(handler, /aiQuestionsByFeature/);
  assert.match(handler, /usage[\s\S]{0,40}month/);
});

// ---------------------------------------------------------------------------
// 9. Backwards compatibility
// ---------------------------------------------------------------------------

test("a missing settings/subscriptionGate document keeps the legacy gate working", () => {
  // getSubscriptionGateSettings returns SUBSCRIPTION_GATE_DEFAULTS when
  // the doc is missing, so the legacy "paywall on access" behaviour
  // continues to apply for any feature that does NOT have
  // `hideUntilPurchasedEnabled: true` and does NOT have
  // `features[key].gated: true`.
  assert.match(
    gateServer,
    /if\s*\(!snap\.exists\)\s*\{\s*return\s*\{\s*\.\.\.SUBSCRIPTION_GATE_DEFAULTS\s*\}\s*;\s*\}/,
    "missing doc → defaults (legacy gate preserved)",
  );
});

test("the legacy `gate` mode is the default — pre-Phase-2 data is unaffected", () => {
  // When the doc is missing, the effective visibilityMode is still
  // "gate" (because hideUntilPurchasedEnabled defaults to false and
  // features[key].gated defaults to false).
  assert.match(featureVisibility, /return\s+settings\.oldGateEnabled\s*\?\s*"gate"\s*:\s*"hidden"/);
});
