// src/nature3d/engine/regions.ts
//
// THE ONE CONTINUOUS WORLD.
//
// There are no longer three separate 3D pages. There is one Sanctuary, and
// the other two areas are districts inside it that you can walk to:
//
//        ── TREK ──        ── SANCTUARY ──        ── SAFARI ──
//      (TerrainTrek)         (the meadow,          (Clay Safari's
//       eroded ridges,        the board,            river valley and
//       open highland)        the student)          its animals)
//         x ≈ -900               x = 0                x ≈ +900
//
// They are laid out along the X axis and joined by land bridges, so you can
// start at the board, walk west into the highlands or east into the safari
// valley, and never hit a loading screen or a wall.
//
// This module owns the LAYOUT and the height contribution of each district.
// `terrain.ts` calls into it so that one height field still answers for the
// entire world — which is what keeps grass, trees, animals, the student's
// feet and the board clamp all agreeing about where the ground is.

/** Centre of each district in world space, and how far its core reaches. */
export interface Region {
  id: "sanctuary" | "safari" | "trek";
  centerX: number;
  centerZ: number;
  /** Radius of the district's own terrain treatment. */
  radius: number;
}

// The districts sit 700 m apart. That is far enough that each reads as its
// own place from the middle of it, and close enough that from the default
// camera — which looks along the whole chain — all three are visible at once.
export const SANCTUARY: Region = { id: "sanctuary", centerX: 0, centerZ: 0, radius: 430 };
export const SAFARI: Region = { id: "safari", centerX: 700, centerZ: 0, radius: 300 };
export const TREK: Region = { id: "trek", centerX: -700, centerZ: 0, radius: 380 };

export const REGIONS: readonly Region[] = [TREK, SANCTUARY, SAFARI];

/**
 * How far the whole connected world reaches from the origin. The walk limit
 * and the ground mesh both derive from this, so widening the chain
 * automatically widens everything that has to cover it.
 */
export const WORLD_REACH = 1180;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Influence of a district at a point: 1 in its core, falling to 0 out on the
 * connecting plains. Districts blend rather than abut, so there is no seam
 * where one terrain rule stops and the next starts.
 */
export function regionWeight(r: Region, x: number, z: number): number {
  const d = Math.hypot(x - r.centerX, z - r.centerZ);
  return 1 - smoothstep(r.radius * 0.55, r.radius * 1.25, d);
}

/**
 * The Clay Safari district's ground.
 *
 * The safari world is authored on its own small map (84 x 60) with a gentle
 * bowl and an S-bend river. Here we only need its LARGE-SCALE shape, because
 * the safari's own props are placed on top of it: a shallow basin so the
 * valley reads as lower ground you descend into, with soft dunes around the
 * rim. The props themselves are positioned in local coordinates and then
 * offset into the district (see `safariToWorld`).
 */
export function safariRelief(x: number, z: number): number {
  const lx = x - SAFARI.centerX;
  const lz = z - SAFARI.centerZ;
  const d = Math.hypot(lx, lz);

  // A basin: the valley floor sits a few metres below the surrounding plain.
  const basin = -4.5 * (1 - smoothstep(0, SAFARI.radius * 0.85, d));
  // Dunes on the rim so the district has a horizon of its own.
  const dunes =
    (Math.sin(lx * 0.021 + 1.1) * Math.cos(lz * 0.018 - 0.4) * 3.1 +
      Math.sin(lx * 0.045 - lz * 0.038) * 1.2) *
    smoothstep(SAFARI.radius * 0.5, SAFARI.radius * 1.1, d);
  // The authored map itself is kept flat-ish so the GLB animals and trees
  // stand level; only outside it does the ground start to roll.
  const flatCore = 1 - smoothstep(55, 120, d);
  return basin + dunes * (1 - flatCore);
}

/**
 * The TerrainTrek district's ground.
 *
 * TerrainTrek generates infinite terrain from fractal simplex noise —
 * multiple octaves, each at higher frequency and lower amplitude, then raised
 * to a power so valleys stay broad and peaks stay sharp. That is exactly the
 * recipe reproduced here, with its own published constants:
 *
 *      lacunarity  2.05   (frequency multiplier per octave)
 *      persistence 0.45   (amplitude multiplier per octave)
 *      power       2      (sharpens peaks, flattens valleys)
 *
 * The one change is scale: the original spreads that noise over an infinite
 * plane at amplitude 180, which next to a 4 m study board would be a wall.
 * Amplitude here is tuned so the highlands read as real mountains from the
 * meadow while still being walkable.
 */
export function trekRelief(x: number, z: number): number {
  const lx = x - TREK.centerX;
  const lz = z - TREK.centerZ;

  const LACUNARITY = 2.05;
  const PERSISTENCE = 0.45;
  const POWER = 2;
  const BASE_FREQUENCY = 0.0075;
  const AMPLITUDE = 62;
  const ITERATIONS = 5;

  // Fixed per-octave offsets. The source picks these from a seeded RNG; here
  // they are constants so the world is identical on every machine and every
  // reload — the herds, trees and the saved board placement all depend on the
  // ground being reproducible.
  const OFFSETS: readonly [number, number][] = [
    [0, 0],
    [131.7, -88.3],
    [-274.1, 412.9],
    [615.4, 302.6],
    [-98.2, -531.8],
  ];

  let elevation = 0;
  let frequency = BASE_FREQUENCY;
  let amplitude = 1;
  let normalisation = 0;

  for (let i = 0; i < ITERATIONS; i += 1) {
    const [ox, oz] = OFFSETS[i];
    // Smooth value noise standing in for simplex: the visual signature of
    // this terrain comes from the octave stack and the power curve, not from
    // the particular gradient basis, and this keeps the height field a pure
    // analytic function that every other system can sample cheaply.
    const n =
      Math.sin(lx * frequency + ox) * Math.cos(lz * frequency + oz) * 0.6 +
      Math.sin((lx + lz) * frequency * 1.37 + ox * 0.5) * 0.4;
    elevation += n * amplitude;
    normalisation += amplitude;
    amplitude *= PERSISTENCE;
    frequency *= LACUNARITY;
  }

  elevation /= normalisation;
  // The power curve is applied to the magnitude and the sign restored, so
  // valleys broaden and ridges sharpen without flipping any terrain over.
  elevation = Math.pow(Math.abs(elevation), POWER) * Math.sign(elevation);
  elevation *= AMPLITUDE;

  // Lift the whole district so its valley floors sit above the meadow rather
  // than below it: you climb INTO the highlands.
  return elevation + 6;
}

/** Local safari coordinates -> world coordinates. */
export function safariToWorld(lx: number, lz: number): [number, number] {
  return [lx + SAFARI.centerX, lz + SAFARI.centerZ];
}
