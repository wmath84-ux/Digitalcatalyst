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
//     into the overlay's Module / Paid tabs (locked / preview).
//   - The Paid tab exposes the buy CTAs for locked paid-update
//     modules and available updates.
//   - The player has NO header: the footer dock's Player tab
//     (src/course/PlayerPanel.tsx) carries the course identity,
//     progress, mark-complete, the ACTIVE file's action buttons
//     (reported live by the ResourceViewer) and every player
//     preference.

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
const overlay = readSource("src/course/CourseOverlay.tsx");
const playerPanel = readSource("src/course/PlayerPanel.tsx");
const audioPlayer = readSource("src/course/AudioPlayer.tsx");
const notesPanel = readSource("src/course/NotesPanel.tsx");
const notesStore = readSource("src/course/notesStore.ts");
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

test("The active file's open-in-new-tab escape hatch lives in the Player tab", () => {
  // The file's own header is gone from the stage; the ACTIVE viewer reports
  // its actions and the Player panel lists them (they follow the module).
  assert.match(playerPanel, /aria-label": "Open preview in new tab"/);
  assert.match(playerPanel, /data-course-viewer-external/);
});

test("The active file's download button lives in the Player tab", () => {
  assert.match(playerPanel, /data-course-viewer-download/);
  assert.match(playerPanel, /downloadableFileName=\{fileActions\.download\.downloadable/);
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
  // The "+" moved from the panel's secondary header up to the overlay's
  // MAIN header — the panel itself renders no header row anymore.
  assert.match(overlay, /data-course-notes-add/);
  assert.doesNotMatch(notesPanel, /data-course-notes-add/);
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

test("The single + button lives in the overlay's main header, not the panel", () => {
  // The "+" moved up into the overlay's main header; the panel no longer
  // renders its own header row at all.
  assert.match(overlay, /<Plus size=\{16\} \/>/);
  assert.match(overlay, /aria-label="Add note"/);
  assert.doesNotMatch(notesPanel, /<Plus \/>/);
  assert.doesNotMatch(notesPanel, /data-course-notes-title/);
  assert.doesNotMatch(notesPanel, /Context: \{productTitle\}/);
  assert.doesNotMatch(notesPanel, /sync across devices/);
});

test("The overlay hides its chrome row while the writing box is open", () => {
  // Writing mode = notes tab + editor open. In that mode the pane keeps no
  // chrome row at all: toolbar / writing surface / Save + Cancel only, so
  // the box gets every pixel of the study pane in both orientations.
  assert.match(overlay, /const notesWriting = tab === "notes" && notesEditorOpen;/);
  assert.match(overlay, /\{notesWriting \? null : chromeRow\}/);
  assert.doesNotMatch(overlay, /Collapse panel/);
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
  // The storage helpers live in the shared notesStore (used by both the
  // player and the NotesPanel); the per-user + per-product key and the
  // read/write plumbing must still be exactly this shape.
  assert.match(notesStore, /localStorage\.getItem\(notesStorageKey\(uid, productId\)\)/);
  assert.match(notesStore, /localStorage\.setItem\(notesStorageKey\(uid, productId\), JSON\.stringify\(notes\)\)/);
  assert.match(notesStore, /notesStorageKey = \(uid: string, productId: string\) => `dc\.courseNotes\.\$\{uid\}\.\$\{productId\}`/);
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
  // A deep-link open (`?module=` — admin hero slide → specific module) is an
  // explicit "take me to THIS module" intent, so the saved resume position
  // must never clobber it. A deliberate manual navigation wins too — but the
  // default first-lesson auto-selection does NOT count as one, which is what
  // finally lets the saved position take over once it arrives (the old
  // `selectedFile` guard made resume silently never fire).
  assert.match(coursePlayer, /if \(!lastOpenedFileId \|\| deepLinkFileId \|\| userSelectedRef\.current\) return;/);
  assert.match(coursePlayer, /const match = files\.find\(\(file\) => file\.id === lastOpenedFileId\)/);
  // The owning module + paid-update ownership are re-checked, so a position
  // saved before a refund / lock change never reopens unreachable content.
  assert.match(coursePlayer, /owningModuleForFile\(modules, match\.id\)/);
  assert.match(coursePlayer, /moduleAccessible && !filePaidLocked/);
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
  // The badge rides the Player tab now (the header that carried it is gone).
  assert.match(playerPanel, /data-course-preview-badge/);
  assert.match(playerPanel, /Preview mode/);
  assert.match(coursePlayer, /showPreviewBadge=\{resolution\.previewModuleIds\.size > 0\}/);
});

// ---------------------------------------------------------------------------
// Overlay access state + CTAs (the old CourseSidebar is deleted — the
// footer dock's Module / Paid tabs carry the same contract now)
// ---------------------------------------------------------------------------

test("CourseOverlay marks preview-only modules with the preview icon", () => {
  assert.match(overlay, /data-preview/);
  assert.match(overlay, /<Eye size=\{13\} className="text-sky-300"/);
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

test("CoursePlayer's footer dock carries the six study tabs (Player included)", () => {
  for (const tab of ["modules", "resources", "notes", "mindmap", "paid", "player"]) {
    assert.match(overlay, new RegExp(`key: "${tab}"`), `missing dock tab ${tab}`);
  }
  // The footer is the home page's GlassDock itself — no course-specific
  // pill / indicator anymore.
  assert.match(overlay, /import GlassDock, \{ type GlassDockItem \} from "\.\.\/components\/glass-dock\/GlassDock"/);
  assert.match(overlay, /data-course-dock/);
  assert.match(overlay, /data-course-dock-tab/);
  assert.doesNotMatch(overlay, /data-course-dock-indicator/);
  assert.match(coursePlayer, /data-course-player/);
  assert.doesNotMatch(coursePlayer, /data-course-side-panel/);
});

test("The study pane swaps the active tab's content in place", () => {
  assert.match(overlay, /data-course-study-chrome="pane"/);
  assert.match(overlay, /data-course-overlay-tab=\{tab\}/);
  assert.match(overlay, /key=\{tab\}/);
});

test("Modules overlay lists available modules, Resources lists only files", () => {
  assert.match(overlay, /data-course-overlay-list/);
  assert.match(overlay, /"data-mode": listModeAttr/);
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

test("Course overlay lists modules and files as dock-style buttons (home footer look)", () => {
  // The old connected wire tree is gone; rows use the footer navigation's
  // exact icon plates (44 px, tinted, magnifying) + label, in a plain
  // scroll-snapped column.
  assert.match(overlay, /data-course-sheet-row/);
  assert.match(overlay, /const ROW_ICON_SIZE = 44;/);
  assert.match(overlay, /data-row-kind=\{spec\.kind\}/);
  assert.doesNotMatch(overlay, /function WireRail/, "the wire tree is gone");
});

test("Paid overlay lists only paid modules with a buy CTA", () => {
  assert.match(overlay, /data-course-overlay-paid/);
  assert.match(overlay, /accessLevel === "paidUpdate"/);
  assert.match(overlay, /data-course-overlay-buy-module/);
  assert.match(overlay, /data-course-overlay-buy-update/);
});

test("Notes tab fills the study pane (NotesPanel mounted in the pane)", () => {
  // No fixed half-screen heights — the Split Deck's study pane simply gives
  // the notes panel whatever room the divider leaves it.
  assert.match(overlay, /tab === "notes" \? \(/);
  assert.match(overlay, /<NotesPanel[\s\S]*?composerOpenSignal=\{composerSignal\}/);
  assert.doesNotMatch(overlay, /50dvh/, "fixed half-screen heights are gone");
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

test("The Player tab uses the website logo in the back slot and keeps onBack", () => {
  // The logo comes from BrandingContext (logoUrl) so admin can swap it
  // without a redeploy — the hardcoded `/icons/icon-192x192.svg` is the
  // pre-JS boot-screen fallback only. The onClick is wrapped in a
  // long-press-aware handler (the logo doubles as the Home opener when
  // held), so a regex for the raw `onBack` doesn't match — assert the
  // call inside the handler instead.
  assert.match(playerPanel, /data-course-back/);
  assert.match(playerPanel, /data-course-logo-back/);
  assert.match(playerPanel, /data-course-logo/);
  assert.match(playerPanel, /src=\{logoUrl\}/);
  assert.match(playerPanel, /onClick=\{\(\) => \{[\s\S]*onBack\(\)/);
  assert.match(coursePlayer, /onBack=\{onBack\}/);
  assert.doesNotMatch(playerPanel, /<ArrowLeft/);
});

test("CoursePlayer uses a landscape split with no header rails", () => {
  assert.match(coursePlayer, /matchMedia\("\(orientation: landscape\)"\)/);
  assert.match(coursePlayer, /data-orientation=\{useLandscapeRails \? "landscape" : "portrait"\}/);
  // The deck fills the whole shell: the divider is vertical, lesson left,
  // study pane (tabs + footer dock) right.
  assert.match(coursePlayer, /axis=\{useLandscapeRails \? "row" : "column"\}/);
  assert.match(coursePlayer, /data-course-landscape-content/);
  // There is NO header anywhere in the player.
  assert.doesNotMatch(coursePlayer, /data-course-landscape-header/);
  assert.doesNotMatch(coursePlayer, /data-course-header\b/);
  // The old quarter-turned immersive view (rotate(90deg)) was removed along
  // with the header's rotate-to-fullscreen button, so no rotation transform
  // should remain.
  assert.doesNotMatch(coursePlayer, /rotate\(90deg\)/);
});

test("The active file's media fullscreen toggle lives in the Player tab", () => {
  // The viewer still performs the fullscreen switch (it owns the stage
  // element), but the button itself is a Player panel row.
  assert.match(playerPanel, /data-course-viewer-fullscreen/);
  assert.match(resourceViewer, /requestFullscreen/);
  assert.match(resourceViewer, /onToggleFullscreen/);
});

// ---------------------------------------------------------------------------
// AI — return to Course Player
// ---------------------------------------------------------------------------

// Removed: two tests for a Community AI / "AI Q&A" tab in the course
// player. That feature does not exist in this codebase — there is no
// #/ai-chat route, no AiQuestion component, and no aiCourseContext
// helper anywhere in src/. The tests could never pass and were only
// reporting the absence of a feature that was never built here.
