import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync("src/components/pdp/PdpPurchaseBuilder.tsx", "utf8");
const editor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
const adminClient = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const adminSubs = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const serverQuotes = fs.readFileSync("utils/serverQuotes.js", "utf8");

test("PDP module selector has checkboxes, individual prices and dynamic selected total", () => {
  assert.match(builder, /role="checkbox"/);
  assert.match(builder, /getModuleEffectivePrice/);
  assert.match(builder, /selectedTotal/);
  assert.match(builder, /selectedIds\.size} selected/);
  assert.match(builder, /Total due today/);
});

test("selected modules flow into server-authoritative checkout", () => {
  assert.match(builder, /purchaseKind: "selected_modules"|mode === "selected_modules"/);
  assert.match(serverQuotes, /kind === "selected_modules"/);
  assert.match(serverQuotes, /individuallyPurchasable/);
});

test("admin product editor customizes module availability, regular and sale prices", () => {
  assert.match(editor, /Individually purchasable/);
  assert.match(editor, /Cash price \(₹\)/);
  assert.match(editor, /Sale price \(₹\)/);
  assert.match(editor, /sale price must be between ₹0 and its cash price/);
  assert.match(editor, /accessLevel === "purchasable" \? true/);
});

test("admin subscription adapters persist canonical plan and My Day prices", () => {
  assert.match(adminClient, /subscriptionPlansRequest/);
  assert.match(adminClient, /monthlyPrice: Number\(monthly\)/);
  assert.match(adminClient, /yearlyPrice: Number\(yearly\)/);
  assert.match(adminClient, /subscriptionFeaturesRequest/);
  assert.match(adminClient, /price: Number\(body\.individualPrice \|\| 0\)/);
  assert.match(adminSubs, /Configure My Day/);
  assert.match(adminSubs, /Individual price \(₹\)/);
});
