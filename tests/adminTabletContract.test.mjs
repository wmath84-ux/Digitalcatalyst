// tests/adminTabletContract.test.mjs
//
// Contract tests for the tablet layout of the admin panel.
//
// The admin was originally designed for a 480px phone column.
// On a tablet (768-1023 px) the column just sat in the middle
// of the screen with hundreds of pixels of dead wall on either
// side — a stretched phone, not a real tablet app.
//
// The new tablet layout:
//   • Replaces the mobile-only hamburger drawer with a
//     persistent 240 px left rail (so navigation is always
//     one tap away, no menu to open).
//   • Widens the content column to 720 px (the same column the
//     rest of the app uses on tablet).
//   • Switches stat card grids from 2-col to 3- or 4-col so a
//     single row of stats reads naturally on a tablet.
//   • Switches list pages (Customers / Orders / Products /
//     Reviews / Coupons / Subscriptions) from a single vertical
//     stack to a 2-col grid, so two cards sit side by side.
//   • Slightly bumps card padding + font size on tablet for a
//     more comfortable reading rhythm.
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

/* ------------------------------------------------------------------ */
/* AdminShell — tablet left rail                                       */
/* ------------------------------------------------------------------ */

test("admin shell uses a persistent left rail on tablet (>= 768 px)", () => {
  // The rail is the primary navigation surface on tablet. It
  // hides on mobile (where the hamburger drawer takes over) and
  // shows on tablet / desktop.
  assert.match(shell, /data-admin-rail/);
  assert.match(shell, /md:block/);
  assert.match(shell, /w-\[240px\]/);
});

test("admin shell hides the hamburger toggle on tablet", () => {
  // On tablet the rail is always visible, so the menu toggle in
  // the top bar is redundant. The toggle is hidden via
  // `md:hidden` so it only shows on mobile.
  assert.match(shell, /data-admin-nav-toggle/);
  assert.match(shell, /md:hidden/);
});

test("admin shell widens the top bar on tablet to clear the rail", () => {
  // The top bar mirrors the rail's width on tablet so the title
  // and the connection indicator never collide with the rail.
  assert.match(shell, /md:max-w-\[calc\(720px\+240px\)\]/);
  assert.match(shell, /data-admin-topbar/);
});

test("admin shell widens the main content to 720 px on tablet", () => {
  // Same content column the rest of the app uses on tablet.
  assert.match(shell, /data-admin-main/);
  assert.match(shell, /md:max-w-\[720px\]/);
  assert.match(shell, /md:px-6/);
});

/* ------------------------------------------------------------------ */
/* Shared ui — tablet padding + font sizes                             */
/* ------------------------------------------------------------------ */

test("StatCard bumps padding and font size on tablet", () => {
  // Mobile uses p-3 + text-xl, tablet bumps to p-4 + text-2xl so
  // the numbers read naturally on a wider column.
  assert.match(ui, /rounded-xl border border-slate-200 bg-white p-3 md:p-4/);
  assert.match(ui, /text-xl font-semibold md:text-2xl/);
});

test("SectionCard bumps padding and titles on tablet", () => {
  assert.match(ui, /rounded-xl border border-slate-200 bg-white p-4 md:p-5/);
  assert.match(ui, /text-sm font-semibold text-slate-900 md:text-base/);
});

/* ------------------------------------------------------------------ */
/* Dashboard — already 3-col, now also tablet-aware                    */
/* ------------------------------------------------------------------ */

test("dashboard stat groups use 3-col on mobile and stay 3-col on tablet with wider gap", () => {
  assert.match(dashboard, /grid grid-cols-3 gap-2 md:gap-3/);
});

test("dashboard 2-col groups (subs + reviews) become 3-col on tablet", () => {
  // The 2-col groups on mobile become 3-col on tablet for visual
  // consistency with the rest of the page.
  assert.match(dashboard, /grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3/);
});

test("dashboard quick actions use 2-col on mobile, 3-col on tablet", () => {
  assert.match(dashboard, /grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3/);
});

/* ------------------------------------------------------------------ */
/* Analytics — stat grids scale up                                       */
/* ------------------------------------------------------------------ */

test("analytics revenue group uses 2-col on mobile, 4-col on tablet", () => {
  // Revenue gets its own wider grid on tablet so 4 KPIs sit in a
  // single row.
  assert.match(analytics, /grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3/);
});

test("analytics users + subscriptions groups use 2-col on mobile, 3-col on tablet", () => {
  assert.match(analytics, /grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3/);
});

test("analytics activeSubscriptions card surfaces the real customer count, not a hard-coded zero", () => {
  // The previous version hard-coded `activeSubscriptionPlans: 0` in
  // the analytics handler. The contract is that the field reads
  // from the customers list (where the real subscriptionPlanId
  // lives), so the analytics page no longer shows 0.
  const client = fs.readFileSync("src/lib/admin/client.ts", "utf8");
  // The line that previously hard-coded 0 must now compute it.
  assert.doesNotMatch(client, /activeSubscriptionPlans:0/);
  assert.doesNotMatch(client, /activeSubscriptionPlans: 0/);
  // The real computation reads subscriptionId off the customers
  // list (which is the same field mapCustomer already writes).
  assert.match(client, /activeSubscriptions=customers\.filter\(\(c:any\)=>c&&c\.subscriptionId\)\.length/);
  assert.match(client, /activeSubscriptionPlans:activeSubscriptions/);
});

/* ------------------------------------------------------------------ */
/* List pages — single column becomes 2-col on tablet                   */
/* ------------------------------------------------------------------ */

test("customers list switches to 2-col on tablet", () => {
  assert.match(customers, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3/);
});

test("orders list switches to 2-col on tablet", () => {
  assert.match(orders, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3/);
});

test("products list switches to 2-col on tablet", () => {
  assert.match(products, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3/);
});

test("reviews list switches to 2-col on tablet", () => {
  assert.match(reviews, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3/);
});

test("coupons list switches to 2-col on tablet", () => {
  assert.match(coupons, /grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3/);
});

test("subscriptions plans / features / products lists switch to 2-col on tablet", () => {
  // Three list sections in the same file, all need to switch.
  const matches = subs.match(/grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3/g) || [];
  assert.ok(matches.length >= 3, `expected at least 3 lists, found ${matches.length}`);
});
