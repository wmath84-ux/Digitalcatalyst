// Verifies the BAKED canopy occlusion actually reaches the terrain's vertex
// colours. Runs the real buildTerrain + canopyShadowDiscs in Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const CACHE = path.join(ROOT, "node_modules/.cache/nature3d-ao");
fs.mkdirSync(CACHE, { recursive: true });
buildSync({
  stdin: { resolveDir: ROOT, loader: "ts", contents: `
import * as THREE from "three";
import { buildTerrain } from "./src/nature3d/engine/terrain";
import { canopyShadowDiscs } from "./src/nature3d/engine/flora";
export { THREE, buildTerrain, canopyShadowDiscs };
` },
  outfile: path.join(CACHE, "fixture.cjs"), bundle: true, format: "cjs", platform: "node", logLevel: "silent",
});
const fx = require(path.join(CACHE, "fixture.cjs"));
const { THREE, buildTerrain, canopyShadowDiscs } = fx;

const budget = { shadowMapSize: 0, terrainSegments: 96, halfPrecision: false, maxPixelRatio: 1, groundTextureSize: 256 };
const tex = new THREE.Texture();

test("canopyShadowDiscs returns real, sized discs", () => {
  const discs = canopyShadowDiscs(112);
  assert.ok(discs.length > 0, "no tree discs produced — nothing would be baked");
  for (const d of discs) {
    assert.ok(Number.isFinite(d.x) && Number.isFinite(d.z), "disc position is not finite");
    assert.ok(d.r > 0.5 && d.r < 40, `implausible shadow radius ${d.r}`);
  }
});

test("terrain bakes a measurable shadow under every canopy disc", () => {
  const discs = canopyShadowDiscs(112);
  const withAO = buildTerrain(budget, tex, discs);
  const without = buildTerrain(budget, tex, []);

  const collect = (group) => {
    let mesh = null;
    group.traverse((o) => { if (!mesh && o.isMesh && o.geometry?.attributes?.color) mesh = o; });
    assert.ok(mesh, "terrain mesh with vertex colours not found");
    const pos = mesh.geometry.attributes.position;
    const col = mesh.geometry.attributes.color;
    return { pos, col };
  };
  const a = collect(withAO);
  const b = collect(without);
  assert.equal(a.pos.count, b.pos.count, "the two builds must have identical vertex counts");

  // Build a lookup so the two meshes can be compared vertex-for-vertex.
  const lum = (c, i) => (c.getX(i) + c.getY(i) + c.getZ(i)) / 3;

  let darkened = 0;
  let brightest = 0;
  for (let i = 0; i < a.pos.count; i += 1) {
    const d = lum(a.col, i) - lum(b.col, i);
    if (d < -1e-4) darkened += 1;
    if (-d > brightest) brightest = -d;
  }
  assert.ok(darkened > 0, "no vertex was darkened — the baked AO is dead code");
  assert.ok(brightest > 0.02, `strongest darkening is only ${brightest.toFixed(4)} — invisible`);

  // And it must be LOCALISED: most of the island is open sky and must be
  // untouched, or this is a global tint rather than a shadow.
  const frac = darkened / a.pos.count;
  assert.ok(frac < 0.35, `${(frac * 100).toFixed(0)}% of the island is shaded — that is a tint, not tree shadow`);
});

test("a vertex directly under a trunk is darker than one in the open", () => {
  const discs = canopyShadowDiscs(112);
  const group = buildTerrain(budget, tex, discs);

  // The terrain is several radial LOD shells: the dense one covers only a small
  // radius around the origin, so a single tree's disc can fall entirely outside
  // it. Gather EVERY coloured vertex from EVERY shell and search that.
  const xs = [];
  const zs = [];
  const ls = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.color) return;
    const pos = o.geometry.attributes.position;
    const col = o.geometry.attributes.color;
    for (let i = 0; i < pos.count; i += 1) {
      xs.push(pos.getX(i));
      zs.push(pos.getZ(i));
      ls.push((col.getX(i) + col.getY(i) + col.getZ(i)) / 3);
    }
  });
  assert.ok(xs.length > 1000, `only ${xs.length} coloured vertices — nothing to sample`);

  const nearest = (tx, tz) => {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < xs.length; i += 1) {
      const d = (xs[i] - tx) ** 2 + (zs[i] - tz) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, dist: Math.sqrt(bd) };
  };

  // A reference point well clear of every disc.
  let open = null;
  for (let gx = -400; gx <= 400 && !open; gx += 7) {
    for (let gz = -400; gz <= 400; gz += 7) {
      if (discs.every((d) => Math.hypot(gx - d.x, gz - d.z) > d.r * 2.2)) { open = { x: gx, z: gz }; break; }
    }
  }
  assert.ok(open, "could not find an unshaded reference point");

  // Terrain shells are coarse far out, so the vertex nearest a given trunk can
  // land just outside its disc — where nothing is baked. Pick a disc that
  // actually HAS a vertex well inside it, rather than insisting on the first.
  let shadeV = null;
  let chosen = null;
  for (const d of discs) {
    const v = nearest(d.x, d.z);
    if (v.dist < d.r * 0.6) { shadeV = v; chosen = d; break; }
  }
  assert.ok(shadeV, "no canopy disc contains a terrain vertex — the bake cannot be sampled");

  const openV = nearest(open.x, open.z);
  assert.ok(openV.dist < 40, `open-ground sample is ${openV.dist.toFixed(1)} m from its target`);

  assert.ok(
    ls[shadeV.i] < ls[openV.i],
    `under-canopy ${ls[shadeV.i].toFixed(3)} (disc r=${chosen.r.toFixed(1)}) is not darker than open ground ${ls[openV.i].toFixed(3)}`,
  );
});
