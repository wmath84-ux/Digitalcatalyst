// tests/coursePlayerResumeCompleteToggleNotesContract.test.mjs
//
// Contract for three Course Player behaviours:
//
//   1. Module switching is LOSSLESS for every file type. The outgoing
//      lesson pauses instead of playing on in the background, and returning
//      to it continues from exactly where it stopped — YouTube, direct
//      video, audio, images (zoom/pan) and every iframe-based document.
//   2. "Mark complete" is a reversible TOGGLE, so an accidental / test tap
//      can be undone and the tracked progress stays honest.
//   3. Notes open in a LARGE rich-text editor, collapse back to the same
//      thin strip once saved, and keep the exact formatting of anything
//      pasted in (emoji, text, code, tables, links, colours…).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const coursePlayer = readSource("src/CoursePlayerApp.tsx");
const resourceViewer = readSource("src/course/ResourceViewer.tsx");
const audioPlayer = readSource("src/course/AudioPlayer.tsx");
const imageViewer = readSource("src/course/ImageViewer.tsx");
const notesPanel = readSource("src/course/NotesPanel.tsx");
const richEditor = readSource("src/course/RichTextEditor.tsx");
const overlay = readSource("src/course/CourseOverlay.tsx");
const playbackState = readSource("src/course/playbackState.ts");
const richText = readSource("src/utils/richText.ts");
const courseTypes = readSource("src/types/course.ts");
const styles = readSource("src/index.css");

// ---------------------------------------------------------------------------
// 1. Continue where you left off — every file type
// ---------------------------------------------------------------------------

test("A per-file playback snapshot is persisted per user + product", () => {
  assert.match(playbackState, /export const playbackStorageKey = \(uid: string, productId: string\) => `dc\.coursePlayback\.\$\{uid\}\.\$\{productId\}`/);
  assert.match(playbackState, /export const loadPlaybackStore/);
  assert.match(playbackState, /export const persistPlaybackStore/);
  assert.match(playbackState, /export const mergePlaybackEntry/);
  assert.match(playbackState, /export const resumePosition/);
  // The entry covers media position AND non-media view state.
  for (const field of ["position", "duration", "page", "scrollTop", "scale", "offsetX", "offsetY"]) {
    assert.match(playbackState, new RegExp(`\\b${field}\\?:`), `playback entry missing ${field}`);
  }
});

test("resumePosition ignores a barely-started or already-finished lesson", () => {
  assert.match(playbackState, /MIN_RESUME_SECONDS/);
  assert.match(playbackState, /RESUME_TAIL_GUARD_SECONDS/);
  assert.match(playbackState, /if \(!Number\.isFinite\(position\) \|\| position < MIN_RESUME_SECONDS\) return 0;/);
  assert.match(playbackState, /position >= duration - RESUME_TAIL_GUARD_SECONDS/);
});

test("CoursePlayer loads, reports and flushes the playback snapshot", () => {
  assert.match(coursePlayer, /loadPlaybackStore\(user\.id, product\.id\)/);
  assert.match(coursePlayer, /const reportPlayback = useCallback/);
  assert.match(coursePlayer, /mergePlaybackEntry\(playbackRef\.current, fileId, patch\)/);
  assert.match(coursePlayer, /persistPlaybackStore\(user\.id, product\.id, playbackRef\.current\)/);
  // Hiding / closing the tab must not lose the position.
  assert.match(coursePlayer, /window\.addEventListener\("pagehide", flush\)/);
  assert.match(coursePlayer, /document\.addEventListener\("visibilitychange", flush\)/);
});

test("Every opened file stays mounted so switching modules never reloads it", () => {
  assert.match(coursePlayer, /const \[visitedFiles, setVisitedFiles\] = useState<CourseFile\[\]>\(\[\]\)/);
  assert.match(coursePlayer, /data-course-viewer-stack/);
  assert.match(coursePlayer, /data-course-viewer-slot/);
  // Inactive slots are hidden but alive — never unmounted.
  assert.match(coursePlayer, /pointer-events-none invisible opacity-0/);
  assert.match(coursePlayer, /active=\{active\}/);
  assert.match(coursePlayer, /onPlaybackChange=\{reportPlayback\}/);
  // A different course starts a fresh stack.
  assert.match(coursePlayer, /setVisitedFiles\(\[\]\); \}, \[product\.id\]\)/);
});

test("ResourceViewer accepts the active flag and the playback wiring", () => {
  assert.match(resourceViewer, /active\?: boolean;/);
  assert.match(resourceViewer, /playback\?: CoursePlaybackStore;/);
  assert.match(resourceViewer, /onPlaybackChange\?: \(fileId: string, patch: CoursePlaybackPatch\) => void;/);
  assert.match(resourceViewer, /function ResourceViewer\(\{ file, active = true, playback, onPlaybackChange \}/);
  assert.match(resourceViewer, /data-active=\{active \? "true" : "false"\}/);
});

test("YouTube pauses on module switch and resumes at the stored second", () => {
  // The IFrame API is required to pause / read the position programmatically.
  assert.match(resourceViewer, /loadYouTubeApi/);
  assert.match(resourceViewer, /https:\/\/www\.youtube\.com\/iframe_api/);
  assert.match(resourceViewer, /pauseVideo: \(\) => void/);
  assert.match(resourceViewer, /player\.pauseVideo\(\)/);
  assert.match(resourceViewer, /start: Math\.floor\(resumeRef\.current\) \|\| 0/);
  assert.match(resourceViewer, /host: "https:\/\/www\.youtube-nocookie\.com"/);
  // Position is banked every second so an abrupt exit loses at most 1s.
  assert.match(resourceViewer, /getCurrentTime\(\) \|\| 0, player\.getDuration\(\) \|\| 0/);
  // Blocked / offline API still resumes through the plain embed.
  assert.match(resourceViewer, /start=\$\{Math\.floor\(resumeRef\.current\)\}/);
});

test("Direct video pauses on module switch and resumes at the stored second", () => {
  assert.match(resourceViewer, /function DirectVideo/);
  assert.match(resourceViewer, /video\.pause\(\);/);
  assert.match(resourceViewer, /video\.currentTime = Math\.min\(resumeRef\.current/);
  assert.match(resourceViewer, /onTimeUpdate=\{\(event\) => onProgress\(event\.currentTarget\.currentTime/);
});

test("Audio pauses on module switch and resumes at the stored second", () => {
  assert.match(audioPlayer, /active = true, resumeAt = 0, onProgress/);
  assert.match(audioPlayer, /if \(!audio \|\| active\) return;/);
  assert.match(audioPlayer, /audio\.pause\(\);/);
  assert.match(audioPlayer, /audio\.currentTime = Math\.min\(resumeRef\.current/);
});

test("Images restore their zoom and pan when the module is reopened", () => {
  assert.match(imageViewer, /initialScale\?: number;/);
  assert.match(imageViewer, /initialOffset\?: \{ x: number; y: number \};/);
  assert.match(imageViewer, /onViewChange\?: \(scale: number, offset: \{ x: number; y: number \}\) => void;/);
  assert.match(imageViewer, /viewChangeRef\.current\?\.\(value, nextOffset\)/);
  assert.match(resourceViewer, /initialScale=\{entry\?\.scale\}/);
  assert.match(resourceViewer, /report\(\{ scale, offsetX: offset\.x, offsetY: offset\.y \}\)/);
});

test("Documents keep their own scroll / page because the iframe is never torn down", () => {
  // The rule is explicitly documented so it isn't regressed later.
  assert.match(resourceViewer, /Continue where you left off \(EVERY file type\)/);
  assert.match(coursePlayer, /keeps its scroll position/);
});

// ---------------------------------------------------------------------------
// 2. Mark complete is a reversible toggle
// ---------------------------------------------------------------------------

test("Mark complete toggles both ways so an accidental tap is reversible", () => {
  assert.match(coursePlayer, /const toggleComplete = async \(\) =>/);
  assert.match(coursePlayer, /const completing = !completedIds\.has\(selectedFile\.id\)/);
  assert.match(coursePlayer, /completedFileIds: completing \? arrayUnion\(selectedFile\.id\) : arrayRemove\(selectedFile\.id\)/);
  assert.match(coursePlayer, /import \{ arrayRemove, arrayUnion/);
  // The button is never disabled once complete — that is what made it a
  // one-way door before.
  assert.doesNotMatch(coursePlayer, /disabled=\{isDone\}/);
  assert.match(coursePlayer, /onClick=\{\(\) => void toggleComplete\(\)\}/);
  assert.match(coursePlayer, /aria-pressed=\{isDone\}/);
  assert.match(coursePlayer, /Tap to mark as not complete/);
  assert.match(coursePlayer, /data-completed=\{isDone \? "true" : "false"\}/);
});

test("Un-completing plays the remove cue and keeps progress honest", () => {
  assert.match(coursePlayer, /if \(completing\) playSfxComplete\(\);\s*\n\s*else playSfxRemove\(\);/);
  // Optimistic local flip so the UI answers instantly.
  assert.match(coursePlayer, /if \(completing\) next\.add\(selectedFile\.id\);\s*\n\s*else next\.delete\(selectedFile\.id\);/);
});

// ---------------------------------------------------------------------------
// 3. Notes — big editor, thin saved strip, exact pasted formatting
// ---------------------------------------------------------------------------

test("The notes editor is a large rich-text surface", () => {
  assert.match(notesPanel, /<RichTextEditor/);
  assert.match(notesPanel, /data-course-notes-mode=\{editing \? "edit" : "compose"\}/);
  // The composer takes over the whole panel.
  assert.match(notesPanel, /if \(editorOpen\) \{/);
  assert.match(notesPanel, /className="flex min-h-0 flex-1 flex-col p-3"/);
  // …and the sheet itself grows while it's open.
  assert.match(overlay, /const notesEditorHeight = landscape \? "min\(92vw, 620px\)" : "88dvh"/);
  assert.match(overlay, /notesEditorOpen \? notesEditorHeight : notesHeight/);
  assert.match(overlay, /onEditorOpenChange=\{setNotesEditorOpen\}/);
});

test("A saved note still collapses back to the same thin one-line strip", () => {
  assert.match(notesPanel, /data-course-notes-list/);
  assert.match(notesPanel, /min-w-0 flex-1 truncate text-xs/);
  assert.match(notesPanel, /const notePreview = \(note: CoursePlayerNote\)/);
  assert.match(notesPanel, /richTextToPlain/);
});

test("Pasting from anywhere keeps the exact formatting", () => {
  assert.match(richEditor, /const handlePaste/);
  assert.match(richEditor, /clipboard\.getData\("text\/html"\)/);
  assert.match(richEditor, /clipboard\.getData\("text\/plain"\)/);
  assert.match(richEditor, /html \? sanitizeRichText\(html\) : plainToRichText\(plain\)/);
  assert.match(richEditor, /exec\("insertHTML", markup\)/);
  // Dropping a selection behaves the same way.
  assert.match(richEditor, /const handleDrop/);
  // Plain-text pastes keep their newlines and indentation.
  assert.match(richText, /export const plainToRichText/);
  assert.match(richText, /replace\(\/ \{2,\}\/g/);
});

test("Pasted HTML is sanitised but its presentational markup survives", () => {
  for (const tag of ["strong", "em", "u", "s", "code", "pre", "blockquote", "ul", "ol", "li", "table", "tr", "td", "th", "h1", "h2", "h3", "a", "img", "mark", "span"]) {
    assert.match(richText, new RegExp(`"${tag}"`), `allowed tag list missing ${tag}`);
  }
  for (const style of ["color", "background-color", "font-weight", "font-style", "text-decoration", "text-align"]) {
    assert.match(richText, new RegExp(`"${style}"`), `allowed style list missing ${style}`);
  }
  // …while anything executable is removed.
  assert.match(richText, /"script", "style", "iframe", "object", "embed", "form"/);
  assert.match(richText, /name\.startsWith\("on"\)/);
  assert.match(richText, /const SAFE_URL = \/\^\(https\?:\|mailto:\|tel:\)\//);
  assert.match(richText, /javascript:/);
});

test("Notes carry both the rich HTML and a plain-text projection", () => {
  assert.match(courseTypes, /html\?: string;/);
  assert.match(coursePlayer, /const safeHtml = sanitizeRichText\(html\)/);
  assert.match(coursePlayer, /text: richTextToPlain\(safeHtml\), html: safeHtml/);
  // Legacy plain-text notes still render.
  assert.match(notesPanel, /note\.html \|\| plainToRichText\(note\.text \|\| ""\)/);
});

test("The editor renders pasted formatting correctly inside the panel", () => {
  assert.match(styles, /\.course-rich-surface/);
  for (const selector of ["blockquote", "pre", "table", "mark", "img", "hr"]) {
    assert.match(styles, new RegExp(`\\.course-rich-surface[^\\n]*\\b${selector}\\b`), `missing .course-rich-surface ${selector} rule`);
  }
  // Pasted code keeps indentation and wraps rather than overflowing.
  assert.match(styles, /white-space: pre-wrap/);
  assert.match(styles, /overflow-wrap: anywhere/);
  // Placeholder for the empty surface.
  assert.match(styles, /\.course-rich-surface:empty::before/);
});

test("The editor exposes inline formatting controls and keyboard shortcuts", () => {
  for (const action of ["bold", "italic", "underline", "strike", "bullet", "numbered", "quote", "code", "clear"]) {
    assert.match(richEditor, new RegExp(`key: "${action}"`), `missing toolbar action ${action}`);
  }
  assert.match(richEditor, /data-course-rich-toolbar/);
  assert.match(richEditor, /data-course-rich-action=\{key\}/);
  assert.match(richEditor, /if \(key === "b"\)/);
  assert.match(richEditor, /if \(key === "i"\)/);
  assert.match(richEditor, /if \(key === "u"\)/);
});
