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
  assert.ok(first.window.document.querySelector('.editor-preview li[data-checked="true"]'), "split preview renders Markdown task structure");

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
  assert.equal(first.window.document.querySelectorAll(".editor-preview script, .editor-preview iframe, .editor-preview [onerror]").length, 0);

  const saved = JSON.parse(first.window.localStorage.getItem("eduvora.joplin_notes:local"))[0].body;
  assert.equal(saved, textarea.value);
  first.window.close();

  const reloaded = boot(seedNote(saved));
  const reedited = openNote(reloaded);
  assert.equal(reedited.value, saved, "reload and re-edit retain Markdown rather than migrating to HTML");
  assert.equal(reloaded.window.document.querySelector(".editor-preview h2")?.textContent, "Pasted heading");
  assert.equal(reloaded.window.document.querySelectorAll('.editor-preview input[type="checkbox"]').length, 2);
  assert.deepEqual(Array.from(reloaded.window.document.querySelectorAll('.editor-preview input[type="checkbox"]')).map((input) => input.checked), [true, true]);
  reloaded.window.close();
});
