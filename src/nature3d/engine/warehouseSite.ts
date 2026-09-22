// src/nature3d/engine/warehouseSite.ts
//
// Where the abandoned warehouse stands, and the one test every scatter uses
// to stay out of it.
//
// The site is the flattest pad the height field has outside the board fan,
// the river and the trails: (−169, −28), about 171 m west-southwest of the
// seat. The raw hill still rises ~1.8 m under the slab and falls away in
// front of the glazed end, so a rigid floor either buried the uphill wall
// or hung in the air. `levelWarehouseGround` cuts one level yard under the
// walls and out past the Warehouse camera, then eases back to the hill.
// The west trail stays outside that blend.
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
 * Level yard, in the building's local frame. +Z is the glazed end.
 *
 * Walls sit at ±13 × ±15. The flat zone runs 12 m past them — more than
 * one cell of the coarsest ground shell here (~7 m) — and continues out to
 * local +Z = 42, past the Warehouse camera, so the ground in that view is
 * the same height as the slab. The blend back to the hill is short on X
 * because the west trail passes 33 m off that side and must stay natural.
 */
const PAD_FLAT_X = 25;
const PAD_FLAT_Z_NEG = 27;
const PAD_FLAT_Z_POS = 42;
const PAD_BLEND_X = 6;
const PAD_BLEND_Z_NEG = 12;
const PAD_BLEND_Z_POS = 8;
const PAD_OUTER_X = PAD_FLAT_X + PAD_BLEND_X;
const PAD_OUTER_Z_NEG = PAD_FLAT_Z_NEG + PAD_BLEND_Z_NEG;
const PAD_OUTER_Z_POS = PAD_FLAT_Z_POS + PAD_BLEND_Z_POS;
/** Axis-aligned reach of the rotated blend box, plus a metre. */
const PAD_REACH = 64;

let padY = NaN;
let sealing = false;

/**
 * Seat the ground under the warehouse.
 *
 * Called from `terrainHeight` on every sample. The common case — anywhere
 * but this one yard — is two comparisons and a return. Inside the yard the
 * height is the natural height at the building's centre, so the slab, the
 * mesh and the grass all share one floor. `naturalAt` is `terrainHeight`
 * itself; `sealing` stops that callback from re-entering the blend while
 * the pad height is being captured.
 */
export function levelWarehouseGround(
  x: number,
  z: number,
  natural: number,
  naturalAt: (x: number, z: number) => number,
): number {
  if (sealing) return natural;
  const dx = x - WAREHOUSE_X;
  if (dx > PAD_REACH || dx < -PAD_REACH) return natural;
  const dz = z - WAREHOUSE_Z;
  if (dz > PAD_REACH || dz < -PAD_REACH) return natural;
  if (padY !== padY) {
    sealing = true;
    padY = naturalAt(WAREHOUSE_X, WAREHOUSE_Z);
    sealing = false;
  }
  const lx = COS * dx - SIN * dz;
  const lz = SIN * dx + COS * dz;
  const ax = lx < 0 ? -lx : lx;
  if (ax >= PAD_OUTER_X || lz >= PAD_OUTER_Z_POS || lz <= -PAD_OUTER_Z_NEG) return natural;
  if (ax <= PAD_FLAT_X && lz <= PAD_FLAT_Z_POS && lz >= -PAD_FLAT_Z_NEG) return padY;
  const ex = ax <= PAD_FLAT_X ? 0 : (ax - PAD_FLAT_X) / PAD_BLEND_X;
  const ez = lz >= 0
    ? (lz <= PAD_FLAT_Z_POS ? 0 : (lz - PAD_FLAT_Z_POS) / PAD_BLEND_Z_POS)
    : (lz >= -PAD_FLAT_Z_NEG ? 0 : (-lz - PAD_FLAT_Z_NEG) / PAD_BLEND_Z_NEG);
  const e = ex > ez ? ex : ez;
  const t = e * e * (3 - 2 * e);
  return padY + (natural - padY) * t;
}

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
