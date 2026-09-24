// src/nature3d/engine/character/CharacterConfig.ts
//
// ONE place for every number the third-person character reads. The movement
// model, the camera, the animation blender and the debug overlay all import
// from here — nothing tunes itself with a literal buried in a method.
//
// Units are metres / seconds / radians throughout. 1 world unit = 1 metre.

/** World scale of the player character. The rig is authored ~1.8 m tall. */
export const CHARACTER_SCALE = 1;

/** Real-world height of the rig in metres (toe to crown, standing). */
export const CHARACTER_HEIGHT = 1.8;

export type CharacterQuality = "LOW" | "MEDIUM" | "HIGH";

export interface CharacterTuning {
  // ── Locomotion speeds (m/s) ──────────────────────────────────────
  walkSpeed: number;
  jogSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  proneSpeed: number;
  backpedalScale: number;
  strafeScale: number;
  waterSlowScale: number;

  // ── Acceleration / deceleration (1/s exponential rates) ──────────
  walkAcceleration: number;
  walkDeceleration: number;
  jogAcceleration: number;
  jogDeceleration: number;
  sprintAcceleration: number;
  sprintDeceleration: number;
  airAcceleration: number;
  crouchAcceleration: number;
  proneAcceleration: number;

  // ── Rotation (rad/s and smoothing) ───────────────────────────────
  rotationSharpness: number;
  idleRotationSharpness: number;
  turnInPlaceRate: number;
  turnInPlaceThreshold: number;
  turnInPlaceDelay: number;
  cameraStillThreshold: number;

  // ── Vertical motion ──────────────────────────────────────────────
  gravity: number;
  jumpVelocity: number;
  coyoteTime: number;
  jumpBufferTime: number;
  groundStickDistance: number;
  stepOffset: number;
  heavyLandSpeed: number;

  // ── Stance ───────────────────────────────────────────────────────
  capsuleRadius: number;
  standHeight: number;
  crouchHeight: number;
  proneHeight: number;
  stanceBlendTime: number;
  proneBlendTime: number;

  // ── Slope ────────────────────────────────────────────────────────
  maxWalkableSlope: number;
  maxSprintSlope: number;
  slopeSlideSpeed: number;

  // ── Camera ───────────────────────────────────────────────────────
  cameraDistance: number;
  cameraMinDistance: number;
  cameraMaxDistance: number;
  cameraPivotHeight: number;
  cameraCrouchPivot: number;
  cameraPronePivot: number;
  cameraShoulder: number;
  cameraDamping: number;
  cameraFov: number;
  sprintFovKick: number;
  lookSensitivity: number;
  pitchMin: number;
  pitchMax: number;

  // ── Animation ────────────────────────────────────────────────────
  gaitBlendSharpness: number;
  lookYawClamp: number;
  lookPitchClamp: number;
  landAbsorbTime: number;
}

export const CHARACTER_TUNING: CharacterTuning = {
  walkSpeed: 1.4,
  jogSpeed: 2.7,
  sprintSpeed: 5.2,
  crouchSpeed: 1.3,
  proneSpeed: 0.7,
  backpedalScale: 0.75,
  strafeScale: 0.9,
  waterSlowScale: 0.5,

  walkAcceleration: 7,
  walkDeceleration: 9,
  jogAcceleration: 6,
  jogDeceleration: 8,
  sprintAcceleration: 4.5,
  sprintDeceleration: 5.5,
  airAcceleration: 2.2,
  crouchAcceleration: 6,
  proneAcceleration: 4,

  rotationSharpness: 10,
  idleRotationSharpness: 4,
  turnInPlaceRate: 2.4,
  turnInPlaceThreshold: Math.PI / 3,
  turnInPlaceDelay: 0.45,
  cameraStillThreshold: 0.18,

  gravity: -14,
  jumpVelocity: 5.2,
  coyoteTime: 0.1,
  jumpBufferTime: 0.15,
  groundStickDistance: 0.45,
  stepOffset: 0.45,
  heavyLandSpeed: 7.5,

  capsuleRadius: 0.38,
  standHeight: 1.8,
  crouchHeight: 1.15,
  proneHeight: 0.55,
  stanceBlendTime: 0.28,
  proneBlendTime: 0.85,

  maxWalkableSlope: (50 * Math.PI) / 180,
  maxSprintSlope: (32 * Math.PI) / 180,
  slopeSlideSpeed: 3.5,

  cameraDistance: 3.2,
  cameraMinDistance: 1.6,
  cameraMaxDistance: 6.5,
  cameraPivotHeight: 1.5,
  cameraCrouchPivot: 1.0,
  cameraPronePivot: 0.55,
  cameraShoulder: 0.55,
  cameraDamping: 12,
  cameraFov: 65,
  sprintFovKick: 7,
  lookSensitivity: 0.0042,
  pitchMin: -0.45,
  pitchMax: 1.1,

  gaitBlendSharpness: 12,
  lookYawClamp: 0.62,
  lookPitchClamp: 0.45,
  landAbsorbTime: 0.32,
};

/**
 * Character fidelity from the Sanctuary quality tier. Default mobile
 * (medium) keeps IK + full materials; low drops IK and shadows; high/ultra
 * get the full treatment.
 */
export function characterQualityForTier(tier: string): CharacterQuality {
  if (tier === "low") return "LOW";
  if (tier === "medium") return "MEDIUM";
  return "HIGH";
}
