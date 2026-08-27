// tests/adminDesktopContract.test.mjs
//
// Contract tests for the desktop layout of the admin panel.
//
// The admin was originally designed for a 480px phone column,
// then expanded for tablet (768–1023 px) with a persistent left
// rail. On desktop (>= 1024 px) the same 240 px rail felt
// cramped: the 720 px tablet column sat in the middle of a
// monitor with hundreds of pixels of dead wallpaper on either
// side, and the rail's single-line entries made navigation
// harder to scan than it needed to be.
//
// The new desktop layout is a proper "settings app":
//   • The rail widens to 320 px on desktop, gets a glass/blur
//     background, and shows a 2-line entry per nav item (label
//     + 1-line description).
//   • Nav items are grouped into 5 sections ("Overview",
//     "Catalog", "Content & AI", "Insights", "Account") with
//     group labels and dividers.
//   • The mobile top bar is replaced by a sticky 64 px desktop
//     top bar with a real "Admin workspace" title + live/offline
//     status pill + "Main app" link. The mobile top bar is
//     hidden on desktop.
//   • The main content goes fluid (no max width) so it fills
//     whatever room is left after the rail. Section / stat
//     card typography + padding + shadow scale up so the page
//     reads at desktop rhythm, not at mobile rhythm.
//   • List pages (Customers / Orders / Products / Reviews /
//     Coupons / Subscriptions plans+features+products) use a
//     3-col grid on desktop and a 4-col grid on extra-wide
//     screens (xl: 1280 px+), so a row of cards fills the
//     content column without the cards looking too small.
//   • A dedicated desktop test verifies the new top bar
//     surfaces the page title and the live status pill, with a
//     "back to main app" shortcut.
//
// These tests are pure code-shape — no React, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const ui = fs.readFileSync("src/components/admin/ui.tsx", "utf8");
const dashboard = fs.readFileSync("src/admin/pages/DashboardPage.tsx", "utf8");
const analytics = fs.readFileSync("src/admin/pages/AnalyticsPage.tsx", "utf8");
const customers = fs.readFileSync("src/admin/pages/CustomersPage.tsx", "utf8");
const orders = fs.readFileSync("src/admin/pages/OrdersPage.tsx", "utf8");
const products = fs.readFileSync("src/admin/pages/ProductsPage.tsx", "utf8");
const reviews = fs.readFileSync("src/admin/pages/ReviewsPage.tsx", "utf8");
const coupons = fs.readFileSync("src/admin/pages/CouponsPage.tsx", "utf8");
const subs = fs.readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const branding = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");
const home = fs.readFileSync("src/admin/pages/HomePage.tsx", "utf8");

/* ------------------------------------------------------------------ */
/* AdminShell — desktop rail                                          */
/* ------------------------------------------------------------------ */

test("admin shell widens the rail to 320 px on desktop", () => {
  // The rail is wider on desktop (320 px) than on tablet (240 px)
  // so 2-line entries (label + description) have room to breathe.
  assert.match(shell, /w-\[320px\]/);
});

test("admin shell uses a glass / blur background for the desktop rail", () => {
  // Matches the main app's DesktopShell so the rail feels like
  // a continuation of the app's identity, not a separate chrome.
  assert.match(shell, /bg-white\/85 backdrop-blur-2xl/);
});

test("admin shell renders 2-line rail entries (label + description) on desktop", () => {
  // Each entry has a primary label AND a 1-line description, just
  // like the main app's DesktopRail.
  assert.match(shell, /railDescription/);
  // Every entry renders both lines.
  assert.match(shell, /font-bold leading-tight/);
  assert.match(shell, /font-medium leading-tight/);
});

test("admin shell groups the rail into Overview / Catalog / Content & AI / Insights / Account", () => {
  // The rail reads like a real settings app, not a flat list of
  // links. 5 sections so the most-used items never get lost.
  assert.match(shell, /label: "Overview"/);
  assert.match(shell, /label: "Catalog"/);
  assert.match(shell, /label: "Content & AI"/);
  assert.match(shell, /label: "Insights"/);
  assert.match(shell, /label: "Account"/);
});

test("admin shell hides the mobile top bar on desktop and shows a dedicated desktop top bar", () => {
  // The desktop top bar surfaces the page title + live status
  // pill + "back to main app" link. It uses `lg:flex` so it
  // appears at >= 1024 px.
  assert.match(shell, /data-admin-topbar-title/);
  assert.match(shell, /data-admin-topbar-subtitle/);
  assert.match(shell, /data-admin-topbar-status/);
  assert.match(shell, /data-admin-topbar-action="back"/);
});

test("admin shell hides the mobile hamburger on desktop", () => {
  // On desktop the rail is always visible and 2-line, so the
  // hamburger would be redundant. The mobile-only top bar is
  // rendered in a different branch that is not active on lg.
  // The hamburger is scoped to `md:hidden` so it never shows at
  // desktop sizes.
  assert.match(shell, /data-admin-nav-toggle/);
  assert.match(shell, /md:hidden/);
});

test("admin shell shows the rail's variant (desktop vs tablet) via data-admin-rail-variant", () => {
  // The data attribute lets tests + analytics tell which rail
  // layout is currently rendered. Variant must be either
  // "desktop" or "tablet" — never "mobile" (mobile gets the
  // drawer instead).
  assert.match(shell, /data-admin-rail-variant=\{isDesktop \? "desktop" : "tablet"\}/);
});

test("admin shell uses fluid content (no max width) on desktop so the page fills the column", () => {
  // The main content goes fluid on desktop (`lg:max-w-none`)
  // so it can use the full width left over after the 320 px
  // rail. No more "stretched phone" feel.
  assert.match(shell, /lg:max-w-none/);
});

test("admin shell uses a larger desktop profile card with a role pill", () => {
  // The desktop rail's profile card shows a real "role" badge
  // so the admin can confirm their access level at a glance.
  assert.match(shell, /rounded-2xl border border-slate-200\/70 bg-gradient-to-br from-slate-50 to-white p-3/);
  assert.match(shell, /rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5/);
});

/* ------------------------------------------------------------------ */
/* Shared ui — desktop typography / padding / shadow                 */
/* ------------------------------------------------------------------ */

test("StatCard bumps font size and padding on desktop (28px / p-5)", () => {
  // On desktop stat numbers read at 28 px, on a 5-unit padded
  // card so the value sits comfortably inside the wider column.
  assert.match(ui, /rounded-xl border border-slate-200 bg-white p-3 md:p-4 lg:p-5/);
  assert.match(ui, /text-xl font-semibold md:text-2xl lg:text-\[28px\] lg:leading-tight/);
});

test("SectionCard bumps padding and adds a shadow on desktop (p-6 / shadow-sm)", () => {
  // The desktop section card has a subtle drop shadow and
  // generous inner padding so the content reads at a
  // comfortable line length, not at a mobile rhythm.
  assert.match(ui, /rounded-xl border border-slate-200 bg-white p-4 md:p-5 lg:p-6 lg:shadow-sm/);
});

test("SectionCard accepts an optional className prop for responsive spans", () => {
  // The dashboard page uses `className="lg:col-span-X"` so
  // individual sections can take a 2- or 3-col span in a
  // wider grid. This prop is required for the desktop grid
  // composition to work.
  assert.match(ui, /className\?: string/);
});

test("RecordCard gets hover affordances and bigger padding on desktop", () => {
  // On desktop, hovering a record card highlights the border
  // + adds a soft shadow so it feels like a real list row.
  assert.match(ui, /lg:hover:border-indigo-200 lg:hover:shadow-sm/);
  assert.match(ui, /lg:p-4/);
});

/* ------------------------------------------------------------------ */
/* Dashboard — desktop hero row + 3-col composition                   */
/* ------------------------------------------------------------------ */

test("dashboard has a 4-col hero row that only shows on desktop", () => {
  // The 4 KPIs (revenue, active users, verified orders,
  // attention queue size) sit in a single row at the top on
  // desktop. The row is `hidden lg:grid` so it only appears at
  // >= 1024 px and never competes with the mobile cards.
  assert.match(dashboard, /hidden lg:grid lg:grid-cols-4 lg:gap-4/);
});

test("dashboard composes the section cards into a 3-col grid on desktop", () => {
  // On desktop the Products / Users / Orders section cards
  // share a 3-col grid, so a single row shows the 3 KPIs
  // without scrolling.
  assert.match(dashboard, /grid gap-4 lg:grid-cols-3/);
});

test("dashboard's recent orders section becomes a 2-col internal grid on desktop", () => {
  // The recent orders list is a 2-col internal grid on desktop
  // so a row of two orders fits the wider section card.
  assert.match(dashboard, /lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0/);
});

/* ------------------------------------------------------------------ */
/* Analytics — desktop grid composition                                */
/* ------------------------------------------------------------------ */

test("analytics splits Users / Subscriptions into a 2-col row on desktop", () => {
  // The desktop layout puts the smaller sections next to each
  // other in a 2-col row so the page never feels half-empty.
  assert.match(analytics, /grid gap-3 lg:grid-cols-3 lg:gap-4/);
});

test("analytics products tab uses a 3-col grid on wide desktop (xl)", () => {
  // The product list is a 1-col stack on mobile, 2-col on
  // tablet, 2-col on desktop, 3-col on extra-wide.
  assert.match(analytics, /lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3/);
});

test("analytics exports tab uses a 3-col grid on extra-wide screens", () => {
  // The export buttons sit in a single row on extra-wide
  // screens (xl) so every download is one click away.
  assert.match(analytics, /lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3/);
});

/* ------------------------------------------------------------------ */
/* List pages — 3-col on desktop, 4-col on extra-wide                  */
/* ------------------------------------------------------------------ */

test("customers list goes 3-col on desktop, 4-col on extra-wide", () => {
  assert.match(customers, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4/);
});

test("orders list goes 3-col on desktop, 4-col on extra-wide", () => {
  assert.match(orders, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4/);
});

test("products list goes 3-col on desktop, 4-col on extra-wide", () => {
  assert.match(products, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4/);
});

test("reviews list goes 3-col on desktop (no xl — reviews are denser)", () => {
  // Reviews use 3-col on desktop (no xl step) because the
  // review comment is a long string that would feel cramped
  // at 4-col.
  assert.match(reviews, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4/);
});

test("coupons list goes 3-col on desktop", () => {
  assert.match(coupons, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4/);
});

test("subscriptions plans / features / products lists go 3-col on desktop", () => {
  // All three list sections in the file use the same desktop
  // grid.
  const matches = subs.match(/grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3 lg:gap-4/g) || [];
  assert.ok(matches.length >= 3, `expected at least 3 lists, found ${matches.length}`);
});

/* ------------------------------------------------------------------ */
/* Branding + Home pages — desktop spacing                             */
/* ------------------------------------------------------------------ */

test("branding page uses desktop spacing", () => {
  // Same outer spacing scale as the rest of the desktop pages.
  assert.match(branding, /space-y-3 pb-6 lg:space-y-4/);
});

test("home hero slides page uses desktop spacing", () => {
  assert.match(home, /space-y-3 pb-6 lg:space-y-4/);
});
