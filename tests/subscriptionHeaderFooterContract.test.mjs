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
const subscriptionCss = read("src/subscription/subscription.css");
const main = read("src/main.tsx");
const header = read("src/components/Header.tsx");
const footer = read("src/components/BottomNav.tsx");
const footerShell = read("src/components/SiteFooterNav.tsx");

test("subscription page renders the shared Eduvora header and footer", () => {
  assert.match(subscriptionPage, /import Header from "\.\.\/\.\.\/components\/Header"/);
  assert.match(subscriptionPage, /import BottomNav, \{ type TabKey \} from "\.\.\/\.\.\/components\/BottomNav"/);
  assert.match(subscriptionPage, /<Header[\s\S]*cartCount=\{cartCount\}/);
  assert.match(subscriptionPage, /<BottomNav active=\{null\} onChange=\{onNavigateFooter\}/);
  assert.match(header, /data-site-header/);
  assert.match(footer, /<SiteFooterNav/);
  assert.match(footerShell, /data-site-footer-nav/);
  assert.match(footerShell, /data-site-footer/);
});

test("subscription loading and catalog-error states keep the header and footer", () => {
  // Loading + error states render inside the shared shell instead of replacing the page.
  assert.match(subscriptionPage, /data-subscription-loading/);
  assert.match(subscriptionPage, /data-subscription-catalog-error/);
  // The main is also the page's overlay-bounds column (My Day's pattern):
  // every picker opened from this page clamps to it on tablet / desktop.
  // The content column is also `overflow-x-hidden` so a wide plan table
  // cannot leak a horizontal scrollbar onto the whole page.
  assert.match(
    subscriptionPage,
    /<main ref=\{contentColumnRef\} data-subscription-page className="flex-1 overflow-x-hidden overflow-y-auto">/,
  );
  assert.match(subscriptionPage, /<OverlayBoundsProvider value=\{contentColumnRef\}>/);
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
  // The design system is a real stylesheet, loaded by the route component so
  // it sits after the app theme and can win the layout back from the legacy
  // container-query block in src/index.css.
  assert.match(subscriptionApp, /import "\.\/subscription\.css"/);
  // Phone → tablet → desktop widths, then the two-column workspace with the
  // sticky review rail (the Store page's model: one column that knows its
  // width, then a real workspace).
  assert.match(subscriptionCss, /\[data-subscription-shell\]/);
  assert.match(subscriptionCss, /\[data-subscription-workspace\]/);
  assert.match(subscriptionCss, /grid-template-columns: minmax\(0, 1fr\) minmax\(320px, var\(--sub-rail-w\)\)/);
  assert.match(subscriptionCss, /position: sticky !important/);
  assert.match(subscriptionPage, /data-subscription-workspace/);
  assert.match(subscriptionPage, /data-subscription-shell/);
  // The user's rule: a MIX of materials, never all-glass. Content the buyer
  // must read is a solid plate; glass survives only where it is the point
  // (the swipe deck, the sticky buy bar, the modals).
  assert.match(subscriptionCss, /\[data-subscription-step\] \.dc-glass-card/);
  assert.match(subscriptionCss, /backdrop-filter: none !important/);
  assert.match(subscriptionCss, /\[data-subscription-step\] > \.dc-sub-step-body/);
});
