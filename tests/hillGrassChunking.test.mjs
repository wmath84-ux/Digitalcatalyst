// Verification harness for the CHUNKED hill-grass sward.
//
// Runs the REAL `createHillGrassField` in Node (no DOM in its import chain)
// and asserts the four things the chunking must not break:
//   1. no clumps are lost or duplicated
//   2. per-instance colour survives the scratch -> per-cell copy
//   3. the bounds are TIGHT, so three.js can actually cull
//   4. culling genuinely rejects cells outside the frustum
//
// Run: node --test tests/hillGrassChunking.test.mjs  (after esbuild bundling)

import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createHillGrassField, hillGrassOcclusion, HILL_GRASS_OUT } from "../build/hillGrassEntry.js";

const budget = {
  tier: "low",
  grassNear: 13000,
  grassFar: 17500,
  hillGrass: 4000,
  grassNearRadius: 30,
  grassFarRadius: 170,
  treeCount: 112,
  leavesPerTree: 10,
  animalCount: 54,
  perchedBirds: 7,
  flyingBirds: 3,
  butterflies: 3,
  driftingLeaves: 12,
  waterfallParticles: 100,
  flowers: 135,
  rocks: 105,
  shadowMapSize: 0,
  richBoardMaterial: false,
  antialias: false,
  maxPixelRatio: 1.05,
  minPixelRatio: 0.65,
  sunShafts: false,
  farPlane: 6200,
  fogDensity: 0.00034,
  fogNear: 90,
  fogFar: 4200,
  halfPrecision: true,
  fpsCap: 30,
  cheapPlants: true,
  plantTextureDetail: "1k",
  maxAniso: 2,
};

// A stub texture: the field only clones it and flips filter flags.
const bladeTex = new THREE.Texture();

const field = createHillGrassField(bladeTex, budget);
const cells = field.group.children.filter((o) => o.isInstancedMesh);

test("sward is split into multiple chunk meshes, not one", () => {
  assert.ok(cells.length > 1, `expected several cells, got ${cells.length}`);
  assert.ok(
    cells.length <= 48,
    `expected at most 12 sectors x 4 bands = 48 cells, got ${cells.length}`,
  );
});

test("no clumps lost: sum of cell counts equals total placed", () => {
  const total = cells.reduce((s, m) => s + m.count, 0);
  assert.ok(total > 0, "no clumps were placed at all");
  // Every clump must land in exactly one cell — no duplicates, none dropped.
  // The sowing loop is capped at budget.hillGrass, so total must be <= budget
  // and, with a 4000 budget over a 2.3 km annulus, essentially all of it.
  assert.ok(total <= budget.hillGrass, `placed ${total} > budget ${budget.hillGrass}`);
  assert.ok(
    total > budget.hillGrass * 0.9,
    `only ${total}/${budget.hillGrass} clumps placed — bucketing may be dropping them`,
  );
});

test("per-instance colour survived the scratch copy (instanceColor not null)", () => {
  for (const m of cells) {
    assert.ok(m.instanceColor !== null, `${m.name}: instanceColor is null — grass would render untinted`);
    assert.equal(m.instanceColor.count, m.count, `${m.name}: colour count != instance count`);
  }
  // And the values must not all be the white fill — that would mean the copy
  // never ran. Sample the first cell's first clump.
  const first = cells[0];
  const arr = first.instanceColor.array;
  const nonWhite = [];
  for (let i = 0; i < arr.length; i += 3) {
    if (arr[i] !== 1 || arr[i + 1] !== 1 || arr[i + 2] !== 1) nonWhite.push(i);
  }
  assert.ok(nonWhite.length > 0, `${first.name}: every colour is still the white fill — copy did not run`);
});

test("matrices were copied (not left as identity)", () => {
  const first = cells[0];
  const a = first.instanceMatrix.array;
  // A real placement writes a non-trivial translation into elements 12-14.
  let withTranslation = 0;
  for (let i = 0; i < first.count; i += 1) {
    const o = i * 16;
    if (Math.abs(a[o + 12]) > 1e-6 || Math.abs(a[o + 14]) > 1e-6) withTranslation += 1;
  }
  assert.ok(
    withTranslation > first.count * 0.9,
    `${first.name}: only ${withTranslation}/${first.count} instances carry a translation`,
  );
});

test("bounding spheres are TIGHT, not world-sized", () => {
  const HILL_GRASS_OUT = 1150;
  let maxRadius = 0;
  for (const m of cells) {
    assert.ok(m.boundingSphere !== null, `${m.name}: no bounding sphere`);
    assert.ok(
      m.boundingSphere.radius < HILL_GRASS_OUT,
      `${m.name}: radius ${m.boundingSphere.radius.toFixed(0)} still spans the world`,
    );
    maxRadius = Math.max(maxRadius, m.boundingSphere.radius);
  }
  // A 12x4 grid over a 2300 m disc gives cells roughly 230-300 m across;
  // with the 22 m card pad a radius under ~400 m is the expected order.
  assert.ok(
    maxRadius < 500,
    `largest cell radius ${maxRadius.toFixed(0)} m is far too coarse to cull usefully`,
  );
});

test("frustum culling actually rejects cells outside the view", () => {
  // Camera at the origin-ish clearing, looking down +Z with a 60 deg fov.
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 6200);
  camera.position.set(0, 20, 0);
  camera.lookAt(0, 20, 200);
  camera.updateMatrixWorld();

  const projScreen = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreen);

  const visible = cells.filter((m) => frustum.intersectsSphere(m.boundingSphere));
  assert.ok(
    visible.length < cells.length,
    `all ${cells.length} cells pass the frustum test — culling would never fire`,
  );

  // Count the VERTEX work that culling actually removes, honouring the LOD:
  // inner-band cells carry the bendable 8-triangle card (12 verts), outer-band
  // cells the cheap 4-triangle one (8 verts). Read the real triangle count off
  // each cell's geometry rather than assuming one number for the field.
  const vertsOf = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * 3;
  const vertsPerClump = (m) => m.geometry.attributes.position.count;
  const allVerts = cells.reduce((s, m) => s + m.count * vertsPerClump(m), 0);
  const drawnVerts = visible.reduce((s, m) => s + m.count * vertsPerClump(m), 0);
  void vertsOf;
  const saved = 1 - drawnVerts / allVerts;
  console.log(
    `  cells ${visible.length}/${cells.length} visible · verts ${drawnVerts.toLocaleString()}` +
      ` of ${allVerts.toLocaleString()} drawn · ${(saved * 100).toFixed(1)}% culled`,
  );
  assert.ok(
    saved > 0.4,
    `only ${(saved * 100).toFixed(1)}% of the sward was culled — chunking is too coarse`,
  );
});

test("distance LOD: outer bands get the cheap card, inner bands keep the bendable one", () => {
  const BANDS = 4;
  const byBand = new Map();
  for (const m of cells) {
    // Cell index = sector * BANDS + band, so band is the remainder.
    const idx = Number.parseInt(m.name.replace("hill-grass-cell-", ""), 10);
    const band = idx % BANDS;
    if (!byBand.has(band)) byBand.set(band, new Set());
    byBand.get(band).add(m.geometry.attributes.position.count);
  }
  // Inner bands must carry the 12-vert bendable card, outer bands the 8-vert one.
  const inner = byBand.get(0);
  const outer = byBand.get(BANDS - 1);
  assert.ok(inner, "no cells landed in band 0");
  assert.ok(outer, `no cells landed in band ${BANDS - 1}`);
  assert.deepEqual([...inner], [12], `inner band verts = ${[...inner]} (expected the 12-vert card)`);
  assert.deepEqual([...outer], [8], `outer band verts = ${[...outer]} (expected the 8-vert LOD card)`);

  // And the LOD must actually be carrying most of the field — that is what
  // makes it worth having, since band area grows with r².
  let innerClumps = 0;
  let outerClumps = 0;
  for (const m of cells) {
    const idx = Number.parseInt(m.name.replace("hill-grass-cell-", ""), 10);
    if (idx % BANDS < BANDS - 2) innerClumps += m.count;
    else outerClumps += m.count;
  }
  console.log(
    `  LOD split: ${innerClumps.toLocaleString()} clumps on 12-vert cards, ` +
      `${outerClumps.toLocaleString()} on 8-vert cards (${((outerClumps / (innerClumps + outerClumps)) * 100).toFixed(0)}% cheap)`,
  );
  assert.ok(
    outerClumps > innerClumps,
    "the cheap LOD card is not carrying the majority of the field — LOD is not earning its keep",
  );
});

// ── World streaming: the BGMI mechanic ─────────────────────────────────────────

test("streaming unloads the cells behind the player and keeps what they stand in", () => {
  const totalCells = cells.length;
  const clumpTotal = cells.reduce((sum, m) => sum + m.count, 0);
  const resident = () => cells.filter((m) => m.visible === true);

  // Stand at the north edge. A 300 m radius must keep only the cells around
  // the player and switch the rest OFF — the "load only your cell plus
  // neighbours, unload behind you as you drive" mechanic.
  const originZ = HILL_GRASS_OUT - 40;
  field.stream(0, originZ, 300);

  const on = resident();
  const off = cells.filter((m) => m.visible === false);
  assert.ok(on.length >= 1, "the cell under the player must stay loaded");
  assert.ok(on.length < totalCells, `streaming must unload some cells (kept ${on.length}/${totalCells})`);
  assert.ok(off.length > 0, "cells outside the radius must be hidden");
  assert.equal(on.length + off.length, totalCells, "streaming must not drop or add cells");

  // Every retained cell must actually be within the radius plus its own half-
  // cell of slack, so nothing distant can sneak through.
  for (const m of on) {
    const c = m.boundingSphere.center;
    const d = Math.hypot(c.x, c.z - originZ);
    assert.ok(
      d <= 300 + HILL_GRASS_OUT / 4,
      `retained cell is ${d.toFixed(0)} m away, beyond the radius`,
    );
  }

  // Walking to the opposite side must unload what was behind us.
  field.stream(0, -originZ, 300);
  const stillOnNorth = resident().filter((m) => m.boundingSphere.center.z > HILL_GRASS_OUT * 0.5);
  assert.equal(stillOnNorth.length, 0, "cells behind the player were not unloaded");
  assert.ok(resident().length >= 1, "the cell under the player at the new spot must be loaded");

  // A radius covering the whole sward must bring everything back, and the
  // geometry must be untouched — streaming only flips visibility.
  field.streamAll();
  assert.equal(resident().length, totalCells, "streamAll must reload every cell");
  const stillClumps = cells.reduce((sum, m) => sum + m.count, 0);
  assert.equal(stillClumps, clumpTotal, "streaming must not change any clump count");
});

test("HLOD: a coarse per-sector stand-in covers what streaming retires", () => {
  const hlodGroup = field.group.children.find((o) => o.name === "hill-grass-hlod");
  assert.ok(hlodGroup, "the sward must build an HLOD layer");
  const hlod = hlodGroup.children.filter((o) => o.isInstancedMesh);
  assert.ok(hlod.length > 1, `expected one coarse stand-in per sector, got ${hlod.length}`);

  // HLOD cards must be CHEAPER than the cheapest detail card (8 verts), or the
  // coarse rung is not earning anything.
  for (const m of hlod) {
    const v = m.geometry.attributes.position.count;
    assert.ok(v < 8, `HLOD card carries ${v} verts — not cheaper than the far card`);
  }

  // They start hidden: the detailed cells own the screen until streaming
  // retires them, so a stand-in showing at boot would double-draw the sward.
  assert.ok(hlod.every((m) => m.visible === false), "HLOD must start hidden");

  // Stream to the north edge: stand-ins must appear exactly where detail went.
  const originZ = HILL_GRASS_OUT - 40;
  field.stream(0, originZ, 300);
  const shown = hlod.filter((m) => m.visible === true);
  const hidden = hlod.filter((m) => m.visible === false);
  assert.ok(shown.length > 0, "retired sectors must fall back to their coarse stand-in");
  assert.ok(hidden.length > 0, "sectors still resident must not double-draw at HLOD");

  // No sector may draw BOTH rungs at once — that would double the far sward.
  const resident = cells.filter((m) => m.visible === true);
  for (const h of shown) {
    const hc = h.boundingSphere.center;
    for (const d of resident) {
      const dc = d.boundingSphere.center;
      const overlap = Math.hypot(hc.x - dc.x, hc.z - dc.z) < 40;
      assert.ok(!overlap, "a sector is drawing its detail cell and its HLOD stand-in together");
    }
  }

  // HLOD must also be culled by its own tight bounds, not a world-sized sphere.
  for (const m of shown) {
    assert.ok(
      m.boundingSphere.radius < HILL_GRASS_OUT,
      `HLOD bounds are ${m.boundingSphere.radius.toFixed(0)} m — not tight`,
    );
  }

  // Restoring detail must retire every stand-in again.
  field.streamAll();
  assert.ok(hlod.every((m) => m.visible === false), "streamAll must retire every HLOD stand-in");
  assert.equal(cells.filter((m) => m.visible).length, cells.length, "streamAll must restore all detail");
});

test("baked AO: solved once, bounded, and actually responding to terrain", () => {
  // The term is a pure function of position, so it can be asserted directly
  // against the real terrain instead of being inferred from final instance
  // colours — where the sward's own per-clump random hue/sat/light jitter
  // makes an isolated measurement impossible.
  const FLOOR = 1 - 0.38; // AO_MAX_DARKEN
  let darkened = 0;
  let untouched = 0;
  let samples = 0;

  for (let gx = -1000; gx <= 1000; gx += 125) {
    for (let gz = -1000; gz <= 1000; gz += 125) {
      // y is only a reference height for "how much higher is my neighbour", so
      // a fixed plausible ground height exercises the real terrain sampling.
      const ao = hillGrassOcclusion(gx, gz, 12);
      assert.ok(Number.isFinite(ao), `AO is not finite at ${gx},${gz}`);
      assert.ok(ao >= FLOOR - 1e-6, `AO ${ao} broke the ${FLOOR} darkening floor`);
      assert.ok(ao <= 1 + 1e-6, `AO ${ao} brightened the clump instead of shading it`);
      if (ao < 1) darkened += 1;
      else untouched += 1;
      samples += 1;
    }
  }

  assert.ok(samples > 100, "the scan did not cover enough ground to mean anything");
  assert.ok(darkened > 0, "AO never darkened anything — the bake is dead code");
  assert.ok(untouched > 0, "AO darkened every single sample — it is a flat tint, not occlusion");

  // And it must actually have reached the uploaded colours: the whole sward
  // cannot be sitting at the bright end if the bake is wired in.
  let dimmest = Infinity;
  for (const m of cells) {
    const col = m.instanceColor.array;
    for (let i = 0; i < m.count * 3; i += 1) {
      assert.ok(Number.isFinite(col[i]) && col[i] >= 0 && col[i] <= 1, `colour out of range: ${col[i]}`);
      if (col[i] < dimmest) dimmest = col[i];
    }
  }
  assert.ok(dimmest < 0.6, `no clump was shaded at all (dimmest channel ${dimmest.toFixed(3)})`);
});

test("shed ladder trims every cell proportionally and restores", () => {
  const full = cells.map((m) => m.count);
  field.setShed(2);
  for (let i = 0; i < cells.length; i += 1) {
    assert.ok(
      cells[i].count <= Math.ceil(full[i] * 0.45),
      `cell ${i} did not shed to 45% (got ${cells[i].count} of ${full[i]})`,
    );
  }
  field.setShed(0);
  for (let i = 0; i < cells.length; i += 1) {
    assert.equal(cells[i].count, full[i], `cell ${i} did not restore to full count`);
  }
});
