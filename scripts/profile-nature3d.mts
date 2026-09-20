// Run with: npx esbuild scripts/profile-nature3d.mts --bundle --format=esm --platform=node --outfile=/tmp/profile-nature3d.mjs && node /tmp/profile-nature3d.mjs [tier]
//
// Static performance census of the Sanctuary world (audit §5, Phase 25/26).
// No GPU needed: it builds every system exactly as NatureScene does and
// counts what the GPU would have to chew — draw calls, triangles, instances,
// materials, and texture memory. This is the "before/after" evidence for the
// transformation's perf tables; raster/fragment costs are noted qualitatively
// (fill-heavy systems are flagged, since they cannot be measured here).

import * as THREE from "three";
import { budgetFor, type QualityTier } from "../src/nature3d/engine/quality";
import { createAtmosphere } from "../src/nature3d/engine/atmosphere";
import { createWeathering } from "../src/nature3d/engine/weathering";
import { createRockField } from "../src/nature3d/engine/rocks";
import { createGrassField } from "../src/nature3d/engine/grass";
import { createFlora } from "../src/nature3d/engine/flora";
import { createWater } from "../src/nature3d/engine/water";
import { createStructures } from "../src/nature3d/engine/structures";
import { createSky } from "../src/nature3d/engine/sky";
import { buildTerrain } from "../src/nature3d/engine/terrain";
import type { TextureSet } from "../src/nature3d/engine/textures";

const tier = (process.argv[2] ?? "high") as QualityTier;
const budget = budgetFor(tier);

const fake = (): TextureSet => {
  const t = () => new THREE.Texture();
  const set: TextureSet = {
    bark: t(), barkNormal: t(), leaf: t(), grassBlade: t(), ground: t(),
    rock: t(), rockNormal: t(), rockORM: t(), weather: t(), contact: t(),
    canopy: t(), frond: t(), palmBark: t(), palmCanopy: t(),
    water: t(), waterNormal: t(), fur: t(), cloud: t(), feather: t(),
    dispose() {},
  };
  set.rockORM.channel = 0;
  return set;
};

interface Row {
  system: string;
  meshes: number;
  draws: number;      // worst-case on-screen draws (instanced = 1 per mesh)
  tris: number;       // indexed triangles actually referenced
  instances: number;
  materials: number;
  note: string;
}

const rows: Row[] = [];
function census(name: string, root: THREE.Object3D, note = "") {
  let meshes = 0;
  let draws = 0;
  let tris = 0;
  let instances = 0;
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    meshes += 1;
    draws += 1;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const index = geo.getIndex();
    tris += index ? index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) instances += mesh.count;
    const m = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(m)) m.forEach((x) => mats.add(x));
    else if (m) mats.add(m);
  });
  rows.push({ system: name, meshes, draws, tris: Math.round(tris), instances, materials: mats.size, note });
}

const textures = fake();
const atmosphere = createAtmosphere(budget);
const weathering = createWeathering(new THREE.Texture(), budget.tier);
const sky = createSky(textures, budget);
const terrainGroup = buildTerrain(budget, textures.ground);
atmosphere.registerTree(terrainGroup);

const rocks = createRockField(textures, budget, weathering);
atmosphere.registerTree(rocks.group);
const grass = createGrassField(textures.grassBlade, budget, rocks.skirtPoints);
const flora = createFlora(textures, budget);
const water = createWater(textures, budget, new THREE.Vector3(0.5, 0.7, 0.3).normalize(), {
  sky: atmosphere.uniforms.uDcHazeColor.value,
  sun: atmosphere.uniforms.uDcSunColor.value,
});
const structures = createStructures(budget);

census("terrain", terrainGroup, "1 merged landscape mesh, matrix frozen");
census("water", water.group, "river + fall + spray + ocean disc; ocean verts collapse when dry");
census("rocks", rocks.group, "instanced kit masters + merged decals");
census("grass", grass.group, "two rings around viewer, rebuilt on move");
census("flora", flora.group, "leaf/frond buckets + impostors + merged wood/pine + shrubs/flowers");
census("structures", structures.group, "per-material merged district + island silhouettes");
census("sky", sky.group, "dome + cloud shells, renderOrder back");

// ── Texture census: count × resolution estimate from the real generator ──
const texRows: string[] = [];
let texBytes = 0;
const sizes: Record<string, number> = { ground: 1024, rock: 1024, bark: 512, leaf: 512, grassBlade: 256, canopy: 512, frond: 256, palmBark: 512, palmCanopy: 512, water: 512, waterNormal: 512, weather: 512, contact: 512, cloud: 512, feather: 256, rockNormal: 1024, rockORM: 512 };
for (const [name, res] of Object.entries(sizes)) {
  // RGBA8 baseline; ORM/normal packed where the generator does it.
  const bytes = res * res * 4;
  texBytes += bytes;
  texRows.push(`${name}@${res}`);
}
void texRows;

console.log(`\nSANCTUARY PERF CENSUS — tier: ${tier}`);
console.log("=".repeat(96));
console.log(
  "system".padEnd(12),
  "meshes".padStart(7),
  "draws".padStart(6),
  "tris".padStart(9),
  "instances".padStart(10),
  "mats".padStart(5),
  "  note",
);
console.log("-".repeat(96));
let draws = 0;
let tris = 0;
for (const r of rows) {
  draws += r.draws;
  tris += r.tris;
  console.log(
    r.system.padEnd(12),
    String(r.meshes).padStart(7),
    String(r.draws).padStart(6),
    String(r.tris).padStart(9),
    String(r.instances).padStart(10),
    String(r.materials).padStart(5),
    `  ${r.note}`,
  );
}
console.log("-".repeat(96));
console.log(
  "TOTAL".padEnd(12),
  "".padStart(7),
  String(draws).padStart(6),
  String(tris).padStart(9),
);
console.log(`\ntexture set: ${texRows.length} maps, ~${(texBytes / 1048576).toFixed(1)} MB RGBA8 equivalent`);
console.log(`shadow casters: ${budget.shadowMapSize > 0 ? `map ${budget.shadowMapSize}, frustum ±34 m, static (refreshed on move)` : "disabled"}`);
console.log(`foliage LOD: impostor radius 300 m inside scatter 430 m; leaf+frond+wood merged by material`);

rocks.dispose();
grass.dispose();
flora.dispose();
water.dispose();
structures.dispose();
atmosphere.dispose();
