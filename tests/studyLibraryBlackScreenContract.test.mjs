// tests/studyLibraryBlackScreenContract.test.mjs
//
// Contract for the "Study Library opens to a black screen" fix.
//
// Reported symptom: opening the My Study Library page showed a black screen
// and the app could not be navigated away. In this hash-routed single-root
// app, a render crash anywhere in the route unmounts the ENTIRE tree — the
// page's backdrop is a near-black scene, so the learner is left on a bare,
// dark canvas with dead navigation (the exact failure mode FlowPath hit and
// fixed in PR #521).
//
// The two-part fix, pinned here:
//   1. The AI Study Engine workspace (mounted by the library page) no longer
//      dereferences snapshot blocks that the shared serverless function may
//      omit (`.ai`, `.scope`): every access is optional-chained, and a
//      malformed context response degrades to the workspace's error state
//      instead of throwing during render.
//   2. The Study Library route is wrapped in a dedicated error boundary, so
//      ANY future render crash stays contained to the library subtree with
//      working Try again / Go back / Go to Home actions — never a dead
//      black page.
//
// This suite reads the real sources (like the other *Contract suites) so it
// fails the moment either protection is removed or weakened.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const workspace = read("src/ai/ModuleAiWorkspace.tsx");
const sources = read("src/ai/AiSourcesView.tsx");
const hook = read("src/ai/useModuleAi.ts");
const boundary = read("src/personal-library/StudyLibraryErrorBoundary.tsx");
const main = read("src/main.tsx");

test("the AI workspace never dereferences an absent snapshot.ai block", () => {
  // The header pill and its memo deps must optional-chain the whole `ai`
  // block — a context response with no `ai` must render (empty pill), not throw.
  assert.match(workspace, /ai\.snapshot\?\.ai\?\.planName/);
  assert.match(workspace, /ai\.snapshot\?\.ai\?\.hasAccess/);
  // No remaining unguarded `snapshot.ai.` reads in the workspace.
  assert.doesNotMatch(workspace, /ai\.snapshot\?\.ai\.\w+|ai\.snapshot\.ai\.\b/);
});

test("the sources panel never dereferences an absent snapshot.ai block", () => {
  assert.match(sources, /ai\.snapshot\.ai\?\.planName/);
  assert.match(sources, /ai\.snapshot\.ai\?\.hasAccess/);
  assert.doesNotMatch(sources, /ai\.snapshot\.ai\.\w+/);
});

test("a malformed AI context response degrades to the error state, not a render crash", () => {
  // In the real client the envelope guard already rejects non-object data; the
  // hook must ALSO shape-check before reading `result.scope` / `result.coverage`
  // so nothing downstream can throw on the values it is about to render.
  assert.match(hook, /if \(!result \|\| typeof result !== "object" \|\| Array\.isArray\(result\)\)/);
  assert.match(hook, /setPhase\(snapshotRef\.current \? "ready" : "error"\)/);
});

test("the Study Library route is wrapped in an error boundary with working escapes", () => {
  assert.ok(fs.existsSync("src/personal-library/StudyLibraryErrorBoundary.tsx"), "boundary file exists");
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /Try again/);
  assert.match(boundary, /Go back/);
  assert.match(boundary, /Go to Home/);
  assert.match(boundary, /window\.history\.back\(\)/);
  assert.match(boundary, /data-study-library-error/);
  // The boundary resets itself on route change so a later visit starts clean.
  assert.match(boundary, /addEventListener\("hashchange"/);
});

test("main.tsx wraps the Study Library route in that boundary", () => {
  assert.match(main, /StudyLibraryErrorBoundary/);
  assert.match(main, /import \{ StudyLibraryErrorBoundary \} from "\.\/personal-library\/StudyLibraryErrorBoundary"/);
  assert.match(main, /<StudyLibraryErrorBoundary>/);
  assert.match(main, /hash\.startsWith\(STUDY_LIBRARY_HASH\)/);
});

test("recovery reloads so a crash caused by stale/cached state can actually heal", () => {
  // A plain setState retry would re-render the same snapshot that crashed;
  // the recovery must reload so the boot path re-fetches from the server.
  assert.match(boundary, /window\.location\.reload\(\)/);
});
