// Execute the shipped My Day scripts together in jsdom so the UI/storage/paste
// wiring is covered even when this environment has no native Chromium runtime.
// Viewport geometry remains covered by the optional Playwright suite.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const ROOT = process.cwd();
const WORKSPACE = path.join(ROOT, "public/my-day-workspace");
const formatterScript = fs.readFileSync(path.join(WORKSPACE, "noteFormatting.js"), "utf8");
const appScript = fs.readFileSync(path.join(WORKSPACE, "app.bundle.js"), "utf8");

const seedNote = (body) => [{
  id: "myday-formatting-test-note",
  type_: 1,
  parent_id: "",
  title: "Formatting pipeline",
  body,
  is_todo: 0,
  todo_due: 0,
  todo_completed: 0,
  tag_ids: [],
  tag_titles: [],
  created_time: 1,
  updated_time: 1,
}];

const boot = (notes) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: "https://myday.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.localStorage.setItem("eduvora.joplin_notes:local", JSON.stringify(notes));
  // jsdom's outside-only eval gives global var declarations a private binding;
  // the static browser script exposes its esbuild globalName on window, so copy
  // that same value onto the window object for this test realm.
  dom.window.eval(`${formatterScript}\nwindow.DCMyDayNoteFormatting = DCMyDayNoteFormatting;`);
  dom.window.eval(appScript);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));
  dom.window.document.querySelector('.nav-item[data-view="all"]')?.click();
  return dom;
};

const openNote = (dom) => {
  const card = dom.window.document.querySelector(".note-card[data-note-id]");
  assert.ok(card, "seed note renders into the actual app list");
  card.click();
  const textarea = dom.window.document.querySelector("#editor-body-input");
  assert.ok(textarea, "opening the note mounts the app's existing Markdown editor");
  return textarea;
};

test("shipped My Day app saves toolbar edits, converts rich paste, sanitizes and reloads the same Markdown", () => {
  const first = boot(seedNote("hello\n\n- [x] completed task"));
  const textarea = openNote(first);
  assert.equal(first.window.document.querySelector(".editor-preview"), null, "the editor does not mount a live rendered preview");
  assert.equal(first.window.document.querySelector("#btn-toggle-preview, #btn-toggle-split"), null, "there are no preview or split-view controls");

  textarea.focus();
  textarea.setSelectionRange(0, 5);
  first.window.document.querySelector('[data-action="bold"]').click();
  assert.equal(textarea.value, "**hello**\n\n- [x] completed task");
  assert.equal(JSON.parse(first.window.localStorage.getItem("eduvora.joplin_notes:local"))[0].body, textarea.value, "the canonical Markdown is persisted immediately");

  const clipboard = {
    "text/html": '<h2>Pasted heading</h2><p><strong>rich</strong> H<sub>2</sub>O</p><ul><li><input type="checkbox" checked disabled> done</li></ul><script>window.__pwn=1</script>',
    "text/plain": "fallback plain text",
  };
  const paste = new first.window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: { getData: (type) => clipboard[type] ?? "" } });
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  textarea.dispatchEvent(paste);
  assert.match(textarea.value, /## Pasted heading/);
  assert.match(textarea.value, /\*\*rich\*\* H₂O/);
  assert.match(textarea.value, /- \[x\] done/);
  assert.doesNotMatch(textarea.value, /<script|fallback plain text/);
  assert.equal(first.window.__pwn, undefined, "untrusted pasted script did not execute");
  assert.equal(first.window.document.querySelector(".editor-preview"), null, "typing and rich paste never create a live preview pane");

  const saved = JSON.parse(first.window.localStorage.getItem("eduvora.joplin_notes:local"))[0].body;
  assert.equal(saved, textarea.value);
  first.window.close();

  const reloaded = boot(seedNote(saved));
  const reedited = openNote(reloaded);
  assert.equal(reedited.value, saved, "reload and re-edit retain Markdown rather than migrating to HTML");
  assert.equal(reloaded.window.document.querySelector(".editor-preview"), null, "reopening a note stays editor-only");
  assert.match(reedited.value, /## Pasted heading/);
  assert.match(reedited.value, /\*\*rich\*\*/, "rich formatting remains Markdown rather than rendered HTML");
  reloaded.window.close();
});

test("mobile note editing removes the toolbar Back button but keeps navigation in the workspace drawer", () => {
  const dom = boot(seedNote("draft"));
  openNote(dom);
  const document = dom.window.document;

  assert.equal(document.querySelector("#btn-editor-back, .editor-back"), null, "the mobile formatting toolbar has no Back button");
  assert.ok(document.querySelector('.mobile-topbar[data-bar="editor"] #btn-open-sidebar-editor'), "the editor header offers workspace navigation instead");

  document.querySelector("#btn-open-sidebar-editor").click();
  assert.ok(document.querySelector(".workspace-container.sidebar-open"), "the navigation drawer opens from the editor header");
  document.querySelector('.nav-item[data-view="all"]').click();
  assert.equal(document.querySelector(".workspace-container").getAttribute("data-pane"), "list", "choosing a view returns to the notes list");
  dom.window.close();
});
