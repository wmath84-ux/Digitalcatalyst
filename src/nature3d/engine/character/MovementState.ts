// src/nature3d/engine/character/MovementState.ts
//
// The locomotion state machine vocabulary. Pure data + transition helpers —
// no three.js, no DOM — so the rules can be reasoned about (and tested)
// without a renderer.
//
// Three orthogonal axes, exactly like the reference architecture:
//
//   LOCOMOTION  idle | walk | jog | sprint | start | stop | turn
//   STANCE      stand | crouch | prone (+ transitions between them)
//   AIRBORNE    ground | jump | fall | land
//
// The controller owns the live values; the animation layer only reads the
// snapshot. Nothing here allocates.

/** Grounded gait label — selection only, the pose itself is continuous. */
export type LocomotionState =
  | "idle"
  | "start"
  | "walk"
  | "jog"
  | "sprint"
  | "stop"
  | "turn";

/** Body posture. Transitions are timed blends, never snaps. */
export type StanceState =
  | "stand"
  | "standToCrouch"
  | "crouch"
  | "crouchToProne"
  | "prone"
  | "proneToCrouch"
  | "crouchToStand";

/** Vertical phase. Jump is physics-based; landing is velocity-graded. */
export type AirborneState = "ground" | "jump" | "fall" | "land";

/**
 * One frame's locomotion truth, written by CharacterController and read by
 * the animation controller, the foot IK and the debug overlay.
 */
export interface LocomotionSnapshot {
  locomotion: LocomotionState;
  stance: StanceState;
  airborne: AirborneState;
  /** Planar speed, m/s. */
  speed: number;
  /** Target planar speed, m/s. */
  targetSpeed: number;
  /** Velocity in body space: +x = right strafe, +z = forward. */
  localVelX: number;
  localVelZ: number;
  /** Vertical velocity, m/s. */
  verticalVel: number;
  /** Body yaw, radians. */
  yaw: number;
  /** Signed yaw rate, rad/s (drives turn lean). */
  yawRate: number;
  /** Smoothed acceleration (+push / −brake), m/s². */
  accel: number;
  /** Gait phase, radians — advanced by distance/stride (no-skate law). */
  gaitPhase: number;
  /** Current stride length, metres. */
  strideLen: number;
  grounded: boolean;
  /** Slope underfoot, radians from vertical. */
  slopeAngle: number;
  /** 0..1 stand → crouch blend. */
  crouch01: number;
  /** 0..1 crouch → prone blend. */
  prone01: number;
  /** 0..1 landing-absorb envelope. */
  landAbsorb: number;
  /** 0..1 sprint blend (drives FOV kick + lean). */
  sprint01: number;
  /** Seconds since leaving the ground. */
  airTime: number;
  /** True while turn-in-place is steering the body. */
  turningInPlace: boolean;
  /** Camera pitch, radians — the look layer's vertical input. */
  cameraPitch: number;
  /** Signed camera-yaw minus body-yaw, radians — the look layer's input. */
  lookYawOffset: number;
}

export function createSnapshot(): LocomotionSnapshot {
  return {
    locomotion: "idle",
    stance: "stand",
    airborne: "ground",
    speed: 0,
    targetSpeed: 0,
    localVelX: 0,
    localVelZ: 0,
    verticalVel: 0,
    yaw: 0,
    yawRate: 0,
    accel: 0,
    gaitPhase: 0,
    strideLen: 0.8,
    grounded: true,
    slopeAngle: 0,
    crouch01: 0,
    prone01: 0,
    landAbsorb: 0,
    sprint01: 0,
    airTime: 0,
    turningInPlace: false,
    cameraPitch: 0,
    lookYawOffset: 0,
  };
}

/** Shortest signed angle from `from` to `to`, in (−π, π]. */
export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Gait label with hysteresis so the debug readout (and any state-driven
 * audio later) does not flicker at boundaries. Turn is selected first —
 * a >0.9 rad heading error forces a pivot step — then start/stop windows,
 * then the speed bands.
 */
export function selectLocomotion(
  speed: number,
  wishSpeed: number,
  headingError: number,
  turningInPlace: boolean,
  previous: LocomotionState,
): LocomotionState {
  if (turningInPlace) return "turn";
  if (Math.abs(headingError) > 0.9 && speed > 0.6) return "turn";
  if (speed < 0.25 && wishSpeed < 0.25) return "idle";
  if (speed < 1.9 && wishSpeed > speed + 1.2) return "start";
  if (speed > 0.6 && wishSpeed < 0.3) return "stop";
  // Hysteresis bands around the walk/jog/sprint dividers.
  if (speed >= 4.2) return "sprint";
  if (speed >= 3.6 && (previous === "sprint" || wishSpeed >= 4.2)) return "sprint";
  if (speed >= 2.1) return "jog";
  if (speed >= 1.7 && previous === "jog") return "jog";
  if (speed >= 0.35) return "walk";
  return previous === "idle" ? "idle" : "walk";
}
