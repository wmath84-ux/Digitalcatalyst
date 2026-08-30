import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const builder = fs.readFileSync("src/components/pdp/PdpPurchaseBuilder.tsx", "utf8");
const moduleModal = fs.readFileSync("src/components/pdp/ModuleSelectModal.tsx", "utf8");
const editor = fs.readFileSync("src/components/admin/products/ProductEditor.tsx", "utf8");
const modulesEditor = fs.readFileSync("src/components/admin/products/ModulesResourcesEditor.tsx", "utf8");
const adminClient = fs.readFileSync("src/lib/admin/client.ts", "utf8");
const adminSubs = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const serverQuotes = fs.readFileSync("utils/serverQuotes.js", "utf8");

test("PDP module selector has checkboxes, individual prices and dynamic selected total", () => {
  // The "Select course modules" dropdown modal is the single module picker
  // (the duplicate inline list + tabs were removed); it keeps the checkbox
  // semantics, per-module prices and the dynamic selected total, while the
  // builder still pipes the same selection into the order summary.
  assert.match(moduleModal, /role="checkbox"/);
  assert.match(moduleModal, /aria-checked/);
  assert.match(moduleModal, /getModuleEffectivePrice/);
  assert.match(moduleModal, /selectedTotal/);
  assert.match(moduleModal, /selectedIds\.length} of \{modules\.length\} selected/);
  assert.match(builder, /getModuleEffectivePrice/);
  assert.match(builder, /selectedTotal/);
  assert.match(builder, /Total due today/);
});

test("selected modules flow into server-authoritative checkout", () => {
  assert.match(builder, /purchaseKind: "selected_modules"|mode === "selected_modules"/);
  assert.match(serverQuotes, /kind === "selected_modules"/);
  assert.match(serverQuotes, /individuallyPurchasable/);
});

test("admin product editor customizes module availability, regular and sale prices", () => {
  // The module-level fields moved with the drill-down editor.
  assert.match(modulesEditor, /Individually purchasable/);
  assert.match(modulesEditor, /Cash price \(₹\)/);
  assert.match(modulesEditor, /Sale price \(₹\)/);
  // The validation message + accessLevel coercion live in the
  // new editor (the parent still runs the validation block).
  assert.match(editor, /sale price must be between ₹0 and its cash price/);
  assert.match(modulesEditor, /accessLevel === "purchasable" \? true/);
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
