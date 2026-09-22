// src/nature3d/engine/warehouseSite.ts
//
// Where the abandoned warehouse stands, and the one test every scatter uses
// to stay out of it.
//
// The site is (−168, −44), just south of the old ridge. Facing the origin
// from that ridge put the glazed end over a 3 m drop; filling the drop so
// the slab stayed level left the building on a berm, which is why it never
// read as sitting on the ground. Here the glazed end points world +Z, the
// only approach where the hill stays within about a metre of the slab for
// 50 m. `levelWarehouseGround` cuts the yard down to the lowest point under
// the walls — a cut, never a fill — so the slab meets dirt instead of
// sitting on a platform. The west trail passes 9 m outside that blend.
//
// The baked clerestory faces local +Z (measured off the shipped window
// normals, not the source file). Yaw 0 keeps that face on the continuous
// approach. Turning it toward the origin puts it back over the drop.

/** World X of the baked model's centre. */
export const WAREHOUSE_X = -168;
/** World Z of the baked model's centre. */
export const WAREHOUSE_Z = -44;

/**
 * three.js Y rotation. 0 keeps local +Z (the glazed end) on world +Z, the
 * approach the yard was cut for. The Warehouse preset adds a small offset
 * so the corner and the ground line are both in frame.
 */
export const WAREHOUSE_YAW = 0;

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
 * Walls sit at ±13 × ±15. The flat zone is a few metres past them — more
 * than one cell of the coarsest ground shell here (~7 m) — and a little
 * further on +Z, where the camera stands. The blend back to the hill is
 * long enough that a 2 m cut reads as a grade, not a quarry wall. It stops
 * short of the west trail, which passes about 9 m beyond the +Z edge.
 */
const PAD_FLAT_X = 16;
const PAD_FLAT_Z_NEG = 18;
const PAD_FLAT_Z_POS = 22;
const PAD_BLEND_X = 14;
const PAD_BLEND_Z_NEG = 18;
const PAD_BLEND_Z_POS = 20;
const PAD_OUTER_X = PAD_FLAT_X + PAD_BLEND_X;
const PAD_OUTER_Z_NEG = PAD_FLAT_Z_NEG + PAD_BLEND_Z_NEG;
const PAD_OUTER_Z_POS = PAD_FLAT_Z_POS + PAD_BLEND_Z_POS;
/** Axis-aligned reach of the blend box, plus a metre. Yaw is 0, so this is the box. */
const PAD_REACH = 48;

let padY = NaN;
let sealing = false;

/**
 * Seat the ground under the warehouse.
 *
 * Called from `terrainHeight` on every sample. The common case — anywhere
 * but this one yard — is two comparisons and a return. Inside the yard the
 * height is the lowest natural sample under the walls, so the slab, the
 * mesh and the grass share a floor that is cut into the hill, not built
 * up on top of it. `naturalAt` is `terrainHeight`
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
    // The lowest point under the walls. Cutting down to it means the yard
    // is never a fill: a fill is the berm that made the slab look perched.
    let min = Infinity;
    for (let ix = -2; ix <= 2; ix += 1) {
      for (let iz = -2; iz <= 2; iz += 1) {
        const lx = ix * 6.5;
        const lz = iz * 7.5;
        const h = naturalAt(
          WAREHOUSE_X + lx * COS + lz * SIN,
          WAREHOUSE_Z - lx * SIN + lz * COS,
        );
        if (h < min) min = h;
      }
    }
    padY = min;
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
