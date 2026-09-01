// tests/pageEnterContract.test.mjs
//
// Landing-style opening animation on Home, Store, PDP, Subscription,
// Profile, Cart, course player, all My Day pages, and all Revision pages.
// Motion matches landing Hero (y 30, 0.8s, delay 0.15s) and Header
// (y -40, 0.7s ease-out). CSS only — no AnimatePresence wait.
// Keyed by app, not sub-route, so Revision / My Day keep their state.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const css = fs.readFileSync("src/index.css", "utf8");
const enter = fs.readFileSync("src/components/PageEnter.tsx", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const revision = fs.readFileSync("src/revision/RevisionApp.tsx", "utf8");
const myday = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const hero = fs.readFileSync("src/components/landing/Hero.tsx", "utf8");
const header = fs.readFileSync("src/components/landing/Header.tsx", "utf8");

function evalPageEnterAppKey() {
  const start = enter.indexOf("export function pageEnterAppKey");
  const body = enter.slice(start).replace(/^export /, "");
  const end = body.indexOf("\n}\n") + 2;
  const fn = body
    .slice(0, end)
    .replace(/:\s*string\s*\|\s*null/g, "")
    .replace(/\(hash:\s*string\)/, "(hash)");
  const sandbox = {};
  vm.runInNewContext(fn, sandbox);
  return sandbox.pageEnterAppKey;
}

const pageEnterAppKey = evalPageEnterAppKey();

test("page-enter motion matches landing Hero and Header", () => {
  assert.match(hero, /initial=\{\{ opacity: 0, y: 30 \}\}/);
  assert.match(hero, /duration: 0\.8, delay: 0\.15/);
  assert.match(header, /initial=\{\{ y: -40, opacity: 0 \}\}/);
  assert.match(header, /duration: 0\.7, ease: "easeOut"/);

  assert.match(css, /@keyframes dc-page-enter-body/);
  assert.match(css, /translateY\(30px\)/);
  assert.match(css, /dc-page-enter-body 0\.8s cubic-bezier\(0\.22, 1, 0\.36, 1\) 0\.15s both/);
  assert.match(css, /@keyframes dc-page-enter-header/);
  assert.match(css, /translateY\(-40px\)/);
  assert.match(css, /dc-page-enter-header 0\.7s ease-out both/);
});

test("prefers-reduced-motion skips page enter and there is no AnimatePresence wait", () => {
  const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /\[data-page-enter\]/);
  assert.match(reduce, /\[data-page-enter-panel\]/);
  assert.match(reduce, /animation:\s*none !important/);
  const enterCode = enter.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(enterCode, /AnimatePresence/);
  assert.doesNotMatch(enterCode, /openingAnimationEnabled/);
});

test("the wrapper is display:contents so overlay headers are not transformed by a parent", () => {
  assert.match(enter, /className="contents"/);
  assert.match(enter, /data-page-enter/);
  assert.doesNotMatch(enter, /transform:/);
});

test("app keys stay stable for Revision and My Day, follow id for product and course", () => {
  assert.equal(pageEnterAppKey("#/home"), "#/home");
  assert.equal(pageEnterAppKey("#/store/purchases"), "#/store");
  assert.equal(pageEnterAppKey("#/product/abc?section=reviews"), "#/product/abc");
  assert.equal(pageEnterAppKey("#/subscription?renew=1"), "#/subscription");
  assert.equal(pageEnterAppKey("#/profile"), "#/profile");
  assert.equal(pageEnterAppKey("#/profile/subscriber-experience"), null);
  assert.equal(pageEnterAppKey("#/cart"), "#/cart");
  assert.equal(pageEnterAppKey("#/favorites"), null);
  assert.equal(pageEnterAppKey("#/course/xyz?module=m1"), "#/course/xyz");
  assert.equal(pageEnterAppKey("#/my-day?section=tasks"), "#/my-day");
  assert.equal(pageEnterAppKey("#/revision/bank"), "#/revision");
  assert.equal(pageEnterAppKey("#/revision/session/3"), "#/revision");
  assert.equal(pageEnterAppKey("#/search"), null);
  assert.equal(pageEnterAppKey("#/notifications"), null);
  assert.equal(pageEnterAppKey("#/settings"), null);
  assert.equal(pageEnterAppKey("#/leaderboard"), null);
  assert.equal(pageEnterAppKey("#/auth"), null);
  assert.equal(pageEnterAppKey("#/checkout"), null);
  assert.equal(pageEnterAppKey("#/admin"), null);
  assert.equal(pageEnterAppKey("#/flowpath"), null);
  assert.equal(pageEnterAppKey("#/landing"), null);
});

test("RootPage wraps only the listed apps in PageEnter", () => {
  assert.match(main, /<PageEnter pageKey=\{pageEnterAppKey\(hash\)\}>/);
  assert.match(main, /<HomeApp/);
  assert.match(main, /<StoreApp/);
  assert.match(main, /<PdpWithOwnership/);
  assert.match(main, /<SubscriptionApp/);
  assert.match(main, /<ProfileApp/);
  assert.match(main, /<CartWishlistApp/);
  assert.match(main, /<CourseRouteGuard/);
  assert.match(main, /<MyDayApp/);
  assert.match(main, /<RevisionApp/);

  const slice = (from, to) => main.slice(main.indexOf(from), main.indexOf(to));
  assert.doesNotMatch(slice("hash.startsWith(SEARCH_HASH)", "PROFILE_SUBSCRIBER_EXPERIENCE_HASH"), /PageEnter/);
  assert.doesNotMatch(slice("hash.startsWith(NOTIFICATIONS_HASH)", "hash.startsWith(SEARCH_HASH)"), /PageEnter/);
  assert.doesNotMatch(slice("hash.startsWith(SETTINGS_HASH)", "hash.startsWith(PROFILE_HASH)"), /PageEnter/);
  assert.doesNotMatch(slice("hash.startsWith(LEADERBOARD_HASH)", "hash.startsWith(FLOWPATH_HASH)"), /PageEnter/);
  assert.doesNotMatch(slice("hash.startsWith(AUTH_HASH)", "hash.startsWith(ADMIN_LOGIN_HASH)"), /PageEnter/);
  assert.doesNotMatch(slice("hash.startsWith(CHECKOUT_HASH)", "hash.startsWith(ADMIN_HASH)"), /PageEnter/);
  assert.doesNotMatch(slice("hash.startsWith(FLOWPATH_HASH)", "hash.startsWith(REVISION_HASH)"), /PageEnter/);
  assert.doesNotMatch(slice("!hash || hash.startsWith(LANDING_HASH)", "hash.startsWith(HOME_HASH)"), /PageEnter/);
});

test("Revision inner pages animate via a path-keyed panel without remounting the app", () => {
  assert.match(revision, /data-page-enter-panel/);
  assert.match(revision, /key=\{path\}/);
  assert.match(revision, /flex min-h-0 flex-1 flex-col overflow-hidden/);
  assert.match(css, /\[data-revision-content\] \[data-page-enter-panel\] > \[data-revision-page-main\]/);
});

test("My Day sections animate via an activeSection-keyed panel without remounting the app", () => {
  assert.match(myday, /data-page-enter-panel/);
  assert.match(myday, /key=\{activeSection\}/);
  assert.match(css, /\[data-myday-content\] \[data-page-enter-panel\]/);
});

test("mobile two-layer CSS animates overlay headers from above, not with the body", () => {
  assert.match(css, /\[data-page-enter\] \[data-site-header\]/);
  assert.match(css, /\[data-page-enter\] \[data-app-frame\] > \*:not\(\[data-site-header\]\)/);
  assert.match(css, /\[data-revision-content\]/);
  assert.match(css, /\[data-myday-content\]/);
});

test("desktop does not put a transform on the overlay topbar", () => {
  assert.doesNotMatch(css, /\[data-page-enter\] \[data-desktop-topbar\]/);
  assert.doesNotMatch(css, /\[data-desktop-topbar\].*dc-page-enter-header/);
});
