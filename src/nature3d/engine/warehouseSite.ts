// src/nature3d/engine/warehouseSite.ts
//
// Where the abandoned warehouse stands, and the one test every scatter uses
// to stay out of it.
//
// The site is the flattest pad the height field has outside the board fan,
// the river and the trails: (−169, −28), about 171 m west-southwest of the
// seat. A 5×5 sample of the 26 × 30 m footprint spans ~1.3 m there — the
// slab sinks to the lowest sample, so the uphill side buries about a metre
// of foundation instead of floating a gap. The west trail passes ~23 m north
// of the rotated footprint and is never crossed.
//
// The baked clerestory faces local +Z (measured off the shipped window
// normals, not the source file). The yaw turns that face toward the origin,
// so the learner looking out from the sanctuary sees the glazed end.

/** World X of the baked model's centre. */
export const WAREHOUSE_X = -169;
/** World Z of the baked model's centre. */
export const WAREHOUSE_Z = -28;

const TO_ORIGIN_X = -WAREHOUSE_X;
const TO_ORIGIN_Z = -WAREHOUSE_Z;

/**
 * three.js Y rotation that maps local +Z (the glazed end) onto the direction
 * toward the origin. The orbit preset uses the same angle: the camera sits
 * on that face, looking back at the shell.
 */
export const WAREHOUSE_YAW = Math.atan2(TO_ORIGIN_X, TO_ORIGIN_Z);

/**
 * Local half-extents of the baked shell (12.99 × 15.00) plus a 1.4 m apron,
 * so a blade or a boulder cannot grow through the wall.
 */
export const WAREHOUSE_HALF_X = 14.4;
export const WAREHOUSE_HALF_Z = 16.4;

const COS = Math.cos(WAREHOUSE_YAW);
const SIN = Math.sin(WAREHOUSE_YAW);
/** Half-diagonal of the apron box. The early-out below is this, plus margin. */
const HALF_DIAG = 22;

/**
 * True when (x, z) lands inside the rotated footprint.
 *
 * `margin` grows the box: trees pass ~8 (a crown must not sit on the roof),
 * grass passes ~0.6 (a blade must not clip the wall). The common case — a
 * point nowhere near the building — is two multiplies and a compare; the
 * rotation only runs inside the bounding circle.
 */
export function insideWarehouse(x: number, z: number, margin = 0): boolean {
  const dx = x - WAREHOUSE_X;
  const dz = z - WAREHOUSE_Z;
  const limit = HALF_DIAG + margin;
  if (dx * dx + dz * dz > limit * limit) return false;
  // Inverse of three's Y rotation.
  const lx = COS * dx - SIN * dz;
  const lz = SIN * dx + COS * dz;
  return Math.abs(lx) < WAREHOUSE_HALF_X + margin && Math.abs(lz) < WAREHOUSE_HALF_Z + margin;
}
