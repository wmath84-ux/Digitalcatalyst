import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(file, "utf8");

function bundleEngine(entry, name) {
  const cache = path.join(process.cwd(), "node_modules", ".cache", "revision-fsrs-memory-state");
  fs.mkdirSync(cache, { recursive: true });
  const outfile = path.join(cache, `${name}.cjs`);
  buildSync({
    entryPoints: [path.join(process.cwd(), entry)],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    external: ["ts-fsrs"],
    logLevel: "silent",
  });
  return require(outfile);
}

const now = new Date("2026-10-05T12:00:00.000Z");

test("unified FSRS preview and review repair reviewed cards with empty memory", () => {
  const { applyReview, normalizeFsrsScheduling, previewIntervals } = bundleEngine(
    "src/revision/engine/fsrs.ts",
    "unified",
  );
  const invalid = {
    due: now.toISOString(),
    lastReview: null,
    stability: 0,
    difficulty: 9,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    state: "review",
    learningSteps: 0,
  };

  assert.equal(normalizeFsrsScheduling(invalid, now).state, "new");
  const preview = previewIntervals(invalid, 0.9, now);
  assert.deepEqual(Object.keys(preview), ["again", "hard", "good", "easy"]);
  assert.doesNotThrow(() => applyReview({ scheduling: invalid, rating: "good", reviewedAt: now }));
  const reviewed = applyReview({ scheduling: invalid, rating: "good", reviewedAt: now });
  assert.equal(reviewed.before.state, "new");
  assert.ok(reviewed.scheduling.stability > 0);
  assert.ok(reviewed.scheduling.difficulty >= 1 && reviewed.scheduling.difficulty <= 10);
});

test("Recall FSRS preview and review repair imported cards with empty memory", () => {
  const { applyReview, previewIntervals } = bundleEngine(
    "src/revision/recall/services/fsrs-engine.ts",
    "recall",
  );
  const invalid = {
    id: "invalid-memory-card",
    deckId: "deck-1",
    front: "Question",
    back: "Answer",
    hint: "",
    source: "",
    tags: [],
    cardType: "basic",
    state: "review",
    lastReviewDate: null,
    nextReviewDate: now.toISOString(),
    stability: 0,
    difficulty: 9,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    learningSteps: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const preview = previewIntervals(invalid, 0.9, now);
  assert.deepEqual(Object.keys(preview), ["again", "hard", "good", "easy"]);
  assert.doesNotThrow(() => applyReview(invalid, "good", now));
  const reviewed = applyReview(invalid, "good", now);
  assert.ok(reviewed.stability > 0);
  assert.ok(reviewed.difficulty >= 1 && reviewed.difficulty <= 10);
});

test("legacy projection gives every seen item valid non-new FSRS memory", () => {
  const projection = read("src/revision/domain/adapters/legacyProjection.ts");
  assert.match(projection, /const stability = state === "new" \? 0 : Math\.max\(1, item\.successStreak/);
});
