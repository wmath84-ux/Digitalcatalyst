// src/nature3d/engine/terrain.ts
//
// The one source of truth for the ground.
//
// `terrainHeight(x, z)` is a cheap analytic height field. The mesh, the grass
// scatter, the animal herds, the trees, the player's feet in first-person mode
// and the "board can never sink under the ground" clamp all sample the SAME
// function, so nothing can ever float or sink relative to the visible ground.
//
// VERTICAL PROFILE (the BGMI map silhouette, from the centre out):
//
//   0–45 m     the study clearing — flat, because furniture lives here
//   45–470 m   rolling ground — fractal simplex undulation that grows from
//              ~2 m to ~12 m, so the meadow is never a flat green disc
//   300–900 m  foothills — the outer arc ramps up gradually, so mountains
//              DECREASE steadily as you walk toward the centre
//   900–1150 m the mountain band — up to 100 m, with a full arc of eroded,
//              grass-capped ridges and a lot of crest-to-valley variance,
//              crowned by the 3D forest panorama (mountainForest.ts)
//   1150+ m    the island edge — the world is a CIRCLE, not a square plate:
//              outside the arc the ground falls away into the sea, and the
//              ground mesh itself is a round disc, so no square edge exists

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import {
  REGIONS, SANCTUARY, TREK, WORLD_REACH,
  regionWeight, trekRelief,
} from "./regions";
import { noise } from "./simplex";
import { groundColorAt, pathWeight, SUN_SIDE_X, SUN_SIDE_Z } from "./environment";
import { levelWarehouseGround } from "./warehouseSite";
import { levelBeachHouseGround } from "./beachHouseSite";
import { GROUND_PALETTE, GROUND_TILE_METRES, clampAlbedo } from "./palette";
import { injectWorldVaryings } from "./atmosphere";

/** Where the river gorge runs (world X) and how wide it is. */
export const RIVER_CENTER_X = 18;
export const RIVER_HALF_WIDTH = 6.4;
export const WATER_LEVEL = -1.45;

/**
 * SEA LEVEL — the level the OCEAN mesh floods to.
 *
 * The island edge already fell away into haze; now it falls away into the
 * sea. −2.6 sits comfortably below the river's own waterline (−1.45, so the
 * river is always the higher body and runs downhill to the estuary) and deep
 * enough under the rolling plain that no gameplay ground ever crosses it by
 * accident: the only terrain below sea level is the drowned shelf past the
 * island edge, which is beyond the walk limit.
 */
export const OCEAN_LEVEL = -2.6;

/** Radius of the flat study clearing at the origin. */
export const CLEARING_RADIUS = 3.2;

/**
 * Half-extent of the playable world, in metres. The ground mesh is
 * WORLD_SIZE × WORLD_SIZE, so the meadow now measures a full kilometre across
 * and the learner can walk for minutes without reaching a boundary.
 */
// The ground mesh has to cover all three districts and the land between
// them, so it is sized from the chain's reach rather than from the meadow.
export const WORLD_SIZE = WORLD_REACH * 2 + 400;
export const WORLD_HALF = WORLD_SIZE / 2;

/**
 * How far out the sanctuary's own ring of hills sits.
 *
 * THIS MUST NOT BE KEYED TO WORLD_HALF. It used to be, and when the world
 * grew from 1000 m to hold three districts, the ramp stretched with it: the
 * hills that used to top out at the meadow rim were pushed to a tenth of
 * their height there and the meadow read as flat ground. The ring belongs to
 * the SANCTUARY, so it is pinned to the sanctuary's own radius.
 */
const SANCTUARY_HILL_RIM = 460;

/**
 * The outer mountain arc — the world's edge.
 *
 * The arc is a FULL circle (every edge, the whole way around), which is what
 * makes the area read as a closed circle instead of a square. Its two
 * properties come straight from the brief:
 *
 *   • the peaks top out at EXACTLY 100 m (MOUNTAIN_MAX_HEIGHT) — the OLD
 *     hills' size, restored at the owner's word ("iska height vaise hi karo
 *     jaise purana pathar hills ka size tha utna hi");
 *   • the height grows gradually with radius, so the mountains decrease
 *     steadily from the 100 m band down to foothills and then rolling ground
 *     as you walk toward the centre — no cliff of terrain, just a long rise.
 */
const RIM_INNER = 300; // foothills begin
const RIM_FULL = 900;  // full-height band starts
export const MOUNTAIN_MAX_HEIGHT = 100;

/**
 * WHERE THE 3D MOUNTAIN FOREST STANDS — and the ground it stands ON.
 *
 * `mountainForest.ts` plants the owner's forested-mountain diorama 360°
 * around the world's edge, one card every ~30° at this radius. The radius is
 * published HERE, not there, because the ground has to know it too: the ring
 * only reads as a mountain range if the terrain it is dropped on is itself
 * high ground. OWNER DIRECTIVE (2026-09-24):
 *
 *   "pahad hawa mein tairte hue dikh rahe hain … pahad ko upar niche thoda
 *    karo aur jo jameen hai usko upar shift karke jameen se connect kar do,
 *    isase aur bhi natural feel aaega."
 *
 * The floating was two bugs meeting. The cards were seated on the HIGHEST of
 * five ground samples spread over ±140 m, so wherever the arc dipped in front
 * of a card the card hung over the dip — measured gaps of 20…57 m of empty air
 * under a "mountain". Seating them on the LOWEST sample under their own
 * footprint buries the card's base instead (no gap is possible), and this
 * apron lifts the ground under the whole band so the burial is a few metres of
 * skirt rather than half the mountain: the cards sink a little, the ground
 * rises to meet them, and the two are one range.
 */
export const MOUNTAIN_RING_RADIUS = 950;

/**
 * The apron's radial profile, in metres from the centre.
 *
 * A card's own footprint runs from ~255 m INSIDE its placement point to ~30 m
 * outside it, and ~208 m either side (measured from the model's bounding box
 * at the ring's scale), so its inner CORNERS reach in to r ≈ 668. The
 * fully-lifted band therefore has to be up by 660 or the card is seated on a
 * ramp and hangs over the low ground behind it:
 *
 *   520 → 660   rise in   (a long ramp, so the meadow side is a foothill
 *                          approach you can walk up, never a terrace wall;
 *                          it also hands on from the inner foothill ring,
 *                          which is fully up at 460 m)
 *   660 → 1000  held      (the ground the cards are seated on)
 *   1000 → 1120 release   (hands back to the island edge's own fall at 1120)
 */
const APRON_IN = 520;
const APRON_FULL = 660;
const APRON_FADE = 1000;
const APRON_OUT = 1120;

/**
 * How high the apron lifts the ground, in metres — a FLOOR, not an addition
 * (`terrainHeight` takes the max of this and the natural relief), so a sector
 * the arc already pushed to 100 m keeps its peak and only the valleys between
 * the peaks are filled. 46 m is deliberate:
 *
 *   • above the tree line (flora rejects ground over 34 m), so the band stays
 *     open hill turf for the cards' own forest to stand on;
 *   • high enough that a card seated on the band's LOWEST point still shows
 *     ~50–100 m of mountain above the surrounding ground (the card is ~108 m
 *     tall and its base is buried);
 *   • below the 100 m cap, so the apron can never become the tallest thing in
 *     the world and trim the real peaks.
 */
const APRON_LEVEL = 46;

/**
 * THE BAY — the one sector of the mountain arc that opens to the sea.
 *
 * A tropical island is read by its coastline, so the rim must have a place
 * where it drops to dunes and lets the map see the water. This is that
 * place: an angular window (centre ≈ 0.92 rad, roughly south-east) where the
 * arc's height is scaled down to a low dune ridge. The edges of the window
 * are wide and noisy, so it reads as a natural bay between two headlands —
 * never as a bite taken out of a ring by a formula. The bay is where the
 * beach district, the village and the jetty all live, and from the high
 * meadow the gap frames the ocean and the distant islands behind it.
 *
 * EXPORTED: the 3D mountain-forest ring (`mountainForest.ts`) reads it so
 * its own panorama OPENS over the bay instead of walling off the sea.
 */
export const BAY_AZIMUTH = 0.92;
const BAY_HALF_WIDTH = 0.34;

function bayGap(ang: number): number {
  // Angular distance from the bay's centre, wrapped to 0…π.
  let d = Math.abs(ang - BAY_AZIMUTH);
  if (d > Math.PI) d = Math.PI * 2 - d;
  // Noisy rim so the gap's edge is a coastline, not a protractor arc.
  const wobble = noise.noise2D(Math.cos(ang) * 3.1 + 13.7, Math.sin(ang) * 3.1 - 4.9) * 0.09;
  return 0.1 + 0.9 * smoothstep(BAY_HALF_WIDTH - 0.1 + wobble, BAY_HALF_WIDTH + 0.24 + wobble, d);
}

/** Where the world's CIRCLE edge begins and ends (the plate is a square, the world is not). */
const ISLAND_EDGE_IN = 1120;
const ISLAND_EDGE_OUT = 1440;
const ISLAND_FLOOR = -18;

/**
 * How far out the ground DISC itself reaches.
 *
 * The ground is built as round radial shells ending at this radius — past
 * ISLAND_EDGE_OUT (1440), so the island's fall into the sea always
 * COMPLETES on drawn ground. The old outermost shell was a SQUARE plate
 * that stopped at its own edge mid-side: through the clear shallows the
 * bed's straight cutoff read as the "square boundary" the owner flagged.
 * A disc has no such line — the world is round to the last vertex.
 */
export const TERRAIN_DISC_RADIUS = 1500;

/**
 * How far the free camera (drone / fly mode) may travel from the centre.
 *
 * The clamp is RADIAL, not a square: "iska kinare ko is tarah fit karo taki
 * camera bahar na jaaye". The limit sits just inside the island edge, so
 * from any reachable spot the view is always land, surf and haze — never
 * the outside of the world. (`controls.ts` clamps the fly target to this
 * circle; the orbit rig's own plate maths is unchanged.)
 */
// Fly/drone radial clamp — stay over island + near shelf, well inside the
// sky dome. Ocean continues far past this so zoom-out still shows sea, but
// the camera itself never leaves the skybox.
export const FLY_LIMIT_RADIUS = 1180;

/**
 * Where the COAST's influence becomes trustworthy, in metres from the centre.
 *
 * Height alone cannot pick out the beach — inland hollows can sit below sea level
 * and the study clearing at 0 m, both far inland, and both must stay grass.
 * The coast is a GEOGRAPHIC band past this radius, so every coastal consumer
 * (sand colour, palms, grass thinning, rock bleaching) ANDs the height band
 * with this ring mask. Past ISLAND_EDGE_IN the falloff is fully in charge and
 * the weight saturates at 1.
 */
export const COAST_ZONE_IN = 920;

/** 0 well inland → 1 at the coast ring and everywhere seaward of it. */
export function coastWeight(x: number, z: number): number {
  return smoothstep(COAST_ZONE_IN, ISLAND_EDGE_IN - 60, Math.hypot(x, z));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The mountain passes, shared by every ring-shaped term in the height field.
 *
 * The rings that close the map (the inner foothills, the outer arc and the
 * apron the 3D forest stands on) would each cut the sanctuary off from the
 * Highlands, so each of them is opened along the straight line that joins the
 * two districts. `inner`/`outer` are the pass's half-width ramp in metres:
 * the inner ring keeps a tight 90…260 m pass, the outer arc and the apron a
 * wider 120…420 m one, so the walk out is a valley rather than a slot.
 *
 * ONE implementation on purpose: three copies of this loop is how a pass ends
 * up open in one ring and walled in the next, which reads from the meadow as a
 * mountain with a doorway punched through it.
 */
function corridorWeight(x: number, z: number, inner: number, outer: number): number {
  let corridor = 1;
  for (const r of REGIONS) {
    if (r.id === "sanctuary") continue;
    // Distance from the straight line joining the sanctuary to this district.
    const t = Math.max(0, Math.min(1, x / r.centerX));
    const lineZ = r.centerZ * t;
    const off = Math.hypot(z - lineZ, 0);
    const onCorridor = (x > 0) === (r.centerX > 0);
    if (onCorridor) corridor = Math.min(corridor, smoothstep(inner, outer, off));
  }
  return corridor;
}

/**
 * The mountain-pass factor the OUTER ring terms share, published so the 3D
 * mountain forest can stay out of the passes too (`mountainForest.ts`).
 *
 * 1 on high ground, 0 in the middle of the pass that leads to the Highlands.
 * A card planted across a pass would be seated on the plain at its mouth and
 * hang over it — the same floating mountain the apron exists to prevent — so
 * the ring skips any chunk whose footprint touches one, exactly as it skips
 * the bay. The terrain's arc and the planted forest then agree on where the
 * openings are: the bay to the sea, the pass to the west.
 */
export function mountainPassWeight(x: number, z: number): number {
  return corridorWeight(x, z, 120, 420);
}

function distantRelief(x: number, z: number): number {
  const d = Math.hypot(x, z);
  // Nothing until well past the clearing, then a long smooth ramp that is
  // fully up by the meadow rim — exactly as it was before the world grew.
  const rise = smoothstep(150, SANCTUARY_HILL_RIM, d);
  if (rise <= 0) return 0;

  // The ring of hills that used to close off the meadow would now cut the
  // meadow off from its neighbours, so it is opened up along the corridors
  // that lead to the other two districts. The result is a natural mountain
  // pass at each end rather than a wall.
  const corridor = corridorWeight(x, z, 90, 260);
  if (corridor <= 0) return 0;
  // The inner ring HANDS OFF to the outer arc instead of stacking on top of
  // it — stacked, the two together could push the ground past the 100 m
  // mountain cap. By the time the outer arc is at full rise the inner ring
  // has faded out, so the rise reads as one continuous, gradually steepening
  // climb from meadow to peak.
  const handoff = 1 - smoothstep(SANCTUARY_HILL_RIM, SANCTUARY_HILL_RIM + 260, d);
  return distantReliefRaw(x, z, Math.min(rise, 1)) * corridor * handoff;
}

function distantReliefRaw(x: number, z: number, rise: number): number {
  // The inner ring is FOOTHILLS: the 150 m peaks live on the outer arc
  // (see `outerRim`), so this band is the layer beneath them — lower, softer
  // forested ranges that hand off to the arc (and to the 3D mountain-forest
  // ring planted on it) for depth. Three octaves of REAL simplex, ridged,
  // give crests and saddles rather than cones; a separable sin/cos field
  // was tried here first and is wrong — it repeats on a visible lattice.
  const a = noise.noise2D(x * 0.0032 + 71.3, z * 0.0032 - 17.9); // ~310 m masses
  const b = noise.noise2D(x * 0.0071 - 45.2, z * 0.0071 + 63.8); // ~140 m ridges
  const c = noise.noise2D(x * 0.0153 + 9.4, z * 0.0153 - 27.1);  // ~65 m crests
  // `1 - |n|` is the classic ridged transform: it turns rounded humps into
  // sharp-crested ridges with eroded flanks, which is what reads as a mountain.
  const ridged = (1 - Math.abs(a)) * 0.6 + (1 - Math.abs(b)) * 0.28 + (1 - Math.abs(c)) * 0.12;
  // Large-scale mass so some sectors are high ranges and others stay open.
  const ang = Math.atan2(z, x);
  const mass = 0.45 + 0.55 * (0.5 + 0.5 * noise.noise2D(Math.cos(ang) * 2.1 + 31.7, Math.sin(ang) * 2.1 + 5.9));
  // Same gentle sharpen the outer arc wears, so the two ranges read as one
  // mountain system at two distances, never as two different worlds.
  const h = Math.min(1, Math.max(Math.pow(ridged * mass, 1.15), 0.05) * 1.24);
  return h * 44 * rise;
}

/**
 * The OUTER mountain arc — the edge of the world, hills on every side.
 *
 * `outerRim` is added to the height field directly (not weighted by the
 * sanctuary's region blend) so the arc is COMPLETE: east of the meadow and
 * west of the trek the district weights have gone to zero, and a wSanct-
 * weighted ring would simply vanish there, leaving flat corners of the plate.
 *
 * The arc's own shape carries the brief:
 *
 *   rise    = smoothstep(300, 900, d) — the gradual rise; this is what makes
 *             the mountains decrease step by step toward the centre.
 *   ridged  = 3 octaves of REAL simplex, ridged — the "dher sara upar niche"
 *             variance: broad sector masses, then individual peaks and
 *             saddles, then crest folds. No two sectors of the arc look alike.
 *   mass    = slow angular noise — some sectors are high ranges (×1.0),
 *             others stay low passes (×0.45).
 *   corridor = the same two mountain passes as the inner ring, widened, so
 *             the east/west walk to the districts still goes through a real
 *             pass instead of a 100 m wall.
 */
function outerRim(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const rise = smoothstep(RIM_INNER, RIM_FULL, d);
  if (rise <= 0) return 0;

  const corridor = corridorWeight(x, z, 120, 420);
  if (corridor <= 0) return 0;

  // The octave scales are the whole game for the silhouette: too fine and
  // the mountains spike into needles (a 45 m swing over a 25 m step reads as
  // a cliff and stair-steps on the LOD mesh, which carries the arc at ~9 m
  // per vertex), too coarse and the arc is one smooth bump. These scales
  // were picked against the MEASURED simplex gradient (~1.83 noise-units per
  // input unit) so the steepest 25 m run stays a walkable mountainside:
  // ~660 m sets which SECTORS are high ranges, ~330 m sets the individual
  // peaks and saddles between them, ~220 m roughens the crest line.
  const n1 = noise.noise2D(x * 0.0015 + 11.7, z * 0.0015 - 29.3); // ~660 m masses
  const n2 = noise.noise2D(x * 0.003 - 71.2, z * 0.003 + 47.8); // ~330 m ridges
  const n3 = noise.noise2D(x * 0.0045 + 33.9, z * 0.0045 - 12.6); // ~220 m crests
  // Weights keep the rhythm in the big octaves (broad peaks and saddles) and
  // the fine octave small — it is crest texture, not a second mountain range.
  const ridged =
    (1 - Math.abs(n1)) * 0.55 +
    (1 - Math.abs(n2)) * 0.3 +
    (1 - Math.abs(n3)) * 0.15;
  const ang = Math.atan2(z, x);
  const mass =
    0.45 + 0.55 * (0.5 + 0.5 * noise.noise2D(Math.cos(ang) * 2.3 + 5.2, Math.sin(ang) * 2.3 - 8.1));

  // A gentle sharpen (pow 1.15) spends the height on the crests without the
  // slope amplification a full square would cause, and the ×1.28 stretch
  // (clamped at 1) lifts the real peaks up to the full 100 m cap — without
  // it the noise only ever reaches ~80% of it and the "100 m mountain"
  // never actually is 100 m. A small floor keeps the arc from ever flat —
  // except in the bay, where the floor is exactly what we want to keep, so
  // the bay factor is applied AFTER it (see `bayGap`).
  const h = Math.min(1, Math.max(Math.pow(ridged * mass, 1.15), 0.05) * 1.28);
  return h * MOUNTAIN_MAX_HEIGHT * rise * corridor * bayGap(Math.atan2(z, x));
}

/**
 * The ground floor under the 3D mountain ring — see `MOUNTAIN_RING_RADIUS`.
 *
 * Returns a HEIGHT (not an offset): `terrainHeight` takes `max(natural, this)`,
 * so the apron fills the arc's valleys up to a walkable plateau and leaves
 * every real peak exactly where it was. Three gates keep it honest:
 *
 *   corridor — the pass to the Highlands stays a pass. Without this the
 *              apron would be a 46 m wall across the one route out of the
 *              meadow (the arc above already respects it).
 *   bayGap   — the bay is the map's coastline: beach, surf, jetty, sea view.
 *              The gap is remapped so the apron is EXACTLY zero in the bay's
 *              core and only reaches full strength outside it, which leaves
 *              the measured shoreline (and the jetty built on it) untouched.
 *   mass     — the arc's own slow angular noise, reused, so the plateau
 *              undulates sector to sector with the mountains above it instead
 *              of being one flat 46 m terrace all the way round.
 *
 * Cheap by construction: the radial weights are two `smoothstep`s on the
 * `dist` the caller already computed, and the two noise calls only run inside
 * the band (which the ground mesh samples at its COARSEST shell density).
 */
function ringApron(x: number, z: number, dist: number): number {
  const w =
    smoothstep(APRON_IN, APRON_FULL, dist) * (1 - smoothstep(APRON_FADE, APRON_OUT, dist));
  if (w <= 0.001) return 0;

  const ang = Math.atan2(z, x);
  // The bay opens here: 0.1 is the gap's floor, so subtract it and renormalise.
  const open = Math.max(0, bayGap(ang) - 0.1) / 0.9;
  if (open <= 0.001) return 0;
  const corridor = corridorWeight(x, z, 120, 420);
  if (corridor <= 0.001) return 0;
  const mass =
    0.72 + 0.28 * (0.5 + 0.5 * noise.noise2D(Math.cos(ang) * 2.3 + 5.2, Math.sin(ang) * 2.3 - 8.1));

  return APRON_LEVEL * w * open * corridor * mass;
}

/**
 * The authored crest under the lesson board.
 *
 * The board at (-268.7, -266.1) must read as "up on the mountain behind" —
 * about 5.5° above eye level from the chair, so it clears the study-board
 * fan (which tops out at 3.8°). The general relief does not guarantee that
 * one specific hill exists, so the crest is planted: a smooth Gaussian that
 * pushes the ground up to a TARGET height (LESSON_CREST_TARGET) no matter
 * what the surrounding noise happens to do at that spot. The board's bottom
 * edge is 43.0 m, so a crest at ~37.5 m leaves 4–7 m of air under it and the
 * stand posts stay a sensible length.
 */
const LESSON_HILL_X = -268.7;
const LESSON_HILL_Z = -266.1;
const LESSON_CREST_TARGET = 37.5;

/** Analytic ground height at a world position. */
export function terrainHeight(x: number, z: number): number {
  // Narrow Gaussian, used only for the muddy bank blend and the old clearing
  // maths. The actual channel is carved by an explicit clamp further down,
  // because a Gaussian wide enough to defeat a 90 m hill also drowns the
  // study clearing 18 m away — the two requirements cannot be met by tuning
  // one falloff, so they are separated.
  const valley = Math.exp(-(((x - RIVER_CENTER_X) / 7.5) ** 2));

  // Fine near-field texture — multi-scale so the floor is never a smooth
  // disc: broad rolls + medium undulation + micro bumps the eye reads as
  // natural ground underfoot.
  const hills =
    Math.sin(x * 0.06) * Math.cos(z * 0.06) * 2.2 +
    Math.sin(x * 0.14 + z * 0.1) * 0.85 +
    Math.sin(x * 0.31 - z * 0.21) * 0.22 +
    // Micro-terrain: small natural mounds and hollows (~3–8 m wavelength).
    noise.noise2D(x * 0.18 + 8.4, z * 0.18 - 11.2) * 0.28 +
    noise.noise2D(x * 0.42 - 3.7, z * 0.42 + 19.1) * 0.09;
  const dist = Math.hypot(x, z);
  // Smooth ramp instead of a hard clamp: the first metres around the chair
  // are truly flat, and the undulation eases in so nothing pokes through the
  // board fan (the outermost study board stands at r ≈ 45 m on 3 m posts).
  const flatten = smoothstep(10, 32, dist);

  // ROLLING MID-GROUND — multi-scale layered noise (large hills + medium
  // undulation + high-frequency micro-relief). Amplitude grows with distance:
  // ~2 m just past the clearing, ~12 m at the foot of the foothills. The
  // extra high-frequency octave and shallow depression term stop the ground
  // reading as perfectly smooth procedural hills.
  const rolling =
    noise.noise2D(x * 0.011 + 3.1, z * 0.011 - 7.7) * 0.52 +
    noise.noise2D(x * 0.027 - 19.4, z * 0.027 + 26.8) * 0.24 +
    noise.noise2D(x * 0.065 + 51.2, z * 0.065 - 33.5) * 0.14 +
    // High-frequency micro-relief — breaks the smooth silhouette.
    noise.noise2D(x * 0.14 + 77.3, z * 0.14 - 44.1) * 0.07 +
    // Occasional shallow depressions (negative bias on a sparse low-freq field).
    Math.min(0, noise.noise2D(x * 0.008 + 101.2, z * 0.008 - 55.7)) * 0.18;
  const rollIn = smoothstep(42, 150, dist);
  const rollAmp = 2.4 + 9.8 * smoothstep(70, 470, dist);
  // Subtle erosion channels: long thin depressions following a noise ridge
  // field. Amplitude is small so walkability is untouched, but the ground
  // no longer reads as a continuous smooth roll.
  const erosion =
    Math.pow(Math.max(0, 1 - Math.abs(noise.noise2D(x * 0.019 + 22.1, z * 0.019 - 8.4)) * 2.4), 2.2) *
    0.55 *
    smoothstep(55, 180, dist);
  const rollingGround = rolling * rollAmp * rollIn - erosion;

  // ── The connected districts ─────────────────────────────────────────────
  //
  // The sanctuary's own relief fades out as you leave it, and the
  // trek relief fades in as you arrive, so the world is one continuous
  // surface with no seam, no cliff and no invisible boundary between areas.
  const wSanct = regionWeight(SANCTUARY, x, z);
  const wTrek = regionWeight(TREK, x, z);

  // The sanctuary's general relief. `outerRim` is deliberately NOT part of
  // this term — it is added to the district blend below, unweighted, so the
  // mountain arc stays complete where the district weights have faded out.
  const sanctuaryBase =
    hills * flatten +
    rollingGround +
    distantRelief(x, z) -
    valley * 2.8;

  // The authored lesson-board crest is applied AFTER the district blend
  // (further down), so the region weighting cannot shrink it away: at
  // (-268.7, -266.1) the sanctuary weight is only ~0.4, which would turn a
  // 37 m target into a 15 m bump and let the board float on a pole.

  // Connecting plains: gentle open ground so the walk between districts is
  // interesting but never a climb.
  const linkRoll =
    Math.sin(x * 0.0061 + 2.1) * Math.cos(z * 0.0083 - 1.2) * 5.2 +
    Math.sin(x * 0.0135 - z * 0.0111) * 1.9;

  const districtBlend =
    sanctuaryBase * wSanct +
    trekRelief(x, z) * wTrek +
    linkRoll * Math.max(0, 1 - wSanct - wTrek) +
    // The full-arc mountain ring, unweighted — see `outerRim`.
    outerRim(x, z);

  // The authored lesson-board crest: a smooth Gaussian that lifts this spot
  // to LESSON_CREST_TARGET no matter what the blend underneath is doing, so
  // the board always floats a sensible 4–7 m over the hill it is bolted to.
  const lx = x - LESSON_HILL_X;
  const lz = z - LESSON_HILL_Z;
  const lessonW = Math.exp(-(lx * lx + lz * lz) / (2 * 92 * 92));
  const lessonBump =
    lessonW > 0.001
      ? lessonW * (LESSON_CREST_TARGET - districtBlend) * (0.97 + 0.06 * noise.noise2D(x * 0.018 + 12.3, z * 0.018 - 40.7))
      : 0;

  // ── THE CIRCULAR EDGE ───────────────────────────────────────────────
  //
  // The mesh is a square (it has to cover the whole district chain), but the
  // WORLD is a circle: past the mountain band the ground falls away into a
  // low floor, so from every angle the silhouette is a ring of hills closing
  // the map and the square corners of the plate sink below the haze. This is
  // what "kinare kinare se circle" means in geometry — the edge itself is
  // the circle, not a fence on it.
  const edge = 1 - smoothstep(ISLAND_EDGE_IN, ISLAND_EDGE_OUT, dist);
  // THE COASTAL SHELF. The raw falloff would drop the island into the sea
  // like a cliff: the fall crosses sea level at a slope the beach could never
  // exist on, and the shallow-water zone the tropical look depends on would
  // be metres wide. Easing the blend with a power > 1 keeps the inland side
  // identical (edge ≈ 1 ⇒ shelf ≈ 1) while pulling the top of the fall out
  // into a long, gentle ramp — the crossing of OCEAN_LEVEL moves seaward and
  // shallow, which is what gives the ocean something to turn turquoise over
  // and the beach somewhere flat to be.
  const shelf = Math.pow(edge, 1.45);
  // THE RING APRON — the ground the 3D mountain forest is seated on. It is a
  // FLOOR under the natural relief, applied before the shelf so the seaward
  // fall still owns the island's edge: filling the arc's valleys up to the
  // plateau is what connects the planted mountains to the ground instead of
  // leaving them hanging in the air (see `ringApron`).
  const natural = districtBlend + lessonBump;
  const apron = ringApron(x, z, dist);
  const lifted = apron > natural ? apron : natural;
  // The 100 m cap: the brief says the mountains are 100 m high, so nothing
  // in the whole world — arc, trek highlands, the lesson crest — is allowed
  // to exceed it. (The lesson crest targets 37.5 m and the apron 46 m, so the
  // cap only ever trims real mountain peaks.)
  const base = Math.min(
    MOUNTAIN_MAX_HEIGHT,
    lifted * shelf + ISLAND_FLOOR * (1 - shelf),
  );

  // ── THE RIVER CARVES ────────────────────────────────────────────────
  //
  // The water plane is a straight ribbon at a FIXED level running the full
  // length of the world, so the bed must be below that level everywhere —
  // including where a hill range crosses it. Rather than fight the relief
  // with a falloff, the channel is cut explicitly:
  //
  //   inside the channel  -> hard clamp below the waterline, deepest mid-stream
  //   the banks           -> blend back to the natural terrain over ~3 channel
  //                          widths, which reads as a gorge the river eroded
  //
  // `bankBlend` is 1 in the channel and 0 out on the flats.
  const fromCentre = Math.abs(x - RIVER_CENTER_X);
  let bankBlend = 1 - smoothstep(RIVER_HALF_WIDTH, RIVER_HALF_WIDTH * 3.2, fromCentre);
  if (bankBlend <= 0) {
    return levelBeachHouseGround(x, z, levelWarehouseGround(x, z, base, terrainHeight));
  }
  // The study clearing sits only 18 m from the channel, well inside the bank
  // blend. Without this the near bank tips the clearing into the water and the
  // chair, board and student all end up on a slope. The clearing wins.
  bankBlend *= smoothstep(CLEARING_RADIUS, CLEARING_RADIUS + 7, dist);
  if (bankBlend <= 0) {
    return levelBeachHouseGround(x, z, levelWarehouseGround(x, z, base, terrainHeight));
  }

  // Concave bed: deepest at the centre line, rising to the waterline at the
  // channel edge. Always at least 0.8 m of water, so the plane never clips.
  const across = Math.min(fromCentre / RIVER_HALF_WIDTH, 1);
  const bedDepth = 3.4 - across * across * 2.2;
  const bed = WATER_LEVEL - 0.8 - bedDepth;

  return levelBeachHouseGround(
    x,
    z,
    levelWarehouseGround(
      x,
      z,
      base * (1 - bankBlend) + Math.min(bed, base) * bankBlend,
      terrainHeight,
    ),
  );
}

/** True when the position sits inside the river bed (no grass / no animals). */
export function insideRiver(x: number, z: number): boolean {
  void z;
  return Math.abs(x - RIVER_CENTER_X) < RIVER_HALF_WIDTH;
}

/** Surface normal, sampled by finite differences (used to tilt grass/animals). */
export function terrainNormal(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = 0.6;
  const hL = terrainHeight(x - e, z);
  const hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e);
  const hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

/**
 * One round shell of the ground: a disc (inner = 0) or an annulus, built as
 * concentric vertex rings around the origin. `pinch` > 1 packs rings toward
 * the INNER edge (detail where the eye still resolves it); positions stay
 * in world XZ — the caller lifts them with `terrainHeight` and fills the
 * UVs from world metres, so every shell wears the texture at one texel
 * density and the seams between shells line up exactly.
 */
function buildRadialShell(
  inner: number,
  outer: number,
  segs: number,
  ringStep: number,
  pinch: number,
): THREE.BufferGeometry {
  const rings = Math.max(2, Math.ceil((outer - inner) / ringStep));
  const disc = inner <= 0;
  const ringVerts = segs + 1; // duplicated seam vertex, like the ocean disc
  const vertCount = (disc ? 1 : 0) + rings * ringVerts;
  const pos = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);

  let v = 0;
  if (disc) {
    pos[0] = 0; pos[1] = 0; pos[2] = 0;
    uv[0] = 0; uv[1] = 0;
    v = 1;
  }
  for (let r = 1; r <= rings; r += 1) {
    const radius = inner + (outer - inner) * Math.pow(r / rings, pinch);
    for (let s = 0; s <= segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      pos[v * 3] = x;
      pos[v * 3 + 2] = z;
      uv[v * 2] = x;
      uv[v * 2 + 1] = z;
      v += 1;
    }
  }

  const idx: number[] = [];
  if (disc) for (let s = 0; s < segs; s += 1) idx.push(0, 1 + s + 1, 1 + s);
  const firstRow = disc ? 1 : 0;
  for (let r = 1; r < rings; r += 1) {
    const a0 = firstRow + (r - 1) * ringVerts;
    const a1 = a0 + ringVerts;
    for (let s = 0; s < segs; s += 1) {
      idx.push(a0 + s, a0 + s + 1, a1 + s);
      idx.push(a0 + s + 1, a1 + s + 1, a1 + s);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build the ground.
 *
 * THE KILOMETRE PROBLEM: a single 1000 m plane dense enough to show the hills
 * would need ~4 M vertices. Instead the ground is built as CONCENTRIC LOD
 * SHELLS — the same trick BGMI-class mobile renderers use for open terrain —
 * and (owner directive, "ekdum round bnao") every shell is a ROUND disc or
 * annulus of vertex rings, never a square plate:
 *
 *   shell 0   0–90 m     full density — where you walk, where the grass is
 *   shell 1   90–260 m   1/3 density  — rolling mid-ground
 *   shell 2   260–620 m  1/9 density  — the foothills and the mountain band
 *   shell 3   620–1500 m the rest     — the arc's peaks and the island edge
 *
 * Every shell samples the SAME `terrainHeight`, so the seams line up exactly
 * and a hill on the horizon is the same hill when you finally walk up it.
 * Total: 4 draw calls for the whole world.
 */
export function buildTerrain(budget: QualityBudget, groundTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain";

  // The altitude anchors stay explicit: they are also READ by the props (the
  // rock kit refuses to place above the bleached crest line, the grass uses
  // the same heights), so they belong to the terrain. The base blend itself
  // comes from the environmental field, so the mesh, the grass and the trees
  // all describe the same ground (research §8, §12).
  //
  // OWNER DIRECTIVE — GRASS ON EVERY HILL ("pahadon ke upar gras replace
  // hill", reference blend in the repo root): the mountains of this
  // sanctuary wear GRASS from base to crest, exactly like the uploaded
  // design — no bare rock band, no snow cap, every side of every hill the
  // same dense sward as the meadow. The two altitude bands below still
  // exist (the mesh, the props and the contract tests read them), but they
  // now grade the sward itself: `rock` is the dry, sun-cured upland pasture
  // the grass turns into on the high slopes, and `snow` is the pale
  // bleached-grass crest — GRASS colours, never bare stone or snow.
  const rock = new THREE.Color(0x8a9a4b);
  const snow = new THREE.Color(0xc9d68a);
  // Underwater bed: clear blue-green (not black navy) so the river centre
  // and the drowned shelf never read as a dark strip through the water.
  const deep = new THREE.Color(0x2a6a88);
  const tmp = new THREE.Color();

  /**
   * One texture tile per this many metres, on EVERY shell.
   *
   * This is the texel-density rule (research §18, principle 46): the same
   * number of pixels must cover the same number of centimetres everywhere, or
   * a crate at 4K next to a floor at 1K destroys the illusion of one world.
   * Before this, a single shared `repeat` gave the 180 m shell and the 2760 m
   * shell the same 42 tiles, so the outer world was stretched 15× and its
   * ground read as watercolour beside the meadow's.
   */
  const TILE_METRES = GROUND_TILE_METRES;

  const density = budget.tier === "low" ? 0.62 : budget.tier === "medium" ? 0.82 : 1;

  // Four ROUND shells, not four square plates.
  //
  // THE SQUARE-BOUNDARY BUG. The shells used to be square PlaneGeometry
  // plates, and the outermost one stopped at its own edge mid-side: through
  // the clear shallows of the drowned island edge, the bed's straight
  // cutoff read as a square boundary laid over the world — exactly the
  // "boundary ka land square hai" the owner flagged. The world is now round
  // to the last vertex: every shell is a disc/annulus of concentric vertex
  // rings (the same trick the ocean disc uses), and the outermost shell
  // reaches TERRAIN_DISC_RADIUS — past ISLAND_EDGE_OUT — so the island's
  // fall into the sea always COMPLETES on drawn ground and no straight
  // line exists anywhere on the horizon.
  //
  // `half` is each shell's outer radius (shell N begins where shell N−1
  // ends), `segs` the angular resolution, `ringStep` the ring spacing.
  // Detail is still spent where the camera is: the near field keeps rings
  // every ~6 m, the mountain band every ~12 m.
  const shells: Array<{ half: number; outer?: number; segs: number; ringStep: number; shadow: boolean }> = [
    { half: 90, segs: Math.round(150 * density), ringStep: 6, shadow: true },
    { half: 260, segs: Math.round(120 * density), ringStep: 12, shadow: false },
    // Covers the sanctuary's foothills, the rolling ground and the inner passes.
    { half: 620, segs: Math.round(190 * density), ringStep: 14, shadow: false },
    // Covers the 100 m mountain arc, both districts and the circular edge.
    { half: WORLD_HALF, outer: TERRAIN_DISC_RADIUS, segs: Math.round(340 * density), ringStep: 10, shadow: false },
  ];

  const mat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
  });

  // ── The landscape shader ─────────────────────────────────────────────
  //
  // A production terrain material is not one texture: it is a MACRO layer at a
  // huge scale (which large shape is this — a dry rise, a damp hollow?) and a
  // MICRO layer at a small one (what is the grit underfoot?), blended by rules.
  // The rules live in `environment.ts` and arrive as vertex colour; these extra
  // lines are the second texture scale that stops a 6 m tile reading as a tile,
  // plus the warm/cool aspect split of research §10 (research §8, §12).
  mat.onBeforeCompile = (shader) => {
    // World position and world normal come from the shared injection in
    // `atmosphere.ts` — the same one the grass, the leaves and the rocks use.
    // Declaring them here by hand is how a shader ends up declaring the same
    // varying twice, which is a hard compile error, not a subtle bug.
    injectWorldVaryings(shader);
    // The sun's mean side of the sky, from the constant the moss, the tree
    // lean, the rock weathering and the grass tint all read: one truth, many
    // readers.
    shader.uniforms.uDcSunSide = { value: new THREE.Vector2(SUN_SIDE_X, SUN_SIDE_Z) };
    // Sea level, for the per-pixel shoreline treatment below.
    shader.uniforms.uDcOceanLevel = { value: OCEAN_LEVEL };

    // THE TRAIL WEIGHT, published per vertex.
    //
    // The path's summer look is baked into the vertex colours, which the
    // winter layer cannot read as a mask (a colour is not a decision). So the
    // same `pathWeight` that tints the ground also rides an attribute, and
    // `winter.ts` uses it to give the trail COMPACTED snow instead of the
    // drifts either side of it. Without this, winter flattens the paths into
    // the field and the aerial view loses its roads — the owner's "paths must
    // remain visible" requirement.
    //
    // Declared here, not in winter.ts: the attribute belongs to this geometry,
    // and the injection in `winter.ts` probes for the varying rather than
    // assuming it, so the two files stay independent.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aWorn;\nvarying float vDcWorn;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvDcWorn = aWorn;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying float vDcWorn;`);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform vec2 uDcSunSide;
        uniform float uDcOceanLevel;
        `,
      )
      .replace(
        "#include <color_fragment>",
        /* glsl */ `
        #include <color_fragment>

        // USER DIRECTIVE ("field ka exact design"): the ground IS the aerial
        // farmland photo — its own greens, parcels and plough rows lead, and
        // the vertex colours (grass/rock/snow bands) only GRADE them. The old
        // multiply-only treatment let the biome tint swamp the photo, which
        // is why the field never changed visually.
        //
        // diffuseColor here is exactly the map texel (the material colour is
        // white), so the photo costs ONE fetch; the macro fetch adds the
        // broad warm/cool drift that stops the tile reading as a tile.
        // The aerial scan is intentionally only a subtle micro-detail source.
        // Letting it drive albedo made the whole sanctuary read as pale beige
        // farmland and erased the biome masks baked into vColor. The terrain
        // colour is now a real layered ground: vertex colour carries grass,
        // soil, wet mud and exposed rock while the scan contributes grit and
        // macro breakup only.
        vec3 dcTexel = diffuseColor.rgb;
        vec3 dcMacro = texture2D( map, vMapUv * 0.25 ).rgb;
        float dcMacroL = dot( dcMacro, vec3( 0.3333 ) );
        float dcMicro = 0.92 + dcMacroL * 0.16;
        vec3 dcGround = vColor * dcMicro;
        // Keep a restrained amount of authored surface detail without
        // reintroducing its washed-out colour cast.
        dcGround = mix( dcGround, dcGround * (0.72 + dcTexel * 0.42), 0.18 );

        // SHORELINE — soft irregular bands (wet sand → sparse shore → grass).
        // Extra noise breaks the hard contour so the water edge never reads
        // as a clean geometric boundary.
        float dcShore = vDcWorldPos.y - uDcOceanLevel;
        float dcSwash = dcMacroL * 1.6
                      + 0.35 * sin( vDcWorldPos.x * 0.31 + vDcWorldPos.z * 0.27 )
                      + 0.22 * sin( vDcWorldPos.x * 0.73 - vDcWorldPos.z * 0.61 );
        if ( dcShore < 4.5 ) {
          float dcWet = 1.0 - smoothstep( -0.15 + dcSwash, 2.8 + dcSwash, dcShore );
          dcGround *= mix( 1.0, 0.64, dcWet * 0.88 );
          // Wet-mud band just above the waterline.
          float dcMud = ( 1.0 - smoothstep( 0.2 + dcSwash * 0.5, 2.6 + dcSwash * 0.5, dcShore ) )
                      * smoothstep( -0.4, 0.6, dcShore );
          dcGround = mix( dcGround, vec3( 0.28, 0.30, 0.18 ), clamp( dcMud, 0.0, 1.0 ) * 0.35 );
          float dcFoam = ( 1.0 - smoothstep( 0.02 + dcSwash * 0.4, 0.55 + dcSwash * 0.6, dcShore ) )
                       * step( -0.05, dcShore )
                       * smoothstep( 0.3, 0.8, dcMacroL + 0.3 * sin( vDcWorldPos.x * 0.7 + vDcWorldPos.z * 0.5 ) );
          dcGround = mix( dcGround, vec3( 0.90, 0.95, 0.95 ), clamp( dcFoam, 0.0, 1.0 ) * 0.72 );
          float dcBed = clamp( -dcShore / 10.0, 0.0, 1.0 );
          dcGround = mix( dcGround, vec3( 0.035, 0.10, 0.22 ), dcBed * 0.85 );
        }

        // ASPECT TINT — warm on the sunlit faces, cool in sky-bounced shade
        // (research §10); on albedo so it survives every hour.
        vec2 dcFlat = normalize( vDcWorldNormal.xz + vec2( 1e-4 ) );
        float dcFacing = dot( dcFlat, normalize( uDcSunSide ) );
        dcGround *= mix( vec3( 0.94, 0.97, 1.06 ), vec3( 1.06, 1.02, 0.94 ), smoothstep( -0.6, 0.6, dcFacing ) );

        diffuseColor.rgb = dcGround;
        `,
      );
  };

  shells.forEach((shell, index) => {
    const inner = index === 0 ? 0 : shells[index - 1].half;
    const outer = shell.outer ?? shell.half;
    const geo = buildRadialShell(inner, outer, shell.segs, shell.ringStep, index >= 3 ? 1.12 : 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // One float per vertex: how trodden this spot is. Consumed by the winter
    // layer (see the varying above); unused in summer, and free — it rides the
    // same buffer update the colour pass already does.
    const worn = new Float32Array(pos.count);

    // ── Heights + texel density in one pass ──────────────────────────
    // The shells already lie in world XZ, so each vertex is lifted by the
    // ONE shared `terrainHeight` and its UV IS its world position over the
    // tile size — every shell wears the ground photo at exactly the same
    // texels per metre, and neighbouring shells' edge rings sample the same
    // heights, so no seam can ever open between them.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    // Direct typed-array access in the hot loop (research §20): the getters
    // are a function call plus a bounds check per component, and this loop
    // runs tens of thousands of times. The attributes are plain
    // non-interleaved Float32Arrays, so reading/writing `.array` touches
    // the exact same memory — identical heights, identical UVs, fewer calls.
    const p = pos.array as Float32Array;
    const u = uv.array as Float32Array;
    for (let i = 0; i < pos.count; i += 1) {
      const x = p[i * 3];
      const z = p[i * 3 + 2];
      p[i * 3 + 1] = terrainHeight(x, z);
      u[i * 2] = x / TILE_METRES;
      u[i * 2 + 1] = z / TILE_METRES;
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeVertexNormals();

    // The colour pass runs AFTER the normals exist, because the normals ARE
    // the slope measurement: the mesh's own vertex normal is exactly what a
    // slope mask needs and reading it back costs nothing. Deriving the slope
    // from `terrainHeight` instead would mean four more height samples on
    // every vertex (research §8 — slope masks drive the layers).
    const normalAttr = geo.attributes.normal as THREE.BufferAttribute;
    // Same direct-array reads as the height pass (`computeVertexNormals`
    // reallocates nothing, so `p` is still the live position array).
    const n = normalAttr.array as Float32Array;
    for (let i = 0; i < pos.count; i += 1) {
      const x = p[i * 3];
      const z = p[i * 3 + 2];
      const h = p[i * 3 + 1];

      // Base: the same rule-based blend the grass clumps sample, so the field
      // and the ground it grows out of are one colour decision. The wear is
      // measured once here and reused by the gravel tint and the attribute.
      const wear = pathWeight(x, z);
      worn[i] = wear;
      const normalY = n[i * 3 + 1];
      groundColorAt(x, z, h, tmp, GROUND_PALETTE, normalY, wear);

      // Altitude banding — GRASS MOUNTAINS (owner directive: "jitne bhi
      // hills aur stones aur pahadiya hai sabhi per ghas"). The two bands
      // still grade the surface, but towards the upland pasture and the
      // pale bleached-grass crest — the blends are CAPPED so the green sward
      // always stays the majority colour, at every altitude, on every slope.
      // (The two thresholds are spelled out as literals on purpose: the
      // sanctuary's contract test pins them, because props across the whole
      // engine read the same 18 m upland band and 52 m crest line.)
      if (h > 18) tmp.lerp(rock, Math.min(0.52, (h - 18) / 30));
      // THE CREST SHELF. The height mask says where the pale crest grass is
      // possible; the slope mask says where it STAYS — above ~52° a face
      // keeps the hardier, darker sward. The same shelf rule the snowline
      // used, now serving grass (research §8, §11; principle 20).
      const shelf = h > 52 ? THREE.MathUtils.smoothstep(normalY, 0.62, 0.94) : 1;
      if (h > 52) tmp.lerp(snow, Math.min(1, (h - 52) / 26) * shelf * 0.5);
      // Below the waterline-ish floor (the island edge) the ground goes dark.
      if (h < -6) tmp.lerp(deep, Math.min(1, (-6 - h) / 14));

      // Art direction: no albedo leaves the physical range. Paths are packed
      // dirt (warm brown), never chalk-white — the gravel lerp is softer and
      // the centre is slightly darkened so the trail reads foot-worn.
      clampAlbedo(tmp, tmp);
      if (wear > 0.02) {
        const pathAmt = Math.min(0.55, wear * 0.62);
        tmp.lerp(GROUND_PALETTE.gravel, pathAmt);
        // Darker centre of the path (foot/wheel wear).
        if (wear > 0.4) {
          const dark = Math.min(0.14, (wear - 0.4) * 0.28);
          tmp.r *= 1 - dark;
          tmp.g *= 1 - dark * 0.92;
          tmp.b *= 1 - dark * 0.8;
        }
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aWorn", new THREE.BufferAttribute(worn, 1));

    // ── Tight bounds ────────────────────────────────────────────────────
    // Every vertex is visible ground now (the old square shells punched
    // ring interiors 240 m down and needed a hand-rolled culling box);
    // the computed box is already exact. 1 m of guard covers numeric dust
    // at the frustum edge — the landscape shader displaces no vertices.
    geo.computeBoundingBox();
    geo.boundingBox!.expandByScalar(1);
    geo.boundingSphere = geo.boundingBox!.getBoundingSphere(new THREE.Sphere());

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = shell.shadow && budget.shadowMapSize > 0;
    mesh.name = `ground-shell-${index}`;
    // The ground never moves: freeze the matrix so the renderer never
    // recomposes it (research §20 — static things cost zero per-frame CPU).
    // matrixWorld still propagates to children/culling/shadows; only the
    // redundant compose from position/quaternion/scale is skipped.
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  });

  return group;
}
