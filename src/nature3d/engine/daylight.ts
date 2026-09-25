// src/nature3d/engine/daylight.ts
//
// TIME OF DAY — one function that turns a clock reading into every lighting
// value the scene needs.
//
// The brief: the learner can switch between morning / midday / evening, but
// by DEFAULT the sanctuary follows the real clock, the sun visibly travels
// across the sky as the hours pass, and the light strengthens towards midday
// and weakens towards dusk. After sunset it holds at the evening look rather
// than going dark.
//
// ── Why the sun is computed, not keyframed ──────────────────────────────
//
// The obvious implementation is three hand-tuned presets and a crossfade.
// That cannot satisfy "the sun should be where the real sun is": at 10:40 you
// would be blending two poses, and the blend of two directions is not a point
// on the arc — it cuts the chord, so the sun would sag below its true path in
// mid-morning and mid-afternoon. Here the arc is evaluated directly from the
// hour, and the three named modes are just three times of day fed through the
// same function. One code path, no drift between "auto" and "manual".
//
// ── What is deliberately simple ─────────────────────────────────────────
//
// This is not an ephemeris. There is no latitude, declination or equation of
// time: the sun rises at DAY_START, sets at DAY_END and arcs symmetrically
// between them. A real solar model would need the learner's coordinates
// (a permission prompt) to change a result nobody can check by eye. The
// device clock is the one input, because that is the thing the learner can
// actually verify by looking out of a window.

import * as THREE from "three";

/** Sunrise and sunset, in local decimal hours. */
export const DAY_START = 6;
export const DAY_END = 18.5;

/** Peak elevation of the sun at midday, radians. */
const MAX_ELEVATION = THREE.MathUtils.degToRad(72);
/**
 * How far east (at sunrise) and west (at sunset) the sun sits, radians.
 * The arc is tilted towards -Z so the light rakes across the meadow and the
 * study boards instead of coming from directly behind the learner.
 */
const HORIZON_SWING = THREE.MathUtils.degToRad(70);
/**
 * The sun is never allowed to touch the horizon exactly. At elevation 0 the
 * shadow frustum degenerates (light parallel to the ground plane) and every
 * shadow stretches to infinity, which reads as a black screen rather than a
 * sunset.
 *
 * 10° rather than the old 4° — OWNER DIRECTIVE ("raat ke samay aur shaam ke
 * samay colour ekdam black dikhta hai … dark green dikhna chahiye, na ki
 * black"). At 4° the sun's dot(N,L) on the ground is 0.07, i.e. the whole
 * world is lit by ambient alone AND the shadow map is raking the meadow at a
 * grazing angle (self-shadowing + acne on top of an already tiny sun term).
 * 10° keeps a real, warm, raking sun on the ground at both ends of the day.
 */
const MIN_ELEVATION = THREE.MathUtils.degToRad(10);

export type DaylightMode = "auto" | "morning" | "midday" | "evening";

/** The representative hour each manual mode jumps to. */
export const MODE_HOURS: Record<Exclude<DaylightMode, "auto">, number> = {
  morning: 8,
  midday: 12.75,
  evening: 17.75,
};

export interface DaylightState {
  /** Unit vector from the origin towards the sun. */
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fillIntensity: number;
  /** Sky dome gradient. */
  zenith: THREE.Color;
  horizon: THREE.Color;
  ground: THREE.Color;
  /** Tint multiplied into the dome around the sun. */
  sunTint: THREE.Color;
  fog: THREE.Color;
  /** Renderer tone-mapping exposure. */
  exposure: number;
  /** 0 at the horizon, 1 at peak — what everything above is driven from. */
  dayFactor: number;
  /** Decimal hour this state was computed for. */
  hour: number;
}

const lerpColor = (a: number, b: number, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), t);

/** Local clock as a decimal hour, e.g. 14.5 for 14:30. */
export const currentHour = (now: Date = new Date()): number =>
  now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

/**
 * Clamp a wall-clock hour into the daylit window.
 *
 * Night deliberately reads as evening rather than as darkness: this is a
 * study space, and a learner who opens it at 23:00 needs to be able to see
 * the boards. Before sunrise it holds at first light for the same reason.
 */
export const clampToDaylight = (hour: number): number =>
  THREE.MathUtils.clamp(hour, DAY_START, DAY_END);

/** Resolve a mode (and the real clock, for "auto") to an hour on the arc. */
export const hourForMode = (mode: DaylightMode, now: Date = new Date()): number =>
  mode === "auto" ? clampToDaylight(currentHour(now)) : MODE_HOURS[mode];

/**
 * Everything the renderer needs, for one moment of the day.
 *
 * `dayFactor` is the single driver: it is sin(elevation) normalised, so it is
 * 0 at the horizon and 1 at the zenith, and it rises and falls exactly as
 * fast as the real sun climbs. Colour temperature, brightness, fog and
 * exposure are all interpolated on it, which is why midday is bright and
 * white while the ends of the day are dim and orange without any of those
 * being tuned separately.
 */
export function daylightAt(hour: number): DaylightState {
  const h = clampToDaylight(hour);
  const t = (h - DAY_START) / (DAY_END - DAY_START); // 0 sunrise → 1 sunset

  // Elevation follows a sine: fastest near the horizon, slowest overhead,
  // which is how the real sun behaves and why noon "lingers".
  const elevation = Math.max(Math.sin(Math.PI * t) * MAX_ELEVATION, MIN_ELEVATION);
  // Azimuth sweeps east → west, so shadows rotate through the day.
  const azimuth = (1 - 2 * t) * HORIZON_SWING;

  const ce = Math.cos(elevation);
  const sunDir = new THREE.Vector3(
    ce * Math.sin(azimuth),
    Math.sin(elevation),
    -ce * Math.cos(azimuth),
  ).normalize();

  // 0 at the horizon → 1 at the peak.
  const dayFactor = THREE.MathUtils.clamp(Math.sin(elevation) / Math.sin(MAX_ELEVATION), 0, 1);
  // Warmth rises sharply once the sun is low — the last hour is much redder
  // than the difference in elevation alone would suggest, because the light
  // is travelling through far more atmosphere.
  const warm = 1 - THREE.MathUtils.smoothstep(dayFactor, 0.06, 0.62);
  // Evenings read warmer and hazier than mornings at the same elevation.
  const evening = t > 0.5 ? THREE.MathUtils.smoothstep(t, 0.52, 0.98) : 0;

  // ── THE DUSK FLOOR ───────────────────────────────────────────────────
  //
  // OWNER DIRECTIVE (2026-09-24): "raat ke samay aur shaam ke samay colour
  // ekdam black dikhta hai … dark green dikhna chahiye, na ki black."
  //
  // Measured, not guessed. The low-sun end of every curve below used to fall
  // to values that put a grass pixel at roughly RGB(15, 91, 10) after the
  // ACES fit — a green so deep a phone screen at night renders it as black.
  // The four `1.xx`/`0.xx` endpoints of the intensity and exposure curves are
  // therefore LIFTED (a camera's night adaptation: the eye opens up when the
  // sun goes down), the dusk sky/ground-bounce colours are pulled back
  // towards green instead of olive-brown, and the sun keeps 10° of elevation
  // so the ground is still lit by something other than ambient.
  //
  // THE MIDDAY END OF EVERY CURVE IS UNTOUCHED — `dayFactor = 1` and
  // `warm = 0` still resolve to exactly the values the sunny-afternoon
  // directive pinned (sun 3.15, hemi 1.85, fill 1.05, exposure 1.16,
  // hemiSky #d8f4ff, hemiGround #62b032). Only the ends of the day moved.
  return {
    sunDir,
    sunColor: lerpColor(0xfff8ea, 0xff9450, warm).lerp(new THREE.Color(0xff7a40), evening * 0.35),
    sunIntensity: THREE.MathUtils.lerp(1.28, 3.15, dayFactor),
    // USER DIRECTIVE (sunny afternoon): a hard, clean, saturated sky — the
    // zenith is a real afternoon blue, the horizon is bright pale, the ground
    // bounce is sunlit grass (so shadows stay green, not mud), and the fog
    // is clear blue air rather than dust.
    //
    // DUSK FLOOR: the sky stays warm (it IS a sunset) but lighter and less
    // orange, and the ground bounce stays GREEN — the old #6a5a32 olive was
    // the single biggest reason a dusk shadow read as mud-black. Night is
    // deliberately a deep green dusk, never a black screen.
    hemiSky: lerpColor(0xd8f4ff, 0xffe3c4, warm),
    hemiGround: lerpColor(0x62b032, 0x3d8f2e, warm),
    hemiIntensity: THREE.MathUtils.lerp(1.95, 1.85, dayFactor),
    fillIntensity: THREE.MathUtils.lerp(0.8, 1.05, dayFactor),
    zenith: lerpColor(0x1f7eef, 0x3f5f9e, warm),
    horizon: lerpColor(0xc8eeff, 0xffc79a, warm),
    ground: lerpColor(0xdceec0, 0x7d8a55, warm),
    sunTint: lerpColor(0xfff8e0, 0xffb07a, warm),
    // Smoke fog colour — cool blue-grey haze by day, warm dust at dusk.
    // Must stay close to the sky horizon so distant land melts into air
    // (three.js rule: fog colour ≈ background / horizon colour).
    fog: lerpColor(0xb4cce4, 0xe8d0b0, warm),
    exposure: THREE.MathUtils.lerp(1.02, 1.16, dayFactor),
    dayFactor,
    hour: h,
  };
}
