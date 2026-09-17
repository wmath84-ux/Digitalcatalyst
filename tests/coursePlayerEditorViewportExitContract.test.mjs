// tests/coursePlayerEditorViewportExitContract.test.mjs
//
// Contract for the Course Player's viewport switch while a Google editor is
// open. A viewport flip exits edit mode so the learner can see the requested
// preview. The old learner Drive-copy mapping and OAuth flow are intentionally
// absent.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const resourceViewer = read("src/course/ResourceViewer.tsx");

// ---------------------------------------------------------------------------
// The viewport switch always exits the editor into preview
// ---------------------------------------------------------------------------

test("flipping the viewport while the editor is open exits to preview", () => {
  assert.match(resourceViewer, /const previousDesktopViewRef = useRef\(desktopView\)/);
  assert.match(resourceViewer, /if \(previousDesktopViewRef\.current === desktopView\) return/);
  assert.match(resourceViewer, /setEditMode\(false\)/);
  assert.match(resourceViewer, /\}, \[desktopView\]\)/);
});

test("the viewport effect does not carry a Drive-copy mode or token flow", () => {
  assert.doesNotMatch(resourceViewer, /setCopyMode|viewportFlipRef|createCopy/);
  assert.doesNotMatch(resourceViewer, /personalCopy|googleDriveCopy|auth\/drive|drive\.file/);
});

test("the viewer uses the selected viewport to build the editor or preview URL", () => {
  assert.match(resourceViewer, /viewport: desktopView \? "desktop" : "mobile"/);
  assert.match(resourceViewer, /mode: canEditInline && editMode \? "edit" : "preview"/);
  assert.match(resourceViewer, /data-viewport-mode=/);
});
