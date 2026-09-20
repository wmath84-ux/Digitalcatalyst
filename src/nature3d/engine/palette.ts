// src/nature3d/engine/palette.ts
//
// ART DIRECTION, IN CODE — the values a real art director would put in the
// style guide, written as constants and helpers instead of a PDF.
//
// ── What this file is for (research §9, §10, §17, §18, §29) ──────────────
//
// An art director's job is consistency: thousands of assets must read as one
// world, and no single asset is allowed to break the rules of the world even
// if it looks great on its own. The rules that matter here, all taken from
// the research brief:
//
//   1. ALBEDO HAS A PHYSICAL RANGE. Nothing in nature is pure black or pure
//      white. Coal reflects ~4 %, fresh snow ~90 % — and a texture painted at
//      0 or 255 clips under the tone mapper, which is what makes an asset
//      look "pasted on". Every authored colour passes through `clampAlbedo`
//      and is pulled into 30…240 (roughly 12 %…94 %), principle 11.
//
//   2. BASE COLOURS ARE DESATURATED. Real foliage photographed in sunlight is
//      far more saturated than a game can afford: a vivid green ground eats
//      the player character, the enemies and the loot (principle 10). The
//      ground, the foliage and the rocks are all muted here so the one thing
//      the learner must notice — the board, the student — pops.
//
//   3. COLOUR IS NEVER FLAT. A grey rock is not grey. It carries blue sky
//      bounce in its shadows, warm sun on its upper faces and a brown soil
//      stain near the ground. `hueDrift` injects exactly that: a small warm/
//      cool offset driven by facing and height, applied to albedo (not to
//      light), so it survives every lighting condition.
//
//   4. SURFACES ARE NEVER UNIFORMLY ROUGH. Roughness variation reads as
//      material history — dust in the pits, polish on the worn edges — far
//      more than colour does (principle 12), so the palette publishes a
//      roughness range per material family and the shaders respect it.
//
//   5. DETAIL IS BUDGETED (principle 29, "rest vs detail"). The eye needs
//      rest areas. `detailBudget(x, z)` returns how much micro-detail the
//      world is allowed to spend at a point: maximum at the study clearing
//      where the learner actually looks, falling away with distance so the
//      far meadow stays calm.

import * as THREE from "three";
import type { GroundPalette } from "./environment";

// ─────────────────────────────────────────────────────────────────────────
//  Physical limits
// ─────────────────────────────────────────────────────────────────────────

/** Darkest albedo allowed, 8-bit sRGB. Below this a surface reads as a hole. */
export const ALBEDO_FLOOR = 30;
/** Brightest albedo allowed, 8-bit sRGB. Above this it clips under the grade. */
export const ALBEDO_CEILING = 240;

/**
 * The project's texel yardstick: 5.12 px per cm = 512 px per metre (§18).
 *
 * This is the density a hero prop is authored at — the board, a rock's
 * albedo, anything the camera can walk up to. Large ground surfaces are
 * deliberately authored BELOW it, because a floor that fills the screen is
 * judged at a far coarser scale than an object in the hand; what must never
 * happen is two surfaces that MEET being authored at different densities.
 */
export const TEXELS_PER_METRE = 512;

/**
 * One ground-texture tile covers this many metres, on every terrain shell.
 *
 * 512 px over 6 m ≈ 85 px/m: the whole terrain, near and far, is authored at
 * one density, which is what makes the meadow and the far hills read as the
 * same material (research §18, principle 46).
 */
export const GROUND_TILE_METRES = 6;

/** Hoisted scratch: `clampAlbedo` runs once per terrain vertex and per clump. */
const SCRATCH = new THREE.Color();

/**
 * Ramps every channel of a colour into the legal albedo range.
 *
 * The clamp is applied in sRGB because that is the space the rules are stated
 * in ("coal ~30, snow ~240" are 8-bit sRGB values, research §10, principle
 * 11) and the space the eye judges a flat patch of colour in; the colour is
 * handed back in the renderer's working space.
 */
export function clampAlbedo(color: THREE.Color, out: THREE.Color = color): THREE.Color {
  const lo = ALBEDO_FLOOR / 255;
  const hi = ALBEDO_CEILING / 255;
  SCRATCH.copy(color).convertLinearToSRGB();
  SCRATCH.r = Math.min(hi, Math.max(lo, SCRATCH.r));
  SCRATCH.g = Math.min(hi, Math.max(lo, SCRATCH.g));
  SCRATCH.b = Math.min(hi, Math.max(lo, SCRATCH.b));
  return out.copy(SCRATCH.convertSRGBToLinear());
}

/** Byte helper for the procedural texture painters (0…255 canvases). */
export function clampAlbedoByte(v: number): number {
  return Math.min(ALBEDO_CEILING, Math.max(ALBEDO_FLOOR, Math.round(v)));
}

/**
 * The art-directed hue drift described in rule 3.
 *
 * `facing` is how much the surface faces the sun (-1 shade side … +1 sun
 * side) and `height` is the world height in metres. The returned colour is a
 * small multiplier around 1.0, applied to albedo, never to radiance.
 */
export function hueDrift(facing: number, height: number, out: THREE.Color): THREE.Color {
  // Sunlit facets go warm (a hint of ochre); shaded facets go cool (sky
  // blue). The high ground is bleached and slightly cooler with altitude —
  // rock loses its iron tone long before it loses its height.
  const warm = Math.max(0, facing) * 0.045;
  const cool = Math.max(0, -facing) * 0.05;
  const bleach = Math.min(0.05, Math.max(0, height - 18) * 0.0016);
  return out.setRGB(
    1 + warm - cool * 0.35 + bleach,
    1 + warm * 0.55 - cool * 0.1,
    1 - warm * 0.25 + cool * 0.55 + bleach,
  );
}

/**
 * How much fine detail the world may spend at a point, 0…1 (principle 29).
 *
 * 1 at the study clearing and the board hill, decaying to ~0.15 out in the
 * far meadow: micro-noise, pebble scatter and bark detail all consult this,
 * so the scene a learner studies is rich and the horizon stays readable.
 */
export function detailBudget(x: number, z: number): number {
  const toBoard = Math.hypot(x, z);
  const near = 1 - smoothstep(6, 90, toBoard);
  const mid = 1 - smoothstep(90, 340, toBoard);
  return Math.min(1, 0.18 + near * 0.82 + mid * 0.22);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────────────────────
//  The palette itself
// ─────────────────────────────────────────────────────────────────────────

/**
 * Ground layer colours.
 *
 * Every value is deliberately a mid-tone: the greens are olive rather than
 * emerald, the rock is a warm grey rather than a neutral one, and the "mud"
 * is a desaturated brown. Values chosen against the albedo range above; the
 * brightest (snow) sits just under the ceiling so the sun can still push it
 * to white with lighting rather than clipping it in the texture.
 */
export const GROUND_PALETTE: GroundPalette = {
  lush: new THREE.Color(0x54812f),
  dry: new THREE.Color(0x8a8f47),
  mud: new THREE.Color(0x4c4335),
  rock: new THREE.Color(0x717872),
  gravel: new THREE.Color(0x8b8272),
  snow: new THREE.Color(0xe6edf3),
  deep: new THREE.Color(0x33291d),
};

/** Foliage albedo. Mid-green, desaturated — see rule 2. */
export const FOLIAGE_PALETTE = {
  /** Grass blades, root … tip. The tip is where new growth and sunlight meet. */
  bladeRoot: new THREE.Color(0x2c4a1c),
  bladeMid: new THREE.Color(0x4a7c28),
  bladeTip: new THREE.Color(0x93b757),
  /** Leaf cards, inner canopy … outer. */
  leafDeep: new THREE.Color(0x2d4a26),
  leafLit: new THREE.Color(0x6d8f3f),
  /** Transmitted light through a leaf (the cheap subsurface term). */
  transmittance: new THREE.Color(0x9dbb52),
  /** Bark, young … old (older bark is paler, greyer and more fissured). */
  barkYoung: new THREE.Color(0x4a3a29),
  barkOld: new THREE.Color(0x6b6055),
  /** Moss: only ever on the damp, shade-side faces. */
  moss: new THREE.Color(0x4e6b31),
};

/** Rock albedo per geological family (research §6, §25). */
export const ROCK_PALETTE = {
  /** Warm sedimentary — the meadow's boulders and outcrops. */
  sandstone: new THREE.Color(0x8d8471),
  /** Cool igneous — the scree on the highland slopes. */
  basalt: new THREE.Color(0x6d7378),
  /** Dust settled on up-facing surfaces. */
  dust: new THREE.Color(0x9c9484),
  /** Wet stone at the waterline: darker, because water fills the micro-facets. */
  wet: new THREE.Color(0x4a4e48),
};

/**
 * Material roughness ranges (rule 4 / principle 12).
 *
 * "Natural rock roughness is never below 0.6" is the kind of limit a style
 * guide pins down; without it, a rock exported from a material library will
 * arrive with polished patches that instantly read as plastic under the
 * sanctuary's low sun.
 */
export const ROUGHNESS_RANGE = {
  ground: [0.88, 0.99] as const,
  rock: [0.62, 0.95] as const,
  rockWet: [0.24, 0.5] as const,
  bark: [0.75, 1.0] as const,
  leaves: [0.55, 0.85] as const,
  wetSoil: [0.45, 0.7] as const,
};

/**
 * Per-hour atmosphere key, so a biome keeps its identity all day (§17).
 *
 * The dusty, dry haze of the savannah district must stay dusty at 7 am and at
 * 5 pm — only its colour temperature is allowed to change. These multipliers
 * are keyed on the sun's elevation, not on a clock, so "auto" mode and the
 * manual morning/midday/evening buttons run through the same table.
 */
export interface AtmosphereKey {
  /** Tint multiplied into the fog/haze colour. */
  haze: THREE.Color;
  /** Tint multiplied into the sun's own colour. */
  sun: THREE.Color;
  /** How strongly the sun's halo bleeds into the haze (aerial perspective). */
  inScatter: number;
}

const KEYS: ReadonlyArray<{ maxElevation: number; key: AtmosphereKey }> = [
  // Low sun: long, dusty, warm haze; the halo is broad and orange.
  { maxElevation: 0.25, key: { haze: new THREE.Color(0xd8b18a), sun: new THREE.Color(0xffd9a8), inScatter: 0.75 } },
  // Mid-morning / late afternoon: the "golden" band, still warm, less dust.
  { maxElevation: 0.55, key: { haze: new THREE.Color(0xdcd6c4), sun: new THREE.Color(0xffeccb), inScatter: 0.5 } },
  // High sun: cool, blue, clear — the haze is thin and the halo is tight.
  { maxElevation: 1.01, key: { haze: new THREE.Color(0xd3e0ec), sun: new THREE.Color(0xfff6e4), inScatter: 0.32 } },
];

/** Pick the atmosphere key for a sun elevation (0 = horizon, 1 = zenith). */
export function atmosphereKeyFor(elevation: number): AtmosphereKey {
  for (const entry of KEYS) {
    if (elevation <= entry.maxElevation) return entry.key;
  }
  return KEYS[KEYS.length - 1].key;
}
