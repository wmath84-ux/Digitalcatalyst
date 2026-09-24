// src/nature3d/engine/character/CharacterConfig.ts
//
// ONE place for every number the third-person character reads. The movement
// model, the camera, the animation blender and the debug overlay all import
// from here — nothing tunes itself with a literal buried in a method.
//
// Units are metres / seconds / radians throughout. 1 world unit = 1 metre.
//
// Locomotion feel follows the VeryHotShark RealisticThirdPersonCharacter
// reference (UE5 units converted cm → m): run 500 cm/s, rotation 500°/s,
// jump 700 cm/s, braking 2000 cm/s², 4 m camera boom, FOV 90. The middle
// jog gear is this project's analog bridge between the reference's walk
// and run; the reference has no prone or cover here (cover stays out of
// scope) — prone is an original military high-crawl built to the same
// quality bar.

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
  /** Hard yaw-rate cap — the reference's RotationRate, 500°/s. */
  maxYawRate: number;
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
  walkSpeed: 1.6,
  jogSpeed: 3.2,
  sprintSpeed: 5.0,
  crouchSpeed: 2.0,
  proneSpeed: 0.9,
  backpedalScale: 0.75,
  strafeScale: 0.9,
  waterSlowScale: 0.5,

  walkAcceleration: 8,
  walkDeceleration: 12,
  jogAcceleration: 7,
  jogDeceleration: 10,
  sprintAcceleration: 6,
  sprintDeceleration: 8,
  airAcceleration: 2.5,
  crouchAcceleration: 7,
  proneAcceleration: 4.5,

  rotationSharpness: 12,
  idleRotationSharpness: 5,
  maxYawRate: (500 * Math.PI) / 180,
  turnInPlaceRate: 2.4,
  turnInPlaceThreshold: Math.PI / 3,
  turnInPlaceDelay: 0.45,
  cameraStillThreshold: 0.18,

  gravity: -13,
  jumpVelocity: 7.0,
  coyoteTime: 0.12,
  jumpBufferTime: 0.15,
  groundStickDistance: 0.45,
  stepOffset: 0.45,
  heavyLandSpeed: 9.0,

  capsuleRadius: 0.38,
  standHeight: 1.8,
  crouchHeight: 1.15,
  proneHeight: 0.5,
  stanceBlendTime: 0.28,
  proneBlendTime: 0.85,

  maxWalkableSlope: (50 * Math.PI) / 180,
  maxSprintSlope: (32 * Math.PI) / 180,
  slopeSlideSpeed: 3.5,

  cameraDistance: 4.0,
  cameraMinDistance: 1.6,
  cameraMaxDistance: 7.5,
  cameraPivotHeight: 1.1,
  cameraCrouchPivot: 0.75,
  cameraPronePivot: 0.45,
  cameraShoulder: 0,
  cameraDamping: 12,
  cameraFov: 90,
  sprintFovKick: 0,
  lookSensitivity: 0.0042,
  pitchMin: -1.1,
  pitchMax: 1.25,

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
