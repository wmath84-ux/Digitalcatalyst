// src/nature3d/engine/daylight.ts
//
// TIME OF DAY — one function that turns a clock reading into every lighting
// value the scene needs.
//
// The brief: the learner can switch between morning / midday / evening /
// night, but by DEFAULT the sanctuary follows the real clock, the sun visibly
// travels across the sky as the hours pass, and the light strengthens towards
// midday and weakens towards dusk. After sunset the world now rolls into a
// REAL night — stars, moon, dark-blue air — instead of holding at the evening
// look (OWNER DIRECTIVE 2026-09-29: "abhi kya hai ki raat nahin hoti hai,
// raat wala bhi scene design karo").
//
// ── Why the sun is computed, not keyframed ──────────────────────────────
//
// The obvious implementation is three hand-tuned presets and a crossfade.
// That cannot satisfy "the sun should be where the real sun is": at 10:40 you
// would be blending two poses, and the blend of two directions is not a point
// on the arc — it cuts the chord, so the sun would sag below its true path in
// mid-morning and mid-afternoon. Here the arc is evaluated directly from the
// hour, and the named modes are just four times of day fed through the same
// function. One code path, no drift between "auto" and "manual".
//
// ── What is deliberately simple ─────────────────────────────────────────
//
// This is not an ephemeris. There is no latitude, declination or equation of
// time: the sun rises at DAY_START, sets at DAY_END and arcs symmetrically
// between them; the moon takes the opposite half of the clock. A real solar
// model would need the learner's coordinates (a permission prompt) to change
// a result nobody can check by eye. The device clock is the one input,
// because that is the thing the learner can actually verify by looking out of
// a window.
//
// ── TIME-OF-DAY SMOKE (OWNER DIRECTIVE 2026-09-29) ──────────────────────
//
// "Subah ke samay thoda sa smoke … jaise-jaise sun aata hai smoke gayab
//  hone lagte hain … din mein hat jaaye, aur shaam aur raat mein rahe."
//
// `smoke` in the returned state is exactly that curve, 0 clear → 1 haziest.
// `scene.applyDaylight` turns it into the live fog ramp (near/far), so the
// dawn haze visibly BURNS OFF as the sun climbs, midday reads as crystal
// clear air, and the smoke comes back with the evening and stays through the
// night. In Auto mode the clock is re-read every 20 s, so sitting in the
// sanctuary across a sunrise you can watch the far hills emerge from the
// haze — a real time-lapse, not a menu switch.

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

export type DaylightMode = "auto" | "morning" | "midday" | "evening" | "night";

/** The representative hour each manual mode jumps to. */
export const MODE_HOURS: Record<Exclude<DaylightMode, "auto">, number> = {
  morning: 8,
  midday: 12.75,
  evening: 17.75,
  night: 22.25,
};

export interface DaylightState {
  /** Unit vector from the origin towards the sun (the MOON at night). */
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
  /**
   * 0 full day → 1 deep night. Drives the dome's star field, the cloud
   * grade and the anime panorama's night dip. The twilight windows blend it
   * continuously, so dusk melts into starlight instead of snapping.
   */
  night: number;
  /**
   * TIME-OF-DAY SMOKE, 0 clear → 1 haziest (see the header block).
   * `scene.applyDaylight` scales the live fog near/far with it.
   */
  smoke: number;
  /** Decimal hour this state was computed for (world timeline, see below). */
  hour: number;
}

const lerpColor = (a: number, b: number, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), t);

const smooth = (a: number, b: number, x: number) =>
  THREE.MathUtils.smoothstep(x, a, b);

/** Local clock as a decimal hour, e.g. 14.5 for 14:30. */
export const currentHour = (now: Date = new Date()): number =>
  now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

/**
 * Fold a wall-clock hour onto the world's timeline.
 *
 * The day arc owns [DAY_START, DAY_END]. The hours after sunset and before
 * sunrise are REAL HOURS now (the world renders night there) — they just
 * continue past midnight as 24→30 so every downstream `t` computation sees
 * one monotonically rising timeline: 6:00 sunrise → 18:30 sunset → 30:00
 * (= 6:00) sunrise again.
 */
export const clampToDaylight = (hour: number): number => {
  const h = ((hour % 24) + 24) % 24;
  return h < DAY_START ? h + 24 : h;
};

/** Resolve a mode (and the real clock, for "auto") to an hour on the timeline. */
export const hourForMode = (mode: DaylightMode, now: Date = new Date()): number =>
  mode === "auto" ? clampToDaylight(currentHour(now)) : MODE_HOURS[mode];

/** How deep into the night this timeline hour is, 0 at sunset → 1 deep night. */
function nightAmount(h: number): number {
  // Two 1.5 h twilights: sunset → full night, and full night → sunrise.
  const up = smooth(DAY_END, DAY_END + 1.5, h);
  const down = 1 - smooth(30 - 1.5, 30, h);
  return Math.min(up, down);
}

/**
 * TIME-OF-DAY SMOKE — the owner's dawn-haze curve, 0 clear → 1 haziest.
 *
 *   dawn  6:00–7:00   haze sits low over the valleys (the "thoda sa smoke")
 *   sun up 7:00–11:00 the haze visibly burns off as the sun climbs
 *   day  11:00–15:30  clear air — the smoke is gone
 *   eve  15:30–18:30  it thickens again with the golden hour
 *   night 18:30–6:00  it stays (shaam aur raat mein rahe)
 */
export function smokeForHour(h: number): number {
  if (h >= DAY_END) return THREE.MathUtils.lerp(0.6, 0.68, nightAmount(h));
  const dawn = 0.75;
  const day = 0.14;
  const eve = 0.6;
  if (h <= 7) return dawn;
  if (h <= 11) return THREE.MathUtils.lerp(dawn, day, smooth(7, 11, h));
  if (h <= 15.5) return day;
  return THREE.MathUtils.lerp(day, eve, smooth(15.5, DAY_END, h));
}

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
  // The day state owns the sun arc; night hours evaluate it at the FROZEN
  // sunset and blend towards the night state — that blend IS the twilight.
  const day = dayState(Math.min(h, DAY_END));
  if (h <= DAY_END) return day;

  const night = nightState(h);
  const t = nightAmount(h);
  return blendStates(day, night, t);
}

/** The daylight arc — untouched by night, evaluated on [DAY_START, DAY_END]. */
function dayState(h: number): DaylightState {
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
    // Sky and haze, de-saturated toward what a real atmosphere does.
    //
    // The old zenith #1f7eef was a near-primary blue. A real overhead sky is a
    // deep, slightly cyan-shifted atmospheric blue (#3B6B9B) — the blue is
    // there, but it is carrying dust and moisture, not coming out of a swatch
    // book. The horizon is the same story in reverse: #A4B6C5, a hazy light
    // greyish-blue, because everything the eye sees low down is being viewed
    // through the most air.
    //
    // The hemisphere ground bounce loses its neon. #62b032 is a lawn-green
    // light source, and light that saturated tints every shadow in the scene
    // toward paint. A muted olive keeps the bounce green — which is correct,
    // shadows outdoors ARE lit by green ground — without announcing itself.
    // hemiSky restored to near its original brightness. This is the ambient
    // fill for the WHOLE scene, so dimming it darkened every shadowed surface
    // at once — that, more than the albedo changes, is what made the world
    // read as underexposed. The tint is still the muted hazy blue rather than
    // the old near-white cyan.
    hemiSky: lerpColor(0xd6e6f0, 0xffe3c4, warm),
    hemiGround: lerpColor(0x8fa05e, 0x6b7a44, warm),
    hemiIntensity: THREE.MathUtils.lerp(2.1, 2.0, dayFactor),
    fillIntensity: THREE.MathUtils.lerp(0.8, 1.05, dayFactor),
    zenith: lerpColor(0x3b6b9b, 0x3f5f9e, warm),
    horizon: lerpColor(0xa4b6c5, 0xffc79a, warm),
    ground: lerpColor(0xd8e4b8, 0x7d8a55, warm),
    sunTint: lerpColor(0xfff4dc, 0xffb07a, warm),
    // Smoke fog colour — a cool bluish-grey haze by day, warm dust at dusk.
    // #B0B8B9, not white: fog is not the absence of colour, it is air carrying
    // the sky's own tint. This is also what produces ATMOSPHERIC PERSPECTIVE —
    // a hill 2-3 km out is not green or brown by the time its light reaches
    // the eye, it is this haze with a ridge shape in it.
    // Must stay close to the sky horizon so distant land melts into air
    // (three.js rule: fog colour ≈ background / horizon colour).
    fog: lerpColor(0xb0b8b9, 0xe8d0b0, warm),
    exposure: THREE.MathUtils.lerp(1.02, 1.16, dayFactor),
    dayFactor,
    night: 0,
    smoke: smokeForHour(h),
    hour: h,
  };
}

/**
 * THE NIGHT SCENE (OWNER DIRECTIVE 2026-09-29: "raat wala bhi scene design
 * karo").
 *
 * A study space first: the night is a deep, starlit BLUE, never a black
 * screen — the standing dusk-floor directive ("dark green dikhna chahiye, na
 * ki black") is honoured by a lifted exposure, a green-tinted ground bounce
 * and a moon that keeps real direction on the ground. The sun's slot in the
 * state is simply TAKEN OVER by the moon: one arc, opposite half of the
 * clock, pale-blue light — which is why every consumer (shadow rig, water
 * glint, dome disc) renders moonlight with no per-consumer wiring.
 */
function nightState(h: number): DaylightState {
  // The moon's own arc across the night half: rises around dusk, peaks at
  // midnight, sets towards dawn.
  const tn = (h - DAY_END) / (30 - DAY_END); // 0 sunset → 1 sunrise
  const elevation = Math.max(Math.sin(Math.PI * tn) * THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(14));
  const azimuth = (1 - 2 * tn) * HORIZON_SWING + Math.PI; // opposite the sun
  const ce = Math.cos(elevation);
  const moonDir = new THREE.Vector3(
    ce * Math.sin(azimuth),
    Math.sin(elevation),
    -ce * Math.cos(azimuth),
  ).normalize();

  return {
    sunDir: moonDir,
    // Moonlight: pale steel-blue, a fraction of the sun's power but a real
    // directional light so the meadow keeps shape and the shadow map works.
    sunColor: new THREE.Color(0xaec6ff),
    sunIntensity: 0.62,
    hemiSky: new THREE.Color(0x2b4166),
    // Ground bounce stays GREEN (the standing directive) — a dark pine green,
    // not mud, so night shadows read as night-green instead of black.
    hemiGround: new THREE.Color(0x1c3a24),
    hemiIntensity: 1.15,
    fillIntensity: 0.72,
    zenith: new THREE.Color(0x0a1530),
    horizon: new THREE.Color(0x2b3c5a),
    ground: new THREE.Color(0x172939),
    sunTint: new THREE.Color(0xcfe0ff),
    // Night air: dark blue-grey, pinned to the horizon so the sea and the
    // far range melt into the night instead of cutting a hard line.
    fog: new THREE.Color(0x27364e),
    exposure: 0.98,
    dayFactor: 0,
    night: 1,
    smoke: smokeForHour(h),
    hour: h,
  };
}

/**
 * Twilight: blend the last daylight into the night state field by field.
 * The blend runs over two 1.5 h windows (dusk and dawn), so in Auto mode the
 * sanctuary visibly dims into starlight after sunset and brightens back
 * before sunrise — a real time-lapse, no menu switch.
 */
function blendStates(day: DaylightState, night: DaylightState, t: number): DaylightState {
  const l = THREE.MathUtils.lerp;
  day.sunDir.lerp(night.sunDir, t).normalize();
  day.sunColor.lerp(night.sunColor, t);
  day.sunIntensity = l(day.sunIntensity, night.sunIntensity, t);
  day.hemiSky.lerp(night.hemiSky, t);
  day.hemiGround.lerp(night.hemiGround, t);
  day.hemiIntensity = l(day.hemiIntensity, night.hemiIntensity, t);
  day.fillIntensity = l(day.fillIntensity, night.fillIntensity, t);
  day.zenith.lerp(night.zenith, t);
  day.horizon.lerp(night.horizon, t);
  day.ground.lerp(night.ground, t);
  day.sunTint.lerp(night.sunTint, t);
  day.fog.lerp(night.fog, t);
  day.exposure = l(day.exposure, night.exposure, t);
  day.dayFactor = l(day.dayFactor, night.dayFactor, t);
  day.night = t;
  day.smoke = l(day.smoke, night.smoke, t);
  return day;
}
