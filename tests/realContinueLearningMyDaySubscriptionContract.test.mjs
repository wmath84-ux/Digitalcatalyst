import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync("src/home/App.tsx", "utf8");
const myDay = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const access = fs.readFileSync("src/hooks/useMyDayAccess.ts", "utf8");
const fallback = fs.readFileSync("src/subscription/data/fallbackCatalog.ts", "utf8");
const subscription = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const productModal = fs.readFileSync("src/subscription/components/CourseSelectModal.tsx", "utf8");
const server = fs.readFileSync("api/_lib/subscriptions.ts", "utf8");
const entitlements = fs.readFileSync("api/_lib/entitlements.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

test("Continue Learning is driven by real Firestore course progress", () => {
  assert.match(home, /collection\(db, "users", user\.id, "courseProgress"\)/);
  assert.match(home, /completedFileIds/);
  assert.match(home, /lastOpenedAt \|\| data\.updatedAt/);
  assert.match(home, /onNavigateToCourse\(item\)/);
  assert.doesNotMatch(home, /useState\(42\)/);
});

test("Continue Learning shows at most two courses, most recently opened first", () => {
  // The cap is a named constant so the rule is explicit and adjustable.
  assert.match(home, /const CONTINUE_LEARNING_LIMIT = 2;/);
  assert.match(home, /\.slice\(0, CONTINUE_LEARNING_LIMIT\)/);
  // Most recently opened first.
  assert.match(home, /\.sort\(\(left, right\) => right\.updatedAt - left\.updatedAt\)/);
  // Entries are built from live progress records joined against the live
  // catalog, so a product added in the future needs no code change and a
  // stale record for a deleted product is dropped.
  assert.match(home, /progressRecords/);
  assert.match(home, /products\.find\(\(product\) => product\.id === record\.productId\)/);
  assert.match(home, /catalogProducts\.find\(\(product\) => product\.id === record\.productId\)/);
  assert.match(home, /entry !== null/);
  // No hard-coded product list drives the section.
  assert.doesNotMatch(home, /continueLearningItem/);
});

test("Continue Learning renders every provided course as its own stacked card", () => {
  const section = fs.readFileSync("src/home/components/ContinueLearning.tsx", "utf8");
  assert.match(section, /items: ContinueLearningItem\[\]/);
  assert.match(section, /items\.map\(\(item\) =>/);
  assert.match(section, /ContinueLearningCard/);
  // Responsive grid: one card per course (single column on phones, auto-fit columns on tablets/desktop).
  assert.match(section, /dc-home-continue-grid/);
  // Renders nothing when the learner has not started anything.
  assert.match(section, /if \(items\.length === 0\) return null;/);
  // Per-card progress stays clamped to a sane 0-100 range.
  // Progress is clamped by the shared clampProgress helper (same 0–100 rule, one implementation).
  assert.match(section, /clampProgress\(item\.progress\)/);
  assert.match(fs.readFileSync("src/home/data/homeDashboardData.ts", "utf8"), /Math\.max\(0, Math\.min\(100, value\)\)/);
});

test("subscription exposes only the paid My Day feature", () => {
  assert.equal((fallback.match(/\nid: "my-day"|\n      id: "my-day"/g) || []).length, 1);
  assert.doesNotMatch(fallback, /id: "downloads"|id: "certificates"|id: "community"/);
  assert.match(server, /feature\.id === "my-day"/);
  // The ₹149 price belongs to the offline fallback catalog. It used to
  // be hard-coded in the server loader too, and this test pinned it
  // there — but feature pricing is admin-configurable now, so the
  // loader deliberately returns whatever the catalog holds instead of
  // forcing a My Day row into the response. Asserting the constant
  // against the server would re-introduce exactly what was removed.
  assert.match(fallback, /pricePaise: 14900/);
  assert.match(server, /feature\.active/, "the loader must expose active catalog features as-is");
  assert.doesNotMatch(server, /pricePaise:\s*14900/, "the server must not hard-code the My Day price");
});

test("bonus product picker uses every live catalog product with real price and checkbox", () => {
  assert.match(subscription, /products=\{subscriptionDisplayProducts\}/);
  assert.match(productModal, /filtered\.map\(\(product\)/);
  assert.match(productModal, /product\.price/);
  assert.match(productModal, /checked/);
  assert.match(server, /collection\("siteProducts"\)/);
  assert.match(server, /parseProductPricePaise/);
});

test("selected bonus products become subscription-granted products", () => {
  assert.match(entitlements, /effectivePlan/);
  assert.match(entitlements, /includedProductIds: Array\.from\(new Set/);
  assert.match(entitlements, /plan: effectivePlan/);
});

test("My Day remains viewable but saving requires active my-day subscription", () => {
  // Browsing is always allowed; CREATING goes through the one server path,
  // which re-checks the membership and consumes the same daily allowance the
  // planner used. The route reflects the same decision so the learner sees the
  // gate instead of a failed save.
  const joplinApi = fs.readFileSync("api/_lib/joplin.ts", "utf8");
  assert.match(myDay, /useMyDayAccess/);
  assert.match(myDay, /canCreate/);
  assert.match(access, /features\.includes\("my-day"\)/);
  assert.match(joplinApi, /accessSnapshot/);
  assert.match(joplinApi, /MYDAY_DAILY_FREE_USED/);
  assert.match(joplinApi, /myDayUsage/);
  assert.match(rules, /features\.hasAny\(\['my-day'\]\)/);
});
