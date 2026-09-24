// src/nature3d/engine/character/index.ts
//
// Barrel for the third-person player-character system. The scene wires these
// together; nothing outside `engine/` imports from here.

export {
  CHARACTER_HEIGHT,
  CHARACTER_SCALE,
  CHARACTER_TUNING,
  characterQualityForTier,
  type CharacterQuality,
  type CharacterTuning,
} from "./CharacterConfig";
export {
  createSnapshot,
  selectLocomotion,
  shortestAngle,
  type AirborneState,
  type LocomotionSnapshot,
  type LocomotionState,
  type StanceState,
} from "./MovementState";
export { CharacterInputManager, type NormalisedInput } from "./InputManager";
export { projectOnGround, sampleGround, type GroundSample } from "./GroundingController";
export { CharacterController, damp } from "./CharacterController";
export { CharacterAnimationController } from "./AnimationController";
export { FootIKController } from "./FootIKController";
export { ThirdPersonCameraController } from "./ThirdPersonCamera";
export {
  BONE_NAMES,
  createRealisticMale,
  RIG_SEGMENTS,
  type BoneName,
  type PlayerRig,
} from "./RealisticMale";
export {
  CharacterDebugVisuals,
  createDebugSnapshot,
  fillDebugSnapshot,
  formatDebugLine,
  type CharacterDebugSnapshot,
} from "./CharacterDebug";
