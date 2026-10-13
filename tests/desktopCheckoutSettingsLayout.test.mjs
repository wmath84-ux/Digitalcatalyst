import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync("src/components/checkout/checkout-brand.css", "utf8");
const review = fs.readFileSync("src/components/checkout/CheckoutReviewStep.tsx", "utf8");
const settings = fs.readFileSync("src/settings/settings.css", "utf8");

test("desktop checkout has one centered content rail with room for review cards", () => {
  assert.match(checkout, /@media \(min-width: 1024px\)/);
  assert.match(checkout, /\[data-checkout-shell\][\s\S]*?max-width: 1280px/);
  assert.match(checkout, /\[data-checkout-content\][\s\S]*?max-width: 1120px/);
  assert.match(checkout, /\[data-checkout-review-step\] > \.dc-checkout-section[\s\S]*?width: 100%/);
});

test("desktop checkout buyer profile is a full-width responsive identity row", () => {
  assert.match(review, /data-checkout-buyer-profile/);
  assert.match(review, /data-checkout-buyer-header/);
  assert.match(review, /data-checkout-buyer-details/);
  assert.match(checkout, /\[data-checkout-buyer-profile\][\s\S]*?grid-template-columns: minmax\(170px, 0\.42fr\) minmax\(0, 1\.58fr\)/);
  assert.match(checkout, /\[data-checkout-buyer-details\][\s\S]*?repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
});

test("desktop free-access action fits its label without truncation", () => {
  assert.match(checkout, /\.cu-pay\.uzp-pay[\s\S]*?width: 220px/);
  assert.match(checkout, /\.cu-pay \.uzp-pay__text[\s\S]*?white-space: nowrap/);
  assert.match(checkout, /\.cu-pay \.uzp-pay__text[\s\S]*?text-overflow: clip/);
});

test("desktop signed-out Settings uses a compact centered panel", () => {
  assert.match(settings, /@media \(min-width: 1024px\)[\s\S]*?\.settings-signed-out[\s\S]*?max-width: 52rem/);
  assert.match(settings, /\.settings-signed-out[\s\S]*?flex: 0 1 auto/);
  assert.match(settings, /\.settings-signed-out[\s\S]*?align-self: center/);
});
