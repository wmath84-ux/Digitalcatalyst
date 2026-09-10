// tests/inboxNotificationBridgeContract.test.mjs
//
// Contract for the notification-inbox bridge (utils/inboxBridge.js + the
// inbox effect in src/main.tsx). Scoped ONLY to the bridge: My Day and FlowPath
// keep their own pinned contracts (myDayPushSchedulerContract,
// myDayUpcomingAlarmContract, flowPathSchedulerContract) and this test asserts
// the bridge never reaches into their categories.
//
// What the bridge owes the user: every server-generated alert (new product,
// unlock, course content update, renewal, announcement, community) shows up on
// the device even when the Web Push / FCM transport missed it — exactly once.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INBOX_FRESH_MS,
  INBOX_GRACE_MS,
  INBOX_MAX_PER_PASS,
  collectUnsurfacedInboxNotifications,
  deriveInboxTag,
  normalizeCreatedAtMs,
  pruneSeenMap,
  resolveInboxUrl,
} from "../utils/inboxBridge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const NOW = Date.parse("2026-09-10T10:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
/** A doc written 2 minutes ago: past the grace window, well inside freshness. */
const freshDoc = (id, data = {}, createdAt = NOW - 2 * MIN) => ({
  id,
  data: { category: "store", title: "🆕 New product added", body: "Physics 2027", createdAt: { _seconds: Math.floor(createdAt / 1000) }, ...data },
});

test("new-product bell docs surface as a device notification", () => {
  const docs = [freshDoc("content:product:42", { target: { type: "product", productId: 42 } })];
  const items = collectUnsurfacedInboxNotifications(docs, NOW, {});
  assert.equal(items.length, 1);
  assert.equal(items[0].docId, "content:product:42");
  assert.equal(items[0].category, "store");
  assert.equal(items[0].title, "🆕 New product added");
  assert.equal(items[0].body, "Physics 2027");
  assert.equal(items[0].url, "/#/product/42");
  // Aligned with the server's tag so a browser holding the doc AND the push
  // collapses them into one row instead of stacking two.
  assert.equal(items[0].tag, "content-product-42");
});

test("every other server category resolves to its own deep link", () => {
  const docs = [
    freshDoc("a", { category: "course", target: { type: "product", productId: 7 } }),
    freshDoc("b", { category: "unlock", target: { type: "purchases" } }),
    freshDoc("c", { category: "subscription", expired: true, target: { type: "subscription", expired: true } }),
    freshDoc("d", { category: "announcement", target: { type: "announcement", announcementId: "x" } }),
    freshDoc("e", { category: "community", target: { type: "community" } }),
    freshDoc("f", { category: "mystery", target: null }),
  ];
  const byId = new Map(collectUnsurfacedInboxNotifications(docs, NOW, {}, { maxPerPass: 9 }).map((i) => [i.docId, i]));
  assert.equal(byId.get("a").url, "/#/course/7", "course updates open the player");
  assert.equal(byId.get("b").url, "/#/store/purchases");
  assert.equal(byId.get("c").url, "/#/subscription?renew=1", "expired renewal goes to renewal intent");
  assert.equal(byId.get("d").url, "/#/home");
  assert.equal(byId.get("e").url, "/#/home");
  assert.equal(byId.get("f").url, "/#/notifications", "unknown targets degrade to the bell page");
  assert.equal(byId.get("f").category, "mystery");
});

test("surfacing is once per doc id per device, ever", () => {
  const docs = [freshDoc("content:product:1")];
  const first = collectUnsurfacedInboxNotifications(docs, NOW, {});
  assert.equal(first.length, 1);
  const seen = { [first[0].key]: NOW };
  assert.equal(collectUnsurfacedInboxNotifications(docs, NOW + MIN, seen).length, 0);
  // Even an hour later the same doc is never re-announced — the permanent
  // per-id dedupe is what replaces the old (buggy) baseline diff.
  assert.equal(collectUnsurfacedInboxNotifications(docs, NOW + HOUR, seen).length, 0);
});

test("My Day and FlowPath categories are left to their own schedulers", () => {
  const docs = [
    freshDoc("task:abc:2026-09-10", { category: "mayday", title: "📝 Task time" }),
    freshDoc("flowpath:abc", { category: "mayday", title: "⏰ Reminder" }),
    freshDoc("content:product:9", { category: "store" }),
  ];
  const items = collectUnsurfacedInboxNotifications(docs, NOW, {});
  assert.deepEqual(items.map((i) => i.docId), ["content:product:9"]);
});

test("categories the bell hides are skipped too", () => {
  const docs = [
    freshDoc("news:1", { category: "reading", title: "📰 New news update" }),
    freshDoc("content:product:9"),
  ];
  assert.deepEqual(collectUnsurfacedInboxNotifications(docs, NOW, {}).map((i) => i.docId), ["content:product:9"]);
  // ...and a caller can still opt them back in explicitly.
  assert.equal(collectUnsurfacedInboxNotifications(docs, NOW, {}, { skipCategories: new Set() }).length, 2);
});

test("stale, too-new and read docs are skipped", () => {
  const docs = [
    freshDoc("old", {}, NOW - INBOX_FRESH_MS - MIN),
    freshDoc("just-now", {}, NOW - (INBOX_GRACE_MS - 5_000)),
    freshDoc("already-read", { read: true }),
    freshDoc("no-title", { title: "   " }),
    freshDoc("good"),
  ];
  const items = collectUnsurfacedInboxNotifications(docs, NOW, {});
  assert.deepEqual(items.map((i) => i.docId), ["good"]);
});

test("Firestore Timestamps, millis, ISO strings and missing stamps all normalize", () => {
  assert.equal(normalizeCreatedAtMs({ _seconds: 1_700_000_000, _nanoseconds: 500_000_000 }), 1_700_000_000_500);
  assert.equal(normalizeCreatedAtMs(NOW), NOW);
  assert.equal(normalizeCreatedAtMs("2026-09-10T10:00:00.000Z"), NOW);
  assert.equal(normalizeCreatedAtMs(undefined, NOW), NOW, "missing stamp falls back to now");
  const docs = [freshDoc("epoch", { createdAt: NOW - 2 * MIN }), freshDoc("iso", { createdAt: new Date(NOW - 3 * MIN).toISOString() })];
  assert.equal(collectUnsurfacedInboxNotifications(docs, NOW, {}).length, 2);
});

test("device clock skew ahead of the server does not swallow the alert", () => {
  // Doc stamped 3 hours in the future (server correct, device behind-but-set
  // wrongly, or a Timestamp written from another device).
  const docs = [freshDoc("skew", {}, NOW + 3 * HOUR)];
  const items = collectUnsurfacedInboxNotifications(docs, NOW, {});
  assert.equal(items.length, 1, "clamped to now instead of parked in the future");
  assert.ok(items[0].createdAt <= NOW);
});

test("a burst is capped and ordered newest-first", () => {
  const docs = Array.from({ length: 9 }, (_, i) => freshDoc(`p${i}`, { title: `Product ${i}` }, NOW - (i + 2) * MIN));
  const items = collectUnsurfacedInboxNotifications(docs, NOW, {});
  assert.equal(items.length, INBOX_MAX_PER_PASS);
  assert.deepEqual(items.map((i) => i.title), ["Product 0", "Product 1", "Product 2", "Product 3", "Product 4"]);
  // Next pass picks up the rest, so nothing is lost by the cap.
  const seen = Object.fromEntries(items.map((i) => [i.key, NOW]));
  const rest = collectUnsurfacedInboxNotifications(docs, NOW, seen);
  assert.equal(rest.length, 9 - INBOX_MAX_PER_PASS);
  assert.equal(rest[0].title, "Product 5");
});

test("garbage input degrades to an empty pass", () => {
  for (const bad of [null, undefined, "nope", {}, [null], [{ id: "", data: null }]]) {
    assert.deepEqual(collectUnsurfacedInboxNotifications(bad, NOW, {}), [], String(bad));
  }
  assert.deepEqual(collectUnsurfacedInboxNotifications([freshDoc("x")], Number.NaN, {}), []);
});

test("pruneSeenMap bounds the storage map without resurrecting alerts", () => {
  const seen = { fresh: NOW - HOUR, stale: NOW - 30 * 24 * HOUR, junk: "nope" };
  const pruned = pruneSeenMap(seen, NOW);
  assert.deepEqual(Object.keys(pruned), ["fresh"]);
  // The pruned id's doc is 30 days old, i.e. past INBOX_FRESH_MS, so dropping
  // the marker cannot re-fire it.
  assert.equal(collectUnsurfacedInboxNotifications([freshDoc("stale", {}, NOW - 30 * 24 * HOUR)], NOW, pruned).length, 0);
});

test("tag derivation is collision-safe for malformed ids", () => {
  assert.equal(deriveInboxTag("store", { productId: "1 2/3" }, "x"), "content-product-1-2-3");
  assert.equal(deriveInboxTag("store", null, "content:product:5"), "inbox-content-product-5");
  assert.equal(deriveInboxTag("course", { productId: 7 }, "y"), "content-course-7");
});

test("main.tsx wires the bridge to the bell collection and the shared channel", () => {
  const main = read("src/main.tsx");
  assert.match(main, /from "\.\.\/utils\/inboxBridge"/);
  // Reuses the bell's ref-counted listener rather than opening its own.
  assert.match(main, /subscribeShared\(\s*\n?\s*notificationsKey\(user\.id\)/);
  assert.match(main, /collection\(db, "users", user\.id, "notifications"\)/);
  assert.match(main, /collectUnsurfacedInboxNotifications\(latest, now, seen\)/);
  // Delivery reuses the existing "eduvora-reminders" channel + the web path.
  assert.match(main, /ensureReminderChannel\(\)[\s\S]{0,400}scheduleLocalAlarm\(\{[\s\S]{0,400}tag: item\.tag/);
  assert.match(main, /showLocalSystemNotification\(item\.title, item\.body, item\.url, item\.tag\)/);
});

test("the bridge is a delivery path only — it never writes notification docs", () => {
  const main = read("src/main.tsx");
  const start = main.indexOf("Notification inbox bridge");
  const end = main.indexOf("// Renewal reminders, product unlocks", start);
  assert.ok(start > 0 && end > start, "inbox effect must be delimited for this check");
  const effect = main.slice(start, end);
  for (const forbidden of ["setDoc", "updateDoc", "deleteDoc", ".set(", ".update(", "addDoc"]) {
    assert.ok(!effect.includes(forbidden), `inbox bridge must not mutate Firestore (${forbidden})`);
  }
  // Nor may it invent alerts the server did not write.
  assert.ok(!effect.includes("saveSiteNotifications"), "inbox bridge must not write the local bell mirror");
});
