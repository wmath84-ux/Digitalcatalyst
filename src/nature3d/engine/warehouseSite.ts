// src/nature3d/engine/warehouseSite.ts
//
// Where the abandoned warehouse stands, and the one test every scatter uses
// to stay out of it.
//
// The previous seat (75.5, −40) is the spot the Warehouse button framed and
// the learner found empty — a 10 m shed does not read as a warehouse. This
// seat is 30 m due east of that spot, still on the same meadow, clear of the
// east trail (it passes ~19 m north of the wall) and clear of the river.
// The glazed face still points at the boards. Height is 60 m; see warehouse.ts.

/** World X of the model's centre. 30 m east of the rejected seat. */
export const WAREHOUSE_X = 105.5;
/** World Z of the model's centre. Same meadow, not the hills. */
export const WAREHOUSE_Z = -40;
/** How tall the shell stands above the yard, in metres. */
export const WAREHOUSE_HEIGHT = 60;

/**
 * three.js Y rotation. π maps local +X (the glazed wall) onto world −X,
 * toward the boards. The Warehouse preset stands on that side.
 */
export const WAREHOUSE_YAW = Math.PI;

/**
 * Local half-extents after the 60 m length scale, plus apron. A square
 * 32 m covers both the 52 × 60 bake and a 60 m upload.
 */
export const WAREHOUSE_HALF_X = 32;
export const WAREHOUSE_HALF_Z = 32;

const COS = Math.cos(WAREHOUSE_YAW);
const SIN = Math.sin(WAREHOUSE_YAW);
/** Half-diagonal of the apron box. The early-out below is this, plus margin. */
const HALF_DIAG = 48;

/**
 * Level yard, in the building's local frame. Yaw is π, so local +X is
 * world −X (the boards, and the river). The flat zone is a few metres past
 * the walls (a 60 m shell sits at ±30). The board-side blend is short so it
 * dies on the bank and does not fill the channel.
 */
const PAD_FLAT_X_POS = 34;
const PAD_BLEND_X_POS = 12;
const PAD_FLAT_X_NEG = 34;
const PAD_BLEND_X_NEG = 14;
const PAD_FLAT_Z_POS = 34;
const PAD_BLEND_Z_POS = 14;
const PAD_FLAT_Z_NEG = 34;
const PAD_BLEND_Z_NEG = 14;
/** Axis-aligned reach of the widest blend, plus a metre. */
const PAD_REACH = 56;

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
        const lx = ix * 15;
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
