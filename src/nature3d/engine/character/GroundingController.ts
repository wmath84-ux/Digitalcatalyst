// src/nature3d/engine/character/GroundingController.ts
//
// Robust grounding against the Sanctuary's analytic height field. The feet,
// the capsule base, the camera boom and the slope brake all read THIS —
// never terrainHeight directly — so grounding stays one decision with one
// set of scratch objects and zero per-frame allocation.

import * as THREE from "three";
import { OCEAN_LEVEL, WATER_LEVEL, insideRiver, terrainHeight, terrainNormal } from "../terrain";
import { CHARACTER_TUNING as T } from "./CharacterConfig";

export interface GroundSample {
  /** Height of the walkable surface under the query point. */
  height: number;
  /** Surface normal (unit). */
  normal: THREE.Vector3;
  /** Slope angle in radians (0 = flat). */
  slope: number;
  /** True when the slope can be walked. */
  walkable: boolean;
  /** Water depth over the ground at this point (0 = dry). */
  waterDepth: number;
  /** True when the water is too deep to stand in. */
  deepWater: boolean;
}

const _n = new THREE.Vector3();
const _sample: GroundSample = {
  height: 0,
  normal: new THREE.Vector3(0, 1, 0),
  slope: 0,
  walkable: true,
  waterDepth: 0,
  deepWater: false,
};

/**
 * Sample the ground at (x, z). Returns a SHARED object — copy what you keep.
 * The `normal` field is only valid until the next call.
 */
export function sampleGround(x: number, z: number): GroundSample {
  const h = terrainHeight(x, z);
  terrainNormal(x, z, _n);
  const slope = Math.acos(THREE.MathUtils.clamp(_n.y, -1, 1));
  // Water: the river ribbon runs at WATER_LEVEL, the sea at OCEAN_LEVEL.
  // Inland hollows below sea level are NOT ocean (the coast-zone rule from
  // terrain.ts) — but a foot under either waterline still gets wet.
  let water = 0;
  if (insideRiver(x, z) && WATER_LEVEL > h) water = WATER_LEVEL - h;
  else if (OCEAN_LEVEL > h && Math.hypot(x, z) > 800) water = OCEAN_LEVEL - h;
  _sample.height = h;
  _sample.normal.copy(_n);
  _sample.slope = slope;
  _sample.walkable = slope <= T.maxWalkableSlope;
  _sample.waterDepth = water > 0 ? water : 0;
  _sample.deepWater = water > 1.15;
  return _sample;
}

/**
 * Project a planar wish vector onto the ground plane so movement follows
 * the slope instead of hovering over it or digging into it.
 */
export function projectOnGround(
  dx: number,
  dz: number,
  normal: THREE.Vector3,
  out: THREE.Vector2,
): THREE.Vector2 {
  // v' = v − n·(v·n), with v.y = 0.
  const dot = dx * normal.x + dz * normal.z;
  out.set(dx - normal.x * dot, dz - normal.z * dot);
  const len = out.length();
  // Renormalise to the input length so uphill is not slower by geometry
  // alone (the slope brake below owns difficulty, explicitly).
  const inLen = Math.hypot(dx, dz);
  if (len > 1e-6 && inLen > 1e-6) out.multiplyScalar(inLen / len);
  return out;
}
