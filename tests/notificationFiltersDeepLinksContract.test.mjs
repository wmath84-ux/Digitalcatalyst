// tests/notificationFiltersDeepLinksContract.test.mjs
//
// Pins the notification page filter design and the exact-redirect contract:
//
//   Filters  → All, Product, My Day, Subscription, Updates — each chip shows
//              its notification count and tapping it shows only that group.
//   Deep link→ every notification tap (in-app bell OR Android system alert)
//              lands on the exact location that caused the alert.
//
// The in-app side uses a single shared helper (getNotificationDeepLink) so
// the bell page, the foreground local notifications and the service-worker
// click path cannot drift apart. The server side sends the same deep link in
// the push payload and stores the section/item id in the bell doc.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectDueMyDayItems } from "../utils/pushScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const siteNotifications = read("utils/siteNotifications.ts");
const page = read("src/components/NotificationsPage.tsx");
const main = read("src/main.tsx");
const sw = read("public/sw.js");
const myDayApp = read("src/MyDayApp.tsx");
const cron = read("api/cron/subscription-renewals.ts");
const pushSend = read("api/push/send.ts");
const pushSchedulerDts = read("utils/pushScheduler.d.ts");

// 2026-08-13T04:30:00Z is 10:00 IST (offset -330).
const IST = -330;
const NOW = Date.parse("2026-08-13T04:30:00.000Z");
const DAY = "2026-08-13";

test("every notification category maps to exactly one filter", () => {
  assert.match(siteNotifications, /export type NotificationFilterKey = 'all' \| 'product' \| 'mayday' \| 'subscription' \| 'updates'/);
  assert.match(siteNotifications, /NOTIFICATION_FILTER_ORDER/);
  // product filter ← store (new/free product), unlock (product unlocked),
  // course (new modules/lessons in an owned course)
  assert.match(siteNotifications, /const PRODUCT_CATEGORIES = new Set<SiteNotificationCategory>\(\['store', 'unlock', 'course'\]\)/);
  assert.match(siteNotifications, /if \(PRODUCT_CATEGORIES\.has\(notification\.category\)\) return 'product'/);
  assert.match(siteNotifications, /if \(notification\.category === 'mayday'\) return 'mayday'/);
  assert.match(siteNotifications, /if \(notification\.category === 'subscription'\) return 'subscription'/);
  // announcements + community (and anything unknown) fall into Updates
  assert.match(siteNotifications, /return 'updates'/);
});

test("the bell page renders the five filter chips with per-filter counts", () => {
  assert.match(page, /filterCounts/);
  assert.match(page, /counts\[getNotificationFilterKey\(item\)\] \+= 1/);
  assert.match(page, /visibleItems = useMemo\(\(\) => filterNotifications\(items, activeFilter\)/);
  // The chips come from the single shared order constant (all, product,
  // mayday, subscription, updates) so page and helper cannot drift.
  assert.match(page, /NOTIFICATION_FILTER_ORDER\.map\(\(key\) =>/);
  assert.match(siteNotifications, /NOTIFICATION_FILTER_ORDER: NotificationFilterKey\[\] = \['all', 'product', 'mayday', 'subscription', 'updates'\]/);
  assert.match(page, /setActiveFilter\(key\)/);
  assert.match(page, /filterCounts\[key\]/);
  // Filter chips only appear once there is something to filter.
  assert.match(page, /items\.length > 0 && \(/);
  // Per-filter empty states so a group with zero items still reads clearly.
  assert.match(page, /No \$/);
});

test("product notifications deep-link to the exact product/course page", () => {
  assert.match(siteNotifications, /notification\.category === 'course' \? `#\/course\/\$\{productId\}` : `#\/product\/\$\{productId\}`/);
  assert.match(siteNotifications, /if \(target\.type === 'purchases'\) return '#\/store\/purchases'/);
  // Product/store notifications are server-generated with the product id in
  // the target so a tap opens the exact product page (cron catch-up and the
  // instant admin path write the same doc shape).
  assert.match(cron, /target: \{ type: "product", productId: product\.id \}/);
  assert.match(pushSend, /target: \{ type: "product", productId \}/);
});

test("My Day due items carry the exact section + item id for deep links", () => {
  const data = {
    reminders: [{ id: "r1", text: "Drink water", time: "10:00", done: false }],
    tasks: [{ id: "t1", title: "Physics", time: "10:00", status: "pending" }],
    schedule: [{ id: "s1", title: "Live class", startTime: "10:00", endTime: "10:30", type: "class" }],
  };
  const due = collectDueMyDayItems(data, NOW, IST);
  const byKind = Object.fromEntries(due.map((item) => [item.kind, item]));
  assert.equal(byKind.reminder.section, "reminders");
  assert.equal(byKind.reminder.itemId, "r1");
  assert.equal(byKind.task.section, "tasks");
  assert.equal(byKind.task.itemId, "t1");
  assert.equal(byKind.schedule.section, "schedule");
  assert.equal(byKind.schedule.itemId, "s1");
  assert.match(pushSchedulerDts, /section: "reminders" \| "tasks" \| "schedule"/);
  assert.match(pushSchedulerDts, /itemId: string/);
});

test("My Day deep link resolves to #/my-day?section=<tab>&item=<id>", () => {
  assert.match(siteNotifications, /const getMyDayItemDeepLink = \(section: 'tasks' \| 'schedule' \| 'reminders', itemId: string\): string =>/);
  assert.match(siteNotifications, /`#\/my-day\?section=\$\{section\}&item=\$\{encodeURIComponent\(String\(itemId\)\)\}`/);
  assert.match(siteNotifications, /if \(target\.section && target\.itemId\)/);
  assert.match(siteNotifications, /return `#\/my-day\?section=\$\{target\.section\}&item=\$\{encodeURIComponent\(String\(target\.itemId\)\)\}`/);
});

test("My Day page applies the deep link (section + item highlight)", () => {
  assert.match(myDayApp, /new URLSearchParams\(hash\.slice\(queryIndex \+ 1\)\)/);
  assert.match(myDayApp, /setActiveSection\(section\)/);
  assert.match(myDayApp, /setHighlightId\(item && item\.trim\(\) \? item\.trim\(\) : null\)/);
  assert.match(myDayApp, /hashchange/);
  assert.match(myDayApp, /highlightId=\{highlightId\}/);
});

test("My Day list components scroll to + highlight the deep-linked item", () => {
  for (const file of ["src/components/myday/TaskList.tsx", "src/components/myday/Timeline.tsx", "src/components/myday/Reminders.tsx"]) {
    const source = read(file);
    assert.match(source, /highlightId\?: string \| null/);
    assert.match(source, /data-highlight=\{/);
    assert.match(source, /scrollIntoView/);
  }
});

test("expired subscription reminders deep-link into the renewal flow", () => {
  assert.match(siteNotifications, /notification\.expired \? '#\/subscription\?renew=1' : '#\/subscription'/);
  assert.match(cron, /const renewalUrl = reminder\.expired \? "\/#\/subscription\?renew=1" : "\/#\/subscription"/);
  assert.match(cron, /url: renewalUrl/);
});

test("foreground local notifications use the same deep links", () => {
  // My Day foreground system alerts deep-link to the exact tab + item.
  assert.match(main, /const itemUrl = `\/\$\{getMyDayItemDeepLink\(item\.section, item\.itemId\)\}`/);
  assert.match(main, /showLocalSystemNotification\(item\.title, item\.body, itemUrl, `myday-\$\{item\.key\}`\)/);
  // Content notifications (new product / unlock / course update) are
  // SERVER-generated now — the client must not run its own baseline diff
  // (that was the repeating "Product unlocked" bug).
  assert.doesNotMatch(main, /createContentNotifications/);
  assert.doesNotMatch(main, /ContentNotificationBaseline/);
});

test("service worker click path applies the exact url on every platform", () => {
  assert.match(sw, /const targetUrl = data\.url \|\|/);
  assert.match(sw, /existingClient\.navigate\(targetUrl\)/);
  assert.match(sw, /clients\.openWindow\(targetUrl\)/);
  // The message posted to the open page carries the url too, so the fallback
  // (when navigate() is a no-op or fails) still lands on the exact location.
  assert.match(sw, /type: 'site-notification-open', notificationId, url: targetUrl, target: data\.target/);
});

test("page message handler navigates by the worker-provided url", () => {
  assert.match(main, /message\.type === "site-notification-open"/);
  assert.match(main, /message\.url\.includes\("#"\)/);
  assert.match(main, /window\.location\.hash = message\.url\.slice\(message\.url\.indexOf\("#"\)\)/);
});

test("server pushes deep-link buyers into the course player, not the store", () => {
  assert.match(pushSend, /url: `\/#\/course\/\$\{productId\}`/);
  assert.match(cron, /url: `\/#\/course\/\$\{update\.id\}`/);
});
