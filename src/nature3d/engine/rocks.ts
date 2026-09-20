// src/nature3d/engine/rocks.ts
//
// THE ROCK KIT — four master rocks, one draw call per (master, LOD), and a
// few hundred boulders that never repeat (research §6, §25, §27, principles
// 8, 19, 50).
//
// ── The professional approach this file copies ──────────────────────────
//
// A beginner sculpts one rock and places it 300 times. A production studio
// authors a KIT: three to five masters, each sculpted so its silhouette is
// different from EVERY angle — flat on top, jagged on one side, sloped on the
// other, blocky underneath. Then the level is dressed by rotating, scaling and
// SINKING those masters, and the player's pattern recognition never gets a
// grip: the brain cannot match a silhouette it never sees twice.
//
// Because the masters are genuinely three-dimensional, that trick works only
// if the MATERIAL follows the world rather than the mesh. Rotate a rock 90°
// and a baked top-down moss texture would end up on its side — the classic
// "pasted asset" tell. So weathering is tri-planar and world-aligned
// (`weathering.ts`): moss and dust land on whichever faces happen to point up
// and away from the sun, no matter how the instance was rotated. ONE
// 320-triangle mesh, believable in every orientation, in every biome.
//
// ── The kit, as generated here ──────────────────────────────────────────
//
// Each master is sculpted through the three form levels of research §3:
//
//   PRIMARY    an asymmetric, non-spherical silhouette. No master may read as
//              a sphere from any angle — the sculpt applies an anisotropic
//              stretch plus a decisive tilt so no two axes agree.
//   SECONDARY  bedding planes. Two or three random half-space cuts shear the
//              blob flat, exactly the way sedimentary rock fractures along
//              planes of weakness. These are the big facets that catch a low
//              sun and make the rock read as geology.
//   TERTIARY   fractal displacement of every vertex, plus the 3-channel
//              curvature bake that gives the shader its cavities, its edges
//              and its dirt. The detail lives in the NORMALS and the vertex
//              data, never in extra triangles (principle 5).
//
// Placement is environmental logic, not a scatter (research §1, §8, §49):
// boulders follow SLOPE and DRAINAGE — scree on the steep faces, outcrops on
// the ridges, wet rocks at the water line, and never a boulder standing in
// the middle of a worn trail.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { createSite, pathWeight, siteAt, type Site } from "./environment";
import { ROUGHNESS_RANGE } from "./palette";
import { bakeCurvature, type Weathering } from "./weathering";
import { insideRiver, terrainHeight } from "./terrain";
import type { TextureSet } from "./textures";

export interface RockField {
  group: THREE.Group;
  /**
   * Every boulder's base, as (x, z, radius) triples.
   *
   * The grass field reads this to grow a SKIRT of blades around each rock.
   * That is principle 50 in one line: an isolated rock looks pasted on until
   * something grows out of the join.
   */
  skirtPoints: Float32Array;
  dispose(): void;
}

/** Deterministic RNG — the kit must be identical on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sculpt one master rock.
 *
 * `detail` is the icosahedron subdivision: 1 → 80 triangles (the far LOD),
 * 2 → 320 (the near LOD). Crucially the RNG draws do NOT depend on `detail`,
 * so the same seed produces the same stretch, the same bedding planes and the
 * same noise field at both resolutions: the two LODs are the same rock at two
 * resolutions rather than two different rocks — which is exactly what stops a
 * boulder from changing shape as the camera moves away.
 */
function sculptRock(rand: () => number, detail: number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.5, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // ── PRIMARY: anisotropy + tilt ──────────────────────────────────────
  const stretch = new THREE.Vector3(0.72 + rand() * 0.75, 0.5 + rand() * 0.42, 0.72 + rand() * 0.75);
  const tilt = new THREE.Euler((rand() - 0.5) * 0.6, rand() * Math.PI * 2, (rand() - 0.5) * 0.6);

  // ── SECONDARY: bedding planes ───────────────────────────────────────
  const planes: Array<{ n: THREE.Vector3; d: number }> = [];
  const planeCount = 2 + ((rand() * 2) | 0);
  for (let i = 0; i < planeCount; i += 1) {
    const n = new THREE.Vector3(rand() - 0.5, rand() * 0.9, rand() - 0.5).normalize();
    planes.push({ n, d: 0.3 + rand() * 0.22 });
  }

  // ── TERTIARY: fractal vertex displacement ───────────────────────────
  const FREQ = 3.1 + rand() * 2.2;
  const SEED_X = rand() * 40;
  const SEED_Y = rand() * 40;
  const SEED_Z = rand() * 40;

  const p = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 1) {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let amp = 1;
    let freq = 1;
    let sum = 0;
    for (let o = 0; o < 4; o += 1) {
      // A cheap 3D field built from decorrelated sines is enough here: the
      // detail is only ever seen as silhouette roughness and through the
      // normals it produces, and it must be IDENTICAL for a given master.
      const s =
        Math.sin(p.x * FREQ * freq + SEED_X + o * 1.7) *
          Math.cos(p.y * FREQ * freq * 1.13 + SEED_Y - o * 2.3) +
        Math.sin(p.z * FREQ * freq * 0.87 + SEED_Z + o * 3.1) * 0.7;
      sum += s * amp;
      amp *= 0.52;
      freq *= 2.07;
    }
    const radial = 1 + sum * 0.17;
    p.multiplyScalar(0.5 * radial);

    // Flat base: a boulder that has sat on the ground for a century has no
    // rounded underside, and clamping the lowest vertices also guarantees it
    // can be sunk into the terrain without leaving daylight underneath.
    if (p.y < -0.26) p.y = -0.26 - (p.y + 0.26) * 0.12;

    pos.setXYZ(i, p.x, p.y, p.z);
  }

  // ── SECONDARY, applied: shear the blob along each plane ─────────────
  for (const { n: planeN, d } of planes) {
    for (let i = 0; i < pos.count; i += 1) {
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const above = p.dot(planeN) - d;
      if (above > 0) p.addScaledVector(planeN, -above);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
  }

  // ── PRIMARY, applied: stretch then tilt ─────────────────────────────
  const rotation = new THREE.Matrix4().makeRotationFromEuler(tilt);
  const scale = new THREE.Matrix4().makeScale(stretch.x, stretch.y, stretch.z);
  geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(scale, rotation));
  geo.computeVertexNormals();

  // ── The weathering bake: ao / cavity / convexity per vertex ─────────
  // Radius 0.07 in the rock's own units: the crevices left by the four
  // displacement octaves. The bedding planes are large enough to read in the
  // silhouette without help, so they are deliberately outside this radius.
  bakeCurvature(geo, 0.07, 1);
  return geo;
}

/** The radius at which a boulder stops paying for the near-LOD triangles. */
const NEAR_LOD_RADIUS = 150;

export function createRockField(
  tex: TextureSet,
  budget: QualityBudget,
  weathering: Weathering,
): RockField {
  const group = new THREE.Group();
  group.name = "rock-field";
  const shadows = budget.shadowMapSize > 0;

  const rand = mulberry32(0x5eed_10c4);
  const site: Site = createSite();
  const normal = new THREE.Vector3();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  const MASTER_COUNT = 4;

  // ── Material: ONE for the whole field ───────────────────────────────
  const material = new THREE.MeshStandardMaterial({
    map: tex.rock,
    normalMap: tex.rockNormal,
    // Channel-packed ORM: R = ambient occlusion, G = roughness, B = metalness.
    // Three textures' worth of variation for the memory of one (principle 36).
    roughnessMap: tex.rockORM,
    metalnessMap: tex.rockORM,
    aoMap: tex.rockORM,
    roughness: 0.92,
    metalness: 0,
  });
  material.normalScale.set(1.15, 1.15);
  material.aoMapIntensity = 0.85;
  weathering.apply(material, { attrib: "aDcWeather" });

  // ── Placement ───────────────────────────────────────────────────────
  const count = budget.rocks;
  const nearBuckets: THREE.Matrix4[][] = Array.from({ length: MASTER_COUNT }, () => []);
  const farBuckets: THREE.Matrix4[][] = Array.from({ length: MASTER_COUNT }, () => []);
  const nearWeather: number[][] = Array.from({ length: MASTER_COUNT }, () => []);
  const farWeather: number[][] = Array.from({ length: MASTER_COUNT }, () => []);
  const nearColors: THREE.Color[][] = Array.from({ length: MASTER_COUNT }, () => []);
  const farColors: THREE.Color[][] = Array.from({ length: MASTER_COUNT }, () => []);
  const contacts: THREE.Matrix4[] = [];
  const skirts: number[] = [];

  let placed = 0;
  let guard = 0;
  let clusterX = 0;
  let clusterZ = 0;
  let clusterLeft = 0;
  let clusterWet = 0;

  while (placed < count && guard < count * 40) {
    guard += 1;

    if (clusterLeft <= 0) {
      // ── Choose the next outcrop ─────────────────────────────────────
      // Clusters, not a uniform scatter: real boulders come out of the ground
      // in families where the bedrock is close to the surface (research §49:
      // nature follows density gradients, never a grid).
      const a = rand() * Math.PI * 2;
      const r = 14 + Math.sqrt(rand()) * 430;
      clusterX = Math.cos(a) * r;
      clusterZ = Math.sin(a) * r;
      const s = siteAt(clusterX, clusterZ, site);
      // Steep ground and drainage lines are where rock shows through. Flat,
      // deep-soiled meadow keeps its grass, so most flat draws are rejected —
      // EXCEPT on the beach, where scattered coral boulders are part of the
      // shoreline's composition (Phase 10: rocks at the coast, deliberately).
      if (s.slopeDeg < 5 && rand() < (s.coastal > 0.35 ? 0.22 : 0.62)) continue;
      if (pathWeight(clusterX, clusterZ) > 0.35) continue;
      if (Math.hypot(clusterX, clusterZ) < 14) continue;
      clusterLeft = 3 + ((rand() * 7) | 0);
      clusterWet = Math.max(s.nearWater, s.wetness) * (s.slopeDeg < 26 ? 1 : 0.4);
    }

    clusterLeft -= 1;

    const a = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 11;
    const x = clusterX + Math.cos(a) * rad;
    const z = clusterZ + Math.sin(a) * rad;

    if (insideRiver(x, z)) continue;
    if (pathWeight(x, z) > 0.6) continue;
    const distOrigin = Math.hypot(x, z);
    if (distOrigin < 9) continue;

    const s = siteAt(x, z, site);
    if (s.height < -1.2) continue;
    // Nothing perches on the snowline: that band is bare rock and wind.
    if (s.height > 58) continue;

    const masterIndex = (rand() * MASTER_COUNT) | 0;
    const isNear = distOrigin < NEAR_LOD_RADIUS;

    // Far boulders GROW: a 0.6 m pebble is invisible at 300 m, but a boulder
    // field on the far flank is what gives the distance its scale
    // (research §7). This is the kit-bash scale rule (principle 8) — the
    // whole reusability cheat in one line.
    const distGain = isNear ? 1 + Math.min(distOrigin / 140, 1.1) : 1 + Math.min(distOrigin / 120, 4.2);
    const sc = (0.55 + rand() * 1.05) * distGain;
    const sx = sc * (0.85 + rand() * 0.35);
    const sy = sc * (0.62 + rand() * 0.42);
    const sz = sc * (0.85 + rand() * 0.35);

    // Sink: 28–52 % of the rock's own half-height is buried. A rock that is
    // merely SET on the ground is the clearest "pasted asset" tell there is.
    const sink = 0.28 + rand() * 0.24;
    dummy.position.set(x, s.height + sy * (0.5 - sink), z);

    // Rotation about Y is free variation; the tilt is partial (35 %), because
    // a boulder settles into the slope rather than matching it exactly.
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    terrainNormalApprox(s, normal);
    if (normal.y > 0.05 && s.slopeDeg > 12) {
      const tiltAngle = Math.acos(Math.min(1, normal.y)) * 0.35;
      dummy.rotation.set(-normal.z * tiltAngle, dummy.rotation.y, normal.x * tiltAngle);
    }
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();

    // ── Per-instance weathering ───────────────────────────────────────
    // MOSS follows damp + shade; DUST settles low and is scoured off the
    // ridges; WET is the waterline and the damp valley floors, which also
    // drops the roughness and darkens the albedo inside the shader.
    const moss =
      Math.min(1, s.wetness * 1.35 + s.nearWater * 0.45) *
      (1 - Math.min(1, s.height / 44)) *
      (0.45 + rand() * 0.55);
    const dust = Math.max(0, Math.min(1, 0.75 - s.height / 70 + rand() * 0.25));
    const wet = Math.min(1, clusterWet * 0.9 + (rand() < 0.18 ? 0.5 : 0));

    const bucket = isNear ? nearBuckets : farBuckets;
    const wbucket = isNear ? nearWeather : farWeather;
    const cbucket = isNear ? nearColors : farColors;
    bucket[masterIndex].push(dummy.matrix.clone());
    wbucket[masterIndex].push(moss, dust, wet);

    // Tint: rocks are never one colour. A boulder under trees picks up a
    // green-grey cast from the canopy, a river rock reads cooler, the high
    // scree is paler and bleached (research §10) — and a BEACH boulder is
    // the most bleached of all: sun + salt strip it pale and warm.
    const green = moss * 0.22;
    const cool = wet * 0.16 + Math.min(0.12, s.height / 600);
    const bleach = s.coastal * 0.16;
    tint.setRGB(
      1 - green * 0.35 + Math.min(0.1, s.height / 500) - cool * 0.15 + bleach,
      1 - green * 0.1 + Math.min(0.08, s.height / 700) + cool * 0.02 + bleach * 0.94,
      1 - green * 0.5 + cool * 0.28 + bleach * 0.78,
    );
    cbucket[masterIndex].push(tint.clone());

    // Contact decal + grass skirt (principle 50).
    const decal = Math.max(sx, sz) * 1.55;
    dummy.position.set(x, terrainHeight(x, z) + 0.03, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(decal, decal, 1);
    if (normal.y > 0.05) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      dummy.quaternion.copy(q);
    }
    dummy.updateMatrix();
    contacts.push(dummy.matrix.clone());
    skirts.push(x, z, Math.max(sx, sz) * 0.75);

    placed += 1;
  }

  // ── Build the instanced meshes: one per (master, LOD) ───────────────
  const buildBucket = (
    geo: THREE.BufferGeometry,
    matrices: THREE.Matrix4[],
    weather: number[],
    colors: THREE.Color[],
    name: string,
  ) => {
    if (matrices.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, material, matrices.length);
    mesh.name = name;
    for (let i = 0; i < matrices.length; i += 1) {
      mesh.setMatrixAt(i, matrices[i]);
      mesh.setColorAt(i, colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    weathering.setInstanceWeather(mesh, new Float32Array(weather));
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false; // the instances span the whole meadow
    group.add(mesh);
  };

  for (let m = 0; m < MASTER_COUNT; m += 1) {
    // Same seed → same rock. USER DIRECTIVE (big-stone design pass): the far
    // masters used to be sculpted at detail 1 (80 triangles), so every LARGE
    // boulder read as a smooth featureless lump next to the crisp small ones.
    // Both buckets now sculpt the SAME detail-2 master — big and small stones
    // are literally the same design. (Two geometries, not one shared: the
    // per-instance weather attribute lives ON the geometry, so a shared
    // master would let the far bucket overwrite the near bucket's weather.)
    const seed = 0x9e37_79b9 + m * 0x45d9_f3b;
    buildBucket(sculptRock(mulberry32(seed), 2), nearBuckets[m], nearWeather[m], nearColors[m], `rock-master-${m}`);
    buildBucket(sculptRock(mulberry32(seed), 2), farBuckets[m], farWeather[m], farColors[m], `rock-master-${m}-far`);
  }

  // ── Contact decals: one instanced mesh for the whole field ──────────
  if (contacts.length > 0) {
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    const decalMat = new THREE.MeshBasicMaterial({
      map: tex.contact,
      transparent: true,
      depthWrite: false,
      // A prop's contact shadow must never z-fight the ground it stands on.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const decals = new THREE.InstancedMesh(decalGeo, decalMat, contacts.length);
    for (let i = 0; i < contacts.length; i += 1) decals.setMatrixAt(i, contacts[i]);
    decals.instanceMatrix.needsUpdate = true;
    decals.renderOrder = 1;
    decals.frustumCulled = false;
    decals.name = "rock-contacts";
    group.add(decals);
  }

  return {
    group,
    skirtPoints: new Float32Array(skirts),
    dispose() {
      material.dispose();
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat && mat !== material) mat.dispose();
      });
      group.clear();
    },
  };
}

/**
 * A cheap terrain normal from the site descriptor already in hand.
 *
 * `siteAt` has just paid for five height samples; re-deriving the normal here
 * would double that cost for a value it effectively already knows. The site's
 * downhill vector IS the gradient direction, and `slopeDeg` gives its
 * magnitude, so the surface normal falls straight out of the two.
 */
function terrainNormalApprox(site: Site, out: THREE.Vector3): THREE.Vector3 {
  if (site.slopeDeg < 0.5) return out.set(0, 1, 0);
  const grade = Math.tan((site.slopeDeg * Math.PI) / 180);
  return out.set(-site.downhillX * grade, 1, -site.downhillZ * grade).normalize();
}

/** Roughness window the rock material is authored inside (principle 12). */
export const ROCK_ROUGHNESS = ROUGHNESS_RANGE.rock;
