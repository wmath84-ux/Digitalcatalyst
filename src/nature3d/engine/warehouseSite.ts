// src/nature3d/engine/warehouseSite.ts
//
// Where the rusty-roof villa stands, and the one test every scatter uses
// to stay out of it. The abandoned warehouse that used to live on the
// meadow east of the boards is gone; these names stay so the grass, the
// trees and the terrain pad do not each grow a second import.
//
// The student at the chair faces −Z, toward the boards. Behind them is +Z.
// The villa is 60 m from the chair on that side, shifted west so its east
// wall stays clear of the river bank (the bank blend reaches x ≈ −2.5).
// It is not behind the boards.

/** World X of the model's centre. West of the river, not the old yard. */
export const WAREHOUSE_X = -26;
/** World Z of the model's centre. +Z is behind the student. hypot(26, 54.1) = 60. */
export const WAREHOUSE_Z = 54.1;
/** How tall the shell stands above the yard, in metres. */
export const WAREHOUSE_HEIGHT = 30;

/**
 * three.js Y rotation. 0 keeps local −Z aimed at the chair, so the face
 * the student sees when they turn around is the authored front.
 */
export const WAREHOUSE_YAW = 0;

/**
 * Local half-extents after the uniform 30 m height scale, plus a metre of
 * apron. Authored bounds are about ±0.42 × ±0.50; at 30 / 0.71 that is
 * roughly ±18 × ±21. The extra metre keeps a blade off the wall.
 */
export const WAREHOUSE_HALF_X = 20;
export const WAREHOUSE_HALF_Z = 24;

const COS = Math.cos(WAREHOUSE_YAW);
const SIN = Math.sin(WAREHOUSE_YAW);
/** Half-diagonal of the apron box. The early-out below is this, plus margin. */
const HALF_DIAG = 34;

/**
 * Level yard, in the building's local frame. The flat zone stops inside
 * the walls. The blend is short on every side so it dies before the river
 * bank (the bank starts near x = −2.5; the east blend ends near x = −3).
 */
const PAD_FLAT_X_POS = 17;
const PAD_BLEND_X_POS = 6;
const PAD_FLAT_X_NEG = 17;
const PAD_BLEND_X_NEG = 6;
const PAD_FLAT_Z_POS = 20;
const PAD_BLEND_Z_POS = 6;
const PAD_FLAT_Z_NEG = 20;
const PAD_BLEND_Z_NEG = 6;
/** Axis-aligned reach of the widest blend, plus a metre. */
const PAD_REACH = 32;

let padY = NaN;
let sealing = false;

function sideBlend(
  signed: number,
  flatPos: number,
  blendPos: number,
  flatNeg: number,
  blendNeg: number,
): number {
  const flat = signed >= 0 ? flatPos : flatNeg;
  const blend = signed >= 0 ? blendPos : blendNeg;
  const a = signed >= 0 ? signed : -signed;
  if (a <= flat) return 0;
  if (a >= flat + blend) return 1;
  return (a - flat) / blend;
}

/**
 * Seat the ground under the villa.
 *
 * Called from `terrainHeight` on every sample. The common case — anywhere
 * but this one yard — is two comparisons and a return. Inside the yard the
 * height is the lowest natural sample under the walls, so the slab, the
 * mesh and the grass share a floor that is cut into the meadow, not built
 * up on top of it. `naturalAt` is `terrainHeight` itself; `sealing` stops
 * that callback from re-entering the blend while the pad height is captured.
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
    let min = Infinity;
    for (let ix = -2; ix <= 2; ix += 1) {
      for (let iz = -2; iz <= 2; iz += 1) {
        const lx = ix * 8;
        const lz = iz * 8;
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
  const ex = sideBlend(lx, PAD_FLAT_X_POS, PAD_BLEND_X_POS, PAD_FLAT_X_NEG, PAD_BLEND_X_NEG);
  const ez = sideBlend(lz, PAD_FLAT_Z_POS, PAD_BLEND_Z_POS, PAD_FLAT_Z_NEG, PAD_BLEND_Z_NEG);
  if (ex >= 1 || ez >= 1) return natural;
  const e = ex > ez ? ex : ez;
  if (e <= 0) return padY;
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
  const lx = COS * dx - SIN * dz;
  const lz = SIN * dx + COS * dz;
  return Math.abs(lx) < WAREHOUSE_HALF_X + margin && Math.abs(lz) < WAREHOUSE_HALF_Z + margin;
}
