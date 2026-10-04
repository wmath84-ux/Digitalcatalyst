// tests/joplinScheduleNotifications.test.mjs
//
// §154 (14–18) and §64/§99 — the scheduler must produce one logical event per
// occurrence, with a stable key the Android alarm, the Web Push tag and the
// in-app inbox document all share.
//
// Run: node --test tests/joplinScheduleNotifications.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { buildScheduledItem, applyScheduleEdit, setScheduleEnabled, deleteSchedule, markScheduleFired, orphanedSchedules, validateScheduledItem, deepLinkForTarget } from "../src/joplin/scheduling/scheduledItem.ts";
import {
  collectDueScheduleOccurrences,
  collectUpcomingScheduleOccurrences,
  toLegacyShapedDueItem,
  conflictingJoplinAlarms,
} from "../src/joplin/scheduling/scheduleNotifications.ts";
import { alarmIdForNotificationKey, occurrenceNotificationDocId } from "../src/joplin/joplinIds.ts";

const IST = "Asia/Kolkata";
const NOW = Date.UTC(2026, 9, 5, 14, 0, 0); // 2026-10-05T19:30 IST
const minute = 60_000;

const todoSchedule = (overrides = {}) =>
  buildScheduledItem({
    ownerId: "u1",
    target: { type: "todo", id: "note-1", notebookId: "nb-1", title: "Revise physics" },
    title: "Revise physics",
    dueAt: Date.UTC(2026, 9, 5, 13, 45, 0), // 19:15 IST (15 min before NOW)
    timeZone: IST,
    now: NOW,
    ...overrides,
  });

test("a due occurrence is collected once with a stable notification key", () => {
  const item = todoSchedule();
  const due = collectDueScheduleOccurrences([item], NOW, 60 * minute);
  assert.equal(due.length, 1);
  assert.equal(due[0].notificationKey, "schedule:" + item.id + ":occurrence:20261005T1345Z");
  assert.equal(due[0].alarmId, alarmIdForNotificationKey(due[0].notificationKey));
  assert.equal(due[0].category, "mayday");
  assert.match(due[0].deepLink, /^#\/my-day\?note=note-1&notebook=nb-1$/);
});

test("an occurrence already marked as fired is never delivered twice", () => {
  const repeating = todoSchedule({ recurrence: { freq: "daily" } });
  const first = collectDueScheduleOccurrences([repeating], NOW, 60 * minute);
  assert.equal(first.length, 1);
  const fired = markScheduleFired(repeating, first[0].notificationKey, NOW);
  assert.equal(collectDueScheduleOccurrences([fired], NOW, 60 * minute).length, 0, "the same occurrence is never re-delivered");

  // A LATER occurrence of the same row still fires — the marker is per
  // occurrence, not per row.
  const later = collectDueScheduleOccurrences([fired], Date.UTC(2026, 9, 6, 14, 0, 0), 60 * minute);
  assert.equal(later.length, 1);
  assert.equal(later[0].occurrenceKey, "20261006T1345Z");
  assert.notEqual(later[0].notificationKey, first[0].notificationKey);

  // A one-time row, once fired, is finished.
  const once = todoSchedule();
  const onceFired = markScheduleFired(once, collectDueScheduleOccurrences([once], NOW, 60 * minute)[0].notificationKey, NOW);
  assert.equal(collectDueScheduleOccurrences([onceFired], Date.UTC(2026, 9, 6, 14, 0, 0), 24 * 60 * minute).length, 0);
});

test("a disabled or deleted schedule never fires", () => {
  const paused = setScheduleEnabled(todoSchedule(), false, NOW);
  assert.equal(collectDueScheduleOccurrences([paused], NOW, 60 * minute).length, 0);
  const removed = deleteSchedule(todoSchedule(), NOW);
  assert.equal(collectDueScheduleOccurrences([removed], NOW, 60 * minute).length, 0);
});

test("editing a schedule re-arms it against the new time, not the old one", () => {
  const original = todoSchedule({ recurrence: { freq: "daily" } });
  const firedOnce = markScheduleFired(original, "stale-key", NOW);
  const moved = applyScheduleEdit(firedOnce, { dueAt: Date.UTC(2026, 9, 5, 13, 30, 0) }, NOW);
  assert.equal(moved.lastFiredKey, undefined, "a moved anchor clears the stale marker");
  const due = collectDueScheduleOccurrences([moved], Date.UTC(2026, 9, 5, 13, 59, 0), 60 * minute);
  assert.equal(due.length, 1);
  assert.equal(due[0].occurrenceAt, Date.UTC(2026, 9, 5, 13, 30, 0));
});

test("upcoming occurrences are what the Android local alarms pre-arm", () => {
  const item = todoSchedule({ recurrence: { freq: "daily" } });
  const upcoming = collectUpcomingScheduleOccurrences([item], NOW, 3 * 24 * 60 * minute);
  assert.equal(upcoming.length, 3);
  assert.deepEqual(
    upcoming.map((occurrence) => occurrence.occurrenceAt),
    [Date.UTC(2026, 9, 6, 13, 45, 0), Date.UTC(2026, 9, 7, 13, 45, 0), Date.UTC(2026, 9, 8, 13, 45, 0)],
  );
  // Every armed alarm is distinct, so re-scheduling cannot collapse two
  // occurrences into one alarm.
  assert.equal(new Set(upcoming.map((occurrence) => occurrence.alarmId)).size, 3);
});

test("the legacy-shaped projection keeps the existing delivery contract intact", () => {
  const item = todoSchedule();
  const [occurrence] = collectDueScheduleOccurrences([item], NOW, 60 * minute);
  const legacy = toLegacyShapedDueItem(occurrence);
  assert.equal(legacy.kind, "task");
  assert.equal(legacy.section, "tasks");
  assert.equal(legacy.itemId, "note-1");
  assert.equal(legacy.target.type, "joplin");
  assert.equal(legacy.target.noteId, "note-1");
  assert.equal(legacy.target.scheduleId, item.id);
  assert.equal(legacy.dueAt, Date.UTC(2026, 9, 5, 13, 45, 0));
});

test("the inbox document id is derived from the logical event, never from render state", () => {
  const item = todoSchedule();
  const [occurrence] = collectDueScheduleOccurrences([item], NOW, 60 * minute);
  const id = occurrenceNotificationDocId(item.id, occurrence.occurrenceKey);
  const again = occurrenceNotificationDocId(item.id, occurrence.occurrenceKey);
  assert.equal(id, again);
  assert.ok(!id.includes("/"), "Firestore document ids cannot contain a slash");
});

test("a recurring series produces one notification per occurrence, not per row", () => {
  const item = todoSchedule({ recurrence: { freq: "daily" } });
  const due = collectDueScheduleOccurrences([item], Date.UTC(2026, 9, 6, 14, 0, 0), 3 * 24 * 60 * minute);
  assert.equal(due.length, 2);
  assert.equal(new Set(due.map((occurrence) => occurrence.notificationKey)).size, 2);
  assert.equal(new Set(due.map((occurrence) => occurrence.alarmId)).size, 2);
});

test("a Joplin to-do alarm that would duplicate the schedule is detected", () => {
  const schedule = todoSchedule();
  const duplicateAlarm = todoSchedule({ id: "other", dueAt: schedule.dueAt + 30_000 });
  assert.equal(conflictingJoplinAlarms(schedule, [schedule, duplicateAlarm]).length, 1);
  // A different to-do is not a conflict.
  const other = buildScheduledItem({
    ownerId: "u1",
    target: { type: "todo", id: "note-2" },
    dueAt: schedule.dueAt,
    timeZone: IST,
    now: NOW,
  });
  assert.equal(conflictingJoplinAlarms(schedule, [other]).length, 0);
});

test("every target type has a resolvable deep link (§19)", () => {
  assert.equal(deepLinkForTarget({ type: "note", id: "n1", notebookId: "nb1" }), "#/my-day?note=n1&notebook=nb1");
  assert.equal(deepLinkForTarget({ type: "todo", id: "n2" }), "#/my-day?note=n2");
  assert.equal(deepLinkForTarget({ type: "notebook", id: "nb2" }), "#/my-day?notebook=nb2");
  assert.equal(deepLinkForTarget({ type: "tag", id: "tag1" }), "#/my-day?tag=tag1");
  assert.equal(deepLinkForTarget({ type: "web-clip", id: "clip1", notebookId: "nb3" }), "#/my-day?note=clip1&notebook=nb3");
  const custom = deepLinkForTarget({ type: "custom", id: "sch1" });
  assert.match(custom, /schedule=sch1/);
  assert.match(custom, /view=agenda/);
});

test("validation rejects rows the server would refuse", () => {
  const good = todoSchedule();
  assert.deepEqual(validateScheduledItem(good), []);
  assert.ok(validateScheduledItem({ ...good, dueAt: 0 }).includes("invalid_due_at"));
  assert.ok(validateScheduledItem({ ...good, timeZone: "" }).includes("missing_time_zone"));
  assert.ok(validateScheduledItem({ ...good, title: "  " }).includes("missing_title"));
  assert.ok(validateScheduledItem({ ...good, endAt: good.dueAt - 1000 }).includes("end_before_start"));
  assert.ok(validateScheduledItem({ ...good, durationMinutes: 5000 }).includes("invalid_duration"));
  assert.ok(validateScheduledItem({ ...good, deepLink: "#/home" }).includes("invalid_deep_link"));
  assert.ok(validateScheduledItem({ ...good, id: "bad/id" }).includes("invalid_id"));
});

test("deleting a target orphans its schedules, and custom items are exempt", () => {
  const live = { noteIds: new Set(["note-2"]), notebookIds: new Set(["nb-1"]), tagIds: new Set(), resourceIds: new Set() };
  const orphaned = orphanedSchedules([todoSchedule()], live, NOW);
  assert.equal(orphaned.length, 1);
  assert.equal(orphaned[0].enabled, false);

  const custom = buildScheduledItem({
    ownerId: "u1",
    target: { type: "custom", id: "sch-custom" },
    title: "Take mock test",
    dueAt: NOW + minute,
    timeZone: IST,
    now: NOW,
  });
  assert.equal(orphanedSchedules([custom], live, NOW).length, 0);
});
