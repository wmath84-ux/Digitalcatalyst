// src/nature3d/engine/beachHouses.ts
//
// THE BEACH-HOUSE DISTRICT — the owner's uploaded house, standing six times in
// the sanctuary's fields.
//
//   "field bahut badi hai sanctuary ke andar fields per panch se chhah alag
//    alag jagahon per door-door yah house add karo" (owner, 2026-09-24)
//
// ── The asset ───────────────────────────────────────────────────────────
//
// `Beach+House_Pack+JSGraphics_CGTrader.blend` (Blender 3.0) is ONE assembled
// tropical beach bungalow: 172 mesh objects, 22 410 triangles, five flat
// placeholder materials and — measured, not assumed — NOT ONE image texture
// (the only image datablock in the file is Blender's own "Render Result").
// The three material slots that actually carry faces are the artist's paint
// primer: `light` (the lime-washed plaster and the roof's rafters), `Roof`
// (the shingles) and `wall 1` (the dark oiled plank). `wall 2` / `wall 3`
// hold no faces; they are carried in the export anyway so a re-export that
// uses them cannot land on a missing-material white.
//
// It ships as `public/sanctuary/models/beach_house.glb`, baked by
// `scripts/blend/extract-beach-house.py` (offline, one-off, provenance in
// that script): the
// two leftover blocks from the author's session are dropped, every object's
// world placement is baked in, the model is turned Y-up and re-centred with
// its floor at y = 0. The sanctuary is OFFLINE-FIRST, so nothing is
// hot-linked — same convention as the plant fields and the villa.
//
// MEASURED from the .blend at scale 1 (these numbers are the module's
// contract, and `HOUSE_RIDGE` in `beachHouseSite.ts` is where they live):
//
//   authored total height (ridge + the roof's flared tips)   18.920 m
//   authored wall box (what the walls fill under the eaves)  14.190 × 14.040
//   authored ridge height                                    13.588 m
//
// ── Where the six stand ─────────────────────────────────────────────────
//
// NOT hand-picked coordinates. The sites are SOLVED against the same analytic
// height field everything else reads (`terrainHeight`), because a building
// that ends up in the river gorge, on a sea cliff or across a trail is the
// one asset class a scatter pass cannot fix afterwards. The pass:
//
//   1. sweeps a 14 m grid over the sanctuary's own fields (r 130…520 m);
//   2. rejects everything that is not open ground — the river corridor, the
//      worn trails, the villa's yard, the lesson-board hill, the beach and
//      the shallow sea, ground above the foothills, and any spot whose pad
//      relief is more than 3.2 m across its pad (a house is cut into a slope,
//      never perched on it);
//   3. picks the flattest candidate as the seed, then takes the far-the-farthest
//      candidate five more times, requiring 170 m of clear air between any
//      two houses — so the six end up spread across the whole sanctuary,
//      "door-door", not clustered;
//   4. gives each one a deterministic yaw (facing the meadow, ±16° jitter)
//      and a ±14 % scale so the row never reads as six copies of one model.
//
// The pick is DETERMINISTIC (a seeded mulberry32 plus fixed trigonometry), so
// every machine, every reload and every screenshot shows the same six houses
// in the same six places — the same contract the herds, the trees and the
// saved board placement already rely on.
//
// ── Why the ground is levelled ──────────────────────────────────────────
//
// `beachHouseSite.ts` flattens a 19 × 17 m pad under each house down to the
// LOWEST natural sample beneath the walls (so the floor is cut into the
// ground, never floating over it) and feathers it back into natural terrain
// over the next 6–8 m. That file also owns `insideBeachHouse`, the one test
// every other scatter uses to keep blades, plants, trees and rocks out of
// the walls.
//
// ── Cost model ──────────────────────────────────────────────────────────
//
//   * ONE `InstancedMesh` per material for all six houses → 3 draw calls,
//     one compiled program, geometry uploaded once.
//   * Static: the matrices freeze after the first write, `frustumCulled` is
//     off (the instances span 1.2 km, so a single bounding sphere would cull
//     the wrong half of them), and nothing is touched per frame.
//   * The low tier swaps the glTF's PBR materials for Lambert — the same
//     `cheapPlants` diet the plant fields take.
//   * Shadows: none cast (the shadow frustum is 34 m around the study chair,
//     and a 6-house shadow walk at 1 km would be pure waste); the ground
//     still receives the sun's own shadowing near the meadow.
//
// ── Failure ─────────────────────────────────────────────────────────────
//
// Fail-soft, like every other async asset in the engine: a failed download
// warns once and the world keeps running with six levelled yards and no
// houses. Nothing about the houses is on the critical path of the first frame.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { QualityBudget } from "./quality";
import { RIVER_CENTER_X, RIVER_HALF_WIDTH, terrainHeight } from "./terrain";
import { pathWeight } from "./environment";
import { insideWarehouse } from "./warehouseSite";
import {
  HOUSE_RIDGE,
  beachHouseSites,
  beachHousesInstalled,
  installBeachHouseSites,
  type BeachHousePlacement,
  type BeachHouseSite,
} from "./beachHouseSite";

export interface BeachHouses {
  group: THREE.Group;
  /** Published so `scene.ts` can register them with atmosphere + winter. */
  materials: THREE.Material[];
  /** How many houses are actually standing (debug/HUD). */
  count: number;
  /** The placed sites, for the HUD and the tests. */
  sites: readonly BeachHouseSite[];
  /** Frame hook, kept so the loop reads like every other district. Static. */
  update(): void;
  dispose(): void;
}

const MODEL_URL = "sanctuary/models/beach_house.glb";

/** The ridge height the whole district is designed around, in metres. */
const RIDGE_TARGET = 10.5;
/** 10.5 m of ridge ÷ the authored 13.588 m ridge. */
const BASE_SCALE = RIDGE_TARGET / HOUSE_RIDGE;
/** How far the floor is buried, so the wall meets the dirt, not a gap. */
const BITE = 0.32;

// ── Site search ─────────────────────────────────────────────────────────

/** How many houses stand. "panch se chhah" — six, the far end of the range. */
export const BEACH_HOUSE_COUNT = 6;
/** Candidate grid step, in metres. */
const GRID_STEP = 14;
/** Inside this radius the study zone (chair, boards, desk) owns the ground. */
const R_MIN = 130;
/**
 * The outer edge of the sanctuary's own FIELDS.
 *
 * The owner's directive is explicit about the ground the houses belong on —
 * "sanctuary ke andar fields per" — so the search stops where the meadow
 * stops being meadow: past this the ring of foothills has taken over (the
 * inner relief ramps from 150 m out to 44 m of hills), and a levelled pad
 * carved into a hillside reads as a building site, not a homestead.
 */
const R_MAX = 520;
/** Metres of clear air required between two houses. */
const MIN_SEPARATION = 170;
/** Nothing is built closer than this to the river channel's centre line. */
const RIVER_CLEAR = RIVER_HALF_WIDTH + 14;
/** The villa's apron is 34 m; this keeps a house's pad well outside it. */
const VILLA_CLEAR = 58;
/** The lesson board's hill is authored; the houses stay off it. */
const LESSON_HILL_X = -268.7;
const LESSON_HILL_Z = -266.1;
const LESSON_HILL_CLEAR = 95;
/** Ground below the back-shore (above OCEAN_LEVEL) is beach, not field. */
const ALT_MIN = 1.6;
/** Above this the ground is the foothill ramp, where a levelled pad would scar. */
const ALT_MAX = 46;
/** Natural height variation allowed across the pad, in metres. */
const RELIEF_MAX = 3.2;
/** `pathWeight` above this means a trail runs through the spot. */
const TRAIL_CLEAR = 0.02;

/** Deterministic RNG — identical world on every machine and reload. */
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

/** The pad outline, as unit offsets: corners, edge midpoints and the centre. */
const PAD_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

interface Candidate {
  x: number;
  z: number;
  /** Height range across the pad, in metres — the flatness score. */
  relief: number;
  /** Natural ground height at the centre. */
  altitude: number;
}

/** Height range across a candidate's pad, in metres. */
function padRelief(x: number, z: number, halfX: number, halfZ: number): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < PAD_PROBES.length; i += 1) {
    const px = PAD_PROBES[i][0] * halfX;
    const pz = PAD_PROBES[i][1] * halfZ;
    const h = terrainHeight(x + px, z + pz);
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return max - min;
}

/**
 * Does this spot pass every gate that protects the world from a bad house?
 * Order matters only for cost: the cheap rejections run first.
 */
function acceptsSite(x: number, z: number, halfX: number, halfZ: number): boolean {
  // The river corridor. A house on the gorge wall would be a cliff.
  if (Math.abs(x - RIVER_CENTER_X) < RIVER_CLEAR) return false;
  // A trail runs through it — the path field is the authority on that.
  if (pathWeight(x, z) > TRAIL_CLEAR) return false;
  // The villa's yard and its apron.
  if (insideWarehouse(x, z, VILLA_CLEAR)) return false;
  // The authored lesson-board crest.
  const lx = x - LESSON_HILL_X;
  const lz = z - LESSON_HILL_Z;
  if (lx * lx + lz * lz < LESSON_HILL_CLEAR * LESSON_HILL_CLEAR) return false;
  const r = Math.hypot(x, z);
  if (r < R_MIN || r > R_MAX) return false;
  const h = terrainHeight(x, z);
  if (h < ALT_MIN || h > ALT_MAX) return false;
  return padRelief(x, z, halfX, halfZ) <= RELIEF_MAX;
}

/**
 * Solve the six sites.
 *
 * Runs ONCE, at the first call, against the natural height field (the pads
 * cannot exist yet — they are what this produces). ~4 500 candidates, one
 * height sample each, plus the pad probes on the survivors: a few tens of
 * milliseconds of build time, and not a millisecond after that.
 */
function pickSites(): BeachHousePlacement[] {
  // The flat pad's own half extents at the base scale — the ground a house's
  // levelling actually rewrites, so the relief the gate measures is exactly
  // the cut the pad would have to make.
  const probeHalfX = 14.19 * 0.5 * BASE_SCALE + 5.4;
  const probeHalfZ = 14.04 * 0.5 * BASE_SCALE + 4.6;
  const halfSpan = Math.ceil(R_MAX / GRID_STEP) * GRID_STEP;

  const candidates: Candidate[] = [];
  for (let x = -halfSpan; x <= halfSpan; x += GRID_STEP) {
    for (let z = -halfSpan; z <= halfSpan; z += GRID_STEP) {
      if (!acceptsSite(x, z, probeHalfX, probeHalfZ)) continue;
      candidates.push({
        x,
        z,
        relief: padRelief(x, z, probeHalfX, probeHalfZ),
        altitude: terrainHeight(x, z),
      });
    }
  }

  // ── Seed: the flattest open ground in the sanctuary ───────────────────
  // Ties are broken by altitude (lower ground reads as meadow, higher ground
  // as the dry rise), then by position, so the pick is total and stable.
  const quality = (c: Candidate): number => -c.relief * 4 - Math.abs(c.altitude - 6) * 0.25;
  let seed = -1;
  let seedScore = -Infinity;
  for (let i = 0; i < candidates.length; i += 1) {
    const s = quality(candidates[i]);
    if (s > seedScore) {
      seedScore = s;
      seed = i;
    }
  }

  const chosen: Candidate[] = [];
  if (seed >= 0) chosen.push(candidates[seed]);
  const used = new Set<number>(seed >= 0 ? [seed] : []);

  // ── Then: far-the-farthest, five times ────────────────────────────────
  // A pure distance pick would happily put a house on a 3 m rise, so the
  // distance carries a flatness bonus worth up to ~38 m. "Door-door" wins,
  // "beautiful ground" decides the ties. If the strict separation cannot be
  // met the gate relaxes in steps — a sanctuary with five houses would be a
  // worse bug than two of them standing 130 m apart.
  for (let pass = 0; pass < 3 && chosen.length < BEACH_HOUSE_COUNT; pass += 1) {
    const separation = MIN_SEPARATION * (pass === 0 ? 1 : pass === 1 ? 0.75 : 0.5);
    while (chosen.length < BEACH_HOUSE_COUNT) {
      let best = -1;
      let bestScore = -Infinity;
      for (let i = 0; i < candidates.length; i += 1) {
        if (used.has(i)) continue;
        const c = candidates[i];
        let minDist = Infinity;
        for (let k = 0; k < chosen.length; k += 1) {
          const d = Math.hypot(c.x - chosen[k].x, c.z - chosen[k].z);
          if (d < minDist) minDist = d;
        }
        if (minDist < separation) continue;
        const score = minDist + (RELIEF_MAX - c.relief) * 12;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best < 0) break;
      used.add(best);
      chosen.push(candidates[best]);
    }
  }

  // ── Yaw, scale and the pad's own level ────────────────────────────────
  const rng = mulberry32(0x5ea51de);
  const sites: BeachHousePlacement[] = [];
  for (const c of chosen) {
    const scale = BASE_SCALE * (0.86 + 0.28 * rng());
    // Face the meadow: the model's local +Z is aimed at the sanctuary centre,
    // with a small jitter so the row never reads as a parade ground.
    const yaw = Math.atan2(-c.x, -c.z) + (rng() - 0.5) * 0.55;
    const halfX = 14.19 * 0.5 * scale;
    const halfZ = 14.04 * 0.5 * scale;
    // The pad level is the LOWEST natural sample under the walls (walls plus
    // 2.5 m of apron), so the floor is cut in — the villa's rule, and the
    // reason a house on a 3 m swell still reads as built, not dropped.
    let padY = Infinity;
    for (let ix = -2; ix <= 2; ix += 1) {
      for (let iz = -2; iz <= 2; iz += 1) {
        const h = terrainHeight(c.x + (ix / 2) * (halfX + 2.5), c.z + (iz / 2) * (halfZ + 2.5));
        if (h < padY) padY = h;
      }
    }
    sites.push({ x: c.x, z: c.z, yaw, scale, padY });
  }
  return sites;
}

/**
 * Make sure the sites exist. Idempotent, and the ONLY entry point that may
 * compute them: `scene.ts` calls it before the first scatter pass, so every
 * module downstream sees the same six pads.
 */
export function ensureBeachHouseSites(): readonly BeachHouseSite[] {
  if (beachHousesInstalled()) return beachHouseSites();
  installBeachHouseSites(pickSites());
  return beachHouseSites();
}

function loadGltf(url: string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

/**
 * Build the district. Async, fail-soft, one model, six placements.
 */
export function createBeachHouses(
  budget: QualityBudget,
  /**
   * Kept for signature parity with the other asset factories (dayBed, the
   * plant fields). The pack ships NO textures at all — measured from the
   * .blend: the only image datablock in the whole file is Blender's own
   * "Render Result" — so there is nothing to filter.
   */
  anisotropy: number,
): Promise<BeachHouses> {
  void anisotropy;
  const sites = ensureBeachHouseSites();
  const shadows = budget.shadowMapSize > 0;

  return loadGltf(MODEL_URL).then((gltf) => {
    const sources: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) sources.push(mesh);
    });
    if (sources.length === 0) {
      throw new Error("beachHouses: model has no meshes");
    }

    const group = new THREE.Group();
    group.name = "beach-houses";
    const materials: THREE.Material[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const dummy = new THREE.Object3D();

    for (const src of sources) {
      const geometry = src.geometry;
      const gltfMat = src.material as THREE.MeshStandardMaterial | undefined;
      const color = gltfMat?.color ?? new THREE.Color(0.8, 0.8, 0.8);
      let material: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
      if (budget.cheapPlants || !gltfMat) {
        // The diet tier: Lambert, no PBR channels to pay for. The pack ships
        // no textures at all, so this swaps the BRDF and nothing else.
        material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      } else {
        material = gltfMat;
        // Flat, untextured slots: metalness 0 keeps the roof from reading as
        // a mirror under this sun (the villa's rule, same reason).
        material.metalness = 0;
        material.side = THREE.DoubleSide;
      }
      material.name = material.name || "beach-house";
      material.vertexColors = false;
      if (geometry.attributes.uv) geometry.deleteAttribute("uv");
      if (geometry.attributes.uv1) geometry.deleteAttribute("uv1");
      geometry.computeBoundingSphere();

      const instanced = new THREE.InstancedMesh(geometry, material, sites.length);
      instanced.name = `beach-house-${src.name || group.children.length}`;
      // The six instances span the whole sanctuary, so three's single-sphere
      // frustum test would cull houses that are on screen. Three draw calls
      // are not worth that bug.
      instanced.frustumCulled = false;
      instanced.castShadow = false;
      instanced.receiveShadow = shadows;
      for (let i = 0; i < sites.length; i += 1) {
        const s = sites[i];
        dummy.position.set(s.x, terrainHeight(s.x, s.z) - BITE, s.z);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }
      instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      instanced.instanceMatrix.needsUpdate = true;
      instanced.updateMatrix();
      group.add(instanced);
      materials.push(material);
      geometries.push(geometry);
    }

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    group.updateMatrixWorld(true);

    return {
      group,
      materials,
      count: sites.length,
      sites,
      update() {
        // Static by design: the matrices are written once and frozen.
      },
      dispose() {
        for (let i = 0; i < geometries.length; i += 1) geometries[i].dispose();
        for (let i = 0; i < materials.length; i += 1) materials[i].dispose();
        group.clear();
      },
    };
  });
}
