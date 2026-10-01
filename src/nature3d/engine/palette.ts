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
 * The ground map is the aerial farmland scan (`sanctuary/ground_field.jpg`,
 * extracted from `field_and_garden.glb`): its parcels, plough rows and
 * tractor tracks read at FIELD scale, not grit scale, so one tile now spans
 * 34 m (the 512 px procedural grit tiled every 6 m). At 2048 px per tile
 * that is ~60 px/m under the camera — and because every shell derives its
 * tile count from this constant, the same photo clothes the whole distance,
 * meadow to the 2.7 km horizon, at one texels-per-metre (research §18,
 * principle 46). No seam mismatch: shells blend their vertex colours, and
 * the photo's own parcel boundaries read as the field pattern everywhere.
 */
export const GROUND_TILE_METRES = 34;

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
  // cyan). The high ground is bleached harder than a temperate map — salt
  // wind and hard tropical sun strip the iron tone out of rock early —
  // which is what keeps the far ridge read pale and crisp.
  const warm = Math.max(0, facing) * 0.05;
  const cool = Math.max(0, -facing) * 0.055;
  const bleach = Math.min(0.075, Math.max(0, height - 14) * 0.0024);
  return out.setRGB(
    1 + warm - cool * 0.32 + bleach,
    1 + warm * 0.55 - cool * 0.08 + bleach * 0.92,
    1 - warm * 0.22 + cool * 0.55 + bleach * 0.7,
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
 * Ground layer colours — TROPICAL ISLAND KEY.
 *
 * The sanctuary is now a bright tropical island, so the ground palette is
 * keyed to what the references actually show: clean saturated (but controlled)
 * greens, pale warm sand everywhere the sea can reach, warm limestone rock,
 * and a teal-shifted deep bed for the drowned island edge. Every value is
 * still a mid-tone under the albedo clamp — "bright" comes from the LIGHT
 * (see `daylight.ts`), never from pushing albedo to the ceiling, which would
 * clip under the tone mapper and bleach the character off the screen.
 *
 * The `snow` band is retained by name (the whole engine reads the same 52 m
 * line) but is re-authored as the SUN-BLEACHED CREST: on a tropical island
 * the highest rock weathers pale, not white-with-snow. It keeps its role
 * (a bright band that makes the far ridgeline read) with a warm, sun-bleached
 * value instead of a cold one.
 */
export const GROUND_PALETTE: GroundPalette = {
  // MUTED, NOT SATURATED. The rule that governs every value below: real ground
  // is never a pure channel. A lawn-green #3d8f28 has green ~2.3x its red and
  // reads as paint; actual grass carries an olive/brown undertone because it is
  // growing out of soil. So the greens here sit close to the earth tones rather
  // than above them, and "bright" is left to the light (daylight.ts), never to
  // albedo — pushing albedo up clips under the tone mapper and bleaches the
  // whole frame.
  //
  // Grass: shadow #4A5D23 … sunlit #7B9A44. `lush` is the lit middle of that.
  lush: new THREE.Color(0x5a7330),
  // Dry dirt — the base layer where grass does not grow. Ashy brown, no
  // moisture in it, so it stays dull rather than going orange.
  dry: new THREE.Color(0x5e503f),
  // Wet mud. Water fills the micro-facets and the ground absorbs instead of
  // scattering, so wet earth is markedly darker than dry — deep chocolate.
  mud: new THREE.Color(0x3b2f25),
  // Stone is never neutral grey: it always carries the dust and soil of
  // wherever it sits, so this leans faintly warm-green rather than #808080.
  rock: new THREE.Color(0x737571),
  // Trodden path. Where feet and wheels pack the soil it goes dusty and
  // sand-like — light greyish-brown, and never chalk white.
  gravel: new THREE.Color(0x8c8476),
  sand: new THREE.Color(0xd8cba6),
  sandWet: new THREE.Color(0xb0916a),
  // Shallow shelf: water has no colour of its own, it reflects the bed and the
  // sky. Sand under the column plus sky gives an earthy cyan, not a pool blue.
  sandUnder: new THREE.Color(0x4f868e),
  snow: new THREE.Color(0xe2dcc8),
  // Deep water absorbs the red end and returns the sky, so it reads dark teal.
  deep: new THREE.Color(0x1c3b47),
};

/**
 * Foliage albedo — TROPICAL KEY.
 *
 * The greens move up in chroma and warmth from the old olive meadow set, but
 * they stay under the art-direction ceiling: a tropical canopy is VIVID, not
 * neon. Hue runs ~0.23…0.30 (yellow-green → true green) with the deep canopy
 * carrying a cool blue-green cast so shadowed foliage never goes black.
 */
export const FOLIAGE_PALETTE = {
  /** Grass blades, root … tip. The root sits in its own shadow and in the soil,
   *  so it is the darkest and most olive; the tip is where new growth meets the
   *  sun and lifts toward the sunlit grass value #7B9A44. None of these is a
   *  pure green — chlorophyll reflects broadly, not at one wavelength. */
  bladeRoot: new THREE.Color(0x3b4a20),
  bladeMid: new THREE.Color(0x4a5d23),
  bladeTip: new THREE.Color(0x7b9a44),
  /** Leaf cards, inner canopy … outer. Leaves are always DARKER and COOLER than
   *  the grass under them: more chlorophyll per unit area, and the canopy
   *  shades itself. */
  leafDeep: new THREE.Color(0x2d452b),
  leafLit: new THREE.Color(0x3d5c38),
  /** Transmitted light through a leaf — the cheap subsurface term. This is the
   *  one place a leaf is allowed to go bright: lit from behind, a blade turns
   *  translucent and glows yellowish-green. */
  transmittance: new THREE.Color(0x9cbd55),
  /** Bark, young … old. Pure brown reads as plastic; real trunks weather toward
   *  grey, so both ends are desaturated and the old bark goes greyer still. */
  barkYoung: new THREE.Color(0x4a3c31),
  barkOld: new THREE.Color(0x6b5b4c),
  /** Palm trunk: pale, ringed, sun-bleached — but bleached, not white. */
  palmTrunk: new THREE.Color(0x8c7a62),
  /** Coconut husk. */
  coconut: new THREE.Color(0x5a4630),
  /** Moss and lichen: the damp shade-side faces. A muted olive, never the
   *  bright lawn green it is usually painted — this is what makes rock read as
   *  alive rather than as a grey solid. */
  moss: new THREE.Color(0x596345),
};

/** Rock albedo per geological family (research §6, §25) — tropical limestone key. */
export const ROCK_PALETTE = {
  /** Warm coral limestone, dusted down. The island's boulders and outcrops. */
  sandstone: new THREE.Color(0x8d8471),
  /** Cool volcanic scree on the highland slopes. */
  basalt: new THREE.Color(0x565a5c),
  /** Dust, salt spray and sun-bleaching on up-facing surfaces. A dusty,
   *  sun-bleached yellowish-green-grey — the colour a hill highlight actually
   *  takes, rather than a bright green. */
  dust: new THREE.Color(0x8c9076),
  /** Wet stone at the waterline: darker, because water fills the micro-facets. */
  wet: new THREE.Color(0x4c544f),
  /** Crevices and cracks. NOT black — a hole punched to #000000 reads as a
   *  texture error. This dark cool grey is what natural ambient occlusion
   *  settles to where the sky cannot reach. */
  crevice: new THREE.Color(0x3a3a3b),
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
  // Bare earth is completely matte: dry soil scatters light in every direction
  // and has no sheen at all.
  ground: [0.9, 1.0] as const,
  rock: [0.62, 0.95] as const,
  rockWet: [0.24, 0.5] as const,
  // Bark is the roughest organic surface there is — fissured, dry, no oils.
  bark: [0.9, 1.0] as const,
  // Leaves and grass are the exception that proves the rule: a waxy cuticle
  // gives them a faint sheen, which is what separates a living plant from a
  // painted card under a low sun.
  leaves: [0.4, 0.6] as const,
  // Wet ground is where roughness does the most work. A puddle in a wheel rut
  // is near-mirror; the damp soil around it is not. That contrast is what makes
  // the ground read as wet at all, far more than its colour does.
  wetSoil: [0.2, 0.4] as const,
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
  // Low sun: warm air, but not a cream sheet — and NOT the dark ochre it used
  // to be. This tint is MULTIPLIED into the fog colour, so the old 0xc49262
  // pulled the whole dusk haze down to (0.73, 0.45, 0.28): every distant
  // surface faded towards a brown that read as black on a phone screen
  // (owner: "shaam ko sab black dikhta hai"). A pale, still-warm haze keeps
  // the aerial perspective without eating the world's brightness.
  { maxElevation: 0.25, key: { haze: new THREE.Color(0xe0b489), sun: new THREE.Color(0xffdca8), inScatter: 0.28 } },
  // Mid-morning / late afternoon: still warm, still a colour.
  { maxElevation: 0.55, key: { haze: new THREE.Color(0xa8b48a), sun: new THREE.Color(0xffeecb), inScatter: 0.16 } },
  // High sun: a real sky blue. The old 0xdcefef was near-white, and that is
  // what the far meadow bleached into.
  { maxElevation: 1.01, key: { haze: new THREE.Color(0x6a9eb8), sun: new THREE.Color(0xfff4dc), inScatter: 0.1 } },
];

/** Pick the atmosphere key for a sun elevation (0 = horizon, 1 = zenith). */
export function atmosphereKeyFor(elevation: number): AtmosphereKey {
  for (const entry of KEYS) {
    if (elevation <= entry.maxElevation) return entry.key;
  }
  return KEYS[KEYS.length - 1].key;
}
