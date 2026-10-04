// tests/joplinCronDeliveryContract.test.mjs
//
// The server half of "one schedule, one delivery authority" (§53, §64, §100).
//
// `utils/scheduleOccurrences.js` can compute the right occurrences all day; the
// guarantee the learner actually feels is that the cron writes them ONCE, with
// the SAME ids and tags the device uses, and that the legacy planner stops
// firing for a learner whose data has been migrated. Those are properties of
// `api/cron/subscription-renewals.ts`, so this suite reads the function and
// checks them — the alternative would be standing up Firestore and a VAPID pair
// just to assert a string.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cron = fs.readFileSync("api/cron/subscription-renewals.ts", "utf8");
const main = fs.readFileSync("src/main.tsx", "utf8");
const notifications = fs.readFileSync("src/joplin/scheduling/scheduleNotifications.ts", "utf8");
const bridge = fs.readFileSync("src/joplin/joplinSchedulerBridge.ts", "utf8");

const between = (start, end) => {
  const from = cron.indexOf(start);
  assert.ok(from >= 0, `cron is missing the marker: ${start}`);
  const to = cron.indexOf(end, from);
  assert.ok(to > from, `cron is missing the closing marker: ${end}`);
  return cron.slice(from, to);
};

const canonicalJob = () => between("2a. canonical workspace schedules", "2b. FlowPath scheduled jobs");

test("the cron reads the canonical series table, not a copy of the shapes", () => {
  assert.match(cron, /import \{ dueScheduleOccurrences \} from "\.\.\/\.\.\/utils\/scheduleOccurrences\.js"/);
  const job = canonicalJob();
  assert.match(job, /collectionGroup\("scheduledItems"\)/);
  // The doc id has to be merged in by hand: `data()` does not carry it, and the
  // occurrence maths derives the notification key from the schedule id.
  assert.match(job, /\{ id: document\.id, \.\.\.\(document\.data\(\) \|\| \{\}\) \}/);
  // A row whose ownerId disagrees with its path never notifies anyone.
  assert.match(job, /owner !== uid\) continue/);
});

test("one occurrence yields one inbox document with the device's own id", () => {
  const job = canonicalJob();
  assert.match(job, /collection\("notifications"\)\.doc\(item\.notificationId\)/);
  assert.match(job, /category: "mayday"/);
  assert.match(job, /target: \{\s*\n\s*type: "joplin",/);
  assert.match(job, /scheduleId: item\.scheduleId/);
  // The deep link is the canonical one, never the legacy section URL.
  assert.match(job, /url: `\/\$\{item\.deepLink\}`/);
});

test("the push tag equals the tag the app and the Android alarm use", () => {
  const job = canonicalJob();
  // Server: `myday-<scheduleId>:<occurrenceKey>-<section>`.
  assert.match(job, /tag: `myday-\$\{item\.scheduleId\}:\$\{item\.occurrenceKey\}-\$\{section\}`/);
  // Device: `myday-<item.key>-<item.section>`, where the canonical key is built
  // as `<scheduleId>:<occurrenceKey>` by `toLegacyShapedDueItem` — same string.
  assert.match(main, /tag: `myday-\$\{item\.key\}-\$\{item\.section\}`/);
  assert.match(notifications, /key: `\$\{occurrence\.scheduleId\}:\$\{occurrence\.occurrenceKey\}`/);
  assert.match(main, /showLocalSystemNotification\(item\.title, item\.body, itemUrl, `myday-\$\{item\.key\}-\$\{item\.section\}`\)/);
});

test("delivery is recorded on the row, so the app stays silent afterwards", () => {
  const job = canonicalJob();
  assert.match(job, /row\.lastFiredKey/);
  assert.match(job, /fired\[key\] = Number\(row\.lastFiredAt\) \|\| 0/);
  assert.match(job, /dueScheduleOccurrences\(rows, now, lookbackMs, fired\)/);
  assert.match(job, /set\(\{ lastFiredKey: entry\.key, lastFiredAt: entry\.at \}, \{ merge: true \}\)/);
  // No shadow log: the canonical path never writes the legacy dedupe map.
  assert.doesNotMatch(job, /notificationLog/);
});

test("the legacy planner stops firing once a learner is migrated", () => {
  const legacyJob = between("2. My Day items", "2a. canonical workspace schedules");
  assert.match(legacyJob, /collection\("joplinMeta"\)\.doc\("migrationV1"\)/);
  assert.match(legacyJob, /Number\(markerData\.version\) >= 1 && Number\(markerData\.completedAt\) > 0/);
  assert.match(legacyJob, /migrated \+= 1;\s*\n\s*continue;/);
  // …and the summary says how many were skipped, so an operator can watch the
  // transition window close.
  assert.match(cron, /migratedSkipped: migrated/);
});

test("a paused or deleted schedule is never delivered", () => {
  const job = canonicalJob();
  // The skipping itself lives in the mirror (and is covered by the parity
  // suite); what this guards is that the cron hands it every row unflattened,
  // so `enabled`/`deleted` reach the filter.
  assert.match(job, /dueScheduleOccurrences\(rows, now, lookbackMs, fired\)/);
  assert.match(cron, /items: delivered/);
  assert.match(cron, /usersWithDueItems: usersWithDue/);
  // The schedule row is the one that owns the series (§119: no expansion into
  // rows), which is what the scheduler bridge writes.
  assert.match(bridge, /JOPLIN_COLLECTIONS\.schedules/);
});
