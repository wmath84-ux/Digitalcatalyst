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
import { terrainHeight, insideRiver, WORLD_HALF } from "./terrain";
import { WORLD_REACH } from "./regions";

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

  /**
   * The furthest the camera may orbit out.
   *
   * THIS IS NOT AN ARBITRARY NUMBER. Past a certain distance the view stops
   * being "far away" and starts being broken, in three separate ways at once:
   *
   *   1. THE CAMERA LEAVES THE GROUND. The terrain is a finite plate
   *      WORLD_HALF across. An orbit camera at a shallow pitch sits at
   *      cos(pitch) * distance from the centre, so beyond ~1380 m of ground
   *      reach it is hovering over NOTHING — you are outside the world
   *      looking back at its edge, which is the "out of the world" view.
   *   2. IT GOES UNDERGROUND. Outside the plate `terrainHeight` keeps
   *      returning hill values, so the "never dive under the meadow" floor
   *      below is being computed against ground that is not drawn. The camera
   *      is then legitimately below a surface that does not exist.
   *   3. EVERYTHING FOGS OUT. FogExp2 is exponential in the SQUARE of
   *      distance: at 2400 m the far rim is 87 % obscured — the black screen.
   *
   * So the cap is derived from the world instead of guessed: stay close
   * enough that the camera is always over its own terrain. `maxDistance` is
   * recomputed from the live pitch, because a steeper look-down angle buys
   * real height without leaving the plate.
   */
  get maxDistance(): number {
    // Ground reach is cos(pitch) * distance, and it must stay inside the
    // plate with a little margin so the edge itself is never the horizon.
    const usable = WORLD_HALF * 0.93;
    const cp = Math.cos(this.targetPitch);
    // Looking straight down, ground reach stops constraining anything (cos
    // goes to zero and `usable / cp` runs away to 16 km, far outside the far
    // plane). What constrains a top-down view instead is ALTITUDE: climb high
    // enough to see the whole plate and no higher. That is WORLD_HALF over
    // tan(half-fov), and the widest sane half-fov here is ~50 degrees, so
    // 2 * WORLD_HALF is a safe ceiling that still clears the far plane.
    const ceiling = WORLD_HALF * 2;
    if (cp < 0.05) return ceiling;
    return Math.min(usable / cp, ceiling);
  }

  zoom(factor: number) {
    // The near limit keeps you outside the board; the far limit is the
    // world-derived one above, so pulling back always lands on a view of the
    // world rather than on empty sky beyond its edge.
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * factor, 2.4, this.maxDistance);
  }

  panTo(target: THREE.Vector3, distance: number, yaw?: number, pitch?: number) {
    this.target.copy(target);
    this.targetDistance = distance;
    if (yaw !== undefined) this.targetYaw = yaw;
    if (pitch !== undefined) this.targetPitch = pitch;
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    if (this.autoRotate) this.targetYaw += dt * 0.12;

    // Re-apply the cap every frame. It depends on the PITCH, so tilting the
    // camera down after zooming out would otherwise leave the distance at a
    // value that is no longer legal — and a panTo() preset could set one
    // directly without ever going through zoom().
    const cap = this.maxDistance;
    if (this.targetDistance > cap) this.targetDistance = cap;

    const k = damp(9, dt);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.distance += (this.targetDistance - this.distance) * k;
    if (this.distance > cap) this.distance = cap;

    const cp = Math.cos(this.pitch);
    camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    // Never let the orbit camera dive under the meadow.
    //
    // Sampled at the CLAMPED position, not the raw one. `terrainHeight` is an
    // analytic function with no domain limit, so outside the drawn plate it
    // happily returns hill heights for ground that was never built — and the
    // camera would then be shoved up to clear a phantom hill, or judged to be
    // underground while floating over empty space. Clamping the sample point
    // to the plate means the floor outside it is the plate's own edge height,
    // which is exactly the surface you can still see.
    const sx = THREE.MathUtils.clamp(camera.position.x, -WORLD_HALF, WORLD_HALF);
    const sz = THREE.MathUtils.clamp(camera.position.z, -WORLD_HALF, WORLD_HALF);
    const floor = terrainHeight(sx, sz) + 0.9;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(this.target);
  }
}

/**
 * How far from the clearing the learner may walk. The world is a kilometre
 * across, so this sits just inside the far grass ring: you can walk for
 * minutes, reach the foot of the hills, and still never see bare terrain.
 */
// The walkable radius now has to reach every district, not just the meadow,
// because the three areas are one connected world you travel between on foot.
const WALK_LIMIT = WORLD_REACH;

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
    // Straight up is a FULL 90 degrees, as asked.
    //
    // This used to stop 3 degrees short, on the theory that pitch = 90 gimbal
    // flips. It does not here, and the distinction matters. The snap happens
    // when an orientation is recovered FROM a direction vector (lookAt, or
    // decomposing a matrix): at the pole the yaw is undefined and any numeric
    // wobble throws it around. This rig never does that — it stores yaw and
    // pitch as the authoritative state and only ever writes them out, in YXZ
    // order, where pitch = PI/2 is a perfectly ordinary rotation. Yaw keeps
    // its value across the pole because nothing reads it back.
    //
    // Looking DOWN is still held just short: the camera is at eye height, so
    // the last couple of degrees only ever show the inside of the character's
    // own feet.
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.52, Math.PI / 2);
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
