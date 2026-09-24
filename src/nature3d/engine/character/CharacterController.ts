// src/nature3d/engine/character/CharacterController.ts
//
// The locomotion layer. It owns the pipeline the task specifies:
//
//   INPUT → NORMALIZE → STATE MACHINE → TARGET VELOCITY
//     → ACCEL/DECEL → ROTATION → GROUND/SLOPE → ANIMATION PARAMS
//
// It knows NOTHING about meshes or joints — it writes a LocomotionSnapshot
// (position, velocity, stance, gait phase…) that the animation layer reads.
// That is what keeps the model swappable: a future GLB binds to the same
// snapshot contract.
//
// Movement model (per spec):
//   desiredVelocity = inputDirection * targetSpeed
//   currentVelocity = smoothDamp(current, desired, accel/decel)
//   position += currentVelocity * dt
//
// Collision is analytic and allocation-free: circles, rotated boxes and
// 2D segments resolved with axis separation, so walls slide instead of stop.

import * as THREE from "three";
import { WORLD_HALF } from "../terrain";
import { WAREHOUSE_HALF_X, WAREHOUSE_HALF_Z, WAREHOUSE_X, WAREHOUSE_YAW, WAREHOUSE_Z } from "../warehouseSite";
import { beachHouseSites, HOUSE_WALL_HALF_X, HOUSE_WALL_HALF_Z } from "../beachHouseSite";
import { CHARACTER_TUNING as T } from "./CharacterConfig";
import {
  createSnapshot,
  selectLocomotion,
  shortestAngle,
  type AirborneState,
  type LocomotionSnapshot,
  type StanceState,
} from "./MovementState";
import { projectOnGround, sampleGround } from "./GroundingController";
import type { CharacterInputManager } from "./InputManager";

/** Frame-rate independent exponential smoothing factor. */
export function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

// ── Collision volumes (2D, analytic) ───────────────────────────────────

interface CircleBlocker {
  kind: "circle";
  x: number;
  z: number;
  r: number;
  /** Stances this volume blocks (prone crawls under the desk). */
  blocksProne: boolean;
}

interface BoxBlocker {
  kind: "box";
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  cos: number;
  sin: number;
}

type Blocker = CircleBlocker | BoxBlocker;

const DESK_Z = 2.6 - 1.05;
const DESK_HALF_W = 1.9 / 2;
const DESK_HALF_D = 0.82 / 2;

/** Push a point out of a circle. Returns true when a push happened. */
function resolveCircle(px: number, pz: number, c: CircleBlocker, radius: number, out: { x: number; z: number }): boolean {
  const dx = px - c.x;
  const dz = pz - c.z;
  const rr = c.r + radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr || d2 < 1e-10) return false;
  const d = Math.sqrt(d2);
  out.x = c.x + (dx / d) * rr;
  out.z = c.z + (dz / d) * rr;
  return true;
}

/** Push a point out of a (possibly rotated) box. */
function resolveBox(px: number, pz: number, b: BoxBlocker, radius: number, out: { x: number; z: number }): boolean {
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = b.cos * dx - b.sin * dz;
  const lz = b.sin * dx + b.cos * dz;
  const hx = b.halfX + radius;
  const hz = b.halfZ + radius;
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return false;
  // Push along the axis of least penetration (world-frame re-projection).
  const penX = hx - Math.abs(lx);
  const penZ = hz - Math.abs(lz);
  let ox = lx;
  let oz = lz;
  if (penX < penZ) ox = lx >= 0 ? hx : -hx;
  else oz = lz >= 0 ? hz : -hz;
  out.x = b.x + b.cos * ox + b.sin * oz;
  out.z = b.z - b.sin * ox + b.cos * oz;
  return true;
}

// ── The controller ─────────────────────────────────────────────────────

export class CharacterController {
  /** Feet position. */
  readonly position = new THREE.Vector3();
  /** Planar velocity. */
  readonly velocity = new THREE.Vector2();
  /** Body yaw. */
  yaw = 0;

  readonly snapshot: LocomotionSnapshot = createSnapshot();

  private verticalVel = 0;
  private grounded = true;
  private coyote = 0;
  private jumpBuffer = 0;
  private airTime = 0;
  private landTimer = 0;
  private landStrength = 0;
  private gaitPhase = 0;
  private strideLen = 0.8;
  private accelSm = 0;
  private prevSpeed = 0;
  private prevYaw = 0;
  private yawRateSm = 0;
  private stance: StanceState = "stand";
  private stanceTimer = 0;
  private crouch01 = 0;
  private prone01 = 0;
  private airborne: AirborneState = "ground";
  private sprint01 = 0;
  private turnInPlace = false;
  private turnHoldTimer = 0;
  private prevCamYaw = 0;
  private camYawRateSm = 0;
  private headingError = 0;
  private slopeAngle = 0;
  private wishSpeed = 0;
  private deepWater = false;

  private blockers: Blocker[] = [];
  private tmpV2 = new THREE.Vector2();
  private resolveOut = { x: 0, z: 0 };

  constructor() {
    this.rebuildBlockers();
  }

  /** (Re)build the static collision set. Beach-house sites solve at boot. */
  rebuildBlockers(): void {
    const list: Blocker[] = [];
    // The villa behind the student — a solid shell (no enterable interior).
    list.push({
      kind: "box",
      x: WAREHOUSE_X,
      z: WAREHOUSE_Z,
      halfX: WAREHOUSE_HALF_X,
      halfZ: WAREHOUSE_HALF_Z,
      cos: Math.cos(WAREHOUSE_YAW),
      sin: Math.sin(WAREHOUSE_YAW),
    });
    // The six beach houses — solid wall boxes; eaves overhang the walls but
    // the walls are what the body meets.
    for (const s of beachHouseSites()) {
      list.push({
        kind: "box",
        x: s.x,
        z: s.z,
        halfX: (s.halfX || HOUSE_WALL_HALF_X) * 1,
        halfZ: (s.halfZ || HOUSE_WALL_HALF_Z) * 1,
        cos: s.cos,
        sin: s.sin,
      });
    }
    // The desk — blocks stand/crouch; prone crawls underneath it.
    list.push({ kind: "circle", x: 0, z: DESK_Z, r: 0, blocksProne: false });
    // The day bed the student sits on — solid at every stance.
    list.push({ kind: "circle", x: 0, z: 2.6, r: 1.0, blocksProne: true });
    this.blockers = list;
  }

  /** AABB test for the desk (finer than its circle entry above). */
  private deskBlocks(x: number, z: number, radius: number, prone: boolean): boolean {
    if (prone) return false;
    return Math.abs(x) < DESK_HALF_W + radius && Math.abs(z - DESK_Z) < DESK_HALF_D + radius;
  }

  spawn(x: number, z: number, yaw: number): void {
    const g = sampleGround(x, z);
    this.position.set(x, g.height, z);
    this.velocity.set(0, 0);
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.verticalVel = 0;
    this.grounded = true;
    this.airborne = "ground";
    this.stance = "stand";
    this.crouch01 = 0;
    this.prone01 = 0;
    this.gaitPhase = 0;
    this.sprint01 = 0;
    this.turnInPlace = false;
    this.syncSnapshot(0, 0, 0, 0);
  }

  get stanceState(): StanceState {
    return this.stance;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get speed(): number {
    return this.velocity.length();
  }

  /**
   * Headroom for standing up: the desk top is at 0.79 m — a prone body under
   * it must stay down. Houses are solid shells, so standing inside one is
   * impossible by construction (collision never lets the capsule in).
   */
  private hasHeadroom(x: number, z: number): boolean {
    if (Math.abs(x) < DESK_HALF_W + 0.1 && Math.abs(z - DESK_Z) < DESK_HALF_D + 0.1) return false;
    return true;
  }

  update(dt: number, input: CharacterInputManager, camYaw: number, camPitch: number): void {
    const read = input.read();
    const crouchPressed = input.consumeCrouchToggle();
    const pronePressed = input.consumeProneToggle();
    const jumpPressed = input.consumeJump();
    if (jumpPressed) this.jumpBuffer = T.jumpBufferTime;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // ── Stance machine ──────────────────────────────────────────────
    this.updateStance(dt, crouchPressed, pronePressed);

    const prone = this.prone01 > 0.5;
    const crouched = this.crouch01 > 0.5 && !prone;

    // ── Camera-relative wish direction ──────────────────────────────
    // Camera forward flattened: (−sin yaw, −cos yaw); right: (cos, −sin).
    const s = Math.sin(camYaw);
    const c = Math.cos(camYaw);
    const wishX = read.moveX * c + read.moveY * -s;
    const wishZ = read.moveX * -s + read.moveY * -c;
    const wishMag = Math.min(Math.hypot(read.moveX, read.moveY), 1);
    const hasInput = wishMag > 0.05;

    // ── Sprint gating (grounded + forward + input + stand) ──────────
    const forwardBias = hasInput ? read.moveY / Math.max(wishMag, 1e-4) : 0;
    const wantSprint =
      read.sprint && this.grounded && !crouched && !prone && forwardBias > 0.45 && wishMag > 0.55;
    this.sprint01 += ((wantSprint ? 1 : 0) - this.sprint01) * damp(5, dt);

    // ── Target speed ────────────────────────────────────────────────
    let topSpeed: number;
    if (prone) topSpeed = T.proneSpeed;
    else if (crouched) topSpeed = T.crouchSpeed;
    else if (this.sprint01 > 0.5) topSpeed = T.sprintSpeed;
    else if (wishMag < 0.55) topSpeed = T.walkSpeed;
    else topSpeed = T.jogSpeed;
    // Backpedal / strafe are slower than forward (body-space check below).
    this.wishSpeed = hasInput ? topSpeed * wishMag : 0;

    // Body-space velocity shaping: moving backwards caps at backpedal scale.
    const dirX = hasInput ? wishX / Math.max(wishMag, 1e-4) : 0;
    const dirZ = hasInput ? wishZ / Math.max(wishMag, 1e-4) : 0;
    const bodyFwdX = -Math.sin(this.yaw);
    const bodyFwdZ = -Math.cos(this.yaw);
    const fwdness = dirX * bodyFwdX + dirZ * bodyFwdZ;
    if (hasInput && this.grounded) {
      if (fwdness < -0.25) this.wishSpeed *= T.backpedalScale;
      else if (Math.abs(fwdness) < 0.45) this.wishSpeed *= T.strafeScale;
    }

    // Uphill sprint brake + unwalkable-slope block (sampled at the feet).
    const ground = sampleGround(this.position.x, this.position.z);
    this.slopeAngle = ground.slope;
    if (this.grounded && hasInput) {
      const uphill = -(dirX * ground.normal.x + dirZ * ground.normal.z);
      if (uphill > 0.25) {
        if (ground.slope > T.maxSprintSlope) this.wishSpeed = Math.min(this.wishSpeed, T.jogSpeed);
        if (ground.slope > T.maxWalkableSlope) {
          // Too steep to climb: kill the uphill component (slide below).
          this.wishSpeed = 0;
        }
      }
    }
    // Wading slows everything.
    const wading = ground.waterDepth > 0.05 && !ground.deepWater;
    if (wading) this.wishSpeed *= T.waterSlowScale;

    // ── Accel / decel smoothing (no robotic speed jumps) ────────────
    const sprinting = this.sprint01 > 0.5;
    let rate: number;
    if (!this.grounded) rate = T.airAcceleration;
    else if (prone) rate = this.wishSpeed > this.prevSpeed ? T.proneAcceleration : T.proneAcceleration + 2;
    else if (crouched) rate = this.wishSpeed > this.prevSpeed ? T.crouchAcceleration : T.crouchAcceleration + 2;
    else if (sprinting) rate = this.wishSpeed > this.prevSpeed ? T.sprintAcceleration : T.sprintDeceleration;
    else if (this.wishSpeed >= T.jogSpeed * 0.9 || this.prevSpeed >= T.jogSpeed * 0.9) {
      rate = this.wishSpeed > this.prevSpeed ? T.jogAcceleration : T.jogDeceleration;
    } else {
      rate = this.wishSpeed > this.prevSpeed ? T.walkAcceleration : T.walkDeceleration;
    }
    const desiredX = hasInput ? dirX * this.wishSpeed : 0;
    const desiredZ = hasInput ? dirZ * this.wishSpeed : 0;
    const k = damp(rate, dt);
    this.velocity.x += (desiredX - this.velocity.x) * k;
    this.velocity.y += (desiredZ - this.velocity.y) * k;
    if (!hasInput && this.velocity.lengthSq() < 0.0004) this.velocity.set(0, 0);

    const speed = this.velocity.length();
    this.accelSm += ((speed - this.prevSpeed) / Math.max(dt, 1e-4) - this.accelSm) * damp(6, dt);
    this.prevSpeed = speed;

    // ── Rotation: shortest-angle, never a snap ──────────────────────
    const camYawRate = shortestAngle(this.prevCamYaw, camYaw) / Math.max(dt, 1e-4);
    this.prevCamYaw = camYaw;
    this.camYawRateSm += (camYawRate - this.camYawRateSm) * damp(8, dt);
    const cameraStill = Math.abs(this.camYawRateSm) < T.cameraStillThreshold;
    const lookOffset = shortestAngle(this.yaw, camYaw);

    this.updateTurnInPlace(dt, speed, hasInput, lookOffset, cameraStill);

    if (this.turnInPlace) {
      // Shuffle toward the camera heading at a fixed believable rate.
      const step = Math.sign(lookOffset) * Math.min(Math.abs(lookOffset), T.turnInPlaceRate * dt);
      this.yaw += step;
      this.headingError = 0;
    } else if (speed > 0.3) {
      // Body forward is (−sin yaw, −cos yaw): face the velocity, not away.
      const targetYaw = Math.atan2(-this.velocity.x, -this.velocity.y);
      const delta = shortestAngle(this.yaw, targetYaw);
      this.headingError = delta;
      const sharp = hasInput ? T.rotationSharpness : T.idleRotationSharpness;
      // Exponential track + the reference's hard 500°/s rotation rate.
      const step = delta * damp(sharp, dt);
      const cap = T.maxYawRate * dt;
      this.yaw += THREE.MathUtils.clamp(step, -cap, cap);
    } else {
      this.headingError = 0;
    }
    const yawRate = shortestAngle(this.prevYaw, this.yaw) / Math.max(dt, 1e-4);
    this.prevYaw = this.yaw;
    this.yawRateSm += (yawRate - this.yawRateSm) * damp(8, dt);

    // ── Vertical: gravity, jump, land ───────────────────────────────
    if (this.grounded) this.coyote = T.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && (this.grounded || this.coyote > 0)) {
      if (prone) {
        // Jump from prone pops to crouch — never a prone leap.
        this.requestCrouch();
        this.jumpBuffer = 0;
      } else {
        if (crouched) this.requestStand();
        this.verticalVel = T.jumpVelocity;
        this.grounded = false;
        this.airborne = "jump";
        this.airTime = 0;
        this.jumpBuffer = 0;
        this.coyote = 0;
      }
    }

    if (!this.grounded) {
      this.verticalVel += T.gravity * dt;
      this.airTime += dt;
      if (this.verticalVel < -1.2) this.airborne = "fall";
    }

    // ── Integrate with axis-separated collision (walls slide) ───────
    let nx = this.position.x + this.velocity.x * dt;
    let nz = this.position.z + this.velocity.y * dt;

    // Slope slide on unwalkable ground: shed position downhill instead of
    // sticking to a cliff face.
    if (this.grounded && ground.slope > T.maxWalkableSlope) {
      const slide = T.slopeSlideSpeed * dt;
      const nl = Math.hypot(ground.normal.x, ground.normal.z);
      if (nl > 1e-4) {
        nx += (ground.normal.x / nl) * slide;
        nz += (ground.normal.z / nl) * slide;
      }
    }

    const radius = T.capsuleRadius;
    const lim = WORLD_HALF * 0.92;
    // X pass, then Z pass — each blocked axis slides along the other.
    nx = this.resolveAxis(nx, this.position.z, radius, prone, true);
    nz = this.resolveAxis(nx, nz, radius, prone, false);
    this.position.x = THREE.MathUtils.clamp(nx, -lim, lim);
    this.position.z = THREE.MathUtils.clamp(nz, -lim, lim);

    // ── Ground snap / fall ──────────────────────────────────────────
    const now = sampleGround(this.position.x, this.position.z);
    this.deepWater = now.deepWater;
    if (this.deepWater && this.grounded) {
      // Soft shore wall: deep water pushes back to the last legal spot.
      this.position.x = THREE.MathUtils.clamp(this.position.x - this.velocity.x * dt, -lim, lim);
      this.position.z = THREE.MathUtils.clamp(this.position.z - this.velocity.y * dt, -lim, lim);
      const back = sampleGround(this.position.x, this.position.z);
      this.deepWater = back.deepWater;
    }
    const surfaceY = this.deepWater ? this.position.y : sampleGround(this.position.x, this.position.z).height;
    const feetY = this.position.y + this.verticalVel * dt;

    if (this.grounded) {
      // Stick downhill within the snap range; step up small ledges;
      // otherwise go airborne (walked off an edge).
      const drop = this.position.y - surfaceY;
      if (surfaceY >= this.position.y - T.stepOffset && drop <= T.groundStickDistance + T.stepOffset) {
        this.position.y = surfaceY;
        this.verticalVel = 0;
        this.airborne = "ground";
      } else if (drop > T.groundStickDistance + T.stepOffset) {
        this.grounded = false;
        this.airborne = "fall";
        this.airTime = 0;
        this.verticalVel = 0;
      } else {
        this.position.y = surfaceY;
        this.verticalVel = 0;
        this.airborne = "ground";
      }
    }
    if (!this.grounded) {
      this.position.y = feetY;
      if (this.position.y <= surfaceY && this.verticalVel <= 0) {
        // Landing — graded by impact velocity.
        this.position.y = surfaceY;
        const impact = -this.verticalVel;
        this.verticalVel = 0;
        this.grounded = true;
        this.airborne = "land";
        this.landStrength = THREE.MathUtils.clamp(impact / T.heavyLandSpeed, 0.15, 1);
        this.landTimer = T.landAbsorbTime * (0.6 + this.landStrength * 0.7);
        this.airTime = 0;
      }
    }
    if (this.airborne === "land") {
      this.landTimer -= dt;
      if (this.landTimer <= 0) this.airborne = "ground";
    }

    // ── Gait phase: distance over stride — feet cannot skate ─────────
    const targetStride = prone ? 0.55 : crouched ? 0.6 : 0.75 + Math.min(speed / T.sprintSpeed, 1) * 0.85;
    this.strideLen += (targetStride - this.strideLen) * damp(6, dt);
    if (this.grounded && (speed > 0.2 || this.turnInPlace)) {
      const phaseSpeed = this.turnInPlace ? 1.1 : speed;
      this.gaitPhase += ((phaseSpeed * dt) / this.strideLen) * Math.PI;
    }

    this.syncSnapshot(dt, camPitch, lookOffset, speed);
  }

  // ── Stance ─────────────────────────────────────────────────────────

  private updateStance(dt: number, crouchPressed: boolean, pronePressed: boolean): void {
    this.stanceTimer = Math.max(0, this.stanceTimer - dt);
    switch (this.stance) {
      case "stand":
        if (pronePressed) {
          // Stand → prone passes THROUGH crouch (staged, never faked).
          this.stance = "standToCrouch";
          this.stanceTimer = T.stanceBlendTime;
          this.proneQueued = true;
        } else if (crouchPressed) {
          this.stance = "standToCrouch";
          this.stanceTimer = T.stanceBlendTime;
        }
        break;
      case "standToCrouch":
        if (this.stanceTimer <= 0) {
          if (this.proneQueued) {
            this.proneQueued = false;
            this.stance = "crouchToProne";
            this.stanceTimer = T.proneBlendTime;
          } else {
            this.stance = "crouch";
          }
        }
        break;
      case "crouch":
        if (pronePressed) {
          this.stance = "crouchToProne";
          this.stanceTimer = T.proneBlendTime;
        } else if (crouchPressed || this.jumpFromCrouch) {
          this.jumpFromCrouch = false;
          if (this.hasHeadroom(this.position.x, this.position.z)) {
            this.stance = "crouchToStand";
            this.stanceTimer = T.stanceBlendTime;
          }
        }
        break;
      case "crouchToProne":
        if (this.stanceTimer <= 0) this.stance = "prone";
        else if (crouchPressed && this.hasHeadroom(this.position.x, this.position.z)) {
          this.stance = "crouchToStand";
          this.stanceTimer = T.stanceBlendTime;
        }
        break;
      case "prone":
        if (pronePressed || crouchPressed) {
          // Prone → stand passes through crouch (staged).
          this.stance = "proneToCrouch";
          this.stanceTimer = T.proneBlendTime * 0.7;
          this.standQueued = pronePressed && crouchPressed ? false : pronePressed;
        }
        break;
      case "proneToCrouch":
        if (this.stanceTimer <= 0) {
          if (this.standQueued && this.hasHeadroom(this.position.x, this.position.z)) {
            this.standQueued = false;
            this.stance = "crouchToStand";
            this.stanceTimer = T.stanceBlendTime;
          } else {
            this.standQueued = false;
            this.stance = "crouch";
          }
        }
        break;
      case "crouchToStand":
        if (this.stanceTimer <= 0) this.stance = "stand";
        else if (pronePressed) {
          this.stance = "standToCrouch";
          this.stanceTimer = T.stanceBlendTime;
          this.proneQueued = true;
        }
        break;
    }
    // Continuous blends for the animation layer.
    const crouchTarget =
      this.stance === "stand" || this.stance === "crouchToStand" ? 0 : 1;
    const proneTarget =
      this.stance === "prone" || this.stance === "crouchToProne" || this.stance === "proneToCrouch"
        ? this.stance === "proneToCrouch"
          ? 0
          : 1
        : 0;
    const rate = this.stance === "crouchToProne" || this.stance === "proneToCrouch"
      ? 1 / Math.max(T.proneBlendTime, 0.05)
      : 1 / Math.max(T.stanceBlendTime, 0.05);
    const ck = damp(this.stance === "crouchToStand" || this.stance === "standToCrouch" ? 1 / T.stanceBlendTime : rate, dt);
    this.crouch01 += (crouchTarget - this.crouch01) * ck;
    this.prone01 += (proneTarget - this.prone01) * damp(rate, dt);
    if (Math.abs(this.crouch01 - crouchTarget) < 0.002) this.crouch01 = crouchTarget;
    if (Math.abs(this.prone01 - proneTarget) < 0.002) this.prone01 = proneTarget;
  }

  private proneQueued = false;
  private standQueued = false;
  private jumpFromCrouch = false;

  private requestCrouch(): void {
    if (this.stance === "stand") {
      this.stance = "standToCrouch";
      this.stanceTimer = T.stanceBlendTime;
    } else if (this.stance === "prone") {
      this.stance = "proneToCrouch";
      this.stanceTimer = T.proneBlendTime * 0.7;
    }
  }

  private requestStand(): void {
    this.jumpFromCrouch = true;
  }

  // ── Turn-in-place ──────────────────────────────────────────────────

  private updateTurnInPlace(
    _dt: number,
    speed: number,
    hasInput: boolean,
    lookOffset: number,
    cameraStill: boolean,
  ): void {
    if (hasInput || speed > 0.35 || !this.grounded || this.prone01 > 0.5) {
      this.turnInPlace = false;
      this.turnHoldTimer = 0;
      return;
    }
    if (this.turnInPlace) {
      if (Math.abs(lookOffset) < 0.12) {
        this.turnInPlace = false;
        this.turnHoldTimer = 0;
      }
      return;
    }
    // Idle + camera parked off-shoulder: arm the turn after the delay.
    if (Math.abs(lookOffset) > T.turnInPlaceThreshold && cameraStill) {
      this.turnHoldTimer += _dt;
      if (this.turnHoldTimer >= T.turnInPlaceDelay) this.turnInPlace = true;
    } else {
      this.turnHoldTimer = 0;
    }
  }

  // ── Collision ──────────────────────────────────────────────────────

  /** Resolve one axis against every blocker + the desk. */
  private resolveAxis(nx: number, nz: number, radius: number, prone: boolean, isX: boolean): number {
    // The desk: a low AABB the prone body crawls under.
    if (this.deskBlocks(nx, nz, radius, prone)) {
      return isX ? this.position.x : this.position.z;
    }
    for (const b of this.blockers) {
      if (b.kind === "circle" && b.r <= 0) continue; // desk placeholder
      if (b.kind === "circle" && !b.blocksProne && prone) continue;
      const hit =
        b.kind === "circle"
          ? resolveCircle(nx, nz, b, radius, this.resolveOut)
          : resolveBox(nx, nz, b, radius, this.resolveOut);
      if (hit) {
        // Axis separation: keep the legal axis, drop the blocked one.
        if (isX) return this.position.x;
        // For the Z pass both axes are candidates — take the push-out point.
        nx = this.resolveOut.x;
        nz = this.resolveOut.z;
      }
    }
    return isX ? nx : nz;
  }

  /** Project a movement delta onto the ground plane (slope-aligned feet). */
  projectWish(dx: number, dz: number): THREE.Vector2 {
    const g = sampleGround(this.position.x, this.position.z);
    return projectOnGround(dx, dz, g.normal, this.tmpV2);
  }

  // ── Snapshot ───────────────────────────────────────────────────────

  private syncSnapshot(_dt: number, camPitch: number, lookOffset: number, speed: number): void {
    const s = this.snapshot;
    s.locomotion = selectLocomotion(speed, this.wishSpeed, this.headingError, this.turnInPlace, s.locomotion);
    s.stance = this.stance;
    s.airborne = this.airborne;
    s.speed = speed;
    s.targetSpeed = this.wishSpeed;
    // Body-space velocity: forward = +z, right = +x.
    const bs = Math.sin(this.yaw);
    const bc = Math.cos(this.yaw);
    s.localVelZ = this.velocity.x * -bs + this.velocity.y * -bc;
    s.localVelX = this.velocity.x * bc + this.velocity.y * -bs;
    s.verticalVel = this.verticalVel;
    s.yaw = this.yaw;
    s.yawRate = this.yawRateSm;
    s.accel = this.accelSm;
    s.gaitPhase = this.gaitPhase;
    s.strideLen = this.strideLen;
    s.grounded = this.grounded;
    s.slopeAngle = this.slopeAngle;
    s.crouch01 = this.crouch01;
    s.prone01 = this.prone01;
    s.landAbsorb = this.airborne === "land"
      ? this.landStrength * Math.max(this.landTimer / T.landAbsorbTime, 0)
      : 0;
    s.sprint01 = this.sprint01;
    s.airTime = this.airTime;
    s.turningInPlace = this.turnInPlace;
    s.cameraPitch = camPitch;
    s.lookYawOffset = lookOffset;
  }
}
