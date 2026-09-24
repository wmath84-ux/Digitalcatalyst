// src/nature3d/engine/character/FootIKController.ts
//
// Lightweight two-foot IK. While a leg is in stance the foot HOLDS its
// captured world plant — the body travels over a planted foot, which is what
// "no skating" means geometrically. During swing the FK gait owns the leg.
//
// Per foot, per solve:
//   1. capture the plant ahead of the hip (once per stance)
//   2. sample the terrain height + normal under it (analytic — no raycast)
//   3. solve the two-bone chain (law of cosines, pole forward)
//   4. pitch the sole to the slope, blend by the stance weight
//
// The two feet solve on ALTERNATE frames (staggered): one terrain sample +
// one analytic solve per frame at most. Pelvis eases down when a plant is
// out of leg reach (downhill plants). Fades out at sprint speed, in the air,
// when prone, and on the LOW character tier.

import * as THREE from "three";
import { terrainHeight, terrainNormal } from "../terrain";
import { CHARACTER_SCALE, CHARACTER_TUNING as T } from "./CharacterConfig";
import { damp } from "./CharacterController";
import type { LocomotionSnapshot } from "./MovementState";
import { RIG_SEGMENTS, type PlayerRig } from "./RealisticMale";

interface FootState {
  weight: number;
  plantX: number;
  plantZ: number;
  live: boolean;
  solHip: number;
  solKnee: number;
  solAnkle: number;
  solDrop: number;
}

function createFoot(): FootState {
  return { weight: 0, plantX: 0, plantZ: 0, live: false, solHip: 0, solKnee: 0, solAnkle: 0, solDrop: 0 };
}

const _n = new THREE.Vector3();

export class FootIKController {
  private left = createFoot();
  private right = createFoot();
  private pelvisDrop = 0;
  private tick = 0;
  private enabled = true;
  /** 1 = solve every frame, 2 = stagger (MEDIUM), 0 = off (LOW). */
  private solveEvery = 1;

  setQualityTier(q: "LOW" | "MEDIUM" | "HIGH"): void {
    this.enabled = q !== "LOW";
    this.solveEvery = q === "HIGH" ? 1 : 2;
    if (!this.enabled) {
      this.left.weight = 0;
      this.right.weight = 0;
      this.left.live = false;
      this.right.live = false;
    }
  }

  reset(): void {
    this.left = createFoot();
    this.right = createFoot();
    this.pelvisDrop = 0;
  }

  /**
   * Run after the animation controller has posed the rig. Reads the snapshot
   * for stance weights and phase; writes leg joints + pelvis drop.
   */
  update(
    dt: number,
    snap: LocomotionSnapshot,
    rig: PlayerRig,
    feetPos: THREE.Vector3,
    bodyYaw: number,
  ): void {
    this.tick += 1;
    const J = rig.joints;
    // Pelvis drop always relaxes; only IK re-adds it.
    this.pelvisDrop *= 1 - damp(6, dt);
    if (!this.enabled || !snap.grounded || snap.prone01 > 0.5 || snap.speed > T.sprintSpeed * 0.92) {
      this.left.live = false;
      this.right.live = false;
      this.left.weight *= 1 - damp(10, dt);
      this.right.weight *= 1 - damp(10, dt);
      return;
    }
    // Crouch halves the authority (deep bends are FK-led).
    const authority = 1 - snap.crouch01 * 0.5;
    const sL = Math.sin(snap.gaitPhase);
    const sR = Math.sin(snap.gaitPhase + Math.PI);
    const allowed = this.tick % this.solveEvery === 0;
    this.updateFoot(-1, J.LeftUpLeg, J.LeftLeg, J.LeftFoot, sL, snap, this.left, feetPos, bodyYaw, authority, allowed, dt);
    this.updateFoot(1, J.RightUpLeg, J.RightLeg, J.RightFoot, sR, snap, this.right, feetPos, bodyYaw, authority, allowed, dt);
    // Clamp the correction so the body reacts subtly, never stretches.
    const drop = Math.min(0.12, Math.max(this.left.solDrop * this.left.weight, this.right.solDrop * this.right.weight));
    this.pelvisDrop = Math.max(this.pelvisDrop, drop);
    J.Hips.position.y -= this.pelvisDrop;
  }

  private updateFoot(
    side: -1 | 1,
    hip: THREE.Group,
    knee: THREE.Group,
    ankle: THREE.Group,
    s: number,
    snap: LocomotionSnapshot,
    foot: FootState,
    feetPos: THREE.Vector3,
    bodyYaw: number,
    authority: number,
    allowed: boolean,
    dt: number,
  ): void {
    const stanceTarget = THREE.MathUtils.smoothstep(-s, -0.3, 0.45) * authority;
    foot.weight += (stanceTarget - foot.weight) * damp(14, dt);
    if (foot.weight < 0.02) {
      if (foot.weight < 0.004) foot.live = false;
      return;
    }
    // FK pose was written by the gait this frame — capture BEFORE solving.
    const fkHip = hip.rotation.x;
    const fkKnee = knee.rotation.x;
    const fkAnkle = ankle.rotation.x;
    // Stagger: this foot solves only on its own ticks; other ticks reuse
    // the cached solution (a held plant is static, so the cache is exact).
    const myTick = allowed && (this.tick + (side < 0 ? 0 : 1)) % 2 === 0;
    if (myTick) {
      const hs = Math.sin(bodyYaw);
      const hc = Math.cos(bodyYaw);
      if (!foot.live) {
        // Capture the plant once per stance: ahead of the hip by half stride.
        const hx = feetPos.x + side * RIG_SEGMENTS.hipX * CHARACTER_SCALE * hc;
        const hz = feetPos.z - side * RIG_SEGMENTS.hipX * CHARACTER_SCALE * hs;
        foot.plantX = hx + -hs * snap.strideLen * 0.5;
        foot.plantZ = hz + -hc * snap.strideLen * 0.5;
        foot.live = true;
      }
      const soleY = terrainHeight(foot.plantX, foot.plantZ) + 0.03;
      terrainNormal(foot.plantX, foot.plantZ, _n);
      // Slope pitch in the facing frame.
      const solePitch = Math.atan2(-(_n.x * -hs + _n.z * -hc), _n.y);
      const hipY = feetPos.y + (RIG_SEGMENTS.hipsHeight - RIG_SEGMENTS.hipDrop) * CHARACTER_SCALE;
      foot.solDrop = this.solveLeg(
        side, hip, knee, ankle, bodyYaw, feetPos, hipY,
        foot.plantX, foot.plantZ, soleY, solePitch,
      );
      foot.solHip = hip.rotation.x;
      foot.solKnee = knee.rotation.x;
      foot.solAnkle = ankle.rotation.x;
    }
    hip.rotation.x = fkHip + (foot.solHip - fkHip) * foot.weight;
    knee.rotation.x = fkKnee + (foot.solKnee - fkKnee) * foot.weight;
    ankle.rotation.x = fkAnkle + (foot.solAnkle - fkAnkle) * foot.weight;
  }

  /**
   * Analytic two-bone IK in the leg's sagittal plane. Writes thigh / knee /
   * ankle rotations that place the sole on the plant with the slope pitch.
   * Returns the pelvis drop the target demands when out of reach.
   */
  private solveLeg(
    side: -1 | 1,
    hip: THREE.Group,
    knee: THREE.Group,
    ankle: THREE.Group,
    heading: number,
    feetPos: THREE.Vector3,
    hipY: number,
    tx: number,
    tz: number,
    soleY: number,
    solePitch: number,
  ): number {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    // Hip world position, analytically (no matrix reads — deterministic).
    const hx = feetPos.x + side * RIG_SEGMENTS.hipX * CHARACTER_SCALE * c;
    const hz = feetPos.z - side * RIG_SEGMENTS.hipX * CHARACTER_SCALE * s;
    // Target relative to the hip, in the facing frame (fwd = −Z local).
    const dx = tx - hx;
    const dz = tz - hz;
    const fwd = dx * -s + dz * -c;
    const ankleY = soleY + RIG_SEGMENTS.ankleHeight * CHARACTER_SCALE;
    const rise = hipY - ankleY;
    const dist = Math.hypot(fwd, rise);
    const thigh = RIG_SEGMENTS.thighLen * CHARACTER_SCALE;
    const calf = RIG_SEGMENTS.calfLen * CHARACTER_SCALE;
    const maxReach = thigh + calf - 0.015;
    const minReach = 0.28 * CHARACTER_SCALE;
    const drop = Math.max(0, dist - maxReach);
    const D = THREE.MathUtils.clamp(dist, minReach, maxReach);
    // Knee flexion from the law of cosines (0 = straight, + = bent back).
    const cosK = THREE.MathUtils.clamp(
      (thigh * thigh + calf * calf - D * D) / (2 * thigh * calf),
      -1,
      1,
    );
    const kneeBend = Math.PI - Math.acos(cosK);
    // Thigh pitch: direction to target, minus the knee's share.
    const aim = Math.atan2(fwd, Math.max(rise, 0.02));
    const cosA = THREE.MathUtils.clamp(
      (thigh * thigh + D * D - calf * calf) / (2 * thigh * D),
      -1,
      1,
    );
    const thighPitch = aim - Math.acos(cosA);
    hip.rotation.x = thighPitch;
    // Knees bend BACKWARD (foot toward +Z local): negative X rotation.
    knee.rotation.x = -kneeBend;
    // Ankle: sole matches the slope pitch under the facing frame.
    ankle.rotation.x = -(thighPitch - kneeBend) + solePitch;
    return drop;
  }
}
