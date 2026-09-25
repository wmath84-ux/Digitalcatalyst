// src/nature3d/engine/beachHouseSite.ts
//
// WHERE THE BEACH HOUSES STAND — the data half of the beach-house district.
//
// The model itself (the owner's `Beach+House_Pack+JSGraphics_CGTrader.blend`,
// baked to `public/sanctuary/models/beach_house.glb`) is loaded and placed by
// `beachHouses.ts`. THIS file owns the three things that every OTHER module
// has to agree with, exactly like `warehouseSite.ts` does for the villa:
//
//   1. the SITE LIST  — world X/Z, yaw and per-site scale of the six houses
//   2. the LEVEL PAD  — the ground under each house is flattened, so a
//      building 10 m tall cannot end up standing on a slope with one
//      corner in the air
//   3. the FOOTPRINT TEST — the one query the grass, the plants, the trees,
//      the rocks and the tropical field all use to stay out of the walls
//
// WHY IT HAS NO IMPORTS
//   `terrain.ts` calls `levelBeachHouseGround` on EVERY height sample (the
//   terrain mesh alone takes ~150 000 of them), and `terrain.ts` is itself
//   imported by the environmental field, which this file would otherwise
//   want for its trail test. Importing either one from here would make a
//   cycle whose evaluation order decides whether the houses exist. So this
//   file is pure maths: the caller passes the height field in, exactly as
//   `levelWarehouseGround` takes `naturalAt`.
//
//   The site list is therefore INSTALLED, not computed here: `beachHouses.ts`
//   picks the sites against the real height field, the real trails and the
//   real villa, then calls `installBeachHouseSites`. Until that happens the
//   file answers "no houses anywhere" and the world behaves exactly as it did
//   before the beach houses existed — a safe, silent degradation.

/** A beach house as the site picker authors it. */
export interface BeachHousePlacement {
  /** World X of the house centre. */
  x: number;
  /** World Z of the house centre. */
  z: number;
  /** three.js Y rotation. Local +Z is aimed at the sanctuary centre. */
  yaw: number;
  /** Model scale: 1.0 turns the authored 13.59 m ridge into a 13.59 m ridge. */
  scale: number;
  /** The natural ground height the pad was cut down to. */
  padY: number;
}

/** A placement plus everything the per-sample ground test needs precomputed. */
export interface BeachHouseSite extends BeachHousePlacement {
  /** Cosine/sine of the yaw — the ground test runs 150 000×, so no trig. */
  cos: number;
  sin: number;
  /** Half extents of the WALL BOX in world space (roof flare excluded). */
  halfX: number;
  halfZ: number;
  /** Axis-aligned reach of the pad (flat zone + blend), plus a metre. */
  reach: number;
}

/**
 * The authored model, measured from the .blend, at scale 1:
 *
 *   total height (ridge + roof flare tips)   18.920 m
 *   bounding footprint                       21.568 × 17.330 m
 *   WALL box (the roof's own extent, which is what the walls fill)
 *                                            14.190 × 14.040 m
 *   ridge height                              13.588 m
 *
 * The wall box is the important one: the roof flares outward and upward past
 * the walls, so grass may happily grow UNDER the eaves (that is what makes
 * the house look planted), but nothing may grow through the walls.
 */
export const HOUSE_WALL_HALF_X = 14.19 / 2;
export const HOUSE_WALL_HALF_Z = 14.04 / 2;
/** The authored ridge height, in metres — the handle designs are scaled by. */
export const HOUSE_RIDGE = 13.588;
/** The authored total height, in metres (from floor y = 0 to roof flare tip). */
export const HOUSE_TOTAL_HEIGHT = 18.92;

/** Half-extents of the level pad around the walls, in metres. */
const PAD_FLAT_X = 9.0;
const PAD_FLAT_Z = 8.5;
/** How far the pad feathers back into natural ground. */
const PAD_BLEND_X = 8.5;
const PAD_BLEND_Z = 7.5;

let sites: BeachHouseSite[] = [];
let installed = false;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** One side of the pad: 0 inside the flat zone, 1 where natural ground resumes. */
function sideBlend(signed: number, flat: number, blend: number): number {
  const a = signed >= 0 ? signed : -signed;
  if (a <= flat) return 0;
  if (a >= flat + blend) return 1;
  return (a - flat) / blend;
}

/**
 * Install the site list. Called ONCE by `beachHouses.ts` after it has chosen
 * the sites; the pad height of every site must already be in `padY`.
 */
export function installBeachHouseSites(list: readonly BeachHousePlacement[]): void {
  sites = list.map((s) => {
    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    const halfX = HOUSE_WALL_HALF_X * s.scale;
    const halfZ = HOUSE_WALL_HALF_Z * s.scale;
    const reach = Math.max(halfX, halfZ) + Math.max(PAD_FLAT_X, PAD_FLAT_Z)
      + Math.max(PAD_BLEND_X, PAD_BLEND_Z) + 1;
    return { ...s, cos, sin, halfX, halfZ, reach };
  });
  installed = true;
}

/** True once the sites exist (i.e. `beachHouses.ts` has been initialised). */
export function beachHousesInstalled(): boolean {
  return installed;
}

/** The placed sites. Empty until `installBeachHouseSites` runs. */
export function beachHouseSites(): readonly BeachHouseSite[] {
  return sites;
}

/**
 * Seat the ground under every beach house.
 *
 * Called from `terrainHeight` on every sample, so the first thing it does is
 * the cheapest possible rejection: a point outside all six pad boxes (the
 * overwhelming majority of the world) costs twelve comparisons and returns.
 * Inside a pad the height is flattened to the pad's own level, which was
 * MEASURED at build time as the lowest natural sample under the walls — so a
 * house is cut into the slope like a real foundation, never perched on it.
 */
export function levelBeachHouseGround(
  x: number,
  z: number,
  natural: number,
): number {
  if (!installed) return natural;
  const count = sites.length;
  for (let i = 0; i < count; i += 1) {
    const s = sites[i];
    const dx = x - s.x;
    if (dx > s.reach || dx < -s.reach) continue;
    const dz = z - s.z;
    if (dz > s.reach || dz < -s.reach) continue;
    const lx = s.cos * dx - s.sin * dz;
    const lz = s.sin * dx + s.cos * dz;
    const ex = sideBlend(lx, s.halfX + PAD_FLAT_X, PAD_BLEND_X);
    if (ex >= 1) continue;
    const ez = sideBlend(lz, s.halfZ + PAD_FLAT_Z, PAD_BLEND_Z);
    if (ez >= 1) continue;
    const e = ex > ez ? ex : ez;
    if (e <= 0) return s.padY;
    const t = e * e * (3 - 2 * e);
    return s.padY + (natural - s.padY) * t;
  }
  return natural;
}

/**
 * True when (x, z) lands inside a house's footprint.
 *
 * `margin` grows the box, and every scatter passes its own value: grass ~1.2
 * (a blade must not clip the wall), plants ~6 (a 20 m card would swallow the
 * roof), trees ~9 (a crown must not sit on the ridge), rocks ~4.
 */
export function insideBeachHouse(x: number, z: number, margin = 0): boolean {
  const count = sites.length;
  for (let i = 0; i < count; i += 1) {
    const s = sites[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const limit = Math.max(s.halfX, s.halfZ) + margin + 1;
    if (dx > limit || dx < -limit) continue;
    if (dz > limit || dz < -limit) continue;
    const lx = s.cos * dx - s.sin * dz;
    const lz = s.sin * dx + s.cos * dz;
    if (Math.abs(lx) < s.halfX + margin && Math.abs(lz) < s.halfZ + margin) return true;
  }
  return false;
}

/**
 * How "household" a point is: 1 on a pad, feathering to 0 through the blend.
 *
 * Used by the ground tint (a homestead's yard reads packed and worn) and by
 * the terrain harness. Deliberately cheap — one loop, no noise.
 */
export function beachHouseYardWeight(x: number, z: number): number {
  let best = 0;
  for (let i = 0; i < sites.length; i += 1) {
    const s = sites[i];
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx > s.reach || dx < -s.reach || dz > s.reach || dz < -s.reach) continue;
    const lx = s.cos * dx - s.sin * dz;
    const lz = s.sin * dx + s.cos * dz;
    const ex = sideBlend(lx, s.halfX + PAD_FLAT_X, PAD_BLEND_X);
    const ez = sideBlend(lz, s.halfZ + PAD_FLAT_Z, PAD_BLEND_Z);
    const w = 1 - Math.max(ex, ez);
    if (w > best) best = w;
  }
  return best;
}

/** The flat-pad helpers the site picker needs (kept here, with the constants). */
export const PAD_GEOMETRY = {
  flatX: PAD_FLAT_X,
  flatZ: PAD_FLAT_Z,
  blendX: PAD_BLEND_X,
  blendZ: PAD_BLEND_Z,
  smoothstep,
} as const;
