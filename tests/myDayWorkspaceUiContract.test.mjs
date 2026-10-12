import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync("public/my-day-workspace/app.bundle.js", "utf8");
const css = readFileSync("public/my-day-workspace/app.bundle.css", "utf8");

test("My Day editing has no live preview or mobile toolbar Back control", () => {
  assert.doesNotMatch(js, /previewMode|editor-preview|btn-toggle-preview|btn-toggle-split|data-preview-mode/);
  assert.doesNotMatch(js, /btn-editor-back|class="toolbar-btn editor-back"/);
  assert.doesNotMatch(css, /editor-preview|editor-view-split|editor-view-preview|editor-back/);
  assert.match(js, /data-bar="editor"/);
  assert.match(js, /id="btn-open-sidebar-editor" data-open-sidebar/);
  assert.match(js, /document\.querySelectorAll\("\[data-open-sidebar\]"\)/);
  assert.match(js, /state\.mobilePane = "list"/);
});

test("My Day uses a polished responsive workspace theme in both color modes", () => {
  assert.match(js, /class="list-heading"/);
  assert.match(js, /class="list-focus-badge"/);
  assert.match(css, /--jp-primary: #6558d3/);
  assert.match(css, /--jp-primary: #a99dff/);
  assert.match(css, /\.workspace-sidebar,\s*\.workspace-list,\s*\.workspace-editor/);
  assert.match(css, /\.list-heading/);
  assert.match(css, /\.note-card\.active/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
