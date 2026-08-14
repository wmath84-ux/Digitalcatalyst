// tests/coursePlayerUxRuntime.test.mjs
//
// Part 11 — runtime sanity tests for the Course Player UI
// components. These tests use jsdom-less verification by
// reading the source and asserting:
//   - the data-* hooks the integration tests look for
//   - the Firestore calls are present
//   - the props the consumer passes are correct
//
// They do NOT mount React; they verify the wiring is in
// place so the rest of the integration tests can assert
// behaviour against the data attributes.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const sidebar = readSource("src/course/CourseSidebar.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");
const audioPlayer = readSource("src/course/AudioPlayer.tsx");
const notesPanel = readSource("src/course/NotesPanel.tsx");
const resourceViewer = readSource("src/course/ResourceViewer.tsx");
const imageViewer = readSource("src/course/ImageViewer.tsx");
const courseTypes = readSource("src/types/course.ts");

// ---------------------------------------------------------------------------
// Sanity: every Part 11 data attribute is present
// ---------------------------------------------------------------------------

test("Every Part 11 data-attribute hook is present in the source", () => {
  const hooks = [
    // Course Player
    "data-course-player",
    "data-course-back",
    "data-course-product-title",
    "data-course-progress-summary",
    "data-course-progress-bar",
    "data-course-progress-fill",
    "data-course-progress-label",
    "data-course-subscription-badge",
    "data-course-preview-badge",
    "data-course-mark-complete-bar",
    "data-course-selected-name",
    "data-course-mark-complete",
    // Bottom dock + overlay
    "data-course-dock",
    "data-course-dock-tab",
    "data-course-dock-indicator",
    "data-course-overlay",
    "data-course-overlay-tab",
    "data-course-overlay-close",
    "data-course-overlay-title",
    "data-course-overlay-list",
    "data-course-overlay-module",
    "data-course-overlay-file",
    "data-course-overlay-buy-module",
    "data-course-overlay-buy-update",
    "data-course-overlay-paid",
    "data-course-landscape-header",
    // Notes
    "data-course-notes-panel",
    "data-course-notes-add",
    "data-course-notes-composer",
    "data-course-notes-input",
    "data-course-notes-save",
    "data-course-notes-list",
    "data-course-note",
    "data-course-note-edit",
    "data-course-note-edit-input",
    "data-course-note-edit-save",
    "data-course-note-edit-cancel",
    "data-course-note-delete",
    // Sidebar
    "data-course-sidebar",
    "data-course-module-group",
    "data-course-module-lock",
    "data-course-module-preview",
    "data-course-module-dependency",
    "data-course-sidebar-file",
    "data-course-sidebar-buy-update",
    "data-course-sidebar-buy-module",
    // Resource Viewer
    "data-course-viewer",
    "data-course-viewer-empty",
    "data-course-viewer-missing",
    "data-course-viewer-embed",
    "data-course-viewer-iframe",
    "data-course-viewer-retry",
    "data-course-viewer-video",
    "data-course-viewer-audio",
    "data-course-viewer-kind",
    "data-course-viewer-download",
    "data-course-viewer-external",
    // Image Viewer
    "data-course-image-viewer",
    "data-pinch-zoom",
    "data-course-image-zoom-out",
    "data-course-image-zoom-in",
    "data-course-image-zoom-reset",
    "data-course-image-zoom-fit",
    "data-course-image-zoom-pct",
    "data-course-image-download",
  ];
  for (const hook of hooks) {
    const allSources = [coursePlayer, sidebar, overlay, audioPlayer, notesPanel, resourceViewer, imageViewer].join("\n");
    assert.ok(allSources.includes(hook), `missing data attribute ${hook}`);
  }
});

// ---------------------------------------------------------------------------
// Sanity: the Resolver and Hook integration is preserved
// ---------------------------------------------------------------------------

test("CoursePlayer keeps the Part 10 hook + resolver as the source of truth", () => {
  assert.match(coursePlayer, /useCourseAccess/);
  assert.match(coursePlayer, /resolution\.accessibleModuleIds/);
  assert.match(coursePlayer, /resolution\.ownedUpdateIds/);
  assert.match(coursePlayer, /resolution\.previewModuleIds/);
  assert.match(coursePlayer, /resolution\.lockedModuleIds/);
  assert.match(coursePlayer, /resolution\.hasFullProductAccess/);
  assert.match(coursePlayer, /resolution\.ownedModuleIds/);
  assert.match(coursePlayer, /hasActiveSubscription/);
});

// ---------------------------------------------------------------------------
// Sanity: notes are stored in a single Firestore collection + per-device sync
// ---------------------------------------------------------------------------

test("All note operations (add / edit / delete) write to localStorage", () => {
  assert.match(coursePlayer, /notesStorageKey/, "expected 'notesStorageKey' in source");
  assert.match(coursePlayer, /localStorage\.getItem\(notesStorageKey\(uid, productId\)\)/);
  assert.match(coursePlayer, /localStorage\.setItem\(notesStorageKey\(uid, productId\), JSON\.stringify\(notes\)\)/);
  assert.match(coursePlayer, /persistLocalNotes\(user\.id, product\.id, next\)/);
});

// ---------------------------------------------------------------------------
// Sanity: types
// ---------------------------------------------------------------------------

test("CoursePlayerNote is exported from src/types/course.ts", () => {
  assert.match(courseTypes, /export interface CoursePlayerNote/);
});

// ---------------------------------------------------------------------------
// Sanity: progress / last opened / completed persistence
// ---------------------------------------------------------------------------

test("Last opened file is persisted on every select", () => {
  assert.match(coursePlayer, /setDoc\(progressRef, \{ productId: product\.id, lastOpenedFileId: file\.id, lastOpenedAt: serverTimestamp\(\) \}, \{ merge: true \}\)/);
});

test("Completed files are persisted via arrayUnion and un-completed via arrayRemove", () => {
  assert.match(coursePlayer, /completedFileIds: completing \? arrayUnion\(selectedFile\.id\) : arrayRemove\(selectedFile\.id\)/);
});

// ---------------------------------------------------------------------------
// Sanity: access source for progress
// ---------------------------------------------------------------------------

test("The progress write records the active access source", () => {
  assert.match(coursePlayer, /accessSource: resolution\.hasFullProductAccess \? "full_product" : \(resolution\.ownedModuleIds\.size > 0 \? "module_purchase" : \(resolution\.subscriptionGrantedModuleIds\.size > 0 \? "subscription" : "locked"\)\)/);
});

// ---------------------------------------------------------------------------
// Sanity: AI context is passed + the hash route opens community AI
// ---------------------------------------------------------------------------

test("AI context is set before navigation", () => {
  assert.match(coursePlayer, /sessionStorage\.setItem\("aiInitialPrompt"/);
  assert.match(coursePlayer, /sessionStorage\.setItem\("aiCourseContext"/);
  assert.match(coursePlayer, /JSON\.stringify\(\{ productId: product\.id, courseTitle: product\.title, fileId: selectedFile\?\.id \|\| "", fileName: selectedFile\?\.name \|\| "" \}\)/);
});
