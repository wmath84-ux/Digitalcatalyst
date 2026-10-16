// tests/coursePlayerChunkRecoveryContract.test.mjs
//
// Contract: a lazily-loaded Course Player chunk that cannot be fetched — the
// stale-deploy signature "Failed to fetch dynamically imported module:
// …/MindMapPanel-<hash>.js" — is RECOVERED, never a dead-end crash screen.
//
//   1. every heavy player chunk loads through `lazyWithChunkRecovery`
//      (plain React.lazy + a couple of retries + one automatic reload), and
//   2. the Course Player error boundary runs the SAME one-shot reload for a
//      chunk error raised anywhere else, sharing the cooldown marker so the
//      page can never reload-loop on a genuinely broken deploy.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const LAZY_CHUNK = read("src/utils/lazyChunk.ts");
const PLAYER_APP = read("src/CoursePlayerApp.tsx");
const MY_COURSE_PAGE = read("src/personal-library/MyCoursePlayerPage.tsx");
const BOUNDARY = read("src/components/CoursePlayerErrorBoundary.tsx");

test("1 — the shared helper retries the import and reloads once for a stale build", () => {
  assert.match(LAZY_CHUNK, /export function lazyWithChunkRecovery/);
  // The browser's own texts for a failed dynamic import are all recognised.
  assert.match(LAZY_CHUNK, /dynamically imported module/);
  assert.match(LAZY_CHUNK, /error loading dynamically imported module/);
  assert.match(LAZY_CHUNK, /Importing a module script failed/);
  assert.match(LAZY_CHUNK, /export const isModuleFetchError/);
  // A retry or two rides out a network blip before the reload is considered.
  assert.match(LAZY_CHUNK, /CHUNK_RETRY_DELAYS_MS = \[\d+, \d+\]/);
  // The cooldown: at most one automatic reload per window, whoever asks.
  assert.match(LAZY_CHUNK, /export const CHUNK_RELOAD_AT_KEY = "dc\.courseChunkReloadAt";/);
  assert.match(LAZY_CHUNK, /export const CHUNK_RELOAD_COOLDOWN_MS = [\d_]+;/);
  assert.match(LAZY_CHUNK, /export const recoverStaleBuildOnce/);
  assert.match(LAZY_CHUNK, /window\.sessionStorage\.getItem\(CHUNK_RELOAD_AT_KEY\)/);
  assert.match(LAZY_CHUNK, /window\.location\.reload\(\)/);
  // While the page is reloading the Suspense fallback stays up (the promise
  // never settles); only a failure past the cooldown is thrown to the UI.
  assert.match(LAZY_CHUNK, /return new Promise<\{ default: T \}>\(\(\) => undefined\);/);
  assert.match(LAZY_CHUNK, /throw lastError;/);
});

test("2 — the Course Player's heavy panels load through the recovery wrapper", () => {
  for (const chunk of [
    "./course/MindMapPanel",
    "./course/SketchPanel",
    "./personal-library/AddOfficialResourceDialog",
    "./lumen/App",
  ]) {
    const escaped = chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      PLAYER_APP,
      new RegExp(`const \\w+ = lazyWithChunkRecovery\\(\\(\\) => import\\("${escaped}"\\)\\);`),
      `${chunk} loads via lazyWithChunkRecovery`,
    );
    assert.doesNotMatch(
      PLAYER_APP,
      new RegExp(`= lazy\\(\\(\\) => import\\("${escaped}"\\)\\)`),
      `${chunk} never uses bare React.lazy again`,
    );
  }
});

test("3 — the learner-authored course route protects its player chunk the same way", () => {
  assert.match(
    MY_COURSE_PAGE,
    /const CoursePlayer = lazyWithChunkRecovery\(\(\) => import\("\.\.\/CoursePlayerApp"\)\);/,
  );
});

test("4 — the error boundary auto-recovers a chunk error and never reload-loops", () => {
  assert.match(BOUNDARY, /import \{ isModuleFetchError, recoverStaleBuildOnce \} from "\.\.\/utils\/lazyChunk";/);
  assert.match(BOUNDARY, /if \(isModuleFetchError\(error\) && recoverStaleBuildOnce\(\)\)/);
  // The moment in between shows the gentle "updating" card, not the crash UI.
  assert.match(BOUNDARY, /data-course-player-recovering/);
  assert.match(BOUNDARY, /Updating course player/);
  // A chunk error that survives the cooldown explains the stale-build case.
  assert.match(BOUNDARY, /const staleChunk = isModuleFetchError\(error\);/);
  assert.match(BOUNDARY, /The app was updated while this page was open/);
  // The original recovery screen and its three exits are untouched.
  assert.match(BOUNDARY, /Course Player hit a snag/);
  assert.match(BOUNDARY, /Reload and retry/);
  assert.match(BOUNDARY, /Back to purchases/);
  assert.match(BOUNDARY, /Go to Home/);
});
