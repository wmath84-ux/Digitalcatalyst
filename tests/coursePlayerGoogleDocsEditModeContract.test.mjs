// tests/coursePlayerGoogleDocsEditModeContract.test.mjs
//
// Contract for the Course Player's Google Docs FULL-EDITOR mode.
//
// The learner can flip a header toggle and the frame loads Google's own
// `/edit` page — the complete Google toolbar, menus, comments, history —
// not a preview. Rules:
//
//   1. `getCourseEmbed(file, { mode: "edit" })` resolves native Google
//      Docs / Sheets / Slides links to their `/edit?rm=embedded` editor URL.
//   2. Preview mode is untouched: default calls keep returning the same
//      preview endpoints as before (no regression for read-only viewing).
//   3. Only native Google files are editable inline; Forms, Drive binaries
//      and direct files never offer the toggle.
//   4. The viewer wires the toggle, tags the stage with data-doc-mode, and
//      shows a permission-specific fallback when Google refuses to load
//      the editor in-frame.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getCourseEmbed,
  getGoogleEditorUrl,
  isEditableGoogleFile,
} from "../src/utils/courseEmbed.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const resourceViewer = read("src/course/ResourceViewer.tsx");

const gdoc = { id: "d1", name: "Notes", type: "doc", url: "https://docs.google.com/document/d/DOC123/edit" };
const gsheet = { id: "s1", name: "Marks", type: "sheet", url: "https://docs.google.com/spreadsheets/d/SHEET123/edit" };
const gslides = { id: "p1", name: "Deck", type: "slides", url: "https://docs.google.com/presentation/d/SLIDES123/edit" };
const gform = { id: "f1", name: "Quiz", type: "google_form", url: "https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform" };
const driveFile = { id: "v1", name: "Bytes", type: "pdf", url: "https://drive.google.com/file/d/DRIVE123/view" };

// ---------------------------------------------------------------------------
// 1. Edit mode loads the real Google editor — chrome level is the ADMIN's
//    choice ("toolbar" = compact rm=embedded, "full" = complete /edit page)
// ---------------------------------------------------------------------------

test("edit mode defaults to the compact toolbar editor (rm=embedded)", () => {
  const { url, kind } = getCourseEmbed(gdoc, { mode: "edit" });
  assert.equal(kind, "doc");
  assert.match(url, /\/document\/d\/DOC123\/edit\?rm=embedded/);
});

test("editorChrome 'full' loads the COMPLETE docs.google.com page (no rm= stripping)", () => {
  const { url } = getCourseEmbed(gdoc, { mode: "edit", editorChrome: "full" });
  assert.match(url, /\/document\/d\/DOC123\/edit$/, "plain /edit keeps title + menu bar + side tabs");
  assert.doesNotMatch(url, /rm=embedded/, "rm=embedded would hide Google's header");
});

test("both chrome levels work for Sheets and Slides too", () => {
  assert.match(getCourseEmbed(gsheet, { mode: "edit" }).url, /\/spreadsheets\/d\/SHEET123\/edit\?rm=embedded/);
  assert.match(getCourseEmbed(gslides, { mode: "edit" }).url, /\/presentation\/d\/SLIDES123\/edit\?rm=embedded/);
  assert.match(getCourseEmbed(gsheet, { mode: "edit", editorChrome: "full" }).url, /\/spreadsheets\/d\/SHEET123\/edit$/);
  assert.match(getCourseEmbed(gslides, { mode: "edit", editorChrome: "full" }).url, /\/presentation\/d\/SLIDES123\/edit$/);
});

test("getGoogleEditorUrl exposes the editor link for the new-tab fallback", () => {
  assert.match(getGoogleEditorUrl(gdoc), /docs\.google\.com\/document\/d\/DOC123\/edit$/);
  assert.match(getGoogleEditorUrl(gdoc, "toolbar"), /rm=embedded/);
  assert.equal(getGoogleEditorUrl(driveFile), "", "drive binaries have no editor endpoint");
});

// ---------------------------------------------------------------------------
// 2. Preview mode is unchanged
// ---------------------------------------------------------------------------

test("default (preview) mode still returns the read-only endpoints", () => {
  assert.match(getCourseEmbed(gdoc).url, /\/document\/d\/DOC123\/preview/);
  assert.match(getCourseEmbed(gdoc, { viewport: "mobile" }).url, /\/document\/d\/DOC123\/mobilebasic/);
  assert.match(getCourseEmbed(gsheet).url, /\/spreadsheets\/d\/SHEET123\/preview/);
  assert.match(getCourseEmbed(gslides).url, /\/presentation\/d\/SLIDES123\/embed/);
});

test("an explicit preview mode matches the default", () => {
  assert.equal(getCourseEmbed(gdoc, { mode: "preview" }).url, getCourseEmbed(gdoc).url);
});

// ---------------------------------------------------------------------------
// 3. Only native Google files are inline-editable
// ---------------------------------------------------------------------------

test("isEditableGoogleFile accepts Docs / Sheets / Slides only", () => {
  assert.equal(isEditableGoogleFile(gdoc), true);
  assert.equal(isEditableGoogleFile(gsheet), true);
  assert.equal(isEditableGoogleFile(gslides), true);
  assert.equal(isEditableGoogleFile(gform), false, "forms are not an inline editor");
  assert.equal(isEditableGoogleFile(driveFile), false, "drive binaries are not editable in-place");
});

test("edit mode never leaks onto forms or drive files", () => {
  assert.doesNotMatch(getCourseEmbed(gform, { mode: "edit" }).url, /\/edit/);
  assert.match(getCourseEmbed(driveFile, { mode: "edit" }).url, /\/file\/d\/DRIVE123\/preview/);
});

// ---------------------------------------------------------------------------
// 4. Viewer wiring — the ADMIN switch decides what learners get
// ---------------------------------------------------------------------------

test("the viewer header carries the edit toggle for editable Google files", () => {
  assert.match(resourceViewer, /data-course-viewer-edit-toggle/);
  assert.match(resourceViewer, /isEditableGoogleFile\(file\)/);
  assert.match(resourceViewer, /canEditInline \? \(/);
});

test("the PER-TYPE admin switch gates the toggle and picks the editor chrome", () => {
  // Each Google family (doc / sheet / slides) has its own off/toolbar/full
  // switch; "off" hides the toggle entirely for that type only.
  assert.match(resourceViewer, /useDocsEditorAccess\(\)/);
  assert.match(resourceViewer, /editableGoogleKind\(file\)/);
  assert.match(resourceViewer, /editableKind \? accessByType\[editableKind\] : "off"/);
  assert.match(resourceViewer, /editorAccess !== "off" && isEditableGoogleFile\(file\)/);
  assert.match(resourceViewer, /editorAccess === "full" \? "full" : "toolbar"/);
});

test("editableGoogleKind maps each family and excludes forms / drive binaries", async () => {
  const { editableGoogleKind } = await import("../src/utils/courseEmbed.ts");
  assert.equal(editableGoogleKind(gdoc), "doc");
  assert.equal(editableGoogleKind(gsheet), "sheet");
  assert.equal(editableGoogleKind(gslides), "slides");
  assert.equal(editableGoogleKind(gform), null, "a form's /edit page is the owner-only builder");
  assert.equal(editableGoogleKind(driveFile), null, "drive binaries have no editor");
});

test("normalizeDocsEditorAccessMap gives every type its own value with legacy inheritance", async () => {
  const { normalizeDocsEditorAccessMap } = await import("../src/utils/courseEmbed.ts");
  // Per-type overrides win…
  const mixed = normalizeDocsEditorAccessMap({ doc: "full", sheet: "off" }, "toolbar");
  assert.equal(mixed.doc, "full");
  assert.equal(mixed.sheet, "off");
  // …and a missing entry inherits the legacy single switch.
  assert.equal(mixed.slides, "toolbar");
  // A garbage map falls back entirely to the legacy value.
  const fallback = normalizeDocsEditorAccessMap("banana", "off");
  assert.deepEqual(fallback, { doc: "off", sheet: "off", slides: "off" });
});

test("the viewer passes the mode + admin chrome into getCourseEmbed and tags the stage", () => {
  assert.match(resourceViewer, /mode: canEditInline && editMode \? "edit" : "preview", editorChrome/);
  assert.match(resourceViewer, /data-doc-mode=/);
});

test("the admin hook reads the live public settings doc with a safe fallback", () => {
  const hook = read("src/hooks/useDocsEditorAccess.ts");
  assert.match(hook, /doc\(db, "settings", "adminContent"\)/);
  assert.match(hook, /onSnapshot/);
  assert.match(hook, /normalizeDocsEditorAccessMap/);
  assert.match(hook, /docsEditorAccessByType/);
  // Legacy single value is the inherited default for un-overridden types.
  assert.match(hook, /normalizeDocsEditorAccess\(data\?\.docsEditorAccess/);
  assert.match(hook, /DEFAULT_DOCS_EDITOR_ACCESS: DocsEditorAccess = "toolbar"/);
});

test("normalizeDocsEditorAccess only accepts off / toolbar / full", async () => {
  const { normalizeDocsEditorAccess } = await import("../src/utils/courseEmbed.ts");
  assert.equal(normalizeDocsEditorAccess("off"), "off");
  assert.equal(normalizeDocsEditorAccess("toolbar"), "toolbar");
  assert.equal(normalizeDocsEditorAccess("FULL"), "full");
  assert.equal(normalizeDocsEditorAccess("banana"), "toolbar", "unknown values fall back");
  assert.equal(normalizeDocsEditorAccess(undefined, "off"), "off", "fallback is honoured");
});

test("the admin Content page exposes a per-type three-way editor control", () => {
  const contentPage = read("src/admin/pages/ContentPage.tsx");
  assert.match(contentPage, /data-admin-docs-editor-access/);
  // One switch row per editable Google family…
  assert.match(contentPage, /data-docs-editor-type=\{type\.key\}/);
  assert.match(contentPage, /data-docs-editor-option=\{`\$\{type\.key\}:\$\{option\.value\}`\}/);
  for (const key of ['key: "doc"', 'key: "sheet"', 'key: "slides"']) {
    assert.ok(contentPage.includes(key), `missing editor type ${key}`);
  }
  // …plus a set-all shortcut and the three access levels.
  assert.match(contentPage, /data-admin-docs-editor-all/);
  for (const value of ['value: "off"', 'value: "toolbar"', 'value: "full"']) {
    assert.ok(contentPage.includes(value), `missing admin option ${value}`);
  }
  // Both fields persist through the settings pipeline.
  assert.match(contentPage, /docsEditorAccess: settings\?\.docsEditorAccess \?\? "toolbar"/);
  assert.match(contentPage, /docsEditorAccessByType: settings\?\.docsEditorAccessByType \?\? \{\}/);
  // The page explains why forms/PDFs have no switch.
  assert.match(contentPage, /form <em>builder<\/em>/);
});

test("the editor is never mobile-scaled (it manages its own layout)", () => {
  assert.match(resourceViewer, /&& !isEditingInline/);
});

test("edit-mode failures explain sharing permissions and offer a new-tab editor", () => {
  assert.match(resourceViewer, /Anyone with the link → Editor/);
  assert.match(resourceViewer, /Edit in new tab/);
  assert.match(resourceViewer, /getGoogleEditorUrl\(file\)/);
});

test("the per-file remount keeps edit state from leaking between documents", () => {
  assert.match(resourceViewer, /<ResourceViewerBody\s+key=\{file\.id\}/);
});
