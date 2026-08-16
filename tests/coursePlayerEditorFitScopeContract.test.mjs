// tests/coursePlayerEditorFitScopeContract.test.mjs
//
// Contract for two Google Workspace fixes in the Course Player:
//
//   1. LAYOUT — the FULL Google editor (Docs / Sheets / Slides) used to be
//      dropped into the stage at `w-full h-full` while the page was in
//      desktop-site mode, so it rendered far wider than the phone and the
//      learner had to drag left and right. Google has no mobile web editor
//      and the frame is cross-origin, so the only working lever is the
//      iframe's own box: lay the editor out at a desktop-class width, then
//      CSS-scale that box down until it fits the stage exactly.
//
//   2. PERMISSIONS — "Missing or insufficient permissions." was shown as a
//      red failure even when the Drive copy had been created successfully;
//      the message came from the Firestore mapping write, not from Drive.
//      A refused mapping is now a warning and the copy still opens. A token
//      that lacks the Drive scope is detected instead of being cached.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const resourceViewer = read("src/course/ResourceViewer.tsx");
const driveCopy = read("src/utils/googleDriveCopy.ts");
const copyHook = read("src/hooks/usePersonalDriveCopy.ts");

// ---------------------------------------------------------------------------
// 1. The full editor is fitted to the stage
// ---------------------------------------------------------------------------

test("every Google editor family has its own layout width", () => {
  assert.match(resourceViewer, /const EDITOR_VIEWPORT_WIDTHS: Record<string, number>/);
  // The bug was reported on Docs, but Sheets and Slides share the cause.
  for (const kind of ["doc", "sheet", "slides"]) {
    assert.match(resourceViewer, new RegExp(`\\n\\s*${kind}: \\d{3},`), `no editor width for ${kind}`);
  }
});

test("the editor is laid out wide and scaled down to fit the stage", () => {
  // Width the editor THINKS it has, shrunk by the zoom level.
  assert.match(resourceViewer, /const editorFrameWidth = scalesEditor \? editorViewportWidth \/ editorZoom : 0/);
  // …scaled so the box lands exactly on the stage, never larger than 1:1.
  assert.match(resourceViewer, /Math\.min\(stageWidth \/ editorFrameWidth, 1\)/);
  assert.match(resourceViewer, /width: `\$\{editorFrameWidth\}px`/);
  assert.match(resourceViewer, /transform: `scale\(\$\{editorScale\}\)`/);
});

test("a stage at least as wide as the editor is left completely unscaled", () => {
  // On a desktop the fit factor is clamped to 1, and `scalingEditor` then
  // goes false, so the iframe keeps the plain h-full/w-full path.
  assert.match(resourceViewer, /const scalingEditor = scalesEditor && stageWidth > 0 && editorScale < 1/);
  assert.match(resourceViewer, /mobileDocument \|\| scalingEditor \? "absolute left-0 top-0 bg-white" : "h-full max-h-full min-h-0 w-full max-w-full min-w-0"/);
});

test("only real editors are scaled — previews and Drive binaries are not", () => {
  // A personal copy of a PDF/Drive file is an ordinary preview page that
  // reflows by itself; scaling it would shrink readable text for nothing.
  assert.match(resourceViewer, /const scalesEditor = editMode && !mobileDocument && kind in EDITOR_VIEWPORT_WIDTHS/);
});

test("the mobile-preview path is untouched by the editor fix", () => {
  // The preview rendering is the benchmark the editor is being matched to,
  // so its own geometry must not drift.
  assert.match(resourceViewer, /const MOBILE_VIEWPORT_WIDTH = 420/);
  assert.match(resourceViewer, /width: `\$\{MOBILE_VIEWPORT_WIDTH\}px`/);
  assert.match(resourceViewer, /transform: `scale\(\$\{mobileScale\}\)`/);
  assert.match(resourceViewer, /const mobileDocument = documentKind && !desktopView && !hasNativeMobileRendering\(embed\.kind\)/);
});

test("the stage never becomes an outer scroll container", () => {
  // An outer scrollbar cannot be dragged on a phone: the iframe swallows the
  // touch. Zoom narrows the frame's CSS viewport instead, so Google scrolls
  // inside its own frame where the drag works.
  assert.match(resourceViewer, /className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"/);
  assert.doesNotMatch(resourceViewer, /editorOverflows/);
});

test("the learner can magnify the fitted editor", () => {
  assert.match(resourceViewer, /data-course-editor-zoom/);
  assert.match(resourceViewer, /data-course-editor-zoom-in/);
  assert.match(resourceViewer, /data-course-editor-zoom-out/);
  // Zoom resets when a different document loads into the frame.
  assert.match(resourceViewer, /setEditorZoom\(1\)/);
});

// ---------------------------------------------------------------------------
// 2. The personal-copy permission error
// ---------------------------------------------------------------------------

test("a refused Firestore mapping never masquerades as a failed copy", () => {
  // The copy already exists in the student's Drive at this point.
  assert.match(copyHook, /catch \{\s*warningMessage = friendlyDriveCopyError\(new DriveCopyError\("mapping_denied"/);
  assert.match(copyHook, /status: "ready", errorMessage: null, warningMessage/);
  // …and it is surfaced as a note, not as the red error banner.
  assert.match(resourceViewer, /data-course-personal-copy-warning/);
  assert.match(resourceViewer, /copyState\.status !== "error" && copyState\.warningMessage/);
});

test("a copy made this session survives a denied Firestore listener", () => {
  assert.match(copyHook, /localCopyIdRef/);
  assert.match(copyHook, /copyFileId: localCopyIdRef\.current/);
});

test("a scope-deficient Google token is detected instead of cached", () => {
  // Google's consent screen lets the user untick the Drive permission and
  // still return a valid-looking token; caching it would make every later
  // attempt fail for the rest of the session.
  assert.match(driveCopy, /scope_missing/);
  assert.match(driveCopy, /hasGrantedAllScopes/);
  assert.match(driveCopy, /include_granted_scopes: true/);
  assert.match(driveCopy, /const grantsDriveScope/);
  // The cached bundle carries its scope so a partial grant can be rejected.
  assert.match(driveCopy, /grantsDriveScope\(parsed\.scope\)/);
});

test("a scope-insufficient 403 from Drive is told apart from a project refusal", () => {
  assert.match(driveCopy, /ACCESS_TOKEN_SCOPE_INSUFFICIENT/);
  assert.match(driveCopy, /clearStoredDriveToken\(\)/);
});

test("both new failure modes have an actionable learner-facing message", () => {
  for (const code of ["scope_missing", "mapping_denied"]) {
    assert.match(driveCopy, new RegExp(`case "${code}":`), `no message for ${code}`);
  }
});
