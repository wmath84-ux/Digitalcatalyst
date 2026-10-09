import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pdp = fs.readFileSync("src/PdpApp.tsx", "utf8");
const builder = fs.readFileSync(
  "src/components/pdp/PdpPurchaseBuilder.tsx",
  "utf8"
);
const trigger = fs.readFileSync(
  "src/components/pdp/ModuleSelectTrigger.tsx",
  "utf8"
);
const modal = fs.readFileSync(
  "src/components/pdp/ModuleSelectModal.tsx",
  "utf8"
);
const checkout = fs.readFileSync(
  "src/components/checkout/CheckoutReviewStep.tsx",
  "utf8"
);
const quotes = fs.readFileSync("api/_lib/quotes.ts", "utf8");
const push = fs.readFileSync("utils/webPush.ts", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

test("product detail offers a clearly labelled individual-purchase module picker", () => {
  assert.match(pdp, /PdpPurchaseBuilder/);
  assert.match(builder, /ModuleSelectTrigger/);
  assert.match(builder, /ModuleSelectModal/);
  assert.match(builder, /label="Purchase individually"/);
  assert.match(builder, /selected_modules/);
  assert.match(builder, /modulePicker/);
  assert.match(trigger, /Purchase individually/);
  assert.match(trigger, /font-display text-base font-extrabold tracking-tight/);
  assert.match(trigger, /No modules yet · tap to view/);
  assert.match(modal, /Select modules/);
  assert.match(modal, /data-pdp-module-pick/);
  assert.match(modal, /data-pdp-no-modules/);
  assert.match(modal, />No modules</);
  assert.match(modal, /Select all/);
});

test("module choices retain plain native rows, accessible checkboxes, owned state and prerequisites", () => {
  assert.match(modal, /<ul[\s\S]{0,160}data-pdp-module-list/);
  assert.match(modal, /className="dc-module-choice"/);
  assert.doesNotMatch(
    modal,
    /<GlassCard|<GlassCheckbox|<GlassButton|<GlassInput/
  );
  assert.match(modal, /type="checkbox"/);
  assert.match(modal, /type="search"/);
  assert.match(modal, /data-pdp-module-select-confirm/);
  assert.match(modal, /disabled=\{owned\}/);
  assert.match(modal, /Requires:/);
  assert.match(modal, /Already purchased/);
});

const css = fs.readFileSync("src/index.css", "utf8");

test("PDP module picker is a viewport-capped overlay, not a full-black sheet", () => {
  const dialog = fs.readFileSync("src/components/ui/ContentDialog.tsx", "utf8");
  const bounds = fs.readFileSync(
    "src/components/ui/content-dialog.css",
    "utf8"
  );
  const picker = fs.readFileSync(
    "src/components/pdp/module-picker.css",
    "utf8"
  );
  assert.match(modal, /<ContentDialog/);
  assert.match(modal, /data-pdp-module-select-overlay/);
  assert.match(dialog, /Dialog\.Portal/);
  assert.match(dialog, /onCloseAutoFocus/);
  assert.match(dialog, /onEscapeKeyDown/);
  assert.match(dialog, /lockBodyScroll\(\)/);
  assert.match(bounds, /max-height: calc\(\s*100dvh/);
  assert.match(bounds, /overflow-y: auto/);
  assert.match(picker, /max-width: 720px !important/);
  assert.doesNotMatch(bounds, /backdrop-filter/);
});

test("checkout proceed is not blocked for paid quotes", () => {
  assert.match(checkout, /disabled=\{showLoading\}/);
  // No disabled expression may gate on the total. (A naive `finalTotal > 0`
  // match false-positives on the "You save" pill, which compares
  // `regularSubtotal - finalTotal > 0`.)
  assert.doesNotMatch(checkout, /disabled=\{[^}]*finalTotal[^}]*\}/);
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
