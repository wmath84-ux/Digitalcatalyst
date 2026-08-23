// tests/subscriptionDowngradeGuard.test.mjs
//
// NO-DOWNGRADE rules for subscriptions.
//
// While a membership is active the buyer may only ever move UP the plan
// ladder, never down:
//
//   * Premium (yearly) must NOT be able to buy Basic — in either cycle.
//   * Premium (yearly) must NOT be able to buy Premium monthly — the yearly
//     → monthly hop on the same plan is a downgrade.
//   * Premium (yearly) CAN buy Pro — monthly OR yearly (a higher plan in any
//     cycle is an upgrade).
//   * Premium (monthly) CAN buy Premium yearly (same plan, longer cycle is an
//     upgrade).
//   * Once the membership expires the rule lifts — anything can be purchased.
//
// The plan picker must also HIDE the lower plans (not just disable them), the
// page/server share the same pure helper, and the removed "extra header" the
// owner asked about must be gone with its help icon relocated to the main
// header.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOWNGRADE_CODE,
  evaluatePlanChange,
  resolveSubscribeCta,
} from "../utils/subscriptionOwnership.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 1);

// Catalog ordering used across these tests: Basic < Premium < Pro.
const ORDER = { basic: 0, premium: 1, pro: 2 };

const premiumYearly = (overrides = {}) => ({
  status: "active",
  planId: "premium",
  cycle: "yearly",
  features: [],
  includedProductIds: [],
  expiresAt: NOW + 200 * DAY,
  ...overrides,
});

const change = (record, planId, cycle) =>
  evaluatePlanChange({
    record,
    planId,
    cycle,
    ownedPlanOrder: ORDER[String(record?.planId || "")] ?? null,
    selectedPlanOrder: ORDER[planId] ?? null,
    now: NOW,
  });

// ---------------------------------------------------------------------------
// The pure rule
// ---------------------------------------------------------------------------

test("a member on Premium yearly cannot move to a lower plan in either cycle", () => {
  for (const cycle of ["monthly", "yearly"]) {
    const state = change(premiumYearly(), "basic", cycle);
    assert.equal(state.blocked, true, `Premium yearly → Basic ${cycle} must be blocked`);
    assert.equal(state.downgrade, true);
    assert.equal(state.code, DOWNGRADE_CODE);
    assert.match(state.reason, /higher plan active/i);
  }
});

test("a member on Premium yearly cannot drop to Premium monthly (cycle downgrade)", () => {
  const state = change(premiumYearly(), "premium", "monthly");
  assert.equal(state.blocked, true);
  assert.equal(state.downgrade, true);
  assert.equal(state.code, DOWNGRADE_CODE);
  assert.match(state.reason, /yearly membership is still active/i);
});

test("a member on Premium yearly CAN move up to Pro in either cycle", () => {
  for (const cycle of ["monthly", "yearly"]) {
    const state = change(premiumYearly(), "pro", cycle);
    assert.equal(state.blocked, false, `Premium yearly → Pro ${cycle} must stay purchasable`);
    assert.equal(state.upgrade, true);
    assert.equal(state.reason, null);
  }
});

test("re-selecting the exact owned plan + cycle is NOT a downgrade — the duplicate guard owns that case", () => {
  const state = change(premiumYearly(), "premium", "yearly");
  assert.equal(state.blocked, false);
  assert.equal(state.downgrade, false);
  assert.equal(state.upgrade, false);
});

test("a member on Premium monthly can upgrade to Premium yearly", () => {
  const state = change(premiumYearly({ cycle: "monthly" }), "premium", "yearly");
  assert.equal(state.blocked, false);
  assert.equal(state.upgrade, true);
});

test("a member on Premium monthly still cannot go down to Basic", () => {
  const state = change(premiumYearly({ cycle: "monthly" }), "basic", "monthly");
  assert.equal(state.blocked, true);
  assert.equal(state.code, DOWNGRADE_CODE);
});

test("a member on the top plan (Pro) blocks every lower plan", () => {
  for (const planId of ["basic", "premium"]) {
    const state = change(premiumYearly({ planId: "pro" }), planId, "monthly");
    assert.equal(state.blocked, true, `Pro yearly → ${planId} monthly must be blocked`);
  }
});

test("a member on the lowest plan (Basic) can move anywhere", () => {
  for (const planId of ["premium", "pro"]) {
    const state = change(premiumYearly({ planId: "basic" }), planId, "monthly");
    assert.equal(state.blocked, false, `Basic → ${planId} must be allowed`);
    assert.equal(state.upgrade, true);
  }
});

test("an expired membership lifts the rule entirely — even Basic is purchasable again", () => {
  const expired = premiumYearly({ expiresAt: NOW - DAY });
  const state = change(expired, "basic", "monthly");
  assert.equal(state.active, false);
  assert.equal(state.blocked, false);
  const cycleChange = change(expired, "premium", "monthly");
  assert.equal(cycleChange.blocked, false, "expired yearly member can re-buy monthly");
});

test("a buyer with no subscription is never blocked", () => {
  const state = evaluatePlanChange({
    record: null,
    planId: "basic",
    cycle: "monthly",
    ownedPlanOrder: null,
    selectedPlanOrder: ORDER.basic,
    now: NOW,
  });
  assert.equal(state.blocked, false);
  assert.equal(state.active, false);
});

test("unknown plan ranks never block — the rule refuses to guess", () => {
  const state = evaluatePlanChange({
    record: premiumYearly(),
    planId: "legacy-plan",
    cycle: "monthly",
    ownedPlanOrder: null,
    selectedPlanOrder: null,
    now: NOW,
  });
  assert.equal(state.blocked, false);
});

test("a sideways move (same rank, different plan id) is not a downgrade", () => {
  const state = evaluatePlanChange({
    record: premiumYearly(),
    planId: "premium-plus",
    cycle: "monthly",
    ownedPlanOrder: 1,
    selectedPlanOrder: 1,
    now: NOW,
  });
  assert.equal(state.blocked, false);
});

// ---------------------------------------------------------------------------
// The CTA must reflect the rule
// ---------------------------------------------------------------------------

test("the subscribe CTA is disabled and says so for a downgrade-blocked selection", () => {
  const state = change(premiumYearly(), "basic", "monthly");
  const cta = resolveSubscribeCta({ state: { blocked: state.blocked }, hasPlan: true });
  assert.equal(cta.tone, "blocked");
  assert.equal(cta.disabled, true);
  assert.equal(cta.owned, false);
  assert.match(cta.label, /downgrade not allowed/i);
});

test("an upgrade selection keeps the normal purchase CTA", () => {
  const state = change(premiumYearly(), "pro", "yearly");
  const cta = resolveSubscribeCta({ state: { blocked: state.blocked }, hasPlan: true });
  assert.equal(cta.tone, "default");
  assert.equal(cta.disabled, false);
  assert.match(cta.label, /subscribe via razorpay/i);
});

// ---------------------------------------------------------------------------
// Wiring contracts — the rule must actually reach the UI and the server
// ---------------------------------------------------------------------------

test("the subscription page hides lower plans instead of offering them", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /evaluatePlanChange/);
  // The picker receives the ladder-filtered list, never the raw catalog.
  assert.match(page, /const pickerPlans = useMemo/);
  assert.match(page, /order >= ownedPlanOrder/);
  assert.match(page, /<PlanOverview[\s\S]*?plans=\{pickerPlans\}/);
  // Switching entry points open on the next HIGHER plan only.
  assert.match(page, /const upgradePlans = useMemo/);
  assert.match(page, /upgradePlans\[0\]/);
  // The merged verdict still feeds the subscribe bar + the refuse-to-checkout stop.
  assert.match(page, /if \(ownershipState\.blocked\) \{[\s\S]*?setSubmitError\([\s\S]*?return;/);
});

test("a yearly member cannot slip into the monthly cycle of their own plan", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /ownedCycle === "yearly"[\s\S]*?cycle === "monthly"[\s\S]*?setCycle\("yearly"\)/);

  const overview = read("src/subscription/components/PlanOverview.tsx");
  assert.match(overview, /data-subscription-cycle-downgrade=/);
  assert.match(overview, /isCycleDowngrade/);
  assert.match(overview, /Monthly unlocks after your yearly membership ends/);
});

test("the subscribe bar explains a blocked downgrade instead of taking payment", () => {
  const bar = read("src/subscription/components/SubscribeBar.tsx");
  assert.match(bar, /data-subscription-downgrade-note/);
  assert.match(bar, /cta\.tone === "blocked"/);
});

test("the removed 'Manage plan' header is gone and its help icon moved to the main header", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  // The extra sticky title bar (back button + "Manage plan"/"Go Premium"
  // heading + help button) is removed…
  assert.equal(/manageMode && isActiveMember \? "Manage plan"/.test(page), false);
  assert.equal(/aria-label="Go back"/.test(page), false);
  // …but the help overlay trigger survives on the main Header.
  assert.match(page, /onHelpClick=\{\(\) => setHelpOpen\(true\)\}/);
  assert.match(page, /<HelpModal open=\{isHelpOpen\}/);

  const header = read("src/components/Header.tsx");
  assert.match(header, /onHelpClick\?: \(\) => void/);
  assert.match(header, /HelpCircle/);
  assert.match(header, /aria-label="Help & FAQ"/);
});

test("the 'already have an active membership' banner copy is removed", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.equal(
    page.includes("Choose any active plan, feature, or product below. Plan changes activate after verified payment."),
    false,
    "the old manage-mode banner sentence must be gone",
  );
});

test("the quote endpoint refuses downgrades server-side with the same shared rule", () => {
  const subscriptions = read("api/_lib/subscriptions.ts");
  assert.match(subscriptions, /evaluatePlanChange/);
  assert.match(subscriptions, /DOWNGRADE_CODE/);
  assert.match(subscriptions, /isOwnedSubscriptionActive/);
  assert.match(subscriptions, /status: 409/);
});
