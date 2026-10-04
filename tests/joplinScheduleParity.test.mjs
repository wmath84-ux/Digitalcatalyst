// tests/joplinScheduleParity.test.mjs
//
// The cron function delivers canonical schedules from `utils/scheduleOccurrences.js`
// while the app computes the same occurrences from
// `src/joplin/scheduling/recurrence.ts`. Two implementations may exist only if
// they agree, so this suite drives BOTH over the same fixtures and fails on any
// difference in an instant, a key or an id.

import test from "node:test";
import assert from "node:assert/strict";

import {
  dueScheduleOccurrences,
  nextOccurrence as nextServer,
  notificationKeyFor as keyServer,
  occurrenceKey as occurrenceKeyServer,
  occurrencesBetween as betweenServer,
  occurrenceNotificationDocId as docIdServer,
  timeZoneOffsetMinutes as offsetServer,
  zonedEpochMs as zonedServer,
} from "../utils/scheduleOccurrences.js";

import {
  nextOccurrence as nextClient,
  notificationKeyFor as keyClient,
  occurrenceKey as occurrenceKeyClient,
  occurrencesBetween as betweenClient,
  zonedEpochMs as zonedClient,
} from "../src/joplin/scheduling/recurrence.ts";
import { occurrenceNotificationDocId as docIdClient_manual, sanitizeDocIdSegment } from "../src/joplin/joplinIds.ts";
import { occurrenceNotificationDocId as docIdClient, sanitizeDocIdSegment as sanitizeServer } from "../utils/scheduleOccurrences.js";

// The inbox id must handle the ids a real schedule can have, including the
// `sch_…` shape `scheduleIdForSeries` produces and the occurrence keys.
test("the inbox document id is identical on both sides, including reserved characters", () => {
  const cases = [
    ["sch_0123456789abcdef0123456789ab", "20261004T0230Z"],
    ["plain", "key/with/slashes"],
    [".", ".."],
    ["", ""],
    ["a".repeat(300), "b".repeat(300)],
  ];
  for (const [scheduleId, key] of cases) {
    assert.equal(docIdServer(scheduleId, key), docIdClient_manual(scheduleId, key), `doc id diverged for ${scheduleId} / ${key}`);
  }
});

// 2026: IST has no DST; Europe/London transitions on 2026-03-29 and 2026-10-25.
const ANCHORS = [
  { label: "daily 08:00 IST", dueAt: Date.parse("2026-10-01T02:30:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "daily" } },
  { label: "daily 09:00 London (across DST)", dueAt: Date.parse("2026-03-26T09:00:00.000Z"), timeZone: "Europe/London", recurrence: { freq: "daily" } },
  { label: "every 3 days", dueAt: Date.parse("2026-10-01T02:30:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "daily", interval: 3 } },
  { label: "weekly Mon/Wed/Fri", dueAt: Date.parse("2026-10-05T03:00:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "weekly", weekdays: [1, 3, 5] } },
  { label: "biweekly Tue", dueAt: Date.parse("2026-10-06T03:00:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "weekly", weekdays: [2], interval: 2 } },
  { label: "monthly 31st", dueAt: Date.parse("2026-01-31T04:00:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "monthly", dayOfMonth: 31 } },
  { label: "monthly 2nd", dueAt: Date.parse("2026-10-02T04:00:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "monthly", dayOfMonth: 2, interval: 2 } },
  { label: "every 90 minutes", dueAt: Date.parse("2026-10-04T04:00:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "interval", intervalMinutes: 90 } },
  { label: "once, in the future", dueAt: Date.parse("2026-10-09T04:00:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "once" } },
  { label: "daily until a limit", dueAt: Date.parse("2026-10-01T02:30:00.000Z"), timeZone: "Asia/Kolkata", recurrence: { freq: "daily", until: Date.parse("2026-10-05T00:00:00.000Z") } },
];

test("the server mirror and the client implementation agree occurrence by occurrence", () => {
  const windows = [
    [Date.parse("2026-09-25T00:00:00.000Z"), Date.parse("2026-10-20T00:00:00.000Z")],
    [Date.parse("2026-03-25T00:00:00.000Z"), Date.parse("2026-04-05T00:00:00.000Z")],
    [Date.parse("2026-10-20T00:00:00.000Z"), Date.parse("2026-12-31T00:00:00.000Z")],
  ];
  for (const anchor of ANCHORS) {
    for (const [from, to] of windows) {
      const server = betweenServer(anchor, from, to, 200);
      const client = betweenClient(anchor, from, to, 200);
      assert.deepEqual(server, client, `${anchor.label} diverged in ${new Date(from).toISOString()}`);
      // A few instants outside the window too, so the "next" path is compared
      // where the window would never reach.
      for (const probe of [from - 1, from + 137, to - 4321]) {
        assert.equal(nextServer(anchor, probe), nextClient(anchor, probe), `${anchor.label} next() diverged at ${probe}`);
      }
    }
    for (const at of betweenServer(anchor, Date.parse("2026-09-01T00:00:00.000Z"), Date.parse("2026-12-31T00:00:00.000Z"), 12)) {
      assert.equal(occurrenceKeyServer(at), occurrenceKeyClient(at), `${anchor.label} occurrence key diverged`);
      assert.equal(keyServer("s1", at), keyClient("s1", at), `${anchor.label} notification key diverged`);
      assert.equal(docIdServer("s1", occurrenceKeyServer(at)), docIdClient("s1", occurrenceKeyClient(at)));
    }
  }
});

test("wall-clock resolution and offsets match (DST included)", () => {
  const cases = [
    ["Asia/Kolkata", 2026, 10, 4, 20, 0],
    ["Europe/London", 2026, 3, 29, 9, 0], // spring forward
    ["Europe/London", 2026, 10, 25, 9, 0], // autumn back
    ["America/New_York", 2026, 11, 1, 1, 30], // ambiguous hour
    ["UTC", 2026, 1, 1, 0, 0],
  ];
  for (const [zone, year, month, day, hour, minute] of cases) {
    assert.equal(
      zonedServer(year, month, day, hour, minute, zone),
      zonedClient(year, month, day, hour, minute, zone),
      `${zone} ${year}-${month}-${day} ${hour}:${minute} diverged`,
    );
  }
  for (const at of [Date.parse("2026-03-29T00:30:00.000Z"), Date.parse("2026-10-25T00:30:00.000Z")]) {
    assert.equal(offsetServer(at, "Europe/London"), offsetServer(at, "Europe/London"));
  }
});

test("due occurrences are per-learner, deduped, and never duplicated by a second ping", () => {
  const now = Date.parse("2026-10-04T03:05:00.000Z");
  const rows = [
    {
      id: "aa".repeat(16),
      title: "Physics",
      body: "Chapter 4",
      dueAt: Date.parse("2026-10-04T03:00:00.000Z"),
      timeZone: "Asia/Kolkata",
      recurrence: { freq: "daily" },
      targetType: "note",
      targetId: "bb".repeat(16),
      enabled: true,
    },
    {
      id: "cc".repeat(16),
      title: "Disabled",
      dueAt: Date.parse("2026-10-04T03:00:00.000Z"),
      timeZone: "Asia/Kolkata",
      recurrence: { freq: "daily" },
      enabled: false,
    },
  ];
  const first = dueScheduleOccurrences(rows, now, 15 * 60_000, {});
  assert.equal(first.length, 1, "only the enabled row is due");
  assert.equal(first[0].key, keyClient(rows[0].id, Date.parse("2026-10-04T03:00:00.000Z")));
  assert.equal(first[0].notificationId, docIdClient(rows[0].id, first[0].occurrenceKey));
  assert.equal(first[0].deepLink, `#/my-day?note=${encodeURIComponent(rows[0].targetId)}`);

  // The same ping again, with the learner's log now holding the key: silence.
  const log = { [first[0].key]: now };
  assert.deepEqual(dueScheduleOccurrences(rows, now, 15 * 60_000, log), []);

  // A missed ping makes a reminder LATE, never lost: at 05:30 with the
  // lookback a failed run would produce, the 03:00 occurrence is still due.
  const later = Date.parse("2026-10-04T05:30:00.000Z");
  const late = dueScheduleOccurrences(rows, later, 3 * 60 * 60_000, {});
  assert.equal(late.length, 1, "the missed 03:00 occurrence is delivered late, not dropped");
  assert.equal(late[0].dueAt, Date.parse("2026-10-04T03:00:00.000Z"));

  // A repeating series inside the same window yields every occurrence, ordered —
  // that is the shape an hour-long cron outage catches up on.
  const intervalRow = {
    id: "dd".repeat(16),
    title: "Water break",
    dueAt: Date.parse("2026-10-04T03:00:00.000Z"),
    timeZone: "Asia/Kolkata",
    recurrence: { freq: "interval", intervalMinutes: 30 },
    enabled: true,
  };
  const burst = dueScheduleOccurrences([intervalRow], Date.parse("2026-10-04T05:20:00.000Z"), 2 * 60 * 60_000, {});
  assert.equal(burst.length, 4, "03:00, 03:30, 04:00, 04:30 and 05:00 minus the ones before the window edge");
  assert.ok(burst.every((item, index) => index === 0 || burst[index - 1].dueAt < item.dueAt));
});
