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
  assert.match(home, /onNavigateToCourse\(continueLearningItem\)/);
  assert.doesNotMatch(home, /useState\(42\)/);
});

test("subscription exposes only the paid My Day feature", () => {
  assert.equal((fallback.match(/\nid: "my-day"|\n      id: "my-day"/g) || []).length, 1);
  assert.doesNotMatch(fallback, /id: "downloads"|id: "certificates"|id: "community"/);
  assert.match(server, /feature\.id === "my-day"/);
  assert.match(server, /pricePaise: 14900/);
});

test("bonus product picker uses every live catalog product with real price and checkbox", () => {
  assert.match(subscription, /products=\{availableProducts\}/);
  assert.match(productModal, /products\.map\(\(product\)/);
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
  assert.match(myDay, /canSaveMyDay/);
  assert.match(myDay, /Cloud saving has ongoing server costs\. Subscribe to save tasks, schedules and notes\./);
  assert.match(access, /features\.includes\("my-day"\)/);
  assert.match(rules, /features\.hasAny\(\['my-day'\]\)/);
  assert.match(myDay, /collection|setDoc\(doc\(db, "users", uid, "myDay", "current"\)/);
});
