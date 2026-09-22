// src/nature3d/engine/warehouseSite.ts
//
// Where the abandoned warehouse stands, and the one test every scatter uses
// to stay out of it.
//
// The learner sits at (0, 2.6), facing −Z, so his right is +X. The wall he
// should see is 30 m that way. The river occupies x ≈ 12–24, and the first
// ground past it is a bank, not a pan — a building dropped on the bank sits
// in a cut. `levelWarehouseGround` cuts the yard down to the lowest point
// under the walls (never a fill, which is the berm that made the slab look
// perched) and blends back to the hill. The student side of that blend stops
// at the river bank; the north side stops short of the east trail.
//
// The baked clerestory is the +X face (window vertices sit at x 0.7–12).
// Yaw π turns that face onto world −X, toward the chair, so the wall the
// camera already looks past is the wall of the building.

/** World X of the baked model's centre. The glazed face is 13 m west of this. */
export const WAREHOUSE_X = 43;
/** World Z of the baked model's centre. North edge clears the east trail. */
export const WAREHOUSE_Z = -12;

/**
 * three.js Y rotation. π maps local +X (the glazed wall) onto world −X,
 * which is the student's right-hand side. The Warehouse preset stands on
 * that side so the wall and the ground line are the same view.
 */
export const WAREHOUSE_YAW = Math.PI;

/**
 * Local half-extents of the baked shell (12.99 × 15.00) plus a 1.4 m apron,
 * so a blade or a boulder cannot grow through the wall. The height scale
 * does not change the plan.
 */
export const WAREHOUSE_HALF_X = 14.4;
export const WAREHOUSE_HALF_Z = 16.4;

const COS = Math.cos(WAREHOUSE_YAW);
const SIN = Math.sin(WAREHOUSE_YAW);
/** Half-diagonal of the apron box. The early-out below is this, plus margin. */
const HALF_DIAG = 22;

/**
 * Level yard, in the building's local frame.
 *
 * Yaw is π, so local +X is world −X (the student, and the river) and local
 * −Z is world +Z (the east trail). The student-side blend is short so it
 * dies on the bank instead of filling the channel; the north blend is short
 * so the trail stays a trail. The east and south blends are long, because
 * that is where the cut has to climb back to the hill without a quarry wall.
 */
const PAD_FLAT_X_POS = 15;
const PAD_BLEND_X_POS = 4;
const PAD_FLAT_X_NEG = 16;
const PAD_BLEND_X_NEG = 14;
const PAD_FLAT_Z_POS = 18;
const PAD_BLEND_Z_POS = 12;
const PAD_FLAT_Z_NEG = 16;
const PAD_BLEND_Z_NEG = 2;
/** Axis-aligned reach of the widest blend, plus a metre. */
const PAD_REACH = 40;

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
 * mesh and the grass share a floor that is cut into the bank, not built up
 * on top of it. `naturalAt` is `terrainHeight` itself; `sealing` stops that
 * callback from re-entering the blend while the pad height is being captured.
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
  // Inverse of three's Y rotation.
  const lx = COS * dx - SIN * dz;
  const lz = SIN * dx + COS * dz;
  return Math.abs(lx) < WAREHOUSE_HALF_X + margin && Math.abs(lz) < WAREHOUSE_HALF_Z + margin;
}
