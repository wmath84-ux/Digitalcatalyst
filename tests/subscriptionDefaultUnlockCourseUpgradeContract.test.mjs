import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const subscription = fs.readFileSync("src/subscription/components/SubscriptionPage.tsx", "utf8");
const quote = fs.readFileSync("utils/serverQuotes.js", "utf8");
const entitlements = fs.readFileSync("api/_lib/entitlements.ts", "utf8");
const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const builder = fs.readFileSync("src/components/pdp/PdpPurchaseBuilder.tsx", "utf8");
const checkout = fs.readFileSync("src/components/checkout/CheckoutReviewStep.tsx", "utf8");
const root = fs.readFileSync("src/main.tsx", "utf8");
const notifications = fs.readFileSync("utils/siteNotifications.ts", "utf8");
const admin = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");

test("My Day feature is selected by default and changes subscription total", () => {
  assert.match(subscription, /current\.length === 0 \? \["my-day"\]/);
  assert.match(subscription, /selectedPlanPricePaise \+ featuresTotalPaise \+ productsTotalPaise/);
});

test("subscription quote preserves feature/product line kinds and IDs for unlocking", () => {
  assert.match(quote, /kind: item\.kind \|\| kind/);
  assert.match(quote, /featureId: item\.featureId \|\| null/);
  assert.match(quote, /subscriptionPlanId: line\.subscriptionPlanId \|\| null/);
  assert.match(entitlements, /includedProductIds: Array\.from\(new Set/);
  assert.match(entitlements, /selectedFeatureIds: uniqueFeatures/);
});

test("owned product PDP surfaces a prominent paid upgrade", () => {
  assert.match(pdp, /Course upgrade available/);
  assert.match(pdp, /New modules or files were added after your original purchase/);
  assert.match(pdp, /View upgrade/);
  assert.match(builder, /isProductOwned && availableModes\.includes\("paid_update"\)/);
});

test("upgrade checkout lists exactly what is being added", () => {
  assert.match(quote, /detailItems/);
  assert.match(checkout, /New content included/);
  assert.match(checkout, /Your existing course stays owned/);
  assert.match(checkout, /Included add-ons & products/);
});

test("catalog changes create notifications for purchased products including string IDs", () => {
  assert.match(root, /buildContentNotificationInventory/);
  assert.match(root, /createContentNotifications/);
  assert.match(notifications, /Your course has new content/);
  assert.match(notifications, /target: \{ type: 'product', productId \}/);
  assert.doesNotMatch(notifications, /if \(!Number\.isFinite\(productId\)\) return/);
});

test("admin enforces paid-update packaging for paid modules", () => {
  assert.match(admin, /must include at least one module or file/);
  assert.match(admin, /must be included in a Paid update package/);
});
