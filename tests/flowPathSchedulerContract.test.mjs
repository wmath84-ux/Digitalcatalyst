// tests/flowPathSchedulerContract.test.mjs
//
// Contract for the FlowPath notification pipeline (utils/flowPathScheduler.js
// + the parallel effect in src/main.tsx). Mirrors the My Day scheduler
// contracts (myDayPushSchedulerContract / myDayUpcomingAlarmContract), scoped
// ONLY to the new FlowPath functions — My Day behaviour is pinned by its own
// tests and must stay untouched.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FLOWPATH_UPCOMING_HORIZON_MS,
  collectDueFlowPathItems,
  collectUpcomingFlowPathItems,
} from "../utils/flowPathScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

// 2026-08-13T04:30:00Z is exactly 10:00 in IST (offset −330 minutes).
const IST = -330;
const NOW = Date.parse("2026-08-13T04:30:00.000Z");
const DAY = "2026-08-13";
const MIN = 60_000;

test("FlowPath items with scheduledFor fire once, inside the lookback window", () => {
  const items = [
    { id: "a1", kind: "reminder", title: "Drink water", scheduledFor: NOW - MIN, status: "active" },
    { id: "a2", kind: "task", title: "Old one", scheduledFor: NOW - 20 * MIN, status: "active" },
    { id: "a3", kind: "task", title: "Done one", scheduledFor: NOW - MIN, status: "completed" },
    { id: "a4", kind: "schedule", title: "Cancelled one", scheduledFor: NOW - MIN, status: "cancelled" },
    { id: "a5", kind: "note", title: "No time note", scheduledFor: null, status: "active" },
  ];
  const due = collectDueFlowPathItems(items, NOW, IST);
  assert.equal(due.length, 1, JSON.stringify(due.map((d) => d.key)));
  assert.equal(due[0].key, `flowpath:a1:${DAY}`);
  assert.equal(due[0].itemId, "a1");
  assert.equal(due[0].title, "⏰ Reminder");
  assert.equal(due[0].body, "Drink water");
});

test("FlowPath falls back to reminderTime / scheduleStartTime wall-clock fields", () => {
  const items = [
    { id: "r1", kind: "reminder", title: "Take a break", scheduledFor: null, reminderTime: "10:00", status: "active" },
    { id: "s1", kind: "schedule", title: "Physics tutorial", scheduledFor: null, scheduleStartTime: "09:59", status: "active" },
    { id: "t1", kind: "task", title: "No clock anywhere", scheduledFor: null, status: "active" },
  ];
  const due = collectDueFlowPathItems(items, NOW, IST);
  const keys = due.map((d) => d.key);
  assert.ok(keys.includes(`flowpath:r1:${DAY}`), JSON.stringify(keys));
  assert.ok(keys.includes(`flowpath:s1:${DAY}`), JSON.stringify(keys));
  assert.equal(due.length, 2, JSON.stringify(keys));
});

test("FlowPath dedupes once per item per day and needs a timezone", () => {
  const items = [{ id: "a1", kind: "task", title: "x", scheduledFor: NOW - MIN, status: "active" }];
  assert.equal(collectDueFlowPathItems(items, NOW, Number.NaN).length, 0);
  assert.equal(collectDueFlowPathItems(null, NOW, IST).length, 0);
  const first = collectDueFlowPathItems(items, NOW, IST);
  assert.equal(first.length, 1);
  const withLog = { [first[0].key]: NOW };
  assert.equal(collectDueFlowPathItems(items, NOW, IST, withLog).length, 0);
  assert.equal(collectUpcomingFlowPathItems(
    [{ id: "a2", kind: "task", title: "y", scheduledFor: NOW + 30 * MIN, status: "active" }],
    NOW, IST, { [`flowpath:a2:${DAY}`]: NOW },
  ).length, 0);
});

test("FlowPath upcoming collector arms the next 6h, not past or far-future items", () => {
  const items = [
    { id: "t1", kind: "task", title: "Due in 30 min", scheduledFor: NOW + 30 * MIN, status: "active" },
    { id: "t2", kind: "task", title: "Due in 7h (too far)", scheduledFor: NOW + 7 * 60 * MIN, status: "active" },
    { id: "r1", kind: "reminder", title: "Due 1h ago", scheduledFor: NOW - 60 * MIN, status: "active" },
    { id: "w1", kind: "reminder", title: "Wall clock in 2h", scheduledFor: null, reminderTime: "12:00", status: "active" },
  ];
  const upcoming = collectUpcomingFlowPathItems(items, NOW, IST);
  const keys = new Set(upcoming.map((d) => d.key));
  assert.ok(keys.has(`flowpath:t1:${DAY}`), "30-min item must be armed");
  assert.ok(keys.has(`flowpath:w1:${DAY}`), "wall-clock item in 2h must be armed");
  assert.ok(!keys.has(`flowpath:t2:${DAY}`), "7h item is outside the horizon");
  assert.ok(!keys.has(`flowpath:r1:${DAY}`), "past item must not be armed");
  assert.ok(upcoming.every((d) => d.dueAt > NOW), "every armed item is still in the future");
  assert.ok(upcoming.every((d) => d.dueAt - NOW <= FLOWPATH_UPCOMING_HORIZON_MS), "every armed item is within the horizon");
  // The two collectors stay distinct: due = past slice, upcoming = future.
  assert.equal(collectDueFlowPathItems(items, NOW, IST).length, 0);
});

test("FlowPath upcoming collector handles the cross-midnight wall-clock case", () => {
  // 22:30 IST: reminderTime 00:30 must mean TOMORROW 00:30 (2h away).
  const lateNow = Date.parse("2026-08-13T17:00:00.000Z");
  const items = [{ id: "r1", kind: "reminder", title: "Midnight", scheduledFor: null, reminderTime: "00:30", status: "active" }];
  const upcoming = collectUpcomingFlowPathItems(items, lateNow, IST);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].key, "flowpath:r1:2026-08-14");
  assert.ok(upcoming[0].dueAt > lateNow);
});

test("FlowPath dedupe keys survive Firestore dot-path restrictions", () => {
  const items = [{ id: "my.task/[1]*~`", kind: "task", title: "x", scheduledFor: NOW - MIN, status: "active" }];
  const due = collectDueFlowPathItems(items, NOW, IST);
  assert.equal(due.length, 1);
  assert.doesNotMatch(due[0].key, /[.\\/[\]*~`]/, "key must be safe inside a dot-path update");
  assert.match(due[0].key, /^flowpath:[A-Za-z0-9_:-]+:\d{4}-\d{2}-\d{2}$/);
});

test("main.tsx wires FlowPath through the existing reminder channel + alarm APIs", () => {
  const main = read("src/main.tsx");
  assert.match(main, /collectDueFlowPathItems\(current, now, tzOffset\(\), shown\)/);
  assert.match(main, /collectUpcomingFlowPathItems\(current, now, tzOffset\(\), shown, FLOWPATH_UPCOMING_HORIZON_MS\)/);
  assert.match(main, /from "\.\.\/utils\/flowPathScheduler"/);
  // Same data source the dashboard hook uses (flowpath.list), same delivery
  // APIs as My Day, same channel (no new channel), FlowPath-scoped tags and
  // orphan cleanup.
  assert.match(main, /action: "flowpath\.list"/);
  assert.match(main, /tag: `flowpath-\$\{item\.key\}`/);
  assert.match(main, /`\/\#\/flowpath\?item=\$\{encodeURIComponent\(item\.itemId\)\}`/);
  assert.match(main, /eduvora\.flowPathAlarmIds\.v1/);
  assert.match(main, /eduvora\.flowPathSystemNotifications\.v1/);
  assert.doesNotMatch(main, /createChannel\(\{\s*id: "(?!eduvora-reminders)/);
});

test("My Day scheduling code is untouched", () => {
  const main = read("src/main.tsx");
  assert.match(main, /collectDueMyDayItems\(current, now, tzOffset\(\)\)/);
  assert.match(main, /collectUpcomingMyDayItems\(current, now, tzOffset\(\), MYDAY_UPCOMING_HORIZON_MS\)/);
  assert.match(main, /eduvora\.myDaySystemNotifications\.v1/);
  assert.match(main, /eduvora\.myDayAlarmIds\.v1/);
});
