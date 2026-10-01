import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { CHARACTER_HEIGHT } from "./characterConfig";

/** Locomotion states — gait SELECTION only; the pose itself is continuous. */
export type LocoState =
  | "idle" | "start" | "walk" | "jog" | "run" | "sprint" | "dash"
  | "stop" | "turn" | "jump" | "fall" | "land"
  | "crouch" | "crouch-walk" | "cover" | "cover-walk" | "cover-lean";

export interface TrekAvatar {
  group: THREE.Group;
  /** Hide the body (first person) without disturbing the rig. */
  setVisible(v: boolean): void;
  /** Seat the avatar on the chair, or stand them back up. */
  setSeated(seated: boolean, chair?: THREE.Vector3): void;
  readonly seated: boolean;
  /**
   * Pose the rig for this frame. Reads locomotion state from the player
   * (speed, heading, gait phase, airborne, landing) and the camera (for the
   * LOD distance only).
   */
  update(dt: number, time: number, player: TrekPlayer, camera: THREE.Camera): void;
  /** Low-end mode: cap animation rate; keep close-up foot placement safe. */
  setLowEnd(v: boolean): void;
  dispose(): void;
}

/**
 * Shared visual pose state; the live physics/controller is in characterController.ts.
 */
export class TrekPlayer {
  position = new THREE.Vector3(0, 0, 0);
  rotation = 0;
  /** Smoothed planar speed, metres/second. */
  speed = 0;

  // ── Locomotion state (read by the avatar pose) ────────────────────
  state: LocoState = "idle";
  /** Gait phase, radians; advances by distance/stride so feet cannot skate. */
  gaitPhase = 0;
  /** Current stride length, metres — the phase law's denominator. */
  strideLen = 0.8;
  /** Smoothed acceleration (+push / −brake), for lean + secondary motion. */
  accelSm = 0;
  /** Signed turn rate × speed, for turn lean. */
  turnLean = 0;
  grounded = true;
  /** Web-controller pose layers. All lengths are metres, all angles radians. */
  crouchAmount = 0;
  lookYaw = 0;
  lookPitch = 0;
  strafeAngle = 0;
  coverLean = 0;
  groundAt: (x: number, z: number) => number = terrainHeight;
  /** 0..1 landing-absorb envelope (drives knees/spine/camera dip). */
  landAbsorb = 0;
  /** Seconds since leaving the ground (drives the air tuck). */
  airTime = 0;

  reset(x: number, z: number) {
    this.position.set(x, terrainHeight(x, z), z);
    this.rotation = 0;
    this.speed = 0;
    this.state = "idle";
    this.gaitPhase = 0;
    this.strideLen = 0.8;
    this.accelSm = 0;
    this.turnLean = 0;
    this.grounded = true;
    this.landAbsorb = 0;
    this.airTime = 0;
  }
}

/**
 * The placeholder the Sanctuary starts with — and keeps if the licensed
 * character fails to load. There is deliberately NO procedural stand-in
 * figure: an unauthorised look-alike once hid the fact that the real model
 * was missing, which is exactly the confusion it must never cause again.
 */
export function createEmptyAvatar(): TrekAvatar {
  const group = new THREE.Group();
  group.name = "sanctuary-character";
  group.userData.characterHeight = CHARACTER_HEIGHT;
  group.userData.characterSource = "none";
  return {
    group,
    seated: false,
    setSeated() { /* No substitute figure to seat. */ },
    setVisible() { /* Nothing to show until the real model arrives. */ },
    setLowEnd() {},
    update() {},
    dispose() { group.removeFromParent(); group.clear(); },
  };
}
