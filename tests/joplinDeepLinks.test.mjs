// tests/joplinDeepLinks.test.mjs
//
// §128 — every legacy My Day target form must resolve to the migrated Joplin
// object, and every canonical link must round-trip.
//
// Run: node --test tests/joplinDeepLinks.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMyDayHash,
  buildMyDayDeepLink,
  resolveLegacySection,
  isLegacyMyDayHash,
  notebookIdForName,
  workspaceRootNotebookId,
  webClippingsNotebookId,
  describeTargetType,
  fallbackDeepLinkForMissingTarget,
} from "../src/joplin/joplinDeepLinks.ts";
import { joplinIdForLegacy, scheduleIdForSeries } from "../src/joplin/joplinIds.ts";
import { planMyDayMigration } from "../src/joplin/joplinMigration.ts";

const NOTEBOOKS = {
  tasks: notebookIdForName("Tasks", workspaceRootNotebookId()),
  notes: notebookIdForName("Notes", workspaceRootNotebookId()),
  reminders: notebookIdForName("Reminders", workspaceRootNotebookId()),
  schedule: notebookIdForName("Schedule", workspaceRootNotebookId()),
};

test("a bare My Day hash is the workspace landing state", () => {
  assert.deepEqual(parseMyDayHash("#/my-day"), { kind: "workspace" });
  assert.deepEqual(parseMyDayHash(""), { kind: "workspace" });
  assert.deepEqual(parseMyDayHash("#/my-day?view=agenda"), { kind: "target", source: "canonical", noteId: undefined, notebookId: undefined, tagId: undefined, resourceId: undefined, scheduleId: undefined, view: "agenda", action: undefined });
  assert.deepEqual(parseMyDayHash("#/home"), { kind: "unknown" });
});

test("canonical links round-trip through the parser", () => {
  const link = buildMyDayDeepLink({ noteId: "n1", notebookId: "nb1" });
  assert.equal(link, "#/my-day?note=n1&notebook=nb1");
  const intent = parseMyDayHash(link);
  assert.equal(intent.kind, "target");
  assert.equal(intent.source, "canonical");
  assert.equal(intent.noteId, "n1");
  assert.equal(intent.notebookId, "nb1");
});

test("every legacy section with an item resolves to the migrated object", () => {
  const cases = [
    ["tasks", "t1", "task"],
    ["notes", "n1", "note"],
    ["reminders", "r1", "reminder"],
    ["schedule", "e1", "schedule"],
  ];
  for (const [section, itemId, kind] of cases) {
    const intent = parseMyDayHash(`#/my-day?section=${section}&item=${itemId}`);
    assert.equal(intent.kind, "target");
    assert.equal(intent.source, "legacy");
    assert.equal(intent.legacyKind, kind);
    assert.equal(intent.noteId, joplinIdForLegacy(kind, itemId));
    assert.equal(intent.notebookId, NOTEBOOKS[section]);
    assert.equal(intent.scheduleId, scheduleIdForSeries(`legacy:${kind}:${itemId}`));
    assert.equal(isLegacyMyDayHash(`#/my-day?section=${section}&item=${itemId}`), true);
  }
});

test("a legacy section without an item selects the migrated notebook instead of the old page", () => {
  const intent = parseMyDayHash("#/my-day?section=reminders");
  assert.equal(intent.kind, "target");
  assert.equal(intent.source, "canonical");
  assert.equal(intent.notebookId, NOTEBOOKS.reminders);
});

test("legacy item ids are URL-encoded safely and back", () => {
  const weird = "abc/def ghi?x=1";
  const intent = parseMyDayHash(`#/my-day?section=tasks&item=${encodeURIComponent(weird)}`);
  assert.equal(intent.source, "legacy");
  assert.equal(intent.legacyId, weird);
  assert.equal(intent.noteId, joplinIdForLegacy("task", weird));
});

test("the migrated ids a legacy link resolves to are the ids the migration writes", () => {
  const plan = planMyDayMigration(
    {
      tasks: [{ id: "t9", title: "Handwritten plan", priority: "high", status: "pending", time: "19:00" }],
      notes: [{ id: "n9", text: "Idea", createdAt: Date.UTC(2026, 9, 1) }],
      reminders: [{ id: "r9", text: "Water plants", time: "08:00", done: false }],
      schedule: [{ id: "e9", title: "Yoga", startTime: "06:00", endTime: "07:00", type: "personal" }],
      timeZone: "Asia/Kolkata",
    },
    { ownerId: "u", now: Date.UTC(2026, 9, 4, 6, 0, 0), timeZone: "Asia/Kolkata" },
  );

  for (const [section, legacyId] of [["tasks", "t9"], ["notes", "n9"], ["reminders", "r9"], ["schedule", "e9"]]) {
    const intent = parseMyDayHash(`#/my-day?section=${section}&item=${legacyId}`);
    const indexed = plan.legacyIndex[`legacy:${intent.legacyKind}:${legacyId}`];
    assert.ok(indexed, `${section} ${legacyId} must be in the migration index`);
    assert.equal(intent.noteId, indexed.noteId, "a legacy link must land on the migrated note");
    assert.equal(intent.notebookId, indexed.notebookId);
    if (indexed.scheduleId) assert.equal(intent.scheduleId, indexed.scheduleId);
  }
  assert.equal(resolveLegacySection("tasks", "t9").noteId, joplinIdForLegacy("task", "t9"));
});

test("the Web Clippings notebook id is stable and nested under My Day", () => {
  const id = webClippingsNotebookId();
  assert.equal(id, notebookIdForName("Web Clippings", workspaceRootNotebookId()));
  assert.notEqual(id, notebookIdForName("Web Clippings", ""));
});

test("a missing target offers a graceful recovery link", () => {
  assert.equal(describeTargetType("todo"), "to-do");
  assert.equal(describeTargetType("web-clip"), "web clipping");
  assert.equal(fallbackDeepLinkForMissingTarget("sch1"), "#/my-day?schedule=sch1&view=agenda");
  assert.equal(fallbackDeepLinkForMissingTarget(), "#/my-day?view=agenda");
});

test("an unrecognised query is treated as the workspace, never as an error", () => {
  const intent = parseMyDayHash("#/my-day?section=unknown&item=1");
  assert.deepEqual(intent, { kind: "workspace" });
});
