// Verification harness for the DYNAMIC FRAME CADENCE.
//
// The low tier used to hard-cap at 30 fps, which made 60 architecturally
// impossible. It now starts at 60 and only settles to the tier's fallback
// after sustained overruns, climbing back when headroom returns.
//
// Run: node --test tests/adaptiveCadence.test.mjs  (after esbuild bundling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { AdaptiveResolution } from "../build/qualityEntry.js";

const lowTier = {
  tier: "low",
  maxPixelRatio: 1.05,
  minPixelRatio: 0.65,
  fpsCap: 30,
};

const desktopTier = { ...lowTier, fpsCap: 0 };

/** Feed n windows of 36 frames each at a fixed per-frame time. */
function feed(scaler, frameMs, windows = 1) {
  for (let w = 0; w < windows; w += 1) {
    for (let i = 0; i < 36; i += 1) {
      // `now` advances ~frameMs per frame; keep it past the 900 ms rate limit
      // so resolution changes are not what we are measuring here.
      scaler.sample(frameMs, w * 36 * frameMs + i * frameMs + 10_000, frameMs);
    }
  }
}

test("starts at 60 fps on a capped (mobile) tier, not at the 30 fallback", () => {
  const s = new AdaptiveResolution(lowTier, 1.05);
  assert.equal(s.cadence, 60, "a phone must be ALLOWED to run at 60");
  assert.equal(s.paceIntervalMs, 1000 / 60);
});

test("holds 60 while frames are comfortably fast", () => {
  const s = new AdaptiveResolution(lowTier, 1.05);
  feed(s, 12, 4); // 12 ms/frame ≈ 83 fps of production headroom
  assert.equal(s.cadence, 60, `dropped to ${s.cadence} despite fast frames`);
});

test("falls back to 30 after two sustained slow windows", () => {
  const s = new AdaptiveResolution(lowTier, 1.05);
  feed(s, 26, 1); // 26 ms ≈ 38 fps — over the 20.8 ms downgrade threshold
  assert.equal(s.cadence, 60, "downgraded after a single window (needs two)");
  feed(s, 26, 1);
  assert.equal(s.cadence, 30, `did not settle to the fallback cadence (got ${s.cadence})`);
  assert.equal(s.paceIntervalMs, 1000 / 30);
});

test("climbs back to 60 once production time has real headroom", () => {
  const s = new AdaptiveResolution(lowTier, 1.05);
  feed(s, 26, 2);
  assert.equal(s.cadence, 30, "precondition: should have settled to 30");
  feed(s, 13, 1);
  assert.equal(s.cadence, 30, "upgraded after a single fast window (needs two)");
  feed(s, 13, 1);
  assert.equal(s.cadence, 60, `did not climb back to 60 (got ${s.cadence})`);
});

test("does not oscillate: a borderline frame time keeps the cadence steady", () => {
  const s = new AdaptiveResolution(lowTier, 1.05);
  // 19 ms sits between the upgrade threshold (18.3) and the downgrade one
  // (20.8) — exactly the band where hysteresis must hold still.
  feed(s, 19, 6);
  assert.equal(s.cadence, 60, `borderline frames moved the cadence to ${s.cadence}`);
});

test("desktop (uncapped) tier is never paced — behaviour unchanged", () => {
  const s = new AdaptiveResolution(desktopTier, 1);
  assert.equal(s.cadence, 0, "desktop must stay uncapped");
  assert.equal(s.paceIntervalMs, 0, "paceIntervalMs must be 0 so the loop never skips a tick");
  feed(s, 40, 4); // even a slow desktop frame must not introduce pacing
  assert.equal(s.cadence, 0, "desktop cadence changed under load");
  assert.equal(s.paceIntervalMs, 0);
});
