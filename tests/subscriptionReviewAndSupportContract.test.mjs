// tests/subscriptionReviewAndSupportContract.test.mjs
//
// Contract for two subscription fixes:
//
//   1. The checkout review page no longer repeats feature names for
//      subscription purchases. The "What you'll get" card already lists every
//      feature + product, so the redundant "Itemised line items" section is
//      hidden for subscriptions (it remains for product purchases).
//   2. The Help & FAQ overlay's support email + phone come from the
//      admin-branded settings (settings/branding) instead of hard-coded
//      placeholders, and the admin branding page lets you edit them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const review = fs.readFileSync("src/components/checkout/CheckoutReviewStep.tsx", "utf8");
const helpModal = fs.readFileSync("src/subscription/components/HelpModal.tsx", "utf8");
const branding = fs.readFileSync("src/utils/branding.ts", "utf8");
const brandingPage = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");

test("subscription review page hides the itemised line items to avoid repeating features", () => {
  // The itemised section is wrapped in a subscription-exclusion.
  assert.match(review, /isSubscriptionPurchase \? null : \(/);
  assert.match(review, /data-checkout-line-items/);
  // The "What you'll get" card remains for subscriptions.
  assert.match(review, /isSubscriptionPurchase \? \(\s*<SubscriptionUnlocksCard/);
});

test("help modal reads support email + phone from branding, not placeholders", () => {
  assert.match(helpModal, /const \{ supportEmail, supportPhone \} = useBranding\(\)/);
  assert.match(helpModal, /\{supportEmail\}/);
  assert.match(helpModal, /\{supportPhone\}/);
  // No hard-coded placeholder remains in the modal.
  assert.doesNotMatch(helpModal, /support@learnpro\.app/);
  assert.doesNotMatch(helpModal, /123-4567/);
});

test("admin branding page exposes support contact fields", () => {
  assert.match(brandingPage, /data-branding-support-email/);
  assert.match(brandingPage, /data-branding-support-phone/);
  assert.match(brandingPage, /update\("supportEmail"/);
  assert.match(brandingPage, /update\("supportPhone"/);
  // Persisted into the branding doc + cache.
  assert.match(brandingPage, /supportEmail, supportPhone, updatedAt: serverTimestamp\(\)/);
  assert.match(branding, /supportEmail: string;/);
  assert.match(branding, /supportPhone: string;/);
  assert.match(branding, /DEFAULT_SUPPORT_EMAIL/);
  assert.match(branding, /DEFAULT_SUPPORT_PHONE/);
});
