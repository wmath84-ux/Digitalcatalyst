// One Three.js world unit is one metre. The playable character is three times
// the original Katiusza: 18 ft (5.4864 m), not an arbitrary visual scale.
// Every length below is derived from CHARACTER_SCALE so the capsule, gait,
// spring arm and foot IK stay geometrically consistent at any body size.
export const CHARACTER_SCALE = 3;
export const CHARACTER_HEIGHT = 6 * 0.3048 * CHARACTER_SCALE;
export const CHARACTER_RADIUS = 0.3 * CHARACTER_SCALE;
/** Crouch keeps the original 1.25 / 1.8288 body fraction. */
export const CROUCH_HEIGHT = CHARACTER_HEIGHT * (1.25 / 1.8288);

export const CHARACTER_TUNING = Object.freeze({
  walkSpeed: 2.2 * CHARACTER_SCALE,
  runSpeed: 5 * CHARACTER_SCALE,
  crouchSpeed: 1.1 * CHARACTER_SCALE,
  coverSpeed: 1 * CHARACTER_SCALE,
  acceleration: 12 * CHARACTER_SCALE,
  braking: 20 * CHARACTER_SCALE,
  airControl: 0.35,
  // Gravity and jump speed scale together: same airtime, three times the arc.
  jumpVelocity: 7 * CHARACTER_SCALE,
  gravity: 18 * CHARACTER_SCALE,
  maxFallSpeed: 35 * CHARACTER_SCALE,
  stepHeight: 0.35 * CHARACTER_SCALE,
  maxSlope: 48 * Math.PI / 180,
  coyoteTime: 0.1,
  jumpBuffer: 0.14,
  turnRate: 500 * Math.PI / 180,
  turnInPlaceThreshold: Math.PI / 3,
  turnInPlaceDelay: 0.5,
  simulationStep: 1 / 120,
  // The spring arm scales with the body (4 m at six feet) but sits slightly
  // closer than a pure 3x so the taller figure fills the frame instead of
  // shrinking into it.
  cameraDistance: 3.4 * CHARACTER_SCALE,
  cameraMinDistance: 1.8 * CHARACTER_SCALE,
  cameraMaxDistance: 8 * CHARACTER_SCALE,
  cameraRadius: 0.16 * CHARACTER_SCALE,
});

/** Standing/crouched body height, metres. */
export function characterBodyHeight(crouchAmount = 0): number {
  return CHARACTER_HEIGHT + (CROUCH_HEIGHT - CHARACTER_HEIGHT) * crouchAmount;
}
/** Eye height is a body fraction (1.70 m at six feet), never a fixed metre value. */
export const EYE_HEIGHT_RATIO = (1.8288 - 0.13) / 1.8288;
export function characterEyeHeight(crouchAmount = 0): number {
  return characterBodyHeight(crouchAmount) * EYE_HEIGHT_RATIO;
}
/**
 * Third-person pivot as a fraction of the body. The old 0.82-of-eye pivot was
 * tuned on a six-foot figure and framed an 18 ft character low and small;
 * 0.55 centres head and feet in shot at the default boom length.
 */
export const CAMERA_PIVOT_RATIO = 0.55;

/** Cover posture thresholds, kept as the original body fractions. */
export const COVER_LOW_HEIGHT = CHARACTER_HEIGHT * (1.45 / 1.8288);
export const COVER_CROUCH_HEIGHT = CHARACTER_HEIGHT * (1.08 / 1.8288);

/** Stand beside the sofa, NEVER seated in front of the study board. */
export const CHARACTER_SPAWN = Object.freeze({ x: -10, z: 10, yaw: 0 });
export type CharacterCameraMode = "orbit" | "third-person" | "first-person";
