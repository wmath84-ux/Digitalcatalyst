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

const css = fs.readFileSync("src/index.css", "utf8");

test("PDP module picker is a viewport-capped overlay, not a full-black sheet", () => {
  assert.match(modal, /data-pdp-module-select-overlay/);
  assert.match(modal, /createPortal/);
  assert.match(modal, /document\.body/);
  // Wave 14: the scrim is the pack sheet/dialog scrim (`bg-black/50` +
  // `backdrop-blur-[2px]`), the same one the subscription gate's GlassSheet
  // paints — no hand-mixed indigo wash in JSX or CSS.
  assert.match(modal, /bg-black\/50 p-3 backdrop-blur-\[2px\]/);
  assert.doesNotMatch(modal, /bg-indigo-950\/30|bg-black\/55/);
  assert.match(modal, /min-h-0/);
  assert.doesNotMatch(
    css,
    /\[data-pdp-module-select-overlay\][\s\S]{0,240}rgba\(49,\s*46,\s*129,\s*0\.28\)/,
    "PDP overlay must not paint its own indigo scrim over the pack one",
  );
  assert.match(
    css,
    /\[data-pdp-module-select-overlay\] \[data-pdp-module-select-modal\] \{\s*width:\s*min\(100%,\s*28rem\)/,
    "tablet * { max-width: 100% } must not stretch the picker to the full viewport",
  );
  assert.match(
    css,
    /\[data-pdp-module-select-overlay\] \[data-pdp-module-select-modal\] \{[\s\S]{0,200}max-height:\s*calc\(100vh - 1\.5rem\)/,
    "the picker card must be height-capped to the viewport",
  );
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
