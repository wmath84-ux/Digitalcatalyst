import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildProductInventoryEntry,
  collectDueMyDayItems,
  diffProductInventory,
  parseClockTime,
} from "../utils/pushScheduler.js";

const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");
const myDayApp = fs.readFileSync("src/MyDayApp.tsx", "utf8");
const notificationsPage = fs.readFileSync("src/components/NotificationsPage.tsx", "utf8");

// 2026-08-13T04:30:00Z is exactly 10:00 in IST (offset −330 minutes).
const IST = -330;
const NOW = Date.parse("2026-08-13T04:30:00.000Z");
const DAY = "2026-08-13";

test("parseClockTime accepts 24h, 12h and rejects garbage", () => {
  assert.deepEqual(parseClockTime("10:00"), { hours: 10, minutes: 0 });
  assert.deepEqual(parseClockTime("09:30 PM"), { hours: 21, minutes: 30 });
  assert.deepEqual(parseClockTime("12:00 AM"), { hours: 0, minutes: 0 });
  assert.deepEqual(parseClockTime("12:15 pm"), { hours: 12, minutes: 15 });
  assert.equal(parseClockTime("25:99"), null);
  assert.equal(parseClockTime(""), null);
  assert.equal(parseClockTime(null), null);
});

test("My Day items fire exactly at the user-set local time, once, app closed or open", () => {
  const data = {
    reminders: [
      { id: "r1", text: "Drink water", time: "10:00", done: false },        // due right now
      { id: "r2", text: "Old one", time: "09:40", done: false },            // 20 min ago → too late
      { id: "r3", text: "Done one", time: "10:00", done: true },            // already done
      { id: "r4", text: "Notified one", time: "10:00", done: false },       // already notified
    ],
    tasks: [
      { id: "t1", title: "Physics numericals", time: "09:59", status: "pending" },   // due 1 min ago
      { id: "t2", title: "Essay", time: "09:58", status: "completed" },              // finished
      { id: "t3", title: "No time task", status: "pending" },                        // no time → nothing to fire
    ],
    schedule: [
      { id: "s1", title: "Live class", startTime: "09:55", endTime: "10:30", type: "class" },  // started 5 min ago
      { id: "s2", title: "Morning block", startTime: "08:00", endTime: "09:00", type: "study" }, // already ended
    ],
    notificationLog: { [`reminder:r4:${DAY}`]: NOW - 1000 },
  };
  const due = collectDueMyDayItems(data, NOW, IST);
  const keys = due.map((item) => item.key);
  assert.ok(keys.includes(`reminder:r1:${DAY}`));
  assert.ok(keys.includes(`task:t1:${DAY}`));
  assert.ok(keys.includes(`schedule:s1:${DAY}`));
  assert.equal(due.length, 3, JSON.stringify(keys));
  const reminder = due.find((item) => item.kind === "reminder");
  assert.equal(reminder.title, "⏰ Reminder");
  assert.equal(reminder.body, "Drink water");
});

test("My Day scheduler needs a device timezone and never double-fires", () => {
  const data = { reminders: [{ id: "r1", text: "x", time: "10:00", done: false }] };
  assert.equal(collectDueMyDayItems(data, NOW, Number.NaN).length, 0);
  const first = collectDueMyDayItems(data, NOW, IST);
  assert.equal(first.length, 1);
  const withLog = { ...data, notificationLog: { [first[0].key]: NOW } };
  assert.equal(collectDueMyDayItems(withLog, NOW, IST).length, 0);
});

test("product inventory diff announces new products and purchased-course content only", () => {
  const current = {
    p1: buildProductInventoryEntry({ title: "Notes PDF", salePrice: "₹0", courseContent: [{ id: "m1", files: [{ id: "f1" }] }] }),
    p2: buildProductInventoryEntry({ title: "Paid Course", salePrice: "₹249", courseContent: [{ id: "m1", files: [{ id: "f1" }, { id: "f2" }] }] }),
  };
  const first = diffProductInventory(null, current);
  assert.equal(first.isBaseline, true);
  assert.equal(first.newProducts.length, 0, "first run must snapshot, never flood devices");

  const previous = {
    products: {
      p1: current.p1,
      p2: { ...current.p2, lessonIds: ["m1:f1"] }, // f2 lesson is new
    },
  };
  const diff = diffProductInventory(previous, current);
  assert.equal(diff.isBaseline, false);
  assert.equal(diff.newProducts.length, 0);
  assert.deepEqual(diff.updatedProducts, [{ id: "p2", title: "Paid Course", newModules: 0, newLessons: 1 }]);

  const withNew = { ...current, p3: buildProductInventoryEntry({ title: "Free Notes", isFree: true }) };
  const diff2 = diffProductInventory({ products: current }, withNew);
  assert.equal(diff2.newProducts.length, 1);
  assert.equal(diff2.newProducts[0].id, "p3");
  assert.equal(diff2.newProducts[0].free, true);
});

test("cron endpoint schedules renewals, My Day pushes and content announcements", () => {
  assert.match(cron, /collectDueMyDayItems/);
  assert.ok(/collectionGroup\(("|')myDay\1\)/.test(cron), "scans users' myDay docs");
  assert.match(cron, /contentPushState/);
  assert.match(cron, /diffProductInventory/);
  assert.match(cron, /New free product available/);
  assert.match(cron, /Your course has new content/);
});

test("My Day saves the device timezone so server push fires at the right local time", () => {
  assert.match(myDayApp, /tzOffsetMinutes: new Date\(\)\.getTimezoneOffset\(\)/);
});

test("bell center maps stored cloud categories (My Day reminders are not mislabeled)", () => {
  assert.match(notificationsPage, /data\.category/);
  assert.match(notificationsPage, /"mayday"/);
  assert.match(notificationsPage, /target\.type === "mayday"/);
});
