// src/nature3d/engine/environment.ts
//
// THE ENVIRONMENT FIELD — the sanctuary's "digital ecologist".
//
// ── Why this file exists (research §1, §8, §9, §12, §25, §49) ────────────
//
// A professional environment artist does not place a tree, a rock or a patch
// of grass. They place the CONSEQUENCE of a set of physical causes: soil
// depth, slope, aspect, water flow, sunlight and competition. "Copy mat karo,
// nature ke system ko samjho" (principle 1) is exactly this file.
//
// Every other module in the engine (terrain colours, grass scatter, the rock
// kit, the tree factory) asks THIS module what the ground is like at a point
// and then obeys the answer. That is what makes the world read as one
// landscape instead of five independent scatter passes:
//
//   slope        shallow soil → exposed rock, root flare, scree, no grass
//   aspect       facet facing away from the sun → damp, mossy, darker
//   wetness      drainage accumulation → erosion channels, wet dark soil,
//                dense lush vegetation, and the riverbank
//   path         where feet actually travel → compacted dirt, no grass
//   altitude     rock band, tree line, snowline
//   crowding     competition for light → tall bare trunks, canopy at the top
//
// ── Cost model ──────────────────────────────────────────────────────────
//
// Two entry points with very different price tags, because they are called
// from very different loops:
//
//   siteAt(x, z)                    ~5 height samples + noise  → SPARSE props
//                                   (≤ 900 trees, ≤ 340 rocks: fine)
//   groundColorAt(x, z, h, out)     ~1 look-up + noise         → DENSE loops
//                                   (150 000 grass blades, 150 000 terrain
//                                    vertices: this is the only one we can
//                                    afford, so it deliberately does NOT
//                                    take a slope sample — the terrain mesh
//                                    passes its own normal instead)
//
// The drainage (flow accumulation) grid is built LAZILY on first use, not at
// module load: `terrain.ts` and this file import each other, and running a
// 20 000-sample height sweep during module evaluation would be a circular
// import waiting to bite. Lazy init costs one `if` per call and nothing else.

import * as THREE from "three";
import { terrainHeight, RIVER_CENTER_X, OCEAN_LEVEL, coastWeight } from "./terrain";
import { beachHouseYardWeight } from "./beachHouseSite";
import { beachHouseSites } from "./beachHouseSite";
import { noise } from "./simplex";

// ─────────────────────────────────────────────────────────────────────────
//  The sun's side of the meadow
// ─────────────────────────────────────────────────────────────────────────

/**
 * The mean azimuth the sun arcs across, as a unit vector in XZ.
 *
 * `daylight.ts` tilts the whole solar arc towards -Z so the light rakes
 * across the meadow and the study boards; the sun therefore spends the day
 * on the -Z half of the sky, and the -Z-facing side of every trunk, rock and
 * hill is the DRY, sun-bleached, wind-battered side.
 *
 * Hence: moss, lichen and dampness live on +Z-facing surfaces (the shaded
 * side), while the -Z side is drier, paler and gets the growth (phototropism
 * pulls branches towards it). This single constant is what keeps the moss
 * pass, the tree lean, the grass tint and the terrain tint all agreeing —
 * break it and the world starts contradicting itself, which the eye reads as
 * "wrong" even when it cannot say why.
 */
export const SUN_SIDE_X = 0;
export const SUN_SIDE_Z = -1;

/** How far a worn trail's core reaches, in metres. */
const PATH_CORE = 0.72;
/** The shoulder of a trail, where grass thins but still grows. */
const PATH_SHOULDER = 2.85;

// ─────────────────────────────────────────────────────────────────────────
//  Drainage — the flow map (research §8)
// ─────────────────────────────────────────────────────────────────────────

/** Half-extent of the drainage grid, in metres, centred on the sanctuary. */
const FLOW_HALF = 640;
/** Grid resolution. 160 cells over 1280 m = one cell every 8 m. */
const FLOW_N = 160;

let flowGrid: Float32Array | null = null;
let flowMax = 1;

/**
 * Build the drainage accumulation grid on first use.
 *
 * This is the cheap version of the "flow map" a terrain artist paints in
 * Houdini or Gaea, and it is the reason the wet soil, the erosion channels
 * and the lush vegetation all agree with the river that carved them.
 *
 * ALGORITHM (D8 flow accumulation — the standard terrain-hydrology method):
 *
 *   1. sample the real height field on a regular grid;
 *   2. walk the cells from HIGHEST to LOWEST (a sort, so every cell is
 *      visited after everything that could drain into it);
 *   3. each cell hands all of its accumulated area to its steepest downhill
 *      neighbour of the eight around it;
 *   4. whatever a cell has collected by the time it is visited is its
 *      drainage area — a river valley collects thousands of cells, a ridge
 *      collects one.
 *
 * Cost: one 25 600-node height sweep and a sort, once, off the critical
 * render path. The result is a 160×160 float grid sampled bilinearly.
 */
function ensureFlowGrid(): Float32Array {
  if (flowGrid) return flowGrid;

  const n = FLOW_N;
  const step = (FLOW_HALF * 2) / (n - 1);
  const heights = new Float32Array(n * n);
  const order = new Int32Array(n * n);
  const acc = new Float32Array(n * n);

  for (let j = 0; j < n; j += 1) {
    const z = -FLOW_HALF + j * step;
    for (let i = 0; i < n; i += 1) {
      const x = -FLOW_HALF + i * step;
      heights[j * n + i] = terrainHeight(x, z);
      acc[j * n + i] = 1;
      order[j * n + i] = j * n + i;
    }
  }

  // Descending by height. A plain typed-array sort with a comparator on
  // 25 600 entries is a few milliseconds — irrelevant at boot, and it keeps
  // the implementation readable rather than hand-rolling a bucket sort.
  const sorted = Array.from(order).sort((a, b) => heights[b] - heights[a]);

  const NEIGHBOURS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  const DIAG = Math.SQRT2;

  for (let k = 0; k < sorted.length; k += 1) {
    const idx = sorted[k];
    const j = (idx / n) | 0;
    const i = idx - j * n;
    const h = heights[idx];
    let bestIdx = -1;
    let bestSlope = 0;
    for (const [dx, dz] of NEIGHBOURS) {
      const ii = i + dx;
      const jj = j + dz;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const nIdx = jj * n + ii;
      const drop = h - heights[nIdx];
      if (drop <= 0) continue;
      const slope = drop / (dx === 0 || dz === 0 ? step : step * DIAG);
      if (slope > bestSlope) {
        bestSlope = slope;
        bestIdx = nIdx;
      }
    }
    if (bestIdx >= 0) acc[bestIdx] += acc[idx];
  }

  // Normalise logarithmically: drainage area is heavy-tailed (a channel has
  // thousands of times a ridge's), and what the art needs is a readable
  // 0..1 "how wet is it here", not the raw cell count.
  const out = new Float32Array(n * n);
  let max = 1;
  for (let i = 0; i < acc.length; i += 1) if (acc[i] > max) max = acc[i];
  flowMax = max;
  const denom = Math.log(1 + max * 0.22);
  for (let i = 0; i < acc.length; i += 1) {
    // A gentle power curve on top of the log: the log makes the range usable,
    // the curve pulls the middle of it down so "wet channel" and "ordinary
    // ground" are actually distinguishable at a glance.
    out[i] = Math.pow(Math.min(1, Math.log(1 + acc[i]) / denom), 1.25);
  }

  flowGrid = out;
  return out;
}

/** Bilinear sample of the drainage grid, 0 (ridge) … 1 (main channel). */
export function flowWetness(x: number, z: number): number {
  const grid = ensureFlowGrid();
  const n = FLOW_N;
  const step = (FLOW_HALF * 2) / (n - 1);
  const fx = (x + FLOW_HALF) / step;
  const fz = (z + FLOW_HALF) / step;
  if (fx < 0 || fz < 0 || fx > n - 1.001 || fz > n - 1.001) return 0.12;
  const i = fx | 0;
  const j = fz | 0;
  const tx = fx - i;
  const tz = fz - j;
  const a = grid[j * n + i];
  const b = grid[j * n + i + 1];
  const c = grid[(j + 1) * n + i];
  const d = grid[(j + 1) * n + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Raw accumulation peak, for diagnostics/tests. */
export function flowMaxAccumulation(): number {
  ensureFlowGrid();
  return flowMax;
}

// ─────────────────────────────────────────────────────────────────────────
//  Worn ground — the paths players actually walk (research §8, §13, §48)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Hand-authored desire lines.
 *
 * Roads and trails are the ONE thing the research says must stay hand-crafted
 * while everything else is procedural (§13): they carry the level flow, the
 * choke points and, here, the story — the learner's own walk from the chair
 * to the river and out towards the other two districts. They are also the
 * cheapest possible "environmental storytelling" (§48): a trail is the proof
 * that someone has been living in this world.
 *
 * Each entry is a polyline in world XZ; `pathWeight` fades a trail in and out
 * along its length so a path never ends in a stub, and every consumer (terrain
 * colour, grass scatter, rock scatter) reads the SAME weight — so the worn
 * strip, the missing grass and the cleared stones always line up.
 */
const TRAILS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Chair → river bank: the water run (meandering, not a straight ruler).
  [[0, 2.6], [4.2, 1.1], [8.8, -2.4], [12.6, -5.1], [14.5, -6.5]],
  // Chair → the lesson-board hill: the climb, with natural bends.
  [[0, 0], [-14, -12], [-28, -26], [-48, -46], [-72, -70], [-96, -98]],
  // East, towards the open meadow: the long trail out of the meadow.
  [[1.5, 1.5], [18, 4], [42, 9], [78, 7], [140, 12], [210, 4], [280, 9], [360, -4]],
  // West, towards the highlands.
  [[-1.5, 1.5], [-16, 5], [-42, 11], [-80, 8], [-150, 16], [-220, 6], [-280, 2], [-330, -6]],
  // Secondary spur: meadow clearing → north open fields (connecting path).
  [[2, 3], [12, 28], [28, 55], [48, 82], [70, 110]],
  // Secondary spur: west trail → river crossing approach.
  [[-30, 7], [-18, 2], [-6, -3], [4, -5], [12, -6]],
  // SOUTH-EAST: meadow → the bay. The one trail that reaches the open sea —
  // it follows the coastal gap between the hill sectors, threads the village,
  // and ends at the jetty on the beach. The worn ground is what guides the
  // learner's eye (and feet) from the chair to the water. The last waypoints
  // are pinned to the MEASURED bay shoreline (the terrain crosses sea level
  // at r ≈ 1215 on the bay's azimuth, and the dry beach runs to ~1075).
  // Extra waypoints break the geometric arc into natural dirt meanders.
  [[2, 5], [28, 18], [60, 34], [100, 62], [150, 96], [220, 160], [300, 250],
   [380, 340], [470, 450], [540, 540], [620, 650], [660, 720], [688, 790],
   [706, 880], [700, 940], [686, 1000]],
];

/**
 * Every trail, flattened to segments with their vectors precomputed.
 *
 * `pathWeight` answers hundreds of thousands of queries while the terrain and
 * the grass are built, and the per-segment vectors never change — recomputing
 * them (plus two `sqrt` calls) per query per segment was the hottest waste in
 * the build. `len` is `Math.sqrt(lenSq)`, evaluated once: IEEE sqrt is
 * correctly rounded, so this is bit-identical to computing it per query.
 */
interface TrailSeg {
  ax: number;
  az: number;
  vx: number;
  vz: number;
  lenSq: number;
  len: number;
}

const TRAIL_SEGS: ReadonlyArray<TrailSeg> = (() => {
  const segs: TrailSeg[] = [];
  for (const trail of TRAILS) {
    for (let i = 0; i < trail.length - 1; i += 1) {
      const [ax, az] = trail[i];
      const [bx, bz] = trail[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const lenSq = vx * vx + vz * vz;
      segs.push({ ax, az, vx, vz, lenSq, len: Math.sqrt(lenSq) });
    }
  }
  return segs;
})();

/**
 * The bounding box of every trail, grown by the shoulder width.
 *
 * `pathWeight` runs tens of thousands of times while the world is built, and
 * the overwhelming majority of those queries are out in the far meadow where
 * the answer is "no trail here". A four-comparison box test answers exactly
 * that, before any segment maths at all.
 */
const TRAIL_BOUNDS = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const trail of TRAILS) {
    for (const [x, z] of trail) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const pad = PATH_SHOULDER + 1;
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
})();

/** True when a point is inside the study clearing. */
export function inClearing(x: number, z: number, radius = 3.6): boolean {
  return Math.hypot(x, z) < radius;
}

/**
 * How worn the ground is at a point: 0 (untouched) … 1 (bare, compacted).
 *
 * The clearing itself is not a trail but a "here people stand" disc, so it is
 * folded in on top — that is what stops grass growing through the chair and
 * the desk, and it is why the ground under them reads trodden rather than
 * mown.
 */
export function pathWeight(x: number, z: number): number {
  // The clearing disc is always tested, so the box only short-circuits points
  // that could not be on a trail AND are far outside the trodden circle.
  const b = TRAIL_BOUNDS;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) {
    const dc = Math.hypot(x, z);
    const clearing = Math.max(0, 0.82 * (1 - smoothstep(1.8, 2.6, dc)));
    const yard = 0.62 * beachHouseYardWeight(x, z);
    return yard > clearing ? yard : clearing;
  }

  let w = 0;
  // Irregular path edges + varying width: a perfectly parallel-sided path
  // reads as a decal. Two noise fields — one for edge wobble, one for width
  // breathing — so the dirt ribbon thickens and thins naturally. One pair of
  // noise calls per query (not per trail): this function is called ~60 000
  // times while the grass and the terrain are built.
  const wobble = 0.78 + 0.22 * noise.noise2D(x * 0.19 + 3.1, z * 0.19 - 7.7);
  // Width variation: 0.7× … 1.35× of the authored core/shoulder.
  const widthBreath =
    0.78 + 0.42 * (0.5 + 0.5 * noise.noise2D(x * 0.055 + 41.2, z * 0.055 - 17.6));
  // Grass intrusion: sparse noise that punches holes in the path edge so
  // turf creeps back in irregularly instead of stopping at a hard line.
  const grassBite = noise.noise2D(x * 0.38 + 9.7, z * 0.38 - 14.3);
  for (const s of TRAIL_SEGS) {
    let t = s.lenSq > 0 ? ((x - s.ax) * s.vx + (z - s.az) * s.vz) / s.lenSq : 0;
    t = Math.min(1, Math.max(0, t));
    const px = s.ax + s.vx * t;
    const pz = s.az + s.vz * t;
    const d = Math.hypot(x - px, z - pz);
    // Taper the ends: a trail fades out over its last ~14 m instead of
    // stopping dead, which is how a real path thins to scattered footprints.
    const along = t * s.len;
    const total = s.len;
    const endFade = Math.min(1, along / 14, (total - along) / 14);
    const coreR = PATH_CORE * widthBreath;
    const shoulderR = PATH_SHOULDER * widthBreath;
    let core = 1 - smoothstep(coreR, shoulderR, d);
    // Darker centre: the core is more worn than the shoulders (foot-packed).
    if (d < coreR * 0.55) core = Math.min(1, core * 1.18);
    // Grass intrusion on the outer shoulder — irregular, never a circle.
    if (d > coreR && grassBite > 0.35) core *= 0.55 + 0.45 * (1 - grassBite);
    w = Math.max(w, core * Math.max(0, endFade) * wobble);
  }
  // The clearing: the trodden disc under the chair and desk.
  const d = Math.hypot(x, z);
  w = Math.max(w, 0.82 * (1 - smoothstep(1.8, 2.6, d)));
  // THE HOMESTEADS: the ground each beach house stands on reads as a lived-in
  // yard — bare, swept, compacted — which is what makes a house look occupied
  // instead of dropped. It is fed through THIS function (rather than each
  // scatter learning about houses) so the bare ground, the missing grass, the
  // thinned plants and the packed dirt tint all come from one number.
  // Until `beachHouses.ts` installs its sites this is a single length check.
  w = Math.max(w, 0.62 * beachHouseYardWeight(x, z));

  // ENTRANCE SPURS: a short dirt path from each house door toward the meadow
  // centre, so yards connect logically to the trail network instead of sitting
  // as isolated props on green carpet. Cheap: sites are few (≤6) and the test
  // is a point-to-segment distance with a soft shoulder.
  const houses = beachHouseSites();
  for (let i = 0; i < houses.length; i += 1) {
    const h = houses[i];
    // Door sits on the meadow-facing side of the wall box (local +Z).
    const doorX = h.x + h.sin * h.halfZ * 0.92;
    const doorZ = h.z + h.cos * h.halfZ * 0.92;
    // Spur runs ~18 m from the door toward the origin (meadow).
    const toOriginX = -doorX;
    const toOriginZ = -doorZ;
    const toLen = Math.hypot(toOriginX, toOriginZ) || 1;
    const spurLen = Math.min(18, toLen * 0.35);
    const ex = doorX + (toOriginX / toLen) * spurLen;
    const ez = doorZ + (toOriginZ / toLen) * spurLen;
    const vx = ex - doorX;
    const vz = ez - doorZ;
    const lenSq = vx * vx + vz * vz;
    let t = lenSq > 0 ? ((x - doorX) * vx + (z - doorZ) * vz) / lenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = doorX + vx * t;
    const pz = doorZ + vz * t;
    const d = Math.hypot(x - px, z - pz);
    const spur = 1 - smoothstep(0.55, 2.1, d);
    if (spur > w) w = spur * 0.88;
  }

  return Math.min(1, w);
}

// ─────────────────────────────────────────────────────────────────────────
//  Small maths helpers (kept local: terrain.ts has its own copies and they
//  must stay independent so neither module has to import the other's)
// ─────────────────────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ─────────────────────────────────────────────────────────────────────────
//  The site descriptor
// ─────────────────────────────────────────────────────────────────────────

export type Biome =
  | "meadow"
  | "riverbank"
  | "beach"
  | "woodland"
  | "slope"
  | "highland"
  | "summit";

export interface Site {
  /** Ground height, metres. */
  height: number;
  /** Slope in degrees, 0 (flat) … 90 (cliff). */
  slopeDeg: number;
  /** World normal Y — 1 on a flat pan, 0 on a vertical cliff. */
  normalY: number;
  /** Downhill direction, unit vector in XZ. Zero on a flat pan. */
  downhillX: number;
  downhillZ: number;
  /** Drainage accumulation, 0 (ridge) … 1 (main channel). */
  wetness: number;
  /** How much this facet faces AWAY from the sun. 0 sun-facing, 1 shade side. */
  shade: number;
  /** How much this facet faces the sun (the favoured side for growth). */
  sunFacing: number;
  /** Soil depth: deep on flats and in valleys, ~0 on rock faces. */
  soil: number;
  /** Height band within the world, 0 … 1. */
  altitude: number;
  /** Worn-ground weight, 0 … 1. */
  path: number;
  /** Proximity to open water, 0 … 1. */
  nearWater: number;
  /**
   * Proximity to the OPEN SEA, 0 (inland) … 1 (water's edge).
   *
   * This is the beach mask the whole coastal system reads — palms, sand
   * colour, grass thinning, rock bleaching — and it is measured from the
   * height above OCEAN_LEVEL, so it always agrees with where the ocean mesh
   * actually floods the ground.
   */
  coastal: number;
  /** Competition for light — drives bare lower trunks and high canopies. */
  crowding: number;
  biome: Biome;
}

/** A fresh site record. Reuse it (`siteAt(x, z, record)`) in hot loops. */
export function createSite(): Site {
  return {
    height: 0,
    slopeDeg: 0,
    normalY: 1,
    downhillX: 0,
    downhillZ: 0,
    wetness: 0,
    shade: 1,
    sunFacing: 0,
    soil: 1,
    altitude: 0,
    path: 0,
    nearWater: 0,
    crowding: 0,
    coastal: 0,
    biome: "meadow",
  };
}

/**
 * Classify the ground at (x, z) — the full descriptor.
 *
 * The slope is measured by central differences over 2.4 m, which is the
 * scale the eye judges a hillside at: sampling at 0.6 m would report every
 * molehill as a cliff and every prop would be placed as if it were on rock.
 */
export function siteAt(x: number, z: number, out: Site = createSite()): Site {
  const e = 1.2;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  const height = terrainHeight(x, z);
  const dx = (hL - hR) / (2 * e);
  const dz = (hD - hU) / (2 * e);
  const gradient = Math.hypot(dx, dz);
  out.height = height;
  out.slopeDeg = (Math.atan(gradient) * 180) / Math.PI;
  out.normalY = 1 / Math.sqrt(1 + gradient * gradient);
  if (gradient > 1e-5) {
    out.downhillX = dx / gradient;
    out.downhillZ = dz / gradient;
  } else {
    out.downhillX = 0;
    out.downhillZ = 0;
  }

  out.wetness = flowWetness(x, z);
  out.path = pathWeight(x, z);
  // Distance from the river channel, faded over ~25 m: the banks are damp
  // long before they are wet, and that band is what grows differently.
  const fromRiver = Math.abs(x - RIVER_CENTER_X);
  out.nearWater = 1 - smoothstep(9, 34, fromRiver);

  // COASTAL — how close this spot is to the open sea. Two masks, both from
  // the same source of truth: the height above OCEAN_LEVEL (the level the
  // ocean mesh actually floods to) AND the geographic coast ring. The ring is
  // what keeps inland low spots — the sheltered hollows, the study
  // clearing at 0 m — grass-green: they are low, but they are nowhere near
  // the sea. The height band is generous, 11 m above the sea, because the
  // beach is a ZONE (dry crest, light sand, wet sand), not a line.
  const shoreUp = height - OCEAN_LEVEL;
  out.coastal = coastWeight(x, z) * (1 - smoothstep(1.1, 11, shoreUp));

  // Aspect, in the sun's frame. The sun sits on the -Z side, so a facet whose
  // downhill direction points +Z is a shade-side slope.
  const flat = out.slopeDeg < 3;
  const facing = flat ? 0 : out.downhillX * SUN_SIDE_X + out.downhillZ * SUN_SIDE_Z;
  out.shade = clamp01(0.5 + 0.5 * (flat ? 0.35 : facing));
  out.sunFacing = 1 - out.shade;

  out.altitude = clamp01(height / 100);
  // Soil: deep on flats and in wet valleys; stripped on steep ground and on
  // the wind-blasted ridges up high. This is the value that decides whether a
  // tree gets a root flare or a bare rock gets scattered scree (research §1).
  const thin = clamp01(out.slopeDeg / 34) * 0.75 + clamp01((height - 26) / 30) * 0.45;
  out.soil = clamp01(1 - thin + out.wetness * 0.22);

  // Light competition. Trees crowd in the woodland away from the clearing and
  // thin out on the high ground where nothing tall survives.
  const r = Math.hypot(x, z);
  const grove = smoothstep(16, 150, r) * (1 - smoothstep(220, 400, r));
  out.crowding = clamp01(0.2 + grove * (0.55 + 0.45 * noise.noise2D(x * 0.006 + 21.7, z * 0.006 - 8.3))
    - clamp01((height - 30) / 34) * 0.7);

  const bare = out.slopeDeg > 41 || out.soil < 0.16;
  if (height > 62) out.biome = "summit";
  else if (out.coastal > 0.62 && out.slopeDeg < 12) out.biome = "beach";
  else if (height > 24) out.biome = bare ? "slope" : "highland";
  else if (out.nearWater > 0.55 && out.slopeDeg < 18) out.biome = "riverbank";
  else if (bare) out.biome = "slope";
  else if (out.crowding > 0.66) out.biome = "woodland";
  else out.biome = "meadow";

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
//  Ground colour — the cheap entry point (research §8, §10, §11)
// ─────────────────────────────────────────────────────────────────────────

/**
 * How dry the soil is here, 0 (lush hollow) … 1 (bare rise).
 *
 * One low-frequency noise sample, wavelength a few hundred metres, so a dry
 * tract is a field. It is then cut by the drainage grid and by height: a
 * channel stays green even inside a dry belt, and a rise goes fallow even
 * inside a green one. That is a real plain — dry ground in every district,
 * following the land, not speckled ovals. The study clearing stays mostly
 * lawn, but the rises there still show a little dry soil.
 *
 * One noise2D plus the wetness lookup the caller already paid for. This is
 * the terrain's vertex-colour loop (≈150 k) and the grass scatter (≈60 k);
 * do not add another octave.
 */
export function dryCover(x: number, z: number, h: number, wet = 0): number {
  // Green is the ground. Desert is the rises that shed water, plus a thin
  // wash on drained soil so no district is only lawn. The old rise started
  // at h = −0.35, so ordinary meadow counted as desert and the whole island
  // went to sand. Hollows and the study stay grass. A noise oval is still
  // not the shape — height and drainage are.
  const belt = noise.noise2D(x * 0.0022 + 4.8, z * 0.0019 - 2.2) * 0.5 + 0.5;
  const drained = 1 - Math.min(1, wet * 2.1);
  const rise = smoothstep(1.35, 4.6, h);
  const wash = 0.07 * drained * (0.35 + 0.65 * belt);
  let dry = rise * (0.28 + 0.55 * belt) * (0.2 + 0.8 * drained);
  if (dry < wash) dry = wash;
  // A little bare earth on every rise, even inside a greener belt.
  const floor = rise * 0.12 * drained;
  if (dry < floor) dry = floor;
  const clearing = 1 - smoothstep(16, 40, Math.hypot(x, z));
  dry *= 1 - clearing * 0.55;
  return dry < 0 ? 0 : dry > 0.78 ? 0.78 : dry;
}

/**
 * THE HILL TURF MASK — how much a point on a hill is CLOTHED, 0 … 1.
 *
 * `dryCover`'s rise ramp is what gave the meadow its dry rises, and it is
 * correct down in the clearing: 4 m of relief is a bank that sheds water.
 * Carried up a 90 m pahad it said the opposite of what the world looks like:
 * the whole sanctuary rim, the lesson hill and the western Highlands came out
 * earth-and-scree tinted from top to bottom — the bare pahads the owner's
 * reference file (`pahadon ke upar gras replace hill.blend`) exists to argue
 * against. Its mound is green to its summit, with the mat growing on every
 * part of it.
 *
 * So the hills get their own rule, and it is the same rule their 3-D cover
 * uses (`hillGrass.ts`), expressed on the same two measurements:
 *
 *   1. ALTITUDE  a hill, not a bank — full past 14 m of height.
 *   2. FOOTING   soil cannot cling past ~52° (`normalY` 0.62); turf holds to
 *                0.8 and gives way below it, which keeps the mountain faces
 *                and the cliff bands reading as ROCK, exactly as they do in
 *                the reference file's shaly outcrops.
 *   3. THE COAST keeps its bleached sand and sea-cliff albedo.
 *
 * The result is multiplied into `dry` inside `groundColorAt`, so the terrain
 * colour, the grass, the tufts and the flowers all agree by construction —
 * and because it is a pure function of the same height field everything else
 * reads, it costs no extra samples.
 */
export function hillTurf(h: number, normalY: number, coastal: number): number {
  const rise = smoothstep(2.5, 14, h);
  const hold = smoothstep(0.55, 0.8, normalY);
  const inland = 1 - Math.min(1, Math.max(0, coastal));
  return rise * hold * inland;
}


/**
 * The albedo of the ground at a point, as a rule-based blend.
 *
 * This is the game-engine version of a Landscape Material with weight-blended
 * splat maps (§8), except the splat weights are not textures — they are the
 * measured properties of the terrain itself, so nothing has to be painted and
 * nothing can disagree with the height field:
 *
 *   slope     → bare rock on the faces steeper than soil can cling to
 *   drainage  → wet, dark soil in the channels and lush growth on the flats
 *   path      → compacted dirt and gravel where feet have worn the grass off
 *   altitude  → the rock band and the snowline
 *
 * Colours come from the art-direction palette and are clamped to the physical
 * albedo range (nothing in nature is pure black or pure white — §10,
 * principle 11), then given the subtle warm/cool hue drift that stops a large
 * surface reading as one flat colour.
 */
/**
 * Procedural grass DENSITY field, 0 (bare) … 1 (dense sward).
 *
 * This is the single source of truth for "how much grass belongs here". The
 * grass scatter, tufts and tropical undergrowth all read it so bare patches,
 * dense clusters and path shoulders agree by construction — never a uniform
 * carpet of identical sticks.
 *
 * Driven by multi-scale noise + moisture + path wear + slope + coast, so the
 * field naturally forms dense → medium → sparse → bare → dense patches.
 */
export function grassDensityAt(x: number, z: number, h?: number, wornIn?: number): number {
  const height = h ?? terrainHeight(x, z);
  const wet = flowWetness(x, z);
  const worn = wornIn ?? pathWeight(x, z);
  const coast = coastWeight(x, z);

  // Multi-scale density noise: broad ~40 m fields + ~12 m clumps + ~4 m tufts.
  const broad = noise.noise2D(x * 0.025 + 2.7, z * 0.025 - 5.1) * 0.5 + 0.5;
  const clump = noise.noise2D(x * 0.08 + 17.3, z * 0.08 - 9.4) * 0.5 + 0.5;
  const tuft = noise.noise2D(x * 0.22 + 41.6, z * 0.22 + 3.8) * 0.5 + 0.5;
  let d = broad * 0.48 + clump * 0.34 + tuft * 0.18;

  // Moist hollows grow denser; dry rises thin out.
  d *= 0.72 + wet * 0.45;
  const dry = dryCover(x, z, height, wet);
  d *= 1 - dry * 0.55;

  // Paths: gradual thin-out across the shoulder, bare on the core.
  d *= 1 - clamp01(worn * 1.55);

  // Beach: sand owns the shore; only sparse dune grass remains.
  const shoreUp = height - OCEAN_LEVEL;
  if (coast > 0.05) {
    d *= 1 - clamp01(coast * (1 - smoothstep(1.5, 5.5, shoreUp)) * 0.92);
  }

  // Village yards and the study clearing are worn, not lawn.
  const r = Math.hypot(x, z);
  if (r < 8) d *= smoothstep(2.2, 7.5, r);

  // Bare-patch punch: occasional open soil islands inside otherwise dense turf.
  const bare = noise.noise2D(x * 0.045 - 28.1, z * 0.045 + 14.7);
  if (bare > 0.62) d *= 0.15 + (1 - bare) * 0.5;

  // River edges denser (moist bank vegetation), channel itself is bare water.
  const fromRiver = Math.abs(x - RIVER_CENTER_X);
  if (fromRiver < 22 && fromRiver > 7) d = Math.min(1, d * 1.25);

  return clamp01(d);
}

export function groundColorAt(
  x: number,
  z: number,
  h: number,
  out: THREE.Color,
  palette: GroundPalette,
  normalY = 1,
  /**
   * The worn weight, if the caller has already measured it.
   *
   * The terrain mesh samples 150 000 of these and needs the same number itself
   * for its gravel tint; the grass samples 60 000. Passing it in halves the
   * trail-distance work in the two hottest build loops, and the default keeps
   * every other caller honest.
   */
  wornIn?: number,
): THREE.Color {
  const wet = flowWetness(x, z);
  const worn = wornIn ?? pathWeight(x, z);
  // The coast mask is read here (not further down) because the hill-turf rule
  // has to know whether this slope is a sea cliff before the base colour is
  // mixed — one call, one source of truth, no second ring test.
  const coast = coastWeight(x, z);

  // ── Base: lush ↔ dry grass ────────────────────────────────────────
  // Soft multi-material blend. Dry rises lean yellow-olive (not neon green
  // carpet); moist hollows stay deeper green. Soft irregular noise breaks
  // any circular boundary the eye could latch onto.
  const dry = dryCover(x, z, h, wet) * (1 - 0.74 * hillTurf(h, normalY, coast));
  // Irregular mottling so material zones never form obvious circles.
  const mottling = noise.noise2D(x * 0.031 + 6.2, z * 0.029 - 4.8) * 0.12;
  out.copy(palette.lush).lerp(palette.dry, clamp01(dry * 0.78 + mottling));

  // ── Exposed soil around paths / yards (disturbed ground) ──────────
  // Soft soil halo just outside the packed dirt core — grass intrusion
  // zone that reads as earth rather than chalk-white gravel.
  const soilHalo = clamp01(worn * 0.9 - 0.08) * (1 - clamp01(worn * 1.4));
  if (soilHalo > 0.01) {
    // Warm brown soil, slightly darker than the path centre.
    out.r = out.r * (1 - soilHalo * 0.35) + 0.42 * soilHalo;
    out.g = out.g * (1 - soilHalo * 0.35) + 0.32 * soilHalo;
    out.b = out.b * (1 - soilHalo * 0.35) + 0.18 * soilHalo;
  }

  // ── Drainage: mossy darkening / wet ground near water ─────────────
  out.lerp(palette.mud, clamp01(wet * 0.62 - 0.14));

  // ── THE BEACH GRADIENT ────────────────────────────────────────────
  // Soft irregular transitions: water → wet sand/mud → sparse shore → grass.
  // Long-wave noise breaks contour-line banding.
  const shoreUp = h - OCEAN_LEVEL;
  if (shoreUp < 14 && coast > 0.02) {
    const swash = noise.noise2D(x * 0.045 + 9.3, z * 0.045 - 2.8) * 1.15
      + noise.noise2D(x * 0.11 - 2.1, z * 0.11 + 7.4) * 0.35;
    const drySand = (1 - smoothstep(2.0 + swash, 6.2 + swash, shoreUp)) * coast;
    out.lerp(palette.sand, clamp01(drySand));
    const wetSand = (1 - smoothstep(-0.35 + swash * 0.45, 1.15 + swash * 0.45, shoreUp)) * coast;
    out.lerp(palette.sandWet, clamp01(wetSand));
    // Wet mud band just above the waterline — soft transition, not a hard edge.
    const wetMud = (1 - smoothstep(0.4 + swash * 0.3, 2.4 + swash * 0.3, shoreUp))
      * coast * 0.35;
    out.lerp(palette.mud, clamp01(wetMud));
    if (shoreUp < 0.2) {
      const under = clamp01((0.2 - shoreUp) / 5.5) * coast;
      out.lerp(palette.sandUnder, under * 0.8);
      out.lerp(palette.deep, clamp01((0.2 - shoreUp) / 11) * coast);
    }
  }

  // ── Slope: rock on steep faces + rocky outcrop noise ──────────────
  // Steep faces show stone; a secondary noise field creates occasional
  // rocky patches on moderate slopes (exposed rock formations).
  const steep = clamp01((0.8 - normalY) / 0.18);
  // Minority rock mix — stone UNDER the sward (contract: steep * 0.38).
  // A secondary noise field adds occasional rocky patches on moderate slopes
  // without replacing the green majority on steep faces.
  out.lerp(palette.rock, steep * 0.38);
  const rockPatch = noise.noise2D(x * 0.04 + 55.1, z * 0.04 - 22.3);
  if (rockPatch > 0.58) {
    out.lerp(palette.rock, clamp01(rockPatch - 0.58) * 0.22 * clamp01((0.92 - normalY) / 0.2));
  }

  // ── The worn dirt path ────────────────────────────────────────────
  // Packed earth centre (darker), lighter shoulder — never pure white.
  // Soft irregular edges come from pathWeight's own noise already.
  if (worn > 0.02) {
    const pathAmt = clamp01(worn * 1.15);
    // Darker centre: multiply slightly before the dirt lerp so the middle
    // of a trail reads foot-worn rather than painted beige.
    const centreDark = clamp01(worn - 0.35) * 0.18;
    out.r *= 1 - centreDark;
    out.g *= 1 - centreDark * 0.95;
    out.b *= 1 - centreDark * 0.85;
    out.lerp(palette.gravel, pathAmt * 0.85);
    // Occasional small stone flecks on the path (subtle value noise).
    const grit = noise.noise2D(x * 0.55 + 3.1, z * 0.55 - 7.2);
    if (grit > 0.55 && worn > 0.25) {
      out.lerp(palette.rock, (grit - 0.55) * 0.35 * worn);
    }
  }

  // ── Hue drift: subtle, not neon ───────────────────────────────────
  // Soft saturation lift on sunlit flats — restrained so the meadow stays
  // natural green rather than glowing arcade grass.
  const flatFace = clamp01((normalY - 0.83) / 0.17);
  out.offsetHSL(0, 0.035 * flatFace, 0.012 * flatFace * (1 - wet));

  return out;
}

/** The colours the ground blends between. Authored once, in `palette.ts`. */
export interface GroundPalette {
  lush: THREE.Color;
  dry: THREE.Color;
  mud: THREE.Color;
  rock: THREE.Color;
  gravel: THREE.Color;
  /** Dry beach sand, pale and warm. */
  sand: THREE.Color;
  /** Tide-wet sand: darker and more saturated, right at the waterline. */
  sandWet: THREE.Color;
  /** Sand under the water column: the teal shift of the shallow shelf. */
  sandUnder: THREE.Color;
  snow: THREE.Color;
  deep: THREE.Color;
}
