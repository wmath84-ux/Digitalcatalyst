import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const subscriptionPage = read("src/subscription/components/SubscriptionPage.tsx");
const subscriptionApp = read("src/subscription/App.tsx");
const main = read("src/main.tsx");
const header = read("src/components/Header.tsx");
const footer = read("src/components/BottomNav.tsx");

test("subscription page renders the shared Eduvora header and footer", () => {
  assert.match(subscriptionPage, /import Header from "\.\.\/\.\.\/components\/Header"/);
  assert.match(subscriptionPage, /import BottomNav, \{ type TabKey \} from "\.\.\/\.\.\/components\/BottomNav"/);
  assert.match(subscriptionPage, /<Header[\s\S]*cartCount=\{cartCount\}/);
  assert.match(subscriptionPage, /<BottomNav active=\{null\} onChange=\{onNavigateFooter\}/);
  assert.match(header, /data-site-header/);
  assert.match(footer, /data-site-footer/);
});

test("subscription loading and catalog-error states keep the header and footer", () => {
  // Loading + error states render inside the shared shell instead of replacing the page.
  assert.match(subscriptionPage, /data-subscription-loading/);
  assert.match(subscriptionPage, /data-subscription-catalog-error/);
  assert.match(subscriptionPage, /<main className="flex-1 overflow-y-auto">/);
});

test("subscription route wires the same navigation destinations as other pages", () => {
  assert.match(main, /if \(hash\.startsWith\(SUBSCRIPTION_HASH\)\) \{[\s\S]*?<SubscriptionApp/);
  assert.match(main, /cartCount=\{cartIds\.size\}/);
  assert.match(main, /purchasesBadge=\{purchasedIds\.size\}/);
  assert.match(main, /if \(tab === "home"\) window\.location\.hash = HOME_HASH/);
  assert.match(main, /if \(tab === "myday"\) window\.location\.hash = MY_DAY_HASH/);
  assert.match(main, /if \(tab === "profile"\) window\.location\.hash = PROFILE_HASH/);
  assert.match(subscriptionApp, /onNavigateToCart/);
  assert.match(subscriptionApp, /onNavigateToNotifications/);
  assert.match(subscriptionApp, /onNavigateFooter/);
});
