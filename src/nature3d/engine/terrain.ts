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
//              snow-capped ridges and a lot of crest-to-valley variance
//   1150+ m    the island edge — the world is a CIRCLE, not a square plate:
//              outside the arc the ground falls away into the haze, which is
//              what rounds the silhouette and hides the mesh's square corners

import * as THREE from "three";
import type { QualityBudget } from "./quality";
import {
  REGIONS, SAFARI, SANCTUARY, TREK, WORLD_REACH,
  regionWeight, safariRelief, trekRelief,
} from "./regions";
import { noise } from "./simplex";
import { groundColorAt, pathWeight, SUN_SIDE_X, SUN_SIDE_Z } from "./environment";
import { GROUND_PALETTE, GROUND_TILE_METRES, clampAlbedo } from "./palette";
import { injectWorldVaryings } from "./atmosphere";

/** Where the river gorge runs (world X) and how wide it is. */
export const RIVER_CENTER_X = 18;
export const RIVER_HALF_WIDTH = 6.4;
export const WATER_LEVEL = -1.45;

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
 *   • the peaks top out at EXACTLY 100 m (MOUNTAIN_MAX_HEIGHT);
 *   • the height grows gradually with radius, so the mountains decrease
 *     steadily from the 100 m band down to foothills and then rolling ground
 *     as you walk toward the centre — no cliff of terrain, just a long rise.
 */
const RIM_INNER = 300; // foothills begin
const RIM_FULL = 900;  // full 100 m band starts
export const MOUNTAIN_MAX_HEIGHT = 100;

/** Where the world's CIRCLE edge begins and ends (the plate is a square, the world is not). */
const ISLAND_EDGE_IN = 1150;
const ISLAND_EDGE_OUT = 1330;
const ISLAND_FLOOR = -16;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
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
  let corridor = 1;
  for (const r of REGIONS) {
    if (r.id === "sanctuary") continue;
    // Distance from the straight line joining the sanctuary to this district.
    const t = Math.max(0, Math.min(1, x / r.centerX));
    const lineZ = r.centerZ * t;
    const off = Math.hypot(z - lineZ, 0);
    const onCorridor = (x > 0) === (r.centerX > 0);
    if (onCorridor) corridor = Math.min(corridor, smoothstep(90, 260, off));
  }
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
  // The inner ring is FOOTHILLS: the 100 m peaks live on the outer arc
  // (see `outerRim`), so this band is the layer beneath them — 44 m of
  // lower, softer ranges that hand off to the arc for depth.
  // Three octaves of ridged noise gives crests and saddles rather than cones.
  const a = Math.sin(x * 0.0115) * Math.cos(z * 0.0102);
  const b = Math.sin(x * 0.0231 + z * 0.0187 + 1.7);
  const c = Math.sin(x * 0.0476 - z * 0.0413 + 4.2);
  // `1 - |n|` is the classic ridged transform: it turns rounded humps into
  // sharp-crested ridges with eroded flanks, which is what reads as a mountain.
  const ridged = (1 - Math.abs(a)) * 0.62 + (1 - Math.abs(b)) * 0.26 + (1 - Math.abs(c)) * 0.12;
  // Large-scale mass so some sectors are high ranges and others stay open.
  const mass = 0.45 + 0.55 * (Math.sin(Math.atan2(z, x) * 2.3) * 0.5 + 0.5);
  return ridged * ridged * rise * mass * 44;
}

/**
 * The OUTER mountain arc — the edge of the world, hills on every side.
 *
 * `outerRim` is added to the height field directly (not weighted by the
 * sanctuary's region blend) so the arc is COMPLETE: east of the safari and
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

  let corridor = 1;
  for (const r of REGIONS) {
    if (r.id === "sanctuary") continue;
    const t = Math.max(0, Math.min(1, x / r.centerX));
    const lineZ = r.centerZ * t;
    const off = Math.hypot(z - lineZ, 0);
    const onCorridor = (x > 0) === (r.centerX > 0);
    if (onCorridor) corridor = Math.min(corridor, smoothstep(120, 420, off));
  }
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
  // never actually is 100 m. A small floor keeps the arc from ever flat.
  const h = Math.min(1, Math.max(Math.pow(ridged * mass, 1.15), 0.05) * 1.28);
  return h * MOUNTAIN_MAX_HEIGHT * rise * corridor;
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

  // Fine near-field texture (a few metres of undulation that breaks up the
  // meadow floor close in), fading out past the clearing.
  const hills =
    Math.sin(x * 0.06) * Math.cos(z * 0.06) * 2.2 +
    Math.sin(x * 0.14 + z * 0.1) * 0.85 +
    Math.sin(x * 0.31 - z * 0.21) * 0.22;
  const dist = Math.hypot(x, z);
  // Smooth ramp instead of a hard clamp: the first metres around the chair
  // are truly flat, and the undulation eases in so nothing pokes through the
  // board fan (the outermost study board stands at r ≈ 45 m on 3 m posts).
  const flatten = smoothstep(10, 32, dist);

  // ROLLING MID-GROUND — the "BGMI's ground is not flat" term. Three octaves
  // of real simplex (not a separable sin/cos lattice) with an amplitude that
  // GROWS with distance: ~2 m just past the clearing, ~12 m at the foot of
  // the foothills. Wide, soft, walkable — the same undulation you see across
  // an Erangel map, only scaled to a study meadow.
  const rolling =
    noise.noise2D(x * 0.011 + 3.1, z * 0.011 - 7.7) * 0.6 +
    noise.noise2D(x * 0.027 - 19.4, z * 0.027 + 26.8) * 0.27 +
    noise.noise2D(x * 0.065 + 51.2, z * 0.065 - 33.5) * 0.13;
  const rollIn = smoothstep(42, 150, dist);
  const rollAmp = 2.4 + 9.8 * smoothstep(70, 470, dist);
  const rollingGround = rolling * rollAmp * rollIn;

  // ── The three districts ─────────────────────────────────────────────
  //
  // The sanctuary's own relief fades out as you leave it, and the safari and
  // trek reliefs fade in as you arrive, so the world is one continuous
  // surface with no seam, no cliff and no invisible boundary between areas.
  const wSanct = regionWeight(SANCTUARY, x, z);
  const wSafari = regionWeight(SAFARI, x, z);
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
    (safariRelief(x, z) + linkRoll * 0.35) * wSafari +
    trekRelief(x, z) * wTrek +
    linkRoll * Math.max(0, 1 - wSanct - wSafari - wTrek) +
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
  // The 100 m cap: the brief says the mountains are 100 m high, so nothing
  // in the whole world — arc, trek highlands, the lesson crest — is allowed
  // to exceed it. (The lesson crest targets 37.5 m, so the cap only ever
  // trims real mountain peaks.)
  const base = Math.min(
    MOUNTAIN_MAX_HEIGHT,
    (districtBlend + lessonBump) * edge + ISLAND_FLOOR * (1 - edge),
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
  if (bankBlend <= 0) return base;
  // The study clearing sits only 18 m from the channel, well inside the bank
  // blend. Without this the near bank tips the clearing into the water and the
  // chair, board and student all end up on a slope. The clearing wins.
  bankBlend *= smoothstep(CLEARING_RADIUS, CLEARING_RADIUS + 7, dist);
  if (bankBlend <= 0) return base;

  // Concave bed: deepest at the centre line, rising to the waterline at the
  // channel edge. Always at least 0.8 m of water, so the plane never clips.
  const across = Math.min(fromCentre / RIVER_HALF_WIDTH, 1);
  const bedDepth = 3.4 - across * across * 2.2;
  const bed = WATER_LEVEL - 0.8 - bedDepth;

  return base * (1 - bankBlend) + Math.min(bed, base) * bankBlend;
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
 * Build the ground.
 *
 * THE KILOMETRE PROBLEM: a single 1000 m plane dense enough to show the hills
 * would need ~4 M vertices. Instead the ground is built as CONCENTRIC LOD
 * SHELLS — the same trick BGMI-class mobile renderers use for open terrain.
 * Each shell covers 4× the area of the one inside it at the same vertex cost,
 * so detail is spent where the camera actually is:
 *
 *   shell 0   ±90 m    full density  — where you walk, where the grass is
 *   shell 1   ±260 m   1/3 density   — rolling mid-ground
 *   shell 2   ±1000 m  1/9 density   — the foothills and the mountain band
 *   shell 3   ±1380 m  the rest      — the arc's peaks and the circular edge
 *
 * Every shell samples the SAME `terrainHeight`, so the seams line up exactly
 * and a hill on the horizon is the same hill when you finally walk up it.
 * Total: 4 draw calls for the whole world.
 */
export function buildTerrain(budget: QualityBudget, groundTexture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain";

  // The altitude anchors stay explicit: they are also READ by the props (the
  // rock kit refuses to place above the snowline, the grass uses the same
  // heights), so they belong to the terrain. The base blend itself now comes
  // from the environmental field, so the mesh, the grass and the trees all
  // describe the same ground (research §8, §12).
  const rock = new THREE.Color(0x6f7b74);
  const snow = new THREE.Color(0xeef4fb);
  // The island edge floor: dark, wet soil so the dropped-off corners read as
  // shadowed ground in the haze, never as a bright square patch.
  const deep = new THREE.Color(0x33291d);
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

  // Four shells, not three.
  //
  // With three, the outer shell had to cover the whole 2760 m world on 132
  // segments — one vertex every 21 m. Mountains sampled that coarsely lose
  // their crests and the far districts flatten into smooth swells. A fourth
  // shell splits that span, so the sanctuary's ring of hills and the
  // neighbouring districts are both carried at roughly 7 m, which is what
  // the old single-kilometre world used.
  const shells: Array<{ half: number; segs: number; shadow: boolean }> = [
    { half: 90, segs: Math.round(150 * density), shadow: true },
    { half: 260, segs: Math.round(120 * density), shadow: false },
    // Covers the sanctuary's foothills, the rolling ground and the inner passes.
    { half: 620, segs: Math.round(190 * density), shadow: false },
    // Covers the 100 m mountain arc, both districts and the circular edge.
    { half: WORLD_HALF, segs: Math.round(300 * density), shadow: false },
  ];

  const mat = new THREE.MeshStandardMaterial({
    map: groundTexture,
    vertexColors: true,
    roughness: 0.96,
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

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `
        #include <common>
        uniform vec2 uDcSunSide;
        `,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
        #include <map_fragment>

        // MACRO VARIATION — the same ground detail sampled 16× larger, so broad
        // patches of the meadow shift warmer/cooler and the tile stops repeating
        // visibly. Two fetches in total; on a surface that fills the screen this
        // is the cheapest large-scale variation there is.
        vec3 dcMacro = texture2D( map, vMapUv * 0.0625 ).rgb;
        float dcMacroL = dot( dcMacro, vec3( 0.3333 ) );
        diffuseColor.rgb *= mix( 0.87, 1.13, dcMacroL );

        // ASPECT TINT — warm on the sunlit faces, cool where the sky bounces
        // into the shade, applied to ALBEDO rather than to light so it survives
        // every hour: "ek hi rock dopahar mein warm grey lagta hai aur shaam
        // mein purple/orange tone capture karta hai" (research §10).
        vec2 dcFlat = normalize( vDcWorldNormal.xz + vec2( 1e-4 ) );
        float dcFacing = dot( dcFlat, normalize( uDcSunSide ) );
        diffuseColor.rgb *= mix( vec3( 0.94, 0.97, 1.06 ), vec3( 1.06, 1.02, 0.94 ), smoothstep( -0.6, 0.6, dcFacing ) );
        `,
      );
  };

  shells.forEach((shell, index) => {
    const size = shell.half * 2;
    const geo = new THREE.PlaneGeometry(size, size, shell.segs, shell.segs);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Shells 1+ are rings: the middle is punched out by pushing those
    // vertices down out of sight, so they never z-fight the shell inside.
    const innerHalf = index === 0 ? 0 : shells[index - 1].half;

    // ── Texel density: the same texels per metre on every shell ─────
    // The tile count is derived from THIS shell's size, so the 180 m shell
    // and the 2760 m shell are authored at one density and the meadow never
    // looks sharper than the hills (research §18). Hoisted: it is
    // loop-invariant, so computing it per vertex was pure waste.
    const tiles = size / TILE_METRES;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    // Direct typed-array access in the hot loop (research §20): the getters
    // are a function call plus a bounds check per component, and this loop
    // runs ~165 000 times. PlaneGeometry attributes are plain
    // non-interleaved Float32Arrays, so reading/writing `.array` touches the
    // exact same memory — identical heights, identical UVs, fewer calls.
    const p = pos.array as Float32Array;
    const u = uv.array as Float32Array;
    for (let i = 0; i < pos.count; i += 1) {
      const x = p[i * 3];
      // PlaneGeometry lies in XY and is rotated -90° about X, so local +Y → world -Z.
      const z = -p[i * 3 + 1];
      const h = terrainHeight(x, z);
      const inside = innerHalf > 0 && Math.abs(x) < innerHalf - 1 && Math.abs(z) < innerHalf - 1;
      p[i * 3 + 2] = inside ? h - 240 : h;
      u[i * 2] *= tiles;
      u[i * 2 + 1] *= tiles;
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeVertexNormals();

    // The colour pass runs AFTER the normals exist, because the normals ARE
    // the slope measurement: the mesh's own vertex normal is exactly what a
    // slope mask needs and reading it back costs nothing. Deriving the slope
    // from `terrainHeight` instead would mean four more height samples on all
    // ~150 000 vertices (research §8 — slope masks drive the layers).
    const normalAttr = geo.attributes.normal as THREE.BufferAttribute;
    // Same direct-array reads as the height pass (`computeVertexNormals`
    // reallocates nothing, so `p` is still the live position array).
    const n = normalAttr.array as Float32Array;
    for (let i = 0; i < pos.count; i += 1) {
      const x = p[i * 3];
      const z = -p[i * 3 + 1];
      const h = p[i * 3 + 2];
      // The hidden ring-interior vertices (pushed 240 m down) are never seen,
      // so they get no colour work at all.
      if (h < -180) {
        colors[i * 3] = deep.r;
        colors[i * 3 + 1] = deep.g;
        colors[i * 3 + 2] = deep.b;
        continue;
      }

      // Base: the same rule-based blend the grass clumps sample, so the field
      // and the ground it grows out of are one colour decision. The wear is
      // measured once here and reused by the gravel tint below.
      const worn = pathWeight(x, z);
      const normalY = n[i * 3 + 1];
      groundColorAt(x, z, h, tmp, GROUND_PALETTE, normalY, worn);

      // Altitude banding: grass gives way to bare rock, then snow on the
      // highest crests. This is what makes the distant ranges read as real
      // mountains instead of green cones.
      // (The two thresholds are spelled out as literals on purpose: the
      // sanctuary's contract test pins them, because props across the whole
      // engine read the same 18 m rock band and 52 m snowline.)
      if (h > 18) tmp.lerp(rock, Math.min(1, (h - 18) / 30));
      // SNOW NEEDS A SHELF TO SIT ON. The height mask says where snow is
      // possible; the slope mask says whether it STAYS — above ~52° a face
      // sheds it all winter and stays bare rock. Without this multiply every
      // peak came out evenly frosted, which is the single clearest "this was
      // height-banded, not observed" tell in a stylised mountain range
      // (research §8, §11; principle 20).
      const shelf = h > 52 ? THREE.MathUtils.smoothstep(normalY, 0.62, 0.94) : 1;
      if (h > 52) tmp.lerp(snow, Math.min(1, (h - 52) / 26) * shelf);
      // Below the waterline-ish floor (the island edge) the ground goes dark.
      if (h < -6) tmp.lerp(deep, Math.min(1, (-6 - h) / 14));

      // Art direction: no albedo leaves the physical range, and the worn
      // trails read a little lighter and greyer than the ground around them.
      clampAlbedo(tmp, tmp);
      if (worn > 0.02) tmp.lerp(GROUND_PALETTE.gravel, Math.min(0.45, worn * 0.5));

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // ── Tight bounds over the VISIBLE surface only ─────────────────────
    // Research §20 (cull volumes): three.js frustum-culls per mesh against
    // the bounding sphere, but the auto-computed one includes the
    // ring-interior verts sitting 240 m below the ground — which dragged
    // every outer shell's culling volume ~100 m underground and inflated it,
    // so a shell the camera was not looking at could never be rejected.
    // Re-testing the same `inside` predicate from the height pass keeps
    // exactly the verts the eye can see. (Heights alone cannot do this: pit
    // verts under high ground sit ABOVE -180 m.)
    // Local +Y maps to world -Z under the -90° X rotation, so |planeY| is |z|.
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i += 1) {
      const bx = p[i * 3];
      const by = p[i * 3 + 1];
      if (innerHalf > 0 && Math.abs(bx) < innerHalf - 1 && Math.abs(by) < innerHalf - 1) continue;
      const bz = p[i * 3 + 2];
      if (bx < minX) minX = bx;
      if (by < minY) minY = by;
      if (bz < minZ) minZ = bz;
      if (bx > maxX) maxX = bx;
      if (by > maxY) maxY = by;
      if (bz > maxZ) maxZ = bz;
    }
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(minX, minY, minZ),
      new THREE.Vector3(maxX, maxY, maxZ),
    );
    // 1 m of guard for rotation/float rounding on a 180–2760 m shell — the
    // landscape shader displaces no vertices, so exact bounds are safe and
    // this only covers numeric dust at the frustum edge.
    geo.boundingBox.expandByScalar(1);
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
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
