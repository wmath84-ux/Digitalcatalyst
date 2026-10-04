// tests/joplinMigration.test.mjs
//
// §152 — the ten migration tests, plus the idempotency and verification rules
// §130 depends on. These run against the PURE planner, with no Firebase: the
// planner is the part that decides what the learner's data becomes, so it is the
// part that must be provably lossless.
//
// Run: node --test tests/joplinMigration.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  planMyDayMigration,
  verifyMigrationPlan,
  pendingPhases,
  parseLegacyClock,
  nextLegacyClockInstant,
  splitReminderText,
  deriveNoteTitle,
} from "../src/joplin/joplinMigration.ts";
import { joplinIdForLegacy, scheduleIdForSeries } from "../src/joplin/joplinIds.ts";
import { notebookIdForName, workspaceRootNotebookId } from "../src/joplin/joplinDeepLinks.ts";

const OWNER = "user-abc";
const NOW = Date.UTC(2026, 9, 4, 6, 0, 0); // 2026-10-04T06:00Z = 11:30 IST
const TZ = "Asia/Kolkata";

const snapshot = (overrides = {}) => ({
  tasks: [
    { id: "t1", title: "Complete algebra worksheet", subject: "Maths", time: "18:30", priority: "high", status: "pending" },
    { id: "t2", title: "Revise periodic table", subject: "Chemistry", time: "07:00", priority: "medium", status: "in-progress" },
    { id: "t3", title: "Submit lab report", priority: "low", status: "completed", completedAt: Date.UTC(2026, 9, 3, 10, 0, 0) },
  ],
  notes: [
    { id: "n1", text: "Newton's laws\n\nFirst law: inertia", createdAt: Date.UTC(2026, 9, 1, 5, 0, 0), color: "amber", html: "<h2>Newton's laws</h2><p>First law: <strong>inertia</strong></p>" },
    { id: "n2", text: "plain only note", createdAt: Date.UTC(2026, 9, 2, 5, 0, 0), color: "sky" },
  ],
  reminders: [
    { id: "r1", text: "Physics revision — chapter 4 problems", time: "20:00", done: false, createdAt: Date.UTC(2026, 9, 1, 6, 0, 0) },
    { id: "r2", text: "Call tutor", time: "16:00", done: true, createdAt: Date.UTC(2026, 9, 2, 6, 0, 0) },
  ],
  schedule: [
    { id: "e1", title: "Physics class", detail: "Rotational motion", startTime: "17:00", endTime: "18:30", type: "class" },
    { id: "e2", title: "Mock test", startTime: "09:00", endTime: "12:00", type: "exam", detail: "Full syllabus" },
  ],
  reminderMeta: { r1: { category: "study", note: "Focus on numericals" } },
  timeZone: TZ,
  ...overrides,
});

const plan = (overrides, options = {}) => planMyDayMigration(snapshot(overrides), { ownerId: OWNER, now: NOW, timeZone: TZ, ...options });

test("1. task → Joplin to-do note, with every legacy field preserved", () => {
  const result = plan();
  const todo = result.notes.find((note) => note.id === joplinIdForLegacy("task", "t1"));
  assert.ok(todo, "the task must become a note");
  assert.equal(todo.is_todo, 1);
  assert.equal(todo.title, "Complete algebra worksheet");
  assert.equal(todo.parent_id, notebookIdForName("Tasks", workspaceRootNotebookId()));
  // subject → tag, not body text (§74)
  assert.ok(todo.tag_titles.includes("subject:maths"), `tags were ${todo.tag_titles.join(",")}`);
  assert.ok(todo.tag_titles.includes("priority:high"));
  assert.ok(todo.tag_titles.includes("legacy:task"));
  assert.equal(todo.todo_completed, 0);
  // a task with a clock time keeps its daily delivery
  assert.ok(todo.todo_due > NOW, "todo_due is the next 18:30 in IST");
  const schedule = result.schedules.find((row) => row.targetId === todo.id);
  assert.ok(schedule, "a timed task keeps its schedule");
  assert.equal(schedule.recurrence.freq, "daily");
  assert.equal(schedule.timeZone, TZ);
});

test("2. quick note → Joplin note with HTML converted to Markdown", () => {
  const result = plan();
  const note = result.notes.find((item) => item.id === joplinIdForLegacy("note", "n1"));
  assert.ok(note);
  assert.equal(note.is_todo, 0);
  assert.match(note.body, /^## Newton's laws$/m);
  assert.match(note.body, /\*\*inertia\*\*/);
  assert.equal(note.parent_id, notebookIdForName("Notes", workspaceRootNotebookId()));
  assert.ok(note.tag_titles.includes("color:amber"));
  assert.equal(note.created_time, Date.UTC(2026, 9, 1, 5, 0, 0));

  const plain = result.notes.find((item) => item.id === joplinIdForLegacy("note", "n2"));
  assert.equal(plain.body, "plain only note");
  assert.equal(plain.title, "plain only note");
});

test("3. reminder → to-do note + schedule, meta preserved as tag and body", () => {
  const result = plan();
  const todo = result.notes.find((item) => item.id === joplinIdForLegacy("reminder", "r1"));
  assert.ok(todo);
  assert.equal(todo.is_todo, 1);
  assert.equal(todo.title, "Physics revision");
  assert.ok(todo.tag_titles.includes("category:study"), "reminder meta category survives as a tag");
  assert.match(todo.body, /chapter 4 problems/);
  assert.match(todo.body, /Focus on numericals/);

  const schedule = result.schedules.find((row) => row.legacy?.id === "r1");
  assert.ok(schedule, "an open reminder keeps its alarm");
  assert.equal(schedule.targetType, "todo");
  assert.equal(schedule.targetId, todo.id);

  // A done reminder is a completed to-do and must not keep firing.
  const done = result.notes.find((item) => item.id === joplinIdForLegacy("reminder", "r2"));
  assert.ok(done.todo_completed > 0);
  assert.equal(result.schedules.filter((row) => row.legacy?.id === "r2").length, 0);
});

test("4. schedule event → schedule row that carries start/end (not a flattened note body)", () => {
  const result = plan();
  const event = result.schedules.find((row) => row.legacy?.id === "e1");
  assert.ok(event);
  assert.equal(event.targetType, "note");
  assert.equal(event.recurrence.freq, "daily");
  assert.ok(event.endAt > event.dueAt, "end time preserved on the row");
  assert.equal(event.durationMinutes, 90);
  assert.equal(event.timeZone, TZ);

  const note = result.notes.find((item) => item.id === event.targetId);
  assert.ok(note);
  assert.equal(note.body, "Rotational motion");
  assert.ok(!/\d{2}:\d{2}/.test(note.body), "the clock range must not be baked into the note body");
  assert.ok(note.tag_titles.includes("scheduleType:class"));
});

test("5. the migration is idempotent: the same snapshot produces byte-identical ids", () => {
  const first = plan();
  const second = plan();
  assert.deepEqual(
    first.notes.map((note) => note.id),
    second.notes.map((note) => note.id),
  );
  assert.deepEqual(
    first.schedules.map((row) => row.id),
    second.schedules.map((row) => row.id),
  );
  assert.deepEqual(first.legacyIndex, second.legacyIndex);
});

test("6. partial migration recovery: only the failed phase is re-run", () => {
  const result = plan();
  const marker = {
    phases: {
      tasks: { completed: true },
      notes: { completed: true },
      reminders: { completed: false },
    },
  };
  assert.deepEqual(pendingPhases(result, marker), ["reminders", "schedule"]);
  // A plan with no rows for a phase is not "pending" — an empty section must
  // never block completion.
  const empty = plan({ tasks: [] });
  assert.deepEqual(pendingPhases(empty, { phases: { tasks: { completed: true } } }).includes("tasks"), false);
});

test("7. legacy ids are preserved and indexed for deep links", () => {
  const result = plan();
  const entry = result.legacyIndex["legacy:task:t1"];
  assert.ok(entry);
  assert.equal(entry.legacyId, "t1");
  assert.equal(entry.noteId, joplinIdForLegacy("task", "t1"));
  assert.equal(entry.todo, true);
  assert.equal(entry.scheduleId, scheduleIdForSeries("legacy:task:t1"));
  // Deterministic ids mean an old notification link resolves without a lookup.
  assert.equal(result.legacyIndex["legacy:reminder:r1"].noteId, joplinIdForLegacy("reminder", "r1"));
});

test("8. timestamps are preserved (created_time, completed time)", () => {
  const result = plan();
  const note = result.notes.find((item) => item.id === joplinIdForLegacy("note", "n1"));
  assert.equal(note.created_time, Date.UTC(2026, 9, 1, 5, 0, 0));
  assert.equal(note.user_created_time, note.created_time);

  const completed = result.notes.find((item) => item.id === joplinIdForLegacy("task", "t3"));
  assert.equal(completed.todo_completed, Date.UTC(2026, 9, 3, 10, 0, 0));
  assert.equal(completed.is_todo, 1);
});

test("9. reminder metadata (category + note) survives end to end", () => {
  const result = plan();
  const todo = result.notes.find((item) => item.id === joplinIdForLegacy("reminder", "r1"));
  assert.ok(todo.tag_titles.includes("category:study"));
  assert.match(todo.body, /Focus on numericals/);
  // Both the legacy "Title — note" split and the metadata note are kept.
  assert.match(todo.body, /chapter 4 problems/);

  const withMeta = plan({ reminderMeta: { r1: { category: "class" } } });
  const other = withMeta.notes.find((item) => item.id === joplinIdForLegacy("reminder", "r1"));
  assert.ok(other.tag_titles.includes("category:class"));
});

test("10. task priority and status are preserved (in-progress is never turned into pending)", () => {
  const result = plan();
  const inProgress = result.notes.find((item) => item.id === joplinIdForLegacy("task", "t2"));
  assert.ok(inProgress.tag_titles.includes("status:in-progress"));
  assert.ok(inProgress.tag_titles.includes("priority:medium"));
  assert.equal(inProgress.todo_completed, 0);

  const completed = result.notes.find((item) => item.id === joplinIdForLegacy("task", "t3"));
  assert.ok(completed.todo_completed > 0, "completed maps to a ticked to-do");
  assert.ok(completed.tag_titles.includes("priority:low"));
  assert.ok(!completed.tag_titles.includes("status:in-progress"));
});

test("an empty snapshot produces the notebook skeleton and no data loss", () => {
  const result = planMyDayMigration({}, { ownerId: OWNER, now: NOW, timeZone: TZ });
  assert.equal(result.notes.length, 0);
  assert.equal(result.schedules.length, 0);
  assert.equal(result.notebooks.length, 6, "My Day + four migrated sections + Web Clippings");
  assert.ok(result.notebooks.some((notebook) => notebook.title === "Web Clippings"));
  assert.ok(result.notebooks.every((notebook) => notebook.ownerId === OWNER));
});

test("a missing task id is reported instead of creating an anonymous note", () => {
  const result = plan({ tasks: [{ id: "", title: "orphan" }] });
  assert.equal(result.notes.filter((note) => note.legacy?.type === "task").length, 0);
  assert.ok(result.warnings.includes("task_without_id"));
});

test("duplicate legacy ids are reported and only migrated once", () => {
  const duplicated = plan({
    tasks: [
      { id: "dup", title: "first", priority: "low", status: "pending" },
      { id: "dup", title: "second", priority: "high", status: "pending" },
    ],
  });
  assert.equal(duplicated.notes.filter((note) => note.legacy?.type === "task").length, 1);
  assert.ok(duplicated.warnings.some((warning) => warning.startsWith("duplicate_legacy_id:legacy:task:dup")));
});

test("verification passes only when every planned object was written", () => {
  const result = plan();
  const written = {
    noteIds: result.notes.map((note) => note.id),
    notebookIds: result.notebooks.map((notebook) => notebook.id),
    scheduleIds: result.schedules.map((row) => row.id),
    tagIds: result.tags.map((tag) => tag.id),
  };
  assert.equal(verifyMigrationPlan(result, written).ok, true);

  const partial = verifyMigrationPlan(result, { ...written, scheduleIds: [] });
  assert.equal(partial.ok, false);
  assert.ok(partial.missing.some((id) => id.startsWith("schedule:")));
});

test("legacy clock parsing matches the old scheduler's accepted formats", () => {
  assert.deepEqual(parseLegacyClock("18:30"), { hours: 18, minutes: 30 });
  assert.deepEqual(parseLegacyClock("7:05 pm"), { hours: 19, minutes: 5 });
  assert.deepEqual(parseLegacyClock("12:00 AM"), { hours: 0, minutes: 0 });
  assert.equal(parseLegacyClock("25:00"), null);
  assert.equal(parseLegacyClock(""), null);
});

test("next legacy clock instant keeps the local wall-clock time of the old planner", () => {
  // 2026-10-04T06:00Z is 11:30 in IST, so 18:30 IST is still ahead today.
  const today = nextLegacyClockInstant("18:30", NOW, TZ, -330);
  assert.equal(new Date(today).toISOString(), "2026-10-04T13:00:00.000Z");
  // 07:00 IST has already passed, so it rolls to tomorrow.
  const tomorrow = nextLegacyClockInstant("07:00", NOW, TZ, -330);
  assert.equal(new Date(tomorrow).toISOString(), "2026-10-05T01:30:00.000Z");
});

test("reminder text splitting and note titles follow the legacy UI's rules", () => {
  assert.deepEqual(splitReminderText("Physics revision — chapter 4"), { title: "Physics revision", note: "chapter 4" });
  assert.deepEqual(splitReminderText("Call tutor"), { title: "Call tutor", note: "" });
  assert.equal(deriveNoteTitle("\n\n## Heading here\nbody", "fallback"), "Heading here");
  assert.equal(deriveNoteTitle("   ", "fallback"), "fallback");
});
