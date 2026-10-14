// Runtime proof for Phase 3: My Day is a separate, device-local Dexie library
// with live updates, rich-text sanitization, notebooks, recurrence and local
// foreground alarms. No account/cloud boundary is present in this path.
import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "fake-indexeddb/auto";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules/.cache/work-mode-myday-runtime");
fs.mkdirSync(DIR, { recursive: true });

const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/#/work/myday",
});
const { window } = dom;
for (const key of [
  "window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node",
  "Event", "CustomEvent", "MouseEvent", "FocusEvent", "getComputedStyle",
  "requestAnimationFrame", "cancelAnimationFrame",
]) {
  Object.defineProperty(globalThis, key, {
    value: key === "window" ? window : window[key],
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

await build({
  stdin: {
    resolveDir: ROOT,
    loader: "tsx",
    contents: `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import useWorkMyDay from "./src/work/storage/useWorkMyDay";
import { closeWorkDatabase, workDatabase } from "./src/work/storage/workDb";
import { filterWorkMyDayItems, nextWorkMyDayOccurrence } from "./src/work/storage/workMyDay";
import { workRemindersRunInBackground } from "./src/work/storage/workReminders";
import { WORK_DEVICE_UID } from "./src/work/workIdentity";

export { act, WORK_DEVICE_UID, filterWorkMyDayItems, nextWorkMyDayOccurrence, workRemindersRunInBackground };
export const latest = { controller: null };
function Probe() {
  const controller = useWorkMyDay();
  latest.controller = controller;
  return <div data-work-myday-runtime="" />;
}
export function mount(target) {
  const root = createRoot(target);
  act(() => root.render(<Probe />));
  return { unmount: () => act(() => root.unmount()) };
}
export async function resetDatabase() {
  const database = workDatabase();
  await closeWorkDatabase();
  await database.delete();
}
export async function readRows() {
  const database = workDatabase();
  return {
    items: await database.myDayItems.toArray(),
    notebooks: await database.myDayNotebooks.toArray(),
  };
}
`,
  },
  outfile: path.join(DIR, "fixture.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  jsx: "automatic",
  target: "node20",
  logLevel: "silent",
});

const fixture = await import(pathToFileURL(path.join(DIR, "fixture.mjs")));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async (ms = 45) => fixture.act(async () => { await sleep(ms); });
const mounted = new Set();
const mount = () => {
  const host = window.document.createElement("div");
  window.document.body.replaceChildren(host);
  const root = fixture.mount(host);
  mounted.add(root);
  return root;
};
const unmount = async (root) => {
  root.unmount();
  mounted.delete(root);
  await settle(25);
};
const resetWorld = async () => {
  window.localStorage.clear();
  await fixture.resetDatabase();
};

afterEach(async () => {
  for (const root of [...mounted]) await unmount(root);
  await resetWorld();
});
after(() => {
  dom.window.close();
  for (const handle of process._getActiveHandles?.() || []) {
    if (handle?.constructor?.name === "MessagePort") handle.unref?.();
  }
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("My Day items and notebooks live-update, sanitize, recur, restore, and alert only on-device", async () => {
  await resetWorld();
  const first = mount();
  await settle(130);

  assert.equal(fixture.latest.controller.loading, false);
  assert.equal(fixture.latest.controller.error, null);
  assert.equal(fixture.latest.controller.notebooks[0]?.title, "Inbox", "first visit seeds a local Inbox");
  assert.equal(fixture.workRemindersRunInBackground(), false, "browser reminders must not claim background delivery");

  const inbox = fixture.latest.controller.notebooks[0];
  let notebook;
  await fixture.act(async () => { notebook = await fixture.latest.controller.createNotebook("Biology"); });
  await settle();
  assert.ok(notebook.id);

  const anchor = Date.now() + 60 * 60 * 1000;
  let task;
  await fixture.act(async () => {
    task = await fixture.latest.controller.createItem({
      kind: "scheduled",
      title: "Revise cell structure",
      bodyHtml: '<h2>Cell structure</h2><p onclick="alert(1)">Mitochondria <strong>produce</strong> energy.</p><script>steal()</script><a href="javascript:alert(1)">unsafe</a>',
      notebookId: notebook.id,
      dueAt: anchor,
      schedule: { timeZone: "Asia/Kolkata", recurrence: { freq: "daily" } },
    });
  });
  await settle();

  assert.equal(task.ownerId, fixture.WORK_DEVICE_UID);
  assert.match(task.bodyText, /Mitochondria produce energy/);
  assert.doesNotMatch(task.bodyHtml, /onclick|<script|javascript:/i, "saved rich text is sanitized before it enters Dexie");
  assert.equal(task.notebookId, notebook.id);
  assert.equal(fixture.latest.controller.items.some((item) => item.id === task.id), true, "Dexie live query publishes a new row");
  const next = fixture.nextWorkMyDayOccurrence(task, anchor + 1);
  assert.ok(next > anchor, "daily recurrence computes the next occurrence instead of expanding rows");
  assert.equal(fixture.filterWorkMyDayItems(fixture.latest.controller.items, "scheduled").some((item) => item.id === task.id), true);

  await fixture.act(async () => { await fixture.latest.controller.toggleComplete(task.id); });
  await settle();
  assert.equal(fixture.filterWorkMyDayItems(fixture.latest.controller.items, "done").some((item) => item.id === task.id), true);

  // Deleting a notebook leaves its items recoverable and uncategorized.
  await fixture.act(async () => { await fixture.latest.controller.deleteNotebook(notebook.id); });
  await settle();
  assert.equal(fixture.latest.controller.items.find((item) => item.id === task.id)?.notebookId, undefined);
  assert.equal(fixture.latest.controller.notebooks.some((row) => row.id === notebook.id), false);
  assert.ok(inbox.id);

  let note;
  await fixture.act(async () => {
    note = await fixture.latest.controller.createItem({ kind: "note", title: "Field notes", bodyHtml: "<p>Saved privately</p>" });
  });
  await settle();
  await fixture.act(async () => { await fixture.latest.controller.removeItem(note.id); });
  await settle();
  assert.equal(fixture.latest.controller.items.some((item) => item.id === note.id), false, "soft-deleted rows leave the live library");
  assert.ok((await fixture.readRows()).items.find((item) => item.id === note.id)?.deletedAt, "soft deletion keeps a recoverable local row");

  // A near-future due time exercises the real web foreground reminder path.
  const reminderEvents = [];
  const onReminder = (event) => reminderEvents.push(event.detail);
  window.addEventListener("dc:work-reminder", onReminder);
  const reminderAt = Date.now() + 120;
  let reminder;
  await fixture.act(async () => {
    reminder = await fixture.latest.controller.createItem({
      kind: "reminder",
      title: "Drink water",
      dueAt: reminderAt,
      schedule: { timeZone: "Asia/Kolkata", recurrence: { freq: "once" } },
    });
  });
  await sleep(260);
  window.removeEventListener("dc:work-reminder", onReminder);
  assert.equal(reminderEvents.some((event) => event.itemId === reminder.id && event.title === "Drink water"), true, "a browser reminder fires while Work is open");

  await unmount(first);
  const reopened = mount();
  await settle(120);
  assert.equal(fixture.latest.controller.items.some((item) => item.id === task.id), true, "the task survives a hook remount");
  assert.equal(fixture.latest.controller.items.some((item) => item.id === reminder.id), true, "reminders are restored from the local database");
  assert.equal(fixture.latest.controller.items.some((item) => item.id === note.id), false, "deleted notes stay hidden after reopening");
  await unmount(reopened);
});

test("My Day route and component wiring stay inside Work's local feature boundary", () => {
  const source = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
  const privateFiles = [
    "src/work/storage/workDb.ts",
    "src/work/storage/workMyDay.ts",
    "src/work/storage/useWorkMyDay.ts",
    "src/work/storage/workReminders.ts",
    "src/work/myday/WorkMyDayPage.tsx",
    "src/work/myday/WorkMyDayEditor.tsx",
    "src/work/myday/WorkMyDayLibrary.tsx",
    "src/work/myday/WorkMyDayDrawer.tsx",
  ];
  for (const file of privateFiles) {
    assert.doesNotMatch(source(file), /(?:from\s*["'][^"']*(?:firebase|firestore)|\bapiFetch\s*\(|\bfetch\s*\()/i, `${file} must not call a cloud API`);
  }
  assert.match(source("src/work/storage/workDb.ts"), /super\("digitalcatalyst-work"\)/);
  assert.match(source("src/work/WorkApp.tsx"), /useWorkMyDay\(\)/);
  assert.match(source("src/work/WorkApp.tsx"), /itemId\s*=\s*new URLSearchParams\(query\)\.get\("item"\)/);
  assert.match(source("src/work/myday/WorkMyDayPage.tsx"), /data-work-theme-toggle/);
  assert.match(source("src/work/storage/workReminders.ts"), /LocalNotifications\.schedule/);
  assert.match(source("src/main.tsx"), /if\s*\(!isAndroidNative\(\)\)\s*return undefined;[\s\S]{0,500}onLocalAlarmTap/);
});
