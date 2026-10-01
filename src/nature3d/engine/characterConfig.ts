// One Three.js world unit is one metre. Six feet, not an arbitrary visual scale.
export const CHARACTER_HEIGHT = 6 * 0.3048;
export const CHARACTER_RADIUS = 0.3;
export const CROUCH_HEIGHT = 1.25;

export const CHARACTER_TUNING = Object.freeze({
  walkSpeed: 2.2,
  runSpeed: 5,
  crouchSpeed: 1.1,
  coverSpeed: 1,
  acceleration: 12,
  braking: 20,
  airControl: 0.35,
  jumpVelocity: 7,
  gravity: 18,
  maxFallSpeed: 35,
  stepHeight: 0.35,
  maxSlope: 48 * Math.PI / 180,
  coyoteTime: 0.1,
  jumpBuffer: 0.14,
  turnRate: 500 * Math.PI / 180,
  turnInPlaceThreshold: Math.PI / 3,
  turnInPlaceDelay: 0.5,
  simulationStep: 1 / 120,
  cameraDistance: 4,
  cameraMinDistance: 1.8,
  cameraMaxDistance: 8,
  cameraRadius: 0.16,
});

/** Stand beside the sofa, NEVER seated in front of the study board. */
export const CHARACTER_SPAWN = Object.freeze({ x: -10, z: 10, yaw: 0 });
export type CharacterCameraMode = "orbit" | "third-person" | "first-person";
