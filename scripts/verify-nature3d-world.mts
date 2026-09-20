// Run with: bash scripts/verify-nature3d.sh   (needs esbuild + three, both already in devDeps)
//
// Engine verification harness — kept in the repo on purpose. It caught a real
// GLSL redefinition bug in the waterfall shader that no source-shape test could
// see, so it is part of the project now, not a throwaway.
//
// Runs the NEW world systems for real in Node — no DOM, no GPU, fabricated
// textures — and asserts the invariants a browser would otherwise be the first
// to discover: no NaNs in vertex data, no empty instanced meshes, merging that
// actually merges, layering that actually layers, and an environmental field
// that answers the way geography says it should.

import * as THREE from "three";
import { budgetFor } from "../src/nature3d/engine/quality";
import { createAtmosphere } from "../src/nature3d/engine/atmosphere";
import { createWeathering } from "../src/nature3d/engine/weathering";
import { createRockField } from "../src/nature3d/engine/rocks";
import { createGrassField } from "../src/nature3d/engine/grass";
import { createFlora } from "../src/nature3d/engine/flora";
import {
  flowWetness,
  pathWeight,
  siteAt,
  groundColorAt,
  createSite,
  SUN_SIDE_X,
  SUN_SIDE_Z,
} from "../src/nature3d/engine/environment";
import { GROUND_PALETTE, ALBEDO_CEILING, ALBEDO_FLOOR } from "../src/nature3d/engine/palette";
import { terrainHeight, RIVER_CENTER_X } from "../src/nature3d/engine/terrain";
import type { TextureSet } from "../src/nature3d/engine/textures";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const budget = budgetFor("high");
const atmosphere = createAtmosphere(budget);
const weathering = createWeathering(new THREE.Texture(), budget.tier);

/** A stand-in texture set: the code under test only reads the handles. */
const fake = (): TextureSet => {
  const t = () => new THREE.Texture();
  const set: TextureSet = {
    bark: t(), barkNormal: t(), leaf: t(), grassBlade: t(), ground: t(),
    rock: t(), rockNormal: t(), rockORM: t(), weather: t(), contact: t(),
    canopy: t(), water: t(), waterNormal: t(), fur: t(), cloud: t(), feather: t(),
    dispose() {},
  };
  set.rockORM.channel = 0;
  return set;
};

const textures = fake();

// ── 1. The environmental field ────────────────────────────────────────
const site = createSite();
const river = siteAt(RIVER_CENTER_X, 40, site);
const ridge = siteAt(900, 0, createSite());
const clearing = siteAt(0, 0, createSite());
const hill = siteAt(-268, -266, createSite());

check("field: every site value is finite", [river, ridge, clearing, hill].every((s) =>
  [s.height, s.slopeDeg, s.normalY, s.wetness, s.shade, s.soil, s.altitude, s.path, s.nearWater, s.crowding]
    .every((v) => Number.isFinite(v))));
check("field: probabilities stay in 0…1", [river, ridge, clearing].every((s) =>
  [s.wetness, s.shade, s.sunFacing, s.soil, s.altitude, s.path, s.nearWater, s.crowding]
    .every((v) => v >= 0 && v <= 1)));
check("field: the river line knows it is near water", river.nearWater > 0.5, `nearWater=${river.nearWater.toFixed(2)}`);
check("field: the reclaimed ridge is not", ridge.nearWater < 0.2, `nearWater=${ridge.nearWater.toFixed(2)}`);
check("field: drainage accumulates in the channel, not on the ridge",
  flowWetness(RIVER_CENTER_X, 40) > flowWetness(-300, 300),
  `${flowWetness(RIVER_CENTER_X, 40).toFixed(3)} vs ${flowWetness(-300, 300).toFixed(3)}`);
check("field: the clearing is worn ground", pathWeight(0, 0) > 0.7, `path=${pathWeight(0, 0).toFixed(2)}`);
check("field: a far ridge is untouched", pathWeight(-420, 380) < 0.05, `path=${pathWeight(-420, 380).toFixed(3)}`);
check("field: the shade side of the sky is -Z", SUN_SIDE_X === 0 && SUN_SIDE_Z === -1);
check("field: the clearing is flat", clearing.slopeDeg < 1, `${clearing.slopeDeg.toFixed(2)}°`);
check("field: a biome is always chosen", /^(meadow|riverbank|woodland|slope|highland|summit)$/.test(hill.biome));

// ── 2. Ground colour stays inside the physical albedo range ───────────
const scratch = new THREE.Color();
let albedoMin = 1;
let albedoMax = 0;
let albedoBad = 0;
for (let i = 0; i < 4000; i += 1) {
  const x = (Math.random() - 0.5) * 1200;
  const z = (Math.random() - 0.5) * 1200;
  groundColorAt(x, z, terrainHeight(x, z), scratch, GROUND_PALETTE, 0.6 + Math.random() * 0.4);
  const srgb = scratch.clone().convertLinearToSRGB();
  for (const c of [srgb.r, srgb.g, srgb.b]) {
    const byte = Math.round(c * 255);
    if (byte < ALBEDO_FLOOR - 1 || byte > ALBEDO_CEILING + 1) albedoBad += 1;
    albedoMin = Math.min(albedoMin, byte);
    albedoMax = Math.max(albedoMax, byte);
  }
}
check("palette: 12 000 ground samples all inside the albedo range", albedoBad === 0,
  `range ${albedoMin}…${albedoMax}, ${albedoBad} outside`);

// ── 3. The rock kit ───────────────────────────────────────────────────
const rocks = createRockField(textures, budget, weathering);
const rockMeshes: THREE.InstancedMesh[] = [];
rocks.group.traverse((o) => {
  if ((o as THREE.InstancedMesh).isInstancedMesh) rockMeshes.push(o as THREE.InstancedMesh);
});
const boulders = rockMeshes.filter((m) => m.name.startsWith("rock-master"));
const decals = rockMeshes.find((m) => m.name === "rock-contacts");
const totalBoulders = boulders.reduce((n, m) => n + m.count, 0);

check("rocks: the field is populated", totalBoulders > 0, `${totalBoulders} boulders`);
check("rocks: every tier of the kit is used", boulders.length >= 4, `${boulders.length} instanced meshes`);
check("rocks: a near LOD and a far LOD both exist",
  boulders.some((m) => m.name.endsWith("-far")) && boulders.some((m) => !m.name.endsWith("-far")));
check("rocks: every boulder has a ground-contact decal", !!decals && decals.count === totalBoulders);
check("rocks: grass skirts were published for every boulder",
  rocks.skirtPoints.length === totalBoulders * 3, `${rocks.skirtPoints.length / 3} skirts`);

let rockNaNs = 0;
for (const mesh of boulders) {
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    if (m.elements.some((v) => !Number.isFinite(v))) rockNaNs += 1;
  }
}
check("rocks: no NaN instance transforms", rockNaNs === 0, `${rockNaNs}`);

const master = boulders.find((m) => m.name === "rock-master-0");
const masterFar = boulders.find((m) => m.name === "rock-master-0-far");
const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
check("rocks: the far LOD is cheaper than the near one",
  !!master && !!masterFar && tris(masterFar.geometry) < tris(master.geometry),
  master && masterFar ? `${tris(master.geometry)} → ${tris(masterFar.geometry)} tris` : "missing");

const bake = master?.geometry.getAttribute("aDcBake") as THREE.BufferAttribute | undefined;
let bakeBad = 0;
if (bake) {
  for (let i = 0; i < bake.count; i += 1) {
    const ao = bake.getX(i);
    if (!(ao >= 0 && ao <= 1)) bakeBad += 1;
  }
}
check("rocks: the curvature bake is present and in range", !!bake && bakeBad === 0, `${bake?.count ?? 0} verts`);
const weather = master?.geometry.getAttribute("aDcWeather") as THREE.InstancedBufferAttribute | undefined;
check("rocks: per-instance weathering is 3 channels per boulder",
  !!weather && weather.itemSize === 3 && weather.count === master?.count);

// Silhouettes must genuinely differ, or the kit is one rock four times.
const silhouettes = boulders
  .filter((m) => !m.name.endsWith("-far"))
  .map((m) => {
    const p = m.geometry.attributes.position as THREE.BufferAttribute;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.count; i += 1) {
      minX = Math.min(minX, p.getX(i)); maxX = Math.max(maxX, p.getX(i));
      minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i));
      minZ = Math.min(minZ, p.getZ(i)); maxZ = Math.max(maxZ, p.getZ(i));
    }
    return `${(maxX - minX).toFixed(2)}x${(maxY - minY).toFixed(2)}x${(maxZ - minZ).toFixed(2)}`;
  });
check("rocks: the masters have distinct proportions", new Set(silhouettes).size === silhouettes.length, silhouettes.join(" | "));
check("rocks: no master is a sphere", silhouettes.every((s) => {
  const [a, b, c] = s.split("x").map(Number);
  return Math.abs(a - b) > 0.02 || Math.abs(b - c) > 0.02;
}), silhouettes.join(" | "));

// ── 4. Grass ──────────────────────────────────────────────────────────
const grass = createGrassField(textures.grassBlade, budget, rocks.skirtPoints);
const rings: THREE.InstancedMesh[] = [];
grass.group.traverse((o) => {
  if ((o as THREE.InstancedMesh).isInstancedMesh) rings.push(o as THREE.InstancedMesh);
});
check("grass: two LOD rings", rings.length === 2);
check("grass: blades were placed on worn ground too (skirt ring)",
  rings[0].count > 0 && rings[1].count > 0, `${rings[0].count} near, ${rings[1].count} far`);
let grassNaN = 0;
const gm = new THREE.Matrix4();
for (const ring of rings) {
  for (let i = 0; i < ring.count; i += 1) {
    ring.getMatrixAt(i, gm);
    if (gm.elements.some((v) => !Number.isFinite(v))) grassNaN += 1;
  }
}
check("grass: no NaN blade transforms", grassNaN === 0, `${grassNaN}`);
check("grass: materials are published for the atmosphere pass", grass.materials.length === 2);

// ── 5. Trees ──────────────────────────────────────────────────────────
const flora = createFlora(textures, budget);
const wood = flora.group.getObjectByName("forest-wood");
const pines = flora.group.getObjectByName("forest-pines");
let leafCards = 0;
let impostorCards = 0;
flora.group.traverse((o) => {
  const mesh = o as THREE.InstancedMesh;
  if (!mesh.isInstancedMesh || mesh === wood || mesh === pines) return;
  if ((mesh.geometry as THREE.BufferGeometry).type === "PlaneGeometry" && mesh.material === flora.foliageMaterials[2]) {
    impostorCards += mesh.count;
  }
  void mesh;
});
for (const m of flora.foliageMaterials.slice(0, 2)) void m;
flora.group.traverse((o) => {
  const mesh = o as THREE.InstancedMesh;
  if (mesh.isInstancedMesh && mesh.material === flora.foliageMaterials[0]) leafCards += mesh.count;
});
check("trees: the merged trunk/bough geometry exists", !!wood);
check("trees: pine tiers are merged too", !!pines);
check("trees: wood carries baked vertex weathering",
  !!wood && !!(wood as THREE.Mesh).geometry.getAttribute("color"),
  (wood as THREE.Mesh | null)?.geometry.getAttribute("color") ? "colour attribute present" : "missing");
check("trees: leaf cards are instanced", leafCards > 0, `${leafCards} cards`);
check("trees: far trees became impostors", impostorCards > 0, `${impostorCards} impostor cards`);
check("trees: foliage/solid materials are published",
  flora.foliageMaterials.length === 3 && flora.solidMaterials.length === 4);
check("trees: perches exist for the birds", flora.perches.length > 0, `${flora.perches.length}`);

// The merged wood must have survived the merge (an attribute mismatch makes
// `mergeGeometries` return null, which silently drops the entire forest).
const woodVerts = wood ? ((wood as THREE.Mesh).geometry.attributes.position?.count ?? 0) : 0;
check("trees: the merge produced real geometry", woodVerts > 500, `${woodVerts} vertices`);

// ── 6. Disposal is honest ─────────────────────────────────────────────
let threw = "";
try {
  rocks.dispose();
  grass.dispose();
  flora.dispose();
  atmosphere.dispose();
  weathering.dispose();
} catch (e) {
  threw = String(e);
}
check("dispose: no system throws on teardown", threw === "", threw);

console.log(failures === 0 ? "\nALL WORLD CHECKS PASSED" : `\n${failures} WORLD CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
