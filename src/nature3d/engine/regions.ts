// One continuous Sanctuary: the home meadow and the western Highlands.
// This layout and its shared height field drive terrain, vegetation and walking.

import { noise } from "./simplex";

/** Centre of each district in world space, and how far its core reaches. */
export interface Region {
  id: "sanctuary" | "trek";
  centerX: number;
  centerZ: number;
  /** Radius of the district's own terrain treatment. */
  radius: number;
}

// The districts sit 700 m apart. That is far enough that each reads as its
// own place from the middle of it, and close enough that from the default
// camera — which looks along the whole chain — both are visible at once.
export const SANCTUARY: Region = { id: "sanctuary", centerX: 0, centerZ: 0, radius: 430 };
export const TREK: Region = { id: "trek", centerX: -700, centerZ: 0, radius: 380 };

export const REGIONS: readonly Region[] = [TREK, SANCTUARY];

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
  // A LONG blend. The trek district carries 100 m of relief, so if it faded
  // in over a short distance its rim would be a cliff where the mountains
  // meet the plain. Fading from 35% to 190% of the radius turns that into a
  // foothill approach you can walk up.
  return 1 - smoothstep(r.radius * 0.35, r.radius * 1.9, d);
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

  // TerrainTrek's published terrain settings, from
  // sources/Game/State/Terrains.js, carried over unchanged:
  const LACUNARITY = 2.05;   // frequency multiplier per octave
  const PERSISTENCE = 0.45;  // amplitude multiplier per octave
  const POWER = 2;           // sharpens peaks, broadens valleys
  const BASE_FREQUENCY = 0.003;
  const ELEVATION_OFFSET = 1;
  const ITERATIONS = 6;

  // The one value that is NOT the source's: it publishes baseAmplitude 180
  // for an infinite world with nothing man-made in it. Beside a 2.7 m study
  // board that is a 180 m wall, so the range is scaled to something a learner
  // can actually walk up while still reading as real mountains from the
  // meadow 700 m away.
  const AMPLITUDE = 110;

  // The source seeds its per-octave offsets from a seeded RNG. Fixed values
  // here keep the world byte-identical across machines and reloads, which the
  // herds, the trees and the saved board placement all depend on.
  const OFFSETS: readonly [number, number][] = [
    [0, 0],
    [131.7, -88.3],
    [-274.1, 412.9],
    [615.4, 302.6],
    [-98.2, -531.8],
    [347.6, 159.4],
  ];

  let elevation = 0;
  let frequency = BASE_FREQUENCY;
  let amplitude = 1;
  let normalisation = 0;

  for (let i = 0; i < ITERATIONS; i += 1) {
    const [ox, oz] = OFFSETS[i];
    // REAL simplex noise, the same basis the source uses. A sum of sin/cos
    // terms was tried here first and is wrong: it is separable, so its ridges
    // align to the axes and repeat on a visible lattice instead of looking
    // eroded.
    const n = noise.noise2D(lx * frequency + ox, lz * frequency + oz);
    elevation += n * amplitude;
    normalisation += amplitude;
    amplitude *= PERSISTENCE;
    frequency *= LACUNARITY;
  }

  elevation /= normalisation;
  // Power curve on the magnitude with the sign restored, exactly as the
  // source does it, so valleys broaden and ridges sharpen.
  elevation = Math.pow(Math.abs(elevation), POWER) * Math.sign(elevation);
  elevation *= AMPLITUDE;
  elevation += ELEVATION_OFFSET;

  // The source's terrain is infinite and has no sea level, so its noise is
  // free to go as far down as it goes up. Here the district has to MEET the
  // connecting plain at its rim, so the basins are lifted: the highlands rise
  // out of the meadow rather than sinking a 50 m pit beside it.
  if (elevation < 0) elevation *= 0.28;

  return elevation;
}
