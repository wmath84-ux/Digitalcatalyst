import * as THREE from "three";
import { damp } from "./controls";
import { TrekPlayer } from "./trekAvatar";
import { CharacterCollisionWorld, type CoverContact } from "./characterCollision";
import {
  CAMERA_PIVOT_RATIO, CHARACTER_HEIGHT, CHARACTER_RADIUS, CHARACTER_SCALE, CHARACTER_SPAWN, CHARACTER_TUNING as T,
  CROUCH_HEIGHT, characterBodyHeight, characterEyeHeight, type CharacterCameraMode,
} from "./characterConfig";

export const shortestAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A collision-tested, damped UE-style 4 m spring arm + a true eye camera. */
export class CharacterCameraRig {
  yaw: number = CHARACTER_SPAWN.yaw;
  pitch = 0.18;
  private targetYaw: number = this.yaw;
  private targetPitch = this.pitch;
  private wantedDistance: number = T.cameraDistance;
  private boom: number = T.cameraDistance;
  private shoulder = 0.32 * CHARACTER_SCALE;
  private target = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private snap = true;
  mode: Exclude<CharacterCameraMode, "orbit"> = "third-person";
  bodyVisible = true;

  rotate(dx: number, dy: number) {
    this.targetYaw -= dx;
    const eyeLimit = Math.PI / 2 - 0.01;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy, this.mode === "first-person" ? -eyeLimit : -1.25, this.mode === "first-person" ? eyeLimit : 1.35);
  }

  zoom(factor: number) {
    this.wantedDistance = THREE.MathUtils.clamp(this.wantedDistance * factor, T.cameraMinDistance, T.cameraMaxDistance);
  }

  swapShoulder() { this.shoulder *= -1; }

  setMode(mode: Exclude<CharacterCameraMode, "orbit">) {
    this.mode = mode;
    if (mode === "third-person") this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -1.25, 1.35);
    this.snap = true;
  }

  reset(yaw: number = 0) {
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = 0.18;
    this.boom = this.wantedDistance;
    this.snap = true;
  }

  update(dt: number, player: CharacterController, camera: THREE.PerspectiveCamera, world: CharacterCollisionWorld) {
    const k = this.snap ? 1 : damp(16, dt);
    this.yaw += shortestAngle(this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    const eyeHeight = characterEyeHeight(player.crouchAmount);
    const pivotHeight = this.mode === "first-person" ? eyeHeight : characterBodyHeight(player.crouchAmount) * CAMERA_PIVOT_RATIO;
    this.desired.copy(player.position);
    this.desired.y += pivotHeight - player.landAbsorb * 0.055 * CHARACTER_SCALE;
    this.target.lerp(this.desired, this.snap ? 1 : damp(18, dt));
    if (world.cameraBlocked(this.target.x, this.target.y, this.target.z, 0.04)) this.target.copy(this.desired);
    const cp = Math.cos(this.pitch);
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    camera.up.set(0, 1, 0);
    if (this.mode === "first-person") {
      camera.position.copy(this.desired);
      this.lookTarget.set(camera.position.x - sy * cp, camera.position.y - Math.sin(this.pitch), camera.position.z - cy * cp);
      camera.lookAt(this.lookTarget);
      this.bodyVisible = false;
    } else {
      this.desired.set(
        this.target.x + sy * cp * this.wantedDistance + cy * this.shoulder,
        this.target.y + Math.sin(this.pitch) * this.wantedDistance,
        this.target.z + cy * cp * this.wantedDistance - sy * this.shoulder,
      );
      this.direction.copy(this.desired).sub(this.target);
      const length = this.direction.length();
      this.direction.divideScalar(Math.max(length, 1e-6));
      let safe = length;
      // A small swept camera sphere; terrain + the same walls the capsule sees.
      for (let s = 0.12; s <= length; s += 0.12) {
        const x = this.target.x + this.direction.x * s;
        const y = this.target.y + this.direction.y * s;
        const z = this.target.z + this.direction.z * s;
        if (world.cameraBlocked(x, y, z, T.cameraRadius)) { safe = Math.max(0.08, s - 0.16); break; }
      }
      // Pull in immediately to avoid penetrating a wall. Ease OUT when clear.
      this.boom = this.snap || safe < this.boom ? safe : THREE.MathUtils.lerp(this.boom, safe, damp(7, dt));
      camera.position.copy(this.target).addScaledVector(this.direction, this.boom);
      camera.position.y = Math.max(camera.position.y, world.terrainAt(camera.position.x, camera.position.z) + T.cameraRadius);
      camera.lookAt(this.target);
      this.bodyVisible = this.boom > 0.65 * CHARACTER_SCALE;
    }
    const base = this.mode === "first-person" ? 74 : 62;
    let fov = base + THREE.MathUtils.smoothstep(player.speed, T.walkSpeed, T.runSpeed) * 4;
    if (camera.aspect < 16 / 9) fov = Math.min(100, Math.atan(Math.tan(fov * Math.PI / 360) * (16 / 9) / camera.aspect) * 360 / Math.PI);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    this.snap = false;
  }
}

/**
 * Independent browser implementation of the upstream's player behaviour.
 * UE C++/Blueprint/AnimGraph binaries are NOT being executed in WebGL.
 * Strafe locomotion, start/stop, run, crouch, physical jump, cover paths,
 * aim offset and delayed turn-in-place share one authoritative pose state.
 */
export class CharacterController extends TrekPlayer {
  readonly cameraRig = new CharacterCameraRig();
  readonly velocity = new THREE.Vector3();
  private accumulator = 0;
  private inputX = 0;
  private inputY = 0;
  private runInput = false;
  private crouchInput = false;
  private jumpBuffered = 0;
  private coyote: number = T.coyoteTime;
  private idleCameraTime = 0;
  private lastYaw = 0;
  private moveAge = 0;
  private landAge = 1;
  private cover: CoverContact | null = null;
  private exitCoverAge = 0;
  private lookX = 0;
  private lookY = 0;
  mode: CharacterCameraMode = "orbit";
  crouched = false;
  runLatched = false;
  crouchLatched = false;

  constructor(readonly world: CharacterCollisionWorld) {
    super();
    this.groundAt = (x, z) => this.world.floorAt(x, z, this.position.y, T.stepHeight);
    this.reset();
  }

  get inCover() { return this.cover !== null; }
  get capsuleHeight() { return this.crouched ? CROUCH_HEIGHT : CHARACTER_HEIGHT; }
  get enabled() { return this.mode !== "orbit"; }

  override reset(x: number = CHARACTER_SPAWN.x, z: number = CHARACTER_SPAWN.z, yaw: number = CHARACTER_SPAWN.yaw) {
    this.position.set(x, this.world.terrainAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.rotation = yaw;
    this.speed = 0;
    this.grounded = true;
    this.state = "idle";
    this.gaitPhase = 0;
    this.strideLen = 1.4 * CHARACTER_SCALE;
    this.accelSm = this.turnLean = this.landAbsorb = this.airTime = 0;
    this.crouchAmount = this.lookYaw = this.lookPitch = this.strafeAngle = this.coverLean = 0;
    this.cover = null;
    this.crouched = false;
    this.accumulator = 0;
    this.coyote = T.coyoteTime;
    this.moveAge = this.idleCameraTime = this.exitCoverAge = 0;
    this.landAge = 1;
    this.clearInput();
    this.cameraRig.reset(yaw);
    this.lastYaw = yaw;
  }

  setMode(mode: CharacterCameraMode) {
    const changingCamera = this.enabled && mode !== "orbit";
    this.mode = mode;
    if (!changingCamera) this.clearInput();
    if (mode !== "orbit") this.cameraRig.setMode(mode);
    else {
      this.cover = null; this.crouchLatched = false;
      // Park on a real support surface; exiting during a jump must not leave
      // a permanently floating, airborne guide in the world/board overview.
      this.position.y = this.world.floorAt(this.position.x, this.position.z, this.position.y, T.stepHeight, CHARACTER_RADIUS);
      this.velocity.y = 0; this.grounded = true; this.airTime = 0;
      this.crouched = !this.world.canOccupy(this.position.x, this.position.y, this.position.z, CHARACTER_RADIUS, CHARACTER_HEIGHT);
      this.crouchAmount = this.crouched ? 1 : 0;
      this.state = this.crouched ? "crouch" : "idle";
    }
  }

  setInput(strafe: number, forward: number, run: boolean, crouch: boolean) {
    const length = Math.hypot(strafe, forward);
    const norm = Math.max(1, length);
    this.inputX = strafe / norm;
    this.inputY = forward / norm;
    this.runInput = run;
    this.crouchInput = crouch;
  }

  setLookStick(x: number, y: number) { this.lookX = x; this.lookY = y; }
  rotateCamera(dx: number, dy: number) { this.cameraRig.rotate(dx, dy); this.idleCameraTime = 0; }
  toggleRun() { this.runLatched = !this.runLatched; }
  toggleCrouch() { this.crouchLatched = !this.crouchLatched; }
  jump() { if (this.enabled) { this.cover = null; this.jumpBuffered = T.jumpBuffer; } }
  releaseJump() { if (!this.grounded && this.velocity.y > 3 * CHARACTER_SCALE) this.velocity.y = 3 * CHARACTER_SCALE; }

  clearInput() {
    this.inputX = this.inputY = this.lookX = this.lookY = 0;
    this.runInput = this.crouchInput = this.runLatched = this.crouchLatched = false;
    this.jumpBuffered = 0;
    this.speed = this.velocity.x = this.velocity.z = 0;
  }

  toggleCover(): boolean {
    if (this.cover) { this.cover = null; this.exitCoverAge = 0; return false; }
    if (!this.enabled || !this.grounded) return false;
    this.cover = this.world.findCover(this.position, CHARACTER_RADIUS);
    if (!this.cover) return false;
    this.position.x = this.cover.anchorX + this.cover.tangentX * this.cover.along;
    this.position.z = this.cover.anchorZ + this.cover.tangentZ * this.cover.along;
    this.velocity.x = this.velocity.z = 0;
    this.exitCoverAge = 0;
    return true;
  }

  update(dt: number, camera?: THREE.PerspectiveCamera, paused = false) {
    if (!Number.isFinite(dt) || dt < 0) return;
    if (paused) this.clearInput();
    if (this.enabled && !paused) {
      if (this.lookX || this.lookY) this.rotateCamera(this.lookX * dt * 2.2, this.lookY * dt * 1.7);
      this.accumulator += Math.min(dt, 0.1);
      while (this.accumulator + 1e-9 >= T.simulationStep) {
        this.step(T.simulationStep);
        this.accumulator -= T.simulationStep;
      }
    } else if (!this.enabled) {
      this.speed = this.velocity.x = this.velocity.z = 0;
      this.state = this.crouched ? "crouch" : "idle";
      this.crouchAmount = THREE.MathUtils.lerp(this.crouchAmount, this.crouched ? 1 : 0, damp(12, dt));
      this.landAbsorb *= Math.exp(-8 * dt);
    }
    if (camera && this.enabled) this.cameraRig.update(dt, this, camera, this.world);
  }

  private step(dt: number) {
    this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.coyote = this.grounded ? T.coyoteTime : Math.max(0, this.coyote - dt);
    this.landAge += dt;
    this.landAbsorb *= Math.exp(-8 * dt);
    const yaw = this.cameraRig.yaw;
    if (Math.abs(shortestAngle(yaw - this.lastYaw)) > 0.002) this.idleCameraTime = 0;
    else this.idleCameraTime += dt;
    this.lastYaw = yaw;
    const wantsCrouch = this.crouchInput || this.crouchLatched || (this.cover?.low ?? false);
    if (wantsCrouch) this.crouched = this.grounded;
    else if (this.world.canOccupy(this.position.x, this.position.y, this.position.z, CHARACTER_RADIUS, CHARACTER_HEIGHT)) this.crouched = false;
    this.crouchAmount = THREE.MathUtils.lerp(this.crouchAmount, this.crouched ? 1 : 0, damp(12, dt));

    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const wishX = cy * this.inputX - sy * this.inputY;
    const wishZ = -sy * this.inputX - cy * this.inputY;
    const inputLength = Math.hypot(wishX, wishZ);
    const running = (this.runInput || this.runLatched) && !this.crouched;
    let wantedSpeed = this.cover ? T.coverSpeed : this.crouched ? T.crouchSpeed : running ? T.runSpeed : T.walkSpeed;
    let desiredX = wishX * wantedSpeed;
    let desiredZ = wishZ * wantedSpeed;
    const oldX = this.position.x;
    const oldZ = this.position.z;
    const oldY = this.position.y;
    const wasGrounded = this.grounded;
    const oldSpeed = this.speed;
    const oldRotation = this.rotation;

    if (this.cover) {
      const cover = this.cover;
      const away = wishX * cover.normalX + wishZ * cover.normalZ;
      this.exitCoverAge = away > 0.55 ? this.exitCoverAge + dt : 0;
      if (this.exitCoverAge > 0.16) this.cover = null;
      else {
        const alongInput = wishX * cover.tangentX + wishZ * cover.tangentZ;
        cover.along = THREE.MathUtils.clamp(cover.along + alongInput * wantedSpeed * dt, cover.min, cover.max);
        this.position.x = cover.anchorX + cover.tangentX * cover.along;
        this.position.z = cover.anchorZ + cover.tangentZ * cover.along;
        desiredX = (this.position.x - oldX) / dt;
        desiredZ = (this.position.z - oldZ) / dt;
        const atEnd = alongInput < -0.1 && cover.along <= cover.min + 0.02 || alongInput > 0.1 && cover.along >= cover.max - 0.02;
        this.coverLean = THREE.MathUtils.lerp(this.coverLean, atEnd ? Math.sign(alongInput) : 0, damp(10, dt));
        this.rotation += shortestAngle(Math.atan2(cover.normalX, cover.normalZ) - this.rotation) * damp(14, dt);
        this.velocity.x = desiredX;
        this.velocity.z = desiredZ;
      }
    } else this.coverLean *= Math.exp(-10 * dt);

    if (!this.cover) {
      const acceleration = inputLength > 0.01 ? T.acceleration : T.braking;
      const control = this.grounded ? 1 : T.airControl;
      const dx = desiredX - this.velocity.x;
      const dz = desiredZ - this.velocity.z;
      const change = Math.hypot(dx, dz);
      const rate = Math.min(1, acceleration * control * dt / Math.max(change, 1e-6));
      this.velocity.x += dx * rate;
      this.velocity.z += dz * rate;
      if (inputLength < 0.01 && change < 0.02 * CHARACTER_SCALE) this.velocity.x = this.velocity.z = 0;

      // Do not climb unwalkable terrain or teleport up an analytic cliff.
      if (this.grounded) {
        const gx = (this.world.terrainAt(oldX + 0.15, oldZ) - this.world.terrainAt(oldX - 0.15, oldZ)) / 0.3;
        const gz = (this.world.terrainAt(oldX, oldZ + 0.15) - this.world.terrainAt(oldX, oldZ - 0.15)) / 0.3;
        const slope2 = gx * gx + gz * gz;
        const uphill = this.velocity.x * gx + this.velocity.z * gz;
        if (slope2 > Math.tan(T.maxSlope) ** 2 && uphill > 0) {
          this.velocity.x -= gx * uphill / slope2;
          this.velocity.z -= gz * uphill / slope2;
        }
      }
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      const terrain = this.world.terrainAt(this.position.x, this.position.z);
      const water = this.world.waterAt(this.position.x, this.position.z);
      if (this.grounded && (terrain > oldY + T.stepHeight || water - terrain > 0.65 * CHARACTER_SCALE)) {
        this.position.x = oldX;
        this.position.z = oldZ;
        this.velocity.x = this.velocity.z = 0;
      }
      const directionDifference = shortestAngle(yaw - this.rotation);
      if (inputLength > 0.01 || (Math.abs(directionDifference) > T.turnInPlaceThreshold && this.idleCameraTime >= T.turnInPlaceDelay)) {
        const turn = THREE.MathUtils.clamp(directionDifference, -T.turnRate * dt, T.turnRate * dt);
        this.rotation += turn;
      }
    }

    // Buffered jump / short grace after leaving a ledge; one jump per press.
    if (this.jumpBuffered > 0 && this.coyote > 0 && !this.crouched && this.world.canOccupy(this.position.x, this.position.y + 0.1, this.position.z, CHARACTER_RADIUS, CHARACTER_HEIGHT)) {
      this.velocity.y = T.jumpVelocity;
      this.grounded = false;
      this.jumpBuffered = this.coyote = 0;
      this.airTime = 0;
    }
    if (!this.grounded) {
      this.velocity.y = Math.max(-T.maxFallSpeed, this.velocity.y - T.gravity * dt);
      this.position.y += this.velocity.y * dt;
      this.airTime += dt;
      // A ceiling cancels ascent. The capsule must not pass through it.
      if (this.velocity.y > 0 && !this.world.canOccupy(this.position.x, this.position.y, this.position.z, CHARACTER_RADIUS, this.capsuleHeight)) {
        this.position.y = oldY;
        this.velocity.y = 0;
      }
    }
    let floor = this.world.floorAt(this.position.x, this.position.z, oldY, wasGrounded ? T.stepHeight : 0.015 * CHARACTER_SCALE, CHARACTER_RADIUS + 0.001);
    if (this.grounded && floor - this.position.y <= T.stepHeight && this.position.y - floor <= T.stepHeight) this.position.y = floor;
    else if (this.grounded) { this.grounded = false; this.velocity.y = 0; this.airTime = 0; }
    this.world.resolve(this.position, this.velocity, CHARACTER_RADIUS, this.capsuleHeight);
    floor = this.world.floorAt(this.position.x, this.position.z, oldY, wasGrounded ? T.stepHeight : 0.015 * CHARACTER_SCALE, CHARACTER_RADIUS + 0.001);
    if (this.position.y <= floor + 0.002 * CHARACTER_SCALE && this.velocity.y <= 0) {
      if (!this.grounded) { this.landAbsorb = Math.min(1, Math.abs(this.velocity.y) / (10 * CHARACTER_SCALE)); this.landAge = 0; }
      this.position.y = floor;
      this.velocity.y = 0;
      this.grounded = true;
      this.airTime = 0;
    }
    const travel = Math.hypot(this.position.x - oldX, this.position.z - oldZ);
    this.speed = travel / dt;
    this.accelSm = THREE.MathUtils.lerp(this.accelSm, (this.speed - oldSpeed) / dt, damp(8, dt));
    this.turnLean = THREE.MathUtils.lerp(this.turnLean, THREE.MathUtils.clamp(shortestAngle(this.rotation - oldRotation) / dt * this.speed * -0.006 / CHARACTER_SCALE, -0.14, 0.14), damp(8, dt));
    this.strideLen = this.crouched ? 0.85 * CHARACTER_SCALE : THREE.MathUtils.lerp(1.4 * CHARACTER_SCALE, 2.4 * CHARACTER_SCALE, THREE.MathUtils.smoothstep(this.speed, T.walkSpeed, T.runSpeed));
    if (this.grounded) this.gaitPhase = (this.gaitPhase + travel / this.strideLen * Math.PI * 2) % (Math.PI * 2);
    if (this.speed > 0.02) this.strafeAngle = shortestAngle(Math.atan2(-this.velocity.x, -this.velocity.z) - this.rotation);
    this.lookYaw = THREE.MathUtils.clamp(shortestAngle(yaw - this.rotation), -1.05, 1.05);
    this.lookPitch = -this.cameraRig.pitch;
    this.moveAge = inputLength > 0.01 ? this.moveAge + dt : 0;
    if (!this.grounded) this.state = this.velocity.y > 0 ? "jump" : "fall";
    else if (this.landAge < 0.18) this.state = "land";
    else if (this.cover) this.state = Math.abs(this.coverLean) > 0.1 ? "cover-lean" : this.speed > 0.05 ? "cover-walk" : "cover";
    else if (this.crouched) this.state = this.speed > 0.05 ? "crouch-walk" : "crouch";
    else if (this.speed > 0.05) this.state = inputLength < 0.01 ? "stop" : this.moveAge < 0.18 ? "start" : running ? "run" : "walk";
    else this.state = Math.abs(shortestAngle(this.rotation - oldRotation)) > 0.001 ? "turn" : "idle";
    if (!Number.isFinite(this.position.x + this.position.y + this.position.z) || this.position.y < -100) this.reset();
  }
}
