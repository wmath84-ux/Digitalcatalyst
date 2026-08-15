// tests/myDayExactTimeDeliveryContract.test.mjs
//
// "A reminder must arrive at the exact time the user set it, whether
// the app is open or closed."
//
// The delivery machinery already existed; what did not was a scheduler
// that actually ran often enough, and a catch-up window that could
// survive one being missed. These tests pin the three failures that
// made reminders silently never arrive:
//
//   1. The window was a fixed 15 minutes, so anything due between two
//      widely-spaced runs fell outside it and was dropped forever.
//   2. Vercel's Hobby plan caps cron at ONE run per day (a sub-daily
//      expression fails at deploy time), so the only in-repo scheduler
//      could not deliver minute-accurate reminders at all.
//   3. Push notifications were tagged per KIND, so three tasks due at
//      the same minute collapsed into one system notification, and the
//      tag disagreed with the foreground path, allowing a duplicate.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MYDAY_LOOKBACK_MS,
  MYDAY_MAX_CATCHUP_MS,
  collectDueMyDayItems,
  resolveLookbackMs,
} from "../utils/pushScheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const cron = read("api/cron/subscription-renewals.ts");
const workflow = read("ops/push-scheduler.workflow.yml");
const liveWorkflow = read(".github/workflows/push-scheduler.yml");
const vercelConfig = JSON.parse(read("vercel.json"));

// 2026-08-13T04:30:00Z is exactly 10:00 IST (offset -330).
const IST = -330;
const NOW = Date.parse("2026-08-13T04:30:00.000Z");
const DAY = "2026-08-13";
const MINUTE = 60 * 1000;

test("the catch-up window grows to cover the gap since the last run", () => {
  // Never smaller than the default, whatever the input.
  assert.equal(resolveLookbackMs(0, NOW), MYDAY_LOOKBACK_MS);
  assert.equal(resolveLookbackMs(null, NOW), MYDAY_LOOKBACK_MS);
  assert.equal(resolveLookbackMs(NOW, NOW), MYDAY_LOOKBACK_MS);
  // A clock that jumped backwards must not produce a negative window.
  assert.equal(resolveLookbackMs(NOW + 5 * MINUTE, NOW), MYDAY_LOOKBACK_MS);

  // A 40-minute outage must be covered, not skipped.
  const gap = 40 * MINUTE;
  assert.ok(resolveLookbackMs(NOW - gap, NOW) >= gap);

  // But an hours-long gap is capped — a breakfast reminder at dinner
  // time is noise, not a reminder.
  assert.equal(resolveLookbackMs(NOW - 8 * 60 * MINUTE, NOW), MYDAY_MAX_CATCHUP_MS);
});

test("an item due during a scheduler outage still fires on the next run", () => {
  const data = {
    tasks: [{ id: "t1", title: "Physics numericals", time: "09:35", status: "pending" }],
  };
  // 25 minutes late: outside the old fixed window, so it used to vanish.
  assert.equal(collectDueMyDayItems(data, NOW, IST).length, 0);

  const lookback = resolveLookbackMs(NOW - 30 * MINUTE, NOW);
  const due = collectDueMyDayItems(data, NOW, IST, lookback);
  assert.equal(due.length, 1);
  assert.equal(due[0].key, `task:t1:${DAY}`);
});

test("the scheduler records its run only after every job succeeds", () => {
  assert.match(cron, /pushSchedulerState/);
  assert.match(cron, /lastRunAt/);
  assert.match(cron, /resolveLookbackMs\(lastRunAt, now\)/);
  // The write must be the last thing before the response — a handler
  // that throws halfway must leave the window open for a retry.
  const writeIndex = cron.indexOf("runStateRef.set({ lastRunAt: now");
  const responseIndex = cron.indexOf("return res.status(200).json({ ok: true, ...summary })");
  assert.ok(writeIndex > 0 && writeIndex < responseIndex, "lastRunAt must be written just before the success response");
  assert.ok(writeIndex > cron.indexOf("3. content announces"), "lastRunAt must be written after all three jobs");
});

test("each due item gets its own notification instead of collapsing", () => {
  // Three tasks at the same minute must produce three distinct keys...
  const data = {
    tasks: [
      { id: "t1", title: "Physics", time: "10:00", status: "pending" },
      { id: "t2", title: "Chemistry", time: "10:00", status: "pending" },
      { id: "t3", title: "Maths", time: "10:00", status: "pending" },
    ],
  };
  const due = collectDueMyDayItems(data, NOW, IST);
  assert.equal(due.length, 3);
  assert.equal(new Set(due.map((item) => item.key)).size, 3);

  // ...and the push tag must be derived from the key, not the kind.
  assert.match(cron, /tag: `myday-\$\{item\.key\}`/);
  assert.doesNotMatch(cron, /tag: `myday-\$\{item\.kind\}`/);
});

test("the foreground and server paths agree on the notification tag", () => {
  // Same tag means the OS replaces rather than duplicates when a push
  // lands while the app is open.
  assert.match(read("src/main.tsx"), /`myday-\$\{item\.key\}`/);
  assert.match(cron, /`myday-\$\{item\.key\}`/);
});

test("a minute-level scheduler workflow is committed and active", () => {
  // The live workflow must live under .github/workflows/ — that is the
  // only location GitHub Actions schedules from. A template that only
  // lived in ops/ meant reminders silently fell back to once-a-day.
  assert.match(liveWorkflow, /name: Push scheduler/);
  for (const source of [liveWorkflow, workflow]) {
    assert.match(source, /workflow_dispatch/, "manual runs make this testable");
    assert.match(source, /concurrency:/, "a slow run must not overlap the next tick");
    assert.match(source, /Authorization: Bearer/);
    assert.match(source, /\$\{\{ secrets\.CRON_SECRET \}\}/);
    assert.match(source, /\$\{\{ secrets\.SCHEDULER_URL \}\}/);
  }
});

test("the scheduler pings every minute for exact-time delivery", () => {
  // Exact-time reminders need a one-minute tick (the endpoint's own
  // lookback window absorbs jitter). Any coarser cadence makes a
  // reminder late, so guard the cron expression against loosening.
  for (const source of [liveWorkflow, workflow]) {
    assert.match(source, /cron: "\* \* \* \* \*"/, "scheduler must run every minute");
  }
});

test("a minute-level scheduler exists, because Vercel Hobby cron cannot do it", () => {
  // Hobby rejects any sub-daily expression at deploy time, so the
  // committed vercel.json must stay daily.
  const schedule = vercelConfig.crons[0].schedule;
  assert.doesNotMatch(schedule, /^\*/, "a sub-daily Vercel cron breaks Hobby deployments");
  assert.equal(schedule.split(" ").length, 5);
});

test("the scheduler endpoint stays authenticated", () => {
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /Unauthorized/);
  // The workflow must not hard-code the secret or the host.
  assert.match(workflow, /\$\{\{ secrets\.CRON_SECRET \}\}/);
  assert.match(workflow, /\$\{\{ secrets\.SCHEDULER_URL \}\}/);
});

test("the daily Vercel cron still works as a fallback", () => {
  assert.equal(vercelConfig.crons[0].path, "/api/cron/subscription-renewals");
  // Both schedulers hit the same idempotent endpoint, so overlap is safe.
  assert.match(cron, /notificationLog/);
});
