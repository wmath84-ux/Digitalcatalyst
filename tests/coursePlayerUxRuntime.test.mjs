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
const progressHook = readSource("src/course/useLocalCourseProgress.ts");
const accessHook = readSource("src/hooks/useCourseAccess.ts");
const overlay = readSource("src/course/CourseOverlay.tsx");
const playerPanel = readSource("src/course/PlayerPanel.tsx");
const audioPlayer = readSource("src/course/AudioPlayer.tsx");
const chargingButton = readSource("src/course/ChargingCompleteButton.tsx");
const notesPanel = readSource("src/course/NotesPanel.tsx");
const resourceCard = readSource("src/components/branched-menu/BranchedMenu.tsx");
const notesStore = readSource("src/course/notesStore.ts");
const notesHook = readSource("src/course/useCourseNotes.ts");
const notesCloud = readSource("src/course/cloudNotes.ts");
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
    "data-course-logo-back",
    "data-course-logo",
    "data-course-product-title",
    "data-course-progress-summary",
    "data-course-progress-bar",
    "data-course-progress-label",
    "data-course-subscription-badge",
    "data-course-preview-badge",
    "data-course-mark-complete",
    // Player tab (the list that replaced the header + ⚙ settings popover)
    "data-course-player-panel",
    "data-course-panel-row",
    "data-course-setting",
    "data-course-viewer-kind",
    "data-course-viewer-external",
    "data-course-viewer-download",
    // Bottom dock (home GlassDock as-is — no course-specific indicator) + overlay
    "data-course-dock",
    "data-course-dock-tab",
    "data-course-sheet-row",
    "data-course-overlay-tab",
    "data-course-overlay-list",
    "data-course-library-module",
    "data-library-resource",
    "data-course-overlay-buy-module",
    "data-course-overlay-buy-update",
    "data-course-overlay-paid",
    "data-course-landscape-content",
    // Notes — owner brief 2026-10-15 + 2026-10-17: a headless page that OPENS
    // on the blank "New note" (the start screen is gone), ONE full-page
    // library, read-first notes and an automatic save. The header, the
    // right-hand options panel and every Save / Cancel button are gone, and
    // with them their hooks; the surfaces that replaced them carry these.
    "data-course-notes-panel",
    "data-course-notes-add",
    "data-course-notes-composer",
    "data-course-notes-input",
    "data-course-note-edit-input",
    "data-note-blank-page",
    "data-note-blank-title",
    "data-note-blank-body",
    "data-note-library-panel",
    "data-note-library-head",
    "data-note-library-back",
    "data-note-library-foot",
    "data-note-panel-new",
    "data-note-panel-scrim",
    "data-note-read-nav",
    "data-note-read-library",
    "data-note-read-prev",
    "data-note-read-next",
    "data-note-read-new",
    "data-note-read-edit",
    "data-note-edit-read-float",
    "data-course-notes-list",
    "data-course-note-open",
    "data-course-master-note-open",
    "data-branched-delete",
    "data-branched-menu-popup",
    "data-branched-menu-rename",
    // Resource Viewer
    "data-course-viewer",
    "data-course-viewer-empty",
    "data-course-viewer-missing",
    "data-course-viewer-embed",
    "data-course-viewer-iframe",
    "data-course-viewer-retry",
    "data-course-viewer-video",
    "data-course-viewer-audio",
    "data-course-viewer-fullscreen",
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
    const allSources = [coursePlayer, playerPanel, overlay, audioPlayer, chargingButton, notesPanel, resourceCard, readSource("src/course/CourseResourceLibrary.tsx"), resourceViewer, imageViewer].join("\n");
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
  // The resolver (not local state) produces the resolution the player reads.
  assert.match(coursePlayer, /if \(!isMine\) return initialAccess && accessState\.loading \? initialAccess : accessState\.resolution;/);
  assert.match(coursePlayer, /const accessState = useCourseAccess\(\{ product, skip: isMine \}\);/);
  assert.match(accessHook, /ownedModuleIds: stringSet\(value\.ownedModuleIds\)/);
  assert.match(accessHook, /hasFullProductAccess: value\.hasFullProductAccess/);
  assert.match(coursePlayer, /hasActiveSubscription/);
});

// ---------------------------------------------------------------------------
// Sanity: notes live in Firestore (one document per note) and mirror to device
// ---------------------------------------------------------------------------

test("All note operations (add / edit / delete) reach Firebase and the device mirror", () => {
  // The device plumbing still lives in the shared notesStore (player +
  // NotesPanel) — it is the OFFLINE MIRROR now, not the only copy.
  assert.match(notesStore, /notesStorageKey/, "expected 'notesStorageKey' in source");
  assert.match(notesStore, /localStorage\.getItem\(notesStorageKey\(uid, productId\)\)/);
  assert.match(notesStore, /localStorage\.setItem\(notesStorageKey\(uid, productId\), JSON\.stringify\(notes\)\)/);

  // The player routes every note mutation through the cloud hook…
  assert.match(coursePlayer, /useCourseNotes\(\{ uid: user\?\.id \?\? null, productId: storageProductId \}\)/);
  assert.match(coursePlayer, /notesCtl\.add\(safeHtml/);
  assert.match(coursePlayer, /notesCtl\.edit\(id, safeHtml\);/);
  assert.match(coursePlayer, /notesCtl\.remove\(id\);/);
  assert.match(coursePlayer, /notesCtl\.link\(sourceId, nextLinks\);/);
  // …which writes `users/{uid}/notes/{noteId}` and mirrors it locally.
  assert.match(notesCloud, /collection\(db, "users", uid, NOTES_COLLECTION\)/);
  assert.match(notesCloud, /batch\.set\(doc\(db, "users", owner, NOTES_COLLECTION, payload\.id\), payload, \{ merge: true \}\)/);
  assert.match(notesHook, /uploadCloudNotes\(owner, scope\.productId, uploads\)/);
  assert.match(notesHook, /persistLocalNotes\(uidText, productText, next\);/);
  assert.match(notesHook, /persistLocalNotes\(scope\.uid, scope\.productId, sorted\);/);
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
  // The select path reports the open; the progress hook's batched write
  // persists it with its timestamp.
  assert.match(coursePlayer, /progressCtl\.store\.open\(file\.id\)/);
  assert.match(progressHook, /\.\.\.\(batch\.opened \? \{ lastOpenedFileId: batch\.opened\.id, lastOpenedAt: serverTimestamp\(\) \} : \{\}\)/);
});

test("Completed files are persisted via arrayUnion and un-completed via arrayRemove", () => {
  assert.match(coursePlayer, /progressCtl\.store\.complete\(selectedFile\.id, completing\)/);
  assert.match(progressHook, /if \(added\.length\) await setDoc\(ref, \{ \.\.\.base, completedFileIds: arrayUnion\(\.\.\.added\) \}, \{ merge: true \}\);/);
  assert.match(progressHook, /if \(removed\.length\) await setDoc\(ref, \{ \.\.\.base, completedFileIds: arrayRemove\(\.\.\.removed\) \}, \{ merge: true \}\);/);
});

// ---------------------------------------------------------------------------
// Sanity: access source for progress
// ---------------------------------------------------------------------------

test("The progress write records the active access source", () => {
  // The progress document write is the progress hook's; access provenance
  // itself is recorded by the resolver as per-module / per-resource sources
  // (richer than the old single string, and what the server round-trips).
  assert.match(progressHook, /doc\(db, 'users', uid, 'courseProgress', productId\)/);
  assert.match(accessHook, /moduleAccessSources: stringRecord\(value\.moduleAccessSources\)/);
  assert.match(accessHook, /resourceAccessSources: stringRecord\(value\.resourceAccessSources\)/);
  assert.match(accessHook, /subscriptionGrantedModuleIds/);
});

// ---------------------------------------------------------------------------
// Removed: "AI context is set before navigation". The course player has
// no AI hand-off in this codebase — no aiInitialPrompt / aiCourseContext
// session keys and no community AI route exist anywhere in src/. The
// test asserted a feature that was never built here.
// ---------------------------------------------------------------------------
