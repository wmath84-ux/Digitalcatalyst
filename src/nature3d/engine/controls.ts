// src/nature3d/engine/controls.ts
//
// TWO camera rigs and the twin-stick input layer.
//
//   ORBIT  — the cinematic default: drag to spin around the study clearing,
//            wheel/pinch to zoom, always above the ground, always aimed at
//            the board.
//   FPP    — first person. The camera IS the student: WASD / left stick to
//            walk, right stick or mouse-drag to look, the body is hidden so
//            nothing bobs in front of the lens. The camera follows the
//            terrain height with a smoothed step so slopes feel like walking,
//            not like an elevator.
//
// Both rigs are written with the same rule: EVERY value is smoothed with an
// exponential filter that is frame-rate independent
// (`1 - exp(-k*dt)`), so movement feels identical at 30, 60 and 144 fps and
// never stutters when a frame is long.

import * as THREE from "three";
import { terrainHeight, insideRiver } from "./terrain";

/** Frame-rate independent smoothing factor. */
export function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

export interface VirtualStick {
  /** -1..1 */
  x: number;
  y: number;
  active: boolean;
}

export class OrbitRig {
  yaw = -0.35;
  pitch = 0.32;
  distance = 13.5;
  target = new THREE.Vector3(0, 2.1, 0);

  private targetYaw = this.yaw;
  private targetPitch = this.pitch;
  private targetDistance = this.distance;
  autoRotate = false;

  setFromCamera(camera: THREE.PerspectiveCamera) {
    const offset = camera.position.clone().sub(this.target);
    this.targetDistance = offset.length();
    this.targetYaw = Math.atan2(offset.x, offset.z);
    this.targetPitch = Math.asin(THREE.MathUtils.clamp(offset.y / this.targetDistance, -1, 1));
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;
    this.distance = this.targetDistance;
  }

  rotate(dx: number, dy: number) {
    this.targetYaw -= dx;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy, 0.03, Math.PI / 2 - 0.05);
  }

  zoom(factor: number) {
    // Upper bound raised with the world: you can now pull back far enough to
    // take in the whole kilometre and the hill ranges behind it.
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, 2.4, 420);
  }

  panTo(target: THREE.Vector3, distance: number, yaw?: number, pitch?: number) {
    this.target.copy(target);
    this.targetDistance = distance;
    if (yaw !== undefined) this.targetYaw = yaw;
    if (pitch !== undefined) this.targetPitch = pitch;
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    if (this.autoRotate) this.targetYaw += dt * 0.12;

    const k = damp(9, dt);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.distance += (this.targetDistance - this.distance) * k;

    const cp = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Never let the orbit camera dive under the meadow.
    const floor = terrainHeight(camera.position.x, camera.position.z) + 0.9;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(this.target);
  }
}

/**
 * How far from the clearing the learner may walk. The world is a kilometre
 * across, so this sits just inside the far grass ring: you can walk for
 * minutes, reach the foot of the hills, and still never see bare terrain.
 */
const WALK_LIMIT = 430;

export class FirstPersonRig {
  position = new THREE.Vector3(0, 0, 3.4);
  yaw = Math.PI;
  pitch = -0.05;
  /** Eye height above the ground. */
  eyeHeight = 1.68;
  private velocity = new THREE.Vector3();
  private smoothY = 0;
  private bob = 0;
  sprint = false;

  reset(x: number, z: number, yaw: number) {
    this.position.set(x, terrainHeight(x, z), z);
    this.smoothY = this.position.y;
    this.yaw = yaw;
    this.pitch = -0.05;
    this.velocity.set(0, 0, 0);
  }

  look(dx: number, dy: number) {
    // Yaw is deliberately unbounded, so you can keep turning and look all the
    // way behind you without the view ever hitting a wall.
    this.yaw -= dx;
    // Pitch reaches almost straight up and almost straight down. 1.52 rad is
    // 87 degrees: the last 3 degrees are held back on purpose, because AT
    // exactly 90 the forward vector becomes parallel to the world up axis and
    // the yaw frame degenerates (gimbal flip), which makes the view snap.
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.52, 1.52);
  }

  update(dt: number, move: VirtualStick, camera: THREE.PerspectiveCamera) {
    // Movement: stick vector rotated into the camera's yaw frame.
    //
    // THE SIGN THAT MATTERS. With rotation order YXZ and yaw applied about +Y,
    // the direction the camera actually looks is
    //     forward = (-sin(yaw), 0, -cos(yaw))
    // and its right-hand vector is
    //     right   = ( cos(yaw), 0, -sin(yaw)).
    // The old code used (+sin, +cos) for forward, i.e. exactly the BACKWARD
    // vector, which is why pushing the stick up walked the camera backwards.
    const speed = (this.sprint ? 6.2 : 3.1) * (move.active ? 1 : 0);
    const forward = -move.y; // stick up (y = -1) → forward = +1
    const strafe = move.x;   // stick right → strafe right
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const desiredX = (forward * -sin + strafe * cos) * speed;
    const desiredZ = (forward * -cos - strafe * sin) * speed;

    // Acceleration smoothing — no instant start/stop, so the walk reads heavy.
    const a = damp(11, dt);
    this.velocity.x += (desiredX - this.velocity.x) * a;
    this.velocity.z += (desiredZ - this.velocity.z) * a;

    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    // Block the river and the outer fence. Each axis is tested separately so
    // the walk SLIDES along the obstacle instead of stopping dead — the thing
    // that makes a boundary feel like a wall rather than a bug.
    // WALK_LIMIT stays inside the far grass ring, so the learner can never
    // reach the edge of the meadow and see bare terrain.
    // Sprinting the full radius takes over a minute — the world is big now.
    if (!insideRiver(nx, this.position.z) && Math.hypot(nx, this.position.z) < WALK_LIMIT) this.position.x = nx;
    if (!insideRiver(this.position.x, nz) && Math.hypot(this.position.x, nz) < WALK_LIMIT) this.position.z = nz;

    // Ground follow, smoothed so steps up a hill are not jarring.
    const ground = terrainHeight(this.position.x, this.position.z);
    this.smoothY += (ground - this.smoothY) * damp(12, dt);

    // Subtle head bob, scaled by actual speed (zero when standing still).
    const planar = Math.hypot(this.velocity.x, this.velocity.z);
    this.bob += dt * planar * 2.1;
    const bobY = Math.sin(this.bob * 3.4) * Math.min(planar / 6, 1) * 0.045;
    const bobX = Math.cos(this.bob * 1.7) * Math.min(planar / 6, 1) * 0.02;

    camera.position.set(
      this.position.x + bobX,
      this.smoothY + this.eyeHeight + bobY,
      this.position.z,
    );
    camera.rotation.order = "YXZ";
    camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

/** Keyboard → movement stick, WASD/arrows + shift to sprint. */
export class KeyboardInput {
  private keys = new Set<string>();
  readonly stick: VirtualStick = { x: 0, y: 0, active: false };
  sprint = false;
  /**
   * Only true while the walk mode is active. WASD/arrows are `preventDefault`ed
   * (otherwise the page scrolls under the canvas), so the capture MUST be off
   * in orbit mode — a learner tabbing through the HUD would lose their arrow
   * keys to a scene that is not even listening.
   */
  enabled = false;

  constructor(private target: HTMLElement | Window = window) {
    (this.target as Window).addEventListener("keydown", this.onKey as EventListener);
    (this.target as Window).addEventListener("keyup", this.onKey as EventListener);
    window.addEventListener("blur", this.clear);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const code = e.code;
    // Never steal keys from a focused input / textarea / contenteditable.
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
    const relevant =
      code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" ||
      code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight" ||
      code === "ShiftLeft" || code === "ShiftRight";
    if (!relevant) return;
    if (e.type === "keydown") this.keys.add(code);
    else this.keys.delete(code);
    e.preventDefault();
    this.recompute();
  };

  private clear = () => {
    this.keys.clear();
    this.recompute();
  };

  private recompute() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) y -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.stick.x = x;
    this.stick.y = y;
    this.stick.active = len > 0;
    this.sprint = k.has("ShiftLeft") || k.has("ShiftRight");
  }

  dispose() {
    (this.target as Window).removeEventListener("keydown", this.onKey as EventListener);
    (this.target as Window).removeEventListener("keyup", this.onKey as EventListener);
    window.removeEventListener("blur", this.clear);
  }
}
