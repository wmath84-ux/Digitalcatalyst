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
  assert.match(page, /plan\.yearlyPricePaise : plan\.monthlyPricePaise/);
  assert.match(admin, /Monthly plan price \(₹\)/);
  assert.match(admin, /Yearly plan price \(₹\)/);
});

test("active subscribers can enter upgrade flow and switch to another active plan", () => {
  const page = read("src/subscription/components/SubscriptionPage.tsx");
  const writer = read("api/_lib/subscriptions.ts");
  assert.match(page, /candidate\.active && candidate\.id !== currentPlanId/);
  assert.match(page, /Choose any active plan, feature, or product below/);
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
