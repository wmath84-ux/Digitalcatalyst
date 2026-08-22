import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_REVISION_TEST_BANK_LIMITS,
  revisionBankLimitForCycle,
} from "../utils/revisionLimits.js";

const read = (file) => fs.readFileSync(file, "utf8");
const adminClient = read("src/lib/admin/client.ts");
const adminSubscriptions = read("src/admin/pages/SubscriptionsPage.tsx");
const customerDetail = read("src/admin/pages/CustomerDetailPage.tsx");
const subscriptionWriter = read("api/_lib/subscriptions.ts");
const revisionData = read("api/_lib/revisionData.ts");
const rules = read("firestore.rules");
const memberView = read("src/subscription/components/ActiveMemberView.tsx");
const planOverview = read("src/subscription/components/PlanOverview.tsx");
const fallbackCatalog = read("src/subscription/data/fallbackCatalog.ts");

test("plan-wise Test Bank capacity defaults are 20 / 50 / 100 for Basic / Premium / Pro", () => {
  assert.deepEqual(DEFAULT_REVISION_TEST_BANK_LIMITS.basic, { monthly: 20, yearly: 20 });
  assert.deepEqual(DEFAULT_REVISION_TEST_BANK_LIMITS.premium, { monthly: 50, yearly: 50 });
  assert.deepEqual(DEFAULT_REVISION_TEST_BANK_LIMITS.pro, { monthly: 100, yearly: 100 });
  assert.match(fallbackCatalog, /revisionTestBankLimits: \{ monthly: 20, yearly: 20 \}/);
  assert.match(fallbackCatalog, /revisionTestBankLimits: \{ monthly: 50, yearly: 50 \}/);
  assert.match(fallbackCatalog, /revisionTestBankLimits: \{ monthly: 100, yearly: 100 \}/);
});

test("monthly and yearly capacity are configured independently, -1 means unlimited", () => {
  assert.equal(revisionBankLimitForCycle({ id: "premium", revisionTestBankLimits: { monthly: -1, yearly: 73 } }, "monthly"), -1);
  assert.equal(revisionBankLimitForCycle({ id: "premium", revisionTestBankLimits: { monthly: 27, yearly: 73 } }, "yearly"), 73);
  assert.match(adminSubscriptions, /Use −1 for unlimited/);
  assert.match(adminSubscriptions, /Monthly saved tests/);
  assert.match(adminSubscriptions, /Yearly saved tests/);
});

test("admin plan editor persists per-plan monthly/yearly Test Bank limits", () => {
  assert.match(adminSubscriptions, /Revision Test Bank capacity/);
  assert.match(adminClient, /normalizeRevisionTestBankLimits\(data\.revisionTestBankLimits, item\.id\)/);
  assert.match(adminClient, /normalizeRevisionTestBankLimits\(body\.revisionTestBankLimits, recordId\)/);
});

test("purchase stores the purchased capacity as a per-term snapshot", () => {
  assert.match(subscriptionWriter, /revisionTestBankLimit: revisionBankLimitForCycle\(args\.plan, args\.cycle\)/);
  assert.match(subscriptionWriter, /revisionTestBankLimit: Number\(previousData\.revisionTestBankLimit \?\?/);
});

test("existing subscribers never lose a purchased benefit; admin increases apply immediately", () => {
  assert.match(revisionData, /snapshotLimitRaw/);
  assert.match(revisionData, /Math\.max\(snapshotLimit, currentLimit\)/);
});

test("admin can raise capacity for a specific existing subscriber", () => {
  assert.match(adminClient, /revisionTestBankLimit !== undefined/);
  assert.match(adminClient, /revisionTestBankLimitUpdatedAt:\s*serverTimestamp\(\)/);
  assert.match(customerDetail, /Adjust existing subscriber's Test Bank/);
  assert.match(customerDetail, /Save capacity/);
  assert.match(rules, /allow update: if documentId == 'current' && isAdmin\(\)/);
});

test("customer sees the selected plan's Test Bank capacity on the subscription page", () => {
  assert.match(planOverview, /data-revision-bank-benefit/);
  assert.match(planOverview, /save up to \$\{activePlan\.revisionTestBankLimits\?\.\[cycle\] \?\? 20\}|Unlimited cloud-saved tests/);
  assert.match(memberView, /data-member-test-bank-capacity/);
  assert.match(memberView, /save up to \$\{plan\.revisionTestBankLimits\?\.\[cycle\] \?\? 20\}/);
});
