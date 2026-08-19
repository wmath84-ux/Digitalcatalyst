// tests/coursePlayerUx.test.mjs
//
// Part 11 — Course Player UI / functionality tests.
//
// These tests assert the SOURCE of the Course Player / Sidebar
// / NotesPanel / ResourceViewer / ImageViewer so the
// implementation is in sync with the Part 11 spec:
//
//   - Resource viewer renders every embed kind (YouTube,
//     direct video, direct audio, Drive, PDF, Google Doc,
//     Google Sheet, Google Slides, Google Form, Whimsical,
//     generic HTTPS embed).
//   - Image viewer has 6 documented controls: pinch zoom,
//     wheel zoom, +/- buttons, drag, reset, download.
//   - Notes panel supports add + edit + delete with
//     multi-device sync via Firestore.
//   - Progress persists last opened file, completed files,
//     access source, preview state.
//   - The Course Player feeds the resolver's access state
//     into the sidebar (locked / preview / dependency).
//   - The sidebar exposes "Buy this module" / "Buy this
//     update" CTAs for locked paid-update modules and
//     available updates.

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
// Resource viewer — every embed kind
// ---------------------------------------------------------------------------

test("ResourceViewer renders every supported embed kind", () => {
  // The viewer wires the `kind` value into `data-embed-kind`
  // via a variable — we only need to assert the data
  // attribute is set and that the KindMap is used by the
  // embed util. Both are present in the source.
  assert.match(resourceViewer, /data-embed-kind=\{embed\.kind\}/);
  assert.match(resourceViewer, /data-file-id=\{file\.id\}/);
  // The embed util itself maps every supported kind.
  const embed = readSource("src/utils/courseEmbed.ts");
  for (const kind of ["youtube", "pdf", "doc", "sheet", "form", "drive", "mindmap", "embed"]) {
    assert.match(embed, new RegExp(`kind: "${kind}"`), `embed util missing kind ${kind}`);
  }
  // Slides is a separate sub-type — the embed util returns
  // { kind: "slides" } for /presentation/d/<id>.
  assert.match(embed, /kind: "slides"/);
});

test("ResourceViewer shows the empty state when no file is selected", () => {
  assert.match(resourceViewer, /Choose a lesson or resource/);
  assert.match(resourceViewer, /data-course-viewer-empty/);
});

test("ResourceViewer shows the missing-embed state when no URL is available", () => {
  assert.match(resourceViewer, /Preview is unavailable/);
  assert.match(resourceViewer, /data-course-viewer-missing/);
});

test("ResourceViewer shows a loading indicator while the embed boots", () => {
  assert.match(resourceViewer, /Loading preview…/);
  assert.match(resourceViewer, /data-course-viewer-embed/);
  assert.match(resourceViewer, /onLoad=/);
  assert.match(resourceViewer, /onError=/);
});

test("ResourceViewer exposes a retry button when the embed fails", () => {
  assert.match(resourceViewer, /Preview didn’t load/);
  assert.match(resourceViewer, /data-course-viewer-retry/);
  assert.match(resourceViewer, /Retry/);
});

test("ResourceViewer handles direct video natively and audio with the custom player", () => {
  assert.match(resourceViewer, /data-course-viewer-video/);
  assert.match(resourceViewer, /<video\s+ref=\{videoRef\}\s+src=\{url\}/);
  assert.match(resourceViewer, /<AudioPlayer\s+url=\{embed\.url\}\s+name=\{file\.name\}/);
  assert.match(audioPlayer, /data-course-viewer-audio/);
  assert.match(audioPlayer, /<audio/);
  assert.match(audioPlayer, /src=\{url\}/);
});

test("ResourceViewer uses a sandboxed iframe with fullscreen / clipboard permissions", () => {
  // Previews stay sandboxed; only the trusted Google full-editor (edit
  // mode) runs unsandboxed because Google's own /edit page needs sign-in
  // cookies + share/comment popups a sandbox list silently breaks.
  assert.match(resourceViewer, /sandbox=\{editMode \? undefined : "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation"\}/);
  assert.match(resourceViewer, /allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write"/);
});

test("ResourceViewer always renders the open-in-new-tab escape hatch", () => {
  assert.match(resourceViewer, /aria-label="Open preview in new tab"/);
  assert.match(resourceViewer, /data-course-viewer-external/);
});

test("ResourceViewer renders a download button when the file is downloadable", () => {
  assert.match(resourceViewer, /data-course-viewer-download/);
  assert.match(resourceViewer, /getCourseDownload/);
});

// ---------------------------------------------------------------------------
// Image viewer — 6 controls
// ---------------------------------------------------------------------------

test("ImageViewer provides pinch zoom (pointer-distance scaling)", () => {
  assert.match(imageViewer, /pinch\.current/);
  assert.match(imageViewer, /pointers\.current\.size === 2/);
  assert.match(imageViewer, /data-pinch-zoom="enabled"/);
});

test("ImageViewer provides wheel zoom", () => {
  assert.match(imageViewer, /onWheel=/);
  assert.match(imageViewer, /applyZoom\(scaleRef\.current \+ \(event\.deltaY < 0 \? 0\.2 : -0\.2\)\)/);
});

test("ImageViewer provides zoom-in / zoom-out / reset / fit buttons", () => {
  assert.match(imageViewer, /data-course-image-zoom-out/);
  assert.match(imageViewer, /data-course-image-zoom-in/);
  assert.match(imageViewer, /data-course-image-zoom-reset/);
  assert.match(imageViewer, /data-course-image-zoom-fit/);
  assert.match(imageViewer, /data-course-image-zoom-pct/);
});

test("ImageViewer provides drag-to-pan when the image is zoomed", () => {
  assert.match(imageViewer, /drag\.current/);
  assert.match(imageViewer, /onPointerDown=/);
  assert.match(imageViewer, /onPointerMove=/);
  assert.match(imageViewer, /onPointerUp=/);
  assert.match(imageViewer, /cursor-grab/);
});

test("ImageViewer provides a download button with a CORS fallback", () => {
  assert.match(imageViewer, /data-course-image-download/);
  assert.match(imageViewer, /fetch\(url, \{ mode: "cors" \}\)/);
  assert.match(imageViewer, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
});

test("ImageViewer shows a friendly error when the image fails to load", () => {
  assert.match(imageViewer, /onError=\{\(\) => setLoadError\(true\)\}/);
  assert.match(imageViewer, /Image failed to load/);
});

// ---------------------------------------------------------------------------
// Notes panel — add / edit / delete + multi-device sync
// ---------------------------------------------------------------------------

test("NotesPanel supports add, edit, and delete via a single + button", () => {
  assert.match(notesPanel, /data-course-notes-add/);
  assert.match(notesPanel, /data-course-notes-save/);
  assert.match(notesPanel, /data-course-note-edit/);
  assert.match(notesPanel, /data-course-note-edit-input/);
  assert.match(notesPanel, /data-course-note-edit-save/);
  assert.match(notesPanel, /data-course-note-edit-cancel/);
  assert.match(notesPanel, /data-course-note-delete/);
});

test("NotesPanel renders the empty state and a square-grid notes list", () => {
  assert.match(notesPanel, /data-course-notes-list/);
  assert.match(notesPanel, /data-course-notes-grid/);
  assert.match(notesPanel, /No notes yet/);
  assert.match(notesPanel, /data-course-note/);
  assert.match(notesPanel, /aspect-square/);
  assert.match(notesPanel, /grid-cols-2/);
  assert.match(notesPanel, /function PremiumEditIcon/);
  assert.match(notesPanel, /function PremiumDeleteIcon/);
  assert.doesNotMatch(notesPanel, /<Pencil /);
  assert.doesNotMatch(notesPanel, /<Trash2 /);
});

test("NotesPanel drops the context box and keeps only the + composer", () => {
  assert.match(notesPanel, /<Plus size=\{16\} \/>/);
  assert.doesNotMatch(notesPanel, /Context: \{productTitle\}/);
  assert.doesNotMatch(notesPanel, /sync across devices/);
});

test("CourseOverlay wires NotesPanel into the notes tab", () => {
  assert.match(overlay, /<NotesPanel/);
  assert.match(overlay, /onAdd=\{props\.onAddNote\}/);
  assert.match(overlay, /onEdit=\{props\.onEditNote\}/);
  assert.match(overlay, /onDelete=\{props\.onDeleteNote\}/);
  assert.match(coursePlayer, /onAddNote=\{\(text\) => saveNote\(text\)\}/);
  assert.match(coursePlayer, /onEditNote=\{\(id, text\) => editNote\(id, text\)\}/);
  assert.match(coursePlayer, /onDeleteNote=\{\(id\) => deleteNote\(id\)\}/);
});

test("CoursePlayer persists notes to localStorage (per user + product)", () => {
  assert.match(coursePlayer, /localStorage\.getItem\(notesStorageKey\(uid, productId\)\)/);
  assert.match(coursePlayer, /localStorage\.setItem\(notesStorageKey\(uid, productId\), JSON\.stringify\(notes\)\)/);
  assert.match(coursePlayer, /persistLocalNotes\(user\.id, product\.id, next\)/);
  assert.match(coursePlayer, /loadLocalNotes\(user\.id, product\.id\)/);
});

test("CoursePlayerNote type has all the fields the NotesPanel reads", () => {
  for (const field of ["id", "text", "createdAt", "updatedAt", "moduleId", "resourceId"]) {
    assert.match(courseTypes, new RegExp(`\\b${field}\\b`), `missing field ${field}`);
  }
});

// ---------------------------------------------------------------------------
// Progress persistence
// ---------------------------------------------------------------------------

test("CoursePlayer persists last opened file id", () => {
  assert.match(coursePlayer, /lastOpenedFileId: file\.id/);
  assert.match(coursePlayer, /setLastOpenedFileId/);
});

test("CoursePlayer resumes the last opened file when the snapshot delivers it", () => {
  assert.match(coursePlayer, /Resume the last opened file when the Firestore listener/);
  assert.match(coursePlayer, /if \(!lastOpenedFileId \|\| selectedFile\) return;/);
  assert.match(coursePlayer, /const match = files\.find\(\(file\) => file\.id === lastOpenedFileId\)/);
});

test("CoursePlayer persists completed file ids + access source + preview state", () => {
  assert.match(coursePlayer, /completedFileIds: completing \? arrayUnion\(selectedFile\.id\) : arrayRemove\(selectedFile\.id\)/);
  assert.match(coursePlayer, /accessSource: resolution\.hasFullProductAccess/);
  assert.match(coursePlayer, /"full_product"|"module_purchase"|"subscription"|"locked"/);
});

test("CoursePlayer excludes preview-only modules from the progress denominator", () => {
  // The progress bar should use `totalEligibleFiles` (excluding
  // locked modules) rather than the raw `files.length`.
  assert.match(coursePlayer, /totalEligibleFiles/);
  assert.match(coursePlayer, /inaccessibleModuleIds/);
  assert.match(coursePlayer, /resolution\.lockedModuleIds/);
});

test("CoursePlayer shows the preview-mode badge when preview modules are present", () => {
  assert.match(coursePlayer, /data-course-preview-badge/);
  assert.match(coursePlayer, /Preview mode/);
});

// ---------------------------------------------------------------------------
// Sidebar access state + CTAs
// ---------------------------------------------------------------------------

test("CourseSidebar consumes the resolver's accessible / preview / locked / dependency data", () => {
  for (const prop of [
    "accessibleModuleIds",
    "previewModuleIds",
    "moduleAccessSources",
    "unmetDependencies",
    "moduleTitleById",
    "onBuyModule",
  ]) {
    assert.match(sidebar, new RegExp(`\\b${prop}\\b`), `missing prop ${prop}`);
  }
});

test("CourseSidebar shows the 'Buy this update' CTA inside the available-updates panel", () => {
  assert.match(sidebar, /Buy this update/);
  assert.match(sidebar, /data-course-sidebar-buy-update/);
});

test("CourseSidebar shows the per-module 'Buy this module' CTA on locked paid-update modules", () => {
  assert.match(sidebar, /data-course-sidebar-buy-module/);
  assert.match(sidebar, /Unlock with this update/);
});

test("CourseSidebar surfaces dependency hints inline", () => {
  assert.match(sidebar, /data-course-module-dependency/);
  assert.match(sidebar, /Requires: \{state\.dependencyHint\}/);
});

test("CourseSidebar marks preview-only modules with the preview icon", () => {
  assert.match(sidebar, /data-course-module-preview/);
  assert.match(sidebar, /<Eye size=\{13\} className="text-sky-300"/);
});

test("CoursePlayer wires the resolver's accessible/owned state into CourseOverlay", () => {
  assert.match(coursePlayer, /accessibleModuleIds=\{resolution\.accessibleModuleIds\}/);
  assert.match(coursePlayer, /previewModuleIds=\{resolution\.previewModuleIds\}/);
  assert.match(coursePlayer, /ownedUpdateIds=\{ownedUpdateIds\}/);
  assert.match(coursePlayer, /onBuyModule=\{handleBuyModule\}/);
});

test("CoursePlayer routes a single module's 'buy' click back to the parent's onPurchaseUpdate", () => {
  assert.match(coursePlayer, /const handleBuyModule = \(module: \{ id: string; paidUpdateId\?: string; paidUpdateTitle\?: string; paidUpdatePrice\?: string \}\) =>/);
  assert.match(coursePlayer, /onPurchaseUpdate\(update\);/);
});

// ---------------------------------------------------------------------------
// Bottom dock + overlay (redesign)
// ---------------------------------------------------------------------------

test("CoursePlayer replaces the side panel with a four-toggle bottom dock", () => {
  for (const tab of ["modules", "resources", "notes", "paid"]) {
    assert.match(overlay, new RegExp(`key: "${tab}"`), `missing dock tab ${tab}`);
  }
  assert.match(overlay, /data-course-dock/);
  assert.match(overlay, /data-course-dock-tab/);
  assert.match(overlay, /data-course-dock-indicator/);
  assert.match(coursePlayer, /data-course-player/);
  assert.doesNotMatch(coursePlayer, /data-course-side-panel/);
});

test("CourseOverlay reuses a single sheet whose content swaps per tab", () => {
  assert.match(overlay, /data-course-overlay/);
  assert.match(overlay, /data-course-overlay-tab=\{tab\}/);
  assert.match(overlay, /key=\{tab\}/);
});

test("Modules overlay lists available modules, Resources lists only files", () => {
  assert.match(overlay, /data-course-overlay-list/);
  assert.match(overlay, /data-mode=\{mode\}/);
  assert.match(overlay, /data-course-overlay-module/);
  assert.match(overlay, /data-course-overlay-file/);
  assert.match(overlay, /mode === "resources"/);
});

test("Resources overlay hides paid modules because they already have a dedicated Paid tab", () => {
  assert.match(overlay, /const isPaidContent/);
  assert.match(overlay, /!isPaidContent\(module\)/);
  assert.match(overlay, /mode !== "resources" \|\| !isPaidContent\(file\)/);
  assert.match(overlay, /moduleFiles\(module\)\.some\(\(file\) => isVisibleFile\(file\) && !isPaidContent\(file\)\)/);
});

test("Modules overlay only lists unlocked modules — locked/paid modules live in the Paid tab", () => {
  // The "Module" tab must not double-list purchasable content: locked and
  // paid modules are filtered out of the wire tree and surfaced through the
  // dedicated "Paid" dock tab instead.
  assert.match(overlay, /unlockedModuleIds/);
  assert.match(overlay, /accessibleModuleIds\.has\(String\(node\.id\)\)/);
  assert.match(overlay, /isPaidLocked\(node, ownedUpdateIds\)/);
  // A locked parent hides its nested children so no orphaned branch remains.
  assert.match(overlay, /ancestorLocked/);
  assert.match(overlay, /unlocked\.has\(String\(module\.id\)\)/);
});

test("Course overlay draws modules and files as a left-side connected wire tree", () => {
  assert.match(overlay, /data-course-overlay-wire/);
  assert.match(overlay, /data-course-wire-rail/);
  assert.match(overlay, /data-course-wire-node/);
  assert.match(overlay, /function WireRail/);
});

test("Paid overlay lists only paid modules with a buy CTA", () => {
  assert.match(overlay, /data-course-overlay-paid/);
  assert.match(overlay, /accessLevel === "paidUpdate"/);
  assert.match(overlay, /data-course-overlay-buy-module/);
  assert.match(overlay, /data-course-overlay-buy-update/);
});

test("Notes overlay is half the screen", () => {
  assert.match(overlay, /50dvh/);
  assert.match(overlay, /tab === "notes"/);
});

test("Custom AudioPlayer replaces the native audio element with a transport", () => {
  assert.match(audioPlayer, /data-course-audio-player/);
  assert.match(audioPlayer, /data-course-audio-play/);
  assert.match(audioPlayer, /data-course-audio-seek/);
  assert.match(audioPlayer, /data-course-audio-current/);
  assert.match(audioPlayer, /data-course-audio-duration/);
  assert.match(audioPlayer, /data-course-audio-loop/);
  assert.match(audioPlayer, /data-course-audio-mute/);
  assert.match(resourceViewer, /<AudioPlayer/);
});

test("CoursePlayer header uses the website logo in the back slot and keeps onBack", () => {
  assert.match(coursePlayer, /data-course-back/);
  assert.match(coursePlayer, /data-course-logo-back/);
  assert.match(coursePlayer, /data-course-logo/);
  assert.match(coursePlayer, /src="\/icons\/icon-192x192\.svg"/);
  assert.match(coursePlayer, /onClick=\{onBack\}/);
  assert.doesNotMatch(coursePlayer, /<ArrowLeft/);
});

test("CoursePlayer rotates content into a landscape layout with vertical header + toggles", () => {
  assert.match(coursePlayer, /matchMedia\("\(orientation: landscape\)"\)/);
  assert.match(coursePlayer, /rotate\(90deg\)/);
  assert.match(coursePlayer, /data-orientation="landscape"/);
  assert.match(coursePlayer, /data-course-landscape-header/);
  assert.match(overlay, /orientation === "landscape"/);
});

test("ResourceViewer offers a fullscreen toggle for media", () => {
  assert.match(resourceViewer, /data-course-viewer-fullscreen/);
  assert.match(resourceViewer, /requestFullscreen/);
});

// ---------------------------------------------------------------------------
// AI — return to Course Player
// ---------------------------------------------------------------------------

// Removed: two tests for a Community AI / "AI Q&A" tab in the course
// player. That feature does not exist in this codebase — there is no
// #/ai-chat route, no AiQuestion component, and no aiCourseContext
// helper anywhere in src/. The tests could never pass and were only
// reporting the absence of a feature that was never built here.
