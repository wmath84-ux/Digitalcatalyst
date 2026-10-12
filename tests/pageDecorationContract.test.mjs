import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const homeHeader = read("src/home/components/Header.tsx");
const homeStyles = read("src/home/home.css");
const storeStyles = read("src/components/store-marketplace.css");
const purchasesStyles = read("src/components/purchases-minimal.css");
const profileStyles = read("src/profile/profile-minimal.css");
const usageStyles = read("src/usage/usage-minimal.css");
const checkoutStyles = read("src/components/checkout/checkout-minimal.css");
const subscriptionStyles = read("src/subscription/subscription-minimal.css");
const lightStyles = read("src/light-theme-pages.css");

test("Home header search has a visible blue edge with hover and keyboard focus feedback", () => {
  assert.match(homeHeader, /data-home-search-slot/);
  assert.match(homeStyles, /\[data-app-frame\] > \[data-home-header\] \[data-home-search-slot\] \.dc-scene-field/);
  assert.match(homeStyles, /border:\s*1\.5px solid var\(--dc-home-search-edge\)/);
  assert.match(homeStyles, /\[data-search-launcher\]:focus-within \.dc-scene-field/);
  assert.match(homeStyles, /--dc-home-search-edge:\s*rgba\(125, 190, 255, 0\.95\)/);
  assert.match(homeStyles, /--dc-home-search-edge:\s*rgba\(37, 99, 235, 0\.92\)/);
});

test("Store and My Purchases have responsive, interactive PDP-style framing", () => {
  assert.match(storeStyles, /\.dc-marketplace-heading::after/);
  assert.match(storeStyles, /\.dc-marketplace-search:focus-within/);
  assert.match(storeStyles, /\.dc-marketplace-card:hover/);
  assert.match(purchasesStyles, /\[data-purchases-page\] \.dc-account-header h1::after/);
  assert.match(purchasesStyles, /\.dc-purchases-search:focus-within/);
  assert.match(purchasesStyles, /\.dc-purchases-row:hover/);
});

test("Profile and Usage Limits stay scoped, readable and motion-aware", () => {
  assert.match(profileStyles, /\[data-account-profile\] \.dc-account-identity::before/);
  assert.match(profileStyles, /\[data-account-profile\] \.dc-account-section::before/);
  assert.match(profileStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(usageStyles, /\[data-usage-limits-page\] \.dc-usage-section::before/);
  assert.match(usageStyles, /progress::-webkit-progress-value/);
  assert.match(usageStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(profileStyles, /<GlassCard|<GlassSurface/);
});

test("Checkout has framed review surfaces and a clear blue payment action", () => {
  assert.match(checkoutStyles, /\[data-checkout-app\] \[data-checkout-toolbar\]/);
  assert.match(checkoutStyles, /\.dc-checkout-section[\s\S]*?border:\s*1px solid var\(--checkout-edge\)/);
  assert.match(checkoutStyles, /\.dc-checkout-item[\s\S]*?border-radius:\s*12px/);
  assert.match(checkoutStyles, /\.dc-checkout-primary[\s\S]*?linear-gradient\(135deg, #dbeafe, #bfdbfe\)/);
});

test("Subscription makes plan selection and the itemised total distinct", () => {
  assert.match(subscriptionStyles, /\[data-subscription-page\] \[data-subscription-hero\]/);
  assert.match(subscriptionStyles, /\.dc-subscription-plan-row\[data-selected="true"\]/);
  assert.match(subscriptionStyles, /\[data-subscription-price-summary\][\s\S]*?border-color:\s*var\(--sub-edge-strong\)/);
  assert.match(subscriptionStyles, /\[data-subscription-price-tiers\][\s\S]*?background:\s*transparent/);
  assert.match(subscriptionStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("light theme keeps the new outlines legible on paper surfaces", () => {
  assert.match(lightStyles, /html\[data-theme="light"\] \.dc-purchases-row/);
  assert.match(lightStyles, /html\[data-theme="light"\] \[data-usage-limits-page\] \.dc-usage-section/);
  assert.match(lightStyles, /html\[data-theme="light"\] \.dc-marketplace-control/);
  assert.match(lightStyles, /html\[data-theme="light"\] \.dc-checkout-section/);
  assert.match(lightStyles, /html\[data-theme="light"\] \[data-subscription-page\] \.dc-subscription-plan-row/);
  assert.match(lightStyles, /html\[data-theme="light"\] \[data-study-library-page\]\s*\{[\s\S]*?--account-muted:\s*var\(--dc-ink-3\)/);
  assert.match(lightStyles, /html\[data-theme="light"\] \[data-study-library-page\] \.dc-account-header h1 \{ color: var\(--dc-ink\); \}/);
  assert.match(lightStyles, /html\[data-theme="light"\] \[data-study-library-page\] \.dc-account-error \{ color: var\(--dc-urgent-ink\); \}/);
});
