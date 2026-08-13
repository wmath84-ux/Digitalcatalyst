import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const builder = fs.readFileSync("src/components/pdp/PdpPurchaseBuilder.tsx", "utf8");
const trigger = fs.readFileSync("src/components/pdp/ModuleSelectTrigger.tsx", "utf8");
const modal = fs.readFileSync("src/components/pdp/ModuleSelectModal.tsx", "utf8");
const checkout = fs.readFileSync("src/components/checkout/CheckoutReviewStep.tsx", "utf8");
const quotes = fs.readFileSync("api/_lib/quotes.ts", "utf8");
const push = fs.readFileSync("utils/webPush.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

test("product detail always offers a subscription-style module picker", () => {
  assert.match(pdp, /Select course modules/);
  assert.match(pdp, /PdpPurchaseBuilder/);
  assert.match(builder, /ModuleSelectTrigger/);
  assert.match(builder, /ModuleSelectModal/);
  assert.match(builder, /selected_modules/);
  assert.match(builder, /modulePicker/);
  assert.match(trigger, /Select course modules/);
  assert.match(trigger, /No modules yet · tap to view/);
  assert.match(modal, /Select modules/);
  assert.match(modal, /data-pdp-module-pick/);
  assert.match(modal, /data-pdp-no-modules/);
  assert.match(modal, />No modules</);
  assert.match(modal, /Select all/);
});

test("checkout proceed is not blocked for paid quotes", () => {
  assert.match(checkout, /disabled=\{showLoading\}/);
  assert.doesNotMatch(checkout, /finalTotal > 0/);
});

test("quote loader resolves products by document id and public id", () => {
  assert.match(quotes, /where\("id", "=="/);
  assert.match(quotes, /normalizeProductDoc/);
});

test("push subscription save has an authenticated API fallback", () => {
  assert.match(push, /\/api\/push\/subscribe/);
  assert.match(rules, /webPushSubscriptions/);
  assert.match(rules, /publicLeaderboard/);
});
