// tests/myDayUpcomingAlarmContract.test.mjs
//
// The TWA arms a LOCAL alarm for every My Day item due in the next few
// hours so an exact-time reminder fires on the dot even when the app is
// closed. The first version armed those alarms by reusing the DUE collector
// with `now` shifted 6h forward — but the due collector only ever returns
// items due in the last 15 minutes, so it only saw the slice 5h45m–6h out.
// Every task created for "later today" was silently never armed, which is
// the "no notification at the set time" report. These tests pin the fix.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MYDAY_UPCOMING_HORIZON_MS,
  collectDueMyDayItems,
  collectUpcomingMyDayItems,
} from "../utils/pushScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

// 2026-08-13T04:30:00Z is exactly 10:00 IST (offset −330).
const IST = -330;
const NOW = Date.parse("2026-08-13T04:30:00.000Z");
const DAY = "2026-08-13";

test("upcoming collector arms items due in the next 6h, not just one slice", () => {
  const data = {
    tasks: [
      { id: "t1", title: "Due in 30 min", time: "10:30", status: "pending" },
      { id: "t2", title: "Due in 7h (too far)", time: "17:00", status: "pending" },
    ],
    reminders: [
      { id: "r1", text: "Due in 2h", time: "12:00", done: false },
      { id: "r2", text: "Due 1h ago (past)", time: "09:00", done: false },
    ],
    schedule: [
      { id: "s1", title: "Starts in 1h", startTime: "11:00", endTime: "12:00", type: "class" },
      { id: "s2", title: "Already ended", startTime: "09:00", endTime: "09:30", type: "study" },
    ],
  };
  const upcoming = collectUpcomingMyDayItems(data, NOW, IST);
  const keys = new Set(upcoming.map((item) => item.key));
  assert.ok(keys.has(`task:t1:${DAY}`), "30-min task must be armed");
  assert.ok(keys.has(`reminder:r1:${DAY}`), "2h reminder must be armed");
  assert.ok(keys.has(`schedule:s1:${DAY}`), "1h schedule event must be armed");
  assert.ok(!keys.has(`task:t2:${DAY}`), "7h task is outside the horizon");
  assert.ok(!keys.has(`reminder:r2:${DAY}`), "past reminder's next occurrence is tomorrow (outside horizon)");
  assert.ok(!keys.has(`schedule:s2:${DAY}`), "ended event must never fire");
  assert.ok(upcoming.every((item) => item.dueAt > NOW), "every armed item is still in the future");
  assert.ok(upcoming.every((item) => item.dueAt - NOW <= MYDAY_UPCOMING_HORIZON_MS), "every armed item is within the horizon");
});

test("upcoming collector handles the cross-midnight case", () => {
  // 22:30 IST: an item at 00:30 must mean TOMORROW 00:30 (2h away), not
  // this morning's, which the due-only logic could never see.
  const lateNow = Date.parse("2026-08-13T17:00:00.000Z");
  const data = { reminders: [{ id: "r1", text: "Midnight", time: "00:30", done: false }] };
  const upcoming = collectUpcomingMyDayItems(data, lateNow, IST);
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].key, `reminder:r1:2026-08-14`);
  assert.ok(upcoming[0].dueAt > lateNow);
});

test("upcoming collector respects the per-day dedupe log", () => {
  const data = {
    tasks: [{ id: "t1", title: "Already fired", time: "10:30", status: "pending" }],
    notificationLog: { [`task:t1:${DAY}`]: NOW },
  };
  assert.equal(collectUpcomingMyDayItems(data, NOW, IST).length, 0);
});

test("the due collector still only sees already-due items", () => {
  // The two collectors must stay distinct: due = past 15 min, upcoming = future.
  const data = { reminders: [{ id: "r1", text: "Future", time: "12:00", done: false }] };
  assert.equal(collectDueMyDayItems(data, NOW, IST).length, 0);
  assert.equal(collectUpcomingMyDayItems(data, NOW, IST).length, 1);
});

test("main.tsx pre-schedules via the upcoming collector", () => {
  const main = read("src/main.tsx");
  assert.match(main, /collectUpcomingMyDayItems\(current, now, tzOffset\(\), MYDAY_UPCOMING_HORIZON_MS\)/);
  assert.match(main, /import \{ collectDueMyDayItems, collectUpcomingMyDayItems, MYDAY_UPCOMING_HORIZON_MS, type MyDayDocData \}/);
  // The broken shifted-now due-collector call must be gone.
  assert.doesNotMatch(main, /collectDueMyDayItems\(current, now \+ 6 \* 60 \* 60 \* 1000/);
});
