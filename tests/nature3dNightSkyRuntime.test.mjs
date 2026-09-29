// tests/nature3dNightSkyRuntime.test.mjs
//
// RUNTIME verification for the 2026-09-29 sanctuary brief:
//
//   1. "abhi kya hai ki raat nahin hoti hai, raat wala bhi scene design
//      karo" — the clock's night hours render a REAL night (moon, stars
//      driver, deep-blue but readable), reached through continuous twilights.
//   2. "subah ke samay thoda sa smoke … jaise-jaise sun aata hai smoke gayab
//      hone lagte hain … din mein hat jaaye, aur shaam aur raat mein rahe" —
//      the smoke curve, and the live fog ramp it drives.
//   3. "out of the world bhi expand karo … dur pahad bhi dikhte hain bahut
//      dur" — with the reduced daytime smoke the far range (built here, for
//      real) resolves on a clear midday and buries itself in the dawn haze.

import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = mkdtempSync(path.join(tmpdir(), "sanctuary-night-"));
const bundle = path.join(temp, "night.mjs");
buildSync({
  stdin: {
    contents: `
      export * as THREE from "three";
      export { daylightAt, hourForMode, smokeForHour, clampToDaylight, MODE_HOURS, DAY_START, DAY_END } from "./src/nature3d/engine/daylight";
      export { budgetFor } from "./src/nature3d/engine/quality";
      export { createFarRange } from "./src/nature3d/engine/farRange";
    `,
    resolveDir: process.cwd(),
  },
  bundle: true, platform: "node", format: "esm", outfile: bundle, logLevel: "silent",
});
const { THREE, daylightAt, hourForMode, smokeForHour, clampToDaylight, MODE_HOURS, DAY_START, DAY_END, budgetFor, createFarRange } = await import(pathToFileURL(bundle));
rmSync(temp, { recursive: true, force: true });

/** The live fog ramp scene.applyDaylight computes from a state + budget. */
const fogRamp = (hour, tier = "low") => {
  const state = daylightAt(hour);
  const budget = budgetFor(tier);
  const smoke = state.smoke;
  return {
    state,
    near: budget.fogNear * (1.5 - 0.9 * smoke),
    far: budget.fogFar * (1 - 0.58 * smoke),
  };
};

/** Linear-fog factor (the stock three.js smoothstep, before the 0.88 cap). */
const fogFactor = (depth, near, far) => {
  const t = Math.min(Math.max((depth - near) / (far - near), 0), 1);
  return t * t * (3 - 2 * t);
};

test("the real clock runs INTO the night instead of clamping to sunset", () => {
  // 23:30 must stay 23:30 — the old clamp rendered it as the frozen sunset.
  const late = new Date("2026-09-29T23:30:00");
  assert.equal(hourForMode("auto", late), 23.5);
  // 02:00 folds past midnight onto the world timeline (24 + 2).
  const small = new Date("2026-09-29T02:00:00");
  assert.equal(hourForMode("auto", small), 26);
  assert.equal(clampToDaylight(25.5), 25.5);
  assert.equal(clampToDaylight(-1), 23); // 23:00 → 23.0, still night
  // Manual night mode exists at its own hour.
  assert.equal(MODE_HOURS.night, 22.25);
  assert.equal(hourForMode("night"), 22.25);
});

test("night mode renders a moonlit starlit scene, never a black screen", () => {
  const night = daylightAt(MODE_HOURS.night);
  assert.equal(night.night, 1, "deep night");
  assert.equal(night.dayFactor, 0);
  // The moon is UP and is the light: a cool directional "sun".
  assert.ok(night.sunDir.y > 0.2, "the moon must be above the horizon");
  assert.ok(night.sunIntensity > 0.3 && night.sunIntensity < 1.0, "moonlight, not a second noon");
  assert.ok(night.sunColor.b > night.sunColor.r, "moonlight is cool blue");
  // Readable dark blue + green floor (the standing dusk-floor directive).
  // (THREE.Color stores linear values — assert channel RELATIONS, not raws.)
  assert.ok(night.zenith.b > night.zenith.r * 3, "a deep BLUE zenith");
  assert.ok(night.horizon.b > night.horizon.r, "the night horizon is blue, not black-brown");
  assert.ok(night.hemiGround.g > night.hemiGround.r, "the ground bounce stays GREEN");
  assert.ok(night.exposure >= 0.9, "the eye adapts up at night — readable, not black");
});

test("dusk and dawn are continuous blends, never a snap", () => {
  const dusk = daylightAt(19.25); // 45 min past sunset
  assert.ok(dusk.night > 0.05 && dusk.night < 0.75, "twilight is on its way down");
  const deep = daylightAt(22.5);
  const midnight = daylightAt(24 + 0.5);
  assert.equal(deep.night, 1);
  assert.equal(midnight.night, 1, "the small hours are full night");
  const predawn = daylightAt(29.25); // 05:15
  assert.ok(predawn.night > 0.05 && predawn.night < 0.75, "dawn twilight climbs back");
  const sunrise = daylightAt(DAY_START + 0.01);
  assert.equal(sunrise.night, 0, "sunrise is full day");
  // Colours actually travel through the blend.
  assert.ok(!dusk.zenith.equals(deep.zenith), "the dusk sky is not yet the night sky");
});

test("time-of-day smoke: dawn haze burns off, midday is clear, night keeps it", () => {
  const dawn = smokeForHour(6.5);
  const morning9 = smokeForHour(9);
  const lateMorning = smokeForHour(10.75);
  const midday = smokeForHour(MODE_HOURS.midday);
  const evening = smokeForHour(18);
  const night = smokeForHour(MODE_HOURS.night);
  // Subah: thoda sa smoke.
  assert.ok(dawn > 0.6, `dawn haze is thick (${dawn.toFixed(2)})`);
  // Jaise-jaise sun aata hai — gayab hone lagta hai.
  assert.ok(dawn > morning9 && morning9 > lateMorning, "the haze visibly burns off");
  // Din mein hat jaaye.
  assert.ok(midday <= 0.15, `midday is clear air (${midday.toFixed(2)})`);
  // Shaam aur raat mein rahe.
  assert.ok(evening > 0.4, "the evening smoke returns");
  assert.ok(night > 0.6, "the night keeps it");
});

test("the fog ramp buries the far range at dawn and reveals it at midday", () => {
  // The far range sits at budget.farPlane * 0.36 ≈ 2230 m on the low tier.
  const rangeDepth = budgetFor("low").farPlane * 0.36 + 170; // a crest mid-band
  const dawn = fogRamp(6.5);
  const midday = fogRamp(MODE_HOURS.midday);
  // Dawn: the ramp has pulled in — the range is smoky/buried ("subah smoke").
  assert.ok(fogFactor(rangeDepth, dawn.near, dawn.far) > 0.55, "dawn haze covers the far range");
  // Midday: the ramp is out past the range — it resolves ("dur pahad dikhein").
  assert.ok(fogFactor(rangeDepth, midday.near, midday.far) < 0.72, "a clear midday reveals the far range");
  // The near field NEVER smokes up (the density reduction): the meadow,
  // boards and study clearing stay crisp at every hour.
  for (const hour of [6.5, 9, 12.75, 18, 22.25]) {
    const { near } = fogRamp(hour);
    assert.ok(near >= 60, `fogNear ${near.toFixed(0)} at ${hour}h keeps the meadow clear`);
    assert.ok(fogFactor(60, near, fogRamp(hour).far) === 0, "the first 60 m are always crystal clear");
  }
});

test("the reduced smoke budget is a real change on every tier", () => {
  for (const tier of ["low", "medium", "high", "ultra"]) {
    const b = budgetFor(tier);
    assert.equal(b.fogNear, 90, `${tier}: 90 m of guaranteed-clear air`);
    assert.equal(b.fogFar, 4200, `${tier}: the horizon opens from 420 m to 4.2 km`);
  }
});

test("the far range is one static mesh far outside the world, inside the dome", () => {
  const budget = budgetFor("low");
  const range = createFarRange(budget);
  try {
    const mesh = range.group.getObjectByName("far-range-mesh");
    assert.ok(mesh, "one named mesh");
    assert.equal(mesh.geometry.index.count / 3 > 0, true, "indexed geometry");
    const pos = mesh.geometry.attributes.position;
    assert.ok(pos.count > 1000, `a real ring (${pos.count} vertices)`);
    // Sits on the open sea, sunk so no seam with the water.
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    assert.ok(minY < -20, "the base is sunk under the sea surface");
    assert.ok(maxY > 200 && maxY < 520, "the crests clear the horizon line");
    // Far past the fly limit (1180) and the island edge (1440)…
    const radial = Math.hypot(pos.getX(0), pos.getZ(0));
    assert.ok(radial > 1500, `beyond the island edge (${radial.toFixed(0)} m)`);
    // …but inside the sky dome (0.48 × farPlane) so it never clips.
    assert.ok(radial < budget.farPlane * 0.48, "inside the dome");
    // Vertex-painted rock + snow: no texture fetch.
    assert.ok(mesh.geometry.attributes.color, "vertex colours");
  } finally {
    range.dispose();
  }
});
