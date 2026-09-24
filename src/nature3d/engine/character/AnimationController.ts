// src/nature3d/engine/character/AnimationController.ts
//
// The animation state machine. Inputs are the locomotion snapshot (speed,
// velocity, stance, grounded, sprint…) — outputs are joint rotations on the
// PlayerRig, cross-faded every frame by critically-damped tracking.
//
// There are no canned clips: every gait is a continuous, speed-parameterised
// procedural pose (the "blend tree"), and every state change cross-fades
// through the same damping, so idle → sprint → jump → land can never pop.
// Locomotion is IN-PLACE throughout (the controller moves the capsule; the
// rig never translates itself) — one consistent rule, no root-motion split.
//
// Layers, lowest → highest (a higher layer only ADDS on top):
//   base gait → stance (crouch/prone) → airborne → lean/turn/strafe → look

import * as THREE from "three";
import { CHARACTER_TUNING as T } from "./CharacterConfig";
import { damp } from "./CharacterController";
import type { LocomotionSnapshot } from "./MovementState";
import { RIG_SEGMENTS, type BoneName, type PlayerRig } from "./RealisticMale";

interface EulerTarget {
  x: number;
  y: number;
  z: number;
}

const _targets = {} as Record<BoneName, EulerTarget>;

function resetTargets(): void {
  for (const k of Object.keys(_targets) as BoneName[]) {
    const t = _targets[k];
    t.x = 0;
    t.y = 0;
    t.z = 0;
  }
}

/** Smoothstep of a 0..1 progress value (clamped). Allocation-free. */
function smooth01(t: number): number {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

function ensureTargets(): void {
  if (_targets.Hips) return;
  const names: BoneName[] = [
    "Hips", "Spine", "Spine1", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
    "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
  ];
  for (const n of names) _targets[n] = { x: 0, y: 0, z: 0 };
}

export class CharacterAnimationController {
  private breathPhase = 0;
  /** Hips positional offset target (crouch drop / prone lay / land dip). */
  private hipsY = RIG_SEGMENTS.hipsHeight;
  private hipsZ = 0;
  private lookYawSm = 0;
  private lookPitchSm = 0;

  constructor() {
    ensureTargets();
  }

  /**
   * Pose the rig for this frame. `dt` drives the cross-fade tracking;
   * `time` drives breathing/idle life. Allocation-free.
   */
  update(dt: number, time: number, snap: LocomotionSnapshot, rig: PlayerRig): void {
    resetTargets();
    const speed = snap.speed;
    const speed01 = THREE.MathUtils.clamp(speed / T.sprintSpeed, 0, 1);
    const moving = speed > 0.25 && snap.grounded;
    const phase = snap.gaitPhase;
    const crouch = snap.crouch01 * (1 - snap.prone01);
    const prone = snap.prone01;
    const air = snap.grounded ? 0 : 1;
    const land = snap.landAbsorb;

    this.breathPhase = time * (moving ? 2.8 : 1.6);
    const breath = Math.sin(this.breathPhase);

    // ── Base gait (continuous in speed — the blend tree) ──────────────
    const swing = Math.min(0.14 + 0.13 * speed, 0.95) * (1 - crouch * 0.45);
    const bobAmp = Math.min(0.008 + 0.007 * speed, 0.05) * (1 - crouch * 0.5);
    const gaitCrouch = Math.min(0.008 + 0.009 * speed, 0.07);
    const armSwing = Math.min(0.1 + 0.11 * speed, 0.8);
    const elbowBase = 0.25 + speed01 * 0.75;
    const lean = 0.02 + speed01 * 0.22 + snap.sprint01 * 0.06;

    const sL = Math.sin(phase);
    const sR = Math.sin(phase + Math.PI);
    const moveW = moving ? 1 : 0;

    // Hips: bob twice per cycle, sway once, drop into crouch/gait/land.
    const bobY = -gaitCrouch - bobAmp * Math.abs(Math.cos(phase)) * moveW - crouch * 0.34;
    this.hipsY = RIG_SEGMENTS.hipsHeight + bobY * (1 - prone) - land * 0.1 * (1 - prone);
    this.hipsZ = 0;
    _targets.Hips.y = moving ? 0.06 * Math.sin(phase) * Math.min(speed01 + 0.35, 1) : 0;
    _targets.Hips.z = moving ? Math.min(0.02 + 0.012 * speed, 0.06) * Math.sin(phase) : 0;

    // Legs: FK gait (foot IK overrides stance legs afterwards).
    _targets.LeftUpLeg.x = swing * sL * moveW - crouch * 1.05;
    _targets.RightUpLeg.x = swing * sR * moveW - crouch * 1.05;
    const foldL = Math.pow(Math.max(0, Math.sin(phase + 2.35)), 1.4);
    const foldR = Math.pow(Math.max(0, Math.sin(phase + Math.PI + 2.35)), 1.4);
    _targets.LeftLeg.x = -(0.08 + gaitCrouch * 4 + swing * 1.45 * foldL * moveW) - crouch * 1.5 - land * 0.9;
    _targets.RightLeg.x = -(0.08 + gaitCrouch * 4 + swing * 1.45 * foldR * moveW) - crouch * 1.5 - land * 0.9;
    _targets.LeftFoot.x =
      -(_targets.LeftUpLeg.x + _targets.LeftLeg.x) * 0.85 + crouch * 0.35;
    _targets.RightFoot.x =
      -(_targets.RightUpLeg.x + _targets.RightLeg.x) * 0.85 + crouch * 0.35;
    // Toe push-off at the back of each stride.
    _targets.LeftToeBase.x = -0.3 * Math.pow(Math.max(0, Math.sin(phase + Math.PI * 0.72)), 2) * moveW;
    _targets.RightToeBase.x = -0.3 * Math.pow(Math.max(0, Math.sin(phase + Math.PI * 1.72)), 2) * moveW;

    // Spine: lean + breath; crouch pitches the torso over the knees.
    _targets.Spine.x = -lean * 0.5 - crouch * 0.35 + breath * 0.006;
    _targets.Spine1.x = -lean * 0.5 - crouch * 0.3 + breath * 0.01 - land * 0.25;
    _targets.Spine1.y = moving ? -0.04 * Math.sin(phase) * speed01 : 0;

    // Arms: counter-swing; crouch brings them forward ready (+x = forward).
    _targets.LeftArm.x = -armSwing * sR * moveW + crouch * 0.55 + land * 0.5;
    _targets.RightArm.x = -armSwing * sL * moveW + crouch * 0.55 + land * 0.5;
    _targets.LeftArm.z = 0.1 + speed01 * 0.06 + crouch * 0.12;
    _targets.RightArm.z = -0.1 - speed01 * 0.06 - crouch * 0.12;
    _targets.LeftForeArm.x = 0.18 + elbowBase * (0.4 + 0.6 * Math.max(0, -sR)) * moveW + crouch * 0.6 + land * 0.4;
    _targets.RightForeArm.x = 0.18 + elbowBase * (0.4 + 0.6 * Math.max(0, -sL)) * moveW + crouch * 0.6 + land * 0.4;
    _targets.LeftHand.x = Math.sin(phase * 2) * 0.06 * speed01 * moveW;
    _targets.RightHand.x = Math.sin(phase * 2 + 1) * 0.06 * speed01 * moveW;

    // Head: stabilise against spine lean + breathing nod.
    _targets.Head.x = lean * 0.55 + crouch * 0.45 + breath * 0.008 - land * 0.1;
    _targets.Neck.x = -lean * 0.12 + crouch * 0.1;

    // Idle life: weight shifts + micro head motion when still. Arms sway
    // ADDITIVELY so a crouch-ready pose is never stomped back to hanging.
    if (!moving && snap.grounded && prone < 0.02) {
      const sway = Math.sin(time * 0.55);
      _targets.Hips.z = sway * 0.012;
      _targets.Hips.x = Math.sin(time * 0.4) * 0.008;
      _targets.Head.y = Math.sin(time * 0.33) * 0.09;
      _targets.Head.x += Math.sin(time * 0.5) * 0.012;
      _targets.LeftArm.x += sway * 0.02;
      _targets.RightArm.x += -sway * 0.02;
    }

    // ── Prone: staged kneel-down into a military high-crawl ──────────
    // The reference has no prone, so this is built to its bar from field
    // manuals instead: going down passes through a kneel with hands
    // planting on the dirt (stage A), then the body stretches out flat
    // (stage B). Down pose: chest ~0.3 m, up on the elbows with forearms
    // flat forward, head craned to look ahead, legs trailed with toes
    // pointed back. The crawl is diagonal — left elbow plants while the
    // right knee drives — with body roll and counter-bobbed head.
    if (prone > 0.001) {
      const kneel = smooth01(prone / 0.42) * (1 - smooth01((prone - 0.38) / 0.5));
      const flat = smooth01((prone - 0.35) / 0.6);
      // Stage A: sink to the knees, hands planting forward-down.
      if (kneel > 0.001) {
        const k = kneel * (1 - flat * 0.85);
        this.hipsY = THREE.MathUtils.lerp(this.hipsY, 0.55, k);
        _targets.Hips.x = THREE.MathUtils.lerp(_targets.Hips.x, -0.5, k);
        _targets.LeftUpLeg.x = THREE.MathUtils.lerp(_targets.LeftUpLeg.x, 0.35, k);
        _targets.RightUpLeg.x = THREE.MathUtils.lerp(_targets.RightUpLeg.x, 0.35, k);
        _targets.LeftLeg.x = THREE.MathUtils.lerp(_targets.LeftLeg.x, -2.0, k);
        _targets.RightLeg.x = THREE.MathUtils.lerp(_targets.RightLeg.x, -2.0, k);
        _targets.LeftFoot.x = THREE.MathUtils.lerp(_targets.LeftFoot.x, 1.1, k);
        _targets.RightFoot.x = THREE.MathUtils.lerp(_targets.RightFoot.x, 1.1, k);
        _targets.Spine.x = THREE.MathUtils.lerp(_targets.Spine.x, -0.35, k);
        _targets.Spine1.x = THREE.MathUtils.lerp(_targets.Spine1.x, -0.3, k);
        _targets.LeftArm.x = THREE.MathUtils.lerp(_targets.LeftArm.x, 0.7, k);
        _targets.RightArm.x = THREE.MathUtils.lerp(_targets.RightArm.x, 0.7, k);
        _targets.LeftForeArm.x = THREE.MathUtils.lerp(_targets.LeftForeArm.x, 0.25, k);
        _targets.RightForeArm.x = THREE.MathUtils.lerp(_targets.RightForeArm.x, 0.25, k);
        _targets.Head.x = THREE.MathUtils.lerp(_targets.Head.x, -0.25, k);
      }
      // Stage B: stretched flat — the high-crawl.
      if (flat > 0.001) {
        const w = flat;
        const cL = Math.sin(phase);
        const cR = Math.sin(phase + Math.PI);
        const driveL = moving ? Math.max(0, cL) : 0; // left elbow plants…
        const driveR = moving ? Math.max(0, cR) : 0; // …while right knee drives
        const sway = moving ? Math.sin(phase) * 0.05 : 0;
        const lift = moving ? Math.abs(Math.cos(phase)) * 0.02 : 0;
        this.hipsY = THREE.MathUtils.lerp(this.hipsY, 0.34 + lift, w);
        this.hipsZ = THREE.MathUtils.lerp(this.hipsZ, 0.06, w);
        _targets.Hips.x = THREE.MathUtils.lerp(_targets.Hips.x, -1.45 + lift * 1.5, w);
        _targets.Hips.y = THREE.MathUtils.lerp(_targets.Hips.y, sway, w);
        _targets.Hips.z = THREE.MathUtils.lerp(_targets.Hips.z, sway * 0.8, w);
        // Legs trail flat and slightly spread; knees drive up alternately.
        _targets.LeftUpLeg.x = THREE.MathUtils.lerp(_targets.LeftUpLeg.x, 0.12 + driveR * 0.55, w);
        _targets.RightUpLeg.x = THREE.MathUtils.lerp(_targets.RightUpLeg.x, 0.12 + driveL * 0.55, w);
        _targets.LeftUpLeg.z = THREE.MathUtils.lerp(_targets.LeftUpLeg.z, 0.09, w);
        _targets.RightUpLeg.z = THREE.MathUtils.lerp(_targets.RightUpLeg.z, -0.09, w);
        _targets.LeftLeg.x = THREE.MathUtils.lerp(_targets.LeftLeg.x, -0.12 - driveR * 1.05, w);
        _targets.RightLeg.x = THREE.MathUtils.lerp(_targets.RightLeg.x, -0.12 - driveL * 1.05, w);
        _targets.LeftFoot.x = THREE.MathUtils.lerp(_targets.LeftFoot.x, 1.15 - driveR * 0.55, w);
        _targets.RightFoot.x = THREE.MathUtils.lerp(_targets.RightFoot.x, 1.15 - driveL * 0.55, w);
        _targets.LeftToeBase.x = THREE.MathUtils.lerp(_targets.LeftToeBase.x, 0.35, w);
        _targets.RightToeBase.x = THREE.MathUtils.lerp(_targets.RightToeBase.x, 0.35, w);
        // Back stays flat; chest twists into each reach.
        _targets.Spine.x = THREE.MathUtils.lerp(_targets.Spine.x, 0.08, w);
        _targets.Spine1.x = THREE.MathUtils.lerp(_targets.Spine1.x, 0.1, w);
        _targets.Spine1.y = THREE.MathUtils.lerp(_targets.Spine1.y, moving ? cL * 0.07 : 0, w);
        // Elbows plant beside the ribs, forearms flat forward, alternating.
        _targets.LeftArm.x = THREE.MathUtils.lerp(_targets.LeftArm.x, 0.85 + driveL * 0.42, w);
        _targets.RightArm.x = THREE.MathUtils.lerp(_targets.RightArm.x, 0.85 + driveR * 0.42, w);
        _targets.LeftArm.z = THREE.MathUtils.lerp(_targets.LeftArm.z, 0.3, w);
        _targets.RightArm.z = THREE.MathUtils.lerp(_targets.RightArm.z, -0.3, w);
        _targets.LeftForeArm.x = THREE.MathUtils.lerp(_targets.LeftForeArm.x, 0.85 - driveL * 0.5, w);
        _targets.RightForeArm.x = THREE.MathUtils.lerp(_targets.RightForeArm.x, 0.85 - driveR * 0.5, w);
        _targets.LeftHand.x = THREE.MathUtils.lerp(_targets.LeftHand.x, 0.25, w);
        _targets.RightHand.x = THREE.MathUtils.lerp(_targets.RightHand.x, 0.25, w);
        // Head cranes up to look ahead (counter-bobs against the crawl).
        _targets.Head.x = THREE.MathUtils.lerp(_targets.Head.x, 1.15 - lift * 4, w);
        _targets.Neck.x = THREE.MathUtils.lerp(_targets.Neck.x, 0.3, w);
        // Idle prone: a slow lookout scan, not a freeze.
        if (!moving) {
          _targets.Head.y = THREE.MathUtils.lerp(_targets.Head.y, Math.sin(time * 0.5) * 0.35, w);
          _targets.Head.x = THREE.MathUtils.lerp(_targets.Head.x, 1.1 + breath * 0.02, w * 0.5);
        }
      }
    }

    // ── Airborne: additive over the move direction ────────────────────
    if (air > 0.001 && prone < 0.5) {
      const tuck = Math.min(snap.airTime * 3.2, 1);
      const falling = snap.airborne === "fall" ? 1 : 0;
      _targets.LeftUpLeg.x = THREE.MathUtils.lerp(_targets.LeftUpLeg.x, 0.35 * tuck + 0.08, air);
      _targets.RightUpLeg.x = THREE.MathUtils.lerp(_targets.RightUpLeg.x, -0.25 * tuck - 0.06, air);
      _targets.LeftLeg.x = THREE.MathUtils.lerp(_targets.LeftLeg.x, -(0.5 + tuck * 0.6), air);
      _targets.RightLeg.x = THREE.MathUtils.lerp(_targets.RightLeg.x, -(0.35 + tuck * 0.7), air);
      _targets.LeftFoot.x = THREE.MathUtils.lerp(_targets.LeftFoot.x, 0.3 + falling * 0.15, air);
      _targets.RightFoot.x = THREE.MathUtils.lerp(_targets.RightFoot.x, 0.35 + falling * 0.15, air);
      _targets.LeftArm.x = THREE.MathUtils.lerp(_targets.LeftArm.x, 0.9 * tuck - falling * 0.25, air);
      _targets.RightArm.x = THREE.MathUtils.lerp(_targets.RightArm.x, 0.9 * tuck - falling * 0.25, air);
      _targets.LeftArm.z = THREE.MathUtils.lerp(_targets.LeftArm.z, 0.1 + 0.55 * tuck + falling * 0.35, air);
      _targets.RightArm.z = THREE.MathUtils.lerp(_targets.RightArm.z, -0.1 - 0.55 * tuck - falling * 0.35, air);
      _targets.LeftForeArm.x = THREE.MathUtils.lerp(_targets.LeftForeArm.x, 0.55, air);
      _targets.RightForeArm.x = THREE.MathUtils.lerp(_targets.RightForeArm.x, 0.55, air);
      _targets.Spine1.x = THREE.MathUtils.lerp(_targets.Spine1.x, 0.08, air);
    }

    // ── Start/stop lean + turn lean + strafe shift ────────────────────
    if (snap.grounded && prone < 0.5) {
      const push = THREE.MathUtils.clamp(snap.accel * 0.028, -0.22, 0.3);
      _targets.Spine.x += -push * 0.5;
      _targets.Spine1.x += -push * 0.5;
      _targets.Head.x += push * 0.5;
      // Braking brace: arms swing forward as the body sits back.
      if (snap.accel < -2.5) {
        const brace = Math.min((-snap.accel - 2.5) * 0.05, 0.3);
        _targets.LeftArm.x += brace;
        _targets.RightArm.x += brace;
        _targets.LeftUpLeg.x += brace * 0.4;
        _targets.RightUpLeg.x += brace * 0.4;
      }
      // Lean INTO the turn (bank), like the reference.
      const bank = THREE.MathUtils.clamp(-snap.yawRate * speed * 0.012, -0.22, 0.22);
      _targets.Spine.z = bank;
      _targets.Spine1.z = bank * 0.8;
      _targets.Hips.z += bank * 0.4;
      _targets.Head.y += THREE.MathUtils.clamp(-snap.yawRate * 0.12, -0.3, 0.3);
      // Strafe: lateral velocity shifts the pelvis and rolls the torso.
      const strafe = THREE.MathUtils.clamp(snap.localVelX * 0.09, -0.25, 0.25);
      _targets.Spine1.z += strafe * 0.5;
    }

    // ── Look layer: head + chest follow the camera (aim-offset style) ─
    // Prone inverts the split: the chest stays glued to the dirt while the
    // head scans freely with the camera (the crawler's lookout).
    const lookW = (1 - speed01 * 0.65) * (1 - air * 0.5);
    this.lookYawSm += (snap.lookYawOffset - this.lookYawSm) * damp(7, dt);
    this.lookPitchSm += (snap.cameraPitch - this.lookPitchSm) * damp(7, dt);
    const ly = THREE.MathUtils.clamp(this.lookYawSm, -T.lookYawClamp, T.lookYawClamp) * lookW;
    const lp = THREE.MathUtils.clamp(this.lookPitchSm, -T.lookPitchClamp, T.lookPitchClamp) * lookW;
    _targets.Head.y += ly * (1 + prone * 0.9);
    _targets.Head.x += -lp * 0.75 * (1 + prone * 0.5);
    _targets.Neck.y += ly * 0.35;
    _targets.Neck.x += -lp * 0.2;
    _targets.Spine1.y += ly * 0.3 * (1 - prone * 0.85);

    // ── Turn-in-place shuffle: small quick steps while pivoting ───────
    if (snap.turningInPlace) {
      const sh = Math.sin(phase * 2) * 0.22;
      _targets.LeftUpLeg.x += sh;
      _targets.RightUpLeg.x -= sh;
      _targets.LeftLeg.x -= 0.25 + Math.abs(sh) * 0.8;
      _targets.RightLeg.x -= 0.25 + Math.abs(sh) * 0.8;
      _targets.LeftArm.x += sh * 0.5;
      _targets.RightArm.x -= sh * 0.5;
    }

    // ── Track the targets: THIS is the cross-fade ─────────────────────
    const kFast = damp(T.gaitBlendSharpness + 4, dt);
    const kMid = damp(T.gaitBlendSharpness, dt);
    const kSlow = damp(T.gaitBlendSharpness - 4, dt);
    const J = rig.joints;
    this.track(J.Hips, _targets.Hips, kMid);
    J.Hips.position.y += (this.hipsY - J.Hips.position.y) * kMid;
    J.Hips.position.z += (this.hipsZ - J.Hips.position.z) * kMid;
    this.track(J.Spine, _targets.Spine, kMid);
    this.track(J.Spine1, _targets.Spine1, kMid);
    this.track(J.Neck, _targets.Neck, kSlow);
    this.track(J.Head, _targets.Head, kSlow);
    this.track(J.LeftShoulder, _targets.LeftShoulder, kMid);
    this.track(J.RightShoulder, _targets.RightShoulder, kMid);
    this.track(J.LeftArm, _targets.LeftArm, kFast);
    this.track(J.RightArm, _targets.RightArm, kFast);
    this.track(J.LeftForeArm, _targets.LeftForeArm, kFast);
    this.track(J.RightForeArm, _targets.RightForeArm, kFast);
    this.track(J.LeftHand, _targets.LeftHand, kFast);
    this.track(J.RightHand, _targets.RightHand, kFast);
    this.track(J.LeftUpLeg, _targets.LeftUpLeg, kFast);
    this.track(J.RightUpLeg, _targets.RightUpLeg, kFast);
    this.track(J.LeftLeg, _targets.LeftLeg, kFast);
    this.track(J.RightLeg, _targets.RightLeg, kFast);
    this.track(J.LeftFoot, _targets.LeftFoot, kFast);
    this.track(J.RightFoot, _targets.RightFoot, kFast);
    this.track(J.LeftToeBase, _targets.LeftToeBase, kFast);
    this.track(J.RightToeBase, _targets.RightToeBase, kFast);
  }

  private track(joint: THREE.Group, t: EulerTarget, k: number): void {
    joint.rotation.x += (t.x - joint.rotation.x) * k;
    joint.rotation.y += (t.y - joint.rotation.y) * k;
    joint.rotation.z += (t.z - joint.rotation.z) * k;
  }
}
