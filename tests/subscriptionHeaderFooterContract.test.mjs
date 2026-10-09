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
const subscriptionCss = read("src/subscription/subscription-minimal.css");
const main = read("src/main.tsx");
const header = read("src/components/Header.tsx");
const footer = read("src/components/BottomNav.tsx");
const footerShell = read("src/components/SiteFooterNav.tsx");

test("subscription page renders the shared Eduvora header and footer", () => {
  assert.match(subscriptionPage, /import Header from "\.\.\/\.\.\/components\/Header"/);
  assert.match(
    subscriptionPage,
    /import BottomNav, \{ type TabKey \} from "\.\.\/\.\.\/components\/BottomNav"/
  );
  assert.match(subscriptionPage, /<Header[\s\S]*cartCount=\{cartCount\}/);
  assert.match(subscriptionPage, /<BottomNav active=\{null\} onChange=\{onNavigateFooter\}/);
  assert.match(header, /data-site-header/);
  assert.match(footer, /<SiteFooterNav/);
  assert.match(footerShell, /data-site-footer-nav/);
  assert.match(footerShell, /data-site-footer/);
});

test("subscription loading and catalog-error states keep the header and footer", () => {
  assert.match(subscriptionPage, /data-subscription-loading/);
  assert.match(subscriptionPage, /data-subscription-catalog-error/);
  assert.match(
    subscriptionPage,
    /<main[\s\S]*?ref=\{contentColumnRef\}[\s\S]*?data-subscription-page/
  );
  assert.match(subscriptionPage, /<OverlayBoundsProvider value=\{contentColumnRef\}>/);
  assert.match(subscriptionCss, /\.dc-subscription-compare-scroll[\s\S]*?overflow:\s*auto/);
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

test("subscription page owns a responsive design system (phone / tablet / desktop)", () => {
  assert.doesNotMatch(subscriptionApp, /import "\.\/subscription\.css"/);
  assert.match(subscriptionPage, /import "\.\.\/subscription-minimal\.css"/);
  assert.match(subscriptionCss, /container-name:\s*dc-subscription/);
  assert.match(subscriptionCss, /@container dc-subscription \(min-width:\s*860px\)/);
  assert.match(subscriptionCss, /grid-template-columns:\s*minmax\(0, 1\.25fr\) minmax\(0, 1fr\)/);
  assert.match(subscriptionCss, /background:\s*transparent/);
  assert.match(subscriptionCss, /box-shadow:\s*none/);
});
