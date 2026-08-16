// tests/coursePlayerEditorViewportExitContract.test.mjs
//
// Contract for two Course Player fixes:
//
//   1. VIEWPORT SWITCH WHILE AN EDITOR IS OPEN — the header's
//      desktop/mobile button used to be a no-op while the Google editor
//      (Docs / Sheets / Slides, or a personal copy) was on stage, because
//      the editor URL is identical in both viewports and Google has no
//      mobile editor. Flipping the button now EXITS the editor straight
//      into the preview of the newly chosen viewport, so the tap always
//      visibly does what the button promises.
//
//   2. STUCK "couldn't save the link" NOTE — a refused Firestore mapping
//      write used to leave a permanent warning that told the learner to
//      sign out and back in (advice that could never fix it). The copy id
//      is now mirrored to the device so the same device reopens it across
//      visits, Firestore is backfilled silently, and the note is
//      dismissible (plus auto-hides) instead of staying forever.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const resourceViewer = read("src/course/ResourceViewer.tsx");
const copyHook = read("src/hooks/usePersonalDriveCopy.ts");
const driveCopy = read("src/utils/googleDriveCopy.ts");

// ---------------------------------------------------------------------------
// 1. The viewport switch always exits the editor into preview
// ---------------------------------------------------------------------------

test("flipping the viewport while the editor is open exits to preview", () => {
  // The previous viewport is remembered so only a real FLIP exits.
  assert.match(resourceViewer, /const previousDesktopViewRef = useRef\(desktopView\)/);
  assert.match(resourceViewer, /if \(previousDesktopViewRef\.current === desktopView\) return/);
  // Both editor modes leave the stage: the inline editor AND a personal copy.
  assert.match(resourceViewer, /setEditMode\(false\)/);
  assert.match(resourceViewer, /setCopyMode\(false\)/);
  assert.match(resourceViewer, /\}, \[desktopView\]\)/);
});

test("a copy that finishes after a viewport flip does not drag the learner back into edit", () => {
  // The flip bumps an epoch; the pending createCopy only enters copy mode
  // when no flip happened while Drive was still copying.
  assert.match(resourceViewer, /const viewportFlipRef = useRef\(0\)/);
  assert.match(resourceViewer, /viewportFlipRef\.current \+= 1/);
  assert.match(resourceViewer, /const flip = viewportFlipRef\.current/);
  assert.match(resourceViewer, /if \(viewportFlipRef\.current === flip\) setCopyMode\(true\)/);
});

// ---------------------------------------------------------------------------
// 2. The copy mapping can never be stranded by a refused Firestore write
// ---------------------------------------------------------------------------

test("the mapping is mirrored to the device so a refused write still remembers the copy", () => {
  // localStorage key is scoped per user + master file.
  assert.match(copyHook, /dc\.driveCopies\.v1\.\$\{uid\}\.\$\{sourceFileId\}/);
  assert.match(copyHook, /localStorage\.setItem/);
  assert.match(copyHook, /localStorage\.getItem/);
  // The device mirror is written BEFORE the Firestore attempt.
  assert.match(copyHook, /writeLocalMapping\(uid, sourceFileId, \{ copyFileId: copy\.id/);
  assert.match(copyHook, /await persistMapping\(\{ copyFileId: copy\.id/);
});

test("a device-only mapping is reused and backfilled into Firestore", () => {
  // createCopy reuses the mirrored id instead of cloning the master twice.
  assert.match(copyHook, /const localId = readLocalMapping\(uid, sourceFileId\)\?\.copyFileId \|\| ""/);
  assert.match(copyHook, /const cachedId = existingId \|\| localId/);
  // The live listener pushes a device-only copy back to Firestore silently.
  assert.match(copyHook, /if \(local\?\.copyFileId && !stored\)/);
  assert.match(copyHook, /void persistMapping\(local\)\.catch\(\(\) => undefined\)/);
});

test("the mapping note is dismissible and never permanent", () => {
  assert.match(copyHook, /const dismissWarning = useCallback/);
  assert.match(copyHook, /return \{ \.\.\.state, createCopy, dismissWarning \}/);
  assert.match(resourceViewer, /data-course-personal-copy-warning-dismiss/);
  assert.match(resourceViewer, /onClick=\{copyState\.dismissWarning\}/);
  // …and it auto-hides so it can never simply sit there forever.
  assert.match(resourceViewer, /setTimeout\(\(\) => copyState\.dismissWarning\(\), 8000\)/);
});

test("the mapping-denied message no longer tells the learner to sign out", () => {
  // Signing out cannot repair a refused Firestore write; the new copy text
  // says what actually happened (saved on this device only).
  assert.doesNotMatch(driveCopy, /sign out and sign back in/i);
  assert.match(driveCopy, /case "mapping_denied":/);
});
