// src/nature3d/engine/warehouseSite.ts
//
// Where the abandoned warehouse stands, and the one test every scatter uses
// to stay out of it.
//
// The learner sits at (0, 2.6), facing −Z, so his left is −X. The left board
// (mind map) stands at about (−28, −33). The warehouse is on that same
// meadow — not on the lesson hill 170 m west — 40 m further left than the
// board's outer edge, and set back so it is not in line with the board.
// The glazed face points at the boards. `levelWarehouseGround` cuts the yard
// down to the lowest point under the walls (a cut, never a fill) so the slab
// meets the meadow instead of sitting on a berm or sinking into a ridge.

/** World X of the baked model's centre. The glazed face is 26 m east of this. */
export const WAREHOUSE_X = -106;
/** World Z of the baked model's centre. Set back from the left board, not in line. */
export const WAREHOUSE_Z = -46;

/**
 * three.js Y rotation. 0 keeps local +X (the glazed wall) on world +X, facing
 * the boards. The Warehouse preset stands on that side.
 */
export const WAREHOUSE_YAW = 0;

/**
 * Local half-extents of the shell after the uniform 60 m scale (26 × 30)
 * plus a 1.6 m apron, so a blade or a boulder cannot grow through the wall.
 */
export const WAREHOUSE_HALF_X = 27.6;
export const WAREHOUSE_HALF_Z = 31.6;

const COS = Math.cos(WAREHOUSE_YAW);
const SIN = Math.sin(WAREHOUSE_YAW);
/** Half-diagonal of the apron box. The early-out below is this, plus margin. */
const HALF_DIAG = 42;

/**
 * Level yard, in the building's local frame. Yaw is 0, so local +X is the
 * board side. The flat zone is a few metres past the walls (they sit at
 * ±26 × ±30 after the size scale). The blend back to the meadow is longer
 * on the board side, where the learner approaches.
 */
const PAD_FLAT_X_POS = 28;
const PAD_BLEND_X_POS = 20;
const PAD_FLAT_X_NEG = 28;
const PAD_BLEND_X_NEG = 14;
const PAD_FLAT_Z_POS = 32;
const PAD_BLEND_Z_POS = 14;
const PAD_FLAT_Z_NEG = 32;
const PAD_BLEND_Z_NEG = 14;
/** Axis-aligned reach of the widest blend, plus a metre. */
const PAD_REACH = 54;

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
 * Seat the ground under the warehouse.
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
        const lx = ix * 13;
        const lz = iz * 15;
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
