// src/nature3d/engine/cull.ts
//
// SCREEN-SIZE CULLING — the UE "Cull Distance Volume / MinScreenRadius" rule,
// ported to WebGL (research doc: SANCTUARY_BGMI_DEEP_RESEARCH.md §4).
//
// BGMI's trick: an object smaller than a couple of PIXELS on screen cannot be
// read, so it should not be simulated at all. Unreal implements it as
// size→distance tables ("a 50 cm object culls at ~100 m"); we compute the
// same cutoff distance at runtime from the ACTUAL viewport height and fov, so
// the rule stays honest on every phone and aspect ratio.
//
// projectedPixelHeight ≈ (radius / dist) / tan(fov/2) · (viewH/2)
//   ⇒ cull when  dist > radius · (viewH/2) / (minPx · tan(fov/2))
//
// Smaller screens therefore cull CLOSER, which is exactly right: on a tiny
// display the cutoff pixel is reached sooner.

/**
 * Distance (metres) beyond which an object of `radiusM` projects to fewer
 * than `minPx` pixels on screen and can be skipped entirely.
 */
export function cullDistanceForPx(
  radiusM: number,
  minPx: number,
  fovDeg: number,
  viewH: number,
): number {
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  return (radiusM * (viewH * 0.5)) / (minPx * Math.max(tanHalf, 1e-4));
}
