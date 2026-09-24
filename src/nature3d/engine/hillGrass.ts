// src/nature3d/engine/hillGrass.ts
//
// THE HILL COVER — grass on EVERY hill, slope and pahad, in the recipe
// measured off the owner's reference file
// `pahadon ke upar gras replace hill.blend` (repository root).
//
// ── What the reference file actually is (measured, not guessed) ─────────
//
// The .blend is a 2 m × 2 m reference plot: a 65 × 65 height-field mound
// (relief 0.543 m, slopes to 35°) dressed with 5 000 instanced clumps —
// 1 250 clumps per square metre, i.e. a continuous grass MAT, not a scatter
// of individual plants. Dumping the scene (objects, matrices, vertex data)
// gives the recipe exactly:
//
//   family                count   share    scale band      tilt from vertical
//   Grass_Basic_A         1 666   33.3 %   0.106 … 0.148   uniform 0 … 32°
//   Grass_Basic_D         2 334   46.7 %   0.106 … 0.149   uniform 0 … 32°
//   Flower_Daisy_A        1 000   20.0 %   0.121 … 0.149   uniform 0 … 18°
//
//   * YAW is a full 2π (the histogram is flat to ±8 % across 24 bins).
//   * TILT is a uniform tilt AWAY FROM VERTICAL with a random azimuth — the
//     clumps are NOT aligned to the surface normal (mean 16.6° off vertical,
//     cap 32°; the daisy is the upright one at 18°). On a 35° slope that is
//     what makes the mat look shaggy instead of combed.
//   * ROOTING: every clump sits ON the surface (mean +2.4 mm, spread
//     ±20 mm) — never floating, never buried.
//   * PLACEMENT is a uniform random scatter: the 16 × 16 cell histogram has a
//     coefficient of variation of 26 % against Poisson's 22.6 %, so there is
//     only the mildest clustering. The "patchy" look of the reference render
//     is the CLUMPS' own sparse silhouettes, not a density mask.
//   * The 0.2-tall clump against the 0.543 m mound gives the scale rule that
//     travels to this world: CLUMP HEIGHT ≈ 5 % OF THE RELIEF it grows on.
//   * NO ANIMATION. The file carries zero actions and zero particle systems,
//     so there is nothing animated to port (checked: `bpy.data.actions` is
//     empty). What the world gets instead is the sanctuary's own wind
//     contract — the same three-sine vertex sway the meadow grass uses — so
//     the hills breathe with the field the learner is standing in.
//
// ── Why this file exists at all ────────────────────────────────────────
//
// `grass.ts` and `grassTufts.ts` dress the MEADOW: a blade field out to
// `grassFarRadius` (145–420 m by tier) and real 3-D clumps in a 4–70 m ring.
// Everything beyond that — the sanctuary's ring of hills at 460 m, the
// lesson hill at 380 m, the whole western Highlands at 700 m and the
// mountain arc that closes the horizon at 1 180 m — was bare terrain
// colour, and the owner's brief is explicit: "jitne bhi hills aur stones
// aur pahadiya hai, sabhi pe grass".
//
// ── How a 1.2 km cover stays cheap ─────────────────────────────────────
//
//   * THREE BELTS, one `InstancedMesh` each, nested around the world origin
//     and starting where the meadow's own far ring fades (`grassFarRadius`,
//     so no belt ever double-covers ground the blade field already planted):
//
//         belt 1  foothills    wind-swayed, 1.6 – 3.2 m clumps
//         belt 2  ridges       static,      3.0 – 6.0 m clumps
//         belt 3  the ranges   static,      5.0 – 10.0 m clumps
//
//     Clumps GROW with distance, exactly the way the blade field's far ring
//     does: a 2 m clump is invisible at 800 m, and what the eye reads at that
//     range is the mat's silhouette, never a single blade. Belt 3's band
//     (5–10 m over the 90–100 m relief of the outer arc) is the reference
//     file's own 5 %-of-relief rule, applied at world scale.
//   * ONE CARD GEOMETRY per card count, built once and shared, 2 or 3
//     crossed tapered blades — 4 or 6 triangles — cut out by the same blade
//     texture the blade field uses. No new asset, no texture fetch, no
//     sorting (alpha TEST, never alpha blend).
//   * TWO MATERIALS (`sway` for belt 1, `still` for 2 and 3). Past ~450 m the
//     sway is sub-pixel, so the two far belts compile a program with no wind
//     ALU in it at all — the same "wind OFF on the far LOD" rule the blade
//     field follows.
//   * THE FOOTING RULE: the reference's off-vertical tilt is applied off the
//     SURFACE NORMAL here, with the same magnitude and distribution. On the
//     35° mound of the reference file an unaligned clump leaves no visible
//     gap; on a 45° pahad seen from 300 m it leaves daylight under half the
//     clump, so the tilt rides on a slope-aligned frame instead.
//
// The field is deterministic (seeded RNG), so the hills are the same hills
// on every load, on every device, at every tier.

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import { coastWeight, insideRiver, OCEAN_LEVEL, terrainHeight } from "./terrain";
import { insideWarehouse } from "./warehouseSite";
import { REGIONS, WORLD_REACH } from "./regions";
import { flowWetness, groundColorAt, pathWeight } from "./environment";
import { GROUND_PALETTE } from "./palette";
import { noise } from "./simplex";

export interface HillGrassField {
  group: THREE.Group;
  /** The two belt materials, published for the atmosphere + winter passes. */
  materials: THREE.Material[];
  /** How many clumps were planted, by belt — for the HUD/QA readout. */
  counts: readonly [number, number, number];
  update(time: number, windStrength: number): void;
  /**
   * Thermal fail-safe ladder, allocation-free (visibility + count only):
   *   0 = all three belts · 1 = the horizon belt hides · 2 = the ridge belt too.
   */
  setShed(level: number): void;
  dispose(): void;
}

/**
 * THE RECIPE, as measured from the reference file.
 *
 * Published (not just commented) so the numbers can be re-verified against
 * the .blend without reading the scatter code: every value below was dumped
 * out of the scene graph, and `SANCTUARY_HILL_GRASS.md` records the commands
 * that produced it.
 */
export const BLEND_HILL_RECIPE = {
  /** The reference plot: 2 m × 2 m, 65 × 65 vertices, 0.543 m of relief. */
  plotMetres: 2,
  plotRelief: 0.543,
  /** 5 000 clumps over 4 m² = 1 250 clumps/m² — a mat, not a scatter. */
  clumps: 5000,
  clumpsPerSquareMetre: 1250,
  /** Family mix, in the reference file's own counts. */
  families: [
    { id: "grassA", share: 0.333, scale: [0.106, 0.148] as const, tiltDeg: 32 },
    { id: "grassD", share: 0.467, scale: [0.106, 0.149] as const, tiltDeg: 32 },
    { id: "daisy", share: 0.200, scale: [0.121, 0.149] as const, tiltDeg: 18 },
  ],
  /** Tilt is off-vertical (here: off the slope normal) — never combed. */
  tiltFromVertical: true,
  /** Rooted on the surface: mean +2.4 mm, ±20 mm. */
  rootOffset: { mean: 0.0024, spread: 0.02 },
  /** Clump height ÷ the relief it grows on, from the reference plot. */
  clumpToRelief: 0.049,
  /** The file is STATIC — no actions, no particle systems, nothing to port. */
  animated: false,
} as const;

/**
 * One belt.
 *
 * Radii derive from the tier's own meadow radius so the cover always starts
 * exactly where `grass.ts` stops — 0.92× the far ring, which is inside the
 * ring's own 12 %-fade band, so the hand-off between the two fields is a
 * crossfade rather than a seam.
 */
interface Belt {
  inner: number;
  outer: number;
  count: number;
  /** Clump height at the belt's inner edge … outer edge, in metres. */
  heightIn: number;
  heightOut: number;
  /**
   * Clump width ÷ height. The reference clumps are WIDE and low (0.74 wide
   * against 0.208 tall — a splayed tuft, not a blade), and width is what
   * covers ground: the far belts widen so a handful of clumps still reads as
   * a mat at 1 km, instead of the eye counting individual blades.
   */
  widthRatio: number;
  cards: number;
  sway: boolean;
}

function beltsFor(budget: QualityBudget): Belt[] {
  const start = Math.max(60, budget.grassFarRadius * 0.92);
  const reach = WORLD_REACH; // 1 180 m — the outer mountain arc
  const span = reach - start;
  // The belts take 28 / 34 / 38 % of the span: the foothills are the band the
  // camera actually studies, the ranges are mostly silhouette.
  const edges = [start, start + span * 0.28, start + span * 0.62, reach];
  return [
    { inner: edges[0], outer: edges[1], count: budget.hillGrassNear, heightIn: 1.6, heightOut: 3.2, widthRatio: 0.85, cards: 3, sway: true },
    { inner: edges[1], outer: edges[2], count: budget.hillGrassFar, heightIn: 3.0, heightOut: 6.0, widthRatio: 2.0, cards: 3, sway: false },
    { inner: edges[2], outer: edges[3], count: budget.hillGrassHaze, heightIn: 5.0, heightOut: 10.0, widthRatio: 3.0, cards: 2, sway: false },
  ];
}

/**
 * A tuft: `cards` unit-height blades crossed about the trunk, each one
 * tapered to a point and given its own small lean, so the clump reads as a
 * splayed tuft from every angle instead of as a symmetrical star. Two
 * triangles per blade, so a three-card clump is SIX triangles.
 *
 * Unit height with the BASE AT THE ORIGIN, so an instance scale IS the clump
 * height in metres and the wind shader's bend factor is a plain clamp.
 */
function tuftGeometry(cards: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  // ONE segment per card: a tapered quad with its tip pulled over. A second
  // segment would only add a curve that is invisible past the belt's own
  // 130 m inner edge, at double the triangles — and this field is drawn
  // 50–70 thousand times on a desktop tier.
  const SEGMENTS = 1;
  for (let c = 0; c < cards; c += 1) {
    const yaw = (c / cards) * Math.PI + (c % 2) * 0.42;
    const lean = (c % 2 === 0 ? 1 : -1) * 0.12;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const base = positions.length / 3;
    for (let s = 0; s <= SEGMENTS; s += 1) {
      const t = s / SEGMENTS;
      // Taper: full width at the root, a point at the tip (the grass idiom).
      const halfWidth = 0.5 * (1 - t * 0.9);
      // The forward curl of a blade that has grown and turned over.
      const curl = lean * t * t * 0.24;
      for (let side = 0; side < 2; side += 1) {
        const x = (side === 0 ? -halfWidth : halfWidth) + curl * 0.4;
        const z = -curl;
        positions.push(x * cos - z * sin, t, x * sin + z * cos);
        uvs.push(side, t);
      }
    }
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a = base + s * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Deterministic RNG — the hills must be the same hills on every load. */
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
 * The patch field. Its own offsets and its own frequency pair, so the hills'
 * thickets never line up with the meadow's — the same rule the sorrel and
 * the tuft field follow, so no two covers read as one stamped carpet.
 */
function patchDensity(x: number, z: number): number {
  return (
    noise.noise2D(x * 0.0043 - 137.7, z * 0.0043 + 61.3) * 0.66 +
    noise.noise2D(x * 0.021 + 22.9, z * 0.021 - 8.4) * 0.34
  );
}

/**
 * The slope, and the surface normal, from the height field itself.
 *
 * `siteAt` answers this too, but it prices drainage, trails, the coast ring
 * and the soil model as well: five height samples and three field queries per
 * call. The hill cover plants tens of thousands of clumps over the whole
 * 1.2 km world, so it reads the two numbers it actually needs — degrees of
 * slope and a footing frame — and pays for the rest only on the near belt,
 * where trails, the river and the warehouse pad can actually reach a clump.
 *
 * The gradient convention matches `siteAt`'s (`downhill` is +x/+z of the
 * fall), so the normal built here and the one the rest of the world uses are
 * the same normal.
 */
function slopeAt(x: number, z: number, outNormal: THREE.Vector3): number {
  const e = 1.2;
  const dx = (terrainHeight(x - e, z) - terrainHeight(x + e, z)) / (2 * e);
  const dz = (terrainHeight(x, z - e) - terrainHeight(x, z + e)) / (2 * e);
  const gradient = Math.hypot(dx, dz);
  outNormal.set(dx, 1, dz).normalize();
  return (Math.atan(gradient) * 180) / Math.PI;
}

/**
 * The same answer for the two FAR belts, at half the height samples.
 *
 * A clump 600–1 180 m away is a couple of centimetres on screen: its footing
 * has to be right to a few degrees, not to a fraction of one, and the belt
 * that far out is 28 000 instances on the desktop tier. One diagonal pair of
 * samples (2 height reads instead of 4) is the trade this file makes, and it
 * is invisible: the belt's own size gain swamps the error in the silhouette.
 */
function slopeAtCoarse(x: number, z: number, outNormal: THREE.Vector3): number {
  const e = 2.2;
  const along = (terrainHeight(x - e, z - e) - terrainHeight(x + e, z + e)) / (2 * e * Math.SQRT2);
  const across = (terrainHeight(x - e, z + e) - terrainHeight(x + e, z - e)) / (2 * e * Math.SQRT2);
  const gradient = Math.hypot(along, across);
  // Same axes as the fine version: x runs along the first diagonal pair.
  outNormal.set(along, 1, across).normalize();
  return (Math.atan(gradient) * 180) / Math.PI;
}

/**
 * How far a point is from the NEAREST district centre.
 *
 * The belts are nested around the origin because that is where the density
 * has to fall off, but the world has TWO districts — the home meadow and the
 * western Highlands 700 m away — and a clump's SIZE has to follow the piece
 * of world it stands in, not its distance from a point in another district.
 * Measured from the origin, a clump on the trek's own meadow would be a mid-
 * belt giant (4.5 m) standing beside a camera that is 30 m away from it.
 * Measured from the nearest district, it is the 2 m tuft it should be.
 */
function districtDistance(x: number, z: number): number {
  let best = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.centerX, z - r.centerZ);
    if (d < best) best = d;
  }
  return best;
}

/** The band a district-distance falls in — which sets the clump's size. */
function bandFor(d: number, belts: Belt[]): Belt {
  for (const belt of belts) {
    if (d <= belt.outer) return belt;
  }
  return belts[belts.length - 1];
}

export function createHillGrassField(
  bladeTex: THREE.Texture,
  budget: QualityBudget,
): HillGrassField {
  const group = new THREE.Group();
  group.name = "hill-grass-field";
  const shadows = budget.shadowMapSize > 0;
  const rand = mulberry32(0x51a1_9e11);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const ground = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const UP = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const qAlign = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  const makeMaterial = (sway: boolean) => {
    const material = new THREE.MeshLambertMaterial({
      map: bladeTex,
      // A tight cut (the blade field uses 0.5): fewer surviving transparent
      // texels, less overdraw, a sharper silhouette on the ridge line.
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      vertexColors: true,
    });
    if (sway) material.onBeforeCompile = (shader) => injectWind(shader, material);
    // Distinct program per belt class so the still belts compile the wind out.
    material.customProgramCacheKey = () => (sway ? "dc-hill-grass-sway" : "dc-hill-grass-still");
    return material;
  };
  const swayMaterial = makeMaterial(true);
  const stillMaterial = makeMaterial(false);

  const belts = beltsFor(budget);
  const cards = belts.map((belt) => tuftGeometry(belt.cards));
  const meshes = belts.map((belt, i) => {
    const mesh = new THREE.InstancedMesh(
      cards[i],
      belt.sway ? swayMaterial : stillMaterial,
      belt.count + 8,
    );
    mesh.name = `hill-grass-belt-${i + 1}`;
    // Never cast: alpha-tested foliage in the shadow pass is 2× overdraw for
    // shadows the ground's baked AO gradient already sells.
    mesh.castShadow = false;
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = true;
    // The shader displaces vertices, so the auto bounds would clip clumps at
    // the screen edge. One generous sphere at the world origin covers the
    // belt's whole annulus (the blade field's rings do the same).
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), belt.outer + 14);
    group.add(mesh);
    return mesh;
  });

  // ── The scatter ─────────────────────────────────────────────────────
  //
  // Area-uniform sampling across the annulus (sqrt on the radius), then the
  // reference recipe's own family mix, tilt cap and scale band. The family is
  // drawn first, so the mix lands on the measured 33.3 / 46.7 / 20 %.
  const families = BLEND_HILL_RECIPE.families;
  const familyOf = (r: number): number => (r < families[0].share ? 0 : r < families[0].share + families[1].share ? 1 : 2);
  const counts: [number, number, number] = [0, 0, 0];
  const fullCounts: [number, number, number] = [0, 0, 0];
  // The tint's three channels, rebuilt per clump: the ground's colour on the
  // near belt, a height-driven stand-in on the two far ones.
  let tintHue = 0.3;
  let tintSat = 0.58;
  let tintLit = 0.5;

  belts.forEach((belt, beltIndex) => {
    const mesh = meshes[beltIndex];
    const span = belt.outer - belt.inner;
    const near = beltIndex === 0;
    let placed = 0;
    let guard = 0;
    while (placed < belt.count && guard < belt.count * 30) {
      guard += 1;
      const r = Math.sqrt(rand()) * span + belt.inner;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // The patch field: thickets and open ground across the whole range.
      const patch = patchDensity(x, z);
      const richness = Math.min(1, Math.max(0, (patch + 1) / 2));
      if (rand() > 0.38 + 0.62 * richness) continue;

      // Water first, before anything reads the terrain: the sea covers the
      // whole rim of the world past ~1 km, and the cover must never grow on it.
      const y = terrainHeight(x, z);
      const shoreUp = y - OCEAN_LEVEL;
      if (shoreUp < 1.0) continue;
      const coastal = coastWeight(x, z);
      if (coastal > 0.02 && shoreUp < 3.2) continue;

      // Slope: full cover to 34°, then a linear fall to a quarter at 60°. A
      // cliff keeps scraps in its cracks — that is what the ramp models, and
      // the meadow's old hard 30° veto is exactly what left the pahads bare.
      const slopeDeg = near ? slopeAt(x, z, normal) : slopeAtCoarse(x, z, normal);
      if (slopeDeg > 34) {
        const keep = 1 - (Math.min(slopeDeg, 60) - 34) / 26;
        if (rand() > 0.22 + 0.78 * Math.max(0, keep)) continue;
      }
      // High ground keeps grass — a summit pasture, not a desert — but the mat
      // thins as rock shows through: 100 % to 55 m, 55 % at the 100 m peaks.
      // Never zero: the reference file's mound is green to its top.
      if (y > 55 && rand() < ((Math.min(y, 100) - 55) / 45) * 0.45) continue;

      // Worn ground: only the near belt can reach a trail, and only there is
      // the query worth paying for (the far belts are 550 m past every path).
      let worn = 0;
      if (near) {
        worn = pathWeight(x, z);
        if (worn > 0.45) continue;
        if (worn > 0.15 && rand() < worn * 1.6) continue;
        // The near belt also reaches the river and the warehouse pad, so it
        // pays for the full veto set as well.
        if (insideRiver(x, z)) continue;
        if (insideWarehouse(x, z, 4)) continue;
        if (flowWetness(x, z) > 0.75 && rand() < 0.7) continue;
      }

      const family = familyOf(rand());
      const recipe = families[family];

      // HEIGHT, from the piece of world this clump actually stands in — the
      // district-distance band, grown towards its outer edge so the mat keeps
      // covering as the instances thin out. That is the reference file's
      // 5 %-of-relief rule carried across the world: the foothills get tufts,
      // the ranges behind them get bushes, the horizon gets thickets.
      const fromHome = districtDistance(x, z);
      const band = bandFor(fromHome, belts);
      const bandT = Math.min(1, Math.max(0, (fromHome - band.inner) / (band.outer - band.inner)));
      const height =
        (band.heightIn + (band.heightOut - band.heightIn) * bandT) *
        (0.82 + rand() * 0.36) *
        (family === 2 ? 0.72 : 1); // the daisy is the short one, as in the file

      // The measured scale band is NARROW (a 1.4× spread): the reference
      // clumps are a turf, not a mix of big and small plants. It rides on top
      // of the band height as a width multiplier (0.129 = the file's mean).
      const widthBand =
        (recipe.scale[0] + rand() * (recipe.scale[1] - recipe.scale[0])) / 0.129;

      // ── Footing: align to the slope, then the reference's own tilt ────
      qAlign.setFromUnitVectors(UP, normal);
      // Tilt: uniform off the normal, random azimuth — measured cap per family.
      const tilt = (rand() * recipe.tiltDeg * Math.PI) / 180;
      const tiltAz = rand() * Math.PI * 2;
      axis.set(Math.cos(tiltAz), 0, Math.sin(tiltAz));
      qTilt.setFromAxisAngle(axis, tilt);
      // Yaw: full 2π, uniform — the measured histogram is flat.
      qYaw.setFromAxisAngle(UP, rand() * Math.PI * 2);
      dummy.quaternion.copy(qAlign).multiply(qTilt).multiply(qYaw);
      dummy.position.set(x, y + BLEND_HILL_RECIPE.rootOffset.mean - 0.02, z);
      const width = height * band.widthRatio * widthBand;
      dummy.scale.set(width, height, width);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      // GROUND INHERITANCE. The near belt wears the terrain's own colour, by
      // the same rule the blade field and the tuft field use, so the foothills'
      // turf agrees with the foothills. The two far belts stand 550 m and
      // 850 m out, where the ground under a clump is a few texels of the same
      // green — they take a cheap stand-in (height-driven lightness) instead of
      // re-running the whole ground rule per clump, which is a third of this
      // field's boot cost for something no camera can resolve.
      if (near) {
        groundColorAt(x, z, y, ground, GROUND_PALETTE, normal.y, worn);
        ground.getHSL(hsl);
        tintHue = 0.3 + hsl.l * 0.02;
        tintSat = 0.56 + hsl.s * 0.12;
        tintLit = 0.4 + hsl.l * 0.26;
      } else {
        tintHue = 0.3 + Math.min(0.02, Math.max(0, y) * 0.0002);
        tintSat = 0.58;
        tintLit = 0.44 + Math.min(0.1, Math.max(0, y) * 0.001);
      }
      if (family === 2) {
        // The daisy family: pale yellow-green turf with a blossom in it. A
        // fifth of all clumps painted blossom-white would read as confetti
        // scattered over the hills (it did, in the first pass); a fifth of
        // them pale green with one in six actually in flower is what a
        // buttercup-and-daisy pasture looks like from a hundred metres.
        if (rand() < (band === belts[0] ? 0.2 : 0.05)) {
          tint.setHSL(0.13 + rand() * 0.02, 0.16 + rand() * 0.08, 0.88 + rand() * 0.06);
        } else {
          tint.setHSL(0.21 + rand() * 0.03, 0.34 + rand() * 0.12, 0.68 + rand() * 0.14);
        }
      } else {
        // Grass_A is the lighter, finer family, Grass_D the deeper one; at
        // range the only thing that separates them is value and hue.
        const light = family === 0 ? 0.06 : 0;
        tint.setHSL(
          tintHue + (rand() - 0.5) * 0.03 + light,
          (family === 0 ? tintSat - 0.06 : tintSat) + rand() * 0.08,
          tintLit + rand() * 0.12 + light,
        );
      }
      mesh.setColorAt(placed, tint);
      placed += 1;
    }
    mesh.count = placed;
    counts[beltIndex] = placed;
    fullCounts[beltIndex] = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return {
    group,
    materials: [swayMaterial, stillMaterial],
    counts,
    update(time, windStrength) {
      const shader = swayMaterial.userData.shader as
        | { uniforms: Record<string, { value: unknown }> }
        | undefined;
      if (!shader?.uniforms?.uTime) return;
      shader.uniforms.uTime.value = time;
      shader.uniforms.uWind.value = windStrength;
    },
    setShed(level) {
      // Rung 1 drops the horizon ranges, rung 2 the ridges. The foothills —
      // the band under the camera — are the last to trim, and they never hide.
      meshes[2].visible = level < 1;
      meshes[1].visible = level < 2;
      meshes[0].count = level >= 2 ? Math.floor(fullCounts[0] * 0.6) : fullCounts[0];
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      cards.forEach((geo) => geo.dispose());
      swayMaterial.dispose();
      stillMaterial.dispose();
      group.clear();
    },
  };
}

/**
 * The wind injection — the grass idiom, one uniform update per frame.
 *
 * A clump is stiffer than a blade (t² keeps the base locked), the phase comes
 * from the instance's own world position so neighbouring clumps are never in
 * step, and two travelling waves (a slow swell + a gust) cross the hills. The
 * amplitude fades out past 450 m, where a clump is a couple of pixels and the
 * sway would only shimmer.
 */
function injectWind(
  shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string },
  material: THREE.Material,
): void {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uWind = { value: 1 };
  shader.uniforms.uWindDir = { value: new THREE.Vector2(0.86, 0.5) };
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      uniform float uTime;
      uniform float uWind;
      uniform vec2  uWindDir;
      float dcHillHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      `,
    )
    .replace(
      "#include <begin_vertex>",
      /* glsl */ `
      #include <begin_vertex>
      vec3 dcRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float dcPhase = dcHillHash(dcRoot) * 6.2831;
      float dcT = clamp(transformed.y, 0.0, 1.0);
      float dcBend = dcT * dcT;
      vec4 dcView = modelViewMatrix * vec4(dcRoot, 1.0);
      float dcNear = 1.0 - smoothstep(260.0, 450.0, -dcView.z);
      // A long wavelength: the gusts that cross a hillside are hundreds of
      // metres wide, so the travel term is a fraction of the blade field's.
      float dcTravel = dot(dcRoot.xz, uWindDir) * 0.014;
      float dcSwell  = sin(uTime * 1.15 + dcTravel + dcPhase) * 0.5 + 0.5;
      float dcGust   = sin(uTime * 0.31 + dcTravel * 0.4) * 0.5 + 0.5;
      float dcFlutter= sin(uTime * 5.2 + dcPhase * 2.3) * 0.1;
      float dcAmp = (0.05 + dcSwell * 0.09 + dcGust * 0.07 + dcFlutter * 0.6) * uWind * dcBend * dcNear;
      transformed.x += uWindDir.x * dcAmp;
      transformed.z += uWindDir.y * dcAmp;
      transformed.y -= dcAmp * dcAmp * 0.5;
      `,
    );
  (material.userData as { shader?: unknown }).shader = shader;
}
