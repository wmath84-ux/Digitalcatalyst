// tests/joplinScheduleRecurrence.test.mjs
//
// §154 (1–13) and §21 — recurrence must be deterministic, timezone-explicit and
// never expand into thousands of rows.
//
// Run: node --test tests/joplinScheduleRecurrence.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  nextOccurrence,
  occurrencesBetween,
  occurrenceKey,
  notificationKeyFor,
  describeRecurrence,
  zonedEpochMs,
  zonedParts,
  timeZoneOffsetMinutes,
  isValidTimeZone,
} from "../src/joplin/scheduling/recurrence.ts";

const IST = "Asia/Kolkata";
const NY = "America/New_York";

/** 2026-10-05T14:30:00Z is 20:00 IST — "tomorrow 8 PM" for an IST learner. */
const eightPmIst = (day = 5) => Date.UTC(2026, 9, day, 14, 30, 0);

test("one-time schedules fire exactly once and never again", () => {
  const anchor = { dueAt: eightPmIst(), timeZone: IST, recurrence: { freq: "once" } };
  assert.equal(nextOccurrence(anchor, eightPmIst() - 1000), eightPmIst());
  assert.equal(nextOccurrence(anchor, eightPmIst()), null);
  assert.equal(nextOccurrence(anchor, eightPmIst() + 86_400_000), null);
});

test("daily recurrence keeps the local wall-clock time across days", () => {
  const anchor = { dueAt: eightPmIst(), timeZone: IST, recurrence: { freq: "daily" } };
  const second = nextOccurrence(anchor, eightPmIst());
  assert.equal(new Date(second).toISOString(), "2026-10-06T14:30:00.000Z");
  assert.equal(zonedParts(second, IST).hour, 20);
  assert.equal(zonedParts(second, IST).minute, 0);
});

test("daily recurrence keeps the wall clock across a DST transition (New York)", () => {
  // 2026-11-01 is the US fall-back date; 7 AM stays 7 AM, not 6 AM.
  const before = zonedEpochMs(2026, 10, 30, 7, 0, NY);
  const anchor = { dueAt: before, timeZone: NY, recurrence: { freq: "daily" } };
  const after = nextOccurrence(anchor, zonedEpochMs(2026, 11, 1, 7, 0, NY));
  assert.equal(zonedParts(after, NY).hour, 7);
  assert.equal(zonedParts(after, NY).minute, 0);
  assert.equal(new Date(after).toISOString(), "2026-11-02T12:00:00.000Z");
});

test("every N days respects the interval", () => {
  const anchor = { dueAt: eightPmIst(5), timeZone: IST, recurrence: { freq: "daily", interval: 3 } };
  const second = nextOccurrence(anchor, eightPmIst(5));
  assert.equal(new Date(second).toISOString(), "2026-10-08T14:30:00.000Z");
});

test("weekly recurrence can select weekdays and is Sunday-indexed", () => {
  // 2026-10-05 is a Monday.
  const monday = eightPmIst(5);
  const anchor = { dueAt: monday, timeZone: IST, recurrence: { freq: "weekly", weekdays: [1, 3, 5] } };
  const wednesday = nextOccurrence(anchor, monday);
  assert.equal(zonedParts(wednesday, IST).weekday, 3);
  assert.equal(new Date(wednesday).toISOString(), "2026-10-07T14:30:00.000Z");
  const friday = nextOccurrence(anchor, wednesday);
  assert.equal(zonedParts(friday, IST).weekday, 5);
});

test("weekly with an interval skips whole weeks", () => {
  const anchor = { dueAt: eightPmIst(5), timeZone: IST, recurrence: { freq: "weekly", weekdays: [1], interval: 2 } };
  const next = nextOccurrence(anchor, eightPmIst(5));
  assert.equal(new Date(next).toISOString(), "2026-10-19T14:30:00.000Z");
});

test("monthly recurrence fires on the anchor day, and on the last day of short months", () => {
  const anchor = { dueAt: zonedEpochMs(2026, 1, 31, 9, 0, IST), timeZone: IST, recurrence: { freq: "monthly" } };
  const february = nextOccurrence(anchor, anchor.dueAt);
  assert.equal(zonedParts(february, IST).month, 2);
  assert.equal(zonedParts(february, IST).day, 28, "the 31st rule clamps to the last day of February");
});

test("an explicit end date stops the series", () => {
  const until = eightPmIst(7);
  const anchor = { dueAt: eightPmIst(5), timeZone: IST, recurrence: { freq: "daily", until } };
  assert.equal(nextOccurrence(anchor, eightPmIst(5)), eightPmIst(6));
  assert.equal(nextOccurrence(anchor, eightPmIst(6)), until);
  assert.equal(nextOccurrence(anchor, eightPmIst(7)), null);
});

test("interval recurrence steps by minutes from the anchor", () => {
  const anchor = { dueAt: eightPmIst(5), timeZone: IST, recurrence: { freq: "interval", intervalMinutes: 45 } };
  const next = nextOccurrence(anchor, eightPmIst(5) + 60_000);
  assert.equal(next - eightPmIst(5), 45 * 60_000);
});

test("occurrencesBetween returns exactly the occurrences in the window", () => {
  const anchor = { dueAt: eightPmIst(5), timeZone: IST, recurrence: { freq: "daily" } };
  const from = eightPmIst(5);
  const to = from + 3 * 86_400_000;
  const list = occurrencesBetween(anchor, from, to);
  assert.equal(list.length, 4);
  assert.equal(new Date(list[3]).toISOString(), "2026-10-08T14:30:00.000Z");
});

test("a ten-year daily series is computed, not stored: one row, bounded work", () => {
  const anchor = { dueAt: eightPmIst(5), timeZone: IST, recurrence: { freq: "daily" } };
  const to = eightPmIst(5) + 3650 * 86_400_000;
  // The cap keeps a caller from asking for an unbounded expansion.
  assert.equal(occurrencesBetween(anchor, eightPmIst(5), to, 100).length, 100);
  const firstOfLastYear = nextOccurrence(anchor, to - 86_400_000);
  assert.ok(firstOfLastYear <= to);
});

test("occurrence keys are UTC-minute stable and zone independent", () => {
  assert.equal(occurrenceKey(eightPmIst(5)), "20261005T1430Z");
  // Same instant, different device zones → identical key (§64).
  assert.equal(occurrenceKey(Date.UTC(2026, 9, 5, 14, 30, 0)), "20261005T1430Z");
  assert.equal(notificationKeyFor("sch_abc", eightPmIst(5)), "schedule:sch_abc:occurrence:20261005T1430Z");
});

test("zone helpers are safe with bad input and report real offsets", () => {
  assert.equal(isValidTimeZone("Asia/Kolkata"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
  // IST has no DST: +330 minutes all year.
  assert.equal(timeZoneOffsetMinutes(eightPmIst(5), IST), 330);
  // New York is -240 in October (EDT) and -300 in December (EST).
  assert.equal(timeZoneOffsetMinutes(Date.UTC(2026, 9, 5, 12, 0, 0), NY), -240);
  assert.equal(timeZoneOffsetMinutes(Date.UTC(2026, 11, 5, 17, 0, 0), NY), -300);
  // A bad zone degrades to UTC instead of throwing inside a delivery path.
  assert.equal(zonedParts(eightPmIst(5), "Nope/Zone").hour, 14);
});

test("describeRecurrence produces learner-facing copy", () => {
  assert.equal(describeRecurrence({ freq: "once" }, IST), "Once");
  assert.equal(describeRecurrence({ freq: "daily" }, IST), "Daily (Asia/Kolkata)");
  assert.equal(describeRecurrence({ freq: "weekly", weekdays: [1, 3] }, IST), "Weekly · Mon, Wed (Asia/Kolkata)");
  assert.equal(describeRecurrence({ freq: "monthly", dayOfMonth: 15 }, "UTC"), "Monthly · day 15");
});
