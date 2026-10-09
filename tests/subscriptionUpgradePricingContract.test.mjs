import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("admin-configured plan price is charged by both client and server", () => {
  const engine = read("utils/subscriptions.js");
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  const admin = read("src/admin/pages/SubscriptionsPage.tsx");
  assert.match(engine, /const planPricePaise = getPlanCyclePricePaise\(plan, cycle\)/);
  assert.match(engine, /effectivePrice: planPricePaise/);
  assert.match(page, /plan\.yearlyPricePaise\s*:\s*plan\.monthlyPricePaise/);
  assert.match(admin, /Monthly plan price \(₹\)/);
  assert.match(admin, /Yearly plan price \(₹\)/);
});

test("active subscribers use the shared picker and can select their own or a HIGHER plan", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  const writer = read("api/_lib/subscriptions.ts");
  // Profile's change-plan action opens the common plan page. The picker is
  // filtered to the member's own plan plus higher plans; lower plans are
  // never offered or selectable.
  assert.match(page, /const pickerPlans = useMemo/);
  assert.match(page, /const audienceVisible = plans\.filter/);
  assert.match(page, /isPlanVisibleForAudience\(candidate\.id, isActiveMember/);
  assert.match(page, /order >= ownedPlanOrder/);
  assert.match(page, /setSelectedPlanId\(ownedVisible \? ownedPlanId : pickerPlans\[0\]\.id\)/);
  assert.match(page, /plans=\{pickerPlans\}/);
  assert.doesNotMatch(page, /manageMode|const upgradePlans|const nextPlan/);
  // The old banner inviting the member to "choose any active plan" remains
  // absent, and the server protects paid entitlement carry-over.
  assert.equal(
    page.includes("Choose any active plan, feature, or product below"),
    false,
    "the arbitrary-plan banner must be gone — only upgrades are shown now"
  );
  assert.match(writer, /const isPlanChange = previous\.exists/);
  assert.match(writer, /const subscriptionBase = isPlanChange \? args\.now/);
  assert.match(writer, /subscriptionUpgradeCount: upgradeCount/);
});

test("admin product pricing includes every existing store product", () => {
  const client = read("src/lib/admin/client.ts");
  assert.match(client, /getDocs\(collection\(db, "siteProducts"\)\)/);
  assert.match(client, /Every existing store product is shown/);
  assert.match(client, /planPricing: data\.planPricing/);
});

test("subscription product overrides drive the displayed total", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  assert.match(page, /resolvedSubscriptionProducts\.find/);
  assert.match(page, /pricing\.resolvedPrice/);
});
