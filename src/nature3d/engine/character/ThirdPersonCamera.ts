// src/nature3d/engine/character/ThirdPersonCamera.ts
//
// The third-person follow camera: smooth boom, shoulder offset, damped
// yaw/pitch, terrain + building collision, sprint FOV kick, landing dip.
//
// The boom is marched from the pivot toward the desired head position and
// pulled in at the first obstruction (terrain sample or house box), so the
// lens never clips through walls or dives underground. No shake: every
// channel is exponentially damped, and the dip/kick are envelopes, not noise.

import * as THREE from "three";
import { terrainHeight } from "../terrain";
import { insideWarehouse } from "../warehouseSite";
import { insideBeachHouse } from "../beachHouseSite";
import { CHARACTER_TUNING as T } from "./CharacterConfig";
import { damp } from "./CharacterController";
import type { LocomotionSnapshot } from "./MovementState";

const _pivot = new THREE.Vector3();
const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();

export class ThirdPersonCameraController {
  yaw = Math.PI;
  pitch = 0.18;
  distance = T.cameraDistance;

  private targetYaw = Math.PI;
  private targetPitch = 0.18;
  private targetDistance = T.cameraDistance;
  private pivotSm = new THREE.Vector3();
  private pivotInit = false;
  private fovKick = 0;
  private dip = 0;
  private baseFov = T.cameraFov;

  /** Place behind the character facing the same way. */
  snapBehind(bodyYaw: number, feetPos: THREE.Vector3): void {
    // Camera yaw convention matches movement: forward = (−sin, −cos).
    this.yaw = bodyYaw;
    this.targetYaw = bodyYaw;
    this.pitch = 0.18;
    this.targetPitch = 0.18;
    this.distance = T.cameraDistance;
    this.targetDistance = T.cameraDistance;
    _pivot.copy(feetPos);
    _pivot.y += T.cameraPivotHeight;
    this.pivotSm.copy(_pivot);
    this.pivotInit = true;
    this.fovKick = 0;
    this.dip = 0;
  }

  addLook(dxPx: number, dyPx: number): void {
    this.targetYaw -= dxPx * T.lookSensitivity;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + dyPx * T.lookSensitivity,
      T.pitchMin,
      T.pitchMax,
    );
  }

  zoomBy(factor: number): void {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance * factor,
      T.cameraMinDistance,
      T.cameraMaxDistance,
    );
  }

  get lookYaw(): number {
    return this.yaw;
  }

  get lookPitch(): number {
    return this.pitch;
  }

  /**
   * Drive the camera. `feetPos`/`bodyYaw` come from the controller,
   * `snap` carries stance/sprint/landing for the feel envelopes.
   */
  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    feetPos: THREE.Vector3,
    snap: LocomotionSnapshot,
  ): void {
    const k = damp(T.cameraDamping, dt);
    // Shortest-path yaw tracking so a ±π wrap never spins the camera.
    this.yaw += Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw)) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.distance += (this.targetDistance - this.distance) * k;

    // Pivot follows the chest — lower when crouched, near the dirt when prone.
    const pivotH = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(T.cameraPivotHeight, T.cameraCrouchPivot, snap.crouch01),
      T.cameraPronePivot,
      snap.prone01,
    );
    _pivot.set(feetPos.x, feetPos.y + pivotH, feetPos.z);
    if (!this.pivotInit) {
      this.pivotSm.copy(_pivot);
      this.pivotInit = true;
    }
    this.pivotSm.lerp(_pivot, damp(14, dt));

    // Boom direction from yaw/pitch (behind + above the pivot).
    const cp = Math.cos(this.pitch);
    _dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // ── Collision: march the boom, pull in at the first obstruction ──
    let dist = this.distance;
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const d = (this.distance * i) / steps;
      const px = this.pivotSm.x + _dir.x * d;
      const py = this.pivotSm.y + _dir.y * d;
      const pz = this.pivotSm.z + _dir.z * d;
      const floor = terrainHeight(px, pz) + 0.32;
      if (py < floor) {
        dist = Math.max(T.cameraMinDistance * 0.6, d - this.distance / steps);
        break;
      }
      // House shells: the lens stops at the wall, never inside a room.
      if (insideWarehouse(px, pz, 0.3) || insideBeachHouse(px, pz, 0.3)) {
        dist = Math.max(T.cameraMinDistance * 0.6, d - this.distance / steps);
        break;
      }
    }
    // Shoulder offset, applied in camera space (right + slightly up).
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const shoulder = T.cameraShoulder * (1 - snap.prone01 * 0.7);
    _head.set(
      this.pivotSm.x + _dir.x * dist + c * shoulder,
      this.pivotSm.y + _dir.y * dist + 0.12,
      this.pivotSm.z + _dir.z * dist - s * shoulder,
    );
    // Final terrain guard on the offset head (the shoulder shift can clip).
    const headFloor = terrainHeight(_head.x, _head.z) + 0.28;
    if (_head.y < headFloor) _head.y = headFloor;
    camera.position.copy(_head);

    // Look slightly ahead of the pivot at speed (leading the motion).
    _look.copy(this.pivotSm);
    _look.x += -s * snap.speed * 0.12;
    _look.z += -c * snap.speed * 0.12;
    _look.y -= this.dip;
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);

    // ── Feel envelopes ──────────────────────────────────────────────
    this.fovKick += (snap.sprint01 * T.sprintFovKick - this.fovKick) * damp(5, dt);
    const wantDip = snap.landAbsorb * 0.28;
    this.dip += (wantDip - this.dip) * damp(snap.landAbsorb > this.dip ? 18 : 7, dt);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(camera.fov - fov) > 0.02) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
  }
}
