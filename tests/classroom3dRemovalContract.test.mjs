// tests/classroom3dRemovalContract.test.mjs
//
// The 3D Classroom was a SECOND shell over the course player's one brain: a
// WebGL winter room (src/classroom3d, 30 files) the learner sat in, with the
// lesson on the board ahead, the notes wall left, the mind map wall further
// left and a control console on the desk — plus four parts' worth of
// optimisation machinery built only to keep that room at 60fps (quality tiers,
// wall visibility/activity, surface drag-scroll, throttled transforms, merged
// statics, embed motion + impostors, a context bridge for drei's second React
// root).
//
// Owner, 2026-09-08: remove it COMPLETELY — code, optimisation logic, tests,
// docs, scripts, dev route, player toggle and the 3D vendor stack — while the
// flat Split Deck player keeps every behaviour it had. The room's panel LOOK
// survives, ported to the flat player; that half is pinned by
// tests/coursePlayerClassroomPanelLookContract.test.mjs.
//
// This file is the removal half: it fails if any part of the room comes back,
// and it fails if the flat player lost anything while the room was cut out.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const exists = (file) => fs.existsSync(new URL(`../${file}`, import.meta.url));

/**
 * Source with its comments taken out. The room is gone, but the flat player's
 * new panel language is documented as PORTED FROM it (src/course/flatPlayerChrome.css,
 * src/main.tsx) — prose that names the room is exactly the provenance a future
 * reader needs, while an import, an identifier or a CSS class that reaches for
 * it is a bug. The `//` strip skips a protocol separator so a URL in a string
 * is never mistaken for a comment.
 */
const codeOnly = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");

/** Every source file of the app, minus build output and dependencies. */
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx?|mjs|css|html|json)$/.test(entry.name)) out.push(path);
  }
  return out;
};

const SOURCE_FILES = () => [...walk("src"), "index.html", "vite.config.ts", "capacitor.config.ts"];

/* ── 1. The room's own files are gone ───────────────────────────────────── */

test("the whole 3D classroom module is deleted", () => {
  assert.equal(exists("src/classroom3d"), false, "src/classroom3d still exists");
  for (const file of [
    "Classroom3D.tsx", "Classroom3DPreview.tsx", "ClassroomCanvas.tsx", "Room.tsx",
    "RoomSheet.tsx", "SeatRig.tsx", "DeskConsole.tsx", "panels.tsx", "Classmates.tsx",
    "StaticInstances.tsx", "SurfaceFrame.tsx", "SurfaceContexts.tsx", "QualityGovernor.tsx",
    "WallActivity.tsx", "WallVisibility.tsx", "classroom3d.css", "state.ts", "quality.ts",
    "roomGeometry.ts", "surfaceScale.ts", "surfaceScroll.ts", "useSurfaceScroll.ts",
    "throttledTransform.ts", "embedMotion.ts", "mergedStatics.ts", "objectActivity.ts",
    "resourceLifetime.ts", "wallFocus.ts", "classmateAssets.ts",
  ]) {
    assert.equal(exists(`src/classroom3d/${file}`), false, file);
  }
});

test("the room-only helpers that lived outside src/classroom3d are gone too", () => {
  // The static placeholder third-party iframes were swapped for while the
  // camera moved — a classroom mechanism with no flat-player use.
  assert.equal(exists("src/course/EmbedImpostor.tsx"), false);
});

test("the room's tests, docs and benchmark scripts are gone", () => {
  for (const file of [
    "tests/classroom3dBoardZoomFullscreenContract.test.mjs",
    "tests/classroom3dEmbedImpostorContract.test.mjs",
    "tests/classroom3dOptimizationRuntime.test.mjs",
    "tests/classroom3dPerformanceContract.test.mjs",
    "tests/classroom3dSurfaceRenderingContract.test.mjs",
    "tests/classroom3dSurfaceScrollRuntime.test.mjs",
    "tests/classroom3dTriptychAndContextBridgeContract.test.mjs",
    "docs/classroom-performance-audit.md",
    "docs/classroom-performance-results.json",
    "docs/part12-classroom-zoom.md",
    "docs/part13-classroom-performance.md",
    "docs/part14-classroom-embed-optimization.md",
    "docs/part18-classroom-surface-rendering.md",
    "docs/part19-classroom-triptych-and-surface-contexts.md",
    "scripts/benchmark-classroom.mjs",
    "scripts/classroom-performance-probe.mjs",
    "scripts/verify-classroom-runtime.mjs",
  ]) {
    assert.equal(exists(file), false, file);
  }
});

/* ── 2. Nothing in the app still reaches for it ─────────────────────────── */

test("no source file references the classroom, its CSS or its hooks", () => {
  for (const file of SOURCE_FILES()) {
    const text = codeOnly(read(file));
    assert.doesNotMatch(text, /classroom3d|Classroom3D|dc-classroom|dc-room-sheet/i, file);
    // The room's own hooks + signals, wherever they were imported from.
    // (`useDragScroll` is deliberately NOT in this list: src/hooks/useDragScroll.ts
    // is the app-wide mouse-drag-for-horizontal-rails hook the store, home, PDP,
    // My Day and revision all use, and it only shares a name with the room's
    // own surface scroller. What the room's version had that nothing else has
    // is `useHoldScroll`, its press-and-hold rAF scroller.)
    assert.doesNotMatch(
      text,
      /useWallActivity|subscribeEmbedMotion|EmbedImpostor|useHoldScroll|SurfaceContexts|data-classroom-|dc-embed-moving|data-embed-impostor-target/,
      file,
    );
  }
});

test("the 3D vendor stack is out of the manifest and out of the source", () => {
  const pkg = JSON.parse(read("package.json"));
  for (const dependency of ["three", "@react-three/fiber", "@react-three/drei", "@types/three"]) {
    assert.equal(pkg.dependencies[dependency], undefined, dependency);
    assert.equal(pkg.devDependencies[dependency], undefined, dependency);
  }
  for (const file of SOURCE_FILES()) {
    assert.doesNotMatch(codeOnly(read(file)), /from ["']three["']|@react-three|@types\/three/, file);
  }
  // Both lockfiles must agree with the manifest, or `npm ci` (CI) fails.
  assert.doesNotMatch(read("package-lock.json"), /"node_modules\/three"|@react-three\/fiber/);
});

/* ── 3. The player: one shell, no room switch ───────────────────────────── */

test("the course player has ONE shell and no room mode", () => {
  const player = read("src/CoursePlayerApp.tsx");
  assert.doesNotMatch(player, /classroom/i);
  assert.doesNotMatch(player, /dc\.coursePlayerClassroom3d/);
  assert.doesNotMatch(player, /roomComposerSignal|roomNoteRequest|roomNoteItems|roomMapItems/);
  // The shell-switch helper existed only to reset the study surfaces on the
  // way INTO the room.
  assert.doesNotMatch(player, /returnStudySurfacesToLibrary/);
  // The flat shell is still the whole return value of the component.
  assert.match(player, /<SplitDeck/);
  assert.match(player, /data-course-player\b/);
  assert.match(player, /course-player-shell/);
});

test("the Player tab no longer offers a 3D Classroom switch", () => {
  const panel = read("src/course/PlayerPanel.tsx");
  assert.doesNotMatch(panel, /classroom/i);
  assert.doesNotMatch(panel, /onClassroom3dChange/);
  // The preferences that ARE the flat player's survive, in order.
  assert.match(panel, /settingsRow\("Light theme"/);
  assert.match(panel, /settingsRow\("Snowfall"/);
  assert.match(panel, /settingsRow\("Desktop view"/);
  assert.match(panel, /settingsRow\("Hide status bar"/);
  assert.match(panel, /Split mode hamesha on hai/);
});

test("the viewer's classroom gates and camera-motion optimisations are gone", () => {
  const viewer = read("src/course/ResourceViewer.tsx");
  // The wall latch (lazy iframe boot), the motion subscription (YouTube
  // quality step-down) and the impostor swaps were the room's Part 13/14
  // optimisation logic.
  assert.doesNotMatch(viewer, /wallLoaded|useWallActivity|subscribeEmbedMotion|EmbedImpostor/);
  assert.doesNotMatch(viewer, /setPlaybackQuality|getPlaybackQuality/);
  assert.doesNotMatch(viewer, /dc-embed-frame|data-embed-impostor-target/);
  // What the flat player kept: the frames boot immediately and unconditionally.
  assert.match(viewer, /if \(!videoId\) return undefined;/);
  assert.match(viewer, /\}, \[videoId\]\);/);
  assert.match(viewer, /\}, \[url, reloadKey\]\);/);
  assert.match(viewer, /data-course-youtube-player/);
  assert.match(viewer, /sandbox=\{editMode \? undefined :/);
});

test("the notes panel owns its circular + and drops the room's library signal", () => {
  const notes = read("src/course/NotesPanel.tsx");
  assert.doesNotMatch(notes, /classroom/i);
  assert.doesNotMatch(notes, /openNoteSignal|openNoteId/);
  // The pane carries no header, so the panel owns its own circular "+" at
  // the grid's bottom-right; the external signal stays as an optional extra.
  assert.match(notes, /data-course-notes-add/);
  assert.match(notes, /onClick=\{openComposer\}/);
  assert.match(notes, /composerOpenSignal\?: number;/);
  assert.match(notes, /if \(composerOpenSignal && composerOpenSignal > 0\) openComposer\(\);/);
  assert.doesNotMatch(read("src/course/CourseOverlay.tsx"), /composerOpenSignal=\{composerSignal\}/);
});

test("the dev preview route for the room is gone", () => {
  const main = codeOnly(read("src/main.tsx"));
  assert.doesNotMatch(main, /classroom/i);
  assert.doesNotMatch(main, /#\/dev\/classroom-3d/);
  // The other dev previews are untouched.
  assert.match(main, /OPENING_PREVIEW_HASH/);
  assert.match(main, /MINDMAP_PREVIEW_HASH/);
  assert.match(main, /GLASS_PREVIEW_HASH/);
});

test("the app contexts are module-private again", () => {
  // They were exported ONLY so drei's <Html> could re-provide them inside the
  // room's second React root (SurfaceContexts). Nothing needs that now, and
  // every consumer goes through the hooks.
  for (const [file, name] of [
    ["src/context/AuthContext.tsx", "AuthContext"],
    ["src/context/BrandingContext.tsx", "BrandingContext"],
    ["src/context/CatalogContext.tsx", "CatalogContext"],
    ["src/context/CommerceContext.tsx", "CommerceContext"],
    ["src/context/ConnectivityContext.tsx", "ConnectivityContext"],
    ["src/context/FeatureVisibilityContext.tsx", "FeatureVisibilityContext"],
  ]) {
    const text = read(file);
    assert.doesNotMatch(text, new RegExp(`export const ${name} = createContext`), file);
    assert.match(text, new RegExp(`const ${name} = createContext`), file);
    assert.match(text, new RegExp(`<${name}\\.Provider`), file);
  }
});

/* ── 4. The flat player lost nothing ────────────────────────────────────── */

test("the flat Split Deck player is intact end to end", () => {
  const player = read("src/CoursePlayerApp.tsx");
  const deck = read("src/course/studyPanels.tsx");
  const overlay = read("src/course/CourseOverlay.tsx");

  // The lossless viewer stack: every visited file stays mounted.
  assert.match(player, /data-course-viewer-stack/);
  assert.match(player, /data-course-viewer-slot/);
  assert.match(player, /visitedFiles\.map/);
  // Resume / progress / notes / mind map brains.
  assert.match(player, /loadPlaybackStore/);
  assert.match(player, /mergePlaybackEntry/);
  assert.match(player, /persistLocalNotes/);
  assert.match(player, /<MindMapPanel/);
  assert.match(player, /<PlayerPanel/);
  assert.match(player, /useCourseMindMap/);
  // The deck's own machinery: ratio, snaps, peek rails, keyboard, orientation.
  assert.match(deck, /data-course-split-deck/);
  assert.match(deck, /data-course-lesson-pane/);
  assert.match(deck, /data-course-study-pane/);
  assert.match(deck, /data-course-split-divider/);
  assert.match(deck, /data-course-peek-rail/);
  assert.match(deck, /SPLIT_SNAP_POINTS/);
  // The seven dock tabs; the study pane carries no chrome row.
  assert.doesNotMatch(overlay, /data-course-study-chrome/);
  assert.match(overlay, /data-course-dock\b/);
  assert.match(overlay, /data-course-sheet-row/);
  assert.match(read("src/course/CourseOverlay.tsx"), /modules|brain|notes|mindmap|ai|paid|player/);
});

test("the room's panel look is what survived — as flat-player paint", () => {
  // The one thing the owner kept from the classroom: how its panels looked.
  // Its full contract lives in its own test file; here only the seam is
  // pinned, so a future sweep cannot delete the port and call it "cleanup".
  assert.ok(exists("src/course/flatPlayerChrome.css"));
  assert.match(read("src/main.tsx"), /import "\.\/course\/flatPlayerChrome\.css";/);
});
